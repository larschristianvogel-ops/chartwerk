/* End-to-End-Test des Aufgabenbereichs und der Befehle gegen die nachgebaute PowerPoint-API. */
'use strict';
const path = require('path');
const fs = require('fs');
const { chromium } = require('/opt/npm-tools/node_modules/playwright');

const DIST = path.join(__dirname, '..', 'dist');
const OUT = path.join(__dirname, 'out');
const MOCK = fs.readFileSync(path.join(__dirname, 'mock-office.js'), 'utf8');
const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.png': 'image/png', '.xml': 'application/xml' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
function check(cond, msg) { if (cond) console.log('  ok   ' + msg); else { failures++; console.log('  FAIL ' + msg); } }

async function setup(browser, version) {
  const ctx = await browser.newContext({ viewport: { width: 380, height: 1500 }, deviceScaleFactor: 2 });
  await ctx.route('https://appsforoffice.microsoft.com/**', (route) => route.fulfill({
    contentType: 'application/javascript', body: 'window.__CW_MOCK_VERSION = ' + JSON.stringify(version) + ';\n' + MOCK,
  }));
  await ctx.route('http://addin.test/**', (route) => {
    const u = new URL(route.request().url());
    const f = path.join(DIST, decodeURIComponent(u.pathname));
    if (!fs.existsSync(f)) return route.fulfill({ status: 404, body: 'nf' });
    route.fulfill({ contentType: MIME[path.extname(f)] || 'application/octet-stream', body: fs.readFileSync(f) });
  });
  return ctx;
}

async function shot(page, name) { await page.screenshot({ path: path.join(OUT, name), fullPage: true }); }
async function slidePng(page, name, slideId) {
  const svg = await page.evaluate((id) => window.__mock.slideSVG(id), slideId || null);
  fs.writeFileSync(path.join(OUT, name + '.svg'), svg);
}
async function charts(page, slideIdx) {
  return page.evaluate((i) => window.__mock.slides[i].shapes.filter((s) => /Chartwerk/.test(s.name || '') || (s.tags && s.tags.CHARTWERK_ID))
    .map((s) => ({ id: s.id, name: s.name, type: s.type, w: s.width, h: s.height, kids: s.children ? s.children.length : 0, tags: s.tags })), slideIdx || 0);
}
async function paste(page, selector, text) {
  await page.evaluate(({ sel, text }) => {
    const inp = document.querySelector(sel);
    inp.focus();
    const dt = new DataTransfer();
    dt.setData('text/plain', text);
    inp.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
  }, { sel: selector, text });
}

