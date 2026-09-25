/* sw.js - service worker minimo: rende avviabile l'app senza rete.
   Strategia "prima la rete, poi la cache" su tutto il guscio statico: quando il
   server c'e' si vede sempre l'ultima versione (importante, il codice cambia
   spesso), quando non c'e' si apre l'ultima copia scaricata.
   Le API non passano da qui: i dati stanno in localStorage e la coda di
   scrittura e' gestita da js/api.js.  #ANCHOR: sw */
const CACHE = 'crono-guscio-v42';
const GUSCIO = [
  '/', '/index.html', '/manifest.webmanifest',
  '/css/fonti.css', '/css/vrs-famiglia.css', '/css/vrs-app.css', '/css/vrs-comunicazioni.css',
  '/css/theme.css', '/css/base.css', '/css/griglia.css', '/css/stat.css',
  '/css/stampa.css', '/css/banco.css', '/css/ponte.css',
  '/assets/fonti/inter-latin-wght-normal.woff2', '/assets/fonti/newsreader-latin-wght-normal.woff2',
  '/assets/fonti/newsreader-latin-wght-italic.woff2', '/assets/fonti/jetbrains-mono-latin-wght-normal.woff2',
  '/js/app.js', '/js/api.js', '/js/nuvola.js', '/js/nuvola-config.js',
  '/js/stato.js', '/js/ui.js', '/js/vrs-icone.js', '/js/vrs-novita.js', '/js/vrs-comunicazioni.js', '/novita.json',
  '/js/anno.js', '/js/mese.js', '/js/stat.js',
  '/js/spunte.js', '/js/cassetto.js', '/js/documenti.js', '/js/affinita.js', '/js/ponte.js',
  '/js/gruppi.js', '/js/tour.js', '/js/albero.js', '/js/famiglia.js', '/js/condividi.js', '/js/tema-avvio.js',
  '/schede/', '/schede/index.html', '/schede/ponte.js', '/js/schede.js',
  '/registro/', '/registro/index.html', '/registro/registro.js', '/registro/impagina.js',
  '/registro/app.js', '/registro/registro.css',
  /* PERF-09: le librerie PDF/Excel (/lib/*, 1,44 MB) non si precaricano piu':
     le scarica il primo generatore aperto, e il fetch qui sotto le mette in
     cache da solo (prima la rete, poi la copia). */
  '/assets/icona.svg', '/assets/icona-192.png', '/assets/apple-touch-icon.png',
  '/assets/logo.webp',
];

/* Tutto o niente (addAll): con allSettled un file che non si scaricava non
   fermava niente, il nuovo si attivava, buttava la cache vecchia e offline
   quel file mancava - moduli nuovi senza un pezzo. Cosi' un'installazione
   fallita lascia il service worker di prima con la sua copia intera, e il
   browser riprova alla visita dopo. L'elenco contro i file veri lo controlla
   tests/js/web-sw.test.mjs. */
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE)
    .then(c => c.addAll(GUSCIO))
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
      /* Una copia per PAGINA, non per indirizzo: il generatore si apre con
         ?service=..&mese=.. diversi per ogni sito, e ognuno lasciava in cache
         la sua copia di schede/index.html (200 KB) fino al cambio di versione.
         Il ripiego qui sotto cerca gia' con ignoreSearch. */
      if (r.ok) (await caches.open(CACHE)).put(u.search ? u.origin + u.pathname : e.request, r.clone());
      return r;
    } catch {
      /* Il tracker come ripiego solo per le PAGINE: a uno script o a un foglio
         mancante l'HTML di index.html arrivava come modulo, il browser lo
         rifiutava per il tipo MIME e l'app restava bianca invece di dire
         offline (tests/js/web-sw.test.mjs). */
      return (await caches.match(e.request, { ignoreSearch: true })) ||
        (e.request.mode === 'navigate' && await caches.match('/index.html')) ||
        new Response('Offline', { status: 503 });
    }
  })());
});
