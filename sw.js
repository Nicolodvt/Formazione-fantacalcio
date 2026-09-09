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
const CACHE = 'formazione-v0-4';

/* Stessa icona 192x192 del manifest, incollata qui: showNotification() vuole un URL
   diretto a un'immagine, non puo' pescarla dal manifest. Un data URI evita un file a parte. */
const ICONA = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAMAAAADACAIAAADdvvtQAAADQUlEQVR42u3asU3EQBBAUVeAREJATEABJFADEenVQgnUQkBFZGS0QICEgJPAt16PvTNP+vnI4ycO2zudnV9IzU1WIIAEkAASQBJAAkgACSAJIAEkgH52eXel7uUE5L7mVjVxQ9K+ALlVpRhN6GC0C0DuSk1DEz0MbQnIbSjOaKJH2wCyd4YA0kaAbJyhdkB2zVA7IFtmCCBtBMh+GQJIGwGyWYYAEkAaEZCdMgSQABJAAkgAASSANAYg22QIIAEkgASQABoT0Ovh8D3jAGpc7tqLzj2uHKA/9tt90XNmBY8DKNsdHXdcOUAz99try7nHlQN00n6Xbzn3OIAAAsgdBQgggAACCCCAAAIIIO+BvAcCCCCfMnzKAGjRlo0DyHEOxzliMUWOy3ppjrQKIAEkgAASQAJIAAkggASQdgTo+uFGBQNI+wDkj7mfMIAEkAASQAIIIAEkgASQAAJI+QEdnt6PMw6gxuWut+jc48oB+ne/fbece1w5QDP322vLuccBBBBAq+13+ZZzjwMIIIDcUYAAAggggAACCCCAAPIeyHsggADyLcy3MIB8jfc13nkg54GcSBRAAkgACSCAAAJIAAkgASSAABJAAkgACSCABJAAEkACCCABJIAEkACKB3T//PjZ0CMyXcgYgL528auAEZmmVAT0x8Y77iVgRMyUmHUNA2jOOpYvJWBEzJSYdeUE1LyUgBGZLmQkQCdtJGbvbVPSXAhAS0dkmgJQh6WkARRzISMBatgIQFsZAggggAACyD/R/on2GO8x3otELxJ9ytjblDQX4mPqZlPSXMh4xzli1pHmOEewnpEOlAUcbYk5QBM/xYlEOdIqgAASQAJIAAkggASQABJAAggggAASQAJINQExRA9AAiiwt5fb4wACqF1PNUMAdaZTjRFAa+kpYggggPYEKL2hk/SkNzRfBUAAAQTQEIByGwKoQQ9AAMUCSmwIoAY9AAEUDoghepYCymqoOKA2CY2AihuiB6B2Q368+gAq+FTvub0zICcVi+vpAAijsnR6AmKopp6egBgqqKczIIxK0VkLEEZF6KwLiKTcbuIAUZXGyo4AKU0ACSABJIAEkASQABJAAkgCSABpx30ARXk9ws9KjMIAAAAASUVORK5CYII=';
const FILES = [
  './', './index.html', './manifest.webmanifest', './dati/probabili.json',
  /* L'app legge i dati di giornata direttamente da GitHub quando puo (vedi fetchDati() in
     index.html): precaricarli qui vuol dire che anche al primissimo avvio, prima di ogni
     altra richiesta, l'ultima copia buona e gia' pronta per l'offline. */
  'https://raw.githubusercontent.com/Nicolodvt/Formazione-fantacalcio/main/dati/probabili.json'
];

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

/* Promemoria di schierare la formazione. Il corpo arriva da tools/invia-promemoria.mjs come
   JSON: {titolo, corpo}. Se per qualche motivo non e' JSON valido si mostra comunque qualcosa
   invece di far sparire silenziosamente la notifica. */
self.addEventListener('push', (e) => {
  let dati = { titolo: 'Formazione', corpo: 'Controlla la formazione della giornata.' };
  try{ if(e.data) dati = Object.assign(dati, e.data.json()); }catch(err){}
  e.waitUntil(
    self.registration.showNotification(dati.titolo, {
      body: dati.corpo,
      icon: ICONA,
      badge: ICONA,
      tag: 'promemoria-formazione',     // una sola notifica alla volta: la successiva sostituisce, non si accumula
      data: { url: './' }
    })
  );
});

/* Tap sulla notifica: porta all'app, riusando una scheda gia' aperta se c'e'. */
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(elenco => {
      for(const c of elenco){ if('focus' in c) return c.focus(); }
      if(self.clients.openWindow) return self.clients.openWindow('./');
    })
  );
});
