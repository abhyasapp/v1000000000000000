/* ═══════════════════════════════════════════════════════════════════════
   CLOUD-SYNC.JS — Personal Google Drive backup (optional, per-user)

   Loaded by user.html AFTER app.js/objective.js/subjective.js. Adds a
   "Personal Drive Backup" feature to the Progress view: a snapshot of
   the user's progress/bookmarks/flags/wrong-bank saved to their OWN
   Google Drive — independent of the Abhyas server.

   Scope: https://www.googleapis.com/auth/drive.appdata
     Only touches the app's hidden "appDataFolder" in the user's Drive.
     Cannot see, list, or modify any of the user's real files.

   Exposes on window:
     CLOUD_BACKUP_VERSION  — current schema version (bump on shape change)
     _cloudBackupMigrations — registry of migration steps
     _cloudMigrate(backup)  — schema check + migration chain (pure fn)
     CLOUD                  — the module itself
   ═══════════════════════════════════════════════════════════════════════ */
(function(){
'use strict';

/* ═══════════════════════════════════════════════════════════════════════
   CONFIG
   ═══════════════════════════════════════════════════════════════════════ */
const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.appdata';
const DRIVE_UPLOAD_URL = 'https://www.googleapis.com/upload/drive/v3/files';
const DRIVE_LIST_URL   = 'https://www.googleapis.com/drive/v3/files';
const BACKUP_FILENAME  = 'abhyas-progress-backup.json';   // the single file older versions wrote (still readable)
const SNAP_PREFIX      = 'abhyas-backup-';              // v1.33: one file per backup, e.g. abhyas-backup-2026-10-07T07-30-00-000Z.json
const MAX_VERSIONS     = 5;                             // newest snapshots kept in Drive; older ones are removed after a good upload
const MAX_BACKUP_BYTES = 4 * 1024 * 1024;   // Drive hard limit is 5 MB for this API; stay under

/* Bump this only when the backup shape changes in a way that needs a
   migration to restore cleanly. */
const CLOUD_BACKUP_VERSION = 2;

/* Registered migration steps: { [fromVersion]: (data) => data }
   Each function upgrades the payload from its key version to the next.
   v1 -> v2 (v1.33): v2 adds coverage, notes, sprint start and a checksum, and no longer cuts lists to 500.
   A v1 file simply lacks those fields, so the step only bumps the version. */
const _cloudBackupMigrations = {
  1: (b) => Object.assign({}, b, { v: 2 })
};

/* Pure. Small, fast 32-bit checksum (FNV-1a) of the backup content, written into every backup and checked on
   restore, so a damaged copy is detected instead of being applied. `ts` and `sum` are not part of it. */
function _cloudChecksum(payload) {
  const body = {};
  Object.keys(payload || {}).sort().forEach(k => { if (k !== 'ts' && k !== 'sum') body[k] = payload[k]; });
  const str = JSON.stringify(body);
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, '0');
}

/* Pure. Which snapshots to delete: keep the newest `keep` versioned files (names sort by time), never touch the
   legacy single file or anything this app did not create. Input: [{id,name}] ; output: [id]. */
function _cloudPrune(files, keep) {
  const snaps = (files || []).filter(f => f && typeof f.name === 'string' && f.name.indexOf(SNAP_PREFIX) === 0)
    .sort((a, b) => (a.name < b.name ? 1 : a.name > b.name ? -1 : 0));
  return snaps.slice(Math.max(0, keep)).map(f => f.id);
}

/* ── Persistence keys ── */
const LS_CLOUD = 'abhyas_cloud';   // { fid, email, savedAt, lastSum, savedTotal }
const LS_PROFILE = 'abhyas_profile';

/* ── In-memory session state ── */
let _tokenClient = null;    // GSI OAuth2 token client
let _accessToken = null;    // Short-lived access token
let _tokenExpiresAt = 0;    // ms epoch
let _userEmail = null;      // best-effort, from a Drive `about` call
let _fileId = null;         // Drive file id of the app's backup file
let _ready = null;          // Promise that resolves once GSI is loaded

/* ═══════════════════════════════════════════════════════════════════════
   SCHEMA MIGRATION
   ═══════════════════════════════════════════════════════════════════════ */

/* Pure. Takes whatever JSON was read from Drive and returns either
   { ok: true, data } with the payload at CLOUD_BACKUP_VERSION, or
   { ok: false, error } with a human-readable reason. Never mutates
   its input — the migration chain works on shallow copies. */
function _cloudMigrate(backup) {
  if (!backup || typeof backup !== 'object') {
    return { ok: false, error: 'Backup is not a JSON object.' };
  }
  const v = Number(backup.v);
  if (!v || v < 1) {
    return { ok: false, error: 'Backup is missing a version number.' };
  }
  if (v > CLOUD_BACKUP_VERSION) {
    return { ok: false, error: `Backup was written by a newer version of Abhyas (v${v} vs v${CLOUD_BACKUP_VERSION}) — this app cannot read it.` };
  }
  let cur = backup;
  let stepFrom = v;
  while (stepFrom < CLOUD_BACKUP_VERSION) {
    const step = _cloudBackupMigrations[stepFrom];
    if (typeof step !== 'function') {
      return { ok: false, error: `No migration path from backup version ${stepFrom} to ${CLOUD_BACKUP_VERSION}.` };
    }
    try {
      cur = step(cur);
    } catch (e) {
      return { ok: false, error: `Migration ${stepFrom} → ${stepFrom + 1} failed: ${e.message || e}` };
    }
    stepFrom++;
  }
  return { ok: true, data: cur };
}

/* ═══════════════════════════════════════════════════════════════════════
   GIS LOADING
   ═══════════════════════════════════════════════════════════════════════ */

/* GSI is loaded async/defer from user.html. Poll for window.google.accounts.oauth2
   with a hard cap — if the CDN is blocked or we're offline, don't loop
   forever. */
function _waitForGsi(maxMs = 20000) {
  if (window.google && window.google.accounts && window.google.accounts.oauth2) {
    return Promise.resolve();
  }
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const tick = () => {
      if (window.google && window.google.accounts && window.google.accounts.oauth2) return resolve();
      if (Date.now() - start > maxMs) return reject(new Error('Google Identity Services didn\'t load.'));
      setTimeout(tick, 200);
    };
    tick();
  });
}

