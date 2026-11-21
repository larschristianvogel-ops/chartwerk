# Chartwerk für PowerPoint (Mac)

PowerPoint-Add-in mit eigenem Reiter **Chartwerk** für Diagramme im Beratungsstil, ähnlich think-cell:
Daten in ein Datenblatt wie in Excel eintragen (oder aus Excel einfügen), auf der Folie entstehen echte
PowerPoint-Formen mit automatischen Pfeilen, Summen und Beschriftungen.

## Funktionen

- **7 Diagrammtypen:** Gestapelt, Gruppiert, 100 %, Balken, Wasserfall, Linie, Mekko
- **Pfeile automatisch:** CAGR-Pfeil (erkennt Jahre wie 2024E oder GJ 2023), Differenzpfeil (% oder absolut), Niveaupfeil; mehrere Pfeile werden ohne Überschneidung gestapelt
- **Datenblatt wie Excel:** Pfeiltasten, Enter, Tab, F2, Umschalt+Pfeile, ⌘C/⌘V, ⌘Z, Zeilen/Spalten einfügen und löschen, Transponieren, Import von .xlsx und .csv
- **Einfügen aus Excel:** Bereich mit Beschriftungen kopieren, ins graue Eckfeld klicken, ⌘V. Deutsches und englisches Zahlenformat, Klammern als Minus, „e“ für Summen im Wasserfall. Stehen Jahre untereinander, wird automatisch gedreht.
- **Live-Verknüpfung:** Diagramm auf der Folie anklicken, das Datenblatt lädt seine Daten; jede Änderung geht sofort ins Diagramm
- **Größe ändern:** Diagramm größer ziehen, Chartwerk ordnet Beschriftungen und Pfeile neu an
- **Farben der Vorlage:** nutzt die Akzentfarben des Folienmasters (bei Standard-Office-Design eine Blau-Palette); dazu Paletten Blau, Petrol, Grau, Orange, Bunt
- Summen, Legende direkt an den Segmenten, weiße Trennlinien, Wasserfall-Verbinder, Vorzeichen, deutsches Zahlenformat, Einheit, Text oben links

## Installation

Office-Add-ins laden ihre Oberfläche immer über HTTPS. Deshalb liegen die Dateien auf GitHub Pages
(kostenlos), und PowerPoint bekommt nur die kleine Datei `manifest.xml`.

1. **Hosting:** Dieses Repository auf GitHub, dann *Settings > Pages > Build and deployment*:
   Source „Deploy from a branch“, Branch `main`, Ordner `/docs`, *Save*. Nach etwa einer Minute ist die
   Seite unter `https://<github-name>.github.io/chartwerk/` erreichbar.
2. **Manifest auf dem Mac ablegen** (PowerPoint vorher beenden), im Terminal:

   ```bash
   mkdir -p ~/Library/Containers/com.microsoft.Powerpoint/Data/Documents/wef
   curl -fsSL https://<github-name>.github.io/chartwerk/manifest.xml \
     -o ~/Library/Containers/com.microsoft.Powerpoint/Data/Documents/wef/chartwerk.xml
   ```

3. **PowerPoint neu starten** (komplett beenden mit ⌘Q), eine Präsentation öffnen.
4. **Einmalig aktivieren:** Reiter *Start > Add-Ins*, unter „Entwicklertool-Add-Ins“ auf **Chartwerk** klicken.
   Danach steht der Reiter **Chartwerk** dauerhaft im Menüband.

Voraussetzung: PowerPoint für Mac aus Microsoft 365, mindestens Version 16.62. Gruppieren der Diagramme
ab 16.96, Foliengröße und Vorlagenfarben ab 16.105 (ältere Versionen nutzen Ersatzlösungen).

**Entfernen:** die Datei `chartwerk.xml` im `wef`-Ordner löschen und PowerPoint neu starten.

## Bedienung

| Was | Wie |
|---|---|
| Diagramm einfügen | Reiter Chartwerk, Typ anklicken (Beispieldaten), oder im Datenblatt „In Folie einfügen“ |
| Daten ändern | Diagramm anklicken, *Datenblatt* öffnen, Werte eintippen oder aus Excel einfügen |
| Pfeile | Im Datenblatt unter „Pfeile“ (Von/Bis wählbar) oder im Menüband CAGR / Differenz / Niveau (ein- und ausschalten) |
| Wasserfall | Erste Spalte = Startwert, Veränderungen positiv oder negativ, `e` = Summe |
| Größe | Diagramm ziehen; ohne offenes Datenblatt danach *Neu anordnen* klicken |

## Updates

Neue Versionen landen per `git push` automatisch auf GitHub Pages. PowerPoint hält Dateien bis zu
10 Minuten im Zwischenspeicher; danach (oder nach einem Neustart von PowerPoint) ist die neue Version aktiv.
Das Manifest muss dafür nicht neu installiert werden.

## Grenzen

- Die Daten werden ins Diagramm kopiert, es gibt keine dauerhafte Verknüpfung zu einer Excel-Datei.
- Pfeile gibt es für Gestapelt, Gruppiert, Linie und Wasserfall.
- Die Office-Schnittstelle kennt keine Pfeilspitzen an Linien; Chartwerk zeichnet sie als kleine Dreiecke.

## Entwicklung

```bash
node build.js https://<github-name>.github.io/chartwerk/ --out docs   # baut docs/ und manifest.xml
node test/render-samples.js                                           # Beispielgrafiken nach test/out
node test/e2e.js                                                      # Tests gegen nachgebaute PowerPoint-API
```

Quellen in `src/`: `engine.js` (Layout, Zahlenformat, SVG-Vorschau), `ppt.js` (PowerPoint-Formen, Tags,
Auswahl), `taskpane.*` (Datenblatt), `commands.js` (Menüband), `icons.js`.
Excel-Import mit SheetJS (Apache-2.0-Lizenz, siehe `src/vendor/xlsx-LICENSE.txt`).
