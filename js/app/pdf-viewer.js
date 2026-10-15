/* ═══════════════════════════════════════════════════════════════════════
   PDF-VIEWER.JS — one PDF surface for the whole app.

   Students read their marked answer paper with it; admins read AND mark
   up the same paper with it. There is no second viewer, so the reading
   experience is identical on both sides and only the tools differ:

       PDFVIEW.open({ … })                    → reader
       PDFVIEW.open({ …, annotate: { … } })   → reader + ink layer

   Reading: continuous vertical scroll, fit page (default) / fit width /
   free zoom, page counter with jump-to-page, find-in-document, download,
   full screen, keyboard shortcuts. Pages render lazily near the viewport
   and are released again when far away, so a 60-page scan stays light on
   a phone.

   Ink: pen, highlighter, text note, eraser (removes YOUR marks only —
   the student's own writing is never touched), per-page undo/redo and
   clear, colour and width. Every stroke is stored in PDF points, never
   in screen pixels, so zooming, resizing, rotating the phone or opening
   on another screen can never shift a mark off the word it was put
   against.

   Saving is deliberately NOT this file's job. On save it rasterises the
   ink — and only the ink — into one transparent PNG per marked page and
   hands them to the caller:

       annotate.onSave(overlays, info) -> Promise<boolean|void>
         overlays : [{ page, dataUrl, width, height }]   (page points)
         info     : { bytes, pageCount, filename, auto }

   The admin console stamps those onto the original PDF with pdf-lib and
   uploads the result, so the student's scan keeps its resolution and its
   selectable text. Throwing (or resolving false) puts the save chip into
   its failed state with a retry, and nothing is discarded.

   ── USAGE ───────────────────────────────────────────────────────────
   PDFVIEW.open({ base64, title, filename });
   PDFVIEW.open({ data: 'data:application/pdf;base64,…' });
   PDFVIEW.open({ blob: fileFromInput });
   PDFVIEW.open({ title, load: async () => ({ base64, filename }) });
   PDFVIEW.openSubmission(id, { title });      // the student's own paper
   PDFVIEW.close();  PDFVIEW.isOpen();  PDFVIEW.isDirty();

   Any element with data-pdf-submission="<id>" opens it on click.

   ── PDF ENGINE ──────────────────────────────────────────────────────
   Tries ./vendor/pdfjs/pdf.min.js + pdf.worker.min.js first (self-host
   these two for real offline support and add them to the service-worker
   precache), then falls back to cdnjs. If neither loads it offers
   Download / Open instead of failing blankly.
   ═══════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  if (window.PDFVIEW) return;

  const PDFJS_VERSION = '3.11.174';
  const CDN = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/' + PDFJS_VERSION + '/';
  const SOURCES = [
    { lib: 'vendor/pdfjs/pdf.min.js', worker: 'vendor/pdfjs/pdf.worker.min.js' },
    { lib: CDN + 'pdf.min.js',        worker: CDN + 'pdf.worker.min.js' }
  ];
  const FIT_KEY = 'abhyas_pdf_fit';     // 'page' | 'width'
  const MIN_SCALE = 0.2, MAX_SCALE = 6, MAX_FIT_SCALE = 3.5;
  const SIDE_PAD = 12, GAP = 10, TOP_PAD = 8, BOTTOM_PAD = 24;
  const MAX_CANVAS_PIXELS = 16e6;
  const AUTOSAVE_MS = 4000;

  const TOOLS = ['hand', 'pen', 'highlighter', 'text', 'eraser'];
  const COLORS = [
    { hex: '#e02020', name: 'Red' },
    { hex: '#1e7a4c', name: 'Green' },
    { hex: '#1a56db', name: 'Blue' },
    { hex: '#111111', name: 'Black' },
    { hex: '#ffffff', name: 'White-out' }
  ];

  let libPromise = null;
  let root = null, els = {};
  let S = null;            // the open document (null = closed)
  let GEN = 0;             // bumped on open/close so stale async work bails
  let prevFocus = null;
  let resizeTimer = null;

  /* ── styles (self-contained; no dependency on page CSS) ───────────── */
  const CSS = `
.pdfv{position:fixed;inset:0;z-index:10010;display:none;flex-direction:column;background:#33383a;color:#eef1ef;
  font-family:'Inter',system-ui,-apple-system,'Segoe UI',sans-serif;
  padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}
.pdfv.on{display:flex}
@supports(height:100dvh){.pdfv{height:100dvh}}
.pdfv *{box-sizing:border-box}
.pdfv-bar{display:flex;align-items:center;gap:.35rem;flex-wrap:wrap;padding:.35rem .5rem;
  background:#1f2426;border-bottom:1px solid rgba(255,255,255,.08);flex-shrink:0}
.pdfv-title{flex:1 1 120px;min-width:0;font-size:.8rem;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.pdfv-grp{display:flex;align-items:center;gap:.2rem}
.pdfv button{min-width:32px;height:32px;padding:0 .5rem;border-radius:8px;border:1px solid rgba(255,255,255,.14);
  background:rgba(255,255,255,.06);color:inherit;font:inherit;font-size:.72rem;font-weight:600;cursor:pointer;line-height:1;
  display:inline-flex;align-items:center;justify-content:center;gap:.25rem;touch-action:manipulation}
.pdfv button:hover:not(:disabled){background:rgba(255,255,255,.16)}
.pdfv button.on{background:#2E8B57;border-color:#2E8B57;color:#fff}
.pdfv button:disabled{opacity:.35;cursor:not-allowed}
.pdfv button:focus-visible,.pdfv input:focus-visible,.pdfv-scroll:focus-visible{outline:2px solid #7fd6a5;outline-offset:2px}
.pdfv input{height:32px;border-radius:8px;border:1px solid rgba(255,255,255,.2);background:rgba(0,0,0,.3);
  color:inherit;font-family:inherit;font-size:16px;padding:0 .45rem}
.pdfv input.pdfv-pgin{width:3.2rem;text-align:center;padding:0 .2rem}
.pdfv-pgs{display:flex;align-items:center;gap:.25rem;font-size:.74rem;opacity:.95;white-space:nowrap}
.pdfv-sep{width:1px;height:20px;background:rgba(255,255,255,.16);margin:0 .1rem}
.pdfv-zoom{min-width:2.9rem;text-align:center;font-size:.72rem;opacity:.85}
.pdfv-scroll{flex:1;min-height:0;overflow:auto;position:relative;-webkit-overflow-scrolling:touch;
  touch-action:pan-x pan-y pinch-zoom;overscroll-behavior:contain}
.pdfv-pages{position:relative;display:flex;flex-direction:column;gap:${GAP}px;
  padding:${TOP_PAD}px ${SIDE_PAD}px ${BOTTOM_PAD}px;min-width:100%;width:max-content;box-sizing:border-box}
.pdfv-page{position:relative;margin-inline:auto;background:#fff;box-shadow:0 2px 14px rgba(0,0,0,.45);flex:none}
.pdfv-page::before{content:attr(data-n);position:absolute;inset:0;display:flex;align-items:center;justify-content:center;
  color:#c2c7c4;font-size:1.1rem;font-weight:600}
.pdfv-page canvas{display:block;position:absolute;left:0;top:0}
.pdfv-page canvas.pdfv-ink{touch-action:auto}
.pdfv.drawing .pdfv-page canvas.pdfv-ink{touch-action:none;cursor:crosshair}
.pdfv-msg{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;
  gap:.8rem;text-align:center;padding:1.5rem;font-size:.86rem;line-height:1.5}
.pdfv-msg-actions{display:flex;gap:.5rem;flex-wrap:wrap;justify-content:center}
.pdfv-spin{width:30px;height:30px;border:3px solid rgba(255,255,255,.2);border-top-color:#7fd6a5;border-radius:50%;
  animation:pdfv-spin .8s linear infinite}
@keyframes pdfv-spin{to{transform:rotate(360deg)}}
@media(prefers-reduced-motion:reduce){.pdfv-spin{animation-duration:2.4s}}

.pdfv-ann{display:none;align-items:center;gap:.3rem;flex-wrap:wrap;padding:.3rem .5rem;
  background:#262c2e;border-bottom:1px solid rgba(255,255,255,.08);flex-shrink:0}
.pdfv.annotate .pdfv-ann{display:flex}
.pdfv-swatch{width:22px;height:22px;min-width:22px;border-radius:50%;border:2px solid rgba(255,255,255,.35);
  padding:0;cursor:pointer;flex-shrink:0}
.pdfv-swatch.on{border-color:#fff;box-shadow:0 0 0 2px rgba(255,255,255,.25)}
.pdfv-save{margin-left:auto;display:flex;align-items:center;gap:.4rem}
.pdfv-state{font-size:.7rem;opacity:.85;white-space:nowrap}
.pdfv-state.dirty{color:#ffd479}
.pdfv-state.saving{color:#8fd0ff}
.pdfv-state.saved{color:#7fd6a5}
.pdfv-state.failed{color:#ff9b93}

.pdfv-find{display:none;align-items:center;gap:.35rem;padding:.35rem .5rem;
  background:#262c2e;border-bottom:1px solid rgba(255,255,255,.08);flex-shrink:0}
.pdfv.finding .pdfv-find{display:flex}
.pdfv-find input{flex:1;min-width:0;max-width:280px}
.pdfv-findcount{font-size:.72rem;opacity:.85;white-space:nowrap;min-width:4.6rem;text-align:center}

@media(max-width:620px){
  .pdfv-hide-sm{display:none}
  .pdfv-title{flex-basis:100%;order:-1;font-size:.74rem;padding:0 .15rem}
  .pdfv-bar{padding:.3rem .4rem;gap:.25rem}
  .pdfv button{min-width:34px;height:34px;padding:0 .4rem}
  .pdfv-ann.collapsed .pdfv-more{display:none}
}
`;

  /* ── helpers ──────────────────────────────────────────────────────── */
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const esc = s => window.esc(s);   /* the one escaper in shared.js, loaded before this file */

  /* A script tag that fires neither load nor error — a captive-portal
     redirect, a stalled CDN — would otherwise leave the reader on
     "Loading…" for ever, so give it a deadline and move to the next source. */
  function loadScript(src, timeoutMs) {
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      let done = false;
      const finish = (err) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        if (err) { s.remove(); reject(err); } else resolve();
      };
      const timer = setTimeout(() => finish(new Error('Timed out loading ' + src)), timeoutMs || 15000);
      s.src = src; s.async = true;
      s.onload = () => finish(null);
      s.onerror = () => finish(new Error('Could not load ' + src));
      document.head.appendChild(s);
    });
  }
  function loadEngine() {
    if (window.pdfjsLib) return Promise.resolve(window.pdfjsLib);
    if (libPromise) return libPromise;
    libPromise = (async () => {
      let lastErr = null;
      for (const src of SOURCES) {
        try {
          await loadScript(src.lib);
          if (window.pdfjsLib) {
            window.pdfjsLib.GlobalWorkerOptions.workerSrc = src.worker;
            return window.pdfjsLib;
          }
        } catch (e) { lastErr = e; }
      }
      libPromise = null;          // allow a retry after reconnecting
      throw lastErr || new Error('PDF engine unavailable');
    })();
    return libPromise;
  }

  function b64ToBytes(b64) {
    const bin = atob(String(b64).replace(/\s+/g, ''));
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  async function toBytes(src) {
    if (!src) throw new Error('No PDF provided.');
    if (src.bytes) return src.bytes instanceof Uint8Array ? src.bytes : new Uint8Array(src.bytes);
    if (src.blob) return new Uint8Array(await src.blob.arrayBuffer());
    if (src.base64) return b64ToBytes(src.base64);
    if (src.data) {
      const s = String(src.data);
      const i = s.indexOf('base64,');
      return b64ToBytes(i >= 0 ? s.slice(i + 7) : s);
    }
    if (src.url) {
      const r = await fetch(src.url, { credentials: 'omit' });
      if (!r.ok) throw new Error('Could not download the PDF (' + r.status + ').');
      return new Uint8Array(await r.arrayBuffer());
    }
    throw new Error('No PDF provided.');
  }

  function gasUrl() {
    try { if (typeof ABHYAS_CONFIG !== 'undefined' && ABHYAS_CONFIG.GAS_URL) return ABHYAS_CONFIG.GAS_URL; } catch (e) {}
    try { if (typeof GAS_URL !== 'undefined' && GAS_URL) return GAS_URL; } catch (e) {}
    return '';
  }
  async function callGas(payload) {
    const url = gasUrl();
    if (!url) throw new Error('The server address is not configured.');
    const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify(payload) });
    if (!r.ok) throw new Error('Network error (' + r.status + ').');
    return r.json();
  }

  /* ── UI ───────────────────────────────────────────────────────────── */
  function ensureUI() {
    if (root) return;
    const style = document.createElement('style');
    style.id = 'pdfv-style';
    style.textContent = CSS;
    document.head.appendChild(style);

    root = document.createElement('div');
    root.className = 'pdfv';
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.setAttribute('aria-label', 'PDF viewer');
    root.innerHTML =
      '<div class="pdfv-bar">' +
        '<div class="pdfv-title" data-el="title">Document</div>' +
        '<div class="pdfv-grp">' +
          '<button type="button" data-a="prev" aria-label="Previous page" title="Previous page">&#9650;</button>' +
          '<span class="pdfv-pgs"><input class="pdfv-pgin" data-el="pgin" type="text" inputmode="numeric" value="1" aria-label="Page number"> / <span data-el="pgn">&ndash;</span></span>' +
          '<button type="button" data-a="next" aria-label="Next page" title="Next page">&#9660;</button>' +
        '</div>' +
        '<span class="pdfv-sep pdfv-hide-sm"></span>' +
        '<div class="pdfv-grp">' +
          '<button type="button" data-a="out" aria-label="Zoom out" title="Zoom out (&minus;)">&minus;</button>' +
          '<span class="pdfv-zoom" data-el="zoom" aria-live="polite">&ndash;</span>' +
          '<button type="button" data-a="in" aria-label="Zoom in" title="Zoom in (+)">+</button>' +
        '</div>' +
        '<div class="pdfv-grp">' +
          '<button type="button" data-a="fitpage" aria-label="Fit the whole page" title="Fit the whole page (0)">Page</button>' +
          '<button type="button" data-a="fitwidth" aria-label="Fit the page width" title="Fit the page width">Width</button>' +
        '</div>' +
        '<span class="pdfv-sep pdfv-hide-sm"></span>' +
        '<div class="pdfv-grp">' +
          '<button type="button" data-a="find" aria-label="Find in this document" title="Find (Ctrl F)">&#9906;</button>' +
          '<button type="button" data-a="full" aria-label="Full screen" title="Full screen (F)">&#9974;</button>' +
          '<button type="button" data-a="dl" aria-label="Download this PDF" title="Download">&#8595;</button>' +
          '<button type="button" data-a="close" aria-label="Close the viewer" title="Close (Esc)">&#10005;</button>' +
        '</div>' +
      '</div>' +
      '<div class="pdfv-ann collapsed" data-el="ann" role="toolbar" aria-label="Marking tools"></div>' +
      '<div class="pdfv-find" data-el="find">' +
        '<input type="search" data-el="findq" placeholder="Find in this document" aria-label="Find in this document" enterkeyhint="search">' +
        '<button type="button" data-a="findprev" aria-label="Previous match" title="Previous match">&#9650;</button>' +
        '<button type="button" data-a="findnext" aria-label="Next match" title="Next match">&#9660;</button>' +
        '<span class="pdfv-findcount" data-el="findcount" aria-live="polite"></span>' +
        '<button type="button" data-a="findclose" aria-label="Close find">&#10005;</button>' +
      '</div>' +
      '<div class="pdfv-scroll" data-el="scroll" tabindex="0" aria-label="PDF pages"><div class="pdfv-pages" data-el="pages"></div></div>';
    document.body.appendChild(root);
    root.querySelectorAll('[data-el]').forEach(n => { els[n.dataset.el] = n; });

    root.addEventListener('click', onClick);
    els.scroll.addEventListener('scroll', onScroll, { passive: true });
    els.pgin.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); gotoPage(parseInt(els.pgin.value, 10)); els.scroll.focus(); }
      else if (e.key === 'Escape') els.pgin.blur();
      e.stopPropagation();
    });
    els.pgin.addEventListener('focus', () => els.pgin.select());
    els.findq.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); if (e.shiftKey) stepMatch(-1); else runFind(els.findq.value); }
      else if (e.key === 'Escape') { e.preventDefault(); toggleFind(false); }
      e.stopPropagation();
    });

    const onResize = () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => { if (S && S.pages.length) { layout(true); update(); } }, 140);
    };
    if (window.ResizeObserver) new ResizeObserver(onResize).observe(els.scroll);
    else window.addEventListener('resize', onResize);

    document.addEventListener('keydown', onKey, true);
  }

  function buildAnnToolbar() {
    const tool = (id, label, glyph, extra) =>
      '<button type="button" data-tool="' + id + '" class="' + (extra || '') + '" aria-label="' + label +
      '" title="' + label + '" aria-pressed="false">' + glyph + '</button>';
    els.ann.innerHTML =
      '<div class="pdfv-grp">' +
        tool('hand', 'Scroll the page', '&#9995;') +
        tool('pen', 'Pen', '&#9998;') +
        tool('highlighter', 'Highlighter', '&#9646;') +
        tool('text', 'Write a note', 'T', 'pdfv-more') +
        tool('eraser', 'Rub out your own marks', '&#9003;', 'pdfv-more') +
      '</div>' +
      '<span class="pdfv-sep"></span>' +
      '<div class="pdfv-grp">' +
        COLORS.map(c => '<button type="button" class="pdfv-swatch" data-color="' + c.hex + '" style="background:' +
          c.hex + (c.hex === '#ffffff' ? ';border-color:#9aa' : '') + '" aria-label="' + c.name +
          '" title="' + c.name + '"></button>').join('') +
      '</div>' +
      '<div class="pdfv-grp pdfv-more">' +
        '<button type="button" data-a="thin" aria-label="Thin stroke" title="Thin">S</button>' +
        '<button type="button" data-a="med" aria-label="Medium stroke" title="Medium">M</button>' +
        '<button type="button" data-a="thick" aria-label="Thick stroke" title="Thick">L</button>' +
      '</div>' +
      '<span class="pdfv-sep pdfv-more"></span>' +
      '<div class="pdfv-grp">' +
        '<button type="button" data-a="undo" aria-label="Undo" title="Undo (Ctrl Z)">&#8630;</button>' +
        '<button type="button" data-a="redo" aria-label="Redo" title="Redo (Ctrl Y)" class="pdfv-more">&#8631;</button>' +
        '<button type="button" data-a="clearpage" aria-label="Clear this page" title="Clear this page" class="pdfv-more">&#9851;</button>' +
        '<button type="button" data-a="tools" aria-label="More marking tools" title="More tools">&#8943;</button>' +
      '</div>' +
      '<div class="pdfv-save">' +
        '<span class="pdfv-state" data-el="state" role="status" aria-live="polite"></span>' +
        '<button type="button" data-a="save" data-el="savebtn">Save</button>' +
      '</div>';
    root.querySelectorAll('[data-el]').forEach(n => { els[n.dataset.el] = n; });
  }

  function setTitle(t) { els.title.textContent = t || 'Document'; els.title.title = t || ''; }
  function showMsg(html, actions) {
    clearMsg();
    const m = document.createElement('div');
    m.className = 'pdfv-msg';
    m.dataset.msg = '1';
    m.innerHTML = html + (actions ? '<div class="pdfv-msg-actions">' + actions + '</div>' : '');
    els.scroll.appendChild(m);
  }
  function clearMsg() { els.scroll.querySelectorAll('[data-msg]').forEach(n => n.remove()); }
  function setBusy(on) {
    root.querySelectorAll('[data-a]').forEach(b => { if (b.dataset.a !== 'close') b.disabled = on; });
    root.querySelectorAll('[data-tool]').forEach(b => { b.disabled = on; });
  }

  /* ── open / close ─────────────────────────────────────────────────── */
  async function open(opts) {
    opts = opts || {};
    ensureUI();
    if (!confirmDiscard()) return;
    teardown();
    const gen = ++GEN;
    prevFocus = document.activeElement;

    const ann = opts.annotate || null;
    if (ann && !els.ann.innerHTML) buildAnnToolbar();
    root.classList.toggle('annotate', !!ann);
    root.classList.remove('finding', 'drawing');

    root.classList.add('on');
    document.body.style.overflow = 'hidden';
    setTitle(opts.title);
    setBusy(true);
    showMsg('<div class="pdfv-spin" aria-hidden="true"></div><div>Loading&hellip;</div>');
    els.scroll.focus({ preventScroll: true });

    let bytes = null;
    try {
      let src = opts;
      if (typeof opts.load === 'function') src = Object.assign({}, opts, await opts.load());
      if (gen !== GEN) return;
      if (src.title) setTitle(src.title);
      bytes = await toBytes(src);
      if (gen !== GEN) return;
      S = newState(gen, bytes, src.filename || opts.filename || 'document.pdf', ann);
    } catch (err) {
      if (gen !== GEN) return;
      S = null;
      showMsg('<div>' + esc(err && err.message ? err.message : 'Could not load the PDF.') + '</div>',
        '<button type="button" data-a="retry">Try again</button>');
      const rb = root.querySelector('[data-a="retry"]');
      if (rb) { rb.disabled = false; rb._retry = opts; }
      setBusy(false);
      return;
    }

    let lib;
    try { lib = await loadEngine(); }
    catch (err) {
      if (gen !== GEN) return;
      showMsg('<div>The PDF reader could not load &mdash; you may be offline.<br>You can still download the file or open it in your browser.</div>',
        '<button type="button" data-a="dl">Download</button><button type="button" data-a="openraw">Open in browser</button>');
      setBusy(false);
      root.querySelectorAll('[data-a="dl"],[data-a="openraw"]').forEach(b => { b.disabled = false; });
      return;
    }
    if (gen !== GEN) return;

    try {
      /* pdf.js transfers the buffer to its worker, so hand it a copy and keep
         the original bytes (also wrapped in S.blobUrl) for download and save. */
      S.doc = await lib.getDocument({ data: bytes.slice(), isEvalSupported: false }).promise;
      if (gen !== GEN) { try { S.doc.destroy(); } catch (e) {} return; }
      const n = S.doc.numPages;
      const pageObjs = await Promise.all(Array.from({ length: n }, (_, i) => S.doc.getPage(i + 1)));
      if (gen !== GEN) return;
      buildPages(pageObjs);
    } catch (err) {
      if (gen !== GEN) return;
      const pw = err && err.name === 'PasswordException';
      showMsg('<div>' + (pw ? 'This PDF is password-protected.' : 'This file could not be opened as a PDF.') + '</div>',
        '<button type="button" data-a="dl">Download</button>');
      setBusy(false);
      root.querySelectorAll('[data-a="dl"]').forEach(b => { b.disabled = false; });
      return;
    }

    clearMsg();
    setBusy(false);
    let saved = null;
    try { saved = localStorage.getItem(FIT_KEY); } catch (e) {}
    S.mode = (opts.fit === 'width' || (!opts.fit && saved === 'width')) ? 'width' : 'page';
    if (S.ann) {
      /* Marking wants the page as wide as it will go. */
      S.mode = 'width';
      setTool('hand'); setColor(COLORS[0].hex); setWidth(3); paintState();
    }
    layout(false);
    els.scroll.scrollTop = 0;
    update();
    els.scroll.focus({ preventScroll: true });
  }

  function newState(gen, bytes, filename, ann) {
    let blobUrl = '';
    try { blobUrl = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' })); } catch (e) {}
    return {
      gen, doc: null, pages: [], mode: 'page', zoom: 1, current: 0, pumping: false,
      blobUrl, filename, bytes,
      ann: ann, ink: {}, redo: {}, tool: 'hand', color: COLORS[0].hex, width: 3,
      dirty: false, saveState: '', saveTimer: null, saving: false,
      find: null, text: {}
    };
  }

  function buildPages(pageObjs) {
    els.pages.innerHTML = '';
    S.pages = pageObjs.map((page, i) => {
      const vp = page.getViewport({ scale: 1 });
      const el = document.createElement('div');
      el.className = 'pdfv-page';
      el.dataset.n = String(i + 1);
      const canvas = document.createElement('canvas');
      el.appendChild(canvas);
      const hl = document.createElement('canvas');
      hl.className = 'pdfv-hl';
      el.appendChild(hl);
      let ink = null;
      if (S.ann) {
        ink = document.createElement('canvas');
        ink.className = 'pdfv-ink';
        el.appendChild(ink);
        bindInk(ink, i + 1);
      }
      els.pages.appendChild(el);
      return {
        num: i + 1, page, w: vp.width, h: vp.height, el, canvas, hl, ink,
        cssW: 0, cssH: 0, top: 0, scale: 1,
        want: false, rendered: false, rendering: false, failed: false, task: null, stamp: 0
      };
    });
    els.pgn.textContent = String(S.pages.length);
  }

  function teardown() {
    GEN++;
    if (S) {
      if (S.saveTimer) clearTimeout(S.saveTimer);
      S.pages.forEach(releasePage);
      try { S.doc && S.doc.destroy(); } catch (e) {}
      if (S.blobUrl) { try { URL.revokeObjectURL(S.blobUrl); } catch (e) {} }
    }
    S = null;
    if (els.pages) els.pages.innerHTML = '';
    if (els.scroll) clearMsg();
  }

  function confirmDiscard() {
    if (!S || !S.dirty) return true;
    return window.confirm('Some of your marks have not been saved. Close anyway and lose them?');
  }

  function close() {
    if (!root || !root.classList.contains('on')) return;
    if (!confirmDiscard()) return;
    if (document.fullscreenElement && document.exitFullscreen) { try { document.exitFullscreen(); } catch (e) {} }
    teardown();
    root.classList.remove('on', 'annotate', 'finding', 'drawing');
    document.body.style.overflow = '';
    const f = prevFocus; prevFocus = null;
    if (f && f.focus) { try { f.focus({ preventScroll: true }); } catch (e) {} }
  }

  /* ── layout ───────────────────────────────────────────────────────── */
  function fitScale(p, mode, zoom, cw, ch) {
    let sc;
    if (mode === 'page') sc = Math.min(cw / p.w, ch / p.h);
    else if (mode === 'width') sc = cw / p.w;
    else return clamp((cw / p.w) * zoom, MIN_SCALE, MAX_SCALE);
    return clamp(sc, MIN_SCALE, MAX_FIT_SCALE);
  }

  function layout(keepPosition) {
    if (!S || !S.pages.length) return;
    const anchor = keepPosition ? getAnchor() : null;
    const cw = Math.max(80, els.scroll.clientWidth - SIDE_PAD * 2);
    const ch = Math.max(80, els.scroll.clientHeight - (TOP_PAD + GAP));
    for (const p of S.pages) {
      p.scale = fitScale(p, S.mode, S.zoom, cw, ch);
      p.cssW = Math.round(p.w * p.scale);
      p.cssH = Math.round(p.h * p.scale);
      p.el.style.width = p.cssW + 'px';
      p.el.style.height = p.cssH + 'px';
      p.failed = false;
      releasePage(p);                       // re-render at the new size
      sizeOverlay(p, p.hl);
      if (p.ink) { sizeOverlay(p, p.ink); repaintInk(p); }
    }
    for (const p of S.pages) p.top = p.el.offsetTop;
    if (anchor) {
      const ap = S.pages[anchor.idx];
      els.scroll.scrollTop = Math.max(0, ap.top + anchor.frac * ap.cssH);
    }
    paintModeButtons();
    updateZoomLabel();
  }

  /* Overlays are sized in device pixels but drawn in PDF points, so one
     stroke means the same thing at every zoom level and on every screen. */
  function sizeOverlay(p, cv) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    cv.width = Math.max(1, Math.round(p.cssW * dpr));
    cv.height = Math.max(1, Math.round(p.cssH * dpr));
    cv.style.width = p.cssW + 'px';
    cv.style.height = p.cssH + 'px';
    cv._unit = p.scale * dpr;               // device pixels per PDF point
  }

  function getAnchor() {
    const idx = clamp(S.current, 0, S.pages.length - 1);
    const p = S.pages[idx];
    return { idx, frac: p.cssH ? (els.scroll.scrollTop - p.top) / p.cssH : 0 };
  }

  function paintModeButtons() {
    const m = S ? S.mode : 'page';
    const a = root.querySelector('[data-a="fitpage"]'), b = root.querySelector('[data-a="fitwidth"]');
    if (a) a.classList.toggle('on', m === 'page');
    if (b) b.classList.toggle('on', m === 'width');
  }
  function updateZoomLabel() {
    if (!S || !S.pages.length) { els.zoom.textContent = '\u2013'; return; }
    const p = S.pages[clamp(S.current, 0, S.pages.length - 1)];
    els.zoom.textContent = Math.round(p.scale * 100) + '%';
  }
  function setMode(mode) {
    if (!S || !S.pages.length) return;
    S.mode = mode;
    try { localStorage.setItem(FIT_KEY, mode); } catch (e) {}
    layout(true); update();
  }
  function zoomBy(factor) {
    if (!S || !S.pages.length) return;
    const cw = Math.max(80, els.scroll.clientWidth - SIDE_PAD * 2);
    const cur = S.pages[clamp(S.current, 0, S.pages.length - 1)];
    const currentZoom = cur.scale / (cw / cur.w);
    S.zoom = clamp(currentZoom * factor, MIN_SCALE / (cw / cur.w), MAX_SCALE / (cw / cur.w));
    S.mode = 'zoom';
    layout(true); update();
  }

  /* ── scrolling, visibility, rendering ─────────────────────────────── */
  let rafPending = false;
  function onScroll() {
    if (rafPending) return;
    rafPending = true;
    requestAnimationFrame(() => { rafPending = false; update(); });
  }

  function update() {
    if (!S || !S.pages.length) return;
    const top = els.scroll.scrollTop, vh = els.scroll.clientHeight;
    const probe = top + vh * 0.35;
    let cur = 0;
    for (let i = 0; i < S.pages.length; i++) { if (S.pages[i].top <= probe) cur = i; else break; }
    S.current = cur;
    if (document.activeElement !== els.pgin) els.pgin.value = String(cur + 1);
    updateZoomLabel();

    const margin = vh * 1.5, lo = top - margin, hi = top + vh + margin;
    for (const p of S.pages) {
      p.want = (p.top + p.cssH > lo) && (p.top < hi);
      if (!p.want && (p.rendered || p.rendering)) releasePage(p);
    }
    pump();
  }

  async function pump() {
    const s = S;
    if (!s || s.pumping) return;
    s.pumping = true;
    try {
      while (S === s) {
        const center = els.scroll.scrollTop + els.scroll.clientHeight / 2;
        let best = null, bestD = Infinity;
        for (const p of s.pages) {
          if (p.want && !p.rendered && !p.rendering && !p.failed) {
            const d = Math.abs(p.top + p.cssH / 2 - center);
            if (d < bestD) { bestD = d; best = p; }
          }
        }
        if (!best) break;
        await renderPage(s, best);
      }
    } finally { if (S === s) s.pumping = false; }
  }

  async function renderPage(s, p) {
    p.rendering = true;
    const stamp = ++p.stamp;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let rs = p.scale * dpr;
    while (p.w * rs * p.h * rs > MAX_CANVAS_PIXELS) rs *= 0.85;
    const viewport = p.page.getViewport({ scale: rs });
    const cvs = p.canvas;
    cvs.width = Math.max(1, Math.floor(viewport.width));
    cvs.height = Math.max(1, Math.floor(viewport.height));
    cvs.style.width = p.cssW + 'px';
    cvs.style.height = p.cssH + 'px';
    const task = p.page.render({ canvasContext: cvs.getContext('2d'), viewport });
    p.task = task;
    try {
      await task.promise;
      if (S === s && p.stamp === stamp) p.rendered = true;
    } catch (err) {
      if (!(err && err.name === 'RenderingCancelledException')) {
        p.failed = true;
        console.warn('[PDFVIEW] page ' + p.num + ' failed to render:', err);
      }
    } finally {
      if (p.task === task) p.task = null;
      if (p.stamp === stamp) p.rendering = false;
    }
  }

  function releasePage(p) {
    p.stamp++;
    if (p.task) { try { p.task.cancel(); } catch (e) {} p.task = null; }
    p.rendering = false;
    p.rendered = false;
    if (p.canvas) { p.canvas.width = 0; p.canvas.height = 0; }   // frees the bitmap
  }

  function gotoPage(n, delta) {
    if (!S || !S.pages.length) return;
    if (typeof delta === 'number') n = S.current + 1 + delta;
    if (!isFinite(n)) return;
    n = clamp(Math.round(n), 1, S.pages.length);
    els.scroll.scrollTop = Math.max(0, S.pages[n - 1].top - TOP_PAD);
    update();
  }

  /* ══════════════════════════ MARKING ═════════════════════════════════ */

  function setTool(t) {
    if (!S || !S.ann || TOOLS.indexOf(t) === -1) return;
    S.tool = t;
    root.querySelectorAll('[data-tool]').forEach(b => {
      const on = b.dataset.tool === t;
      b.classList.toggle('on', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    root.classList.toggle('drawing', t !== 'hand');
  }
  function setColor(hex) {
    if (!S) return;
    S.color = hex;
    root.querySelectorAll('.pdfv-swatch').forEach(b => b.classList.toggle('on', b.dataset.color === hex));
  }
  function setWidth(w) {
    if (!S) return;
    S.width = w;
    const map = { thin: 1.5, med: 3, thick: 6 };
    root.querySelectorAll('[data-a="thin"],[data-a="med"],[data-a="thick"]')
      .forEach(b => b.classList.toggle('on', map[b.dataset.a] === w));
  }

  function pageOf(n) { return S.pages[n - 1]; }

  /* Screen pixels in, PDF points out. */
  function pos(e, canvas) {
    const r = canvas.getBoundingClientRect();
    const unit = canvas._unit || 1;
    return {
      x: (e.clientX - r.left) * (canvas.width / r.width) / unit,
      y: (e.clientY - r.top) * (canvas.height / r.height) / unit
    };
  }

  function bindInk(canvas, pageNum) {
    let drawing = false, current = null;
    canvas.addEventListener('pointerdown', e => {
      if (!S || !S.ann || S.tool === 'hand') return;   // hand tool = scroll
      e.preventDefault();
      if (S.tool === 'text') { placeText(e, canvas, pageNum); return; }
      drawing = true;
      try { canvas.setPointerCapture(e.pointerId); } catch (_) {}
      current = { tool: S.tool, color: S.color, width: S.width, points: [pos(e, canvas)] };
      (S.ink[pageNum] || (S.ink[pageNum] = [])).push(current);
      S.redo[pageNum] = [];
      markDirty();
    });
    canvas.addEventListener('pointermove', e => {
      if (!drawing || !current) return;
      e.preventDefault();
      current.points.push(pos(e, canvas));
      repaintInk(pageOf(pageNum));
    });
    const end = () => { drawing = false; current = null; };
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointerleave', end);
    canvas.addEventListener('pointercancel', end);
  }

  function placeText(e, canvas, pageNum) {
    const p = pos(e, canvas);
    const text = window.prompt('Note for the student:');
    if (!text) return;
    (S.ink[pageNum] || (S.ink[pageNum] = [])).push({
      tool: 'text', color: S.color, x: p.x, y: p.y, text: text, size: 9 + S.width * 2
    });
    S.redo[pageNum] = [];
    markDirty();
    repaintInk(pageOf(pageNum));
  }

  function paintMark(ctx, a) {
    if (a.tool === 'text') {
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
      ctx.fillStyle = a.color;
      ctx.font = a.size + 'px Inter, system-ui, sans-serif';
      ctx.textBaseline = 'top';
      String(a.text).split('\n').forEach((line, i) => ctx.fillText(line, a.x, a.y + i * a.size * 1.25));
      return;
    }
    if (!a.points || !a.points.length) return;
    ctx.globalCompositeOperation = a.tool === 'eraser' ? 'destination-out' : 'source-over';
    ctx.globalAlpha = a.tool === 'highlighter' ? 0.32 : 1;
    ctx.strokeStyle = a.color;
    ctx.lineWidth = a.tool === 'highlighter' ? a.width * 4 : (a.tool === 'eraser' ? a.width * 3 : a.width);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    a.points.forEach((pt, i) => { if (i === 0) ctx.moveTo(pt.x, pt.y); else ctx.lineTo(pt.x, pt.y); });
    if (a.points.length === 1) ctx.lineTo(a.points[0].x + 0.1, a.points[0].y + 0.1);
    ctx.stroke();
  }

  function paintInto(ctx, list, unit) {
    ctx.save();
    ctx.scale(unit, unit);
    (list || []).forEach(a => paintMark(ctx, a));
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  function repaintInk(p) {
    if (!p || !p.ink) return;
    const ctx = p.ink.getContext('2d');
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, p.ink.width, p.ink.height);
    paintInto(ctx, S.ink[p.num], p.ink._unit || 1);
  }

  function undo() {
    if (!S || !S.ann) return;
    const n = S.current + 1, list = S.ink[n];
    if (!list || !list.length) return;
    (S.redo[n] || (S.redo[n] = [])).push(list.pop());
    repaintInk(pageOf(n));
    markDirty();
  }
  function redo() {
    if (!S || !S.ann) return;
    const n = S.current + 1, stack = S.redo[n];
    if (!stack || !stack.length) return;
    (S.ink[n] || (S.ink[n] = [])).push(stack.pop());
    repaintInk(pageOf(n));
    markDirty();
  }
  function clearPage() {
    if (!S || !S.ann) return;
    const n = S.current + 1;
    if (!(S.ink[n] || []).length) return;
    S.redo[n] = (S.ink[n] || []).slice().reverse().concat(S.redo[n] || []);
    S.ink[n] = [];
    repaintInk(pageOf(n));
    markDirty();
  }

  function markedPages() {
    return Object.keys(S.ink).map(Number).filter(n => (S.ink[n] || []).length).sort((a, b) => a - b);
  }

  function markDirty() {
    S.dirty = true;
    setSaveState('dirty');
    if (S.ann && S.ann.autosave !== false) {
      clearTimeout(S.saveTimer);
      S.saveTimer = setTimeout(() => save(true), AUTOSAVE_MS);
    }
  }

  function setSaveState(state) { S.saveState = state; paintState(); }

  function paintState() {
    if (!els.state || !S) return;
    const map = { '': '', dirty: 'Not saved yet', saving: 'Saving\u2026', saved: 'Saved', failed: 'Save failed' };
    els.state.className = 'pdfv-state ' + (S.saveState || '');
    els.state.textContent = map[S.saveState] || '';
    if (els.savebtn) {
      els.savebtn.textContent = S.saveState === 'failed' ? 'Try again'
        : ((S.ann && S.ann.saveLabel) || 'Save');
      els.savebtn.disabled = !!S.saving || (!S.dirty && S.saveState !== 'failed');
      els.savebtn.classList.toggle('on', S.saveState === 'dirty' || S.saveState === 'failed');
    }
  }

  /* Rasterise ONLY the ink — one transparent PNG per marked page, at twice
     the page's own point size — and hand it to the caller. */
  async function buildOverlays() {
    const out = [];
    for (const n of markedPages()) {
      const p = pageOf(n);
      const unit = 2;
      const c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(p.w * unit));
      c.height = Math.max(1, Math.round(p.h * unit));
      paintInto(c.getContext('2d'), S.ink[n], unit);
      out.push({ page: n, dataUrl: c.toDataURL('image/png'), width: p.w, height: p.h });
    }
    return out;
  }

  async function save(isAuto) {
    if (!S || !S.ann || S.saving) return;
    if (!S.dirty && S.saveState !== 'failed') return;
    if (!markedPages().length) { S.dirty = false; setSaveState(''); return; }
    clearTimeout(S.saveTimer);
    S.saving = true;
    setSaveState('saving');
    const s = S;
    try {
      const overlays = await buildOverlays();
      const res = await S.ann.onSave(overlays, {
        bytes: S.bytes, pageCount: S.pages.length, filename: S.filename, auto: !!isAuto
      });
      if (S !== s) return;                       // the document was closed
      if (res === false) throw new Error('not saved');
      S.saving = false;
      S.dirty = false;
      setSaveState('saved');
    } catch (e) {
      if (S !== s) return;
      /* The marks stay exactly where they are — nothing is discarded. */
      S.saving = false;
      setSaveState('failed');
      if (!isAuto) console.warn('[PDFVIEW] save failed:', e && e.message);
    }
  }

  /* ══════════════════════════ FIND ════════════════════════════════════ */

  function toggleFind(on) {
    const want = (on === undefined) ? !root.classList.contains('finding') : !!on;
    root.classList.toggle('finding', want);
    if (want) setTimeout(() => els.findq.focus(), 30);
    else { clearHighlights(); if (S) S.find = null; els.findcount.textContent = ''; }
  }

  async function textOf(p) {
    if (S.text[p.num]) return S.text[p.num];
    const vp = p.page.getViewport({ scale: 1 });
    const content = await p.page.getTextContent();
    const items = content.items.map(it => {
      const tx = window.pdfjsLib.Util.transform(vp.transform, it.transform);
      const h = Math.hypot(tx[2], tx[3]) || 10;
      return { str: it.str || '', x: tx[4], y: tx[5] - h, w: it.width || 0, h: h };
    });
    S.text[p.num] = items;
    return items;
  }

  async function runFind(term) {
    if (!S) return;
    term = String(term || '').trim();
    clearHighlights();
    if (!term) { S.find = null; els.findcount.textContent = ''; return; }
    els.findcount.textContent = 'searching\u2026';
    const needle = term.toLowerCase();
    const matches = [];
    for (const p of S.pages) {
      let items;
      try { items = await textOf(p); } catch (e) { continue; }
      items.forEach(it => {
        if (it.str && it.str.toLowerCase().indexOf(needle) !== -1) matches.push({ page: p.num, rect: it });
      });
      if (matches.length > 400) break;
    }
    S.find = { term: term, matches: matches, idx: -1 };
    if (!matches.length) { els.findcount.textContent = 'no matches'; return; }
    stepMatch(1);
  }

  function stepMatch(dir) {
    if (!S || !S.find || !S.find.matches.length) return;
    const n = S.find.matches.length;
    S.find.idx = ((S.find.idx + dir) % n + n) % n;
    const m = S.find.matches[S.find.idx];
    els.findcount.textContent = (S.find.idx + 1) + ' / ' + n;
    clearHighlights();
    const p = pageOf(m.page);
    const ctx = p.hl.getContext('2d');
    const unit = p.hl._unit || 1;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, p.hl.width, p.hl.height);
    ctx.save();
    ctx.scale(unit, unit);
    ctx.fillStyle = 'rgba(255,214,0,.45)';
    ctx.fillRect(m.rect.x - 1, m.rect.y - 1, (m.rect.w || 40) + 2, m.rect.h + 2);
    ctx.restore();
    els.scroll.scrollTop = Math.max(0, p.top + m.rect.y * p.scale - els.scroll.clientHeight * 0.35);
    update();
  }

  function clearHighlights() {
    if (!S) return;
    S.pages.forEach(p => {
      if (!p.hl || !p.hl.width) return;
      const ctx = p.hl.getContext('2d');
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, p.hl.width, p.hl.height);
    });
  }

  /* ══════════════════════════ ACTIONS ═════════════════════════════════ */

  function onClick(e) {
    const swatch = e.target.closest('.pdfv-swatch');
    if (swatch) { setColor(swatch.dataset.color); return; }
    const toolBtn = e.target.closest('[data-tool]');
    if (toolBtn) { setTool(toolBtn.dataset.tool); return; }
    const btn = e.target.closest('[data-a]');
    if (!btn || btn.disabled) return;
    const a = btn.dataset.a;
    if (a === 'close') close();
    else if (a === 'retry') { const o = btn._retry; if (o) open(o); }
    else if (a === 'prev') gotoPage(0, -1);
    else if (a === 'next') gotoPage(0, 1);
    else if (a === 'in') zoomBy(1.25);
    else if (a === 'out') zoomBy(1 / 1.25);
    else if (a === 'fitpage') setMode('page');
    else if (a === 'fitwidth') setMode('width');
    else if (a === 'dl') download();
    else if (a === 'openraw') openRaw();
    else if (a === 'full') toggleFull();
    else if (a === 'find') toggleFind();
    else if (a === 'findnext') stepMatch(1);
    else if (a === 'findprev') stepMatch(-1);
    else if (a === 'findclose') toggleFind(false);
    else if (a === 'undo') undo();
    else if (a === 'redo') redo();
    else if (a === 'clearpage') clearPage();
    else if (a === 'thin') setWidth(1.5);
    else if (a === 'med') setWidth(3);
    else if (a === 'thick') setWidth(6);
    else if (a === 'tools') els.ann.classList.toggle('collapsed');
    else if (a === 'save') save(false);
  }

  function onKey(e) {
    if (!root || !root.classList.contains('on')) return;
    const inInput = e.target === els.pgin || e.target === els.findq;
    if (e.key === 'Escape') {
      e.preventDefault(); e.stopPropagation();
      if (root.classList.contains('finding')) toggleFind(false); else close();
      return;
    }
    if (e.key === 'Tab') { trapTab(e); return; }
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key.toLowerCase() === 'f') { e.preventDefault(); toggleFind(true); return; }
    if (S && S.ann && mod && e.key.toLowerCase() === 's') { e.preventDefault(); save(false); return; }
    if (S && S.ann && mod && e.key.toLowerCase() === 'z') { e.preventDefault(); if (e.shiftKey) redo(); else undo(); return; }
    if (S && S.ann && mod && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); return; }
    if (inInput || !S || !S.pages.length) return;
    if (mod || e.altKey) return;
    if (e.key === '+' || e.key === '=') { e.preventDefault(); zoomBy(1.25); }
    else if (e.key === '-' || e.key === '_') { e.preventDefault(); zoomBy(1 / 1.25); }
    else if (e.key === '0') { e.preventDefault(); setMode('page'); }
    else if (e.key.toLowerCase() === 'f') { e.preventDefault(); toggleFull(); }
    else if (e.key === 'PageDown') { e.preventDefault(); gotoPage(0, 1); }
    else if (e.key === 'PageUp') { e.preventDefault(); gotoPage(0, -1); }
    else if ((e.key === 'ArrowRight' || e.key === 'ArrowLeft') && S.mode !== 'zoom') {
      e.preventDefault();
      gotoPage(0, e.key === 'ArrowRight' ? 1 : -1);
    }
  }
  function trapTab(e) {
    const f = Array.from(root.querySelectorAll('button:not(:disabled), input, [tabindex="0"]'))
      .filter(n => n.offsetParent !== null);
    if (!f.length) return;
    const first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    else if (!root.contains(document.activeElement)) { e.preventDefault(); first.focus(); }
  }

  function toggleFull() {
    if (!document.fullscreenElement) { if (root.requestFullscreen) root.requestFullscreen().catch(() => {}); }
    else if (document.exitFullscreen) document.exitFullscreen().catch(() => {});
  }
  function download() {
    if (!S || !S.blobUrl) return;
    const a = document.createElement('a');
    a.href = S.blobUrl;
    a.download = S.filename || 'document.pdf';
    document.body.appendChild(a); a.click(); a.remove();
  }
  function openRaw() {
    if (!S || !S.blobUrl) return;
    const w = window.open(S.blobUrl, '_blank', 'noopener');
    if (!w) download();
  }

  /* ── convenience opener for a student's own submission ────────────── */
  function openSubmission(id, o) {
    o = o || {};
    return open({
      title: o.title || 'My answer paper',
      filename: o.filename,
      fit: o.fit,
      load: async function () {
        let sess = null;
        try { sess = JSON.parse(localStorage.getItem('abhyas_session') || 'null'); } catch (e) {}
        if (!sess || !sess.token || !sess.username) throw new Error('Please sign in again to open this file.');
        const res = await callGas({ action: 'getMySubmissionPdf', username: sess.username, token: sess.token, id: String(id) });
        if (!res || !res.success) throw new Error((res && res.error) || 'Could not load the PDF.');
        return { base64: res.base64, filename: res.filename };
      }
    });
  }

  document.addEventListener('click', function (e) {
    const el = e.target.closest && e.target.closest('[data-pdf-submission]');
    if (!el) return;
    e.preventDefault();
    openSubmission(el.getAttribute('data-pdf-submission'), { title: el.getAttribute('data-pdf-title') || undefined });
  });

  window.PDFVIEW = {
    open: open,
    close: close,
    openSubmission: openSubmission,
    isOpen: function () { return !!(root && root.classList.contains('on')); },
    isDirty: function () { return !!(S && S.dirty); },
    /* True only while an annotate session has unsaved ink. Used by
       admin.html's beforeunload guard so an admin who has just red-penned
       a paper cannot lose it by closing the tab. */
    hasUnsavedMarks: function () { return !!(S && S.ann && S.dirty); },
    setTool: setTool, setColor: setColor, setWidth: setWidth,
    undo: undo, redo: redo, clearPage: clearPage,
    save: function () { return save(false); }
  };
})();