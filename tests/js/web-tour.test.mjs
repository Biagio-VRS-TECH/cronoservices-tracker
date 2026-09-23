/* web-tour.test.mjs - il tutorial guidato dei generatori (web/js/tour.js) e le
   scorciatoie a un tasto del tracker (web/js/ui.js).
   MOV-07: la corsa del buco da un bersaglio all'altro e' una trasformazione
   inversa (FLIP) che si calcola senza DOM: `Tour.flip`. A11Y-15 (WCAG 2.1.4):
   le scorciatoie a un tasto si spengono e la scelta resta nel browser. */
import './web-ambiente.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { scorciatoieAccese, impostaScorciatoie } from '../../web/js/ui.js';

/* tour.js e' uno script classico che si appende a `window`: lo si fa girare in
   un contesto con un `window` vuoto e se ne legge `window.Tour` */
function caricaTour() {
  const codice = readFileSync(new URL('../../web/js/tour.js', import.meta.url), 'utf8');
  const window = {};
  runInNewContext(codice, { window });
  return window.Tour;
}

test('flip: senza un buco di prima si va a posto e basta', () => {
  const { flip } = caricaTour();
  assert.deepEqual({ ...flip(null, 10, 20, 100, 40) },
    { da: null, a: 'translate(10px,20px) scale(1,1)', spread: '9999px' });
  // un buco nascosto o annullato (passo senza bersaglio) misura zero
  assert.equal(flip({ left: 0, top: 0, width: 0, height: 0 }, 1, 2, 3, 4).da, null);
  // verso un passo senza bersaglio (misura zero) non c'e' corsa
  assert.equal(flip({ left: 5, top: 5, width: 50, height: 50 }, 1, 2, 0, 0).da, null);
});

test('flip: parte dal posto vecchio grande come il vecchio, arriva a scala 1', () => {
  const { flip } = caricaTour();
  const f = flip({ left: 20, top: 200, width: 100, height: 40 }, 300, 100, 400, 400);
  assert.equal(f.da, 'translate(20px,200px) scale(0.25,0.1)');
  assert.equal(f.a, 'translate(300px,100px) scale(1,1)');
  // a scala 0,1 l'ombra coprirebbe un decimo: la si allarga dieci volte
  assert.equal(f.spread, '99990px');
});

test('flip: da grande a piccolo l ombra non si allarga, e una scala minuscola ha un tetto', () => {
  const { flip } = caricaTour();
  assert.equal(flip({ left: 0, top: 0, width: 800, height: 600 }, 10, 10, 200, 40).spread, '9999px');
  assert.equal(flip({ left: 0, top: 0, width: 1, height: 1 }, 0, 0, 2000, 2000).spread, '499950px');
});

test('scorciatoie a un tasto: accese di partenza, si spengono e si riaccendono', () => {
  localStorage.removeItem('cs.scorciatoie');
  assert.equal(scorciatoieAccese(), true);
  impostaScorciatoie(false);
  assert.equal(scorciatoieAccese(), false);
  assert.equal(localStorage.getItem('cs.scorciatoie'), '0');
  impostaScorciatoie(true);
  assert.equal(scorciatoieAccese(), true);
  // riaccese = nessuna scelta salvata, come prima
  assert.equal(localStorage.getItem('cs.scorciatoie'), null);
});

test('il CSS del tutorial non anima left/top/width/height', () => {
  const css = readFileSync(new URL('../../web/css/banco.css', import.meta.url), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '');
  const regole = css.match(/#tour(Hole|Pop)\{[^}]*\}/g) || [];
  assert.ok(regole.length >= 2);
  for (const r of regole) {
    const t = /transition:([^;}]+)/.exec(r);
    if (t) assert.doesNotMatch(t[1], /\b(left|top|width|height|all)\b/, r);
  }
});

/* ------------------------------------------------ i bersagli dei passi ---
   I passi puntano a elementi delle pagine dei generatori con un selettore: se
   un id cambia nell'HTML il passo resta, ma il fumetto finisce al centro
   parlando di un comando che non indica piu'. Il tracker (web/index.html) non
   ha una guida: i passi sono solo in js/schede.js e registro/app.js. */
