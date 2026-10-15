'use strict';

const MAINTENANCE = {
  async _run(label, action, params, toastFn){
    BUSY.start();
    try {
      const res = await ADMIN.post(action, params || {});
      if (!res.success) throw new Error(res.error || (label + ' failed.'));
      TOAST.show(toastFn(res), 'success', 5000);
      ADMIN.refresh(['logs']);
    } catch(e){ TOAST.show(e.message, 'error', 6000); }
    BUSY.stop();
  },
  async pruneOldBackups(){
    const days = parseInt($('maint-backup-days').value, 10);
    if (!days || days < 1) return TOAST.show('Enter a number of days to keep', 'error');
    const ok = await CONFIRM.ask({
      title:'Prune old backups',
      body:'Delete progress backups older than <b>' + days + '</b> day(s)? Anything newer stays.',
      confirmText:'Prune', tone:'danger'
    });
    if (ok) this._run('Prune', 'adminPruneOldBackups', { daysToKeep: days },
      r => 'Pruned ' + plural(r.deleted, 'backup row') + ', kept the last ' + r.daysToKeep + ' days');
  },
  async clearAllBackups(){
    const ok = await CONFIRM.ask({
      title:'Delete all progress backups',
      body:'This permanently deletes <b>every</b> progress backup. There is no undo.',
      confirmText:'Delete all', tone:'danger', requireType:'DELETE'
    });
    if (ok) this._run('Delete', 'adminClearProgressBackups', {}, r => 'Deleted ' + plural(r.deleted, 'backup row'));
  },
  async trimLogs(){
    const keep = parseInt($('maint-logs-keep').value, 10);
    if (!keep || keep < 100) return TOAST.show('Keep at least 100 rows', 'error');
    const ok = await CONFIRM.ask({
      title:'Trim the activity log',
      body:'Keep only the most recent <b>' + keep + '</b> rows and delete everything older?',
      confirmText:'Trim', tone:'danger'
    });
    if (ok) this._run('Trim', 'adminTrimLogs', { keepLast: keep },
      r => 'Trimmed ' + plural(r.deleted, 'row') + ', kept ' + r.kept);
  },
  async revokeScreenshotSharing(){
    const ok = await CONFIRM.ask({
      title:'Make screenshots private',
      body:'Remove the public Drive link from every payment screenshot. This console can still open them.',
      confirmText:'Make private', tone:'danger'
    });
    if (ok) this._run('Revoke', 'adminRevokeScreenshotSharing', {}, r => {
      const parts = [r.revoked + ' made private', r.alreadyPrivate + ' already private'];
      if (r.failed) parts.push(r.failed + ' failed');
      return parts.join(', ');
    });
  }
};

const CHAPTERS = {
  _map: null, _levels: null,
  _build(){
    if (this._map) return;
    this._map = new Map(); this._levels = new Set();
    if (typeof ChapterData !== 'undefined') {
      ChapterData.allFileRefs().forEach(ref => {
        const level = ChapterData.levelLabel(ref.lv);
        const chapter = ChapterData.chapterName(ref.lv, ref.ch);
        this._map.set(ref.fid, { level, chapter, label: level + ' — ' + chapter });
        this._levels.add(level);
      });
    }
  },
  labelFor(fileId){
    this._build();
    return this._map.get(fileId)?.label || (fileId === 'local' ? 'Local file' : 'Weekly set or unknown');
  },
  allLevels(){ this._build(); return [...this._levels].sort(); },
  allChapters(){ this._build(); return [...new Set([...this._map.values()].map(v => v.chapter))].sort(); }
};

/* At most 4 file requests at once: 100 parallel getFile calls exceeded the
   Apps Script concurrency limit and the global rate limit. */
const TRENDS = {
  async load(){
    const box = $('trend-panel');
    if (!box) return;
    try {
      const r = await ADMIN.post('adminTrends', { days: 30 });
      if (!r.success) throw new Error(r.error || 'Could not load.');
      const t = r.totals;
      const max = Math.max(1, ...r.series.map(d => Math.max(d.signups, d.paid)));
      const bars = key => r.series.map(d =>
        '<span title="' + esc(d.date) + ': ' + d[key] + '" style="flex:1;min-width:3px;height:' + Math.max(2, Math.round(d[key] / max * 56)) +
        'px;background:' + (key === 'paid' ? 'var(--accent)' : 'var(--info)') + ';border-radius:2px 2px 0 0"></span>').join('');
      const chart = (label, key, sum) =>
        '<div class="mb3"><div class="flex between center mb2"><span class="t-callout" style="color:var(--ink);font-weight:600">' + label + '</span>' +
        '<span class="t-cap mono">' + sum + ' in 30 days</span></div>' +
        '<div style="display:flex;align-items:flex-end;gap:2px;height:60px">' + bars(key) + '</div></div>';
      box.innerHTML =
        '<div class="metrics mb4">' +
          '<div class="metric"><div class="v">' + t.paidRate + '%</div><div class="l">Of all students have paid</div></div>' +
          '<div class="metric"><div class="v">' + t.awaiting + '</div><div class="l">Payments waiting for you</div></div>' +
          '<div class="metric"><div class="v">' + t.notPaid + '</div><div class="l">Expired, not paid</div></div>' +
          '<div class="metric"><div class="v">Rs ' + Number(t.revenueEstimate).toLocaleString() + '</div><div class="l">Estimated at Rs ' + t.amount + ' each</div></div>' +
        '</div>' +
        chart('New students per day', 'signups', t.periodSignups) +
        chart('Payments approved per day', 'paid', t.periodPaid) +
        (t.notPaid ? '<div class="flex g2 wrap center"><span class="t-foot">' + plural(t.notPaid, 'student') + ' finished the trial without paying. A short message can win some back.</span>' +
          '<button class="btn btn-secondary btn-sm" data-on-click="USERS.filterBy(\'expired\')">See them</button></div>' : '');
    } catch(e){
      box.innerHTML = '<div class="banner banner-danger"><i class="ph ph-warning-circle"></i><span>' + esc(e.message) +
        ' <button class="btn btn-sm btn-quiet" style="margin-left:.5rem" data-on-click="TRENDS.load()">Try again</button></span></div>';
    }
  }
};

const _gate = (() => {
  let active = 0;
  const q = [];
  const MAX = 4;
  const next = () => {
    if (active >= MAX || !q.length) return;
    active++;
    const job = q.shift();
    Promise.resolve().then(job.fn).then(job.res, job.rej).finally(() => { active--; next(); });
  };
  return fn => new Promise((res, rej) => { q.push({ fn, res, rej }); next(); });
})();

const MISSED = {
  lastResults: [], _built: false,
  _buildFilters(){
    if (this._built) return;
    this._built = true;
    CHAPTERS.allLevels().forEach(l => $('miss-level').insertAdjacentHTML('beforeend', '<option value="' + escAttrJs(l) + '">' + esc(l) + '</option>'));
    CHAPTERS.allChapters().forEach(c => $('miss-chapter').insertAdjacentHTML('beforeend', '<option value="' + escAttrJs(c) + '">' + esc(c) + '</option>'));
  },
  clearFilters(){
    ['miss-level','miss-chapter','miss-from','miss-to'].forEach(id => $(id).value = '');
    $('miss-min').value = '3'; $('miss-limit').value = '20';
    this.load();
  },
  async load(){
    this._buildFilters();
    const box = $('missed-list');
    box.innerHTML = '<div class="sk-block"><div class="skeleton sk-80"></div><div class="skeleton sk-40"></div></div>' +
                    '<div class="sk-block"><div class="skeleton sk-60"></div><div class="skeleton sk-40"></div></div>';
    const params = {
      level: $('miss-level').value, chapter: $('miss-chapter').value,
      dateFrom: $('miss-from').value, dateTo: $('miss-to').value,
      minAttempts: $('miss-min').value || 3, limit: $('miss-limit').value || 20
    };
    try {
      const res = await ADMIN.post('adminMostMissedQuestions', params);
      if (!res.success) throw new Error(res.error || 'Could not load.');
      this.lastResults = res.results;
      const trunc = res.truncated
        ? '<div class="banner banner-warning"><i class="ph ph-warning"></i><span>Partial results — scanned ' + res.totalRowsScanned + ' of ' + res.totalRowsAvailable + ' progress rows.</span></div>'
        : '';
      if (!res.results.length) {
        box.innerHTML = trunc + '<div class="empty"><i class="ph ph-target"></i><div class="t">Nothing matches yet</div>' +
          '<div class="d">Widen the date range or lower the minimum attempts.</div>' +
          '<div class="a"><button class="btn btn-quiet" data-on-click="MISSED.clearFilters()">Reset filters</button></div></div>';
        return;
      }
      const cache = {};
      await Promise.all([...new Set(res.results.map(r => r.fileId))].map(async fid => {
        try {
          const f = await _gate(() => ADMIN.post('getFile', { fileId: fid }));
          if (f.success) {
            const raw = f.result;
            cache[fid] = Array.isArray(raw) ? raw : (raw?.questions || raw?.data || raw?.quiz || raw?.items || []);
          }
        } catch(e){}
      }));
      box.innerHTML = trunc + res.results.map(r => {
        const qs = cache[r.fileId];
        const q = (qs && r.index != null) ? qs[r.index] : null;
        const text = q ? (q.q || q.question || q.Question || q.stem || q.ques || q.text) : null;
        const chapter = r.chapter || CHAPTERS.labelFor(r.fileId);
        return '<div class="miss">' +
          '<div class="miss-top">' +
            '<div class="miss-q">' + (text ? esc(String(text).slice(0, 240)) : '<span class="mono dim">' + esc(r.uid) + '</span>') + '</div>' +
            '<div class="miss-rate"><div class="v">' + r.wrongRate + '%</div><div class="l">' + r.wrong + ' of ' + r.total + ' wrong</div></div>' +
          '</div>' +
          '<div class="miss-tags">' +
            (r.level ? '<span class="badge flat">' + esc(r.level) + '</span>' : '') +
            (chapter ? '<span class="badge flat">' + esc(chapter) + '</span>' : '') +
          '</div>' +
          '<div class="miss-meta"><span>' + plural(r.uniqueStudents ?? 0, 'student') + '</span>' +
          '<span>' + (r.accuracy ?? (100 - r.wrongRate)) + '% accuracy</span></div>' +
        '</div>';
      }).join('');
    } catch(e){
      box.innerHTML = '<div class="banner banner-danger"><i class="ph ph-warning-circle"></i><span>' + esc(e.message) + '</span></div>';
    }
  },
  exportCSV(){
    if (!this.lastResults.length) return TOAST.show('Load the list first', 'warning');
    ADMIN.downloadCSV(ADMIN.toCSV(
      ['UID','Level','Chapter','Wrong','Total','Wrong %','Accuracy %','Students'],
      this.lastResults.map(r => [r.uid, r.level || '', r.chapter || '', r.wrong, r.total, r.wrongRate, r.accuracy, r.uniqueStudents])
    ), 'most_missed_questions.csv');
  }
};

