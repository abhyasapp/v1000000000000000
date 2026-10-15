/* ═══════════════════════════════════════════════════════════════════════
   core.js — Abhyas student app: state, storage, sync, auth, PWA.
   (Phase 1, v1.45: renamed from js/app/main/01-state-storage-helpers.js.
    The file content is unchanged below this header.)

   Loaded FIRST on user.html, before every other js/app/* file. Companion
   feature code lives in js/app/features.js, which loads right after this.

   What is here:  LS, S, _load, _save, QDB, shared helpers (fmt, today,
   isOk, normQ, qImgHtml, qSearchHtml), toast, openMod/closeMod,
   GETFILE_GATE, netFetch, NETCHECK, CHAPSTATS, COV, ASK, AUTH, PSYNC,
   PUSH.

   What is NOT here (moved to features.js in this release):
   PWA, WEEKLY, UI, PROG, STREAK, HOME, TT, CACHE, DATA,
   PROGRESS_RESET, RESET_SNAPSHOT, TUTORIAL, APP, NET, MODAL, BOOT_ERROR.
   ═══════════════════════════════════════════════════════════════════════ */

/* ═══════════════════════════════════════════════════════════════════════
   APP.JS — Abhyas: Your path to mastery  (V1 – Cloud Sync)
   CORE — state, storage, sync, auth, PWA, weekly sets, home dashboard,
          timetable, offline cache, progress tracking, data management,
          tutorial, and app boot.
   Companion modules loaded AFTER this file:
     • objective.js  — MCQ quiz engine (QUIZ), online study (ON),
                       local file (LOC), psycho mode (PSY), review
                       lists (REV), count/progress helpers (CNT,
                       ONPROG), scope utilities.
     • subjective.js — daily question, subjective exam, topic list.
   ═══════════════════════════════════════════════════════════════════════ */

/* ═══════════════ 1. CONFIG & CONSTANTS ═══════════════ */
const APP_CONFIG = { APPS_URL: ABHYAS_CONFIG.GAS_URL };
const APPS = APP_CONFIG.APPS_URL;

const DAYS = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
const BK_TAGS = ['Need Check','Interesting','Debating','Confusing','Formulae'];
const SR_INTERVALS = [1, 3, 7, 14];   // days for spaced repetition

const WEEKLY_EXAM_WINDOW_HOURS = 12;

const LS = {
  USER:'abhyas_session',
  PROG:'abhyas_prog', BK:'abhyas_bk', FL:'abhyas_fl', WR:'abhyas_wr',
  QC:'abhyas_qc_', TT:'abhyas_tt', TT_NOTIFIED:'abhyas_tt_notified', STK:'abhyas_stk',
  FORCED_OFFLINE:'abhyas_forced_off',
  EXAM_SNAP:'abhyas_exam_snap',
  FCOUNT:'abhyas_fcount',
  CLOUD:'abhyas_cloud',
  PROFILE:'abhyas_profile',
  CHAPSTATS:'abhyas_chapstats',
  LAST_USER:'abhyas_last_user',
  WK_ATTEMPTS:'abhyas_weekly_attempts',
  COV:'abhyas_cov'
};

const APP_NAME = 'Abhyas V1';

/* ═══════════════ 2. APP STATE ═══════════════ */
const S = {
  user: null,
  online: navigator.onLine,
  forcedOffline: _load(LS.FORCED_OFFLINE, false),
  bk: _load(LS.BK, []),
  fl: _load(LS.FL, []),
  wr: _load(LS.WR, []),
  prog: _load(LS.PROG, {total:0,correct:0,sessions:[]}),
  tt: _load(LS.TT, {sessions:[], reminders:{enabled:false, leadMinutes:5}}),
  stk: _load(LS.STK, {days:[],last:''}),
  fcount: _load(LS.FCOUNT, {}),
  chapStats: _load(LS.CHAPSTATS, {}),
  weeklyAttempts: _load(LS.WK_ATTEMPTS, {}),
  cov: _load(LS.COV, {}),
  dpi: null,
  localQs: null,
  quiz: {qs:[],ans:[],mode:'',idx:0,timer:null,elapsed:0,left:0,active:false,ch:'',scope:null},
  cloud: _load(LS.CLOUD, {fid:''}),
  profile: _load(LS.PROFILE, {ver:1, id:''})
};
if(!S.tt.reminders) S.tt.reminders = {enabled:false, leadMinutes:5};
if(!Array.isArray(S.prog.sessions)) S.prog.sessions = [];
if(!S.stk.days) S.stk.days = [];
if(!S.weeklyAttempts || typeof S.weeklyAttempts !== 'object') S.weeklyAttempts = {};

(function () {
  let debug = false;
  try {
    debug = localStorage.getItem('abhyas_debug') === '1'
         || (typeof window.ABHYAS_DEBUG === 'boolean' && window.ABHYAS_DEBUG === true);
  } catch (e) {}
  window.ABHYAS_DEBUG = debug;
  if (debug) return;
  const _warn = console.warn.bind(console);
  const _info = console.info.bind(console);
  const QUIET_WARN = /^\[(normQ|SUBJ|HOURLY|adaptive|daily|retake|chapters-loader|cross-tab|AUTH|PAY_QUEUE|reset-snapshot|PDFVIEW|marking)\]/;
  const QUIET_INFO = /^\[(HOURLY|Session bridge|PDFVIEW|PAY_QUEUE)\]/;
  console.warn = function () {
    const first = String((arguments[0] == null ? '' : arguments[0]));
    if (QUIET_WARN.test(first)) return;
    _warn.apply(null, arguments);
  };
  console.info = function () {
    const first = String((arguments[0] == null ? '' : arguments[0]));
    if (QUIET_INFO.test(first)) return;
    _info.apply(null, arguments);
  };
})();

/* ═══════════════ 3. UTILITIES ═══════════════ */
function _load(k,d){try{const v=localStorage.getItem(k);return v?JSON.parse(v):d}catch{return d}}
const PSYNC_KEYS = new Set([LS.BK, LS.FL, LS.WR, LS.PROG, LS.STK, LS.CHAPSTATS, LS.COV]);
let _lastStorageWarnAt = 0;
function _save(k,v){
  try{
    localStorage.setItem(k,JSON.stringify(v));
    if(PSYNC_KEYS.has(k)) PSYNC.scheduleSync();
    return true;
  }catch(e){
    const now = Date.now();
    if(now - _lastStorageWarnAt > 30000){
      _lastStorageWarnAt = now;
      const isQuota = e && (e.name==='QuotaExceededError' || e.code===22 || e.code===1014);
      toast(isQuota
        ? '⚠️ Device storage is full — new progress/bookmarks may not be saved. Try removing some old bookmarks or flagged questions to free space.'
        : '⚠️ Could not save — some data may not have been saved.', 5000);
    }
    return false;
  }
}

