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

// ── Zeitfenster prüfen: 1h vor bis 10h nach Spielbeginn ─────────────────────
// matchDate: "2026-06-14"  matchTime: "10:00" (HH:MM)
function isInMatchWindow(matchDate, matchTime) {
  if (!matchTime) return true; // keine Zeit → ganzen Spieltag laufen
  const [h, min] = matchTime.split(":").map(Number);
  if (isNaN(h) || isNaN(min)) return true;
  const matchMs = new Date(`${matchDate}T${String(h).padStart(2,"0")}:${String(min).padStart(2,"0")}:00`).getTime();
  const nowMs   = Date.now();
  return nowMs >= matchMs - 60 * 60 * 1000 && nowMs <= matchMs + 10 * 60 * 60 * 1000;
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
      timeout: 25_000,
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

  // Auf Logo-Bilder warten (ZK lädt sie per JS nach)
  try {
    await page.waitForFunction(
      () => document.querySelector('[class*="gbmeet"] img[src]') !== null,
      { timeout: 6000 }
    );
    console.log("Logo-Bilder im DOM gefunden");
  } catch (_) {
    console.log("Hinweis: Keine img[src] in gbmeet nach 6s – fahre ohne Logos fort");
  }

  // ── Schritt 1: Header-Daten aus gbmeeting lesen ──────────────────────────
  const header = await page.evaluate(({ heim, gast }) => {
    const heimL = heim.toLowerCase();
    const gastL = gast.toLowerCase();
    const meetings = Array.from(document.querySelectorAll('[class*="gbmeet"]'));
    const allTexts = meetings.map(m =>
      m.textContent.trim().replace(/\s+/g, " ").slice(0, 120)
    );

    // ── Liga/Staffelname aus Seiten-Header ──────────────────────────────────
    // BTV widget zeigt Staffelname typischerweise als Überschrift über den Spielen
    let league = "";
    const headingCandidates = [
      ...Array.from(document.querySelectorAll("h1,h2,h3,.z-caption,.gbgroup-title,[class*='group-title'],[class*='caption']")),
      ...Array.from(document.querySelectorAll(".z-label,span")).filter(el =>
        /liga|klasse|staffel|kreis|bezirk|landes|nord|süd|ost|west|gr\./i.test(el.textContent)
      ),
    ];
    for (const el of headingCandidates) {
      const t = el.textContent.trim().replace(/\s+/g," ");
      if (t.length > 5 && t.length < 80 && /liga|klasse|staffel|gr\.\s*\d/i.test(t)) {
        league = t; break;
      }
    }

    for (const m of meetings) {
      if (!m.textContent.toLowerCase().includes(heimL)) continue;
      if (!m.textContent.toLowerCase().includes(gastL)) continue;

      const mText = m.textContent;

      // ── Status ──────────────────────────────────────────────────────────
      let status = "upcoming";
      if (/blanko/i.test(mText)) {
        status = "upcoming";
      } else if (/anzeigen/i.test(mText)) {
        const singleScores = Array.from(m.querySelectorAll(".z-label, span"))
          .map(el => el.textContent.trim()).filter(t => /^\d:\d$/.test(t));
        const first = singleScores[0] || "0:0";
        const [h, a] = first.split(":").map(Number);
        status = h + a >= 9 ? "done" : "live";
      }

      // ── Datum + Uhrzeit: rückwärts vom Match suchen ─────────────────────────
      // BTV-Liste: Datum steht VOR den Teamnamen, z.B. "Fr. 12.06.26, 15:00 SG Herrieden ... SV Arberg"
      // Strategie: Parent-Text holen, Position finden wo BEIDE Teams nahe beieinander stehen,
      // dann letztes Datum/Zeit VOR dieser Position nehmen.
      const fullRowText = (() => {
        let el = m;
        for (let i = 0; i < 8; i++) {
          if (!el.parentElement) break;
          el = el.parentElement;
          const t = el.textContent.replace(/\s+/g, " ");
          if (/\d{1,2}\.\d{1,2}\.\d{2}/.test(t)) return t;
        }
        return mText;
      })();

      // Position finden, wo heim+gast gemeinsam auftauchen (= unser Match)
      const textL  = fullRowText.toLowerCase();
      const h1     = heim.toLowerCase().split(" ")[0];
      const g1     = gast.toLowerCase().split(" ")[0];
      let matchStart = -1;
      let pos = 0;
      while (pos < textL.length) {
        const hp = textL.indexOf(h1, pos);
        if (hp < 0) break;
        const window80 = textL.slice(hp, hp + 80);
        // Beide Teams müssen innerhalb 80 Zeichen sein UND kein "anzeigen" dazwischen
        // (sonst sind es zwei verschiedene Matchzeilen)
        if (window80.includes(g1) && !window80.includes("anzeigen")) {
          matchStart = hp; break;
        }
        pos = hp + 1;
      }

      const lookBack = matchStart > 0 ? fullRowText.slice(0, matchStart) : fullRowText;

      // Datum+Zeit als BTV-Paar suchen: "DD.MM.YY, HH:MM" oder "DD.MM.YYYY, HH:MM"
      // Nur echte Terminangaben matchen, keine Score-Fragmente wie "0:01"
      const allPairs = [...lookBack.matchAll(/(\d{1,2})\.(\d{1,2})\.(\d{2,4}),\s*(\d{1,2}:\d{2})/g)];
      const lastPair = allPairs.length > 0 ? allPairs[allPairs.length - 1] : null;

      const time = lastPair ? lastPair[4] + " Uhr" : "–";

      const curYear = new Date().getFullYear();
      let matchDate = null;
      if (lastPair) {
        const [, d, mo, y] = lastPair;
        const year = y.length === 2 ? "20" + y : y;
        matchDate = `${year}-${mo.padStart(2,"0")}-${d.padStart(2,"0")}`;
      }

      // Debug
      const allDateTexts = [];
      const debugRowText = lookBack.slice(-150); // letzten 150 Zeichen vor unserem Match

      // ── Gesamtergebnis ───────────────────────────────────────────────────
      const singleScores = Array.from(m.querySelectorAll(".z-label, span"))
        .map(el => el.textContent.trim()).filter(t => /^\d:\d$/.test(t));
      const first = singleScores[0] || "0:0";
      const [homeScore, awayScore] = first.split(":").map(Number);

      // ── "anzeigen"-Element-ID ────────────────────────────────────────────
      let anzeigenId = null;
      for (const el of m.querySelectorAll(".z-label, span, a, button")) {
        if (/anzeigen/i.test(el.textContent.trim())) {
          anzeigenId = el.id || null; break;
        }
      }

      // ── Logos: erste zwei img-Tags im gbmeeting-Container ───────────────
      const allImgs = Array.from(m.querySelectorAll("img")).map(img => ({
        src: img.src || "",
        attr: img.getAttribute("src") || "",
        cls: img.className || "",
      }));
      const logoImgs = allImgs
        .map(i => i.src || i.attr)
        .filter(s => s && s.startsWith("http"));
      const homeLogo = logoImgs[0] || null;
      const awayLogo = logoImgs[1] || null;
      const logoDebug = allImgs.length > 0
        ? allImgs.map(i=>`src="${i.src.slice(0,60)}" attr="${i.attr.slice(0,40)}" cls="${i.cls}"`).join(" | ")
        : "(keine img-Tags im Container)";

      // ── Debug: Text ──────────────────────────────────────────────────────
      const debugText = mText.trim().replace(/\s+/g," ").slice(0, 300);

      return { found: true, status, time, matchDate, league, homeLogo, awayLogo, homeScore, awayScore, anzeigenId, allTexts, debugText, debugRowText, allDateTexts, logoDebug };
    }
    return { found: false, allTexts };
  }, { heim, gast });

  if (!header.found) {
    console.log("Kein Treffer. Alle gbmeetings:\n" +
      header.allTexts.map((t, i) => `  [${i}] ${t}`).join("\n"));
    return null;
  }

  console.log(`Match gefunden! Status: ${header.status}  Score: ${header.homeScore}:${header.awayScore}  Datum: ${header.matchDate}  Zeit: ${header.time}`);
  console.log(`Liga: "${header.league}"  anzeigenId: ${header.anzeigenId}`);
  console.log(`Logos: ${header.homeLogo || "(keins)"} | ${header.awayLogo || "(keins)"}`);
  console.log(`Logo-Debug: ${header.logoDebug}`);
  console.log(`gbmeeting-Text: ${header.debugText}`);
  console.log(`Zeilen-Text (für Datum/Zeit): ${header.debugRowText || "(kein rowText)"}`);
  console.log(`Datumsfelder auf Seite: ${(header.allDateTexts||[]).join(" | ") || "(keine)"}`);

  // ── Zeitfenster prüfen (anhand BTV-Datum + Uhrzeit) ──────────────────────
  if (header.matchDate && header.time && header.time !== "–") {
    const timeStr = header.time.replace(/\s*Uhr/i,"").trim();
    if (!isInMatchWindow(header.matchDate, timeStr)) {
      const [h, min] = timeStr.split(":").map(Number);
      const matchMs  = new Date(`${header.matchDate}T${String(h).padStart(2,"0")}:${String(min).padStart(2,"0")}:00`).getTime();
      const diffMin  = Math.round((matchMs - Date.now()) / 60_000);
      const diffStr  = diffMin > 0
        ? `noch ${diffMin} Min bis Fenster-Start (1h vor ${header.time})`
        : `${Math.abs(diffMin)} Min nach Fenster-Ende`;
      console.log(`⏸ Außerhalb Zeitfenster – nur Basisdaten speichern. (${diffStr})`);
      // Basisdaten (ohne Rubbers) speichern damit Display Datum/Zeit anzeigen kann
      return {
        status: header.status, homeTeam: heim, awayTeam: gast,
        league: header.league || "",
        time: header.time, matchDate: header.matchDate,
        homeLogo: header.homeLogo, awayLogo: header.awayLogo,
        homeScore: header.homeScore, awayScore: header.awayScore, rubbers: [],
      };
    }
    const [h, min] = timeStr.split(":").map(Number);
    const matchMs  = new Date(`${header.matchDate}T${String(h).padStart(2,"0")}:${String(min).padStart(2,"0")}:00`).getTime();
    const diffMin  = Math.round((matchMs - Date.now()) / 60_000);
    if (diffMin > 0) console.log(`⏱ Im Fenster: Anpfiff ${header.time}, noch ${diffMin} Min`);
    else             console.log(`⏱ Im Fenster: Spiel läuft/beendet`);
  }

  // ── Schritt 2: "anzeigen" klicken → ZK lädt Rubbers inline per AJAX ────────
  let rubbers = [];
  if (header.status !== "upcoming" && header.anzeigenId) {
    try {
      await page.locator(`#${header.anzeigenId}`).click({ timeout: 5000 });

      // ZK AJAX abwarten: erst kurze Pause, dann auf "Verarbeitung" warten
      await page.waitForTimeout(800);
      await waitForZk(page, 3000);

      rubbers = await parseRubbersFromPage(page);

      console.log(`Rubbers: ${rubbers.length}`);
      rubbers.forEach(r =>
        console.log(`  ${r.id}: ${r.home} vs ${r.away} → ${r.score} (${r.result})`)
      );
    } catch (e) {
      console.log("anzeigen-Klick fehlgeschlagen:", e.message);
    }
  }

  // ── Logo-Fallback: nach anzeigen-Klick gesamte Seite nach BTV-Logos durchsuchen ──
  let { homeLogo, awayLogo } = header;
  // Alle img-Tags der ganzen Seite sammeln (Diagnose + Fallback)
  const allPageImgs = await page.evaluate(() =>
    Array.from(document.querySelectorAll("img"))
      .map(img => img.src || img.getAttribute("src") || "")
      .filter(Boolean)
  );
  const btvImgs = allPageImgs.filter(s =>
    s.includes("btv.de") && (s.includes("vereine") || s.includes("logoImage") || s.includes("logo"))
  );
  const logoDebugFinal = `Seite gesamt: ${allPageImgs.length} imgs, davon BTV-Logo-URLs: ${btvImgs.length} → ${btvImgs.slice(0,4).join(" | ")}`;
  console.log(`Logo-Diagnose: ${logoDebugFinal}`);
  if (!homeLogo || !awayLogo) {
    homeLogo = homeLogo || btvImgs[0] || null;
    awayLogo = awayLogo || btvImgs[1] || null;
  }
  console.log(`Logos final: ${homeLogo || "(keins)"} | ${awayLogo || "(keins)"}`);

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
    league: header.league || "",
    time: header.time,
    matchDate: header.matchDate,
    homeLogo, awayLogo,
    homeScore, awayScore, rubbers,
    _logoDebug: logoDebugFinal,
  };
}

