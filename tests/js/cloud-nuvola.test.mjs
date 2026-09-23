/* cloud-nuvola.test.mjs - web/js/nuvola.js, il lato Supabase del tracker.
 *
 *   node --test tests/js/
 *
 * Niente rete vera e niente Supabase: `fetch`, `localStorage` e `location`
 * sono finti, e ogni prova importa una COPIA NUOVA del modulo (`?n=...`) cosi'
 * la sessione in memoria di una prova non passa alla successiva. In
 * nuvola-config.js l'indirizzo e' vuoto: le chiamate vanno a "/auth/v1/...",
 * "/rest/v1/rpc/...", e il finto `fetch` risponde a quelle.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

const K_SES = 'cs.sessione.v1';

function memoria() {
  const m = new Map();
  return {
    getItem: k => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: k => { m.delete(k); },
  };
}

let giro = 0;
/** Un modulo fresco con la sessione `sessione` gia' salvata e `rispondi(url,
 *  opzioni)` al posto della rete. Ritorna il modulo e l'elenco delle chiamate. */
async function prepara(sessione, rispondi) {
  globalThis.localStorage = memoria();
  if (sessione) localStorage.setItem(K_SES, JSON.stringify(sessione));
  globalThis.location = { origin: 'http://sito', ricaricata: 0, reload() { this.ricaricata++; } };
  const chiamate = [];
  globalThis.fetch = async (url, o = {}) => {
    chiamate.push({ url: String(url), o });
    return rispondi(String(url), o);
  };
  const m = await import('../../web/js/nuvola.js?n=' + (++giro));
  return { m, chiamate };
}

const json = (stato, dati) => new Response(JSON.stringify(dati), { status: stato });
const scaduta = (extra = {}) => ({ access_token: 'vecchio', refresh_token: 'rt-1',
                                   email: 'mario.rossi@vrs-tech.it', scade: Date.now() - 1000, ...extra });
const buona = (extra = {}) => ({ access_token: 'buono', refresh_token: 'rt-1',
                                 email: 'mario.rossi@vrs-tech.it', scade: Date.now() + 3600e3, ...extra });
const salvata = () => JSON.parse(localStorage.getItem(K_SES) || 'null');
const ping = m => m.chiama('/api/ping', { metodo: 'POST', body: {} });

/* ------------------------------------------------------------ daQuando --- */
test('daQuando: un minuto prima, anche a cavallo di anno e di mese', async () => {
  const { m } = await prepara(null, () => json(200, {}));
  assert.equal(m.daQuando('2026-09-23T10:00:05'), '2026-09-23T09:59:05');
  assert.equal(m.daQuando('2027-01-01T00:00:30'), '2026-12-31T23:59:30');
  assert.equal(m.daQuando('2028-03-01T00:00:10'), '2028-02-29T23:59:10');   // bisestile
  assert.equal(m.daQuando('2026-10-25T02:30:00', 0), '2026-10-25T02:30:00');
  assert.equal(m.daQuando('2026-09-23T10:00:05', 5), '2026-09-23T10:00:00');
});

test('daQuando: niente ancora visto o testo strano -> null (da sempre)', async () => {
  const { m } = await prepara(null, () => json(200, {}));
  assert.equal(m.daQuando(''), null);
  assert.equal(m.daQuando(null), null);
  assert.equal(m.daQuando(undefined), null);
  assert.equal(m.daQuando('ieri'), null);
});

/* ------------------------------------------------------- eventiDaCelle --- */
test('eventiDaCelle: poche celle, un evento per cella e il nome di chi le ha toccate', async () => {
  const { m } = await prepara(null, () => json(200, {}));
  const ev = m.eventiDaCelle([
    { id_service: 1, mese: 3, cella: { rev: 2, by: 'Io' } },
    { id_service: 2, mese: 4, cella: { rev: 5, by: 'Luca' } },
    { id_service: 3, mese: 5 },                       // senza cella: si salta
  ], 2026, 'Io');
  assert.equal(ev.length, 2);
  assert.deepEqual(ev.map(e => e.tipo), ['cella', 'cella']);
  assert.equal(ev[0].operatore, '');                  // la mia: niente lampo
  assert.equal(ev[1].operatore, 'Luca');
  assert.equal(ev[1].anno, 2026);
});

