#!/usr/bin/env node
// scripts/fetch-btv.js – GitHub Actions Fr/Sa/So alle 10 Minuten
// Nutzt btv-prod.burdadigitalsystems.de (zugänglich von GitHub Actions)
// um den Spielstand zu cachen.

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

// ── btv-prod Seite laden (ZK Framework, braucht JavaScript) ───────────────
async function loadBtvProd(page, url) {
  console.log(`Lade: ${url}`);
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });
  // Warten bis ZK "Verarbeitung..." weg ist
  try {
    await page.waitForFunction(
      () => {
        const zp = document.getElementById("zk_proc");
        return !zp || zp.style.display === "none" || zp.offsetParent === null
               || !document.body.textContent.includes("Verarbeitung");
      },
      { timeout: 25_000 }
    );
  } catch (_) {
    console.log("Warnung: ZK lädt noch nach 25s");
  }
  await page.waitForTimeout(3000);

  const snippet = await page.evaluate(() => document.body.innerText.slice(0, 600));
  console.log("Seiten-Inhalt:\n" + snippet);
}

// ── Spielbericht-Link auf Meetings-Seite finden ───────────────────────────
async function findReportUrl(page, heimTeam, gastTeam) {
  const result = await page.evaluate(({ heim, gast }) => {
    const rows = Array.from(document.querySelectorAll("tr, [class*='row'], [class*='meet']"));
    const allTexts = rows.map(r => r.textContent.trim().replace(/\s+/g," ").slice(0,150));

    for (let i = 0; i < rows.length; i++) {
      const text = rows[i].textContent;
      if (!text.includes(heim) || !text.includes(gast)) continue;

      const rowHtml = rows[i].outerHTML;
      console.log && console.log("Treffer:", allTexts[i]);

      // Alle möglichen Link-Quellen durchsuchen
      for (const a of rows[i].querySelectorAll("a")) {
        const h = a.getAttribute("href") || "";
        if (h && h !== "#" && !h.startsWith("javascript") && h.length > 3)
          return { url: h.startsWith("http") ? h : `https://btv-prod.burdadigitalsystems.de${h}`, how: "href" };
      }
      for (const el of rows[i].querySelectorAll("[onclick]")) {
        const oc = el.getAttribute("onclick") || "";
        const mu = oc.match(/(https?:\/\/[^\s'"]+)/);
        if (mu) return { url: mu[1], how: "onclick-url" };
        const mi = oc.match(/\b(\d{5,})\b/);
        if (mi) return { url: `https://btv-prod.burdadigitalsystems.de/btvmatches/?begid=${mi[1]}`, how: "onclick-id" };
      }
      return { url: null, rowHtml };
    }
    return { url: null, allTexts };
  }, { heim: heimTeam, gast: gastTeam });

  if (result.url) {
    console.log(`Link gefunden (${result.how}): ${result.url}`);
    return result.url;
  }
  if (result.rowHtml) console.log("Row-HTML:\n" + result.rowHtml);
  if (result.allTexts) console.log("Alle Zeilen:\n  " + result.allTexts.join("\n  "));
  return null;
}

// ── Spielbericht parsen ────────────────────────────────────────────────────
async function parseMatchReport(page, reportUrl, heimTeam, gastTeam) {
  await loadBtvProd(page, reportUrl);
  return await page.evaluate(({ heim, gast }) => {
    const text = document.body.textContent || "";
    let status = "upcoming";
    if (/abgeschlossen|beendet/i.test(text))               status = "done";
    else if (text.match(/\d:\d/) && !/Blanko/i.test(text)) status = "live";

    let homeTeam = heim, awayTeam = gast;
    const teamEls = Array.from(
      document.querySelectorAll("h1,h2,h3,.z-label,[class*='team'],[class*='club']")
    ).map(el => el.textContent.trim()).filter(t => t.length > 3 && t.length < 80);
    if (teamEls.length >= 2) { homeTeam = teamEls[0]; awayTeam = teamEls[1]; }

    let league = "–";
    const lgEl = document.querySelector("[class*='liga'],[class*='league'],[class*='gruppe']");
    if (lgEl) league = lgEl.textContent.trim();

    let time = "–";
    const tm = text.match(/(\d{1,2}:\d{2})\s*Uhr/);
    if (tm) time = tm[1] + " Uhr";

    let homeScore = 0, awayScore = 0;
    const scoreM = text.match(/(\d{1,2})\s*:\s*(\d{1,2})/);
    if (scoreM) { homeScore = parseInt(scoreM[1]); awayScore = parseInt(scoreM[2]); }

    const rubbers = [];
    for (const row of document.querySelectorAll("tr")) {
      const cells = Array.from(row.querySelectorAll("td")).map(td => td.textContent.trim());
      if (cells.length < 3) continue;
      const idM = cells.join(" ").match(/\b(E[1-6]|D[1-3])\b/i);
      if (!idM) continue;
      const id = idM[1].toUpperCase();
      const home = cells[1]||"–", away = cells[2]||"–", score = cells[3]||"–";
      let result = "open";
      const sets = score.match(/(\d):(\d)/g) || [];
      if (sets.length) {
        let hw=0,aw=0;
        for (const s of sets) { const [hn,an]=s.split(":").map(Number); if(hn>an)hw++;else aw++; }
        result = hw+aw>=2 ? (hw>aw?"win":"loss") : "live";
      }
      rubbers.push({ id, home, away, score, result });
    }
    return { status, homeTeam, awayTeam, league, time, homeScore, awayScore, rubbers };
  }, { heim: heimTeam, gast: gastTeam });
}

// ── MAIN ──────────────────────────────────────────────────────────────────
(async () => {
  const s        = await getSettings();
  const heimTeam = s.display_mannschaft  || "";
  const gastTeam = s.display_gegner      || "";
  const groupUrl = s.display_match_url   || "";
  const clubnr   = String(s.display_vereinsnummer || "6085").padStart(5, "0");

  console.log(`Heim: "${heimTeam}"  Gast: "${gastTeam}"`);
  console.log(`Gruppe: "${groupUrl}"  Clubnr: ${clubnr}`);

  if (!heimTeam || !gastTeam) {
    console.log("Nicht konfiguriert – nichts zu tun.");
    return;
  }

  // groupid aus Staffel-URL extrahieren
  const groupIdM = groupUrl.match(/groupid=(\d+)/);
  const groupId  = groupIdM ? groupIdM[1] : null;

  // URLs die wir ausprobieren (btv-prod ist von GitHub Actions erreichbar)
  const meetingsUrls = [
    groupId && `https://btv-prod.burdadigitalsystems.de/btvmeetings/?groupid=${groupId}`,
    `https://btv-prod.burdadigitalsystems.de/btvmeetings/?clubnr=${clubnr}`,
  ].filter(Boolean);

  const browser = await chromium.launch({ headless: true });
  const page    = await browser.newPage();
  await page.setViewportSize({ width: 1280, height: 800 });

  try {
    let reportUrl = null;

    for (const url of meetingsUrls) {
      try {
        await loadBtvProd(page, url);
        reportUrl = await findReportUrl(page, heimTeam, gastTeam);
        if (reportUrl) break;
        console.log(`Kein Treffer auf: ${url}`);
      } catch (e) {
        console.log(`Fehler bei ${url}: ${e.message}`);
      }
    }

    if (!reportUrl) {
      console.log("Kein Spielbericht gefunden – speichere upcoming-Status.");
      await saveResult("btv_match_cache", {
        status:"upcoming", homeTeam:heimTeam, awayTeam:gastTeam,
        league:"–", time:"–", homeScore:0, awayScore:0, rubbers:[],
      });
      return;
    }

    const match = await parseMatchReport(page, reportUrl, heimTeam, gastTeam);
    await saveResult("btv_match_cache", match);
    console.log(`Gespeichert: ${match.status}  ${match.homeScore}:${match.awayScore}  ${match.rubbers.length} Einzel`);

  } finally {
    await browser.close();
  }
})().catch(err => {
  console.error("FEHLER:", err.message);
  process.exit(1);
});
