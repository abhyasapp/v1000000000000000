'use strict';

const GAS_URL  = ABHYAS_CONFIG.GAS_URL;
const LS_ADMIN = 'abhyas_admin';
const LS_USER  = 'abhyas_session';

/* Both theme-color metas must move together — see the head script. */
const THEME_COLORS = { light: '#F6F7F6', dark: '#0F1213' };
function _paintThemeColor(colour){
  document.querySelectorAll('meta[name="theme-color"]').forEach(m => m.setAttribute('content', colour));
}

const $  = id => document.getElementById(id);
const $$ = sel => Array.from(document.querySelectorAll(sel));

/* esc() and escAttrJs() both come from shared.js (one copy each) */
function driveFileId(u){
  const s = String(u == null ? '' : u).trim();
  if (!s) return '';
  if (/^data:/i.test(s)) return '';
  if (/^[-\w]{25,}$/.test(s)) return s;
  const m = s.match(/\/d\/([-\w]{25,})/) ||
            s.match(/[?&]id=([-\w]{25,})/) ||
            s.match(/\/([-\w]{25,})(?:\/|$)/);
  return m ? m[1] : '';
}
function relTime(ts){
  if (!ts) return '—';
  const t = typeof ts === 'number' ? ts : new Date(ts).getTime();
  if (isNaN(t)) return '—';
  const s = Math.floor((Date.now() - t) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return Math.floor(s / 60) + 'm ago';
  if (s < 86400) return Math.floor(s / 3600) + 'h ago';
  if (s < 86400 * 30) return Math.floor(s / 86400) + 'd ago';
  return new Date(t).toLocaleDateString();
}
function fullTime(ts){
  if (!ts) return '—';
  const d = new Date(ts);
  return isNaN(d) ? '—' : d.toLocaleString();
}
function initials(name){
  if (!name) return '?';
  const p = String(name).trim().split(/\s+/);
  return (p.length === 1 ? p[0].slice(0, 2) : p[0][0] + p[p.length - 1][0]).toUpperCase();
}
function statusLabel(s){
  return ({
    trial:'Trial', active:'Paid', expired:'Expired', payment_pending:'Awaiting review',
    rejected:'Rejected', pending:'Awaiting review', verified:'Verified',
    graded:'Graded', open:'Open', resolved:'Resolved', dismissed:'Dismissed',
    live:'Live', scheduled:'Scheduled', archived:'Archived'
  })[s] || (s ? String(s).replace(/_/g, ' ') : '—');
}
function badge(status, label){
  return '<span class="badge st-' + esc(status) + '">' + esc(label || statusLabel(status)) + '</span>';
}
function plural(n, one, many){ return n + ' ' + (n === 1 ? one : (many || one + 's')); }

if (typeof window.toggleTheme !== 'function') {
  window.toggleTheme = function(){
    const dark = document.documentElement.classList.toggle('dark');
    try { localStorage.setItem('abhyas_theme', JSON.stringify(dark ? 'dark' : 'light')); } catch(e){}
    _paintThemeColor(dark ? THEME_COLORS.dark : THEME_COLORS.light);
  };
}
function togglePw(btn){
  const input = btn.closest('.pw-field').querySelector('input');
  const show = input.type === 'password';
  input.type = show ? 'text' : 'password';
  btn.setAttribute('aria-pressed', show ? 'true' : 'false');
  btn.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
  btn.innerHTML = show ? '<i class="ph ph-eye-slash"></i>' : '<i class="ph ph-eye"></i>';
}
function copyText(text, label){
  navigator.clipboard.writeText(text).then(
    () => TOAST.show((label || 'Copied') , 'success'),
    () => TOAST.show('Copy failed — select the text manually', 'error')
  );
}

const FSTATE = {
  get(k, fb){ try { return sessionStorage.getItem('abhyas_f_' + k) ?? fb; } catch(e){ return fb; } },
  set(k, v){ try { sessionStorage.setItem('abhyas_f_' + k, v); } catch(e){} }
};

/* Read the student session from localStorage. Used only by the
   session bridge, to exchange a user token for an admin token via
   adminSwitchFromUser when no admin token is stored yet. */
const USER_SESSION = {
  read(){
    try {
      const s = JSON.parse(localStorage.getItem(LS_USER) || 'null');
      return (s && s.type === 'user' && s.username) ? s : null;
    } catch(e){ return null; }
  },
  token(s){
    s = s || this.read();
    if (!s) return '';
    return s.token || s.sessionToken || s.authToken || s.userToken || '';
  }
};

const TOAST = {
  ICONS: { success:'ph-check-circle', error:'ph-warning-circle', warning:'ph-warning', info:'ph-info' },
  show(msg, kind = 'info', duration = 3600){
    const box = $('toasts');
    while (box.children.length >= 3) box.firstElementChild.remove();
    const dup = [...box.children].find(t => t.dataset.msg === msg && Date.now() - (+t.dataset.ts) < 2500);
    if (dup) return;
    const t = document.createElement('div');
    t.className = 'toast ' + kind;
    t.dataset.msg = msg; t.dataset.ts = Date.now();
    t.innerHTML = '<i class="ph ' + (this.ICONS[kind] || this.ICONS.info) + '"></i><span>' + esc(msg) + '</span>';
    box.appendChild(t);
    setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 200); }, duration);
  }
};

const BUSY = {
  _n: 0,
  start(){ this._n++; $('busy').classList.add('on'); $('busy').setAttribute('aria-hidden','false'); },
  stop(){ this._n = Math.max(0, this._n - 1); if (!this._n) { $('busy').classList.remove('on'); $('busy').setAttribute('aria-hidden','true'); } },
  reset(){ this._n = 0; $('busy').classList.remove('on'); }
};

