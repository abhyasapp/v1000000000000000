'use strict';

/* The selection set is keyed on username, not payment id, because
   adminReviewPaymentsBatch accepts a list of usernames and the review
   flow is deliberately one-outstanding-payment-per-student. If the
   backend ever starts keeping multiple pending payments per student,
   this has to become a Set of payment ids and the batch endpoint has to
   change with it. */
const PAYMENTS = {
  selected: new Set(), _lastIdx: null, _rows: [], _t: null,
  _sortKey: 'submittedAt', _sortDir: -1,

  debouncedFilter(){ clearTimeout(this._t); this._t = setTimeout(() => this.filter(), 250); },
  filterBy(status){
    $('p-filter').value = status;
    FSTATE.set('p-filter', status);
    UI.nav('payments');
    this.filter();
  },
  sort(key){
    if (this._sortKey === key) this._sortDir *= -1;
    else { this._sortKey = key; this._sortDir = key === 'submittedAt' ? -1 : 1; }
    this.filter();
  },

  _visibleRows(){
    const q = ($('p-search').value || '').toLowerCase();
    const f = $('p-filter').value;
    const rows = (ADMIN.data.payments || []).filter(p => {
      const match = !q || (p.username || '').toLowerCase().includes(q) || (p.txId || '').toLowerCase().includes(q);
      return match && (f === 'all' || p.status === f);
    });
    const k = this._sortKey, d = this._sortDir;
    return rows.sort((a, b) => {
      if (k === 'submittedAt') return (new Date(a[k] || 0) - new Date(b[k] || 0)) * d;
      return String(a[k] || '').localeCompare(String(b[k] || '')) * d;
    });
  },

  filter(){
    this.selected.clear();
    const all = $('p-chk-all'); if (all) { all.checked = false; all.indeterminate = false; }
    FSTATE.set('p-filter', $('p-filter').value);
    FSTATE.set('p-search', $('p-search').value);
    this._lastIdx = null;
    ADMIN.state.pPage = 1;
    this._rows = this._visibleRows();
    this.renderPage(this._rows);
    this.updateBulkBar();
  },
  clearFilters(){
    $('p-search').value = ''; $('p-filter').value = 'all';
    FSTATE.set('p-search', ''); FSTATE.set('p-filter', 'all');
    this.filter();
  },
  render(){
    $('p-filter').value = FSTATE.get('p-filter', 'all');
    $('p-search').value = FSTATE.get('p-search', '');
    this._rows = this._visibleRows();
    this.renderPage(this._rows);
    this.updateBulkBar();
  },

  renderPage(rows){
    paintSort('payments-tbl', this._sortKey, this._sortDir);
    const trunc = $('p-trunc');
    if (trunc) trunc.innerHTML = ADMIN.data.paymentsTruncated
      ? '<div class="banner banner-warning"><i class="ph ph-warning"></i><span>Showing ' + ADMIN.data.payments.length + ' of ' + ADMIN.data.paymentsTotalCount + ' payments.</span></div>' : '';
    const count = $('p-result-count');
    if (count) count.textContent = rows.length === (ADMIN.data.payments || []).length ? plural(rows.length, 'payment') : plural(rows.length, 'match', 'matches');

    const per = ADMIN.state.pPerPage;
    const total = Math.ceil(rows.length / per) || 1;
    if (ADMIN.state.pPage > total) ADMIN.state.pPage = total;
    const page = rows.slice((ADMIN.state.pPage - 1) * per, ADMIN.state.pPage * per);
    const tb = $('payments-body');

    if (!page.length) {
      tb.innerHTML = '<tr><td colspan="7">' + ((ADMIN.data.payments || []).length
        ? '<div class="empty"><i class="ph ph-magnifying-glass"></i><div class="t">No payments match</div><div class="d">Try a different status, or search the transaction ID.</div>' +
          '<div class="a"><button class="btn btn-quiet" data-on-click="PAYMENTS.clearFilters()">Reset filters</button></div></div>'
        : '<div class="empty"><i class="ph ph-credit-card"></i><div class="t">No payments yet</div><div class="d">Transfers submitted from the app land here for review.</div></div>')
        + '</td></tr>';
      $('p-pg').innerHTML = '';
      return;
    }

    const canReview = ADMIN.can('payments_review');
    const amount = ADMIN.data.settings.paymentAmount || '100';
    tb.innerHTML = page.map(p => {
      const un = escAttrJs(p.username);
      const dup = p.duplicateTxId
        ? ' <span class="badge badge-warning flat" title="Also submitted by ' + escAttrJs((p.duplicateTxIdUsers || []).join(', ')) + '"><i class="ph ph-warning"></i> seen before</span>' : '';
      return '<tr class="' + (this.selected.has(p.username) ? 'selected' : '') + '">' +
        '<td class="td-check"><input type="checkbox"' + (this.selected.has(p.username) ? ' checked' : '') +
          ' data-on-click="PAYMENTS.toggle(\'' + un + '\', event)" aria-label="Select payment from ' + esc(p.username) + '"></td>' +
        '<td class="td-user"><button class="cell-user" data-on-click="PAYMENTS.review(\'' + un + '\')" style="text-align:left">' +
          '<span class="avatar">' + esc(initials(p.name || p.username)) + '</span>' +
          '<span style="min-width:0"><span class="nm truncate" style="display:block">' + esc(p.name || p.username) + '</span>' +
          '<span class="un truncate" style="display:block">' + esc(p.username) + '</span></span></button></td>' +
        '<td data-label="Transaction" class="mono t-foot">' + esc(p.txId) + dup + '</td>' +
        '<td data-label="Amount" class="mono t-foot">Rs ' + esc(amount) + '</td>' +
        '<td data-label="Status">' + badge(p.status || 'pending') + '</td>' +
        '<td data-label="Submitted"><span title="' + esc(fullTime(p.submittedAt)) + '">' + relTime(p.submittedAt) + '</span></td>' +
        '<td class="td-actions"><div class="row-actions">' +
          (p.status === 'pending' && canReview
            ? '<button class="btn btn-primary btn-sm" data-on-click="PAYMENTS.review(\'' + un + '\')">Review</button>'
            : '<button class="icon-btn sm" data-on-click="PAYMENTS.review(\'' + un + '\')" aria-label="Open payment from ' + esc(p.username) + '" title="Open"><i class="ph ph-arrow-right"></i></button>') +
          (canReview ? '<button class="icon-btn sm danger" data-on-click="PAYMENTS.del(\'' + un + '\')" aria-label="Delete payment record" title="Delete record"><i class="ph ph-trash"></i></button>' : '') +
        '</div></td></tr>';
    }).join('');
    PAGINATION.render('p-pg', ADMIN.state.pPage, total, 'PAYMENTS.goPage', rows.length);
  },
  goPage(p){ ADMIN.state.pPage = p; this.renderPage(this._rows); UI.scrollTop(); },

  toggle(username, event){
    if (event && event.shiftKey && this._lastIdx !== null) {
      const idx = this._rows.findIndex(r => r.username === username);
      if (idx !== -1) {
        const [lo, hi] = [Math.min(idx, this._lastIdx), Math.max(idx, this._lastIdx)];
        const adding = !this.selected.has(username);
        for (let i = lo; i <= hi; i++) adding ? this.selected.add(this._rows[i].username) : this.selected.delete(this._rows[i].username);
      }
    } else {
      this.selected.has(username) ? this.selected.delete(username) : this.selected.add(username);
    }
    this._lastIdx = this._rows.findIndex(r => r.username === username);
    this.renderPage(this._rows);
    this.updateBulkBar();
  },
  toggleAll(){
    const on = $('p-chk-all').checked;
    this._rows.forEach(p => on ? this.selected.add(p.username) : this.selected.delete(p.username));
    this.renderPage(this._rows);
    this.updateBulkBar();
  },
  updateBulkBar(){
    const n = this.selected.size;
    $('p-bulk-count').textContent = plural(n, 'payment') + ' selected';
    $('p-bulk').classList.toggle('show', n > 0);
    const all = $('p-chk-all');
    if (all) { all.checked = n > 0 && n === this._rows.length; all.indeterminate = n > 0 && n < this._rows.length; }
  },
  clearSelection(){ this.selected.clear(); this.renderPage(this._rows); this.updateBulkBar(); },

  async bulkVerify(){
    if (!this.selected.size) return;
    const ok = await CONFIRM.ask({
      title:'Verify payments',
      body:'Verify <b>' + plural(this.selected.size, 'payment') + '</b> and unlock permanent access for each student?',
      confirmText:'Verify all'
    });
    if (ok) this._bulkReview('verified');
  },
  async bulkReject(){
    if (!this.selected.size) return;
    const n = this.selected.size;
    MODAL.sheet('Reject ' + plural(n, 'payment'),
      '<div class="field"><label for="bulk-reason">Why are these being rejected?</label>' +
      '<input class="input" type="text" id="bulk-reason" placeholder="Students see this message"></div>' +
      '<div class="flex g2 mt4"><button class="btn btn-quiet" style="flex:1" data-on-click="MODAL.close(\'sheet\')">Cancel</button>' +
      '<button class="btn btn-danger" style="flex:1" data-on-click="PAYMENTS._bulkRejectGo()">Reject ' + n + '</button></div>',
      { wide:false });
  },
  _bulkRejectGo(){
    const reason = $('bulk-reason').value.trim();
    MODAL.close('sheet');
    this._bulkReview('rejected', reason);
  },
  async _bulkReview(status, reason){
    const usernames = [...this.selected];
    BUSY.start();
    try {
      const res = await ADMIN.post('adminReviewPaymentsBatch', { usernames: JSON.stringify(usernames), status, rejectionReason: reason || '' });
      if (!res.success) throw new Error(res.error || 'That did not work.');
      const good = res.results.filter(r => r.success).length;
      const bad = res.results.length - good;
      TOAST.show(good + ' ' + (status === 'verified' ? 'verified' : 'rejected') + (bad ? ', ' + bad + ' failed' : ''), bad ? 'warning' : 'success');
    } catch(e){ TOAST.show(e.message, 'error'); }
    BUSY.stop();
    this.selected.clear();
    ADMIN.refresh(['stats','payments','users']);
  },

  review(username){ MODAL.openReview(username); },

  async del(username){
    const ok = await CONFIRM.ask({
      title:'Delete payment record',
      body:'Delete the payment record for <b>' + esc(username) + '</b>? Their access is not changed.',
      confirmText:'Delete record', tone:'danger'
    });
    if (!ok) return;
    BUSY.start();
    try {
      const res = await ADMIN.post('adminDeletePayment', { username });
      if (!res.success) throw new Error(res.error);
      TOAST.show('Payment record deleted', 'success');
      ADMIN.refresh(['stats','payments']);
    } catch(e){ TOAST.show(e.message, 'error'); }
    BUSY.stop();
  }
};

