#!/usr/bin/env node
// scripts/fetch-btv.js – GitHub Actions Fr/Sa/So alle 10 Minuten

const { chromium } = require("playwright");
const { createClient } = require("@supabase/supabase-js");

const sb = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

async function getSettings() {
  const { data } = await sb.from("settings").select("*")
    .in("key", ["display_mannschaft", "display_gegner",
                "display_match_url", "display_vereinsnummer"]);
  if (!data) return {};
  return Object.fromEntries(data.map(r => [r.key, r.value]));
}

async function saveResult(key, value) {
  await sb.from("settings").upsert(
    { key, value: typeof value === "string" ? value : JSON.stringify(value) },
    { onConflict: "key" }
  );
}

// ── Browser mit Anti-Bot-Maßnahmen starten ─────────────────────────────────
async function makeBrowser() {
  const browser = await chromium.launch({
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-blink-features=AutomationControlled",
      "--disable-web-security",
    ],
  });
  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
      "(KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
    locale: "de-DE",
    extraHTTPHeaders: {
      "Accept-Language": "de-DE,de;q=0.9",
      "Accept":
        "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    },
  });
  // navigator.webdriver verstecken
  await context.addInitScript(() => {
    Object.defineProperty(navigator, "webdriver", { get: () => undefined });
    window.chrome = { runtime: {} };
  });
  const page = await context.newPage();
  return { browser, page };
}

// ── Seite laden + auf ZK-Inhalt warten ────────────────────────────────────
async function loadPage(page, url, referer) {
  console.log(`Lade: ${url}`);
  if (referer) await page.setExtraHTTPHeaders({ Referer: referer });
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 40_000 });
  // ZK "Verarbeitung..." wegwarten
  try {
    await page.waitForFunction(
      () => !document.body.innerText.includes("Verarbeitung"),
      { timeout: 25_000 }
    );
  } catch (_) {
    console.log("Warnung: ZK noch nicht fertig nach 25s");
  }
  await page.waitForTimeout(3000);
  const txt = await page.evaluate(() => document.body.innerText.slice(0, 500));
  console.log("Inhalt:\n" + txt);
}

