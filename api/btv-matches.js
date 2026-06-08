// api/btv-matches.js
// Vercel Serverless Function – holt Heimspieldaten von btv.de via Playwright
//
// Query-Parameter:
//   clubnr  – BTV-Vereinsnummer, z.B. "6085" oder "06085"
//   saison  – Saison-Jahr, z.B. "2026"

const chromium = require("@sparticuz/chromium");
const { chromium: playwright } = require("playwright-core");

// Vercel Function Config
module.exports.config = {
  maxDuration: 45,
};

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "s-maxage=60, stale-while-revalidate=30");

  const rawNr  = req.query.clubnr  || "06085";
  const saison = req.query.saison  || "2026";
  const clubnr = String(rawNr).padStart(5, "0");

  let browser;
  try {
    browser = await playwright.launch({
      args:            chromium.args,
      defaultViewport: { width: 1280, height: 900 },
      executablePath:  await chromium.executablePath(),
      headless:        chromium.headless,
    });

    const page = await browser.newPage();

    // ── 1. Meetings-Seite laden ──────────────────────────────────────────
    const meetingsUrl = `https://btv-prod.burdadigitalsystems.de/btvmeetings/?clubnr=${clubnr}`;
    await page.goto(meetingsUrl, { waitUntil: "networkidle", timeout: 25_000 });

    // ZK braucht etwas Zeit zum Rendern
    await page.waitForTimeout(2000);

    // ── 2. „Heimspiele"-Filter klicken ───────────────────────────────────
    try {
      // Suche Button/Tab der "Heimspiele" enthält
      const heimBtn = page.locator("text=Heimspiele").first();
      await heimBtn.click({ timeout: 5000 });
      await page.waitForTimeout(2000);
    } catch (_) {
      // Falls kein Filter vorhanden, alle Spiele nehmen
    }

    // ── 3. Heute's Spiel finden ──────────────────────────────────────────
    const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

    // Alle Zeilen der Begegnungsliste auslesen
    const matches = await page.evaluate((todayStr) => {
      const rows = Array.from(document.querySelectorAll("tr, .z-row, .begegnung-row, [class*='row']"));
      const results = [];

      for (const row of rows) {
        const text = row.textContent || "";
        // Suche nach Datumsangaben im deutschen Format (TT.MM.JJJJ)
        const dateMatch = text.match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/);
        if (!dateMatch) continue;

        const [, d, m, y] = dateMatch;
        const rowDate = `${y}-${m.padStart(2,"0")}-${d.padStart(2,"0")}`;
        if (rowDate !== todayStr) continue;

        // Teams aus der Zeile extrahieren
        const cells = Array.from(row.querySelectorAll("td, .z-cell, span, div")).map(el => el.textContent.trim()).filter(Boolean);
        results.push({ rowDate, cells, html: row.innerHTML });
      }

      return results;
    }, today);

    if (matches.length === 0) {
      // Kein Spiel heute → prüfe ob demnächst
      const upcoming = await page.evaluate(() => {
        const rows = Array.from(document.querySelectorAll("tr, .z-row, [class*='row']"));
        for (const row of rows) {
          const text = row.textContent || "";
          const dateMatch = text.match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/);
          if (!dateMatch) continue;
          const [, d, m, y] = dateMatch;
          const cells = Array.from(row.querySelectorAll("td, span, div")).map(el => el.textContent.trim()).filter(t => t.length > 0);
          return { date: `${d}.${m}.${y}`, cells };
        }
        return null;
      });

      await browser.close();
      return res.json({
        match: null,
        debug: { message: "Kein Heimspiel heute", nextMatch: upcoming, clubnr, saison }
      });
    }

    // ── 4. Matchdetails laden ────────────────────────────────────────────
    // Klicke auf das erste heutige Spiel um Spielbericht zu öffnen
    const matchRow = matches[0];

    // Versuche einen Link im Row zu finden
    let matchData = null;
    try {
      // Suche Spielbericht-Link
      const link = await page.locator(`a[href*='btvmatchreport'], a[href*='begid'], a[href*='spielbericht']`).first();
      const href = await link.getAttribute("href");
      if (href) {
        const reportUrl = href.startsWith("http") ? href : `https://btv-prod.burdadigitalsystems.de${href}`;
        await page.goto(reportUrl, { waitUntil: "networkidle", timeout: 20_000 });
        await page.waitForTimeout(2000);
        matchData = await parseMatchReport(page);
      }
    } catch (_) {
      // Fallback: Daten direkt aus der Liste
    }

    if (!matchData) {
      matchData = buildMatchFromRow(matchRow);
    }

    await browser.close();
    res.json({ match: matchData, debug: { clubnr, saison, today } });

  } catch (err) {
    if (browser) await browser.close();
    console.error("btv-matches error:", err);
    res.status(500).json({ error: err.message, match: null });
  }
};