async function paneRun(browser, version) {
  console.log('\n=== Aufgabenbereich, PowerPointApi ' + version + ' ===');
  const ctx = await setup(browser, version);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.goto('http://addin.test/taskpane.html');
  await page.waitForFunction(() => window.ChartwerkPane && document.querySelector('#grid input'));
  await sleep(300);
  const tag = version.replace('.', '');
  if (version === '1.10') await shot(page, 'pane-start.png');

  // 1) Einfügen
  await page.click('#btnApply');
  await page.waitForFunction(() => document.querySelector('#btnApply').textContent === 'Aktualisieren', null, { timeout: 5000 });
  let c = await charts(page);
  const vnum = (v) => { const [a, b] = v.split('.').map(Number); return a * 1000 + b; };
  const grouped = vnum(version) >= vnum('1.8');
  if (grouped) {
    check(c.length === 1 && c[0].type === 'Group' && c[0].kids > 20, 'Diagramm als Gruppe eingefügt (' + (c[0] && c[0].kids) + ' Formen)');
    check(!!c[0].tags.CHARTWERK && !!c[0].tags.CHARTWERK_0, 'Daten in Tags gespeichert');
  } else {
    check(c.length > 20 && c.every((s) => s.type !== 'Group'), 'Diagramm ungruppiert eingefügt (' + c.length + ' Formen)');
  }
  await slidePng(page, 'slide-insert-' + tag);
  if (grouped) {
    const before = await charts(page);
    await page.evaluate((id) => window.__mock.select('256#', [id]), before[0].id);
    await sleep(4000);
    const after = await charts(page);
    check(after.length === 1 && after[0].id === before[0].id && Math.abs(after[0].h - before[0].h) < 0.5,
      'Keine Neuanordnungs-Schleife bei ausgewähltem Diagramm (' + before[0].h.toFixed(1) + ' → ' + (after[0] ? after[0].h.toFixed(1) : '-') + ' pt)');
  }
  check(!(await page.evaluate(() => window.__mock.zeroDefaults)), 'Keine Größe 0 an PowerPoint übergeben');

  // 2) Excel-Tabelle ins Eckfeld einfügen (Live-Aktualisierung)
  const tsv = '\t2019\t2020\t2021\t2022\t2023\t2024E\nFirmenkunden\t120\t130\t128\t140\t155\t170\nPrivatkunden\t80\t82\t85\t90\t96\t101\nKapitalmarkt\t"1.040,5"\t35\t52\t48\t50\t55\n';
  await paste(page, '#grid input[data-r="-1"][data-c="-1"]', tsv);
  await sleep(1400);
  const st = await page.evaluate(() => ({ cats: window.ChartwerkPane.state.grid.cats, rows: window.ChartwerkPane.state.grid.rows.length, v: window.ChartwerkPane.currentSpec().series[2].values[0] }));
  check(st.cats.length === 6 && st.rows === 3, 'Tabelle übernommen (6 Spalten, 3 Zeilen)');
  check(st.v === 1040.5, 'Deutsches Zahlenformat "1.040,5" gelesen');
  c = await charts(page);
  const specTag = (t) => { const n = +t.CHARTWERK; let j = ''; for (let i = 0; i < n; i++) j += t['CHARTWERK_' + i]; return JSON.parse(j); };
  const holder = grouped ? c[0] : c.find((s) => /Rahmen/.test(s.name));
  check(holder && specTag(holder.tags).categories.length === 6, 'Live-Aktualisierung im Diagramm angekommen');
  check((await charts(page)).filter((s) => s.type === 'Group').length <= 1, 'Altes Diagramm entfernt (keine Duplikate)');

  // 3) Senkrechte Jahre werden automatisch gedreht
  await paste(page, '#grid input[data-r="-1"][data-c="-1"]', '\tUmsatz\tKosten\n2021\t10\t8\n2022\t12\t9\n2023\t15\t10\n');
  await sleep(200);
  const st2 = await page.evaluate(() => window.ChartwerkPane.state.grid);
  check(st2.cats.join(',') === '2021,2022,2023' && st2.rows[0].name === 'Umsatz', 'Jahre untereinander automatisch in Spalten gedreht');

  // 4) Typwechsel und Pfeile
  await page.click('#types button[title="Wasserfall"]');
  await page.evaluate(() => {
    window.ChartwerkPane.applyTable([['', 'EBIT 2023', 'Preis', 'Menge', 'Kosten', 'EBIT 2024'], ['Werte', '100', '20', '15', '-30', 'e']]);
  });
  await page.click('#add-level');
  await sleep(1400);
  c = await charts(page);
  const h2 = grouped ? c[0] : c.find((s) => /Rahmen/.test(s.name));
  const sp = specTag(h2.tags);
  check(sp.type === 'waterfall' && sp.decorations.some((d) => d.kind === 'level'), 'Wasserfall mit Niveaupfeil im Diagramm');
  if (version === '1.10') { await shot(page, 'pane-waterfall.png'); await slidePng(page, 'slide-waterfall'); }

  // 5) Tastatur: Zelle bearbeiten, Tab, Enter, Pfeiltasten, Rückgängig
  await page.click('#grid input[data-r="0"][data-c="1"]');
  await page.keyboard.type('25');
  await page.keyboard.press('Tab');
  await page.keyboard.type('12,5');
  await page.keyboard.press('Enter');
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.type('30');
  await page.keyboard.press('Tab');
  let g3 = await page.evaluate(() => window.ChartwerkPane.state.grid.rows[0].cells.slice(0, 3));
  check(g3[1] === '30' && g3[2] === '12,5', 'Eingabe mit Tab/Enter/Pfeiltasten wie in Excel (' + g3.join('|') + ')');
  await page.keyboard.press('Meta+z');
  await sleep(100);
  g3 = await page.evaluate(() => window.ChartwerkPane.state.grid.rows[0].cells.slice(0, 3));
  check(g3[1] === '25', 'Rückgängig mit ⌘Z (' + g3.join('|') + ')');
  await page.keyboard.press('Shift+ArrowRight');
  await page.keyboard.press('Shift+ArrowRight');
  const sel = await page.evaluate(() => document.querySelectorAll('#grid .insel').length);
  check(sel === 3, 'Mehrfachauswahl mit Umschalt+Pfeil (' + sel + ' Zellen)');
  await page.keyboard.press('Escape');
  await sleep(900);

  if (version !== '1.4') {
    // 6) Zweites Diagramm einfügen, dann erstes auswählen: Datenblatt lädt es
    await page.click('#btnCopy');
    await sleep(800);
    c = await charts(page);
    const first = grouped ? c[0] : null;
    if (grouped) {
      check(c.length === 2, 'Kopie eingefügt (2 Diagramme)');
      await page.evaluate((id) => window.__mock.select('256#', [id]), first.id);
      await sleep(700);
      const bound = await page.evaluate(() => window.ChartwerkPane.state.bound);
      check(bound && bound.shapeId === first.id, 'Auswahl auf der Folie lädt das Diagramm ins Datenblatt');

      // 7) Größe ändern: automatisches Neu-Anordnen
      await page.evaluate((id) => window.__mock.resizeGroup(id, 520, 300), first.id);
      await sleep(3600);
      c = await charts(page);
      const resized = c.find((s) => Math.abs(s.w - 520) < 1.5 && Math.abs(s.h - 300) < 1.5);
      const geom = resized ? JSON.parse(resized.tags.CHARTWERK_GEOM || 'null') : null;
      check(!!resized && geom && Math.abs(geom.f[2] - 520) < 1.5 && Math.abs(geom.f[3] - 300) < 1.5,
        'Nach Größenänderung neu angeordnet (' + c.map((s) => s.w.toFixed(0) + '×' + s.h.toFixed(0)).join(', ') + ')');
      await slidePng(page, 'slide-resized-' + tag);
    } else {
      // ungruppiert: ein Kindelement auswählen
      const kid = c.find((s) => /Segment|Summe|Veränderung/.test(s.name));
      await page.evaluate((id) => window.__mock.select('256#', [id]), kid.id);
      await sleep(700);
      const bound = await page.evaluate(() => window.ChartwerkPane.state.bound);
      check(!!bound, 'Ungruppiert: Klick auf ein Element lädt das Diagramm');
      await page.evaluate(() => window.ChartwerkPane.state.grid.rows[0].cells[1] = '40');
      await page.click('#btnApply');
      await sleep(900);
      const after = await charts(page);
      const ids = new Set(after.map((s) => s.tags.CHARTWERK_ID));
      check(ids.size === 2, 'Ungruppiert: Aktualisieren ersetzt nur das eigene Diagramm (' + ids.size + ' IDs)');
    }
  }
  const modelErrors = await page.evaluate(() => window.__mock.errors);
  check(modelErrors.length === 0, 'Keine API-Fehler im Nachbau' + (modelErrors.length ? ': ' + modelErrors.slice(0, 3).join(' | ') : ''));
  check(errors.length === 0, 'Keine JavaScript-Fehler' + (errors.length ? ': ' + errors.slice(0, 3).join(' | ') : ''));
  await ctx.close();
}

