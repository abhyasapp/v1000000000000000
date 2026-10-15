/* ═══════════════════════════════════════════════════════════════════════
   user-boot.js — merged from user-1.js .. user-6.js (Phase 0, v1.45)

   Load order preserved from the original six <script> tags:
     1. display data-attributes (was user-1) — fs / hc / amoled on <html>
     2. legacy font-size fallback (was user-2)
     3. frame-bust              (was user-3) — now try/catch-guarded
     4. theme bootstrap         (was user-4)
     5. Firebase lazy-load      (was user-5) — only when FIREBASE_CONFIGURED
     6. boot-gate 15 s timeout  (was user-6)

   Not wrapped in an IIFE: user-2 declares top-level `var _d` / `var _fs`,
   which were globals in the original. Concatenation preserves that.
   ═══════════════════════════════════════════════════════════════════════ */

/* 1. Display data-attributes ─────────────────────────────────────────── */
(function(){try{var d=JSON.parse(localStorage.getItem('abhyas_display')||'null')||{},e=document.documentElement;e.setAttribute('data-fs',['small','medium','large'].indexOf(d.fs)>-1?d.fs:'medium');if(d.hc===true)e.setAttribute('data-hc','1');if(d.amoled===true)e.setAttribute('data-amoled','1');}catch(x){}})();

/* 2. Legacy font-size fallback ───────────────────────────────────────── */
try{
  var _d = JSON.parse(localStorage.getItem('abhyas_display')||'null')||{};
  if (['small','medium','large'].indexOf(_d.fs) === -1) {
    var _fs = JSON.parse(localStorage.getItem('abhyas_fs')||'100');
    if (_fs > 100) document.documentElement.style.fontSize = _fs + '%';
  }
}catch(e){}

/* 3. Frame-bust ──────────────────────────────────────────────────────── */
try{
  if (window.top !== window.self) window.top.location = window.self.location;
}catch(e){}

/* 4. Theme bootstrap ─────────────────────────────────────────────────── */
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

/* 5. Firebase lazy-load ──────────────────────────────────────────────── */
if (typeof FIREBASE_CONFIGURED !== 'undefined' && FIREBASE_CONFIGURED) {
  ['firebase-app-compat.js', 'firebase-messaging-compat.js'].forEach(function(f){
    var s = document.createElement('script');
    s.src = 'https://www.gstatic.com/firebasejs/10.14.1/' + f;
    s.async = true;
    document.head.appendChild(s);
  });
}

/* 6. Boot-gate 15 s timeout ──────────────────────────────────────────── */
setTimeout(function(){
  var sg = document.getElementById('sg');
  if (!sg) return;
  if (getComputedStyle(sg).display === 'none') return;
  var hint = document.getElementById('sg-hint');
  if (hint) hint.hidden = false;
}, 15000);