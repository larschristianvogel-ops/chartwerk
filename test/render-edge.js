const E = require('../src/engine.js');
const fs = require('fs'); const path = require('path');
const out = path.join(__dirname, 'out');
const frame = { left: 60, top: 120, width: 840, height: 400 };
const cases = {
  e1_stacked_multi_deco: { type:'stacked', categories:['2019','2020','2021','2022','2023','2024E','2025E'],
    series:[{name:'Firmenkunden', values:[120,130,128,140,155,170,182]},{name:'Privatkunden', values:[80,82,85,90,96,101,108]},{name:'Kapitalmarkt', values:[40,35,52,48,50,55,61]}],
    decorations:[{kind:'cagr',from:0,to:4},{kind:'cagr',from:4,to:6},{kind:'diff',from:5,to:6},{kind:'level',from:0,to:6}],
    options:{ title:'in Mio. €', palette:'petrol' } },
  e2_clustered_neg: { type:'clustered', categories:['Segment Nord mit langem Namen','Süd','West','Ost'],
    series:[{name:'Plan', values:[12,-5,8,3]},{name:'Ist', values:[10,-7,9.5,-2]},{name:'Vorjahr', values:[9,-3,7,1]}],
    decorations:[{kind:'diff',from:0,to:2,series:1}], options:{ palette:'bunt' } },
  e3_waterfall_neg: { type:'waterfall', categories:['Start','A','B','C','D','Ende'],
    series:[{name:'W', values:[20,-35,-10,15,40,'e']}], decorations:[{kind:'level',from:0,to:5}], options:{} },
  e4_stacked_neg_theme: { type:'stacked', categories:['2021','2022','2023'],
    series:[{name:'Ertrag', values:[50,60,70]},{name:'Risikovorsorge', values:[-10,-25,-8]},{name:'Sonstiges', values:[5,8,-3]}],
    options:{ palette:'theme' }, decorations:[{kind:'cagr',from:0,to:2}] },
  e5_line_deco: { type:'line', categories:['2019','2020','2021','2022','2023','2024'],
    series:[{name:'Zinsüberschuss', values:[1.82,1.79,1.85,2.10,2.64,2.71]},{name:'Provisionsüberschuss', values:[0.55,0.58,0.62,0.6,0.61,0.66]}],
    decorations:[{kind:'cagr',from:0,to:5}], options:{ unit:'Mrd. €' } },
  e6_bar_stacked: { type:'bar', categories:['Bank A','Bank B','Bank C','Bank D'],
    series:[{name:'Kredite', values:[320,250,180,90]},{name:'Wertpapiere', values:[110,95,60,40]},{name:'Sonstiges', values:[30,20,25,10]}], options:{ palette:'grau' } },
  e7_small_frame: { type:'stacked', categories:['2020','2021','2022','2023','2024'], series:E.sample('stacked').series, decorations:[{kind:'cagr',from:0,to:4},{kind:'diff',from:3,to:4}], options:{ fontSize:10 } },
};
for (const [k, spec] of Object.entries(cases)) {
  const fr = k === 'e7_small_frame' ? { left: 20, top: 20, width: 360, height: 220 } : frame;
  const res = E.layout(spec, fr, { theme: ['#E2001A','#7B7B7B','#00508C','#F39200','#95C11F','#5B3B8C'] });
  fs.writeFileSync(path.join(out, k + '.svg'), E.toSVG(res, { background:'#FFFFFF', showFrame:true, pad:10 }));
  console.log(k, res.prims.length, res.warnings.join('; ') || '-');
}
