/* ═══════════════════════════════════════════════════════════════════════
   DISPLAY-PREFS.JS (v1.33): font size, high contrast, AMOLED black

   Stored on this device only (abhyas_display). Applied as attributes on <html>, so the CSS in user.html does the
   work. A tiny copy of apply() also runs in <head> so the page never flashes the wrong size or contrast.
   Pure rules are exposed as DISPLAY_RULES for the tests.
   ═══════════════════════════════════════════════════════════════════════ */
(function () {
'use strict';
const KEY = 'abhyas_display';
const SIZES = ['small', 'medium', 'large'];
const DEFAULTS = { fs: 'medium', hc: false, amoled: false };

/* Pure: turn whatever was stored into a clean preferences object. */
function cleanPrefs(raw) {
  const o = (raw && typeof raw === 'object' && !Array.isArray(raw)) ? raw : {};
  return { fs: SIZES.indexOf(o.fs) !== -1 ? o.fs : DEFAULTS.fs, hc: o.hc === true, amoled: o.amoled === true };
}
window.DISPLAY_RULES = { cleanPrefs, SIZES, DEFAULTS };

const DISPLAY = {
  load() { try { return cleanPrefs(JSON.parse(localStorage.getItem(KEY) || 'null')); } catch (e) { return cleanPrefs(null); } },
  save(p) { try { localStorage.setItem(KEY, JSON.stringify(p)); } catch (e) { /* ignore */ } },
  apply(p) {
    p = cleanPrefs(p || this.load());
    const h = document.documentElement;
    h.setAttribute('data-fs', p.fs);
    if (p.hc) h.setAttribute('data-hc', '1'); else h.removeAttribute('data-hc');
    if (p.amoled) h.setAttribute('data-amoled', '1'); else h.removeAttribute('data-amoled');
  },
  set(patch) { const p = Object.assign(this.load(), patch || {}); this.save(cleanPrefs(p)); this.apply(); this.render(); },
  reset() { this.save(cleanPrefs(null)); this.apply(); this.render(); },
  render() {
    const el = document.getElementById('display-card-body');
    if (!el) return;
    const p = this.load();
    const seg = SIZES.map(s => '<button type="button" class="seg-btn' + (p.fs === s ? ' on' : '') + '" aria-pressed="' + (p.fs === s) + '" data-on-click="DISPLAY.set({fs:\'' + s + '\'})">' + s.charAt(0).toUpperCase() + s.slice(1) + '</button>').join('');
    const sw = (id, on, label, help, patch) =>
      '<label class="pr-opt" for="' + id + '"><input type="checkbox" id="' + id + '"' + (on ? ' checked' : '') + ' data-on-change="DISPLAY.set(' + patch + ')"><span><b>' + label + '</b><span class="t-foot" style="display:block">' + help + '</span></span></label>';
    el.innerHTML =
      '<div class="t-foot" style="margin-bottom:var(--sp-1)"><b>Text size</b></div>' +
      '<div class="seg" role="group" aria-label="Text size" style="margin-bottom:var(--sp-3)">' + seg + '</div>' +
      '<div class="pr-list">' +
      sw('dp-hc', p.hc, 'High contrast', 'Darker text, stronger borders and focus rings. Easier on low vision.', '{hc:this.checked}') +
      sw('dp-am', p.amoled, 'AMOLED black', 'Pure black background in dark mode. Saves battery on OLED screens.', '{amoled:this.checked}') +
      '</div>' +
      '<div class="bg" style="margin-top:var(--sp-3)"><button type="button" class="btn btn-quiet btn-sm" data-on-click="DISPLAY.reset()">Reset to default</button></div>';
  }
};
window.DISPLAY = DISPLAY;
DISPLAY.apply();
document.addEventListener('DOMContentLoaded', function () { DISPLAY.render(); });
/* paint again when the Data screen opens (the card is only visible there) */
try {
  if (typeof UI !== 'undefined' && UI.go && !UI.go._displayWrapped) {
    const go = UI.go.bind(UI);
    UI.go = function (v) { const r = go.apply(null, arguments); if (v === 'data') { try { DISPLAY.render(); } catch (e) { /* ignore */ } } return r; };
    UI.go._displayWrapped = true;
  }
} catch (e) { /* ignore */ }
})();
