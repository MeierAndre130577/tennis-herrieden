// api/btv-spiele.js
// Gibt Heimspiele einer Mannschaft zurück
// GET /api/btv-spiele?clubnr=06085&mannschaft=Herren+I

const chromium  = require("@sparticuz/chromium");
const puppeteer = require("puppeteer-core");

module.exports.config = { maxDuration: 45 };

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "s-maxage=1800, stale-while-revalidate=300");

  const clubnr     = String(req.query.clubnr || "06085").padStart(5, "0");
  const mannschaft = req.query.mannschaft || "";

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

    // Heimspiele-Filter klicken
    try {
      await page.evaluate(() => {
        const els = Array.from(document.querySelectorAll("button, a, span, td, label"));
        const el  = els.find(e => e.textContent.trim() === "Heimspiele");
        if (el) el.click();
      });
      await page.waitForTimeout(2000);
    } catch (_) {}

    const spiele = await page.evaluate((mName) => {
      const result = [];
      const rows   = Array.from(document.querySelectorAll("tr, [class*='row']"));

      for (const row of rows) {
        const text = row.textContent || "";
        if (mName && !text.includes(mName)) continue;

        const dateMatch = text.match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/);
        if (!dateMatch) continue;
        const [, d, m, y] = dateMatch;
        const isoDate     = `${y}-${m.padStart(2,"0")}-${d.padStart(2,"0")}`;
        const displayDate = `${d}.${m}.${y}`;

        const cells = Array.from(row.querySelectorAll("td, span"))
          .map(el => el.textContent.trim())
          .filter(t => t.length > 2 && t.length < 80);

        // Gegner = erstes längeres Textfeld das kein Datum/Zahl/Mannschaftsname ist
        let gegner = null;
        for (const c of cells) {
          if (
            c.length > 5 &&
            !c.match(/^\d/) &&
            !c.match(/^\d{1,2}\.\d{1,2}\./) &&
            !(mName && c.includes(mName))
          ) {
            gegner = c;
            break;
          }
        }
        if (!gegner) continue;

        const link  = row.querySelector("a[href*='begid'], a[href*='spielbericht'], a[href*='matchreport']");
        const href  = link ? link.getAttribute("href") : null;
        const bm    = href ? href.match(/begid[=\/](\d+)/i) : null;
        const begid = bm ? bm[1] : null;

        result.push({ isoDate, displayDate, gegner, begid });
      }

      // Deduplizieren + sortieren
      const seen = new Set();
      return result
        .filter(s => {
          const k = s.isoDate + s.gegner;
          if (seen.has(k)) return false;
          seen.add(k); return true;
        })
        .sort((a, b) => a.isoDate.localeCompare(b.isoDate));
    }, mannschaft);

    await browser.close();
    res.json({ spiele, clubnr, mannschaft });
  } catch (err) {
    if (browser) await browser.close().catch(() => {});
    console.error("btv-spiele error:", err.message);
    res.status(500).json({ error: err.message, spiele: [] });
  }
};
