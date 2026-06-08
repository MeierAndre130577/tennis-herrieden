#!/usr/bin/env node
// scripts/fetch-btv.js
// Wird von GitHub Actions aufgerufen (Fr/Sa/So alle 10 Minuten).
// Holt Widget-HTML per fetch() (kein Playwright nötig für Staffelseite),
// findet den Spielbericht-Link und cached den Spielstand in Supabase.

const { chromium } = require("playwright");
const { createClient } = require("@supabase/supabase-js");

const sb = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
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

// ── Widget-HTML per fetch() holen (kein Playwright!) ──────────────────────
async function getWidgetHtml(groupUrl) {
  // groupid aus btv.de URL extrahieren
  const m = groupUrl.match(/groupid=(\d+)/);
  if (!m) throw new Error(`Keine groupid in URL: ${groupUrl}`);
  const widgetUrl = `https://widget.btv.de/btvgroup/?groupid=${m[1]}`;
  console.log(`Fetche Widget-HTML: ${widgetUrl}`);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20_000);
  try {
    const resp = await fetch(widgetUrl, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
        "Referer":    "https://www.btv.de/",
        "Accept":     "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "de-DE,de;q=0.9",
      },
    });
    clearTimeout(timer);
    if (!resp.ok) throw new Error(`HTTP ${resp.status} von widget.btv.de`);
    const html = await resp.text();
    console.log(`Widget-HTML erhalten: ${html.length} Zeichen`);
    return html;
  } catch (e) {
    clearTimeout(timer);
    throw e;
  }
}

