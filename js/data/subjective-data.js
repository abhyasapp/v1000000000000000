/* ═══════════════════════════════════════════════════════════════════════
   SUBJECTIVE-DATA.JS — Drive fileIds for subjective question banks.

   ONE file per chapter (not per topic). File shape:
     { "group": "...", "sections": [
         { "section": "...", "questions": [
             { "type":"subjective", "chapter":"...", "q":"...", "marks":"..." }
         ] }
     ] }

   `marks` may be a number (5, 10) or a string like "5+5=10" or
   "3+3.5+3.5=10". subjective.js's _parseMarks() reads the total.

   Exposes:
     window.SUBJECTIVE_DATA       — { [chapterId]: { name, group, icon, fileId } }
     window.SUBJECTIVE_FILE_INDEX — fileId → chapter meta
     window.SUBJECTIVE_FILE_REFS  — [{ chapterId, name, group, icon, fileId }]
   ═══════════════════════════════════════════════════════════════════════ */
window.SUBJECTIVE_DATA = {
  structure: {
    name: "Structure",
    group: "A",
    icon: "🏗️",
    fileId: "1M_gf06-_oWoHU6X1nro1uYUyEHadfo8f"
  },
  geotech: {
    name: "Geotechnical Engineering",
    group: "A",
    icon: "⛰️",
    fileId: "1Jz0mRSRN9EYgBUKkVpXYzwvSEIfCuVOU"
  },
  irrigationAndCo: {
    name: "Water Resource / Irrigation",
    group: "B",
    icon: "💧",
    // ⚠️ This Drive file currently contains Geotechnical content.
    //    Replace its contents in Drive (Manage versions → Upload new
    //    version) so this fileId stays valid. If you upload a NEW file
    //    instead, swap the ID here.
    fileId: "1EBzA8mMf4JDO6FHlzGxCeDm4VExMVFXZ"
  },
  transportAndCo: {
    name: "Transportation Engineering",
    group: "C",
    icon: "🛣️",
    fileId: "1ExPxsek82lNZY-Xe3NG4-RRlKlo0fD8F"
  },
  publicHealth: {
    name: "Public Health Engineering",
    group: "D",
    icon: "🚰",
    fileId: "149YRTk28P7-Wa-ECCbBp83dzGH2zfdFA"
  },
  miscellaneous: {
    name: "Miscellaneous / General",
    group: "D",
    icon: "📚",
    fileId: "1_zVE-YGJjqwXBZJ8NJuZANWwnFwlp5hB"
  }
};

window.SUBJECTIVE_FILE_INDEX = (function(){
  const idx = {};
  Object.entries(window.SUBJECTIVE_DATA).forEach(([chId, ch]) => {
    if (ch.fileId && !/^REPLACE_WITH/.test(ch.fileId)) {
      idx[ch.fileId] = { chapterId: chId, name: ch.name, group: ch.group, icon: ch.icon };
    }
  });
  return idx;
})();

window.SUBJECTIVE_FILE_REFS = Object.entries(window.SUBJECTIVE_DATA)
  .filter(([_, ch]) => ch.fileId && !/^REPLACE_WITH/.test(ch.fileId))
  .map(([chapterId, ch]) => ({
    chapterId,
    name: ch.name,
    group: ch.group,
    icon: ch.icon,
    fileId: ch.fileId
  }));