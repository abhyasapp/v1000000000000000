/* ═══════════════════════════════════════════════════════════════════════
   SUBJECTIVE.JS — Subjective module (QOTD + Exam + List + Custom Builder)

   Loaded via <script src="subjective.js"> AFTER app.js and objective.js
   in user.html. Classic global, no modules.

   Depends on globals from app.js / config.js (bare identifiers, not
   window.X — top-level `const` doesn't attach to window):
     S, LS, APP_CONFIG, APPS, ABHYAS_CONFIG, _save, _load, toast, esc,
     QDB, netFetch, qs, pluralize, today

   Reads window.SUBJECTIVE_DATA / window.SUBJECTIVE_FILE_REFS /
   window.SUBJECTIVE_CHAPTERS from sibling files (those DO assign to
   window explicitly).

   Question-bank file shape (per chapter, one Drive file each):
     { "group": "...", "sections": [
         { "section": "...", "questions": [
             { "type":"subjective", "chapter":"...", "q":"...", "marks":"..." }
         ] }
     ] }

   `marks` may be a plain number (5, 10) or a string like "5+5=10" or
   "3+3.5+3.5=10". _parseMarks() reads the total.

   Exposes on window:
     SUBJ        — user-facing module
     SUBJ_SMART  — Smart Paste parser (used by admin.html)
   ═══════════════════════════════════════════════════════════════════════ */
(function(){
'use strict';

const $   = id => document.getElementById(id);
/* the ONE escaper lives in shared.js (loaded first). No fallback: a missing helper must fail loudly, never skip escaping. */
const esc = s => window.esc(s);

/* ── Backend URL ──
   Bare identifiers, not window.X — top-level `const` in a classic
   script lives in the page's shared lexical scope, not on window.
   config.js and app.js are loaded before this file, so ABHYAS_CONFIG
   and APPS resolve correctly here even though window.ABHYAS_CONFIG
   and window.APPS are undefined. */
function _backendUrl(){
  try{
    if(typeof ABHYAS_CONFIG !== 'undefined' && ABHYAS_CONFIG && ABHYAS_CONFIG.GAS_URL){
      return ABHYAS_CONFIG.GAS_URL;
    }
  }catch(e){}
  try{
    if(typeof APPS !== 'undefined' && APPS) return APPS;
  }catch(e){}
  // Belt-and-suspenders: some pages may only set window.ABHYAS_CONFIG.
  try{
    if(typeof window !== 'undefined' && window.ABHYAS_CONFIG && window.ABHYAS_CONFIG.GAS_URL){
      return window.ABHYAS_CONFIG.GAS_URL;
    }
  }catch(e){}
  return '';
}

/* ── Auth params ──
   Reads the S state object by bare identifier for the same reason
   as _backendUrl() — window.S is undefined even though S itself is
   reachable in this file's lexical scope. */
function _authParams(){
  try{
    if(typeof S !== 'undefined' && S && S.user){
      return { username: S.user.username || '', token: S.user.token || '' };
    }
  }catch(e){}
  try{
    if(typeof window !== 'undefined' && window.S && window.S.user){
      return { username: window.S.user.username || '', token: window.S.user.token || '' };
    }
  }catch(e){}
  return { username: '', token: '' };
}

async function _api(action, params, method){
  const url = _backendUrl();
  if(!url) return { success:false, error:'Backend URL not configured.' };
  const base = _authParams();
  try{
    if(method === 'GET'){
      const qs = new URLSearchParams({ action, ...base, ...(params||{}) }).toString();
      const r = await fetch(url + '?' + qs, { redirect:'follow' });
      return await r.json();
    }
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type':'text/plain' },
      body: JSON.stringify({ action, ...base, ...(params||{}) })
    });
    return await r.json();
  }catch(e){
    return { success:false, error: e.message || 'Network error' };
  }
}

/* ── Constants ── */
const TIMERS = {
  solveSecondsFor5:  10 * 60,
  solveSecondsFor10: 20 * 60,
  solveSecondsFallback: 15 * 60,
  uploadSeconds: 10 * 60,
  examSeconds:  3 * 60 * 60,
  /* v1.32: after the 3-hour write window, students get a fixed window to
     photograph/scan their answers and upload the PDF. Mirrors the QOTD
     two-phase model. */
  examUploadSeconds: 20 * 60
};

/* ═══════════════════════════════════════════════════════════════════════
   v1.29: OFFLINE WRITTEN-ANSWER QUEUE.

   A QOTD or exam answer that cannot be uploaded (no signal, a hiccup at
   the wrong moment) is written to localStorage and posted automatically
   when the connection returns. One pending item per (user, kind,
   questionId): a retake replaces the previous queued item rather than
   stacking, so localStorage cannot grow unbounded.

   The queue is deliberately user-scoped — a second student signing in on
   the same phone never sends the previous student's answer.
   ═══════════════════════════════════════════════════════════════════════ */
const SUBJ_QUEUE = {
  KEY: 'abhyas_subj_queue_v1',
  MAX_BYTES: 2 * 1024 * 1024,   // 2 MB — a phone's localStorage budget varies
  MAX_ATTEMPTS: 5,

  read(){
    try { return JSON.parse(localStorage.getItem(this.KEY) || '[]') || []; }
    catch(e){ return []; }
  },
  write(list){
    try { localStorage.setItem(this.KEY, JSON.stringify(list || [])); } catch(e){}
  },
  add(item){
    const list = this.read().filter(x => !(
      x.username === item.username &&
      x.kind === item.kind &&
      x.questionId === item.questionId
    ));
    list.push(Object.assign({}, item, { queuedAt: Date.now(), attempts: 0 }));
    this.write(list);
  },
  removeFor(username, kind, questionId){
    this.write(this.read().filter(x => !(
      x.username === username && x.kind === kind && x.questionId === questionId
    )));
  },
  forUser(username){
    return this.read().filter(x => x.username === username);
  },

  async process(){
    if(typeof navigator !== 'undefined' && !navigator.onLine) return;
    let user = null;
    try { user = (typeof S !== 'undefined' && S && S.user) ? S.user : null; } catch(e){}
    if(!user || !user.token) return;

    const list = this.read();
    if(!list.length) return;

    const remaining = [];
    let sentAny = false;

    for(const item of list){
      if(item.username !== user.username){ remaining.push(item); continue; }
      item.attempts = (item.attempts || 0) + 1;
      if(item.attempts > this.MAX_ATTEMPTS) continue;

      try {
        const res = await this._send(item, user);
        if(res && res.success){
          sentAny = true;
          this._markSubmitted(item);
        } else if(res && res.sessionInvalid){
          remaining.push(item);
        } else if(res && res.alreadySubmitted){
          sentAny = true;
          this._markSubmitted(item);
        }
      } catch(e){
        remaining.push(item);
      }
    }

    this.write(remaining);
    if(sentAny && typeof toast === 'function') toast('✅ Queued answer sent.', 4500);
    try { if(typeof SUBJ !== 'undefined'){ SUBJ._renderQotd(); SUBJ._renderExam(); } } catch(e){}
    try { if(typeof window.SB_HINTS !== 'undefined') window.SB_HINTS.refresh(); } catch(e){}
  },

  _markSubmitted(item){
    if(item.kind === 'qotd'){
      try {
        const raw = JSON.parse(localStorage.getItem(LS_QOTD) || 'null');
        if(raw){ raw.submitted = true; raw.submittedAt = Date.now(); raw.queued = false; localStorage.setItem(LS_QOTD, JSON.stringify(raw)); }
      } catch(e){}
      try { if(typeof QOTD !== 'undefined' && QOTD){ QOTD.submitted = true; QOTD.submittedAt = Date.now(); QOTD.queued = false; } } catch(e){}
    }
    if(item.kind === 'exam'){
      try {
        const raw = JSON.parse(localStorage.getItem(LS_EXAM) || 'null');
        if(raw){ raw.submitted = true; raw.submittedAt = Date.now(); raw.queued = false; localStorage.setItem(LS_EXAM, JSON.stringify(raw)); }
      } catch(e){}
      try { if(typeof EXAM !== 'undefined' && EXAM){ EXAM.submitted = true; EXAM.submittedAt = Date.now(); EXAM.queued = false; } } catch(e){}
    }
  },

  async _send(item, user){
    const url = (typeof ABHYAS_CONFIG !== 'undefined' && ABHYAS_CONFIG && ABHYAS_CONFIG.GAS_URL) || '';
    if(!url) return { success: false, error: 'Backend URL not configured.' };
    const body = JSON.stringify({
      action: 'submitSubjectiveAnswer',
      username: user.username, token: user.token,
      kind: item.kind,
      questionId: item.questionId,
      questionText: item.questionText,
      chapterId: item.chapterId,
      marks: item.marks,
      solveSec: item.solveSec,
      startedAt: item.startedAt,
      pdfData: item.pdfData,
      filename: item.filename
    });
    const ctrl = ('AbortController' in window) ? new AbortController() : null;
    const timer = ctrl ? setTimeout(() => ctrl.abort(), 45000) : null;
    try {
      const r = await fetch(url, {
        method:'POST', headers:{'Content-Type':'text/plain'},
        body, signal: ctrl && ctrl.signal
      });
      if(timer) clearTimeout(timer);
      if(!r.ok) return { success: false, error: 'HTTP ' + r.status };
      return await r.json();
    } catch(e){
      if(timer) clearTimeout(timer);
      throw e;
    }
  },

  /* Called from the boot path and on every 'online' event. */
  scheduleProcess(){
    if(this._scheduled) return;
    this._scheduled = true;
    setTimeout(() => {
      this._scheduled = false;
      this.process().catch(() => {});
    }, 1200);
  }
};

