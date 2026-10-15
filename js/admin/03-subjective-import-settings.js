'use strict';

/* ═══════════════ HOURLY — grading view ═══════════════ */
const SUBJ_HOURLY = {
  async load(force){
    const list = $('hourly-list');
    if (!list) return;
    list.innerHTML = '<div class="sk-block"><div class="skeleton sk-60"></div><div class="skeleton sk-80"></div></div>';
    await SUBJ_STORE.load(force);
    this.render();
  },
  render(){
    const list = $('hourly-list');
    if (!list) return;
    const statusFilter = $('hourly-status').value;
    const term = ($('hourly-search').value || '').toLowerCase().trim();
    const items = SUBJ_STORE.all.filter(s => s.kind === 'hourly').filter(s => {
      if (statusFilter !== 'all' && s.status !== statusFilter) return false;
      if (term && !(s.username || '').toLowerCase().includes(term)) return false;
      return true;
    });
    list.innerHTML = items.length
      ? items.map(s => gradeCard(s, 'SUBJ_HOURLY', 10, true)).join('')
      : '<div class="empty"><i class="ph ph-clock-countdown"></i><div class="t">No hourly submissions</div><div class="d">They arrive as students take each hour\'s question.</div></div>';
  },
  save(id, marks){ saveGrade('SUBJ_HOURLY', id, marks, () => this.render()); },
  regrade(id){ regradeSheet('SUBJ_HOURLY', id, 10, () => this.render()); }
};

/* ═══════════════ REPLACE PDF — upload and overwrite ═══════════════════
   For when the admin already has a replacement file (edited externally).
   The in-browser annotation flow lives in PDF_ANNOTATE below; both
   paths land on the same backend endpoint. */
const SUBJ_PDF = {
  _ctx: null,
  _file: null,

  open(id, username, pdfUrl){
    const fileId = driveFileId(pdfUrl);
    if (!fileId) {
      TOAST.show('That submission has no Drive file to replace', 'error');
      return;
    }
    this._ctx = { id, username, fileId, pdfUrl };
    this._file = null;

    MODAL.sheet('Replace PDF — ' + username,
      '<div class="banner banner-warning"><i class="ph ph-warning"></i><span>' +
        'The file in Drive is <b>overwritten in place</b>. The URL the student already has will point at the new content the moment you finish. ' +
        'A backup of the original is kept for 30 days.' +
      '</span></div>' +
      '<dl class="dl mb4">' +
        '<div><dt>Student</dt><dd class="mono">' + esc(username) + '</dd></div>' +
        '<div><dt>Drive file</dt><dd class="mono" style="overflow-wrap:anywhere">' + esc(fileId) + '</dd></div>' +
      '</dl>' +
      '<div class="field"><span class="field-label">Step 1 — get the original</span>' +
        '<div class="flex g2 wrap mt2">' +
          '<button class="btn btn-secondary btn-sm" data-on-click="SUBJ_PDF.downloadOriginal()"><i class="ph ph-download-simple"></i> Download original</button>' +
          '<button class="btn btn-secondary btn-sm" data-on-click="openPdf(\'' + escAttrJs(id) + '\',\'' + escAttrJs(username) + '\')"><i class="ph ph-eye"></i> View the original</button>' +
          '<button class="btn btn-primary btn-sm" data-on-click="MODAL.close(\'sheet\');PDF_ANNOTATE.open(\'' + escAttrJs(id) + '\',\'' + escAttrJs(username) + '\',\'' + escAttrJs(pdfUrl) + '\')"><i class="ph ph-highlighter-circle"></i> Mark it here instead</button>' +
        '</div>' +
        '<span class="field-hint mt2">Annotate in this console, or in any external PDF editor and save the copy to your device.</span>' +
      '</div>' +
      '<div class="field"><span class="field-label">Step 2 — upload the replacement</span>' +
        '<label class="file-drop" for="pdf-replace-file" style="margin-top:var(--sp-2)">' +
          '<input type="file" id="pdf-replace-file" accept="application/pdf,.pdf" data-on-change="SUBJ_PDF.onFile(this)">' +
          '<i class="ph ph-file-pdf fd-icon"></i>' +
          '<span class="fd-main" id="pdf-replace-name">Choose the updated PDF</span>' +
          '<span class="fd-sub">Must be a PDF · under 10 MB</span>' +
        '</label>' +
      '</div>' +
      '<div class="flex g2 mt4">' +
        '<button class="btn btn-quiet" style="flex:1" data-on-click="MODAL.close(\'sheet\')">Cancel</button>' +
        '<button class="btn btn-primary" style="flex:1" id="pdf-replace-go" disabled data-on-click="SUBJ_PDF.commit()">Upload &amp; replace</button>' +
      '</div>',
      { wide:false });
  },

  async downloadOriginal(){
    if (!this._ctx) return;
    const name = (this._ctx.username || 'submission') + '_original.pdf';
    TOAST.show('Preparing the download', 'info', 2000);
    BUSY.start();
    try {
      const res = await fetchSubmissionPdf(this._ctx.id);
      const chars = atob(res.base64);
      const bytes = new Uint8Array(chars.length);
      for (let i = 0; i < chars.length; i++) bytes[i] = chars.charCodeAt(i);
      const url = URL.createObjectURL(new Blob([bytes], { type:'application/pdf' }));
      const a = document.createElement('a');
      a.href = url; a.download = name;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
      TOAST.show('Downloaded', 'success');
    } catch(e){ TOAST.show(e.message || 'Download failed', 'error', 6000); }
    BUSY.stop();
  },

  onFile(input){
    const f = input.files && input.files[0];
    if (!f) return;
    if (f.size > 10 * 1024 * 1024) {
      TOAST.show('That file is over 10 MB', 'error', 5000);
      input.value = '';
      $('pdf-replace-name').textContent = 'Choose the updated PDF';
      this._file = null;
      $('pdf-replace-go').disabled = true;
      return;
    }
    const looksLikePdf = f.type === 'application/pdf' || /\.pdf$/i.test(f.name);
    if (!looksLikePdf) {
      TOAST.show('That is not a PDF', 'error', 5000);
      input.value = '';
      $('pdf-replace-name').textContent = 'Choose the updated PDF';
      this._file = null;
      $('pdf-replace-go').disabled = true;
      return;
    }
    this._file = f;
    $('pdf-replace-name').textContent = f.name + ' · ' + (f.size / 1024).toFixed(0) + ' KB';
    $('pdf-replace-go').disabled = false;
  },

  async commit(){
    if (!this._file || !this._ctx) return;
    const ctx = this._ctx;
    const file = this._file;

    const ok = await CONFIRM.ask({
      title: 'Replace the PDF',
      body: 'The Drive file is <b>overwritten</b>. <b>' + esc(ctx.username) + '</b> will see the new version immediately. ' +
            'A backup of the original is kept for 30 days.',
      confirmText: 'Replace', tone: 'danger'
    });
    if (!ok) return;

    const btn = $('pdf-replace-go');
    btn.classList.add('loading');
    BUSY.start();
    try {
      const dataUrl = await new Promise((res, rej) => {
        const r = new FileReader();
        r.onload = () => res(r.result);
        r.onerror = () => rej(new Error('Could not read that file.'));
        r.readAsDataURL(file);
      });

      const res = await ADMIN.post('adminReplaceSubmissionPdf', {
        id: ctx.id,
        fileId: ctx.fileId,
        fileData: dataUrl,
        filename: file.name
      });
      if (!res.success) throw new Error(res.error || 'Replace failed.');

      TOAST.show('PDF replaced — ' + ctx.username + ' now sees the updated version', 'success', 5000);
      MODAL.close('sheet');

      await SUBJ_STORE.load(true);
      if (SUBJ_TABS.current === 'qotd') SUBJ_QOTD.render();
      if (SUBJ_TABS.current === 'exam') SUBJ_EXAM.render();
    } catch(e){
      TOAST.show(e.message || 'Could not replace that PDF', 'error', 6000);
    }
    BUSY.stop();
    btn.classList.remove('loading');
  }
};