MODAL.openReview = function(username){
  const p = (ADMIN.data.payments || []).find(x => x.username === username);
  if (!p) return;
  const un = escAttrJs(username);
  const settled = p.status !== 'pending';
  const canReview = ADMIN.can('payments_review');
  const amount = ADMIN.data.settings.paymentAmount || '100';

  $('tt-review').textContent = settled ? 'Payment from ' + p.username : 'Review payment';
  $('bd-review').innerHTML =
    (p.duplicateTxId
      ? '<div class="banner banner-warning"><i class="ph ph-warning"></i><span>This transaction ID was also submitted by <b>' +
        esc((p.duplicateTxIdUsers || []).join(', ')) + '</b>. Check the screenshot before verifying.</span></div>' : '') +
    '<div class="flex center g3 mb4"><span class="avatar lg">' + esc(initials(p.name || p.username)) + '</span>' +
      '<div><div class="t-t3">' + esc(p.name || p.username) + '</div><div class="t-cap mono">' + esc(p.username) + '</div></div>' +
      '<span style="margin-left:auto">' + badge(p.status || 'pending') + '</span></div>' +
    '<dl class="dl mb4">' +
      '<div><dt>Transaction ID</dt><dd class="mono">' + esc(p.txId) +
        '<button class="copy-btn" data-on-click="copyText(\'' + escAttrJs(p.txId) + '\',\'Transaction ID copied\')" aria-label="Copy transaction ID"><i class="ph ph-copy"></i></button></dd></div>' +
      '<div><dt>Amount</dt><dd class="mono">Rs ' + esc(amount) + '</dd></div>' +
      '<div><dt>Submitted</dt><dd>' + esc(fullTime(p.submittedAt)) + '</dd></div>' +
      '<div><dt>Remarks</dt><dd>' + (esc(p.remarks) || '—') + '</dd></div>' +
    '</dl>' +
    (p.screenshotUrl && p.screenshotUrl.startsWith('http')
      ? '<h4 class="t-cap mb2">Screenshot</h4>' +
        '<div id="rev-shot" class="mb2"><span class="inline-loader">Loading the screenshot</span></div>' +
        '<button class="btn btn-quiet btn-sm mb4" data-on-click="ADMIN.downloadScreenshot(\'' + escAttrJs(p.screenshotUrl) + '\',\'' + un + '_payment.png\')"><i class="ph ph-download-simple"></i> Download</button>'
      : '<p class="t-foot mb4">No screenshot was attached.</p>') +
    (settled || !canReview
      ? '<div class="flex g2"><button class="btn btn-quiet btn-block" data-on-click="MODAL.close(\'review\')">Close</button></div>'
      : '<div class="field"><label for="grant-duration">If verified, give them</label>' +
        '<select class="select" id="grant-duration"><option value="permanent">Permanent access</option><option value="year">One year</option></select></div>' +
        '<div class="field"><label for="rej-reason">If rejected, tell them why</label>' +
        '<input class="input" type="text" id="rej-reason" placeholder="Students see this message"></div>' +
        '<div class="flex g2 mt4">' +
          '<button class="btn btn-danger" style="flex:1" id="rev-reject" data-on-click="MODAL.confirmReview(\'' + un + '\',\'rejected\')"><i class="ph ph-x"></i> Reject</button>' +
          '<button class="btn btn-primary" style="flex:1" id="rev-verify" data-on-click="MODAL.confirmReview(\'' + un + '\',\'verified\')"><i class="ph ph-check"></i> Verify</button>' +
        '</div>');
  MODAL.open('review');
  if (p.screenshotUrl && p.screenshotUrl.startsWith('http')) {
    ADMIN.renderScreenshot('rev-shot', p.screenshotUrl, p.username);
  }
};