const QDB = (() => {
  const DB_NAME = 'abhyas_question_cache';
  const STORE = 'sets';
  let dbPromise = null;

  function open() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      if (!window.indexedDB) { reject(new Error('IndexedDB not supported')); return; }
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => { if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE); };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return dbPromise;
  }
  async function get(key) {
    try {
      const db = await open();
      return await new Promise((resolve, reject) => {
        const req = db.transaction(STORE, 'readonly').objectStore(STORE).get(key);
        req.onsuccess = () => resolve(req.result !== undefined ? req.result : null);
        req.onerror = () => reject(req.error);
      });
    } catch (e) { return null; }
  }
  async function set(key, value) {
    try {
      const db = await open();
      await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).put(value, key);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      return true;
    } catch (e) { return false; }
  }
  async function del(key) {
    try {
      const db = await open();
      await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).delete(key);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } catch (e) {}
  }
  async function keys() {
    try {
      const db = await open();
      return await new Promise((resolve, reject) => {
        const req = db.transaction(STORE, 'readonly').objectStore(STORE).getAllKeys();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => reject(req.error);
      });
    } catch (e) { return []; }
  }
  async function clear() {
    try {
      const db = await open();
      await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).clear();
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } catch (e) {}
  }
  async function migrateFromLocalStorage() {
    const oldKeys = Object.keys(localStorage).filter(k => k.startsWith(LS.QC));
    if (!oldKeys.length) return;
    for (const k of oldKeys) {
      try {
        const value = JSON.parse(localStorage.getItem(k));
        await set(k.slice(LS.QC.length), value);
      } catch (e) {}
      localStorage.removeItem(k);
    }
  }
  return { get, set, del, keys, clear, migrateFromLocalStorage };
})();

function renderMath(el){
  if(!el || typeof window.renderMathInElement !== 'function') return;
  try{
    window.renderMathInElement(el, {
      delimiters: [
        {left:'$$', right:'$$', display:true},
        {left:'$', right:'$', display:false}
      ],
      throwOnError:false
    });
  }catch(e){}
}
function shuf(a){const b=[...a];for(let i=b.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[b[i],b[j]]=[b[j],b[i]]}return b}
function fmt(s){if(s<0)s=0;return`${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`}
function fmtHMS(s){
  if(s<0)s=0;
  const h=Math.floor(s/3600), m=Math.floor((s%3600)/60), sec=s%60;
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`;
}
function today(){
  const d=new Date();
  const pad=n=>String(n).padStart(2,'0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
}
function localDateOffset(baseDate, daysOffset){
  const d=new Date(baseDate);
  d.setDate(d.getDate()+daysOffset);
  const pad=n=>String(n).padStart(2,'0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
}
function isOk(sel,cor){
  if(sel===null||sel===undefined||cor===null||cor===undefined)return false;
  const s=String(sel).trim(),c=String(cor).trim();
  return(!isNaN(s)&&!isNaN(c)&&s!==''&&c!=='')?Number(s)===Number(c):s.toLowerCase()===c.toLowerCase();
}
function _resolveQImg(raw){
  const v = String(raw || '').trim();
  if(!v) return null;
  if(v.startsWith('data:image')) return v;
  if(/^https?:\/\//.test(v)){
    const m = v.match(/\/d\/([a-zA-Z0-9_-]{10,})/) || v.match(/[?&]id=([a-zA-Z0-9_-]{10,})/);
    return m ? `https://drive.google.com/thumbnail?id=${m[1]}&sz=w1200` : v;
  }
  if(/^[a-zA-Z0-9_-]{10,}$/.test(v)) return `https://drive.google.com/thumbnail?id=${v}&sz=w1200`;
  return null;
}
function qImgHtml(q){
  if(!q.img) return '';
  const alt = q.imgCaption || 'Question figure';
  return `<div style="margin:.4rem 0"><img src="${esc(q.img)}" alt="${esc(alt)}" style="max-width:100%;border-radius:8px;border:1px solid var(--b1);display:block" loading="lazy" data-on-error="ACT.hideParent(this)"></div>`;
}

const GOOGLE_PROMPT_MAX = 1400;

const GOOGLE_PROMPT_HEAD =
  'You are a tutor for Nepal Lok Sewa Aayog Level 7 Civil Engineering. ' +
  'Analyse this exam question and reply with: ' +
  '(1) the correct option and exactly why, ' +
  '(2) why each wrong option is a trap, ' +
  '(3) the full concept it tests — definition, formula, principle, ' +
  '(4) related concepts a similar exam question could ask, ' +
  '(5) the common confusions to avoid on this topic, ' +
  '(6) a one-line memory trick. Keep it exam-focused. ';

function _buildRichQuery(q){
  if(!q) return '';
  const opts = (q.options || [])
    .map((o, i) => String.fromCharCode(65 + i) + ') ' + String(o))
    .join(' ');
  const stem = String(q.q || '').trim();
  const body = 'Question: ' + stem + '  Options: ' + opts + '.';
  const full = GOOGLE_PROMPT_HEAD + body;
  return full.slice(0, GOOGLE_PROMPT_MAX).trim();
}

