#!/usr/bin/env node
// scripts/fetch-btv.js
// Wird von GitHub Actions aufgerufen (Fr/Sa/So alle 10 Minuten).
// Öffnet die Staffelseite auf btv.de, findet das heutige Spiel
// (Heim- vs. Gastmannschaft) und cached den Spielstand in Supabase.

const { chromium } = require("playwright");
const { createClient } = require("@supabase/supabase-js");

const sb = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY   // Service-Key (Schreibzugriff)
);

// ── Supabase-Helfer ────────────────────────────────────────────────────────
async function getSettings() {
  const { data } = await sb.from("settings").select("*")
    .in("key", ["display_mannschaft", "display_gegner", "display_match_url"]);
  if (!data) return {};
  return Object.fromEntries(data.map(r => [r.key, r.value]));
}

async function saveResult(key, value) {
  await sb.from("settings").upsert(
    { key, value: typeof value === "string" ? value : JSON.stringify(value) },
    { onConflict: "key" }
  );
}

// ── Seite laden + auf Inhalt warten ────────────────────────────────────────
async function loadPage(page, url) {
  await page.goto(url, { waitUntil: "networkidle", timeout: 30_000 });
  try {
    await page.waitForFunction(
      () => !document.body.textContent.includes("Processing"),
      { timeout: 20_000 }
    );
  } catch (_) {
    console.log("Warnung: Seite zeigt noch 'Processing' nach 20s");
  }
  await page.waitForTimeout(2000);
}

// ── Auf Staffelseite den Link zum heutigen Spielbericht suchen ─────────────
async function findMatchReportUrl(page, groupUrl, heimTeam, gastTeam) {
  await loadPage(page, groupUrl);

  // "Spielplan"-Tab klicken falls vorhanden
  for (const label of ["Spielplan", "Spiele", "Begegnungen", "Matches"]) {
    try {
      await page.locator(`text=${label}`).first().click({ timeout: 3000 });
      await page.waitForTimeout(1500);
      break;
    } catch (_) {}
  }

  const snippet = await page.evaluate(() => document.body.innerText.slice(0, 1000));
  console.log("Staffelseite-Inhalt (Auszug):\n" + snippet);

  // Alle Links auf der Seite loggen
  const allLinks = await page.evaluate(() =>
    Array.from(document.querySelectorAll("a[href]"))
      .map(a => `${a.textContent.trim().slice(0,50)} → ${a.href}`)
      .filter(s => s.length > 5)
      .slice(0, 30)
  );
  console.log("Alle Links:", allLinks.join("\n  "));

  // Alle Zeilen mit Text loggen (um Teamnamen zu sehen)
  const allRows = await page.evaluate(() =>
    Array.from(document.querySelectorAll("tr, [class*='row'], [class*='match'], [class*='begegnung']"))
      .map(r => r.textContent.trim().replace(/\s+/g, " ").slice(0, 120))
      .filter(t => t.length > 10)
      .slice(0, 20)
  );
  console.log("Gefundene Zeilen:", allRows.join("\n  "));

  // Zeile finden, die beide Teams enthält, und Link extrahieren
  const href = await page.evaluate(({ heim, gast }) => {
    const rows = Array.from(
      document.querySelectorAll("tr, [class*='row'], [class*='match'], [class*='begegnung'], [class*='meeting']")
    );
    for (const row of rows) {
      const text = row.textContent || "";
      if (text.includes(heim) && text.includes(gast)) {
        // Bevorzugt: Link mit "matchReport", "begegnung", "spielbericht", "begid"
        const prio = row.querySelector(
          "a[href*='matchReport'], a[href*='spielbericht'], a[href*='begegnung'], a[href*='begid']"
        );
        if (prio) return prio.href;
        // Fallback: irgendein Link in der Zeile
        const any = row.querySelector("a[href]");
        if (any) return any.href;
      }
    }
    return null;
  }, { heim: heimTeam, gast: gastTeam });

  console.log(`Gefundener Spielbericht-Link: ${href || "keiner"}`);
  return href;
}