MODAL.confirmReview = async function(username, status){
  const reason = $('rej-reason')?.value || '';
  const duration = $('grant-duration')?.value || 'permanent';
  if (status === 'rejected' && !reason.trim()) {
    $('rej-reason').classList.add('invalid');
    $('rej-reason').focus();
    return TOAST.show('Give a reason — the student sees it', 'error');
  }
  if (status === 'verified') {
    const p = (ADMIN.data.payments || []).find(x => x.username === username);
    if (p && p.duplicateTxId) {
      const ok = await CONFIRM.ask({
        title:'Duplicate transaction ID',
        body:'This ID was also submitted by <b>' + esc((p.duplicateTxIdUsers || []).join(', ')) + '</b>. Verify anyway?',
        confirmText:'Verify anyway', tone:'danger'
      });
      if (!ok) return;
    }
  }
  const btn = $(status === 'verified' ? 'rev-verify' : 'rev-reject');
  btn.classList.add('loading');
  try {
    const res = await ADMIN.post('adminReviewPayment', { username, status, rejectionReason: reason });
    if (!res.success) throw new Error(res.error);
    if (status === 'verified' && duration === 'year') await ADMIN.post('adminGrantAccess', { username, duration:'year' });
    TOAST.show(status === 'verified'
      ? username + ' now has ' + (duration === 'year' ? 'one year of' : 'permanent') + ' access'
      : 'Payment rejected — ' + username + ' has been told why', 'success', 5000);
    MODAL.close('review');
    ADMIN.refresh(['stats','payments','users']);
  } catch(e){ TOAST.show(e.message, 'error'); }
  btn.classList.remove('loading');
};