function qSearchHtml(q){
  const query = encodeURIComponent(_buildRichQuery(q));
  return `<a class="ib" href="https://www.google.com/search?q=${query}" target="_blank" rel="noopener" `
       + `title="Ask Google AI to analyse this question" `
       + `aria-label="Ask Google AI to analyse this question">`
       + `<i class="ph ph-magnifying-glass"></i></a>`;
}
function normQ(raw,fid){
  if(raw && typeof raw === 'object' && !Array.isArray(raw) && raw.success === false){
    console.warn('[normQ] Server error for', fid, '—', raw.error);
    return [];
  }
  let a = Array.isArray(raw) ? raw
        : (raw?.questions || raw?.data || raw?.quiz || raw?.items || raw?.result || null);
  if(!Array.isArray(a) && a === null && raw && typeof raw === 'object'){
    const vals = Object.values(raw);
    if(vals.length && vals[0] && (vals[0].q || vals[0].question || vals[0].Question)){
      a = vals;
    }
  }
  if(!Array.isArray(a)){
    console.warn('[normQ] Unrecognised format for', fid, '— got:', typeof raw, Array.isArray(raw)?'array':JSON.stringify(raw).slice(0,120));
    return [];
  }
  const result = [];
  let skipped = 0;
  a.forEach((q,i)=>{
    if(!q || typeof q !== 'object'){ skipped++; return; }
    const text = q.q || q.question || q.Question || q.stem || q.ques || q.text || '';
    if(!text){ skipped++; return; }
    let options = q.options || q.opts || q.choices || q.Options;
    if(!Array.isArray(options)){
      const lettered = [q.a||q.A, q.b||q.B, q.c||q.C, q.d||q.D, q.e||q.E].filter(x=>x!==undefined && x!==null && x!=='');
      if(lettered.length >= 2) options = lettered;
    }
    if(!Array.isArray(options) || options.length < 2){ skipped++; return; }
    let correct = q.correct !== undefined ? q.correct
                : q.answer  !== undefined ? q.answer
                : q.ans     !== undefined ? q.ans
                : q.Answer  !== undefined ? q.Answer : undefined;
    if(typeof correct === 'string' && /^[a-eA-E]$/.test(correct.trim())){
      correct = 'abcde'.indexOf(correct.trim().toLowerCase());
    }
    result.push({
      q: String(text).trim(),
      options: options.map(String),
      correct,
      explanation: q.explanation||q.explain||q.exp||q.solution||q.hint||'',
      img: _resolveQImg(q.img || q.image || q.Image || q.figure || q.diagram || ''),
      imgCaption: String(q.imgCaption || q.imgAlt || q.figureCaption || q.caption || '').trim(),
      fileId: fid||'local',
      uid: `${fid||'local'}_${i}`
    });
  });
  if(skipped>0) console.warn(`[normQ] ${skipped}/${a.length} questions skipped in ${fid}`);
  if(!result.length) console.warn('[normQ] Zero valid questions from', fid, '— raw sample:', JSON.stringify(a[0]).slice(0,200));
  return result;
}
function toast(msg,dur=3200){
  const c=document.getElementById('toasts');
  if(!c)return;
  const t=document.createElement('div');t.className='toast';t.textContent=msg;
  c.appendChild(t);
  setTimeout(()=>{t.classList.add('out');setTimeout(()=>t.remove(),300)},dur);
}
function toastUndo(msg, onUndo, dur=6000){
  const c=document.getElementById('toasts');
  if(!c)return;
  const t=document.createElement('div');
  t.className='toast';
  t.style.cssText='display:flex;align-items:center;gap:.6rem';
  const label=document.createElement('span'); label.textContent=msg;
  const btn=document.createElement('button');
  btn.textContent='Undo';
  btn.style.cssText='background:none;border:none;color:var(--amb);font-weight:700;font-size:.76rem;cursor:pointer;padding:.1rem .3rem;flex-shrink:0';
  let undone=false;
  btn.onclick=()=>{
    undone=true;
    onUndo && onUndo();
    t.classList.add('out'); setTimeout(()=>t.remove(),300);
  };
  t.appendChild(label); t.appendChild(btn);
  c.appendChild(t);
  setTimeout(()=>{ if(!undone){ t.classList.add('out'); setTimeout(()=>t.remove(),300); } }, dur);
}
function openMod(title,html){
  document.getElementById('mtitle').textContent=title;
  document.getElementById('mbody').innerHTML=html;
  document.getElementById('mbg').classList.add('show');
}
function closeMod(){document.getElementById('mbg').classList.remove('show')}

function _anyModalOpen(){
  if(document.getElementById('mbg')?.classList.contains('show')) return true;
  return [
    '#quiz-limit-modal','#exam-resume-modal','#quiz-exit-modal',
    '#quiz-error-card','#quiz-loader'
  ].some(sel => {
    const el = document.querySelector(sel);
    return el && el.offsetParent !== null;
  });
}

function qs(params){return Object.entries(params).map(([k,v])=>`${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&')}

const GETFILE_GATE = {
  MAX: 45,
  BG_MAX: 15,
  WINDOW: 60000,
  _hits: [],
  _penaltyUntil: 0,
  async take(kind){
    const ceiling = kind === 'bg' ? this.BG_MAX : this.MAX;
    for(;;){
      const now = Date.now();
      if(now < this._penaltyUntil){
        await new Promise(r=>setTimeout(r, Math.min(this._penaltyUntil - now, 15000)));
        continue;
      }
      this._hits = this._hits.filter(t => now - t < this.WINDOW);
      if(this._hits.length < ceiling){ this._hits.push(now); return; }
      const oldest = this._hits[0] || now;
      const waitMs = Math.min(this.WINDOW, Math.max(250, this.WINDOW - (now - oldest) + 100));
      await new Promise(r=>setTimeout(r, waitMs));
    }
  },
  backoff(ms = 10000){ this._penaltyUntil = Date.now() + ms; this._hits = []; },
  etaSeconds(n){
    const perMin = this.MAX;
    return n <= perMin ? 0 : Math.round(((n - perMin) / perMin) * 60);
  }
};
async function netFetch(url, opts, timeoutMs=20000){
  if(S.forcedOffline) throw new Error('OFFLINE');
  if(!S.online) throw new Error('OFFLINE');
  const controller = new AbortController();
  const timer = setTimeout(()=>controller.abort(), timeoutMs);
  try{
    const res = await fetch(url, {...(opts||{}), signal:controller.signal});
    clearTimeout(timer);
    return res;
  }catch(err){
    clearTimeout(timer);
    if(err.name==='AbortError') throw new Error('Request timed out — the server is taking too long. Try again or check your connection.');
    throw err;
  }
}

function _buildSearchQuery(){
  const q = S.quiz?.qs?.[S.quiz.idx];
  if(!q) return '';
  return _buildRichQuery(q);
}
const SRCH = {
  quickSearch(){
    const text = _buildSearchQuery();
    if(!text){ toast('No question to search'); return; }
    SRCH._openGoogle(text);
  },
  _openGoogle(text){
    const q = encodeURIComponent(text); if(!q) return;
    const url = `https://www.google.com/search?q=${q}`;
    const win = window.open(url, '_blank', 'noopener');
    if(!win) window.location.href = url;
  }
};

const NETCHECK = {
  _timer: null,
  _failCount: 0,
  FAILS_BEFORE_OFFLINE: 3,

  async ping(){
    if(S.forcedOffline) return S.online;
    const wasOnline = S.online;
    let ok = false;
    try { ok = await pingBackend(APPS); } catch(e){ ok = false; }

    if(ok){
      this._failCount = 0;
      S.online = true;
    } else {
      this._failCount++;
      if(!navigator.onLine || this._failCount >= this.FAILS_BEFORE_OFFLINE){
        S.online = false;
      }
    }

    if(S.online !== wasOnline){ _updateNetBtn(); _updateOfflineWarn(); }
    return S.online;
  },

  start(){
    if(NETCHECK._timer) return;
    NETCHECK._timer = setInterval(()=>NETCHECK.ping(), 30000);
  },

  reset(){ this._failCount = 0; }
};

