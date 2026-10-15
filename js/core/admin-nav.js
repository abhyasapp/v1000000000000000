/* ═══════════════════════════════════════════════════════════════════════
   admin-nav.js — the ONE definition of the admin console's navigation. (v1.32)

   The side rail, the page titles and the permission each section needs used
   to be written three separate times in admin.html (rail buttons, UI.TITLES,
   UI.FEATURES). Add or rename a section here and all three follow.

   feature: the permission required to open the section (a list means any one
            of them). Matches the keys the backend returns in ADMIN.can().
   badge:   id of the little count bubble on the rail button.

   Loaded right after the <nav id="rail"> element so the rail exists before the
   page script runs. Classic script, no modules.
   ═══════════════════════════════════════════════════════════════════════ */
(function(){
'use strict';

const GROUPS = [
  { label:'Overview', items:[
    { view:'today',      label:'Today',          icon:'ph-sun-horizon',            feature:'dashboard' },
    { view:'dashboard',  label:'Insights',       icon:'ph-chart-bar',              feature:'dashboard' }
  ]},
  { label:'People', items:[
    { view:'users',      label:'Students',       icon:'ph-users-three',            feature:'users_view' },
    { view:'payments',   label:'Payments',       icon:'ph-credit-card',            feature:'payments_view', badge:'badge-payments' },
    { view:'admins',     label:'Admins',         icon:'ph-shield-check',           feature:'admins_view' }
  ]},
  { label:'Content', items:[
    { view:'weeklysets', label:'Weekly sets',    icon:'ph-calendar-check',         feature:'weeklysets_view' },
    { view:'studydocs',  label:'Study PDFs',     icon:'ph-file-pdf',               feature:'studydocs_view' },
    { view:'subjective', label:'Grading',        icon:'ph-note-pencil',            feature:'subjective_view', badge:'badge-subjective' },
    { view:'qreports',   label:'Reports',        icon:'ph-flag',                   feature:'qreports_view',   badge:'badge-qreports' }
  ]},
  { label:'System', items:[
    { view:'logs',       label:'Activity',       icon:'ph-clock-counter-clockwise',feature:'logs_view' },
    { view:'data',       label:'Data & upkeep',  icon:'ph-database',               feature:['imports', 'maintenance'] },
    { view:'settings',   label:'Settings',       icon:'ph-gear',                   feature:'settings_view' }
  ]}
];

/* This file runs before shared.js exists (it builds the rail at once), so it keeps this one small copy. */
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const ALL = GROUPS.reduce((a, g) => a.concat(g.items), []);
const TITLES = {}, FEATURES = {};
ALL.forEach(it => { TITLES[it.view] = it.label; FEATURES[it.view] = it.feature; });

function itemHtml(it, first){
  /* The rail shows icons only, so the text label is hidden; aria-label gives screen-reader and
     voice-control users the name, and title shows it on hover. */
  return '<button class="rail-item' + (first ? ' active' : '') + '" id="nav-' + esc(it.view) + '" aria-label="' + esc(it.label) + '" title="' + esc(it.label) + '" data-on-click="UI.nav(\'' + esc(it.view) + '\')">' +
    '<i class="ph ' + esc(it.icon) + '"></i><span>' + esc(it.label) + '</span>' +
    (it.badge ? '<span class="rail-badge" id="' + esc(it.badge) + '" hidden>0</span>' : '') + '</button>';
}

function render(){
  const box = document.getElementById('rail-nav');
  if (!box) return;
  let first = true;
  box.innerHTML = GROUPS.map(g =>
    '<div class="rail-group">' + esc(g.label) + '</div>' +
    g.items.map(it => { const h = itemHtml(it, first); first = false; return h; }).join('')
  ).join('');
}

window.ADMIN_NAV = { GROUPS, ALL, TITLES, FEATURES, render, itemHtml };
render();
})();
