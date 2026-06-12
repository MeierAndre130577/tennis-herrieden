const { chromium } = require("playwright");

// Alle Spieler eines Teams scrapen (mit Pagination)
async function scrapeTeamPlayers(page, teamName) {
  const players = [];

  // Klick auf Teamnamen in der Tabelle
  try {
    await page.getByText(new RegExp(teamName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"), { exact: false }).first().click({ timeout: 10_000 });
    await page.waitForTimeout(5000);
  } catch(e) {
    console.error(`  Klick auf "${teamName}" fehlgeschlagen:`, e.message.slice(0, 80));
    return players;
  }

  // Seiten durchblättern
  let pageNum = 1;
  while (true) {
    const text = await page.evaluate(() => document.body?.innerText || "");

    // Spielernamen extrahieren: "Nachname, Vorname (Jahr)" Muster
    const spielerIdx = text.indexOf("SPIELER");
    if (spielerIdx === -1) {
      console.log(`  SPIELER-Block nicht gefunden auf Seite ${pageNum}`);
      break;
    }

    // Block nach SPIELER bis ZURÜCK
    const block = text.slice(spielerIdx);
    const nameRegex = /([A-ZÄÖÜ][a-zäöüßA-ZÄÖÜ\-\.]*(?:\s[A-ZÄÖÜ][a-zäöüßA-ZÄÖÜ\-\.]*)*,\s[A-ZÄÖÜ][a-zäöüßA-ZÄÖÜ\-\.]*(?:\s[A-ZÄÖÜ][a-zäöüßA-ZÄÖÜ\-\.]*)*)\s*\(\d{4}\)/g;
    const matches = [...block.matchAll(nameRegex)];

    for (const m of matches) {
      const name = m[1].trim();
      if (!players.includes(name)) players.push(name);
    }

    // Paginierung prüfen
    const pagMatch = block.match(/\[\s*(\d+)\s*-\s*(\d+)\s*\/\s*(\d+)\s*\]/);
    if (!pagMatch) break;

    const [, from, to, total] = pagMatch.map(Number);
    console.log(`  Seite ${pageNum}: ${from}-${to} von ${total} (${players.length} Namen bisher)`);

    if (to >= total) break;

    // Nächste Seite: klick auf z-paging-next
    try {
      await page.click("[class*='z-paging-next']", { timeout: 5000 });
      await page.waitForTimeout(3000);
      pageNum++;
    } catch(e) {
      console.log("  Paging-Next fehlgeschlagen:", e.message.slice(0, 60));
      break;
    }
  }

  return players;
}

(async () => {
  const browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-blink-features=AutomationControlled"],
  });
  const context = await browser.newContext({
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
    locale: "de-DE",
    extraHTTPHeaders: { "Accept-Language": "de-DE,de;q=0.9", "Referer": "https://www.btv.de/" },
  });
  await context.addInitScript(() => {
    Object.defineProperty(navigator, "webdriver", { get: () => undefined });
    window.chrome = { runtime: {} };
  });

  const groupId = "2165710";
  const widgetUrl = `https://btv-prod.burdadigitalsystems.de/btvgroup/?groupid=${groupId}`;

  async function freshWidget() {
    const p = await context.newPage();
    await p.goto(widgetUrl, { waitUntil: "domcontentloaded", timeout: 30_000 });
    process.stdout.write("Warte auf ZK (20s)...");
    await p.waitForTimeout(20_000);
    const t = await p.evaluate(() => document.body?.innerText || "");
    console.log(` Text-Länge: ${t.length}`);
    return p;
  }

  // SG Herrieden
  console.log("\n=== SG Herrieden ===");
  const p1 = await freshWidget();
  const heim = await scrapeTeamPlayers(p1, "SG Herrieden");
  await p1.close();
  console.log(`Ergebnis: ${heim.length} Spieler`);
  heim.forEach((n, i) => console.log(`  ${i+1}. ${n}`));

  // CaM Nürnberg (Gast-Beispiel)
  console.log("\n=== CaM Nürnberg ===");
  const p2 = await freshWidget();
  const gast = await scrapeTeamPlayers(p2, "CaM Nürnberg");
  await p2.close();
  console.log(`Ergebnis: ${gast.length} Spieler`);
  gast.forEach((n, i) => console.log(`  ${i+1}. ${n}`));

  await browser.close();
})();
