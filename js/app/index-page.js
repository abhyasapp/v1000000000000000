/* ═══════════════════════════════════════════════════════════════════════
   Abhyas — front door.

   Handles six states behind one card: sign in, create account, forgot
   password, reset password, trial, payment, awaiting review — plus the
   silent hand-off for anyone who already has permanent access.

   Every credential goes out by POST. None of them ever appear in a URL,
   which would otherwise put them in browser history and in the Apps
   Script request log.
   ═══════════════════════════════════════════════════════════════════════ */
'use strict';

const GAS_URL = ABHYAS_CONFIG.GAS_URL;
const GOOGLE_CLIENT_ID = "242226857075-hpkbjoqhlem95fu6vkf712e8ijs33sng.apps.googleusercontent.com";
const LS_USER  = 'abhyas_session';
const LS_ADMIN = 'abhyas_admin';

const $ = id => document.getElementById(id);

/* shared.js ships a theme toggle, but it doesn't move the browser
   chrome colour with it. Override so the phone status bar matches.
   Both <meta name="theme-color"> tags must be updated — the browser
   picks whichever matches the OS preference, and a student who
   overrides the theme inside the app would otherwise see a status bar
   that contradicts what is on screen. */
window.toggleTheme = function(){
  const dark = document.documentElement.classList.toggle('dark');
  try { localStorage.setItem('abhyas_theme', JSON.stringify(dark ? 'dark' : 'light')); } catch(e){}
  document.querySelectorAll('meta[name="theme-color"]').forEach(m =>
    m.setAttribute('content', dark ? '#080B14' : '#F2F4F3'));
};

function togglePw(btn){
  const input = btn.closest('.pw-field').querySelector('input');
  const show = input.type === 'password';
  input.type = show ? 'text' : 'password';
  btn.setAttribute('aria-pressed', show ? 'true' : 'false');
  btn.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
  btn.innerHTML = show ? '<i class="ph ph-eye-slash"></i>' : '<i class="ph ph-eye"></i>';
}

const MODES = ['redirecting','login','signup','forgot','reset','payment','trial','status'];

/* ═══════════════════════════════════════════════════════════════════════
   v1.28: offline payment queue.

   A student who fills in the payment form without signal used to lose
   everything on submit. Now the submission is written to localStorage
   and posted automatically when the connection returns. The queue is
   user-scoped so a second student on the same device never sends the
   previous student's payment.
   ═══════════════════════════════════════════════════════════════════════ */
const PAY_QUEUE = {
  KEY: 'abhyas_pay_queue_v1',
  MAX_SCREENSHOT_BYTES: 2 * 1024 * 1024,
  MAX_ATTEMPTS: 3,

  read(){
    try { return JSON.parse(localStorage.getItem(this.KEY) || '[]') || []; }
    catch(e){ return []; }
  },
  write(list){
    try { localStorage.setItem(this.KEY, JSON.stringify(list || [])); } catch(e){}
    this.paint();
  },
  add(item){
    const list = this.read().filter(x => x.username !== item.username);   // one per user
    list.push({ ...item, queuedAt: Date.now(), attempts: 0 });
    this.write(list);
  },
  removeFor(username){
    this.write(this.read().filter(x => x.username !== username));
  },
  forUser(username){
    return this.read().filter(x => x.username === username);
  },

  paint(){
    const el = document.getElementById('pay-queue-note');
    if (!el) return;
    const s = (typeof APP !== 'undefined' && APP.session) || null;
    const mine = s ? this.forUser(s.username) : [];
    const n = mine.length;
    if (!n) { el.hidden = true; el.innerHTML = ''; return; }
    el.hidden = false;
    el.innerHTML =
      '<i class="ph ph-cloud-slash"></i>' +
      '<span>' +
        (n === 1 ? '1 payment is queued' : n + ' payments are queued') +
        ' on this device. ' +
        (navigator.onLine
          ? 'Sending now…'
          : 'It will be sent automatically as soon as you are back online.') +
      '</span>';
  },

  async process(){
    if (!navigator.onLine) return;
    const s = (typeof APP !== 'undefined' && APP.session) || null;
    if (!s || !s.username || !s.token) return;

    const list = this.read();
    if (!list.length) return;

    const remaining = [];
    let sentAny = false;

    for (const item of list){
      /* Only send the current user's queued payments. Leave everyone
         else's untouched for their next login. */
      if (item.username !== s.username){ remaining.push(item); continue; }

      item.attempts = (item.attempts || 0) + 1;
      if (item.attempts > this.MAX_ATTEMPTS){
        try { console.warn('[PAY_QUEUE] giving up after', this.MAX_ATTEMPTS, 'attempts:', item.txId); } catch(e){}
        continue;
      }

      try {
        const res = await this._send(item, s);
        if (res && res.success){
          sentAny = true;
        } else if (res && (res.sessionInvalid || res.error && /session/i.test(res.error))){
          /* Session no longer valid — keep the item for next login. */
          remaining.push(item);
        } else {
          /* Server-side rejection (duplicate, no longer needed). Drop it. */
          try { console.info('[PAY_QUEUE] server rejected queued payment:', res && res.error); } catch(e){}
        }
      } catch (e){
        remaining.push(item);
      }
    }

    this.write(remaining);

    if (sentAny){
      try {
        const raw = JSON.parse(localStorage.getItem('abhyas_session') || 'null');
        if (raw){ delete raw.queued; localStorage.setItem('abhyas_session', JSON.stringify(raw)); }
        if (APP.session){ delete APP.session.queued; APP.saveSession(APP.session); }
      } catch(e){}
      if (typeof APP.toast === 'function') APP.toast('Queued payment sent.', 4000);
      if (typeof APP.loadPaymentStatus === 'function' && APP.mode === 'status'){
        try { APP.loadPaymentStatus(); } catch(e){}
      }
    }
  },

  async _send(item, session){
    const body = JSON.stringify({
      action: 'submitPayment',
      username: session.username, token: session.token,
      name: item.name || '', email: item.email || '', mobile: item.mobile || '',
      txId: item.txId || '', remarks: item.remarks || '',
      screenshot: item.screenshot || ''
    });
    const ctrl = ('AbortController' in window) ? new AbortController() : null;
    const timer = ctrl ? setTimeout(() => ctrl.abort(), 30000) : null;
    try {
      const r = await fetch(GAS_URL, {
        method: 'POST', headers: { 'Content-Type': 'text/plain' },
        body, signal: ctrl && ctrl.signal
      });
      if (timer) clearTimeout(timer);
      if (!r.ok) return { success: false, error: 'HTTP ' + r.status };
      const data = await r.json();
      if (data && data.sessionInvalid && typeof APP.clearSession === 'function') APP.clearSession();
      return data;
    } catch(e){
      if (timer) clearTimeout(timer);
      throw e;
    }
  }
};