const FOCUS_TRAP = {
  _state: {},
  _list(root){
    return Array.from(root.querySelectorAll('button,[href],input:not([type="hidden"]),select,textarea,[tabindex]:not([tabindex="-1"])'))
      .filter(el => !el.disabled && el.offsetParent !== null);
  },
  open(id){
    const root = $(id);
    if (!root || this._state[id]) return;
    const handler = e => {
      if (e.key !== 'Tab') return;
      const list = this._list(root);
      if (!list.length) return;
      const first = list[0], last = list[list.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    this._state[id] = { prev: document.activeElement, handler };
    root.addEventListener('keydown', handler);
    setTimeout(() => {
      const list = this._list(root);
      const target = root.querySelector('input:not([type="hidden"]),textarea') || list[0];
      if (target) target.focus();
    }, 40);
  },
  close(id){
    const root = $(id), st = this._state[id];
    if (root && st) {
      root.removeEventListener('keydown', st.handler);
      if (st.prev && st.prev.focus) st.prev.focus();
    }
    delete this._state[id];
  }
};

const MODAL = {
  open(name){
    $('ov-' + name).classList.add('show');
    document.body.style.overflow = 'hidden';
    FOCUS_TRAP.open('ov-' + name);
  },
  close(name){
    if (name === 'pwd' && ADMIN._forcedPwChange) return;
    const el = $('ov-' + name);
    if (!el || !el.classList.contains('show')) return;
    el.classList.remove('show');
    FOCUS_TRAP.close('ov-' + name);
    if (!document.querySelector('.overlay.show')) document.body.style.overflow = '';
  },
  closeAll(){ ['review','user','sheet','confirm','pwd'].forEach(n => this.close(n)); },
  sheet(title, html, opts = {}){
    $('tt-sheet').textContent = title;
    $('bd-sheet').innerHTML = html;
    $('ov-sheet').querySelector('.dialog').classList.toggle('wide', opts.wide !== false);
    this.open('sheet');
  }
};

const CONFIRM = {
  _resolve: null,
  ask({ title, body, confirmText, tone, requireType }){
    /* Refuse a second confirm while one is open rather than orphaning
       the previous caller's promise. The periodic refresh timer and the
       offline/online handlers could otherwise both fire asks in the
       same tick. A caller receiving false simply does not do the thing. */
    if (this._resolve) return Promise.resolve(false);
    return new Promise(resolve => {
      this._resolve = resolve;
      $('tt-confirm').textContent = title || 'Confirm';
      $('bd-confirm').innerHTML =
        '<p class="t-callout" style="line-height:1.6;color:var(--ink)">' + body + '</p>' +
        (requireType
          ? '<div class="field mt4"><label for="cnf-type">Type <span class="mono" style="color:var(--danger)">' + esc(requireType) + '</span> to confirm</label>' +
            '<input class="input" type="text" id="cnf-type" autocomplete="off" data-expect="' + escAttrJs(requireType) + '"></div>'
          : '') +
        '<div class="flex g2 mt4">' +
          '<button class="btn btn-quiet" style="flex:1" data-on-click="CONFIRM._no()">Cancel</button>' +
          '<button class="btn ' + (tone === 'danger' ? 'btn-danger' : 'btn-primary') + '" style="flex:1" id="cnf-ok" data-on-click="CONFIRM._ok()">' + esc(confirmText || 'Confirm') + '</button>' +
        '</div>';
      MODAL.open('confirm');
      const inp = $('cnf-type');
      if (inp) inp.addEventListener('keydown', e => { if (e.key === 'Enter') CONFIRM._ok(); });
    });
  },
  _ok(){
    const inp = $('cnf-type');
    if (inp && inp.value !== inp.dataset.expect) {
      inp.classList.add('invalid');
      TOAST.show('That does not match — type it exactly', 'error');
      inp.focus();
      return;
    }
    this._settle(true);
  },
  _no(){ if (this._resolve) this._settle(false); },
  _settle(v){
    $('ov-confirm').classList.remove('show');
    FOCUS_TRAP.close('ov-confirm');
    if (!document.querySelector('.overlay.show')) document.body.style.overflow = '';
    const r = this._resolve; this._resolve = null;
    if (r) r(v);
  }
};

const ADMIN = {
  creds: null,
  _perms: null,
  _forcedPwChange: false,
  data: {
    users: [], payments: [], settings: {}, logs: [], admins: [],
    usersTotalCount: 0, usersTruncated: false,
    paymentsTotalCount: 0, paymentsTruncated: false,
    weeklysetsTotalCount: 0, weeklysetsTruncated: false,
    qreportsTotalCount: 0, qreportsTruncated: false
  },
  state: { uPage:1, pPage:1, lPage:1, qrPage:1, uPerPage:15, pPerPage:15, lPerPage:20, qrPerPage:10 },

  init(){
    /* 1. Try a stored admin token (fresh + unexpired). */
    let saved = null;
    try { saved = localStorage.getItem(LS_ADMIN); } catch(e){}

    if (saved) {
      try {
        const c = JSON.parse(saved);
        if (c && c.token && (!c.expires || Date.now() < c.expires)) {
          this.creds = c;
          this.unlock();
          return;
        }
      } catch(e){}
      try { localStorage.removeItem(LS_ADMIN); } catch(e){}
    }

    /* 2. No admin token — try to exchange the student session for one. */
    if (this._trySessionUnlock()) return;

    /* 3. Fall through to the password gate. */
    document.documentElement.classList.remove('session-bridge');
    if (matchMedia('(pointer:fine)').matches) $('ad-user').focus();
  },

  /* Called by init() when a user session exists but no admin token does.
     Posts adminSwitchFromUser with the user session token. The backend
     validates the token, confirms the account is an admin, and returns
     a fresh admin token. On any failure we drop the session-bridge class
     so the password form becomes visible. */
  _trySessionUnlock(){
    const s = USER_SESSION.read();
    if (!s) return false;
    const userToken = USER_SESSION.token(s);
    if (!userToken) return false;

    this._gateBusy(true);
    document.documentElement.classList.add('session-bridge');

    /* If the exchange never settles — a hung request, a dead deployment —
       fall back to the password form rather than a permanent spinner.
       The 11s timeout on the POST aborts the fetch itself, so a very slow
       server cannot resolve later and unlock after the admin has started
       typing credentials. */
    clearTimeout(this._bridgeTimer);
    this._bridgeTimer = setTimeout(() => {
      this._gateBusy(false);
      document.documentElement.classList.remove('session-bridge');
    }, 12000);

    this.post('adminSwitchFromUser',
              { username: s.username, token: userToken },
              { skipTokenCheck: true, timeoutMs: 11000 })
      .then(res => {
        if (!res || !res.success || !res.adminToken) {
          throw new Error((res && res.error) || 'Not an admin account.');
        }
        this.creds = {
          user: res.username || s.username,
          token: res.adminToken,
          expires: Date.now() + (res.expiresInMs || 86400000)
        };
        try { localStorage.setItem(LS_ADMIN, JSON.stringify(this.creds)); } catch(e){}
        this._gateBusy(false);
        this.unlock();
      })
      .catch(err => {
        /* Any failure — expired user session, not an admin, endpoint
           missing, network hiccup — falls back to the password gate.
           We keep the reason in the console for debugging but do not
           surface it in the UI. */
        try { console.info('Session bridge declined:', err && err.message); } catch(e){}
        this._gateBusy(false);
        document.documentElement.classList.remove('session-bridge');
        if (matchMedia('(pointer:fine)').matches) $('ad-user').focus();
      });

    return true;
  },

  _gateBusy(on){
    const g = $('gate'), b = $('gate-busy');
    if (g) g.classList.toggle('busy', on);
    if (b) b.hidden = !on;
    if (!on) clearTimeout(this._bridgeTimer);
  },

  async login(){
    const u = $('ad-user').value.trim();
    const p = $('ad-pass').value;
    if (!u || !p) return this.showErr('Enter your username and password.');
    if (p.length < 4) return this.showErr('That password is too short.');
    this.setLoading(true);
    try {
      const res = await this.post('adminLogin', { username:u, password:p }, { skipTokenCheck:true });
      if (!res.success) throw new Error(res.error || 'Those credentials did not work.');
      this.creds = { user:u, token:res.adminToken, expires: Date.now() + 86400000 };
      localStorage.setItem(LS_ADMIN, JSON.stringify(this.creds));
      document.documentElement.classList.remove('session-bridge');
      this._gateBusy(false);
      this.unlock();
      if (res.mustChangePassword) {
        this._forcedPwChange = true;
        TOAST.show('This account still uses the default password', 'warning', 6000);
        this.changePassword();
      } else {
        this._forcedPwChange = false;
        TOAST.show('Signed in', 'success');
      }
    } catch(e){ this.showErr(e.message || 'Sign-in failed.'); }
    this.setLoading(false);
  },

  unlock(){
    $('gate').style.display = 'none';
    $('app').classList.add('on');
    const name = this.creds?.user || 'admin';
    $('account-name').textContent = name;
    $('account-avatar').textContent = initials(name);
    const line = $('settings-account-line');
    if (line) line.textContent = 'Signed in as ' + name;
    this.fetchVersion();
    this.loadPermissions().then(() => this.refresh());
  },

  async fetchVersion(){
    try {
      const r = await fetch(GAS_URL + '?action=ping');
      const d = await r.json();
      if (d.success && d.version) {
        $('backend-version').textContent = 'Backend v' + d.version;
        $('account-role').textContent = this._perms?.role === 'owner' ? 'Owner' : 'Admin';
      }
    } catch(e){}
  },

  logout(){ this._leaveAdminMode(); },

  _leaveAdminMode(){
    try { localStorage.removeItem(LS_ADMIN); } catch(e){}
    let goDirect = false;
    try {
      const s = JSON.parse(localStorage.getItem(LS_USER) || 'null');
      if (s && s.type === 'user' && s.username &&
          s.username.toLowerCase() === (this.creds?.user || '').toLowerCase()) goDirect = true;
    } catch(e){}
    if (goDirect) { location.href = 'user.html'; return; }
    try {
      const raw = localStorage.getItem(LS_USER);
      if (raw && JSON.parse(raw).type === 'admin') localStorage.removeItem(LS_USER);
    } catch(e){}
    location.href = 'index.html';
  },

  setLoading(on){
    const b = $('btn-login');
    b.disabled = on;
    b.classList.toggle('loading', on);
    b.textContent = on ? 'Signing in' : 'Sign in';
  },
  showErr(msg){
    $('gate-err-text').textContent = msg;
    $('gate-err').classList.add('show');
  },
  hideErr(){ $('gate-err').classList.remove('show'); },

  /* Every call carries its own deadline. Apps Script can hang for a long
     time on a poor connection, and an un-cancelled fetch leaves the busy
     bar sweeping forever with no way for the admin to know if the action
     went through. The default 30 s is generous enough for the slowest
     scans (trends, most-missed) and short enough that a truly dead server
     surfaces as a toast instead of a freeze. */
  async post(action, params = {}, opts = {}){
    if (!opts.skipTokenCheck && !this.creds?.token) throw new Error('Not signed in.');
    const body = { action, ...params, adminToken: this.creds?.token };
    const timeoutMs = opts.timeoutMs || 30000;
    const ctl = ('AbortController' in window) ? new AbortController() : null;
    const timer = ctl ? setTimeout(() => ctl.abort(), timeoutMs) : null;
    let r;
    try {
      r = await fetch(GAS_URL, {
        method:'POST',
        headers:{ 'Content-Type':'text/plain' },
        body: JSON.stringify(body),
        signal: ctl && ctl.signal
      });
    } catch (netErr) {
      if (timer) clearTimeout(timer);
      if (netErr && netErr.name === 'AbortError') {
        throw new Error('That took too long. Check your connection and try again.');
      }
      throw new Error(navigator.onLine
        ? 'Could not reach the server. Try again in a moment.'
        : 'You are offline — reconnect and try again.');
    }
    if (timer) clearTimeout(timer);
    if (!r.ok) throw new Error('The server is unreachable right now (' + r.status + ').');
    const data = await r.json();
    if (data && data.success === false && /admin auth failed/i.test(data.error || '')) {
      TOAST.show('Your session expired — signing you out', 'warning');
      setTimeout(() => this.logout(), 1200);
      throw new Error('Session expired');
    }
    if (data && data.success === false && data.mustChangePassword) {
      this._forcedPwChange = true;
      this.changePassword();
      throw new Error('Password change required');
    }
    return data;
  },

  async loadPermissions(){
    try {
      const r = await this.post('adminListAdmins');
      if (!r.success) return;
      const me = (this.creds?.user || '').toLowerCase();
      const row = (r.admins || []).find(a => a.username.toLowerCase() === me);
      this._perms = row
        ? { role: row.role, features: Object.fromEntries((row.permissions || []).map(k => [k, true])) }
        : { role: 'admin', features: {} };
      $('account-role').textContent = this._perms.role === 'owner' ? 'Owner' : 'Admin';
      this._applyPermissions();
    } catch(e){ this._perms = null; }
  },
  can(key){
    if (!this._perms) return true;
    if (this._perms.role === 'owner') return true;
    return !!this._perms.features[key];
  },
  _hasFeature(k){ return this.can(k); },
  _applyPermissions(){
    /* Which rail button needs which permission comes from js/core/admin-nav.js. */
    const map = {};
    ADMIN_NAV.ALL.forEach(it => { map['nav-' + it.view] = Array.isArray(it.feature) ? it.feature : [it.feature]; });
    Object.entries(map).forEach(([id, feats]) => {
      const el = $(id);
      if (el) el.hidden = !feats.some(f => this.can(f));
    });
    $$('[data-perm]').forEach(el => { el.hidden = !this.can(el.dataset.perm); });
    const addBtn = $('btn-add-admin');
    if (addBtn) addBtn.hidden = this._perms?.role !== 'owner';
    const active = document.querySelector('.rail-item.active');
    if (active && active.hidden) UI.nav('today');
  },

  ALL_SCOPES: ['stats','users','payments','settings','logs','admins','weeklysets','qreports'],

  async refresh(scope){
    const want = (scope && scope.length) ? scope : this.ALL_SCOPES;
    const full = !scope;
    BUSY.start();
    try {
      const fetchers = {
        stats:      () => this.post('adminStats'),
        users:      () => this.post('adminListUsers'),
        payments:   () => this.post('adminListPayments'),
        /* adminGetSettings returns the private_* / secret_* keys too; the
           public endpoint strips them, so it is only the fallback. */
        settings:   () => this.post('adminGetSettings')
                            .then(r => (r && r.success) ? r : this.post('getSettings'))
                            .catch(() => this.post('getSettings')),
        logs:       () => this.post('adminListLogs').catch(() => ({success:false, logs:[]})),
        admins:     () => this.post('adminListAdmins').catch(() => ({success:false, admins:[]})),
        weeklysets: () => this.post('adminListWeeklySets').catch(() => ({success:false, sets:[]})),
        qreports:   () => this.post('adminListQuestionReports').catch(() => ({success:false, reports:[]}))
      };
      /* An unknown scope in the list would throw synchronously in the map
         and skip the rest — surface it as a failed fetch instead. */
      const results = await Promise.all(want.map(k => {
        const fn = fetchers[k];
        return fn ? fn() : Promise.resolve({ success: false, error: 'Unknown scope: ' + k });
      }));
      const failures = [];
      want.forEach((k, i) => {
        const r = results[i];
        if (k === 'stats') {
          if (r.success) { this.renderStats(r.stats); EXPIRING.load(); }
          else failures.push('statistics');
        } else if (k === 'users') {
          if (r.success) {
            this.data.users = r.users;
            this.data.usersTotalCount = r.totalCount ?? r.users.length;
            this.data.usersTruncated = !!r.truncated;
            USERS.render();
          } else failures.push('students');
        } else if (k === 'payments') {
          if (r.success) {
            this.data.payments = r.payments;
            this.data.paymentsTotalCount = r.totalCount ?? r.payments.length;
            this.data.paymentsTruncated = !!r.truncated;
            PAYMENTS.render();
          } else failures.push('payments');
        } else if (k === 'settings') { if (r.success) { this.data.settings = r.settings; SETTINGS.load(); } }
        else if (k === 'logs') { if (r.success) { this.data.logs = r.logs; LOGS.render(); } }
        else if (k === 'admins') { if (r.success) { this.data.admins = r.admins || []; ADMINS.render(r.admins, r.isOwner, r.features); } }
        else if (k === 'weeklysets') {
          if (r.success) {
            this.data.weeklysetsTotalCount = r.totalCount ?? (r.sets?.length || 0);
            this.data.weeklysetsTruncated = !!r.truncated;
            WEEKLYSETS.render(r.sets);
          }
        } else if (k === 'qreports') {
          if (r.success) {
            this.data.qreportsTotalCount = r.totalCount ?? (r.reports?.length || 0);
            this.data.qreportsTruncated = !!r.truncated;
            QREPORTS.render(r.reports);
          }
        }
      });
      SUBJ_STORE.load(full).then(() => { TODAY.render(); BADGES.update(); });
      BADGES.update();
      TODAY.render();
      this.markSynced();
      if (failures.length) {
        TOAST.show('Could not load ' + failures.join(', ') + '. Everything else is up to date.', 'error', 6000);
      } else if (full) {
        TOAST.show('Up to date', 'success', 1800);
      }
    } catch(e){
      if (!/session expired|password change/i.test(e.message)) {
        TOAST.show(e.message || 'Refresh failed', 'error', 6000);
      }
    }
    BUSY.stop();
  },

  markSynced(){
    this._lastSync = Date.now();
    this.paintSync();
  },
  paintSync(){
    const el = $('sync-note');
    if (!el || !this._lastSync) return;
    el.textContent = 'Updated ' + relTime(this._lastSync);
  },

  renderStats(s){
    const set = (id, v) => { const e = $(id); if (e) e.textContent = (v ?? 0).toLocaleString(); };
    set('st-users', s.users?.total);
    set('st-trial', s.users?.trial);
    set('st-active', s.users?.active);
    set('st-expired', s.users?.expired);
    set('st-pending', s.users?.paymentPending);
    set('st-payments', s.payments?.total);
    set('st-verified', s.payments?.verified);
    set('st-rejected', s.payments?.rejected);
  },

  toCSV(headers, rows){
    const e = v => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
    return [headers.map(e).join(','), ...rows.map(r => r.map(e).join(','))].join('\n');
  },
  downloadCSV(content, filename){
    const url = URL.createObjectURL(new Blob([content], { type:'text/csv' }));
    const a = document.createElement('a');
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
    TOAST.show('Downloaded ' + filename, 'success');
  },
  exportUsers(){
    const rows = USERS._visibleRows();
    if (!rows.length) return TOAST.show('Nothing to export with these filters', 'warning');
    const csv = this.toCSV(
      ['Username','Name','Email','Mobile','Status','Joined','Access'],
      rows.map(u => [u.username, u.name || '', u.email || '', u.mobile || '', u.status, u.createdAt || '', USERS.accessLabel(u)])
    );
    this.downloadCSV(csv, 'students_' + (rows.length === this.data.users.length ? 'all' : 'filtered') + '.csv');
  },
  exportPayments(){
    const rows = PAYMENTS._visibleRows();
    if (!rows.length) return TOAST.show('Nothing to export with these filters', 'warning');
    const csv = this.toCSV(
      ['Username','Name','Transaction ID','Amount','Status','Submitted','Remarks'],
      rows.map(p => [p.username, p.name || '', p.txId, this.data.settings.paymentAmount || 100, p.status, p.submittedAt || '', p.remarks || ''])
    );
    this.downloadCSV(csv, 'payments_' + (rows.length === this.data.payments.length ? 'all' : 'filtered') + '.csv');
  },

  /* Screenshots are private in Drive (and the upkeep tool makes older ones
     private too), so an <img src> pointed at the Drive URL renders nothing.
     Pull the bytes through the console and show them inline instead. */
  async renderScreenshot(containerId, url, username){
    const box = $(containerId);
    if (!box) return;
    try {
      const fileId = driveFileId(url);
      if (!fileId) throw new Error('This record does not point to a readable Drive file.');
      const res = await this.post('adminDownloadScreenshot', { url, fileId });
      if (!res.success) throw new Error(res.error || 'Could not load the screenshot.');
      const el = $(containerId);
      if (!el) return;
      if (/pdf/i.test(res.mimeType || '')) {
        el.innerHTML = '<p class="t-foot">The student attached a PDF. Use Download to open it.</p>';
        return;
      }
      el.innerHTML = '<img alt="Payment screenshot from ' + esc(username || 'this student') + '" src="data:' +
        esc(res.mimeType || 'image/png') + ';base64,' + res.base64 +
        '" style="max-width:100%;max-height:320px;border-radius:var(--r-card);border:1px solid var(--sep)">';
    } catch(e){
      const el = $(containerId);
      if (el) el.innerHTML = '<p class="t-foot">Could not load the screenshot: ' + esc(e.message || '') + '</p>';
    }
  },

  async downloadScreenshot(url, filename){
    TOAST.show('Preparing download', 'info', 2000);
    BUSY.start();
    try {
      const fileId = driveFileId(url);
      if (!fileId) throw new Error('That record does not point to a readable Drive file.');
      const res = await this.post('adminDownloadScreenshot', { url, fileId });
      if (!res.success) throw new Error(res.error || 'Could not fetch that file.');

      const chars = atob(res.base64);
      const bytes = new Uint8Array(chars.length);
      for (let i = 0; i < chars.length; i++) bytes[i] = chars.charCodeAt(i);
      const mime = res.mimeType || 'image/png';
      const blobUrl = URL.createObjectURL(new Blob([bytes], { type: mime }));

      const ext = /pdf/i.test(mime) ? '.pdf' : /jpe?g/i.test(mime) ? '.jpg' : '.png';
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = filename || res.filename || ('download' + ext);
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(blobUrl), 4000);
      TOAST.show('Downloaded', 'success');
    } catch(e){ TOAST.show(e.message || 'Download failed', 'error'); }
    BUSY.stop();
  },

  changePassword(){
    ['pwd-current','pwd-new','pwd-confirm'].forEach(id => $(id).value = '');
    $('pwd-forced-note').hidden = !this._forcedPwChange;
    $('pwd-close').hidden = !!this._forcedPwChange;
    $('pwd-cancel').hidden = !!this._forcedPwChange;
    MODAL.open('pwd');
  },
  async doChangePassword(){
    const cur = $('pwd-current').value, nw = $('pwd-new').value, cf = $('pwd-confirm').value;
    if (!cur || !nw) return TOAST.show('Fill in every field', 'error');
    if (nw.length < 6) return TOAST.show('Use at least 6 characters', 'error');
    if (nw !== cf) return TOAST.show('The two new passwords do not match', 'error');
    const btn = $('pwd-save');
    btn.classList.add('loading');
    try {
      const res = await this.post('adminChangePassword', { currentPassword: cur, newPassword: nw });
      if (!res.success) throw new Error(res.error);
      this._forcedPwChange = false;
      MODAL.close('pwd');
      TOAST.show('Password changed — sign in again', 'success', 4000);
      setTimeout(() => this.logout(), 2000);
    } catch(e){ TOAST.show(e.message || 'Could not change the password', 'error'); }
    btn.classList.remove('loading');
  }
};

const TODAY = {
  render(){
    const el = $('queue');
    if (!el) return;
    const pendingPay   = (ADMIN.data.payments || []).filter(p => p.status === 'pending').length;
    const qotdPending  = SUBJ_STORE.all.filter(s => (s.kind || 'qotd') === 'qotd' && s.status !== 'graded').length;
    const examPending  = SUBJ_STORE.all.filter(s => s.kind === 'exam' && s.status !== 'graded').length;
    const openReports  = (QREPORTS.all || []).filter(r => r.status === 'open').length;
    const expiring     = Number($('expiring-list')?.dataset.count || 0);

    const items = [
      { n:pendingPay,  tone:'money',  icon:'ph-credit-card',
        t:'Payments to verify', done:'No payments waiting', busy:'Students are waiting for access',
        go:"UI.nav('payments')" },
      { n:qotdPending, tone:'urgent', icon:'ph-sun-horizon',
        t:'Daily answers to grade', done:'Every answer graded', busy:'Written answers from today',
        go:"UI.nav('subj-qotd')" },
      { n:examPending, tone:'urgent', icon:'ph-note-pencil',
        t:'Exam papers to grade', done:'No papers waiting', busy:'Full papers submitted as PDF',
        go:"UI.nav('subj-exam')" },
      { n:openReports, tone:'alert',  icon:'ph-flag',
        t:'Flagged questions', done:'Nothing flagged', busy:'Students found a problem',
        go:"UI.nav('qreports')" },
      { n:expiring,    tone:'urgent', icon:'ph-hourglass-medium',
        t:'Trials ending soon', done:'No trials ending', busy:'Within your selected window',
        go:"document.getElementById('expiring-panel').scrollIntoView({behavior:'smooth',block:'center'})" }
    ];
    const open = items.filter(i => i.n > 0).length;

    el.innerHTML = items.map(i =>
      '<button class="queue-row ' + (i.n ? i.tone : 'clear') + '" role="listitem" data-on-click="' + i.go + '">' +
        '<span class="q-icon"><i class="ph ' + i.icon + '"></i></span>' +
        '<span class="q-body">' +
          '<span class="q-title">' + i.t + '</span>' +
          '<span class="q-sub">' + (i.n ? i.busy : i.done) + '</span>' +
        '</span>' +
        '<span class="q-count">' + i.n + '</span>' +
        '<i class="ph ph-caret-right q-chev"></i>' +
      '</button>'
    ).join('');

    const head = $('today-date');
    if (head) {
      head.textContent = new Date().toLocaleDateString(undefined, { weekday:'long', day:'numeric', month:'long' }) +
        ' · ' + (open ? plural(open, 'thing') + ' need your attention' : 'Nothing needs your attention');
    }
  }
};

const BADGES = {
  set(id, n){
    const el = $(id);
    if (!el) return;
    if (n > 0) { el.textContent = n > 99 ? '99+' : n; el.hidden = false; el.setAttribute('aria-label', n + ' waiting'); }
    else el.hidden = true;
  },
  update(){
    this.set('badge-payments', (ADMIN.data.payments || []).filter(p => p.status === 'pending').length);
    this.set('badge-qreports', (QREPORTS.all || []).filter(r => r.status === 'open').length);
    this.set('badge-subjective', SUBJ_STORE.all.filter(s => s.status !== 'graded').length);
    this.set('tab-count-qotd', SUBJ_STORE.all.filter(s => (s.kind || 'qotd') === 'qotd' && s.status !== 'graded').length);
    this.set('tab-count-hourly', SUBJ_STORE.all.filter(s => s.kind === 'hourly' && s.status !== 'graded').length);
    this.set('tab-count-exam', SUBJ_STORE.all.filter(s => s.kind === 'exam' && s.status !== 'graded').length);
  }
};

const PALETTE = {
  _items: [], _filtered: [], _idx: 0, _bound: false,

  open(){
    $('palette').classList.add('show');
    document.body.style.overflow = 'hidden';
    const input = $('palette-q');
    input.value = '';
    this._build();
    this._filtered = this._items;
    this._idx = 0;
    this._render();
    setTimeout(() => input.focus(), 30);
    if (!this._bound) {
      this._bound = true;
      input.addEventListener('input', () => { this._filter(input.value); this._render(); });
      input.addEventListener('keydown', e => {
        if (e.key === 'Escape') { this.close(); return; }
        if (e.key === 'ArrowDown') { e.preventDefault(); this._move(1); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); this._move(-1); }
        else if (e.key === 'Enter') { e.preventDefault(); this._pick(this._idx); }
      });
    }
  },
  close(){
    $('palette').classList.remove('show');
    if (!document.querySelector('.overlay.show')) document.body.style.overflow = '';
  },
  _move(d){
    if (!this._filtered.length) return;
    this._idx = Math.max(0, Math.min(this._filtered.length - 1, this._idx + d));
    this._render();
  },

  _build(){
    const items = [];
    const add = (group, title, sub, icon, action) => items.push({ group, title, sub, icon, action });

    add('Go to','Today','','ph-sun-horizon', () => UI.nav('today'));
    add('Go to','Insights','','ph-chart-bar', () => UI.nav('dashboard'));
    add('Go to','Students','','ph-users-three', () => UI.nav('users'));
    add('Go to','Payments','','ph-credit-card', () => UI.nav('payments'));
    add('Go to','Admins','','ph-shield-check', () => UI.nav('admins'));
    add('Go to','Weekly sets','','ph-calendar-check', () => UI.nav('weeklysets'));
    add('Go to','Grading','','ph-note-pencil', () => UI.nav('subjective'));
    add('Go to','Reports','','ph-flag', () => UI.nav('qreports'));
    add('Go to','Activity','','ph-clock-counter-clockwise', () => UI.nav('logs'));
    add('Go to','Data & upkeep','','ph-database', () => UI.nav('data'));
    add('Go to','Settings','','ph-gear', () => UI.nav('settings'));

    add('Do','Refresh data','Ctrl R','ph-arrow-clockwise', () => ADMIN.refresh());
    add('Do','Export students as CSV','','ph-download-simple', () => ADMIN.exportUsers());
    add('Do','Export payments as CSV','','ph-download-simple', () => ADMIN.exportPayments());
    add('Do','Schedule a weekly set','','ph-calendar-plus', () => { UI.nav('weeklysets'); setTimeout(() => WEEKLYSETS.openCreate(), 150); });
    add('Do','Switch theme','','ph-circle-half', () => toggleTheme());
    add('Do','Change my password','','ph-key', () => ADMIN.changePassword());
    add('Do','Sign out','','ph-sign-out', () => ADMIN.logout());

    (ADMIN.data.payments || []).filter(p => p.status === 'pending').forEach(p => {
      add('Payments awaiting review', p.name || p.username, 'TXN ' + (p.txId || '—'), 'ph-credit-card',
        () => { UI.nav('payments'); setTimeout(() => PAYMENTS.review(p.username), 120); });
    });
    (ADMIN.data.users || []).slice(0, 400).forEach(u => {
      add('Students', u.name || u.username, u.username + (u.email ? ' · ' + u.email : ''), 'ph-user',
        () => { UI.nav('users'); setTimeout(() => USERS.view(u.username), 120); });
    });
    (WEEKLYSETS.list || []).forEach(s => {
      add('Weekly sets', s.title, s.chapterLabel || '', 'ph-calendar-check', () => UI.nav('weeklysets'));
    });

    this._items = items;
  },

  _score(item, term){
    const hay = (item.title + ' ' + (item.sub || '') + ' ' + item.group).toLowerCase();
    if (hay.includes(term)) return item.title.toLowerCase().startsWith(term) ? 0 : 1;
    let i = 0;
    for (const ch of hay) { if (ch === term[i]) i++; if (i === term.length) return 2; }
    return -1;
  },
  _filter(q){
    const term = (q || '').toLowerCase().trim();
    this._idx = 0;
    if (!term) { this._filtered = this._items; return; }
    this._filtered = this._items
      .map(it => ({ it, s: this._score(it, term) }))
      .filter(x => x.s >= 0)
      .sort((a, b) => a.s - b.s)
      .map(x => x.it);
  },

  _render(){
    const box = $('palette-list');
    if (!this._filtered.length) {
      box.innerHTML = '<div class="empty" style="padding:var(--sp-8) var(--sp-4)"><i class="ph ph-magnifying-glass"></i>' +
        '<div class="t">No matches</div><div class="d">Try a username, transaction ID or section name.</div></div>';
      return;
    }
    const shown = this._filtered.slice(0, 50);
    const groups = {};
    shown.forEach((it, i) => { (groups[it.group] = groups[it.group] || []).push({ it, i }); });
    box.innerHTML = Object.keys(groups).map(g =>
      '<div class="palette-group">' + esc(g) + '</div>' +
      groups[g].map(({ it, i }) =>
        '<button class="palette-item' + (i === this._idx ? ' sel' : '') + '" role="option" aria-selected="' + (i === this._idx) + '" data-on-click="PALETTE._pick(' + i + ')">' +
          '<i class="ph ' + it.icon + '"></i>' +
          '<span class="p-title">' + esc(it.title) + '</span>' +
          (it.sub ? '<span class="p-sub">' + esc(it.sub) + '</span>' : '') +
        '</button>'
      ).join('')
    ).join('');
    const sel = box.querySelector('.palette-item.sel');
    if (sel) sel.scrollIntoView({ block:'nearest' });
  },

  _pick(i){
    const it = this._filtered[i];
    if (!it) return;
    this.close();
    try { it.action(); } catch(e){ TOAST.show(e.message || 'That action failed', 'error'); }
  }
};

