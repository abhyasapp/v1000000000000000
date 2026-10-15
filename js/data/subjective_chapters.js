/* ═══════════════════════════════════════════════════════════════════════
   SUBJECTIVE_CHAPTERS.JS — Subjective syllabus (Loksewa L7 CE).
   Plain global; loaded via <script src> before subjective.js on both
   user.html and admin.html.

   Exposes:
     window.SUBJECTIVE_CHAPTERS  — array of { id, group, name, icon, topics[] }
     window.SUBJECTIVE_GROUPS    — { A/B/C/D → { name, marks, chapterIds[] } }
     window.SUBJECTIVE_TIMERS    — marks → solve-seconds defaults
   ═══════════════════════════════════════════════════════════════════════ */
window.SUBJECTIVE_CHAPTERS = [
  { id: "structure", group: "A", name: "Structure", icon: "🏗️", topics: [
      "Reinforced Concrete Structures", "Steel and Timber Structures",
      "Earthquake Resistant Building", "Mandatory Rule of Thumb",
      "Structural Design of Bridge" ] },
  { id: "geotech", group: "A", name: "Geotechnical Engineering", icon: "⛰️", topics: [
      "Soil Mechanics", "Foundation Engineering",
      "Site Investigation & Soil Exploration" ] },
  { id: "irrigationAndCo", group: "B", name: "Water Resource / Irrigation", icon: "💧", topics: [
      "Hydrology and Sediment", "Hydraulics", "Irrigation", "Hydropower" ] },
  { id: "transportAndCo", group: "C", name: "Transportation Engineering", icon: "🛣️", topics: [
      "Highway Engineering", "Airport Engineering" ] },
  { id: "publicHealth", group: "D", name: "Public Health Engineering", icon: "🚰", topics: [
      "Water Supply", "Sanitation / Sewerage", "Environment" ] },
  { id: "miscellaneous", group: "D", name: "Miscellaneous / General", icon: "📚", topics: [
      "Project Management", "Quantity Surveying", "Ethics & Codes" ] }
];

window.SUBJECTIVE_GROUPS = {
  A: { name: "Group A — Structure + Geotech",  marks: 30, chapterIds: ["structure","geotech"] },
  B: { name: "Group B — Water Resource",       marks: 25, chapterIds: ["irrigationAndCo"] },
  C: { name: "Group C — Transportation",       marks: 25, chapterIds: ["transportAndCo"] },
  D: { name: "Group D — Public Health & Misc", marks: 20, chapterIds: ["publicHealth","miscellaneous"] }
};

window.SUBJECTIVE_TIMERS = {
  solveSeconds: { 5: 10*60, 10: 20*60, default: 15*60 },
  uploadSeconds: 5*60
};