const CHAPSTATS = {
  record(sess){
    const key = sess.chapter || 'Unknown';
    const rec = S.chapStats[key] || {attempted:0, correct:0, sessions:0, lastAt:0};
    rec.attempted += sess.total || 0;
    rec.correct += sess.correct || 0;
    rec.sessions += 1;
    rec.lastAt = sess.at || Date.now();
    S.chapStats[key] = rec;
    _save(LS.CHAPSTATS, S.chapStats);
  },
  entries(){
    return Object.entries(S.chapStats)
      .map(([chapter, d]) => ({
        chapter, attempted: d.attempted, correct: d.correct,
        accuracy: d.attempted ? Math.round((d.correct/d.attempted)*100) : 0,
        sessions: d.sessions, lastAt: d.lastAt
      }))
      .sort((a,b)=>b.lastAt-a.lastAt);
  },
  rebuildFromSessions(){
    const rebuilt = {};
    (S.prog.sessions||[]).forEach(s=>{
      const key = s.chapter || 'Unknown';
      const rec = rebuilt[key] || {attempted:0, correct:0, sessions:0, lastAt:0};
      rec.attempted += s.total || 0;
      rec.correct += s.correct || 0;
      rec.sessions += 1;
      if((s.at||0) > rec.lastAt) rec.lastAt = s.at||0;
      rebuilt[key] = rec;
    });
    Object.entries(rebuilt).forEach(([key, rec])=>{
      if(!S.chapStats[key]) S.chapStats[key] = rec;
    });
    _save(LS.CHAPSTATS, S.chapStats);
  }
};

const COV = {
  _ok(){
    if(!S.cov || typeof S.cov !== 'object' || Array.isArray(S.cov)) S.cov = {};
    return true;
  },
  _add(q){
    if(!q || !q.uid) return;
    const uid = String(q.uid);
    const i = uid.lastIndexOf('_');
    if(i < 1) return;
    const fid = uid.slice(0, i);
    if(fid === 'local') return;
    const idx = parseInt(uid.slice(i + 1), 10);
    if(!isFinite(idx) || idx < 0 || idx > 20000) return;
    const rec = S.cov[fid] || (S.cov[fid] = {p:'', a:0, c:0});
    rec.t = Date.now();      /* v1.33: lets a reset on another device tell old coverage from new */
    if(rec.p.length <= idx) rec.p = rec.p.padEnd(idx + 1, '0');
    rec.p = rec.p.slice(0, idx) + (q.ok ? '1' : '2') + rec.p.slice(idx + 1);
    rec.a = (rec.a || 0) + 1;
    if(q.ok) rec.c = (rec.c || 0) + 1;
  },
  record(qres){
    if(!Array.isArray(qres) || !COV._ok()) return;
    qres.forEach(q => COV._add(q));
    _save(LS.COV, S.cov);
  },
  rebuildFromSessions(){
    if(!COV._ok()) return;
    const sessions = (S.prog && Array.isArray(S.prog.sessions)) ? S.prog.sessions : [];
    for(let i = sessions.length - 1; i >= 0; i--){
      (sessions[i].qres || []).forEach(q => COV._add(q));
    }
    _save(LS.COV, S.cov);
  },
  merge(remote){
    if(!remote || typeof remote !== 'object' || !COV._ok()) return;
    Object.keys(remote).forEach(fid => {
      const r = remote[fid];
      if(!r || typeof r !== 'object') return;
      const rp = String(r.p || '');
      const l = S.cov[fid];
      if(!l){ S.cov[fid] = {p: rp, a: Number(r.a) || 0, c: Number(r.c) || 0, t: Number(r.t) || 0}; return; }
      let out = '';
      const n = Math.max(rp.length, l.p.length);
      for(let i = 0; i < n; i++){
        const a = l.p[i] || '0', b = rp[i] || '0';
        out += (a !== '0') ? a : b;
      }
      l.p = out;
      l.a = Math.max(l.a || 0, Number(r.a) || 0);
      l.c = Math.max(l.c || 0, Number(r.c) || 0);
    });
    _save(LS.COV, S.cov);
  }
};

const ASK = {
  confirm(o){
    o = o || {};
    return new Promise(resolve => {
      const prev = document.activeElement;
      const need = o.requireText ? String(o.requireText) : '';
      const wrap = document.createElement('div');
      wrap.style.cssText = 'position:fixed;inset:0;z-index:10040;display:flex;align-items:center;justify-content:center;padding:1.2rem;background:var(--scrim);backdrop-filter:blur(4px)';
      wrap.setAttribute('role', 'dialog');
      wrap.setAttribute('aria-modal', 'true');
      wrap.innerHTML = `<div style="width:100%;max-width:380px;background:var(--surface-2,var(--surface));border:1px solid var(--sep);border-radius:var(--r-sheet);box-shadow:var(--sh-modal,var(--sh-3));padding:1.25rem">
        <div style="font-size:var(--fs-t3);font-weight:650;margin-bottom:.4rem">${esc(o.title || 'Are you sure?')}</div>
        <div class="t-callout" style="margin-bottom:${need ? '.8rem' : '1.1rem'};line-height:1.55">${esc(o.body || '')}</div>
        ${need ? `<input class="input" id="ask-typed" autocomplete="off" placeholder="Type ${esc(need)} to confirm" style="margin-bottom:1rem">` : ''}
        <div style="display:flex;gap:.5rem">
          <button class="btn btn-quiet" id="ask-no" style="flex:1" type="button">Cancel</button>
          <button class="btn ${o.danger ? 'btn-r' : 'btn-solid'}" id="ask-yes" style="flex:1" type="button" ${need ? 'disabled' : ''}>${esc(o.ok || 'Confirm')}</button>
        </div></div>`;
      document.body.appendChild(wrap);
      const onKey = e => { if(e.key === 'Escape'){ e.preventDefault(); e.stopPropagation(); done(false); } };
      const done = v => {
        document.removeEventListener('keydown', onKey, true);
        wrap.remove();
        try{ if(prev && prev.focus) prev.focus(); }catch(e){}
        resolve(v);
      };
      document.addEventListener('keydown', onKey, true);
      wrap.addEventListener('click', e => { if(e.target === wrap) done(false); });
      wrap.querySelector('#ask-no').onclick = () => done(false);
      const yes = wrap.querySelector('#ask-yes');
      yes.onclick = () => done(true);
      const typed = wrap.querySelector('#ask-typed');
      if(typed){
        typed.addEventListener('input', () => { yes.disabled = typed.value.trim().toUpperCase() !== need.toUpperCase(); });
        typed.focus();
      } else { yes.focus(); }
    });
  }
};

