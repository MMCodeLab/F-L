/* ==========================================================================
   F&L — Service worker.
   Serve a due cose: far partire l'app anche senza rete e permettere
   l'installazione sul telefono.

   Tutti i percorsi sono relativi al service worker, quindi l'app funziona
   anche dentro una sottocartella (come succede su GitHub Pages).
   Quando si modifica un file, basta cambiare VERSIONE per far scaricare
   tutto di nuovo.
   ========================================================================== */

var VERSIONE = 'fl-v6';
var CACHE = 'fl-cache-' + VERSIONE;

var FILE = [
  './',
  './index.html',
  './css/style.css',
  './js/storage.js',
  './js/calendario.js',
  './js/notifiche.js',
  './js/pdf.js',
  './js/ui.js',
  './js/app.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
  './icons/favicon.png'
];

/* Installazione: si mette da parte tutto il necessario.
   Ogni file viene aggiunto per conto suo, cosi' se uno solo non c'e'
   l'installazione non fallisce in blocco. */
self.addEventListener('install', function (ev) {
  ev.waitUntil(
    caches.open(CACHE).then(function (cache) {
      return Promise.all(FILE.map(function (url) {
        return cache.add(new Request(url, { cache: 'reload' })).catch(function () { });
      }));
    }).then(function () { return self.skipWaiting(); })
  );
});

/* Attivazione: via le versioni vecchie della cache. */
self.addEventListener('activate', function (ev) {
  ev.waitUntil(
    caches.keys().then(function (chiavi) {
      return Promise.all(chiavi.map(function (k) {
        return k === CACHE ? null : caches.delete(k);
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (ev) {
  var richiesta = ev.request;

  // Si gestiscono solo le GET dello stesso sito.
  if (richiesta.method !== 'GET') return;
  if (new URL(richiesta.url).origin !== self.location.origin) return;

  // Apertura della pagina: prima la rete (per avere subito gli aggiornamenti),
  // e se non c'e' campo si torna alla copia in cache.
  if (richiesta.mode === 'navigate') {
    ev.respondWith(
      fetch(richiesta).then(function (risposta) {
        var copia = risposta.clone();
        caches.open(CACHE).then(function (c) { c.put('./index.html', copia); });
        return risposta;
      }).catch(function () {
        return caches.match('./index.html').then(function (r) {
          return r || caches.match('./');
        });
      })
    );
    return;
  }

  // Tutto il resto: prima la cache (parte all'istante), e intanto si
  // aggiorna la copia in background per la volta successiva.
  ev.respondWith(
    caches.match(richiesta).then(function (inCache) {
      var dallaRete = fetch(richiesta).then(function (risposta) {
        if (risposta && risposta.status === 200 && risposta.type === 'basic') {
          var copia = risposta.clone();
          caches.open(CACHE).then(function (c) { c.put(richiesta, copia); });
        }
        return risposta;
      }).catch(function () { return inCache; });
      return inCache || dallaRete;
    })
  );
});

/* Tocco sulla notifica del pagamento: si porta in primo piano l'app. */
self.addEventListener('notificationclick', function (ev) {
  ev.notification.close();
  ev.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (lista) {
      for (var i = 0; i < lista.length; i++) {
        if ('focus' in lista[i]) return lista[i].focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow('./');
    })
  );
});