test('eventiDaCelle: tante celle diventano UN evento `celle` (un ridisegno solo)', async () => {
  const { m } = await prepara(null, () => json(200, {}));
  const celle = Array.from({ length: 300 }, (_, i) =>
    ({ id_service: i, mese: 1 + (i % 12), cella: { rev: 1, by: 'Luca' } }));
  const ev = m.eventiDaCelle(celle, 2026, 'Io');
  assert.equal(ev.length, 1);
  assert.equal(ev[0].tipo, 'celle');
  assert.equal(ev[0].celle.length, 300);
  assert.deepEqual(Object.keys(ev[0].celle[0]).sort(), ['cella', 'id_service', 'mese']);
});

test('eventiDaCelle: lista vuota o assente -> nessun evento', async () => {
  const { m } = await prepara(null, () => json(200, {}));
  assert.deepEqual(m.eventiDaCelle([], 2026), []);
  assert.deepEqual(m.eventiDaCelle(undefined, 2026), []);
});

/* ------------------------------------------------------------- token ----- */
test('token valido: nessun rinnovo, il Bearer e\' quello salvato', async () => {
  const { m, chiamate } = await prepara(buona(), () => json(200, { http: 200 }));
  const r = await ping(m);
  assert.equal(r.ok, true);
  assert.equal(chiamate.length, 1);
  assert.match(chiamate[0].url, /\/rest\/v1\/rpc\/app_ping$/);
  assert.equal(chiamate[0].o.headers.Authorization, 'Bearer buono');
});

test('token scaduto e tre chiamate insieme: UN rinnovo solo', async () => {
  let rinnovi = 0;
  const { m, chiamate } = await prepara(scaduta(), async url => {
    if (url.includes('grant_type=refresh_token')) {
      rinnovi++;
      await new Promise(r => setTimeout(r, 10));
      return json(200, { access_token: 'nuovo', refresh_token: 'rt-2', expires_in: 3600 });
    }
    return json(200, { http: 200 });
  });
  const tutte = await Promise.all([ping(m), ping(m), ping(m)]);
  assert.equal(rinnovi, 1);
  assert.ok(tutte.every(r => r.ok));
  const rpc = chiamate.filter(c => c.url.includes('/rpc/'));
  assert.ok(rpc.every(c => c.o.headers.Authorization === 'Bearer nuovo'));
  assert.equal(salvata().refresh_token, 'rt-2');
});

test('rinnovo senza rete: la sessione NON si butta, la chiamata fallisce come un fetch', async () => {
  const { m } = await prepara(scaduta(), url => {
    if (url.includes('refresh_token')) throw new TypeError('Failed to fetch');
    return json(200, { http: 200 });
  });
  await assert.rejects(ping(m), TypeError);
  assert.equal(salvata()?.refresh_token, 'rt-1');     // rientra da solo con la rete
  assert.equal(m.haSessione(), true);
});

test('rinnovo con Supabase in 503: la sessione resta', async () => {
  const { m } = await prepara(scaduta(), url =>
    url.includes('refresh_token') ? json(503, { msg: 'giu' }) : json(200, { http: 200 }));
  await assert.rejects(ping(m));
  assert.equal(salvata()?.refresh_token, 'rt-1');
});

test('rinnovo rifiutato (400 invalid grant): sessione buttata, 401 a chi chiama', async () => {
  const { m } = await prepara(scaduta(), url =>
    url.includes('refresh_token')
      ? json(400, { error_description: 'Invalid Refresh Token: Already Used' })
      : json(200, { http: 200 }));
  const r = await ping(m);
  assert.equal(r.stato, 401);
  assert.equal(salvata(), null);
  assert.equal(m.haSessione(), false);
});

test('un\'altra scheda ha gia\' rinnovato: si usa la sua sessione, niente rinnovo', async () => {
  const { m, chiamate } = await prepara(scaduta(), () => json(200, { http: 200 }));
  // la scheda accanto ha rinnovato DOPO che questo modulo ha letto la sessione
  localStorage.setItem(K_SES, JSON.stringify(buona({ access_token: 'della-scheda', refresh_token: 'rt-9' })));
  const r = await ping(m);
  assert.equal(r.ok, true);
  assert.equal(chiamate.filter(c => c.url.includes('/auth/')).length, 0);
  assert.equal(chiamate[0].o.headers.Authorization, 'Bearer della-scheda');
});

test('rinnovo rifiutato ma la scheda accanto ha un refresh token nuovo: si prende quello', async () => {
  let m;
  ({ m } = await prepara(scaduta(), url => {
    if (url.includes('refresh_token')) {
      // mentre il nostro rinnovo era in volo, l'altra scheda ha vinto la corsa
      localStorage.setItem(K_SES, JSON.stringify(buona({ access_token: 'altra', refresh_token: 'rt-2' })));
      return json(400, { error_description: 'Already Used' });
    }
    return json(200, { http: 200 });
  }));
  const r = await ping(m);
  assert.equal(r.ok, true);
  assert.equal(salvata().refresh_token, 'rt-2');       // non cancellata
});