/* ═══════════════ MARKING A PAPER — adapter over the shared viewer ═══════
   The console no longer ships its own PDF surface. It opens the same
   pdf-viewer.js the students read with, in annotation mode, so both sides
   see identical rendering, zoom, paging and find. This module only does the
   part that is genuinely admin-specific: take the ink overlays the viewer
   produces, stamp them onto the ORIGINAL PDF with pdf-lib, and upload the
   result through adminReplaceSubmissionPdf.

   Stamping rather than flattening is what keeps the student's scan sharp and
   its text selectable. Pages that were never marked keep their exact bytes.
   ═══════════════════════════════════════════════════════════════════════ */
const PDF_ANNOTATE = {
  ctx: null,

  open(id, username, pdfUrl){
    if (typeof PDFVIEW === 'undefined') {
      return TOAST.show('The PDF viewer did not load — reload the page and try again', 'error', 6000);
    }
    if (typeof PDFLib === 'undefined') {
      return TOAST.show('pdf-lib did not load, so marks cannot be saved — check your connection and reload', 'error', 6000);
    }
    const fileId = driveFileId(pdfUrl);
    if (!fileId) return TOAST.show('That submission has no Drive file to mark', 'error');

    this.ctx = { id, username, fileId, pdfUrl };
    PDFVIEW.open({
      title: 'Marking — ' + username,
      filename: 'marked_' + username + '.pdf',
      annotate: {
        saveLabel: 'Save & send',
        autosave: false,          /* an explicit save — this overwrites their paper */
        onSave: (overlays, info) => PDF_ANNOTATE._commit(overlays, info)
      },
      load: async () => {
        const res = await fetchSubmissionPdf(id);
        return { base64: res.base64, filename: res.filename };
      }
    });
  },

  close(){ if (typeof PDFVIEW !== 'undefined') PDFVIEW.close(); },

  /* Returns true on success; anything else leaves the viewer's save chip in
     its failed state with the marks still on screen. */
  async _commit(overlays, info){
    const ctx = this.ctx;
    if (!ctx) return false;
    if (!overlays.length) { TOAST.show('Nothing has been marked yet', 'warning'); return false; }

    const ok = await CONFIRM.ask({
      title: 'Send the marked paper',
      body: 'This replaces the paper <b>' + esc(ctx.username) + '</b> sees, on ' +
            plural(overlays.length, 'page') + '. Your marks go on top of their original pages, ' +
            'so the scan keeps its quality. The original is backed up automatically.',
      confirmText: 'Save & send', tone: 'danger'
    });
    if (!ok) return false;

    BUSY.start();
    try {
      const bytes = await this._stamp(overlays, info);
      let binary = '';
      const CHUNK = 0x8000;
      for (let i = 0; i < bytes.length; i += CHUNK) {
        binary += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
      }
      const res = await ADMIN.post('adminReplaceSubmissionPdf', {
        id: ctx.id, fileId: ctx.fileId,
        fileData: 'data:application/pdf;base64,' + btoa(binary),
        filename: 'marked_' + ctx.username + '.pdf'
      });
      if (!res.success) throw new Error(res.error || 'The server refused the upload.');

      TOAST.show(ctx.username + ' can now see the marked paper', 'success', 5000);
      await SUBJ_STORE.load(true);
      if (SUBJ_TABS.current === 'qotd') SUBJ_QOTD.render();
      if (SUBJ_TABS.current === 'exam') SUBJ_EXAM.render();
      return true;
    } catch(e){
      TOAST.show(e.message || 'Could not save the marked paper', 'error', 7000);
      return false;
    } finally {
      BUSY.stop();
    }
  },

  /* The ink overlays arrive as data URLs; extract the base64 payload with a
     clear error rather than letting a malformed string throw a TypeError
     deep inside pdf-lib with no clue what went wrong. */
  _base64FromDataUrl(dataUrl){
    const s = String(dataUrl || '');
    const i = s.indexOf(',');
    if (i < 0 || i === s.length - 1) throw new Error('A mark overlay arrived without data.');
    return s.slice(i + 1);
  },

  /* Overlay-on-original where possible; flatten only if pdf-lib cannot
     reopen the file or a page is rotated, and say so when that happens. */
  async _stamp(overlays, info){
    try {
      const doc = await PDFLib.PDFDocument.load(info.bytes.slice());
      const pages = doc.getPages();
      if (pages.length !== info.pageCount) throw new Error('page count mismatch');
      for (const o of overlays) {
        const page = pages[o.page - 1];
        if (!page) throw new Error('missing page ' + o.page);
        if (((page.getRotation().angle % 360) + 360) % 360 !== 0) throw new Error('rotated page');
        const base64 = this._base64FromDataUrl(o.dataUrl);
        const png = await doc.embedPng(Uint8Array.from(atob(base64), c => c.charCodeAt(0)));
        const size = page.getSize();
        page.drawImage(png, { x: 0, y: 0, width: size.width, height: size.height });
      }
      return await doc.save();
    } catch(e){
      console.warn('[marking] overlay failed, flattening instead:', e && e.message);
      TOAST.show('This PDF could not take an overlay, so it is being flattened to images.', 'warning', 6000);
      return await this._flatten(overlays, info);
    }
  },

  /* Flatten at three quality tiers, stopping as soon as the output fits
     inside the upload ceiling. A 30-page paper at scale 2 hits 9–12 MB,
     over what the endpoint and the browser's own file input will accept —
     degrading quality is better than failing the whole save. */
  async _flatten(overlays, info){
    if (typeof pdfjsLib === 'undefined') throw new Error('The PDF engine is not available.');
    const src = await pdfjsLib.getDocument({ data: info.bytes.slice() }).promise;
    const byPage = {};
    overlays.forEach(o => { byPage[o.page] = o; });

    const MAX_BYTES = 8 * 1024 * 1024;
    const tiers = [
      { scale: 2.0, quality: 0.92 },
      { scale: 1.6, quality: 0.80 },
      { scale: 1.3, quality: 0.65 }
    ];

    let lastBytes = null;
    try {
      for (let t = 0; t < tiers.length; t++) {
        const { scale, quality } = tiers[t];
        const out = await PDFLib.PDFDocument.create();
        for (let n = 1; n <= src.numPages; n++) {
          const page = await src.getPage(n);
          const vp = page.getViewport({ scale });
          const c = document.createElement('canvas');
          c.width = Math.round(vp.width); c.height = Math.round(vp.height);
          const cx = c.getContext('2d');
          await page.render({ canvasContext: cx, viewport: vp }).promise;
          if (byPage[n]) {
            await new Promise(res => {
              const img = new Image();
              img.onload = () => { cx.drawImage(img, 0, 0, c.width, c.height); res(); };
              img.onerror = res;
              img.src = byPage[n].dataUrl;
            });
          }
          const jpeg = c.toDataURL('image/jpeg', quality);
          const emb = await out.embedJpg(Uint8Array.from(atob(jpeg.split(',')[1]), ch => ch.charCodeAt(0)));
          const p = out.addPage([emb.width, emb.height]);
          p.drawImage(emb, { x: 0, y: 0, width: emb.width, height: emb.height });
        }
        const bytes = await out.save();
        lastBytes = bytes;
        if (bytes.length <= MAX_BYTES) return bytes;
        if (t < tiers.length - 1) {
          TOAST.show('Paper is large — re-rendering at lower quality to fit the upload limit.', 'warning', 4000);
        }
      }
    } finally {
      try { src.destroy(); } catch(e){}
    }

    const mb = (lastBytes ? (lastBytes.length / 1048576).toFixed(1) : '8+');
    throw new Error('This paper is too long to flatten inside the browser — the smallest copy is ' + mb +
      ' MB, over the 8 MB upload limit. Use "Replace PDF" to upload a compressed copy instead.');
  }
};

