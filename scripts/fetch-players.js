#!/usr/bin/env node
// scripts/fetch-players.js – Meldelisten aller Staffel-Teams laden (1x pro Saison)

const { chromium } = require("playwright");
const { createClient } = require("@supabase/supabase-js");

const sb = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

async function makeBrowser() {
  const browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-blink-features=AutomationControlled"],
  });
  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
      "(KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
    locale: "de-DE",
    extraHTTPHeaders: {
      "Accept-Language": "de-DE,de;q=0.9",
      "Referer": "https://www.btv.de/",
    },
  });
  await context.addInitScript(() => {
    Object.defineProperty(navigator, "webdriver", { get: () => undefined });
    window.chrome = { runtime: {} };
  });
  const page = await context.newPage();
  return { browser, page };
}

// Alle Teamnamen aus der geladenen Tabelle auslesen
async function readTabelle(page) {
  const text = await page.evaluate(() => document.body?.innerText || "");
  const tabelleIdx = text.indexOf("Tabelle");
  const spielplanIdx = text.indexOf("Spielplan");
  if (tabelleIdx === -1) return [];
  const block = text.slice(tabelleIdx, spielplanIdx > tabelleIdx ? spielplanIdx : tabelleIdx + 2000);
  // Teamnamen: Zeilen die nach RANG/VEREIN/BEG... kommen, haben das Format "1\nTeamName\n2\n..."
  // Wir suchen nach z-toolbarbutton class im HTML stattdessen
  const teams = await page.evaluate(() => {
    const els = [...document.querySelectorAll(".z-toolbarbutton-content, .meeting-team")];
    return [...new Set(els.map(e => (e.innerText || "").trim()).filter(t => t && t.length > 2 && t.length < 60))];
  });
  return teams;
}

// Spielernamen von der aktuellen Team-Portrait-Seite scrapen (mit Pagination)
async function scrapePlayersOnPage(page, teamName) {
  const players = [];
  let pageNum = 1;

  while (true) {
    const text = await page.evaluate(() => document.body?.innerText || "");
    const spielerIdx = text.indexOf("SPIELER");
    if (spielerIdx === -1) {
      // Evtl. "Meldephase nicht abgeschlossen"
      if (/Meldephase/i.test(text)) {
        console.log(`  ⚠ ${teamName}: Meldephase noch nicht abgeschlossen`);
      } else {
        console.log(`  ⚠ ${teamName}: kein SPIELER-Block auf Seite ${pageNum}`);
      }
      break;
    }

    const block = text.slice(spielerIdx);
    const nameRegex = /([A-ZÄÖÜ][A-Za-zäöüßÄÖÜ\-\.]*(?:\s[A-ZÄÖÜ][A-Za-zäöüßÄÖÜ\-\.]*)*,\s[A-ZÄÖÜ][A-Za-zäöüßÄÖÜ\-\.]*(?:\s[A-ZÄÖÜ][A-Za-zäöüßÄÖÜ\-\.]*)*)\s*\(\d{4}\)/g;
    for (const m of [...block.matchAll(nameRegex)]) {
      const name = m[1].trim();
      if (!players.includes(name)) players.push(name);
    }

    const pagMatch = block.match(/\[\s*(\d+)\s*-\s*(\d+)\s*\/\s*(\d+)\s*\]/);
    if (!pagMatch) break;
    const [, , to, total] = pagMatch.map(Number);
    console.log(`    Seite ${pageNum}: ${players.length}/${total} Spieler`);
    if (to >= total) break;

    try {
      await page.click("[class*='z-paging-next']", { timeout: 5000 });
      await page.waitForTimeout(3000);
      pageNum++;
    } catch(_) { break; }
  }

  return players;
}

