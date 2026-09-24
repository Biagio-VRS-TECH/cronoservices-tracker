/* cloud-comunicazioni.test.mjs - i pezzi di web/js/nuvola.js che servono alle
 * Comunicazioni del Planning (#ANCHOR: comunicazioni in js/famiglia.js):
 * `idUtente` (il sub del token), `rpcLibera` (una funzione Postgres qualunque)
 * e `ascoltaRighe` (una tabella filtrata su un canale a se').
 * Come cloud-diretta: WebSocket e fetch finti, orologi finti, niente Supabase.
 */
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';

const K_SES = 'cs.sessione.v1';
const scatola = () => {
  const m = new Map();
  return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)),
           removeItem: k => m.delete(k) };
};
const json = (stato, dati) => new Response(JSON.stringify(dati), { status: stato });
const svuota = () => new Promise(r => setImmediate(r));

class WSFinto {
  static tutti = [];
  constructor(url) { this.url = url; this.readyState = 0; this.spediti = []; WSFinto.tutti.push(this); }
  send(t) { this.spediti.push(JSON.parse(t)); }
  close() { this.readyState = 3; this.onclose?.(); }
  apriti() { this.readyState = 1; this.onopen?.(); }
  ricevi(m) { this.onmessage?.({ data: JSON.stringify(m) }); }
}

/** Un token finto con il sub dato (firma inventata: il client non la controlla) */
const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
const tokenCon = sub => `${b64({ alg: 'HS256' })}.${b64({ sub, user_metadata: { vrs_tema: null } })}.firma`;

let giro = 0;
async function prepara({ sessione, rispondi = () => json(200, {}) }) {
  WSFinto.tutti = [];
  globalThis.WebSocket = WSFinto;
  globalThis.localStorage = scatola();
  if (sessione) localStorage.setItem(K_SES, JSON.stringify(sessione));
  globalThis.location = { origin: 'http://sito', reload() { } };
  const chiamate = [];
  globalThis.fetch = async (url, o = {}) => { chiamate.push({ url: String(url), o }); return rispondi(String(url), o); };
  const m = await import('../../web/js/nuvola.js?c=' + (++giro));
  return { m, chiamate };
}
const buona = (extra = {}) => ({ access_token: tokenCon('0f1e2d3c-aaaa-bbbb-cccc-123456789abc'), refresh_token: 'rt',
                                 email: 'test.demetrio@vrs-tech.it', scade: Date.now() + 3600e3, ...extra });

test('idUtente: il sub del token; senza sessione o con un token rotto, vuoto', async () => {
  let { m } = await prepara({ sessione: buona() });
  assert.equal(m.idUtente(), '0f1e2d3c-aaaa-bbbb-cccc-123456789abc');
  assert.equal(m.metadatiSessione()?.vrs_tema, null, 'i metadati si leggono come prima');
  ({ m } = await prepara({ sessione: null }));
  assert.equal(m.idUtente(), '');
  ({ m } = await prepara({ sessione: buona({ access_token: 'non-un-token' }) }));
  assert.equal(m.idUtente(), '');
});

test('rpcLibera: POST a /rest/v1/rpc/<nome> con gli argomenti; una funzione che manca e\' un 404', async () => {
  const { m, chiamate } = await prepara({
    sessione: buona(),
    rispondi: url => (url.endsWith('/pl_comunicazioni_mie')
      ? json(404, { code: 'PGRST202', message: 'Could not find the function public.pl_comunicazioni_mie(p_limite) in the schema cache' })
      : json(200, '2026-09-24T10:00:00+00:00')),
  });
  const r = await m.rpcLibera('pl_comunicazioni_mie', { p_limite: 30 });
  assert.equal(r.ok, false);
  assert.equal(r.stato, 404);
  assert.match(r.dati.errore, /Could not find the function/);
  assert.equal(chiamate[0].url, '/rest/v1/rpc/pl_comunicazioni_mie');
  assert.equal(chiamate[0].o.method, 'POST');
  assert.deepEqual(JSON.parse(chiamate[0].o.body), { p_limite: 30 });

  const ok = await m.rpcLibera('pl_comunicazione_letta', { p_id: 'u-1' });
  assert.equal(ok.ok, true);
  assert.equal(ok.dati, '2026-09-24T10:00:00+00:00', 'lo scalare arriva com\'e\'');
});

