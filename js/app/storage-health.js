/* ═══════════════════════════════════════════════════════════════════════
   STORAGE-HEALTH.JS (v1.33): storage meter, 80% warning, breakdown, backup reminder

   Loaded by user.html after cloud-sync.js.

   STORAGE        how much space progress and downloads use, a warning at 80%, a per-kind breakdown,
                  and a button that asks the browser not to clear the app's data on its own.
   BACKUP_NUDGE   a reminder when the last backup file or Drive backup is 7+ days old, or 100+ answers ago.

   The numbers and rules live in small pure functions (exposed as STORAGE_RULES) so the tests can check them.
   Nothing here sends anything anywhere: it only reads this device's storage.
   ═══════════════════════════════════════════════════════════════════════ */
(function () {
'use strict';

const LIMIT_CHARS   = 5000000;   // localStorage holds about 5 million characters per site in every major browser
const WARN_AT       = 0.80;      // warn at 80%
const FULL_AT       = 0.95;
const NUDGE_DAYS    = 7;
const NUDGE_ANSWERS = 100;
const DAY_MS        = 24 * 60 * 60 * 1000;

const KEY_LAST   = 'abhyas_last_backup';        // { at, total, kind }
const KEY_WARNED = 'abhyas_storage_warned';     // YYYY-MM-DD of the last storage warning
const KEY_SNOOZE = 'abhyas_backup_nudge_until'; // ms; "Later" hides the reminder for a day

/* ── pure rules ───────────────────────────────────────────────────── */

/* 0..1, clamped. A missing limit gives 0 (nothing to warn about). */
function storageFraction(used, limit) {
  used = Number(used) || 0; limit = Number(limit) || 0;
  if (limit <= 0) return 0;
  return Math.max(0, Math.min(1, used / limit));
}

/* 'ok' below 80%, 'warn' from 80%, 'full' from 95%. */
function storageLevel(fraction) {
  const f = Number(fraction) || 0;
  return f >= FULL_AT ? 'full' : f >= WARN_AT ? 'warn' : 'ok';
}

/* Which group a localStorage key belongs to, for the breakdown. */
function storageGroup(key) {
  const k = String(key || '');
  if (/^abhyas_(prog|chapstats|cov|stk|fcount|resets|sprint_start|last_backup)/.test(k)) return 'progress';
  if (/^abhyas_(bk|fl|wr)$/.test(k)) return 'saved';
  if (/^abhyas_(qnotes|qnote)/.test(k)) return 'notes';
  if (/^abhyas_(tt|tt_notified)$/.test(k)) return 'plan';
  return 'other';
}

/* Should the backup reminder show?
   last  : { at, total } of the last backup file / Drive backup, or null
   now   : ms
   total : answers recorded so far on this device
   Never nags a brand-new install: with no record there is nothing to be late against (the caller stores a baseline). */
function backupDue(last, now, total) {
  if (!last || !Number(last.at)) return { due: false, baseline: true, days: 0, answers: 0, reason: '' };
  const days = Math.floor((Number(now) - Number(last.at)) / DAY_MS);
  const answers = Math.max(0, (Number(total) || 0) - (Number(last.total) || 0));
  if (days >= NUDGE_DAYS) return { due: true, baseline: false, days, answers, reason: 'days' };
  if (answers >= NUDGE_ANSWERS) return { due: true, baseline: false, days, answers, reason: 'answers' };
  return { due: false, baseline: false, days, answers, reason: '' };
}

function fmtBytes(n) {
  n = Number(n) || 0;
  if (n < 1024) return n + ' B';
  if (n < 1024 * 1024) return (n / 1024).toFixed(n < 10240 ? 1 : 0) + ' KB';
  return (n / (1024 * 1024)).toFixed(1) + ' MB';
}

window.STORAGE_RULES = { storageFraction, storageLevel, storageGroup, backupDue, fmtBytes,
  LIMIT_CHARS, WARN_AT, FULL_AT, NUDGE_DAYS, NUDGE_ANSWERS };

/* ── small helpers ─────────────────────────────────────────────────── */
const $ = id => document.getElementById(id);
const _esc = s => (typeof esc === 'function') ? esc(s) : String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const _day = () => { const d = new Date(), p = n => String(n).padStart(2, '0'); return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()); };
const _get = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
const _set = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* storage may be full: that is what we are reporting */ } };