const UI = {
  current: 'today',
  TITLES: ADMIN_NAV.TITLES,       /* defined once in js/core/admin-nav.js */
  FEATURES: ADMIN_NAV.FEATURES,
  _scroll: {},

  nav(id, opts = {}){
    const tabMap = { 'subj-qotd':'qotd', 'subj-exam':'exam', 'subj-add':'add' };
    let tab = null;
    if (tabMap[id]) { tab = tabMap[id]; id = 'subjective'; }

    const feat = this.FEATURES[id];
    const allowed = !feat || (Array.isArray(feat) ? feat.some(f => ADMIN.can(f)) : ADMIN.can(feat));
    if (!allowed) return TOAST.show('You do not have access to that section', 'warning');

    if (this.current) this._scroll[this.current] = window.scrollY;

    $$('.view').forEach(v => { v.classList.remove('on', 'animate'); });
    const view = $('view-' + id);
    if (view) { view.classList.add('on'); if (id !== this.current) view.classList.add('animate'); }

    $$('.rail-item').forEach(i => { i.classList.remove('active'); i.removeAttribute('aria-current'); });
    const navBtn = $('nav-' + id);
    if (navBtn) { navBtn.classList.add('active'); navBtn.setAttribute('aria-current', 'page'); }

    $('crumb').textContent = this.TITLES[id] || 'Abhyas';
    document.title = (this.TITLES[id] || 'Admin') + ' · Abhyas Admin';

    const prev = this.current;
    this.current = id;

    if (id === 'today') EXPIRING.load();
    if (id === 'dashboard') TRENDS.load();
    if (id === 'dashboard' && !MISSED.lastResults.length) MISSED.load();
    if (id === 'subjective') SUBJ_TABS.go(tab || SUBJ_TABS.current);
    if (id === 'admins') SUBJ_STORE.load();
    if (id === 'studydocs') STUDYDOCS.load();

    this.railClose();
    if (opts.keepScroll && prev === id) window.scrollTo(0, this._scroll[id] || 0);
    else window.scrollTo({ top: 0, behavior: 'auto' });
    $('content').focus({ preventScroll:true });
  },

  scrollTop(){ window.scrollTo({ top: 0, behavior:'smooth' }); },

  railOpen(){
    $('rail').classList.add('open');
    $('rail-scrim').classList.add('show');
    document.body.style.overflow = 'hidden';
    setTimeout(() => $('rail').querySelector('.rail-item')?.focus(), 60);
  },
  railClose(){
    $('rail').classList.remove('open');
    $('rail-scrim').classList.remove('show');
    if (!document.querySelector('.overlay.show') && !(window.PDFVIEW && PDFVIEW.isOpen())) document.body.style.overflow = '';
  },

  toggleMenu(e){
    e.stopPropagation();
    const m = $('account-menu');
    const open = m.classList.toggle('show');
    $('account-btn').setAttribute('aria-expanded', open ? 'true' : 'false');
  },
  closeMenu(){
    $('account-menu').classList.remove('show');
    $('account-btn').setAttribute('aria-expanded', 'false');
  }
};

