/*! Chartwerk Aufgabenbereich: Datenblatt, Optionen, Vorschau, Verknüpfung zur Folie */
(function () {
  'use strict';
  const CW = window.Chartwerk;
  const $ = function (s) { return document.querySelector(s); };
  const PREVIEW_FRAME = { left: 0, top: 0, width: 826, height: 346 };
  const KEEP_ON_TYPE_SWITCH = ['palette', 'fontSize', 'decimals', 'unit', 'title', 'pctDecimals'];

  const S = {
    type: 'stacked',
    grid: { cats: [], rows: [] },
    options: {},
    decos: [],
    bound: null,          // { chartId, slideId, shapeId, frame }
    live: true,
    theme: null,
    inOffice: false,
    busy: false,
    pending: false,
    sel: { r: 0, c: 0, r2: 0, c2: 0 },
    editing: false,
    preEdit: null,
    cellDirty: false,
    dragging: false,
    undo: [],
    selIsChart: false,
  };
  let pushTimer = null, saveTimer = null, selTimer = null, toastTimer = null;

  /* ================================================================ */
  /* Hilfen                                                            */
  /* ================================================================ */

  function el(tag, attrs, kids) {
    const e = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      if (k === 'text') e.textContent = attrs[k];
      else if (k === 'html') e.innerHTML = attrs[k];
      else if (k.slice(0, 2) === 'on') e.addEventListener(k.slice(2), attrs[k]);
      else if (attrs[k] !== undefined && attrs[k] !== null && attrs[k] !== false) e.setAttribute(k, attrs[k] === true ? '' : attrs[k]);
    });
    (kids || []).forEach(function (k) { if (k) e.appendChild(typeof k === 'string' ? document.createTextNode(k) : k); });
    return e;
  }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function toast(msg, kind) {
    const t = $('#toast');
    t.textContent = msg;
    t.className = 'toast show' + (kind === 'error' ? ' error' : '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.className = 'toast' + (kind === 'error' ? ' error' : ''); }, kind === 'error' ? 6000 : 3200);
  }
  function errText(e) {
    const m = (e && (e.message || e.toString())) || 'Unbekannter Fehler';
    return m.replace(/^Error:\s*/, '');
  }
  function snapshot() { return JSON.stringify({ grid: S.grid, decos: S.decos }); }
  function pushUndo(snap) {
    S.undo.push(snap || snapshot());
    if (S.undo.length > 40) S.undo.shift();
  }
  function undo() {
    const s = S.undo.pop();
    if (!s) { toast('Nichts zum Rückgängigmachen.'); return; }
    const o = JSON.parse(s);
    S.grid = o.grid; S.decos = o.decos;
    renderGrid(); renderDecos(); changed();
  }

  /* ================================================================ */
  /* Zustand <-> Spezifikation                                         */
  /* ================================================================ */

  function currentSpec() {
    return CW.gridToSpec(S.grid, { type: S.type, options: S.options, decorations: S.decos });
  }

  function loadSpec(spec, bound) {
    spec = CW.normalizeSpec(spec);
    S.type = spec.type;
    S.grid = CW.specToGrid(spec);
    S.options = Object.assign({}, spec.options);
    S.decos = spec.decorations.map(function (d) { return Object.assign({}, d); });
    S.bound = bound || null;
    S.undo = [];
    if (!S.grid.cats.length) S.grid.cats = ['', '', ''];
    if (!S.grid.rows.length) S.grid.rows = [{ name: '', cells: S.grid.cats.map(function () { return ''; }) }];
    S.sel = { r: 0, c: 0, r2: 0, c2: 0 };
    renderAll();
  }

  function saveLastSoon() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      try { localStorage.setItem('chartwerk.last', JSON.stringify(CW.compactSpec(currentSpec()))); } catch (e) { /* privat */ }
    }, 800);
  }
  function readLast() {
    try { const s = localStorage.getItem('chartwerk.last'); return s ? CW.normalizeSpec(JSON.parse(s)) : null; } catch (e) { return null; }
  }

  /** Nach jeder Änderung: Vorschau, Speichern, ggf. live ins Diagramm. */
  function changed(opts) {
    opts = opts || {};
    renderPreview();
    markCells();
    if (opts.decoLabels) refreshDecoLabels();
    saveLastSoon();
    if (S.bound && S.live && S.inOffice) schedulePush();
  }

  /* ================================================================ */
  /* Rendering                                                         */
  /* ================================================================ */

  function renderAll() {
    renderTypes(); renderGrid(); renderDecos(); renderOptions(); renderPreview(); renderStatus(); renderFooter(); renderHint();
  }

  function renderTypes() {
    const box = $('#types');
    box.innerHTML = '';
    CW.TYPE_ORDER.forEach(function (t) {
      const b = el('button', { type: 'button', title: CW.TYPES[t].label, class: t === S.type ? 'on' : '', onclick: function () { switchType(t); } });
      b.innerHTML = (CW.ICONS && CW.ICONS[t]) || '';
      b.appendChild(el('span', { text: CW.TYPES[t].label }));
      box.appendChild(b);
    });
  }

  function renderHint() {
    const h = $('#hint');
    if (S.type === 'waterfall') {
      h.innerHTML = 'Werte in die erste Zeile. Die erste Spalte ist der Startwert, <code>e</code> erzeugt eine Summe. Aus Excel: Bereich kopieren, ins graue Eckfeld klicken, <kbd>⌘V</kbd> (auch senkrecht angeordnet).';
    } else if (S.type === 'mekko') {
      h.innerHTML = 'Spalten = Märkte/Kategorien (Breite = Summe), Zeilen = Segmente. Aus Excel: Bereich mit Beschriftungen kopieren, ins graue Eckfeld klicken, <kbd>⌘V</kbd>.';
    } else {
      h.innerHTML = 'Spalten = Kategorien (z. B. Jahre), Zeilen = Reihen. Aus Excel: Bereich mit Beschriftungen kopieren, ins graue Eckfeld klicken, <kbd>⌘V</kbd>.';
    }
  }

  function renderStatus() {
    const st = $('#status');
    let cls = 'status', txt = 'Neues Diagramm';
    if (!S.inOffice) { cls += ' off'; txt = 'Nur Vorschau'; }
    else if (S.bound) { cls += ' bound'; txt = 'Verknüpft: ' + CW.TYPES[S.type].label; }
    if (S.busy) cls += ' busy';
    st.className = cls;
    st.querySelector('span').textContent = txt;
    st.title = S.bound ? 'Änderungen gehen in das ausgewählte Diagramm auf der Folie.' : 'Mit „In Folie einfügen“ entsteht ein neues Diagramm.';
  }

  function renderFooter() {
    const bound = !!S.bound;
    $('#btnApply').textContent = bound ? 'Aktualisieren' : 'In Folie einfügen';
    $('#btnApply').disabled = S.busy || !S.inOffice;
    $('#btnCopy').hidden = !bound;
    $('#btnUnbind').hidden = !bound;
    $('#live').parentElement.style.visibility = bound ? 'visible' : 'hidden';
  }

  function setBusy(b) {
    S.busy = b;
    renderStatus();
    $('#btnApply').disabled = b || !S.inOffice;
    $('#btnCopy').disabled = b;
  }

  function renderPreview() {
    const spec = currentSpec();
    const fr = S.bound && S.bound.frame ? { left: 0, top: 0, width: S.bound.frame.width, height: S.bound.frame.height } : PREVIEW_FRAME;
    let res;
    try { res = CW.layout(spec, fr, { theme: S.theme }); }
    catch (e) { $('#preview').textContent = 'Vorschau nicht möglich: ' + errText(e); return; }
    $('#preview').innerHTML = CW.toSVG(res, { pad: 4 });
    const notes = res.warnings.slice();
    const bad = countInvalid();
    if (bad) notes.push(bad === 1 ? 'Eine Zelle ist keine Zahl und wird ignoriert.' : bad + ' Zellen sind keine Zahlen und werden ignoriert.');
    if (S.type === 'waterfall' && S.grid.rows.length > 1) notes.push('Wasserfall nutzt nur die erste Datenzeile.');
    $('#warn').textContent = notes.join(' ');
    $('#previewInfo').textContent = S.bound ? Math.round(fr.width) + ' × ' + Math.round(fr.height) + ' pt' : '';
  }

  /* ---------------- Datenblatt ---------------- */

  function getCell(r, c) {
    if (r < 0 && c < 0) return '';
    if (r < 0) return S.grid.cats[c] || '';
    const row = S.grid.rows[r];
    if (!row) return '';
    if (c < 0) return row.name || '';
    return row.cells[c] === undefined || row.cells[c] === null ? '' : String(row.cells[c]);
  }
  function ensureSize(r, c) {
    while (S.grid.cats.length <= c) S.grid.cats.push('');
    const C = S.grid.cats.length;
    while (S.grid.rows.length <= r) S.grid.rows.push({ name: '', cells: [] });
    S.grid.rows.forEach(function (row) { while (row.cells.length < C) row.cells.push(''); });
  }
  function setCell(r, c, v) {
    if (r < 0 && c < 0) return;
    ensureSize(r, c);
    v = v === undefined || v === null ? '' : String(v);
    if (r < 0) S.grid.cats[c] = v;
    else if (c < 0) S.grid.rows[r].name = v;
    else S.grid.rows[r].cells[c] = v;
  }
  function fitHeader(inp) {
    const n = Math.max(String(inp.value || '').length, 4);
    inp.style.width = Math.min(150, Math.max(64, n * 7.4 + 16)) + 'px';
  }
  function input(r, c) { return $('#grid').querySelector('input[data-r="' + r + '"][data-c="' + c + '"]'); }

  function renderGrid() {
    const t = $('#grid');
    const hadFocus = t.contains(document.activeElement);
    t.innerHTML = '';
    ensureSize(Math.max(0, S.grid.rows.length - 1), Math.max(0, S.grid.cats.length - 1));
    const C = S.grid.cats.length, R = S.grid.rows.length;
    const mk = function (r, c) {
      const head = r < 0 || c < 0;
      const td = el(head ? 'th' : 'td', { class: r < 0 && c < 0 ? 'corner' : (r < 0 ? 'cat' : (c < 0 ? 'name' : 'val')) });
      const inp = el('input', { type: 'text', spellcheck: 'false', autocomplete: 'off', 'data-r': r, 'data-c': c });
      if (r < 0 && c < 0) {
        inp.readOnly = true;
        inp.placeholder = 'Tabelle ⌘V';
        inp.title = 'Hier klicken und ⌘V drücken: fügt eine ganze Excel-Tabelle samt Beschriftungen ein.';
      } else {
        inp.value = getCell(r, c);
        if (r < 0) { inp.placeholder = 'Kat. ' + (c + 1); fitHeader(inp); }
        if (c < 0) inp.placeholder = S.type === 'waterfall' ? 'Werte' : 'Reihe ' + (r + 1);
      }
      td.appendChild(inp);
      return td;
    };
    const head = el('tr');
    head.appendChild(mk(-1, -1));
    for (let c = 0; c < C; c++) head.appendChild(mk(-1, c));
    t.appendChild(head);
    for (let r = 0; r < R; r++) {
      const tr = el('tr', { class: S.type === 'waterfall' && r > 0 ? 'ignored' : '' });
      tr.appendChild(mk(r, -1));
      for (let c = 0; c < C; c++) tr.appendChild(mk(r, c));
      t.appendChild(tr);
    }
    S.sel.r = clamp(S.sel.r, -1, R - 1); S.sel.c = clamp(S.sel.c, -1, C - 1);
    S.sel.r2 = clamp(S.sel.r2, -1, R - 1); S.sel.c2 = clamp(S.sel.c2, -1, C - 1);
    paintSelection();
    markCells();
    if (hadFocus) { const i = input(S.sel.r, S.sel.c); if (i) { i.focus(); i.select(); } }
  }

  function countInvalid() {
    let n = 0;
    S.grid.rows.forEach(function (row, r) {
      if (S.type === 'waterfall' && r > 0) return;
      row.cells.forEach(function (v) {
        const p = CW.parseNumber(v);
        if ((typeof p === 'number' && isNaN(p)) || (p === 'e' && S.type !== 'waterfall')) n++;
      });
    });
    return n;
  }

  function markCells() {
    const t = $('#grid');
    t.querySelectorAll('td.val').forEach(function (td) {
      const inp = td.firstChild;
      const p = CW.parseNumber(inp.value);
      td.classList.toggle('bad', (typeof p === 'number' && isNaN(p)) || (p === 'e' && S.type !== 'waterfall'));
      td.classList.toggle('total', p === 'e' && S.type === 'waterfall');
    });
  }

  function rangeBounds() {
    return {
      r0: Math.min(S.sel.r, S.sel.r2), r1: Math.max(S.sel.r, S.sel.r2),
      c0: Math.min(S.sel.c, S.sel.c2), c1: Math.max(S.sel.c, S.sel.c2),
    };
  }
  function rangeSize() { const b = rangeBounds(); return (b.r1 - b.r0 + 1) * (b.c1 - b.c0 + 1); }

  function paintSelection() {
    const t = $('#grid');
    t.querySelectorAll('.insel, .active').forEach(function (x) { x.classList.remove('insel', 'active'); });
    const b = rangeBounds();
    const multi = rangeSize() > 1;
    t.querySelectorAll('input').forEach(function (inp) {
      const r = +inp.dataset.r, c = +inp.dataset.c;
      const td = inp.parentElement;
      if (multi && r >= b.r0 && r <= b.r1 && c >= b.c0 && c <= b.c1) td.classList.add('insel');
      if (r === S.sel.r && c === S.sel.c) td.classList.add('active');
    });
  }

  function focusCell(r, c, extend) {
    const C = S.grid.cats.length, R = S.grid.rows.length;
    r = clamp(r, -1, R - 1); c = clamp(c, -1, C - 1);
    if (extend) { S.sel.r2 = r; S.sel.c2 = c; paintSelection(); return; }
    S.sel = { r: r, c: c, r2: r, c2: c };
    const inp = input(r, c);
    if (inp) { inp.focus(); inp.select(); }
    S.editing = false;
    paintSelection();
  }
  function move(dr, dc, extend) {
    if (extend) focusCell(S.sel.r2 + dr, S.sel.c2 + dc, true);
    else focusCell(S.sel.r + dr, S.sel.c + dc, false);
  }

  function onGridFocus(e) {
    const inp = e.target;
    if (!inp.dataset || inp.dataset.r === undefined) return;
    const r = +inp.dataset.r, c = +inp.dataset.c;
    if (!(S.sel.r === r && S.sel.c === c)) { S.sel = { r: r, c: c, r2: r, c2: c }; S.editing = false; }
    S.preEdit = snapshot();
    S.cellDirty = false;
    paintSelection();
  }
  function onGridInput(e) {
    const inp = e.target;
    const r = +inp.dataset.r, c = +inp.dataset.c;
    if (!S.cellDirty) { pushUndo(S.preEdit); S.cellDirty = true; }
    setCell(r, c, inp.value);
    if (r < 0 && c >= 0) fitHeader(inp);
    changed({ decoLabels: r < 0 });
  }
  function onGridKey(e) {
    const inp = e.target;
    if (!inp.dataset || inp.dataset.r === undefined) return;
    const mod = e.metaKey || e.ctrlKey;
    if (mod && (e.key === 'z' || e.key === 'Z') && !S.editing) { e.preventDefault(); undo(); return; }
    if (mod && (e.key === 'a' || e.key === 'A') && !S.editing) {
      e.preventDefault();
      S.sel = { r: -1, c: -1, r2: S.grid.rows.length - 1, c2: S.grid.cats.length - 1 };
      paintSelection();
      return;
    }
    switch (e.key) {
      case 'ArrowUp': e.preventDefault(); move(-1, 0, e.shiftKey); break;
      case 'ArrowDown': e.preventDefault(); move(1, 0, e.shiftKey); break;
      case 'ArrowLeft': if (S.editing && !e.shiftKey) return; e.preventDefault(); move(0, -1, e.shiftKey); break;
      case 'ArrowRight': if (S.editing && !e.shiftKey) return; e.preventDefault(); move(0, 1, e.shiftKey); break;
      case 'Enter': e.preventDefault(); move(e.shiftKey ? -1 : 1, 0, false); break;
      case 'Tab': {
        e.preventDefault();
        const C = S.grid.cats.length;
        if (!e.shiftKey && S.sel.c >= C - 1 && S.sel.r < S.grid.rows.length - 1) focusCell(S.sel.r + 1, -1, false);
        else move(0, e.shiftKey ? -1 : 1, false);
        break;
      }
      case 'Escape':
        if (S.cellDirty && S.preEdit) { S.undo.pop(); const o = JSON.parse(S.preEdit); S.grid = o.grid; inp.value = getCell(+inp.dataset.r, +inp.dataset.c); S.cellDirty = false; changed(); }
        S.editing = false; inp.select();
        break;
      case 'F2':
        e.preventDefault(); S.editing = true;
        try { inp.setSelectionRange(inp.value.length, inp.value.length); } catch (x) { /* readonly */ }
        break;
      case 'Backspace':
      case 'Delete':
        if (rangeSize() > 1 && !S.editing) { e.preventDefault(); clearRange(); }
        break;
      default:
        break;
    }
  }
  function clearRange() {
    pushUndo();
    const b = rangeBounds();
    for (let r = b.r0; r <= b.r1; r++) for (let c = b.c0; c <= b.c1; c++) {
      if (r < 0 && c < 0) continue;
      setCell(r, c, '');
      const i = input(r, c); if (i) i.value = '';
    }
    changed({ decoLabels: true });
  }

  /* Einfügen / Kopieren */
  function parseTable(text, delim) {
    text = String(text || '').replace(/\r\n?/g, '\n');
    while (text.length && text.charAt(text.length - 1) === '\n') text = text.slice(0, -1);
    const rows = [];
    let row = [], cur = '', inQ = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text.charAt(i);
      if (inQ) {
        if (ch === '"') { if (text.charAt(i + 1) === '"') { cur += '"'; i++; } else inQ = false; }
        else cur += ch;
      } else if (ch === '"' && cur === '') inQ = true;
      else if (ch === delim) { row.push(cur); cur = ''; }
      else if (ch === '\n') { row.push(cur); rows.push(row); row = []; cur = ''; }
      else cur += ch;
    }
    row.push(cur); rows.push(row);
    return rows.map(function (r) { return r.map(function (x) { return x.replace(/\n/g, ' ').trim(); }); });
  }
  function trimBlock(b) {
    const blank = function (x) { return !String(x || '').trim(); };
    b = b.filter(function (r) { return r.some(function (x) { return !blank(x); }); });
    if (!b.length) return b;
    const W = Math.max.apply(null, b.map(function (r) { return r.length; }));
    b = b.map(function (r) { const o = r.slice(); while (o.length < W) o.push(''); return o; });
    let last = W - 1;
    while (last > 0 && b.every(function (r) { return blank(r[last]); })) last--;
    let first = 0;
    while (first < last && b.every(function (r) { return blank(r[first]); })) first++;
    return b.map(function (r) { return r.slice(first, last + 1); });
  }
  function transposeBlock(b) {
    const W = Math.max.apply(null, b.map(function (r) { return r.length; }));
    const out = [];
    for (let j = 0; j < W; j++) out.push(b.map(function (r) { return r[j] === undefined ? '' : r[j]; }));
    return out;
  }
  function isNum(x) { const p = CW.parseNumber(x); return typeof p === 'number' && !isNaN(p); }
  function isYearLabel(x) { return /^\s*(GJ\s?|FY\s?)?(19|20)\d{2}\s*[A-Za-z]{0,3}\s*$/.test(String(x)); }

  /** Ganze Tabelle übernehmen (erste Zeile = Kategorien, erste Spalte = Reihen). */
  function applyTable(block, opts) {
    opts = opts || {};
    let b = trimBlock(block);
    if (!b.length) { toast('Keine Daten gefunden.'); return; }
    let note = '';
    if (S.type === 'waterfall' && b[0].length === 2 && b.length >= 2) {
      const header = !isNum(b[0][1]) && b[0][1] !== 'e';
      const body = header ? b.slice(1) : b;
      S.grid = { cats: body.map(function (r) { return r[0]; }), rows: [{ name: header ? b[0][1] : 'Werte', cells: body.map(function (r) { return r[1]; }) }] };
      note = 'Senkrechte Wasserfall-Daten übernommen.';
    } else if (b.length === 1 || b[0].length === 1) {
      const vals = b.length === 1 ? b[0] : b.map(function (r) { return r[0]; });
      S.grid = { cats: vals.map(function () { return ''; }), rows: [{ name: '', cells: vals }] };
      note = 'Werte ohne Beschriftungen übernommen.';
    } else {
      const firstCol = b.slice(1).map(function (r) { return r[0]; });
      const firstRow = b[0].slice(1);
      const yearsDown = firstCol.filter(isYearLabel).length;
      const yearsAcross = firstRow.filter(isYearLabel).length;
      if (!opts.noAuto && yearsDown >= 2 && yearsAcross === 0) { b = transposeBlock(b); note = 'Jahre standen untereinander und wurden in Spalten gedreht (⇄ macht das rückgängig).'; }
      S.grid = { cats: b[0].slice(1), rows: b.slice(1).map(function (r) { return { name: r[0], cells: r.slice(1) }; }) };
    }
    ensureSize(Math.max(0, S.grid.rows.length - 1), Math.max(0, S.grid.cats.length - 1));
    S.decos = S.decos.filter(function (d) { return d.from < S.grid.cats.length && d.to < S.grid.cats.length; });
    renderGrid(); renderDecos();
    changed();
    toast(note || ('Übernommen: ' + S.grid.rows.length + ' Zeile(n) × ' + S.grid.cats.length + ' Spalte(n).'));
  }

  function onGridPaste(e) {
    const inp = e.target;
    if (!inp.dataset || inp.dataset.r === undefined) return;
    const text = (e.clipboardData && e.clipboardData.getData('text/plain')) || '';
    const r = +inp.dataset.r, c = +inp.dataset.c;
    const corner = r === -1 && c === -1;
    const isBlock = /[\t\n]/.test(text.replace(/[\r\n]+$/, ''));
    if (!isBlock && !corner) return;
    e.preventDefault();
    const block = parseTable(text, '\t');
    pushUndo();
    const labeled = block.length >= 2 && block[0].length >= 2 && !String(block[0][0]).trim();
    if (corner || (r <= 0 && c <= 0 && labeled)) { applyTable(block); return; }
    const b = rangeBounds();
    block.forEach(function (row, i) { row.forEach(function (v, j) { setCell(b.r0 + i, b.c0 + j, v); }); });
    renderGrid(); renderDecos();
    changed({ decoLabels: true });
  }

  function onGridCopy(e) {
    if (rangeSize() <= 1) return;
    e.preventDefault();
    const b = rangeBounds();
    const lines = [];
    for (let r = b.r0; r <= b.r1; r++) {
      const cells = [];
      for (let c = b.c0; c <= b.c1; c++) cells.push(getCell(r, c));
      lines.push(cells.join('\t'));
    }
    e.clipboardData.setData('text/plain', lines.join('\n'));
    toast(rangeSize() + ' Zellen kopiert.');
  }

  function onGridMouseDown(e) {
    const inp = e.target.closest && e.target.closest('input');
    if (!inp) return;
    const r = +inp.dataset.r, c = +inp.dataset.c;
    if (e.shiftKey) { e.preventDefault(); S.sel.r2 = r; S.sel.c2 = c; paintSelection(); return; }
    S.dragging = true;
    S.sel = { r: r, c: c, r2: r, c2: c };
    S.editing = false;
    paintSelection();
  }
  function onGridMouseOver(e) {
    if (!S.dragging) return;
    const inp = e.target.closest && e.target.closest('input');
    if (!inp) return;
    const r = +inp.dataset.r, c = +inp.dataset.c;
    if (r !== S.sel.r2 || c !== S.sel.c2) { S.sel.r2 = r; S.sel.c2 = c; paintSelection(); }
  }

  /* Zeilen und Spalten */
  function shiftDecos(at, delta) {
    S.decos = S.decos.filter(function (d) { return !(delta < 0 && (d.from === at || d.to === at)); }).map(function (d) {
      const f = function (i) { return delta > 0 ? (i >= at ? i + 1 : i) : (i > at ? i - 1 : i); };
      return Object.assign({}, d, { from: f(d.from), to: f(d.to) });
    });
  }
  function gridAction(act) {
    const C = S.grid.cats.length, R = S.grid.rows.length;
    const r = Math.max(0, S.sel.r), c = Math.max(0, S.sel.c);
    switch (act) {
      case 'addRow':
        pushUndo();
        S.grid.rows.splice(Math.min(R, r + 1), 0, { name: '', cells: S.grid.cats.map(function () { return ''; }) });
        renderGrid(); focusCell(Math.min(R, r + 1), -1); changed();
        break;
      case 'addCol':
        pushUndo();
        S.grid.cats.splice(Math.min(C, c + 1), 0, '');
        S.grid.rows.forEach(function (row) { row.cells.splice(Math.min(C, c + 1), 0, ''); });
        shiftDecos(Math.min(C, c + 1), +1);
        renderGrid(); renderDecos(); focusCell(-1, Math.min(C, c + 1)); changed();
        break;
      case 'delRow':
        if (R <= 1) { toast('Mindestens eine Zeile bleibt stehen.'); return; }
        pushUndo();
        S.grid.rows.splice(r, 1);
        renderGrid(); focusCell(Math.min(r, R - 2), Math.max(-1, S.sel.c)); changed();
        break;
      case 'delCol':
        if (C <= 1) { toast('Mindestens eine Spalte bleibt stehen.'); return; }
        pushUndo();
        S.grid.cats.splice(c, 1);
        S.grid.rows.forEach(function (row) { row.cells.splice(c, 1); });
        shiftDecos(c, -1);
        renderGrid(); renderDecos(); focusCell(Math.max(-1, S.sel.r), Math.min(c, C - 2)); changed();
        break;
      case 'transpose': {
        pushUndo();
        const b = [[''].concat(S.grid.cats)].concat(S.grid.rows.map(function (row) { return [row.name].concat(row.cells); }));
        const t = transposeBlock(b);
        S.grid = { cats: t[0].slice(1), rows: t.slice(1).map(function (row) { return { name: row[0], cells: row.slice(1) }; }) };
        S.decos = [];
        renderGrid(); renderDecos(); changed();
        toast('Zeilen und Spalten getauscht. Pfeile wurden entfernt.');
        break;
      }
      case 'undo': undo(); break;
      case 'import': $('#file').click(); break;
      default: break;
    }
  }

  /* Datei-Import */
  let xlsxLoading = null;
  function loadXLSX() {
    if (window.XLSX) return Promise.resolve();
    if (xlsxLoading) return xlsxLoading;
    xlsxLoading = new Promise(function (resolve, reject) {
      const s = document.createElement('script');
      s.src = 'vendor/xlsx.mini.min.js';
      s.onload = function () { resolve(); };
      s.onerror = function () { xlsxLoading = null; reject(new Error('Excel-Leser konnte nicht geladen werden.')); };
      document.head.appendChild(s);
    });
    return xlsxLoading;
  }
  function cellStr(v) {
    if (v === null || v === undefined) return '';
    if (typeof v === 'number') return CW.formatRaw(v);
    if (v instanceof Date) return v.toLocaleDateString('de-DE', { month: '2-digit', year: 'numeric' });
    return String(v);
  }
  async function onFile(e) {
    const f = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!f) return;
    try {
      let block;
      if (/\.(csv|tsv|txt)$/i.test(f.name)) {
        const text = await f.text();
        const first = text.split(/\r?\n/)[0] || '';
        const delim = first.indexOf('\t') >= 0 ? '\t' : (first.split(';').length >= first.split(',').length ? ';' : ',');
        block = parseTable(text, delim);
      } else {
        await loadXLSX();
        const wb = window.XLSX.read(await f.arrayBuffer(), { type: 'array', cellDates: true });
        const ws = wb.Sheets[wb.SheetNames[0]];
        block = window.XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: '' }).map(function (row) { return row.map(cellStr); });
      }
      pushUndo();
      applyTable(block);
    } catch (err) {
      toast('Import fehlgeschlagen: ' + errText(err), 'error');
    }
  }

  /* ---------------- Pfeile ---------------- */

  function catLabel(i) { const t = String(S.grid.cats[i] || '').trim(); return t || 'Spalte ' + (i + 1); }

  function addDeco(kind) {
    const n = S.grid.cats.length;
    if (n < 2) { toast('Dafür braucht es mindestens zwei Kategorien.'); return; }
    let d = { kind: kind, from: 0, to: n - 1, mode: 'pct', series: 0 };
    if (kind === 'diff' && S.type !== 'waterfall') d = Object.assign(d, { from: n - 2, to: n - 1 });
    pushUndo();
    S.decos.push(d);
    renderDecos();
    changed();
  }

  function renderDecos() {
    const allowed = CW.TYPES[S.type].deco;
    ['cagr', 'diff', 'level'].forEach(function (k) {
      const b = $('#add-' + k);
      b.disabled = allowed.indexOf(k) < 0 || S.grid.cats.length < 2;
    });
    const list = $('#decoList');
    list.innerHTML = '';
    if (!allowed.length) {
      list.appendChild(el('p', { class: 'muted small', text: 'Für „' + CW.TYPES[S.type].label + '“ gibt es keine Pfeile.' }));
      return;
    }
    const shown = S.decos.filter(function (d) { return allowed.indexOf(d.kind) >= 0; });
    if (!shown.length) {
      list.appendChild(el('p', { class: 'muted small', text: 'Noch keine Pfeile. CAGR zeigt das jährliche Wachstum, Differenz die Veränderung zwischen zwei Säulen, Niveau den Abstand zweier Höhen.' }));
      return;
    }
    const n = S.grid.cats.length;
    const multiSeries = (S.type === 'clustered' || S.type === 'line') && S.grid.rows.length > 1;
    S.decos.forEach(function (d, k) {
      if (allowed.indexOf(d.kind) < 0) return;
      const catSelect = function (key) {
        const s = el('select', { 'data-k': k, 'data-key': key, onchange: onDecoChange });
        for (let i = 0; i < n; i++) s.appendChild(el('option', { value: i, text: catLabel(i) }));
        s.value = String(clamp(d[key], 0, n - 1));
        return s;
      };
      const row = el('div', { class: 'deco' }, [
        el('b', { text: d.kind === 'cagr' ? 'CAGR' : (d.kind === 'diff' ? 'Differenz' : 'Niveau') }),
        catSelect('from'), el('span', { class: 'muted', text: '→' }), catSelect('to'),
      ]);
      if (d.kind !== 'cagr') {
        const m = el('select', { 'data-k': k, 'data-key': 'mode', onchange: onDecoChange }, [
          el('option', { value: 'pct', text: '%' }), el('option', { value: 'abs', text: 'absolut' }),
        ]);
        m.value = d.mode || 'pct';
        row.appendChild(m);
      }
      if (multiSeries) {
        const s = el('select', { 'data-k': k, 'data-key': 'series', onchange: onDecoChange, title: 'Reihe' });
        S.grid.rows.forEach(function (r, i) { s.appendChild(el('option', { value: i, text: String(r.name || 'Reihe ' + (i + 1)) })); });
        s.value = String(clamp(d.series || 0, 0, S.grid.rows.length - 1));
        row.appendChild(s);
      }
      if (d.from === d.to) row.appendChild(el('span', { class: 'muted small', text: 'gleiche Spalte' }));
      row.appendChild(el('button', { type: 'button', class: 'x', title: 'Pfeil entfernen', text: '×', onclick: function () { pushUndo(); S.decos.splice(k, 1); renderDecos(); changed(); } }));
      list.appendChild(row);
    });
  }
  function onDecoChange(e) {
    const k = +e.target.dataset.k, key = e.target.dataset.key;
    pushUndo();
    S.decos[k][key] = key === 'mode' ? e.target.value : +e.target.value;
    changed();
    if (S.decos[k].from === S.decos[k].to) renderDecos();
  }
  function refreshDecoLabels() {
    $('#decoList').querySelectorAll('select[data-key="from"], select[data-key="to"]').forEach(function (s) {
      Array.prototype.forEach.call(s.options, function (o, i) { o.textContent = catLabel(i); });
    });
  }

  /* ---------------- Optionen ---------------- */

  const OPTS = [
    { key: 'palette', label: 'Farben', type: 'select', options: function () { return Object.keys(CW.PALETTES).map(function (k) { return [k, CW.PALETTES[k].label]; }); } },
    { key: 'legend', label: 'Legende', type: 'select', options: [['right', 'rechts am Diagramm'], ['top', 'oben'], ['none', 'aus']], types: ['stacked', 'clustered', 'percent', 'bar', 'line', 'mekko'] },
    { key: 'showLabels', label: 'Werte anzeigen', type: 'check' },
    { key: 'showTotals', label: 'Summen anzeigen', type: 'check', types: ['stacked', 'percent', 'bar', 'mekko'] },
    { key: 'decimals', label: 'Nachkommastellen', type: 'select', options: [['auto', 'automatisch'], ['0', '0'], ['1', '1'], ['2', '2']] },
    { key: 'unit', label: 'Einheit an jedem Wert', type: 'text', placeholder: 'z. B. Mio. €' },
    { key: 'title', label: 'Text oben links', type: 'text', placeholder: 'z. B. in Mio. €' },
    { key: 'fontSize', label: 'Schriftgröße (pt)', type: 'number', min: 7, max: 28, step: 1 },
    { key: 'gap', label: 'Lücke zwischen Säulen', type: 'range', min: 0, max: 0.8, step: 0.05, types: ['stacked', 'clustered', 'percent', 'bar', 'waterfall'] },
    { key: 'separators', label: 'Weiße Trennlinien', type: 'check', types: ['stacked', 'percent', 'bar'] },
    { key: 'axis', label: 'Achse anzeigen', type: 'check' },
    { key: 'connectors', label: 'Verbindungslinien', type: 'check', types: ['waterfall'] },
    { key: 'signs', label: 'Vorzeichen bei Veränderungen', type: 'check', types: ['waterfall'] },
    { key: 'wfColors', label: 'Wasserfall-Farben', type: 'select', options: [['gruenrot', 'Grün / Rot'], ['palette', 'aus der Palette'], ['grau', 'Grau']], types: ['waterfall'] },
    { key: 'zeroBase', label: 'Achse bei 0 beginnen', type: 'check', types: ['line'] },
    { key: 'markers', label: 'Punkte anzeigen', type: 'check', types: ['line'] },
    { key: 'mekkoLabels', label: 'Segmentwerte', type: 'select', options: [['pct', 'Anteil in %'], ['abs', 'absolut']], types: ['mekko'] },
    { key: 'pctDecimals', label: 'Nachkommastellen in Pfeilen', type: 'select', options: [['0', '0'], ['1', '1'], ['2', '2']], types: ['stacked', 'clustered', 'waterfall', 'line'] },
  ];

  function renderOptions() {
    const box = $('#opts');
    box.innerHTML = '';
    OPTS.forEach(function (o) {
      if (o.types && o.types.indexOf(S.type) < 0) return;
      const id = 'opt-' + o.key;
      let ctl;
      const v = S.options[o.key];
      if (o.type === 'select') {
        ctl = el('select', { id: id });
        (typeof o.options === 'function' ? o.options() : o.options).forEach(function (p) { ctl.appendChild(el('option', { value: p[0], text: p[1] })); });
        ctl.value = String(v);
      } else if (o.type === 'check') {
        ctl = el('input', { id: id, type: 'checkbox' });
        ctl.checked = !!v;
      } else if (o.type === 'range' || o.type === 'number') {
        ctl = el('input', { id: id, type: o.type, min: o.min, max: o.max, step: o.step });
        ctl.value = String(v);
      } else {
        ctl = el('input', { id: id, type: 'text', placeholder: o.placeholder || '' });
        ctl.value = v || '';
      }
      ctl.addEventListener(o.type === 'text' || o.type === 'range' || o.type === 'number' ? 'input' : 'change', function () {
        let nv;
        if (o.type === 'check') nv = ctl.checked;
        else if (o.type === 'range' || o.type === 'number') { nv = parseFloat(ctl.value); if (!isFinite(nv)) return; if (o.type === 'number') nv = clamp(nv, o.min, o.max); }
        else if (o.key === 'pctDecimals') nv = +ctl.value;
        else nv = ctl.value;
        S.options[o.key] = nv;
        changed();
      });
      box.appendChild(el('label', { for: id, text: o.label }));
      box.appendChild(ctl);
    });
  }

  /* ---------------- Typwechsel ---------------- */

  function switchType(t) {
    if (t === S.type) return;
    const keep = {};
    KEEP_ON_TYPE_SWITCH.forEach(function (k) { keep[k] = S.options[k]; });
    S.type = t;
    S.options = Object.assign(CW.defaultOptions(t), keep);
    renderAll();
    changed();
  }

  /* ================================================================ */
  /* PowerPoint                                                        */
  /* ================================================================ */

  function refOf(r) { return { chartId: r.chartId, slideId: r.slideId, shapeId: r.shapeId, frame: r.frame, box: r.box || r.frame }; }

  /* Schutz gegen Endlosschleifen: höchstens 3 automatische Neuanordnungen pro 20 Sekunden. */
  const autoLog = [];
  function autoAllowed() {
    const now = Date.now();
    while (autoLog.length && now - autoLog[0] > 20000) autoLog.shift();
    if (autoLog.length >= 3) return false;
    autoLog.push(now);
    return true;
  }

  function schedulePush() {
    clearTimeout(pushTimer);
    pushTimer = setTimeout(function () { pushTimer = null; push(); }, 650);
  }

  async function push() {
    if (!S.bound || !S.inOffice) return;
    if (S.busy) { S.pending = true; return; }
    setBusy(true);
    try {
      const r = await CW.ppt.updateChart(S.bound, currentSpec());
      S.bound = refOf(r);
      S.selIsChart = true;
    } catch (e) {
      toast('Aktualisieren fehlgeschlagen: ' + errText(e), 'error');
      if (/nicht gefunden/i.test(errText(e))) { S.bound = null; renderFooter(); }
    } finally {
      setBusy(false);
      renderStatus(); renderFooter();
      if (S.pending) { S.pending = false; push(); }
    }
  }

  async function flushPush() {
    if (pushTimer) { clearTimeout(pushTimer); pushTimer = null; await push(); }
  }

  async function insertNew() {
    if (!S.inOffice) { toast('Einfügen geht nur in PowerPoint.'); return; }
    setBusy(true);
    try {
      const r = await CW.ppt.insertChart(currentSpec());
      S.bound = refOf(r);
      S.selIsChart = true;
      toast('Diagramm eingefügt. Änderungen hier gehen jetzt live in die Folie.');
      renderPreview();
    } catch (e) {
      toast('Einfügen fehlgeschlagen: ' + errText(e), 'error');
    } finally {
      setBusy(false);
      renderStatus(); renderFooter();
    }
  }

  function onSelectionEvent() {
    clearTimeout(selTimer);
    selTimer = setTimeout(onSelection, 220);
  }

  async function onSelection() {
    if (S.busy || !S.inOffice) return;
    let sel = null;
    try { sel = await CW.ppt.getSelectedChart(); } catch (e) { return; }
    S.selIsChart = !!sel;
    if (!sel) { S.ignoreId = null; return; }
    if (S.ignoreId && sel.chartId === S.ignoreId) return;
    S.ignoreId = null;
    if (S.bound && sel.chartId === S.bound.chartId) {
      S.bound.shapeId = sel.shapeId; S.bound.slideId = sel.slideId; S.bound.frame = sel.frame; S.bound.box = sel.box;
    } else {
      await flushPush();
      if (S.busy) return;
      loadSpec(sel.spec, refOf(sel));
      toast('Diagramm geladen: ' + CW.TYPES[sel.spec.type].label);
    }
    if (sel.stale && autoAllowed()) push();
  }

  async function pollResize() {
    if (!S.inOffice || !S.bound || !S.selIsChart || S.busy || document.hidden) return;
    let p;
    try { p = await CW.ppt.peekSelection(); } catch (e) { return; }
    if (!p || !S.bound || p.shapeId !== S.bound.shapeId || S.busy) return;
    const b = S.bound.box || p.frame;
    const resized = Math.abs(p.frame.width - b.width) > 0.6 || Math.abs(p.frame.height - b.height) > 0.6;
    if (!resized) {
      // nur verschoben: Rahmen mitverschieben
      if (S.bound.frame) { S.bound.frame = Object.assign({}, S.bound.frame, { left: S.bound.frame.left + p.frame.left - b.left, top: S.bound.frame.top + p.frame.top - b.top }); }
      S.bound.box = p.frame;
      return;
    }
    if (!autoAllowed()) return;
    push();
  }

  async function onOfficeReady(info) {
    const isPpt = !!(info && window.Office && info.host === Office.HostType.PowerPoint);
    S.inOffice = isPpt && CW.ppt.available();
    if (isPpt && !S.inOffice) {
      document.querySelector('main').prepend(el('div', { class: 'fatal', text: 'Diese PowerPoint-Version ist zu alt für Chartwerk (benötigt mindestens Version 16.62). Bitte PowerPoint aktualisieren: Hilfe > Nach Updates suchen.' }));
    }
    const c = CW.ppt.caps();
    $('#versionInfo').textContent = 'Chartwerk ' + CW.VERSION + ' · PowerPoint-Schnittstelle: ' +
      (c.v110 ? '1.10+' : c.group ? '1.8' : c.sel ? '1.5' : c.base ? '1.4' : 'nicht verfügbar') +
      (S.inOffice && !c.group ? ' (Gruppieren erst ab PowerPoint 16.96)' : '');
    renderStatus(); renderFooter();
    if (!S.inOffice) return;
    try { S.theme = await CW.ppt.currentThemeColors(); renderPreview(); } catch (e) { /* Standardfarben */ }
    try { Office.context.document.addHandlerAsync(Office.EventType.DocumentSelectionChanged, onSelectionEvent); } catch (e) { /* ohne Auswahl-Erkennung */ }
    onSelection();
    setInterval(pollResize, 1500);
  }

  /* ================================================================ */
  /* Start                                                             */
  /* ================================================================ */

  function bindUI() {
    const g = $('#grid');
    g.addEventListener('focusin', onGridFocus);
    g.addEventListener('input', onGridInput);
    g.addEventListener('keydown', onGridKey);
    g.addEventListener('paste', onGridPaste);
    g.addEventListener('copy', onGridCopy);
    g.addEventListener('mousedown', onGridMouseDown);
    g.addEventListener('mouseover', onGridMouseOver);
    g.addEventListener('click', function (e) {
      const inp = e.target;
      if (inp.tagName === 'INPUT' && !S.editing && !e.shiftKey && rangeSize() <= 1) inp.select();
    });
    g.addEventListener('dblclick', function (e) {
      const inp = e.target;
      if (inp.tagName !== 'INPUT' || inp.readOnly) return;
      S.editing = true;
      try { inp.setSelectionRange(inp.value.length, inp.value.length); } catch (x) { /* egal */ }
    });
    document.addEventListener('mouseup', function () { S.dragging = false; });
    $('#tools').addEventListener('click', function (e) { const b = e.target.closest('button'); if (b) gridAction(b.dataset.act); });
    $('#file').addEventListener('change', onFile);
    ['cagr', 'diff', 'level'].forEach(function (k) { $('#add-' + k).addEventListener('click', function () { addDeco(k); }); });
    $('#live').addEventListener('change', function (e) { S.live = e.target.checked; if (S.live && S.bound) schedulePush(); });
    $('#btnApply').addEventListener('click', function () { if (S.bound) { clearTimeout(pushTimer); push(); } else insertNew(); });
    $('#btnCopy').addEventListener('click', function () { insertNew(); });
    $('#btnUnbind').addEventListener('click', function () {
      S.ignoreId = S.bound ? S.bound.chartId : null;
      S.bound = null; S.selIsChart = false;
      renderStatus(); renderFooter(); renderPreview();
      toast('Verknüpfung gelöst. „In Folie einfügen“ legt ein neues Diagramm an.');
    });
  }

  function start() {
    bindUI();
    const p = new URLSearchParams(location.search);
    const t = p.get('new');
    loadSpec(CW.TYPES[t] ? CW.sample(t) : (readLast() || CW.sample('stacked')));
    if (window.Office && typeof Office.onReady === 'function') {
      Office.onReady().then(onOfficeReady, function () { onOfficeReady(null); });
    } else {
      onOfficeReady(null);
    }
  }

  window.ChartwerkPane = { state: S, currentSpec: currentSpec, loadSpec: loadSpec, applyTable: applyTable, parseTable: parseTable };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