/* Answer PDFs live in the SubjectiveAnswers Drive folder, which
   adminDownloadScreenshot deliberately refuses to read — it only serves
   files from PaymentScreenshots. adminDownloadSubmissionPdf is the endpoint
   for these, it is gated on subjective_view rather than screenshots, and it
   takes the submission id instead of a Drive URL. */
async function fetchSubmissionPdf(id){
  const res = await ADMIN.post('adminDownloadSubmissionPdf', { id });
  if (!res.success) throw new Error(res.error || 'Could not fetch that PDF.');
  return res;
}

async function openPdf(id, username){
  if (!id) return TOAST.show('No PDF was attached to this submission', 'warning');

  if (window.PDFVIEW) {
    PDFVIEW.open({
      title: username ? 'Answer paper — ' + username : 'Answer paper',
      filename: (username || 'submission') + '.pdf',
      load: async () => {
        const res = await fetchSubmissionPdf(id);
        return { base64: res.base64, filename: res.filename };
      }
    });
    return;
  }

  TOAST.show('Loading the answer PDF', 'info', 2000);
  try {
    const res = await fetchSubmissionPdf(id);
    const chars = atob(res.base64);
    const bytes = new Uint8Array(chars.length);
    for (let i = 0; i < chars.length; i++) bytes[i] = chars.charCodeAt(i);
    const url = URL.createObjectURL(new Blob([bytes], { type: res.mimeType || 'application/pdf' }));
    const tab = window.open(url, '_blank');
    if (!tab) TOAST.show('Your browser blocked the pop-up — allow pop-ups for this site', 'error', 6000);
    setTimeout(() => URL.revokeObjectURL(url), 300000);
  } catch(e){
    TOAST.show(e.message || 'Could not open that PDF', 'error', 6000);
  }
}

const SUBJADMIN = {
  _preview: [],
  parse(){
    const raw = $('sp-raw').value.trim();
    if (!raw) return TOAST.show('Paste some question text first', 'warning');
    if (typeof SUBJ_SMART === 'undefined') return TOAST.show('subjective.js has not loaded', 'error');
    const items = SUBJ_SMART.preview(raw);
    if (!items.length) return TOAST.show('Nothing recognised — each question needs to start with a number, Qn. or a bullet', 'warning', 6000);
    this._preview = items.map(it => ({ ...it, keep:true, chapterId: it.suggestedChapter || 'structure', groupKey: it.suggestedGroup || 'A' }));
    this._render();
    $('sp-commit').disabled = false;
    $('sp-status').textContent = 'Found ' + plural(items.length, 'question') + ' — check them, then add';
  },
  _render(){
    const wrap = $('sp-preview');
    const CH = (typeof SUBJECTIVE_CHAPTERS !== 'undefined') ? SUBJECTIVE_CHAPTERS : [];
    const kept = this._preview.filter(x => x.keep).length;
    wrap.innerHTML = '<div class="t-cap mb2">' + kept + ' of ' + this._preview.length + ' will be added. Low-confidence guesses have a red edge — check the chapter before adding.</div>' +
      this._preview.map((it, i) => {
        const conf = it.confidence >= 3 ? 'high' : it.confidence >= 1 ? 'mid' : 'low';
        const opts = CH.map(c => '<option value="' + escAttrJs(c.id) + '"' + (c.id === it.chapterId ? ' selected' : '') + '>' + esc(c.name) + '</option>').join('');
        return '<div class="sp-row ' + conf + (it.keep ? '' : ' dropped') + '">' +
          '<div class="n">' + (i + 1) + '</div>' +
          '<div class="q">' + esc(it.question) + '</div>' +
          '<select class="select" aria-label="Chapter for question ' + (i + 1) + '" data-on-change="SUBJADMIN._setChapter(' + i + ', this.value)">' + opts + '</select>' +
          '<input class="input" type="number" min="1" max="40" value="' + it.marks + '" aria-label="Marks for question ' + (i + 1) + '" data-on-change="SUBJADMIN._setMarks(' + i + ', this.value)">' +
          '<button class="icon-btn sm ' + (it.keep ? 'danger' : '') + '" data-on-click="SUBJADMIN._drop(' + i + ')" aria-label="' + (it.keep ? 'Skip' : 'Include') + ' question ' + (i + 1) + '"><i class="ph ' + (it.keep ? 'ph-x' : 'ph-arrow-counter-clockwise') + '"></i></button>' +
        '</div>';
      }).join('');
  },
  _setChapter(i, v){
    this._preview[i].chapterId = v;
    const g = { structure:'A', geotech:'A', irrigationAndCo:'B', transportAndCo:'C', publicHealth:'D', miscellaneous:'D' };
    this._preview[i].groupKey = g[v] || 'A';
  },
  _setMarks(i, v){ this._preview[i].marks = Math.max(1, Math.min(40, parseInt(v, 10) || 10)); },
  _drop(i){ this._preview[i].keep = !this._preview[i].keep; this._render(); },

  async _onChapterChange(fileId){
    const sel = $('sp-section'), newInput = $('sp-section-new');
    const base = '<option value="">Default bucket</option><option value="__NEW__">Create a new section</option>';
    if (newInput) newInput.classList.add('hidden');
    if (!fileId) { if (sel) sel.innerHTML = base; return; }
    if (sel) sel.innerHTML = '<option value="">Loading sections…</option>';
    try {
      const r = await ADMIN.post('getFile', { fileId });
      if (!r.success) throw new Error(r.error || 'Could not open that file.');
      const sections = (r.result && Array.isArray(r.result.sections))
        ? r.result.sections.map(s => String(s.section || '')).filter(Boolean) : [];
      if (sel) sel.innerHTML = '<option value="">Default bucket</option>' +
        sections.map(n => '<option value="' + escAttrJs(n) + '">' + esc(n) + '</option>').join('') +
        '<option value="__NEW__">Create a new section</option>';
    } catch(e){
      if (sel) sel.innerHTML = base;
      TOAST.show('Could not read the sections in that file: ' + e.message, 'warning', 5000);
    }
  },
  _onSectionChange(v){
    const el = $('sp-section-new');
    if (!el) return;
    el.classList.toggle('hidden', v !== '__NEW__');
    if (v === '__NEW__') el.focus();
  },

  async commit(){
    const fileId = $('sp-target').value || '';
    if (!fileId) return TOAST.show('Choose a chapter file first', 'error');
    let section = $('sp-section').value;
    if (section === '__NEW__') {
      section = ($('sp-section-new').value || '').trim();
      if (!section) return TOAST.show('Name the new section', 'error');
    }
    const items = this._preview.filter(x => x.keep).map(x => ({ chapterId:x.chapterId, groupKey:x.groupKey, question:x.question, marks:x.marks }));
    if (!items.length) return TOAST.show('Every question is skipped — include at least one', 'warning');
    BUSY.start();
    try {
      const r = await ADMIN.post('adminCommitSubjectiveImport', { fileId, section, items: JSON.stringify(items) });
      if (!r.success) throw new Error(r.error || 'Could not add those questions.');
      TOAST.show(r.inserted + ' added' + (r.skipped ? ', ' + r.skipped + ' skipped as duplicates' : ''), 'success', 5000);
      $('sp-commit').disabled = true;
      $('sp-status').textContent = 'Added ' + r.inserted + ' to "' + (r.section || 'the default bucket') + '"';
    } catch(e){ TOAST.show(e.message, 'error', 6000); }
    BUSY.stop();
  },
  clear(){
    $('sp-raw').value = ''; $('sp-preview').innerHTML = ''; $('sp-status').textContent = '';
    $('sp-commit').disabled = true;
    this._preview = [];
  },
  _populateFilters(){
    const target = $('sp-target');
    if (!target || target.dataset.populated) return;
    const refs = (window.SUBJECTIVE_FILE_REFS || []).filter(r => r.fileId && !/^REPLACE_WITH/.test(r.fileId));
    target.innerHTML = refs.length
      ? '<option value="">Choose a chapter</option>' + refs.map(r => '<option value="' + escAttrJs(r.fileId) + '">' + esc(r.name) + ' — group ' + esc(r.group) + '</option>').join('')
      : '<option value="">No chapters configured — edit subjective-data.js</option>';
    target.dataset.populated = '1';
  }
};