window.addEventListener('online', () => SUBJ_QUEUE.scheduleProcess());
try { setTimeout(() => SUBJ_QUEUE.scheduleProcess(), 3000); } catch(e){}
setInterval(() => { try { SUBJ_QUEUE.process(); } catch(e){} }, 60000);

/* ═══════════════════════════════════════════════════════════════════════
   CUSTOM EXAM COOLDOWN
   ─────────────────────────────────────────────────────────────────────
   The "Build Your Own Paper" feature is rate-limited to once every 6
   hours per user. The cooldown timestamp is stored in localStorage
   under a per-user key so switching accounts on a shared device doesn't
   leak the timer.
   ═══════════════════════════════════════════════════════════════════════ */
const CUSTOM_EXAM_COOLDOWN_MS = 6 * 60 * 60 * 1000;   // 6 hours

function _customExamKey(){
  const u = (typeof S !== 'undefined' && S && S.user && S.user.username) || 'anon';
  return 'abhyas_subj_custom_last_' + String(u).toLowerCase();
}
function _getCustomExamLast(){
  try{
    const raw = localStorage.getItem(_customExamKey());
    const n = Number(raw);
    return isFinite(n) && n > 0 ? n : 0;
  }catch(e){ return 0; }
}
function _setCustomExamLast(ts){
  try{ localStorage.setItem(_customExamKey(), String(ts)); }catch(e){}
}
function _customExamCooldownRemainingMs(){
  const last = _getCustomExamLast();
  if(!last) return 0;
  const elapsed = Date.now() - last;
  const remaining = CUSTOM_EXAM_COOLDOWN_MS - elapsed;
  return remaining > 0 ? remaining : 0;
}
function _customExamIsLocked(){ return _customExamCooldownRemainingMs() > 0; }
function _fmtCooldown(ms){
  if(ms <= 0) return 'now';
  const totalSec = Math.ceil(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if(h > 0) return `${h}h ${m}m`;
  if(m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

const LS_QOTD = 'abhyas_subj_qotd_v1';
const LS_EXAM = 'abhyas_subj_exam_v1';
const MAX_PDF_BYTES = 8 * 1024 * 1024;
const FETCH_CONCURRENCY = 4;

const SUBJ_FILE_REFS = window.SUBJECTIVE_FILE_REFS || [];

/* ═══════════════════════════════════════════════════════════════════════
   QUESTION-BANK LOADER
   ═══════════════════════════════════════════════════════════════════════ */

let BANK = { byChapter: {}, loaded: false, loading: false, error: null };
const _fetchPromises = {};

/* Marks arrive as: 5 | "5" | "5+5=10" | "3+3.5+3.5=10". */
function _parseMarks(raw){
  if (typeof raw === 'number' && isFinite(raw)) {
    return (raw === 5 || raw === 10) ? raw : 10;
  }
  const s = String(raw == null ? '' : raw).trim();
  if (!s) return 10;
  const eq = s.lastIndexOf('=');
  if (eq > -1) {
    const m = s.slice(eq + 1).match(/\d+(?:\.\d+)?/);
    if (m) {
      const n = Math.round(parseFloat(m[0]));
      return (n === 5 || n === 10) ? n : 10;
    }
  }
  if (s.includes('+')) {
    const parts = s.split('+').map(x => parseFloat(x)).filter(x => isFinite(x));
    if (parts.length) {
      const sum = Math.round(parts.reduce((a,b) => a+b, 0));
      return (sum === 5 || sum === 10) ? sum : 10;
    }
  }
  const m = s.match(/\d+(?:\.\d+)?/);
  if (!m) return 10;
  const n = Math.round(parseFloat(m[0]));
  return (n === 5 || n === 10) ? n : 10;
}

function _normalizeSubjRaw(raw, fileId, chapterId, chapterName){
  if(raw && typeof raw === 'object' && !Array.isArray(raw) && raw.success === false){
    console.warn('[SUBJ] Server error for', fileId, '—', raw.error);
    return [];
  }

  if (raw && typeof raw === 'object' && !Array.isArray(raw) && Array.isArray(raw.sections)) {
    const out = [];
    raw.sections.forEach(sec => {
      const secTopic = String(sec.section || chapterName || 'General').trim();
      const qs = Array.isArray(sec.questions) ? sec.questions : [];
      qs.forEach((q, i) => {
        if (!q || typeof q !== 'object') return;
        const text = String(q.q || q.question || '').trim();
        if (!text) return;
        out.push({
          id: q.id || `${fileId}_${secTopic}_${i}`,
          chapterId,
          topic: secTopic,
          q: text,
          marks: _parseMarks(q.marks),
          hint: String(q.hint || '').trim(),
          modelAnswer: String(q.modelAnswer || '').trim()
        });
      });
    });
    return out;
  }

  let arr = Array.isArray(raw) ? raw
          : (raw && Array.isArray(raw.questions) ? raw.questions : null);
  if (!Array.isArray(arr) || !arr.length) {
    console.warn('[SUBJ] No questions found in', fileId);
    return [];
  }
  const out = [];
  arr.forEach((q, i) => {
    if (!q || typeof q !== 'object') return;
    const text = String(q.q || q.question || '').trim();
    if (!text) return;
    out.push({
      id: q.id || `${fileId}_${i}`,
      chapterId,
      topic: String(q.chapter || chapterName || 'General').trim(),
      q: text,
      marks: _parseMarks(q.marks),
      hint: String(q.hint || '').trim(),
      modelAnswer: String(q.modelAnswer || '').trim()
    });
  });
  return out;
}

async function _fetchSubjFileFromNetwork(ref, cacheKey){
  const url = _backendUrl();
  if(!url) throw new Error('Backend URL not configured');
  /* getFile needs a session in backend v1.11 (GETFILE_REQUIRES_AUTH) and is
     rate-limited per account. Without the credentials the whole written-answer
     bank came back "Session expired" and the app reported "no questions yet". */
  const a = _authParams();
  if(typeof GETFILE_GATE !== 'undefined') await GETFILE_GATE.take();
  const query = new URLSearchParams({
    action: 'getFile', fileId: ref.fileId, username: a.username, token: a.token
  }).toString();
  const r = await fetch(`${url}?${query}`, { redirect:'follow' });
  if(!r.ok) throw new Error('HTTP ' + r.status);
  const data = await r.json();
  if(data && data.rateLimited){
    if(typeof GETFILE_GATE !== 'undefined') GETFILE_GATE.backoff(12000);
    throw new Error('The server asked us to slow down. Try again in a moment.');
  }
  if(data && data.sessionInvalid) throw new Error('Your session expired — sign in again.');
  if(data && data.needsPayment) throw new Error('Your access has ended. Complete the payment to open the written bank.');
  if(data && data.success === false) throw new Error(data.error || 'Server error');
  const payload = (data && data.result !== undefined) ? data.result : data;
  if(typeof QDB !== 'undefined') QDB.set(cacheKey, payload).catch(() => {});
  return _normalizeSubjRaw(payload, ref.fileId, ref.chapterId, ref.name);
}

async function _fetchSubjFile(ref){
  if(_fetchPromises[ref.fileId]) return _fetchPromises[ref.fileId];
  const cacheKey = 'subj_' + ref.fileId;
  const promise = (async () => {
    if(typeof QDB !== 'undefined'){
      try{
        const cached = await QDB.get(cacheKey);
        const isValid = cached && !(typeof cached === 'object' && !Array.isArray(cached) && cached.success === false);
        if(isValid){
          if(typeof S !== 'undefined' && S.online && !S.forcedOffline){
            _fetchSubjFileFromNetwork(ref, cacheKey).catch(() => {});
          }
          return _normalizeSubjRaw(cached, ref.fileId, ref.chapterId, ref.name);
        }
      }catch(e){ /* fall through */ }
    }
    const off = (typeof S !== 'undefined' && (!S.online || S.forcedOffline));
    if(off) return [];
    try{
      return await _fetchSubjFileFromNetwork(ref, cacheKey);
    }catch(e){
      console.warn('[SUBJ] fetch failed for', ref.fileId, e.message);
      BANK.lastError = e.message || 'Could not reach the server.';
      return [];
    }
  })();
  _fetchPromises[ref.fileId] = promise.finally(() => { delete _fetchPromises[ref.fileId]; });
  return _fetchPromises[ref.fileId];
}

async function loadBank(force){
  if(BANK.loaded && !force) return BANK;
  if(BANK.loading) return BANK;
  BANK.loading = true;

  const refs = SUBJ_FILE_REFS.filter(r => r.fileId && !/^REPLACE_WITH/.test(r.fileId));

  if(!refs.length){
    BANK = { byChapter: {}, loaded: true, loading: false, error: 'No chapter files configured in subjective-data.js' };
    return BANK;
  }

  const byChapter = {};
  BANK.lastError = null;
  let i = 0;
  async function worker(){
    while(i < refs.length){
      const ref = refs[i++];
      const qs = await _fetchSubjFile(ref);
      if(qs.length){
        (byChapter[ref.chapterId] = byChapter[ref.chapterId] || []).push(...qs);
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(FETCH_CONCURRENCY, refs.length) }, worker));

  Object.keys(byChapter).forEach(ch => {
    byChapter[ch].sort((a, b) => String(a.topic).localeCompare(String(b.topic)));
  });

  /* An empty bank is nearly always a failed fetch, not an empty syllabus —
     say which, so the student knows whether to reconnect or wait for the
     admin to upload something. */
  const offline = (typeof S !== 'undefined' && (!S.online || S.forcedOffline));
  const empty = !Object.keys(byChapter).length;
  BANK = {
    byChapter, loaded: true, loading: false,
    lastError: BANK.lastError || null,
    error: !empty ? null
         : offline ? 'You are offline. Connect once and the written questions will be saved to this device.'
         : (BANK.lastError || 'The question bank could not be loaded. Check your connection and try again.')
  };
  return BANK;
}

function _allQuestions(){
  return Object.values(BANK.byChapter).flat();
}
function _questionsByChapter(chId){ return BANK.byChapter[chId] || []; }

/* ═══════════════════════════════════════════════════════════════════════
   PERSISTED STATE — QOTD + Exam
   ═══════════════════════════════════════════════════════════════════════ */

let QOTD = null;
let EXAM = null;

function _todayKey(){
  return (typeof window.today === 'function') ? window.today() : new Date().toISOString().slice(0,10);
}

function _restoreState(){
  try{
    const raw = localStorage.getItem(LS_QOTD);
    QOTD = raw ? JSON.parse(raw) : null;
  }catch(e){ QOTD = null; }
  if(QOTD && QOTD.date !== _todayKey()) QOTD = null;

  try{
    const raw = localStorage.getItem(LS_EXAM);
    EXAM = raw ? JSON.parse(raw) : null;
  }catch(e){ EXAM = null; }
  if(EXAM && !EXAM.deadlineAt) EXAM = null;
}
function _persistQotd(){
  try{ localStorage.setItem(LS_QOTD, JSON.stringify(QOTD)); }catch(e){}
}
function _persistExam(){
  try{
    if(EXAM) localStorage.setItem(LS_EXAM, JSON.stringify(EXAM));
    else localStorage.removeItem(LS_EXAM);
  }catch(e){}
}
function _clearQotd(){
  QOTD = null;
  try{ localStorage.removeItem(LS_QOTD); }catch(e){}
}
function _clearExam(){
  EXAM = null;
  try{ localStorage.removeItem(LS_EXAM); }catch(e){}
}

/* ═══════════════════════════════════════════════════════════════════════
   UTILITIES
   ═══════════════════════════════════════════════════════════════════════ */

function _solveSecFor(marks){
  if(marks === 5)  return TIMERS.solveSecondsFor5;
  if(marks === 10) return TIMERS.solveSecondsFor10;
  return TIMERS.solveSecondsFallback;
}
function _fmtHMS(sec){
  if(sec < 0) sec = 0;
  const h = Math.floor(sec/3600), m = Math.floor((sec%3600)/60), s = sec%60;
  return h > 0
    ? `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`
    : `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
}
function _fmtMins(sec){
  const m = Math.round(sec/60);
  return m === 60 ? '1 hour' : `${m} minutes`;
}
function _chapterNameOf(chapterId){
  const c = (window.SUBJECTIVE_CHAPTERS || []).find(x => x.id === chapterId);
  return c ? `${c.icon || ''} ${c.name}`.trim() : (chapterId || 'Subjective');
}
function _emptyCard(icon, title, subtitle, action){
  return `<div class="card" style="text-align:center;padding:1.6rem 1rem">
    <div class="empty-i" style="opacity:.6"><i class="ph ${icon}" style="font-size:2rem"></i></div>
    <p style="font-weight:600;color:var(--t2);margin-top:.5rem">${esc(title)}</p>
    ${subtitle ? `<p style="font-size:.72rem;color:var(--t3);margin-top:.2rem;line-height:1.55;max-width:38ch;margin-left:auto;margin-right:auto">${esc(subtitle)}</p>` : ''}
    ${action || ''}
  </div>`;
}
const _retryBtn = `<button class="btn btn-a" style="margin-top:.9rem" data-on-click="SUBJ.refreshBank()"><i class="ph ph-arrow-clockwise"></i> Try again</button>`;

/* ═══════════════════════════════════════════════════════════════════════
   QOTD STATE MACHINE
   ═══════════════════════════════════════════════════════════════════════ */

let _qotdTick = null;
let _pendingQotdFile = null;

function _todayPick(){
  const all = _allQuestions();
  if(!all.length) return null;
  const day = _todayKey();
  let h = 0;
  for(let i = 0; i < day.length; i++) h = (h * 31 + day.charCodeAt(i)) >>> 0;
  return all[h % all.length];
}

function _qotdPhase(){
  if(!QOTD) return 'idle';
  if(QOTD.submitted) return 'submitted';
  const now = Date.now();
  if(now < QOTD.solveEndsAt) return 'solving';
  if(QOTD.uploadEndsAt && now < QOTD.uploadEndsAt) return 'upload';
  return 'expired';
}

function _qotdPublicState(){
  if(!QOTD) return { phase: 'idle' };
  const phase = _qotdPhase();
  if(phase === 'submitted') return { phase, marks: QOTD.marks };
  if(phase === 'solving'){
    const leftSec = Math.max(0, Math.round((QOTD.solveEndsAt - Date.now()) / 1000));
    return { phase, leftSec, left: _fmtHMS(leftSec), marks: QOTD.marks };
  }
  if(phase === 'upload'){
    const leftSec = Math.max(0, Math.round((QOTD.uploadEndsAt - Date.now()) / 1000));
    return { phase, leftSec, left: _fmtHMS(leftSec), marks: QOTD.marks };
  }
  return { phase: 'expired', marks: QOTD.marks };
}

function _hasBank(){
  return BANK.loaded && _allQuestions().length > 0;
}

/* ═══════════════════════════════════════════════════════════════════════
   QOTD RENDER
   ═══════════════════════════════════════════════════════════════════════ */

function _renderQotd(){
  const body = $('subj-qotd-body');
  if(!body) return;

  if(!BANK.loaded){
    body.innerHTML = _emptyCard('ph-circle-notch','Loading…','Fetching today\'s question.');
    return;
  }
  if(!_allQuestions().length){
    body.innerHTML = _emptyCard('ph-sun-horizon','No question today',
      BANK.error || 'No written questions have been added yet. Check back soon.',
      BANK.error ? _retryBtn : '');
    return;
  }

  if(QOTD && !QOTD.submitted && !QOTD.uploadEndsAt && Date.now() >= QOTD.solveEndsAt){
    QOTD.uploadEndsAt = QOTD.solveEndsAt + TIMERS.uploadSeconds * 1000;
    _persistQotd();
  }

  const phase = _qotdPhase();
  const q = QOTD
    ? (_allQuestions().find(x => x.id === QOTD.questionId) || _todayPick())
    : _todayPick();

  if(!q){ body.innerHTML = _emptyCard('ph-sun-horizon','Nothing today','Check back tomorrow.'); return; }

  if(phase === 'idle'){
    body.innerHTML = `
      <div class="card">
        <div class="qotd-head">
          <div>
            <div class="qotd-meta">Today's Question</div>
            <div style="font-size:.9rem;font-weight:700;color:var(--t1);margin-top:.15rem">${esc(_chapterNameOf(q.chapterId))}</div>
            <div style="font-size:.66rem;color:var(--t3);margin-top:.1rem">${esc(q.topic || '')}</div>
          </div>
          <div class="qotd-marks ${q.marks===10?'m10':''}">${q.marks} marks</div>
        </div>
        <p style="font-size:.78rem;color:var(--t3);line-height:1.55;margin-bottom:.85rem">
          You get <b>${_fmtMins(_solveSecFor(q.marks))}</b> to write, then <b>${TIMERS.uploadSeconds/60} minutes</b>
          to photograph/scan and upload a PDF. Admin grades it after that. One attempt.
        </p>
        <button class="btn btn-solid btn-lg btn-blk" data-on-click="SUBJ._qotdBegin()">
          <i class="ph ph-play"></i> Start ${q.marks}-Mark Question
        </button>
      </div>`;
    return;
  }

  if(phase === 'submitted'){
    /* v1.29: while the answer is still in the local queue, do not claim
       "sent to admin" — the student needs to know it is safe on the
       device but not yet in the admin's hands. */
    if(QOTD.queued){
      body.innerHTML = `
        <div class="card qotd-done">
          <span class="big"><i class="ph ph-cloud-slash" style="color:var(--amb)"></i></span>
          <h3 style="color:var(--amb)">Queued on this device</h3>
          <p>Your answer is saved locally and will be sent to admin the moment you are back online.</p>
          <div class="bg mt3" style="justify-content:center">
            <button class="btn btn-sm btn-a" data-on-click="SUBJ_QUEUE.process()"><i class="ph ph-paper-plane-tilt"></i> Try sending now</button>
          </div>
        </div>`;
      _stopQotdTick();
      return;
    }
    body.innerHTML = `
      <div class="card qotd-done">
        <span class="big"><i class="ph ph-check-circle" style="color:var(--grn)"></i></span>
        <h3>Submitted for review</h3>
        <p>Your answer was sent to admin at ${new Date(QOTD.submittedAt).toLocaleTimeString()}.</p>
        <p style="margin-top:.5rem">Come back tomorrow for a fresh question.</p>
      </div>`;
    _stopQotdTick();
    return;
  }

  if(phase === 'solving'){
    const left = Math.max(0, Math.round((QOTD.solveEndsAt - Date.now()) / 1000));
    const total = _solveSecFor(QOTD.marks);
    body.innerHTML = `
      <div class="card">
        <div class="qotd-head">
          <div>
            <div class="qotd-meta">Now Solving</div>
            <div style="font-size:.9rem;font-weight:700;color:var(--t1);margin-top:.15rem">${esc(_chapterNameOf(q.chapterId))}</div>
            <div style="font-size:.66rem;color:var(--t3);margin-top:.1rem">${esc(q.topic || '')}</div>
          </div>
          <div class="qotd-marks ${q.marks===10?'m10':''}">${q.marks} marks</div>
        </div>
        <div class="qotd-q">${esc(q.q)}</div>
        ${q.hint ? `<div style="font-size:.72rem;color:var(--t3);font-style:italic;margin-top:-.4rem;margin-bottom:.85rem">${esc(q.hint)}</div>` : ''}
        <div class="qotd-timer ${left < 120 ? 'urgent' : ''}" id="qotd-tmr">${_fmtHMS(left)}</div>
        <div class="qotd-timer-lbl">Time left to write</div>
        <div class="qotd-phase-bar"><div class="qotd-phase-fill" id="qotd-bar" style="width:${(left/total)*100}%"></div></div>
        <p style="font-size:.72rem;color:var(--t3);text-align:center;line-height:1.55">
          Write on paper. A <b>${TIMERS.uploadSeconds/60}-minute upload window</b> opens automatically when the timer hits zero.
        </p>
      </div>`;
    _startQotdTick();
    return;
  }

  if(phase === 'upload'){
    const left = Math.max(0, Math.round((QOTD.uploadEndsAt - Date.now()) / 1000));
    const total = TIMERS.uploadSeconds;
    body.innerHTML = `
      <div class="card">
        <div class="qotd-head">
          <div>
            <div class="qotd-meta">Upload Window</div>
            <div style="font-size:.9rem;font-weight:700;color:var(--sky);margin-top:.15rem">Send your answer now</div>
          </div>
          <div class="qotd-marks ${q.marks===10?'m10':''}">${q.marks} marks</div>
        </div>
        <div class="qotd-timer upload ${left < 60 ? 'urgent' : ''}" id="qotd-tmr">${_fmtHMS(left)}</div>
        <div class="qotd-timer-lbl">Upload closes in</div>
        <div class="qotd-phase-bar"><div class="qotd-phase-fill upload" id="qotd-bar" style="width:${(left/total)*100}%"></div></div>
        <label class="qotd-drop" for="qotd-pdf">
          <input type="file" id="qotd-pdf" accept="application/pdf,.pdf,image/*" multiple data-on-change="SUBJ._qotdFile(this)">
          <span class="ii"><i class="ph ph-file-pdf"></i></span>
          <span class="dn">Choose photos or a PDF of your answer</span>
          <span class="ds">Select all your page photos at once. We turn them into one PDF for you.</span>
        </label>
        <div id="qotd-file-slot"></div>
        <button class="btn btn-solid btn-lg btn-blk" id="qotd-submit" style="margin-top:.7rem" disabled data-on-click="SUBJ._qotdSubmit()">
          <i class="ph ph-paper-plane-tilt"></i> Submit for Review
        </button>
      </div>`;
    if(_pendingQotdFile){
      _renderQotdFileChip(_pendingQotdFile);
      const b = $('qotd-submit'); if(b) b.disabled = false;
    }
    _startQotdTick();
    return;
  }

  body.innerHTML = `
    <div class="card qotd-done">
      <span class="big"><i class="ph ph-clock-countdown" style="color:var(--ros)"></i></span>
      <h3 style="color:var(--ros)">Upload window closed</h3>
      <p>Nothing was submitted for today's question in time.</p>
    </div>`;
  _stopQotdTick();
}

function _renderQotdFileChip(fileInfo){
  const slot = $('qotd-file-slot');
  if(!slot || !fileInfo) return;
  slot.innerHTML = `<div class="qotd-file-chip">
    <i class="ph ph-file-pdf" style="color:var(--grn);font-size:1.1rem"></i>
    <span class="fn">${esc(fileInfo.filename)}</span>
    <span style="font-size:.66rem;color:var(--t3)">${Math.round(fileInfo.size/1024)} KB</span>
    <button type="button" aria-label="Remove file" data-on-click="SUBJ._qotdClearFile()"><i class="ph ph-x"></i></button>
  </div>`;
}

let _lastQotdPhase = null;
let _hintTick = 0;

function _paintQotdTimer(){
  if(!QOTD) return;
  const el = $('qotd-tmr');
  if(!el) return;
  const phase = _qotdPhase();
  let left, total;
  if(phase === 'solving'){
    left = Math.max(0, Math.round((QOTD.solveEndsAt - Date.now()) / 1000));
    total = _solveSecFor(QOTD.marks);
    el.classList.toggle('urgent', left < 120);
  } else if(phase === 'upload'){
    left = Math.max(0, Math.round((QOTD.uploadEndsAt - Date.now()) / 1000));
    total = TIMERS.uploadSeconds;
    el.classList.toggle('urgent', left < 60);
  } else return;
  el.textContent = _fmtHMS(left);
  const bar = $('qotd-bar');
  if(bar) bar.style.width = ((left / total) * 100) + '%';
}

/* v1.14: repaint only the clock each second. Re-rendering the whole card (the
   old behaviour) replaced the file picker and re-enabled Submit mid-upload. */
function _startQotdTick(){
  _stopQotdTick();
  _lastQotdPhase = _qotdPhase();
  _qotdTick = setInterval(() => {
    const phase = _qotdPhase();
    if(phase !== _lastQotdPhase){ _lastQotdPhase = phase; _renderQotd(); }
    else _paintQotdTimer();
    if(++_hintTick % 10 === 0 && typeof window.SB_HINTS !== 'undefined') window.SB_HINTS.refresh();
  }, 1000);
}
function _startQotdTickLegacy(){
  _stopQotdTick();
  _qotdTick = setInterval(() => {
    _renderQotd();
    if(typeof window.SB_HINTS !== 'undefined') window.SB_HINTS.refresh();
  }, 1000);
}
function _stopQotdTick(){
  if(_qotdTick){ clearInterval(_qotdTick); _qotdTick = null; }
}

function _qotdBegin(){
  const q = _todayPick();
  if(!q){ toast('No question available'); return; }
  const now = Date.now();
  const solveSec = _solveSecFor(q.marks);
  QOTD = {
    date: _todayKey(),
    questionId: q.id,
    marks: q.marks,
    startedAt: now,
    solveEndsAt: now + solveSec * 1000,
    uploadEndsAt: 0,
    submitted: false
  };
  _persistQotd();
  _renderQotd();
  if(typeof window.SB_HINTS !== 'undefined') window.SB_HINTS.refresh();
}

/* ── Photos to PDF ──────────────────────────────────────────────────
   Students photograph their handwritten pages; we turn the photos into one
   PDF on the phone (pdf-lib, loaded on demand). A PDF can still be chosen. */
const PDFLIB_URL = 'vendor/pdf-lib/pdf-lib.min.js';
let _pdfLibPromise = null;
function _loadPdfLib(){
  if(window.PDFLib) return Promise.resolve(window.PDFLib);
  if(_pdfLibPromise) return _pdfLibPromise;
  _pdfLibPromise = new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = PDFLIB_URL;
    s.onload = () => window.PDFLib ? res(window.PDFLib) : rej(new Error('The PDF tools did not load.'));
    s.onerror = () => { _pdfLibPromise = null; rej(new Error('Could not load the PDF tools. Check your connection and try again.')); };
    document.head.appendChild(s);
  });
  return _pdfLibPromise;
}
function _readAsDataUrl(file){
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result);
    r.onerror = () => rej(new Error('Could not read that file.'));
    r.readAsDataURL(file);
  });
}
function _imageToJpeg(file, maxSide, quality){
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      let w = img.naturalWidth, h = img.naturalHeight;
      const sc = Math.min(1, maxSide / Math.max(w, h));
      w = Math.round(w * sc); h = Math.round(h * sc);
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      const cx = c.getContext('2d');
      cx.fillStyle = '#fff'; cx.fillRect(0, 0, w, h);
      cx.drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(url);
      c.toBlob(b => b
        ? b.arrayBuffer().then(buf => resolve({ bytes: new Uint8Array(buf), w, h }))
        : reject(new Error('Could not process one of the photos.')), 'image/jpeg', quality);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('One of the photos could not be opened. Use JPG or PNG.')); };
    img.src = url;
  });
}
async function _prepareUpload(files){
  const isPdf = f => /pdf/i.test(f.type || '') || /\.pdf$/i.test(f.name);
  const isImg = f => /^image\//i.test(f.type || '');
  if(files.length === 1 && isPdf(files[0])){
    const f = files[0];
    if(f.size > MAX_PDF_BYTES) throw new Error('PDF too large. Max ' + Math.round(MAX_PDF_BYTES / 1024 / 1024) + ' MB.');
    return { dataUrl: await _readAsDataUrl(f), filename: f.name, size: f.size };
  }
  if(!files.every(isImg)) throw new Error('Choose one PDF, or one or more photos of your pages.');
  if(files.length > 20) throw new Error('Up to 20 photos at a time.');
  const lib = await _loadPdfLib();
  const doc = await lib.PDFDocument.create();
  for(const f of files){
    const j = await _imageToJpeg(f, 1800, 0.78);
    const emb = await doc.embedJpg(j.bytes);
    const page = doc.addPage([j.w, j.h]);
    page.drawImage(emb, { x: 0, y: 0, width: j.w, height: j.h });
  }
  const out = await doc.save();
  if(out.length > MAX_PDF_BYTES) throw new Error('Those photos are too large together. Take fewer, or lower-resolution photos.');
  let bin = '';
  for(let i = 0; i < out.length; i += 0x8000) bin += String.fromCharCode.apply(null, out.subarray(i, i + 0x8000));
  return { dataUrl: 'data:application/pdf;base64,' + btoa(bin), filename: 'answer-' + Date.now() + '.pdf', size: out.length };
}

async function _qotdFile(input){
  const files = Array.from(input.files || []);
  if(!files.length) return;
  if(files.some(f => /^image\//i.test(f.type || ''))) toast('Preparing your PDF…', 2500);
  try{
    const picked = await _prepareUpload(files);
    _pendingQotdFile = picked;
    _renderQotdFileChip(picked);
    const btn = $('qotd-submit'); if(btn) btn.disabled = false;
  }catch(e){
    toast('❌ ' + (e.message || 'Could not read that file'));
    input.value = '';
  }
}
function _qotdClearFile(){
  _pendingQotdFile = null;
  const input = $('qotd-pdf'); if(input) input.value = '';
  const slot = $('qotd-file-slot'); if(slot) slot.innerHTML = '';
  const btn = $('qotd-submit'); if(btn) btn.disabled = true;
}

let _qotdSubmitting = false;
async function _qotdSubmit(){
  if(_qotdSubmitting) return;
  _qotdSubmitting = true;
  try { return await _qotdSubmitInner(); } finally { _qotdSubmitting = false; }
}
async function _qotdSubmitInner(){
  if(!QOTD || !_pendingQotdFile){ toast('Attach a PDF first'); return; }
  const q = _allQuestions().find(x => x.id === QOTD.questionId);
  if(!q){ toast('❌ Question no longer available'); return; }
  const btn = $('qotd-submit');
  if(btn){ btn.disabled = true; btn.innerHTML = '<span class="spin"></span>Uploading…'; }

  /* v1.29: no connection → queue the answer on this device rather than
     throwing it away. The QOTD card shows "Queued" until the server
     confirms receipt. */
  const _offline = (typeof navigator !== 'undefined' && !navigator.onLine)
    || (typeof S !== 'undefined' && S && (S.forcedOffline || !S.online));
  if(_offline){
    if(_pendingQotdFile.dataUrl.length > SUBJ_QUEUE.MAX_BYTES){
      if(btn){ btn.disabled = false; btn.innerHTML = '<i class="ph ph-paper-plane-tilt"></i> Submit for Review'; }
      toast('❌ That answer is too large to queue offline. Reconnect and try again.', 6000);
      return;
    }
    SUBJ_QUEUE.add({
      username: (typeof S !== 'undefined' && S && S.user ? S.user.username : ''),
      kind: 'qotd',
      questionId: QOTD.questionId,
      questionText: String(q.q || '').slice(0, 2000),
      chapterId: q.chapterId,
      marks: QOTD.marks,
      solveSec: _solveSecFor(QOTD.marks),
      startedAt: QOTD.startedAt,
      pdfData: _pendingQotdFile.dataUrl,
      filename: _pendingQotdFile.filename
    });
    QOTD.submitted = true;
    QOTD.submittedAt = Date.now();
    QOTD.queued = true;
    _persistQotd();
    _pendingQotdFile = null;
    _stopQotdTick();
    toast('💾 Saved on this device — it will send automatically when you are back online.', 6000);
    _renderQotd();
    if(typeof window.SB_HINTS !== 'undefined') window.SB_HINTS.refresh();
    SUBJ_QUEUE.scheduleProcess();
    return;
  }

  const res = await _api('submitSubjectiveAnswer', {
    kind: 'qotd',
    questionId: QOTD.questionId,
    questionText: q.q.slice(0, 2000),
    chapterId: q.chapterId,
    marks: QOTD.marks,
    solveSec: _solveSecFor(QOTD.marks),
    startedAt: QOTD.startedAt,
    pdfData: _pendingQotdFile.dataUrl,
    filename: _pendingQotdFile.filename
  }, 'POST');

  if(!res || !res.success){
    if(btn){ btn.disabled = false; btn.innerHTML = '<i class="ph ph-paper-plane-tilt"></i> Submit for Review'; }
    toast('❌ ' + ((res && res.error) || 'Submit failed'));
    return;
  }

  QOTD.submitted = true;
  QOTD.submittedAt = Date.now();
  _persistQotd();
  _pendingQotdFile = null;
  _stopQotdTick();
  toast('✅ Submitted — admin will grade it');
  _renderQotd();
  if(typeof window.SB_HINTS !== 'undefined') window.SB_HINTS.refresh();
}

/* ═══════════════════════════════════════════════════════════════════════
   PROPER EXAM
   ═══════════════════════════════════════════════════════════════════════ */

const EXAM_GROUPS = {
  A: { name: "Group A — Structure + Geotech",    marks: 30, chapterIds: ["structure","geotech"] },
  B: { name: "Group B — Water Resource",         marks: 25, chapterIds: ["irrigationAndCo"] },
  C: { name: "Group C — Transportation",         marks: 25, chapterIds: ["transportAndCo"] },
  D: { name: "Group D — Public Health & Misc",   marks: 20, chapterIds: ["publicHealth","miscellaneous"] }
};

let _examTick = null;
let _pendingExamFile = null;

function _shuffle(a){
  const b = a.slice();
  for(let i = b.length - 1; i > 0; i--){
    const j = Math.floor(Math.random() * (i + 1));
    [b[i], b[j]] = [b[j], b[i]];
  }
  return b;
}

function _questionsByGroup(gKey){
  const meta = EXAM_GROUPS[gKey];
  if(!meta) return [];
  return meta.chapterIds.flatMap(id => _questionsByChapter(id));
}

function _generateExam(){
  const sections = [];
  for(const [key, meta] of Object.entries(EXAM_GROUPS)){
    const pool = _questionsByGroup(key).map(q => ({ ...q, marks: (q.marks === 5 || q.marks === 10) ? q.marks : 10 }));
    const picked = [];
    const used = new Set();
    let remaining = meta.marks;
    for(const q of _shuffle(pool)){
      if(q.marks <= remaining){
        picked.push(q);
        used.add(q.id);
        remaining -= q.marks;
      }
      if(remaining <= 0) break;
    }
    if(remaining > 0){
      for(const q of _shuffle(pool)){
        if(used.has(q.id)) continue;
        const m = Math.min(q.marks, remaining);
        picked.push({ ...q, marks: m });
        used.add(q.id);
        remaining -= m;
        if(remaining <= 0) break;
      }
    }
    sections.push({ group: key, name: meta.name, targetMarks: meta.marks, questions: picked });
  }
  const now = Date.now();
  return {
    generatedAt: now,
    deadlineAt: now + TIMERS.examSeconds * 1000,
    /* v1.32: the upload window opens when the write timer hits zero. */
    uploadEndsAt: now + (TIMERS.examSeconds + TIMERS.examUploadSeconds) * 1000,
    sections,
    submitted: false,
    submittedAt: 0
  };
}

function _renderExam(){
  const body = $('subj-exam-body');
  if(!body) return;

  if(!BANK.loaded){
    body.innerHTML = _emptyCard('ph-circle-notch','Loading…','Fetching the syllabus.');
    return;
  }
  if(!_allQuestions().length){
    body.innerHTML = _emptyCard('ph-note-pencil','No paper to build yet',
      BANK.error || 'No written questions have been added yet.',
      BANK.error ? _retryBtn : '');
    return;
  }

  /* v1.32: migrate an EXAM saved before uploadEndsAt existed. */
  if(EXAM && EXAM.deadlineAt && !EXAM.uploadEndsAt){
    EXAM.uploadEndsAt = EXAM.deadlineAt + TIMERS.examUploadSeconds * 1000;
    _persistExam();
  }

  if(EXAM && EXAM.submitted){
    body.innerHTML = `
      <div class="card">
        <div class="qotd-head">
          <div>
            <div class="qotd-meta">Exam Submitted</div>
            <div style="font-size:.9rem;font-weight:700;color:var(--grn);margin-top:.15rem">Sent for grading</div>
          </div>
          <div class="qotd-marks">100</div>
        </div>
        <p style="font-size:.78rem;color:var(--t3);line-height:1.55;margin-bottom:.85rem">
          Submitted at ${new Date(EXAM.submittedAt).toLocaleString()}. Admin will grade it and you'll get a push notification when it's done.
        </p>
        <button class="btn btn-r btn-blk" data-on-click="SUBJ._examReset()">
          <i class="ph ph-arrow-counter-clockwise"></i> Discard &amp; Start a Fresh Paper
        </button>
      </div>`;
    return;
  }

  if(!EXAM){
    const cdMs = _customExamCooldownRemainingMs();
    const cooldownNote = cdMs > 0
      ? `<p style="font-size:.7rem;color:var(--ros);margin-top:.6rem;text-align:center"><i class="ph ph-clock"></i> Custom builder available again in <b>${_fmtCooldown(cdMs)}</b></p>`
      : '';
    body.innerHTML = `
      <div class="card">
        <div class="card-hd"><h3><i class="ph ph-note-pencil"></i> Proper Exam — 100 Marks</h3>
          <span class="ctag ta">Group A/B/C/D</span></div>
        <p style="font-size:.78rem;color:var(--t3);line-height:1.6;margin-bottom:.85rem">
          A full paper: 30 marks Structure+Geotech, 25 Water Resource, 25 Transportation,
          20 Public Health &amp; Misc — matching the Loksewa L7 Civil pattern. You get
          <b>3 hours</b> to write, then <b>20 minutes</b> to photograph your answers and
          upload a single PDF. Submit before the upload window closes.
        </p>
        <button class="btn btn-solid btn-lg btn-blk" data-on-click="SUBJ._examGenerate()">
          <i class="ph ph-dice-five"></i> Generate a Random Paper
        </button>
        ${cooldownNote}
      </div>`;
    return;
  }

  const _now = Date.now();
  const _writing = _now < EXAM.deadlineAt;
  const _uploading = !_writing && _now < EXAM.uploadEndsAt;
  const _expired = !_writing && !_uploading;
  const writeLeftSec  = Math.max(0, Math.round((EXAM.deadlineAt  - _now) / 1000));
  const uploadLeftSec = Math.max(0, Math.round((EXAM.uploadEndsAt - _now) / 1000));

  const _phaseLabel = _writing ? 'Total exam time left'
                    : _uploading ? 'Upload window closes in'
                    : 'Time is up';
  const _phaseClass = _uploading ? ' upload' : '';
  const _timerText  = _writing ? _fmtHMS(writeLeftSec) : _fmtHMS(uploadLeftSec);
  const _urgent = (_writing && writeLeftSec < 300) || (_uploading && uploadLeftSec < 120);

  const parts = [];
  parts.push(`
    <div class="card">
      <div class="qotd-head">
        <div>
          <div class="qotd-meta">Proper Exam — ${_writing ? 'In Progress' : _uploading ? 'Upload Phase' : 'Time is Up'}</div>
          <div style="font-size:1rem;font-weight:800;color:var(--t1);margin-top:.15rem">Full 100-Mark Paper</div>
        </div>
        <div class="qotd-marks">100</div>
      </div>
      <div class="qotd-timer${_phaseClass}${_urgent ? ' urgent' : ''}" id="exam-tmr">${_timerText}</div>
      <div class="qotd-timer-lbl" id="exam-tmr-lbl">${_phaseLabel}</div>
    </div>`);

  EXAM.sections.forEach(sec => {
    parts.push(`
      <div class="card">
        <div class="card-hd"><h3>${esc(sec.name)}</h3><span class="ctag tg">${sec.targetMarks} marks</span></div>
        ${sec.questions.length
          ? sec.questions.map((q,i) => `
              <div class="subj-q-row">
                <span class="qn">${i+1}.</span>
                <span class="qt">${esc(q.q)}</span>
                <span class="qm ${q.marks===10?'m10':'m5'}">${q.marks}M</span>
              </div>`).join('')
          : '<p style="font-size:.72rem;color:var(--t3);padding:.4rem .3rem">No questions available for this group yet.</p>'}
      </div>`);
  });

  if(_expired){
    parts.push(`
      <div class="card">
        <div class="card-hd"><h3><i class="ph ph-clock-countdown"></i> Time is up</h3></div>
        <div class="banner banner-danger" style="margin:0 0 var(--sp-3)">
          <i class="ph ph-clock-countdown"></i>
          <span>The 3-hour writing window and the ${Math.round(TIMERS.examUploadSeconds/60)}-minute upload window for this paper have both closed. Start a fresh paper to try again.</span>
        </div>
        <button class="btn btn-r btn-blk" data-on-click="SUBJ._examReset()">
          <i class="ph ph-arrow-counter-clockwise"></i> Start a Fresh Paper
        </button>
      </div>`);
  } else {
    parts.push(`
      <div class="card">
        <div class="card-hd"><h3><i class="ph ph-file-arrow-up"></i> Upload Answer PDF</h3></div>
        ${_uploading ? '<div class="banner banner-warning" style="margin-bottom:var(--sp-3)"><i class="ph ph-hourglass"></i><span><b>Writing time is over.</b> Upload your paper \u2014 the window closes in ' + _fmtHMS(uploadLeftSec) + '.</span></div>' : ''}
        <label class="qotd-drop" for="exam-pdf">
          <input type="file" id="exam-pdf" accept="application/pdf,.pdf,image/*" multiple data-on-change="SUBJ._examFile(this)">
          <span class="ii"><i class="ph ph-file-pdf"></i></span>
          <span class="dn">Choose photos or a PDF of your paper</span>
          <span class="ds">Select all page photos at once (or one PDF), under 8 MB</span>
        </label>
        <div id="exam-file-slot"></div>
        <button class="btn btn-solid btn-lg btn-blk" id="exam-submit" style="margin-top:.7rem" ${_pendingExamFile ? '' : 'disabled'} data-on-click="SUBJ._examSubmit()">
          <i class="ph ph-paper-plane-tilt"></i> Submit Paper for Grading
        </button>
        <button class="btn btn-r btn-blk" style="margin-top:.5rem" data-on-click="SUBJ._examReset()">
          <i class="ph ph-arrow-counter-clockwise"></i> Discard &amp; Start Over
        </button>
      </div>`);
  }

  body.innerHTML = parts.join('');
  if(_pendingExamFile){
    const slot = $('exam-file-slot');
    if(slot) slot.innerHTML = `<div class="qotd-file-chip">
      <i class="ph ph-file-pdf" style="color:var(--grn);font-size:1.1rem"></i>
      <span class="fn">${esc(_pendingExamFile.filename)}</span>
      <span style="font-size:.66rem;color:var(--t3)">${Math.round(_pendingExamFile.size/1024)} KB</span>
      <button type="button" aria-label="Remove file" data-on-click="SUBJ._examClearFile()"><i class="ph ph-x"></i></button>
    </div>`;
  }
  _startExamTick();
}

/* v1.32: phase-aware countdown. The timer first counts the 3-hour write
   window, then the 20-minute upload window, then stops. Phase changes
   trigger a single re-render each, so the card header and labels swap
   correctly without a full-page refresh. */
function _startExamTick(){
  _stopExamTick();
  _examTick = setInterval(() => {
    if(!EXAM || EXAM.submitted){ _stopExamTick(); return; }
    const el  = $('exam-tmr');
    const lbl = $('exam-tmr-lbl');
    if(!el){ _stopExamTick(); return; }

    const now = Date.now();
    const writing   = now < EXAM.deadlineAt;
    const uploading = !writing && now < EXAM.uploadEndsAt;
    const expired   = !writing && !uploading;

    if(writing){
      const left = Math.max(0, Math.round((EXAM.deadlineAt - now) / 1000));
      el.textContent = _fmtHMS(left);
      el.classList.remove('upload');
      el.classList.toggle('urgent', left < 300);
      if(lbl) lbl.textContent = 'Total exam time left';
      if(left <= 0 && !EXAM._enteredUpload){
        EXAM._enteredUpload = true;
        _persistExam();
        toast('⏰ Writing time is up — upload your PDF now. You have ' + Math.round(TIMERS.examUploadSeconds/60) + ' minutes.', 8000);
        _renderExam();
      }
    } else if(uploading){
      const left = Math.max(0, Math.round((EXAM.uploadEndsAt - now) / 1000));
      el.textContent = _fmtHMS(left);
      el.classList.add('upload');
      el.classList.toggle('urgent', left < 120);
      if(lbl) lbl.textContent = 'Upload window closes in';
      if(!EXAM._enteredUpload){
        EXAM._enteredUpload = true;
        _persistExam();
        _renderExam();
      }
    } else if(expired){
      el.textContent = '00:00:00';
      el.classList.remove('urgent', 'upload');
      if(lbl) lbl.textContent = 'Time is up';
      if(!EXAM._enteredExpired){
        EXAM._enteredExpired = true;
        _persistExam();
        toast('⏰ Upload window closed. This paper cannot be submitted.', 8000);
        _stopExamTick();
        _renderExam();
      }
    }
  }, 1000);
}
function _stopExamTick(){
  if(_examTick){ clearInterval(_examTick); _examTick = null; }
}

function _examGenerate(){
  EXAM = _generateExam();
  _pendingExamFile = null;
  _persistExam();
  _renderExam();
}

/* v1.27: was native confirm() — suppressed by an installed iOS PWA, so
   the discard ran silently even if the student tried to cancel. */
async function _examReset(){
  const body = (EXAM && !EXAM.submitted)
    ? 'Any answers you have written on paper will not be submitted.'
    : 'This clears the submitted paper. You can generate a new one afterwards.';
  const ok = await ASK.confirm({
    title: 'Discard this paper?',
    body:  body,
    ok:    'Discard',
    danger: true
  });
  if(!ok) return;
  _clearExam();
  _pendingExamFile = null;
  _stopExamTick();
  _renderExam();
}

async function _examFile(input){
  const files = Array.from(input.files || []);
  if(!files.length) return;
  if(files.some(f => /^image\//i.test(f.type || ''))) toast('Preparing your PDF…', 2500);
  try{
    const picked = await _prepareUpload(files);
    _pendingExamFile = picked;
    const slot = $('exam-file-slot');
    if(slot) slot.innerHTML = `<div class="qotd-file-chip">
      <i class="ph ph-file-pdf" style="color:var(--grn);font-size:1.1rem"></i>
      <span class="fn">${esc(picked.filename)}</span>
      <span style="font-size:.66rem;color:var(--t3)">${Math.round(picked.size/1024)} KB</span>
      <button type="button" aria-label="Remove file" data-on-click="SUBJ._examClearFile()"><i class="ph ph-x"></i></button>
    </div>`;
    const btn = $('exam-submit'); if(btn) btn.disabled = false;
  }catch(e){
    toast('❌ ' + (e.message || 'Could not read that file'));
    input.value = '';
  }
}
function _examFileLegacy(input){
  const f = input.files && input.files[0];
  if(!f) return;
  if(f.size > MAX_PDF_BYTES){
    toast('❌ PDF too large — max ' + Math.round(MAX_PDF_BYTES/1024/1024) + ' MB');
    input.value = '';
    return;
  }
  const looksPdf = /pdf/i.test(f.type || '') || /\.pdf$/i.test(f.name);
  if(!looksPdf){
    toast('❌ Only PDF files are accepted');
    input.value = '';
    return;
  }
  const r = new FileReader();
  r.onload = e => {
    _pendingExamFile = { dataUrl: e.target.result, filename: f.name, size: f.size };
    const slot = $('exam-file-slot');
    if(slot) slot.innerHTML = `<div class="qotd-file-chip">
      <i class="ph ph-file-pdf" style="color:var(--grn);font-size:1.1rem"></i>
      <span class="fn">${esc(f.name)}</span>
      <span style="font-size:.66rem;color:var(--t3)">${Math.round(f.size/1024)} KB</span>
      <button type="button" aria-label="Remove file" data-on-click="SUBJ._examClearFile()"><i class="ph ph-x"></i></button>
    </div>`;
    const btn = $('exam-submit'); if(btn) btn.disabled = false;
  };
  r.onerror = () => toast('❌ Could not read that file');
  r.readAsDataURL(f);
}
function _examClearFile(){
  _pendingExamFile = null;
  const input = $('exam-pdf'); if(input) input.value = '';
  const slot = $('exam-file-slot'); if(slot) slot.innerHTML = '';
  const btn = $('exam-submit'); if(btn) btn.disabled = true;
}

async function _examSubmit(){
  if(!EXAM || !_pendingExamFile){ toast('Attach the PDF first'); return; }
  /* v1.32: the exam now has two windows — 3 hours to write, then 20 minutes
     to upload. Submitting past the upload window is refused. */
  if(EXAM.uploadEndsAt && Date.now() > EXAM.uploadEndsAt){
    toast('❌ The upload window for this paper has closed. Start a fresh paper from the Full paper tab.', 7000);
    return;
  }
  const btn = $('exam-submit');
  if(btn){ btn.disabled = true; btn.innerHTML = '<span class="spin"></span>Uploading…'; }

  /* v1.29: offline → queue instead of failing. */
  const _offline = (typeof navigator !== 'undefined' && !navigator.onLine)
    || (typeof S !== 'undefined' && S && (S.forcedOffline || !S.online));
  if(_offline){
    if(_pendingExamFile.dataUrl.length > SUBJ_QUEUE.MAX_BYTES){
      if(btn){ btn.disabled = false; btn.innerHTML = '<i class="ph ph-paper-plane-tilt"></i> Submit Paper for Grading'; }
      toast('❌ That paper is too large to queue offline. Reconnect and try again.', 6000);
      return;
    }
    const paperTextQ = EXAM.sections.map(s =>
      `[${s.name}]\n` + s.questions.map((q,i) => `${i+1}. ${q.q} [${q.marks}]`).join('\n')
    ).join('\n\n').slice(0, 3000);
    SUBJ_QUEUE.add({
      username: (typeof S !== 'undefined' && S && S.user ? S.user.username : ''),
      kind: 'exam',
      questionId: 'exam_' + EXAM.generatedAt,
      questionText: paperTextQ,
      chapterId: 'exam',
      marks: 100,
      solveSec: TIMERS.examSeconds,
      startedAt: EXAM.generatedAt,
      pdfData: _pendingExamFile.dataUrl,
      filename: _pendingExamFile.filename
    });
    EXAM.submitted = true;
    EXAM.submittedAt = Date.now();
    EXAM.queued = true;
    _persistExam();
    _pendingExamFile = null;
    _stopExamTick();
    toast('💾 Saved on this device — it will send automatically when you are back online.', 6000);
    _renderExam();
    SUBJ_QUEUE.scheduleProcess();
    return;
  }

  const paperText = EXAM.sections.map(s =>
    `[${s.name}]\n` + s.questions.map((q,i) => `${i+1}. ${q.q} [${q.marks}]`).join('\n')
  ).join('\n\n').slice(0, 3000);

  const res = await _api('submitSubjectiveAnswer', {
    kind: 'exam',
    questionId: 'exam_' + EXAM.generatedAt,
    questionText: paperText,
    chapterId: 'exam',
    marks: 100,
    solveSec: TIMERS.examSeconds,
    startedAt: EXAM.generatedAt,
    pdfData: _pendingExamFile.dataUrl,
    filename: _pendingExamFile.filename
  }, 'POST');

  if(!res || !res.success){
    if(btn){ btn.disabled = false; btn.innerHTML = '<i class="ph ph-paper-plane-tilt"></i> Submit Paper for Grading'; }
    toast('❌ ' + ((res && res.error) || 'Submit failed'));
    return;
  }

  EXAM.submitted = true;
  EXAM.submittedAt = Date.now();
  _persistExam();
  _pendingExamFile = null;
  _stopExamTick();
  toast('✅ Paper submitted for grading');
  _renderExam();
}

/* ═══════════════════════════════════════════════════════════════════════
   CUSTOM EXAM BUILDER (6-hour cooldown)
   ═══════════════════════════════════════════════════════════════════════ */

function _buildCustomExam(chapterIds, targetMarks, markFilter){
  const cdMs = _customExamCooldownRemainingMs();
  if(cdMs > 0){
    toast(`⏳ Custom paper is on cooldown — available again in ${_fmtCooldown(cdMs)}`, 5000);
    return;
  }

  const all = _allQuestions();
  if(!all.length){ toast('Question bank not loaded yet'); return; }
  let pool = chapterIds && chapterIds.length
    ? all.filter(q => chapterIds.includes(q.chapterId))
    : all;
  if(markFilter === '5')  pool = pool.filter(q => q.marks === 5);
  if(markFilter === '10') pool = pool.filter(q => q.marks === 10);
  if(!pool.length){ toast('No questions match those filters'); return; }

  const shuffled = _shuffle(pool);
  const picked = [];
  let total = 0;
  for(const q of shuffled){
    if(total >= targetMarks && picked.length >= 3) break;
    if(total + q.marks > targetMarks + 10) continue;
    picked.push(q);
    total += q.marks;
    if(total >= targetMarks) break;
  }
  if(!picked.length){ toast('Could not build a paper — try a lower total'); return; }

  EXAM = {
    generatedAt: Date.now(),
    deadlineAt: Date.now() + TIMERS.examSeconds * 1000,
    sections: [{
      group: 'custom',
      name: 'Custom Paper — ' + picked.length + ' questions',
      targetMarks: total,
      questions: picked
    }],
    submitted: false,
    submittedAt: 0
  };
  _pendingExamFile = null;
  _persistExam();
  _markCustomExamUsed();
  _renderExam();
  toast('✅ Custom paper ready · ' + picked.length + ' Qs · ' + total + ' marks · next custom paper in 6h', 5000);
}

function _notifyBuilder(){
  try {
    if(window.SUBJ_BUILDER && typeof window.SUBJ_BUILDER._updateCooldownUI === 'function'){
      window.SUBJ_BUILDER._updateCooldownUI();
    }
  } catch(e){}
}

function _markCustomExamUsed(){
  _setCustomExamLast(Date.now());
  setTimeout(() => {
    if(document.getElementById('view-subj-exam')?.classList.contains('on')) _renderExam();
    _notifyBuilder();
  }, 50);
}

/* ═══════════════════════════════════════════════════════════════════════
   QUESTION LIST
   ═══════════════════════════════════════════════════════════════════════ */

/* This used to exist only as SUBJ._refreshBadge, but init() and
   refreshBank() call it as a bare function — which threw a ReferenceError
   part-way through init and left the daily-question timer unstarted. */
function _refreshBadge(){
  const b = $('subj-qotd-badge');
  if(!b) return;
  const fresh = _hasBank() &&
    (!QOTD || QOTD.date !== _todayKey() || (!QOTD.submitted && _qotdPhase() === 'expired'));
  b.hidden = !fresh;
  b.style.display = fresh ? '' : 'none';
}

function _renderList(){
  const body = $('subj-list-body');
  if(!body) return;

  if(!BANK.loaded){
    body.innerHTML = _emptyCard('ph-circle-notch','Loading…','Fetching the question bank.');
    return;
  }
  if(!_allQuestions().length){
    body.innerHTML = _emptyCard('ph-list-dashes','Nothing to browse yet',
      BANK.error || 'Once questions are added, this becomes a chapter-by-chapter index.',
      BANK.error ? _retryBtn : '');
    return;
  }

  const f = (window.SUBJ && SUBJ._listFilter) || { query: '', chapter: '' };
  const chapters = window.SUBJECTIVE_CHAPTERS || [];
  const tree = chapters
    .filter(ch => !f.chapter || ch.id === f.chapter)
    .map(ch => {
      let qs = _questionsByChapter(ch.id);
      if(f.query) qs = qs.filter(q => (q.q || '').toLowerCase().includes(f.query));
      if(!qs.length) return '';

      const byTopic = {};
      qs.forEach(q => {
        const key = q.topic || 'General';
        (byTopic[key] = byTopic[key] || []).push(q);
      });
      const topics = Object.keys(byTopic).sort();

      const topicBlocks = topics.map(topic => {
        const tQs = byTopic[topic];
        return `<div style="margin:0 0 .55rem">` +
          `<div style="font-size:.68rem;font-weight:800;text-transform:uppercase;letter-spacing:.8px;color:var(--t3);padding:.35rem .3rem .2rem;border-bottom:1px solid var(--b1)">` +
            `${esc(topic)} <span style="font-weight:500;opacity:.6">(${tQs.length})</span>` +
          `</div>` +
          tQs.map((q, i) => `<div class="subj-q-row">` +
            `<span class="qn">${i+1}.</span>` +
            `<span class="qt">${esc(q.q)}</span>` +
            `<span class="qm ${q.marks===10?'m10':'m5'}">${q.marks}M</span>` +
          `</div>`).join('') +
        `</div>`;
      }).join('');

      const openClass = (f.query || f.chapter) ? ' open' : '';
      return `<div class="subj-group${openClass}">` +
        `<div class="subj-group-hd" data-on-click="this.parentElement.classList.toggle('open')">` +
          `<div><div>${ch.icon || ''} ${esc(ch.name)} <span style="color:var(--t3);font-weight:400">· Group ${esc(ch.group || '')}</span></div>` +
          `<div class="meta">${qs.length} question${qs.length !== 1 ? 's' : ''} · ${topics.length} section${topics.length !== 1 ? 's' : ''}</div></div>` +
          `<i class="ph ph-caret-right chev"></i>` +
        `</div>` +
        `<div class="subj-group-body">${topicBlocks}</div>` +
      `</div>`;
    }).filter(Boolean).join('');

  body.innerHTML = tree || _emptyCard('ph-list-dashes','No matching questions','Try clearing the search or picking a different chapter.');
}

/* ═══════════════════════════════════════════════════════════════════════
   PUBLIC MODULE
   ═══════════════════════════════════════════════════════════════════════ */

const SUBJ = {
  async init(){
    await loadBank();
    _restoreState();
    _renderQotd();
    _renderExam();
    _renderList();
    _refreshBadge();
    if(QOTD && !QOTD.submitted && _qotdPhase() !== 'expired') _startQotdTick();
    if(EXAM && !EXAM.submitted && EXAM.deadlineAt > Date.now()) _startExamTick();
    if(typeof window.SB_HINTS !== 'undefined') window.SB_HINTS.refresh();
  },

  ready(){ return BANK.loaded; },

  async refreshBank(){
    toast('Reloading the question bank…');
    await loadBank(true);
    _renderQotd();
    _renderExam();
    _renderList();
    _refreshBadge();
    if(typeof window.SB_HINTS !== 'undefined') window.SB_HINTS.refresh();
    toast('🔄 Question bank refreshed');
  },

  _qotdPublicState,
  _hasBank,

  _qotdBegin,
  _qotdFile,
  _qotdClearFile,
  _qotdSubmit,

  _examGenerate,
  _examFile,
  _examClearFile,
  _examSubmit,
  _examReset,

  _renderQotd,
  _renderExam,
  _renderList,

  _buildCustomExam,

  customExamCooldownRemainingMs: _customExamCooldownRemainingMs,
  customExamIsLocked: _customExamIsLocked,
  customExamCooldownLabel(){
    const ms = _customExamCooldownRemainingMs();
    return ms > 0 ? _fmtCooldown(ms) : '';
  },

  _listFilter: { query: '', chapter: '' },

  _filterList(query){
    if(typeof query === 'string') this._listFilter.query = query.toLowerCase();
    const sel = document.getElementById('subj-list-chapter');
    if(sel) this._listFilter.chapter = sel.value;
    _renderList();
  },

  _refreshBadge
};

window.SUBJ = SUBJ;
window.SUBJ_QUEUE = SUBJ_QUEUE;

/* ═══════════════════════════════════════════════════════════════════════
   SMART PASTE PARSER — used by admin.html
   ═══════════════════════════════════════════════════════════════════════ */

const SORT_RULES = {
  structure: { group: 'A', keywords: [
    'beam','slab','column','footing','rcc','reinforced','concrete','bending',
    'shear','deflection','bond','anchorage','prestress','prestressed','working stress',
    'limit state','doubly reinforced','staircase','two-way slab','cantilever',
    't-beam','box culvert','bridges','bridge','suspension','deck girder',
    'earthquake','seismic','ductility','masonry','rule of thumb','stiffness matrix',
    'flexibility matrix','influence line','moment capacity','fe415','m20','m15'
  ]},
  geotech: { group: 'A', keywords: [
    'soil','compaction','consolidation','void ratio','permeability','effective stress',
    'capillary','quick sand','seepage','flow net','shear strength','mohr','coulomb',
    'slope failure','factor of safety','bio-engineering','bioengineering','retaining wall',
    'earth pressure','rankine','coloumb','bearing capacity','terzaghi','settlement',
    'pile','caisson','well foundation','mat foundation','raft',
    'spt','standard penetration','plate load','site investigation','boring','soil sample',
    'foundation','underpinning','grouting'
  ]},
  irrigationAndCo: { group: 'B', keywords: [
    'rainfall','hydrograph','unit hydrograph','flood','flood frequency','gumbel',
    'runoff','run-off','watershed','catchment','discharge','rating curve','sediment',
    'glof','reservoir','dam height','trap efficiency','infiltration',
    'irrigation','canal','weir','barrage','headworks','headwork','duty','delta',
    'kennedy','lacey','regime','silt factor','cross drainage','aqueduct','syphon',
    'hydraulic jump','froude','bernoulli','manning','chezy','pipe flow','open channel',
    'water hammer','surge tank','penstock','turbine','hydropower','de-sanding',
    'spillway','gravity dam','embankment dam','canal lining','waterlogging',
    'drainage coefficient','recharge','aquifer','well hydraulics'
  ]},
  transportAndCo: { group: 'C', keywords: [
    'highway','road','pavement','flexible pavement','rigid pavement','cbr','subgrade',
    'bitumen','asphalt','aggregate','marshal','penetration test','ductility test',
    'viscosity','highway alignment','geometric design','superelevation','transition curve',
    'sight distance','stopping sight','hair pin','hill road',
    'traffic','traffic volume','o-d survey','origin destination','parking survey',
    'accident','intersection','rotary','traffic signal','road marking','road lighting',
    'airport','runway','taxiway','apron','aerodrome','icao','stol','heliport',
    'maintenance','overlay','pothole','crack','pci','pavement distress','esal','eal'
  ]},
  publicHealth: { group: 'D', keywords: [
    'water supply','potable','water demand','per capita demand','intake','reservoir tank',
    'distribution system','water treatment','sedimentation','coagulation','flocculation',
    'filtration','slow sand','rapid sand','disinfection','chlorination','break point',
    'hardness','alkalinity','iron removal','manganese','who standard','water quality',
    'bod','cod','bod5','sewage','sewer','sewerage','self cleansing','non scouring',
    'septic tank','soak pit','activated sludge','trickling filter','oxidation pond',
    'sludge','effluent','wastewater','sanitation','ecological sanitation','excreta',
    'water borne disease','typhoid','cholera','solid waste','landfill','composting',
    'incineration','iee','eia','environmental impact','pollution','air pollution',
    'greenhouse','carbon','recycle','reuse'
  ]},
  miscellaneous: { group: 'D', keywords: [
    'project management','cpm','pert','critical path','bar chart','gantt',
    'quantity surveying','rate analysis','estimate','bill of quantities','boq',
    'tender','contract','specification','quality assurance','qa plan',
    'professional ethics','code of conduct','loksewa','public procurement',
    'hydropower policy','nea','electricity act','renewable','solar','wind','biogas',
    'load factor','capacity factor','utilization factor','roi','irr','roe'
  ]}
};

function _classifyQuestion(text){
  const t = ' ' + String(text).toLowerCase().replace(/\s+/g, ' ') + ' ';
  let best = { chapterId: null, groupKey: null, score: 0 };
  for(const [chId, rule] of Object.entries(SORT_RULES)){
    let score = 0;
    for(const kw of rule.keywords){
      const safe = kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const re = new RegExp(`(^|\\W)${safe}(\\W|$)`, 'gi');
      const m = t.match(re);
      if(m) score += m.length;
    }
    if(score > best.score) best = { chapterId: chId, groupKey: rule.group, score };
  }
  return best.score > 0 ? best : null;
}

function _splitRawTextIntoQuestions(raw){
  if(!raw) return [];
  const cleaned = String(raw)
    .replace(/\r/g, '')
    .replace(/^\s*=====.*=====\s*$/gim, '')
    .replace(/^\s*Page \d+.*$/gim, '')
    .replace(/\n{2,}/g, '\n');
  const lines = cleaned.split('\n').map(l => l.trim()).filter(Boolean);
  const out = [];
  let buf = '';
  const flush = () => { const t = buf.trim(); if(t.length >= 15) out.push(t); buf = ''; };
  for(const line of lines){
    const isStart = /^(\d+[\.\)]|Q\d*[\.\)]|[-•*])\s+\S/.test(line);
    if(isStart){ flush(); buf = line; }
    else if(/^(Section|Chapter|Group|Marks|Note|Section[- ]?[A-Z])\b/i.test(line)){ flush(); }
    else if(buf){ buf += ' ' + line; }
    else { buf = line; }
  }
  flush();
  return out;
}

function _extractMarks(text){
  const m1 = text.match(/\[([\d\.\+ ]+)\]/);
  const m2 = text.match(/\(([\d\.\+ ]+)\)\s*marks?/i);
  const m3 = text.match(/(\d+)\s*marks?/i);
  const raw = (m1 && m1[1]) || (m2 && m2[1]) || (m3 && m3[1]);
  if(!raw) return 10;
  if(raw.includes('+')){
    return Math.round(raw.split('+').reduce((a,b) => a + (parseFloat(b) || 0), 0));
  }
  const n = parseInt(raw, 10);
  return (n >= 1 && n <= 40) ? n : 10;
}

window.SUBJ_SMART = {
  preview(rawText){
    const chunks = _splitRawTextIntoQuestions(rawText);
    return chunks.map((text, idx) => {
      const marks = _extractMarks(text);
      const cleaned = text
        .replace(/\[[^\]]+\]/g, '')
        .replace(/\([^\)]+\)\s*marks?/gi, '')
        .replace(/\d+\s*marks?/gi, '')
        .replace(/^\d+[\.\)]\s*/, '')
        .replace(/^Q\d*[\.\)]\s*/i, '')
        .replace(/^[-•*]\s*/, '')
        .trim();
      const guess = _classifyQuestion(cleaned);
      return {
        idx,
        question: cleaned,
        marks,
        suggestedChapter: guess ? guess.chapterId : null,
        suggestedGroup:   guess ? guess.groupKey  : null,
        confidence:       guess ? guess.score     : 0
      };
    });
  },
  classify: _classifyQuestion,
  split:    _splitRawTextIntoQuestions,
  extractMarks: _extractMarks
};

})();