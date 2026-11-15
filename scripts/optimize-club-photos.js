#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
// Vereinsfotos verkleinern + Vorschaubilder anlegen (einmalig, lokal)
//
// Die 2026 aus Supabase migrierten Vereinsfotos liegen in Originalgröße in R2
// (im Schnitt 4 MB, bis 9 MB). Das Skript macht pro Foto in club_photos:
//   1. Original laden, gedreht nach EXIF, auf max. 1920 px als JPEG verkleinern
//      (EXIF/GPS-Daten fallen dabei weg).
//   2. Zusätzlich ein Vorschaubild mit max. 800 px anlegen: <name>_t.jpg
//      (gleiche Regel wie thumbUrl() in src/App.jsx).
//   3. Neue Datei unter NEUEM Key hochladen und club_photos.image_url umschreiben.
//      Ein neuer Key ist Pflicht: die alten Dateien sind als "immutable"
//      gecacht, ein Überschreiben würden Browser/Display nie bemerken.
//   Ist das Foto schon klein genug, bleibt es unverändert, es kommt nur das
//   Vorschaubild dazu. Fotos, die schon ein Vorschaubild haben, werden übersprungen.
//
// Die Originale bleiben in R2 liegen (kostet nichts, 10 GB frei), außer man
// gibt --delete-originals mit.
//
// Einmalig das Bildpaket holen (landet nicht in package.json):
//   npm install --no-save sharp
//
// Trockenlauf (ändert nichts, rechnet nur aus, wie groß es würde):
//   node scripts/optimize-club-photos.js
//
// Wirklich anwenden (Windows cmd, ohne Leerzeichen nach "="):
//   set SUPABASE_SERVICE_KEY=...
//   set R2_ACCOUNT_ID=...
//   set R2_ACCESS_KEY_ID=...
//   set R2_SECRET_ACCESS_KEY=...
//   set R2_BUCKET=...
//   node scripts/optimize-club-photos.js --apply
//   (optional zusätzlich --delete-originals)
// ═══════════════════════════════════════════════════════════════════════════
const fs = require("fs");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");
const { S3Client, PutObjectCommand, DeleteObjectCommand } = require("@aws-sdk/client-s3");

let sharp;
try { sharp = require("sharp"); } catch (_) {
  console.error("Das Paket 'sharp' fehlt. Einmalig ausführen:  npm install --no-save sharp");
  process.exit(1);
}

const APPLY = process.argv.includes("--apply");
const DELETE_ORIGINALS = process.argv.includes("--delete-originals");
const MAIN_MAX = 1920, MAIN_Q = 82;
const THUMB_MAX = 800, THUMB_Q = 78;
const CACHE = "public, max-age=31536000, immutable";

// .env.local (VITE_SUPABASE_URL / VITE_SUPABASE_ANON) reicht für den Trockenlauf
function readEnvLocal() {
  try {
    const txt = fs.readFileSync(path.join(__dirname, "..", ".env.local"), "utf8");
    return Object.fromEntries(txt.split(/\r?\n/).filter(l => l.includes("=")).map(l => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, "")];
    }));
  } catch (_) { return {}; }
}
const local = readEnvLocal();
const SUPABASE_URL = process.env.SUPABASE_URL || local.VITE_SUPABASE_URL || "https://mzagislctxshpgqzniqg.supabase.co";
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || (APPLY ? null : local.VITE_SUPABASE_ANON);
const R2_PUBLIC_BASE_URL = (process.env.R2_PUBLIC_BASE_URL || "https://img.tennis-herrieden.de").replace(/\/$/, "");

const needed = APPLY ? ["SUPABASE_SERVICE_KEY", "R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET"] : [];
const missing = needed.filter(k => !process.env[k]);
if (missing.length) { console.error("Fehlende Umgebungsvariablen:", missing.join(", ")); process.exit(1); }
if (!SUPABASE_KEY) { console.error("Kein Supabase-Key (SUPABASE_SERVICE_KEY oder .env.local)"); process.exit(1); }

const sb = createClient(SUPABASE_URL, SUPABASE_KEY);
const r2 = APPLY ? new S3Client({
  region: "auto",
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY },
}) : null;

const keyFromUrl = u => (u && u.startsWith(R2_PUBLIC_BASE_URL + "/")) ? u.slice(R2_PUBLIC_BASE_URL.length + 1) : null;
const thumbKeyOf = k => k.replace(/\.[a-z0-9]+$/i, "_t.jpg");
const randomId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
const kb = n => `${Math.round(n / 1024)} KB`;
const mb = n => `${(n / 1024 / 1024).toFixed(1)} MB`;