const SUBJ_UPLOAD = {
  _pending: null,
  onFile(input){
    const f = input.files && input.files[0];
    if (!f) return;
    if (f.size > 5 * 1024 * 1024) { TOAST.show('That file is over 5 MB', 'error'); input.value = ''; return; }
    $('subj-upload-name').textContent = f.name;
    const r = new FileReader();
    r.onload = e => { this._pending = { dataUrl: e.target.result, filename: f.name }; };
    r.onerror = () => TOAST.show('Could not read that file', 'error');
    r.readAsDataURL(f);
  },
  clear(){
    this._pending = null;
    $('subj-upload-file').value = '';
    $('subj-upload-name').textContent = 'Choose a JSON file';
    $('subj-upload-result').innerHTML = '';
  },
  async upload(){
    if (!this._pending) return TOAST.show('Choose a JSON file first', 'warning');
    BUSY.start();
    try {
      const r = await ADMIN.post('adminUploadSubjectiveFile', { fileData: this._pending.dataUrl, filename: this._pending.filename });
      if (!r.success) throw new Error(r.error || 'Upload failed.');
      $('subj-upload-result').innerHTML =
        '<div class="banner banner-accent" style="align-items:center"><i class="ph ph-check-circle"></i>' +
        '<span>Uploaded ' + plural(r.questionCount, 'question') + '. File ID <code class="mono">' + esc(r.fileId) + '</code>' +
        '<button class="copy-btn" data-on-click="copyText(\'' + escAttrJs(r.fileId) + '\',\'File ID copied\')" aria-label="Copy file ID"><i class="ph ph-copy"></i></button></span></div>';
      TOAST.show('Uploaded — paste the file ID into subjective-data.js', 'success', 6000);
    } catch(e){ TOAST.show(e.message, 'error', 6000); }
    BUSY.stop();
  }
};

const IMPORT = {
  onFilePicked(){
    const file = $('imp-file').files?.[0];
    if (!file) return;
    $('imp-file-name').textContent = file.name;
    const r = new FileReader();
    r.onload = e => { $('imp-json').value = e.target.result; };
    r.onerror = () => TOAST.show('Could not read that file', 'error');
    r.readAsText(file);
  },
  clear(){
    $('imp-file').value = '';
    $('imp-file-name').textContent = 'Drop a .json export here, or choose a file';
    $('imp-json').value = '';
    $('imp-mode').value = 'preview';
    $('imp-result').innerHTML = '';
  },
  async run(){
    const raw = $('imp-json').value.trim();
    const mode = $('imp-mode').value;
    const out = $('imp-result');
    if (!raw) return TOAST.show('Choose a file or paste the JSON first', 'error');
    let payload;
    try { payload = JSON.parse(raw); } catch(e){ return TOAST.show('That is not valid JSON', 'error'); }

    if (mode !== 'preview') {
      const ok = await CONFIRM.ask({
        title: mode === 'replace' ? 'Replace progress' : 'Merge progress',
        body: mode === 'replace'
          ? 'This overwrites each student\u2019s existing progress. A backup is taken first.'
          : 'This combines the imported data into each student\u2019s existing progress.',
        confirmText: mode === 'replace' ? 'Replace' : 'Merge', tone:'danger'
      });
      if (!ok) return;
    }
    BUSY.start();
    try {
      const res = await ADMIN.post('adminImportProgress', { mode, payload: JSON.stringify(payload) });
      if (!res.success) throw new Error(res.error || 'Import failed.');
      const errs = res.errors || [];
      out.innerHTML = '<div class="panel" style="margin:0;background:var(--bg-grouped)">' +
        '<div class="t-callout mb3"><b>' + (res.preview ? 'Preview' : (mode === 'replace' ? 'Replaced' : 'Merged')) + '</b> · import <span class="mono">' + esc(res.importId) + '</span></div>' +
        '<dl class="dl">' +
          '<div><dt>Records read</dt><dd class="mono">' + (res.recordsReceived ?? '—') + '</dd></div>' +
          '<div><dt>Accepted</dt><dd class="mono" style="color:var(--success)">' + (res.recordsAccepted ?? '—') + '</dd></div>' +
          '<div><dt>Skipped</dt><dd class="mono" style="color:var(--danger)">' + (res.recordsSkipped ?? 0) + '</dd></div>' +
        '</dl>' +
        (errs.length ? '<div class="sub-q mono" style="max-height:180px">' + errs.slice(0, 50).map(e => esc((e.username || 'row ' + e.index) + ': ' + e.error)).join('\n') +
          (errs.length > 50 ? '\n…and ' + (errs.length - 50) + ' more' : '') + '</div>' : '') +
      '</div>';
      if (res.preview) TOAST.show('Preview only — nothing was changed', 'info', 4000);
      else { TOAST.show(plural(res.recordsAccepted, 'record') + ' ' + (mode === 'replace' ? 'replaced' : 'merged'), 'success'); ADMIN.refresh(['logs']); }
    } catch(e){
      out.innerHTML = '<div class="banner banner-danger"><i class="ph ph-warning-circle"></i><span>' + esc(e.message) + '</span></div>';
    }
    BUSY.stop();
  }
};

/* ═══════════════════════════════════════════════════════════════════════
   LKS_ADMIN — the Loksewa mark scheme editor (Settings). Saved as the public setting `loksewaScheme`.
   Students' apps pick it up with the public info they already fetch. Rules are shared with the app
   (normalizeLoksewaScheme in shared.js) and checked again on the server.
   ═══════════════════════════════════════════════════════════════════════ */
