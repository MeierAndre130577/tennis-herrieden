// api/btv-spiele.js
// Gibt alle Heimspiele einer Mannschaft zurück
// GET /api/btv-spiele?clubnr=06085&mannschaft=Herren+I

const chromium = require("@sparticuz/chromium");
const { chromium: playwright } = require("playwright-core");

module.exports.config = { maxDuration: 45 };

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "s-maxage=1800, stale-while-revalidate=300");

  const clubnr     = String(req.query.clubnr     || "06085").padStart(5, "0");
  const mannschaft = req.query.mannschaft || "";

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
      `https://btv-prod.burdadigitalsystems.de/btvmeetings/?clubnr=${clubnr}`,
      { waitUntil: "networkidle", timeout: 25_000 }
    );
    await page.waitForTimeout(2500);

    // Klick auf "Heimspiele"-Filter
    try {
      const heimBtn = page.locator("text=Heimspiele").first();
      await heimBtn.click({ timeout: 5000 });
      await page.waitForTimeout(2000);
    } catch (_) { /* kein Filter vorhanden */ }

    // Falls Mannschaft angegeben: nach ihr filtern
    if (mannschaft) {
      try {
        // Versuche einen Mannschafts-Tab/-Filter anzuklicken
        const mBtn = page.locator(`text=${mannschaft}`).first();
        await mBtn.click({ timeout: 4000 });
        await page.waitForTimeout(1500);
      } catch (_) { /* kein Mannschaftsfilter */ }
    }

    const spiele = await page.evaluate((mName) => {
      const result = [];
      const rows = Array.from(document.querySelectorAll("tr, .z-row, [class*='row']"));

      for (const row of rows) {
        const text = row.textContent || "";
        // Datumsformat TT.MM.JJJJ
        const dateMatch = text.match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/);
        if (!dateMatch) continue;
        const [, d, m, y] = dateMatch;
        const isoDate = `${y}-${m.padStart(2,"0")}-${d.padStart(2,"0")}`;
        const displayDate = `${d}.${m}.${y}`;

        // Wenn Mannschaft angegeben, nur deren Spiele
        if (mName && !text.includes(mName)) continue;

        // Teams extrahieren
        const cells = Array.from(row.querySelectorAll("td, .z-cell, span"))
          .map(el => el.textContent.trim())
          .filter(t => t.length > 2);

        // Gegner herausfinden (erstes Team das nicht Heimteam ist)
        let gegner = "–";
        for (const cell of cells) {
          if (
            cell.length > 4 &&
            cell.length < 60 &&
            !cell.match(/^\d/) &&
            !cell.match(/^(Heimspiel|Auswärtsspiel)/i) &&
            !cell.includes(mName || "")
          ) {
            gegner = cell;
            break;
          }
        }

        // Begegnungs-ID aus Links suchen
        let begid = null;
        const link = row.querySelector("a[href*='begid'], a[href*='btvmatchreport']");
        if (link) {
          const href = link.getAttribute("href") || "";
          const m2 = href.match(/begid[=\/](\d+)/i);
          if (m2) begid = m2[1];
        }

        if (gegner !== "–") {
          result.push({ isoDate, displayDate, gegner, begid });
        }
      }

      // Duplikate entfernen, nach Datum sortieren
      const seen = new Set();
      return result
        .filter(s => {
          const key = s.isoDate + s.gegner;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        })
        .sort((a, b) => a.isoDate.localeCompare(b.isoDate));
    }, mannschaft);

    await browser.close();
    res.json({ spiele, clubnr, mannschaft });
  } catch (err) {
    if (browser) await browser.close();
    console.error("btv-spiele error:", err.message);
    res.status(500).json({ error: err.message, spiele: [] });
  }
};