const WEEKLYSETS = {
  list: [], uploadedFileId: '', _lastResults: null,

  openCreate(){
    MODAL.sheet('Schedule a weekly set',
      '<div class="field"><label for="ws-title">Title</label>' +
        '<input class="input" type="text" id="ws-title" placeholder="Week 12 — Structural analysis"></div>' +
      '<div class="field"><span class="field-label">Question file</span>' +
        '<label class="file-drop" for="ws-file">' +
          '<input type="file" id="ws-file" accept="application/json,.json" data-on-change="WEEKLYSETS.onFilePicked()">' +
          '<i class="ph ph-file-arrow-up fd-icon"></i>' +
          '<span class="fd-main" id="ws-file-name">Choose a .json question bank</span>' +
          '<span class="fd-sub">Uploads to Drive straight away · under 4 MB</span>' +
        '</label>' +
        '<div class="t-foot mt2" id="ws-upload-status" aria-live="polite"></div>' +
      '</div>' +
      '<details class="mb4"><summary class="t-foot" style="cursor:pointer">Already on Drive? Paste the file ID instead</summary>' +
        '<input class="input mt2" type="text" id="ws-fileid" placeholder="Drive file ID"></details>' +
      '<div class="field"><label for="ws-chapter">Chapter label <span class="dim">(optional)</span></label>' +
        '<input class="input" type="text" id="ws-chapter" placeholder="Structural engineering"></div>' +
      '<div class="field"><label for="ws-release">Unlocks at</label>' +
        '<input class="input" type="datetime-local" id="ws-release">' +
        '<button type="button" class="btn btn-quiet btn-sm mt2" style="align-self:flex-start" data-on-click="WEEKLYSETS.fillNextWednesday()"><i class="ph ph-calendar-plus"></i> Next Wednesday, 8 am</button></div>' +
      '<div class="flex g2 mt4 wrap">' +
        '<button class="btn btn-secondary" data-on-click="WEEKLYSETS.preview(document.getElementById(\'ws-fileid\').value.trim(), document.getElementById(\'ws-title\').value.trim())"><i class="ph ph-eye"></i> Preview questions</button>' +
        '<button class="btn btn-primary grow" id="ws-create" data-on-click="WEEKLYSETS.create()">Schedule set</button>' +
      '</div>'
    );
  },

  fillNextWednesday(){
    const now = new Date();
    let days = (3 - now.getDay() + 7) % 7;
    if (days === 0) days = 7;
    const t = new Date(now.getFullYear(), now.getMonth(), now.getDate() + days, 8, 0, 0);
    const p = n => String(n).padStart(2, '0');
    $('ws-release').value = t.getFullYear() + '-' + p(t.getMonth() + 1) + '-' + p(t.getDate()) + 'T' + p(t.getHours()) + ':' + p(t.getMinutes());
  },

  async onFilePicked(){
    const input = $('ws-file'), status = $('ws-upload-status'), nameEl = $('ws-file-name');
    const file = input.files && input.files[0];
    if (!file) return;
    nameEl.textContent = file.name;
    if (file.size > 5 * 1024 * 1024) {
      status.innerHTML = '<span style="color:var(--danger)">That file is ' + (file.size / 1048576).toFixed(1) + ' MB — keep it under 4 MB.</span>';
      input.value = ''; nameEl.textContent = 'Choose a .json question bank';
      return;
    }
    status.innerHTML = '<span class="inline-loader">Uploading to Drive</span>';
    try {
      const dataUrl = await new Promise((res, rej) => {
        const r = new FileReader();
        r.onload = () => res(r.result);
        r.onerror = () => rej(new Error('Could not read that file.'));
        r.readAsDataURL(file);
      });
      const r = await ADMIN.post('adminUploadWeeklySetFile', { fileData: dataUrl, filename: file.name });
      if (!r.success) throw new Error(r.error || 'Upload failed.');
      this.uploadedFileId = r.fileId;
      $('ws-fileid').value = r.fileId;
      status.innerHTML = '<span style="color:var(--success)">Uploaded · file ID ' + esc(r.fileId) + '</span>';
    } catch(e){
      status.innerHTML = '<span style="color:var(--danger)">' + esc(e.message) + '</span>';
      input.value = '';
    }
  },

  render(sets){
    this.list = sets || [];
    const box = $('weeklysets-list');
    if (!box) return;
    const trunc = $('ws-trunc');
    if (trunc) trunc.innerHTML = ADMIN.data.weeklysetsTruncated
      ? '<div class="banner banner-warning"><i class="ph ph-warning"></i><span>Showing ' + this.list.length + ' of ' + ADMIN.data.weeklysetsTotalCount + ' sets.</span></div>' : '';

    if (!this.list.length) {
      box.innerHTML = '<div class="empty"><i class="ph ph-calendar-blank"></i><div class="t">No weekly sets yet</div>' +
        '<div class="d">Schedule one and it unlocks for every student at the time you choose.</div>' +
        '<div class="a"><button class="btn btn-primary" data-perm="weeklysets_manage" data-on-click="WEEKLYSETS.openCreate()">Schedule a set</button></div></div>';
      return;
    }
    const now = Date.now();
    const canManage = ADMIN.can('weeklysets_manage');
    box.innerHTML = '<div class="rows">' + this.list.map(s => {
      const rel = new Date(s.releaseAt).getTime();
      const released = !isNaN(rel) && now >= rel;
      const archived = s.status === 'archived';
      const st = archived ? 'archived' : (released ? 'live' : 'scheduled');
      return '<div class="row">' +
        '<div class="row-main"><div class="row-title">' + esc(s.title) + badge(st) + '</div>' +
        '<div class="row-sub">' + (s.chapterLabel ? esc(s.chapterLabel) + ' · ' : '') +
          (released ? 'Released ' : 'Unlocks ') + esc(fullTime(s.releaseAt)) + '</div></div>' +
        '<div class="row-actions">' +
          '<button class="icon-btn sm" data-on-click="WEEKLYSETS.showResults(\'' + escAttrJs(s.id) + '\',\'' + escAttrJs(s.title) + '\')" aria-label="Results for ' + esc(s.title) + '" title="Results"><i class="ph ph-chart-bar"></i></button>' +
          '<button class="icon-btn sm" data-on-click="WEEKLYSETS.preview(\'' + escAttrJs(s.fileId) + '\',\'' + escAttrJs(s.title) + '\')" aria-label="Preview ' + esc(s.title) + '" title="Preview"><i class="ph ph-eye"></i></button>' +
          (canManage ? (archived
            ? '<button class="icon-btn sm" data-on-click="WEEKLYSETS.setStatus(\'' + escAttrJs(s.id) + '\',\'active\')" aria-label="Restore" title="Restore"><i class="ph ph-arrow-counter-clockwise"></i></button>'
            : '<button class="icon-btn sm" data-on-click="WEEKLYSETS.setStatus(\'' + escAttrJs(s.id) + '\',\'archived\')" aria-label="Archive" title="Archive"><i class="ph ph-archive"></i></button>') : '') +
          (canManage ? '<button class="icon-btn sm danger" data-on-click="WEEKLYSETS.del(\'' + escAttrJs(s.id) + '\',\'' + escAttrJs(s.title) + '\')" aria-label="Delete ' + esc(s.title) + '" title="Delete"><i class="ph ph-trash"></i></button>' : '') +
        '</div></div>';
    }).join('') + '</div>';
  },

  async preview(fileId, title){
    if (!fileId) return TOAST.show('Upload a file or paste a file ID first', 'warning');
    MODAL.sheet('Preview: ' + (title || fileId), '<div class="skeleton sk-100"></div><div class="skeleton sk-80"></div><div class="skeleton sk-60"></div>');
    try {
      const res = await ADMIN.post('getFile', { fileId });
      if (!res.success) throw new Error(res.error || 'Could not open that file.');
      const raw = res.result;
      const qs = Array.isArray(raw) ? raw : (raw?.questions || raw?.data || raw?.quiz || raw?.items || []);
      if (!Array.isArray(qs) || !qs.length) {
        $('bd-sheet').innerHTML = '<div class="banner banner-warning"><i class="ph ph-warning"></i><span>No questions found in that file.</span></div>';
        return;
      }
      $('bd-sheet').innerHTML =
        '<p class="t-callout mb4"><b>' + qs.length + '</b> questions found. Showing the first ' + Math.min(5, qs.length) + '.</p>' +
        '<div class="stack2">' + qs.slice(0, 5).map((q, i) => {
          const text = q.q || q.question || q.stem || '(no text)';
          const opts = q.options || q.opts || q.choices || [];
          return '<div class="sub-card"><div class="t-callout" style="font-weight:600">' + (i + 1) + '. ' + esc(String(text).slice(0, 220)) + '</div>' +
            (Array.isArray(opts) && opts.length ? '<div class="t-foot mt2">' + opts.map((o, oi) => String.fromCharCode(65 + oi) + ') ' + esc(String(o))).join('  ·  ') + '</div>' : '') +
          '</div>';
        }).join('') + '</div>';
    } catch(e){
      $('bd-sheet').innerHTML = '<div class="banner banner-danger"><i class="ph ph-warning-circle"></i><span>' + esc(e.message) + '</span></div>';
    }
  },

  async showResults(id, title){
    MODAL.sheet('Results: ' + (title || id), '<div class="skeleton sk-100"></div><div class="skeleton sk-80"></div><div class="skeleton sk-60"></div>');
    try {
      const res = await ADMIN.post('adminWeeklySetResults', { weeklyId: id });
      if (!res.success) throw new Error(res.error || 'Could not load results.');
      this._lastResults = res;
      if (!res.attempts) {
        $('bd-sheet').innerHTML = '<div class="empty"><i class="ph ph-chart-bar"></i><div class="t">No attempts yet</div>' +
          '<div class="d">Results appear here once students sit this set.</div></div>';
        return;
      }
      const max = Math.max(...res.distribution.map(b => b.count), 1);
      $('bd-sheet').innerHTML =
        (res.rescored ? '' : '<div class="banner banner-warning"><i class="ph ph-warning"></i><span>The source file could not be read, so these scores are as reported by each device.</span></div>') +
        '<dl class="dl mb4">' +
          '<div><dt>Attempts</dt><dd class="mono">' + res.attempts + '</dd></div>' +
          '<div><dt>Average</dt><dd class="mono" style="color:var(--accent);font-weight:700">' + res.avgPct + '%</dd></div>' +
          '<div><dt>Range</dt><dd class="mono">' + res.minPct + '–' + res.maxPct + '% (σ ' + res.stdDev + ')</dd></div>' +
          '<div><dt>Students</dt><dd class="mono">' + res.uniqueStudents + '</dd></div>' +
        '</dl>' +
        '<h4 class="t-cap mb2">Score spread</h4><div class="mb4">' +
        res.distribution.map(b =>
          '<div class="dist"><span class="rg">' + b.range + '%</span>' +
          '<span class="track"><span class="fill" style="width:' + ((b.count / max) * 100) + '%"></span></span>' +
          '<span class="ct">' + b.count + '</span></div>').join('') + '</div>' +
        '<h4 class="t-cap mb2">Recent attempts</h4>' +
        '<div class="rows">' + res.recent.map(r =>
          '<div class="row"><div class="row-main"><div class="row-title mono">' + esc(r.username) + '</div>' +
          '<div class="row-sub">' + (r.durationSec ? Math.round(r.durationSec / 60) + ' min · ' : '') + relTime(r.submittedAt) + '</div></div>' +
          badge(r.pct >= 70 ? 'graded' : r.pct >= 40 ? 'pending' : 'rejected', r.pct + '%') +
          '<span class="t-cap mono">' + r.correct + '/' + r.total + '</span></div>').join('') + '</div>' +
        '<div class="flex mt4" style="justify-content:flex-end"><button class="btn btn-secondary btn-sm" data-on-click="WEEKLYSETS.exportResults()"><i class="ph ph-download-simple"></i> Export CSV</button></div>';
    } catch(e){
      $('bd-sheet').innerHTML = '<div class="banner banner-danger"><i class="ph ph-warning-circle"></i><span>' + esc(e.message) + '</span></div>';
    }
  },

  exportResults(){
    const r = this._lastResults;
    if (!r?.recent?.length) return TOAST.show('Nothing to export', 'warning');
    ADMIN.downloadCSV(ADMIN.toCSV(
      ['Username','Score %','Correct','Total','Skipped','Wrong','Duration (s)','Submitted'],
      r.recent.map(a => [a.username, a.pct, a.correct, a.total, a.skipped, a.wrong, a.durationSec, a.submittedAt ? new Date(a.submittedAt).toISOString() : ''])
    ), 'weekly_' + r.weeklyId + '_results.csv');
  },

  async create(){
    const title = $('ws-title').value.trim();
    const fileId = $('ws-fileid').value.trim() || this.uploadedFileId;
    const chapterLabel = $('ws-chapter').value.trim();
    const releaseLocal = $('ws-release').value;
    if (!title) return TOAST.show('Give the set a title', 'error');
    if (!fileId) return TOAST.show('Upload a question file first', 'error');
    if (!releaseLocal) return TOAST.show('Choose when it unlocks', 'error');
    const releaseAt = new Date(releaseLocal);
    if (isNaN(releaseAt)) return TOAST.show('That unlock time is not valid', 'error');
    const btn = $('ws-create');
    btn.classList.add('loading');
    try {
      const res = await ADMIN.post('adminCreateWeeklySet', { title, fileId, chapterLabel, releaseAt: releaseAt.toISOString() });
      if (!res.success) throw new Error(res.error);
      TOAST.show('"' + title + '" unlocks ' + releaseAt.toLocaleString(), 'success', 5000);
      if (res.duplicateWarning) setTimeout(() => TOAST.show(res.duplicateWarning, 'warning', 6000), 1400);
      this.uploadedFileId = '';
      MODAL.close('sheet');
      ADMIN.refresh(['weeklysets']);
    } catch(e){ TOAST.show(e.message || 'Could not schedule that set', 'error'); }
    btn.classList.remove('loading');
  },

  async setStatus(id, status){
    BUSY.start();
    try {
      const res = await ADMIN.post('adminUpdateWeeklySet', { id, status });
      if (!res.success) throw new Error(res.error);
      TOAST.show(status === 'archived' ? 'Set archived' : 'Set restored', 'success');
      ADMIN.refresh(['weeklysets']);
    } catch(e){ TOAST.show(e.message, 'error'); }
    BUSY.stop();
  },

  async del(id, title){
    const ok = await CONFIRM.ask({
      title:'Delete weekly set',
      body:'Delete <b>' + esc(title) + '</b>? Archiving keeps the results and hides it from students instead.',
      confirmText:'Delete', tone:'danger'
    });
    if (!ok) return;
    BUSY.start();
    try {
      const res = await ADMIN.post('adminDeleteWeeklySet', { id });
      if (!res.success) throw new Error(res.error);
      TOAST.show('Weekly set deleted', 'success');
      ADMIN.refresh(['weeklysets']);
    } catch(e){ TOAST.show(e.message, 'error'); }
    BUSY.stop();
  }
};