// ── Rubbers aus der Seite parsen – mit Retry falls ZK-AJAX noch lädt ────────
async function parseRubbersFromPage(page, maxRetries = 4) {
  let rubbers = [];
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    if (attempt > 1) {
      console.log(`  Versuch ${attempt}/${maxRetries} – warte 2s auf ZK-AJAX…`);
      await page.waitForTimeout(2000);
    }

    const contentText = await page.evaluate(() => {
      const el = document.querySelector('[class*="groupbox-content"]:not([style*="display:none"])');
      return el ? el.innerText : null;
    });

    if (!contentText) {
      console.log("Kein sichtbarer Content nach Klick");
      continue;
    }

    // ── DEBUG: erste 600 Zeichen des rohen innerText loggen ──────────────
    if (attempt === 1) {
      console.log("  [DEBUG innerText erste 600 Zeichen]");
      console.log(contentText.slice(0, 600).replace(/\n/g, "↵\n"));
      console.log("  [/DEBUG]");
    }

    rubbers = parseRubbersFromText(contentText);
    const nonOpen = rubbers.filter(r => r.result !== "open").length;

    // Fertig wenn ≥9 Rubbers (6er) oder ≥6 (4er) und mindestens ein Ergebnis vorhanden
    if (rubbers.length >= 6 && nonOpen > 0) {
      console.log(`  ✓ ${rubbers.length} Rubbers nach Versuch ${attempt} geladen (${nonOpen} mit Ergebnis)`);
      return rubbers;
    }

    console.log(`  Versuch ${attempt}: ${rubbers.length} Rubbers, ${nonOpen} mit Ergebnis – noch nicht vollständig`);
  }
  return rubbers;
}

