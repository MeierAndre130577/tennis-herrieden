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

// ── Anti-Bot-Browser ────────────────────────────────────────────────────────
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

// ── Cookie-Banner wegklicken ────────────────────────────────────────────────
async function acceptCookies(page) {
  const selectors = [
    "#CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll",
    ".sp_choice_type_11",           // Sourcepoint "Accept All"
    "[title*='Alle akzeptieren']",
    "[title*='Accept all']",
    "button[id*='accept']",
    "button[id*='Accept']",
    "a[id*='accept']",
    "[aria-label*='Alle akzeptieren']",
    "[aria-label*='accept all']",
  ];
  for (const sel of selectors) {
    try {
      const btn = await page.$(sel);
      if (btn) {
        await btn.click();
        console.log("Cookie-Banner akzeptiert:", sel);
        await page.waitForTimeout(1500);
        return true;
      }
    } catch (_) {}
  }
  return false;
}

// ── ZK-Ladeindikator abwarten ───────────────────────────────────────────────
async function waitForZk(page, extraMs = 2000) {
  try {
    await page.waitForFunction(
      () => !document.body.innerText.includes("Verarbeitung"),
      { timeout: 25_000 }
    );
  } catch (_) {
    console.log("Warnung: ZK noch nicht fertig nach 25s");
  }
  await page.waitForTimeout(extraMs);
}

// ══════════════════════════════════════════════════════════════════════════════
// ANSATZ 1: widget.btv.de – gbmeeting-Container direkt auslesen
// ══════════════════════════════════════════════════════════════════════════════
async function tryWidget(page, groupId, heim, gast) {
  const url = `https://widget.btv.de/btvgroup/?groupid=${groupId}`;
  console.log("\n=== widget.btv.de ===");
  try {
    await page.goto(url, {
      waitUntil: "domcontentloaded",
      timeout: 40_000,
      referer: "https://www.btv.de/",
    });
  } catch (e) {
    console.log("Ladefehler:", e.message); return null;
  }

  // Cookie-Banner
  const cookieAccepted = await acceptCookies(page);
  if (!cookieAccepted) console.log("Kein Cookie-Banner gefunden");

  // Auf gbmeeting-Container warten
  try {
    await page.waitForSelector('[class*="gbmeet"]', { timeout: 25_000 });
    console.log("gbmeeting-Container gefunden");
  } catch (_) {
    console.log("Keine gbmeeting-Container nach 25s");
    await waitForZk(page, 0);
  }
  await page.waitForTimeout(2000);

  // ── Schritt 1: Header-Daten aus gbmeeting lesen ──────────────────────────
  const header = await page.evaluate(({ heim, gast }) => {
    const heimL = heim.toLowerCase();
    const gastL = gast.toLowerCase();
    const meetings = Array.from(document.querySelectorAll('[class*="gbmeet"]'));
    const allTexts = meetings.map(m =>
      m.textContent.trim().replace(/\s+/g, " ").slice(0, 120)
    );

    for (const m of meetings) {
      if (!m.textContent.toLowerCase().includes(heimL)) continue;
      if (!m.textContent.toLowerCase().includes(gastL)) continue;

      // ── Status ──────────────────────────────────────────────────────────
      const mText = m.textContent;
      let status = "upcoming";
      if (/blanko/i.test(mText)) {
        status = "upcoming";
      } else if (/anzeigen/i.test(mText)) {
        // Match-Score = alle Spans die genau "X:Y" (1 Ziffer je Seite) zeigen
        const singleScores = Array.from(m.querySelectorAll(".z-label, span"))
          .map(el => el.textContent.trim())
          .filter(t => /^\d:\d$/.test(t));   // nur einstellig: 0:9, 5:4 etc.
        const first = singleScores[0] || "0:0";
        const [h, a] = first.split(":").map(Number);
        status = h + a >= 9 ? "done" : "live";
      }

      // ── Zeit ────────────────────────────────────────────────────────────
      const timeM = mText.match(/(\d{1,2}:\d{2})\s*Uhr/i);
      const time = timeM ? timeM[1] + " Uhr" : "–";

      // ── Gesamtergebnis: nur einstellige X:Y Spans ─────────────────────
      const singleScores = Array.from(m.querySelectorAll(".z-label, span"))
        .map(el => el.textContent.trim())
        .filter(t => /^\d:\d$/.test(t));
      const first = singleScores[0] || "0:0";
      const [homeScore, awayScore] = first.split(":").map(Number);

      // ── "anzeigen"-Element-ID finden ─────────────────────────────────
      let anzeigenId = null;
      for (const el of m.querySelectorAll(".z-label, span, a, button")) {
        if (/anzeigen/i.test(el.textContent.trim())) {
          anzeigenId = el.id || null;
          break;
        }
      }

      return { found: true, status, time, homeScore, awayScore, anzeigenId, allTexts };
    }
    return { found: false, allTexts };
  }, { heim, gast });

  if (!header.found) {
    console.log("Kein Treffer. Alle gbmeetings:\n" +
      header.allTexts.map((t, i) => `  [${i}] ${t}`).join("\n"));
    return null;
  }

  console.log(`Match gefunden! Status: ${header.status}  Score: ${header.homeScore}:${header.awayScore}`);
  console.log(`anzeigenId: ${header.anzeigenId}`);

  // ── Schritt 2: "anzeigen" klicken → Spielbericht-Seite laden ─────────────
  let rubbers = [];
  if (header.status !== "upcoming" && header.anzeigenId) {
    try {
      const currentUrl = page.url();

      // Auf Navigation ODER Seitenänderung warten
      const navPromise = page.waitForURL(u => u !== currentUrl, { timeout: 12_000 })
        .catch(() => null);

      await page.locator(`#${header.anzeigenId}`).click({ timeout: 5000 });
      await navPromise;
      await page.waitForTimeout(3000);

      const reportUrl = page.url();
      console.log("Nach Klick URL:", reportUrl);

      if (reportUrl !== currentUrl) {
        // Navigierte zu Spielbericht-Seite → Rubbers dort parsen
        rubbers = await parseRubbersFromPage(page);
      } else {
        // Seite nicht gewechselt → ZK hat Inhalt inline geladen
        rubbers = await parseRubbersFromPage(page);
      }

      console.log(`Rubbers: ${rubbers.length}`);
      rubbers.forEach(r =>
        console.log(`  ${r.id}: ${r.home} vs ${r.away} → ${r.score} (${r.result})`)
      );
    } catch (e) {
      console.log("anzeigen-Klick fehlgeschlagen:", e.message);
    }
  }

  // Gesamtergebnis aus Rubbers nachberechnen (falls Rubbers vorhanden)
  let homeScore = header.homeScore;
  let awayScore = header.awayScore;
  if (rubbers.length) {
    homeScore = rubbers.filter(r => r.result === "win").length;
    awayScore = rubbers.filter(r => r.result === "loss").length;
  }

  return {
    status: header.status,
    homeTeam: heim, awayTeam: gast,
    league: "HERREN LANDESLIGA 2 GR. 127 NO",
    time: header.time,
    homeScore, awayScore, rubbers,
  };
}