// ── Aus HTML-String: Spielbericht-Link für Heim vs. Gast finden ───────────
function findReportLinkInHtml(html, heimTeam, gastTeam) {
  // Alle <tr>...</tr> Blöcke extrahieren
  const trMatches = [...html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)];
  console.log(`HTML-Zeilen (tr): ${trMatches.length}`);

  for (const trMatch of trMatches) {
    const rowHtml = trMatch[0];
    const rowText = rowHtml.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

    if (!rowText.includes(heimTeam) || !rowText.includes(gastTeam)) continue;

    console.log(`Treffer-Zeile Text: ${rowText.slice(0, 200)}`);
    console.log(`Treffer-Zeile HTML: ${rowHtml.slice(0, 600)}`);

    // <a href="..."> extrahieren
    const hrefM = rowHtml.match(/href="([^"#javascript][^"]*)"/i);
    if (hrefM) {
      const url = hrefM[1].startsWith("http")
        ? hrefM[1]
        : `https://btv-prod.burdadigitalsystems.de${hrefM[1]}`;
      console.log(`Link gefunden (href): ${url}`);
      return url;
    }

    // onclick="..." auslesen
    const onclickM = rowHtml.match(/onclick="([^"]*)"/i);
    if (onclickM) {
      const oc = onclickM[1];
      console.log(`onclick gefunden: ${oc}`);
      const urlM = oc.match(/(https?:\/\/[^\s'"]+)/);
      if (urlM) return urlM[1];
      const idM = oc.match(/\b(\d{5,})\b/);
      if (idM) return `https://btv-prod.burdadigitalsystems.de/btvmatches/?begid=${idM[1]}`;
    }

    // data-* Attribute
    const dataM = rowHtml.match(/data-[a-z\-]+="([^"]*(?:btv|beg|match|begid)[^"]*)"/i);
    if (dataM) {
      const val = dataM[1];
      return val.startsWith("http") ? val : `https://btv-prod.burdadigitalsystems.de${val}`;
    }

    console.log("Zeile gefunden, aber kein Link-Attribut.");
    return null;
  }

  // Kein Treffer – alle Zeilen für Diagnose ausgeben
  const allTexts = trMatches
    .map(m => m[0].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 120))
    .filter(t => t.length > 5)
    .slice(0, 30);
  console.log("Alle Zeilen:\n  " + allTexts.join("\n  "));
  return null;
}

// ── Spielbericht parsen (Playwright) ──────────────────────────────────────
async function parseMatchReport(page, reportUrl, heimTeam, gastTeam) {
  console.log(`Lade Spielbericht: ${reportUrl}`);
  await page.goto(reportUrl, { waitUntil: "domcontentloaded", timeout: 30_000 });
  try {
    await page.waitForFunction(
      () => !document.body.textContent.includes("Processing"),
      { timeout: 20_000 }
    );
  } catch (_) {}
  await page.waitForTimeout(2000);

  const snippet = await page.evaluate(() => document.body.innerText.slice(0, 400));
  console.log("Spielbericht-Inhalt:\n" + snippet);

  return await page.evaluate(({ heim, gast }) => {
    const text = document.body.textContent || "";
    let status = "upcoming";
    if (/abgeschlossen|beendet|fertig/i.test(text))        status = "done";
    else if (text.match(/\d:\d/) && !/Blanko/i.test(text)) status = "live";

    let homeTeam = heim, awayTeam = gast;
    const teamEls = Array.from(
      document.querySelectorAll("h1,h2,h3,.z-label,[class*='team'],[class*='club']")
    ).map(el => el.textContent.trim()).filter(t => t.length > 3 && t.length < 80);
    if (teamEls.length >= 2) { homeTeam = teamEls[0]; awayTeam = teamEls[1]; }

    let league = "–";
    const lgEl = document.querySelector("[class*='liga'],[class*='league'],[class*='gruppe'],[class*='staffel']");
    if (lgEl) league = lgEl.textContent.trim();

    let time = "–";
    const tm = text.match(/(\d{1,2}:\d{2})\s*Uhr/);
    if (tm) time = tm[1] + " Uhr";

    let homeScore = 0, awayScore = 0;
    const scoreM = text.match(/(\d{1,2})\s*:\s*(\d{1,2})/);
    if (scoreM) { homeScore = parseInt(scoreM[1]); awayScore = parseInt(scoreM[2]); }

    const rubbers = [];
    for (const row of document.querySelectorAll("tr")) {
      const cells = Array.from(row.querySelectorAll("td")).map(td => td.textContent.trim());
      if (cells.length < 3) continue;
      const idM = cells.join(" ").match(/\b(E[1-6]|D[1-3])\b/i);
      if (!idM) continue;
      const id = idM[1].toUpperCase();
      const home = cells[1] || "–", away = cells[2] || "–", score = cells[3] || "–";
      let result = "open";
      const sets = score.match(/(\d):(\d)/g) || [];
      if (sets.length) {
        let hw = 0, aw = 0;
        for (const s of sets) { const [hn,an]=s.split(":").map(Number); if(hn>an)hw++;else aw++; }
        result = hw+aw>=2 ? (hw>aw?"win":"loss") : "live";
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
  console.log(`Staffel-URL:    "${groupUrl}"`);

  if (!heimTeam || !gastTeam || !groupUrl) {
    console.log("Nicht vollständig konfiguriert – nichts zu tun.");
    return;
  }

  // Schritt 1: Widget-HTML per fetch() holen (kein Playwright nötig)
  let reportUrl = null;
  try {
    const html = await getWidgetHtml(groupUrl);
    reportUrl = findReportLinkInHtml(html, heimTeam, gastTeam);
  } catch (e) {
    console.log(`Widget-Fehler: ${e.message}`);
  }

  if (!reportUrl) {
    console.log("Kein Spielbericht gefunden – speichere upcoming-Status.");
    await saveResult("btv_match_cache", {
      status: "upcoming", homeTeam: heimTeam, awayTeam: gastTeam,
      league: "–", time: "–", homeScore: 0, awayScore: 0, rubbers: [],
    });
    return;
  }

  // Schritt 2: Spielbericht laden + parsen (Playwright für JS-gerenderte Seite)
  const browser = await chromium.launch({ headless: true });
  const page    = await browser.newPage();
  page.setDefaultTimeout(30_000);
  try {
    const match = await parseMatchReport(page, reportUrl, heimTeam, gastTeam);
    await saveResult("btv_match_cache", match);
    console.log(`Gespeichert: ${match.status}, ${match.homeScore}:${match.awayScore}, ${match.rubbers.length} Einzel`);
  } finally {
    await browser.close();
  }
})().catch(err => {
  console.error("FEHLER:", err.message);
  process.exit(1);
});
