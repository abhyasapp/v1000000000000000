/* ═══════════════════════════════════════════════════════════════════════
   ACTIONS.JS (v1.38) — event handlers without inline JavaScript

   Pages used to carry about 540 inline handlers (onclick="REV.start('wr')"). That forced the Content-Security-Policy to
   allow 'unsafe-inline' scripts, which makes any HTML-injection bug a script-injection bug. Handlers are now written as
   data-on-click="REV.start('wr')" (also data-on-change, data-on-input, data-on-keydown ...) and run here.

   This is NOT eval. The text is parsed by a tiny parser that understands only:
       Name.method(args)  chained calls  member access  string / number / true / false / null / undefined literals
       this  event  { key: value } objects  [ ] arrays  !x  a && b  a || b  a === b  a !== b  return [expr]  ;
   There is no assignment, no new, no function expression, and the names constructor, __proto__, prototype, eval and
   Function are refused. A handler that needs more is written as a normal function and called from here.

   Names are looked up on window. Top-level const/let objects are not on window, so expose.js copies the ones handlers
   use. `this` is the element that carries the attribute and `event` is the real event, as before. Handlers run from the
   element outward (like bubbling) and stop when one calls event.stopPropagation(). `return false` calls preventDefault.
   ═══════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  const BLOCKED = new Set(['constructor', '__proto__', 'prototype', 'eval', 'Function', 'globalThis']);
  const KEYWORDS = { true: true, false: false, null: null, undefined: undefined };

  /* ── tokenizer ─────────────────────────────────────────────────── */
  function tokenize(src) {
    const out = []; let i = 0; const n = src.length;
    while (i < n) {
      const c = src[i];
      if (/\s/.test(c)) { i++; continue; }
      if (c === '"' || c === "'") {
        let j = i + 1, s = '';
        while (j < n && src[j] !== c) {
          if (src[j] === '\\') {
            const e = src[j + 1];
            if (e === 'n') s += '\n'; else if (e === 't') s += '\t'; else if (e === 'r') s += '\r';
            else if (e === 'u' && /^[0-9a-fA-F]{4}$/.test(src.slice(j + 2, j + 6))) { s += String.fromCharCode(parseInt(src.slice(j + 2, j + 6), 16)); j += 4; }
            else s += e;
            j += 2;
          } else { s += src[j]; j++; }
        }
        if (j >= n) throw new Error('unterminated string');
        out.push({ t: 'str', v: s }); i = j + 1; continue;
      }
      if (/[0-9]/.test(c) || (c === '-' && /[0-9]/.test(src[i + 1] || ''))) {
        const m = /^-?\d+(?:\.\d+)?(?:e[+-]?\d+)?/i.exec(src.slice(i));
        out.push({ t: 'num', v: Number(m[0]) }); i += m[0].length; continue;
      }
      if (/[A-Za-z_$]/.test(c)) {
        const m = /^[A-Za-z_$][\w$]*/.exec(src.slice(i));
        out.push({ t: 'id', v: m[0] }); i += m[0].length; continue;
      }
      const three = src.slice(i, i + 3), two = src.slice(i, i + 2);
      if (three === '===' || three === '!==') { out.push({ t: 'p', v: three }); i += 3; continue; }
      if (two === '&&' || two === '||') { out.push({ t: 'p', v: two }); i += 2; continue; }
      if ('().,;:{}[]!'.indexOf(c) !== -1) { out.push({ t: 'p', v: c }); i++; continue; }
      throw new Error('unexpected "' + c + '"');
    }
    return out;
  }

  /* ── parser (recursive descent) → small AST ────────────────────── */
  function parse(src) {
    const tk = tokenize(src); let p = 0;
    const peek = () => tk[p], isP = v => tk[p] && tk[p].t === 'p' && tk[p].v === v;
    const eat = v => { if (!isP(v)) throw new Error('expected ' + v); p++; };
    function program() {
      const stmts = [];
      while (p < tk.length) { if (isP(';')) { p++; continue; } stmts.push(stmt()); if (p < tk.length && !isP(';')) throw new Error('unexpected token'); }
      return stmts;
    }
    function stmt() {
      if (peek().t === 'id' && peek().v === 'return') {
        p++; if (p >= tk.length || isP(';')) return { k: 'ret', e: null };
        return { k: 'ret', e: expr() };
      }
      return { k: 'expr', e: expr() };
    }
    function expr() { return orExpr(); }
    function orExpr() { let l = andExpr(); while (isP('||')) { p++; l = { k: 'or', l, r: andExpr() }; } return l; }
    function andExpr() { let l = eqExpr(); while (isP('&&')) { p++; l = { k: 'and', l, r: eqExpr() }; } return l; }
    function eqExpr() {
      let l = unary();
      while (isP('===') || isP('!==')) { const op = tk[p++].v; l = { k: 'eq', neg: op === '!==', l, r: unary() }; }
      return l;
    }
    function unary() { if (isP('!')) { p++; return { k: 'not', e: unary() }; } return postfix(); }
    function postfix() {
      let e = primary();
      for (;;) {
        if (isP('.')) { p++; const t = tk[p++]; if (!t || t.t !== 'id') throw new Error('expected name'); e = { k: 'mem', o: e, name: t.v }; }
        else if (isP('[')) { p++; const idx = expr(); eat(']'); e = { k: 'idx', o: e, i: idx }; }
        else if (isP('(')) { p++; const args = []; if (!isP(')')) { for (;;) { args.push(expr()); if (isP(',')) { p++; continue; } break; } } eat(')'); e = { k: 'call', f: e, args }; }
        else break;
      }
      return e;
    }
    function primary() {
      const t = tk[p]; if (!t) throw new Error('unexpected end');
      if (t.t === 'str' || t.t === 'num') { p++; return { k: 'lit', v: t.v }; }
      if (t.t === 'id') {
        p++;
        if (Object.prototype.hasOwnProperty.call(KEYWORDS, t.v)) return { k: 'lit', v: KEYWORDS[t.v] };
        if (t.v === 'this') return { k: 'this' };
        if (t.v === 'event') return { k: 'event' };
        return { k: 'name', name: t.v };
      }
      if (isP('(')) { p++; const e = expr(); eat(')'); return e; }
      if (isP('[')) { p++; const items = []; if (!isP(']')) { for (;;) { items.push(expr()); if (isP(',')) { p++; continue; } break; } } eat(']'); return { k: 'arr', items }; }
      if (isP('{')) {
        p++; const props = [];
        if (!isP('}')) {
          for (;;) {
            const kt = tk[p++]; if (!kt || (kt.t !== 'id' && kt.t !== 'str' && kt.t !== 'num')) throw new Error('bad object key');
            eat(':'); props.push([String(kt.v), expr()]);
            if (isP(',')) { p++; if (isP('}')) break; continue; } break;
          }
        }
        eat('}'); return { k: 'obj', props };
      }
      throw new Error('unexpected token');
    }
    return program();
  }

  /* ── evaluator ─────────────────────────────────────────────────── */
  const RET = { returned: false, value: undefined };
  function guard(name) { if (BLOCKED.has(name)) throw new Error('"' + name + '" is not allowed'); }
  function ev(n, cx) {
    switch (n.k) {
      case 'lit': return n.v;
      case 'this': return cx.el;
      case 'event': return cx.event;
      case 'name': guard(n.name); if (!(n.name in window)) throw new Error(n.name + ' is not defined'); return window[n.name];
      case 'mem': { const o = ev(n.o, cx); guard(n.name); if (o == null) throw new Error('cannot read ' + n.name + ' of ' + o); return o[n.name]; }
      case 'idx': { const o = ev(n.o, cx), i = ev(n.i, cx); guard(String(i)); if (o == null) throw new Error('cannot index ' + o); return o[i]; }
      case 'call': {
        let fn, self;
        if (n.f.k === 'mem') { self = ev(n.f.o, cx); guard(n.f.name); if (self == null) throw new Error('cannot call ' + n.f.name + ' of ' + self); fn = self[n.f.name]; }
        else if (n.f.k === 'idx') { self = ev(n.f.o, cx); const i = ev(n.f.i, cx); guard(String(i)); fn = self[i]; }
        else { fn = ev(n.f, cx); self = undefined; }
        if (typeof fn !== 'function') throw new Error('not a function');
        return fn.apply(self, n.args.map(a => ev(a, cx)));
      }
      case 'not': return !ev(n.e, cx);
      case 'and': { const l = ev(n.l, cx); return l ? ev(n.r, cx) : l; }
      case 'or': { const l = ev(n.l, cx); return l ? l : ev(n.r, cx); }
      case 'eq': { const r = ev(n.l, cx) === ev(n.r, cx); return n.neg ? !r : r; }
      case 'arr': return n.items.map(i => ev(i, cx));
      case 'obj': { const o = {}; n.props.forEach(([k, v]) => { guard(k); o[k] = ev(v, cx); }); return o; }
    }
    throw new Error('unsupported');
  }

  const cache = new Map();
  const stats = { run: 0, errors: 0, last: '' };
  function compile(text) {
    let ast = cache.get(text);
    if (!ast) { ast = parse(text); if (cache.size > 3000) cache.clear(); cache.set(text, ast); }
    return ast;
  }
  /* Run handler text. Returns the value of a `return` statement (or undefined). */
  function run(text, el, event) {
    const ast = compile(text); const cx = { el, event };
    for (const s of ast) {
      if (s.k === 'ret') return s.e ? ev(s.e, cx) : undefined;
      ev(s.e, cx);
    }
    return undefined;
  }
  /* Does this text parse, and do its names exist? (used by tests and the browser audit; runs nothing) */
  function check(text) {
    try {
      const ast = compile(text); const heads = [];
      (function walk(n) {
        if (!n || typeof n !== 'object') return;
        if (Array.isArray(n)) { n.forEach(walk); return; }
        if (n.k === 'name') heads.push(n.name);
        Object.keys(n).forEach(k => { if (k !== 'v') walk(n[k]); });
      })(ast);
      const missing = heads.filter(h => !(h in window));
      if (missing.length) return { ok: false, error: 'not defined: ' + missing.join(', ') };
      /* every called method must exist: walk Name.a.b(...) through names and members only (nothing is run) */
      const path = n => {
        if (n.k === 'name') { try { return window[n.name]; } catch (e) { return undefined; } }
        if (n.k === 'mem') { const o = path(n.o); return o == null ? undefined : o[n.name]; }
        return undefined;
      };
      const bad = [];
      (function walkCalls(n) {
        if (!n || typeof n !== 'object') return;
        if (Array.isArray(n)) { n.forEach(walkCalls); return; }
        if (n.k === 'call' && n.f && n.f.k === 'mem') {
          const base = path(n.f.o);
          if (base != null && typeof base[n.f.name] !== 'function') bad.push(describe(n.f));
        } else if (n.k === 'call' && n.f && n.f.k === 'name' && typeof window[n.f.name] !== 'function' && !(n.f.name in window && window[n.f.name] == null)) {
          bad.push(n.f.name);
        }
        Object.keys(n).forEach(k => { if (k !== 'v') walkCalls(n[k]); });
      })(ast);
      function describe(m) { return (m.o.k === 'name' ? m.o.name : m.o.k === 'mem' ? describe(m.o) : '?') + '.' + m.name; }
      return bad.length ? { ok: false, error: 'not a function: ' + [...new Set(bad)].join(', ') } : { ok: true };
    } catch (e) { return { ok: false, error: e.message }; }
  }

  /* ── delegation ────────────────────────────────────────────────── */
  /* attribute name -> the DOM event that carries it. focus/blur do not bubble, so use focusin/focusout. error/load
     do not bubble either: they are caught in the capture phase and only the target itself is checked. */
  const EVENTS = {
    click: 'click', dblclick: 'dblclick', change: 'change', input: 'input', keydown: 'keydown', keyup: 'keyup',
    keypress: 'keypress', submit: 'submit', mousedown: 'mousedown', mouseup: 'mouseup', mouseover: 'mouseover',
    mouseout: 'mouseout', touchstart: 'touchstart', paste: 'paste', toggle: 'toggle', scroll: 'scroll',
    focus: 'focusin', blur: 'focusout', error: 'error', load: 'load'
  };
  const TARGET_ONLY = { error: true, load: true, toggle: true, scroll: true };

  function fire(attr, el, event) {
    const text = el.getAttribute(attr);
    if (!text) return;
    stats.run++;
    try {
      if (run(text, el, event) === false && event.cancelable) event.preventDefault();
    } catch (err) {
      stats.errors++; stats.last = attr + '="' + text + '": ' + err.message;
      console.error('[action] ' + stats.last);
    }
  }
  function install() {
    Object.keys(EVENTS).forEach(name => {
      const attr = 'data-on-' + name;
      const capture = name === 'error' || name === 'load' || name === 'toggle' || name === 'scroll';
      document.addEventListener(EVENTS[name], event => {
        let el = event.target;
        if (!(el instanceof Element)) el = el && el.parentElement;
        if (TARGET_ONLY[name]) { if (el && el.hasAttribute && el.hasAttribute(attr)) fire(attr, el, event); return; }
        while (el && el !== document) {
          if (el.hasAttribute && el.hasAttribute(attr)) { fire(attr, el, event); if (event.cancelBubble) break; }
          el = el.parentElement;
        }
      }, capture);
    });
  }

  window.ACTIONS = { run, check, parse, stats, EVENTS };
  if (typeof document !== 'undefined') install();
})();

/* Small helpers for the few handlers that used to be several statements. Handler text may call these. */
window.ACT = {
  go(url) { window.location.href = String(url); },
  hideParent(el) { if (el && el.parentElement) el.parentElement.style.display = 'none'; },
  showParent(el) { if (el && el.parentElement) el.parentElement.style.display = ''; },
  /* true (and stops the page scrolling on Space) when the key is Enter or Space */
  enterOrSpace(e) { if (e && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); return true; } return false; },
  autosync(el) {
    try { localStorage.setItem('abhyas_autosync', JSON.stringify(el.checked)); } catch (e) { /* storage unavailable */ }
    if (el.checked && typeof CACHE !== 'undefined') CACHE.autoSync();
  },
  later(ms, obj, method, ...args) { if (!obj || /^(constructor|__proto__|prototype)$/.test(method)) return; setTimeout(() => obj[method](...args), Number(ms) || 0); },
  afterThen(promise, obj, method, ...args) { if (!obj || /^(constructor|__proto__|prototype)$/.test(method)) return; return Promise.resolve(promise).then(() => obj[method](...args)); }
};
