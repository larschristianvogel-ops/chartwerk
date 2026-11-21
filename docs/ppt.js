/*! Chartwerk PowerPoint-Anbindung (Office.js, PowerPointApi 1.4 und neuer) */
(function (root) {
  'use strict';
  const CW = root.Chartwerk = root.Chartwerk || {};

  const TAG_SPEC = 'CHARTWERK';        // Anzahl der Datenteile
  const TAG_ID = 'CHARTWERK_ID';       // Diagramm-ID (an jeder Form)
  const TAG_GEOM = 'CHARTWERK_GEOM';   // Rahmen und Gruppengröße beim letzten Layout
  const CHUNK = 900;
  const VALIGN = { t: 'Top', m: 'Middle', b: 'Bottom' };
  const HALIGN = { l: 'Left', c: 'Center', r: 'Right' };

  function isSet(v) {
    try {
      return !!(root.Office && Office.context && Office.context.requirements &&
        Office.context.requirements.isSetSupported('PowerPointApi', v));
    } catch (e) { return false; }
  }
  function caps() {
    return { base: isSet('1.4'), sel: isSet('1.5'), group: isSet('1.8'), v110: isSet('1.10') };
  }
  function available() { return !!(root.PowerPoint && root.Office && caps().base); }

  function newId() {
    return (Date.now().toString(36).slice(-4) + Math.random().toString(36).slice(2, 6)).toLowerCase();
  }
  function marker(id) { return '[' + id + ']'; }
  function chartName(spec, id) { return 'Chartwerk ' + ((CW.TYPES[spec.type] || {}).label || 'Diagramm') + ' ' + marker(id); }
  function box(s) { return { left: s.left, top: s.top, width: s.width, height: s.height }; }
  /* PowerPoint ersetzt 0 in Positions-/Größenangaben beim Anlegen durch Standardwerte (72 pt). */
  const EPS = 0.05;
  function nz(v) { return Math.abs(v) < EPS ? EPS : v; }
  function r1(v) { return Math.round(v * 10) / 10; }
  function geomTag(frame, gbox) {
    return JSON.stringify({ f: [r1(frame.left), r1(frame.top), r1(frame.width), r1(frame.height)], g: [r1(gbox.left), r1(gbox.top), r1(gbox.width), r1(gbox.height)] });
  }
  function readGeom(map) {
    try {
      const o = JSON.parse(map[TAG_GEOM] || 'null');
      if (!o || !Array.isArray(o.f) || !Array.isArray(o.g) || !(o.g[2] > 0) || !(o.g[3] > 0)) return null;
      return o;
    } catch (e) { return null; }
  }
  /** Rahmen des Diagramms aus der aktuellen Gruppengröße (verschoben oder skaliert vom Nutzer). */
  function frameFor(geom, cur) {
    if (!geom) return { left: cur.left, top: cur.top, width: cur.width, height: cur.height };
    const sx = cur.width / geom.g[2], sy = cur.height / geom.g[3];
    return {
      left: cur.left + (geom.f[0] - geom.g[0]) * sx, top: cur.top + (geom.f[1] - geom.g[1]) * sy,
      width: geom.f[2] * sx, height: geom.f[3] * sy,
    };
  }
  function isResized(geom, cur) {
    if (!geom) return false;
    return Math.abs(cur.width - geom.g[2]) > 0.6 || Math.abs(cur.height - geom.g[3]) > 0.6;
  }

  function tagMap(items) {
    const m = {};
    (items || []).forEach(function (t) { m[String(t.key).toUpperCase()] = t.value; });
    return m;
  }
  function writeSpecTags(shape, json, chartId) {
    const parts = [];
    for (let i = 0; i < json.length; i += CHUNK) parts.push(json.slice(i, i + CHUNK));
    shape.tags.add(TAG_ID, chartId);
    shape.tags.add(TAG_SPEC, String(parts.length));
    parts.forEach(function (p, i) { shape.tags.add(TAG_SPEC + '_' + i, p); });
  }
  function readSpec(map) {
    const n = parseInt(map[TAG_SPEC], 10);
    if (!(n > 0)) return null;
    let json = '';
    for (let i = 0; i < n; i++) {
      if (map[TAG_SPEC + '_' + i] === undefined) return null;
      json += map[TAG_SPEC + '_' + i];
    }
    try { return CW.normalizeSpec(JSON.parse(json)); } catch (e) { return null; }
  }

  /* ---------------- Formen anlegen ---------------- */

  function shapeBox(p) {
    return { left: nz(p.x), top: nz(p.y), width: Math.max(p.w, 0.5), height: Math.max(p.h, 0.5) };
  }
  function styleText(tf, p) {
    tf.autoSizeSetting = 'AutoSizeNone';
    tf.wordWrap = !!p.wrap;
    tf.leftMargin = 0; tf.rightMargin = 0; tf.topMargin = 0; tf.bottomMargin = 0;
    tf.verticalAlignment = VALIGN[p.valign] || 'Middle';
    const tr = tf.textRange;
    tr.font.size = p.size;
    tr.font.color = p.color;
    tr.font.bold = !!p.bold;
    tr.paragraphFormat.horizontalAlignment = HALIGN[p.align] || 'Center';
  }

  function addPrim(shapes, p, cp) {
    let s = null;
    switch (p.t) {
      case 'frame':
        s = shapes.addGeometricShape('Rectangle', shapeBox(p));
        s.fill.clear();
        s.lineFormat.visible = false;
        break;
      case 'rect':
        s = shapes.addGeometricShape('Rectangle', shapeBox(p));
        if (p.fill) s.fill.setSolidColor(p.fill); else s.fill.clear();
        if (p.stroke) { s.lineFormat.visible = true; s.lineFormat.color = p.stroke; s.lineFormat.weight = p.sw || 0.75; }
        else s.lineFormat.visible = false;
        break;
      case 'ellipse':
        s = shapes.addGeometricShape('Ellipse', shapeBox(p));
        s.fill.setSolidColor(p.fill);
        if (p.stroke) { s.lineFormat.visible = true; s.lineFormat.color = p.stroke; s.lineFormat.weight = p.sw || 0.75; }
        else s.lineFormat.visible = false;
        break;
      case 'tri': {
        const vertical = p.dir === 'up' || p.dir === 'down';
        if (vertical) {
          s = shapes.addGeometricShape(p.dir === 'down' ? 'FlowChartMerge' : 'Triangle', shapeBox(p));
        } else if (cp.v110) {
          const cx = p.x + p.w / 2, cy = p.y + p.h / 2;
          s = shapes.addGeometricShape('Triangle', { left: cx - p.h / 2, top: cy - p.w / 2, width: p.h, height: p.w });
          s.rotation = p.dir === 'right' ? 90 : 270;
        } else {
          s = shapes.addGeometricShape(p.dir === 'left' ? 'LeftArrow' : 'RightArrow', shapeBox(p));
        }
        s.fill.setSolidColor(p.fill);
        s.lineFormat.visible = false;
        break;
      }
      case 'line': {
        const dx = p.x2 - p.x1, dy = p.y2 - p.y1;
        if (Math.abs(dx) < 0.01 && Math.abs(dy) < 0.01) return null;
        const b = { left: nz(Math.min(p.x1, p.x2)), top: nz(Math.min(p.y1, p.y2)), width: nz(Math.abs(dx)), height: nz(Math.abs(dy)) };
        // Von links unten nach rechts oben gibt es nur als Form "LineInverse".
        s = (dx * dy < 0) ? shapes.addGeometricShape('LineInverse', b) : shapes.addLine('Straight', b);
        s.lineFormat.visible = true;
        s.lineFormat.color = p.stroke;
        s.lineFormat.weight = p.sw;
        s.lineFormat.dashStyle = p.dash ? 'Dash' : 'Solid';
        break;
      }
      case 'text':
        if (!String(p.text).length) return null;
        s = shapes.addTextBox(p.text, shapeBox(p));
        styleText(s.textFrame, p);
        s.left = p.x; s.top = p.y; s.width = Math.max(p.w, 0.5); s.height = Math.max(p.h, 0.5);
        break;
      case 'bubble':
        s = shapes.addGeometricShape('RoundRectangle', shapeBox(p));
        s.fill.setSolidColor(p.fill || '#FFFFFF');
        s.lineFormat.visible = true;
        s.lineFormat.color = p.stroke;
        s.lineFormat.weight = p.sw || 0.75;
        s.textFrame.textRange.text = p.text;
        styleText(s.textFrame, { size: p.size, color: p.color, bold: false, align: 'c', valign: 'm', wrap: false });
        break;
      default:
        return null;
    }
    if (p.name) s.name = p.name;
    return s;
  }

  /* ---------------- Folie, Größe, Farben ---------------- */

  async function selectedSlides(ctx) {
    if (!caps().sel) return [];
    try {
      const ss = ctx.presentation.getSelectedSlides();
      ss.load('items/id');
      await ctx.sync();
      return ss.items;
    } catch (e) { return []; }
  }

  async function currentSlide(ctx) {
    const sel = await selectedSlides(ctx);
    if (sel.length) return sel[0];
    const all = ctx.presentation.slides;
    all.load('items/id');
    await ctx.sync();
    return all.items[0] || null;
  }

  async function slideSize(ctx, slide) {
    if (caps().v110) {
      try {
        const ps = ctx.presentation.pageSetup;
        ps.load('slideWidth,slideHeight');
        await ctx.sync();
        if (ps.slideWidth > 0 && ps.slideHeight > 0) return { w: ps.slideWidth, h: ps.slideHeight, exact: true };
      } catch (e) { /* ältere Version */ }
    }
    // Schätzung über die Platzhalter des Layouts (symmetrische Ränder angenommen)
    let minL = Infinity, maxR = 0;
    try {
      const ls = slide.layout.shapes;
      ls.load('items/left,items/width');
      await ctx.sync();
      ls.items.forEach(function (s) { minL = Math.min(minL, s.left); maxR = Math.max(maxR, s.left + s.width); });
    } catch (e) { /* egal */ }
    if (maxR > 300 && isFinite(minL)) {
      const w = Math.max(600, Math.min(1500, maxR + Math.max(0, minL)));
      return { w: w, h: w <= 760 ? w * 0.75 : w * 0.5625, exact: false };
    }
    return { w: 960, h: 540, exact: false };
  }

  async function defaultFrame(ctx, slide) {
    const size = await slideSize(ctx, slide);
    const W = size.w, H = size.h;
    let f = { left: W * 0.07, top: H * 0.24, width: W * 0.86, height: H * 0.64 };
    try {
      const sc = slide.shapes;
      sc.load('items/name,items/type,items/left,items/top,items/width,items/height');
      await ctx.sync();
      const title = sc.items.find(function (s) {
        return /^(title|titel|überschrift|ueberschrift)/i.test(s.name || '') && s.top < H * 0.4 && s.width > W * 0.4;
      });
      if (title) {
        const top = title.top + title.height + H * 0.04;
        if (top < H * 0.55) f = { left: title.left, top: top, width: title.width, height: Math.max(H * 0.3, H * 0.9 - top) };
      }
    } catch (e) { /* Standardrahmen */ }
    return f;
  }

  async function themeColors(ctx, slide) {
    if (!caps().v110 || !slide) return null;
    try {
      const sch = slide.themeColorScheme;
      const res = ['Accent1', 'Accent2', 'Accent3', 'Accent4', 'Accent5', 'Accent6'].map(function (k) { return sch.getThemeColor(k); });
      await ctx.sync();
      const out = res.map(function (r) { return CW.normHex(String(r.value || '')); }).filter(Boolean);
      return out.length === 6 ? out : null;
    } catch (e) { return null; }
  }

  /* ---------------- Zeichnen ---------------- */

  async function render(ctx, slide, specIn, frame, theme, chartId) {
    const cp = caps();
    const res = CW.layout(specIn, frame, { theme: theme });
    const json = JSON.stringify(CW.compactSpec(res.spec));
    const shapes = slide.shapes;
    const created = [];
    let frameShape = null;
    res.prims.forEach(function (p) {
      const s = addPrim(shapes, p, cp);
      if (!s) return;
      if (p.t === 'frame') { frameShape = s; s.name = 'Chartwerk Rahmen ' + marker(chartId); }
      created.push(s);
    });
    created.forEach(function (s) { if (s !== frameShape) s.tags.add(TAG_ID, chartId); s.load('id'); });
    writeSpecTags(frameShape, json, chartId);
    frameShape.load('left,top,width,height');
    await ctx.sync();

    const ids = created.map(function (s) { return s.id; });
    let group = null;
    if (cp.group && ids.length > 1) {
      try {
        const g = shapes.addGroup(ids);
        g.name = chartName(res.spec, chartId);
        writeSpecTags(g, json, chartId);
        g.load('id,left,top,width,height');
        await ctx.sync();
        group = g;
      } catch (e) {
        console.warn('Chartwerk: Gruppieren nicht möglich', e);
      }
    }
    const container = group || frameShape;
    const gbox = box(container);
    CW.ppt._last = { frame: [frame.left, frame.top, frame.width, frame.height].map(r1), gboxAtCreate: [gbox.left, gbox.top, gbox.width, gbox.height].map(r1), frameShape: [frameShape.left, frameShape.top, frameShape.width, frameShape.height].map(r1) };
    container.tags.add(TAG_GEOM, geomTag(frame, gbox));
    if (group) frameShape.tags.add(TAG_GEOM, geomTag(frame, gbox));
    await ctx.sync();
    if (cp.sel) {
      try { slide.setSelectedShapes(group ? [group.id] : ids); await ctx.sync(); } catch (e) { /* Auswahl ist optional */ }
    }
    return {
      chartId: chartId, slideId: slide.id, shapeId: container.id,
      grouped: !!group, frame: frame, box: gbox, warnings: res.warnings, spec: res.spec,
    };
  }

  /* ---------------- Diagramm finden ---------------- */

  async function locateOnSlide(ctx, slide, chartId, shapeId) {
    const sc = slide.shapes;
    sc.load('items/id,items/name,items/type,items/left,items/top,items/width,items/height');
    await ctx.sync();
    const mk = marker(chartId);
    const named = function (s) { return (s.name || '').indexOf(mk) >= 0; };
    let cont = (shapeId && sc.items.find(function (s) { return s.id === shapeId && named(s); })) ||
      sc.items.find(function (s) { return s.type === 'Group' && named(s); });
    let members = cont && cont.type === 'Group' ? [cont] : null;
    if (!members) {
      const idTags = sc.items.map(function (s) { const t = s.tags.getItemOrNullObject(TAG_ID); t.load('value'); return t; });
      await ctx.sync();
      members = sc.items.filter(function (s, k) { return !idTags[k].isNullObject && idTags[k].value === chartId; });
      if (!members.length) return null;
      cont = members.find(function (s) { return s.type === 'Group'; }) ||
        members.find(function (s) { return /^Chartwerk Rahmen/.test(s.name || ''); }) || members[0];
      if (cont.type === 'Group') members = [cont];
    }
    const tags = cont.tags;
    tags.load('items/key,items/value');
    await ctx.sync();
    const map = tagMap(tags.items);
    const geom = readGeom(map), cur = box(cont);
    return { slide: slide, container: cont, members: members, spec: readSpec(map), frame: frameFor(geom, cur), box: cur, stale: isResized(geom, cur) };
  }

  async function candidateSlides(ctx, slideId) {
    const out = [];
    const add = function (s) { if (s && !out.some(function (o) { return o.id === s.id; })) out.push(s); };
    const all = ctx.presentation.slides;
    all.load('items/id');
    await ctx.sync();
    if (slideId) add(all.items.find(function (s) { return s.id === slideId; }));
    (await selectedSlides(ctx)).forEach(add);
    all.items.forEach(add);
    return out;
  }

  /* ---------------- Öffentliche Funktionen ---------------- */

  /** Neues Diagramm auf der aktuellen Folie einfügen. */
  async function insertChart(spec, opts) {
    opts = opts || {};
    return PowerPoint.run(async function (ctx) {
      const slide = await currentSlide(ctx);
      if (!slide) throw new Error('Keine Folie gefunden. Bitte zuerst eine Folie anlegen.');
      const frame = opts.frame || await defaultFrame(ctx, slide);
      const theme = await themeColors(ctx, slide);
      return render(ctx, slide, spec, frame, theme, newId());
    });
  }

  /** Das ausgewählte Chartwerk-Diagramm lesen (oder null). */
  async function getSelectedChart() {
    if (!caps().sel) return null;
    return PowerPoint.run(async function (ctx) {
      const shapes = ctx.presentation.getSelectedShapes();
      shapes.load('items/id,items/name,items/type,items/left,items/top,items/width,items/height');
      const slides = ctx.presentation.getSelectedSlides();
      slides.load('items/id');
      await ctx.sync();
      if (!shapes.items.length || !slides.items.length) return null;
      const slide = slides.items[0];
      const tagSets = shapes.items.map(function (s) { const t = s.tags; t.load('items/key,items/value'); return t; });
      await ctx.sync();
      for (let k = 0; k < shapes.items.length; k++) {
        const map = tagMap(tagSets[k].items);
        const spec = readSpec(map);
        if (spec && map[TAG_ID]) {
          const s = shapes.items[k];
          const geom = readGeom(map), cur = box(s);
          return { chartId: map[TAG_ID], slideId: slide.id, shapeId: s.id, spec: spec, frame: frameFor(geom, cur), box: cur, stale: isResized(geom, cur) };
        }
      }
      for (let k = 0; k < shapes.items.length; k++) {
        const id = tagMap(tagSets[k].items)[TAG_ID];
        if (!id) continue;
        const loc = await locateOnSlide(ctx, slide, id, null);
        if (loc && loc.spec) return { chartId: id, slideId: slide.id, shapeId: loc.container.id, spec: loc.spec, frame: loc.frame, box: loc.box, stale: loc.stale };
      }
      return null;
    });
  }

  /** Nur Größe/ID der Auswahl (schnell, für die Erkennung von Größenänderungen). */
  async function peekSelection() {
    if (!caps().sel) return null;
    return PowerPoint.run(async function (ctx) {
      const shapes = ctx.presentation.getSelectedShapes();
      shapes.load('items/id,items/left,items/top,items/width,items/height');
      await ctx.sync();
      if (shapes.items.length !== 1) return null;
      return { shapeId: shapes.items[0].id, frame: box(shapes.items[0]) };
    });
  }

  /** Diagramm neu zeichnen (gleiche Stelle, optional neuer Rahmen). */
  async function updateChart(ref, spec, opts) {
    opts = opts || {};
    return PowerPoint.run(async function (ctx) {
      const slides = await candidateSlides(ctx, ref.slideId);
      for (let i = 0; i < slides.length; i++) {
        const loc = await locateOnSlide(ctx, slides[i], ref.chartId, ref.shapeId);
        if (!loc) continue;
        const frame = opts.frame || loc.frame;
        let z = null;
        if (caps().group) {
          try { loc.container.load('zOrderPosition'); await ctx.sync(); z = loc.container.zOrderPosition; } catch (e) { z = null; }
        }
        loc.members.forEach(function (s) { s.delete(); });
        await ctx.sync();
        const theme = await themeColors(ctx, loc.slide);
        const r = await render(ctx, loc.slide, spec || loc.spec, frame, theme, newId());
        if (z !== null && r.grouped) {
          try {
            const sc = loc.slide.shapes;
            sc.load('items/id');
            await ctx.sync();
            const steps = sc.items.length - 1 - z;
            if (steps > 0 && steps < 200) {
              const g = sc.getItem(r.shapeId);
              for (let k = 0; k < steps; k++) g.setZOrder('SendBackward');
              await ctx.sync();
            }
          } catch (e) { /* Ebene ist nur Kosmetik */ }
        }
        return r;
      }
      throw new Error('Das Diagramm wurde nicht gefunden (gelöscht?).');
    });
  }

  /** Ausgewähltes Diagramm an seine aktuelle Größe anpassen. */
  async function refreshSelected() {
    const sel = await getSelectedChart();
    if (!sel) return { ok: false, message: 'Bitte zuerst ein Chartwerk-Diagramm auswählen.' };
    await updateChart(sel, sel.spec);
    return { ok: true };
  }

  /** Pfeil am ausgewählten Diagramm ein- oder ausschalten (Menüband). */
  async function toggleDecoration(kind) {
    const sel = await getSelectedChart();
    if (!sel) return { ok: false, message: 'Bitte zuerst ein Chartwerk-Diagramm auswählen.' };
    const spec = sel.spec;
    const n = spec.categories.length;
    if ((CW.TYPES[spec.type].deco || []).indexOf(kind) < 0) {
      return { ok: false, message: CW.DECO_LABELS[kind] + ' gibt es für „' + CW.TYPES[spec.type].label + '“ nicht.' };
    }
    if (n < 2) return { ok: false, message: 'Dafür braucht das Diagramm mindestens zwei Kategorien.' };
    const d = kind === 'diff' ? { kind: kind, from: n - 2, to: n - 1 } : { kind: kind, from: 0, to: n - 1 };
    if (spec.type === 'waterfall' && kind === 'diff') { d.from = 0; d.to = n - 1; }
    const idx = spec.decorations.findIndex(function (x) { return x.kind === d.kind && x.from === d.from && x.to === d.to; });
    if (idx >= 0) spec.decorations.splice(idx, 1); else spec.decorations.push(d);
    await updateChart(sel, spec);
    return { ok: true };
  }

  async function currentThemeColors() {
    if (!available()) return null;
    return PowerPoint.run(async function (ctx) { return themeColors(ctx, await currentSlide(ctx)); });
  }

  /** Diagnose: Werte der Auswahl so, wie PowerPoint sie meldet. */
  async function diagnoseSelection() {
    return PowerPoint.run(async function (ctx) {
      const out = { caps: caps() };
      try { const ps = ctx.presentation.pageSetup; ps.load('slideWidth,slideHeight'); await ctx.sync(); out.page = [ps.slideWidth, ps.slideHeight]; } catch (e) { out.page = 'n/a'; }
      const shapes = ctx.presentation.getSelectedShapes();
      shapes.load('items/id,items/name,items/type,items/left,items/top,items/width,items/height');
      await ctx.sync();
      out.sel = [];
      for (let i = 0; i < Math.min(2, shapes.items.length); i++) {
        const s = shapes.items[i];
        const d = { id: s.id, name: s.name, type: s.type, box: [s.left, s.top, s.width, s.height].map(r1) };
        const t = s.tags; t.load('items/key,items/value'); await ctx.sync();
        d.tags = {};
        t.items.forEach(function (x) { if (!/^CHARTWERK_\d+$/.test(x.key)) d.tags[x.key] = x.value; });
        if (s.type === 'Group' && caps().group) {
          try {
            const kids = s.group.shapes;
            kids.load('items/name,items/type,items/left,items/top,items/width,items/height');
            await ctx.sync();
            d.kids = kids.items.length;
            const fr = kids.items.find(function (k) { return /^Chartwerk Rahmen/.test(k.name || ''); });
            d.frameRect = fr ? [fr.left, fr.top, fr.width, fr.height].map(r1) : null;
            let l = Infinity, tp = Infinity, r = -Infinity, b = -Infinity;
            kids.items.forEach(function (k) { l = Math.min(l, k.left); tp = Math.min(tp, k.top); r = Math.max(r, k.left + k.width); b = Math.max(b, k.top + k.height); });
            d.kidsBox = [l, tp, r - l, b - tp].map(r1);
            d.outliers = kids.items.filter(function (k) {
              return fr && (k.left < fr.left - 0.5 || k.top < fr.top - 0.5 || k.left + k.width > fr.left + fr.width + 0.5 || k.top + k.height > fr.top + fr.height + 0.5);
            }).slice(0, 8).map(function (k) { return k.name + ' ' + [k.left, k.top, k.width, k.height].map(r1).join('/'); });
          } catch (e) { d.kidsErr = String(e.message || e); }
        }
        out.sel.push(d);
      }
      out.lastRender = CW.ppt._last || null;
      return out;
    });
  }

  CW.ppt = {
    caps: caps, available: available, insertChart: insertChart, getSelectedChart: getSelectedChart,
    peekSelection: peekSelection, updateChart: updateChart, refreshSelected: refreshSelected,
    toggleDecoration: toggleDecoration, currentThemeColors: currentThemeColors, diagnoseSelection: diagnoseSelection,
    _addPrim: addPrim, _readSpec: readSpec, _tagMap: tagMap,
  };
})(typeof self !== 'undefined' ? self : this);
