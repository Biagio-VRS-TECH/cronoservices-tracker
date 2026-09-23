/* web-schede.test.mjs - il generatore di schede tecnici (web/js/schede.js).
   COD-07: lo script era in linea in web/schede/index.html, fuori da test e da
   `node --check`. E' uno script CLASSICO che lavora su funzioni globali: lo si
   fa girare in un contesto vm con un DOM finto "che dice di si' a tutto" (ogni
   proprieta' e ogni chiamata tornano lo stesso finto), quanto basta perche' il
   codice in cima (agganci ai pulsanti, tema, tour, primo render) non si fermi.
   Poi si provano le funzioni pure: lettura della riga Excel, modello
   piano/reparto/stanza, ordini, calzature. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Script, createContext } from 'node:vm';

const FILE = new URL('../../web/js/schede.js', import.meta.url);
const CODICE = readFileSync(FILE, 'utf8');

/** Un oggetto finto qualunque: si legge, si scrive, si chiama, si somma. */
function finto() {
  const f = function () { return p; };
  const p = new Proxy(f, {
    get(_, k) {
      if (k === Symbol.toPrimitive) return () => 0;
      if (k === Symbol.iterator) return function* () { };
      if (k === 'then') return undefined;          // non e' una promessa
      return p;
    },
    set() { return true; },
    apply() { return p; },
    construct() { return p; },
    has() { return true; },
  });
  return p;
}

function memoria() {
  const m = new Map();
  return {
    getItem: k => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: k => { m.delete(k); },
  };
}

/** Esegue schede.js e ritorna il contesto: le sue funzioni globali ci stanno sopra. */
function carica() {
  const F = finto();
  const ctx = {
    console, Math, JSON, Date, RegExp, String, Number, Array, Object, Intl,
    setTimeout: () => 0, clearTimeout: () => { }, setInterval: () => 0, clearInterval: () => { },
    requestAnimationFrame: () => 0, cancelAnimationFrame: () => { },
    localStorage: memoria(), sessionStorage: memoria(),
    matchMedia: () => ({ matches: false, addEventListener() { }, addListener() { } }),
    location: new URL('http://localhost/schede/'),
    navigator: { userAgent: 'node' },
    document: F, Tour: F, XLSX: F, ResizeObserver: function () { return F; },
    IntersectionObserver: function () { return F; }, MutationObserver: function () { return F; },
    getComputedStyle: () => F, addEventListener() { }, removeEventListener() { },
    innerWidth: 1440, innerHeight: 900, devicePixelRatio: 1,
  };
  ctx.window = ctx;
  ctx.self = ctx;
  createContext(ctx);
  new Script(CODICE, { filename: 'schede.js' }).runInContext(ctx);
  return ctx;
}

const S = carica();

test('si analizza come script classico e gira fino in fondo senza errori', () => {
  // `new Script` fa lo stesso controllo di `node --check`; qui in piu' e' girato
  assert.equal(typeof S.render, 'function');
});

test('le funzioni che la pagina e ponte.js cercano su window ci sono', () => {
  for (const n of ['loadRows', 'unloadFile', 'aggiornaTitoloSito', 'readFile', 'render',
    'buildModel', 'parseEntry', 'findNoteCol', 'cardHTML', 'setTheme', 'startTour',
    'applyFilter', 'showNotes', 'closeNotes', 'showSkippedRows', 'closeSkippedRows']) {
    assert.equal(typeof S[n], 'function', n);
  }
  assert.match(S.LOGO, /^data:image\/png;base64,/);
  assert.ok(S.DENS[4] && S.DENS[12].compact);
});