const QREPORTS = {
  all: [], filter: 'open', chapterFilter: 'all', reasonFilter: 'all', searchTerm: '', _t: null,
  REASON: { wrong_answer:'Wrong answer', unclear:'Unclear wording', typo:'Typo or formatting', incomplete:'Incomplete question', image_problem:'Image or table problem', other:'Other' },
  SECTION: { practice:'Chapter practice', exam:'Timed exam', 'daily-paper':'Daily 75-mark paper', weekly:'Weekly test', hourly:'Hourly 50', results:'Results review',
             'review-missed':'Missed list', 'review-saved':'Saved list', 'review-flagged':'Flagged list', other:'Other' },
  /* The options as the student saw them, with the answer the app marks correct and the one the student picked. */
  _optionsHtml(r){
    if (!r.options || !r.options.length) return '';
    return '<div class="qr-opts">' + r.options.map((o, i) => {
      const isC = r.correctIndex === i, isP = r.chosenIndex === i;
      return '<div class="qr-opt' + (isC ? ' is-correct' : '') + (isP && !isC ? ' is-picked' : '') + '"><b>' + 'ABCDEF'.charAt(i) + '.</b> ' + esc(o) +
        (isC ? ' <span class="qr-tag">\u2713 marked correct</span>' : '') + (isP ? ' <span class="qr-tag">\u2190 student chose</span>' : '') + '</div>';
    }).join('') + '</div>';
  },

  setFilter(v){ this.filter = v; ADMIN.state.qrPage = 1; this.render(this.all); },
  setChapterFilter(v){ this.chapterFilter = v; ADMIN.state.qrPage = 1; this.render(this.all); },
  setReasonFilter(v){ this.reasonFilter = v; ADMIN.state.qrPage = 1; this.render(this.all); },
  debouncedFilter(){
    clearTimeout(this._t);
    this._t = setTimeout(() => {
      this.searchTerm = $('qreports-search').value.toLowerCase();
      ADMIN.state.qrPage = 1;
      this.render(this.all);
    }, 250);
  },
  async load(){
    BUSY.start();
    try {
      const res = await ADMIN.post('adminListQuestionReports');
      if (res.success) this.render(res.reports);
      else TOAST.show(res.error || 'Could not load reports', 'error');
    } catch(e){ TOAST.show(e.message, 'error'); }
    BUSY.stop();
  },
  chapterFor(fileId){ return CHAPTERS.labelFor(fileId); },
  _chapterOptions(){
    const sel = $('qreports-chapter-filter');
    if (!sel) return;
    const chapters = [...new Set(this.all.map(r => this.chapterFor(r.fileId)))].sort();
    const cur = this.chapterFilter;
    sel.innerHTML = '<option value="all">All chapters</option>' +
      chapters.map(c => '<option value="' + escAttrJs(c) + '"' + (c === cur ? ' selected' : '') + '>' + esc(c) + '</option>').join('');
    if (cur !== 'all' && !chapters.includes(cur)) { this.chapterFilter = 'all'; sel.value = 'all'; }
  },
  _visibleRows(){
    let rows = this.filter === 'all' ? this.all : this.all.filter(r => r.status === this.filter);
    if (this.chapterFilter !== 'all') rows = rows.filter(r => this.chapterFor(r.fileId) === this.chapterFilter);
    if (this.reasonFilter !== 'all') rows = rows.filter(r => r.reason === this.reasonFilter);
    if (this.searchTerm) {
      const q = this.searchTerm;
      rows = rows.filter(r => (r.questionSnapshot || '').toLowerCase().includes(q) ||
                              (r.note || '').toLowerCase().includes(q) ||
                              (r.reportedBy || '').toLowerCase().includes(q));
    }
    return rows;
  },
  render(reports){
    this.all = reports || [];
    this._chapterOptions();
    BADGES.update();
    const trunc = $('qr-trunc');
    if (trunc) trunc.innerHTML = ADMIN.data.qreportsTruncated
      ? '<div class="banner banner-warning"><i class="ph ph-warning"></i><span>Showing ' + this.all.length + ' of ' + ADMIN.data.qreportsTotalCount + ' reports.</span></div>' : '';

    const box = $('qreports-list');
    if (!box) return;
    const rows = this._visibleRows();
    if (!rows.length) {
      box.innerHTML = this.all.length
        ? '<div class="empty"><i class="ph ph-magnifying-glass"></i><div class="t">No reports match</div><div class="d">Try a different status or chapter.</div>' +
          '<div class="a"><button class="btn btn-quiet" data-on-click="QREPORTS.setFilter(\'all\')">Show all reports</button></div></div>'
        : '<div class="empty"><i class="ph ph-flag"></i><div class="t">Nothing flagged</div><div class="d">When a student reports a broken question, it lands here.</div></div>';
      $('qr-pg').innerHTML = '';
      return;
    }
    const per = ADMIN.state.qrPerPage;
    const total = Math.ceil(rows.length / per) || 1;
    if (ADMIN.state.qrPage > total) ADMIN.state.qrPage = total;
    const page = rows.slice((ADMIN.state.qrPage - 1) * per, ADMIN.state.qrPage * per);
    const canManage = ADMIN.can('qreports_manage');

    box.innerHTML = page.map(r =>
      '<div class="sub-card">' +
        '<div class="sub-top">' +
          '<div class="flex g2 wrap center">' +
            '<span class="badge st-' + esc(r.status || 'open') + '">' + esc(statusLabel(r.status || 'open')) + '</span>' +
            '<span class="badge flat">' + esc(this.REASON[r.reason] || r.reason) + '</span>' +
            '<span class="badge flat">' + esc(this.chapterFor(r.fileId)) + '</span>' +
          '</div>' +
          '<div class="t-cap">' + esc(r.reportedBy) + ' · ' + relTime(r.reportedAt) + '</div>' +
        '</div>' +
        (r.openReporters > 1 ? '<div class="banner banner-warning mt3"><i class="ph ph-users-three"></i><span><b>' + r.openReporters + ' students</b> have reported this question. It is very likely wrong.</span></div>' : '') +
        '<div class="t-callout mt3" style="color:var(--ink);line-height:1.6">' + esc(r.questionSnapshot || 'The question text was not captured.') + '</div>' +
        this._optionsHtml(r) +
        '<div class="t-cap mt2">' +
          esc(this.SECTION[r.section] || 'Section not recorded') +
          (r.questionNumber ? ' \u00b7 question ' + r.questionNumber + ' in its file' : '') +
          (r.fileId && r.fileId !== 'local' ? ' \u00b7 <a href="https://drive.google.com/file/d/' + encodeURIComponent(r.fileId) + '/view" target="_blank" rel="noopener">open the file in Drive</a>' : '') +
          (r.status !== 'open' && r.resolvedBy ? ' \u00b7 closed by ' + esc(r.resolvedBy) + (r.corrected ? ' (students\' apps told to refresh)' : '') : '') +
        '</div>' +
        (r.note ? '<div class="sub-feedback">' + esc(r.note) + '</div>' : '') +
        (canManage ? '<div class="sub-acts">' +
          '<button class="btn btn-secondary btn-sm" data-on-click="QREPORTS.editQ(\'' + escAttrJs(r.id) + '\')"><i class="ph ph-pencil-simple"></i> Fix the question</button>' +
          (r.status !== 'resolved' ? '<button class="btn btn-primary btn-sm" title="You corrected the question file. Every student\'s app replaces its copy." data-on-click="QREPORTS.setStatus(\'' + escAttrJs(r.id) + '\',\'resolved\')">Mark fixed</button>' +
            '<button class="btn btn-secondary btn-sm" title="The question was already right. Nothing changes for students." data-on-click="QREPORTS.setStatus(\'' + escAttrJs(r.id) + '\',\'resolved\',false)">No change needed</button>' : '') +
          (r.status !== 'dismissed' ? '<button class="btn btn-secondary btn-sm" data-on-click="QREPORTS.setStatus(\'' + escAttrJs(r.id) + '\',\'dismissed\')">Dismiss</button>' : '') +
          (r.status !== 'open' ? '<button class="btn btn-quiet btn-sm" data-on-click="QREPORTS.setStatus(\'' + escAttrJs(r.id) + '\',\'open\')">Reopen</button>' : '') +
          '<button class="icon-btn sm danger" style="margin-left:auto" data-on-click="QREPORTS.del(\'' + escAttrJs(r.id) + '\')" aria-label="Delete report"><i class="ph ph-trash"></i></button>' +
        '</div>' : '')
      + '</div>').join('');
    PAGINATION.render('qr-pg', ADMIN.state.qrPage, total, 'QREPORTS.goPage', rows.length);
  },
  goPage(p){ ADMIN.state.qrPage = p; this.render(this.all); UI.scrollTop(); },

  /* Open the reported question in an editor. The server keeps a backup of the
     file before every change, and every student phone refreshes that chapter. */
  async editQ(id){
    const r = this.all.find(x => x.id === id);
    if (!r) return;
    const m = String(r.uid || '').match(/^(.+)_(\d+)$/);
    if (!m) return TOAST.show('This report has no question reference', 'error');
    MODAL.sheet('Fix the question', '<div class="skeleton sk-100"></div><div class="skeleton sk-80"></div><div class="skeleton sk-60"></div>');
    try {
      const res = await ADMIN.post('adminGetQuestion', { fileId: m[1], index: Number(m[2]) });
      if (!res.success) throw new Error(res.error || 'Could not load that question.');
      const q = res.question;
      this._eq = { reportId: id, fileId: m[1], index: Number(m[2]), q: q };
      const letters = 'ABCDEF';
      const opts = q.options || [];
      $('bd-sheet').innerHTML =
        '<p class="t-foot mb3">A copy of the file is saved before your change. Students\' apps replace their copy within minutes of opening online, and update the questions they saved for review. Correct questions in place: do not delete or reorder questions in the file, because students\' progress is tied to each question\'s position.</p>' +
        (r.note ? '<div class="banner banner-info"><i class="ph ph-chat-text"></i><span>Student note: ' + esc(r.note) + '</span></div>' : '') +
        '<div class="field"><label for="eq-q">Question</label><textarea class="textarea" id="eq-q" style="min-height:96px">' + esc(q.q) + '</textarea></div>' +
        opts.map((o, i) => '<div class="field"><label for="eq-o' + i + '">Option ' + letters[i] + '</label><input class="input" type="text" id="eq-o' + i + '" value="' + esc(o) + '"></div>').join('') +
        '<div class="field"><label for="eq-c">Correct answer</label><select class="select" id="eq-c">' +
          (q.correct === null ? '<option value="">Choose…</option>' : '') +
          opts.map((o, i) => '<option value="' + i + '"' + (q.correct === i ? ' selected' : '') + '>' + letters[i] + '</option>').join('') +
        '</select></div>' +
        '<div class="field"><label for="eq-e">Explanation</label><textarea class="textarea" id="eq-e">' + esc(q.explanation) + '</textarea></div>' +
        '<label class="perm-row mb4"><input type="checkbox" id="eq-done" checked><span>Mark this report as fixed</span></label>' +
        '<div class="flex g2"><button class="btn btn-quiet" style="flex:1" data-on-click="MODAL.close(\'sheet\')">Cancel</button>' +
        '<button class="btn btn-primary" style="flex:1" id="eq-save" data-on-click="QREPORTS.saveQ()">Save the fix</button></div>';
    } catch(e){
      $('bd-sheet').innerHTML = '<div class="banner banner-danger"><i class="ph ph-warning-circle"></i><span>' + esc(e.message) + '</span></div>';
    }
  },
  async saveQ(){
    const c = this._eq;
    if (!c) return;
    const opts = [];
    for (let i = 0; i < c.q.options.length; i++) opts.push($('eq-o' + i).value.trim());
    if (opts.some(o => !o)) return TOAST.show('Every option needs text', 'error');
    const qt = $('eq-q').value.trim();
    if (!qt) return TOAST.show('The question text cannot be empty', 'error');
    const cv = $('eq-c').value;
    if (cv === '') return TOAST.show('Choose the correct answer', 'error');
    const btn = $('eq-save');
    btn.classList.add('loading');
    try {
      const res = await ADMIN.post('adminUpdateQuestion', {
        fileId: c.fileId, index: c.index, expectedQ: c.q.q,
        fields: JSON.stringify({ q: qt, options: opts, correct: Number(cv), explanation: $('eq-e').value.trim() })
      });
      if (!res.success) throw new Error(res.error || 'Could not save.');
      TOAST.show('Saved. Students get the fix the next time they open the app online.', 'success', 5000);
      const done = $('eq-done') && $('eq-done').checked;
      MODAL.close('sheet');
      if (done) this.setStatus(c.reportId, 'resolved');
    } catch(e){ TOAST.show(e.message, 'error', 6000); }
    btn.classList.remove('loading');
  },
  exportCSV(){
    const rows = this._visibleRows();
    if (!rows.length) return TOAST.show('Nothing to export', 'warning');
    ADMIN.downloadCSV(ADMIN.toCSV(
      ['ID','Status','Reason','Chapter','Section','Question no.','Question','Marked correct','Student chose','Students reporting','Note','Reported by','Reported at','Closed by'],
      rows.map(r => [r.id, r.status, this.REASON[r.reason] || r.reason, this.chapterFor(r.fileId), this.SECTION[r.section] || '', r.questionNumber || '', r.questionSnapshot || '',
        r.correctIndex == null ? '' : 'ABCDEF'.charAt(r.correctIndex), r.chosenIndex == null ? '' : 'ABCDEF'.charAt(r.chosenIndex), r.openReporters || '', r.note || '', r.reportedBy, r.reportedAt, r.resolvedBy || ''])
    ), 'question_reports.csv');
  },
  async setStatus(id, status, corrected){
    const item = this.all.find(r => r.id === id);
    const prev = item?.status;
    if (item) { item.status = status; this.render(this.all); }
    try {
      const body = { id, status };
      if (corrected === false) body.corrected = false;
      const res = await ADMIN.post('adminUpdateQuestionReportStatus', body);
      if (!res.success) throw new Error(res.error || 'Update failed.');
      TOAST.show('Report marked ' + statusLabel(status).toLowerCase() + (res.alsoClosed ? ' (' + res.alsoClosed + ' more report' + (res.alsoClosed === 1 ? '' : 's') + ' on this question closed too)' : ''), 'success', 3200);
      if (res.alsoClosed) this.load();
    } catch(e){
      if (item) { item.status = prev; this.render(this.all); }
      TOAST.show(e.message, 'error');
    }
  },
  /* A question file was edited directly in Drive: tell every student's app to replace its copy now. */
  refreshFile(){
    MODAL.sheet('Refresh a question file',
      '<p class="t-foot mb3">Edited a question file directly in Drive? Paste its file id here and every student\'s app replaces its copy, and updates the questions it saved for review, within minutes. (Fixing a question from a report does this for you.)</p>' +
      '<div class="field"><label for="rf-id">File id</label><input class="input" type="text" id="rf-id" placeholder="the long code in the file\'s Drive link" autocomplete="off"></div>' +
      '<div class="flex g2 mt4"><button class="btn btn-quiet" style="flex:1" data-on-click="MODAL.close(\'sheet\')">Cancel</button>' +
      '<button class="btn btn-primary" style="flex:2" id="rf-go" data-on-click="QREPORTS.doRefreshFile()">Refresh on students\' phones</button></div>');
  },
  async doRefreshFile(){
    const id = ($('rf-id').value || '').trim();
    if (!/^[A-Za-z0-9_-]{10,200}$/.test(id)) { $('rf-id').classList.add('invalid'); return TOAST.show('That does not look like a Drive file id', 'warning'); }
    const btn = $('rf-go'); btn.disabled = true;
    try {
      const res = await ADMIN.post('adminMarkFileCorrected', { fileId: id });
      if (!res.success) throw new Error(res.error || 'Could not refresh.');
      MODAL.close('sheet'); TOAST.show('Done. Students\' apps will replace that file.', 'success', 4000);
    } catch(e){ btn.disabled = false; TOAST.show(e.message, 'error'); }
  },
  async del(id){
    const ok = await CONFIRM.ask({ title:'Delete report', body:'Delete this report permanently?', confirmText:'Delete', tone:'danger' });
    if (!ok) return;
    try {
      const res = await ADMIN.post('adminDeleteQuestionReport', { id });
      if (!res.success) throw new Error(res.error || 'Delete failed.');
      this.all = this.all.filter(r => r.id !== id);
      this.render(this.all);
      TOAST.show('Report deleted', 'success');
    } catch(e){ TOAST.show(e.message, 'error'); }
  }
};