test('401 dal database: la sessione si butta, ma non quella nuova di un\'altra scheda', async () => {
  const { m } = await prepara(buona(), () => {
    localStorage.setItem(K_SES, JSON.stringify(buona({ access_token: 'altra-scheda' })));
    return json(401, { message: 'JWT expired' });
  });
  const r = await ping(m);
  assert.equal(r.stato, 401);
  assert.equal(salvata().access_token, 'altra-scheda');
  assert.equal(m.haSessione(), true);
});

test('401 dal database e nessuna sessione nuova: via tutto', async () => {
  const { m } = await prepara(buona(), () => json(401, { message: 'JWT expired' }));
  const r = await ping(m);
  assert.equal(r.stato, 401);
  assert.equal(salvata(), null);
});

test('403 per casella non aziendale: messaggio chiaro, sessione intatta', async () => {
  const { m } = await prepara(buona(), () => json(403, { message: 'non autorizzato' }));
  const r = await ping(m);
  assert.equal(r.stato, 403);
  assert.match(r.dati.errore, /@vrs-tech\.it/);
  assert.equal(salvata().access_token, 'buono');
});

test('lo stato vero viaggia nel JSON: http 409 -> ok false', async () => {
  const { m } = await prepara(buona(), () => json(200, { http: 409, esito: 'conflitto' }));
  const r = await m.chiama('/api/toggle', { metodo: 'POST',
    body: { id_service: 1, anno: 2026, mese: 3, campo: 'stampata', valore: true } });
  assert.equal(r.ok, false);
  assert.equal(r.stato, 409);
});

test('toggle: il valore viaggia 0/1 e la base null resta null', async () => {
  const { m, chiamate } = await prepara(buona(), () => json(200, { http: 200 }));
  await m.chiama('/api/toggle', { metodo: 'POST',
    body: { id_service: 7, anno: 2026, mese: 12, campo: 'ricambi', valore: 'si', base_rev: 0 } });
  const corpo = JSON.parse(chiamate[0].o.body);
  assert.equal(corpo.p_valore, 1);
  assert.equal(corpo.p_base_rev, 0);                  // 0 non e' "assente"
  assert.equal(corpo.p_base_valore, null);
  assert.equal(corpo.p_origine, 'live');
});

test('rotta sconosciuta: 404 senza chiamare la rete', async () => {
  const { m, chiamate } = await prepara(buona(), () => json(200, {}));
  const r = await m.chiama('/api/nonesiste');
  assert.equal(r.stato, 404);
  assert.equal(chiamate.length, 0);
});

test('senza sessione: 401 locale, nessuna chiamata', async () => {
  const { m, chiamate } = await prepara(null, () => json(200, {}));
  const r = await ping(m);
  assert.equal(r.stato, 401);
  assert.equal(chiamate.length, 0);
});

/* ---------------------------------------------------------------- esci --- */
test('esci: revoca SOLO questa sessione sul server, poi pulisce e ricarica', async () => {
  const { m, chiamate } = await prepara(buona(), () => json(204, {}));
  m.esci();
  await new Promise(r => setTimeout(r, 0));
  assert.equal(chiamate.length, 1);
  assert.match(chiamate[0].url, /\/auth\/v1\/logout\?scope=local$/);
  assert.equal(chiamate[0].o.keepalive, true);
  assert.equal(chiamate[0].o.headers.Authorization, 'Bearer buono');
  assert.equal(salvata(), null);
  assert.equal(location.ricaricata, 1);
});

test('esci senza rete: si esce lo stesso', async () => {
  const { m } = await prepara(buona(), () => { throw new TypeError('Failed to fetch'); });
  m.esci();
  await new Promise(r => setTimeout(r, 0));
  assert.equal(salvata(), null);
  assert.equal(location.ricaricata, 1);
});

/* ------------------------------------------------------------- storage --- */
test('localStorage che lancia (navigazione privata): il modulo si carica lo stesso', async () => {
  globalThis.localStorage = { getItem() { throw new Error('bloccato'); },
                              setItem() { throw new Error('bloccato'); },
                              removeItem() { throw new Error('bloccato'); } };
  globalThis.fetch = async () => json(200, { access_token: 'a', refresh_token: 'b', expires_in: 3600 });
  const m = await import('../../web/js/nuvola.js?n=' + (++giro));
  assert.equal(m.haSessione(), false);
  await m.entra('mario.rossi@vrs-tech.it', 'password-lunga');   // setItem lancia: non importa
  assert.equal(m.haSessione(), true);
});
