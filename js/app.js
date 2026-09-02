/* ==========================================================================
   F&L — Avvio dell'applicazione.
   Mette in moto i pezzi, registra il service worker e tiene d'occhio il
   passaggio della mezzanotte, perche' i giorni pianificati e mai confermati
   devono diventare rossi da soli.
   ========================================================================== */
(function (global) {
  'use strict';

  var FL = global.FL;
  var doc = global.document;

  /* Giorno mostrato per l'ultima volta: se cambia si ridisegna tutto.
     Cosi' un giorno passato diventa rosso anche se l'app era rimasta
     aperta in background per giorni. */
  var giornoMostrato = null;

  function controllaCambioGiorno() {
    var oggi = FL.cal.chiaveOggi();
    if (oggi === giornoMostrato) return;
    giornoMostrato = oggi;
    FL.ui.renderTutto();
  }

  function avvia() {
    FL.dati.carica();
    FL.ui.init();
    giornoMostrato = FL.cal.chiaveOggi();

    // All'apertura si controlla subito se e' il momento di farsi pagare.
    FL.notifiche.controllaPagamento();

    // Il calcolo del rosso e' sempre relativo a "adesso": basta ridisegnare.
    doc.addEventListener('visibilitychange', function () {
      if (!doc.hidden) {
        controllaCambioGiorno();
        FL.notifiche.controllaPagamento();
      }
    });
    global.addEventListener('focus', controllaCambioGiorno);
    global.setInterval(controllaCambioGiorno, 60000);

    // Se lo stesso archivio viene modificato in un'altra scheda, ci si allinea.
    global.addEventListener('storage', function (ev) {
      if (ev.key === 'fl.dati.v1') {
        FL.dati.carica();
        FL.ui.renderTutto();
      }
    });

    registraServiceWorker();
    preparaInstallazione();
  }

  /* ------------------------- Service worker (offline) ------------------ */
  function registraServiceWorker() {
    if (!('serviceWorker' in navigator)) return;
    // Percorso relativo: funziona anche in una sottocartella di GitHub Pages.
    navigator.serviceWorker.register('sw.js').catch(function () {
      // Su file:// non si puo' registrare: l'app funziona lo stesso, senza offline.
    });
  }

  /* ---------------------- Pulsante "Installa l'app" -------------------- */
  function preparaInstallazione() {
    var evento = null;
    var bottone = doc.getElementById('btn-installa');

    global.addEventListener('beforeinstallprompt', function (ev) {
      ev.preventDefault();
      evento = ev;
      bottone.hidden = false;
    });

    bottone.addEventListener('click', function () {
      if (!evento) return;
      evento.prompt();
      evento.userChoice.then(function () {
        evento = null;
        bottone.hidden = true;
      });
    });

    global.addEventListener('appinstalled', function () {
      bottone.hidden = true;
      FL.ui.toast('App installata');
    });
  }

  if (doc.readyState === 'loading') {
    doc.addEventListener('DOMContentLoaded', avvia);
  } else {
    avvia();
  }
})(window);
