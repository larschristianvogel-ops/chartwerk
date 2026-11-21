/*! Chartwerk Icons (24 x 24), genutzt im Aufgabenbereich und für die Menüband-Grafiken */
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else { root.Chartwerk = root.Chartwerk || {}; root.Chartwerk.ICONS = api; }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const N = '#0B2E59', M = '#3F84C4', Lt = '#9DC3E6', A = '#3A3F45', G = '#2F8050', R = '#C8473B', AX = '#8A929B';
  const svg = function (body) {
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24">' + body + '</svg>';
  };
  const rect = function (x, y, w, h, f) { return '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" fill="' + f + '"/>'; };
  const base = '<rect x="2" y="21" width="20" height="1" fill="' + AX + '"/>';

  return {
    stacked: svg(base +
      rect(3, 14, 5, 7, N) + rect(3, 10, 5, 4, M) + rect(3, 7, 5, 3, Lt) +
      rect(10, 12, 5, 9, N) + rect(10, 8, 5, 4, M) + rect(10, 5, 5, 3, Lt) +
      rect(17, 10, 5, 11, N) + rect(17, 5, 5, 5, M) + rect(17, 2, 5, 3, Lt)),
    clustered: svg(base +
      rect(3, 11, 4, 10, N) + rect(7, 8, 4, 13, Lt) +
      rect(13, 7, 4, 14, N) + rect(17, 4, 4, 17, Lt)),
    percent: svg(base +
      rect(3, 13, 5, 8, N) + rect(3, 7, 5, 6, M) + rect(3, 3, 5, 4, Lt) +
      rect(10, 15, 5, 6, N) + rect(10, 8, 5, 7, M) + rect(10, 3, 5, 5, Lt) +
      rect(17, 11, 5, 10, N) + rect(17, 6, 5, 5, M) + rect(17, 3, 5, 3, Lt)),
    bar: svg('<rect x="3" y="2" width="1" height="20" fill="' + AX + '"/>' +
      rect(4, 3, 17, 4, N) + rect(4, 10, 12, 4, M) + rect(4, 17, 7, 4, Lt)),
    waterfall: svg(base +
      rect(2, 10, 4, 11, N) + rect(7, 5, 4, 5, G) + rect(12, 5, 4, 4, R) + rect(17, 9, 5, 12, N) +
      '<path d="M6 10h1M11 5h1M16 9h1" stroke="' + AX + '" stroke-width="1"/>'),
    line: svg(base +
      '<polyline points="3,16 8,12 13,14 20,5" fill="none" stroke="' + N + '" stroke-width="2" stroke-linejoin="round"/>' +
      '<circle cx="3.5" cy="16" r="1.8" fill="' + N + '"/><circle cx="8" cy="12" r="1.8" fill="' + N + '"/>' +
      '<circle cx="13" cy="14" r="1.8" fill="' + N + '"/><circle cx="20" cy="5" r="1.8" fill="' + N + '"/>'),
    mekko: svg(
      rect(2, 12, 9, 10, N) + rect(2, 6, 9, 6, M) + rect(2, 2, 9, 4, Lt) +
      rect(11.6, 15, 6, 7, N) + rect(11.6, 7, 6, 8, M) + rect(11.6, 2, 6, 5, Lt) +
      rect(18.2, 11, 3.8, 11, N) + rect(18.2, 5, 3.8, 6, M) + rect(18.2, 2, 3.8, 3, Lt)),
    sheet: svg('<rect x="2.5" y="3.5" width="19" height="17" rx="1.5" fill="#fff" stroke="' + A + '"/>' +
      rect(3, 4, 18, 4, '#DCE7F3') + '<path d="M3 8h18M3 12.5h18M3 16.5h18M8.5 4v16M14.5 4v16" stroke="' + A + '" stroke-width="1"/>' +
      rect(3, 4, 5.5, 16, '#EEF2F6') + '<path d="M3 8h18M8.5 4v16" stroke="' + A + '" stroke-width="1"/>' +
      '<rect x="2.5" y="3.5" width="19" height="17" rx="1.5" fill="none" stroke="' + A + '"/>'),
    refresh: svg('<path d="M19 12a7 7 0 1 1-2.05-4.95" fill="none" stroke="' + N + '" stroke-width="2.2" stroke-linecap="round"/>' +
      '<path d="M20.5 3.5v5.5H15z" fill="' + N + '"/>'),
    cagr: svg(base +
      rect(3, 15, 5, 6, M) + rect(10, 12, 5, 9, M) + rect(17, 9, 5, 12, M) +
      '<path d="M5.5 13V4.5h14V6" fill="none" stroke="' + A + '" stroke-width="1.4"/>' +
      '<path d="M17.2 5.6h4.6l-2.3 2.9z" fill="' + A + '"/>' +
      '<rect x="8.5" y="2.6" width="7" height="3.8" rx="1" fill="#fff" stroke="' + A + '" stroke-width="1"/>'),
    diff: svg(base +
      rect(3, 12, 6, 9, M) + rect(14, 7, 6, 14, N) +
      '<path d="M6 10.5V4h11v1" fill="none" stroke="' + A + '" stroke-width="1.4"/>' +
      '<path d="M14.7 4.6h4.6l-2.3 2.9z" fill="' + A + '"/>'),
    level: svg(base +
      rect(2, 13, 6, 8, M) + rect(10, 6, 6, 15, N) +
      '<path d="M8 13h12M16 6h4" stroke="' + AX + '" stroke-width="1" stroke-dasharray="1.6 1.2"/>' +
      '<path d="M19.5 13V8.6" stroke="' + A + '" stroke-width="1.4"/>' +
      '<path d="M17.2 9.4h4.6L19.5 6z" fill="' + A + '"/>'),
    logo: svg('<rect x="1" y="1" width="22" height="22" rx="5" fill="' + N + '"/>' +
      rect(5, 13, 3.4, 6, '#9DC3E6') + rect(10.3, 9, 3.4, 10, '#5B9BD5') + rect(15.6, 6, 3.4, 13, '#FFFFFF') +
      '<path d="M6.7 11V4.6h10.6v0.6" fill="none" stroke="#fff" stroke-width="1.2"/>' +
      '<path d="M15.5 4.6h3.6l-1.8 2.1z" fill="#fff"/>'),
  };
});
