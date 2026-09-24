/* web-ui.test.mjs - i formattatori di web/js/ui.js: date relative e assolute
   (anche fuori dal fuso di Roma), dimensioni dei file ai confini, colori e
   iniziali degli operatori, e l'escape dei testi che finiscono in innerHTML. */
import './web-ambiente.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { quando, dataIt, dimensione, tinta, iniziali, esc } from '../../web/js/ui.js';

test('quando: oggi, ieri, qualche giorno fa, poi la data', () => {
  const adesso = new Date(2026, 8, 23, 10, 0);
  assert.equal(quando('2026-09-23T08:05:00', adesso), 'oggi 08:05');
  assert.equal(quando('2026-09-22T23:59:00', adesso), 'ieri 23:59');
  assert.equal(quando('2026-09-20T12:00:00', adesso), '3 giorni fa');
  assert.match(quando('2026-05-10T10:00:00', adesso), /^10 mag 26$/);
  assert.equal(quando('', adesso), '');
  assert.equal(quando(null, adesso), '');
});

test('quando: un orologio avanti di qualche minuto non scrive "-1 giorni fa"', () => {
  // il server e' un filo avanti: la spunta risulta "domani" per chi guarda a mezzanotte
  const adesso = new Date(2026, 8, 23, 23, 58);
  assert.equal(quando('2026-09-24T00:01:00', adesso), 'oggi 00:01');
});

test('quando: una data rotta non scrive "Invalid Date"', () => {
  assert.equal(quando('non-una-data', new Date(2026, 8, 23)), '');
});

test('quando: a cavallo del cambio dell ora il giorno prima resta "ieri"', () => {
  // 25 ottobre 2026: si torna all'ora solare, il giorno dura 25 ore
  assert.equal(quando('2026-10-25T09:00:00', new Date(2026, 9, 26, 9, 0)), 'ieri 09:00');
  assert.equal(quando('2026-03-28T09:00:00', new Date(2026, 2, 29, 9, 0)), 'ieri 09:00');
});

test('dataIt: una data senza ora e quel giorno, in qualunque fuso', () => {
  const tz = process.env.TZ;
  try {
    for (const fuso of ['Europe/Rome', 'America/New_York', 'Pacific/Honolulu', 'Asia/Tokyo']) {
      process.env.TZ = fuso;
      assert.equal(dataIt('2026-09-23'), '23/09/2026', fuso);
      assert.equal(dataIt('2026-01-01'), '01/01/2026', fuso);
      assert.equal(dataIt('2024-02-29'), '29/02/2024', fuso);
    }
  } finally {
    if (tz === undefined) delete process.env.TZ; else process.env.TZ = tz;
  }
});

test('dataIt: vuota o rotta diventa un trattino', () => {
  assert.equal(dataIt(''), '—');
  assert.equal(dataIt(null), '—');
  assert.equal(dataIt('rotta'), '—');
});

test('dimensione: i confini di KB e MB, la virgola italiana, i valori mancanti', () => {
  assert.equal(dimensione(0), '0 B');
  assert.equal(dimensione(1023), '1023 B');
  assert.equal(dimensione(1024), '1 KB');
  assert.equal(dimensione(1536), '2 KB');
  assert.equal(dimensione(1048575), '1024 KB');
  assert.equal(dimensione(1048576), '1,0 MB');
  assert.equal(dimensione(5 * 1048576 + 104858), '5,1 MB');
  assert.equal(dimensione(undefined), '0 B');
  assert.equal(dimensione(NaN), '0 B');
});

test('tinta e iniziali: stabili, e mai vuote', () => {
  assert.equal(tinta('Anna Bianchi'), tinta('Anna Bianchi'));
  assert.notEqual(tinta('Anna Bianchi'), tinta('Luca Verdi'));
  assert.match(tinta(''), /^hsl\(\d+ 60% 36%\)$/);
  assert.equal(iniziali('anna bianchi'), 'AB');
  assert.equal(iniziali('  Mario  '), 'M');
  assert.equal(iniziali(''), '?');
  assert.equal(iniziali(null), '?');
});

test('esc: i caratteri che rompono l HTML, e null/undefined vuoti', () => {
  assert.equal(esc('<img src=x onerror="a()"> & co'), '&lt;img src=x onerror=&quot;a()&quot;&gt; &amp; co');
  assert.equal(esc(null), '');
  assert.equal(esc(undefined), '');
  assert.equal(esc(0), '0');
});
