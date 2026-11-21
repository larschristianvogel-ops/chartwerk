const E = require('../src/engine.js');
const fs = require('fs');
const path = require('path');
const out = path.join(__dirname, 'out');
const frame = { left: 60, top: 120, width: 840, height: 380 };
const extra = process.argv[2] ? JSON.parse(process.argv[2]) : {};
for (const t of E.TYPE_ORDER) {
  const spec = E.sample(t);
  Object.assign(spec.options, extra);
  const res = E.layout(spec, frame, {});
  const svg = E.toSVG(res, { background: '#FFFFFF', showFrame: true, pad: 10 });
  fs.writeFileSync(path.join(out, t + '.svg'), svg);
  console.log(t, 'prims:', res.prims.length, 'warnings:', res.warnings.join('; ') || '-');
}