// ── Rubbers von der aktuellen Seite parsen (nach Klick auf "anzeigen") ──────
async function parseRubbersFromPage(page) {
  return await page.evaluate(() => {
    const rubbers = [];

    // Variante A: Tabelle auf Spielbericht-Seite
    for (const row of document.querySelectorAll("tr")) {
      const cells = [...row.querySelectorAll("td")].map(td => td.textContent.trim());
      if (cells.length < 3) continue;
      const idM = cells.join(" ").match(/\b(E[1-6]|D[1-3])\b/i);
      if (!idM) continue;
      const id = idM[1].toUpperCase();
      const score = cells.find(c => /\d:\d/.test(c)) || "–";
      const scoreIdx = cells.findIndex(c => /\d:\d/.test(c));
      const home = scoreIdx > 0 ? cells[scoreIdx - 2] || cells[1] : cells[1];
      const away = scoreIdx > 0 ? cells[scoreIdx - 1] || cells[2] : cells[2];
      const sets = score.match(/(\d):(\d)/g) || [];
      let result = "open";
      if (sets.length) {
        let hw = 0, aw = 0;
        sets.forEach(s => { const [a, b] = s.split(":").map(Number); a > b ? hw++ : aw++; });
        result = hw + aw >= 2 ? (hw > aw ? "win" : "loss") : "live";
      }
      rubbers.push({ id, home, away, score, result });
    }

    if (rubbers.length) return rubbers;

    // Variante B: ZK-Labels auf Gruppen-Seite nach Inline-Expand
    const labels = Array.from(document.querySelectorAll(".z-label, span"))
      .map(el => el.textContent.trim())
      .filter(t => t.length > 0);
    for (let i = 0; i < labels.length; i++) {
      if (!/^(E[1-6]|D[1-3])$/i.test(labels[i])) continue;
      const id = labels[i].toUpperCase();
      const chunk = labels.slice(i + 1, i + 15);
      const scoreIdx = chunk.findIndex(l => /^\d:\d/.test(l));
      if (scoreIdx < 0) continue;
      const score = chunk[scoreIdx];
      const home = chunk[0] || "–";
      const away = chunk[scoreIdx - 1] || chunk[1] || "–";
      const sets = score.match(/(\d):(\d)/g) || [];
      let result = "open";
      if (sets.length) {
        let hw = 0, aw = 0;
        sets.forEach(s => { const [a, b] = s.split(":").map(Number); a > b ? hw++ : aw++; });
        result = hw + aw >= 2 ? (hw > aw ? "win" : "loss") : "live";
      }
      rubbers.push({ id, home, away, score, result });
    }

    // Deduplizieren
    const seen = new Set();
    return rubbers.filter(r => {
      const k = r.id + r.score;
      if (seen.has(k)) return false;
      seen.add(k); return true;
    });
  });
}

