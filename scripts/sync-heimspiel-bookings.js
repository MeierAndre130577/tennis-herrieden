#!/usr/bin/env node
// scripts/sync-heimspiel-bookings.js
// Erstellt automatisch Platzbuchungen für alle Heimspiele der Saison.
// Läuft nach jedem BTV-Fetch (GitHub Action) und hält die Buchungen aktuell.

const { createClient } = require("@supabase/supabase-js");

const sb = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const SLOTS = ["08:00","09:00","10:00","11:00","12:00","13:00","14:00","15:00","16:00","17:00","18:00","19:00","20:00"];

// ── System-User anlegen / laden ──────────────────────────────────────────────
async function getOrCreateSystemUser() {
  const { data: existing } = await sb.from("settings")
    .select("value").eq("key","system_user_id").single();
  if (existing?.value) return existing.value;

  const { data: { user }, error } = await sb.auth.admin.createUser({
    email: "system-heimspiel@tennis-herrieden.local",
    password: require("crypto").randomBytes(32).toString("hex"),
    email_confirm: true,
  });
  if (error) throw new Error(`System-User erstellen: ${error.message}`);

  await sb.from("profiles").insert({
    id: user.id,
    name: "Heimspiel",
    role: "member",
    email: user.email,
  });
  await sb.from("settings").upsert(
    { key: "system_user_id", value: user.id },
    { onConflict: "key" }
  );
  console.log(`✓ System-User angelegt: ${user.id}`);
  return user.id;
}

// ── Slots berechnen ──────────────────────────────────────────────────────────
function computeSlots(timeStr, format, applyEarlyOffset) {
  if (!timeStr) return [];
  const [h] = timeStr.split(":").map(Number);
  const duration  = format === "4er" ? 5 : 8;
  const offset    = (format === "6er" && applyEarlyOffset) ? 1 : 0;
  const startHour = h - offset;
  const startSlot = `${String(startHour).padStart(2,"0")}:00`;
  const startIdx  = SLOTS.indexOf(startSlot);
  if (startIdx === -1) return [];
  return SLOTS.slice(startIdx, startIdx + duration);
}

// ── Hauptprogramm ─────────────────────────────────────────────────────────────
(async () => {
  // Daten laden
  const [teamsRes, configRes, courtsRes] = await Promise.all([
    sb.from("settings").select("value").eq("key","btv_club_teams").single(),
    sb.from("settings").select("value").eq("key","btv_teams_config").single(),
    sb.from("courts").select("id,sort_order").order("sort_order"),
  ]);

  let teams, teamsConfig, courts;
  try { teams = JSON.parse(teamsRes.data?.value); } catch(_) {}
  try { teamsConfig = JSON.parse(configRes.data?.value); } catch(_) {}
  courts = courtsRes.data || [];

  if (!teams?.groups?.length) { console.log("Keine BTV-Daten – abgebrochen."); process.exit(0); }
  if (!teamsConfig?.length)   { console.log("Keine Teams-Config – abgebrochen."); process.exit(0); }
  if (!courts.length)         { console.log("Keine Plätze – abgebrochen."); process.exit(0); }

  const systemUserId = await getOrCreateSystemUser();
  const today = new Date().toISOString().slice(0, 10);

  // Config-Map: name → {format, name}  (name ist eindeutig, teamName nicht)
  const cfgMap = {};
  for (const cfg of teamsConfig) {
    if (cfg.name) cfgMap[cfg.name] = cfg;
  }

  // Alle Heimspiele ab heute nach Datum gruppieren
  const gamesByDate = {}; // date → [{label, opponent, time, format, numCourts}]
  for (const grp of teams.groups) {
    const cfg    = cfgMap[grp.name] || {};
    const format = cfg.format || "6er";
    const label  = grp.name || grp.teamName;

    for (const g of grp.homeGames || []) {
      if (!g.date || !g.time) continue;
      if (!gamesByDate[g.date]) gamesByDate[g.date] = [];
      gamesByDate[g.date].push({
        label,
        opponent: (g.opponent || "").replace(/ :$/, "").trim(),
        time: g.time.replace(/\s*Uhr$/i,"").trim(),
        format,
        numCourts: format === "4er" ? 2 : 3,
      });
    }
  }

  if (!Object.keys(gamesByDate).length) {
    console.log("Keine Heimspiele gefunden.");
    process.exit(0);
  }

  // Alle System-Buchungen der Saison löschen (werden komplett neu gesetzt)
  await sb.from("bookings").delete().eq("user_id", systemUserId);
  console.log("Alle bisherigen Heimspiel-Buchungen gelöscht.");

  let totalInserted = 0;

  for (const [date, games] of Object.entries(gamesByDate)) {
    games.sort((a, b) => a.time.localeCompare(b.time));
    const isDoubleDay = games.length > 1;

    // Buchungs-Map: courtId|slot → booking (spätere Spiele überschreiben)
    const bookingMap = {};

    for (let gi = 0; gi < games.length; gi++) {
      const game           = games[gi];
      const applyOffset    = !isDoubleDay || gi === 0; // nur erstes Spiel bekommt -1h
      const slots          = computeSlots(game.time, game.format, applyOffset);
      const gameCourts     = courts.slice(0, game.numCourts);
      const bookingLabel   = `gegen ${game.opponent}`;

      for (const court of gameCourts) {
        for (const slot of slots) {
          bookingMap[`${court.id}|${slot}`] = {
            court_id: court.id,
            user_id:  systemUserId,
            user_name: game.label || "Heimspiel",
            date,
            slot,
            type:       "match",
            label:      bookingLabel,
            with_guest: false,
            guest_fee:  0,
          };
        }
      }
    }

    const newBookings = Object.values(bookingMap);
    if (!newBookings.length) continue;

    // Kollidierende Buchungen löschen (Heimspiel hat immer Priorität)
    for (const bk of newBookings) {
      await sb.from("bookings").delete()
        .eq("date", bk.date)
        .eq("court_id", bk.court_id)
        .eq("slot", bk.slot)
        .neq("user_id", systemUserId);
    }

    const { error } = await sb.from("bookings").insert(newBookings);
    if (error) {
      console.error(`✗ ${date}: ${error.message}`);
    } else {
      console.log(`✓ ${date}: ${newBookings.length} Buchungen (${games.map(g=>g.label).join(" + ")})`);
      totalInserted += newBookings.length;
    }
  }

  console.log(`\nFertig: ${totalInserted} Buchungen für ${Object.keys(gamesByDate).length} Spieltage.`);
})().catch(err => { console.error("FEHLER:", err.message); process.exit(1); });
