/*! Chartwerk Menüband-Befehle (ohne Aufgabenbereich) */
(function () {
  'use strict';
  const CW = window.Chartwerk;

  function base() { return location.href.replace(/[^/]*$/, ''); }

  /** Kurze Meldung als kleines Dialogfenster, schließt per Klick. */
  function notify(message) {
    return new Promise(function (resolve) {
      try {
        const url = base() + 'dialog.html?msg=' + encodeURIComponent(message);
        Office.context.ui.displayDialogAsync(url, { height: 22, width: 28, displayInIframe: false }, function (res) {
          if (res.status !== Office.AsyncResultStatus.Succeeded) { resolve(); return; }
          const dlg = res.value;
          let done = false;
          const finish = function () { if (done) return; done = true; try { dlg.close(); } catch (e) { /* schon zu */ } resolve(); };
          dlg.addEventHandler(Office.EventType.DialogMessageReceived, finish);
          dlg.addEventHandler(Office.EventType.DialogEventReceived, finish);
          setTimeout(finish, 15000);
        });
      } catch (e) { resolve(); }
    });
  }

  async function run(event, job) {
    try {
      if (!CW.ppt.available()) {
        await notify('Diese PowerPoint-Version ist zu alt für Chartwerk. Bitte PowerPoint aktualisieren (mindestens 16.62).');
      } else {
        const r = await job();
        if (r && r.ok === false && r.message) await notify(r.message);
      }
    } catch (e) {
      await notify('Das hat nicht geklappt: ' + String((e && e.message) || e));
    } finally {
      try { event.completed(); } catch (e) { /* ignorieren */ }
    }
  }

  const insert = function (type) {
    return function (event) { run(event, function () { return CW.ppt.insertChart(CW.sample(type)); }); };
  };

  const handlers = {
    cwInsertStacked: insert('stacked'),
    cwInsertClustered: insert('clustered'),
    cwInsertPercent: insert('percent'),
    cwInsertBar: insert('bar'),
    cwInsertWaterfall: insert('waterfall'),
    cwInsertLine: insert('line'),
    cwInsertMekko: insert('mekko'),
    cwRefresh: function (event) { run(event, function () { return CW.ppt.refreshSelected(); }); },
    cwToggleCagr: function (event) { run(event, function () { return CW.ppt.toggleDecoration('cagr'); }); },
    cwToggleDiff: function (event) { run(event, function () { return CW.ppt.toggleDecoration('diff'); }); },
    cwToggleLevel: function (event) { run(event, function () { return CW.ppt.toggleDecoration('level'); }); },
  };

  Object.keys(handlers).forEach(function (k) { window[k] = handlers[k]; });
  Office.onReady(function () {
    if (Office.actions && typeof Office.actions.associate === 'function') {
      Object.keys(handlers).forEach(function (k) { try { Office.actions.associate(k, handlers[k]); } catch (e) { /* globale Funktion reicht */ } });
    }
  });
})();
