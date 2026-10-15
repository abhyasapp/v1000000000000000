/* ═══════════════════════════════════════════════════════════════════════
   admin-boot.js — merged from admin-1.js .. admin-4.js (Phase 0, v1.45)

   Load order preserved from the original four <script> tags:
     1. theme bootstrap      (was admin-1) — apply stored theme before first paint
     2. session-bridge mark  (was admin-2) — flag a user session bridged into admin
     3. frame-bust           (was admin-3) — escape iframing; now try/catch-guarded
     4. PDF.js worker        (was admin-4) — was running before pdfjsLib loaded,
                                             so it never fired. Now deferred with a
                                             bounded poll (max 5 s).

   Not wrapped in an IIFE: the fragments ran as separate global scripts, and any
   top-level `var` they declared must remain global. Concatenation preserves that.
   ═══════════════════════════════════════════════════════════════════════ */

/* 1. Theme bootstrap ─────────────────────────────────────────────────── */
(function(){
  try{
    var THEME_LIGHT = '#F6F7F6', THEME_DARK = '#0F1213';
    function paint(colour){
      var metas = document.querySelectorAll('meta[name="theme-color"]');
      for (var i = 0; i < metas.length; i++) metas[i].setAttribute('content', colour);
    }
    var raw = localStorage.getItem('abhyas_theme');
    var t = raw ? JSON.parse(raw) : null;
    if (t === 'dark') {
      document.documentElement.classList.add('dark');
      paint(THEME_DARK);
    } else if (t === 'light') {
      paint(THEME_LIGHT);
    }
  } catch(e) {}
})();

/* 2. Session-bridge marker ───────────────────────────────────────────── */
(function(){
  try{
    var s = JSON.parse(localStorage.getItem('abhyas_session') || 'null');
    if (s && s.type === 'user' && s.username && (s.token || s.sessionToken || s.authToken || s.userToken)) {
      document.documentElement.classList.add('session-bridge');
    }
  }catch(e){}
})();

/* 3. Frame-bust ──────────────────────────────────────────────────────── */
try{
  if (window.top !== window.self) window.top.location = window.self.location;
}catch(e){}

/* 4. PDF.js worker ───────────────────────────────────────────────────── */
(function(){
  var MAX_TRIES = 100;                 /* 100 * 50 ms = 5 s */
  var tries = 0;
  function assign(){
    if (typeof pdfjsLib !== 'undefined' && pdfjsLib.GlobalWorkerOptions) {
      pdfjsLib.GlobalWorkerOptions.workerSrc = 'vendor/pdfjs/pdf.worker.min.js';
      return true;
    }
    return false;
  }
  if (assign()) return;
  var iv = setInterval(function(){
    if (assign() || ++tries >= MAX_TRIES) clearInterval(iv);
  }, 50);
})();