const AUTH = {
  async restore(){
    const u = _load(LS.USER, null);
    if(!u || u.type !== 'user' || !u.username){
      AUTH._bounce();
      return;
    }
    if(S.forcedOffline || !S.online){
      if(AUTH._isValidOffline(u)) AUTH._enter(u);
      else AUTH._bounce();
      return;
    }

    const age = Date.now() - (Number(u.lastVerified) || 0);
    if (age >= 0 && age < 30 * 1000 && AUTH._isValidOffline(u)) {
      AUTH._enter(u);
      return;
    }

    try{
      const { res } = await AUTH._checkSessionOnce(u);
      if(!res.success){
        if(AUTH._isValidOffline(u)) AUTH._enter(u);
        else AUTH._bounce();
        return;
      }
      const updated = AUTH._buildSession(u, res);
      _save(LS.USER, updated);
      if(updated.access.level === 'permanent' || updated.access.level === 'trial'){
        AUTH._enter(updated);
      } else {
        AUTH._bounce();
      }
    }catch{
      if(AUTH._isValidOffline(u)) AUTH._enter(u);
      else AUTH._bounce();
    }
  },
  async _checkSessionOnce(u){
    const r = await netFetch(APPS, {
      method:'POST', headers:{'Content-Type':'text/plain'},
      body: JSON.stringify({action:'checkSession', token:u.token, username:u.username})
    }, 15000);
    const res = await r.json();
    return { res };
  },
  _isValidOffline(u){
    const a = u.access || {};
    if(a.level === 'permanent') return true;
    if(a.level === 'trial' && a.trialExpiresAt) return new Date(a.trialExpiresAt) > Date.now();
    return false;
  },
  _buildSession(prevSession, res){
    const user = res.user || {};
    const access = computeAccessLevel(res, user);
    return {
      ...prevSession,
      username: user.username || prevSession.username,
      name: user.name || prevSession.name,
      email: user.email || prevSession.email,
      mobile: user.mobile || prevSession.mobile,
      access,
      adminCapable: prevSession.adminCapable || !!res.adminCapable,
      lastVerified: Date.now()
    };
  },
  _bounce(){
    const onScreen = () => { const w = document.getElementById('quiz-wrap'); return !!(w && w.style.display !== 'none'); };
    if(onScreen()){
      if(AUTH._bounceWaiting) return;
      AUTH._bounceWaiting = true;
      toast('Your access has changed. Finish this quiz and you will be taken to sign in.', 7000);
      const t = setInterval(() => { if(!onScreen()){ clearInterval(t); window.location.href = 'index.html'; } }, 1500);
      return;
    }
    window.location.href = 'index.html';
  },
  _resetUserScopedLocalDataIfDifferentUser(username){
    try{ if(typeof CONTENT_CRYPTO !== 'undefined') CONTENT_CRYPTO.clear(); }catch(e){}   /* forget the content key */
    const lastUser = _load(LS.LAST_USER, '');
    /* Compared case-insensitively and trimmed: "Sita" and "sita" are the same account (a Google sign-in and a password
       sign-in can differ only in capitals) and must never wipe this device's data. */
    const norm = v => String(v || '').trim().toLowerCase();
    if(lastUser && norm(lastUser) !== norm(username)){
      /* keep a copy for the PREVIOUS student, recoverable only when they sign in again */
      try { const keepUser = S.user; S.user = { username: lastUser }; PSYNC._snapshot('before-account-switch'); S.user = keepUser; } catch(e){}
      [LS.PROG, LS.BK, LS.FL, LS.WR, LS.STK, LS.CHAPSTATS, LS.TT, LS.COV].forEach(k=>{
        try{ localStorage.removeItem(k); }catch(e){}
      });
      S.prog = {total:0, correct:0, sessions:[]};
      S.bk = []; S.fl = []; S.wr = [];
      S.stk = {days:[], last:''}; S.cov = {};
      S.chapStats = {};
      S.tt = {sessions:[], reminders:{enabled:false, leadMinutes:5}};
    }
    _save(LS.LAST_USER, username);
  },
  _enter(user){
    S.user = user;
    AUTH._resetUserScopedLocalDataIfDifferentUser(user.username);
    document.getElementById('sg').style.display='none';
    document.getElementById('app').classList.add('on');
    document.getElementById('uchip').textContent = '👤 ' + (user?.name||user?.username||'Student');
    AUTH._updateSidebarCard(user);
    if(!S.online) document.getElementById('offbar').classList.add('show');
    APP.init();
    TUTORIAL.maybeAutoOpen(user);
    PSYNC.pullIfEmpty();
    TT._startReminderChecker();
    if(typeof PUSH!=='undefined') PUSH.silentRefresh();
    WEEKLY.init();
    if(typeof SB_HINTS !== 'undefined') setTimeout(() => SB_HINTS.refresh(), 200);
  },
  _updateSidebarCard(user){
    const nameEl = document.getElementById('sb-uname');
    const statusEl = document.getElementById('sb-ustatus');
    if(nameEl) nameEl.textContent = user?.name || user?.username || 'Student';
    if(statusEl){
      const a = user?.access || {};
      if(a.level==='permanent' && a.accessType==='yearly'){
        statusEl.textContent = a.accessExpiresAt ? `📅 Access until ${new Date(a.accessExpiresAt).toLocaleDateString()}` : '📅 Yearly access';
      } else if(a.level==='permanent'){
        statusEl.textContent = '✅ Permanent access';
      } else if(a.level==='trial'){
        statusEl.textContent = a.trialExpiresAt ? `⏳ Trial until ${new Date(a.trialExpiresAt).toLocaleString()}` : '⏳ Trial access';
      } else {
        statusEl.textContent = '—';
      }
    }
  },
  async logout(){
    try{ if(typeof CONTENT_CRYPTO !== 'undefined') CONTENT_CRYPTO.clear(); }catch(e){}   /* forget the content key */
    if(!(await ASK.confirm({title:'Log out?', body:'Your progress is saved to your account.', ok:'Log out'}))) return;
    if(S.user && S.user.token && S.online && !S.forcedOffline && PSYNC._timer){
      let confirmed = false;
      try{
        await Promise.race([
          PSYNC.pushNow().then(() => { confirmed = true; }),
          new Promise((_, rej) => setTimeout(() => rej(new Error('logout-push-timeout')), 1500))
        ]);
      }catch(e){
        console.warn('[AUTH.logout] pushNow did not complete in 1.5s — falling back to beacon:', e && e.message);
      }
      if(!confirmed) PSYNC._beaconSync();
    }
    localStorage.removeItem(LS.USER);
    window.location.href = 'index.html';
  },
  _revalidateTimer:null,
  _visibilityBound:false,
  RECHECK_MS: 10*60*1000,
  startPeriodicRecheck(){
    if(AUTH._revalidateTimer) clearInterval(AUTH._revalidateTimer);
    AUTH._revalidateTimer = setInterval(()=>AUTH._periodicRecheckTick(), AUTH.RECHECK_MS);
    if(!AUTH._visibilityBound){
      AUTH._visibilityBound = true;
      document.addEventListener('visibilitychange', ()=>{
        if(document.visibilityState === 'visible' && S.user){
          const last = S.user.lastVerified || 0;
          if(Date.now() - last > AUTH.RECHECK_MS) AUTH._periodicRecheckTick();
        }
      });
    }
  },
  async _periodicRecheckTick(){
    if(document.visibilityState === 'hidden') return;
    if(!S.online || S.forcedOffline || !S.user) return;
    try{
      const { res } = await AUTH._checkSessionOnce(S.user);
      if(res.success){
        const updated = AUTH._buildSession(S.user, res);
        _save(LS.USER, updated);
        if(updated.access.level === 'permanent' || updated.access.level === 'trial'){
          S.user = updated;
        } else {
          AUTH._bounce();
        }
      } else if(res.sessionInvalid){
        try{ localStorage.setItem('abhyas_notice', 'You were signed out because this account was used on another device, or the session expired. Please sign in again.'); }catch(e){}
        localStorage.removeItem(LS.USER);
        AUTH._bounce();
      }
    }catch(e){ console.warn('[AUTH] periodic session recheck failed, will retry next interval:', e); }
  }
};

