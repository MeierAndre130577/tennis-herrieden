// api/btv-teams.js
// Gibt alle Mannschaften eines Vereins zurück
// GET /api/btv-teams?clubnr=06085

const chromium = require("@sparticuz/chromium");
const { chromium: playwright } = require("playwright-core");

module.exports.config = { maxDuration: 45 };

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "s-maxage=3600, stale-while-revalidate=600");

  const clubnr = String(req.query.clubnr || "06085").padStart(5, "0");

  let browser;
  try {
    browser = await playwright.launch({
      args:            chromium.args,
      defaultViewport: { width: 1280, height: 900 },
      executablePath:  await chromium.executablePath(),
      headless:        chromium.headless,
    });

    const page = await browser.newPage();
    await page.goto(
      `https://btv-prod.burdadigitalsystems.de/btvteams/?clubnr=${clubnr}`,
      { waitUntil: "networkidle", timeout: 25_000 }
    );
    await page.waitForTimeout(2500);

    const teams = await page.evaluate(() => {
      // ZK Framework rendert Mannschaftsnamen als Labels/Links
      const candidates = Array.from(
        document.querySelectorAll("a, span, td, .z-label, .z-listitem")
      )
        .map(el => el.textContent.trim())
        .filter(t =>
          t.length > 3 &&
          t.length < 60 &&
          /^(Herren|Damen|Mixed|Knaben|Mädchen|Junioren|Juniorinnen|Senioren|Seniorinnen)/i.test(t)
        );
      return [...new Set(candidates)];
    });

    await browser.close();
    res.json({ teams, clubnr });
  } catch (err) {
    if (browser) await browser.close();
    console.error("btv-teams error:", err.message);
    res.status(500).json({ error: err.message, teams: [] });
  }
};