/* ═══════════════════════════════════════════════════════════════════════
   STORAGE
   ═══════════════════════════════════════════════════════════════════════ */
const STORAGE = {
  _last: null,

  /* characters used in localStorage, grouped */
  local() {
    const groups = { progress: 0, saved: 0, notes: 0, plan: 0, other: 0 };
    let total = 0;
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        const v = localStorage.getItem(k) || '';
        const chars = k.length + v.length;
        total += chars;
        groups[storageGroup(k)] += chars;
      }
    } catch (e) { /* private mode */ }
    return { total, groups };
  },

  /* downloaded question files (IndexedDB): size, and how much of it is pictures */
  async questions() {
    let bytes = 0, imgBytes = 0, files = 0;
    try {
      const keys = await QDB.keys();
      for (const k of keys.slice(0, 600)) {
        const v = await QDB.get(k);
        if (v == null) continue;
        files++;
        const s = JSON.stringify(v);
        bytes += s.length;
        const walk = x => {
          if (Array.isArray(x)) x.forEach(walk);
          else if (x && typeof x === 'object') {
            Object.keys(x).forEach(key => { const val = x[key]; if ((key === 'img' || key === 'image') && typeof val === 'string') imgBytes += val.length; else walk(val); });
          }
        };
        walk(v);
      }
    } catch (e) { /* IndexedDB unavailable */ }
    return { bytes, imgBytes, files };
  },

  async device() {
    try {
      if (navigator.storage && navigator.storage.estimate) {
        const e = await navigator.storage.estimate();
        return { usage: Number(e.usage) || 0, quota: Number(e.quota) || 0 };
      }
    } catch (e) { /* ignore */ }
    return { usage: 0, quota: 0 };
  },

  async persisted() {
    try { return !!(navigator.storage && navigator.storage.persisted && await navigator.storage.persisted()); } catch (e) { return false; }
  },

  /* Everything the card and the warning need, in one object. */
  async snapshot() {
    const loc = this.local();
    const [q, dev, persisted] = await Promise.all([this.questions(), this.device(), this.persisted()]);
    const localFrac = storageFraction(loc.total, LIMIT_CHARS);
    const devFrac = storageFraction(dev.usage, dev.quota);
    const worst = Math.max(localFrac, devFrac);
    const snap = { loc, q, dev, persisted, localFrac, devFrac, level: storageLevel(worst), worst };
    this._last = snap;
    return snap;
  },

  /* Warn once a day at 80%. Returns the snapshot. */
  async check(opts) {
    let snap;
    try { snap = await this.snapshot(); } catch (e) { return null; }
    if (snap.level !== 'ok' && !(opts && opts.silent) && _get(KEY_WARNED) !== _day()) {
      _set(KEY_WARNED, _day());
      const pct = Math.round(snap.worst * 100);
      try {
        toast('Storage is ' + pct + '% full. Download a backup, then clear downloaded questions in Data to free space.', 7000);
      } catch (e) { /* ignore */ }
    }
    this.render(snap);
    return snap;
  },

  async protect() {
    let ok = false;
    try { ok = !!(navigator.storage && navigator.storage.persist && await navigator.storage.persist()); } catch (e) { ok = false; }
    try { toast(ok ? 'Done. Your browser will not clear Abhyas data on its own.' : 'Your browser did not allow that. Installing Abhyas to your home screen usually helps.', 5000); } catch (e) { /* ignore */ }
    this.check({ silent: true });
  },

  _bar(label, used, limit, note) {
    const f = storageFraction(used, limit), pct = Math.round(f * 100), lv = storageLevel(f);
    const colour = lv === 'full' ? 'var(--danger)' : lv === 'warn' ? 'var(--warning)' : 'var(--accent)';
    return '<div style="margin-bottom:var(--sp-3)">' +
      '<div style="display:flex;justify-content:space-between;gap:.5rem" class="t-foot"><b>' + _esc(label) + '</b><span>' + pct + '%</span></div>' +
      '<div role="progressbar" aria-label="' + _esc(label) + '" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + pct + '" style="height:8px;border-radius:99px;background:var(--bg-sunken);overflow:hidden;margin:.25rem 0">' +
      '<div style="height:100%;width:' + pct + '%;background:' + colour + '"></div></div>' +
      (note ? '<div class="t-cap">' + _esc(note) + '</div>' : '') + '</div>';
  },

  render(snap) {
    const el = $('storage-card-body');
    if (!el) return;
    snap = snap || this._last;
    if (!snap) { el.innerHTML = '<p class="t-foot">Checking\u2026</p>'; this.check({ silent: true }); return; }
    const g = snap.loc.groups, B = c => fmtBytes(c * 2);   // localStorage counts characters; the browser stores two bytes each
    const rows = [
      ['Progress and history', B(g.progress)], ['Missed, saved and flagged questions', B(g.saved) ],
      ['Notes', B(g.notes)], ['Study plan', B(g.plan)], ['Other', B(g.other)],
      ['Downloaded questions (' + snap.q.files + ' file' + (snap.q.files === 1 ? '' : 's') + ')', fmtBytes((snap.q.bytes - snap.q.imgBytes) * 2)],
      ['Pictures in downloaded questions', fmtBytes(snap.q.imgBytes * 2)]
    ].map(r => '<tr><td>' + _esc(r[0]) + '</td><td style="text-align:right">' + _esc(r[1]) + '</td></tr>').join('');
    const warn = snap.level === 'ok' ? '' :
      '<div class="banner banner-warning" role="alert" style="margin-bottom:var(--sp-3)"><i class="ph ph-warning"></i> ' +
      (snap.level === 'full' ? 'Storage is almost full. New progress may fail to save.' : 'Storage is over 80% full.') +
      ' Download a backup first, then clear downloaded questions below.</div>';
    el.innerHTML = warn +
      this._bar('Progress storage', snap.loc.total, LIMIT_CHARS, fmtBytes(snap.loc.total * 2) + ' of about ' + fmtBytes(LIMIT_CHARS * 2) + ' this browser allows for saved progress') +
      (snap.dev.quota ? this._bar('Device storage for Abhyas', snap.dev.usage, snap.dev.quota, fmtBytes(snap.dev.usage) + ' of ' + fmtBytes(snap.dev.quota) + ' (includes downloads and offline files)') : '') +
      '<table class="t-foot" style="width:100%;border-collapse:collapse;margin:var(--sp-2) 0"><tbody>' + rows + '</tbody></table>' +
      '<p class="t-callout" style="margin:var(--sp-3) 0"><b>Nothing is deleted automatically.</b> Abhyas never removes your progress, bookmarks, notes or downloads on its own. Only the buttons on this page change them. ' +
      (snap.persisted ? 'Your browser has also agreed not to clear this data when space runs low.'
        : 'A browser can still clear site data when the phone is very low on space. You can ask it not to:') + '</p>' +
      '<div class="bg">' +
      '<button class="btn btn-a btn-sm" data-on-click="DATA.exportAll()"><i class="ph ph-download-simple"></i> Download backup</button>' +
      '<button class="btn btn-quiet btn-sm" data-on-click="ACT.afterThen(DATA.clearQ(),STORAGE,\'check\',{silent:true})"><i class="ph ph-broom"></i> Clear downloaded questions</button>' +
      (snap.persisted ? '' : '<button class="btn btn-quiet btn-sm" data-on-click="STORAGE.protect()"><i class="ph ph-shield-check"></i> Protect from auto-clean</button>') +
      '<button class="btn btn-quiet btn-sm" data-on-click="STORAGE.check({silent:true})"><i class="ph ph-arrows-clockwise"></i> Refresh</button></div>';
  }
};

