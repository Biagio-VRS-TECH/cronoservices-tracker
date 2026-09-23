/* web-affinita.test.mjs - web/js/affinita.js: normalizzazione dei nomi,
   distanza fra parole, affinita' 0..1, ricerca tollerante, doppioni.
   I casi veri sono quelli di docs/ai/da-fare.md (17a e 33a sessione):
   "casa umberto primo" -> CASA DI RIPOSO UMBERTO I, "clinik" -> KLINIC, e
   RIZZATO contro UMBERTO I che vale per caso il 50% esatto. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parole, chiaveNorm, dice, distanza, simileParola, pesiParole, affinita,
  terminePassa, classifica, doppioni,
} from '../../web/js/affinita.js';

test('parole: minuscole, accenti, sigle e articoli via, numeri romani unificati', () => {
  assert.deepEqual(parole('CASA DI RIPOSO UMBERTO I'), ['casa', 'riposo', 'umberto', '1']);
  assert.deepEqual(parole('Casa di Riposo Umberto Primo'), ['casa', 'riposo', 'umberto', '1']);
  assert.deepEqual(parole('RIZZATO SPA'), ['rizato']);
  assert.deepEqual(parole('Città Àccènti'), ['cita', 'acenti']);
  assert.deepEqual(parole('REA KLINIC'), parole('rea clinic'));
  assert.deepEqual(parole('Phyllis & Co. S.r.l.'), ['filis', 'co', 's', 'r', 'l']);
});

test('parole: stringhe vuote, null, numeri e simboli non rompono', () => {
  assert.deepEqual(parole(''), []);
  assert.deepEqual(parole(null), []);
  assert.deepEqual(parole(undefined), []);
  assert.deepEqual(parole('   --- ***'), []);
  assert.deepEqual(parole(42), ['42']);
  assert.deepEqual(parole('srl spa di del'), []);
  assert.equal(chiaveNorm('  Casa   di   Riposo  '), 'casa riposo');
});

test('distanza di Damerau-Levenshtein: scambi di vicine contano uno', () => {
  assert.equal(distanza('umbreto', 'umberto'), 1);
  assert.equal(distanza('umberto', 'bertoli'), 4);
  assert.equal(distanza('', 'abc'), 3);
  assert.equal(distanza('abc', ''), 3);
  assert.equal(distanza('abc', 'abc'), 0);
  assert.equal(simileParola('abc', 'abc'), 1);
  assert.ok(simileParola('rizato', 'riposo') <= 0.5);
});

test('dice: casi limite', () => {
  assert.equal(dice('ab', 'ab'), 1);
  assert.equal(dice('a', 'b'), 0);
  assert.equal(dice('', ''), 1);
  assert.ok(dice('gasmedicali', 'gas medicali'.replace(' ', '')) === 1);
});

test('affinita: i nomi veri si riconoscono al 100%', () => {
  assert.equal(affinita('casa umberto primo', 'CASA DI RIPOSO UMBERTO I'), 1);
  assert.equal(affinita('RIZZATO', 'RIZZATO SPA'), 1);
  assert.equal(affinita('rea clinik', 'REA KLINIC'), 1);
  assert.equal(affinita('Umberto I', 'casa di riposo umberto 1 via roma 3 treviso'), 1);
});

test('affinita: vuota o fatta solo di rumore vale 0', () => {
  assert.equal(affinita('', 'CASA'), 0);
  assert.equal(affinita('CASA', ''), 0);
  assert.equal(affinita('SPA SRL', 'RIZZATO SPA'), 0);
  assert.equal(affinita(null, null), 0);
});

test('affinita: RIZZATO contro UMBERTO I e sulla soglia per caso (il difetto della 33a sessione)', () => {
  // e' il numero che rendeva muto il ponte: la soglia assoluta 0,5 passava
  const a = affinita('RIZZATO', 'CASA DI RIPOSO UMBERTO I');
  assert.ok(a >= 0.45 && a <= 0.55, String(a));
  assert.ok(affinita('RIZZATO', 'RIZZATO SPA') - a >= 0.15);
});

test('pesiParole: le parole comuni pesano meno e non fanno sembrare parenti due case di riposo', () => {
  const nomi = ['CASA DI RIPOSO UMBERTO I', 'CASA DI RIPOSO CESARE BERTOLI', 'CASA DI RIPOSO SAN GIUSEPPE', 'RIZZATO SPA'];
  const pesi = pesiParole(nomi);
  assert.ok(pesi.get('casa') < pesi.get('umberto'));
  assert.ok(pesi.get('casa') >= 0.3);
  const senza = affinita('casa di riposo umberto', 'CASA DI RIPOSO CESARE BERTOLI');
  const con = affinita('casa di riposo umberto', 'CASA DI RIPOSO CESARE BERTOLI', pesi);
  assert.ok(con < senza);
  assert.equal(pesiParole([]).size, 0);
});

test('terminePassa: substring, poi tolleranza da 4 lettere in su', () => {
  assert.equal(terminePassa('rea', 'rea klinic'), true);
  assert.equal(terminePassa('clinik', 'rea klinic'), true);
  assert.equal(terminePassa('rex', 'rea klinic'), false);        // corto: solo substring
  assert.equal(terminePassa('umberto primo', 'casa di riposo umberto i'), true);
  assert.equal(terminePassa('ospedale', 'rea klinic'), false);
  assert.equal(terminePassa('spa ', 'rizzato'), false);            // solo rumore: niente
});

test('classifica: ordinata, con il minimo', () => {
  const voci = ['RIZZATO SPA', 'CASA DI RIPOSO UMBERTO I', 'REA KLINIC'];
  const r = classifica('umberto primo', voci, x => x);
  assert.equal(r[0].voce, 'CASA DI RIPOSO UMBERTO I');
  assert.ok(r.every((x, i) => i === 0 || r[i - 1].affinita >= x.affinita));
  assert.deepEqual(classifica('zzzz', voci, x => x), []);
  assert.deepEqual(classifica('umberto', [], x => x), []);
});

test('doppioni: le due grafie dello stesso sito, non i nomi diversi', () => {
  const voci = [{ n: 'REA KLINIC' }, { n: 'REA CLINIK' }, { n: 'OSPEDALE' }, { n: '' }];
  const d = doppioni(voci, v => v.n);
  assert.equal(d.length, 1);
  assert.deepEqual([d[0].a.n, d[0].b.n], ['REA KLINIC', 'REA CLINIK']);
  assert.deepEqual(doppioni([], v => v), []);
});

test('nomi lunghissimi: niente di quadratico che esploda', () => {
  const lungo = 'CASA '.repeat(400) + 'UMBERTO';
  const t0 = performance.now();
  const a = affinita(lungo, 'CASA DI RIPOSO UMBERTO I');
  assert.ok(a >= 0 && a <= 1);
  assert.ok(performance.now() - t0 < 500);
});
