// api/btv-matches.js
// Vercel Serverless Function – holt live Spielstanddaten von btv.de via Playwright
//
// Query-Parameter:
//   clubnr      – BTV-Vereinsnummer, z.B. "6085" oder "06085"
//   saison      – Saison-Jahr, z.B. "2026"
//   mannschaft  – Mannschaftsname, z.B. "Herren I"
//   gegner      – Gegnername, z.B. "TC Ansbach 1920 e.V."

const chromium = require("@sparticuz/chromium");
const { chromium: playwright } = require("playwright-core");

module.exports.config = { maxDuration: 45 };

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "s-maxage=60, stale-while-revalidate=30");

  const rawNr      = req.query.clubnr      || "06085";
  const saison     = req.query.saison      || "2026";
  const mannschaft = req.query.mannschaft  || "";
  const gegner     = req.query.gegner      || "";
  const clubnr     = String(rawNr).padStart(5, "0");

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
      const heimBtn = page.locator("text=Heimspiele").first();
      await heimBtn.click({ timeout: 5000 });
      await page.waitForTimeout(2000);
    } catch (_) { /* kein Filter */ }

    // ── 3. Passendes Spiel finden ─────────────────────────────────────────
    // Suche: Wenn Mannschaft+Gegner angegeben → gezielt; sonst heute
    const today = new Date().toISOString().slice(0, 10);

    const matches = await page.evaluate((opts) => {
      const { todayStr, mannschaft, gegner } = opts;
      const rows = Array.from(document.querySelectorAll("tr, .z-row, .begegnung-row, [class*='row']"));
      const results = [];

      for (const row of rows) {
        const text = row.textContent || "";
        const dateMatch = text.match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/);
        if (!dateMatch) continue;
        const [, d, m, y] = dateMatch;
        const rowDate = `${y}-${m.padStart(2,"0")}-${d.padStart(2,"0")}`;

        // Filter 1: Wenn Gegner angegeben → muss im Text vorkommen
        if (gegner && !text.includes(gegner)) continue;
        // Filter 2: Wenn Mannschaft angegeben → muss im Text vorkommen
        if (mannschaft && !text.includes(mannschaft)) continue;
        // Filter 3: Kein Gegner angegeben → nur heutiges Datum
        if (!gegner && rowDate !== todayStr) continue;

        const cells = Array.from(row.querySelectorAll("td, .z-cell, span, div"))
          .map(el => el.textContent.trim()).filter(Boolean);
        const link = row.querySelector("a[href*='begid'], a[href*='btvmatchreport'], a[href*='spielbericht']");
        const href = link ? link.getAttribute("href") : null;

        results.push({ rowDate, cells, href });
      }
      return results;
    }, { todayStr: today, mannschaft, gegner });

    if (matches.length === 0) {
      await browser.close();
      return res.json({
        match: null,
        debug: { message: "Kein passendes Spiel gefunden", clubnr, mannschaft, gegner, today }
      });
    }

    // ── 4. Spielbericht laden ────────────────────────────────────────────
    const matchRow = matches[0];
    let matchData = null;

    // Link aus geparsten Matches oder direkt von der Seite
    const rawHref = matchRow.href || null;
    try {
      let reportHref = rawHref;
      if (!reportHref) {
        const link = await page.locator("a[href*='btvmatchreport'], a[href*='begid'], a[href*='spielbericht']").first();
        reportHref = await link.getAttribute("href").catch(() => null);
      }
      if (reportHref) {
        const reportUrl = reportHref.startsWith("http")
          ? reportHref
          : `https://btv-prod.burdadigitalsystems.de${reportHref}`;
        await page.goto(reportUrl, { waitUntil: "networkidle", timeout: 20_000 });
        await page.waitForTimeout(2000);
        matchData = await parseMatchReport(page, { mannschaft, gegner });
      }
    } catch (_) { /* Fallback */ }

    if (!matchData) {
      matchData = buildMatchFromRow(matchRow, { mannschaft, gegner });
    }

    await browser.close();
    res.json({ match: matchData, debug: { clubnr, saison, mannschaft, gegner } });

  } catch (err) {
    if (browser) await browser.close();
    console.error("btv-matches error:", err);
    res.status(500).json({ error: err.message, match: null });
  }
};

// ── Spielbericht-Seite parsen ──────────────────────────────────────────────
async function parseMatchReport(page, hints = {}) {
  return await page.evaluate((h) => {
    const text = document.body.textContent || "";

    // Status ermitteln
    let status = "upcoming";
    if (text.includes("abgeschlossen") || text.includes("Abgeschlossen")) status = "done";
    else if (text.match(/\d:\d/) && !text.includes("Blanko")) status = "live";

    // Teams – Hints als Fallback nutzen
    const teamEls = document.querySelectorAll(".z-label, h1, h2, .team-name, [class*='team']");
    let homeTeam = h.mannschaft || "Tennis Herrieden", awayTeam = h.gegner || "–";
    const teamTexts = Array.from(teamEls).map(el => el.textContent.trim()).filter(t => t.length > 3 && t.length < 60);
    if (teamTexts.length >= 2) { homeTeam = teamTexts[0]; awayTeam = teamTexts[1]; }

    // Liga
    let league = "–";
    const lgEl = document.querySelector(".liga, .league, [class*='liga'], [class*='league']");
    if (lgEl) league = lgEl.textContent.trim();

    // Mannschaft (teamName = Kurzform wie "Herren I")
    let teamName = h.mannschaft || "–";
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
  }, hints);
}

// ── Fallback: Match aus Listeneintrag bauen ────────────────────────────────
function buildMatchFromRow(matchRow, hints = {}) {
  const cells = matchRow.cells || [];
  const combined = cells.join(" ");

  // Teams – Hints als Fallback
  const vsMatch = combined.match(/(.+?)\s+[-–:vs]+\s+(.+?)(?:\s+\d|$)/i);
  const homeTeam = vsMatch ? vsMatch[1].trim() : (hints.mannschaft || "Tennis Herrieden");
  const awayTeam = vsMatch ? vsMatch[2].trim() : (hints.gegner     || "–");

  // Zeit
  const timeMatch = combined.match(/(\d{1,2}:\d{2})/);
  const time = timeMatch ? timeMatch[1] + " Uhr" : "–";

  return {
    status: "upcoming",
    homeTeam,
    awayTeam,
    league:   "–",
    teamName: hints.mannschaft || "–",
    time,
    rubbers:  [],
  };
}
