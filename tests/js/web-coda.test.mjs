/* web-coda.test.mjs - la coda offline condivisa fra le schede (BUG-02) e il
   traduttore dei messaggi tecnici di ui.js (TXT-01). */
import { avvisi } from './web-ambiente.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';

/* gli ascoltatori di `window` si tengono, per poter mandare un `storage` finto */
const ascolta = {};
globalThis.addEventListener = (t, fn) => { (ascolta[t] ||= []).push(fn); };
globalThis.fetch = async () => { throw new TypeError('Failed to fetch'); };

const { rete, accoda, onCambio } = await import('../../web/js/api.js');
const { umano, avviso } = await import('../../web/js/ui.js');

const K = 'cs.coda.v1';
const disco = () => JSON.parse(localStorage.getItem(K) || '[]');
const altraScheda = op => localStorage.setItem(K, JSON.stringify([...disco(), op]));
const storage = () => (ascolta.storage || []).forEach(f => f({ key: K }));

test('due schede offline: la spunta dell altra non si perde', async () => {
  localStorage.removeItem(K); rete.coda.length = 0;
  accoda({ rotta: '/api/toggle', corpo: { id_service: 282 } });
  altraScheda({ op_id: 'b-228', creato: Date.now(), client: 'altra', rotta: '/api/toggle', corpo: { id_service: 228 } });
  accoda({ rotta: '/api/toggle', corpo: { id_service: 300 } });
  await new Promise(r => setTimeout(r, 0));
  const ids = disco().map(o => o.corpo.id_service).sort();
  assert.deepEqual(ids, [228, 282, 300]);
  assert.equal(rete.coda.length, 3);          // lo stesso array, riallineato
});

test('l evento storage riallinea la coda in memoria', () => {
  localStorage.removeItem(K); rete.coda.length = 0;
  altraScheda({ op_id: 'b-1', creato: Date.now(), client: 'altra', rotta: '/api/toggle', corpo: {} });
  storage();
  assert.deepEqual(rete.coda.map(o => o.op_id), ['b-1']);
});

test('una mia operazione spedita dall altra scheda si da per confermata', async () => {
  localStorage.removeItem(K); rete.coda.length = 0;
  const id = accoda({ rotta: '/api/toggle', corpo: { id_service: 5 } });
  await new Promise(r => setTimeout(r, 0));
  const esiti = [];
  const via = onCambio((_, ev) => { if (ev?.confermata) esiti.push(ev.confermata.op.op_id); });
  localStorage.setItem(K, '[]');               // l'altra scheda l'ha spedita e tolta
  storage();
  via();
  assert.deepEqual(esiti, [id]);
  assert.equal(rete.coda.length, 0);
});

test('coda rovinata sul disco: si riparte vuoti, senza eccezioni', () => {
  localStorage.setItem(K, '{rotto');
  storage();
  assert.equal(rete.coda.length, 0);
});

test('umano: traduce la coda tecnica e tiene il contesto', () => {
  assert.equal(umano('Non riesco a eliminarlo: Failed to fetch').testo,
    'Non riesco a eliminarlo: server non raggiungibile: controlla la rete e riprova.');
  assert.match(umano('JWT expired').testo, /^La sessione è scaduta/);
  assert.match(umano('Il database ha negato x: permission denied for function x').testo, /permesso/);
  assert.match(umano('new row violates check constraint "c"').testo, /non accetta/);
  assert.match(umano('Invalid login credentials').testo, /^Email o password/);
  assert.match(umano("Cannot read properties of undefined (reading 'x')").testo, /^Non è andato a buon fine/);
});

test('umano: i testi italiani restano come sono', () => {
  for (const s of ['Spunta salvata.', '500 spunte approvate.', 'Sessione scaduta: rientra.',
    'Non riesco a eliminarlo: eliminazione rifiutata (403)', 'Scegli un mese.']) {
    assert.equal(umano(s).testo, s);
    assert.equal(umano(s).tecnico, '');
  }
});

test('avviso() mostra il testo tradotto', () => {
  avvisi();
  const err = console.error; console.error = () => { };
  avviso('Non cancellati: TypeError: Failed to fetch', { tono: 'allerta' });
  console.error = err;
  assert.deepEqual(avvisi(), ['Non cancellati: server non raggiungibile: controlla la rete e riprova.']);
});
