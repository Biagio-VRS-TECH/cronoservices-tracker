/* web-api-coda.test.mjs - la coda di web/js/api.js davanti ai guasti veri del
   server: un 5xx di passaggio (non si butta la spunta), una pagina HTML di un
   proxy al posto del JSON (non si blocca la coda per sempre), un ascoltatore
   che lancia (le altre operazioni partono lo stesso), il disco pieno quando
   si salva il bootstrap. Rete finta: risponde quello che decide il test. */
import { avvisi } from './web-ambiente.mjs';
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

/** `rispondi(url, opz)` -> { stato, dati } oppure { stato, testo } (testo grezzo) */
let rispondi = null;
let chiamate = [];
globalThis.fetch = async (url, opz = {}) => {
  chiamate.push({ url: String(url), corpo: opz.body ? JSON.parse(opz.body) : null });
  if (!rispondi) throw new TypeError('Failed to fetch');
  const r = rispondi(String(url), opz) || {};
  const stato = r.stato ?? 200;
  const testo = 'testo' in r ? r.testo : JSON.stringify(r.dati ?? {});
  return { ok: stato >= 200 && stato < 300, status: stato, text: async () => testo };
};

const { rete, accoda, svuota, onCambio, bootstrap, MAX_TENTATIVI } = await import('../../web/js/api.js');

const K = 'cs.coda.v1';
const pausa = () => new Promise(r => setImmediate(r));
/** Aspetta che il giro di invio in corso sia finito. */
async function finito() {
  for (let i = 0; i < 200 && rete.inInvio; i++) await pausa();
  await pausa();
}
function vuota() { rete.coda.length = 0; localStorage.removeItem(K); }

let esiti = [];
onCambio((_, ev) => {
  if (ev?.confermata) esiti.push('ok:' + ev.confermata.op.corpo.id_service);
  if (ev?.fallita) esiti.push('no:' + ev.fallita.op.corpo.id_service);
  if (ev?.conflitto) esiti.push('409:' + ev.conflitto.op.corpo.id_service);
});

beforeEach(async () => {
  await finito();
  vuota(); esiti = []; chiamate = []; rispondi = null; avvisi();
});

test('un 5xx di passaggio non butta la spunta: resta in coda e si riprova', async () => {
  rispondi = () => ({ stato: 503, dati: { errore: 'Service Unavailable' } });
  accoda({ rotta: '/api/toggle', corpo: { id_service: 1 } });
  await finito();
  assert.equal(rete.coda.length, 1, 'la spunta e ancora li');
  assert.equal(rete.coda[0].tentativi, 1);
  assert.deepEqual(esiti, []);
  assert.deepEqual(avvisi(), [], 'nessun "rifiutata dal server"');
  // torna il server: parte
  rispondi = () => ({ dati: { esito: 'ok' } });
  await svuota();
  assert.equal(rete.coda.length, 0);
  assert.deepEqual(esiti, ['ok:1']);
});

test('un 5xx che non passa mai: dopo MAX_TENTATIVI si rinuncia e lo si dice', async () => {
  assert.ok(MAX_TENTATIVI >= 3);
  rispondi = () => ({ stato: 500, dati: { errore: 'rotto' } });
  accoda({ rotta: '/api/toggle', corpo: { id_service: 2 } });
  await finito();
  for (let i = 1; i < MAX_TENTATIVI; i++) await svuota();
  assert.equal(rete.coda.length, 0);
  assert.deepEqual(esiti, ['no:2']);
  assert.equal(chiamate.length, MAX_TENTATIVI);
});

test('una pagina HTML con un 4xx (proxy) non blocca la coda per sempre', async () => {
  rispondi = (url, opz) => JSON.parse(opz.body).id_service === 3
    ? { stato: 404, testo: '<html><body>Not Found</body></html>' }
    : { dati: { esito: 'ok' } };
  accoda({ rotta: '/api/toggle', corpo: { id_service: 3 } });
  accoda({ rotta: '/api/toggle', corpo: { id_service: 4 } });
  await finito();
  assert.equal(rete.coda.length, 0);
  assert.deepEqual(esiti, ['no:3', 'ok:4']);
});

test('una pagina HTML con un 502 resta in coda (e un guasto di passaggio)', async () => {
  rispondi = () => ({ stato: 502, testo: '<html>Bad Gateway</html>' });
  accoda({ rotta: '/api/toggle', corpo: { id_service: 5 } });
  await finito();
  assert.equal(rete.coda.length, 1);
  assert.deepEqual(esiti, []);
});

test('un ascoltatore che lancia non ferma le altre operazioni', async () => {
  const err = console.error; console.error = () => { };
  const via = onCambio((_, ev) => { if (ev?.confermata) throw new Error('vista rotta'); });
  try {
    rispondi = () => ({ dati: { esito: 'ok' } });
    accoda({ rotta: '/api/toggle', corpo: { id_service: 6 } });
    accoda({ rotta: '/api/toggle', corpo: { id_service: 7 } });
    await finito();
    assert.equal(rete.coda.length, 0);
    assert.deepEqual(esiti, ['ok:6', 'ok:7']);
  } finally {
    via(); console.error = err;
  }
});

test('409: esce dalla coda come conflitto; op_id e operatore viaggiano nel corpo', async () => {
  rispondi = () => ({ stato: 409, dati: { cella: { s: 1 } } });
  const id = accoda({ rotta: '/api/nota', corpo: { id_service: 8 }, operatore: 'Anna' });
  await finito();
  assert.deepEqual(esiti, ['409:8']);
  assert.equal(chiamate[0].corpo.op_id, id);
  assert.equal(chiamate[0].corpo.operatore, 'Anna');
});

test('rete assente: la coda resta tutta, nell ordine', async () => {
  accoda({ rotta: '/api/toggle', corpo: { id_service: 9 } });
  accoda({ rotta: '/api/toggle', corpo: { id_service: 10 } });
  await finito();
  assert.deepEqual(rete.coda.map(o => o.corpo.id_service), [9, 10]);
  assert.equal(rete.online, false);
});

/* ---------------------------------------------------------- bootstrap ---- */
test('bootstrap: il disco pieno non butta via i dati appena arrivati', async () => {
  const orig = localStorage.setItem;
  localStorage.removeItem('cs.bootstrap.v2');
  localStorage.setItem = (k, v) => {
    if (k === 'cs.bootstrap.v2') throw new Error('QuotaExceededError');
    return orig(k, v);
  };
  try {
    rispondi = () => ({ dati: { anno: 2026, oggi: '2026-09-23' } });
    const r = await bootstrap(2026);
    assert.equal(r.daCache, false);
    assert.equal(r.dati.anno, 2026);
  } finally {
    localStorage.setItem = orig;
  }
});

test('bootstrap offline: dalla cache; cache rovinata: l errore della rete, non un SyntaxError', async () => {
  rispondi = () => ({ dati: { anno: 2026, oggi: '2026-09-23' } });
  await bootstrap(2026);
  rispondi = null;
  const r = await bootstrap(2026);
  assert.equal(r.daCache, true);
  assert.equal(r.dati.anno, 2026);
  localStorage.setItem('cs.bootstrap.v2', '{rotto');
  await assert.rejects(bootstrap(2026), /Failed to fetch/);
  localStorage.removeItem('cs.bootstrap.v2');
});