$('gate-form').addEventListener('submit', e => { e.preventDefault(); ADMIN.login(); });
['ad-user','ad-pass'].forEach(id => $(id).addEventListener('input', () => ADMIN.hideErr()));

if (/Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent)) {
  $('kbd-hint').textContent = '⌘K';
  $$('.menu-item .kb').forEach(k => k.textContent = '⌘K');
}

document.addEventListener('click', e => {
  if (!e.target.closest('.menu-wrap')) UI.closeMenu();
  const picker = $('promote-results');
  if (picker && picker.classList.contains('show') && !e.target.closest('.picker')) picker.classList.remove('show');
});

document.addEventListener('keydown', e => {
  const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName);

  /* The reader owns the keyboard while it is open — Ctrl K would otherwise
     open the command palette behind it. */
  if (window.PDFVIEW && PDFVIEW.isOpen()) return;
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
    e.preventDefault();
    if ($('app').classList.contains('on')) PALETTE.open();
    return;
  }
  if (e.key === '/' && !typing && $('app').classList.contains('on')) {
    e.preventDefault(); PALETTE.open(); return;
  }
   if (e.key === 'Escape') {
    if ($('ov-confirm').classList.contains('show')) { CONFIRM._no(); return; }
    if ($('palette').classList.contains('show')) { PALETTE.close(); return; }
    UI.closeMenu();
    MODAL.closeAll();
    UI.railClose();
    return;
  }
  if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey) {
    if (e.key === 'r') { e.preventDefault(); ADMIN.refresh(); return; }
    const order = ['today','dashboard','users','payments','admins','weeklysets','subjective','qreports','logs'];
    const n = parseInt(e.key, 10);
    if (n >= 1 && n <= order.length) { e.preventDefault(); UI.nav(order[n - 1]); }
  }
});

