/* ═══════════════════════════════════════════════════════════════════════
   SCREEN-FOCUS.JS (v1.41) — less on screen, one thing at a time

   HEADERMENU  The top bar used to carry eight icon buttons. The ones that are settings, not status (text size, light/dark,
               fullscreen, install, sign out) now live in one "More" menu. The buttons are the same buttons with the same
               handlers; they were only moved. Keyboard: Enter/Space opens, arrows move, Escape closes and returns focus.

   HOME MODE   The student chooses: Simple (default: just what to do next) or Detailed (also this week, streak and
               achievements on Home). The three cards are MOVED between Progress and Home, never copied, so every module
               keeps writing into the same elements. The choice is remembered on this device.

   VIEWFOCUS   After every screen change focus moves to that screen's heading and a polite announcement is made, so a
               keyboard or screen-reader user is not left on a button in the menu that no longer matters.

   HOMEFOCUS   Home could stack a dozen notices at once (resume, reviews due, daily 10, announcements, backup reminder...).
               Now the most useful ONE is shown, in this order, and the rest wait behind a "N more" button. Nothing is
               deleted: every module still fills its own slot, this only decides what is visible.
   ═══════════════════════════════════════════════════════════════════════ */
const HEADERMENU = {
  _pop() { return document.getElementById('tb-menu-pop'); },
  _btn() { return document.getElementById('tb-more-btn'); },
  _items() {
    const p = HEADERMENU._pop();
    return p ? [...p.querySelectorAll('[role="menuitem"]')].filter(b => b.offsetParent !== null) : [];
  },
  isOpen() { const p = HEADERMENU._pop(); return !!p && !p.hidden; },
  open() {
    const p = HEADERMENU._pop(), b = HEADERMENU._btn(); if (!p || !b) return;
    p.hidden = false; b.setAttribute('aria-expanded', 'true');
    const first = HEADERMENU._items()[0]; if (first) first.focus();
  },
  close(returnFocus) {
    const p = HEADERMENU._pop(), b = HEADERMENU._btn(); if (!p || !b) return;
    p.hidden = true; b.setAttribute('aria-expanded', 'false');
    if (returnFocus) b.focus();
  },
  toggle() { if (HEADERMENU.isOpen()) HEADERMENU.close(); else HEADERMENU.open(); },
  init() {
    document.addEventListener('click', e => {
      if (!HEADERMENU.isOpen()) return;
      const inside = e.target.closest && e.target.closest('.tb-more');
      if (!inside) HEADERMENU.close();                                                    /* tap elsewhere */
      else if (e.target.closest('.tb-menu-item') && !e.target.closest('[data-keep-open]')) HEADERMENU.close();
    });
    document.addEventListener('keydown', e => {
      if (!HEADERMENU.isOpen()) return;
      if (e.key === 'Escape') { e.preventDefault(); HEADERMENU.close(true); return; }
      if (e.key === 'Tab') { HEADERMENU.close(); return; }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Home' || e.key === 'End') {
        e.preventDefault();
        const items = HEADERMENU._items(); if (!items.length) return;
        let i = items.indexOf(document.activeElement);
        if (e.key === 'Home') i = 0; else if (e.key === 'End') i = items.length - 1;
        else i = e.key === 'ArrowDown' ? (i + 1) % items.length : (i - 1 + items.length) % items.length;
        items[i].focus();
      }
    });
  }
};

