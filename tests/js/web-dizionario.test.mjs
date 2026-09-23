/* web-dizionario.test.mjs - il dizionario dei nomi dei componenti, lato
   interfaccia (web/registro/app.js, scheda «Nomi dei componenti»). La
   decisione su cosa fare quando si esce da una casella e' in
   `valutaCampoDizionario` (web/registro/registro.js), senza DOM:
   - la descrizione trascritta col clic e lasciata intatta NON si salva;
   - uguale a prima: niente;
   - l'ordine nel quadro e' un intero da 1 a 10, o vuoto.
   Difetto ripetuto: la casella numerica accetta «3.0» e «1e1»; il controllo
   del browser li dava per buoni (Number() = 3, 10) e li spediva COSI' al
   server locale, che fa int("3.0") e rispondeva 400 «priorita non valida»
   dopo che l'interfaccia aveva detto di si'. Ora parte il numero pulito. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { valutaCampoDizionario as valuta } from '../../web/registro/registro.js';

const nome = (valore, extra = {}) => valuta({ campo: 'nome', valore, precedente: '', descrizione: 'VALVOLA A SFERA DN 15', ...extra });
const ordine = (valore, precedente = '') => valuta({ campo: 'priorita', valore, precedente });

test('nome: scritto si salva ripulito dagli spazi, uguale a prima non parte', () => {
  assert.deepEqual(nome('  Valvola  '), { azione: 'salva', valore: 'Valvola' });
  assert.deepEqual(nome('Valvola', { precedente: 'Valvola ' }), { azione: 'niente' });
  // svuotato: si torna alla descrizione del gestionale, e al server va il vuoto
  assert.deepEqual(nome('', { precedente: 'Valvola' }), { azione: 'salva', valore: '' });
  assert.deepEqual(nome('   ', { precedente: '' }), { azione: 'niente' });
});

test('nome: la descrizione trascritta col clic e lasciata com’era non si salva', () => {
  assert.deepEqual(nome('VALVOLA A SFERA DN 15', { trascritta: true }), { azione: 'ripristina' });
  assert.deepEqual(nome(' VALVOLA A SFERA DN 15 ', { trascritta: true }), { azione: 'ripristina' });
  // accorciata: e' un nome vero
  assert.deepEqual(nome('VALVOLA DN 15', { trascritta: true }), { azione: 'salva', valore: 'VALVOLA DN 15' });
  // la stessa parola scritta a mano (non trascritta) invece si salva
  assert.deepEqual(nome('VALVOLA A SFERA DN 15'), { azione: 'salva', valore: 'VALVOLA A SFERA DN 15' });
});

test('ordine: da 1 a 10, o vuoto', () => {
  assert.deepEqual(ordine('3'), { azione: 'salva', valore: '3' });
  assert.deepEqual(ordine('10'), { azione: 'salva', valore: '10' });
  assert.deepEqual(ordine('', '4'), { azione: 'salva', valore: '' });
  assert.deepEqual(ordine('4', '4'), { azione: 'niente' });
  for (const v of ['0', '11', '-1', '2.5', 'x', 'NaN', 'Infinity']) {
    const r = ordine(v);
    assert.equal(r.azione, 'errore', v);
    assert.match(r.testo, /da 1 a 10/);
  }
});

test('ordine: «3.0», «1e1», « 07 » partono come numero pulito, non come li ha scritti il browser', () => {
  assert.deepEqual(ordine('3.0'), { azione: 'salva', valore: '3' });
  assert.deepEqual(ordine('1e1'), { azione: 'salva', valore: '10' });
  assert.deepEqual(ordine(' 07 '), { azione: 'salva', valore: '7' });
  // uguale a prima, una volta ripulito: niente
  assert.deepEqual(ordine('3.0', '3'), { azione: 'niente' });
});

test('un campo sconosciuto non parte', () => {
  assert.deepEqual(valuta({ campo: 'boh', valore: 'x', precedente: '' }), { azione: 'niente' });
});
