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

// ── Cookie-Banner wegklicken ───────────────────────────────────────────────
async function acceptCookies(page) {
  const selectors = [
    "button#CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll",
    "button[id*='AllowAll']",
    "button[id*='accept']",
    "a[id*='accept']",
    "button:has-text('Zustimmung')",
    "button:has-text('Alle akzeptieren')",
    "button:has-text('Akzeptieren')",
    "button:has-text('OK')",
  ];
  for (const sel of selectors) {
    try {
      await page.locator(sel).first().click({ timeout: 3000 });
      console.log(`Cookie-Banner akzeptiert (${sel})`);
      await page.waitForTimeout(1500);
      return;
    } catch (_) {}
  }
}

// ── Seite laden + auf Inhalt warten ────────────────────────────────────────
async function loadPage(page, url) {
  // domcontentloaded statt networkidle – btv.de macht endlos Tracker-Requests
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });
  // Cookie-Banner wegklicken (erscheint kurz nach dem Laden)
  await page.waitForTimeout(2000);
  await acceptCookies(page);
  // Warten bis "Processing..." weg ist (SPA lädt Daten nach)
  try {
    await page.waitForFunction(
      () => !document.body.textContent.includes("Processing"),
      { timeout: 25_000 }
    );
    console.log("Inhalt geladen (Processing verschwunden)");
  } catch (_) {
    console.log("Warnung: Seite zeigt noch 'Processing' nach 25s");
  }
  await page.waitForTimeout(2000);
}


// ── groupid aus btv.de URL extrahieren → widget.btv.de direkt öffnen ─────
function toWidgetUrl(url) {
  // https://www.btv.de/de/spielbetrieb/tabelle-spielplan.html?groupid=2165685
  // → https://widget.btv.de/btvgroup/?groupid=2165685
  const m = url.match(/groupid=(\d+)/);
  if (m) return `https://widget.btv.de/btvgroup/?groupid=${m[1]}`;
  // Falls schon eine widget.btv.de URL: direkt zurückgeben
  if (url.includes("widget.btv.de")) return url;
  return null;
}

// ── Auf dem Widget den Spielbericht-Link finden ───────────────────────────
async function findMatchReportUrl(page, groupUrl, heimTeam, gastTeam) {
  const widgetUrl = toWidgetUrl(groupUrl);
  if (!widgetUrl) {
    console.log(`Kann keine Widget-URL ableiten von: ${groupUrl}`);
    return null;
  }
  console.log(`Lade Widget direkt: ${widgetUrl}`);
  await loadPage(page, widgetUrl);

  const snippet = await page.evaluate(() => document.body.innerText.slice(0, 600));
  console.log("Widget-Inhalt (Auszug):\n" + snippet);

  // Alle Zeilen für Diagnose
  const allRows = await page.evaluate(() =>
    Array.from(document.querySelectorAll("tr"))
      .map(r => r.textContent.trim().replace(/\s+/g, " ").slice(0, 150))
      .filter(t => t.length > 10).slice(0, 30)
  );
  console.log("Zeilen:\n  " + allRows.join("\n  "));

  // Matching-Zeile finden + alle möglichen Link-Varianten prüfen
  const result = await page.evaluate(({ heim, gast }) => {
    const rows = Array.from(document.querySelectorAll("tr"));
    for (const row of rows) {
      const text = row.textContent || "";
      if (!text.includes(heim) || !text.includes(gast)) continue;

      // 1) Alle <a> mit echtem href
      for (const a of row.querySelectorAll("a[href]")) {
        const h = a.href;
        if (h && h !== location.href && !h.endsWith("#") && !h.startsWith("javascript")) {
          return { url: h, method: "a-href" };
        }
      }
      // 2) onclick-Attribute auslesen (z.B. onclick="openMatch(12345)")
      for (const el of row.querySelectorAll("[onclick]")) {
        const oc = el.getAttribute("onclick") || "";
        const m = oc.match(/['"]?(https?:\/\/[^'"]+)['"]?/);
        if (m) return { url: m[1], method: "onclick-url" };
        const idm = oc.match(/\d{4,}/);
        if (idm) return { url: `https://btv-prod.burdadigitalsystems.de/btvmatches/?begid=${idm[0]}`, method: "onclick-id" };
      }
      // 3) data-* Attribute
      for (const el of row.querySelectorAll("[data-href],[data-url],[data-link],[data-begid]")) {
        const val = el.dataset.href || el.dataset.url || el.dataset.link || el.dataset.begid;
        if (val) return { url: val.startsWith("http") ? val : `https://btv-prod.burdadigitalsystems.de${val}`, method: "data-attr" };
      }
      // 4) HTML der Zeile für Diagnose zurückgeben
      return { url: null, rowHtml: row.outerHTML.slice(0, 600) };
    }
    return null;
  }, { heim: heimTeam, gast: gastTeam });

  if (!result) {
    console.log("Keine Zeile mit beiden Teams gefunden.");
    return null;
  }
  if (result.url) {
    console.log(`Spielbericht gefunden (${result.method}): ${result.url}`);
    return result.url;
  }
  // Kein Link gefunden – HTML ausgeben für weiteres Debugging
  console.log("Zeile gefunden, aber kein Link. Row-HTML:\n" + result.rowHtml);
  return null;
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
