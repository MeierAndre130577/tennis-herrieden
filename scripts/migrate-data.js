#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
// Datenmigration: Alt-Supabase → Neu-Supabase
// Aufruf (lokal, nie in GitHub Actions):
//   OLD_URL=... OLD_KEY=... NEW_URL=... NEW_KEY=... node scripts/migrate-data.js
// ═══════════════════════════════════════════════════════════════════════════
const { createClient } = require("@supabase/supabase-js");

const OLD_URL = process.env.OLD_URL;
const OLD_KEY = process.env.OLD_KEY; // service_role key des alten Projekts
const NEW_URL = process.env.NEW_URL || "https://mzagislctxshpgqzniqg.supabase.co";
const NEW_KEY = process.env.NEW_KEY; // service_role key des neuen Projekts

if (!OLD_URL || !OLD_KEY || !NEW_KEY) {
  console.error("Fehlende Umgebungsvariablen: OLD_URL, OLD_KEY, NEW_KEY");
  console.error("Beispiel:");
  console.error('  OLD_URL="https://irszeiamvwyrntyauury.supabase.co" OLD_KEY="..." NEW_KEY="..." node scripts/migrate-data.js');
  process.exit(1);
}

const src = createClient(OLD_URL, OLD_KEY);
const dst = createClient(NEW_URL, NEW_KEY);

async function migrateTable(name, { orderBy = "created_at", chunkSize = 1000, transform } = {}) {
  console.log(`\n── ${name} ──`);
  let allRows = [];
  let from = 0;

  while (true) {
    let q = src.from(name).select("*").range(from, from + chunkSize - 1);
    if (orderBy) q = q.order(orderBy, { ascending: true });
    const { data, error } = await q;
    if (error) { console.log(`  ✗ Lesen fehlgeschlagen: ${error.message}`); return; }
    if (!data?.length) break;
    allRows = allRows.concat(data);
    if (data.length < chunkSize) break;
    from += chunkSize;
  }

  console.log(`  Gelesen: ${allRows.length} Zeilen`);
  if (!allRows.length) return;

  const rows = transform ? allRows.map(transform) : allRows;

  // In Blöcken schreiben
  for (let i = 0; i < rows.length; i += 200) {
    const chunk = rows.slice(i, i + 200);
    const { error } = await dst.from(name).upsert(chunk, { onConflict: "id", ignoreDuplicates: false });
    if (error) console.log(`  ✗ Schreiben fehlgeschlagen (Block ${i}): ${error.message}`);
    else process.stdout.write(`  ✓ ${Math.min(i + 200, rows.length)}/${rows.length}\r`);
  }
  console.log(`  ✓ ${rows.length} Zeilen migriert`);
}

async function migrateSettings() {
  console.log(`\n── settings ──`);
  const { data, error } = await src.from("settings").select("*");
  if (error) { console.log(`  ✗ ${error.message}`); return; }
  console.log(`  Gelesen: ${data.length} Einträge`);
  const { error: e2 } = await dst.from("settings").upsert(data, { onConflict: "key" });
  if (e2) console.log(`  ✗ ${e2.message}`);
  else console.log(`  ✓ ${data.length} Einträge migriert`);
}

async function migrateCategoryAssignments() {
  console.log(`\n── news_category_assignments ──`);
  const { data, error } = await src.from("news_category_assignments").select("*");
  if (error) { console.log(`  ✗ ${error.message}`); return; }
  console.log(`  Gelesen: ${data?.length ?? 0} Zeilen`);
  if (!data?.length) return;
  const { error: e2 } = await dst.from("news_category_assignments")
    .upsert(data, { onConflict: "news_item_id,category_id", ignoreDuplicates: true });
  if (e2) console.log(`  ✗ ${e2.message}`);
  else console.log(`  ✓ migriert`);
}

(async () => {
  console.log("═══════════════════════════════════════════");
  console.log("Tennis Herrieden – Datenmigration");
  console.log(`Alt: ${OLD_URL}`);
  console.log(`Neu: ${NEW_URL}`);
  console.log("═══════════════════════════════════════════");
  console.log("\n⚠ HINWEIS: Auth-Nutzer (Mitglieder) können nicht automatisch");
  console.log("  migriert werden — sie müssen sich neu registrieren.\n");

  // Tabellen ohne User-Abhängigkeit zuerst
  await migrateSettings();
  await migrateTable("courts",     { orderBy: "sort_order" });
  await migrateTable("categories", { orderBy: null });
  await migrateTable("news_items", { orderBy: "created_at" });
  await migrateCategoryAssignments();
  await migrateTable("club_photos", { orderBy: "created_at" });

  // Tabellen mit User-Referenzen (user_id aus altem Auth bleibt erhalten,
  // funktioniert wieder sobald Nutzer sich mit gleicher E-Mail neu registrieren)
  await migrateTable("bookings",           { orderBy: "created_at" });
  await migrateTable("kasse_log",          { orderBy: "created_at" });
  await migrateTable("kasse_favorites",    { orderBy: "sort_order" });
  await migrateTable("kassenbuch",         { orderBy: "created_at" });
  await migrateTable("kassenbuch_settings",{ orderBy: null });

  console.log("\n═══════════════════════════════════════════");
  console.log("✓ Migration abgeschlossen");
  console.log("\nNächste Schritte:");
  console.log("  1. Mitglieder neu einladen (Authentication → Users → Invite)");
  console.log("  2. Neues Vercel-Projekt mit neuen Keys deployen");
  console.log("  3. Domain tennis-herrieden.de verknüpfen");
  console.log("═══════════════════════════════════════════");
})().catch(e => { console.error("FEHLER:", e.message); process.exit(1); });
