#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
// Foto-Migration: Supabase Storage (Bucket "club-photos") → Cloudflare R2
//
// Macht zwei Dinge:
//   1. Kopiert jede Datei aus dem Supabase-Bucket 1:1 (gleicher Pfad) nach R2.
//      Die Originale in Supabase werden NICHT gelöscht — die Migration ist
//      also jederzeit rückgängig zu machen, solange Schritt 2 nicht lief.
//   2. Schreibt image_url-Spalten (club_photos, news_items) sowie das
//      JSONB-Feld vm_turniere.gruppen (enthält Spieler-Avatare) so um, dass
//      sie auf die neuen R2-URLs zeigen.
//
// Läuft NUR lokal, nie in GitHub Actions — braucht den Supabase Service-Role-
// Key und die R2-Zugangsdaten.
//
// Erst zur Kontrolle (nichts wird verändert):
//   SUPABASE_SERVICE_KEY=... R2_ACCOUNT_ID=... R2_ACCESS_KEY_ID=... \
//   R2_SECRET_ACCESS_KEY=... R2_BUCKET=... R2_PUBLIC_BASE_URL=https://img.tennis-herrieden.de \
//   node scripts/migrate-photos-to-r2.js
//
// Wenn die Ausgabe passt, mit --apply wirklich kopieren + DB umschreiben:
//   ...gleiche Variablen... node scripts/migrate-photos-to-r2.js --apply
// ═══════════════════════════════════════════════════════════════════════════
const { createClient } = require("@supabase/supabase-js");
const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");

const SUPABASE_URL = process.env.SUPABASE_URL || "https://mzagislctxshpgqzniqg.supabase.co";
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY; // service_role key, NICHT der anon key
const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID;
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;
const R2_BUCKET = process.env.R2_BUCKET;
const R2_PUBLIC_BASE_URL = (process.env.R2_PUBLIC_BASE_URL || "").replace(/\/$/, "");
const BUCKET_NAME = "club-photos";
const APPLY = process.argv.includes("--apply");

const missing = ["SUPABASE_SERVICE_KEY", "R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET", "R2_PUBLIC_BASE_URL"]
  .filter((k) => !process.env[k]);
if (missing.length) {
  console.error("Fehlende Umgebungsvariablen:", missing.join(", "));
  process.exit(1);
}

const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
const r2 = new S3Client({
  region: "auto",
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY },
});

const OLD_BASE = `${SUPABASE_URL}/storage/v1/object/public/${BUCKET_NAME}`;

// Listet den Bucket rekursiv (Supabase list() ist nicht rekursiv von Haus aus)
async function listAllFiles(prefix = "") {
  const { data, error } = await sb.storage.from(BUCKET_NAME).list(prefix, { limit: 1000 });
  if (error) throw new Error(`list(${prefix}) fehlgeschlagen: ${error.message}`);
  let files = [];
  for (const entry of data || []) {
    const fullPath = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.id === null) {
      // Ordner (Supabase markiert Ordner mit id:null) → rekursiv weiter
      files = files.concat(await listAllFiles(fullPath));
    } else {
      files.push(fullPath);
    }
  }
  return files;
}

async function copyFile(path) {
  const { data, error } = await sb.storage.from(BUCKET_NAME).download(path);
  if (error) throw new Error(`download fehlgeschlagen: ${error.message}`);
  const buffer = Buffer.from(await data.arrayBuffer());
  await r2.send(new PutObjectCommand({
    Bucket: R2_BUCKET,
    Key: path,
    Body: buffer,
    ContentType: data.type || "application/octet-stream",
  }));
  return buffer.length;
}

// Ersetzt die alte Supabase-Basis-URL durch die neue R2-Basis-URL in einem String.
function rewriteUrl(url) {
  return typeof url === "string" && url.startsWith(OLD_BASE) ? R2_PUBLIC_BASE_URL + url.slice(OLD_BASE.length) : url;
}