const leggi = p => readFileSync(new URL('../../web/' + p, import.meta.url), 'utf8');

/** I selettori dei passi, come scritti nel sorgente (`sel:'#x'`, `sel:['#a','#b']`, `sel:null`). */
function selettoriDeiPassi(sorgente) {
  const out = [];
  for (const [, uno, lista] of sorgente.matchAll(/\bsel:\s*(?:'([^']*)'|\[([^\]]*)\]|null)/g)) {
    if (uno !== undefined) out.push(uno);
    else if (lista !== undefined) out.push(...[...lista.matchAll(/'([^']*)'/g)].map(m => m[1]));
  }
  return out;
}

/** Il selettore c'e' nella pagina: un id o una classe nell'HTML (tutti e due
 *  i generatori non creano da JS nessuno dei loro bersagli). */
function esisteIn(html, sel) {
  const m = /^#([\w-]+)$/.exec(sel) || /^\.([\w-]+)$/.exec(sel);
  assert.ok(m, `selettore non semplice, da controllare a mano: ${sel}`);
  if (sel[0] === '#') return new RegExp(`\\bid="${m[1]}"`).test(html);
  return new RegExp(`\\bclass="[^"]*\\b${m[1]}\\b[^"]*"`).test(html);
}

for (const [nome, sorgente, pagina] of [
  ['schede tecnici', 'js/schede.js', 'schede/index.html'],
  ['registro componenti', 'registro/app.js', 'registro/index.html'],
]) {
  test(`guida (${nome}): ogni bersaglio esiste in ${pagina}`, () => {
    const sel = selettoriDeiPassi(leggi(sorgente));
    assert.ok(sel.length >= 10, 'passi non trovati nel sorgente');
    const html = leggi(pagina);
    const mancano = sel.filter(s => !esisteIn(html, s));
    assert.deepEqual(mancano, []);
    // i due bottoni che la riaprono
    assert.ok(esisteIn(html, '#tourBtn') && esisteIn(html, '#startTutorial'));
  });
}

test('il tracker non ha una guida da tenere allineata', () => {
  assert.doesNotMatch(leggi('index.html'), /tour\.js/);
  assert.doesNotMatch(leggi('js/app.js'), /Tour\.crea/);
});

/* -------------------------------------------- il giro, passo per passo ---
   tour.js in un contesto vm con un DOM giocattolo: gli elementi nascono dagli
   id scritti nell'innerHTML del markup, e si leggono per id. */
function giocattolo() {
  const perId = new Map(), tasti = [];
  const memoria = new Map();
  const nodo = (id = '') => {
    const cl = new Set();
    const n = {
      id, hidden: false, disabled: false, textContent: '', children: [], _html: '', className: '',
      offsetWidth: 300, offsetHeight: 160, onclick: null,
      style: { setProperty() { }, removeProperty() { } },
      classList: { add: c => cl.add(c), remove: c => cl.delete(c), contains: c => cl.has(c) },
      attr: {}, setAttribute(k, v) { this.attr[k] = String(v); }, getAttribute(k) { return this.attr[k] ?? null; },
      addEventListener() { }, focus() { doc.activeElement = n; }, get isConnected() { return true; },
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 0, height: 0, right: 0, bottom: 0 }),
      getClientRects: () => [], querySelectorAll: () => [],
      get innerHTML() { return this._html; },
      set innerHTML(v) {
        this._html = String(v);            // come il browser: undefined diventa "undefined"
        for (const [, k] of this._html.matchAll(/id="([^"]+)"/g)) perId.set(k, nodo(k));
        this.children = [...this._html.matchAll(/<i><\/i>/g)].map(() => ({ className: '' }));
      },
    };
    return n;
  };
  const doc = {
    activeElement: null,
    getElementById: k => perId.get(k) || null,
    createElement: () => nodo(),
    querySelector: () => null,
    body: { appendChild: n => { if (n.id) perId.set(n.id, n); return n; } },
    documentElement: { clientWidth: 1200, clientHeight: 800 },
  };
  const window = { innerWidth: 1200, innerHeight: 800, addEventListener: (t, fn) => { if (t === 'keydown') tasti.push(fn); } };
  runInNewContext(readFileSync(new URL('../../web/js/tour.js', import.meta.url), 'utf8'), {
    window, document: doc, requestAnimationFrame: () => 0, setTimeout: () => 0,
    matchMedia: () => ({ matches: true }), getComputedStyle: () => ({}),
    localStorage: { getItem: k => memoria.get(k) ?? null, setItem: (k, v) => memoria.set(k, String(v)) },
  });
  const premi = key => tasti.forEach(fn => fn({ key, preventDefault() { } }));
  return { Tour: window.Tour, el: k => perId.get(k), memoria, premi };
}