// Alle Teams einer Staffel scrapen
async function scrapeGroupPlayers(page, groupId, configEntry) {
  const url = `https://btv-prod.burdadigitalsystems.de/btvgroup/?groupid=${groupId}`;
  console.log(`\nLade Staffel ${groupId} (${configEntry.name})...`);
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });
  process.stdout.write("  Warte auf ZK (20s)...");
  await page.waitForTimeout(20_000);

  const bodyLen = await page.evaluate(() => (document.body?.innerText || "").length);
  console.log(` Text: ${bodyLen} Zeichen`);

  if (bodyLen < 200) {
    console.log("  ✗ Widget nicht geladen, überspringe.");
    return { opponents: [], teams: {} };
  }

  // Alle Teams aus der Tabelle lesen
  const allTeams = await readTabelle(page);
  console.log(`  Teams in Staffel: ${allTeams.join(", ")}`);

  const scrapedTeams = {};

  for (const teamName of allTeams) {
    console.log(`\n  → ${teamName}`);
    try {
      await page.getByText(new RegExp(teamName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"), { exact: false }).first().click({ timeout: 8000 });
      await page.waitForTimeout(5000);

      const players = await scrapePlayersOnPage(page, teamName);
      scrapedTeams[teamName] = players;
      console.log(`  ✓ ${teamName}: ${players.length} Spieler`);

      // Zurück zur Tabelle
      try {
        await page.click(".btvbtn.z-button", { timeout: 5000 });
        await page.waitForTimeout(3000);
      } catch(_) {
        // Fallback: Seite neu laden
        await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });
        await page.waitForTimeout(20_000);
      }
    } catch(e) {
      console.log(`  ✗ ${teamName}: ${e.message.slice(0, 80)}`);
    }
  }

  // Gegner = alle Teams außer dem eigenen
  const opponents = allTeams.filter(t => t !== configEntry.teamName);
  return { opponents, teams: scrapedTeams };
}

async function main() {
  // Teams-Konfiguration laden
  const { data: cfgData } = await sb.from("settings").select("value").eq("key", "btv_teams_config").single();
  const teamsConfig = cfgData?.value ? JSON.parse(cfgData.value) : [];

  if (!teamsConfig.length) {
    console.log("Keine Mannschaften konfiguriert. Abbruch.");
    process.exit(0);
  }

  console.log(`${teamsConfig.length} Mannschaft(en) konfiguriert.`);

  const { browser, page } = await makeBrowser();

  const result = {
    scrapedAt: new Date().toISOString(),
    config: [],   // pro Mannschaft: welche Gegner wurden geladen
    teams: {},    // alle Spielerlisten: { "Teamname": ["Name1", ...] }
  };

  // Bereits vorhandene Daten laden (um nichts zu überschreiben falls ein Scrape fehlschlägt)
  const { data: existingData } = await sb.from("settings").select("value").eq("key", "btv_players").single();
  const existing = existingData?.value ? JSON.parse(existingData.value) : null;
  if (existing?.teams) result.teams = existing.teams;

  for (const cfg of teamsConfig) {
    if (!cfg.url) { console.log(`\nKeine URL für ${cfg.name}, überspringe.`); continue; }
    const groupIdM = cfg.url.match(/groupid=(\d+)/i);
    if (!groupIdM) { console.log(`\nKeine groupId in URL für ${cfg.name}, überspringe.`); continue; }
    const groupId = groupIdM[1];

    const { opponents, teams } = await scrapeGroupPlayers(page, groupId, cfg);

    // Teams mergen
    Object.assign(result.teams, teams);

    result.config.push({
      name: cfg.name,
      teamName: cfg.teamName,
      groupId,
      opponents,
    });
  }

  await browser.close();

  // Speichern
  await sb.from("settings").upsert(
    { key: "btv_players", value: JSON.stringify(result) },
    { onConflict: "key" }
  );

  const teamCount = Object.keys(result.teams).length;
  const playerCount = Object.values(result.teams).reduce((s, a) => s + a.length, 0);
  console.log(`\n✓ Gespeichert: ${teamCount} Teams, ${playerCount} Spieler gesamt`);
}

main().catch(e => { console.error(e); process.exit(1); });