async function migrateTableColumn(table, column) {
  console.log(`\n── ${table}.${column} ──`);
  const { data, error } = await sb.from(table).select(`id,${column}`);
  if (error) { console.log(`  ✗ Lesen fehlgeschlagen: ${error.message}`); return; }
  const toUpdate = (data || [])
    .map((row) => ({ id: row.id, before: row[column], after: rewriteUrl(row[column]) }))
    .filter((r) => r.before !== r.after);
  console.log(`  ${toUpdate.length} von ${data.length} Zeilen betroffen`);
  for (const row of toUpdate) {
    console.log(`  ${APPLY ? "✓" : "würde ändern:"} ${row.id}: ${row.before} → ${row.after}`);
    if (APPLY) {
      const { error: updErr } = await sb.from(table).update({ [column]: row.after }).eq("id", row.id);
      if (updErr) console.log(`    ✗ ${updErr.message}`);
    }
  }
}

// vm_turniere.gruppen ist JSONB mit verschachtelten Spieler-Avataren
// (gruppen[].spieler[].avatar). String-Ersetzung auf der JSON-Textform ist
// hier sicherer als das Objekt manuell zu durchlaufen.
async function migrateVmTurniere() {
  console.log(`\n── vm_turniere.gruppen ──`);
  const { data, error } = await sb.from("vm_turniere").select("id,gruppen");
  if (error) { console.log(`  ✗ Lesen fehlgeschlagen: ${error.message}`); return; }
  let count = 0;
  for (const row of data || []) {
    const before = JSON.stringify(row.gruppen ?? null);
    if (!before.includes(OLD_BASE)) continue;
    const after = before.split(OLD_BASE).join(R2_PUBLIC_BASE_URL);
    count++;
    console.log(`  ${APPLY ? "✓" : "würde ändern:"} Turnier ${row.id}`);
    if (APPLY) {
      const { error: updErr } = await sb.from("vm_turniere").update({ gruppen: JSON.parse(after) }).eq("id", row.id);
      if (updErr) console.log(`    ✗ ${updErr.message}`);
    }
  }
  console.log(`  ${count} von ${data.length} Turnieren betroffen`);
}

(async () => {
  console.log("═══════════════════════════════════════════");
  console.log(`Foto-Migration Supabase → R2  ${APPLY ? "(ANWENDEN)" : "(Trockenlauf – nichts wird verändert)"}`);
  console.log(`Von:  ${OLD_BASE}`);
  console.log(`Nach: ${R2_PUBLIC_BASE_URL}`);
  console.log("═══════════════════════════════════════════");

  console.log("\n── Dateien auflisten ──");
  const files = await listAllFiles();
  console.log(`  ${files.length} Dateien im Bucket "${BUCKET_NAME}" gefunden`);

  console.log(`\n── Dateien ${APPLY ? "kopieren" : "die kopiert würden"} ──`);
  let done = 0, failed = 0, bytes = 0;
  for (const path of files) {
    try {
      if (APPLY) bytes += await copyFile(path);
      done++;
      process.stdout.write(`  ${APPLY ? "kopiert" : "geprüft"}: ${done}/${files.length}\r`);
    } catch (e) {
      failed++;
      console.log(`\n  ✗ ${path}: ${e.message}`);
    }
  }
  console.log(`\n  ${done} ok, ${failed} Fehler${APPLY ? `, ${(bytes / 1024 / 1024).toFixed(1)} MB übertragen` : ""}`);

  await migrateTableColumn("club_photos", "image_url");
  await migrateTableColumn("news_items", "image_url");
  await migrateVmTurniere();

  console.log("\n═══════════════════════════════════════════");
  if (!APPLY) {
    console.log("Trockenlauf fertig. Sieht das Ergebnis richtig aus, nochmal mit --apply aufrufen.");
  } else {
    console.log("✓ Migration abgeschlossen.");
    console.log("Die Originaldateien liegen weiterhin in Supabase Storage (nicht gelöscht).");
    console.log("Erst nach ein paar Tagen Stichproben-Kontrolle den alten Bucket manuell leeren.");
  }
  console.log("═══════════════════════════════════════════");
})().catch((e) => { console.error("FEHLER:", e.message); process.exit(1); });
