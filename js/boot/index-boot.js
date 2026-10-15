/* ═══════════════════════════════════════════════════════════════════════
   index-boot.js — merged from index-1.js .. index-3.js (Phase 0, v1.45)

   Load order preserved from the original three <script> tags:
     1. theme bootstrap   (was index-1) — apply stored theme, else prefers-color-scheme
     2. boot-session mark (was index-2)
     3. frame-bust        (was index-3) — now try/catch-guarded

   Not wrapped in an IIFE: the fragments ran as separate global scripts and
   any top-level `var` they declared must remain global. Concatenation
   preserves that.
   ═══════════════════════════════════════════════════════════════════════ */

/* 1. Theme bootstrap ─────────────────────────────────────────────────── */
(function(){
  try{
    var raw = localStorage.getItem('abhyas_theme');
    var t = raw ? JSON.parse(raw) : null;
    if (t !== 'dark' && t !== 'light') {
      t = (window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light';
    }
    if (t === 'dark') {
      document.documentElement.classList.add('dark');
      var metas = document.querySelectorAll('meta[name="theme-color"]');
      for (var i = 0; i < metas.length; i++) metas[i].setAttribute('content', '#080B14');
    }
  } catch(e) {}
})();

/* 2. Boot-session marker ─────────────────────────────────────────────── */
(function(){
  try{
    var s = JSON.parse(localStorage.getItem('abhyas_session') || 'null');
    if (s && s.type && s.username) document.documentElement.classList.add('boot-session');
  }catch(e){}
})();

/* 3. Frame-bust ──────────────────────────────────────────────────────── */
try{
  if (window.top !== window.self) window.top.location = window.self.location;
}catch(e){}