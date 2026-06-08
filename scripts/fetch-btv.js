#!/usr/bin/env node
// scripts/fetch-btv.js
// Wird von GitHub Actions aufgerufen.
// Holt Daten von btv.de via Playwright und speichert sie in Supabase.

const { chromium } = require("playwright");
const { createClient } = require("@supabase/supabase-js");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY; // Service-Key (nicht anon!)
const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

async function getSettings() {
  const { data } = await sb.from("settings").select("*")
    .in("key", ["display_vereinsnummer", "display_saison", "display_mannschaft", "display_gegner"]);
  if (!data) return {};
  return Object.fromEntries(data.map(r => [r.key, r.value]));
}

async function saveResult(key, value) {
  await sb.from("settings").upsert(
    { key, value: typeof value === "string" ? value : JSON.stringify(value) },
    { onConflict: "key" }
  );
}

// ── Teams laden ────────────────────────────────────────────────────────────
async function fetchTeams(page, clubnr) {
  await page.goto(
    `https://btv-prod.burdadigitalsystems.de/btvteams/?clubnr=${clubnr}`,
    { waitUntil: "networkidle", timeout: 30_000 }
  );
  await page.waitForTimeout(3000);

  return await page.evaluate(() => {
    const candidates = Array.from(document.querySelectorAll("a, span, td, label"))
      .map(el => el.textContent.trim())
      .filter(t =>
        t.length > 3 && t.length < 60 &&
        /^(Herren|Damen|Mixed|Knaben|Mädchen|Junioren|Juniorinnen|Senioren|Seniorinnen)/i.test(t)
      );
    return [...new Set(candidates)];
  });
}

// ── Spiele laden ───────────────────────────────────────────────────────────
async function fetchSpiele(page, clubnr, mannschaft) {
  await page.goto(
    `https://btv-prod.burdadigitalsystems.de/btvmeetings/?clubnr=${clubnr}`,
    { waitUntil: "networkidle", timeout: 30_000 }
  );
  await page.waitForTimeout(3000);

  // Heimspiele-Filter
  try {
    await page.locator("text=Heimspiele").first().click({ timeout: 5000 });
    await page.waitForTimeout(2000);
  } catch (_) {}

  return await page.evaluate((mName) => {
    const result = [];
    const rows = Array.from(document.querySelectorAll("tr, [class*='row']"));
    for (const row of rows) {
      const text = row.textContent || "";
      if (mName && !text.includes(mName)) continue;
      const dm = text.match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/);
      if (!dm) continue;
      const [, d, m, y] = dm;
      const isoDate = `${y}-${m.padStart(2,"0")}-${d.padStart(2,"0")}`;
      const cells = Array.from(row.querySelectorAll("td, span"))
        .map(el => el.textContent.trim()).filter(t => t.length > 2 && t.length < 80);
      let gegner = null;
      for (const c of cells) {
        if (c.length > 5 && !c.match(/^\d/) && !(mName && c.includes(mName))) {
          gegner = c; break;
        }
      }
      if (!gegner) continue;
      const link = row.querySelector("a[href*='begid'], a[href*='spielbericht'], a[href*='matchreport']");
      const href = link?.getAttribute("href") || null;
      result.push({ isoDate, displayDate: `${d}.${m}.${y}`, gegner, href });
    }
    const seen = new Set();
    return result.filter(s => {
      const k = s.isoDate + s.gegner;
      if (seen.has(k)) return false;
      seen.add(k); return true;
    }).sort((a, b) => a.isoDate.localeCompare(b.isoDate));
  }, mannschaft);
}

