// api/events.ics.js
// iCal-Kalenderabo für Clubstream-Termine (type = "event")
// Abrufbar unter: https://www.tennis-herrieden.de/api/events.ics
const { createClient } = require("@supabase/supabase-js");

const sb = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

function escapeIcs(str) {
  return (str || "").replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
}

// Konvertiert UTC-Timestamp → Europe/Berlin Lokalzeit als floating ICS-String
function toIcsDatetime(isoStr) {
  if (!isoStr) return null;
  const d = new Date(isoStr);
  if (isNaN(d)) return null;
  const berlin = new Intl.DateTimeFormat("sv", {
    timeZone: "Europe/Berlin",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).format(d); // "2026-08-01 10:00:00"
  return berlin.replace(/[-: ]/g, "").replace(/(\d{8})(\d{6})/, "$1T$2");
}

function toIcsDate(isoStr) {
  if (!isoStr) return null;
  const d = new Date(isoStr);
  if (isNaN(d)) return null;
  const berlin = new Intl.DateTimeFormat("sv", {
    timeZone: "Europe/Berlin",
    year: "numeric", month: "2-digit", day: "2-digit",
  }).format(d); // "2026-08-01"
  return berlin.replace(/-/g, "");
}

module.exports = async function handler(req, res) {
  const { data: items, error } = await sb
    .from("news_items")
    .select("id,title,summary,event_start,event_end,event_location")
    .eq("type", "event")
    .eq("status", "published")
    .is("deleted_at", null)
    .not("event_start", "is", null)
    .order("event_start");

  if (error) {
    res.status(500).send("Fehler beim Laden der Termine");
    return;
  }

  const now = new Date();
  const pad = n => String(n).padStart(2, "0");
  const dtstamp = `${now.getUTCFullYear()}${pad(now.getUTCMonth()+1)}${pad(now.getUTCDate())}T${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}Z`;

  const vevents = (items || []).map(item => {
    const hasTime = item.event_start && item.event_start.includes("T");
    const dtStart = hasTime ? toIcsDatetime(item.event_start) : toIcsDate(item.event_start);
    if (!dtStart) return null;

    let dtEnd;
    if (item.event_end) {
      dtEnd = hasTime ? toIcsDatetime(item.event_end) : toIcsDate(item.event_end);
    } else if (hasTime) {
      // Kein Endzeit → 2h Dauer
      const d = new Date(item.event_start);
      d.setHours(d.getHours() + 2);
      dtEnd = toIcsDatetime(d.toISOString());
    } else {
      // Ganztägig ohne Ende → gleicher Tag
      dtEnd = toIcsDate(item.event_start);
    }

    const lines = [
      "BEGIN:VEVENT",
      `UID:tcherrieden-event-${item.id}@tennis-herrieden.de`,
      `DTSTAMP:${dtstamp}`,
      `SUMMARY:🗓 ${escapeIcs(item.title)}`,
    ];

    if (hasTime) {
      lines.push(`DTSTART;TZID=Europe/Berlin:${dtStart}`);
      lines.push(`DTEND;TZID=Europe/Berlin:${dtEnd}`);
    } else {
      lines.push(`DTSTART;VALUE=DATE:${dtStart}`);
      lines.push(`DTEND;VALUE=DATE:${dtEnd}`);
    }

    if (item.event_location) {
      lines.push(`LOCATION:${escapeIcs(item.event_location)}`);
    }
    if (item.summary) {
      lines.push(`DESCRIPTION:${escapeIcs(item.summary)}`);
    }

    lines.push("END:VEVENT");
    return lines.join("\r\n");
  }).filter(Boolean).join("\r\n");

  const ics = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Tennis Herrieden//Clubstream Termine//DE",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:Tennis Herrieden Termine",
    "X-WR-CALDESC:Vereinstermine des Tennis Herrieden",
    "X-APPLE-CALENDAR-COLOR:#8B5CF6",
    "X-WR-TIMEZONE:Europe/Berlin",
    vevents,
    "END:VCALENDAR",
  ].join("\r\n");

  res.setHeader("Content-Type", "text/calendar; charset=utf-8");
  res.setHeader("Content-Disposition", "inline; filename=tennis-herrieden-termine.ics");
  res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.status(200).send(ics);
};