const PASSI = [
  { sel: null, title: 'Uno', tx: '<p>primo</p>' },
  { sel: '#nonCe', title: 'Due', tx: '<p>secondo</p>', note: 'nota', off: 'compare col file' },
  { sel: null, title: 'Tre', tx: '<p>terzo</p>' },
];

test('giro: numeri, titoli, Indietro spento al primo, «Ho capito» all’ultimo, e poi si ricorda', () => {
  const { Tour, el, memoria } = giocattolo();
  const t = Tour.crea({ passi: PASSI, chiave: 'prova.tour' });
  assert.equal(t.vista(), false);
  t.avvia();
  assert.equal(t.attivo(), true);
  assert.equal(el('tourWrap').hidden, false);
  assert.equal(el('tourNum').textContent, '1 di 3');
  assert.equal(el('tourTitle').textContent, 'Uno');
  assert.equal(el('tourPrev').disabled, true);
  assert.equal(el('tourDots').children.length, 3);
  el('tourNext').onclick();
  assert.equal(el('tourNum').textContent, '2 di 3');
  // il bersaglio non c'e': vale la nota "off", non quella normale
  assert.equal(el('tourNote').innerHTML, 'compare col file');
  assert.equal(el('tourNote').hidden, false);
  assert.equal(el('tourDots').children[0].className, 'done');
  assert.equal(el('tourDots').children[1].className, 'on');
  el('tourNext').onclick();
  assert.equal(el('tourNext').textContent, 'Ho capito');
  el('tourNext').onclick();
  assert.equal(t.attivo(), false);
  assert.equal(el('tourWrap').hidden, true);
  assert.equal(memoria.get('prova.tour'), '1');
  assert.equal(t.vista(), true);
});

test('giro: frecce e Esc; Indietro al primo passo resta al primo', () => {
  const { Tour, el, premi } = giocattolo();
  let chiuso = 0;
  const t = Tour.crea({ passi: PASSI, dopo: () => { chiuso++; } });
  t.avvia();
  premi('ArrowLeft');
  assert.equal(el('tourNum').textContent, '1 di 3');
  premi('ArrowRight'); premi('PageDown');
  assert.equal(el('tourNum').textContent, '3 di 3');
  premi('Escape');
  assert.equal(t.attivo(), false);
  assert.equal(chiuso, 1);
  premi('ArrowRight');                // a guida chiusa i tasti sono della pagina
  assert.equal(t.attivo(), false);
});

test('una guida senza passi non si rompe all’avvio (e non resta aperta)', () => {
  const { Tour, el } = giocattolo();
  const t = Tour.crea({ passi: [] });
  assert.doesNotThrow(() => t.avvia());
  assert.equal(t.attivo(), false);
  assert.equal(el('tourWrap').hidden, true);
});

test('un passo senza testo mostra il vuoto, non la parola «undefined»', () => {
  const { Tour, el } = giocattolo();
  Tour.crea({ passi: [{ sel: null, title: 'Solo titolo' }] }).avvia();
  assert.equal(el('tourText').innerHTML, '');
  assert.equal(el('tourNote').hidden, true);
});