const HOMEFOCUS = {
  /* most useful first: what the student was in the middle of, then what is due, then information */
  ORDER: ['resume-slot', 'practice-resume-slot', 'recovery-slot', 'due-strip', 'daily10-slot',
          'verify-banner', 'announce-bar', 'home-marquee', 'backup-nudge-slot'],
  _timer: null,
  MODE_KEY: 'abhyas_home_mode',
  DETAIL_IDS: ['digest-slot', 'streak-card', 'badges-strip'],
  _homes: {},                                   /* id -> a marker left where the card lives when Simple */

  mode() { try { return localStorage.getItem(HOMEFOCUS.MODE_KEY) === 'detailed' ? 'detailed' : 'simple'; } catch (e) { return 'simple'; } },
  setMode(m) {
    m = m === 'detailed' ? 'detailed' : 'simple';
    try { localStorage.setItem(HOMEFOCUS.MODE_KEY, m); } catch (e) { /* storage unavailable: applies for this visit only */ }
    HOMEFOCUS._place(m);
  },
  toggleMode() { HOMEFOCUS.setMode(HOMEFOCUS.mode() === 'detailed' ? 'simple' : 'detailed'); },
  _place(m) {
    const target = document.getElementById('home-detail'); if (!target) return;
    HOMEFOCUS.DETAIL_IDS.forEach(id => {
      const el = document.getElementById(id); if (!el) return;
      if (m === 'detailed') {
        if (el.parentNode !== target) {
          if (!HOMEFOCUS._homes[id]) { const mk = document.createComment('home:' + id); el.parentNode.insertBefore(mk, el); HOMEFOCUS._homes[id] = mk; }
          target.appendChild(el);
        }
      } else if (HOMEFOCUS._homes[id] && HOMEFOCUS._homes[id].parentNode) {
        HOMEFOCUS._homes[id].parentNode.insertBefore(el, HOMEFOCUS._homes[id]);
        HOMEFOCUS._homes[id].remove(); delete HOMEFOCUS._homes[id];
      }
    });
    const btn = document.getElementById('home-mode-btn');
    if (btn) {
      const label = m === 'detailed' ? 'Show less on Home' : 'Show more on Home';
      /* The label lives in its own span so the button can carry an icon; the
         button's textContent is still exactly the label (the browser tests
         read it), because the <i> draws its glyph from CSS. */
      const txt = document.getElementById('home-mode-text');
      if (txt) txt.textContent = label; else btn.textContent = label;
      btn.setAttribute('aria-pressed', String(m === 'detailed'));
    }
    document.querySelectorAll('.home-mode-opt').forEach(b => b.setAttribute('aria-pressed', String(b.getAttribute('data-mode') === m)));
  },

  _has(el) {
    if (!el || el.hidden) return false;
    if (el.style && el.style.display === 'none') return false;
    return el.children.length > 0 || /\S/.test(el.textContent || '');
  },
  apply() {
    const box = document.getElementById('home-notices'), more = document.getElementById('notice-more');
    if (!box || !more) return;
    const shown = HOMEFOCUS.ORDER.map(id => document.getElementById(id)).filter(HOMEFOCUS._has);
    HOMEFOCUS.ORDER.forEach(id => { const el = document.getElementById(id); if (el) el.removeAttribute('data-extra'); });
    shown.slice(1).forEach(el => el.setAttribute('data-extra', ''));
    const extra = shown.length - 1;
    more.hidden = extra < 1;
    if (extra >= 1) {
      const open = box.classList.contains('open');
      more.setAttribute('aria-expanded', String(open));
      more.textContent = open ? 'Show fewer notices' : extra + (extra === 1 ? ' more notice' : ' more notices');
    }
  },
  toggle() {
    const box = document.getElementById('home-notices'); if (!box) return;
    box.classList.toggle('open'); HOMEFOCUS.apply();
  },
  _soon() { clearTimeout(HOMEFOCUS._timer); HOMEFOCUS._timer = setTimeout(HOMEFOCUS.apply, 120); },
  init() {
    const box = document.getElementById('home-notices'); if (!box) return;
    /* the button sits OUTSIDE the watched box, so changing its text never re-triggers this */
    new MutationObserver(HOMEFOCUS._soon).observe(box, { subtree: true, childList: true, attributes: true, attributeFilter: ['hidden', 'style'] });
    HOMEFOCUS.apply();
    HOMEFOCUS._place(HOMEFOCUS.mode());
  }
};

const VIEWFOCUS = {
  _live() {
    let el = document.getElementById('sr-live');
    if (!el) {
      el = document.createElement('div'); el.id = 'sr-live'; el.className = 'sr-only';
      el.setAttribute('role', 'status'); el.setAttribute('aria-live', 'polite'); document.body.appendChild(el);
    }
    return el;
  },
  after(view) {
    const root = document.getElementById('view-' + view); if (!root) return;
    const h = root.querySelector('.pg-head h2') || root.querySelector('h1, h2');
    if (!h) return;
    if (!h.hasAttribute('tabindex')) h.setAttribute('tabindex', '-1');
    h.focus({ preventScroll: true });
    VIEWFOCUS._live().textContent = (h.textContent || '').trim();
  },
  init() {
    if (typeof UI === 'undefined' || typeof UI._goRaw !== 'function' || UI._goRaw.__focus) return;
    const raw = UI._goRaw;
    UI._goRaw = function (view) {
      const r = raw.apply(this, arguments);
      setTimeout(() => VIEWFOCUS.after(view), 80);       /* after the screen has switched */
      return r;
    };
    UI._goRaw.__focus = true;
  }
};

(function startScreenFocus() {
  const go = () => { HEADERMENU.init(); HOMEFOCUS.init(); VIEWFOCUS.init(); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', go); else go();
})();
