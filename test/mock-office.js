/* Strenger Nachbau der Office.js-PowerPoint-API für Tests (Laden erst nach sync verfügbar). */
(function () {
  'use strict';
  const MAXVER = (window.__CW_MOCK_VERSION || '1.10');
  const verNum = (v) => { const p = String(v).split('.'); return +p[0] * 1000 + (+p[1] || 0); };

  /* ---------------- Datenmodell ---------------- */
  let nextId = 300;
  const model = {
    pageSetup: { slideWidth: 960, slideHeight: 540 },
    theme: ['#E2001A', '#7B7B7B', '#00508C', '#F39200', '#95C11F', '#5B3B8C'],
    slides: [
      { id: '256#', shapes: [
        { id: '2', name: 'Titel 1', type: 'Placeholder', left: 40, top: 30, width: 880, height: 60, tags: {}, text: 'Umsatzentwicklung' },
      ], layoutShapes: [{ left: 40, width: 880 }] },
      { id: '257#', shapes: [], layoutShapes: [{ left: 40, width: 880 }] },
    ],
    selection: { slideId: '256#', shapeIds: [] },
    handlers: [],
    log: [],
    errors: [],
  };
  window.__mock = model;

  const GEOM_OK = new Set(['Rectangle', 'RoundRectangle', 'Ellipse', 'Triangle', 'FlowChartMerge', 'LineInverse', 'LeftArrow', 'RightArrow']);

  function findSlide(id) { return model.slides.find((s) => s.id === id); }
  function walk(shapes, fn) { shapes.forEach((s) => { fn(s); if (s.children) walk(s.children, fn); }); }
  function findShapeAnywhere(id) {
    let hit = null;
    model.slides.forEach((sl) => walk(sl.shapes, (s) => { if (s.id === id) hit = { slide: sl, shape: s }; }));
    return hit;
  }
  function parentList(sl, sh) {
    if (sl.shapes.includes(sh)) return sl.shapes;
    let res = null;
    walk(sl.shapes, (s) => { if (s.children && s.children.includes(sh)) res = s.children; });
    return res;
  }
  function fireSelection() {
    setTimeout(() => model.handlers.forEach((h) => { try { h({ type: 'documentSelectionChanged' }); } catch (e) { console.error(e); } }), 0);
  }
  model.select = function (slideId, ids) { model.selection = { slideId, shapeIds: ids.slice() }; fireSelection(); };

  /* ---------------- Proxy-Grundlagen ---------------- */
  function err(msg) { const e = new Error(msg); model.errors.push(msg); return e; }

  function makeCtx() {
    const ctx = { _reg: [], presentation: null, trackedObjects: { add() {}, remove() {} } };
    ctx.sync = function () {
      return new Promise((resolve) => setTimeout(() => {
        ctx._reg.forEach((p) => p._commit());
        resolve();
      }, 1));
    };
    ctx.presentation = presentationProxy(ctx);
    return ctx;
  }

  function base(ctx, loadables, getters) {
    const o = { _pending: new Set(), _loaded: new Set(), _sub: {} };
    o.load = function (spec) {
      const parts = Array.isArray(spec) ? spec : String(spec || '').split(',').map((x) => x.trim()).filter(Boolean);
      parts.forEach((p) => {
        const [head, ...rest] = p.split('/');
        o._pending.add(head);
        if (rest.length) { (o._sub[head] = o._sub[head] || new Set()).add(rest.join('/')); }
      });
      return o;
    };
    o._commit = function () { o._pending.forEach((p) => o._loaded.add(p)); o._commitHook && o._commitHook(); o._pending.clear(); };
    ctx._reg.push(o);
    (loadables || []).forEach((name) => {
      Object.defineProperty(o, name, {
        get() { if (!o._loaded.has(name)) throw err('PropertyNotLoaded: ' + name); return getters[name](); },
        set(v) { if (getters['set_' + name]) getters['set_' + name](v); else throw err('ReadOnly: ' + name); },
        configurable: true,
      });
    });
    return o;
  }

  function collection(ctx, getList, makeItem) {
    const o = base(ctx, [], {});
    let snapshot = null;
    o._commitHook = function () {
      if (o._loaded.has('items')) {
        const sub = o._sub.items ? Array.from(o._sub.items) : [];
        snapshot = getList().map((m) => { const it = makeItem(m); sub.forEach((p) => it.load(p)); it._commit(); return it; });
      }
    };
    Object.defineProperty(o, 'items', { get() { if (!snapshot) throw err('PropertyNotLoaded: items'); return snapshot; } });
    return o;
  }

  /* ---------------- Präsentation ---------------- */
  function presentationProxy(ctx) {
    const p = base(ctx, [], {});
    p.slides = slideCollection(ctx);
    p.getSelectedSlides = function () {
      if (verNum(MAXVER) < verNum('1.5')) throw err('ApiNotFound getSelectedSlides');
      return collection(ctx, () => [findSlide(model.selection.slideId)].filter(Boolean), (m) => slideProxy(ctx, m));
    };
    p.getSelectedShapes = function () {
      if (verNum(MAXVER) < verNum('1.5')) throw err('ApiNotFound getSelectedShapes');
      return collection(ctx, () => model.selection.shapeIds.map((id) => (findShapeAnywhere(id) || {}).shape).filter(Boolean), (m) => shapeProxy(ctx, m));
    };
    Object.defineProperty(p, 'pageSetup', {
      get() {
        if (verNum(MAXVER) < verNum('1.10')) throw err('ApiNotFound pageSetup');
        return base(ctx, ['slideWidth', 'slideHeight'], { slideWidth: () => model.pageSetup.slideWidth, slideHeight: () => model.pageSetup.slideHeight });
      },
    });
    return p;
  }

  function slideCollection(ctx) {
    const c = collection(ctx, () => model.slides, (m) => slideProxy(ctx, m));
    c.getItemOrNullObject = function (id) {
      const m = findSlide(id);
      const s = m ? slideProxy(ctx, m) : base(ctx, [], {});
      s.isNullObject = !m;
      return s;
    };
    c.getItemAt = function (i) { return slideProxy(ctx, model.slides[i]); };
    return c;
  }

  function slideProxy(ctx, m) {
    const s = base(ctx, ['id'], { id: () => m.id });
    s.shapes = shapeCollection(ctx, m);
    s.setSelectedShapes = function (ids) {
      ids.forEach((id) => { if (!findShapeAnywhere(id)) throw err('setSelectedShapes: unknown ' + id); });
      model.log.push(['select', ids.slice()]);
      model.select(m.id, ids);
    };
    s.layout = { shapes: collection(ctx, () => m.layoutShapes || [], (x) => base(ctx, ['left', 'width'], { left: () => x.left, width: () => x.width })) };
    Object.defineProperty(s, 'themeColorScheme', {
      get() {
        if (verNum(MAXVER) < verNum('1.10')) throw err('ApiNotFound themeColorScheme');
        return {
          getThemeColor(name) {
            const k = ['Accent1', 'Accent2', 'Accent3', 'Accent4', 'Accent5', 'Accent6'].indexOf(name);
            if (k < 0) throw err('bad theme color ' + name);
            const r = { _v: model.theme[k].replace('#', '') };
            const proxy = base(ctx, [], {});
            proxy._commitHook = () => { r.ready = true; };
            Object.defineProperty(r, 'value', { get() { if (!r.ready) throw err('ClientResult before sync'); return r._v; } });
            return r;
          },
        };
      },
    });
    return s;
  }

  function shapeCollection(ctx, slide) {
    const c = collection(ctx, () => slide.shapes, (m) => shapeProxy(ctx, m));
    const add = (shape) => { slide.shapes.push(shape); return shapeProxy(ctx, shape); };
    const checkOpts = (o) => {
      ['left', 'top', 'width', 'height'].forEach((k) => {
        if (typeof o[k] !== 'number' || !isFinite(o[k])) throw err('bad option ' + k + '=' + o[k]);
        if ((k === 'width' || k === 'height') && o[k] < 0) throw err('negative ' + k);
      });
    };
    c.addGeometricShape = function (type, o) {
      if (verNum(MAXVER) < verNum('1.4')) throw err('ApiNotFound addGeometricShape');
      if (!GEOM_OK.has(type)) throw err('unknown geometric type ' + type);
      checkOpts(o);
      return add({ id: String(nextId++), name: type + ' ' + nextId, type: 'GeometricShape', geom: type, left: o.left, top: o.top, width: o.width, height: o.height, tags: {}, fill: { color: '#4472C4' }, line: { visible: true, color: '#2F528F', weight: 1, dash: 'Solid' }, text: '', tf: defaultTf(), rotation: 0 });
    };
    c.addLine = function (type, o) {
      if (type !== 'Straight') throw err('connector ' + type);
      checkOpts(o);
      return add({ id: String(nextId++), name: 'Line ' + nextId, type: 'Line', geom: 'Line', left: o.left, top: o.top, width: o.width, height: o.height, tags: {}, line: { visible: true, color: '#4472C4', weight: 0.75, dash: 'Solid' } });
    };
    c.addTextBox = function (text, o) {
      checkOpts(o);
      return add({ id: String(nextId++), name: 'TextBox ' + nextId, type: 'TextBox', geom: 'Rectangle', left: o.left, top: o.top, width: o.width, height: o.height + 7, tags: {}, fill: null, line: { visible: false }, text: String(text), tf: defaultTf(true) });
    };
    c.addGroup = function (vals) {
      if (verNum(MAXVER) < verNum('1.8')) throw err('ApiNotFound addGroup');
      const ids = vals.map((v) => (typeof v === 'string' ? v : v.id));
      const kids = ids.map((id) => {
        const sh = slide.shapes.find((s) => s.id === id);
        if (!sh) throw err('addGroup: shape not top-level ' + id);
        return sh;
      });
      slide.shapes = slide.shapes.filter((s) => !ids.includes(s.id));
      const g = { id: String(nextId++), name: 'Gruppe ' + nextId, type: 'Group', children: kids, tags: {} };
      bboxGroup(g);
      slide.shapes.push(g);
      return shapeProxy(ctx, g);
    };
    c.getItem = function (id) { const m = slide.shapes.find((s) => s.id === id); if (!m) throw err('ItemNotFound ' + id); return shapeProxy(ctx, m); };
    c.getItemOrNullObject = function (id) { const m = slide.shapes.find((s) => s.id === id); const p = m ? shapeProxy(ctx, m) : base(ctx, [], {}); p.isNullObject = !m; return p; };
    return c;
  }

  function defaultTf(isBox) {
    return { autoSize: isBox ? 'AutoSizeShapeToFitText' : 'AutoSizeNone', wrap: true, margins: [7.2, 7.2, 3.6, 3.6], valign: isBox ? 'Top' : 'Middle', size: 18, color: isBox ? '#000000' : '#FFFFFF', bold: false, halign: isBox ? 'Left' : 'Center' };
  }
  function bboxGroup(g) {
    let l = Infinity, t = Infinity, r = -Infinity, b = -Infinity;
    g.children.forEach((k) => { l = Math.min(l, k.left); t = Math.min(t, k.top); r = Math.max(r, k.left + k.width); b = Math.max(b, k.top + k.height); });
    g.left = l; g.top = t; g.width = r - l; g.height = b - t;
  }
  function scaleGroup(g, nl, nt, nw, nh) {
    const sx = nw / g.width, sy = nh / g.height;
    walk(g.children, (k) => { k.left = nl + (k.left - g.left) * sx; k.top = nt + (k.top - g.top) * sy; k.width *= sx; k.height *= sy; });
    g.left = nl; g.top = nt; g.width = nw; g.height = nh;
  }
  model.resizeGroup = function (id, w, h) { const f = findShapeAnywhere(id); scaleGroup(f.shape, f.shape.left, f.shape.top, w, h); };

  function shapeProxy(ctx, m) {
    const g = {
      id: () => m.id, name: () => m.name, type: () => m.type, left: () => m.left, top: () => m.top, width: () => m.width, height: () => m.height,
      zOrderPosition: () => { const f = findShapeAnywhere(m.id); return parentList(f.slide, m).indexOf(m); },
      set_name: (v) => { m.name = v; },
      set_left: (v) => { if (m.type === 'Group') scaleGroup(m, v, m.top, m.width, m.height); else m.left = v; },
      set_top: (v) => { if (m.type === 'Group') scaleGroup(m, m.left, v, m.width, m.height); else m.top = v; },
      set_width: (v) => { if (m.type === 'Group') scaleGroup(m, m.left, m.top, v, m.height); else m.width = v; },
      set_height: (v) => { if (m.type === 'Group') scaleGroup(m, m.left, m.top, m.width, v); else m.height = v; },
      rotation: () => m.rotation || 0,
      set_rotation: (v) => { if (verNum(MAXVER) < verNum('1.10')) throw err('ApiNotFound rotation'); m.rotation = v; },
    };
    const s = base(ctx, ['id', 'name', 'type', 'left', 'top', 'width', 'height', 'zOrderPosition', 'rotation'], g);
    s.delete = function () {
      const f = findShapeAnywhere(m.id);
      if (!f) throw err('delete: gone ' + m.id);
      const list = parentList(f.slide, m);
      list.splice(list.indexOf(m), 1);
      model.selection.shapeIds = model.selection.shapeIds.filter((id) => id !== m.id);
    };
    s.setZOrder = function (pos) {
      const f = findShapeAnywhere(m.id); const list = parentList(f.slide, m); const i = list.indexOf(m);
      if (pos === 'SendBackward' && i > 0) { list.splice(i, 1); list.splice(i - 1, 0, m); }
      else if (pos !== 'SendBackward') throw err('zorder ' + pos);
    };
    s.fill = {
      setSolidColor(c) { if (!/^#[0-9A-F]{6}$/i.test(c)) throw err('bad color ' + c); if (m.type === 'Line') throw err('fill on line'); m.fill = { color: c }; },
      clear() { if (m.type === 'Line') throw err('fill on line'); m.fill = null; },
    };
    const lf = {};
    ['visible', 'color', 'weight', 'dashStyle'].forEach((k) => Object.defineProperty(lf, k, {
      set(v) {
        if (k === 'color' && !/^#[0-9A-F]{6}$/i.test(v)) throw err('bad line color ' + v);
        if (k === 'dashStyle' && !['Solid', 'Dash', 'RoundDot', 'LongDash'].includes(v)) throw err('bad dash ' + v);
        m.line = m.line || {}; m.line[k === 'dashStyle' ? 'dash' : k] = v;
      },
      get() { throw err('PropertyNotLoaded lineFormat.' + k); },
    }));
    s.lineFormat = lf;
    const font = {}, para = {}, tr = {}, tf = {};
    const T = () => { if (!m.tf) throw err('no textFrame on ' + m.type); return m.tf; };
    Object.defineProperty(font, 'size', { set(v) { if (!(v > 0)) throw err('bad size'); T().size = v; } });
    Object.defineProperty(font, 'color', { set(v) { if (!/^#[0-9A-F]{6}$/i.test(v)) throw err('bad font color ' + v); T().color = v; } });
    Object.defineProperty(font, 'bold', { set(v) { T().bold = !!v; } });
    Object.defineProperty(para, 'horizontalAlignment', { set(v) { if (!['Left', 'Center', 'Right'].includes(v)) throw err('bad halign ' + v); T().halign = v; } });
    tr.font = font; tr.paragraphFormat = para;
    Object.defineProperty(tr, 'text', { set(v) { T(); m.text = String(v); } });
    tf.textRange = tr;
    Object.defineProperty(tf, 'autoSizeSetting', { set(v) { if (!['AutoSizeNone', 'AutoSizeTextToFitShape', 'AutoSizeShapeToFitText'].includes(v)) throw err('bad autosize ' + v); T().autoSize = v; } });
    Object.defineProperty(tf, 'wordWrap', { set(v) { T().wrap = !!v; } });
    Object.defineProperty(tf, 'verticalAlignment', { set(v) { if (!['Top', 'Middle', 'Bottom'].includes(v)) throw err('bad valign ' + v); T().valign = v; } });
    ['leftMargin', 'rightMargin', 'topMargin', 'bottomMargin'].forEach((k, i) => Object.defineProperty(tf, k, { set(v) { T().margins[i] = v; } }));
    Object.defineProperty(s, 'textFrame', { get() { if (m.type === 'Line' || m.type === 'Group') throw err('textFrame on ' + m.type); return tf; } });
    const tagsProxy = collection(ctx, () => Object.keys(m.tags).map((k) => ({ key: k, value: m.tags[k] })), (t) => base(ctx, ['key', 'value'], { key: () => t.key, value: () => t.value }));
    tagsProxy.add = function (k, v) {
      if (verNum(MAXVER) < verNum('1.3')) throw err('ApiNotFound tags');
      if (typeof v !== 'string') throw err('tag value must be string');
      m.tags[String(k).toUpperCase()] = v;
    };
    tagsProxy.getItemOrNullObject = function (k) {
      const key = String(k).toUpperCase();
      const has = Object.prototype.hasOwnProperty.call(m.tags, key);
      const t = base(ctx, ['value'], { value: () => m.tags[key] });
      t.isNullObject = !has;
      return t;
    };
    s.tags = tagsProxy;
    return s;
  }

  /* ---------------- Office ---------------- */
  window.Office = {
    HostType: { PowerPoint: 'PowerPoint' },
    EventType: { DocumentSelectionChanged: 'documentSelectionChanged', DialogMessageReceived: 'dialogMessageReceived', DialogEventReceived: 'dialogEventReceived' },
    AsyncResultStatus: { Succeeded: 'succeeded', Failed: 'failed' },
    onReady(cb) { const info = { host: 'PowerPoint', platform: 'Mac' }; if (cb) setTimeout(() => cb(info), 0); return Promise.resolve(info); },
    actions: { associate(name, fn) { (window.__assoc = window.__assoc || {})[name] = fn; } },
    context: {
      requirements: { isSetSupported(name, v) { return name === 'PowerPointApi' && verNum(v) <= verNum(MAXVER); } },
      document: { addHandlerAsync(type, h, cb) { model.handlers.push(h); cb && cb({ status: 'succeeded' }); } },
      ui: {
        displayDialogAsync(url, opts, cb) {
          model.log.push(['dialog', decodeURIComponent(url.split('msg=')[1] || '')]);
          const handlers = {};
          const dlg = { addEventHandler(t, h) { handlers[t] = h; }, close() { model.log.push(['dialog-closed']); } };
          cb({ status: 'succeeded', value: dlg });
          setTimeout(() => handlers.dialogMessageReceived && handlers.dialogMessageReceived({ message: 'ok' }), 5);
        },
      },
    },
  };
  window.PowerPoint = {
    run(fn) {
      const ctx = makeCtx();
      return Promise.resolve().then(() => fn(ctx)).catch((e) => { model.errors.push('run: ' + e.message); throw e; });
    },
  };

  /* ---------------- Folie als SVG (zum Ansehen) ---------------- */
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  model.slideSVG = function (slideId) {
    const sl = findSlide(slideId || model.selection.slideId);
    const out = ['<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 960 540" width="1440" height="810" font-family="Helvetica, Arial, sans-serif"><rect width="960" height="540" fill="#fff"/>'];
    const draw = (s) => {
      if (s.type === 'Group') { s.children.forEach(draw); return; }
      const ln = s.line && s.line.visible !== false ? ` stroke="${s.line.color}" stroke-width="${s.line.weight}"${s.line.dash === 'Dash' ? ' stroke-dasharray="3 2"' : ''}` : '';
      const fill = s.fill ? s.fill.color : 'none';
      const rot = s.rotation ? ` transform="rotate(${s.rotation} ${s.left + s.width / 2} ${s.top + s.height / 2})"` : '';
      if (s.geom === 'Line') out.push(`<line x1="${s.left}" y1="${s.top}" x2="${s.left + s.width}" y2="${s.top + s.height}"${ln}/>`);
      else if (s.geom === 'LineInverse') out.push(`<line x1="${s.left}" y1="${s.top + s.height}" x2="${s.left + s.width}" y2="${s.top}"${ln}/>`);
      else if (s.geom === 'Ellipse') out.push(`<ellipse cx="${s.left + s.width / 2}" cy="${s.top + s.height / 2}" rx="${s.width / 2}" ry="${s.height / 2}" fill="${fill}"${ln}/>`);
      else if (s.geom === 'Triangle') out.push(`<polygon points="${s.left},${s.top + s.height} ${s.left + s.width},${s.top + s.height} ${s.left + s.width / 2},${s.top}" fill="${fill}"${ln}${rot}/>`);
      else if (s.geom === 'FlowChartMerge') out.push(`<polygon points="${s.left},${s.top} ${s.left + s.width},${s.top} ${s.left + s.width / 2},${s.top + s.height}" fill="${fill}"${ln}/>`);
      else if (s.type !== 'Placeholder') out.push(`<rect x="${s.left}" y="${s.top}" width="${s.width}" height="${s.height}" rx="${s.geom === 'RoundRectangle' ? Math.min(s.width, s.height) * 0.17 : 0}" fill="${fill}"${ln}/>`);
      if (s.text && s.tf) {
        const tf = s.tf;
        const x = tf.halign === 'Left' ? s.left + tf.margins[0] : tf.halign === 'Right' ? s.left + s.width - tf.margins[1] : s.left + s.width / 2;
        const anchor = tf.halign === 'Left' ? 'start' : tf.halign === 'Right' ? 'end' : 'middle';
        const y = tf.valign === 'Top' ? s.top + tf.margins[2] + tf.size * 0.6 : tf.valign === 'Bottom' ? s.top + s.height - tf.margins[3] - tf.size * 0.6 : s.top + s.height / 2;
        out.push(`<text x="${x}" y="${y}" font-size="${tf.size}" fill="${tf.color}" text-anchor="${anchor}" dominant-baseline="central"${tf.bold ? ' font-weight="bold"' : ''}>${esc(s.text)}</text>`);
      } else if (s.type === 'Placeholder') {
        out.push(`<text x="${s.left}" y="${s.top + 35}" font-size="28" fill="#222">${esc(s.text || '')}</text>`);
      }
    };
    sl.shapes.forEach(draw);
    out.push('</svg>');
    return out.join('');
  };
})();