// ── innerText-Parser für BTV Spielbericht ─────────────────────────────────
// Format:  Einzelspiele | Doppelspiele
//          [Spielername NAT (Nr)]  [P] [S1] [S2] [S3?] [MP] [SÄ] [SP] [P]  [Spielername NAT (Nr)]
// Nationalität kann GER, CZE, AUT, SUI, USA, ... sein (immer 3 Großbuchstaben)
function parseRubbersFromText(text) {
  const lines = text.split("\n").map(l => l.trim()).filter(l => l.length > 0);

  // Spielername:  enthält 3-Buchstaben-Ländercode gefolgt von " ("
  const isPlayer = l => /\b[A-Z]{3}\s*\(/.test(l);
  // Score-Zeile:  Format N:N (beliebige Zahlen)
  const isScore  = l => /^\d+:\d+$/.test(l);
  // MP-Zeile:     0:1 oder 1:0 (Matchpunkt)
  const isMp     = l => /^[01]:[01]$/.test(l) && l[0] !== l[2];

  // Ländercode + alles dahinter entfernen: "Bartl, Jaroslav CZE (3, LK5,1)" → "Bartl, Jaroslav"
  const cleanName = l => l.replace(/\s+[A-Z]{3}\s*\(.*$/, "").trim();

  let inSingles = false, inDoubles = false;
  const singles = [], doubles = [];
  let curr = null;

  const neededHome = () => inDoubles ? 2 : 1;
  const neededAway = () => inDoubles ? 2 : 1;

  const finish = () => {
    if (!curr) return;
    if      (inSingles) singles.push(curr);
    else if (inDoubles) doubles.push(curr);
    curr = null;
  };

  for (const line of lines) {
    if (line === "Einzelspiele") { finish(); inSingles = true;  inDoubles = false; continue; }
    if (line === "Doppelspiele") { finish(); inSingles = false; inDoubles = true;  continue; }
    if (line === "ZUSAMMEN:")    { finish(); inSingles = false; inDoubles = false; continue; }
    if (!inSingles && !inDoubles) continue;

    if (isPlayer(line)) {
      const name = cleanName(line);
      if (!curr) {
        curr = { home: [name], away: [], scores: [], mp: null, foundMp: false };
      } else if (curr.home.length < neededHome() && !curr.foundMp) {
        curr.home.push(name);            // 2. Heimspieler beim Doppel
      } else {
        curr.away.push(name);
        if (curr.away.length >= neededAway()) finish();
      }
    } else if (isScore(line) && curr && curr.home.length >= neededHome()) {
      if (!curr.foundMp) {
        if (isMp(line)) {
          curr.mp = +line[0];            // 1 = Heim gewonnen, 0 = verloren
          curr.foundMp = true;
        } else {
          curr.scores.push(line);        // S1, S2, S3 (vor MP)
        }
      }
      // Nach MP: SÄ + SP überspringen
    }
    // Alles andere (Zahlen, Spaltenköpfe, Teamnamen) → überspringen
  }
  finish();

  const toRubber = (r, id) => ({
    id,
    home:   r.home.join(" / "),
    away:   r.away.join(" / "),
    score:  r.scores.join(" ") || "–",
    result: r.mp === 1 ? "win" : r.mp === 0 ? "loss" : "open",
  });

  return [
    ...singles.map((r, i) => toRubber(r, `E${i + 1}`)),
    ...doubles.map((r, i) => toRubber(r, `D${i + 1}`)),
  ];
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
    await page.goto(prodUrl, { waitUntil: "domcontentloaded", timeout: 20_000 });
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
// PROTOTYP: Club-Teams + Gegner scrapen
// Läuft nur bei manuellem Trigger, speichert btv_club_teams in Supabase
// ══════════════════════════════════════════════════════════════════════════════
async function scrapeClubTeams(page, vereinsnr) {
  console.log("\n=== Club-Teams scrapen (Prototyp) ===");
  const url = `https://btv-prod.burdadigitalsystems.de/btvmeetings/?clubnr=${vereinsnr}`;
  try {
    await page.goto(url, { waitUntil: "networkidle", timeout: 30_000 });
  } catch (e) {
    console.log("Club-Seite nicht erreichbar – übersprungen:", e.message.slice(0, 80));
    return null;
  }
  await page.waitForTimeout(3000);

  const raw = await page.evaluate(() => {
    const bodyText = document.body.innerText.replace(/\s+/g, " ").trim();

    // Alle Elemente mit CSS-Klassen loggen (für Debugging)
    const allClasses = [...new Set(
      Array.from(document.querySelectorAll("*"))
        .map(el => el.className)
        .filter(c => typeof c === "string" && c.includes("gb"))
    )].slice(0, 20);

    // gbmeeting-Container
    const meetEls = Array.from(document.querySelectorAll('[class*="gbmeet"]'));
    const matchTexts = meetEls
      .map(m => m.textContent.trim().replace(/\s+/g, " ").slice(0, 300))
      .filter(t => t.length > 10);

    // Alle Links
    const links = Array.from(document.querySelectorAll("a[href]"))
      .map(a => a.href)
      .filter(h => h.includes("btv") || h.includes("groupid") || h.includes("clubnr") || h.includes("meetid"))
      .slice(0, 20);

    // Z-Tree oder Z-List Elemente (ZK Framework Navigation)
    const treeItems = Array.from(document.querySelectorAll('[class*="z-tree"],[class*="z-list"],[class*="z-nav"]'))
      .map(el => el.textContent.trim().replace(/\s+/g, " ").slice(0, 100))
      .filter(t => t.length > 3)
      .slice(0, 10);

    return { bodyText: bodyText.slice(0, 5000), matchTexts, links, allClasses, treeItems };
  });

  console.log(`Body-Länge: ${raw.bodyText.length} Zeichen`);
  console.log(`gbmeet-Elemente: ${raw.matchTexts.length}`);
  console.log(`Body (erste 2000):\n${raw.bodyText.slice(0, 2000)}`);
  if (raw.allClasses.length) console.log(`GB-Klassen auf Seite: ${raw.allClasses.join(", ")}`);
  if (raw.links.length)     console.log(`BTV-Links: ${raw.links.join(" | ")}`);
  if (raw.treeItems.length) console.log(`Tree/Nav-Elemente: ${raw.treeItems.join(" | ")}`);
  if (raw.matchTexts.length) {
    console.log("Match-Texte:");
    raw.matchTexts.slice(0, 8).forEach((t, i) => console.log(`  [${i}] ${t}`));
  }

  // ── Versuch: Teams aus Body-Text extrahieren ─────────────────────────────
  // BTV zeigt Matches als "Heim - Gast" oder "Heim vs Gast" im Text
  const teams = {};
  const teamPattern = /([A-ZÄÖÜ][^\n\d:]{3,30})\s*[-–]\s*([A-ZÄÖÜ][^\n\d:]{3,30})/g;
  for (const m of raw.bodyText.matchAll(teamPattern)) {
    const heim = m[1].trim(); const gast = m[2].trim();
    if (heim && gast && heim !== gast && heim.length < 40 && gast.length < 40) {
      if (!teams[heim]) teams[heim] = new Set();
      teams[heim].add(gast);
    }
  }

  const structured = Object.entries(teams).map(([mannschaft, gegnerSet]) => ({
    mannschaft,
    gegner: [...gegnerSet],
  }));

  console.log(`Extrahierte Teams: ${structured.length}`);
  structured.forEach(t => console.log(`  ${t.mannschaft} → [${t.gegner.join(", ")}]`));

  const result = {
    vereinsnr,
    scrapedAt: new Date().toISOString(),
    teams: structured,
    _raw: { matchCount: raw.matchTexts.length, sample: raw.matchTexts.slice(0, 3) },
  };

  await saveResult("btv_club_teams", result);
  console.log("✓ btv_club_teams gespeichert");
  return result;
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

  // Manuell getriggert (workflow_dispatch) → Pre-Check überspringen
  const isManual   = process.env.GITHUB_EVENT_NAME === "workflow_dispatch";
  const teamsOnly  = process.env.TEAMS_ONLY === "true";
  if (isManual)   console.log("▶ Manueller Trigger – Pre-Check wird übersprungen");
  if (teamsOnly)  console.log("▶ teams_only – nur Mannschaften scrapen, kein Match-Fetch");

  // teams_only: direkt Mannschaften scrapen und beenden
  if (teamsOnly) {
    const { browser, page } = await makeBrowser();
    try {
      await scrapeClubTeams(page, clubnr);
    } finally {
      await browser.close();
    }
    return;
  }

  // Fetch deaktiviert? → Cron-Jobs sofort beenden (manueller Trigger läuft trotzdem)
  if (!isManual) {
    const { data: fetchFlag } = await sb.from("settings")
      .select("value").eq("key","btv_fetch_enabled").single();
    if (fetchFlag?.value === "false") {
      console.log("⏸ Automatischer Fetch ist deaktiviert – Exit.");
      return;
    }
  }

  // ── Billiger Pre-Check: Cache lesen bevor Playwright startet ────────────────
  const today = new Date().toISOString().slice(0, 10);
  try {
    const { data: preData } = await sb.from("settings")
      .select("value").eq("key", "btv_match_cache").single();

    if (preData?.value) {
      const cached   = typeof preData.value === "string" ? JSON.parse(preData.value) : preData.value;
      const cDate    = cached?.matchDate || null;          // "2026-06-13"
      const cTime    = (cached?.time || "").replace(/\s*Uhr/i,"").trim(); // "10:00"
      const cGegner  = (cached?.awayTeam || "").toLowerCase();

      if (cGegner === gast.toLowerCase()) {
        // Kein Datum UND keine Uhrzeit → kein Fetch möglich
        if (!isManual && !cDate && !cTime) {
          console.log("⏸ Kein Spieltermin bekannt (kein Datum, keine Uhrzeit) – kein Fetch.");
          return;
        }
        // Gleicher Gegner – Datum prüfen
        if (!isManual && cDate && cDate > today) {
          console.log(`⏸ Spiel gegen ${gast} am ${cDate} liegt in der Zukunft – kein Fetch.`);
          return;
        }
        if (!isManual && cDate && cDate < today) {
          console.log(`⏸ Spiel gegen ${gast} am ${cDate} ist bereits vorbei – warte auf neuen Gegner.`);
          return;
        }
        if (!isManual && cDate === today && cTime) {
          if (!isInMatchWindow(today, cTime)) {
            const [h, m] = cTime.split(":").map(Number);
            const matchMs = new Date(`${today}T${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}:00`).getTime();
            const diffMin = Math.round((matchMs - Date.now()) / 60_000);
            const msg = diffMin > 0
              ? `noch ${diffMin} Min bis Fenster-Start (1h vor ${cTime} Uhr)`
              : `${Math.abs(diffMin)} Min nach Fenster-Ende`;
            console.log(`⏸ Spieltag, aber außerhalb Zeitfenster – ${msg}`);
            return;
          }
          const [h, m] = cTime.split(":").map(Number);
          const matchMs = new Date(`${today}T${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}:00`).getTime();
          const diffMin = Math.round((matchMs - Date.now()) / 60_000);
          if (diffMin > 0) console.log(`⏱ Im Fenster: Anpfiff ${cTime} Uhr, noch ${diffMin} Min`);
          else             console.log(`⏱ Im Fenster: Spiel läuft/beendet`);
        }
      } else {
        console.log(`🆕 Neuer Gegner (${gast} ≠ ${cached?.awayTeam || "–"}) – initialer Fetch`);
      }
    } else {
      console.log("🆕 Kein Cache vorhanden – initialer Fetch");
    }
  } catch (e) {
    console.log(`Pre-Check Fehler (ignoriert): ${e.message}`);
  }

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
      // Alle Quellen ausgefallen (Timeout/Block) → Cache NICHT überschreiben
      // Stattdessen nur einen Fehler-Timestamp setzen damit die App weiß es gab Verbindungsprobleme
      console.log("\n⚠ Alle Quellen ausgefallen – letzter Cache bleibt erhalten.");
      await saveResult("btv_fetch_error", {
        ts: new Date().toISOString(),
        heim, gast,
        msg: "Alle Quellen ausgefallen (Timeout/Block)",
      });
      return;
    }

    matchData._source  = "auto";
    matchData._savedAt = new Date().toISOString();
    // BTV-Snapshot: welche Felder kamen von BTV (bleibt erhalten auch nach manuellem Speichern)
    matchData._btv = {
      matchDate: matchData.matchDate,
      time:      matchData.time,
      league:    matchData.league,
      homeLogo:  matchData.homeLogo,
      awayLogo:  matchData.awayLogo,
    };
    await saveResult("btv_match_cache", matchData);
    // Fehler-Flag löschen wenn erfolgreich
    await saveResult("btv_fetch_error", null);
    console.log(`\n✓ Gespeichert: ${matchData.status}  ${matchData.homeScore}:${matchData.awayScore}  ${matchData.rubbers.length} Rubbers  [auto ${matchData._savedAt}]`);

    // ── Prototyp: bei manuellem Trigger auch Club-Teams scrapen ─────────────
    if (isManual) {
      await scrapeClubTeams(page, clubnr);
    }

  } finally {
    await browser.close();
  }
})().catch(err => { console.error("FEHLER:", err.message); process.exit(1); });