const PSYNC = {
  _timer: null,
  _state: 'idle',
  _setStatus(msg){
    const el = document.getElementById('psync-status');
    if(el) el.textContent = msg;
  },
  _setState(state){
    this._state = state;
    const dot = document.getElementById('tb-sync-dot');
    const btn = document.getElementById('tb-sync-btn');
    if(!dot || !btn) return;
    const cfg = {
      idle:    {color:'var(--t3)', title:'Not synced yet this session', anim:false},
      pending: {color:'var(--amb)', title:'Sync pending…',              anim:false},
      syncing: {color:'var(--sky)', title:'Syncing…',                   anim:true},
      synced:  {color:'var(--grn)', title:'Progress backed up',         anim:false},
      error:   {color:'var(--ros)', title:'Sync failed — will retry',   anim:false}
    }[state] || {color:'var(--t3)', title:'', anim:false};
    dot.style.background = cfg.color;
    dot.style.animation = cfg.anim ? 'pulse 1s ease-in-out infinite' : 'none';
    btn.title = 'Sync status — ' + cfg.title;
    btn.setAttribute('aria-label', btn.title);
  },
  scheduleSync(){
    if(!S.user || !S.user.token) return;
    this._setState('pending');
    clearTimeout(this._timer);
    this._timer = setTimeout(()=>this.pushNow(), 8000);
  },
  _beaconSync(){
    if(!S.online || S.forcedOffline || !S.user || !S.user.token) return;
    try{
      /* v1.36: the beacon sends the same small, always-fits payload as a
         normal save — totals, chapter stats, coverage, study days. The
         wrong bank, bookmarks and notes stay on this device and in the
         student's own Google Drive backup. */
      const json = JSON.stringify(this._syncPayloadForServer());
      if(json.length > this._SYNC_PAYLOAD_CEILING) return;
      const body = JSON.stringify({ action:'saveProgress', username: S.user.username, token: S.user.token, data: json, baseUpdatedAt: this._rev() });
      navigator.sendBeacon?.(APPS, new Blob([body], {type:'text/plain'}));
    }catch(e){ }
  },
  flushOnHide(){
    if(!this._timer) return;
    clearTimeout(this._timer);
    this._timer = null;
    this._beaconSync();
  },
  _SYNC_PAYLOAD_CEILING: 44000,
  _SNAP_KEY: 'abhyas_presync_backup',

  /* The COMPLETE state of this device. Nothing here is ever cut down: merges start from this,
     and the cloud copy is made from it (compressed when large). */
  _fullLocal(){
    let qnotes = {};
    try { const raw = localStorage.getItem('abhyas_qnotes'); qnotes = raw ? JSON.parse(raw) : {}; } catch(e){ qnotes = {}; }
    if (!qnotes || typeof qnotes !== 'object' || Array.isArray(qnotes)) qnotes = {};
    let sprint = '';
    try { sprint = localStorage.getItem('abhyas_sprint_start') || ''; } catch(e){}
    return {
      prog: S.prog || {total:0,correct:0,sessions:[]}, chapStats: S.chapStats || {}, cov: S.cov || {},
      bk: S.bk || [], fl: S.fl || [], wr: S.wr || [], stk: S.stk || {days:[],last:''}, qnotes, sprint,
      resets: (typeof PROGRESS_RESET !== 'undefined') ? PROGRESS_RESET.load() : {}
    };
  },
  _counts(d){
    d = d || {};
    return { wr:(d.wr||[]).length, bk:(d.bk||[]).length, fl:(d.fl||[]).length, sessions:((d.prog&&d.prog.sessions)||[]).length, notes:Object.keys(d.qnotes||{}).length };
  },

  /* A merge only ever ADDS. This is the last line of defence: if a merged result is ever smaller than what
     this device already had, it is thrown away and nothing is changed. */
  _mergeKeepsEverything(local, merged){
    const a = this._counts(local), b = this._counts(merged);
    return b.wr >= a.wr && b.bk >= a.bk && b.fl >= a.fl && b.notes >= a.notes && b.sessions >= Math.min(a.sessions, 50)
      && (Number(merged.prog.total)||0) >= (Number((local.prog||{}).total)||0)
      && (Number(merged.prog.correct)||0) >= (Number((local.prog||{}).correct)||0);
  },

  /* Rolling safety copies (the last 3) of this device's data taken just before any sync changes it,
     so any sync can be undone from Data > Recover. They belong to the signed-in student only. */
  _snapshot(reason){
    try {
      const full = this._fullLocal();
      const c = this._counts(full);
      if(!c.wr && !c.bk && !c.fl && !c.sessions && !c.notes) return false;       // nothing worth keeping
      const user = (S.user && S.user.username) ? String(S.user.username).toLowerCase() : '';
      let list = []; try { list = JSON.parse(localStorage.getItem(this._SNAP_KEY) || '[]'); } catch(e){ list = []; }
      if(!Array.isArray(list)) list = [];
      const json = JSON.stringify(full);
      if(list[0] && list[0].user === user && JSON.stringify(list[0].data) === json) return true;   // unchanged since last copy
      list.unshift({ at: Date.now(), reason: String(reason||'sync'), user, counts: c, data: full });
      for(let keep = Math.min(list.length, 3); keep >= 1; keep--){
        try { localStorage.setItem(this._SNAP_KEY, JSON.stringify(list.slice(0, keep))); return true; } catch(e){ /* storage full: keep fewer */ }
      }
    } catch(e){}
    return false;     /* merging is additive, so it is still safe to carry on without a snapshot */
  },
  listSnapshots(){
    const user = (S.user && S.user.username) ? String(S.user.username).toLowerCase() : '';
    try { return (JSON.parse(localStorage.getItem(this._SNAP_KEY) || '[]') || []).filter(x => x && x.user === user); } catch(e){ return []; }
  },

  /* Write a merged result into the app and onto the device. */
  _applyMergedObject(m){
    S.prog = m.prog; if(typeof migrateSessionScopes === 'function') migrateSessionScopes(); _save(LS.PROG, S.prog);
    S.chapStats = m.chapStats; _save(LS.CHAPSTATS, S.chapStats);
    S.cov = m.cov; _save(LS.COV, S.cov);
    S.bk = m.bk; _save(LS.BK, S.bk);
    S.fl = m.fl; _save(LS.FL, S.fl);
    S.wr = m.wr; _save(LS.WR, S.wr);
    S.stk = m.stk; _save(LS.STK, S.stk);
    try {
      localStorage.setItem('abhyas_qnotes', JSON.stringify(m.qnotes));
      if(typeof QNOTE !== 'undefined') QNOTE._cache = m.qnotes;
      if(m.sprint) localStorage.setItem('abhyas_sprint_start', m.sprint);
    } catch(e){}
    if(typeof PROGRESS_RESET !== 'undefined') PROGRESS_RESET.save(m.resets || {});
    try { if(typeof WRONGBY !== 'undefined') WRONGBY._missCache = null; if(typeof QHIST !== 'undefined') QHIST._cache = null; } catch(e){}
    if(typeof HOME!=='undefined') HOME.render();
    if(typeof PROG!=='undefined') PROG.render();
    if(typeof HOME!=='undefined' && HOME.updateBadges) HOME.updateBadges();
  },

  /* Add another copy (cloud, other device, snapshot) to this device's data. Returns { ok, added } and
     never removes anything. `remote` may be an object, a JSON string or a compressed "gz1:" string. */
  async mergeIn(remote, reason){
    let r = remote;
    try { if(typeof r === 'string') r = await syncDecode(r); } catch(e){ return { ok:false, error:'That copy could not be read.' }; }
    if(!r || typeof r !== 'object') return { ok:false, error:'That copy is empty.' };
    const local = this._fullLocal();
    const merged = mergeSyncData(local, r);
    /* A reset made on another device legitimately makes this device's copy smaller. The safety copy is taken
       first (so Data > Recover can bring it back); every other merge must still only ever add. */
    const resetsChanged = JSON.stringify(merged.resets || {}) !== JSON.stringify(local.resets || {});
    if(!resetsChanged && !this._mergeKeepsEverything(local, merged)) return { ok:false, error:'The merge was cancelled because it would have removed data. Nothing was changed.' };
    this._snapshot(reason || 'before-merge');
    const before = this._counts(local);
    this._applyMergedObject(merged);
    const after = this._counts(merged);
    return { ok:true, added:{ wr:after.wr-before.wr, bk:after.bk-before.bk, fl:after.fl-before.fl, sessions:after.sessions-before.sessions, notes:after.notes-before.notes } };
  },

  _REV_KEY: 'abhyas_progress_rev',
  _rev(){ try { return localStorage.getItem(this._REV_KEY) || ''; } catch(e){ return ''; } },
  _setRev(v){ try { if(v) localStorage.setItem(this._REV_KEY, String(v)); } catch(e){} },

  /* v1.36: what travels to the server. Fixed-size, ~2 KB no matter how big
     the wrong bank grows. The wrong bank, bookmarks, notes and full session
     list stay on this device and travel only through the student's own
     Google Drive backup. This removes the 45,000-character ceiling forever. */
  _syncPayloadForServer(){
    const p = S.prog || {};
    let sprint = '';
    try { sprint = localStorage.getItem('abhyas_sprint_start') || ''; } catch(e){}
    return {
      prog: { total: Number(p.total) || 0, correct: Number(p.correct) || 0, sessions: [] },
      chapStats: S.chapStats || {},
      cov: S.cov || {},
      stk: S.stk || { days: [], last: '' },
      sprint,
      resets: (typeof PROGRESS_RESET !== 'undefined') ? PROGRESS_RESET.load() : {},
      wr: [], bk: [], fl: [], qnotes: {}
    };
  },

  async pushNow(_isRetry){
    if(!S.online || S.forcedOffline || !S.user || !S.user.token) return;
    clearTimeout(this._timer);
    this._timer = null;
    this._setState('syncing');
    const payload = await syncEncode(JSON.stringify(this._syncPayloadForServer()), this._SYNC_PAYLOAD_CEILING);
    if(payload === null){
      this._setStatus('Cloud copy failed. Your data is safe on this device. Download a backup file from Data.');
      this._setState('error');
      return;
    }
  
    try{
      const r = await netFetch(APPS, {
        method:'POST',
        headers:{'Content-Type':'text/plain'},
        body: JSON.stringify({action:'saveProgress', username:S.user.username, token:S.user.token, data:payload, baseUpdatedAt:this._rev()})
      }, 15000);
      const res = await r.json();
      if(res && res.success){
        this._setRev(res.updatedAt);
        this._setStatus('Last backed up: ' + new Date().toLocaleString()); this._setState('synced');
      } else if(res && res.conflict && !_isRetry){
        /* Another device saved first. Its copy is ADDED to this device's data (nothing is removed),
           and the combined copy is saved back. */
        const out = await this.mergeIn(res.data, 'before-sync');
        if(!out.ok){ this._setStatus('Sync paused: ' + out.error); this._setState('error'); return; }
        this._setRev(res.updatedAt);
        toast('\ud83d\udd04 Combined with your other device. Nothing was removed.');
        return this.pushNow(true);
      } else { this._setStatus('Backup failed \u2014 will retry automatically.'); this._setState('error'); }
    }catch(e){ this._setStatus('Backup failed (offline?) \u2014 will retry automatically.'); this._setState('error'); }
  },
  async pullIfEmpty(){
    if(!S.online || !S.user || !S.user.token) return;
    const looksEmpty = (!S.prog || !S.prog.sessions || !S.prog.sessions.length)
      && (!S.bk || !S.bk.length) && (!S.fl || !S.fl.length) && (!S.wr || !S.wr.length);
    if(!looksEmpty) return;
    await this._pull(false);
  },
  async forceRestore(){
    if(!S.online || !S.user || !S.user.token){ toast('Need internet to check your cloud backup'); return; }
    await this._pull(true);
  },
  /* "Restore" now ADDS the cloud copy to this device. It never replaces or removes anything here. */
  async _pull(force){
    try{
      const r = await netFetch(APPS, {
        method:'POST', headers:{'Content-Type':'text/plain'},
        body: JSON.stringify({action:'getProgress', username:S.user.username, token:S.user.token})
      }, 15000);
      const res = await r.json();
      if(!res.success || !res.data){
        if(force) toast('No cloud backup found for this account yet.');
        return;
      }
      const out = await this.mergeIn(res.data, 'before-restore');
      if(!out.ok){ if(force) toast(out.error, 6000); return; }
      this._setRev(res.updatedAt);
      const a = out.added, n = a.wr + a.bk + a.fl + a.sessions + a.notes;
      toast(n > 0 ? '\u2705 Added your saved progress from the cloud. Nothing on this device was removed.' : '\u2705 Already up to date. Nothing was removed.', 5000);
      this._setStatus('Checked cloud backup: ' + new Date().toLocaleString());
      if(n >= 0) this.scheduleSync();     // save the combined copy back so every device gets it
    }catch(e){
      if(force) toast('Could not reach your cloud backup. Check your connection and try again.');
    }
  },

  /* ── Recovery (Data > Recover): add back an earlier copy. Always additive. ── */
  async listCloudHistory(){
    const r = await netFetch(APPS, { method:'POST', headers:{'Content-Type':'text/plain'},
      body: JSON.stringify({action:'getProgressHistory', username:S.user.username, token:S.user.token}) }, 15000);
    const res = await r.json();
    if(!res || !res.success) throw new Error((res && res.error) || 'Could not load earlier cloud copies.');
    return res.entries || [];
  },
  async recoverCloud(slot){
    const r = await netFetch(APPS, { method:'POST', headers:{'Content-Type':'text/plain'},
      body: JSON.stringify({action:'getProgressHistory', username:S.user.username, token:S.user.token, slot}) }, 15000);
    const res = await r.json();
    if(!res || !res.success || !res.data) return { ok:false, error:(res && res.error) || 'That copy is not available.' };
    const out = await this.mergeIn(res.data, 'before-recover');
    if(out.ok) this.scheduleSync();
    return out;
  },
  async recoverSnapshot(i){
    const snap = this.listSnapshots()[i];
    if(!snap) return { ok:false, error:'That copy is no longer on this device.' };
    const out = await this.mergeIn(snap.data, 'before-recover');
    if(out.ok) this.scheduleSync();
    return out;
  }
};
document.addEventListener('visibilitychange', ()=>{ if(document.visibilityState==='hidden') PSYNC.flushOnHide(); });
window.addEventListener('pagehide', ()=>PSYNC.flushOnHide());

