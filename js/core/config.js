/* ═══════════════════════════════════════════════════════════════════════
   CONFIG.JS — single source of truth for the deployed Apps Script
   backend URL.
   ═══════════════════════════════════════════════════════════════════════ */
const ABHYAS_CONFIG = Object.freeze({
  GAS_URL: "https://script.google.com/macros/s/AKfycbyZLZxf6VKNiMfhY6memPTKj-dGW7jxyX1c-9GI0OPG8TqazSZi_P-7Y-8DlpT0ZlrjHg/exec",
  /* Objective question files are fetched from this CDN FIRST (jsDelivr mirror of the GitHub content repo), because it is
     much faster than Apps Script. Anything the CDN cannot give (not mirrored, timeout, offline) falls back to Apps Script,
     which checks login and payment. NOTE: files on a public mirror can be downloaded by anyone. Set to "" to serve every
     question through Apps Script only (slower, but the payment check then protects all files). */
  CONTENT_CDN_BASE: "https://cdn.jsdelivr.net/gh/abhyasapp/content@main",
  GOOGLE_CLIENT_ID: "242226857075-hpkbjoqhlem95fu6vkf712e8ijs33sng.apps.googleusercontent.com"
});
window.ABHYAS_CONFIG = ABHYAS_CONFIG;