const EXPIRING = {
  async load(){
    const box = $('expiring-list');
    if (!box) return;
    const hours = $('exp-hours')?.value || 24;
    box.innerHTML = '<div class="skeleton sk-80"></div><div class="skeleton sk-60"></div>';
    try {
      const res = await ADMIN.post('adminExpiringTrials', { hours });
      if (!res.success) throw new Error(res.error || 'Could not load trials.');
      box.dataset.count = res.count || 0;
      if (!res.count) {
        box.innerHTML = '<div class="empty" style="padding:var(--sp-8) var(--sp-4)"><i class="ph ph-hourglass"></i>' +
          '<div class="t">No trials ending soon</div>' +
          '<div class="d">When push notifications are set up, students are reminded two hours before their trial runs out.</div></div>';
        TODAY.render();
        return;
      }
      box.innerHTML =
        '<p class="t-foot mb3">' + plural(res.count, 'trial') + ' ending within ' + hours + ' hours. Reminders go out two hours before, once push notifications are set up.</p>' +
        '<div class="rows">' + res.users.map(u => {
          const mins = Math.max(0, Math.round((new Date(u.trialExpiresAt).getTime() - Date.now()) / 60000));
          const left = mins < 60 ? mins + ' min left' : Math.round(mins / 60) + ' h left';
          return '<div class="row">' +
            '<span class="avatar">' + esc(initials(u.name || u.username)) + '</span>' +
            '<div class="row-main"><div class="row-title">' + esc(u.name || u.username) + '</div>' +
            '<div class="row-sub mono">' + esc(u.username) + (u.email ? ' · ' + esc(u.email) : '') + '</div></div>' +
            '<span class="badge st-trial">' + esc(left) + '</span>' +
            '<button class="icon-btn sm" data-on-click="USERS.view(\'' + escAttrJs(u.username) + '\')" aria-label="Open ' + esc(u.username) + '"><i class="ph ph-arrow-right"></i></button>' +
          '</div>';
        }).join('') + '</div>';
      TODAY.render();
    } catch(e){
      box.innerHTML = '<div class="banner banner-danger"><i class="ph ph-warning-circle"></i><span>' + esc(e.message) +
        ' <button class="btn btn-sm btn-quiet" style="margin-left:.5rem" data-on-click="EXPIRING.load()">Try again</button></span></div>';
    }
  }
};