/* The client id must be the same one used by the backend's Google Sign-In
   (GOOGLE_CLIENT_ID in code.gs) — but this is a DIFFERENT OAuth flow: it
   requests a Drive scope, not just an id token. */
function _googleClientId() {
  if (typeof window.GOOGLE_CLIENT_ID === 'string' && window.GOOGLE_CLIENT_ID &&
      !window.GOOGLE_CLIENT_ID.startsWith('REPLACE_WITH_')) {
    return window.GOOGLE_CLIENT_ID;
  }
  // Fallback constant — same value as index.html and code.gs.
  return '242226857075-hpkbjoqhlem95fu6vkf712e8ijs33sng.apps.googleusercontent.com';
}

/* ═══════════════════════════════════════════════════════════════════════
   MODULE
   ═══════════════════════════════════════════════════════════════════════ */

const CLOUD = {
  /* ── init ──
     Idempotent. Creates the GSI token client and pulls any persisted
     "signed in" flag from localStorage. Callers can await this before
     invoking signIn/backup/restore. */
  async init() {
    if (_ready) return _ready;
    _ready = (async () => {
      // Restore persisted state (fileId + email) so the UI can render
      // "Signed in as X" without a fresh OAuth round trip on page load.
      try {
        const saved = JSON.parse(localStorage.getItem(LS_CLOUD) || '{}');
        if (saved && typeof saved === 'object') {
          if (saved.fid) _fileId = String(saved.fid);
          if (saved.email) _userEmail = String(saved.email);
        }
      } catch (e) { /* ignore */ }

      // Set up the token client — but only once we actually need it.
      // Creating it lazily on first signIn() call avoids polling GSI on
      // every page load, which the UI block in user.html relies on.
      return this;
    })();
    return _ready;
  },

  /* ── status ──
     Read-only. Reports whether a valid (non-expired) access token
     exists. The UI (CLOUD_UI in user.html) calls this synchronously on
     every Progress view render — it must never block. */
  status() {
    const signedIn = !!(_accessToken && Date.now() < _tokenExpiresAt);
    return {
      signedIn,
      email: signedIn ? _userEmail : null,
      hasBackup: !!_fileId
    };
  },

  /* ── signIn ──
     Opens the Google consent popup (or redirect, depending on browser
     heuristics). Resolves with { success, email?, error? }. */
  async signIn() {
    try {
      await _waitForGsi();
    } catch (e) {
      return { success: false, error: e.message };
    }

    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      return { success: false, error: 'You need to be online to sign in to Google.' };
    }

    if (!_tokenClient) {
      _tokenClient = window.google.accounts.oauth2.initTokenClient({
        client_id: _googleClientId(),
        scope: DRIVE_SCOPE,
        // GSI calls this on every successful (or failed) auth. We wrap
        // it in a Promise so signIn() can be awaited.
        callback: _onTokenResponse,
        // Don't auto-redirect on failure — let the caller decide.
        ux_mode: 'popup'
      });
    }

    return new Promise((resolve) => {
      _pendingResolve = resolve;
      try {
        // prompt: '' — reuse an existing grant if possible (no extra
        // click). Falls back to consent if Google decides it's needed.
        _tokenClient.requestAccessToken({ prompt: '' });
      } catch (e) {
        _pendingResolve = null;
        resolve({ success: false, error: e.message || 'Could not start Google sign-in.' });
      }
    });
  },

  /* ── signOut ──
     Revokes the token on Google's side (best-effort) and clears local
     state. The backup file in the user's Drive is NOT deleted — that's
     their data. */
  async signOut() {
    if (_accessToken && window.google && window.google.accounts) {
      try {
        window.google.accounts.oauth2.revoke(_accessToken);
      } catch (e) { /* best-effort */ }
    }
    _accessToken = null;
    _tokenExpiresAt = 0;
    _userEmail = null;
    // Keep _fileId — if the user re-signs-in, we still know where to look.
    try {
      const saved = JSON.parse(localStorage.getItem(LS_CLOUD) || '{}');
      saved.email = null;
      localStorage.setItem(LS_CLOUD, JSON.stringify(saved));
    } catch (e) { /* ignore */ }
    return { success: true };
  },

  /* ── backup ──
     v1.33: every backup is a NEW file in the app's hidden Drive folder and the newest MAX_VERSIONS are kept, so
     one bad backup can never overwrite the only good one. A backup identical to the last one is skipped. */
  async backup() {
    if (!this.status().signedIn) {
      return { success: false, error: 'Please sign in to Google first.' };
    }
    const payload = this._buildPayload();
    const json = JSON.stringify(payload);
    if (json.length > MAX_BACKUP_BYTES) {
      return { success: false, error: `Backup is ${Math.round(json.length / 1024)} KB, over the ${Math.round(MAX_BACKUP_BYTES / 1024)} KB limit. Clear downloaded questions or old notes, or use "Download backup" instead.` };
    }
    let saved = {}; try { saved = JSON.parse(localStorage.getItem(LS_CLOUD) || '{}') || {}; } catch (e) { saved = {}; }
    if (saved.lastSum && saved.lastSum === payload.sum) {
      this._noteBackup('drive');
      return { success: true, unchanged: true, bytes: json.length, fileId: saved.fid || null };
    }
    try {
      const file = await this._upload(json, this._snapName(payload.ts));
      _fileId = file.id;
      saved = { fid: _fileId, email: _userEmail || saved.email || null, savedAt: Date.now(), lastSum: payload.sum, savedTotal: saved.savedTotal };
      try { localStorage.setItem(LS_CLOUD, JSON.stringify(saved)); } catch (e) { /* ignore */ }
      this._noteBackup('drive');
      let kept = null;
      try { kept = await this._prune(); } catch (e) { /* pruning is housekeeping: a failure must never fail a good backup */ }
      return { success: true, bytes: json.length, fileId: _fileId, versions: kept };
    } catch (e) {
      return { success: false, error: e.message || 'Backup failed.' };
    }
  },

  /* ── listVersions ── newest first. Includes the single file older versions wrote. */
  async listVersions() {
    if (!this.status().signedIn) return { success: false, error: 'Please sign in to Google first.' };
    try {
      const token = await this._requireToken();
      const params = new URLSearchParams({
        spaces: 'appDataFolder',
        q: "name contains 'abhyas-'",
        fields: 'files(id,name,size,modifiedTime)',
        pageSize: '50'
      });
      const res = await fetch(`${DRIVE_LIST_URL}?${params}`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error(`Drive list failed (${res.status})`);
      const data = await res.json();
      const versions = (data.files || [])
        .filter(f => f && (f.name === BACKUP_FILENAME || String(f.name).indexOf(SNAP_PREFIX) === 0))
        .map(f => ({ id: f.id, name: f.name, size: Number(f.size) || 0, at: f.modifiedTime ? Date.parse(f.modifiedTime) : 0, legacy: f.name === BACKUP_FILENAME }))
        .sort((a, b) => b.at - a.at);
      return { success: true, versions };
    } catch (e) {
      return { success: false, error: e.message || 'Could not list your backups.' };
    }
  },

  /* ── restore ──
     Adds the chosen copy (default: the newest) to this device. It never removes anything: the same safe merge as
     "Load a backup", with a safety copy taken first. A copy whose checksum does not match is refused. */
  async restore(fileId) {
    if (!this.status().signedIn) {
      return { success: false, error: 'Please sign in to Google first.' };
    }
    let id = fileId;
    if (!id) {
      const l = await this.listVersions();
      if (!l.success) return l;
      if (!l.versions.length) return { success: false, error: 'No backup found in your Drive yet.' };
      id = l.versions[0].id;
    }
    let raw;
    try {
      raw = await this._download(id);
    } catch (e) {
      return { success: false, error: e.message || 'Download failed.' };
    }
    if (!raw) {
      return { success: false, error: 'That backup is no longer in your Drive.' };
    }
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (e) {
      return { success: false, error: 'That backup is damaged (it is not valid JSON). Try an older one.' };
    }
    if (parsed && parsed.sum && _cloudChecksum(parsed) !== parsed.sum) {
      return { success: false, error: 'That backup is damaged (its checksum does not match). Nothing was changed. Try an older one.' };
    }
    const migrated = _cloudMigrate(parsed);
    if (!migrated.ok) {
      return { success: false, error: migrated.error };
    }
    try {
      if (typeof DATA !== 'undefined' && typeof DATA._applyImport === 'function' && typeof PSYNC !== 'undefined') {
        await DATA._applyImport(migrated.data);
      } else {
        this._apply(migrated.data);
      }
    } catch (e) {
      return { success: false, error: e.message || 'Could not apply that backup.' };
    }
    return { success: true, ts: migrated.data.ts || null };
  },

  /* ═══════════════════════════════════════════════════════════════════
     INTERNALS
     ═══════════════════════════════════════════════════════════════════ */

  _snapName(ts) { return SNAP_PREFIX + new Date(ts || Date.now()).toISOString().replace(/[:.]/g, '-') + '.json'; },
  _noteBackup(kind) { try { if (window.BACKUP_NUDGE) window.BACKUP_NUDGE.record(kind); } catch (e) { /* ignore */ } },

  /* ── _buildPayload ──
     The COMPLETE user-generated state (nothing is cut down), in a versioned envelope with a checksum. Does not
     include S.user (the server's business) or cached question files (recoverable by re-downloading). */
  _buildPayload() {
    const S = window.S || {};
    let full = null;
    try { if (window.PSYNC && PSYNC._fullLocal) full = PSYNC._fullLocal(); } catch (e) { full = null; }
    full = full || {};
    const payload = {
      v: CLOUD_BACKUP_VERSION,
      ts: Date.now(),
      app: (typeof APP_VERSION !== 'undefined') ? APP_VERSION : null,
      prog: full.prog || S.prog || { total: 0, correct: 0, sessions: [] },
      chapStats: full.chapStats || S.chapStats || {},
      cov: full.cov || S.cov || {},
      bk: full.bk || S.bk || [],
      fl: full.fl || S.fl || [],
      wr: full.wr || S.wr || [],
      stk: full.stk || S.stk || { days: [], last: '' },
      qnotes: full.qnotes || {},
      sprint: full.sprint || '',
      tt: S.tt || { sessions: [], reminders: { enabled: false, leadMinutes: 5 } }
    };
    payload.sum = _cloudChecksum(payload);
    return payload;
  },

  /* ── _apply ──
     Merge a backup payload into local state. Pure-ish: only mutates the
     globals it must, and calls _save() so PSYNC knows to schedule a
     server sync afterwards. */
  _apply(data) {
    const S = window.S;
    if (!S) return;

    // ── prog ──
    if (data.prog && typeof data.prog === 'object') {
      const incoming = data.prog;
      if (!Array.isArray(incoming.sessions)) incoming.sessions = [];
      S.prog = {
        total: typeof incoming.total === 'number' ? incoming.total : 0,
        correct: typeof incoming.correct === 'number' ? incoming.correct : 0,
        sessions: incoming.sessions
      };
      if (typeof migrateSessionScopes === 'function') migrateSessionScopes();
      if (typeof _save === 'function') _save('abhyas_prog', S.prog);
    }

    // ── chapStats: per-chapter, keep the higher attempted count ──
    if (data.chapStats && typeof data.chapStats === 'object') {
      Object.entries(data.chapStats).forEach(([key, rec]) => {
        if (!rec || typeof rec !== 'object') return;
        const existing = S.chapStats[key];
        if (!existing || (rec.attempted || 0) > (existing.attempted || 0)) {
          S.chapStats[key] = JSON.parse(JSON.stringify(rec));
        }
      });
      if (typeof _save === 'function') _save('abhyas_chapstats', S.chapStats);
    }

    // ── Lists: overwrite (the Drive copy is the user's snapshot) ──
    if (Array.isArray(data.bk)) { S.bk = data.bk; if (typeof _save === 'function') _save('abhyas_bk', S.bk); }
    if (Array.isArray(data.fl)) { S.fl = data.fl; if (typeof _save === 'function') _save('abhyas_fl', S.fl); }
    if (Array.isArray(data.wr)) { S.wr = data.wr; if (typeof _save === 'function') _save('abhyas_wr', S.wr); }

    // ── Streak: default days array if absent ──
    if (data.stk && typeof data.stk === 'object') {
      S.stk = { days: Array.isArray(data.stk.days) ? data.stk.days : [], last: data.stk.last || '' };
      if (typeof _save === 'function') _save('abhyas_stk', S.stk);
    }

    // ── Timetable: default reminders if absent ──
    if (data.tt && typeof data.tt === 'object') {
      S.tt = {
        sessions: Array.isArray(data.tt.sessions) ? data.tt.sessions : [],
        reminders: data.tt.reminders && typeof data.tt.reminders === 'object'
          ? data.tt.reminders
          : { enabled: false, leadMinutes: 5 }
      };
      if (typeof _save === 'function') _save('abhyas_tt', S.tt);
    }

    // Re-render any views that were showing stale data before the restore.
    if (typeof HOME !== 'undefined' && HOME.render) HOME.render();
    if (typeof PROG !== 'undefined' && PROG.render) PROG.render();
  },

  /* ── _upload ── always creates a new file in the app-specific folder (multipart/related: metadata + content). */
  async _upload(json, name) {
    const token = await this._requireToken();
    const boundary = 'abhyas' + Math.random().toString(36).slice(2);
    const delimiter = `\r\n--${boundary}\r\n`;
    const closeDelimiter = `\r\n--${boundary}--`;
    const metadata = { name, parents: ['appDataFolder'], mimeType: 'application/json' };
    const body =
      delimiter +
      'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
      JSON.stringify(metadata) +
      delimiter +
      'Content-Type: application/json\r\n\r\n' +
      json +
      closeDelimiter;
    const res = await fetch(`${DRIVE_UPLOAD_URL}?uploadType=multipart&fields=id,name,modifiedTime`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': `multipart/related; boundary=${boundary}`
      },
      body
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Drive upload failed (${res.status}): ${text.slice(0, 200)}`);
    }
    return await res.json();
  },

  /* ── _prune ── delete snapshots beyond the newest MAX_VERSIONS. Returns how many versioned copies remain. */
  async _prune() {
    const l = await this.listVersions();
    if (!l.success) return null;
    const token = await this._requireToken();
    const doomed = _cloudPrune(l.versions, MAX_VERSIONS);
    for (const id of doomed) {
      try { await fetch(`${DRIVE_LIST_URL}/${encodeURIComponent(id)}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } }); }
      catch (e) { /* try again next time */ }
    }
    return l.versions.filter(v => !v.legacy).length - doomed.length;
  },

  /* ── _download ── the content of one backup file as text, or null if it no longer exists. */
  async _download(id) {
    const token = await this._requireToken();
    if (!id) return null;
    const res = await fetch(`${DRIVE_LIST_URL}/${encodeURIComponent(id)}?alt=media`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (res.status === 404) return null;
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Drive download failed (${res.status}): ${text.slice(0, 200)}`);
    }
    return await res.text();
  },

  /* ── _requireToken ──
     Ensures we have a valid access token, prompting a silent refresh
     if it's close to expiry. Throws if the user needs to re-authenticate. */
  async _requireToken() {
    const now = Date.now();
    const REFRESH_MARGIN = 60 * 1000;   // 1 min before expiry
    if (_accessToken && now < _tokenExpiresAt - REFRESH_MARGIN) {
      return _accessToken;
    }
    // Token has expired or is about to. GSI can often silently refresh
    // (prompt: ''), but if the user previously consented and the browser
    // still has a session, it will succeed without a popup.
    await _waitForGsi();
    if (!_tokenClient) {
      _tokenClient = window.google.accounts.oauth2.initTokenClient({
        client_id: _googleClientId(),
        scope: DRIVE_SCOPE,
        callback: _onTokenResponse,
        ux_mode: 'popup'
      });
    }
    return await new Promise((resolve, reject) => {
      _pendingResolve = (r) => {
        if (r.success) resolve(_accessToken);
        else reject(new Error(r.error || 'Could not refresh Google access.'));
      };
      try {
        _tokenClient.requestAccessToken({ prompt: '' });
      } catch (e) {
        _pendingResolve = null;
        reject(e);
      }
    });
  },

  /* ═══════════════════════════════════════════════════════════════════
     EXPOSED FOR TESTING (test.html reaches in and calls these directly)
     ═══════════════════════════════════════════════════════════════════ */
  _cloudMigrate,
  _cloudBackupMigrations,
  _cloudChecksum,
  _cloudPrune
};

/* ═══════════════════════════════════════════════════════════════════════
   GSI CALLBACK — single shared entry point for every token request
   ═══════════════════════════════════════════════════════════════════════ */
let _pendingResolve = null;

function _onTokenResponse(resp) {
  if (!resp) {
    if (_pendingResolve) { _pendingResolve({ success: false, error: 'Google returned no response.' }); _pendingResolve = null; }
    return;
  }
  if (resp.error) {
    if (_pendingResolve) { _pendingResolve({ success: false, error: resp.error_description || resp.error }); _pendingResolve = null; }
    return;
  }
  if (!resp.access_token) {
    if (_pendingResolve) { _pendingResolve({ success: false, error: 'Google didn\'t return an access token.' }); _pendingResolve = null; }
    return;
  }
  _accessToken = resp.access_token;
  // GSI gives expires_in in seconds. Convert to absolute ms and subtract
  // a small cushion so we refresh proactively.
  const ttlSec = Number(resp.expires_in) || 3600;
  _tokenExpiresAt = Date.now() + (ttlSec * 1000) - 30000;

  // Best-effort: try to learn the user's email so the UI can show
  // "Signed in as X". If the Drive `about` call fails, we just don't
  // have an email — the UI handles that.
  _fetchUserEmail().then(email => {
    if (email) {
      _userEmail = email;
      try {
        const saved = JSON.parse(localStorage.getItem(LS_CLOUD) || '{}');
        saved.email = email;
        if (_fileId) saved.fid = _fileId;
        localStorage.setItem(LS_CLOUD, JSON.stringify(saved));
      } catch (e) { /* ignore */ }
    }
    if (_pendingResolve) { _pendingResolve({ success: true, email: _userEmail }); _pendingResolve = null; }
  }).catch(() => {
    if (_pendingResolve) { _pendingResolve({ success: true, email: null }); _pendingResolve = null; }
  });
}

async function _fetchUserEmail() {
  if (!_accessToken) return null;
  try {
    const res = await fetch(`https://www.googleapis.com/drive/v3/about?fields=user(emailAddress)`, {
      headers: { Authorization: `Bearer ${_accessToken}` }
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data?.user?.emailAddress || null;
  } catch (e) {
    return null;
  }
}

