#!/usr/bin/env node
// Diagnose-Scraper: Findet alle Saison-URLs einer Mannschaft im BTV-Archiv
// Aufruf: node scripts/diagnose-btv-archiv.js <groupId> <teamName>
// Beispiel: node scripts/diagnose-btv-archiv.js 2077259 "TC Ansbach"

const { chromium } = require("playwright");

const groupId  = process.argv[2] || "";
const teamName = process.argv[3] || "";

if (!groupId || !teamName) {
  console.log("Aufruf: node scripts/diagnose-btv-archiv.js <groupId> <teamName>");
  process.exit(1);
}

const BASE_URL = "https://www.btv.de";
const START_URL = `${BASE_URL}/de/spielbetrieb/tabelle-spielplan.html?groupid=${groupId}`;

(async () => {
  const browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
  const context = await browser.newContext({
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
    locale: "de-DE",
  });
  const page = await context.newPage();

  console.log(`\nLade: ${START_URL}`);
  await page.goto(START_URL, { waitUntil: "domcontentloaded", timeout: 30_000 });

  // Cookie-Banner wegklicken
  for (const sel of ["#CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll", ".sp_choice_type_11", "button[id*='accept']"]) {
    try { const b = await page.$(sel); if (b) { await b.click(); await page.waitForTimeout(1000); break; } } catch(_) {}
  }

  await page.waitForTimeout(3000);

  // ── 1. Seitentitel / Staffelname ──────────────────────────────────────────
  const title = await page.title();
  console.log(`\nSeitentitel: ${title}`);

  // ── 2. Alle Links auf der Seite die nach Archiv/Saison aussehen ───────────
  const allLinks = await page.evaluate(() => {
    return [...document.querySelectorAll("a[href]")].map(a => ({
      text: (a.innerText || a.textContent || "").trim().replace(/\s+/g, " ").slice(0, 80),
      href: a.href,
    })).filter(l => l.href && l.text);
  });

  const seasonLinks = allLinks.filter(l =>
    /archiv|saison|season|spieljahr|20\d\d|19\d\d|groupid/i.test(l.href + l.text)
  );

  console.log(`\n── Saison-/Archiv-Links (${seasonLinks.length} gefunden) ──`);
  seasonLinks.forEach(l => console.log(`  [${l.text}]\n    ${l.href}`));

  // ── 3. Alle groupid-Links ─────────────────────────────────────────────────
  const groupLinks = allLinks.filter(l => /groupid=/i.test(l.href));
  const uniqueGroups = [...new Map(groupLinks.map(l => [l.href, l])).values()];
  console.log(`\n── groupid-Links (${uniqueGroups.length} gefunden) ──`);
  uniqueGroups.forEach(l => console.log(`  [${l.text}]  ${l.href}`));

  // ── 4. Dropdown / Select-Elemente (Saison-Auswahl) ───────────────────────
  const selects = await page.evaluate(() => {
    return [...document.querySelectorAll("select")].map(sel => ({
      name: sel.name || sel.id || "(kein name)",
      options: [...sel.options].map(o => ({ value: o.value, text: o.text.trim() })),
    }));
  });
  console.log(`\n── Dropdowns / Selects (${selects.length} gefunden) ──`);
  selects.forEach(s => {
    console.log(`  Select: ${s.name}`);
    s.options.forEach(o => console.log(`    ${o.text}  →  ${o.value}`));
  });

  // ── 5. Buttons die nach Saison/Archiv aussehen ────────────────────────────
  const buttons = await page.evaluate(() => {
    return [...document.querySelectorAll("button, [role='button'], .btn")].map(b => ({
      text: (b.innerText || b.textContent || "").trim().replace(/\s+/g, " ").slice(0, 80),
      classes: b.className,
    })).filter(b => b.text);
  });
  const seasonButtons = buttons.filter(b =>
    /archiv|saison|season|spieljahr|20\d\d|19\d\d|vorherige|zurück|earlier/i.test(b.text)
  );
  console.log(`\n── Saison-Buttons (${seasonButtons.length} gefunden) ──`);
  seasonButtons.forEach(b => console.log(`  [${b.text}]  classes: ${b.classes}`));

  // ── 6. Roher Seitentext (erste 2000 Zeichen) ──────────────────────────────
  const bodyText = await page.evaluate(() => document.body?.innerText || "");
  console.log(`\n── Seitentext (erste 2000 Zeichen) ──`);
  console.log(bodyText.slice(0, 2000));

  // ── 7. Teamname auf der Seite suchen ─────────────────────────────────────
  const found = bodyText.toLowerCase().includes(teamName.toLowerCase());
  console.log(`\n── Teamname "${teamName}" auf Seite gefunden: ${found ? "JA ✓" : "NEIN ✗"}`);

  await browser.close();
  console.log("\n✓ Diagnose abgeschlossen.");
})().catch(e => { console.error("FEHLER:", e.message); process.exit(1); });