const ADMINS = {
  _list: [], _isOwner: false, _labels: {}, _selected: null,

  GROUPS: [
    { name:'Overview',  keys:['dashboard'] },
    { name:'Students',  keys:['users_view','users_manage','users_bulk'] },
    { name:'Payments',  keys:['payments_view','payments_review','payments_bulk','screenshots'] },
    { name:'Weekly sets', keys:['weeklysets_view','weeklysets_manage'] },
    { name:'Study PDFs', keys:['studydocs_view','studydocs_manage'] },
    { name:'Reports',   keys:['qreports_view','qreports_manage'] },
    { name:'Grading',   keys:['subjective_view','subjective_grade','subjective_import'] },
    { name:'Activity & settings', keys:['logs_view','settings_view','settings_manage'] },
    { name:'Admins',    keys:['admins_view'] },
    { name:'Data',      keys:['maintenance','exports','imports'] }
  ],

  render(admins, isOwner, labels){
    this._list = admins || [];
    this._isOwner = !!isOwner;
    this._labels = labels || this._labels || {};
    const box = $('admins-list');
    if (!box) return;
    const addBtn = $('btn-add-admin');
    if (addBtn) addBtn.hidden = !this._isOwner;

    if (!this._list.length) {
      box.innerHTML = '<div class="empty"><i class="ph ph-shield-check"></i><div class="t">No admin accounts yet</div>' +
        '<div class="d">Add one so you are not the only person who can verify payments.</div>' +
        (this._isOwner ? '<div class="a"><button class="btn btn-primary" data-on-click="ADMINS.openPromote()">Add admin</button></div>' : '') + '</div>';
      return;
    }

    const me = (ADMIN.creds?.user || '').toLowerCase();
    box.innerHTML = '<div class="rows">' + this._list.map(a => {
      const isMe = a.username.toLowerCase() === me;
      const isOwnerRow = a.role === 'owner';
      const perms = a.permissions || [];
      const dual = ADMIN.data.users.some(u => u.username.toLowerCase() === a.username.toLowerCase());
      const pills = (!isOwnerRow && perms.length)
        ? perms.slice(0, 3).map(k => '<span class="perm-pill">' + esc(this._labels[k] || k) + '</span>').join('') +
          (perms.length > 3 ? '<span class="perm-pill more">+' + (perms.length - 3) + '</span>' : '')
        : '';
      return '<div class="row" style="align-items:flex-start;flex-wrap:wrap">' +
        '<span class="avatar" style="margin-top:2px">' + esc(initials(a.username)) + '</span>' +
        '<div class="row-main">' +
          '<div class="row-title">' + esc(a.username) +
            (isMe ? '<span class="t-cap">you</span>' : '') +
            (isOwnerRow ? badge('active','Owner') : badge('trial','Admin')) +
            (dual ? '<span class="badge flat" title="Also studies on this account">Also a student</span>' : '') +
          '</div>' +
          '<div class="row-sub">' + (a.createdBy ? 'Added by ' + esc(a.createdBy) : 'Added ' + relTime(a.createdAt)) +
            (isOwnerRow ? ' · full access' : '') + '</div>' +
          (pills ? '<div class="flex wrap g1 mt2">' + pills + '</div>' : '') +
          '<div class="admin-perms" id="perms-' + escAttrJs(a.username) + '">' + this._permEditor(a.username, perms, isOwnerRow) + '</div>' +
        '</div>' +
        '<div class="flex g2" style="flex-shrink:0">' +
          ((!isMe && this._isOwner) ? '<button class="btn btn-quiet btn-sm" data-on-click="ADMINS.togglePerms(\'' + escAttrJs(a.username) + '\')"><i class="ph ph-sliders-horizontal"></i> Access</button>' : '') +
          ((!isMe && this._isOwner && !isOwnerRow) ? '<button class="icon-btn sm danger" data-on-click="ADMINS.demote(\'' + escAttrJs(a.username) + '\')" aria-label="Remove admin role from ' + esc(a.username) + '"><i class="ph ph-user-minus"></i></button>' : '') +
        '</div>' +
      '</div>';
    }).join('') + '</div>';
  },

  _permEditor(username, granted, isOwnerRow){
    if (isOwnerRow) return '<p class="t-foot">The owner always has full access.</p>';
    const has = new Set(granted);
    return '<div class="perm-grid">' + this.GROUPS.map(g => {
      const keys = g.keys.filter(k => this._labels[k]);
      if (!keys.length) return '';
      return '<div><div class="perm-group-t">' + esc(g.name) + '</div>' +
        keys.map(k => '<label class="perm-row"><input type="checkbox" data-admin="' + escAttrJs(username) + '" data-feat="' + escAttrJs(k) + '"' + (has.has(k) ? ' checked' : '') + '><span>' + esc(this._labels[k]) + '</span></label>').join('') +
      '</div>';
    }).join('') + '</div>' +
    '<div class="flex g2 mt4"><button class="btn btn-primary btn-sm" data-on-click="ADMINS.savePerms(\'' + escAttrJs(username) + '\')">Save access</button>' +
    '<button class="btn btn-quiet btn-sm" data-on-click="ADMINS.togglePerms(\'' + escAttrJs(username) + '\')">Cancel</button></div>';
  },

  togglePerms(username){
    const el = $('perms-' + username);
    if (el) el.classList.toggle('show');
  },

  async savePerms(username){
    const features = {};
    document.querySelectorAll('input[data-admin="' + CSS.escape(username) + '"][data-feat]').forEach(cb => { features[cb.dataset.feat] = cb.checked; });
    BUSY.start();
    try {
      const r = await ADMIN.post('adminSetAdminPermissions', { username, features: JSON.stringify(features) });
      if (!r.success) throw new Error(r.error || 'Could not save.');
      TOAST.show('Access updated for ' + username, 'success');
      ADMIN.refresh(['admins']);
    } catch(e){ TOAST.show(e.message, 'error'); }
    BUSY.stop();
  },

  openPromote(){
    this._selected = null;
    this._modeVal = 'existing';
    const starter = ['dashboard','users_view','payments_view','subjective_view','weeklysets_view','studydocs_view','qreports_view','logs_view'];
    MODAL.sheet('Add an admin',
      '<div class="segmented mb4" role="tablist">' +
        '<button class="active" id="ap-tab-existing" data-on-click="ADMINS._mode(\'existing\')">Existing student</button>' +
        '<button id="ap-tab-new" data-on-click="ADMINS._mode(\'new\')">New account</button>' +
      '</div>' +
      '<div id="ap-existing">' +
        '<p class="t-callout mb4">They keep their password and their study access — you are only adding an admin role.</p>' +
        '<div class="field picker">' +
          '<label for="promote-search">Find a student</label>' +
          '<input class="input" type="text" id="promote-search" placeholder="Search by name, username or email" autocomplete="off" data-on-input="ADMINS._searchPromote(this.value)" data-on-focus="ADMINS._searchPromote(this.value)">' +
          '<div class="picker-list" id="promote-results"></div>' +
        '</div>' +
        '<div id="promote-selected" hidden></div>' +
      '</div>' +
      '<div id="ap-new" hidden>' +
        '<p class="t-callout mb4">Use this only for someone who does not study on Abhyas. They will have no student account to fall back on.</p>' +
        '<div class="field"><label for="ca-user">Username</label><input class="input" type="text" id="ca-user" placeholder="letters, numbers, . _ -" autocapitalize="none"></div>' +
        '<div class="field"><label for="ca-pass">Temporary password</label><input class="input" type="text" id="ca-pass" placeholder="At least 6 characters"></div>' +
      '</div>' +
      '<div class="field mt4"><span class="field-label">What they can do</span>' +
        '<span class="field-hint">You can change this at any time.</span>' +
        '<div class="perm-grid mt2" id="promote-perms">' + (this.GROUPS.map(g => {
          const keys = g.keys.filter(k => this._labels[k]);
          if (!keys.length) return '';
          return '<div><div class="perm-group-t">' + esc(g.name) + '</div>' +
            keys.map(k => '<label class="perm-row"><input type="checkbox" data-feat="' + escAttrJs(k) + '"' + (starter.includes(k) ? ' checked' : '') + '><span>' + esc(this._labels[k] || k) + '</span></label>').join('') +
          '</div>';
        }).join('') || '<p class="t-foot">Permissions load with the admin list — refresh and try again.</p>') + '</div>' +
      '</div>' +
      '<div class="flex g2 mt4"><button class="btn btn-primary btn-block" id="ap-submit" data-on-click="ADMINS.submit()">Add admin</button></div>'
    );
  },
  _mode(m){
    const existing = m === 'existing';
    $('ap-existing').hidden = !existing;
    $('ap-new').hidden = existing;
    $('ap-tab-existing').classList.toggle('active', existing);
    $('ap-tab-new').classList.toggle('active', !existing);
    $('ap-submit').textContent = existing ? 'Add admin' : 'Create admin account';
    this._modeVal = m;
  },

  _searchPromote(q){
    const list = $('promote-results');
    if (!list) return;
    const term = String(q || '').trim().toLowerCase();
    const taken = new Set((this._list || []).map(a => a.username.toLowerCase()));
    const matches = (ADMIN.data.users || []).filter(u => {
      if (taken.has(u.username.toLowerCase())) return false;
      if (!term) return true;
      return (u.username || '').toLowerCase().includes(term) ||
             (u.name || '').toLowerCase().includes(term) ||
             (u.email || '').toLowerCase().includes(term);
    }).slice(0, 12);

    if (!matches.length) {
      list.innerHTML = '<div class="picker-empty">' + (term ? 'No student matches that.' : 'Start typing a name, username or email.') + '</div>';
      list.classList.add('show');
      return;
    }
    list.innerHTML = matches.map(u =>
      '<button class="picker-item" data-on-click="ADMINS._selectPromote(' + JSON.stringify(String(u.username)).replace(/"/g, '&quot;') + ')">' +
        '<span class="flex center g2" style="min-width:0">' +
          '<span class="avatar">' + esc(initials(u.name || u.username)) + '</span>' +
          '<span style="min-width:0"><span class="nm truncate" style="display:block">' + esc(u.name || u.username) + '</span>' +
          '<span class="un truncate" style="display:block">' + esc(u.username) + (u.email ? ' · ' + esc(u.email) : '') + '</span></span>' +
        '</span>' + badge(u.status || 'trial') +
        (u.emailVerified ? '' : '<span class="badge badge-warning flat" title="They must confirm their email before they can be made an admin">unconfirmed email</span>') +
      '</button>').join('');
    list.classList.add('show');
  },

  _selectPromote(username){
    const u = (ADMIN.data.users || []).find(x => x.username === username);
    if (!u) return;
    this._selected = username;
    $('promote-results').classList.remove('show');
    $('promote-search').value = '';
    const sel = $('promote-selected');
    sel.hidden = false;
    sel.innerHTML = '<div class="row" style="border-top:none;background:var(--accent-soft);border-radius:var(--r-card);padding:var(--sp-3)">' +
      '<span class="avatar">' + esc(initials(u.name || u.username)) + '</span>' +
      '<div class="row-main"><div class="row-title">' + esc(u.name || u.username) + '</div>' +
      '<div class="row-sub mono">' + esc(u.username) + '</div></div>' +
      '<button class="btn btn-quiet btn-sm" data-on-click="ADMINS._clearPromote()">Change</button></div>';
  },
  _clearPromote(){
    this._selected = null;
    const sel = $('promote-selected');
    if (sel) { sel.hidden = true; sel.innerHTML = ''; }
    setTimeout(() => $('promote-search')?.focus(), 30);
  },

  async submit(){
    const btn = $('ap-submit');
    const features = {};
    document.querySelectorAll('#promote-perms input[data-feat]').forEach(cb => { features[cb.dataset.feat] = cb.checked; });
    btn.classList.add('loading');
    try {
      if (this._modeVal === 'new') {
        const username = $('ca-user').value.trim();
        const password = $('ca-pass').value;
        if (!username || !password) throw new Error('Fill in both fields.');
        if (password.length < 6) throw new Error('Use at least 6 characters.');
        const r = await ADMIN.post('adminCreateAdmin', { username, password, permissions: JSON.stringify(features) });
        if (!r.success) throw new Error(r.error || 'Could not create that account.');
        TOAST.show(username + ' can now sign in as an admin', 'success');
      } else {
        if (!this._selected) throw new Error('Pick a student first.');
        const r = await ADMIN.post('adminPromoteUserToAdmin', { username: this._selected, permissions: JSON.stringify(features) });
        if (!r.success) throw new Error(r.error || 'Could not add that admin.');
        TOAST.show(this._selected + ' is now an admin', 'success');
      }
      MODAL.close('sheet');
      ADMIN.refresh(['admins']);
    } catch(e){ TOAST.show(e.message, 'error'); }
    btn.classList.remove('loading');
  },

  async demote(username){
    const alsoUser = (ADMIN.data.users || []).some(u => u.username.toLowerCase() === username.toLowerCase());
    const ok = await CONFIRM.ask({
      title: 'Remove admin role',
      body: alsoUser
        ? '<b>' + esc(username) + '</b> keeps their student account and password. They only lose access to this console.'
        : '<b>' + esc(username) + '</b> has no student account. Removing the admin role locks them out completely.',
      confirmText: 'Remove role', tone: 'danger'
    });
    if (!ok) return;
    BUSY.start();
    try {
      const res = await ADMIN.post('adminDeleteAdmin', { username });
      if (!res.success) throw new Error(res.error);
      TOAST.show('Admin role removed', 'success');
      ADMIN.refresh(['admins']);
    } catch(e){ TOAST.show(e.message, 'error'); }
    BUSY.stop();
  }
};