const APP = {
  mode: 'login',
  online: (typeof navigator !== 'undefined' ? navigator.onLine : false),
  trialTimerId: null,
  fileData: null,
  session: null,
  settings: {},
  _gReady: false,
  _payRefreshTimer: null,
  _payBusy: false,
  _userSwitched: false,

  async init(){
    this.checkNet();
    /* v1.30: 30s — the connection dot does not need second-level accuracy. */
    setInterval(() => { if (!document.hidden) this.checkNet(); }, 30000);
    this.initGoogleSignIn();
    this.loadPublicPrice();
    this.bindForms();
    this.showStoredNotice();
    this._bootQueue();

    const params = new URLSearchParams(window.location.search);
    /* v1.32: the emailed link carries the token in the #fragment (never sent to servers or
       in Referer headers). The old ?query form is still accepted for links already sent. */
    const hashParams = new URLSearchParams((window.location.hash || '').replace(/^#/, ''));
    const urlToken = hashParams.get('resetToken') || hashParams.get('reset') || params.get('resetToken') || params.get('reset');
    if (urlToken) {
      history.replaceState(null, '', window.location.pathname);
      this.setMode('reset');
      const codeEl = $('rs-code');
      if (codeEl) codeEl.value = urlToken;
      return;
    }

    const saved = this.getSession();
    if (saved) {
      this.session = saved;
      if (saved.type === 'admin') { this.toast('Resuming your admin session…'); setTimeout(() => this.goAdmin(), 400); return; }
      if (saved.type === 'user')  { this._wantPay = params.get('pay') === '1'; this.resumeUserSession(saved); return; }
    }
    this.setMode('login');
  },

  /* Show the real price on the landing page instead of hiding it until the trial ends.
     v1.30: cache for 6 hours. The value changes roughly once a year; it
     was costing a full Apps Script round-trip on every visit, competing
     with the login POST for the same container. */
  async loadPublicPrice(){
    const KEY = 'abhyas_price_cache_v1';
    const TTL = 6 * 60 * 60 * 1000;
    let cached = null;
    try {
      const raw = localStorage.getItem(KEY);
      if (raw){ const c = JSON.parse(raw); if (c && c.at && Date.now() - c.at < TTL) cached = c; }
    } catch(e){}
    if (cached && cached.amount){
      const el = $('faq-price');
      if (el) el.textContent = 'Rs ' + cached.amount;
      return;
    }
    try {
      const r = await this.api('getSettings', {}, 'GET', 8000);
      const amt = r && r.success && r.settings && r.settings.paymentAmount;
      if (amt){
        const el = $('faq-price');
        if (el) el.textContent = 'Rs ' + amt;
        try { localStorage.setItem(KEY, JSON.stringify({ at: Date.now(), amount: amt })); } catch(e){}
      }
    } catch(e){}
  },

  /* If the app signed you out (for example the account was used on another
     device), say so instead of dropping you on a bare sign-in form. */
  showStoredNotice(){
    try {
      const n = localStorage.getItem('abhyas_notice');
      if (n) { localStorage.removeItem('abhyas_notice'); this.toast(n, 8000); }
    } catch(e){}
  },

  /* Real forms, so Enter submits and password managers behave. */
  bindForms(){
    const on = (id, fn) => { const f = $(id); if (f) f.addEventListener('submit', e => { e.preventDefault(); fn(); }); };
    on('form-login',  () => this.login());
    on('form-signup', () => this.signup());
    on('form-forgot', () => this.requestReset());
    on('form-reset',  () => this.confirmReset());
    ['in-user','in-pass','su-user','su-pass','fg-id','rs-code'].forEach(id => {
      const el = $(id);
      if (el) el.addEventListener('input', () => this.hideErr());
    });

    /* v1.30: silent warm-up. Fired on the first interaction with a field —
       the container is warm by the time Sign In is tapped. */
    ['in-user','in-pass','su-user','su-pass'].forEach(id => {
      const el = $(id);
      if (el) el.addEventListener('focus', () => this._warmBackend(), { once:true });
    });
  },

  /* ── Connection ─────────────────────────────────────────────────── */
  /* v1.30: three quick pings competing for the same single-threaded Apps
     Script container made the login POST look slower than it was. Now the
     ping skips if a request is already in flight, and the interval
     relaxed from 15 s to 30 s. */
  _netBusy: false,
  async checkNet(){
    if (this._netBusy) return;
    this._netBusy = true;
    try {
      const wasOnline = this.online;
      const dot = $('ndot'), txt = $('nstat');
      const startedAt = Date.now();
      this.online = await pingBackend(GAS_URL);
    const roundTrip = Date.now() - startedAt;

      if (this.online) {
        const slow = roundTrip > 3000;
        dot.className = slow ? 'ndot warn' : 'ndot';
        txt.textContent = slow ? 'Connected, but slow' : 'Connected';
        if (!wasOnline) { try { PAY_QUEUE.process().catch(() => {}); } catch(e){} }
        if (!wasOnline && this.mode === 'payment') this.loadPaymentUI();
        if (!wasOnline && navigator.serviceWorker && navigator.serviceWorker.controller) {
          navigator.serviceWorker.controller.postMessage({ type:'CLEAR_STALE_IF_ONLINE' });
        }
      } else {
        dot.className = 'ndot off';
        txt.textContent = this.session ? 'Offline — using your saved session' : 'No connection';
      }
      this.updatePayButtonState();
    } finally {
      this._netBusy = false;
    }
  },

  /* v1.28: the offline queue means the submit button must stay usable
     without a connection. While offline the label tells the student what
     will actually happen — the submission is saved on the device and sent
     automatically when the signal returns. `_payBusy` stops the periodic
     connection check from re-enabling the button while a submit is
     already in flight. */
  updatePayButtonState(){
    const btn = $('btn-pay');
    if (!btn || this._payBusy) return;
    btn.disabled = false;
    btn.textContent = this.online ? 'Send for verification' : 'Save & send later';
  },

  /* ── Session storage ────────────────────────────────────────────── */
  getSession(){
    try {
      const raw = localStorage.getItem(LS_USER);
      if (!raw) return null;
      const s = JSON.parse(raw);
      if (!s || !s.type || !s.username) return null;
      if (s.type === 'user' && (!s.access || typeof s.access !== 'object')) s.access = { level:'unknown' };
      return s;
    }
    catch(e){ try { localStorage.removeItem(LS_USER); } catch(_){} return null; }
  },
  saveSession(obj){ this.session = obj; try { localStorage.setItem(LS_USER, JSON.stringify(obj)); } catch(e){} },
  clearSession(){ this.session = null; try { localStorage.removeItem(LS_USER); } catch(e){} },
  saveAdminToken(username, adminToken, ttlMs){
    try {
      localStorage.setItem(LS_ADMIN, JSON.stringify({
        user: username, token: adminToken, expires: Date.now() + (ttlMs || 86400000)
      }));
    } catch(e){}
  },

  /* ── Mode switching ─────────────────────────────────────────────── */
  setMode(m){
    this.mode = m;
    document.documentElement.classList.remove('boot-session');

    const tabs = $('auth-tabs');
    if (tabs) {
      tabs.style.display = (m === 'login' || m === 'signup') ? 'flex' : 'none';
      tabs.querySelectorAll('.tab').forEach((t, i) => {
        const on = (m === 'login' && i === 0) || (m === 'signup' && i === 1);
        t.classList.toggle('active', on);
        t.setAttribute('aria-pressed', on ? 'true' : 'false');
      });
    }

    MODES.forEach(id => {
      const el = $('form-' + id);
      if (el) el.style.display = (id === m) ? 'block' : 'none';
    });

    const gWrap = $('g-signin-wrap');
    if (gWrap) gWrap.classList.toggle('g-hidden', !(this._gReady && (m === 'login' || m === 'signup')));

    this.hideErr();
    if (m !== 'trial') this.clearTrialTimer();

    if (m === 'payment') {
      this.loadPaymentUI();
      if (!this._payRefreshTimer) {
        this._payRefreshTimer = setInterval(() => {
          if (this.mode === 'payment' && this.online) this.loadPaymentUI();
        }, 20000);
      }
    } else if (this._payRefreshTimer) {
      clearInterval(this._payRefreshTimer);
      this._payRefreshTimer = null;
    }

    if (m === 'trial')   { this.renderMobilePrompt('mobile-prompt-trial'); this.renderVerifyPrompt(); }
    if (m === 'payment') this.renderMobilePrompt('mobile-prompt-pay');

    /* While a payment is with an admin, check quietly for the approval so
       the student doesn't have to sign out and back in to notice it. */
    if (m === 'status') this.startStatusPoll(); else this.stopStatusPoll();

    /* Only move focus when the person asked for the switch — never on
       the first paint, which would scroll a phone to the field and pop
       the keyboard before they've read anything. */
    if (this._userSwitched) {
      const first = $('form-' + m)?.querySelector('input:not([type=hidden])');
      const fine = !window.matchMedia || matchMedia('(pointer:fine)').matches;
      if (first && fine) setTimeout(() => first.focus(), 60);
    }
    this._userSwitched = true;
  },

  showErr(msg){ $('err-text').textContent = msg; $('err').classList.add('show'); },
  hideErr(){ $('err').classList.remove('show'); },

  /* ── Transport ──────────────────────────────────────────────────── */
  /* v1.30: warming ping. Fired the first time the student interacts with
     the login form. Cold-starts the Apps Script container while they are
     still typing, so the actual login POST lands on a warm worker instead
     of paying the 2-4s cold-start penalty. Silent, one-shot. */
  _warmed: false,
  _warmBackend(){
    if (this._warmed) return;
    this._warmed = true;
    try {
      fetch(GAS_URL + '?action=ping&_=' + Date.now(), { cache:'no-store', keepalive:true }).catch(() => {});
    } catch(e){}
  },

  /* Apps Script can hang for a long time on a poor connection, so every
     call carries its own deadline rather than leaving a button spinning
     forever. Credentials always go by POST — the backend rejects them in
     a query string, and a URL would end up in history and the request log. */
  async api(action, params = {}, method = 'POST', timeoutMs = 20000){
    const ctl = ('AbortController' in window) ? new AbortController() : null;
    const timer = ctl ? setTimeout(() => ctl.abort(), timeoutMs) : null;
    try {
      let r;
      if (method === 'GET') {
        const qs = new URLSearchParams(params).toString();
        r = await fetch(GAS_URL + '?action=' + action + (qs ? '&' + qs : ''),
                        { cache:'no-store', signal: ctl && ctl.signal });
      } else {
        r = await fetch(GAS_URL, {
          method:'POST', headers:{ 'Content-Type':'text/plain' },
          body: JSON.stringify({ action, ...params }),
          signal: ctl && ctl.signal
        });
      }
      if (!r.ok) return { success:false, error:'The server replied with an error (' + r.status + '). Try again in a moment.' };
      const data = await r.json();
      if (data && data.sessionInvalid) this.clearSession();
      return data;
    } catch(e){
      if (e && e.name === 'AbortError') {
        return { success:false, error:'That took too long. Check your connection and try again.' };
      }
      return { success:false, error: navigator.onLine
        ? 'Could not reach the server. Try again in a moment.'
        : 'You are offline. Reconnect and try again.' };
    } finally {
      if (timer) clearTimeout(timer);
    }
  },

  /* ── Google sign-in ─────────────────────────────────────────────── */
  initGoogleSignIn(){
    if (!GOOGLE_CLIENT_ID || GOOGLE_CLIENT_ID.startsWith('REPLACE_WITH_')) return;
    /* The client is ~150 KB of third-party JavaScript. It is fetched once the
       page has settled rather than competing with the first paint; tryInit()
       below already waits for window.google. */
    if (typeof GSI !== 'undefined') GSI.whenNeeded();
    let attempts = 0;
    const tryInit = () => {
      if (!window.google || !window.google.accounts || !window.google.accounts.id) {
        if (++attempts > 100) { console.warn('[APP] Google Identity Services never loaded.'); return; }
        setTimeout(tryInit, 200);
        return;
      }
      google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: r => this.onGoogleCredential(r),
        itp_support: true
      });
      const host = $('g-signin-btn');
      google.accounts.id.renderButton(host, {
        type:'standard', theme:'outline', size:'large', shape:'pill', width:280, text:'continue_with'
      });
      this._gReady = true;
      if (this.mode === 'login' || this.mode === 'signup') $('g-signin-wrap').classList.remove('g-hidden');

      setTimeout(() => {
        if (!host.hasChildNodes()) {
          console.warn('[APP] Google rendered nothing — check the origin whitelist for ' + window.location.origin);
          host.innerHTML = '<p class="t-foot" style="text-align:center">Google sign-in isn\u2019t available on this address. Use your username and password below.</p>';
        }
      }, 1200);
    };
    tryInit();
  },

  async onGoogleCredential(response){
    const wrap = $('g-signin-wrap');
    if (!response || !response.credential) return this.showErr('Google didn\u2019t return a sign-in token. Try again.');
    if (wrap) wrap.classList.add('g-busy');
    this.setLoading('btn-login', true);
    const res = await this.api('googleLogin', { idToken: response.credential }, 'POST');
    this.setLoading('btn-login', false);
    if (wrap) wrap.classList.remove('g-busy');
    if (!res.success) return this.showErr(res.error || 'Google sign-in failed.');
    this.toast('Signed in with Google');
    this.handleUserAuth(res);
  },

  /* ── Sign in ────────────────────────────────────────────────────── */
  async login(){
    const u = $('in-user').value.trim();
    const p = $('in-pass').value;
    if (!u || !p) return this.showErr('Enter your username and password.');
    if (u.length < 3) return this.showErr('That username is too short.');

    this.setLoading('btn-login', true);

    /* v1.30: if the POST has not returned within 1.6 s, tell the student
       we are still waiting on the server. Honest feedback beats a blank
       spinner, especially when the container is cold-starting. */
    const slowHint = setTimeout(() => {
      const b = $('btn-login');
      if (b && b.disabled) b.innerHTML = '<span class="spin"></span>Warming up…';
    }, 1600);

    const res = await this.api('login', { username:u, password:p }, 'POST');
    clearTimeout(slowHint);
    this.setLoading('btn-login', false);

    if (!res.success) return this.showErr(res.error || 'That username and password didn\u2019t match.');

    if (res.isAdmin) {
      this.saveAdminToken(u, res.adminToken, res.expiresInMs);

      /* The backend refuses every admin action until the starter password is
         replaced, so send them straight to the console that can do it. */
      if (res.mustChangePassword) {
        this.toast('Set a new admin password to carry on.', 5000);
        setTimeout(() => { window.location.href = 'admin.html'; }, 500);
        return;
      }

      /* Dual-role accounts land in the student app; the admin console is
         one tap away from inside it. */
      if (res.user && res.token) {
        const access = computeAccessLevel(res, res.user);
        this.saveSession({
          type:'user',
          username: res.user.username || u,
          name: res.user.name || '', email: res.user.email || '', mobile: res.user.mobile || '',
          token: res.token, access, settings: res.settings || {},
          lastVerified: Date.now(), adminCapable: true
        });
        this.toast('Signed in with admin access');
        setTimeout(() => { window.location.href = 'user.html'; }, 400);
        return;
      }

      this.toast('Welcome back');
      setTimeout(() => { window.location.href = 'admin.html'; }, 400);
      return;
    }

    this.handleUserAuth(res);
  },

  /* ── Password reset ─────────────────────────────────────────────── */
  async requestReset(){
    const id = $('fg-id').value.trim();
    if (!id) return this.showErr('Enter your username or email.');
    this.setLoading('btn-forgot', true);
    const res = await this.api('requestPasswordReset', { identifier:id }, 'POST');
    this.setLoading('btn-forgot', false);
    if (!res.success) return this.showErr(res.error || 'Something went wrong. Try again.');
    this.toast(res.message || 'If that account exists, a reset code is on its way to its email.', 6000);
    this.setMode('reset');
  },

  async confirmReset(){
    const code = $('rs-code').value.trim();
    const newPass = $('rs-pass').value;
    if (!code) return this.showErr('Paste the reset code from your email.');
    if (!newPass || newPass.length < 8) return this.showErr('Use at least 8 characters for the new password.');
    this.setLoading('btn-reset', true);
    const res = await this.api('resetPassword', { token:code, newPassword:newPass }, 'POST');
    this.setLoading('btn-reset', false);
    if (!res.success) return this.showErr(res.error || 'That reset code didn\u2019t work.');
    this.toast('Password changed — sign in with the new one.');
    $('rs-code').value = ''; $('rs-pass').value = '';
    this.setMode('login');
  },

  /* ── Create account ─────────────────────────────────────────────── */
  async signup(){
    const name = $('su-name').value.trim();
    const email = $('su-email').value.trim();
    const mobile = $('su-mobile').value.trim();
    const user = $('su-user').value.trim();
    const pass = $('su-pass').value;
    const cpass = $('su-cpass').value;

    const bad = (id, msg) => { const el = $(id); if (el) { el.classList.add('invalid'); el.focus(); } this.showErr(msg); };
    ['su-name','su-email','su-mobile','su-user','su-pass','su-cpass'].forEach(id => $(id).classList.remove('invalid'));

    if (!name || !email || !mobile || !user || !pass) return this.showErr('Fill in every field.');
    if (user.length < 3) return bad('su-user', 'Your username needs at least 3 characters.');
    if (pass.length < 8) return bad('su-pass', 'Your password needs at least 8 characters.');
    if (pass !== cpass)  return bad('su-cpass', 'The two passwords don\u2019t match.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return bad('su-email', 'That email address doesn\u2019t look right.');
    if (!/^(98|97|96|99)\d{8}$/.test(mobile)) return bad('su-mobile', 'Use a 10-digit Nepali mobile number starting 98, 97, 96 or 99.');

    this.setLoading('btn-signup', true);
    const res = await this.api('signup', { username:user, password:pass, name, email, mobile }, 'POST');
    this.setLoading('btn-signup', false);

    if (!res.success) return this.showErr(res.error || 'Couldn\u2019t create that account.');

    this.toast('Account created — your free trial has started.');
    this.saveSession({
      type:'user', username:user, name, email, mobile,
      token: res.token,
      access: { level:'trial', trialExpiresAt: res.trialExpiresAt, permanent:false },
      settings: {}, lastVerified: Date.now(),
      emailVerified: res.emailVerified === true
    });
    this.startTrialTimer(new Date(res.trialExpiresAt));
    this.setMode('trial');
    const vt = $('verify-text');
    if (vt) {
      vt.textContent = res.verificationEmailSent
        ? 'We sent a confirmation link to ' + email + '. Open it so you can reset your password later.'
        : 'Confirm your email address so you can reset your password later.';
    }
    this.renderVerifyPrompt();
  },

  /* ── Routing by access level ────────────────────────────────────── */
  handleUserAuth(res){
    const user = res.user || {};
    const access = computeAccessLevel(res, user);

    this.saveSession({
      type:'user',
      username: user.username || res.username,
      name: user.name, email: user.email, mobile: user.mobile || '',
      token: res.token, access, settings: res.settings || {},
      lastVerified: Date.now(), adminCapable: !!res.adminCapable,
      emailVerified: user.emailVerified !== false
    });

    if (access.level === 'permanent') {
      this.enterDashboard(user.name || user.username);
    } else if (access.level === 'trial') {
      this.startTrialTimer(new Date(access.trialExpiresAt));
      this.setMode('trial');
    } else if (access.level === 'expired') {
      this.settings = res.settings || {};
      $('pay-banner').style.display = 'flex';
      this.setMode('payment');
    } else if (access.level === 'pending_review') {
      this.setMode('status');
      this.loadPaymentStatus();
    } else {
      this.showErr(res.error || 'There\u2019s a problem with this account. Please contact the admin.');
    }
  },

  async loadPaymentStatus(){
    if (!this.session) return;

    /* Paint the default sent-state first, so the queued branch below can
       override it without leaving stale text on screen when it clears. */
    const titleEl = $('st-title');
    const iconEl  = $('st-icon');
    if (titleEl) titleEl.textContent = 'Payment sent';
    if (iconEl)  iconEl.innerHTML = '<i class="ph ph-clock-countdown"></i>';

    /* v1.28: if the last submission was queued offline, say so clearly
       until the server actually has a record. */
    const queued = this.session.queued;
    if (queued){
      const mine = PAY_QUEUE.forUser(this.session.username);
      if (mine.length){
        if (titleEl) titleEl.textContent = 'Payment saved';
        if (iconEl)  iconEl.innerHTML = '<i class="ph ph-cloud-slash"></i>';
        const msgEl = $('st-msg');
        if (msgEl){
          msgEl.innerHTML =
            'Your payment is saved on this device. It will be sent to the admin automatically as soon as you are back online.' +
            '<br><br>Transaction ID: <span class="mono">' + esc(queued.txId) + '</span>';
        }
        if (this.online) PAY_QUEUE.process().catch(() => {});
        return;
      }
    }

    if (!this.online) return;
    try {
      const res = await this.api('getPaymentStatus', { username:this.session.username, token:this.session.token }, 'POST');
      if (res.success && res.payment) {
        const p = res.payment;
        const when = p.submittedAt ? new Date(p.submittedAt).toLocaleString() : '';
        $('st-msg').textContent =
          'Transaction ' + p.txId + (when ? ', sent on ' + when : '') +
          '. An admin will check it and your access opens as soon as it\u2019s approved.' +
          ((this.session && this.session.settings && this.session.settings.paymentEta) ? ' Payments are usually checked ' + this.session.settings.paymentEta + '.' : '');
      }
    } catch(e){ console.warn('[APP] payment status poll failed:', e); }
  },

  async resumeUserSession(saved){
    const a = saved.access || {};

    if (a.level === 'permanent') {
      this.enterDashboard(saved.name || saved.username);
      this.syncSessionQuietly(saved);
      return;
    }
    if (a.level === 'trial' && a.trialExpiresAt) {
      const end = new Date(a.trialExpiresAt);
      if (end > Date.now()) {
        this.startTrialTimer(end);
        this.setMode('trial');
        if (this._wantPay) this.setMode('payment');
        this.syncSessionQuietly(saved);
        return;
      }
      saved.access.level = 'expired';
      this.saveSession(saved);
    }
    if (saved.access && saved.access.level === 'expired') {
      this.settings = saved.settings || {};
      $('pay-banner').style.display = 'flex';
      this.setMode('payment');
      return;
    }
    if (a.level === 'pending_review') {
      this.setMode('status');
      if (this.online) this.loadPaymentStatus();
      return;
    }

    if (!this.online) {
      this.showErr('You\u2019re offline, so we can\u2019t check your session. Reconnect and try again.');
      this.setMode('login');
      return;
    }
    const res = await this.api('checkSession', { token:saved.token, username:saved.username }, 'POST');
    if (!res.success) {
      this.clearSession();
      this.showErr('Your session expired. Please sign in again.');
      this.setMode('login');
      return;
    }
    this.handleUserAuth(res);
  },

  async syncSessionQuietly(saved){
    if (!this.online) return;
    try {
      const res = await this.api('checkSession', { token:saved.token, username:saved.username }, 'POST');
      if (!res.success || !res.user) return;
      const updated = { ...saved, access:{ ...saved.access }, mobile: res.user.mobile || saved.mobile, lastVerified: Date.now() };
      if ((res.permanentAccess || res.user.status === 'active') && saved.access.level !== 'permanent') {
        updated.access.level = 'permanent';
        updated.access.permanent = true;
        updated.access.accessType = res.accessType || updated.access.accessType;
        updated.access.accessExpiresAt = res.accessExpiresAt || '';
        this.saveSession(updated);
        this.enterDashboard(updated.name || updated.username);
      } else {
        this.saveSession(updated);
      }
    } catch(e){}
  },

  enterDashboard(displayName){
    const nameEl = $('redir-name');
    if (nameEl) nameEl.textContent = displayName ? ', ' + displayName : '';
    this.setMode('redirecting');
    setTimeout(() => { window.location.href = 'user.html'; }, 400);
  },

  /* ── Trial countdown ────────────────────────────────────────────── */
  startTrialTimer(end){
    this.clearTrialTimer();
    const el = $('trial-timer');
    const tick = () => {
      const diff = end - Date.now();
      if (diff <= 0) {
        el.textContent = '00:00:00';
        this.clearTrialTimer();
        if (this.session) { this.session.access.level = 'expired'; this.saveSession(this.session); }
        $('pay-banner').style.display = 'flex';
        this.setMode('payment');
        return;
      }
      /* The trial length is an admin setting, so it can exceed a day —
         "2d 05:14:09" reads better than "53:14:09". */
      const pad = n => String(n).padStart(2, '0');
      const days = Math.floor(diff / 86400000);
      const hours = days ? Math.floor((diff % 86400000) / 3600000) : Math.floor(diff / 3600000);
      el.textContent = (days ? days + 'd ' : '') + pad(hours) + ':' +
                       pad(Math.floor((diff % 3600000) / 60000)) + ':' +
                       pad(Math.floor((diff % 60000) / 1000));
    };
    tick();
    this.trialTimerId = setInterval(tick, 1000);
  },
  clearTrialTimer(){ if (this.trialTimerId) { clearInterval(this.trialTimerId); this.trialTimerId = null; } },

  /* ── Mobile number ──────────────────────────────────────────────── */
  renderMobilePrompt(elId){
    const el = $(elId);
    if (!el) return;
    el.style.display = (this.session && this.session.mobile) ? 'none' : 'flex';
  },
  async saveMobile(inputId){
    const mobile = $(inputId).value.trim();
    if (!/^(98|97|96|99)\d{8}$/.test(mobile)) return this.showErr('Use a 10-digit Nepali mobile number starting 98, 97, 96 or 99.');
    if (!this.session || !this.online) return this.showErr('You need a connection to save this.');
    const res = await this.api('updateOwnMobile', { username:this.session.username, token:this.session.token, mobile }, 'POST');
    if (!res.success) return this.showErr(res.error || 'Couldn\u2019t save that number.');
    this.session.mobile = mobile;
    this.saveSession(this.session);
    this.renderMobilePrompt('mobile-prompt-trial');
    this.renderMobilePrompt('mobile-prompt-pay');
    this.toast('Mobile number saved.');
  },

  /* ── Email verification ─────────────────────────────────────────── */
  renderVerifyPrompt(){
    const el = $('verify-banner');
    if (!el) return;
    const s = this.session;
    const unverified = !!(s && s.emailVerified === false);
    el.style.display = unverified ? 'flex' : 'none';
  },
  async resendVerification(){
    if (!this.session || !this.online) return this.showErr('You need a connection to send that again.');
    const btn = $('verify-resend');
    if (btn) { btn.disabled = true; btn.textContent = 'Sending…'; }
    const res = await this.api('resendVerification', { username:this.session.username, token:this.session.token });
    if (btn) { btn.disabled = false; btn.textContent = 'Send the link again'; }
    if (!res.success) return this.showErr(res.error || 'Could not send that email right now.');
    if (res.alreadyVerified) {
      this.session.emailVerified = true;
      this.saveSession(this.session);
      this.renderVerifyPrompt();
      return this.toast('Your email is already confirmed.');
    }
    this.toast('Sent — open the link in your inbox.', 5000);
  },

  /* ── Access refresh (payment awaiting review) ────────────────────── */
  startStatusPoll(){
    this.stopStatusPoll();
    this._statusTimer = setInterval(() => this.refreshAccess(true), 30000);
  },
  stopStatusPoll(){
    if (this._statusTimer) { clearInterval(this._statusTimer); this._statusTimer = null; }
  },
  async refreshAccess(quiet){
    if (!this.session || this.session.type !== 'user') return;
    if (!this.online) { if (!quiet) this.showErr('You are offline. Reconnect and try again.'); return; }
    const btn = $('btn-recheck');
    if (!quiet && btn) { btn.disabled = true; btn.innerHTML = '<span class="spin"></span>Checking…'; }
    const res = await this.api('checkSession', { token:this.session.token, username:this.session.username });
    if (!quiet && btn) { btn.disabled = false; btn.textContent = "Check if it's approved"; }
    if (!res.success) {
      if (res.sessionInvalid) {
        this.stopStatusPoll();
        this.showErr('Your session expired. Sign in again to pick up where you left off.');
        this.setMode('login');
        return;
      }
      if (!quiet) this.showErr(res.error || 'Could not check that right now.');
      return;
    }
    const access = computeAccessLevel(res, res.user || {});
    if (access.level === 'permanent') {
      this.stopStatusPoll();
      this.session.access = access;
      this.saveSession(this.session);
      this.toast('Payment approved — opening your dashboard.');
      this.enterDashboard(this.session.name || this.session.username);
      return;
    }
    if (access.level === 'expired') {
      this.session.access = access;
      this.saveSession(this.session);
      $('pay-banner').style.display = 'flex';
      this.setMode('payment');
      this.toast('That payment was not approved. Check the details and send it again.', 6000);
      return;
    }
    if (!quiet) this.toast('Still with the admin — we will open your dashboard as soon as it is approved.', 5000);
  },

  /* ── Payment ────────────────────────────────────────────────────── */
  async loadPaymentUI(){
    this.updatePayButtonState();
    let s = this.settings || {};
    let fetchFailed = false;

    if (this.online) {
      try {
        const r = await this.api('getSettings', {}, 'GET');   // public, no credentials
        if (r.success) s = r.settings || {};
        else { fetchFailed = true; console.warn('getSettings returned success:false —', r.error || '(no message)'); }
      } catch(e){ fetchFailed = true; console.warn('getSettings threw —', e); }
    }
    if (!Object.keys(s).length && this.session && this.session.settings) s = { ...this.session.settings };
    if (this.session) { this.session.settings = s; this.saveSession(this.session); }

    $('pay-amt').textContent = s.paymentAmount || '100';
    $('pay-phone').textContent = s.contactPhone || '9863200285';
    $('pay-inst').textContent = s.paymentInstructions || 'Scan the QR code, then send us the transaction ID below.';

    const qr = s.qrCodeUrl || '';
    const img = $('qr-img'), fb = $('qr-fallback');
    if (qr && (qr.startsWith('http') || qr.startsWith('data:image'))) {
      img.src = qr; img.style.display = 'block'; fb.style.display = 'none';
    } else {
      img.style.display = 'none'; fb.style.display = 'flex';
    }

    const warn = $('pay-settings-warn');
    if (warn) warn.style.display = (this.online && fetchFailed) ? 'flex' : 'none';
  },

  onQrError(){ $('qr-img').style.display = 'none'; $('qr-fallback').style.display = 'flex'; },

  /* The payment screenshot is shrunk on the phone (max 1600 px, JPEG) so it
     uploads quickly on a weak connection and never hits the size limit. */
  async onFile(){
    const input = $('pay-file'), nameEl = $('pay-file-name');
    const f = input.files[0];
    if (!f) { this.fileData = null; nameEl.textContent = 'No file chosen'; return; }
    nameEl.textContent = f.name;
    if (!/^image\//i.test(f.type || '')) {
      this.showErr('Please choose an image: a screenshot or a photo of the payment.');
      input.value = ''; nameEl.textContent = 'No file chosen'; this.fileData = null;
      return;
    }
    try {
      this.fileData = await this.shrinkImage(f, 1600, 0.82);
      nameEl.textContent = f.name + ' (ready to send)';
    } catch (e) {
      this.showErr('Could not read that image. Try a screenshot instead.');
      input.value = ''; nameEl.textContent = 'No file chosen'; this.fileData = null;
    }
  },
  shrinkImage(file, maxSide, quality){
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        let w = img.naturalWidth, h = img.naturalHeight;
        const sc = Math.min(1, maxSide / Math.max(w, h));
        w = Math.round(w * sc); h = Math.round(h * sc);
        const c = document.createElement('canvas');
        c.width = w; c.height = h;
        const cx = c.getContext('2d');
        cx.fillStyle = '#fff'; cx.fillRect(0, 0, w, h);
        cx.drawImage(img, 0, 0, w, h);
        URL.revokeObjectURL(url);
        const out = c.toDataURL('image/jpeg', quality);
        if (out.length > 6 * 1024 * 1024) reject(new Error('too large')); else resolve(out);
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('bad image')); };
      img.src = url;
    });
  },

  async submitPayment(){
    const txn = $('pay-txn').value.trim();
    const rem = $('pay-rem').value.trim();
    if (!txn) { $('pay-txn').classList.add('invalid'); $('pay-txn').focus(); return this.showErr('Enter the transaction ID from your payment.'); }
    $('pay-txn').classList.remove('invalid');
    if (!this.session || this.session.type !== 'user') return this.showErr('Something went wrong with your session. Please sign in again.');

    /* v1.28: offline → queue the submission instead of failing. The
       student keeps their transaction ID, remarks and screenshot, and
       the app posts it the moment the signal returns. */
    if (!this.online){
      const shotBytes = (this.fileData || '').length;
      if (shotBytes > PAY_QUEUE.MAX_SCREENSHOT_BYTES){
        return this.showErr('The screenshot is too large to queue offline. Reconnect and send it, or pick a smaller image.');
      }
      PAY_QUEUE.add({
        username: this.session.username,
        name: this.session.name || '',
        email: this.session.email || '',
        mobile: this.session.mobile || '',
        txId: txn, remarks: rem,
        screenshot: this.fileData || ''
      });
      this.session.access.level = 'pending_review';
      this.session.queued = { txId: txn, at: Date.now() };
      this.saveSession(this.session);
      this.toast('Saved on this device — it will send automatically.', 5000);
      this.setMode('status');
      /* Paint the status screen message before we have any server info. */
      setTimeout(() => { try { this.loadPaymentStatus(); } catch(e){} }, 50);
      return;
    }

    /* Guarded so the 30-second connection poll cannot re-enable the
       button while this fetch is still in flight. */
    this._payBusy = true;
    this.setLoading('btn-pay', true);
    const res = await this.api('submitPayment', {
      username: this.session.username, token: this.session.token,
      name: this.session.name, email: this.session.email, mobile: this.session.mobile,
      txId: txn, remarks: rem, screenshot: this.fileData || ''
    }, 'POST');
    this._payBusy = false;
    this.setLoading('btn-pay', false);

    if (!res.success) return this.showErr(res.error || 'Couldn\u2019t send that. Try again.');

    this.session.access.level = 'pending_review';
    this.saveSession(this.session);
    this.toast('Payment sent — an admin will check it shortly.');
    this.setMode('status');
  },

  /* ── Exits ──────────────────────────────────────────────────────── */
  goUser(){
    if (!this.session || this.session.type !== 'user') return this.showErr('Please sign in first.');
    const lvl = this.session.access.level;
    if (lvl !== 'permanent' && lvl !== 'trial') return this.showErr('Complete the payment, or wait for it to be verified.');
    if (lvl === 'trial' && new Date(this.session.access.trialExpiresAt) <= Date.now()) {
      this.session.access.level = 'expired';
      this.saveSession(this.session);
      this.showErr('Your trial has ended. Complete the payment to carry on.');
      this.setMode('payment');
      return;
    }
    window.location.href = 'user.html';
  },

  goAdmin(){
    if (!this.session || this.session.type !== 'admin') return this.showErr('That admin session is no longer valid.');
    window.location.href = 'admin.html';
  },

  logout(){
    this.clearTrialTimer();
    this.stopStatusPoll();
    this.clearSession();
    try { localStorage.removeItem(LS_ADMIN); } catch(e){}
    this.fileData = null;
    ['in-user','in-pass','su-name','su-mobile','su-email','su-user','su-pass','su-cpass',
     'pay-txn','pay-rem','pay-file','fg-id','rs-code','rs-pass','mp-trial-mobile','mp-pay-mobile']
      .forEach(id => { const el = $(id); if (el) el.value = ''; });
    const fn = $('pay-file-name'); if (fn) fn.textContent = 'No file chosen';
    this.setMode('login');
    this.toast('Logged out.');
  },

  /* v1.28: on boot, if a queued payment exists for the signed-in user,
     try to flush it, then update the payment screen banner. */
  _bootQueue(){
    try {
      PAY_QUEUE.paint();
      if (this.session && this.session.username){
        setTimeout(() => PAY_QUEUE.process().catch(() => {}), 800);
      }
    } catch(e){}
  },

  /* ── Chrome ─────────────────────────────────────────────────────── */
  LABELS: {
    'btn-login':'Sign in',
    'btn-signup':'Create my account',
    'btn-pay':'Send for verification',
    'btn-forgot':'Email me a code',
    'btn-reset':'Set the new password'
  },
  setLoading(id, on){
    const b = $(id);
    if (!b) return;
    if (on) { b.disabled = true; b.innerHTML = '<span class="spin"></span>Working…'; }
    else    { b.disabled = false; b.textContent = this.LABELS[id] || 'Submit'; this.updatePayButtonState(); }
  },

  toast(msg, durationMs = 3400){
    const box = $('toasts');
    const t = document.createElement('div');
    t.className = 'toast';
    t.textContent = msg;
    box.appendChild(t);
    setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 220); }, durationMs);
  }
};

