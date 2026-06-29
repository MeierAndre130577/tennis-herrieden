// api/calendar.ics.js
// iCal-Kalenderabo für alle Saisonspiele des TC Herrieden
// Abrufbar unter: https://www.tennis-herrieden.de/api/calendar.ics
const { createClient } = require("@supabase/supabase-js");

const sb = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);


function escapeIcs(str) {
  return (str || "").replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
}

// Datum + optionale Uhrzeit → ICS-Timestamp
function toIcsDate(dateStr, timeStr) {
  if (!dateStr) return null;
  if (timeStr) {
    const [h, m] = timeStr.split(":").map(Number);
    const dt = new Date(`${dateStr}T${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}:00`);
    // Lokale Zeit als "floating" (ohne Z) – Kalender interpretiert es als Ortszeit
    const pad = n => String(n).padStart(2,"0");
    return `${dt.getFullYear()}${pad(dt.getMonth()+1)}${pad(dt.getDate())}T${pad(dt.getHours())}${pad(dt.getMinutes())}00`;
  }
  // Nur Datum → ganztägig
  return dateStr.replace(/-/g, "");
}

function toIcsDateEnd(dateStr, timeStr) {
  if (!dateStr) return null;
  if (timeStr) {
    const [h, m] = timeStr.split(":").map(Number);
    const dt = new Date(`${dateStr}T${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}:00`);
    dt.setHours(dt.getHours() + 4); // Spieltag ~4h einplanen
    const pad = n => String(n).padStart(2,"0");
    return `${dt.getFullYear()}${pad(dt.getMonth()+1)}${pad(dt.getDate())}T${pad(dt.getHours())}${pad(dt.getMinutes())}00`;
  }
  // Ganztägig: nächster Tag
  const d = new Date(dateStr + "T12:00:00");
  d.setDate(d.getDate() + 1);
  return `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,"0")}${String(d.getDate()).padStart(2,"0")}`;
}

module.exports = async function handler(req, res) {
  const [teamsRes, ergebRes] = await Promise.all([
    sb.from("settings").select("value").eq("key","btv_club_teams").single(),
    sb.from("settings").select("value").eq("key","btv_club_teams_ergebnisse").single(),
  ]);

  // Ergebnis-Map: team|date → {homeScore, awayScore}
  const ergebnisMap = {};
  try {
    const er = JSON.parse(ergebRes.data?.value);
    (er?.groups || []).forEach(grp => {
      (grp.games || []).forEach(g => {
        if (!g.played || g.homeScore == null) return;
        ergebnisMap[`${grp.name}|${g.date}`] = { homeScore: g.homeScore, awayScore: g.awayScore };
      });
    });
  } catch(_) {}

  // Alle Spiele sammeln
  const events = [];
  try {
    const ct = JSON.parse(teamsRes.data?.value);
    (ct?.groups || []).forEach(grp => {
      const teamName = grp.name || grp.teamName;

      const process = (game, isHome) => {
        if (!game.date) return;
        const score = ergebnisMap[`${teamName}|${game.date}`];
        const played = score != null;
        const opponent = (game.opponent || "").replace(/ :$/, "").trim();

        // Emoji: Heim/Auswärts + Ergebnis
        let emoji = isHome ? "🏠" : "✈️";
        if (played) {
          const won = score.homeScore > score.awayScore;
          const lost = score.homeScore < score.awayScore;
          emoji = won ? "✅" : lost ? "❌" : "🤝";
        }

        const sep = isHome ? "vs." : "@";
        const summary = `${emoji} ${teamName} ${sep} ${opponent}`;

        // Beschreibung
        let desc = isHome ? "Heimspiel" : "Auswärtsspiel";
        if (game.time) desc += ` · ${game.time} Uhr`;
        if (played) {
          desc += `\nErgebnis: ${score.homeScore}:${score.awayScore}`;
          if (score.homeScore > score.awayScore) desc += " 🏆 Sieg";
          else if (score.homeScore < score.awayScore) desc += " 😔 Niederlage";
          else desc += " 🤝 Unentschieden";
        }
        if (grp.groupId) {
          desc += `\nhttps://www.btv.de/de/spielbetrieb/tabelle-spielplan.html?groupid=${grp.groupId}`;
        }

        const dtStart = toIcsDate(game.date, game.time);
        const dtEnd   = toIcsDateEnd(game.date, game.time);
        if (!dtStart || !dtEnd) return;

        const isAllDay = !game.time;
        const uid = `tcherrieden-${teamName.replace(/\s+/g,"-")}-${game.date}-${isHome?"H":"A"}@tennis-herrieden.de`;

        events.push({ uid, summary, desc, dtStart, dtEnd, isAllDay });
      };

      (grp.homeGames || []).forEach(g => process(g, true));
      (grp.awayGames || []).forEach(g => process(g, false));
    });
  } catch(_) {}

  // ICS bauen
  const now = new Date();
  const pad  = n => String(n).padStart(2,"0");
  const dtstamp = `${now.getUTCFullYear()}${pad(now.getUTCMonth()+1)}${pad(now.getUTCDate())}T${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}Z`;

  const veventLines = events.map(e => {
    const lines = [
      "BEGIN:VEVENT",
      `UID:${e.uid}`,
      `DTSTAMP:${dtstamp}`,
      `SUMMARY:${escapeIcs(e.summary)}`,
      `DESCRIPTION:${escapeIcs(e.desc)}`,
    ];
    if (e.isAllDay) {
      lines.push(`DTSTART;VALUE=DATE:${e.dtStart}`);
      lines.push(`DTEND;VALUE=DATE:${e.dtEnd}`);
    } else {
      lines.push(`DTSTART:${e.dtStart}`);
      lines.push(`DTEND:${e.dtEnd}`);
    }
    lines.push("END:VEVENT");
    return lines.join("\r\n");
  }).join("\r\n");

  const ics = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//TC Herrieden//Spielplan//DE",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:Tennis Herrieden Spielplan",
    "X-WR-CALDESC:Alle Saisonspiele des Tennis Herrieden",
    "X-APPLE-CALENDAR-COLOR:#22C55E",
    "X-WR-TIMEZONE:Europe/Berlin",
    veventLines,
    "END:VCALENDAR",
  ].join("\r\n");

  res.setHeader("Content-Type", "text/calendar; charset=utf-8");
  res.setHeader("Content-Disposition", "inline; filename=tc-herrieden.ics");
  res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.status(200).send(ics);
};
