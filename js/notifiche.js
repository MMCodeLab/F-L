/* ==========================================================================
   F&L — Notifiche e promemoria del pagamento.

   L'idea: ogni volta che il numero di corse completate e non ancora
   saldate tocca un multiplo della soglia (di serie 4), scatta il
   promemoria che c'e' un pagamento da effettuare. Il testo e' neutro:
   vale sia per chi guida sia per chi paga.

   L'avviso deve arrivare una volta sola per traguardo: se tolgo e rimetto
   una spunta non deve ripartire. Per questo si salva "ultimoAvviso", cioe'
   il totale di corse a cui e' scattato l'ultimo avviso.

   Le notifiche di sistema sono locali (niente push da server): compaiono
   quando l'app e' aperta. In piu' mostriamo sempre una modale dentro l'app,
   cosi' il promemoria si vede anche senza permesso concesso.
   ========================================================================== */
(function (global) {
  'use strict';

  var FL = global.FL || (global.FL = {});

  function supportate() {
    return 'Notification' in global;
  }

  function permesso() {
    return supportate() ? Notification.permission : 'unsupported';
  }

  /* Chiede il permesso. Va chiamata da un gesto dell'utente (un tap),
     altrimenti i browser la ignorano. */
  function chiedi() {
    if (!supportate()) return Promise.resolve('unsupported');
    return Notification.requestPermission().then(function (esito) {
      FL.dati.impostazioni().notifiche = (esito === 'granted');
      FL.dati.salva();
      return esito;
    }).catch(function () { return 'denied'; });
  }

  /* Mostra una notifica di sistema, se possibile.
     Con il service worker registrato si usa lui: e' l'unica strada che
     funziona sui telefoni Android e sulle PWA installate su iOS. */
  function mostra(titolo, corpo) {
    if (permesso() !== 'granted') return;
    var opzioni = {
      body: corpo,
      icon: 'icons/icon-192.png',
      badge: 'icons/favicon.png',
      tag: 'fl-pagamento',
      renotify: true,
      lang: 'it',
      vibrate: [60, 40, 60]
    };
    if (global.navigator && navigator.serviceWorker && navigator.serviceWorker.ready) {
      navigator.serviceWorker.ready.then(function (reg) {
        reg.showNotification(titolo, opzioni);
      }).catch(function () { fallback(titolo, opzioni); });
    } else {
      fallback(titolo, opzioni);
    }
  }

  function fallback(titolo, opzioni) {
    try { new Notification(titolo, opzioni); } catch (e) { /* nulla da fare */ }
  }

  /* Controlla se e' scattato un nuovo traguardo.
     Va richiamata a ogni conferma e all'apertura dell'app.
     Ritorna true se ha avvisato. */
  function controllaPagamento() {
    var d = FL.dati.stato();
    var soglia = FL.dati.soglia();
    var totale = FL.dati.totaleFatte();
    var sospese = FL.dati.corseInSospeso();

    if (sospese < soglia) return false;

    // Totale di corse a cui e' scattato l'ultimo multiplo della soglia:
    // con soglia 4 e 6 corse in sospeso, il traguardo e' a quota 4.
    var traguardo = totale - (sospese % soglia);
    if (d.pagamenti.ultimoAvviso === traguardo) return false;

    d.pagamenti.ultimoAvviso = traguardo;
    FL.dati.salva();

    var corse = sospese === 1 ? '1 corsa completata' : sospese + ' corse completate';
    var corpo = 'Ci sono ' + corse + ' e non ancora saldate.';
    mostra('F&L — pagamento da effettuare', corpo);
    if (FL.ui && FL.ui.mostraModalePagamento) FL.ui.mostraModalePagamento(sospese);
    return true;
  }

  FL.notifiche = {
    supportate: supportate,
    permesso: permesso,
    chiedi: chiedi,
    mostra: mostra,
    controllaPagamento: controllaPagamento
  };
})(window);
