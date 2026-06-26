#!/usr/bin/env node
// scripts/fetch-btv-ergebnisse.js
// Liest für jede Mannschaft aus dem BTV-Widget die Ergebnisse gespielter Partien.
// Speichert als btv_club_teams_ergebnisse in Supabase.
//
// Ausführen:
//   SUPABASE_URL=... SUPABASE_SERVICE_KEY=... node scripts/fetch-btv-ergebnisse.js

const { chromium } = require("playwright");
const { createClient } = require("@supabase/supabase-js");

const sb = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

async function saveResult(key, value) {
  await sb.from("settings").upsert(
    { key, value: typeof value === "string" ? value : JSON.stringify(value) },
    { onConflict: "key" }
  );
}

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
    extraHTTPHeaders: { "Accept-Language": "de-DE,de;q=0.9" },
  });
  await context.addInitScript(() => {
    Object.defineProperty(navigator, "webdriver", { get: () => undefined });
    window.chrome = { runtime: {} };
  });
  const page = await context.newPage();
  return { browser, page };
}

async function acceptCookies(page) {
  const selectors = [
    "#CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll",
    ".sp_choice_type_11",
    "[title*='Alle akzeptieren']",
    "button[id*='accept']",
    "[aria-label*='Alle akzeptieren']",
  ];
  for (const sel of selectors) {
    try {
      const btn = await page.$(sel);
      if (btn) { await btn.click(); await page.waitForTimeout(1200); return; }
    } catch (_) {}
  }
}

// Liest alle Spiele (gespielt + ausstehend) aus einem BTV-Widget
// Gibt zurück: [{ opponent, date, isHome, homeScore, awayScore, played }]
async function scrapeWidgetGames(page, widgetUrl, teamName) {
  console.log(`  → ${widgetUrl}`);
  try {
    await page.goto(widgetUrl, {
      waitUntil: "domcontentloaded",
      timeout: 30_000,
      referer: "https://www.btv.de/",
    });
  } catch (e) {
    console.log(`  Ladefehler: ${e.message.slice(0, 80)}`);
    return [];
  }

  await acceptCookies(page);

  try {
    await page.waitForSelector('[class*="gbmeet"]', { timeout: 20_000 });
  } catch (_) {
    console.log("  Keine gbmeet-Container gefunden");
    return [];
  }
  await page.waitForTimeout(2500);

  return await page.evaluate((teamNameArg) => {
    const teamL = teamNameArg.toLowerCase();
    const results = [];

    for (const m of document.querySelectorAll('[class*="gbmeet"]')) {
      const text = m.textContent.replace(/\s+/g, " ").trim();
      const textL = text.toLowerCase();
      if (!textL.includes(teamL)) continue;

      // Datum-Zeit aus Element-Text
      const dateRe = /(\d{1,2})\.(\d{1,2})\.(\d{2,4}),?\s*(\d{1,2}:\d{2})/;
      let matchDate = null;
      let matchTime = null;

      const own = text.match(dateRe);
      if (own) {
        const [, d, mo, y, t] = own;
        const year = y.length === 2 ? "20" + y : y;
        matchDate = `${year}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
        matchTime = t;
      } else {
        // Vorherige Geschwister
        let prev = m.previousElementSibling;
        for (let i = 0; i < 6 && prev && !matchDate; i++) {
          const pm = prev.textContent.replace(/\s+/g," ").match(dateRe);
          if (pm) {
            const [, d, mo, y, t] = pm;
            const year = y.length === 2 ? "20" + y : y;
            matchDate = `${year}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
            matchTime = t;
          }
          prev = prev.previousElementSibling;
        }
      }

      // Heim oder Auswärts bestimmen
      const stripped = text.replace(/^(?:[A-Za-zÄÖÜäöüß]{2,3}\.\s*)?\d{1,2}\.\d{2}\.\d{2,4},?\s*\d{1,2}:\d{2}\s*/, "");
      const strippedL = stripped.toLowerCase();
      const isHome = strippedL.startsWith(teamL);

      // Gegner ermitteln
      let opponent = "";
      if (isHome) {
        const afterTeam = stripped.slice(teamL.length);
        opponent = afterTeam
          .replace(/\d+:\d+/g, " ")
          .replace(/offen|Blanko(-Spielbericht)?|anzeigen|zurückgezogen/gi, " ")
          .replace(/\bHP\b/g, " ")
          .replace(/\s+/g, " ").trim()
          .replace(/^[\s\d:.]+/, "").trim();
      } else {
        const teamPos = strippedL.indexOf(teamL);
        const beforeTeam = stripped.slice(0, teamPos);
        opponent = beforeTeam
          .replace(/\d+:\d+/g, " ")
          .replace(/offen|Blanko(-Spielbericht)?|anzeigen|zurückgezogen/gi, " ")
          .replace(/\bHP\b/g, " ")
          .replace(/\s+/g, " ").trim()
          .replace(/:$/, "").trim();
      }
      if (!opponent || opponent.length < 3 || opponent.length > 60) continue;

      // Status: gespielt = "anzeigen" im Text
      const played = /anzeigen/i.test(text);

      // Score lesen – im Widget sichtbar als N:M z.B. "5:4"
      // BTV zeigt das Gesamtergebnis als erstes \d:\d Element im gbmeet
      let homeScore = null;
      let awayScore = null;
      if (played) {
        // Alle Scores sammeln: Gesamtergebnis steht meist am Anfang, Satz-Scores danach
        const scoreEls = Array.from(m.querySelectorAll(".z-label, span, td"))
          .map(el => el.textContent.trim())
          .filter(t => /^\d{1,2}:\d{1,2}$/.test(t));

        // Erstes Element = Gesamtergebnis (z.B. "5:4"), danach Satzergebnisse ("6:3" ...)
        if (scoreEls.length > 0) {
          const first = scoreEls[0].split(":");
          homeScore = parseInt(first[0], 10);
          awayScore = parseInt(first[1], 10);
          // Wenn isHome=false: aus unserer Sicht sind wir der Gast,
          // also homeScore = gegner, awayScore = wir → tauschen für konsistente Sicht
          if (!isHome) {
            [homeScore, awayScore] = [awayScore, homeScore];
          }
        }

        // Falls kein Score gefunden: "anzeigen" vorhanden aber Score-Elemente leer
        // → als gespielt markieren, Score bleibt null
      }

      results.push({ opponent, date: matchDate, time: matchTime, isHome, played, homeScore, awayScore });
    }
    return results;
  }, teamName);
}

