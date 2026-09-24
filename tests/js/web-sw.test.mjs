/* web-sw.test.mjs - il service worker (web/sw.js, #ANCHOR: sw).
   Due cose:
   1. l'ELENCO del guscio (GUSCIO) contro i file veri su disco: un file
      nell'elenco che non c'e' fa fallire in silenzio il suo `c.add` (install
      usa allSettled) e offline quella pagina non si apre; un modulo che le
      pagine caricano ma che manca dall'elenco offline non c'e'. Si legge la
      cartella web/ e il grafo degli import delle tre pagine (tracker, schede,
      registro);
   2. la STRATEGIA: sw.js gira in un contesto vm con `self`, `caches` e
      `fetch` finti. Prima la rete, poi la copia; una copia per pagina (senza
      ?query); e il ripiego su index.html solo per le NAVIGAZIONI: a uno
      script o a un foglio di stile che manca offline si risponde 503, non con
      l'HTML del tracker (che il browser rifiuta come modulo con un errore di
      tipo MIME, e l'app resta bianca invece di dire "offline").
   Il numero di versione (crono-guscio-vNN) non si tocca qui: lo alza il
   coordinatore a ogni pubblicazione. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, posix } from 'node:path';
import { runInNewContext } from 'node:vm';

const WEB = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'web');
const CODICE = readFileSync(join(WEB, 'sw.js'), 'utf8');

/* ------------------------------------------------------------ l'elenco --- */
function guscio() {
  const blocco = /const GUSCIO = \[([\s\S]*?)\];/.exec(CODICE)[1].replace(/\/\*[\s\S]*?\*\//g, '');
  return [...blocco.matchAll(/'([^']+)'/g)].map(m => m[1]);
}
const suDisco = u => join(WEB, u.endsWith('/') ? u + 'index.html' : u);

/** I file (percorsi web, con la barra davanti) sotto una cartella di web/. */
function elenca(cartella) {
  const out = [];
  for (const n of readdirSync(join(WEB, cartella))) {
    const rel = posix.join(cartella, n);
    if (statSync(join(WEB, rel)).isDirectory()) out.push(...elenca(rel));
    else out.push('/' + rel);
  }
  return out;
}

/** Tutto quello che una pagina carica da se': src/href locali dell'HTML e,
 *  dai moduli, gli import statici (anche a catena). */
function caricatiDa(pagina) {
  const base = '/' + posix.dirname(pagina).replace(/^\.$/, '');
  const assoluto = (u, da) => (u.startsWith('/') ? u : posix.normalize(posix.join(da, u)));
  const html = readFileSync(join(WEB, pagina), 'utf8');
  const visti = new Set(), coda = [];
  for (const [, u] of html.matchAll(/(?:src|href)="([^"#?]+)"/g)) {
    if (/^(https?:|data:|mailto:|tel:)/.test(u)) continue;
    coda.push(assoluto(u, base));
  }
  while (coda.length) {
    const u = coda.pop();
    if (visti.has(u)) continue;
    visti.add(u);
    if (!u.endsWith('.js') || !existsSync(join(WEB, u))) continue;
    const src = readFileSync(join(WEB, u), 'utf8');
    const qui = posix.dirname(u);
    for (const [, dep] of src.matchAll(/^\s*(?:import|export)\b[^'"]*?from\s*'([^']+\.js)'/gm)) coda.push(assoluto(dep, qui));
    for (const [, dep] of src.matchAll(/^\s*import\s*'([^']+\.js)'/gm)) coda.push(assoluto(dep, qui));
  }
  return visti;
}

test('ogni voce del guscio esiste su disco, senza doppioni', () => {
  const g = guscio();
  assert.ok(g.length > 40);
  assert.equal(new Set(g).size, g.length, 'voci ripetute');
  for (const u of g) assert.ok(existsSync(suDisco(u)), `nel guscio ma non su disco: ${u}`);
});

test('ogni modulo, foglio di stile e carattere su disco e\' nel guscio (tranne /lib)', () => {
  const g = new Set(guscio());
  const serve = [...elenca('js'), ...elenca('css'), ...elenca('assets/fonti'),
    ...elenca('schede'), ...elenca('registro')]
    .filter(u => /\.(js|css|woff2|html)$/.test(u));
  const mancano = serve.filter(u => !g.has(u));
  assert.deepEqual(mancano, [], 'su disco ma non nel guscio');
});

test('le tre pagine trovano offline tutto quello che caricano (le librerie PDF/Excel escluse, PERF-09)', () => {
  const g = new Set(guscio());
  for (const pagina of ['index.html', 'schede/index.html', 'registro/index.html']) {
    const mancano = [...caricatiDa(pagina)].filter(u => !g.has(u) && !u.startsWith('/lib/'));
    assert.deepEqual(mancano, [], pagina);
    // e ogni riferimento punta a un file vero
    for (const u of caricatiDa(pagina)) assert.ok(existsSync(join(WEB, u)), `${pagina} carica ${u}, che non esiste`);
  }
  assert.ok(g.has('/') && g.has('/schede/') && g.has('/registro/'));
});

test('le librerie di /lib non si precaricano, ma su disco ci sono', () => {
  const g = guscio();
  assert.ok(!g.some(u => u.startsWith('/lib/')));
  for (const f of ['xlsx.min.js', 'jspdf.umd.min.js', 'html2canvas.min.js']) {
    assert.ok(existsSync(join(WEB, 'lib', f)), f);
  }
});

/* ---------------------------------------------------------- la strategia -- */
const ORIGINE = 'http://localhost:8770';
const ATTUALE = /const CACHE = '([^']+)'/.exec(CODICE)[1];

/** Esegue sw.js in un contesto finto. `rete(url)` risponde o lancia. */
function avviaSw({ rete = () => { throw new TypeError('Failed to fetch'); }, gia = {}, rotti = [] } = {}) {
  const ascolta = {};
  const cache = new Map(Object.entries(gia));   // chiave: url assoluto senza ricerca per le put
  const chiavi = new Set([ATTUALE, 'crono-guscio-v1', 'altra-cache']);
  const aggiunti = [];
  let attivato = 0;
  const risposta = (corpo, stato = 200, tipo = 'text/html') =>
    ({ ok: stato >= 200 && stato < 300, status: stato, corpo, tipo, clone() { return this; } });
  const cercaInCache = (req, opz = {}) => {
    const url = new URL(typeof req === 'string' ? req : req.url, ORIGINE);
    const k = opz.ignoreSearch ? url.origin + url.pathname : url.href;
    for (const [c, r] of cache) {
      const u = new URL(c, ORIGINE);
      if ((opz.ignoreSearch ? u.origin + u.pathname : u.href) === k) return r;
    }
    return undefined;
  };
  const contenitore = {
    // come il browser: add/addAll scaricano; addAll e' tutto o niente
    add: async u => { if (rotti.includes(u)) throw new TypeError('404 ' + u); aggiunti.push(u); },
    addAll: async lista => {
      const rotto = lista.find(u => rotti.includes(u));
      if (rotto) throw new TypeError('404 ' + rotto);
      aggiunti.push(...lista);
    },
    put: async (req, r) => { cache.set(typeof req === 'string' ? req : req.url, r); },
  };
  const self = {
    addEventListener: (tipo, fn) => { ascolta[tipo] = fn; },
    skipWaiting: async () => { attivato++; },
    clients: { claim: async () => { } },
  };
  const ctx = {
    self, URL, Promise, Response: class { constructor(corpo, o = {}) { this.corpo = corpo; this.status = o.status ?? 200; } },
    location: new URL(ORIGINE + '/sw.js'),
    fetch: async req => rete(typeof req === 'string' ? req : req.url, req),
    caches: {
      open: async () => contenitore,
      match: async (req, opz) => cercaInCache(req, opz),
      keys: async () => [...chiavi],
      delete: async k => chiavi.delete(k),
    },
  };
  runInNewContext(CODICE, ctx);
  /** Simula un fetch del browser: ritorna la risposta data a respondWith, o
   *  undefined se il service worker lascia passare. */
  async function chiedi(url, { method = 'GET', mode = 'cors', destination = 'script' } = {}) {
    let data;
    const request = { url: new URL(url, ORIGINE).href, method, mode, destination };
    ascolta.fetch({ request, respondWith: p => { data = p; } });
    return data && await data;
  }
  return { ascolta, cache, chiavi, aggiunti, chiedi, risposta, attivato: () => attivato };
}

test('install mette in cache tutto il guscio; activate butta le cache vecchie', async () => {
  const sw = avviaSw();
  let attesa;
  sw.ascolta.install({ waitUntil: p => { attesa = p; } });
  await attesa;
  assert.deepEqual(sw.aggiunti, guscio());
  sw.ascolta.activate({ waitUntil: p => { attesa = p; } });
  await attesa;
  assert.deepEqual([...sw.chiavi], [ATTUALE]);
});

test('le API, le scritture e le altre origini non passano dal service worker', async () => {
  const sw = avviaSw({ rete: () => sw.risposta('x') });
  assert.equal(await sw.chiedi('/api/bootstrap?anno=2026'), undefined);
  assert.equal(await sw.chiedi('/api/documento', { method: 'POST' }), undefined);
  assert.equal(await sw.chiedi('/js/app.js', { method: 'POST' }), undefined);
  assert.equal(await sw.chiedi('https://xyz.supabase.co/rest/v1/rpc/app_bootstrap'), undefined);
});

test('in rete: la risposta fresca, e in cache una copia per pagina (senza ?query)', async () => {
  let n = 0;
  const sw = avviaSw({ rete: u => sw.risposta('fresca ' + (++n) + ' ' + u) });
  const r = await sw.chiedi('/schede/?service=12&mese=3', { mode: 'navigate', destination: 'document' });
  assert.match(r.corpo, /^fresca 1/);
  await sw.chiedi('/schede/?service=99&mese=5', { mode: 'navigate', destination: 'document' });
  const copie = [...sw.cache.keys()].filter(k => k.includes('/schede/'));
  assert.deepEqual(copie, [ORIGINE + '/schede/']);
  // una risposta d'errore non sostituisce la copia buona
  const sw2 = avviaSw({ rete: () => sw2.risposta('rotto', 500), gia: { [ORIGINE + '/js/ui.js']: 'buona' } });
  const r2 = await sw2.chiedi('/js/ui.js');
  assert.equal(r2.status, 500);
  assert.equal(sw2.cache.get(ORIGINE + '/js/ui.js'), 'buona');
});

test('senza rete: la copia in cache, cercata senza la ?query', async () => {
  const sw = avviaSw({ gia: { [ORIGINE + '/js/ui.js']: 'ui in cache', [ORIGINE + '/schede/']: 'schede in cache',
    '/index.html': 'tracker in cache' } });
  assert.equal(await sw.chiedi('/js/ui.js'), 'ui in cache');
  assert.equal(await sw.chiedi('/schede/?service=12', { mode: 'navigate', destination: 'document' }), 'schede in cache');
});

test('senza rete, una PAGINA che non c\'e\' in cache apre il tracker', async () => {
  const sw = avviaSw({ gia: { '/index.html': 'tracker in cache' } });
  assert.equal(await sw.chiedi('/?service=7', { mode: 'navigate', destination: 'document' }), 'tracker in cache');
  const vuoto = avviaSw();
  const r = await vuoto.chiedi('/', { mode: 'navigate', destination: 'document' });
  assert.equal(r.status, 503);
});

test('senza rete, uno script o un foglio che non c\'e\' in cache ha 503, non l\'HTML del tracker', async () => {
  const sw = avviaSw({ gia: { '/index.html': 'tracker in cache' } });
  const js = await sw.chiedi('/js/modulo-nuovo.js', { destination: 'script' });
  assert.notEqual(js, 'tracker in cache');
  assert.equal(js.status, 503);
  const css = await sw.chiedi('/css/nuovo.css', { mode: 'no-cors', destination: 'style' });
  assert.equal(css.status, 503);
  const img = await sw.chiedi('/assets/manca.png', { mode: 'no-cors', destination: 'image' });
  assert.equal(img.status, 503);
});

test('un file del guscio che non si scarica ferma l’installazione: resta il service worker di prima, con la sua copia intera', async () => {
  /* con allSettled il nuovo si attivava lo stesso, cancellava la cache vecchia
     e offline mancava quel file: moduli nuovi senza un pezzo, o mescolati ai
     vecchi. Tutto o niente: il browser riprova l'installazione alla prossima
     visita, e intanto in rete si vede comunque l'ultima versione. */
  const sw = avviaSw({ rotti: ['/js/ui.js'] });
  let attesa;
  sw.ascolta.install({ waitUntil: p => { attesa = p; } });
  await assert.rejects(attesa);
  assert.equal(sw.attivato(), 0);
  const ok = avviaSw();
  ok.ascolta.install({ waitUntil: p => { attesa = p; } });
  await attesa;
  assert.equal(ok.attivato(), 1);
});
