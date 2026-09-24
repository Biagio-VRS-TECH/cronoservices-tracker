/* web-albero.test.mjs - l'albero piano > reparto > stanza del registro
   (web/js/albero.js, #ANCHOR: albero).
   - il CERCHIO A TRE STATI di un contenitore si conta dai figli: tutti dentro
     = pieno, nessuno = vuoto, qualcuno (o un figlio "in parte") = trattino.
     E' `riassumi`, senza DOM;
   - i NOMI di piani, reparti e stanze vengono dall'Excel: nell'HTML
     costruito a mano restano testo, anche dentro gli attributi (aria-label,
     data-nome), e le chiavi non finiscono negli attributi (il registro le
     compone con un NUL, che il parser HTML cambierebbe in U+FFFD). */
import './web-ambiente.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { creaAlbero, riassumi } from '../../web/js/albero.js';

const x = (checked, indeterminate = false) => ({ checked, indeterminate });

test('riassumi: pieno, vuoto, trattino', () => {
  assert.deepEqual(riassumi([x(true), x(true)]), { checked: true, indeterminate: false });
  assert.deepEqual(riassumi([x(false), x(false)]), { checked: false, indeterminate: false });
  assert.deepEqual(riassumi([x(true), x(false)]), { checked: true, indeterminate: true });
  // un figlio tutto dentro ma "in parte" sotto: il trattino risale
  assert.deepEqual(riassumi([x(true, true), x(true)]), { checked: true, indeterminate: true });
  // senza figli non c'e' niente da dire: resta com'era
  assert.equal(riassumi([]), null);
});

/* un DOM quanto basta a creaAlbero: gli elementi creati tengono l'innerHTML */
function dom() {
  const creati = [];
  const nodo = () => {
    const n = {
      className: '', innerHTML: '', figli: [], style: {}, dataset: {},
      appendChild(c) { this.figli.push(c); return c; },
      querySelector: () => ({ onclick: null }),
      querySelectorAll: () => [],
      classList: { toggle() { } },
    };
    creati.push(n);
    return n;
  };
  const prima = globalThis.document.createElement;
  globalThis.document.createElement = nodo;
  return { el: nodo(), creati, rimetti: () => { globalThis.document.createElement = prima; } };
}

test('i nomi dall’Excel restano testo, anche negli attributi', () => {
  const cattivo = 'P"><img src=x onerror=alert(1)>';
  const d = dom();
  try {
    creaAlbero(d.el, {
      rami: [{ nome: cattivo, chiave: 'p\u0000', kids: [{ nome: cattivo, chiave: 'p\u0000r',
        kids: [{ nome: cattivo, chiave: 'p\u0000r\u0000s', n: 3 }] }] }],
    });
    const html = d.creati.map(n => n.innerHTML).join('\n');
    assert.ok(html.length > 0);
    assert.doesNotMatch(html, /<img/);
    for (const tag of html.match(/<[^>]+>/g)) assert.equal((tag.match(/"/g) || []).length % 2, 0, tag);
    // le chiavi (col NUL) non stanno nell'HTML: si ritrovano dagli indici
    assert.doesNotMatch(html, /\u0000/);
    assert.match(html, /aria-label="Includi la stanza P&quot;&gt;&lt;img/);
    assert.match(html, /data-p="0" data-r="0" data-s="0"/);
    assert.match(html, /\(3\)/);
  } finally { d.rimetti(); }
});

test('un albero vuoto (o senza rami) non si rompe', () => {
  const d = dom();
  try {
    const a = creaAlbero(d.el, {});
    assert.deepEqual([...a.esclusi()], []);
    const b = creaAlbero(d.el, { rami: [{ nome: 'TERRA', chiave: 'T' }] });
    assert.deepEqual([...b.esclusi()], []);
  } finally { d.rimetti(); }
});
