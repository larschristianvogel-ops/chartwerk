#!/usr/bin/env node
/* Baut das Add-in nach dist/: Dateien kopieren, Icons rendern, Manifest mit Basis-URL schreiben.
 * Aufruf: node build.js https://DEIN-NAME.github.io/chartwerk/
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ADDIN_ID = 'd192b15a-e413-4298-a654-58e4352c01f5';
const VERSION = '1.0.0.0';

const args = process.argv.slice(2);
const outIdx = args.indexOf('--out');
const outDir = outIdx >= 0 ? args.splice(outIdx, 2)[1] : 'dist';
let baseUrl = args[0] || 'https://localhost:3000/';
if (!/^https:\/\//.test(baseUrl)) { console.error('Basis-URL muss mit https:// beginnen.'); process.exit(1); }
if (!baseUrl.endsWith('/')) baseUrl += '/';
const origin = new URL(baseUrl).origin;

const SRC = path.join(__dirname, 'src');
const DIST = path.resolve(__dirname, outDir);
if (path.relative(__dirname, DIST) === '' || path.relative(__dirname, DIST).startsWith('..')) {
  console.error('Ausgabeordner muss ein Unterordner sein (z. B. dist oder docs).'); process.exit(1);
}

function copyDir(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const name of fs.readdirSync(from)) {
    const a = path.join(from, name), b = path.join(to, name);
    if (fs.statSync(a).isDirectory()) copyDir(a, b); else fs.copyFileSync(a, b);
  }
}

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const BUTTONS = {
  insert: [
    ['Stacked', 'stacked', 'cwInsertStacked', 'Gestapelt', 'Gestapelte Säulen mit Summen, Reihenbeschriftung rechts und CAGR-Pfeil. Daten danach im Datenblatt anpassen.'],
    ['Clustered', 'clustered', 'cwInsertClustered', 'Gruppiert', 'Gruppierte Säulen für Vergleiche, zum Beispiel Plan und Ist.'],
    ['Percent', 'percent', 'cwInsertPercent', '100 %', '100-%-Säulen für Anteile und Strukturen.'],
    ['Bar', 'bar', 'cwInsertBar', 'Balken', 'Horizontale Balken, ideal für Rankings.'],
    ['Waterfall', 'waterfall', 'cwInsertWaterfall', 'Wasserfall', 'Brücke vom Start- zum Endwert, etwa eine EBIT-Bridge. Ein e im Datenblatt erzeugt Summen.'],
    ['Line', 'line', 'cwInsertLine', 'Linie', 'Liniendiagramm für Zeitreihen mit Beschriftung am Linienende.'],
    ['Mekko', 'mekko', 'cwInsertMekko', 'Mekko', 'Marimekko: Spaltenbreite nach Größe, Segmente nach Anteil, zum Beispiel für Marktkarten.'],
  ],
  edit: [
    ['Refresh', 'refresh', 'cwRefresh', 'Neu anordnen', 'Ausgewähltes Diagramm an seine aktuelle Größe anpassen und Beschriftungen und Pfeile neu anordnen.'],
  ],
  arrows: [
    ['Cagr', 'cagr', 'cwToggleCagr', 'CAGR', 'CAGR-Pfeil von der ersten zur letzten Säule ein- oder ausblenden.'],
    ['Diff', 'diff', 'cwToggleDiff', 'Differenz', 'Differenzpfeil zwischen den letzten beiden Säulen ein- oder ausblenden (Wasserfall: Start bis Ende).'],
    ['Level', 'level', 'cwToggleLevel', 'Niveau', 'Niveaupfeil zwischen erster und letzter Säule ein- oder ausblenden.'],
  ],
};

function iconXml(key) {
  return `<Icon>
                    <bt:Image size="16" resid="Ico.${key}.16"/>
                    <bt:Image size="32" resid="Ico.${key}.32"/>
                    <bt:Image size="80" resid="Ico.${key}.80"/>
                  </Icon>`;
}
function fnButton(b) {
  const [id, , fn] = b;
  return `
                <Control xsi:type="Button" id="Chartwerk.Btn${id}">
                  <Label resid="Lbl.${id}"/>
                  <Supertip>
                    <Title resid="Lbl.${id}"/>
                    <Description resid="Tip.${id}"/>
                  </Supertip>
                  ${iconXml(id)}
                  <Action xsi:type="ExecuteFunction">
                    <FunctionName>${fn}</FunctionName>
                  </Action>
                </Control>`;
}
function groupXml(id, labelRes, iconKey, controls) {
  return `
              <Group id="Chartwerk.Grp${id}">
                <Label resid="${labelRes}"/>
                ${iconXml(iconKey)}${controls}
              </Group>`;
}

function manifest() {
  const all = [...BUTTONS.insert, ...BUTTONS.edit, ...BUTTONS.arrows];
  const sheetBtn = `
                <Control xsi:type="Button" id="Chartwerk.BtnSheet">
                  <Label resid="Lbl.Sheet"/>
                  <Supertip>
                    <Title resid="Lbl.Sheet"/>
                    <Description resid="Tip.Sheet"/>
                  </Supertip>
                  ${iconXml('Sheet')}
                  <Action xsi:type="ShowTaskpane">
                    <TaskpaneId>ChartwerkPane</TaskpaneId>
                    <SourceLocation resid="Url.Taskpane"/>
                  </Action>
                </Control>`;
  const images = [];
  const iconKeys = all.map((b) => [b[0], b[1]]).concat([['Sheet', 'sheet']]);
  for (const [key, file] of iconKeys) for (const s of [16, 32, 80]) images.push(`<bt:Image id="Ico.${key}.${s}" DefaultValue="${baseUrl}assets/${file}-${s}.png"/>`);
  images.push(`<bt:Image id="Ico.Logo.16" DefaultValue="${baseUrl}assets/icon-16.png"/>`);
  images.push(`<bt:Image id="Ico.Logo.32" DefaultValue="${baseUrl}assets/icon-32.png"/>`);
  images.push(`<bt:Image id="Ico.Logo.80" DefaultValue="${baseUrl}assets/icon-80.png"/>`);
  const shorts = [
    ['Tab.Label', 'Chartwerk'],
    ['Grp.Insert', 'Diagramm einfügen'],
    ['Grp.Edit', 'Bearbeiten'],
    ['Grp.Arrows', 'Pfeile'],
    ['Lbl.Sheet', 'Datenblatt'],
    ['GetStarted.Title', 'Chartwerk ist bereit'],
    ...all.map((b) => [`Lbl.${b[0]}`, b[3]]),
  ];
  const longs = [
    ['Tip.Sheet', 'Datenblatt öffnen: Werte wie in Excel eintragen oder per ⌘V aus Excel einfügen. Ein ausgewähltes Diagramm wird automatisch geladen.'],
    ['GetStarted.Description', 'Im Reiter Chartwerk ein Diagramm einfügen und über Datenblatt die Werte ändern.'],
    ...all.map((b) => [`Tip.${b[0]}`, b[4]]),
  ];
  for (const [, v] of shorts) if (v.length > 125) throw new Error('ShortString zu lang: ' + v);
  for (const [, v] of longs) if (v.length > 250) throw new Error('LongString zu lang: ' + v);

  return `<?xml version="1.0" encoding="UTF-8"?>
<OfficeApp xmlns="http://schemas.microsoft.com/office/appforoffice/1.1"
           xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
           xmlns:bt="http://schemas.microsoft.com/office/officeappbasictypes/1.0"
           xmlns:ov="http://schemas.microsoft.com/office/taskpaneappversionoverrides"
           xsi:type="TaskPaneApp">
  <Id>${ADDIN_ID}</Id>
  <Version>${VERSION}</Version>
  <ProviderName>Chartwerk</ProviderName>
  <DefaultLocale>de-DE</DefaultLocale>
  <DisplayName DefaultValue="Chartwerk"/>
  <Description DefaultValue="Diagramme im Beratungsstil: Datenblatt wie Excel, automatische CAGR- und Differenzpfeile, Wasserfall, Mekko."/>
  <IconUrl DefaultValue="${baseUrl}assets/icon-32.png"/>
  <HighResolutionIconUrl DefaultValue="${baseUrl}assets/icon-64.png"/>
  <SupportUrl DefaultValue="${baseUrl}"/>
  <AppDomains>
    <AppDomain>${origin}</AppDomain>
  </AppDomains>
  <Hosts>
    <Host Name="Presentation"/>
  </Hosts>
  <DefaultSettings>
    <SourceLocation DefaultValue="${baseUrl}taskpane.html"/>
  </DefaultSettings>
  <Permissions>ReadWriteDocument</Permissions>
  <VersionOverrides xmlns="http://schemas.microsoft.com/office/taskpaneappversionoverrides" xsi:type="VersionOverridesV1_0">
    <Hosts>
      <Host xsi:type="Presentation">
        <DesktopFormFactor>
          <GetStarted>
            <Title resid="GetStarted.Title"/>
            <Description resid="GetStarted.Description"/>
            <LearnMoreUrl resid="Url.Home"/>
          </GetStarted>
          <FunctionFile resid="Url.Commands"/>
          <ExtensionPoint xsi:type="PrimaryCommandSurface">
            <CustomTab id="Chartwerk.Tab">${groupXml('Insert', 'Grp.Insert', 'Stacked', BUTTONS.insert.map(fnButton).join(''))}${groupXml('Edit', 'Grp.Edit', 'Sheet', sheetBtn + BUTTONS.edit.map(fnButton).join(''))}${groupXml('Arrows', 'Grp.Arrows', 'Cagr', BUTTONS.arrows.map(fnButton).join(''))}
              <Label resid="Tab.Label"/>
            </CustomTab>
          </ExtensionPoint>
        </DesktopFormFactor>
      </Host>
    </Hosts>
    <Resources>
      <bt:Images>
        ${images.join('\n        ')}
      </bt:Images>
      <bt:Urls>
        <bt:Url id="Url.Taskpane" DefaultValue="${baseUrl}taskpane.html"/>
        <bt:Url id="Url.Commands" DefaultValue="${baseUrl}commands.html"/>
        <bt:Url id="Url.Home" DefaultValue="${baseUrl}"/>
      </bt:Urls>
      <bt:ShortStrings>
        ${shorts.map(([k, v]) => `<bt:String id="${k}" DefaultValue="${esc(v)}"/>`).join('\n        ')}
      </bt:ShortStrings>
      <bt:LongStrings>
        ${longs.map(([k, v]) => `<bt:String id="${k}" DefaultValue="${esc(v)}"/>`).join('\n        ')}
      </bt:LongStrings>
    </Resources>
  </VersionOverrides>
</OfficeApp>
`;
}

async function icons() {
  let sharp;
  try { sharp = require('sharp'); } catch (e) { sharp = require('/opt/npm-tools/node_modules/sharp'); }
  const ICONS = require('./src/icons.js');
  const out = path.join(DIST, 'assets');
  fs.mkdirSync(out, { recursive: true });
  const names = ['stacked', 'clustered', 'percent', 'bar', 'waterfall', 'line', 'mekko', 'sheet', 'refresh', 'cagr', 'diff', 'level'];
  for (const n of names) {
    for (const s of [16, 20, 24, 32, 40, 48, 64, 80]) {
      await sharp(Buffer.from(ICONS[n]), { density: 72 * s / 24 * 4 }).resize(s, s).png().toFile(path.join(out, `${n}-${s}.png`));
    }
  }
  for (const s of [16, 32, 64, 80, 128]) {
    await sharp(Buffer.from(ICONS.logo), { density: 72 * s / 24 * 4 }).resize(s, s).png().toFile(path.join(out, `icon-${s}.png`));
  }
}

/* Versionsanhang an lokale Skripte/Styles, damit Office nach einem Update keine alten Dateien aus dem Cache nimmt. */
function bustCache() {
  const crypto = require('crypto');
  const h = crypto.createHash('sha1');
  for (const f of ['engine.js', 'ppt.js', 'icons.js', 'taskpane.js', 'taskpane.css', 'commands.js']) h.update(fs.readFileSync(path.join(SRC, f)));
  const v = h.digest('hex').slice(0, 8);
  for (const f of fs.readdirSync(DIST).filter((x) => x.endsWith('.html'))) {
    const file = path.join(DIST, f);
    const html = fs.readFileSync(file, 'utf8').replace(/(src|href)="((?:engine|ppt|icons|taskpane|commands)\.(?:js|css))"/g, '$1="$2?v=' + v + '"');
    fs.writeFileSync(file, html);
  }
  return v;
}

(async () => {
  fs.rmSync(DIST, { recursive: true, force: true });
  copyDir(SRC, DIST);
  const v = bustCache();
  console.log('Build ' + v);
  await icons();
  fs.writeFileSync(path.join(DIST, 'manifest.xml'), manifest());
  fs.writeFileSync(path.join(DIST, '.nojekyll'), '');
  fs.writeFileSync(path.join(__dirname, 'manifest.xml'), manifest());
  console.log('Fertig: ' + path.relative(__dirname, DIST) + '/ für ' + baseUrl);
})().catch((e) => { console.error(e); process.exit(1); });
