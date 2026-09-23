/* web-condividi.test.mjs - web/js/condividi.js (MOB-16): il link di un sito,
   il foglio di condivisione del sistema e il ripiego "Copia link". */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  TOCCO, condivisioneNativa, linkService, serviceDaIndirizzo, condividiLink,
} from '../../web/js/condividi.js';

const dati = { titolo: 'ACME – Via Roma', testo: 'Mappatura ACME – Via Roma', url: 'https://crono.example/?service=12' };
const finestra = matches => ({ matchMedia: q => ({ matches: matches && q === TOCCO }) });

test('linkService e serviceDaIndirizzo si capiscono', () => {
  assert.equal(linkService(12, 'https://crono.example'), 'https://crono.example/?service=12');
  assert.equal(serviceDaIndirizzo('?service=12'), 12);
  assert.equal(serviceDaIndirizzo('?anno=2026&service=7&mese=3'), 7);
  assert.equal(serviceDaIndirizzo(''), 0);
  assert.equal(serviceDaIndirizzo('?service=abc'), 0);
  assert.equal(serviceDaIndirizzo('?service=-3'), 0);
  assert.equal(serviceDaIndirizzo('?service=1.5'), 0);
});

test('il foglio del sistema si usa solo con la mano da telefono', () => {
  const nav = { share: async () => {} };
  assert.equal(condivisioneNativa(nav, finestra(true)), true);
  assert.equal(condivisioneNativa(nav, finestra(false)), false);
  assert.equal(condivisioneNativa({}, finestra(true)), false);
  assert.equal(condivisioneNativa(nav, {}), false);
  assert.equal(TOCCO, '(max-width: 767px), (hover: none) and (pointer: coarse)');
});

test('condiviso: il foglio riceve titolo, testo e link; niente copia', async () => {
  const visti = [];
  const nav = { share: async d => { visti.push(d); }, canShare: () => true };
  const copia = async () => { throw new Error('non doveva copiare'); };
  assert.equal(await condividiLink(dati, { nav, copia }), 'condiviso');
  assert.deepEqual(visti, [{ title: dati.titolo, text: dati.testo, url: dati.url }]);
});

test('annullato: foglio chiuso, nessuna copia', async () => {
  let copiato = false;
  const nav = { share: async () => { throw Object.assign(new Error('x'), { name: 'AbortError' }); } };
  assert.equal(await condividiLink(dati, { nav, copia: async () => (copiato = true) }), 'annullato');
  assert.equal(copiato, false);
});

test('rifiuto del sistema, canShare falso o computer: si copia il link', async () => {
  const copie = [];
  const copia = async t => { copie.push(t); return true; };
  const rifiuta = { share: async () => { throw Object.assign(new Error('x'), { name: 'NotAllowedError' }); } };
  assert.equal(await condividiLink(dati, { nav: rifiuta, copia }), 'copiato');
  let aperto = false;
  const noCan = { share: async () => { aperto = true; }, canShare: () => false };
  assert.equal(await condividiLink(dati, { nav: noCan, copia }), 'copiato');
  assert.equal(aperto, false);
  assert.equal(await condividiLink(dati, { nav: { share: async () => { aperto = true; } }, copia, nativo: false }), 'copiato');
  assert.equal(aperto, false);
  assert.deepEqual(copie, [dati.url, dati.url, dati.url]);
});

test('ne foglio ne appunti: non-riuscito, senza eccezioni', async () => {
  assert.equal(await condividiLink(dati, { nav: {}, copia: async () => false }), 'non-riuscito');
  // senza `copia` si prova navigator.clipboard, e un rifiuto non esce
  assert.equal(await condividiLink(dati, { nav: { clipboard: { writeText: async () => { throw new Error('no'); } } } }), 'non-riuscito');
  assert.equal(await condividiLink(dati, { nav: { clipboard: { writeText: async () => {} } } }), 'copiato');
});

test('una copia che LANCIA (appunti negati dal browser) e\' non-riuscito, non un errore non gestito', async () => {
  const copia = async () => { throw new Error('Document is not focused'); };
  assert.equal(await condividiLink(dati, { nav: {}, copia }), 'non-riuscito');
  const copiaSincrona = () => { throw new Error('no'); };
  assert.equal(await condividiLink(dati, { nav: {}, copia: copiaSincrona }), 'non-riuscito');
  // anche dopo un foglio del sistema che ha rifiutato
  const rifiuta = { share: async () => { throw Object.assign(new Error('x'), { name: 'NotAllowedError' }); } };
  assert.equal(await condividiLink(dati, { nav: rifiuta, copia }), 'non-riuscito');
});

test('linkService: l\'id va nell\'indirizzo codificato, e un indirizzo vuoto resta relativo', () => {
  assert.equal(linkService('a&b', 'https://x.it'), 'https://x.it/?service=a%26b');
  assert.equal(linkService(5, ''), '/?service=5');
});