/* Sample questions so a visitor can feel the app before signing up.

   Option order is shuffled on every render: a visitor who taps the first
   button three times in a row should not see three greens, or the demo
   teaches them the wrong thing about the app. `_order` maps the position
   the student sees to the index the answer key uses. */
const TRY_Q = {
  QS: [
    { q: 'Which of the following is the SI unit of dynamic viscosity?',
      o: ['Pa·s (N·s/m²)', 'm²/s', 'N/m', 'kg/m³'], a: 0,
      e: 'Dynamic viscosity is shear stress divided by velocity gradient, so its unit is Pa·s. The unit m²/s belongs to kinematic viscosity.' },
    { q: 'A simply supported beam of span L carries a uniformly distributed load w. The maximum bending moment is:',
      o: ['wL²/8', 'wL²/4', 'wL/2', 'wL²/12'], a: 0,
      e: 'The maximum moment occurs at mid-span and equals wL²/8. The maximum shear force is wL/2 at the supports.' },
    { q: 'The modulus of elasticity of mild steel is about:',
      o: ['200 GPa', '20 GPa', '2 GPa', '2000 GPa'], a: 0,
      e: 'Steel is about 2 × 10⁵ MPa (200 GPa). Concrete is far softer, roughly 25 to 30 GPa.' }
  ],
  i: -1,
  _order: null,
  next(){ this.i = (this.i + 1) % this.QS.length; this.render(); },
  render(){
    const c = this.QS[this.i];
    const q = $('try-q'), o = $('try-opts'), e = $('try-exp'), n = $('try-next');
    if (!q || !o) return;
    q.textContent = c.q; e.hidden = true; n.hidden = true; o.innerHTML = '';

    const order = c.o.map((_, k) => k);
    for (let k = order.length - 1; k > 0; k--){
      const j = Math.floor(Math.random() * (k + 1));
      [order[k], order[j]] = [order[j], order[k]];
    }
    this._order = order;

    order.forEach((origIdx, displayIdx) => {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'btn btn-sec';
      b.style.cssText = 'justify-content:flex-start;text-align:left;white-space:normal;margin-top:0';
      b.textContent = String.fromCharCode(65 + displayIdx) + '.  ' + c.o[origIdx];
      b.onclick = () => TRY_Q.pick(displayIdx);
      o.appendChild(b);
    });
  },
  pick(displayIdx){
    const c = this.QS[this.i];
    const order = this._order || c.o.map((_, k) => k);
    const correctDisplay = order.indexOf(c.a);
    Array.from($('try-opts').children).forEach((b, j) => {
      b.disabled = true;
      if (j === correctDisplay) { b.style.background = 'var(--success-soft)'; b.style.color = 'var(--success)'; }
      else if (j === displayIdx) { b.style.background = 'var(--danger-soft)'; b.style.color = 'var(--danger)'; }
    });
    const e = $('try-exp');
    e.textContent = (displayIdx === correctDisplay ? 'Correct. ' : 'Not quite. ') + c.e;
    e.hidden = false;
    $('try-next').hidden = false;
  }
};
TRY_Q.i = Math.floor(Math.random() * TRY_Q.QS.length) - 1;
TRY_Q.next();

const COOKIE_NOTICE = {
  KEY: 'abhyas_cookie_ack',
  init(){
    try { if (localStorage.getItem(this.KEY) === '1') return; } catch(e){ return; }
    $('cookie-banner').hidden = false;
    document.body.classList.add('cookie-open');
  },
  accept(){
    try { localStorage.setItem(this.KEY, '1'); } catch(e){}
    $('cookie-banner').hidden = true;
    document.body.classList.remove('cookie-open');
  }
};

COOKIE_NOTICE.init();
APP.init();