// ── Spielbericht parsen ────────────────────────────────────────────────────
async function parseMatchReport(page, reportUrl, heimTeam, gastTeam) {
  await loadPage(page, reportUrl);

  const snippet = await page.evaluate(() => document.body.innerText.slice(0, 400));
  console.log("Spielbericht-Inhalt (Auszug):", snippet);

  return await page.evaluate(({ heim, gast }) => {
    const text = document.body.textContent || "";

    // Status
    let status = "upcoming";
    if (/abgeschlossen|beendet|fertig/i.test(text))        status = "done";
    else if (text.match(/\d:\d/) && !/Blanko/i.test(text)) status = "live";

    // Teamnamen aus Überschriften
    let homeTeam = heim;
    let awayTeam = gast;
    const teamEls = Array.from(
      document.querySelectorAll("h1,h2,h3,.z-label,[class*='team'],[class*='club'],[class*='mannschaft']")
    ).map(el => el.textContent.trim()).filter(t => t.length > 3 && t.length < 80);
    if (teamEls.length >= 2) { homeTeam = teamEls[0]; awayTeam = teamEls[1]; }

    // Liga
    let league = "–";
    const lgEl = document.querySelector(
      "[class*='liga'],[class*='league'],[class*='gruppe'],[class*='staffel']"
    );
    if (lgEl) league = lgEl.textContent.trim();

    // Uhrzeit
    let time = "–";
    const tm = text.match(/(\d{1,2}:\d{2})\s*Uhr/);
    if (tm) time = tm[1] + " Uhr";

    // Gesamtstand
    let homeScore = 0, awayScore = 0;
    const scoreM = text.match(/(\d{1,2})\s*:\s*(\d{1,2})/);
    if (scoreM) { homeScore = parseInt(scoreM[1]); awayScore = parseInt(scoreM[2]); }

    // Einzelergebnisse (E1–E6, D1–D3)
    const rubbers = [];
    for (const row of document.querySelectorAll("tr")) {
      const cells = Array.from(row.querySelectorAll("td")).map(td => td.textContent.trim());
      if (cells.length < 3) continue;
      const rowText = cells.join(" ");
      const idM = rowText.match(/\b(E[1-6]|D[1-3])\b/i);
      if (!idM) continue;
      const id = idM[1].toUpperCase();
      const home  = cells[1] || "–";
      const away  = cells[2] || "–";
      const score = cells[3] || "–";
      let result = "open";
      const sets = score.match(/(\d):(\d)/g) || [];
      if (sets.length > 0) {
        let hw = 0, aw = 0;
        for (const s of sets) {
          const [hn, an] = s.split(":").map(Number);
          if (hn > an) hw++; else aw++;
        }
        result = hw + aw >= 2 ? (hw > aw ? "win" : "loss") : "live";
      }
      rubbers.push({ id, home, away, score, result });
    }

    return { status, homeTeam, awayTeam, league, time, homeScore, awayScore, rubbers };
  }, { heim: heimTeam, gast: gastTeam });
}

// ── MAIN ──────────────────────────────────────────────────────────────────
(async () => {
  const settings  = await getSettings();
  const heimTeam  = settings.display_mannschaft || "";
  const gastTeam  = settings.display_gegner     || "";
  const groupUrl  = settings.display_match_url  || "";

  console.log(`Heimmannschaft: "${heimTeam}"`);
  console.log(`Gastmannschaft: "${gastTeam}"`);
  console.log(`Staffel-URL: "${groupUrl}"`);

  if (!heimTeam || !gastTeam || !groupUrl) {
    console.log("Nicht vollständig konfiguriert – nichts zu tun.");
    return;
  }

  const browser = await chromium.launch({ headless: true });
  const page    = await browser.newPage();

  try {
    // Schritt 1: Spielbericht-Link auf der Staffelseite finden
    const reportUrl = await findMatchReportUrl(page, groupUrl, heimTeam, gastTeam);

    if (!reportUrl) {
      console.log("Kein Spielbericht für dieses Spiel gefunden (noch nicht angelegt oder falsche Teamnamen).");
      // Leeren Cache speichern damit Display "bald" zeigt
      await saveResult("btv_match_cache", { status: "upcoming", homeTeam: heimTeam,
        awayTeam: gastTeam, league: "–", time: "–", homeScore: 0, awayScore: 0, rubbers: [] });
      return;
    }

    // Schritt 2: Spielbericht parsen
    const match = await parseMatchReport(page, reportUrl, heimTeam, gastTeam);
    await saveResult("btv_match_cache", match);
    console.log(`Match gespeichert: ${match.status}, ${match.homeScore}:${match.awayScore}, ${match.rubbers.length} Einzel`);

  } finally {
    await browser.close();
  }
})().catch(err => {
  console.error("FEHLER:", err.message);
  process.exit(1);
});