/* ═══════════════════════════════════════════════════════════════════════
   STUDY PDFs — upload model answers, notes and past papers for students.
   Backend: adminListStudyDocs / adminAddStudyDoc / adminUpdateStudyDoc /
   adminDeleteStudyDoc / adminDownloadStudyDoc. Students read them from
   "Model answers & notes" in the student app (paid students only).
   ═══════════════════════════════════════════════════════════════════════ */
const STUDYDOCS = {
  list: [], loaded: false, MAX_BYTES: 9 * 1024 * 1024,

  async load(force){
    const box = $('studydocs-list');
    if (!box) return;
    if (this.loaded && !force) { this.render(); return; }
    box.innerHTML = '<div class="skeleton sk-100"></div><div class="skeleton sk-80"></div><div class="skeleton sk-60"></div>';
    try {
      const r = await ADMIN.post('adminListStudyDocs');
      if (!r.success) throw new Error(r.error || 'Could not load the PDFs.');
      this.list = r.docs || []; this.loaded = true;
      this.render();
    } catch(e){
      box.innerHTML = '<div class="banner banner-danger"><i class="ph ph-warning-circle"></i><span>' + esc(e.message) +
        ' <button class="btn btn-quiet btn-sm" data-on-click="STUDYDOCS.load(true)">Try again</button></span></div>';
    }
  },

  render(){
    const box = $('studydocs-list');
    if (!box) return;
    if (!this.list.length) {
      box.innerHTML = '<div class="empty"><i class="ph ph-file-pdf"></i><div class="t">No study PDFs yet</div>' +
        '<div class="d">Upload a model-answer PDF and students will find it under Written answers.</div>' +
        '<div class="a"><button class="btn btn-primary" data-perm="studydocs_manage" data-on-click="STUDYDOCS.openUpload()">Upload a PDF</button></div></div>';
      ADMIN._applyPermissions();
      return;
    }
    const canManage = ADMIN.can('studydocs_manage');
    box.innerHTML = '<div class="rows">' + this.list.map(d => {
      const hidden = d.status === 'hidden';
      const id = escAttrJs(d.id);
      return '<div class="row">' +
        '<div class="row-main"><div class="row-title">' + esc(d.title) + ' ' + badge(hidden ? 'archived' : 'live', hidden ? 'Hidden' : 'Visible') + '</div>' +
        '<div class="row-sub">' + esc(STUDYDOC_LABELS[d.category] || 'Other') + (d.chapterId && subjChapterName(d.chapterId) ? ' · ' + esc(subjChapterName(d.chapterId)) : '') + ' · ' + esc(formatBytes(d.sizeBytes)) +
          ' · added ' + esc(fullTime(d.uploadedAt)) + (d.uploadedBy ? ' by ' + esc(d.uploadedBy) : '') +
          (d.description ? '<br>' + esc(d.description) : '') + '</div></div>' +
        '<div class="row-actions">' +
          '<button class="icon-btn sm" data-on-click="STUDYDOCS.preview(\'' + id + '\',\'' + escAttrJs(d.title) + '\')" aria-label="Open ' + esc(d.title) + '" title="Open"><i class="ph ph-eye"></i></button>' +
          (canManage ? '<button class="icon-btn sm" data-on-click="STUDYDOCS.openEdit(\'' + id + '\')" aria-label="Edit ' + esc(d.title) + '" title="Edit"><i class="ph ph-pencil-simple"></i></button>' +
            '<button class="icon-btn sm" data-on-click="STUDYDOCS.setStatus(\'' + id + '\',\'' + (hidden ? 'published' : 'hidden') + '\')" aria-label="' + (hidden ? 'Show to students' : 'Hide from students') + '" title="' + (hidden ? 'Show to students' : 'Hide from students') + '"><i class="ph ph-' + (hidden ? 'eye-slash' : 'eye-closed') + '"></i></button>' +
            '<button class="icon-btn sm danger" data-on-click="STUDYDOCS.del(\'' + id + '\',\'' + escAttrJs(d.title) + '\')" aria-label="Delete ' + esc(d.title) + '" title="Delete"><i class="ph ph-trash"></i></button>' : '') +
        '</div></div>';
    }).join('') + '</div>';
  },

  _fields(d){
    const cats = Object.keys(STUDYDOC_LABELS);
    return '<div class="field"><label for="sd-title">Title</label>' +
        '<input class="input" type="text" id="sd-title" maxlength="120" placeholder="Soil Mechanics: 10-mark model answers" value="' + esc(d ? d.title : '') + '"></div>' +
      '<div class="field"><label for="sd-cat">Type</label><select class="select" id="sd-cat">' +
        cats.map(c => '<option value="' + c + '"' + ((d ? d.category : 'model-answer') === c ? ' selected' : '') + '>' + esc(STUDYDOC_LABELS[c]) + '</option>').join('') + '</select></div>' +
      '<div class="field"><label for="sd-chap">Written-answer chapter <span class="dim">(optional: students see a "model answer" button after their answer in this chapter is marked)</span></label>' +
        '<select class="select" id="sd-chap"><option value="">Not tied to a chapter</option>' +
        (window.SUBJECTIVE_CHAPTERS || []).map(c => '<option value="' + esc(c.id) + '"' + (d && d.chapterId === c.id ? ' selected' : '') + '>' + esc(c.name) + '</option>').join('') + '</select></div>' +
      '<div class="field"><label for="sd-desc">Short note <span class="dim">(optional, shown under the title)</span></label>' +
        '<input class="input" type="text" id="sd-desc" maxlength="400" placeholder="Worked answers for the last five years" value="' + esc(d ? d.description : '') + '"></div>' +
      '<label class="flex g2 mt2" style="align-items:center;cursor:pointer"><input type="checkbox" id="sd-pin"' + (d && d.sortOrder <= 1 ? ' checked' : '') + '> <span class="t-callout">Show at the top of the list</span></label>';
  },

  openUpload(){
    MODAL.sheet('Upload a study PDF',
      this._fields(null) +
      '<div class="field mt2"><span class="field-label">PDF file</span>' +
        '<label class="file-drop" for="sd-file">' +
          '<input type="file" id="sd-file" accept="application/pdf,.pdf" data-on-change="STUDYDOCS.onFilePicked()">' +
          '<i class="ph ph-file-arrow-up fd-icon"></i>' +
          '<span class="fd-main" id="sd-file-name">Choose a PDF</span>' +
          '<span class="fd-sub">Under 9 MB. Scanned pages are fine, but smaller files open faster on phones.</span>' +
        '</label><div class="t-foot mt2" id="sd-status" aria-live="polite"></div></div>' +
      '<label class="flex g2 mt2" style="align-items:center;cursor:pointer"><input type="checkbox" id="sd-publish" checked> <span class="t-callout">Visible to students now</span></label>' +
      '<div class="flex g2 mt4"><button class="btn btn-quiet" style="flex:1" data-on-click="MODAL.close(\'sheet\')">Cancel</button>' +
        '<button class="btn btn-primary" style="flex:2" id="sd-save" data-on-click="STUDYDOCS.upload()">Upload</button></div>');
  },

  onFilePicked(){
    const input = $('sd-file'), status = $('sd-status'), nameEl = $('sd-file-name');
    const f = input.files && input.files[0];
    if (!f) return;
    nameEl.textContent = f.name;
    if (!/\.pdf$/i.test(f.name) && f.type !== 'application/pdf') {
      status.innerHTML = '<span style="color:var(--danger)">That is not a PDF.</span>'; input.value = ''; nameEl.textContent = 'Choose a PDF'; return;
    }
    if (f.size > this.MAX_BYTES) {
      status.innerHTML = '<span style="color:var(--danger)">That file is ' + formatBytes(f.size) + '. Keep it under 9 MB (a scanner or PDF compressor can shrink it).</span>';
      input.value = ''; nameEl.textContent = 'Choose a PDF'; return;
    }
    status.textContent = formatBytes(f.size) + ' ready';
    const t = $('sd-title');
    if (t && !t.value.trim()) t.value = f.name.replace(/\.pdf$/i, '').replace(/[_-]+/g, ' ').trim();
  },

  async upload(){
    const f = $('sd-file').files && $('sd-file').files[0];
    const title = $('sd-title').value.trim();
    if (!title) { $('sd-title').classList.add('invalid'); return TOAST.show('Give the PDF a title', 'warning'); }
    if (!f) return TOAST.show('Choose a PDF file first', 'warning');
    const btn = $('sd-save'), status = $('sd-status');
    btn.disabled = true; btn.textContent = 'Uploading…';
    status.innerHTML = '<span class="inline-loader">Uploading to Drive</span>';
    try {
      const dataUrl = await new Promise((res, rej) => {
        const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(new Error('Could not read that file.')); r.readAsDataURL(f);
      });
      const r = await ADMIN.post('adminAddStudyDoc', {
        title, category: $('sd-cat').value, chapterId: $('sd-chap').value, description: $('sd-desc').value.trim(),
        sortOrder: $('sd-pin').checked ? 1 : 100, publish: $('sd-publish').checked, pdfData: dataUrl
      });
      if (!r.success) throw new Error(r.error || 'Upload failed.');
      MODAL.close('sheet');
      TOAST.show('Uploaded' + ($('sd-publish') && !$('sd-publish').checked ? ' (hidden)' : ''), 'success');
      this.load(true);
    } catch(e){
      status.innerHTML = '<span style="color:var(--danger)">' + esc(e.message) + '</span>';
      btn.disabled = false; btn.textContent = 'Upload';
    }
  },

  openEdit(id){
    const d = this.list.find(x => x.id === id);
    if (!d) return;
    MODAL.sheet('Edit study PDF',
      this._fields(d) +
      '<div class="field mt2"><label for="sd-state">Visibility</label><select class="select" id="sd-state">' +
        '<option value="published"' + (d.status !== 'hidden' ? ' selected' : '') + '>Visible to students</option>' +
        '<option value="hidden"' + (d.status === 'hidden' ? ' selected' : '') + '>Hidden</option></select></div>' +
      '<div class="t-foot mt2">To replace the file itself, upload the new PDF and delete this one.</div>' +
      '<div class="flex g2 mt4"><button class="btn btn-quiet" style="flex:1" data-on-click="MODAL.close(\'sheet\')">Cancel</button>' +
        '<button class="btn btn-primary" style="flex:2" id="sd-save" data-on-click="STUDYDOCS.saveEdit(\'' + escAttrJs(id) + '\')">Save</button></div>');
  },

  async saveEdit(id){
    const title = $('sd-title').value.trim();
    if (!title) { $('sd-title').classList.add('invalid'); return TOAST.show('Give the PDF a title', 'warning'); }
    const btn = $('sd-save'); btn.disabled = true;
    try {
      const r = await ADMIN.post('adminUpdateStudyDoc', {
        id, title, category: $('sd-cat').value, chapterId: $('sd-chap').value, description: $('sd-desc').value.trim(),
        sortOrder: $('sd-pin').checked ? 1 : 100, status: $('sd-state').value
      });
      if (!r.success) throw new Error(r.error || 'Could not save.');
      MODAL.close('sheet'); TOAST.show('Saved', 'success'); this.load(true);
    } catch(e){ btn.disabled = false; TOAST.show(e.message, 'error'); }
  },

  async setStatus(id, status){
    const d = this.list.find(x => x.id === id);
    if (!d) return;
    try {
      const r = await ADMIN.post('adminUpdateStudyDoc', {
        id, title: d.title, category: d.category, chapterId: d.chapterId, description: d.description, sortOrder: d.sortOrder, status
      });
      if (!r.success) throw new Error(r.error || 'Could not update.');
      TOAST.show(status === 'hidden' ? 'Hidden from students' : 'Visible to students', 'success'); this.load(true);
    } catch(e){ TOAST.show(e.message, 'error'); }
  },

  async del(id, title){
    const ok = await CONFIRM.ask({ title: 'Delete this PDF?', body: '<b>' + esc(title) + '</b> will be removed for every student, including copies saved for offline reading once they next go online. This cannot be undone.', confirmText: 'Delete', tone: 'danger' });
    if (!ok) return;
    try {
      const r = await ADMIN.post('adminDeleteStudyDoc', { id });
      if (!r.success) throw new Error(r.error || 'Could not delete.');
      TOAST.show('Deleted', 'success'); this.load(true);
    } catch(e){ TOAST.show(e.message, 'error'); }
  },

  preview(id, title){
    if (typeof PDFVIEW === 'undefined') return TOAST.show('The PDF reader did not load. Reload the page.', 'error');
    PDFVIEW.open({
      title: title || 'Study PDF',
      load: async () => {
        const r = await ADMIN.post('adminDownloadStudyDoc', { id });
        if (!r.success) throw new Error(r.error || 'Could not open that PDF.');
        return { base64: r.base64, filename: r.filename || 'study.pdf' };
      }
    });
  }
};