// ── Spielbericht-Seite parsen ──────────────────────────────────────────────
async function parseMatchReport(page) {
  return await page.evaluate(() => {
    const text = document.body.textContent || "";

    // Status ermitteln
    let status = "upcoming";
    if (text.includes("abgeschlossen") || text.includes("Abgeschlossen")) status = "done";
    else if (text.match(/\d:\d/) && !text.includes("Blanko")) status = "live";

    // Teams
    const teamEls = document.querySelectorAll(".z-label, h1, h2, .team-name, [class*='team']");
    let homeTeam = "Tennis Herrieden", awayTeam = "–";
    const teams = Array.from(teamEls).map(el => el.textContent.trim()).filter(t => t.length > 3 && t.length < 60);
    if (teams.length >= 2) { homeTeam = teams[0]; awayTeam = teams[1]; }

    // Liga
    let league = "–";
    const lgEl = document.querySelector(".liga, .league, [class*='liga'], [class*='league']");
    if (lgEl) league = lgEl.textContent.trim();

    // Mannschaft
    let teamName = "–";
    const mnEl = document.querySelector(".mannschaft, [class*='mannschaft']");
    if (mnEl) teamName = mnEl.textContent.trim();

    // Spielzeit
    let time = "–";
    const timeMatch = text.match(/(\d{1,2}:\d{2})\s*Uhr/);
    if (timeMatch) time = timeMatch[1] + " Uhr";

    // Einzel/Doppel-Zeilen
    const rubbers = [];
    const rubberIds = ["E1","E2","E3","E4","E5","E6","D1","D2","D3"];

    // Versuche Tabellen-Zeilen für Einzel/Doppel zu finden
    const rows = Array.from(document.querySelectorAll("tr"));
    for (const row of rows) {
      const cells = Array.from(row.querySelectorAll("td")).map(td => td.textContent.trim());
      if (cells.length < 3) continue;
      const rowText = cells.join(" ");

      // Prüfe auf Rubber-ID
      const idMatch = rowText.match(/\b(E[1-6]|D[1-3])\b/i);
      if (!idMatch) continue;

      const id = idMatch[1].toUpperCase();
      const home = cells[1] || "–";
      const away = cells[2] || "–";
      const score = cells[3] || "–";

      // Ergebnis bestimmen
      let result = "open";
      if (rowText.includes("abgeschlossen") || rowText.match(/^\d:\d\s*\d:\d/)) {
        // Gewinner bestimmen anhand Satzergebnisse
        const sets = score.match(/(\d):(\d)/g) || [];
        let hw = 0, aw = 0;
        for (const s of sets) {
          const [hn, an] = s.split(":").map(Number);
          if (hn > an) hw++; else aw++;
        }
        result = hw > aw ? "win" : "loss";
      } else if (score && score !== "–" && score !== "") {
        result = "live";
      }

      rubbers.push({ id, home, away, score: score || "–", result });
    }

    return { status, homeTeam, awayTeam, league, teamName, time, rubbers };
  });
}

// ── Fallback: Match aus Listeneintrag bauen ────────────────────────────────
function buildMatchFromRow(matchRow) {
  const cells = matchRow.cells || [];
  const combined = cells.join(" ");

  // Teams aus Text extrahieren
  const vsMatch = combined.match(/(.+?)\s+[-–:vs]+\s+(.+?)(?:\s+\d|$)/i);
  const homeTeam = vsMatch ? vsMatch[1].trim() : "Tennis Herrieden";
  const awayTeam = vsMatch ? vsMatch[2].trim() : "–";

  // Zeit
  const timeMatch = combined.match(/(\d{1,2}:\d{2})/);
  const time = timeMatch ? timeMatch[1] + " Uhr" : "–";

  return {
    status: "upcoming",
    homeTeam,
    awayTeam,
    league: "–",
    teamName: "–",
    time,
    rubbers: [],
  };
}