test('ascoltaRighe: canale a se\', una tabella col filtro, e ogni cambio avvisa', async () => {
  const { m } = await prepara({ sessione: buona() });
  let avvisi = 0;
  const chiudi = m.ascoltaRighe({ tabella: 'pl_notifications', filtro: 'user_id=eq.io', canale: 'crono-comunicazioni' }, () => avvisi++);
  await svuota();
  const ws = WSFinto.tutti[0];
  ws.apriti();
  const join = ws.spediti[0];
  assert.equal(join.topic, 'realtime:crono-comunicazioni');
  assert.equal(join.event, 'phx_join');
  assert.deepEqual(join.payload.config.postgres_changes,
    [{ event: '*', schema: 'public', table: 'pl_notifications', filter: 'user_id=eq.io' }]);
  ws.ricevi({ topic: 'realtime:crono-comunicazioni', event: 'phx_reply', ref: '1', payload: { status: 'ok' } });
  assert.equal(avvisi, 0, 'la prima iscrizione non avvisa');
  ws.ricevi({ topic: 'realtime:crono-comunicazioni', event: 'postgres_changes', payload: { data: { table: 'pl_notifications', type: 'INSERT' } } });
  ws.ricevi({ topic: 'realtime:crono', event: 'postgres_changes', payload: {} });   // un altro canale: no
  assert.equal(avvisi, 1);
  chiudi();
  assert.equal(ws.readyState, 3);
});

test('ascoltaRighe: dopo una caduta riaggancia e avvisa una volta; chiuso, non riaggancia piu\'', async () => {
  mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
  try {
    const { m } = await prepara({ sessione: buona() });
    let avvisi = 0;
    const chiudi = m.ascoltaRighe({ tabella: 'pl_notifications', filtro: 'user_id=eq.io' }, () => avvisi++);
    await svuota();
    const primo = WSFinto.tutti[0];
    primo.apriti();
    primo.ricevi({ topic: 'realtime:righe-pl_notifications', event: 'phx_reply', ref: '1', payload: { status: 'ok' } });
    primo.close();                                         // la rete cade
    mock.timers.tick(2000);
    await svuota();
    const secondo = WSFinto.tutti[1];
    assert.ok(secondo, 'non ha riagganciato');
    secondo.apriti();
    secondo.ricevi({ topic: 'realtime:righe-pl_notifications', event: 'phx_reply', ref: '1', payload: { status: 'ok' } });
    assert.equal(avvisi, 1, 'al riaggancio si rilegge una volta');
    chiudi();
    mock.timers.tick(60000);
    await svuota();
    assert.equal(WSFinto.tutti.length, 2);
  } finally {
    mock.timers.reset();
  }
});

test('ascoltaRighe: iscrizione rifiutata (tabella non ascoltabile) chiude solo questo canale e riprova', async () => {
  mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
  try {
    const { m } = await prepara({ sessione: buona() });
    const chiudi = m.ascoltaRighe({ tabella: 'pl_notifications' }, () => { });
    await svuota();
    const ws = WSFinto.tutti[0];
    ws.apriti();
    ws.ricevi({ topic: 'realtime:righe-pl_notifications', event: 'phx_reply', ref: '1', payload: { status: 'error' } });
    assert.equal(ws.readyState, 3);
    mock.timers.tick(2000);
    await svuota();
    assert.equal(WSFinto.tutti.length, 2, 'dopo il rifiuto riprova');
    chiudi();
  } finally {
    mock.timers.reset();
  }
});
