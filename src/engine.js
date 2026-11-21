/*! Chartwerk Engine | Diagramm-Layout, Zahlenformat, SVG-Vorschau */
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.Chartwerk = root.Chartwerk || {};
    Object.keys(api).forEach(function (k) { root.Chartwerk[k] = api[k]; });
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const VERSION = '1.0.0';
  const NBSP = ' ';
  const MINUS = '−';

  const C_TEXT = '#1A1A1A';
  const C_TEXT2 = '#404040';
  const C_MUTED = '#8C8C8C';
  const C_AXIS = '#7F7F7F';
  const C_ARROW = '#404040';

  const TYPES = {
    stacked:   { label: 'Gestapelt',  legend: 'right', deco: ['cagr', 'diff', 'level'] },
    clustered: { label: 'Gruppiert',  legend: 'top',   deco: ['cagr', 'diff', 'level'] },
    percent:   { label: '100 %',      legend: 'right', deco: [] },
    bar:       { label: 'Balken',     legend: 'top',   deco: [] },
    waterfall: { label: 'Wasserfall', legend: 'none',  deco: ['diff', 'level', 'cagr'] },
    line:      { label: 'Linie',      legend: 'right', deco: ['cagr', 'diff', 'level'] },
    mekko:     { label: 'Mekko',      legend: 'right', deco: [] },
  };
  const TYPE_ORDER = ['stacked', 'clustered', 'percent', 'bar', 'waterfall', 'line', 'mekko'];
  const DECO_LABELS = { cagr: 'CAGR-Pfeil', diff: 'Differenzpfeil', level: 'Niveaupfeil' };

  const PALETTES = {
    theme:  { label: 'Vorlage (automatisch)', kind: 'cat', colors: null },
    blau:   { label: 'Blau',   kind: 'seq', colors: ['#0B2E59', '#1F5A96', '#3F84C4', '#7DB0DE', '#B5D3EE', '#DCEAF7'] },
    petrol: { label: 'Petrol', kind: 'seq', colors: ['#0B3B3F', '#12666B', '#1E9298', '#5CBDBF', '#A3DCDB', '#D3EFEE'] },
    grau:   { label: 'Grau',   kind: 'seq', colors: ['#262626', '#4D4D4D', '#7A7A7A', '#A6A6A6', '#CCCCCC', '#E6E6E6'] },
    orange: { label: 'Orange', kind: 'seq', colors: ['#6B2A0B', '#B4430F', '#E0701F', '#F2A35E', '#F8CDA2', '#FCE8D4'] },
    bunt:   { label: 'Bunt',   kind: 'cat', colors: ['#2A78D6', '#EB6834', '#1BAF7A', '#EDA100', '#E87BA4', '#008300', '#6250D6', '#E34948'] },
  };

  /* ------------------------------------------------------------------ */
  /* Hilfsfunktionen                                                     */
  /* ------------------------------------------------------------------ */

  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function clampInt(v, a, b) { v = Math.round(+v); if (!isFinite(v)) v = a; return clamp(v, a, b); }
  function r2(v) { return Math.round(v * 100) / 100; }

  function hexToRgb(h) {
    h = String(h || '#000000').replace('#', '').trim();
    if (h.length === 3) h = h.split('').map(function (x) { return x + x; }).join('');
    const n = parseInt(h.slice(0, 6), 16) || 0;
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function rgbToHex(rgb) {
    return '#' + rgb.map(function (v) { return clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0'); }).join('').toUpperCase();
  }
  function mix(a, b, t) {
    const A = hexToRgb(a), B = hexToRgb(b);
    return rgbToHex(A.map(function (v, i) { return v + (B[i] - v) * t; }));
  }
  function luminance(hex) {
    const c = hexToRgb(hex).map(function (v) {
      v /= 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  }
  function contrast(a, b) {
    const L1 = luminance(a), L2 = luminance(b);
    return (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
  }
  /** Textfarbe (weiß oder fast schwarz) mit dem besseren Kontrast auf einer Fläche. */
  function onColor(fill) {
    return contrast(fill, '#FFFFFF') >= contrast(fill, C_TEXT) ? '#FFFFFF' : C_TEXT;
  }
  function normHex(h) {
    if (typeof h !== 'string') return null;
    const m = h.trim().match(/^#?([0-9a-f]{6}|[0-9a-f]{3})$/i);
    return m ? rgbToHex(hexToRgb(m[1])) : null;
  }

  /* Zeichenbreiten (em) nach Arial, reicht für Layout-Entscheidungen. */
  const CW = {
    ' ': 0.278, ' ': 0.278, ' ': 0.2, '.': 0.278, ',': 0.278, ':': 0.278, ';': 0.278, '!': 0.278,
    '%': 0.889, '+': 0.584, '-': 0.333, '−': 0.584, '–': 0.556, '/': 0.278, '(': 0.333, ')': 0.333,
    '€': 0.556, '$': 0.556, '&': 0.667, '\'': 0.191, '"': 0.355, '#': 0.556, '*': 0.389, '=': 0.584, '?': 0.556,
    'A': 0.667, 'B': 0.667, 'C': 0.722, 'D': 0.722, 'E': 0.667, 'F': 0.611, 'G': 0.778, 'H': 0.722, 'I': 0.278,
    'J': 0.5, 'K': 0.667, 'L': 0.556, 'M': 0.833, 'N': 0.722, 'O': 0.778, 'P': 0.667, 'Q': 0.778, 'R': 0.722,
    'S': 0.667, 'T': 0.611, 'U': 0.722, 'V': 0.667, 'W': 0.944, 'X': 0.667, 'Y': 0.667, 'Z': 0.611,
    'a': 0.556, 'b': 0.556, 'c': 0.5, 'd': 0.556, 'e': 0.556, 'f': 0.278, 'g': 0.556, 'h': 0.556, 'i': 0.222,
    'j': 0.222, 'k': 0.5, 'l': 0.222, 'm': 0.833, 'n': 0.556, 'o': 0.556, 'p': 0.556, 'q': 0.556, 'r': 0.333,
    's': 0.5, 't': 0.278, 'u': 0.556, 'v': 0.5, 'w': 0.722, 'x': 0.5, 'y': 0.5, 'z': 0.5,
    'Ä': 0.667, 'Ö': 0.778, 'Ü': 0.722, 'ä': 0.556, 'ö': 0.556, 'ü': 0.556, 'ß': 0.611, 'é': 0.556, 'è': 0.556,
  };
  function textWidth(str, size, bold) {
    let w = 0;
    for (const ch of String(str)) {
      if (CW[ch] !== undefined) w += CW[ch];
      else if (ch >= '0' && ch <= '9') w += 0.556;
      else w += 0.6;
    }
    return w * size * (bold ? 1.06 : 1);
  }
  function wrapText(measure, text, width, size, bold) {
    const words = String(text).split(/\s+/).filter(Boolean);
    if (!words.length) return [''];
    const lines = [];
    let cur = '';
    words.forEach(function (w) {
      const cand = cur ? cur + ' ' + w : w;
      if (cur && measure(cand, size, bold) > width) { lines.push(cur); cur = w; } else { cur = cand; }
    });
    if (cur) lines.push(cur);
    return lines;
  }

  /* ------------------------------------------------------------------ */
  /* Zahlen lesen und formatieren (deutsches Format)                     */
  /* ------------------------------------------------------------------ */

  /**
   * Liest eine Zelle: leer -> null, "e" / "=" / "Summe" -> 'e' (Wasserfall-Summe),
   * Zahl -> number, sonst NaN. Versteht 1.234,5 / 1,234.5 / (12) / 12 % / −5 / € 3,5 Mio.
   */
  function parseNumber(raw) {
    if (raw === null || raw === undefined) return null;
    if (typeof raw === 'number') return isFinite(raw) ? raw : NaN;
    let s = String(raw).trim();
    if (!s) return null;
    if (/^(e|=|summe|sum|total|zwischensumme)$/i.test(s)) return 'e';
    s = s.replace(/[−–—]/g, '-').replace(/[\s  ']/g, '');
    let neg = false;
    if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1); }
    s = s.replace(/(EUR|USD|CHF|GBP|Mio\.?|Mrd\.?|Tsd\.?|Bn|Mn|k)$/i, '').replace(/[€$£%]/g, '');
    if (s.charAt(0) === '+') s = s.slice(1);
    if (s.charAt(0) === '-') { neg = !neg; s = s.slice(1); }
    if (s.charAt(s.length - 1) === '-') { neg = !neg; s = s.slice(0, -1); }
    const hasDot = s.indexOf('.') >= 0, hasComma = s.indexOf(',') >= 0;
    if (hasDot && hasComma) {
      if (s.lastIndexOf(',') > s.lastIndexOf('.')) s = s.replace(/\./g, '').replace(',', '.');
      else s = s.replace(/,/g, '');
    } else if (hasComma) {
      s = (s.match(/,/g).length > 1) ? s.replace(/,/g, '') : s.replace(',', '.');
    } else if (hasDot) {
      if (/^[1-9]\d{0,2}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
    }
    if (!/^(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i.test(s)) return NaN;
    const v = parseFloat(s);
    if (!isFinite(v)) return NaN;
    return neg ? -v : v;
  }

  function groupThousands(intStr) { return intStr.replace(/\B(?=(\d{3})+(?!\d))/g, '.'); }

  function fmtNumber(v, dec) {
    if (v === null || v === undefined || !isFinite(v)) return '';
    dec = clampInt(dec, 0, 6);
    const neg = v < 0 && Math.abs(v) >= 0.5 * Math.pow(10, -dec);
    const parts = Math.abs(v).toFixed(dec).split('.');
    return (neg ? MINUS : '') + groupThousands(parts[0]) + (parts[1] ? ',' + parts[1] : '');
  }

  function decimalsFor(values, o) {
    if (o.decimals !== 'auto' && o.decimals !== undefined && o.decimals !== null && o.decimals !== '') return clampInt(o.decimals, 0, 4);
    let d = 0;
    values.forEach(function (v) {
      if (typeof v !== 'number' || !isFinite(v)) return;
      let k = 0;
      while (k < 2 && Math.abs(v * Math.pow(10, k) - Math.round(v * Math.pow(10, k))) > 1e-7) k++;
      d = Math.max(d, k);
    });
    return d;
  }

  function fmtPct(p, dec, sign) {
    if (p === null || p === undefined || !isFinite(p)) return 'n/a';
    let s = fmtNumber(p * 100, dec);
    if (sign && p * 100 >= 0.5 * Math.pow(10, -dec)) s = '+' + s;
    return s + NBSP + '%';
  }

  function fmtVal(c, v, sign) {
    let s = fmtNumber(v, c.dec);
    if (sign && v >= 0.5 * Math.pow(10, -c.dec)) s = '+' + s;
    if (c.o.unit && String(c.o.unit).trim()) s += NBSP + String(c.o.unit).trim();
    return s;
  }

  /** Jahr aus Kategorie lesen: "2024", "2024E", "GJ 2023", "FY24", "'24". */
  function yearOf(s) {
    s = String(s);
    let m = s.match(/(?:^|\D)((?:19|20)\d{2})(?!\d)/);
    if (m) return +m[1];
    m = s.match(/(?:FY|GJ|'|’)\s?(\d{2})(?!\d)/i);
    if (m) return 2000 + +m[1];
    return null;
  }
  function periodsBetween(cats, i, j) {
    const a = yearOf(cats[i]), b = yearOf(cats[j]);
    if (a !== null && b !== null && a !== b) return Math.abs(b - a);
    return Math.abs(j - i);
  }

  /* ------------------------------------------------------------------ */
  /* Spezifikation                                                       */
  /* ------------------------------------------------------------------ */

  function defaultOptions(type) {
    return {
      fontSize: 12,
      decimals: 'auto',
      unit: '',
      title: '',
      palette: 'theme',
      legend: (TYPES[type] || TYPES.stacked).legend,
      showLabels: true,
      showTotals: type === 'stacked' || type === 'mekko' || type === 'bar',
      gap: type === 'clustered' ? 0.3 : 0.4,
      separators: true,
      axis: true,
      connectors: true,
      signs: true,
      wfColors: 'gruenrot',
      zeroBase: type !== 'line',
      markers: true,
      pctDecimals: 1,
      mekkoLabels: 'pct',
    };
  }

  function normalizeSpec(s) {
    s = s || {};
    const type = TYPES[s.type] ? s.type : 'stacked';
    const categories = Array.isArray(s.categories) ? s.categories.map(function (x) { return x === null || x === undefined ? '' : String(x); }) : [];
    const n = categories.length;
    let series = Array.isArray(s.series) ? s.series.map(function (r, k) {
      const vals = Array.isArray(r && r.values) ? r.values : [];
      const out = [];
      for (let i = 0; i < n; i++) {
        const v = vals[i];
        if (v === 'e' && type === 'waterfall') out.push('e');
        else if (typeof v === 'number' && isFinite(v)) out.push(v);
        else out.push(null);
      }
      return { name: r && r.name !== null && r.name !== undefined ? String(r.name) : 'Reihe ' + (k + 1), values: out };
    }) : [];
    if (type === 'waterfall' && series.length > 1) series = series.slice(0, 1);
    const options = Object.assign(defaultOptions(type), s.options || {});
    const allowed = (TYPES[type] || TYPES.stacked).deco;
    const decorations = (Array.isArray(s.decorations) ? s.decorations : [])
      .filter(function (d) { return d && DECO_LABELS[d.kind]; })
      .map(function (d) {
        return {
          kind: d.kind,
          from: clampInt(d.from, 0, Math.max(0, n - 1)),
          to: clampInt(d.to, 0, Math.max(0, n - 1)),
          mode: d.mode === 'abs' ? 'abs' : 'pct',
          series: clampInt(d.series || 0, 0, Math.max(0, series.length - 1)),
        };
      })
      .filter(function (d) { return n >= 2 && d.from !== d.to; });
    return { v: 1, type: type, categories: categories, series: series, options: options, decorations: decorations, allowedDecorations: allowed.slice() };
  }

  /** Spezifikation ohne berechnete Felder, für die Ablage im Diagramm (Tags). */
  function compactSpec(spec) {
    const s = normalizeSpec(spec);
    const def = defaultOptions(s.type);
    const opts = {};
    Object.keys(s.options).forEach(function (k) { if (s.options[k] !== def[k]) opts[k] = s.options[k]; });
    return { v: 1, type: s.type, categories: s.categories, series: s.series, options: opts, decorations: s.decorations };
  }

  function sample(type) {
    const S = {
      stacked: {
        categories: ['2020', '2021', '2022', '2023', '2024'],
        series: [
          { name: 'Produkt A', values: [42, 48, 55, 61, 68] },
          { name: 'Produkt B', values: [30, 33, 35, 40, 44] },
          { name: 'Produkt C', values: [18, 21, 26, 29, 35] },
        ],
        decorations: [{ kind: 'cagr', from: 0, to: 4 }],
      },
      clustered: {
        categories: ['Q1', 'Q2', 'Q3', 'Q4'],
        series: [
          { name: '2023', values: [12.4, 15.1, 14.2, 18.0] },
          { name: '2024', values: [14.0, 17.3, 16.1, 21.4] },
        ],
      },
      percent: {
        categories: ['Deutschland', 'Frankreich', 'Italien', 'Spanien'],
        series: [
          { name: 'Online', values: [35, 28, 22, 30] },
          { name: 'Filiale', values: [45, 52, 58, 46] },
          { name: 'Partner', values: [20, 20, 20, 24] },
        ],
      },
      bar: {
        categories: ['Region Süd', 'Region West', 'Region Nord', 'Region Ost', 'Ausland'],
        series: [{ name: 'Umsatz', values: [1250, 980, 720, 410, 330] }],
      },
      waterfall: {
        categories: ['EBIT 2023', 'Umsatz', 'Preis', 'Material', 'Personal', 'Sonstiges', 'EBIT 2024'],
        series: [{ name: 'Werte', values: [100, 35, 12, -18, -9, 4, 'e'] }],
        decorations: [{ kind: 'diff', from: 0, to: 6 }],
      },
      line: {
        categories: ['2019', '2020', '2021', '2022', '2023', '2024'],
        series: [
          { name: 'Umsatz', values: [80, 74, 88, 95, 101, 108] },
          { name: 'Kosten', values: [62, 60, 66, 71, 74, 78] },
        ],
      },
      mekko: {
        categories: ['Deutschland', 'Frankreich', 'Italien', 'Spanien'],
        series: [
          { name: 'Anbieter A', values: [40, 22, 18, 9] },
          { name: 'Anbieter B', values: [30, 30, 24, 21] },
          { name: 'Sonstige', values: [30, 28, 18, 20] },
        ],
      },
    };
    const t = S[type] ? type : 'stacked';
    const s = S[t];
    return normalizeSpec({
      type: t,
      categories: s.categories.slice(),
      series: s.series.map(function (r) { return { name: r.name, values: r.values.slice() }; }),
      decorations: (s.decorations || []).map(function (d) { return Object.assign({}, d); }),
      options: defaultOptions(t),
    });
  }

  /* Raster (Datenblatt) <-> Spezifikation */
  function formatRaw(v) {
    if (v === 'e') return 'e';
    if (typeof v !== 'number' || !isFinite(v)) return '';
    return String(Math.round(v * 1e9) / 1e9).replace('.', ',');
  }
  function specToGrid(spec) {
    spec = normalizeSpec(spec);
    return {
      cats: spec.categories.slice(),
      rows: spec.series.map(function (s) { return { name: s.name, cells: s.values.map(formatRaw) }; }),
    };
  }
  function gridToSpec(grid, base) {
    base = base || {};
    const type = TYPES[base.type] ? base.type : 'stacked';
    const cats = (grid && grid.cats) || [];
    const rowsIn = (grid && grid.rows) || [];
    const str = function (x) { return x === null || x === undefined ? '' : String(x).trim(); };
    let C = cats.length;
    const colEmpty = function (c) { return !str(cats[c]) && rowsIn.every(function (r) { return !str(r.cells[c]); }); };
    while (C > 0 && colEmpty(C - 1)) C--;
    const rows = rowsIn.filter(function (r) { return str(r.name) || r.cells.slice(0, C).some(function (x) { return str(x); }); });
    const series = rows.map(function (r, k) {
      const values = [];
      for (let i = 0; i < C; i++) {
        const v = parseNumber(r.cells[i]);
        if (v === 'e') values.push(type === 'waterfall' ? 'e' : null);
        else values.push(typeof v === 'number' && isFinite(v) ? v : null);
      }
      return { name: str(r.name) || 'Reihe ' + (k + 1), values: values };
    });
    return normalizeSpec({
      type: type,
      categories: cats.slice(0, C).map(str),
      series: series,
      options: base.options,
      decorations: base.decorations,
    });
  }

  /* ------------------------------------------------------------------ */
  /* Layout-Kontext und Primitive                                        */
  /* ------------------------------------------------------------------ */

  function rampAt(colors, t) {
    const x = clamp(t, 0, 1) * (colors.length - 1);
    const i = Math.floor(x);
    if (i >= colors.length - 1) return colors[colors.length - 1];
    return mix(colors[i], colors[i + 1], x - i);
  }

  /* Standard-Office-Designs liefern bunte Excel-Farben; dann lieber die Blau-Palette nehmen. */
  const OFFICE_DEFAULT_ACCENTS = [
    ['#4472C4', '#ED7D31', '#A5A5A5'],
    ['#4F81BD', '#C0504D', '#9BBB59'],
    ['#156082', '#E97132', '#196B24'],
  ];
  function themeColors(rt) {
    if (!rt || !Array.isArray(rt.theme)) return null;
    const t = rt.theme.map(normHex).filter(Boolean);
    if (t.length < 6) return null;
    const isDefault = OFFICE_DEFAULT_ACCENTS.some(function (d) { return d.every(function (h, i) { return t[i] === h; }); });
    return isDefault ? null : t.slice(0, 6);
  }

  function seriesColors(o, m, rt) {
    let base = null, kind = 'seq';
    if (o.palette === 'theme') { base = themeColors(rt); kind = 'cat'; }
    if (!base) {
      const p = PALETTES[o.palette] && PALETTES[o.palette].colors ? PALETTES[o.palette] : PALETTES.blau;
      base = p.colors; kind = p.kind;
    }
    const out = [];
    if (kind === 'cat') {
      for (let i = 0; i < m; i++) out.push(i < base.length ? base[i] : mix(base[i % base.length], '#FFFFFF', 0.45));
      return out;
    }
    if (m <= 1) return [base[1] || base[0]];
    const tMax = Math.min(1, 0.55 + 0.09 * m);
    for (let i = 0; i < m; i++) out.push(rampAt(base, (i / (m - 1)) * tMax));
    return out;
  }

  function hueSat(hex) {
    const c = hexToRgb(hex).map(function (v) { return v / 255; });
    const max = Math.max.apply(null, c), min = Math.min.apply(null, c), d = max - min;
    let h = 0;
    if (d) {
      if (max === c[0]) h = ((c[1] - c[2]) / d) % 6;
      else if (max === c[1]) h = (c[2] - c[0]) / d + 2;
      else h = (c[0] - c[1]) / d + 4;
      h *= 60; if (h < 0) h += 360;
    }
    const l = (max + min) / 2;
    return { h: h, s: d ? d / (1 - Math.abs(2 * l - 1)) : 0, l: l };
  }
  function isRedOrGreen(hex) {
    const q = hueSat(hex);
    return q.s > 0.3 && q.l < 0.85 && (q.h < 25 || q.h > 335 || (q.h > 80 && q.h < 165));
  }

  function waterfallColors(c) {
    const o = c.o;
    if (o.wfColors === 'palette') {
      const s = seriesColors(o, 3, c.rt);
      return { total: s[0], pos: s[1], neg: s[2] };
    }
    const cand = seriesColors(o, 6, c.rt).filter(function (h) { return !isRedOrGreen(h) && luminance(h) < 0.35; });
    const total = cand[0] || '#404040';
    if (o.wfColors === 'grau') return { total: total, pos: '#A6A6A6', neg: '#A6A6A6' };
    return { total: total, pos: '#2F8050', neg: '#C8473B' };
  }

  function makeCtx(spec, frame, rt) {
    const o = spec.options;
    const fs = clamp(+o.fontSize || 12, 6, 40);
    const measure = (rt && typeof rt.measure === 'function') ? rt.measure : textWidth;
    const vals = [];
    spec.series.forEach(function (s) { s.values.forEach(function (v) { if (typeof v === 'number') vals.push(v); }); });
    const c = {
      spec: spec, o: o, fs: fs, lh: fs * 1.2, frame: frame, rt: rt || {},
      dec: decimalsFor(vals, o),
      prims: [], warnings: [],
    };
    c.tw = function (t, size, bold) { return measure(String(t), size || fs, !!bold); };
    c.colors = seriesColors(o, Math.max(1, spec.series.length), c.rt);
    return c;
  }

  function R(c, x, y, w, h, fill, name, extra) {
    const p = { t: 'rect', x: r2(x), y: r2(y), w: r2(Math.max(0, w)), h: r2(Math.max(0, h)), fill: fill || null, name: name };
    if (extra) Object.assign(p, extra);
    c.prims.push(p);
    return p;
  }
  function L(c, x1, y1, x2, y2, stroke, sw, name, dash) {
    const p = { t: 'line', x1: r2(x1), y1: r2(y1), x2: r2(x2), y2: r2(y2), stroke: stroke || C_AXIS, sw: sw || 0.75, name: name };
    if (dash) p.dash = dash;
    c.prims.push(p);
    return p;
  }
  function T(c, x, y, w, h, text, st, name) {
    st = st || {};
    const p = {
      t: 'text', x: r2(x), y: r2(y), w: r2(Math.max(1, w)), h: r2(Math.max(1, h)), text: String(text),
      size: r2(st.size || c.fs), color: st.color || C_TEXT, bold: !!st.bold,
      align: st.align || 'c', valign: st.valign || 'm', wrap: !!st.wrap, name: name,
    };
    c.prims.push(p);
    return p;
  }
  function TRI(c, cx, cy, w, h, dir, fill, name) {
    const vert = dir === 'up' || dir === 'down';
    const W = vert ? w : h, H = vert ? h : w;
    c.prims.push({ t: 'tri', x: r2(cx - W / 2), y: r2(cy - H / 2), w: r2(W), h: r2(H), dir: dir, fill: fill, name: name });
  }
  function ELL(c, cx, cy, d, fill, stroke, sw, name) {
    c.prims.push({ t: 'ellipse', x: r2(cx - d / 2), y: r2(cy - d / 2), w: r2(d), h: r2(d), fill: fill, stroke: stroke || null, sw: sw || 0, name: name });
  }
  function BUB(c, cx, cy, text, name) {
    const fs = c.fs;
    const w = c.tw(text) + fs * 0.9, h = c.lh + fs * 0.3;
    const f = c.frame;
    cx = clamp(cx, f.left + w / 2, f.left + f.width - w / 2);
    c.prims.push({
      t: 'bubble', x: r2(cx - w / 2), y: r2(cy - h / 2), w: r2(w), h: r2(h), text: String(text), size: r2(fs),
      color: C_TEXT, fill: '#FFFFFF', stroke: C_ARROW, sw: 0.75, name: name,
    });
    return { w: w, h: h };
  }

  /** Beschriftungen vertikal entzerren (für Legende rechts). */
  function spreadLabels(items, minGap, top, bottom) {
    items.sort(function (a, b) { return a.y - b.y; });
    for (let j = 1; j < items.length; j++) if (items[j].y - items[j - 1].y < minGap) items[j].y = items[j - 1].y + minGap;
    const lim = bottom - minGap / 2;
    if (items.length && items[items.length - 1].y > lim) {
      items[items.length - 1].y = lim;
      for (let j = items.length - 2; j >= 0; j--) if (items[j + 1].y - items[j].y < minGap) items[j].y = items[j + 1].y - minGap;
    }
    const tlim = top + minGap / 2;
    if (items.length && items[0].y < tlim) {
      items[0].y = tlim;
      for (let j = 1; j < items.length; j++) if (items[j].y - items[j - 1].y < minGap) items[j].y = items[j - 1].y + minGap;
    }
    return items;
  }

  function legendTopMeasure(c, items, width) {
    const sw = c.fs * 0.75, gap = c.fs * 0.35, spacing = c.fs * 1.1;
    const rows = [];
    let row = [], x = 0;
    items.forEach(function (it) {
      const w = sw + gap + c.tw(it.name);
      if (row.length && x + w > width) { rows.push(row); row = []; x = 0; }
      row.push(Object.assign({}, it, { w: w }));
      x += w + spacing;
    });
    if (row.length) rows.push(row);
    return { rows: rows, height: rows.length * c.lh, sw: sw, gap: gap, spacing: spacing };
  }
  function legendTopDraw(c, Lg, x0, y0) {
    Lg.rows.forEach(function (row, ri) {
      let x = x0;
      const y = y0 + ri * c.lh;
      row.forEach(function (it) {
        R(c, x, y + (c.lh - Lg.sw) / 2, Lg.sw, Lg.sw, it.color, 'Legende ' + it.name);
        T(c, x + Lg.sw + Lg.gap, y, it.w - Lg.sw - Lg.gap + c.fs * 0.5, c.lh, it.name, { align: 'l', color: C_TEXT2 }, 'Legendentext ' + it.name);
        x += it.w + Lg.spacing;
      });
    });
  }

  function categoryLines(c, cats, width) {
    let lines = 1;
    cats.forEach(function (t) {
      if (c.tw(t) > width) lines = Math.max(lines, Math.min(3, wrapText(c.tw, t, width, c.fs, false).length));
    });
    return lines;
  }

  function titleHeight(c) { return c.o.title && String(c.o.title).trim() ? c.lh * 1.15 : 0; }

  /* ------------------------------------------------------------------ */
  /* Pfeile (CAGR, Differenz, Niveau)                                    */
  /* ------------------------------------------------------------------ */

  function supportedDecos(c) {
    const n = c.spec.categories.length, m = c.spec.series.length;
    const allowed = TYPES[c.spec.type].deco;
    return c.spec.decorations
      .filter(function (d) { return allowed.indexOf(d.kind) >= 0 && d.from < n && d.to < n && d.from !== d.to; })
      .map(function (d) { return Object.assign({}, d, { series: clamp(d.series || 0, 0, Math.max(0, m - 1)) }); });
  }

  function decoText(c, d, vA, vB) {
    const pd = clampInt(c.o.pctDecimals, 0, 3);
    if (d.kind === 'cagr') {
      const p = periodsBetween(c.spec.categories, d.from, d.to);
      if (!(vA > 0) || !(vB >= 0) || !p) return 'n/a';
      return fmtPct(Math.pow(vB / vA, 1 / p) - 1, pd, true) + NBSP + 'p.a.';
    }
    if (d.mode === 'abs') return fmtVal(c, vB - vA, true);
    if (!vA) return 'n/a';
    return fmtPct((vB - vA) / Math.abs(vA), pd, true);
  }

  function elbowDepth(decos, n) {
    let depth = 0;
    for (let x = 0; x < n; x++) {
      const k = decos.filter(function (d) { return Math.min(d.from, d.to) <= x && x <= Math.max(d.from, d.to); }).length;
      depth = Math.max(depth, k);
    }
    return depth;
  }

  function bubbleH(c) { return c.lh + c.fs * 0.3; }
  /* Platzbedarf über den höchsten Säulen: Platzierung mit allen Ankern auf gleicher Höhe simulieren (ungünstigster Fall). */
  function arrowsHeight(c, decos) {
    const el = decos.filter(function (d) { return d.kind !== 'level'; });
    if (!el.length) return 0;
    let minLevel = 0;
    placeElbows(c, el, function () { return { yTop: 0 }; }, 0).forEach(function (p) { minLevel = Math.min(minLevel, p.level); });
    return -minLevel + bubbleH(c) / 2 + c.fs * 0.25;
  }
  function levelWidths(c, decos) {
    return decos.filter(function (d) { return d.kind === 'level'; }).map(function (d) {
      return c.fs * 0.9 + c.fs * 0.31 + c.fs * 0.35 + c.tw(d.text) + c.fs * 0.9 + c.fs * 0.3;
    });
  }

  function riserOffset(i, placed, off) {
    let left = false, right = false, k = 0;
    placed.forEach(function (p) {
      if (p.a === i || p.b === i) { k++; if (p.b > i) right = true; if (p.a < i) left = true; }
    });
    if (!k) return 0;
    if (right && !left) return -off * k;
    if (left && !right) return off * k;
    return 0;
  }

  function placeElbows(c, elbows, anchor, off) {
    const bh = bubbleH(c), vgap = c.fs * 0.45;
    const items = elbows.map(function (d) { return { d: d, a: Math.min(d.from, d.to), b: Math.max(d.from, d.to) }; })
      .sort(function (p, q) { return (p.b - p.a) - (q.b - q.a) || p.a - q.a; });
    const placed = [];
    items.forEach(function (it) {
      let level = Infinity;
      for (let i = it.a; i <= it.b; i++) level = Math.min(level, anchor(i, it.d).yTop);
      level -= c.fs * 0.55 + bh / 2;
      placed.forEach(function (p) { if (p.b >= it.a && p.a <= it.b) level = Math.min(level, p.level - (bh + vgap)); });
      it.level = level;
      it.offA = riserOffset(it.a, placed, off);
      it.offB = riserOffset(it.b, placed, off);
      placed.push(it);
    });
    return placed;
  }

  function drawElbow(c, it, anchor) {
    const fs = c.fs, d = it.d;
    const A = anchor(it.a, d), B = anchor(it.b, d);
    const xa = A.x + it.offA, xb = B.x + it.offB;
    const g = fs * 0.2, ah = fs * 0.55, aw = fs * 0.62;
    const nm = DECO_LABELS[d.kind];
    const leftIsFrom = d.from <= d.to;
    const fromX = leftIsFrom ? xa : xb, fromY = (leftIsFrom ? A : B).yTop - g;
    const toX = leftIsFrom ? xb : xa, toY = (leftIsFrom ? B : A).yTop - g;
    L(c, fromX, fromY, fromX, it.level, C_ARROW, 1, nm + ' Linie');
    L(c, xa, it.level, xb, it.level, C_ARROW, 1, nm + ' Linie');
    L(c, toX, it.level, toX, toY - ah + 0.4, C_ARROW, 1, nm + ' Linie');
    TRI(c, toX, toY - ah / 2, aw, ah, 'down', C_ARROW, nm + ' Spitze');
    BUB(c, (xa + xb) / 2, it.level, d.text, nm + ' Wert');
  }

  function drawLevel(c, d, A, B, xArrow) {
    const fs = c.fs, ah = fs * 0.55, aw = fs * 0.62, nm = DECO_LABELS.level;
    const yA = A.yVal, yB = B.yVal;
    L(c, A.xr + fs * 0.15, yA, xArrow + aw * 0.7, yA, C_MUTED, 0.75, nm + ' Hilfslinie', 'dash').z = -1;
    L(c, B.xr + fs * 0.15, yB, xArrow + aw * 0.7, yB, C_MUTED, 0.75, nm + ' Hilfslinie', 'dash').z = -1;
    if (Math.abs(yB - yA) > ah * 1.5) {
      const up = yB < yA;
      L(c, xArrow, yA, xArrow, up ? yB + ah - 0.4 : yB - ah + 0.4, C_ARROW, 1, nm + ' Linie');
      TRI(c, xArrow, up ? yB + ah / 2 : yB - ah / 2, aw, ah, up ? 'up' : 'down', C_ARROW, nm + ' Spitze');
    }
    const w = c.tw(d.text) + fs * 0.9;
    BUB(c, xArrow + aw / 2 + fs * 0.35 + w / 2, (yA + yB) / 2, d.text, nm + ' Wert');
  }

  function drawDecorations(c, decos, anchor, geo) {
    const elbows = decos.filter(function (d) { return d.kind !== 'level'; });
    placeElbows(c, elbows, anchor, geo.off).forEach(function (it) { drawElbow(c, it, anchor); });
    let x = geo.levelX0;
    decos.filter(function (d) { return d.kind === 'level'; }).forEach(function (d, k) {
      drawLevel(c, d, anchor(d.from, d), anchor(d.to, d), x + c.fs * 0.9);
      x += geo.levelWs[k];
    });
  }

  /* ------------------------------------------------------------------ */
  /* Säulen: gestapelt, gruppiert, 100 %                                 */
  /* ------------------------------------------------------------------ */

  function layoutColumns(c) {
    const spec = c.spec, o = c.o, fs = c.fs, lh = c.lh, frame = c.frame, type = spec.type;
    const cats = spec.categories, ser = spec.series, n = cats.length, m = ser.length;
    const val = function (s, i) { const v = ser[s].values[i]; return typeof v === 'number' ? v : 0; };
    const posSum = [], negSum = [], total = [];
    for (let i = 0; i < n; i++) {
      let p = 0, q = 0;
      for (let s = 0; s < m; s++) { const v = val(s, i); if (v >= 0) p += v; else q += v; }
      posSum.push(p); negSum.push(q); total.push(p + q);
    }
    const share = function (s, i) { return posSum[i] > 0 ? Math.max(0, val(s, i)) / posSum[i] : 0; };
    let vmin = 0, vmax = 0;
    if (type === 'stacked') { vmax = Math.max.apply(null, [0].concat(posSum)); vmin = Math.min.apply(null, [0].concat(negSum)); }
    else if (type === 'percent') { vmax = 1; vmin = 0; }
    else { for (let s = 0; s < m; s++) for (let i = 0; i < n; i++) { vmax = Math.max(vmax, val(s, i)); vmin = Math.min(vmin, val(s, i)); } }
    if (vmax === vmin) vmax = vmin + 1;

    const decos = type === 'percent' ? [] : supportedDecos(c);
    const valueOf = function (i, d) { return type === 'stacked' ? total[i] : val(d.series, i); };
    decos.forEach(function (d) { d.text = decoText(c, d, valueOf(d.from, d), valueOf(d.to, d)); });

    let legend = o.legend;
    if (m < 2) legend = 'none';
    if (type === 'clustered' && legend === 'right') legend = 'top';
    if (legend === 'right' && decos.some(function (d) { return d.kind === 'level'; })) legend = 'top';

    const legendW = legend === 'right'
      ? Math.min(Math.max.apply(null, ser.map(function (s) { return c.tw(s.name); })) + fs * 0.8, frame.width * 0.3) : 0;
    const levelWs = levelWidths(c, decos);
    const levelW = levelWs.reduce(function (a, b) { return a + b; }, 0);
    const plotLeft = frame.left;
    const plotRight = frame.left + frame.width - legendW - levelW;
    const slot = (plotRight - plotLeft) / Math.max(1, n);
    const gap = clamp(+o.gap, 0, 0.9);
    const barW = slot * (1 - gap);

    const titleH = titleHeight(c);
    let lgTop = null, legendTopH = 0;
    if (legend === 'top') {
      lgTop = legendTopMeasure(c, ser.map(function (s, k) { return { name: s.name, color: c.colors[k] }; }), frame.width);
      legendTopH = lgTop.height + fs * 0.5;
    }
    const arrowsH = arrowsHeight(c, decos);
    const single = type === 'stacked' && m === 1;
    const showSum = o.showTotals || (single && o.showLabels);
    const showTop = (type === 'stacked' || type === 'percent') ? showSum : o.showLabels;
    const topLabelH = showTop ? lh : 0;
    const catLines = categoryLines(c, cats, slot * 0.98);
    const catH = catLines * lh + fs * 0.35;
    const negLabels = vmin < 0 && ((type === 'clustered' && o.showLabels) || (type === 'stacked' && showSum));
    const plotTop = frame.top + titleH + legendTopH + arrowsH + topLabelH;
    const plotBottom = frame.top + frame.height - catH - (negLabels ? lh : 0);
    if (plotBottom - plotTop < fs * 2) c.warnings.push('Wenig Platz: Diagramm größer ziehen oder Schrift verkleinern.');
    const H = Math.max(1, plotBottom - plotTop);
    const yOf = function (v) { return plotBottom - (v - vmin) / (vmax - vmin) * H; };
    const xc = function (i) { return plotLeft + slot * (i + 0.5); };

    if (lgTop) legendTopDraw(c, lgTop, frame.left, frame.top + titleH);

    const segMid = ser.map(function () { return new Array(n).fill(null); });
    const barGeo = ser.map(function () { return new Array(n).fill(null); });
    const sepStyle = o.separators ? { stroke: '#FFFFFF', sw: 0.75 } : null;

    for (let i = 0; i < n; i++) {
      const x0 = xc(i) - barW / 2;
      if (type === 'stacked' || type === 'percent') {
        let up = 0, down = 0;
        for (let s = 0; s < m; s++) {
          const raw = val(s, i);
          const v = type === 'percent' ? share(s, i) : raw;
          let a, b;
          if (v >= 0) { a = up; b = up + v; up = b; } else { a = down + v; b = down; down = a; }
          const yT = yOf(b), yB = yOf(a);
          segMid[s][i] = (yT + yB) / 2;
          if (yB - yT > 0.05) R(c, x0, yT, barW, yB - yT, c.colors[s], 'Segment ' + ser[s].name + ' ' + cats[i], sepStyle);
          if (o.showLabels && !single && ser[s].values[i] !== null) {
            const txt = type === 'percent' ? fmtPct(v, 0, false) : fmtVal(c, raw, false);
            if (yB - yT >= lh * 0.92 && c.tw(txt) <= barW + fs * 0.2) {
              T(c, x0, yT, barW, yB - yT, txt, { color: onColor(c.colors[s]) }, 'Wert ' + ser[s].name + ' ' + cats[i]);
            }
          }
        }
        if (showSum) {
          const txt = fmtVal(c, type === 'percent' ? posSum[i] : total[i], false);
          if (up > 0 || down === 0 || type === 'percent') {
            T(c, xc(i) - slot / 2, yOf(up) - lh - fs * 0.1, slot, lh, txt, { valign: 'b' }, 'Summe ' + cats[i]);
          } else {
            T(c, xc(i) - slot / 2, yOf(down) + fs * 0.1, slot, lh, txt, { valign: 't' }, 'Summe ' + cats[i]);
          }
        }
      } else {
        const inner = m > 1 ? Math.min(barW / m * 0.1, fs * 0.25) : 0;
        const bw = (barW - inner * (m - 1)) / m;
        for (let s = 0; s < m; s++) {
          const v = val(s, i);
          const bx = x0 + s * (bw + inner);
          const yT = yOf(Math.max(v, 0)), yB = yOf(Math.min(v, 0));
          if (yB - yT > 0.05) R(c, bx, yT, bw, yB - yT, c.colors[s], 'Balken ' + ser[s].name + ' ' + cats[i]);
          barGeo[s][i] = { x: bx + bw / 2, xr: bx + bw, yTop: yT, yVal: v >= 0 ? yT : yB, v: v };
          if (o.showLabels && ser[s].values[i] !== null) {
            const txt = fmtVal(c, v, false);
            const lw = Math.max(bw + inner, c.tw(txt) + 2);
            if (v >= 0) T(c, bx + bw / 2 - lw / 2, yT - lh - fs * 0.05, lw, lh, txt, { valign: 'b' }, 'Wert ' + ser[s].name + ' ' + cats[i]);
            else T(c, bx + bw / 2 - lw / 2, yB + fs * 0.05, lw, lh, txt, { valign: 't' }, 'Wert ' + ser[s].name + ' ' + cats[i]);
          }
        }
      }
    }

    if (o.axis) L(c, plotLeft + slot * gap * 0.25, yOf(0), plotLeft + n * slot - slot * gap * 0.25, yOf(0), C_AXIS, 0.75, 'Achse');

    const catY = plotBottom + (negLabels ? lh : 0) + fs * 0.3;
    for (let i = 0; i < n; i++) {
      T(c, xc(i) - slot / 2 + 1, catY, slot - 2, catLines * lh, cats[i], { valign: 't', wrap: catLines > 1 }, 'Kategorie ' + cats[i]);
    }

    if (legend === 'right') {
      const last = n - 1;
      const xL = xc(last) + barW / 2 + fs * 0.5;
      const items = ser.map(function (s, k) { return { k: k, y: segMid[k][last], name: s.name }; });
      spreadLabels(items, lh * 0.95, plotTop, plotBottom);
      items.forEach(function (it) {
        T(c, xL, it.y - lh / 2, Math.max(fs, frame.left + frame.width - xL), lh, it.name, { align: 'l', color: C_TEXT2 }, 'Legende ' + it.name);
      });
    }

    const anchor = function (i, d) {
      if (type === 'stacked') {
        const yv = yOf(posSum[i]);
        return { x: xc(i), xr: xc(i) + barW / 2, yVal: yv, yTop: yv - (showSum ? lh + fs * 0.1 : 0) };
      }
      const g = barGeo[d.series][i];
      return { x: g.x, xr: g.xr, yVal: g.yVal, yTop: g.yTop - (o.showLabels && g.v >= 0 ? lh + fs * 0.05 : 0) };
    };
    drawDecorations(c, decos, anchor, { off: Math.min(barW * 0.2, fs * 0.6), levelX0: plotLeft + n * slot, levelWs: levelWs });
  }

  /* ------------------------------------------------------------------ */
  /* Balken (horizontal)                                                 */
  /* ------------------------------------------------------------------ */

  function layoutBar(c) {
    const spec = c.spec, o = c.o, fs = c.fs, lh = c.lh, frame = c.frame;
    const cats = spec.categories, ser = spec.series, n = cats.length, m = ser.length;
    const val = function (s, i) { const v = ser[s].values[i]; return typeof v === 'number' ? v : 0; };
    const posSum = [], negSum = [], total = [];
    for (let i = 0; i < n; i++) {
      let p = 0, q = 0;
      for (let s = 0; s < m; s++) { const v = val(s, i); if (v >= 0) p += v; else q += v; }
      posSum.push(p); negSum.push(q); total.push(p + q);
    }
    let vmax = Math.max.apply(null, [0].concat(posSum)), vmin = Math.min.apply(null, [0].concat(negSum));
    if (vmax === vmin) vmax = vmin + 1;

    const legend = (o.legend === 'none' || m < 2) ? 'none' : 'top';
    const titleH = titleHeight(c);
    let lgTop = null, legendTopH = 0;
    if (legend === 'top') {
      lgTop = legendTopMeasure(c, ser.map(function (s, k) { return { name: s.name, color: c.colors[k] }; }), frame.width);
      legendTopH = lgTop.height + fs * 0.5;
      legendTopDraw(c, lgTop, frame.left, frame.top + titleH);
    }
    const catW = Math.min(Math.max.apply(null, cats.map(function (t) { return c.tw(t); }).concat([fs])) + fs * 0.7, frame.width * 0.35);
    const endOn = m > 1 ? o.showTotals : o.showLabels;
    const endTexts = cats.map(function (_, i) { return fmtVal(c, m > 1 ? total[i] : val(0, i), false); });
    const endW = endOn ? Math.max.apply(null, endTexts.map(function (t) { return c.tw(t); })) + fs * 0.6 : fs * 0.3;
    const negW = vmin < 0 && endOn ? endW : 0;
    const plotLeft = frame.left + catW + negW, plotRight = frame.left + frame.width - endW;
    const plotTop = frame.top + titleH + legendTopH, plotBottom = frame.top + frame.height;
    const slot = (plotBottom - plotTop) / Math.max(1, n);
    const gap = clamp(+o.gap, 0, 0.9);
    const barH = slot * (1 - gap);
    const W = Math.max(1, plotRight - plotLeft);
    const xOf = function (v) { return plotLeft + (v - vmin) / (vmax - vmin) * W; };
    const sepStyle = o.separators ? { stroke: '#FFFFFF', sw: 0.75 } : null;

    for (let i = 0; i < n; i++) {
      const yc = plotTop + slot * (i + 0.5), y0 = yc - barH / 2;
      const catLinesHere = c.tw(cats[i]) > catW - fs * 0.5 && slot >= lh * 2 ? 2 : 1;
      T(c, frame.left, plotTop + slot * i, catW - fs * 0.5, slot, cats[i], { align: 'r', wrap: catLinesHere > 1 }, 'Kategorie ' + cats[i]);
      let up = 0, down = 0;
      for (let s = 0; s < m; s++) {
        const v = val(s, i);
        let a, b;
        if (v >= 0) { a = up; b = up + v; up = b; } else { a = down + v; b = down; down = a; }
        const xA = xOf(a), xB = xOf(b);
        if (xB - xA > 0.05) R(c, xA, y0, xB - xA, barH, c.colors[s], 'Segment ' + ser[s].name + ' ' + cats[i], m > 1 ? sepStyle : null);
        if (m > 1 && o.showLabels && ser[s].values[i] !== null) {
          const txt = fmtVal(c, v, false);
          if (c.tw(txt) + fs * 0.4 <= xB - xA && barH >= lh * 0.9) T(c, xA, y0, xB - xA, barH, txt, { color: onColor(c.colors[s]) }, 'Wert ' + ser[s].name + ' ' + cats[i]);
        }
      }
      if (endOn) {
        const txt = endTexts[i];
        if (up > 0 || down === 0) T(c, xOf(up) + fs * 0.3, yc - lh / 2, endW, lh, txt, { align: 'l' }, (m > 1 ? 'Summe ' : 'Wert ') + cats[i]);
        else T(c, xOf(down) - fs * 0.3 - endW, yc - lh / 2, endW, lh, txt, { align: 'r' }, (m > 1 ? 'Summe ' : 'Wert ') + cats[i]);
      }
    }
    if (o.axis) L(c, xOf(0), plotTop + slot * gap * 0.25, xOf(0), plotBottom - slot * gap * 0.25, C_AXIS, 0.75, 'Achse');
  }

  /* ------------------------------------------------------------------ */
  /* Wasserfall                                                          */
  /* ------------------------------------------------------------------ */

  function layoutWaterfall(c) {
    const spec = c.spec, o = c.o, fs = c.fs, lh = c.lh, frame = c.frame;
    const cats = spec.categories, n = cats.length;
    const raw = (spec.series[0] || { values: [] }).values;
    const bars = [];
    let run = 0;
    for (let i = 0; i < n; i++) {
      const v = raw[i];
      if (v === 'e') bars.push({ kind: 'total', from: 0, to: run });
      else if (i === 0) { const x = v || 0; bars.push({ kind: 'total', from: 0, to: x, empty: v === null }); run = x; }
      else { const x = v || 0; bars.push({ kind: x >= 0 ? 'pos' : 'neg', from: run, to: run + x, delta: x, empty: v === null }); run += x; }
    }
    let vmin = 0, vmax = 0;
    bars.forEach(function (b) { vmin = Math.min(vmin, b.from, b.to); vmax = Math.max(vmax, b.from, b.to); });
    if (vmax === vmin) vmax = vmin + 1;
    const col = waterfallColors(c);
    bars.forEach(function (b) {
      b.text = b.kind === 'total' ? fmtVal(c, b.to, false) : fmtVal(c, b.delta, o.signs);
      b.fill = b.kind === 'total' ? col.total : (b.kind === 'pos' ? col.pos : col.neg);
    });

    const decos = supportedDecos(c);
    decos.forEach(function (d) { d.text = decoText(c, d, bars[d.from].to, bars[d.to].to); });
    const levelWs = levelWidths(c, decos);
    const levelW = levelWs.reduce(function (a, b) { return a + b; }, 0);
    const plotLeft = frame.left, plotRight = frame.left + frame.width - levelW;
    const slot = (plotRight - plotLeft) / Math.max(1, n);
    const gap = clamp(+o.gap, 0, 0.9);
    const barW = slot * (1 - gap);
    const titleH = titleHeight(c);
    const arrowsH = arrowsHeight(c, decos);
    const catLines = categoryLines(c, cats, slot * 0.98);
    const catH = catLines * lh + fs * 0.35;
    const below = vmin < 0 && o.showLabels;
    const plotTop = frame.top + titleH + arrowsH + (o.showLabels ? lh : 0);
    const plotBottom = frame.top + frame.height - catH - (below ? lh : 0);
    if (plotBottom - plotTop < fs * 2) c.warnings.push('Wenig Platz: Diagramm größer ziehen oder Schrift verkleinern.');
    const H = Math.max(1, plotBottom - plotTop);
    const yOf = function (v) { return plotBottom - (v - vmin) / (vmax - vmin) * H; };
    const xc = function (i) { return plotLeft + slot * (i + 0.5); };

    const geo = [];
    bars.forEach(function (b, i) {
      const top = yOf(Math.max(b.from, b.to)), bot = yOf(Math.min(b.from, b.to));
      const x0 = xc(i) - barW / 2;
      if (bot - top > 0.05) R(c, x0, top, barW, bot - top, b.fill, (b.kind === 'total' ? 'Summe ' : 'Veränderung ') + cats[i]);
      let labelAbove = false;
      if (o.showLabels && !b.empty) {
        const fits = bot - top >= lh * 0.92 && c.tw(b.text) <= barW + fs * 0.2;
        if (fits) T(c, x0, top, barW, bot - top, b.text, { color: onColor(b.fill) }, 'Wert ' + cats[i]);
        else if (b.kind === 'neg' || b.to < 0) T(c, xc(i) - slot / 2, bot + fs * 0.05, slot, lh, b.text, { valign: 't' }, 'Wert ' + cats[i]);
        else { T(c, xc(i) - slot / 2, top - lh - fs * 0.05, slot, lh, b.text, { valign: 'b' }, 'Wert ' + cats[i]); labelAbove = true; }
      }
      geo.push({ x: xc(i), xr: xc(i) + barW / 2, yVal: yOf(b.to), yTop: top - (labelAbove ? lh + fs * 0.05 : 0) });
    });

    if (o.connectors) {
      for (let i = 0; i < n - 1; i++) {
        const y = yOf(bars[i].to);
        L(c, xc(i) + barW / 2, y, xc(i + 1) - barW / 2, y, C_AXIS, 0.75, 'Verbinder');
      }
    }
    if (o.axis) L(c, plotLeft + slot * gap * 0.25, yOf(0), plotLeft + n * slot - slot * gap * 0.25, yOf(0), C_AXIS, 0.75, 'Achse');

    const catY = plotBottom + (below ? lh : 0) + fs * 0.3;
    for (let i = 0; i < n; i++) {
      T(c, xc(i) - slot / 2 + 1, catY, slot - 2, catLines * lh, cats[i], { valign: 't', wrap: catLines > 1 }, 'Kategorie ' + cats[i]);
    }
    drawDecorations(c, decos, function (i) { return geo[i]; }, { off: Math.min(barW * 0.2, fs * 0.6), levelX0: plotLeft + n * slot, levelWs: levelWs });
  }

  /* ------------------------------------------------------------------ */
  /* Linie                                                               */
  /* ------------------------------------------------------------------ */

  function niceRange(min, max) {
    if (min === max) { min -= 1; max += 1; }
    const span = max - min;
    return [min - span * 0.12, max + span * 0.08];
  }

  function layoutLine(c) {
    const spec = c.spec, o = c.o, fs = c.fs, lh = c.lh, frame = c.frame;
    const cats = spec.categories, ser = spec.series, n = cats.length, m = ser.length;
    const num = function (s, i) { const v = ser[s].values[i]; return typeof v === 'number' ? v : null; };
    let dmin = Infinity, dmax = -Infinity;
    for (let s = 0; s < m; s++) for (let i = 0; i < n; i++) { const v = num(s, i); if (v !== null) { dmin = Math.min(dmin, v); dmax = Math.max(dmax, v); } }
    if (!isFinite(dmin)) { dmin = 0; dmax = 1; }
    let vmin, vmax;
    if (o.zeroBase) { vmin = Math.min(0, dmin); vmax = Math.max(0, dmax); if (vmin === vmax) vmax = vmin + 1; }
    else { const r = niceRange(dmin, dmax); vmin = r[0]; vmax = r[1]; }

    const decos = supportedDecos(c);
    decos.forEach(function (d) {
      const a = num(d.series, d.from), b = num(d.series, d.to);
      d.text = (a === null || b === null) ? 'n/a' : decoText(c, d, a, b);
    });

    let legend = o.legend;
    if (m < 2) legend = 'none';
    if (legend === 'right' && decos.some(function (d) { return d.kind === 'level'; })) legend = 'top';
    const md = o.markers ? fs * 0.5 : 0;
    let extraR = 0;
    if (o.showLabels) {
      ser.forEach(function (s, k) {
        for (let i = n - 1; i >= 0; i--) { const v = num(k, i); if (v !== null) { extraR = Math.max(extraR, c.tw(fmtVal(c, v, false)) / 2); break; } }
      });
    }
    const legendOff = Math.max(md / 2 + fs * 0.6, extraR + fs * 0.35);
    const legendW = legend === 'right'
      ? Math.min(Math.max.apply(null, ser.map(function (s) { return c.tw(s.name); })) + legendOff + fs * 0.2, frame.width * 0.35) : 0;
    const levelWs = levelWidths(c, decos);
    const levelW = levelWs.reduce(function (a, b) { return a + b; }, 0);
    const plotLeft = frame.left, plotRight = frame.left + frame.width - legendW - levelW;
    const slot = (plotRight - plotLeft) / Math.max(1, n);
    const titleH = titleHeight(c);
    let lgTop = null, legendTopH = 0;
    if (legend === 'top') {
      lgTop = legendTopMeasure(c, ser.map(function (s, k) { return { name: s.name, color: c.colors[k] }; }), frame.width);
      legendTopH = lgTop.height + fs * 0.5;
      legendTopDraw(c, lgTop, frame.left, frame.top + titleH);
    }
    const arrowsH = arrowsHeight(c, decos);
    const catLines = categoryLines(c, cats, slot * 0.98);
    const catH = catLines * lh + fs * 0.35;
    const plotTop = frame.top + titleH + legendTopH + arrowsH + (o.showLabels ? lh : 0) + md / 2 + fs * 0.1;
    const plotBottom = frame.top + frame.height - catH - (o.showLabels ? lh * 0.6 : 0) - md / 2;
    const H = Math.max(1, plotBottom - plotTop);
    const yOf = function (v) { return plotBottom - (v - vmin) / (vmax - vmin) * H; };
    const xc = function (i) { return plotLeft + slot * (i + 0.5); };
    const lineW = Math.max(1.5, fs * 0.17);

    if (o.axis) {
      const y0 = (vmin <= 0 && vmax >= 0) ? yOf(0) : plotBottom;
      L(c, plotLeft + slot * 0.15, y0, plotLeft + n * slot - slot * 0.15, y0, C_AXIS, 0.75, 'Achse');
    }
    for (let s = 0; s < m; s++) {
      let prev = null;
      for (let i = 0; i < n; i++) {
        const v = num(s, i);
        if (v === null) { prev = null; continue; }
        const pt = { x: xc(i), y: yOf(v) };
        if (prev) L(c, prev.x, prev.y, pt.x, pt.y, c.colors[s], lineW, 'Linie ' + ser[s].name);
        prev = pt;
      }
    }
    const pts = ser.map(function () { return new Array(n).fill(null); });
    for (let i = 0; i < n; i++) {
      const col = [];
      for (let s = 0; s < m; s++) { const v = num(s, i); if (v !== null) col.push({ s: s, v: v, y: yOf(v) }); }
      col.sort(function (a, b) { return a.y - b.y; });
      col.forEach(function (p, k) {
        p.above = !(k > 0 && p.y - col[k - 1].y < lh * 1.1);
        pts[p.s][i] = p;
      });
    }
    for (let s = 0; s < m; s++) {
      for (let i = 0; i < n; i++) {
        const p = pts[s][i];
        if (!p) continue;
        if (o.markers) ELL(c, xc(i), p.y, md, c.colors[s], '#FFFFFF', 0.75, 'Punkt ' + ser[s].name + ' ' + cats[i]);
        if (o.showLabels) {
          const txt = fmtVal(c, p.v, false);
          const w = Math.max(slot, c.tw(txt) + 4);
          if (p.above) T(c, xc(i) - w / 2, p.y - md / 2 - lh - fs * 0.05, w, lh, txt, { valign: 'b' }, 'Wert ' + ser[s].name + ' ' + cats[i]);
          else T(c, xc(i) - w / 2, p.y + md / 2 + fs * 0.05, w, lh, txt, { valign: 't' }, 'Wert ' + ser[s].name + ' ' + cats[i]);
        }
      }
    }
    const catY = frame.top + frame.height - catH + fs * 0.3;
    for (let i = 0; i < n; i++) {
      T(c, xc(i) - slot / 2 + 1, catY, slot - 2, catLines * lh, cats[i], { valign: 't', wrap: catLines > 1 }, 'Kategorie ' + cats[i]);
    }
    if (legend === 'right') {
      const items = [];
      for (let s = 0; s < m; s++) {
        let last = -1;
        for (let i = n - 1; i >= 0; i--) if (pts[s][i]) { last = i; break; }
        if (last >= 0) items.push({ y: pts[s][last].y, name: ser[s].name, x: xc(last) });
      }
      spreadLabels(items, lh * 0.95, plotTop, plotBottom);
      items.forEach(function (it) {
        const xL = xc(n - 1) + legendOff;
        T(c, xL, it.y - lh / 2, Math.max(fs, frame.left + frame.width - xL), lh, it.name, { align: 'l', color: C_TEXT2 }, 'Legende ' + it.name);
      });
    }
    const anchor = function (i, d) {
      const p = pts[d.series][i];
      if (!p) return { x: xc(i), xr: xc(i) + md / 2, yVal: plotBottom, yTop: plotBottom };
      return { x: xc(i), xr: xc(i) + md / 2, yVal: p.y, yTop: p.y - md / 2 - (o.showLabels && p.above ? lh + fs * 0.05 : 0) };
    };
    drawDecorations(c, decos, anchor, { off: Math.min(slot * 0.12, fs * 0.6), levelX0: plotLeft + n * slot, levelWs: levelWs });
  }

  /* ------------------------------------------------------------------ */
  /* Mekko (Marimekko, 100 %)                                            */
  /* ------------------------------------------------------------------ */

  function layoutMekko(c) {
    const spec = c.spec, o = c.o, fs = c.fs, lh = c.lh, frame = c.frame;
    const cats = spec.categories, ser = spec.series, n = cats.length, m = ser.length;
    const val = function (s, i) { const v = ser[s].values[i]; return typeof v === 'number' ? Math.max(0, v) : 0; };
    const tot = [];
    for (let i = 0; i < n; i++) { let t = 0; for (let s = 0; s < m; s++) t += val(s, i); tot.push(t); }
    const grand = tot.reduce(function (a, b) { return a + b; }, 0);
    if (!(grand > 0)) {
      T(c, frame.left, frame.top, frame.width, frame.height, 'Mekko braucht positive Werte', { color: C_MUTED }, 'Hinweis');
      return;
    }
    let legend = o.legend;
    if (m < 2) legend = 'none';
    const titleH = titleHeight(c);
    let lgTop = null, legendTopH = 0;
    if (legend === 'top') {
      lgTop = legendTopMeasure(c, ser.map(function (s, k) { return { name: s.name, color: c.colors[k] }; }), frame.width);
      legendTopH = lgTop.height + fs * 0.5;
      legendTopDraw(c, lgTop, frame.left, frame.top + titleH);
    }
    const legendW = legend === 'right'
      ? Math.min(Math.max.apply(null, ser.map(function (s) { return c.tw(s.name); })) + fs * 0.8, frame.width * 0.3) : 0;
    const axisW = o.axis ? c.tw('100 %', fs * 0.9) + fs * 0.5 : 0;
    const plotLeft = frame.left + axisW, plotRight = frame.left + frame.width - legendW;
    const W = Math.max(1, plotRight - plotLeft);
    const widths = tot.map(function (t) { return W * t / grand; });
    let catLines = 1;
    cats.forEach(function (t, i) {
      if (c.tw(t) > widths[i] * 0.98) catLines = Math.max(catLines, Math.min(3, wrapText(c.tw, t, Math.max(fs, widths[i] * 0.98), fs, false).length));
    });
    const catH = catLines * lh + fs * 0.35;
    const plotTop = frame.top + titleH + legendTopH + (o.showTotals ? lh : 0) + fs * 0.1;
    const plotBottom = frame.top + frame.height - catH;
    const H = Math.max(1, plotBottom - plotTop);
    const segMid = ser.map(function () { return new Array(n).fill(null); });
    let x = plotLeft, lastIdx = -1;
    for (let i = 0; i < n; i++) {
      const w = widths[i];
      if (w <= 0.05) continue;
      lastIdx = i;
      let up = 0;
      for (let s = 0; s < m; s++) {
        const sh = tot[i] > 0 ? val(s, i) / tot[i] : 0;
        const yT = plotBottom - (up + sh) * H, yB = plotBottom - up * H;
        segMid[s][i] = (yT + yB) / 2;
        if (yB - yT > 0.05) R(c, x, yT, w, yB - yT, c.colors[s], 'Segment ' + ser[s].name + ' ' + cats[i], { stroke: '#FFFFFF', sw: 1 });
        if (o.showLabels && sh > 0) {
          const txt = o.mekkoLabels === 'abs' ? fmtVal(c, val(s, i), false) : fmtPct(sh, 0, false);
          if (yB - yT >= lh * 0.92 && c.tw(txt) + fs * 0.3 <= w) T(c, x, yT, w, yB - yT, txt, { color: onColor(c.colors[s]) }, 'Wert ' + ser[s].name + ' ' + cats[i]);
        }
        up += sh;
      }
      if (o.showTotals) T(c, x, plotTop - lh - fs * 0.1, w, lh, fmtVal(c, tot[i], false), { valign: 'b' }, 'Summe ' + cats[i]);
      T(c, x, plotBottom + fs * 0.3, w, catLines * lh, cats[i], { valign: 't', wrap: catLines > 1 }, 'Kategorie ' + cats[i]);
      x += w;
    }
    if (o.axis) {
      [0, 0.25, 0.5, 0.75, 1].forEach(function (p) {
        T(c, frame.left, plotBottom - p * H - lh / 2, axisW - fs * 0.35, lh, fmtPct(p, 0, false), { align: 'r', color: C_MUTED, size: fs * 0.9 }, 'Achse ' + Math.round(p * 100));
      });
    }
    if (legend === 'right' && lastIdx >= 0) {
      const xL = plotRight + fs * 0.5;
      const items = ser.map(function (s, k) { return { y: segMid[k][lastIdx], name: s.name }; });
      spreadLabels(items, lh * 0.95, plotTop, plotBottom);
      items.forEach(function (it) {
        T(c, xL, it.y - lh / 2, Math.max(fs, frame.left + frame.width - xL), lh, it.name, { align: 'l', color: C_TEXT2 }, 'Legende ' + it.name);
      });
    }
  }

  /* ------------------------------------------------------------------ */
  /* Haupteinstieg                                                       */
  /* ------------------------------------------------------------------ */

  /**
   * Berechnet alle Formen eines Diagramms.
   * @param spec  Diagramm-Spezifikation (type, categories, series, options, decorations)
   * @param frame { left, top, width, height } in Punkt
   * @param rt    Laufzeit: { theme: [Akzentfarben], measure(text, size, bold) }
   */
  function layout(specIn, frameIn, rt) {
    const spec = normalizeSpec(specIn);
    const frame = Object.assign({ left: 0, top: 0, width: 720, height: 360 }, frameIn || {});
    const c = makeCtx(spec, frame, rt);
    c.prims.push({ t: 'frame', x: r2(frame.left), y: r2(frame.top), w: r2(frame.width), h: r2(frame.height), name: 'Chartwerk Rahmen', z: -2 });
    const hasData = spec.categories.length > 0 && spec.series.length > 0 &&
      spec.series.some(function (s) { return s.values.some(function (v) { return v !== null; }); });
    if (!hasData) {
      T(c, frame.left, frame.top, frame.width, frame.height, 'Keine Daten', { color: C_MUTED }, 'Hinweis');
    } else {
      if (titleHeight(c)) T(c, frame.left, frame.top, frame.width, c.lh, String(c.o.title).trim(), { align: 'l', color: C_TEXT2, size: c.fs * 0.95 }, 'Überschrift');
      switch (spec.type) {
        case 'bar': layoutBar(c); break;
        case 'waterfall': layoutWaterfall(c); break;
        case 'line': layoutLine(c); break;
        case 'mekko': layoutMekko(c); break;
        default: layoutColumns(c);
      }
    }
    const prims = c.prims.map(function (p, i) { return { p: p, i: i }; })
      .sort(function (a, b) { return ((a.p.z || 0) - (b.p.z || 0)) || (a.i - b.i); })
      .map(function (x) { delete x.p.z; return x.p; });
    return { prims: prims, frame: frame, warnings: c.warnings, spec: spec };
  }

  /* ------------------------------------------------------------------ */
  /* SVG-Vorschau                                                        */
  /* ------------------------------------------------------------------ */

  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function f2(v) { return String(Math.round(v * 100) / 100); }

  function toSVG(res, opts) {
    opts = opts || {};
    const fr = res.frame, pad = opts.pad === undefined ? 4 : opts.pad;
    const measure = opts.measure || textWidth;
    const ff = opts.fontFamily || "-apple-system, 'Helvetica Neue', Helvetica, Arial, sans-serif";
    const vb = [fr.left - pad, fr.top - pad, fr.width + 2 * pad, fr.height + 2 * pad];
    const out = [];
    out.push('<svg xmlns="http://www.w3.org/2000/svg" viewBox="' + vb.map(f2).join(' ') + '"' +
      (opts.width ? ' width="' + opts.width + '"' : '') + (opts.height ? ' height="' + opts.height + '"' : '') +
      ' font-family="' + esc(ff) + '">');
    if (opts.background) out.push('<rect x="' + f2(vb[0]) + '" y="' + f2(vb[1]) + '" width="' + f2(vb[2]) + '" height="' + f2(vb[3]) + '" fill="' + opts.background + '"/>');
    res.prims.forEach(function (p) {
      switch (p.t) {
        case 'frame':
          if (opts.showFrame) out.push('<rect x="' + f2(p.x) + '" y="' + f2(p.y) + '" width="' + f2(p.w) + '" height="' + f2(p.h) + '" fill="none" stroke="#C8D2DC" stroke-dasharray="4 3" stroke-width="0.75"/>');
          break;
        case 'rect':
          out.push('<rect x="' + f2(p.x) + '" y="' + f2(p.y) + '" width="' + f2(p.w) + '" height="' + f2(p.h) + '" fill="' + (p.fill || 'none') + '"' +
            (p.stroke ? ' stroke="' + p.stroke + '" stroke-width="' + p.sw + '"' : '') + '/>');
          break;
        case 'line':
          out.push('<line x1="' + f2(p.x1) + '" y1="' + f2(p.y1) + '" x2="' + f2(p.x2) + '" y2="' + f2(p.y2) + '" stroke="' + p.stroke +
            '" stroke-width="' + p.sw + '"' + (p.dash ? ' stroke-dasharray="3 2"' : '') + ' stroke-linecap="butt"/>');
          break;
        case 'tri': {
          let pts;
          if (p.dir === 'down') pts = [[p.x, p.y], [p.x + p.w, p.y], [p.x + p.w / 2, p.y + p.h]];
          else if (p.dir === 'left') pts = [[p.x + p.w, p.y], [p.x + p.w, p.y + p.h], [p.x, p.y + p.h / 2]];
          else if (p.dir === 'right') pts = [[p.x, p.y], [p.x, p.y + p.h], [p.x + p.w, p.y + p.h / 2]];
          else pts = [[p.x, p.y + p.h], [p.x + p.w, p.y + p.h], [p.x + p.w / 2, p.y]];
          out.push('<polygon points="' + pts.map(function (q) { return f2(q[0]) + ',' + f2(q[1]); }).join(' ') + '" fill="' + p.fill + '"/>');
          break;
        }
        case 'ellipse':
          out.push('<ellipse cx="' + f2(p.x + p.w / 2) + '" cy="' + f2(p.y + p.h / 2) + '" rx="' + f2(p.w / 2) + '" ry="' + f2(p.h / 2) + '" fill="' + p.fill + '"' +
            (p.stroke ? ' stroke="' + p.stroke + '" stroke-width="' + p.sw + '"' : '') + '/>');
          break;
        case 'bubble':
          out.push('<rect x="' + f2(p.x) + '" y="' + f2(p.y) + '" width="' + f2(p.w) + '" height="' + f2(p.h) + '" rx="' + f2(Math.min(p.h, p.w) * 0.17) + '" fill="' + p.fill + '" stroke="' + p.stroke + '" stroke-width="' + p.sw + '"/>');
          out.push(svgText({ x: p.x, y: p.y, w: p.w, h: p.h, text: p.text, size: p.size, color: p.color, align: 'c', valign: 'm' }, measure));
          break;
        case 'text':
          out.push(svgText(p, measure));
          break;
      }
    });
    out.push('</svg>');
    return out.join('');
  }

  function svgText(p, measure) {
    const lines = p.wrap ? wrapText(measure, p.text, p.w, p.size, p.bold) : [p.text];
    const lhh = p.size * 1.2, total = lines.length * lhh;
    let y0 = p.y + (p.h - total) / 2;
    if (p.valign === 't') y0 = p.y;
    if (p.valign === 'b') y0 = p.y + p.h - total;
    const anchor = p.align === 'l' ? 'start' : (p.align === 'r' ? 'end' : 'middle');
    const x = p.align === 'l' ? p.x : (p.align === 'r' ? p.x + p.w : p.x + p.w / 2);
    return lines.map(function (ln, k) {
      return '<text x="' + f2(x) + '" y="' + f2(y0 + (k + 0.5) * lhh) + '" font-size="' + f2(p.size) + '" fill="' + p.color + '"' +
        (p.bold ? ' font-weight="bold"' : '') + ' text-anchor="' + anchor + '" dominant-baseline="central">' + esc(ln) + '</text>';
    }).join('');
  }

  return {
    VERSION: VERSION, TYPES: TYPES, TYPE_ORDER: TYPE_ORDER, PALETTES: PALETTES, DECO_LABELS: DECO_LABELS,
    defaultOptions: defaultOptions, normalizeSpec: normalizeSpec, compactSpec: compactSpec, sample: sample,
    specToGrid: specToGrid, gridToSpec: gridToSpec, formatRaw: formatRaw,
    layout: layout, toSVG: toSVG,
    parseNumber: parseNumber, fmtNumber: fmtNumber, fmtPct: fmtPct, yearOf: yearOf, periodsBetween: periodsBetween,
    textWidth: textWidth, wrapText: wrapText, onColor: onColor, contrast: contrast, mix: mix, normHex: normHex,
    seriesColors: seriesColors,
  };
});