/* While a paper is open for marking with unsaved ink, closing the tab or
   navigating away loses every stroke with no warning. Guard the close
   where the browser allows it; if the viewer does not expose an
   "unsaved" flag yet, err on the side of caution and guard whenever it
   is open in annotate mode. */
window.addEventListener('beforeunload', e => {
  if (!window.PDFVIEW || typeof PDFVIEW.isOpen !== 'function' || !PDFVIEW.isOpen()) return;
  const hasUnsaved = (typeof PDFVIEW.hasUnsavedMarks === 'function')
    ? PDFVIEW.hasUnsavedMarks()
    : (typeof PDFVIEW.isAnnotating === 'function' ? PDFVIEW.isAnnotating() : false);
  if (!hasUnsaved) return;
  e.preventDefault();
  e.returnValue = '';
});

/* Periodic refresh, scoped to the current view. Views not in the map do
   not auto-refresh — studydocs, subjective and data would each do heavy
   work every minute for no benefit, and the admin already has a manual
   Refresh button in the top bar. */
setInterval(() => {
  if (document.hidden || !ADMIN.creds) return;
  if (document.querySelector('.overlay.show, #palette.show') || (window.PDFVIEW && PDFVIEW.isOpen())) return;
  const scope = ({
    today:['stats'], dashboard:['stats'], users:['users'], payments:['payments'],
    admins:['admins'], weeklysets:['weeklysets'], qreports:['qreports'],
    logs:['logs'], settings:['settings']
  })[UI.current];
  if (scope) ADMIN.refresh(scope);
}, 60000);

setInterval(() => ADMIN.paintSync(), 30000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) ADMIN.paintSync(); });

(function(){
  try {
    const s = JSON.parse(localStorage.getItem(LS_USER) || 'null');
    const admin = (JSON.parse(localStorage.getItem(LS_ADMIN) || '{}').user || '').toLowerCase();
    if (s && s.type === 'user' && s.username && admin && s.username.toLowerCase() === admin) {
      $('rail-switch-label').textContent = 'Switch to student app';
    }
  } catch(e){}
})();

(function(){
  try {
    const el = $('rail-version');
    if (el) el.textContent = 'Abhyas V1' + (typeof APP_VERSION !== 'undefined' ? ' · v' + APP_VERSION : '');
  } catch(e){}
})();

(function(){
  const pill = $('offline-pill');
  let wasOffline = !navigator.onLine;
  function paint(){
    const off = !navigator.onLine;
    if (pill) pill.classList.toggle('show', off);
    if (off && !wasOffline) {
      TOAST.show('You\u2019re offline \u2014 showing the last synced data', 'warning', 4000);
    } else if (!off && wasOffline) {
      TOAST.show('Back online \u2014 refreshing', 'success');
      ADMIN.refresh(({
        today:['stats'], dashboard:['stats'], users:['users'], payments:['payments'],
        admins:['admins'], weeklysets:['weeklysets'], qreports:['qreports'],
        logs:['logs'], settings:['settings']
      })[UI.current]);
    }
    wasOffline = off;
  }
  window.addEventListener('online', paint);
  window.addEventListener('offline', paint);
  if (pill) pill.classList.toggle('show', !navigator.onLine);
})();

ADMIN.init();
