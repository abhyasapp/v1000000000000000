/* ═══════════════════════════════════════════════════════════════════════
   nav.js — the ONE definition of the student app's navigation.   (v1.32)

   Before this file the same screens were described in four places that had
   drifted apart: the sidebar markup, the bottom-nav sheets (SECTIONS), the
   view-to-tab map, and each page's own header. Hourly challenge was missing
   from the phone menu and the heatmap from every menu.

   Now:  sidebar, phone sheets, active-tab mapping and page headers are all
   generated from NAV.groups below.  To add a screen, add ONE entry here.

   Loaded before app.js on user.html; renders the sidebar immediately so the
   badge/hint elements (#wrc, #bkc, #weekly-hint ...) exist before app code
   updates them. Classic script, no modules.
   ═══════════════════════════════════════════════════════════════════════ */
(function(){
'use strict';

/* Page header text per view (icon, title, one-line help). Titles here are the
   same words the sidebar and the phone sheets show. */
const HEADS = {
 "studydocs": { "icon": "ph-file-pdf", "label": "Model answers & notes", "text": "PDFs your teacher added: model answers for written questions, notes and past papers. Opened ones work offline." },
 "weekly": {
  "icon": "ph-calendar-check",
  "label": "Weekly test",
  "text": "A new set unlocks on schedule and stays open for a limited window. You get one attempt; after that you can review your answers."
 },
 "hourly": {
  "icon": "ph-clock-countdown",
  "label": "Hourly challenge",
  "text": "A fresh written question and a 50-question sprint, reset at the top of every hour. Pick your level to begin."
 },
 "subj-qotd": {
  "icon": "ph-sun-horizon",
  "label": "Question of the day",
  "text": "Everyone gets the same question. Write it on paper against the clock, then photograph your answer and upload it as one PDF."
 },
 "subj-mine": {
  "icon": "ph-file-text",
  "label": "My submissions",
  "text": "Everything you've sent for marking — with the PDF you uploaded, the score once it's marked, and any note from the marker."
 },
 "subj-exam": {
  "icon": "ph-note-pencil",
  "label": "Full paper",
  "text": "A complete 100-mark paper, three hours, uploaded as a single PDF when you're done."
 },
 "subj-list": {
  "icon": "ph-list-dashes",
  "label": "Browse questions",
  "text": "Every written question in the bank, grouped by chapter and topic."
 },
 "online": {
  "icon": "ph-books",
  "label": "Chapters",
  "text": "Pick a chapter, then a set of questions. Anything you open is saved to this device for offline study."
 },
 "local": {
  "icon": "ph-folder-open",
  "label": "Open a file",
  "text": "Load a question bank saved on this device. Works with no connection at all."
 },
 "psycho": {
  "icon": "ph-lightning",
  "label": "Mixed practice",
  "text": "Draw from several chapters at once — closer to what the real paper feels like."
 },
 "bookmarks": {
  "icon": "ph-star",
  "label": "Saved",
  "text": "Questions you starred to come back to."
 },
 "wrong": {
  "icon": "ph-target",
  "label": "Weak spots",
  "text": "Your missed questions, grouped four ways. Due now is the default — nothing else needs your attention today."
 },
 "progress": {
  "icon": "ph-chart-bar",
  "label": "Your progress",
  "text": "Where you stand, how you are trending, and which chapters need work."
 },
 "offline": {
  "icon": "ph-download-simple",
  "label": "Downloads",
  "text": "Save question sets to this device so they open during load-shedding or with no signal."
 },
 "data": {
  "icon": "ph-floppy-disk",
  "label": "Data & backup",
  "text": "Sync and back up your progress, manage storage, display and reset."
 },
 "timetable": {
  "icon": "ph-calendar-blank",
  "label": "Study plan",
  "text": "Block out when you'll study, and get a nudge just before each session."
 }
};

/* kind:'count'  -> numeric badge, id kept so HOME.updateBadges() can fill it
   kind:'hint'   -> second line under the label (filled by SB_HINTS / WEEKLY) */
const GROUPS = [
  { key:'practice', label:'Practice', tab:'study', items:[
    { view:'online',  sub:'Work through a subtopic' },
    { view:'psycho',  sub:'Several chapters at once' },
    { view:'hourly',  sub:"This hour's set",     hint:{ id:'hourly-hint', text:"This hour's set" }, badge:{ id:'hourly-badge', cls:'amb', text:'New',  hidden:true } },
    { view:'weekly',  sub:'One graded attempt',  hint:{ id:'weekly-hint', text:'No sets yet' },      badge:{ id:'weekly-badge', cls:'amb', text:'Live', hidden:true } }
  ]},
  { key:'written', label:'Written answers', tab:'subjective', items:[
    { view:'subj-qotd', sub:'Timed write, then upload',      hint:{ id:'subj-qotd-hint', text:'Tap to begin' },           badge:{ id:'subj-qotd-badge', cls:'amb', text:'New', hidden:true } },
    { view:'subj-exam', sub:'100 marks, three hours' },
    { view:'subj-list', sub:'The whole written bank' },
    { view:'studydocs', sub:'PDFs from your teacher', count:{ id:'sdc', cls:'ok', hidden:true } },
    { view:'subj-mine', sub:'What you sent, and your score', hint:{ id:'subj-mine-hint', text:'Nothing submitted yet' }, badge:{ id:'subj-mine-badge', cls:'', text:'0', hidden:true } }
  ]},
  { key:'review', label:'Review & progress', tab:'progress', items:[
    { view:'wrong',     label:'Weak spots', icon:'ph-target', sub:'What to work on next', count:{ id:'wrc', cls:'' } },
    { view:'bookmarks', sub:'Starred for later', count:{ id:'bkc', cls:'ok' } },
    { view:'progress',  sub:'Where you stand and trends' },
    { view:'timetable', sub:'When you plan to study' }
  ]},
  { key:'tools', label:'More', tab:'more', items:[
    { view:'offline', sub:'Save sets for offline' },
    { view:'local',   sub:'A question bank you have' },
    { view:'data',    sub:'Export or restore a file' },
    { view:'tutorial', label:'How this works', icon:'ph-question', sub:'A short tour', special:'tutorial' }
  ]}
];

/* Phone bottom bar: one tab per `tab` value, plus Home. */
const TABS = {
  study:      { title:'Practice',          icon:'ph-books' },
  subjective: { title:'Written answers',   icon:'ph-note-pencil' },
  progress:   { title:'Review & progress', icon:'ph-chart-bar' },
  more:       { title:'More',              icon:'ph-dots-three' }
};

const HOME = { view:'home', label:'Home', icon:'ph-house' };

const esc = s => window.esc(s);   /* the one escaper in shared.js, loaded before this file */

/* Fill in label/icon from HEADS so each screen's words live in one place. */
GROUPS.forEach(g => g.items.forEach(it => {
  const h = HEADS[it.view] || {};
  it.label = it.label || h.label || it.view;
  it.icon  = it.icon  || h.icon  || 'ph-circle';
}));

const ALL = GROUPS.reduce((a, g) => a.concat(g.items.map(it => Object.assign({ group: g.key, tab: g.tab }, it))), []);

function itemHtml(it){
  const go = it.special === 'tutorial' ? 'TUTORIAL.open()' : "UI.go('" + it.view + "')";
  const ic = '<span class="sb-ic"><i class="ph ' + esc(it.icon) + '"></i></span>';
  const open = '<button type="button" class="sb-item" id="nav-' + esc(it.view) + '" data-on-click="' + go + '">';
  if (it.hint) {
    const b = it.badge ? '<span class="sb-badge ' + esc(it.badge.cls) + '" id="' + esc(it.badge.id) + '"' + (it.badge.hidden ? ' hidden' : '') + '>' + esc(it.badge.text) + '</span>' : '';
    return open + ic + '<span class="grow"><span style="display:flex;align-items:center;gap:.35rem">' + esc(it.label) + b +
      '</span><span class="sb-sub" id="' + esc(it.hint.id) + '">' + esc(it.hint.text) + '</span></span></button>';
  }
  const c = it.count ? '<span class="sb-badge ' + esc(it.count.cls) + '" id="' + esc(it.count.id) + '"' + (it.count.hidden ? ' hidden' : '') + '>0</span>' : '';
  return open + ic + esc(it.label) + c + '</button>';
}

/* Collapsed state is remembered per group. First run: Practice and Review & progress open, Written answers and More
   closed (a dot on a closed group means something new is inside). The group holding the current screen always opens. */
const COLLAPSE_KEY = 'abhyas_sb_collapsed';
function loadCollapsed(){
  try { const raw = localStorage.getItem(COLLAPSE_KEY); if (raw) { const o = JSON.parse(raw); if (o && typeof o === 'object') return o; } } catch(e){}
  return { written:true, tools:true };
}
function saveCollapsed(o){ try { localStorage.setItem(COLLAPSE_KEY, JSON.stringify(o)); } catch(e){} }

function renderSidebar(){
  const box = document.getElementById('sb-nav');
  if (!box) return;
  const collapsed = loadCollapsed();
  const homeBtn = '<div class="sb-sec"><button type="button" class="sb-item active" id="nav-home" data-on-click="UI.go(\'home\')">' +
    '<span class="sb-ic"><i class="ph ' + HOME.icon + '"></i></span>' + HOME.label + '</button></div>';
  box.innerHTML = homeBtn + GROUPS.map(g => {
    const shut = !!collapsed[g.key];
    return '<div class="sb-sec' + (shut ? ' shut' : '') + '" data-group="' + esc(g.key) + '">' +
      '<button type="button" class="sb-lbl sb-lbl-btn" aria-expanded="' + (!shut) + '" data-on-click="NAV.toggle(\'' + esc(g.key) + '\')">' +
        '<span>' + esc(g.label) + '</span><i class="ph ph-caret-down sb-caret" aria-hidden="true"></i></button>' +
      '<div class="sb-items">' + g.items.map(itemHtml).join('') + '</div></div>';
  }).join('');
}

function toggle(key){
  const sec = document.querySelector('#sb-nav .sb-sec[data-group="' + key + '"]');
  if (!sec) return;
  const shut = !sec.classList.contains('shut');
  sec.classList.toggle('shut', shut);
  const b = sec.querySelector('.sb-lbl-btn'); if (b) b.setAttribute('aria-expanded', String(!shut));
  const c = loadCollapsed(); c[key] = shut; saveCollapsed(c);
}

/* Called by UI.go: make sure the group that owns this screen is open. */
function reveal(view){
  const it = ALL.find(x => x.view === view);
  if (!it) return;
  const sec = document.querySelector('#sb-nav .sb-sec[data-group="' + it.group + '"]');
  if (sec && sec.classList.contains('shut')) toggle(it.group);
}

function renderHeads(root){
  (root || document).querySelectorAll('.pg-head[data-head]').forEach(el => {
    const h = HEADS[el.getAttribute('data-head')];
    if (!h) return;
    /* HEADS is trusted, repo-authored text (the one entry with markup is the missed-count span). */
    el.innerHTML = '<h2><i class="ph ' + esc(h.icon) + '"></i> ' + esc(h.label) + '</h2><p>' + h.text + '</p>';
  });
}

/* Phone sheet for one tab: sections (only labelled when a tab has several). */
function sheet(tab){
  const t = TABS[tab];
  if (!t) return null;
  const gs = GROUPS.filter(g => g.tab === tab);
  return { title:t.title, icon:t.icon, sections: gs.map(g => ({ label: gs.length > 1 ? g.label : '', items: g.items })) };
}

const VIEW_TAB = { home:'bn-home' };
ALL.forEach(it => { if (it.view !== 'tutorial') VIEW_TAB[it.view] = 'bn-' + (it.tab === 'study' ? 'study' : it.tab); });

window.NAV = { HEADS, GROUPS, TABS, ALL, VIEW_TAB, renderSidebar, renderHeads, sheet, itemHtml, toggle, reveal,
  tabForView: v => VIEW_TAB[v] || '' };

renderSidebar();
renderHeads();
})();