const put = (Key, Body) => r2.send(new PutObjectCommand({
  Bucket: process.env.R2_BUCKET, Key, Body, ContentType: "image/jpeg", CacheControl: CACHE,
}));

(async () => {
  console.log("═══════════════════════════════════════════");
  console.log(`Vereinsfotos optimieren  ${APPLY ? "(ANWENDEN)" : "(Trockenlauf – nichts wird verändert)"}`);
  console.log("═══════════════════════════════════════════");

  const { data: rows, error } = await sb.from("club_photos").select("id,image_url").order("created_at");
  if (error) throw new Error(`club_photos lesen: ${error.message}`);

  let before = 0, after = 0, thumbs = 0, skipped = 0, failed = 0, rekeyed = 0;
  for (const [i, row] of rows.entries()) {
    const tag = `[${i + 1}/${rows.length}]`;
    const key = keyFromUrl(row.image_url);
    if (!key) { console.log(`${tag} übersprungen (nicht in R2): ${row.image_url}`); skipped++; continue; }

    try {
      const head = await fetch(`${R2_PUBLIC_BASE_URL}/${thumbKeyOf(key)}`, { method: "HEAD" });
      if (head.ok) { console.log(`${tag} hat schon ein Vorschaubild: ${key}`); skipped++; continue; }

      const res = await fetch(row.image_url);
      if (!res.ok) throw new Error(`Download HTTP ${res.status}`);
      const orig = Buffer.from(await res.arrayBuffer());

      const main = await sharp(orig).rotate()
        .resize({ width: MAIN_MAX, height: MAIN_MAX, fit: "inside", withoutEnlargement: true })
        .jpeg({ quality: MAIN_Q, mozjpeg: true }).toBuffer();
      const thumb = await sharp(orig).rotate()
        .resize({ width: THUMB_MAX, height: THUMB_MAX, fit: "inside", withoutEnlargement: true })
        .jpeg({ quality: THUMB_Q, mozjpeg: true }).toBuffer();

      // Nur neu ablegen, wenn es sich lohnt (>15 % kleiner); sonst bleibt das Bild wie es ist.
      const replace = main.length < orig.length * 0.85;
      before += orig.length;
      after += replace ? main.length : orig.length;
      thumbs += thumb.length;

      if (!replace) {
        console.log(`${tag} ${kb(orig.length)} bleibt, Vorschau ${kb(thumb.length)}  (${key})`);
        if (APPLY) await put(thumbKeyOf(key), thumb);
        continue;
      }

      const newKey = `club-photos/${randomId()}.jpg`;
      console.log(`${tag} ${kb(orig.length)} → ${kb(main.length)}, Vorschau ${kb(thumb.length)}  (${key} → ${newKey})`);
      if (!APPLY) continue;

      await put(newKey, main);
      await put(thumbKeyOf(newKey), thumb);
      const { error: updErr } = await sb.from("club_photos")
        .update({ image_url: `${R2_PUBLIC_BASE_URL}/${newKey}` }).eq("id", row.id);
      if (updErr) throw new Error(`DB-Update: ${updErr.message} (neue Datei liegt schon in R2: ${newKey})`);
      rekeyed++;
      if (DELETE_ORIGINALS) await r2.send(new DeleteObjectCommand({ Bucket: process.env.R2_BUCKET, Key: key }));
    } catch (e) {
      failed++;
      console.log(`${tag} ✗ ${key}: ${e.message}`);
    }
  }

  console.log("\n═══════════════════════════════════════════");
  console.log(`Fotos: ${rows.length}, übersprungen ${skipped}, Fehler ${failed}`);
  console.log(`Hauptbilder: ${mb(before)} → ${mb(after)}   Vorschaubilder zusammen: ${mb(thumbs)}`);
  if (!APPLY) console.log("Trockenlauf fertig. Passt das, mit --apply und den R2-Variablen nochmal starten.");
  else {
    console.log(`✓ ${rekeyed} Fotos neu abgelegt und in der DB umgestellt.`);
    console.log(DELETE_ORIGINALS ? "Originale wurden gelöscht." : "Originale liegen weiterhin in R2 (nicht gelöscht).");
  }
  console.log("═══════════════════════════════════════════");
})().catch(e => { console.error("FEHLER:", e.message); process.exit(1); });
