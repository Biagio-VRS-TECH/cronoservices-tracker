/* web-spunte.test.mjs - il popover della cella (web/js/spunte.js): quando la
   nota scritta nella casella va salvata. La regola sta in `notaDaSalvare`, la
   usano l'uscita dal campo e la chiusura del popover (Esc, clic fuori, freccia
   su un'altra cella), che prima buttava via il testo senza dirlo. */
import './web-ambiente.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { notaDaSalvare } from '../../web/js/spunte.js';

test('notaDaSalvare: il testo cambiato si salva, pulito degli spazi in fondo', () => {
  assert.equal(notaDaSalvare('richiamare lunedi  ', ''), 'richiamare lunedi');
  assert.equal(notaDaSalvare('nuova', 'vecchia'), 'nuova');
});

test('notaDaSalvare: uguale a quella che si vedeva (spazi a parte) non si salva', () => {
  assert.equal(notaDaSalvare('ciao', 'ciao'), null);
  assert.equal(notaDaSalvare('  ciao ', 'ciao'), null);
  assert.equal(notaDaSalvare('', ''), null);
  assert.equal(notaDaSalvare(undefined, ''), null);
});

test('notaDaSalvare: svuotare la casella e una modifica (la nota si toglie)', () => {
  assert.equal(notaDaSalvare('', 'vecchia'), '');
  assert.equal(notaDaSalvare('   ', 'vecchia'), '');
});