/* ═══════════════════════════════════════════════════════════════════════
   BACKUP_NUDGE
   ═══════════════════════════════════════════════════════════════════════ */
const BACKUP_NUDGE = {
  _total() { try { return Number(window.S && S.prog && S.prog.total) || 0; } catch (e) { return 0; } },
  last() { try { return JSON.parse(_get(KEY_LAST) || 'null'); } catch (e) { return null; } },

  /* called after a backup file is downloaded or a Drive backup succeeds */
  record(kind) {
    _set(KEY_LAST, JSON.stringify({ at: Date.now(), total: this._total(), kind: String(kind || 'file') }));
    _set(KEY_SNOOZE, '0');
    this.render();
  },

  status() {
    let last = this.last();
    if (!last) {                              // first run on this device: start counting from now, do not nag yet
      last = { at: Date.now(), total: this._total(), kind: 'baseline' };
      _set(KEY_LAST, JSON.stringify(last));
    }
    return Object.assign({ last }, backupDue(last, Date.now(), this._total()));
  },

  later() { _set(KEY_SNOOZE, String(Date.now() + DAY_MS)); this.render(); },

  render() {
    const slots = ['backup-nudge-slot', 'backup-nudge-slot-data'].map($).filter(Boolean);
    if (!slots.length) return;
    const st = this.status();
    const snoozed = Number(_get(KEY_SNOOZE)) > Date.now();
    if (!st.due || snoozed) { slots.forEach(s => { s.innerHTML = ''; }); return; }
    const why = st.reason === 'days'
      ? 'Your last backup was ' + st.days + ' day' + (st.days === 1 ? '' : 's') + ' ago.'
      : 'You have answered ' + st.answers + ' questions since your last backup.';
    const drive = (typeof CLOUD !== 'undefined' && CLOUD.status && CLOUD.status().signedIn)
      ? '<button class="btn btn-quiet btn-sm" data-on-click="CLOUD_UI.backup()"><i class="ph ph-cloud-arrow-up"></i> Back up to Drive</button>' : '';
    const html = '<div class="banner banner-warning" role="status" style="margin-bottom:var(--sp-3)">' +
      '<div style="flex:1"><b>Time for a backup.</b> ' + _esc(why) + '</div>' +
      '<div class="bg" style="margin-top:var(--sp-2)">' +
      '<button class="btn btn-a btn-sm" data-on-click="DATA.exportAll()"><i class="ph ph-download-simple"></i> Download backup</button>' + drive +
      '<button class="btn btn-quiet btn-sm" data-on-click="BACKUP_NUDGE.later()">Later</button></div></div>';
    slots.forEach(s => { s.innerHTML = html; });
  }
};

