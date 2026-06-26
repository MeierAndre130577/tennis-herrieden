#!/usr/bin/env node
// scripts/create-wochenrueckblick.js
// Erstellt jeden Dienstag einen Wochenrückblick-Post in news_items
// für die abgelaufene Spielwoche. Rückwirkend für alle vergangenen KWs.

const { createClient } = require("@supabase/supabase-js");

const sb = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const DE_MONTHS = ["Jan","Feb","Mär","Apr","Mai","Jun","Jul","Aug","Sep","Okt","Nov","Dez"];

function getISOWeek(dateStr) {
  const d = new Date(Date.UTC(...dateStr.split("-").map((v,i) => i===1 ? +v-1 : +v)));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const y0 = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return { kw: Math.ceil(((d - y0) / 86400000 + 1) / 7), kwy: d.getUTCFullYear() };
}

function getMondayOfKW(kwy, kw) {
  const jan4 = new Date(Date.UTC(kwy, 0, 4));
  const dow = jan4.getUTCDay() || 7;
  const monday = new Date(jan4);
  monday.setUTCDate(jan4.getUTCDate() - dow + 1 + (kw - 1) * 7);
  return monday;
}

function getTuesdayOfKW(kwy, kw) {
  const mon = getMondayOfKW(kwy, kw);
  mon.setUTCDate(mon.getUTCDate() + 1);
  mon.setUTCHours(6, 0, 0, 0); // 06:00 UTC = 08:00 MESZ
  return mon;
}

function kwDateRange(kwy, kw) {
  const mon = getMondayOfKW(kwy, kw);
  const sun = new Date(mon);
  sun.setUTCDate(mon.getUTCDate() + 6);
  const fmt = d => `${d.getUTCDate()}. ${DE_MONTHS[d.getUTCMonth()]}`;
  return `${fmt(mon)} – ${fmt(sun)}`;
}

(async () => {
  // Ergebnisse laden
  const { data: raw } = await sb.from("settings")
    .select("value").eq("key","btv_club_teams_ergebnisse").single();
  let ergebnisse;
  try { ergebnisse = JSON.parse(raw?.value); } catch(_) { ergebnisse = null; }

  if (!ergebnisse?.groups?.length) {
    console.log("Keine Ergebnisse in btv_club_teams_ergebnisse.");
    process.exit(0);
  }

  // Bestehende Rückblick-Posts laden
  const { data: existing } = await sb.from("news_items")
    .select("team_name")
    .eq("age_group","wochenrueckblick");
  const existingKeys = new Set((existing || []).map(r => r.team_name));

  // Alle gespielten Spiele nach KW gruppieren
  const byKW = {};
  for (const grp of ergebnisse.groups) {
    const teamName = grp.name || grp.teamName;
    for (const g of grp.games || []) {
      if (!g.played || !g.date || g.homeScore == null) continue;
      const { kw, kwy } = getISOWeek(g.date);
      const key = `WOCHENRUECKBLICK-${kwy}-${String(kw).padStart(2,"0")}`;
      if (!byKW[key]) byKW[key] = { kw, kwy, games: [] };
      byKW[key].games.push({
        team: teamName,
        opponent: (g.opponent || "").replace(/ :$/, "").trim(),
        isHome: g.isHome,
        homeScore: g.homeScore,
        awayScore: g.awayScore,
        date: g.date,
      });
    }
  }

  // Aktuelle KW bestimmen – nicht posten was noch nicht abgeschlossen ist
  const todayStr = new Date().toISOString().slice(0,10);
  const { kw: curKW, kwy: curKWY } = getISOWeek(todayStr);

  let created = 0;
  let skipped = 0;

  for (const [key, week] of Object.entries(byKW)) {
    // Aktuelle und zukünftige KW überspringen
    if (week.kwy > curKWY) { skipped++; continue; }
    if (week.kwy === curKWY && week.kw >= curKW) { skipped++; continue; }

    // Bereits vorhanden?
    if (existingKeys.has(key)) {
      console.log(`✓ ${key} bereits vorhanden`);
      continue;
    }

    // Spiele nach Datum sortieren
    week.games.sort((a,b) => a.date.localeCompare(b.date));

    const wins   = week.games.filter(g => g.homeScore > g.awayScore).length;
    const losses = week.games.filter(g => g.homeScore < g.awayScore).length;
    const draws  = week.games.filter(g => g.homeScore === g.awayScore).length;

    const dateRange = kwDateRange(week.kwy, week.kw);
    const tuesday   = getTuesdayOfKW(week.kwy, week.kw);

    let summary = `${dateRange} · ${week.games.length} ${week.games.length===1?"Spiel":"Spiele"}`;
    if (wins)   summary += ` · ${wins} ${wins===1?"Sieg":"Siege"}`;
    if (draws)  summary += ` · ${draws} Unentschieden`;
    if (losses) summary += ` · ${losses} ${losses===1?"Niederlage":"Niederlagen"}`;

    const { error } = await sb.from("news_items").insert({
      type:         "match_result",
      title:        `Rückblick KW ${week.kw}`,
      summary,
      content:      JSON.stringify(week.games),
      age_group:    "wochenrueckblick",
      team_name:    key,
      published_at: tuesday.toISOString(),
      status:       "published",
    });

    if (error) {
      console.error(`✗ ${key}: ${error.message}`);
    } else {
      console.log(`✓ ${key} erstellt (${tuesday.toISOString().slice(0,10)}) · ${week.games.length} Spiele · ${wins} Siege`);
      created++;
    }
  }

  console.log(`\nFertig: ${created} erstellt, ${skipped} übersprungen.`);
})().catch(err => { console.error("FEHLER:", err.message); process.exit(1); });