/* ═══════════════════════════════════════════════════════════════════════
   AUTO-BACKUP — quiet safety net.

   Runs in the background while the student studies. It tops up the
   student's own Drive copy when their work would otherwise drift, but
   only when ALL FOUR of these are true:

     • the app has been open at least 5 minutes
     • it has been 3+ days since the last backup
     • 50+ answers have accumulated since the last backup
     • they are signed in to Google Drive

   Silent on success — no banner, no toast, no button. A failure while
   signed in DOES surface, because a broken backup should not go
   unnoticed. Reuses CLOUD.backup(), so the "unchanged payload"
   short-circuit still applies: nothing is uploaded when nothing has
   moved.
   ═══════════════════════════════════════════════════════════════════════ */
const AUTO_BACKUP = {
  OPEN_MS:     5 * 60 * 1000,       // wait this long after boot before the first check
  GAP_MS:      3 * 24 * 60 * 60 * 1000,
  ANSWER_GAP:  50,
  CHECK_MS:    10 * 60 * 1000,      // how often to re-check while the tab is visible

  _openedAt:  Date.now(),
  _inflight:  false,
  _timer:     null,
  _booted:    false,

  _saved(){
    try { return JSON.parse(localStorage.getItem(LS_CLOUD) || '{}') || {}; }
    catch (e) { return {}; }
  },
  _writeSaved(obj){
    try { localStorage.setItem(LS_CLOUD, JSON.stringify(obj)); } catch (e) {}
  },
  _totalAnswers(){
    try { return Number(window.S && S.prog && S.prog.total) || 0; } catch (e) { return 0; }
  },

  _due(){
    if (!CLOUD.status().signedIn) return { due: false, reason: 'signed-out' };
    if (Date.now() - this._openedAt < this.OPEN_MS) return { due: false, reason: 'warming' };

    const saved = this._saved();
    const gap = saved.savedAt ? (Date.now() - saved.savedAt) : Infinity;
    const answers = this._totalAnswers();
    const since = (saved.savedTotal != null)
      ? Math.max(0, answers - saved.savedTotal)
      : Infinity;

    if (gap >= this.GAP_MS)       return { due: true, reason: 'days',    days: Math.floor(gap / 86400000) };
    if (since >= this.ANSWER_GAP) return { due: true, reason: 'answers', count: since };
    return { due: false, reason: 'recent' };
  },

  async run(){
    if (this._inflight) return;
    const d = this._due();
    if (!d.due) return;
    this._inflight = true;
    try {
      const r = await CLOUD.backup();
      if (r && r.success) {
        /* An "unchanged" reply still means we checked and there is
           nothing new to push, so the next gap check starts from now.
           savedTotal is set here (CLOUD.backup() already set savedAt
           and lastSum) so the 50-answers trigger has a fresh baseline. */
        const saved = this._saved();
        saved.savedAt = Date.now();
        saved.savedTotal = this._totalAnswers();
        this._writeSaved(saved);
        /* Tell the storage-health banner so its "time for a backup" card
           clears itself without the student tapping anything. */
        try { if (typeof window.BACKUP_NUDGE !== 'undefined' && BACKUP_NUDGE.record) BACKUP_NUDGE.record('drive'); } catch (e) {}
      } else if (!(r && r.error && /sign in|not signed/i.test(r.error))) {
        /* Surface a real failure. A "not signed in" reply is normal if the
           student signed out mid-session and would be noise. */
        try {
          if (typeof toast === 'function') {
            toast('Auto-backup to Drive did not go through: ' +
              ((r && r.error) || 'unknown error') +
              '. Your work is safe on this device.', 6500);
          }
        } catch (e) {}
      }
    } catch (e) {
      /* Network blip — try again on the next tick. */
    } finally {
      this._inflight = false;
    }
  },

  start(){
    if (this._booted) return;
    this._booted = true;
    /* First check is 5 minutes after boot. If nothing is due yet, the
       next tick will catch it. */
    setTimeout(() => this.run(), this.OPEN_MS + 3000);
    /* Then every 10 minutes, but only while the tab is visible. */
    this._timer = setInterval(() => { if (!document.hidden) this.run(); }, this.CHECK_MS);
  }
};

/* Coming back to the tab is a good moment to check — the student may have
   had it open in the background while studying offline, or on another
   device, and the gap condition may now hold. */
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    setTimeout(() => { try { AUTO_BACKUP.run(); } catch (e) {} }, 2000);
  }
});

/* Boot slightly after everything else on the page — no point competing
   with the initial render or the session restore. */
setTimeout(() => { try { AUTO_BACKUP.start(); } catch (e) {} }, 1500);

/* ═══════════════════════════════════════════════════════════════════════
   GLOBAL EXPOSURE
   ═══════════════════════════════════════════════════════════════════════ */
window.CLOUD = CLOUD;
window.CLOUD_BACKUP_VERSION = CLOUD_BACKUP_VERSION;
window._cloudMigrate = _cloudMigrate;
window._cloudBackupMigrations = _cloudBackupMigrations;
window._cloudChecksum = _cloudChecksum;
window._cloudPrune = _cloudPrune;
window.AUTO_BACKUP = AUTO_BACKUP;

})();