const PUSH = {
  _messaging: null,
  supported(){
    return typeof FIREBASE_CONFIGURED !== 'undefined' && FIREBASE_CONFIGURED
      && 'Notification' in window && 'serviceWorker' in navigator
      && typeof firebase !== 'undefined';
  },
  status(){
    if(!this.supported()) return 'unsupported';
    return Notification.permission;
  },
  async enable(){
    if(!this.supported()){
      toast('❌ Notifications need setup on the backend first — ask your admin.');
      return;
    }
    if(Notification.permission === 'denied'){
      toast('🔕 Notifications are blocked for this site — enable them in your browser\'s site settings, then try again.');
      return;
    }
    try{
      const permission = await Notification.requestPermission();
      if(permission !== 'granted'){ toast('Notifications not enabled.'); return; }
      if(!this._messaging){
        firebase.initializeApp(FIREBASE_CONFIG);
        this._messaging = firebase.messaging();
      }
      const reg = await navigator.serviceWorker.ready;
      const token = await this._messaging.getToken({ vapidKey: FIREBASE_VAPID_KEY, serviceWorkerRegistration: reg });
      if(!token){ toast('❌ Could not get a notification token — try again.'); return; }
      if(!S.user || !S.user.token){ toast('✅ Notifications enabled — will sync once you\'re logged in.'); return; }
      const r = await netFetch(APPS, {
        method:'POST',
        headers:{'Content-Type':'text/plain'},
        body: JSON.stringify({action:'savePushToken', username:S.user.username, token:S.user.token, fcmToken:token})
      }, 15000);
      const res = await r.json();
      if(res && res.success) toast('🔔 Notifications enabled');
      else toast('⚠️ Enabled locally, but couldn\'t sync to your account — try again while online.');
    }catch(e){
      toast('❌ Could not enable notifications: ' + (e.message||e));
    }
  },
  async silentRefresh(){
    if(!this.supported() || Notification.permission !== 'granted') return;
    if(!S.user || !S.user.token) return;
    try{
      if(!this._messaging){
        firebase.initializeApp(FIREBASE_CONFIG);
        this._messaging = firebase.messaging();
      }
      const reg = await navigator.serviceWorker.ready;
      const token = await this._messaging.getToken({ vapidKey: FIREBASE_VAPID_KEY, serviceWorkerRegistration: reg });
      if(!token) return;
      await netFetch(APPS, {
        method:'POST',
        headers:{'Content-Type':'text/plain'},
        body: JSON.stringify({action:'savePushToken', username:S.user.username, token:S.user.token, fcmToken:token})
      }, 15000);
    }catch(e){ }
  },
  refreshButtonUI(){
    const btn = document.getElementById('push-enable-btn');
    const desc = document.getElementById('push-status-desc');
    if(!btn || !desc) return;
    const state = this.status();
    if(state === 'unsupported'){
      btn.style.display = 'none';
      desc.textContent = 'Notifications aren\'t set up for this deployment yet.';
    } else if(state === 'granted'){
      btn.innerHTML = '<i class="ph ph-bell-ringing"></i> Notifications Enabled';
      btn.disabled = true;
      btn.style.opacity = '.7';
      desc.textContent = 'You\'ll be notified about trial expiry and payment status, even when the app is closed.';
    } else if(state === 'denied'){
      btn.innerHTML = '<i class="ph ph-bell-slash"></i> Blocked — check browser settings';
      desc.textContent = 'Notifications are blocked for this site. Enable them in your browser\'s site settings, then reload.';
    } else {
      btn.innerHTML = '<i class="ph ph-bell"></i> Enable Notifications';
      btn.disabled = false;
      btn.style.opacity = '1';
    }
  }
};