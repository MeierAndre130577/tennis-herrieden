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
  // "commit" = erste Antwort empfangen, nie Timeout durch Tracker
  await page.goto(url, { waitUntil: "commit", timeout: 60_000 });
  await page.waitForLoadState("domcontentloaded", { timeout: 60_000 });
  // Cookie-Banner wegklicken (erscheint kurz nach dem Laden)
  await page.waitForTimeout(2000);
  await acceptCookies(page);
  // Cookie-Banner wegklicken
  await page.waitForTimeout(2000);
  await acceptCookies(page);
  // Warten bis "Processing..." weg ist (SPA lädt Daten nach)
  try {
    await page.waitForFunction(
      () => !document.body.textContent.includes("Processing"),
      { timeout: 30_000 }
    );
    console.log("Inhalt geladen");
  } catch (_) {
    console.log("Warnung: 'Processing' nach 30s noch sichtbar");
  }
  await page.waitForTimeout(2000);
}


// ── btv.de laden → Widget-iframe finden → Spielbericht-Link holen ─────────
async function findMatchReportUrl(page, groupUrl, heimTeam, gastTeam) {
  console.log(`Lade btv.de: ${groupUrl}`);
  await loadPage(page, groupUrl);

  // Widget-iframe suchen
  let widgetFrame = null;
  for (const frame of page.frames()) {
    if (frame.url().includes("widget.btv.de")) {
      widgetFrame = frame;
      break;
    }
  }
  if (!widgetFrame) {
    console.log("Widget-iframe nicht gefunden. Frames:", page.frames().map(f => f.url()).join(", "));
    return null;
  }
  console.log(`Widget-iframe: ${widgetFrame.url()}`);

  // Warten bis Widget-Inhalt geladen ist
  try {
    await widgetFrame.waitForFunction(
      () => document.querySelectorAll("tr").length > 3,
      { timeout: 15_000 }
    );
  } catch (_) { console.log("Warnung: Widget-iframe lädt langsam"); }

  // Matching-Zeile finden + Link extrahieren
  const result = await widgetFrame.evaluate(({ heim, gast }) => {
    const rows = Array.from(document.querySelectorAll("tr"));
    for (const row of rows) {
      const text = row.textContent || "";
      if (!text.includes(heim) || !text.includes(gast)) continue;

      // HTML der Zeile für Diagnose
      const html = row.outerHTML;

      // 1) <a> mit echtem href
      for (const a of row.querySelectorAll("a")) {
        const h = a.getAttribute("href") || "";
        if (h && h !== "#" && !h.startsWith("javascript")) {
          return { url: h.startsWith("http") ? h : `https://btv-prod.burdadigitalsystems.de${h}`, method: "a-href", html };
        }
      }
      // 2) onclick
      for (const el of row.querySelectorAll("[onclick]")) {
        const oc = el.getAttribute("onclick") || "";
        const mu = oc.match(/['"]?(https?:\/\/[^'")\s]+)['"]?/);
        if (mu) return { url: mu[1], method: "onclick-url", html };
        const mi = oc.match(/\b(\d{5,})\b/);
        if (mi) return { url: `https://btv-prod.burdadigitalsystems.de/btvmatches/?begid=${mi[1]}`, method: "onclick-id", html };
      }
      // 3) data-* Attribute
      for (const el of [...row.querySelectorAll("*")]) {
        for (const attr of el.attributes) {
          if ((attr.name.startsWith("data-") || attr.name === "href") && attr.value.length > 5) {
            if (attr.value.includes("btv") || attr.value.includes("beg") || attr.value.includes("match")) {
              return { url: attr.value.startsWith("http") ? attr.value : `https://btv-prod.burdadigitalsystems.de${attr.value}`, method: `attr-${attr.name}`, html };
            }
          }
        }
      }
      // Kein Link – HTML zurückgeben
      return { url: null, html };
    }
    return null;
  }, { heim: heimTeam, gast: gastTeam });

  if (!result) {
    console.log("Keine Zeile mit beiden Teams gefunden.");
    // Alle Zeilen ausgeben zur Diagnose
    const rows = await widgetFrame.evaluate(() =>
      Array.from(document.querySelectorAll("tr"))
        .map(r => r.textContent.trim().replace(/\s+/g, " ").slice(0, 120))
        .filter(t => t.length > 5).slice(0, 30)
    );
    console.log("Alle Zeilen:\n  " + rows.join("\n  "));
    return null;
  }

  console.log("Row-HTML der Zeile:\n" + result.html);

  if (result.url) {
    console.log(`Spielbericht gefunden (${result.method}): ${result.url}`);
    return result.url;
  }
  console.log("Zeile gefunden, aber kein Link in HTML.");
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
  // Realistischen Browser vortäuschen
  await page.setExtraHTTPHeaders({
    "Accept-Language": "de-DE,de;q=0.9",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  });
  await page.setViewportSize({ width: 1280, height: 800 });
  // Längere Timeouts setzen
  page.setDefaultTimeout(60_000);

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