(async () => {
  // Teams-Konfiguration laden
  const { data: cfgRaw } = await sb.from("settings")
    .select("value").eq("key", "btv_teams_config").single();
  let teamsConfig = [];
  try { teamsConfig = cfgRaw?.value ? JSON.parse(cfgRaw.value) : []; } catch (_) {}

  if (!teamsConfig.length) {
    console.log("Keine Staffel-URLs konfiguriert (btv_teams_config leer).");
    process.exit(0);
  }

  const { browser } = await makeBrowser();
  const allResults = [];

  try {
    for (const entry of teamsConfig) {
      const { name, url, teamName } = entry;
      if (!url || !teamName) continue;

      const groupIdM = url.match(/groupid=(\d+)/i);
      const groupId  = groupIdM?.[1];
      const widgetUrl = groupId
        ? `https://widget.btv.de/btvgroup/?groupid=${groupId}`
        : url;

      console.log(`\nMannschaft: "${name}" (${teamName})`);

      const page = await browser.newPage();
      let games = [];
      try {
        games = await scrapeWidgetGames(page, widgetUrl, teamName);
      } finally {
        await page.close();
      }

      const played   = games.filter(g => g.played);
      const upcoming = games.filter(g => !g.played);
      console.log(`  Spiele gesamt: ${games.length} (gespielt: ${played.length}, ausstehend: ${upcoming.length})`);

      played.forEach(g => {
        const score = g.homeScore != null
          ? `${g.homeScore}:${g.awayScore} (aus unserer Sicht)`
          : "(kein Score gefunden)";
        console.log(`  ✓ ${g.date || "??"} ${g.isHome ? "vs." : "@"} ${g.opponent} → ${score}`);
      });
      upcoming.forEach(g => {
        console.log(`  ○ ${g.date || "??"} ${g.isHome ? "vs." : "@"} ${g.opponent}`);
      });

      allResults.push({
        name,
        teamName,
        games,
      });

      // Kurze Pause zwischen Teams
      await new Promise(r => setTimeout(r, 3000));
    }
  } finally {
    await browser.close();
  }

  const out = {
    scrapedAt: new Date().toISOString(),
    groups: allResults,
  };

  await saveResult("btv_club_teams_ergebnisse", out);
  console.log(`\n✓ btv_club_teams_ergebnisse gespeichert (${allResults.length} Mannschaften)`);

  // Übersicht ausgeben
  console.log("\n══ Zusammenfassung ══");
  for (const grp of allResults) {
    const played = grp.games.filter(g => g.played);
    console.log(`${grp.name}: ${played.length} Ergebnisse`);
    for (const g of played) {
      const score = g.homeScore != null ? `${g.homeScore}:${g.awayScore}` : "??:??";
      console.log(`  ${g.date} ${g.isHome ? "vs." : "@"} ${g.opponent} → ${score}`);
    }
  }
})().catch(err => { console.error("FEHLER:", err.message); process.exit(1); });