const LKS_ADMIN = {
  rows: [],

  /* levels and the chapters in each, from the chapter list the console already loads */
  _catalog(){
    const levels = new Map();
    try {
      ChapterData.allFileRefs().forEach(r => {
        if (!levels.has(r.lv)) levels.set(r.lv, { id: r.lv, label: ChapterData.levelLabel(r.lv), chapters: new Map() });
        const L = levels.get(r.lv);
        if (!L.chapters.has(r.ch)) L.chapters.set(r.ch, ChapterData.chapterName(r.lv, r.ch) || r.ch);
      });
    } catch(e){}
    return levels;
  },

  load(stored){
    const sch = normalizeLoksewaScheme(stored || '');
    this.rows = sch.groups.map(g => ({ name: g.name, marks: g.marks, level: g.level, chapters: g.chapters.slice() }));
    this.render();
  },

  _sync(){        /* read the form back into this.rows */
    document.querySelectorAll('#lks-rows .lks-row').forEach((el, i) => {
      const r = this.rows[i]; if (!r) return;
      r.name = el.querySelector('.lks-name').value;
      r.marks = el.querySelector('.lks-marks').value;
      r.level = el.querySelector('.lks-level').value;
      r.chapters = [...el.querySelectorAll('.lks-ch:checked')].map(c => c.value);
    });
  },

  render(){
    const box = $('lks-rows'); if (!box) return;
    const cat = this._catalog();
    const levelOpts = sel => [...cat.values()].map(L => '<option value="' + esc(L.id) + '"' + (sel === L.id ? ' selected' : '') + '>' + esc(L.label) + '</option>').join('') +
      (cat.has(sel) || !sel ? '' : '<option value="' + esc(sel) + '" selected>' + esc(sel) + ' (not in the chapter list)</option>');
    box.innerHTML = this.rows.map((r, i) => {
      const L = cat.get(r.level);
      const chapters = L ? [...L.chapters.entries()] : [];
      return '<div class="lks-row" style="border:1px solid var(--sep);border-radius:var(--r-card);padding:var(--sp-3);margin-bottom:var(--sp-2)">' +
        '<div class="field-row">' +
          '<div class="field"><label for="lks-n' + i + '">Group name</label><input class="input lks-name" id="lks-n' + i + '" type="text" maxlength="60" value="' + esc(r.name) + '" placeholder="Structural Engineering" data-on-input="LKS_ADMIN._changed()"></div>' +
          '<div class="field"><label for="lks-m' + i + '">Marks</label><input class="input lks-marks" id="lks-m' + i + '" type="number" min="1" max="100" inputmode="numeric" value="' + esc(r.marks) + '" data-on-input="LKS_ADMIN._changed()"></div>' +
        '</div>' +
        '<div class="field"><label for="lks-l' + i + '">Level</label><select class="select lks-level" id="lks-l' + i + '" data-on-change="LKS_ADMIN._levelChanged(' + i + ')">' + levelOpts(r.level) + '</select></div>' +
        '<details' + (r.chapters.length ? ' open' : '') + '><summary class="t-callout" style="cursor:pointer">' +
          (r.chapters.length ? r.chapters.length + ' chapter' + (r.chapters.length === 1 ? '' : 's') + ' selected' : 'All chapters of this level') + '</summary>' +
          '<div class="t-foot mt2 mb2">Tick chapters to limit this group to them. Leave all unticked to use every chapter of the level.</div>' +
          '<div style="display:grid;gap:6px">' + (chapters.length ? chapters.map(([id, name]) =>
            '<label class="perm-row"><input type="checkbox" class="lks-ch" value="' + esc(id) + '"' + (r.chapters.indexOf(id) !== -1 ? ' checked' : '') + ' data-on-change="LKS_ADMIN._changed()"><span>' + esc(name) + '</span></label>').join('')
            : '<span class="t-foot">No chapters are loaded for this level.</span>') + '</div>' +
        '</details>' +
        (this.rows.length > 1 ? '<div class="mt2"><button class="btn btn-quiet btn-sm" data-on-click="LKS_ADMIN.removeRow(' + i + ')"><i class="ph ph-trash"></i> Remove this group</button></div>' : '') +
      '</div>';
    }).join('');
    this._changed();
  },

  _changed(){
    this._sync();
    const total = this.rows.reduce((n, r) => n + (Math.round(Number(r.marks)) || 0), 0);
    const t = $('lks-total'); if (t) t.textContent = 'Total: ' + total + ' marks';
  },
  _levelChanged(i){ this._sync(); this.rows[i].chapters = []; this.render(); },
  addRow(){ this._sync(); const cat = this._catalog(); this.rows.push({ name: '', marks: 10, level: (cat.keys().next().value) || 'level7', chapters: [] }); this.render(); },
  removeRow(i){ this._sync(); this.rows.splice(i, 1); this.render(); },

  /* what is wrong with the form, or '' (rules are in shared.js, and unit-tested) */
  problem(){ this._sync(); return loksewaSchemeConflict(this.rows); },

  async save(){
    const bad = this.problem();
    if (bad) return TOAST.show(bad, 'warning', 5000);
    const scheme = { version: 1, groups: this.rows.map(r => ({ name: String(r.name).trim(), marks: Math.round(Number(r.marks)), level: r.level, chapters: r.chapters })) };
    await this._store(JSON.stringify(scheme), 'Mark scheme saved. Students get it the next time they open the app online.');
  },
  async useDefault(){
    const ok = await CONFIRM.ask({ title: 'Go back to the default?', body: 'The daily paper returns to the built-in split: 25 General Knowledge + the 50 Level 7 marks by topic (Engineering Survey 7, Construction Materials 6, Geotechnical 6, Construction Management 6, Structural Analysis 5, Concrete Technology 5, Estimating and Costing 5, Engineering Drawing 4, Engineering Economics 3, Professional Practices 3).', confirmText: 'Use the default' });
    if (!ok) return;
    await this._store('', 'Back to the default scheme.');
    this.load('');
  },
  async _store(value, message){
    const btn = $('lks-save'); if (btn) btn.classList.add('loading');
    try {
      const res = await ADMIN.post('adminUpdateSettings', { key: 'loksewaScheme', value });
      if (!res.success) throw new Error(res.error || 'Could not save.');
      ADMIN.data.settings = Object.assign({}, ADMIN.data.settings || {}, { loksewaScheme: value });
      TOAST.show(message, 'success', 4500);
    } catch(e){ TOAST.show(e.message, 'error', 6000); }
    if (btn) btn.classList.remove('loading');
  }
};

const SETTINGS = {
  load(){
    const s = ADMIN.data.settings || {};
    $('set-name').value = s.appName || '';
    $('set-qr').value = s.qrCodeUrl || '';
    $('set-phone').value = s.contactPhone || '';
    $('set-amount').value = s.paymentAmount || '';
    $('set-inst').value = s.paymentInstructions || '';
    $('set-announce').value = s.announcement || '';
    $('set-eta').value = s.paymentEta || '';
    $('set-trial').value = s.trialHours || '';
    try { LKS_ADMIN.load(s.loksewaScheme); } catch(e){}
    const preview = $('set-qr-preview'), status = $('set-qr-status');
    if (s.qrCodeUrl) {
      preview.src = s.qrCodeUrl; preview.hidden = false;
      status.textContent = s.qrCodeUrl.startsWith('data:image')
        ? 'A QR image is saved'
        : 'Currently an external link — students may not see it. Upload the image instead.';
    } else { preview.hidden = true; status.textContent = 'No QR uploaded yet'; }
  },

  onQrFile(evt){
    const file = evt.target.files[0];
    if (!file) return;
    const status = $('set-qr-status');
    status.textContent = 'Processing…';
    const LIMIT = 48000;
    const attempts = [
      { max:600, q:.85 }, { max:600, q:.6 }, { max:450, q:.6 },
      { max:450, q:.4 }, { max:320, q:.5 }, { max:320, q:.3 }
    ];
    const reader = new FileReader();
    reader.onload = e => {
      const img = new Image();
      img.onload = () => {
        let best = null;
        for (const a of attempts) {
          const scale = Math.min(1, a.max / Math.max(img.width, img.height));
          const c = document.createElement('canvas');
          c.width = Math.round(img.width * scale);
          c.height = Math.round(img.height * scale);
          const ctx = c.getContext('2d');
          ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
          ctx.drawImage(img, 0, 0, c.width, c.height);
          const url = c.toDataURL('image/jpeg', a.q);
          if (url.length <= LIMIT) { best = url; break; }
          if (!best || url.length < best.length) best = url;
        }
        if (!best || best.length > LIMIT) {
          status.textContent = 'Still too large at the lowest quality — crop the image to just the QR square and try again.';
          return;
        }
        $('set-qr').value = best;
        $('set-qr-preview').src = best;
        $('set-qr-preview').hidden = false;
        status.textContent = 'Ready — save changes to publish it';
      };
      img.onerror = () => { status.textContent = 'That image could not be read.'; };
      img.src = e.target.result;
    };
    reader.onerror = () => { status.textContent = 'That file could not be read.'; };
    reader.readAsDataURL(file);
  },

  async save(){
    const amount = parseInt($('set-amount').value, 10);
    const trial = parseInt($('set-trial').value, 10);
    if (isNaN(amount) || amount < 1) { $('set-amount').classList.add('invalid'); $('set-amount').focus(); return TOAST.show('Enter a payment amount of at least 1', 'error'); }
    if (isNaN(trial) || trial < 1) { $('set-trial').classList.add('invalid'); $('set-trial').focus(); return TOAST.show('Enter a trial length of at least 1 hour', 'error'); }
    $('set-amount').classList.remove('invalid'); $('set-trial').classList.remove('invalid');

    const settings = [
      { key:'appName', value: $('set-name').value.trim() },
      { key:'qrCodeUrl', value: $('set-qr').value.trim() },
      { key:'contactPhone', value: $('set-phone').value.trim() },
      { key:'paymentAmount', value: amount },
      { key:'paymentInstructions', value: $('set-inst').value },
      { key:'trialHours', value: trial },
      { key:'paymentEta', value: $('set-eta').value.trim().slice(0, 60) },
      { key:'announcement', value: $('set-announce').value.trim().slice(0, 300) }
    ];
    const btn = $('btn-save-settings');
    btn.classList.add('loading');
    try {
      const res = await ADMIN.post('adminUpdateSettingsBatch', { settings });
      if (res.success) {
        TOAST.show('Changes saved', 'success');
      } else {
        const results = await Promise.all(settings.map(s =>
          ADMIN.post('adminUpdateSettings', { key:s.key, value:s.value })
            .then(r => ({ key:s.key, ok: !!(r && r.success), error: r?.error }))
            .catch(e => ({ key:s.key, ok:false, error: e.message }))
        ));
        const failed = results.filter(r => !r.ok);
        if (!failed.length) TOAST.show('Changes saved', 'success');
        else if (failed.length === settings.length) TOAST.show('Nothing saved: ' + (failed[0].error || 'the server rejected the request'), 'error', 7000);
        else TOAST.show((settings.length - failed.length) + ' of ' + settings.length + ' saved. Failed: ' + failed.map(f => f.key).join(', '), 'warning', 8000);
      }
      ADMIN.refresh(['settings']);
    } catch(e){ TOAST.show('Could not save: ' + e.message, 'error', 6000); }
    btn.classList.remove('loading');
  }
};