const SUBJ_STORE = {
  all: [], loaded: false, loading: false, truncated: false, totalCount: 0,
  async load(force){
    if (this.loaded && !force) return this.all;
    if (this.loading) return this.all;
    this.loading = true;
    try {
      const r = await ADMIN.post('adminListSubjectiveSubmissions', { status: '' });
      if (r.success) {
        this.all = r.submissions || [];
        this.truncated = !!r.truncated;
        this.totalCount = r.totalCount || this.all.length;
        this.loaded = true;
        BADGES.update();
        TODAY.render();
      }
    } catch(e){}
    this.loading = false;
    return this.all;
  },
  byKind(kind){ return this.all.filter(s => (s.kind || 'qotd') === kind); }
};

const SUBJ_TABS = {
  current: 'qotd',
  go(tab){
    this.current = tab;
    $$('#view-subjective .tabbar button').forEach(t => {
      const on = t.dataset.tab === tab;
      t.classList.toggle('active', on);
      t.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    ['qotd','hourly','exam','add'].forEach(t => { const p = $('subj-panel-' + t); if (p) p.hidden = (t !== tab); });
    if (tab === 'qotd')   SUBJ_QOTD.load(false);
    if (tab === 'hourly') SUBJ_HOURLY.load(false);
    if (tab === 'exam')   SUBJ_EXAM.load(false);
    if (tab === 'add')    SUBJADMIN._populateFilters();
  }
};

/* ── Grading card ──────────────────────────────────────────────────
   Actions per submission: Open PDF, Replace PDF, Annotate PDF.
   Annotate opens the shared PDF viewer in marking mode and, on save,
   posts the marked PDF back through the same adminReplaceSubmissionPdf
   endpoint that Replace PDF uses. */
function gradeCard(s, ns, defaultMarks, showQuestion){
  const graded = s.status === 'graded';
  const marks = s.questionMarks || defaultMarks;
  const id = escAttrJs(s.id);
  const hasPdf = !!(s.pdfUrl && driveFileId(s.pdfUrl));
  const replaced = !!s.pdfReplacedAt;
  const canGrade = ADMIN.can('subjective_grade');
  return '<div class="sub-card' + (graded ? ' graded' : '') + '">' +
    '<div class="sub-top">' +
      '<div><div class="sub-user"><span class="avatar">' + esc(initials(s.username)) + '</span>' + esc(s.username) + '</div>' +
      '<div class="sub-meta"><span title="' + esc(fullTime(s.submittedAt)) + '">' + relTime(s.submittedAt) + '</span>' +
      '<span>Out of ' + marks + '</span></div></div>' +
      '<div class="flex g2 center wrap">' +
        (replaced ? '<span class="badge badge-success flat" title="Replaced ' + esc(fullTime(s.pdfReplacedAt)) + (s.pdfReplacedBy ? ' by ' + esc(s.pdfReplacedBy) : '') + '"><i class="ph ph-check-circle"></i> PDF updated</span>' : '') +
        badge(graded ? 'graded' : 'ungraded', graded ? 'Graded' : 'Needs a score') +
      '</div>' +
    '</div>' +
    (showQuestion && s.questionText ? '<div class="sub-q">' + esc(s.questionText) + '</div>' : '') +
    '<div class="sub-acts">' +
      (hasPdf
        ? '<button class="btn btn-secondary btn-sm" data-on-click="openPdf(\'' + id + '\',\'' + escAttrJs(s.username || '') + '\')"><i class="ph ph-file-pdf"></i> Open answer PDF</button>'
        : '<button class="btn btn-secondary btn-sm" disabled><i class="ph ph-file-pdf"></i> No PDF attached</button>') +
      (hasPdf && canGrade
        ? '<button class="btn btn-quiet btn-sm" data-on-click="SUBJ_PDF.open(\'' + id + '\',\'' + escAttrJs(s.username || '') + '\',\'' + escAttrJs(s.pdfUrl || '') + '\')" title="Overwrite the Drive file with an uploaded copy"><i class="ph ph-upload-simple"></i> Replace PDF</button>'
        : '') +
      (hasPdf && canGrade
        ? '<button class="btn btn-quiet btn-sm" data-on-click="PDF_ANNOTATE.open(\'' + id + '\',\'' + escAttrJs(s.username || '') + '\',\'' + escAttrJs(s.pdfUrl || '') + '\')" title="Read and mark the paper in the browser"><i class="ph ph-highlighter-circle"></i> Mark the paper</button>'
        : '') +
      (graded
        ? '<span class="sub-score">' + s.score + ' / ' + marks + '</span>' +
          '<span class="t-cap">by ' + esc(s.gradedBy || 'admin') + '</span>' +
          '<button class="btn btn-quiet btn-sm" style="margin-left:auto" data-on-click="' + ns + '.regrade(\'' + id + '\')"><i class="ph ph-pencil-simple"></i> Change score</button>'
        : '<label class="sr-only" for="' + ns + '-score-' + id + '">Score out of ' + marks + '</label>' +
          '<input class="input grade-input" type="number" inputmode="numeric" min="0" max="' + marks + '" placeholder="0–' + marks + '" id="' + ns + '-score-' + id + '">' +
          '<label class="sr-only" for="' + ns + '-fb-' + id + '">Feedback</label>' +
          '<input class="input feedback-input" type="text" placeholder="Feedback for the student (optional)" id="' + ns + '-fb-' + id + '">' +
          '<button class="btn btn-primary btn-sm" data-on-click="' + ns + '.save(\'' + id + '\',' + marks + ')">Save score</button>') +
    '</div>' +
    (graded && s.feedback ? '<div class="sub-feedback">' + esc(s.feedback) + '</div>' : '') +
  '</div>';
}

async function saveGrade(ns, id, maxMarks, rerender){
  const scoreEl = $(ns + '-score-' + id);
  const fbEl = $(ns + '-fb-' + id);
  const score = parseInt(scoreEl?.value, 10);
  if (isNaN(score) || score < 0 || score > maxMarks) {
    if (scoreEl) { scoreEl.classList.add('invalid'); scoreEl.focus(); }
    return TOAST.show('Enter a score between 0 and ' + maxMarks, 'error');
  }
  BUSY.start();
  try {
    const r = await ADMIN.post('adminGradeSubjectiveSubmission', { id, score, feedback: fbEl?.value || '' });
    if (!r.success) throw new Error(r.error || 'Could not save that score.');
    TOAST.show('Score saved', 'success', 2000);
    await SUBJ_STORE.load(true);
    rerender();
  } catch(e){ TOAST.show(e.message, 'error'); }
  BUSY.stop();
}

function regradeSheet(ns, id, defaultMarks, rerender){
  const s = SUBJ_STORE.all.find(x => x.id === id);
  if (!s) return;
  const marks = s.questionMarks || defaultMarks;
  MODAL.sheet('Change score — ' + s.username,
    '<div class="field"><label for="rg-score">Score out of ' + marks + '</label>' +
    '<input class="input mono" type="number" id="rg-score" min="0" max="' + marks + '" value="' + (s.score ?? '') + '"></div>' +
    '<div class="field"><label for="rg-fb">Feedback</label>' +
    '<textarea class="textarea" id="rg-fb" placeholder="Optional note for the student">' + esc(s.feedback || '') + '</textarea></div>' +
    '<div class="flex g2 mt4"><button class="btn btn-quiet" style="flex:1" data-on-click="MODAL.close(\'sheet\')">Cancel</button>' +
    '<button class="btn btn-primary" style="flex:1" id="rg-save" data-on-click="_regradeCommit(\'' + escAttrJs(id) + '\',' + marks + ')">Save score</button></div>',
    { wide:false });
  window._regradeAfter = rerender;
}
async function _regradeCommit(id, marks){
  const n = parseInt($('rg-score').value, 10);
  if (isNaN(n) || n < 0 || n > marks) { $('rg-score').classList.add('invalid'); return TOAST.show('Enter a score between 0 and ' + marks, 'error'); }
  const btn = $('rg-save');
  btn.classList.add('loading');
  try {
    const r = await ADMIN.post('adminGradeSubjectiveSubmission', { id, score:n, feedback: $('rg-fb').value });
    if (!r.success) throw new Error(r.error);
    MODAL.close('sheet');
    TOAST.show('Score updated', 'success');
    await SUBJ_STORE.load(true);
    if (window._regradeAfter) window._regradeAfter();
  } catch(e){ TOAST.show(e.message, 'error'); }
  btn.classList.remove('loading');
}

const SUBJ_QOTD = {
  async load(force){
    const list = $('qotd-list');
    if (!list) return;
    list.innerHTML = '<div class="sk-block"><div class="skeleton sk-60"></div><div class="skeleton sk-80"></div></div>';
    await SUBJ_STORE.load(force);
    this.render();
  },
  render(){
    const banner = $('qotd-banner'), list = $('qotd-list');
    if (!banner || !list) return;
    const dateInput = $('qotd-date');
    if (!dateInput.value) {
      const t = new Date(), p = n => String(n).padStart(2, '0');
      dateInput.value = t.getFullYear() + '-' + p(t.getMonth() + 1) + '-' + p(t.getDate());
    }
    const dateStr = dateInput.value;
    const statusFilter = $('qotd-status').value;

    const items = SUBJ_STORE.byKind('qotd').filter(s => {
      if (!s.submittedAt) return false;
      const d = new Date(s.submittedAt), p = n => String(n).padStart(2, '0');
      if (d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) !== dateStr) return false;
      if (statusFilter !== 'all' && s.status !== statusFilter) return false;
      return true;
    });

    const graded = items.filter(s => s.status === 'graded');
    const pending = items.length - graded.length;
    const avg = graded.length ? Math.round(graded.reduce((a, s) => a + (Number(s.score) || 0), 0) / graded.length * 10) / 10 : '—';
    const sample = items[0];

    /* The backend returns the most recent 500 submissions. Say so rather
       than letting an older date look empty. */
    const truncNote = (SUBJ_STORE.truncated && !items.length)
      ? '<div class="banner banner-warning"><i class="ph ph-warning"></i><span>' +
        'The most recent ' + SUBJ_STORE.all.length + ' of ' + SUBJ_STORE.totalCount +
        ' submissions are loaded, so this day may be further back than that. ' +
        '<button class="btn btn-sm btn-secondary" style="margin-left:.4rem" data-on-click="SUBJ_QOTD.loadDay()">Fetch ' +
        esc(dateStr) + ' from the server</button></span></div>'
      : '';

    banner.innerHTML = truncNote + '<div class="qotd-head">' +
      '<h3 class="t-t3">' + (sample ? 'The question students answered' : 'Nothing submitted on this date') + '</h3>' +
      (sample
        ? '<div class="qotd-text">' + esc(sample.questionText || 'The question text was not stored with these submissions.') + '</div>' +
          '<div class="sub-meta mt3"><span>Worth ' + (sample.questionMarks || '?') + ' marks</span><span>' + esc(sample.chapterId || 'chapter unknown') + '</span></div>'
        : '<p class="t-callout mt2">Pick another date, or wait for the first student to submit.</p>') +
      '<div class="qotd-stats">' +
        '<div><strong>' + items.length + '</strong><span>Submitted</span></div>' +
        '<div><strong>' + pending + '</strong><span>Ungraded</span></div>' +
        '<div><strong>' + graded.length + '</strong><span>Graded</span></div>' +
        '<div><strong>' + avg + '</strong><span>Average</span></div>' +
      '</div></div>';

    list.innerHTML = items.length
      ? items.map(s => gradeCard(s, 'SUBJ_QOTD', 10, false)).join('')
      : '<div class="empty"><i class="ph ph-sun-horizon"></i><div class="t">No submissions for ' + esc(dateStr) + '</div>' +
        '<div class="d">Change the date above to look at another day.</div></div>';
  },
  /* Pulls one specific day straight from the server and folds it into the
     store, for when the day sits behind the 500-row window. */
  async loadDay(){
    const dateStr = $('qotd-date').value;
    if (!dateStr) return;
    BUSY.start();
    try {
      const r = await ADMIN.post('adminListSubjectiveSubmissions', {
        kind: 'qotd', dateFrom: dateStr, dateTo: dateStr
      });
      if (!r.success) throw new Error(r.error || 'Could not load that day.');
      const fetched = r.submissions || [];
      if (!fetched.length) {
        TOAST.show('Nothing was submitted on ' + dateStr, 'info', 4000);
      } else {
        const seen = new Set(SUBJ_STORE.all.map(s => s.id));
        fetched.forEach(s => { if (!seen.has(s.id)) SUBJ_STORE.all.push(s); });
        TOAST.show('Loaded ' + plural(fetched.length, 'submission') + ' from ' + dateStr, 'success');
      }
      this.render();
    } catch(e){
      /* An older deployment predates the date filter — say so plainly. */
      TOAST.show(/dateFrom|Unknown action/i.test(e.message || '')
        ? 'This backend build does not support fetching a single day yet. Redeploy code.gs (v1.12).'
        : (e.message || 'Could not load that day.'), 'error', 7000);
    }
    BUSY.stop();
  },
  _setDate(dt){
    const p = n => String(n).padStart(2, '0');
    $('qotd-date').value = dt.getFullYear() + '-' + p(dt.getMonth() + 1) + '-' + p(dt.getDate());
    this.render();
  },
  shiftDate(days){
    const cur = $('qotd-date').value;
    const base = cur ? new Date(cur + 'T12:00:00') : new Date();
    base.setDate(base.getDate() + days);
    this._setDate(base);
  },
  goToday(){ this._setDate(new Date()); },
  save(id, marks){ saveGrade('SUBJ_QOTD', id, marks, () => this.render()); },
  regrade(id){ regradeSheet('SUBJ_QOTD', id, 10, () => this.render()); }
};

const SUBJ_EXAM = {
  async load(force){
    const list = $('exam-list');
    if (!list) return;
    list.innerHTML = '<div class="sk-block"><div class="skeleton sk-60"></div><div class="skeleton sk-80"></div></div>';
    await SUBJ_STORE.load(force);
    this.render();
  },
  render(){
    const list = $('exam-list');
    if (!list) return;
    const statusFilter = $('exam-status').value;
    const term = ($('exam-search').value || '').toLowerCase().trim();
    const items = SUBJ_STORE.byKind('exam').filter(s => {
      if (statusFilter !== 'all' && s.status !== statusFilter) return false;
      if (term && !(s.username || '').toLowerCase().includes(term)) return false;
      return true;
    });
    list.innerHTML = items.length
      ? items.map(s => gradeCard(s, 'SUBJ_EXAM', 100, true)).join('')
      : '<div class="empty"><i class="ph ph-note-pencil"></i><div class="t">No exam papers here</div>' +
        '<div class="d">' + (term || statusFilter !== 'all' ? 'Clear the search or status filter to see everything.' : 'Papers appear once a student uploads one.') + '</div></div>';
  },
  save(id, marks){ saveGrade('SUBJ_EXAM', id, marks, () => this.render()); },
  regrade(id){ regradeSheet('SUBJ_EXAM', id, 100, () => this.render()); }
};