window.STORAGE = STORAGE;
window.BACKUP_NUDGE = BACKUP_NUDGE;

/* ── wiring ────────────────────────────────────────────────────────── */
/* a downloaded backup file counts as a backup */
try {
  if (typeof DATA !== 'undefined' && DATA.exportAll && !DATA.exportAll._wrapped) {
    const orig = DATA.exportAll.bind(DATA);
    DATA.exportAll = function () { const r = orig.apply(null, arguments); BACKUP_NUDGE.record('file'); return r; };
    DATA.exportAll._wrapped = true;
  }
} catch (e) { /* ignore */ }

/* paint the right card when a screen opens */
try {
  if (typeof UI !== 'undefined' && UI.go && !UI.go._storageWrapped) {
    const go = UI.go.bind(UI);
    UI.go = function (v) {
      const r = go.apply(null, arguments);
      try { if (v === 'data') { STORAGE.check({ silent: true }); BACKUP_NUDGE.render(); } else if (v === 'home') { BACKUP_NUDGE.render(); } } catch (e) { /* ignore */ }
      return r;
    };
    UI.go._storageWrapped = true;
  }
} catch (e) { /* ignore */ }

/* shortly after the app opens: warn if storage is filling up, and show the reminder if one is due */
setTimeout(function () { try { STORAGE.check(); BACKUP_NUDGE.render(); } catch (e) { /* ignore */ } }, 6000);
document.addEventListener('visibilitychange', function () {
  if (document.visibilityState === 'visible') { try { BACKUP_NUDGE.render(); } catch (e) { /* ignore */ } }
});
})();