const LOGS = {
  _t: null,
  debounced(){ clearTimeout(this._t); this._t = setTimeout(() => this.filter(), 250); },
  filter(){
    const q = $('l-search').value.toLowerCase();
    const f = $('l-filter').value;
    ADMIN.state.lPage = 1;
    this.renderPage(this._rows(q, f));
  },
  _rows(q, f){
    q = q ?? $('l-search').value.toLowerCase();
    f = f ?? $('l-filter').value;
    return (ADMIN.data.logs || []).filter(l => {
      const match = !q || (l.admin || '').toLowerCase().includes(q) || (l.target || '').toLowerCase().includes(q) || (l.action || '').toLowerCase().includes(q);
      return match && (f === 'all' || (l.action || '').toLowerCase().includes(f));
    });
  },
  render(){ this.renderPage(this._rows()); },
  renderPage(rows){
    const per = ADMIN.state.lPerPage;
    const total = Math.ceil(rows.length / per) || 1;
    if (ADMIN.state.lPage > total) ADMIN.state.lPage = total;
    const page = rows.slice((ADMIN.state.lPage - 1) * per, ADMIN.state.lPage * per);
    const el = $('logs-list');
    if (!page.length) {
      el.innerHTML = '<div class="empty"><i class="ph ph-clock-counter-clockwise"></i><div class="t">Nothing here</div>' +
        '<div class="d">' + ((ADMIN.data.logs || []).length ? 'No activity matches this search.' : 'Actions taken in this console will show up here.') + '</div></div>';
      $('l-pg').innerHTML = '';
      return;
    }
    el.innerHTML = page.map(l =>
      '<div class="log"><time datetime="' + esc(l.timestamp) + '" title="' + esc(fullTime(l.timestamp)) + '">' + esc(relTime(l.timestamp)) + '</time>' +
      '<div class="grow"><div><span class="act">' + esc(l.action || 'Action') + '</span> <span class="who">by ' + esc(l.admin || 'unknown') + '</span>' +
      (l.target ? ' <span class="mono dim">' + esc(l.target) + '</span>' : '') + '</div>' +
      (l.details ? '<div class="det">' + esc(l.details) + '</div>' : '') + '</div></div>'
    ).join('');
    PAGINATION.render('l-pg', ADMIN.state.lPage, total, 'LOGS.goPage', rows.length);
  },
  goPage(p){ ADMIN.state.lPage = p; this.renderPage(this._rows()); UI.scrollTop(); }
};

const PAGINATION = {
  render(containerId, current, total, cb, count){
    const el = $(containerId);
    if (!el) return;
    if (total <= 1) { el.innerHTML = ''; return; }
    let html = '<button ' + (current === 1 ? 'disabled' : '') + ' data-on-click="' + cb + '(' + (current - 1) + ')" aria-label="Previous page"><i class="ph ph-caret-left"></i></button>';
    for (let i = 1; i <= total; i++) {
      if (i === 1 || i === total || (i >= current - 1 && i <= current + 1)) {
        html += '<button class="' + (i === current ? 'active' : '') + '"' + (i === current ? ' aria-current="page"' : '') + ' data-on-click="' + cb + '(' + i + ')">' + i + '</button>';
      } else if (i === current - 2 || i === current + 2) html += '<span class="gap">…</span>';
    }
    html += '<button ' + (current === total ? 'disabled' : '') + ' data-on-click="' + cb + '(' + (current + 1) + ')" aria-label="Next page"><i class="ph ph-caret-right"></i></button>';
    html += '<span class="info">' + (count != null ? plural(count, 'result') : 'Page ' + current + ' of ' + total) + '</span>';
    el.innerHTML = html;
  }
};

function paintSort(tableId, key, dir){
  $$('#' + tableId + ' th.sortable').forEach(th => {
    const on = th.dataset.k === key;
    th.classList.toggle('sorted', on);
    th.setAttribute('aria-sort', on ? (dir === 1 ? 'ascending' : 'descending') : 'none');
    const ic = th.querySelector('.sort-ic');
    if (ic) ic.className = 'ph sort-ic ' + (on && dir === -1 ? 'ph-caret-down' : 'ph-caret-up');
  });
}