// (parseRubbersFromHtml entfernt – Rubber-Parsing erfolgt jetzt direkt im DOM via page.evaluate)

// Dummy-Platzhalter damit nichts bricht
function parseRubbersFromHtml(_html) {
  return [];
  // Legacy-Code entfernt – siehe tryWidget()
  const parts = []; let i = 0;
  while (i < parts.length) {
    const rubberM = parts[i].match(/^(E[1-6]|D[1-3])$/i);
    if (rubberM) {
      const id = rubberM[1].toUpperCase();
      const score  = parts.slice(i, i + 20).find(p => /^\d:\d/.test(p)) || "–";
      const home   = parts[i + 1] || "–";
      const away   = parts[i + 2] || "–";
      const sets   = score.match(/(\d):(\d)/g) || [];
      let result = "open";
      if (sets.length) {
        let hw = 0, aw = 0;
        sets.forEach(s => { const [a, b] = s.split(":").map(Number); a > b ? hw++ : aw++; });
        result = hw + aw >= 2 ? (hw > aw ? "win" : "loss") : "live";
      }
      rubbers.push({ id, home, away, score, result });
    }
    i++;
  }
  return rubbers;
}

// ══════════════════════════════════════════════════════════════════════════════
// ANSATZ 2: btv-prod – HTML dumpen + Text-basierte Suche
// ══════════════════════════════════════════════════════════════════════════════
async function tryBtvProd(page, prodUrl, heim, gast) {
  console.log(`\n=== btv-prod ===`);
  try {
    await page.goto(prodUrl, { waitUntil: "domcontentloaded", timeout: 35_000 });
  } catch (e) {
    console.log("Ladefehler:", e.message); return null;
  }
  await waitForZk(page, 3000);

  const pageData = await page.evaluate(({ heim, gast }) => {
    const heimL = heim.toLowerCase();
    const gastL = gast.toLowerCase();
    const bodyText = document.body.innerText;

    // HTML-Dump für Debugging
    const htmlSnippet = document.body.innerHTML.slice(0, 5000);

    // Prüfen ob Teams im Text vorhanden (case-insensitive)
    const heimFound = bodyText.toLowerCase().includes(heimL);
    const gastFound = bodyText.toLowerCase().includes(gastL);

    if (!heimFound || !gastFound) {
      return {
        found: false,
        heimFound, gastFound,
        bodyText: bodyText.slice(0, 800),
        htmlSnippet,
      };
    }

    // Text-basierte Suche: alle Elemente die BEIDE Namen enthalten
    const all = Array.from(document.querySelectorAll("*"));
    const candidates = all.filter(el => {
      const t = el.textContent.toLowerCase();
      return t.includes(heimL) && t.includes(gastL) && el.children.length < 30;
    });

    if (!candidates.length) {
      return {
        found: false,
        heimFound, gastFound,
        note: "Beide Teams im bodyText, aber kein Element enthält beide gleichzeitig",
        bodyText: bodyText.slice(0, 800),
        htmlSnippet,
      };
    }

    // Kleinstes Element das beide enthält
    const best = candidates.reduce((a, b) =>
      a.textContent.length <= b.textContent.length ? a : b
    );

    // Link suchen (im Element + Eltern)
    let el = best;
    for (let d = 0; d < 8; d++) {
      for (const a of el.querySelectorAll("a")) {
        const h = a.getAttribute("href") || "";
        if (h && h !== "#" && !h.startsWith("javascript") && h.length > 5)
          return {
            found: true,
            link: h.startsWith("http") ? h : `https://btv-prod.burdadigitalsystems.de${h}`,
            bestHtml: best.outerHTML.slice(0, 600),
          };
      }
      for (const cel of [el, ...Array.from(el.querySelectorAll("[onclick]"))]) {
        const oc = cel.getAttribute?.("onclick") || "";
        const u = oc.match(/(https?:\/\/[^\s'"]+)/);
        if (u) return { found: true, link: u[1], bestHtml: best.outerHTML.slice(0, 600) };
        const id = oc.match(/\b(\d{5,})\b/);
        if (id) return {
          found: true,
          link: `https://btv-prod.burdadigitalsystems.de/btvmatches/?begid=${id[1]}`,
          bestHtml: best.outerHTML.slice(0, 600),
        };
      }
      if (!el.parentElement) break;
      el = el.parentElement;
    }

    return {
      found: true,
      link: null,
      bestHtml: best.outerHTML.slice(0, 600),
      htmlSnippet,
    };
  }, { heim, gast });

  console.log("heim gefunden:", pageData.heimFound);
  console.log("gast gefunden:", pageData.gastFound);
  if (pageData.note)       console.log("Hinweis:", pageData.note);
  if (pageData.bestHtml)   console.log("Best-Element HTML:\n", pageData.bestHtml);
  if (!pageData.found || (!pageData.heimFound && !pageData.gastFound)) {
    console.log("Body:\n", pageData.bodyText?.slice(0, 400));
    console.log("HTML:\n", pageData.htmlSnippet?.slice(0, 2000));
  }

  return pageData.found && pageData.link ? pageData.link : null;
}

// ── Spielbericht-Seite parsen ───────────────────────────────────────────────
async function parseReport(page, url, heim, gast) {
  console.log("\n=== Spielbericht ===");
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 35_000 });
  await waitForZk(page, 2000);

  return await page.evaluate(({ heim, gast }) => {
    const text = document.body.textContent || "";
    let status = "upcoming";
    if (/abgeschlossen|beendet/i.test(text))               status = "done";
    else if (text.match(/\d:\d/) && !/Blanko/i.test(text)) status = "live";

    const tm = text.match(/(\d{1,2}:\d{2})\s*Uhr/);
    const time = tm ? tm[1] + " Uhr" : "–";
    const sc = text.match(/(\d{1,2})\s*:\s*(\d{1,2})/);
    let homeScore = sc ? +sc[1] : 0, awayScore = sc ? +sc[2] : 0;

    const rubbers = [];
    for (const row of document.querySelectorAll("tr")) {
      const cells = [...row.querySelectorAll("td")].map(td => td.textContent.trim());
      if (cells.length < 3) continue;
      const idM = cells.join(" ").match(/\b(E[1-6]|D[1-3])\b/i);
      if (!idM) continue;
      const id = idM[1].toUpperCase();
      const score = cells[3] || "–";
      const sets = score.match(/(\d):(\d)/g) || [];
      let result = "open";
      if (sets.length) {
        let hw = 0, aw = 0;
        sets.forEach(s => { const [a, b] = s.split(":").map(Number); a > b ? hw++ : aw++; });
        result = hw + aw >= 2 ? (hw > aw ? "win" : "loss") : "live";
      }
      rubbers.push({ id, home: cells[1] || "–", away: cells[2] || "–", score, result });
    }
    return { status, homeTeam: heim, awayTeam: gast, league: "–", time, homeScore, awayScore, rubbers };
  }, { heim, gast });
}

// ══════════════════════════════════════════════════════════════════════════════
// MAIN
// ══════════════════════════════════════════════════════════════════════════════
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

  const { browser, page } = await makeBrowser();
  try {
    // 1. Versuch: widget.btv.de (hat Live-Daten direkt im gbmeeting-Container)
    let matchData = null;
    if (groupId) {
      matchData = await tryWidget(page, groupId, heim, gast);
    }

    // 2. Versuch: btv-prod/clubnr → Link zum Spielbericht holen
    if (!matchData) {
      const prodUrl = `https://btv-prod.burdadigitalsystems.de/btvmeetings/?clubnr=${clubnr}`;
      const reportLink = await tryBtvProd(page, prodUrl, heim, gast);
      if (reportLink) {
        matchData = await parseReport(page, reportLink, heim, gast);
      }
    }

    // 3. Versuch: btv-prod/groupid
    if (!matchData && groupId) {
      const prodUrl = `https://btv-prod.burdadigitalsystems.de/btvmeetings/?groupid=${groupId}`;
      const reportLink = await tryBtvProd(page, prodUrl, heim, gast);
      if (reportLink) {
        matchData = await parseReport(page, reportLink, heim, gast);
      }
    }

    if (!matchData) {
      console.log("\nKein Spielbericht gefunden → upcoming.");
      matchData = {
        status: "upcoming", homeTeam: heim, awayTeam: gast,
        league: "–", time: "–", homeScore: 0, awayScore: 0, rubbers: [],
      };
    }

    await saveResult("btv_match_cache", matchData);
    console.log(`\n✓ Gespeichert: ${matchData.status}  ${matchData.homeScore}:${matchData.awayScore}  ${matchData.rubbers.length} Rubbers`);

  } finally {
    await browser.close();
  }
})().catch(err => { console.error("FEHLER:", err.message); process.exit(1); });
