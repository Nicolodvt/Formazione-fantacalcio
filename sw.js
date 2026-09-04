/* Service worker dell'app formazione.

   Due lavori: rendere l'app installabile, e farla funzionare senza rete. La formazione si
   fa spesso al volo — in treno, in pausa, con una tacca — e l'ultima copia buona dei dati
   deve restare disponibile.

   NOTA: i service worker NON funzionano su file:// — questo file ha effetto solo quando la
   cartella e' servita via http/https.

   ATTENZIONE ALLO SCOPE. L'app asta ha un suo service worker con scope "./" e fallback a
   "./index.html". Le due app devono stare su ORIGINI DIVERSE (due siti Netlify separati):
   servite dalla stessa, quella dell'asta intercetterebbe questa e in offline mostrerebbe
   se stessa. Il nome della cache qui e' comunque distinto, cosi' non si calpestano. */

/* Il nome della cache va cambiato a ogni versione: e la chiave con cui activate() cancella
   le vecchie. Con la strategia rete-per-prima l'app si aggiorna comunque da sola, ma senza
   cambiarlo la copia vecchia resta occupata sul telefono per sempre. */
const CACHE = 'formazione-v0-3';
const FILES = ['./', './index.html', './manifest.webmanifest', './dati/probabili.json'];

self.addEventListener('install', (e) => {
  /* addAll fallisce tutto se un solo file manca: probabili.json potrebbe non esserci ancora
     al primo deploy, e non e' un motivo per non installare l'app. */
  e.waitUntil(
    caches.open(CACHE)
      .then(c => Promise.allSettled(FILES.map(f => c.add(f))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then(k => Promise.all(k.filter(x => x !== CACHE).map(x => caches.delete(x))))
      .then(() => self.clients.claim())
  );
});

/* Rete-per-prima con ricaduta sulla cache: una versione aggiornata dell'app (e dei dati di
   giornata) viene presa appena c'e' rete, ma senza rete si continua a lavorare sull'ultima
   copia buona. Per i dati e' esattamente il comportamento voluto: meglio le probabili di
   giovedi' che nessuna probabile. */
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    fetch(e.request)
      .then(r => {
        const copia = r.clone();
        caches.open(CACHE).then(c => c.put(e.request, copia)).catch(() => {});
        return r;
      })
      .catch(() => caches.match(e.request).then(r => r || caches.match('./index.html')))
  );
});
