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