const USERS = {
  selected: new Set(), _lastIdx: null, _rows: [], _t: null,
  _sortKey: 'createdAt', _sortDir: -1,

  debouncedFilter(){ clearTimeout(this._t); this._t = setTimeout(() => this.filter(), 250); },

  filterBy(status){
    $('u-filter').value = status;
    FSTATE.set('u-filter', status);
    UI.nav('users');
    this.filter();
  },

  sort(key){
    if (this._sortKey === key) this._sortDir *= -1;
    else { this._sortKey = key; this._sortDir = key === 'createdAt' ? -1 : 1; }
    this.filter();
  },

  _visibleRows(){
    const q = ($('u-search').value || '').toLowerCase();
    const f = $('u-filter').value;
    const rows = (ADMIN.data.users || []).filter(u => {
      const match = !q || (u.username || '').toLowerCase().includes(q) ||
                          (u.name || '').toLowerCase().includes(q) ||
                          (u.email || '').toLowerCase().includes(q) ||
                          String(u.mobile || '').includes(q);
      return match && (f === 'all' || u.status === f);
    });
    const k = this._sortKey, d = this._sortDir;
    return rows.sort((a, b) => {
      let av = a[k], bv = b[k];
      if (k === 'name') { av = a.name || a.username; bv = b.name || b.username; }
      if (k === 'createdAt') { av = new Date(av || 0).getTime(); bv = new Date(bv || 0).getTime(); return (av - bv) * d; }
      return String(av || '').localeCompare(String(bv || '')) * d;
    });
  },

  filter(){
    this.selected.clear();
    const all = $('u-chk-all'); if (all) { all.checked = false; all.indeterminate = false; }
    FSTATE.set('u-filter', $('u-filter').value);
    FSTATE.set('u-search', $('u-search').value);
    this._lastIdx = null;
    ADMIN.state.uPage = 1;
    this._rows = this._visibleRows();
    this.renderPage(this._rows);
    this.updateBulkBar();
  },
  clearFilters(){
    $('u-search').value = ''; $('u-filter').value = 'all';
    FSTATE.set('u-search', ''); FSTATE.set('u-filter', 'all');
    this.filter();
  },
  render(){
    $('u-filter').value = FSTATE.get('u-filter', 'all');
    $('u-search').value = FSTATE.get('u-search', '');
    this._rows = this._visibleRows();
    this.renderPage(this._rows);
    this.updateBulkBar();
  },

  renderPage(rows){
    paintSort('users-tbl', this._sortKey, this._sortDir);
    const trunc = $('u-trunc');
    if (trunc) trunc.innerHTML = ADMIN.data.usersTruncated
      ? '<div class="banner banner-warning"><i class="ph ph-warning"></i><span>Showing ' + ADMIN.data.users.length + ' of ' + ADMIN.data.usersTotalCount + ' students. Narrow the search to see the rest.</span></div>' : '';
    const count = $('u-result-count');
    if (count) count.textContent = rows.length === (ADMIN.data.users || []).length ? plural(rows.length, 'student') : plural(rows.length, 'match', 'matches');

    const per = ADMIN.state.uPerPage;
    const total = Math.ceil(rows.length / per) || 1;
    if (ADMIN.state.uPage > total) ADMIN.state.uPage = total;
    const page = rows.slice((ADMIN.state.uPage - 1) * per, ADMIN.state.uPage * per);
    const tb = $('users-body');

    if (!page.length) {
      tb.innerHTML = '<tr><td colspan="7">' + ((ADMIN.data.users || []).length
        ? '<div class="empty"><i class="ph ph-magnifying-glass"></i><div class="t">No students match</div><div class="d">Try a shorter search, or reset the status filter.</div>' +
          '<div class="a"><button class="btn btn-quiet" data-on-click="USERS.clearFilters()">Reset filters</button></div></div>'
        : '<div class="empty"><i class="ph ph-users-three"></i><div class="t">No students yet</div><div class="d">Accounts appear here as soon as someone signs up in the app.</div></div>')
        + '</td></tr>';
      $('u-pg').innerHTML = '';
      return;
    }

    const canManage = ADMIN.can('users_manage');
    tb.innerHTML = page.map(u => {
      const st = u.status || 'trial';
      const un = escAttrJs(u.username);
      return '<tr class="' + (this.selected.has(u.username) ? 'selected' : '') + '">' +
        '<td class="td-check"><input type="checkbox"' + (this.selected.has(u.username) ? ' checked' : '') +
          ' data-on-click="USERS.toggle(\'' + un + '\', event)" aria-label="Select ' + esc(u.username) + '"></td>' +
        '<td class="td-user"><button class="cell-user" data-on-click="USERS.view(\'' + un + '\')" style="text-align:left">' +
          '<span class="avatar">' + esc(initials(u.name || u.username)) + '</span>' +
          '<span style="min-width:0"><span class="nm truncate" style="display:block">' + esc(u.name || u.username) + '</span>' +
          '<span class="un truncate" style="display:block">' + esc(u.username) + '</span></span></button></td>' +
        '<td data-label="Contact"><div class="t-foot" style="color:var(--ink)">' + (esc(u.email) || '—') + '</div>' +
          '<div class="t-cap">' + (esc(u.mobile) || '—') + '</div></td>' +
        '<td data-label="Status">' + badge(st) + '</td>' +
        '<td data-label="Joined"><span title="' + esc(fullTime(u.createdAt)) + '">' + relTime(u.createdAt) + '</span></td>' +
        '<td data-label="Access" class="t-foot">' + esc(this.accessLabel(u)) + '</td>' +
        '<td class="td-actions"><div class="row-actions">' +
          '<button class="icon-btn sm" data-on-click="USERS.view(\'' + un + '\')" aria-label="Open ' + esc(u.username) + '" title="Open"><i class="ph ph-arrow-right"></i></button>' +
          (canManage ? '<button class="icon-btn sm" data-on-click="USERS.edit(\'' + un + '\')" aria-label="Edit ' + esc(u.username) + '" title="Edit"><i class="ph ph-pencil-simple"></i></button>' : '') +
          (canManage ? '<button class="icon-btn sm danger" data-on-click="USERS.del(\'' + un + '\')" aria-label="Delete ' + esc(u.username) + '" title="Delete"><i class="ph ph-trash"></i></button>' : '') +
        '</div></td></tr>';
    }).join('');
    PAGINATION.render('u-pg', ADMIN.state.uPage, total, 'USERS.goPage', rows.length);
  },
  goPage(p){ ADMIN.state.uPage = p; this.renderPage(this._rows); UI.scrollTop(); },

  accessLabel(u){
    if (!u.permanentAccess) return u.status === 'trial' ? 'Free trial' : 'None';
    if (u.accessType === 'yearly') return u.accessExpiresAt ? 'Until ' + new Date(u.accessExpiresAt).toLocaleDateString() : 'One year';
    return 'Permanent';
  },

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
    const on = $('u-chk-all').checked;
    this._rows.forEach(u => on ? this.selected.add(u.username) : this.selected.delete(u.username));
    this.renderPage(this._rows);
    this.updateBulkBar();
  },
  updateBulkBar(){
    const n = this.selected.size;
    $('u-bulk-count').textContent = plural(n, 'student') + ' selected';
    $('u-bulk').classList.toggle('show', n > 0);
    const all = $('u-chk-all');
    if (all) { all.checked = n > 0 && n === this._rows.length; all.indeterminate = n > 0 && n < this._rows.length; }
  },
  clearSelection(){
    this.selected.clear();
    this.renderPage(this._rows);
    this.updateBulkBar();
  },

  async bulkGrantAccess(duration){
    if (!this.selected.size) return;
    const ok = await CONFIRM.ask({
      title:'Grant access',
      body:'Give <b>' + (duration === 'year' ? 'one year' : 'permanent') + '</b> access to <b>' + plural(this.selected.size, 'student') + '</b>?',
      confirmText:'Grant access'
    });
    if (!ok) return;
    const usernames = [...this.selected];
    BUSY.start();
    try {
      const res = await ADMIN.post('adminGrantAccessBatch', { usernames: JSON.stringify(usernames), duration });
      if (!res.success) throw new Error(res.error || 'That did not work.');
      const good = res.results.filter(r => r.success).length;
      const bad = res.results.length - good;
      TOAST.show(good + ' granted' + (bad ? ', ' + bad + ' failed' : ''), bad ? 'warning' : 'success');
    } catch(e){ TOAST.show(e.message, 'error'); }
    BUSY.stop();
    this.selected.clear();
    ADMIN.refresh(['stats','users']);
  },
  async bulkDelete(){
    if (!this.selected.size) return;
    const ok = await CONFIRM.ask({
      title:'Delete students',
      body:'Permanently delete <b>' + plural(this.selected.size, 'account') + '</b>. This removes their progress, payments, weekly attempts, written submissions and backups. There is no undo.',
      confirmText:'Delete ' + this.selected.size, tone:'danger', requireType:'DELETE'
    });
    if (!ok) return;
    const usernames = [...this.selected];
    BUSY.start();
    try {
      const res = await ADMIN.post('adminDeleteUsersBatch', { usernames: JSON.stringify(usernames) });
      if (!res.success) throw new Error(res.error || 'That did not work.');
      const good = res.results.filter(r => r.success).length;
      const bad = res.results.length - good;
      TOAST.show(plural(good, 'account') + ' deleted' + (bad ? ', ' + bad + ' failed' : ''), bad ? 'warning' : 'success');
    } catch(e){ TOAST.show(e.message, 'error'); }
    BUSY.stop();
    this.selected.clear();
    ADMIN.refresh(['stats','users','payments']);
  },

  view(username){
    const u = (ADMIN.data.users || []).find(x => x.username === username);
    if (!u) return;
    const un = escAttrJs(u.username);
    const pay = (ADMIN.data.payments || []).find(p => p.username === username);
    const canManage = ADMIN.can('users_manage');
    const isAdmin = (ADMIN.data.admins || []).some(a => a.username.toLowerCase() === username.toLowerCase());

    $('tt-user').textContent = u.name || u.username;
    $('bd-user').innerHTML =
      '<div class="flex center g3 mb4">' +
        '<span class="avatar lg">' + esc(initials(u.name || u.username)) + '</span>' +
        '<div><div class="t-t3">' + esc(u.name || u.username) + '</div>' +
        '<div class="t-cap mono">' + esc(u.username) +
        '<button class="copy-btn" data-on-click="copyText(\'' + un + '\',\'Username copied\')" aria-label="Copy username"><i class="ph ph-copy"></i></button></div></div>' +
        '<span style="margin-left:auto">' + badge(u.status || 'trial') + '</span>' +
      '</div>' +
      (isAdmin ? '<div class="banner banner-info"><i class="ph ph-shield-check"></i><span>This person is also an admin.</span></div>' : '') +
      '<dl class="dl mb4">' +
        '<div><dt>Email</dt><dd>' + (esc(u.email) || '—') + '</dd></div>' +
        '<div><dt>Mobile</dt><dd>' + (esc(u.mobile) || '—') + '</dd></div>' +
        '<div><dt>Access</dt><dd>' + esc(this.accessLabel(u)) + '</dd></div>' +
        '<div><dt>Email confirmed</dt><dd>' + (u.emailVerified ? 'Yes' : 'Not yet') + '</dd></div>' +
        '<div><dt>Joined</dt><dd>' + esc(fullTime(u.createdAt)) + '</dd></div>' +
        '<div><dt>Trial ends</dt><dd>' + esc(fullTime(u.trialExpiresAt)) + '</dd></div>' +
      '</dl>' +
      (pay
        ? '<h4 class="t-cap mb2">Payment</h4><div class="panel" style="margin:0 0 var(--sp-4);background:var(--bg-grouped);border:none">' +
          '<dl class="dl"><div><dt>Transaction ID</dt><dd class="mono">' + esc(pay.txId) + '</dd></div>' +
          '<div><dt>Status</dt><dd>' + badge(pay.status) + '</dd></div>' +
          (pay.remarks ? '<div><dt>Remarks</dt><dd>' + esc(pay.remarks) + '</dd></div>' : '') + '</dl>' +
          (pay.screenshotUrl && pay.screenshotUrl.startsWith('http')
            ? '<button class="btn btn-secondary btn-sm mt3" data-on-click="ADMIN.downloadScreenshot(\'' + escAttrJs(pay.screenshotUrl) + '\',\'' + un + '_payment.png\')"><i class="ph ph-download-simple"></i> Download screenshot</button>' : '') +
          '</div>'
        : '<p class="t-foot mb4">No payment on record.</p>') +
      (canManage
        ? '<h4 class="t-cap mb2">Grant access</h4><div class="flex g2 mb4 wrap">' +
          '<button class="btn btn-primary grow" data-on-click="USERS.grantAccess(\'' + un + '\',\'permanent\')"><i class="ph ph-infinity"></i> Permanent</button>' +
          '<button class="btn btn-secondary grow" data-on-click="USERS.grantAccess(\'' + un + '\',\'year\')"><i class="ph ph-calendar"></i> One year</button></div>'
        : '') +
      '<div class="flex g2 wrap">' +
        (canManage ? '<button class="btn btn-secondary" data-on-click="USERS.edit(\'' + un + '\')"><i class="ph ph-pencil-simple"></i> Edit details</button>' : '') +
        (canManage ? '<button class="btn btn-danger" data-on-click="USERS.del(\'' + un + '\')"><i class="ph ph-trash"></i> Delete student</button>' : '') +
        '<button class="btn btn-quiet" style="margin-left:auto" data-on-click="MODAL.close(\'user\')">Close</button>' +
      '</div>';
    MODAL.open('user');
  },

  edit(username){
    const u = (ADMIN.data.users || []).find(x => x.username === username);
    if (!u) return;
    const un = escAttrJs(username);
    $('tt-user').textContent = 'Edit ' + username;
    $('bd-user').innerHTML =
      '<div class="field-row">' +
        '<div class="field"><label for="edit-name">Full name</label><input class="input" type="text" id="edit-name" value="' + esc(u.name) + '"></div>' +
        '<div class="field"><label for="edit-mobile">Mobile</label><input class="input" type="tel" inputmode="tel" id="edit-mobile" value="' + esc(u.mobile) + '" placeholder="98XXXXXXXX"></div>' +
      '</div>' +
      '<div class="field"><label for="edit-email">Email</label><input class="input" type="email" inputmode="email" id="edit-email" value="' + esc(u.email) + '" placeholder="student@example.com"></div>' +
      '<div class="field"><label for="edit-status">Status</label><select class="select" id="edit-status">' +
        ['trial','active','expired','payment_pending','rejected'].map(s =>
          '<option value="' + s + '"' + (u.status === s ? ' selected' : '') + '>' + statusLabel(s) + '</option>').join('') +
      '</select></div>' +
      '<label class="perm-row mb4" style="min-height:36px"><input type="checkbox" id="edit-permanent"' + (u.permanentAccess ? ' checked' : '') + '><span>Permanent access</span></label>' +
      '<div class="field"><label for="edit-password">Reset password</label>' +
        '<input class="input" type="text" id="edit-password" placeholder="Leave blank to keep the current one" autocomplete="off">' +
        '<span class="field-hint">Share the new password with them yourself — they are not notified.</span></div>' +
      '<div class="flex g2 mt4"><button class="btn btn-quiet" style="flex:1" data-on-click="USERS.view(\'' + un + '\')">Cancel</button>' +
      '<button class="btn btn-primary" style="flex:1" id="edit-save" data-on-click="USERS.saveEdit(\'' + un + '\')">Save changes</button></div>';
    MODAL.open('user');
  },

  async saveEdit(username){
    const btn = $('edit-save');
    btn.classList.add('loading');
    try {
      const res = await ADMIN.post('adminUpdateUser', {
        username,
        name: $('edit-name').value.trim(),
        email: $('edit-email').value.trim(),
        mobile: $('edit-mobile').value.trim(),
        status: $('edit-status').value,
        permanentAccess: $('edit-permanent').checked,
        password: $('edit-password').value
      });
      if (!res.success) throw new Error(res.error);
      TOAST.show('Changes saved', 'success');
      MODAL.close('user');
      ADMIN.refresh(['stats','users']);
    } catch(e){ TOAST.show(e.message, 'error'); }
    btn.classList.remove('loading');
  },

  async grantAccess(username, duration){
    const ok = await CONFIRM.ask({
      title:'Grant access',
      body:'Give <b>' + (duration === 'year' ? 'one year' : 'permanent') + '</b> access to <b>' + esc(username) + '</b>?',
      confirmText:'Grant access'
    });
    if (!ok) return;
    BUSY.start();
    try {
      const res = await ADMIN.post('adminGrantAccess', { username, duration });
      if (!res.success) throw new Error(res.error);
      TOAST.show('Access granted to ' + username, 'success');
      MODAL.close('user');
      ADMIN.refresh(['stats','users']);
    } catch(e){ TOAST.show(e.message, 'error'); }
    BUSY.stop();
  },

  async del(username){
    const ok = await CONFIRM.ask({
      title:'Delete student',
      body:'Delete <b>' + esc(username) + '</b> and everything attached to the account — progress, payment record, weekly attempts and written submissions. There is no undo.',
      confirmText:'Delete student', tone:'danger', requireType:'DELETE'
    });
    if (!ok) return;
    BUSY.start();
    try {
      const res = await ADMIN.post('adminDeleteUser', { username });
      if (!res.success) throw new Error(res.error);
      TOAST.show(username + ' deleted', 'success');
      MODAL.close('user');
      ADMIN.refresh(['stats','users','payments']);
    } catch(e){ TOAST.show(e.message, 'error'); }
    BUSY.stop();
  }
};