// ── Spielstand laden ───────────────────────────────────────────────────────
async function fetchMatch(page, clubnr, mannschaft, gegner) {
  await page.goto(
    `https://btv-prod.burdadigitalsystems.de/btvmeetings/?clubnr=${clubnr}`,
    { waitUntil: "networkidle", timeout: 30_000 }
  );
  await page.waitForTimeout(3000);

  try {
    await page.locator("text=Heimspiele").first().click({ timeout: 5000 });
    await page.waitForTimeout(2000);
  } catch (_) {}

  const today = new Date().toISOString().slice(0, 10);
  const matches = await page.evaluate((opts) => {
    const { mannschaft, gegner } = opts;
    const rows = Array.from(document.querySelectorAll("tr, [class*='row']"));
    const results = [];
    for (const row of rows) {
      const text = row.textContent || "";
      if (mannschaft && !text.includes(mannschaft)) continue;
      if (gegner     && !text.includes(gegner))     continue;
      const dm = text.match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/);
      if (!dm) continue;
      const link = row.querySelector("a[href*='begid'], a[href*='spielbericht'], a[href*='matchreport']");
      results.push({ href: link?.getAttribute("href") || null });
    }
    return results;
  }, { mannschaft, gegner });

  if (!matches.length || !matches[0].href) return null;

  const rawHref = matches[0].href;
  const reportUrl = rawHref.startsWith("http")
    ? rawHref
    : `https://btv-prod.burdadigitalsystems.de${rawHref}`;

  await page.goto(reportUrl, { waitUntil: "networkidle", timeout: 25_000 });
  await page.waitForTimeout(2000);

  return await page.evaluate((hints) => {
    const text = document.body.textContent || "";
    let status = "upcoming";
    if (/abgeschlossen/i.test(text))                        status = "done";
    else if (text.match(/\d:\d/) && !/Blanko/i.test(text)) status = "live";

    let homeTeam = hints.mannschaft || "Tennis Herrieden";
    let awayTeam = hints.gegner     || "–";
    const teamEls = Array.from(document.querySelectorAll("h1,h2,.z-label,[class*='team']"))
      .map(el => el.textContent.trim()).filter(t => t.length > 3 && t.length < 60);
    if (teamEls.length >= 2) { homeTeam = teamEls[0]; awayTeam = teamEls[1]; }

    let league = "–";
    const lgEl = document.querySelector("[class*='liga'],[class*='league']");
    if (lgEl) league = lgEl.textContent.trim();

    let time = "–";
    const tm = text.match(/(\d{1,2}:\d{2})\s*Uhr/);
    if (tm) time = tm[1] + " Uhr";

    const rubbers = [];
    for (const row of document.querySelectorAll("tr")) {
      const cells = Array.from(row.querySelectorAll("td")).map(td => td.textContent.trim());
      if (cells.length < 3) continue;
      const rowText = cells.join(" ");
      const idM = rowText.match(/\b(E[1-6]|D[1-3])\b/i);
      if (!idM) continue;
      const id = idM[1].toUpperCase();
      const home = cells[1] || "–"; const away = cells[2] || "–"; const score = cells[3] || "–";
      let result = "open";
      const sets = score.match(/(\d):(\d)/g) || [];
      if (sets.length > 0) {
        let hw = 0, aw = 0;
        for (const s of sets) { const [hn,an]=s.split(":").map(Number); if(hn>an)hw++;else aw++; }
        result = hw+aw >= 2 ? (hw>aw?"win":"loss") : "live";
      }
      rubbers.push({ id, home, away, score, result });
    }
    return { status, homeTeam, awayTeam, league, teamName: hints.mannschaft||"–", time, rubbers };
  }, { mannschaft, gegner });
}

// ── MAIN ──────────────────────────────────────────────────────────────────
(async () => {
  const settings = await getSettings();
  const clubnr    = String(settings.display_vereinsnummer || "06085").padStart(5,"0");
  const mannschaft= settings.display_mannschaft || "";
  const gegner    = settings.display_gegner     || "";

  console.log(`Fetching BTV data for club=${clubnr}, team=${mannschaft}, opponent=${gegner}`);

  const browser = await chromium.launch({ headless: true });
  const page    = await browser.newPage();

  try {
    // Teams cachen
    const teams = await fetchTeams(page, clubnr);
    await saveResult("btv_teams_cache", teams);
    console.log(`Teams: ${teams.join(", ")}`);

    // Spiele cachen (wenn Mannschaft bekannt)
    if (mannschaft) {
      const spiele = await fetchSpiele(page, clubnr, mannschaft);
      await saveResult("btv_spiele_cache", spiele);
      console.log(`Spiele: ${spiele.length} gefunden`);
    }

    // Aktuellen Spielstand cachen
    if (mannschaft && gegner) {
      const match = await fetchMatch(page, clubnr, mannschaft, gegner);
      await saveResult("btv_match_cache", match);
      console.log(`Match: ${match ? match.status : "nicht gefunden"}`);
    }
  } finally {
    await browser.close();
  }
})().catch(err => {
  console.error("FEHLER:", err.message);
  process.exit(1);
});
