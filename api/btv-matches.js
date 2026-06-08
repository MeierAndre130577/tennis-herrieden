// api/btv-matches.js
// Holt live Spielstanddaten von btv.de
// GET /api/btv-matches?clubnr=06085&saison=2026&mannschaft=Herren+I&gegner=TC+Ansbach

const chromium  = require("@sparticuz/chromium");
const puppeteer = require("puppeteer-core");

module.exports.config = { maxDuration: 45 };

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "s-maxage=60, stale-while-revalidate=30");

  const clubnr     = String(req.query.clubnr    || "06085").padStart(5, "0");
  const saison     = req.query.saison            || "2026";
  const mannschaft = req.query.mannschaft        || "";
  const gegner     = req.query.gegner            || "";

  let browser;
  try {
    browser = await puppeteer.launch({
      args:            chromium.args,
      defaultViewport: { width: 1280, height: 900 },
      executablePath:  await chromium.executablePath(),
      headless:        true,
    });

    const page = await browser.newPage();
    await page.goto(
      `https://btv-prod.burdadigitalsystems.de/btvmeetings/?clubnr=${clubnr}`,
      { waitUntil: "networkidle0", timeout: 25_000 }
    );
    await page.waitForTimeout(2500);

    // Heimspiele-Filter
    try {
      await page.evaluate(() => {
        const el = Array.from(document.querySelectorAll("button, a, span, td, label"))
          .find(e => e.textContent.trim() === "Heimspiele");
        if (el) el.click();
      });
      await page.waitForTimeout(2000);
    } catch (_) {}

    const today = new Date().toISOString().slice(0, 10);

    // Passendes Spiel finden
    const matches = await page.evaluate((opts) => {
      const { todayStr, mannschaft, gegner } = opts;
      const rows = Array.from(document.querySelectorAll("tr, [class*='row']"));
      const results = [];

      for (const row of rows) {
        const text = row.textContent || "";
        if (mannschaft && !text.includes(mannschaft)) continue;
        if (gegner     && !text.includes(gegner))     continue;

        const dm = text.match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/);
        if (!dm) continue;
        const [, d, m, y] = dm;
        const rowDate = `${y}-${m.padStart(2,"0")}-${d.padStart(2,"0")}`;

        // Kein Gegner angegeben → nur heutiges Datum
        if (!gegner && rowDate !== todayStr) continue;

        const link  = row.querySelector("a[href*='begid'], a[href*='spielbericht'], a[href*='matchreport']");
        const href  = link ? link.getAttribute("href") : null;
        results.push({ rowDate, href });
      }
      return results;
    }, { todayStr: today, mannschaft, gegner });

    if (!matches.length) {
      await browser.close();
      return res.json({
        match: null,
        debug: { message: "Kein passendes Spiel gefunden", clubnr, mannschaft, gegner, today }
      });
    }

    // Spielbericht laden
    let matchData = null;
    const rawHref = matches[0].href;
    if (rawHref) {
      const reportUrl = rawHref.startsWith("http")
        ? rawHref
        : `https://btv-prod.burdadigitalsystems.de${rawHref}`;
      await page.goto(reportUrl, { waitUntil: "networkidle0", timeout: 20_000 });
      await page.waitForTimeout(2000);
      matchData = await parseMatchReport(page, { mannschaft, gegner });
    }

    if (!matchData) {
      matchData = buildFallback({ mannschaft, gegner });
    }

    await browser.close();
    res.json({ match: matchData, debug: { clubnr, saison, mannschaft, gegner } });

  } catch (err) {
    if (browser) await browser.close().catch(() => {});
    console.error("btv-matches error:", err.message);
    res.status(500).json({ error: err.message, match: null });
  }
};

// ── Spielbericht parsen ────────────────────────────────────────────────────
async function parseMatchReport(page, hints = {}) {
  return await page.evaluate((h) => {
    const text = document.body.textContent || "";

    // Status
    let status = "upcoming";
    if (/abgeschlossen/i.test(text))                         status = "done";
    else if (text.match(/\d:\d/) && !/Blanko/i.test(text))  status = "live";

    // Teams
    let homeTeam = h.mannschaft || "Tennis Herrieden";
    let awayTeam = h.gegner     || "–";
    const teamEls = Array.from(document.querySelectorAll("h1,h2,.z-label,[class*='team']"))
      .map(el => el.textContent.trim())
      .filter(t => t.length > 3 && t.length < 60);
    if (teamEls.length >= 2) { homeTeam = teamEls[0]; awayTeam = teamEls[1]; }

    // Liga
    let league = "–";
    const lgEl = document.querySelector("[class*='liga'],[class*='league'],.liga,.league");
    if (lgEl) league = lgEl.textContent.trim();

    // Spielzeit
    let time = "–";
    const tm = text.match(/(\d{1,2}:\d{2})\s*Uhr/);
    if (tm) time = tm[1] + " Uhr";

    // Rubbers (E1-E6, D1-D3)
    const rubbers = [];
    for (const row of document.querySelectorAll("tr")) {
      const cells = Array.from(row.querySelectorAll("td")).map(td => td.textContent.trim());
      if (cells.length < 3) continue;
      const rowText = cells.join(" ");
      const idM = rowText.match(/\b(E[1-6]|D[1-3])\b/i);
      if (!idM) continue;

      const id    = idM[1].toUpperCase();
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
        // Wenn alle Sätze gespielt → done, sonst live
        if (hw + aw >= 2) result = hw > aw ? "win" : "loss";
        else result = "live";
      }

      rubbers.push({ id, home, away, score, result });
    }

    return { status, homeTeam, awayTeam, league, teamName: h.mannschaft || "–", time, rubbers };
  }, hints);
}

// ── Fallback ───────────────────────────────────────────────────────────────
function buildFallback({ mannschaft, gegner }) {
  return {
    status:   "upcoming",
    homeTeam: mannschaft || "Tennis Herrieden",
    awayTeam: gegner     || "–",
    league:   "–",
    teamName: mannschaft || "–",
    time:     "–",
    rubbers:  [],
  };
}
