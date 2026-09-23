/* cloud-diretta.test.mjs - apriStream di web/js/nuvola.js: la diretta Realtime.
 *
 * Un WebSocket finto (si aprono, si chiudono e ricevono messaggi a comando) e
 * gli orologi finti di node:test: niente Supabase, niente attese vere.
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

let giro = 0;
async function prepara({ sessione, rispondi }) {
  WSFinto.tutti = [];
  globalThis.WebSocket = WSFinto;
  globalThis.localStorage = scatola();
  if (sessione) localStorage.setItem(K_SES, JSON.stringify(sessione));
  globalThis.location = { origin: 'http://sito', reload() { } };
  const chiamate = [];
  globalThis.fetch = async (url, o = {}) => { chiamate.push({ url: String(url), o }); return rispondi(String(url), o); };
  const m = await import('../../web/js/nuvola.js?d=' + (++giro));
  return { m, chiamate };
}
const buona = (extra = {}) => ({ access_token: 'buono', refresh_token: 'rt', email: 'io@vrs-tech.it',
                                 scade: Date.now() + 3600e3, ...extra });
const cellaRealtime = (ts, rev = 3) => ({
  event: 'postgres_changes', topic: 'realtime:crono',
  payload: { data: { table: 'mappature', type: 'UPDATE',
    record: { id_service: 5, anno: 2026, mese: 3, stampata: 1, controllata: 0, corretta: 0, ricambi: 0,
              rev, updated_by: 'Luca', updated_at: ts } } },
});

test('iscrizione: il join porta il token e le quattro tabelle', async () => {
  const { m } = await prepara({ sessione: buona(), rispondi: () => json(200, {}) });
  const chiudi = m.apriStream(() => { });
  await svuota();
  const ws = WSFinto.tutti[0];
  ws.apriti();
  const join = ws.spediti[0];
  assert.equal(join.event, 'phx_join');
  assert.equal(join.ref, '1');
  assert.equal(join.payload.access_token, 'buono');
  assert.deepEqual(join.payload.config.postgres_changes.map(p => p.table),
                   ['mappature', 'meta', 'sync_log', 'documenti']);
  chiudi();
});

test('una cella in diretta diventa un evento `cella` col nome di chi l\'ha toccata', async () => {
  const { m } = await prepara({ sessione: buona(), rispondi: () => json(200, {}) });
  const eventi = [];
  const chiudi = m.apriStream(e => eventi.push(e), () => 'Io');
  await svuota();
  const ws = WSFinto.tutti[0];
  ws.apriti();
  ws.ricevi(cellaRealtime('2026-09-23T10:00:05'));
  assert.equal(eventi.length, 1);
  assert.equal(eventi[0].tipo, 'cella');
  assert.equal(eventi[0].operatore, 'Luca');
  assert.equal(eventi[0].cella.s, 1);
  chiudi();
});

test('riaggancio dopo un buco: si recupera quello che e\' cambiato, dal minuto prima', async () => {
  mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
  try {
    const { m, chiamate } = await prepara({ sessione: buona(), rispondi: url =>
      url.includes('app_celle_dopo')
        ? json(200, { http: 200, celle: [{ id_service: 9, mese: 4,
            cella: { s: 1, c: 1, k: 0, r: 0, rev: 7, by: 'Anna', at: '2026-09-23T10:03:00' } }] })
        : json(200, {}) });
    const eventi = [];
    const chiudi = m.apriStream(e => eventi.push(e), () => 'Io');
    await svuota();
    const ws0 = WSFinto.tutti[0];
    ws0.apriti();
    ws0.ricevi({ event: 'phx_reply', topic: 'realtime:crono', ref: '1', payload: { status: 'ok' } });
    await svuota();
    assert.equal(chiamate.filter(c => c.url.includes('app_celle_dopo')).length, 0,
                 'al primo aggancio non c\'e\' niente da recuperare');
    ws0.ricevi(cellaRealtime('2026-09-23T10:00:05'));

    ws0.close();                                   // la rete cade
    mock.timers.tick(2000);                        // primo tentativo dopo 2 s
    await svuota();
    const ws1 = WSFinto.tutti[1];
    assert.ok(ws1, 'si riaggancia da solo');
    ws1.apriti();
    // prima della conferma dell'iscrizione non si chiede niente
    await svuota();
    assert.equal(chiamate.filter(c => c.url.includes('app_celle_dopo')).length, 0);
    ws1.ricevi({ event: 'phx_reply', topic: 'realtime:crono', ref: '1', payload: { status: 'ok' } });
    await svuota(); await svuota();
    const rec = chiamate.filter(c => c.url.includes('app_celle_dopo'));
    assert.equal(rec.length, 1);
    assert.equal(JSON.parse(rec[0].o.body).p_da, '2026-09-23T09:59:05');
    const ultimo = eventi.at(-1);
    assert.equal(ultimo.tipo, 'cella');
    assert.equal(ultimo.id_service, 9);
    assert.equal(ultimo.operatore, 'Anna');
    chiudi();
  } finally {
    mock.timers.reset();
  }
});

test('la risposta al battito (ref "1" sul topic phoenix) non scatena un recupero', async () => {
  mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
  try {
    const { m, chiamate } = await prepara({ sessione: buona(), rispondi: () => json(200, { http: 200, celle: [] }) });
    const chiudi = m.apriStream(() => { });
    await svuota();
    WSFinto.tutti[0].apriti();
    WSFinto.tutti[0].close();
    mock.timers.tick(2000);
    await svuota();
    const ws1 = WSFinto.tutti[1];
    ws1.apriti();
    ws1.ricevi({ event: 'phx_reply', topic: 'phoenix', ref: '1', payload: {} });
    await svuota();
    assert.equal(chiamate.filter(c => c.url.includes('app_celle_dopo')).length, 0);
    chiudi();
  } finally {
    mock.timers.reset();
  }
});

test('battito: il token rinnovato si manda UNA volta, non a ogni battito', async () => {
  mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
  try {
    const { m } = await prepara({ sessione: buona(), rispondi: () => json(200, {}) });
    const chiudi = m.apriStream(() => { });
    await svuota();
    const ws = WSFinto.tutti[0];
    ws.apriti();
    // un'altra scheda rinnova: il token cambia sotto i piedi
    localStorage.setItem(K_SES, JSON.stringify(buona({ access_token: 'nuovo', scade: Date.now() + 7200e3 })));
    for (let i = 0; i < 3; i++) { mock.timers.tick(25000); await svuota(); }
    const mandati = ws.spediti.filter(s => s.event === 'access_token');
    assert.equal(mandati.length, 1);
    assert.equal(mandati[0].payload.access_token, 'nuovo');
    assert.equal(ws.spediti.filter(s => s.event === 'heartbeat').length, 3);
    chiudi();
  } finally {
    mock.timers.reset();
  }
});

test('senza sessione la diretta non muore: riprova e parte appena si rientra', async () => {
  mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
  try {
    const { m } = await prepara({ sessione: null, rispondi: url =>
      url.includes('grant_type=password')
        ? json(200, { access_token: 'entrato', refresh_token: 'rt', expires_in: 3600 })
        : json(200, {}) });
    const chiudi = m.apriStream(() => { });
    await svuota();
    assert.equal(WSFinto.tutti.length, 0);
    await m.entra('io@vrs-tech.it', 'password-lunga');
    mock.timers.tick(20000);
    await svuota();
    assert.equal(WSFinto.tutti.length, 1);
    chiudi();
  } finally {
    mock.timers.reset();
  }
});

test('dopo quattro cadute si ripiega sulla sonda, che chiede a lotti', async () => {
  mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
  try {
    const celle = Array.from({ length: 50 }, (_, i) =>
      ({ id_service: i, mese: 2, cella: { rev: 2, by: 'Anna', at: '2026-09-23T11:00:0' + (i % 10) } }));
    const { m, chiamate } = await prepara({ sessione: buona(), rispondi: url =>
      url.includes('app_celle_dopo') ? json(200, { http: 200, celle }) : json(200, {}) });
    const eventi = [];
    const chiudi = m.apriStream(e => eventi.push(e));
    await svuota();
    for (let i = 0; i < 4; i++) {
      WSFinto.tutti.at(-1).close();
      mock.timers.tick(20000);
      await svuota();
    }
    mock.timers.tick(15000);
    await svuota(); await svuota();
    assert.ok(chiamate.some(c => c.url.includes('app_celle_dopo')));
    const lotto = eventi.find(e => e.tipo === 'celle');
    assert.ok(lotto, 'cinquanta celle = un evento solo');
    assert.equal(lotto.celle.length, 50);
    chiudi();
  } finally {
    mock.timers.reset();
  }
});

test('chiudere ferma tutto: nessun riaggancio dopo', async () => {
  mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
  try {
    const { m } = await prepara({ sessione: buona(), rispondi: () => json(200, {}) });
    const chiudi = m.apriStream(() => { });
    await svuota();
    WSFinto.tutti[0].apriti();
    chiudi();
    mock.timers.tick(60000);
    await svuota();
    assert.equal(WSFinto.tutti.length, 1);
  } finally {
    mock.timers.reset();
  }
});