test('parseEntry: codice, descrizione e i campi dopo PIANO:', () => {
  const it = S.parseEntry('112648 - SCARPA YODA S3 PIANO: TERRA; REPARTO: ALZHEIMER; STANZA: 51; POSIZIONE: 2.', '  da  cambiare ');
  assert.equal(it.code, '112648');
  assert.equal(it.desc, 'SCARPA YODA S3');
  assert.equal(it.piano, 'TERRA');
  assert.equal(it.reparto, 'ALZHEIMER');
  assert.equal(it.stanza, '51');
  assert.equal(it.posizione, '2');
  assert.equal(it.note, 'da cambiare');
  // i campi mancanti si dicono, non restano vuoti
  const vuoto = S.parseEntry('ABC - PRESA PIANO: 1', '');
  assert.equal(vuoto.reparto, '— NON INDICATO —');
  assert.equal(vuoto.stanza, '— NON INDICATO —');
});

test('buildModel: albero in ordine edilizio, schede per posizione, righe ignorate', () => {
  const righe = [
    ['', 'Tipo di dato'],
    ['A1 - UNO PIANO: PRIMO; REPARTO: R; STANZA: S; POSIZIONE: 10', 'nota uno'],
    ['A2 - DUE PIANO: TERRA; REPARTO: R; STANZA: S; POSIZIONE: 2', ''],
    ['A3 - TRE PIANO: TERRA; REPARTO: R; STANZA: S; POSIZIONE: 1', 'nota tre'],
    ['una riga lunga che non e una scheda del file di mappatura', ''],
  ];
  const m = S.buildModel(righe);
  assert.equal(m.items.length, 3);
  assert.equal(m.noteCol, 1);
  assert.equal(m.withNotes, 2);
  assert.equal(m.skipped, 1);
  // Array.from: gli array nati nel contesto vm hanno un altro prototipo
  assert.deepEqual(Array.from(m.tree, p => p.name), ['TERRA', 'PRIMO']);
  assert.deepEqual(Array.from(m.tree[0].kids[0].kids[0].items, i => i.code), ['A3', 'A2']);
});

test('natCmp e floorLevel: 2 prima di 10, interrato prima di terra prima di primo', () => {
  assert.deepEqual(['10', '', '2', 'B3', '1A'].sort(S.natCmp), ['1A', '2', '10', 'B3', '']);
  assert.equal(S.floorLevel('PIANO INTERRATO'), -1);
  assert.equal(S.floorLevel('TERRA EST'), 0);
  assert.equal(S.floorLevel('-2'), -2);
  assert.equal(S.floorLevel('ESTERNO'), null);
});

test('calzature: codice esatto o con asterisco; esc toglie i caratteri HTML', () => {
  assert.equal(S.isShoe({ code: '112648' }), true);
  assert.equal(S.isShoe({ code: '999' }), false);
  const regole = S.parseShoeCodes('1126*, 42');
  assert.equal(regole.length, 2);
  assert.ok(regole[0].re.test('112699'));
  assert.equal(regole[1].code, '42');
  assert.equal(S.esc('<b>&</b>'), '&lt;b&gt;&amp;&lt;/b&gt;');
  assert.equal(S.escA('"x"'), '&quot;x&quot;');
});

test('la pagina carica schede.js al posto dello script in linea, e il guscio lo mette in cache', () => {
  const html = readFileSync(new URL('../../web/schede/index.html', import.meta.url), 'utf8');
  assert.match(html, /<script src="\/js\/schede\.js"><\/script>/);
  // nessuno script in linea rimasto (solo script con src)
  assert.equal((html.match(/<script(?![^>]*\bsrc=)[^>]*>/g) || []).length, 0);
  // l'ordine conta: dopo xlsx e tour, prima di gruppi e ponte
  const pos = s => html.indexOf(s);
  assert.ok(pos('/lib/xlsx.min.js') < pos('/js/schede.js'));
  assert.ok(pos('/js/tour.js') < pos('/js/schede.js'));
  assert.ok(pos('/js/schede.js') < pos('/js/gruppi.js'));
  assert.ok(pos('/js/schede.js') < pos('src="ponte.js"'));
  const sw = readFileSync(new URL('../../web/sw.js', import.meta.url), 'utf8');
  assert.match(sw, /'\/js\/schede\.js'/);
});