async function commandsRun(browser) {
  console.log('\n=== Menüband-Befehle (Function File) ===');
  const ctx = await setup(browser, '1.10');
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('http://addin.test/commands.html');
  await page.waitForFunction(() => typeof window.cwInsertWaterfall === 'function');
  const call = (name) => page.evaluate((n) => new Promise((res) => window[n]({ completed: () => res(true) })), name);

  const assoc = await page.evaluate(() => Object.keys(window.__assoc || {}).length);
  check(assoc === 11, 'Office.actions.associate für alle 11 Befehle');
  for (const t of ['Stacked', 'Clustered', 'Percent', 'Bar', 'Waterfall', 'Line', 'Mekko']) {
    await page.evaluate(() => { window.__mock.slides[1].shapes = []; window.__mock.selection = { slideId: '257#', shapeIds: [] }; });
    await call('cwInsert' + t);
    const c = await charts(page, 1);
    check(c.length === 1 && c[0].type === 'Group', 'Menüband: ' + t + ' eingefügt');
    await slidePng(page, 'cmd-' + t.toLowerCase(), '257#');
  }
  // Leerer Inhaltsplatzhalter wird durch das Diagramm ersetzt
  await page.evaluate(() => { window.__mock.selection = { slideId: '258#', shapeIds: [] }; });
  await call('cwInsertStacked');
  const s3 = await page.evaluate(() => window.__mock.slides[2].shapes.map((s) => ({ name: s.name, type: s.type, l: s.left, t: s.top, w: s.width, h: s.height })));
  const grp = s3.find((x) => x.type === 'Group');
  check(!s3.some((x) => /Inhaltsplatzhalter/.test(x.name)) && grp && Math.abs(grp.l - 66) < 1 && Math.abs(grp.t - 144) < 1 && Math.abs(grp.w - 828) < 1,
    'Leerer Inhaltsplatzhalter: Diagramm übernimmt dessen Fläche (' + (grp ? [grp.l, grp.t, grp.w, grp.h].map((v) => v.toFixed(0)).join('/') : '-') + ')');
  await slidePng(page, 'cmd-placeholder', '258#');
  await page.evaluate(() => { window.__mock.slides[1].shapes = []; window.__mock.selection = { slideId: '257#', shapeIds: [] }; });
  await call('cwInsertMekko');
  // CAGR auf Mekko -> nicht unterstützt
  await call('cwToggleCagr');
  let log = await page.evaluate(() => window.__mock.log.filter((l) => l[0] === 'dialog').map((l) => l[1]));
  check(log.some((m) => /Mekko/.test(m)), 'Hinweis, wenn Pfeil für den Typ nicht geht');
  await page.evaluate(() => { window.__mock.slides[1].shapes = []; window.__mock.selection = { slideId: '257#', shapeIds: [] }; });
  await call('cwInsertClustered');
  await call('cwToggleDiff');
  let c = await charts(page, 1);
  const spec = (t) => { let j = ''; for (let i = 0; i < +t.CHARTWERK; i++) j += t['CHARTWERK_' + i]; return JSON.parse(j); };
  check(spec(c[0].tags).decorations.length === 1, 'Differenzpfeil per Menüband hinzugefügt');
  await call('cwToggleDiff');
  c = await charts(page, 1);
  check(spec(c[0].tags).decorations.length === 0, 'Zweiter Klick entfernt ihn wieder');
  await page.evaluate(() => { window.__mock.selection = { slideId: '257#', shapeIds: [] }; });
  await call('cwRefresh');
  log = await page.evaluate(() => window.__mock.log.filter((l) => l[0] === 'dialog').map((l) => l[1]));
  check(log.some((m) => /auswählen/.test(m)), 'Hinweis „bitte Diagramm auswählen“ ohne Auswahl');
  const modelErrors = await page.evaluate(() => window.__mock.errors);
  check(modelErrors.length === 0, 'Keine API-Fehler' + (modelErrors.length ? ': ' + modelErrors.slice(0, 3).join(' | ') : ''));
  check(errors.length === 0, 'Keine JavaScript-Fehler' + (errors.length ? ': ' + errors.join(' | ') : ''));
  await ctx.close();
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  try {
    await paneRun(browser, '1.10');
    await paneRun(browser, '1.8');
    await paneRun(browser, '1.5');
    await paneRun(browser, '1.4');
    await commandsRun(browser);
  } finally {
    await browser.close();
  }
  console.log(failures ? '\n' + failures + ' Fehler' : '\nAlle Tests bestanden');
  process.exit(failures ? 1 : 0);
})();
