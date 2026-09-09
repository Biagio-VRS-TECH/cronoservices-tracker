/* sw.js - service worker minimo: rende avviabile l'app senza rete.
   Strategia "prima la rete, poi la cache" su tutto il guscio statico: quando il
   server c'e' si vede sempre l'ultima versione (importante, il codice cambia
   spesso), quando non c'e' si apre l'ultima copia scaricata.
   Le API non passano da qui: i dati stanno in localStorage e la coda di
   scrittura e' gestita da js/api.js.  #ANCHOR: sw */
const CACHE = 'crono-guscio-v17';
const GUSCIO = [
  '/', '/index.html', '/manifest.webmanifest',
  '/css/theme.css', '/css/base.css', '/css/griglia.css', '/css/stat.css',
  '/css/stampa.css',
  '/js/app.js', '/js/api.js', '/js/nuvola.js', '/js/nuvola-config.js',
  '/js/stato.js', '/js/ui.js',
  '/js/anno.js', '/js/mese.js', '/js/stat.js',
  '/js/spunte.js', '/js/cassetto.js', '/js/documenti.js', '/js/affinita.js',
  '/schede/', '/schede/index.html', '/schede/ponte.js',
  '/schede/lib/html2canvas.min.js', '/schede/lib/jspdf.umd.min.js',
  '/assets/icona.svg', '/assets/logo.webp',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE)
    .then(c => Promise.allSettled(GUSCIO.map(u => c.add(u))))
    .then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(k => Promise.all(k.filter(x => x !== CACHE).map(x => caches.delete(x))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return;
  if (u.pathname.startsWith('/api/')) return;          // gestite da js/api.js
  e.respondWith((async () => {
    try {
      const r = await fetch(e.request);
      if (r.ok) (await caches.open(CACHE)).put(e.request, r.clone());
      return r;
    } catch {
      return (await caches.match(e.request, { ignoreSearch: true })) ||
        (await caches.match('/index.html')) ||
        new Response('Offline', { status: 503 });
    }
  })());
});
