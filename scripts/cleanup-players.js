#!/usr/bin/env node
// Einmalig ausführen: entfernt alte plain-key Einträge aus btv_players.teams
// Plain keys: "SG Herrieden"  →  composite keys: "2165710:SG Herrieden"

const { createClient } = require("@supabase/supabase-js");

const sb = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

async function main() {
  const { data, error } = await sb.from("settings").select("value").eq("key", "btv_players").single();
  if (error || !data?.value) { console.log("Kein btv_players Eintrag gefunden."); process.exit(1); }

  const parsed = JSON.parse(data.value);
  const teams = parsed.teams || {};

  const before = Object.keys(teams).length;
  const cleaned = Object.fromEntries(
    Object.entries(teams).filter(([k]) => k.includes(":"))
  );
  const after = Object.keys(cleaned).length;

  console.log(`Einträge vorher: ${before}`);
  console.log(`Einträge nachher: ${after}`);
  console.log(`Entfernt: ${before - after} plain-key Einträge`);

  if (before === after) { console.log("Nichts zu bereinigen."); return; }

  parsed.teams = cleaned;
  await sb.from("settings").upsert(
    { key: "btv_players", value: JSON.stringify(parsed) },
    { onConflict: "key" }
  );
  console.log("✓ Gespeichert.");
}

main().catch(e => { console.error(e); process.exit(1); });