// ── Spielbericht-Link in Seite finden ─────────────────────────────────────
async function findLink(page, heim, gast) {
  return await page.evaluate(({ heim, gast }) => {
    const rows = Array.from(
      document.querySelectorAll("tr, [class*='row'], [class*='meet'], [class*='beg']")
    );
    const texts = rows.map(r => r.textContent.trim().replace(/\s+/g, " ").slice(0, 150));

    for (let i = 0; i < rows.length; i++) {
      if (!texts[i].includes(heim) || !texts[i].includes(gast)) continue;
      console.log("Treffer:", texts[i]);
      const row = rows[i];
      // href
      for (const a of row.querySelectorAll("a")) {
        const h = a.getAttribute("href") || "";
        if (h && h !== "#" && !h.startsWith("javascript") && h.length > 5)
          return h.startsWith("http") ? h : `https://btv-prod.burdadigitalsystems.de${h}`;
      }
      // onclick
      for (const el of row.querySelectorAll("[onclick]")) {
        const oc = el.getAttribute("onclick") || "";
        const u = oc.match(/(https?:\/\/[^\s'"]+)/);
        if (u) return u[1];
        const id = oc.match(/\b(\d{5,})\b/);
        if (id)
          return `https://btv-prod.burdadigitalsystems.de/btvmatches/?begid=${id[1]}`;
      }
      return "__row__" + row.outerHTML.slice(0, 800);
    }
    // Kein Treffer – alle Zeilen ausgeben
    return "__rows__" + texts.filter(t => t.length > 5).slice(0, 30).join("\n");
  }, { heim, gast });
}

// ── Spielbericht parsen ────────────────────────────────────────────────────
async function parseReport(page, url, heim, gast) {
  await loadPage(page, url);
  return await page.evaluate(({ heim, gast }) => {
    const text = document.body.textContent || "";
    let status = "upcoming";
    if (/abgeschlossen|beendet/i.test(text))               status = "done";
    else if (text.match(/\d:\d/) && !/Blanko/i.test(text)) status = "live";

    let homeTeam = heim, awayTeam = gast;
    const els = Array.from(
      document.querySelectorAll("h1,h2,h3,.z-label,[class*='team'],[class*='club']")
    ).map(e => e.textContent.trim()).filter(t => t.length > 3 && t.length < 80);
    if (els.length >= 2) { homeTeam = els[0]; awayTeam = els[1]; }

    let league = "–", time = "–", homeScore = 0, awayScore = 0;
    const lg = document.querySelector("[class*='liga'],[class*='league'],[class*='gruppe']");
    if (lg) league = lg.textContent.trim();
    const tm = text.match(/(\d{1,2}:\d{2})\s*Uhr/);
    if (tm) time = tm[1] + " Uhr";
    const sc = text.match(/(\d{1,2})\s*:\s*(\d{1,2})/);
    if (sc) { homeScore = +sc[1]; awayScore = +sc[2]; }

    const rubbers = [];
    for (const row of document.querySelectorAll("tr")) {
      const cells = [...row.querySelectorAll("td")].map(td => td.textContent.trim());
      if (cells.length < 3) continue;
      const idM = cells.join(" ").match(/\b(E[1-6]|D[1-3])\b/i);
      if (!idM) continue;
      const id = idM[1].toUpperCase();
      const score = cells[3] || "–";
      let result = "open";
      const sets = score.match(/(\d):(\d)/g) || [];
      if (sets.length) {
        let hw=0,aw=0;
        sets.forEach(s => { const [a,b]=s.split(":").map(Number); a>b?hw++:aw++; });
        result = hw+aw>=2 ? (hw>aw?"win":"loss") : "live";
      }
      rubbers.push({ id, home:cells[1]||"–", away:cells[2]||"–", score, result });
    }
    return { status, homeTeam, awayTeam, league, time, homeScore, awayScore, rubbers };
  }, { heim, gast });
}

// ── MAIN ──────────────────────────────────────────────────────────────────
(async () => {
  const cfg      = await getSettings();
  const heim     = cfg.display_mannschaft  || "";
  const gast     = cfg.display_gegner      || "";
  const groupUrl = cfg.display_match_url   || "";
  const clubnr   = String(cfg.display_vereinsnummer || "6085").padStart(5, "0");

  console.log(`Heim: "${heim}"  Gast: "${gast}"`);
  if (!heim || !gast) { console.log("Nicht konfiguriert."); return; }

  const groupIdM = groupUrl.match(/groupid=(\d+)/);
  const groupId  = groupIdM?.[1];

  // Alle Kandidaten-URLs (widget.btv.de zuerst, dann btv-prod Fallback)
  const candidates = [
    groupId && { url:`https://widget.btv.de/btvgroup/?groupid=${groupId}`, ref:"https://www.btv.de/" },
    groupId && { url:`https://btv-prod.burdadigitalsystems.de/btvmeetings/?groupid=${groupId}` },
    { url:`https://btv-prod.burdadigitalsystems.de/btvmeetings/?clubnr=${clubnr}` },
  ].filter(Boolean);

  const { browser, page } = await makeBrowser();
  try {
    let reportUrl = null;

    for (const { url, ref } of candidates) {
      try {
        await loadPage(page, url, ref);
        const result = await findLink(page, heim, gast);

        if (!result) { console.log("Kein Treffer."); continue; }
        if (result.startsWith("__rows__")) {
          console.log("Alle Zeilen:\n" + result.slice(8));
          continue;
        }
        if (result.startsWith("__row__")) {
          console.log("Row-HTML (kein Link):\n" + result.slice(7));
          continue;
        }
        reportUrl = result;
        break;
      } catch (e) {
        console.log(`Fehler bei ${url}: ${e.message}`);
      }
    }

    if (!reportUrl) {
      console.log("Kein Spielbericht gefunden → upcoming.");
      await saveResult("btv_match_cache", {
        status:"upcoming", homeTeam:heim, awayTeam:gast,
        league:"–", time:"–", homeScore:0, awayScore:0, rubbers:[],
      });
      return;
    }

    console.log(`Spielbericht: ${reportUrl}`);
    const match = await parseReport(page, reportUrl, heim, gast);
    await saveResult("btv_match_cache", match);
    console.log(`OK: ${match.status}  ${match.homeScore}:${match.awayScore}  ${match.rubbers.length} Einzel`);

  } finally {
    await browser.close();
  }
})().catch(err => { console.error("FEHLER:", err.message); process.exit(1); });
