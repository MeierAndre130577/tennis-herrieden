#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
// Prüft die R2-Anbindung komplett unabhängig von Supabase/der App:
//   1. Schreibt eine Testdatei in den Bucket
//   2. Ruft sie über die öffentliche URL ab (prüft Custom-Domain-Routing)
//   3. Löscht die Testdatei wieder
//
// Aufruf:
//   R2_ACCOUNT_ID=... R2_ACCESS_KEY_ID=... R2_SECRET_ACCESS_KEY=... \
//   R2_BUCKET=... R2_PUBLIC_BASE_URL=https://img.tennis-herrieden.de \
//   node scripts/test-r2-connection.js
// ═══════════════════════════════════════════════════════════════════════════
const { S3Client, PutObjectCommand, DeleteObjectCommand } = require("@aws-sdk/client-s3");

const { R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET } = process.env;
const R2_PUBLIC_BASE_URL = (process.env.R2_PUBLIC_BASE_URL || "").replace(/\/$/, "");

const missing = ["R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET", "R2_PUBLIC_BASE_URL"]
  .filter((k) => !process.env[k]);
if (missing.length) { console.error("Fehlende Umgebungsvariablen:", missing.join(", ")); process.exit(1); }

const r2 = new S3Client({
  region: "auto",
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY },
});

const key = `r2-test/ping-${Date.now()}.txt`;
const content = `Test von tennis-herrieden.de am ${new Date().toISOString()}`;

(async () => {
  console.log("1/3 Schreibe Testdatei nach R2 …");
  await r2.send(new PutObjectCommand({ Bucket: R2_BUCKET, Key: key, Body: content, ContentType: "text/plain" }));
  console.log(`  ✓ Geschrieben: ${key}`);

  console.log("\n2/3 Rufe die Datei über die öffentliche URL ab …");
  const url = `${R2_PUBLIC_BASE_URL}/${key}`;
  const res = await fetch(url);
  const body = await res.text();
  if (res.status === 200 && body === content) {
    console.log(`  ✓ ${url} liefert HTTP 200 mit korrektem Inhalt`);
  } else {
    console.log(`  ✗ ${url} → HTTP ${res.status}, Inhalt: ${JSON.stringify(body.slice(0, 200))}`);
    console.log("    → Prüfe: Custom Domain im R2-Bucket verbunden? DNS schon propagiert?");
  }

  console.log("\n3/3 Räume Testdatei wieder auf …");
  await r2.send(new DeleteObjectCommand({ Bucket: R2_BUCKET, Key: key }));
  console.log("  ✓ Gelöscht");

  console.log("\n═══════════════════════════════════════════");
  console.log(res.status === 200 && body === content
    ? "✓ R2-Anbindung funktioniert vollständig (Schreiben + öffentliches Ausliefern)."
    : "✗ Schreiben hat geklappt, aber die öffentliche URL liefert noch nicht das Erwartete – siehe oben.");
  console.log("═══════════════════════════════════════════");
})().catch((e) => { console.error("FEHLER:", e.message); process.exit(1); });
