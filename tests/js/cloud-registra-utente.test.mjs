/* cloud-registra-utente.test.mjs - netlify/functions/registra-utente.mjs.
 *
 * La prova a mano (netlify/prove/prova-registra-utente.mjs) resta com'e';
 * qui gli stessi paletti in forma di node:test, piu' quelli nuovi. La domanda
 * che conta e' sempre la stessa: la SERVICE KEY parte solo dopo che il
 * database, col token di chi preme, ha detto "admin"?
 */
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fn from '../../netlify/functions/registra-utente.mjs';

let chiamate, ruolo, crea;
beforeEach(() => {
  chiamate = [];
  ruolo = { stato: 200, corpo: 'admin' };
  crea = { stato: 200, corpo: { id: 'nuovo-id' } };
  process.env.SUPABASE_URL = 'https://finto.supabase.co';
  process.env.SUPABASE_ANON_KEY = 'chiave-anon';
  process.env.SUPABASE_SERVICE_KEY = 'chiave-service';
  globalThis.fetch = async (url, o) => {
    chiamate.push({ url: String(url), o });
    if (String(url).includes('/rpc/ruolo_corrente')) {
      if (ruolo.lancia) throw new TypeError('rete');
      return new Response(JSON.stringify(ruolo.corpo), { status: ruolo.stato });
    }
    return new Response(JSON.stringify(crea.corpo), { status: crea.stato });
  };
});

const richiesta = (corpo, { token = 'token-di-chi-preme', metodo = 'POST' } = {}) =>
  new Request('http://sito/api/registra-utente', {
    method: metodo,
    headers: token ? { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' } : {},
    body: metodo === 'POST' && corpo !== undefined
      ? (typeof corpo === 'string' ? corpo : JSON.stringify(corpo)) : undefined,
  });
const buono = { email: 'Mario.Rossi@vrs-tech.it ', password: 'una-password-lunga' };
const service = () => chiamate.filter(c => c.url.includes('/auth/v1/admin/users'));

test('admin: crea la casella confermata, minuscola, e non rimanda la password', async () => {
  const r = await fn(richiesta(buono));
  assert.equal(r.status, 200);
  const d = await r.json();
  assert.deepEqual(d, { email: 'mario.rossi@vrs-tech.it', id: 'nuovo-id' });
  const [c] = service();
  assert.equal(c.o.headers.Authorization, 'Bearer chiave-service');
  assert.deepEqual(JSON.parse(c.o.body),
    { email: 'mario.rossi@vrs-tech.it', password: 'una-password-lunga', email_confirm: true });
  assert.equal(r.headers.get('cache-control'), 'no-store');
});

test('il ruolo si chiede col token di CHI PREME e con la chiave anon, mai con la service', async () => {
  await fn(richiesta(buono));
  const c = chiamate.find(x => x.url.includes('/rpc/ruolo_corrente'));
  assert.equal(c.o.headers.Authorization, 'Bearer token-di-chi-preme');
  assert.equal(c.o.headers.apikey, 'chiave-anon');
});

for (const r of ['tecnico', 'approvatore', null, '', 'ADMIN', ['admin'], { ruolo: 'admin' }]) {
  test(`ruolo ${JSON.stringify(r)}: 403 e service key non toccata`, async () => {
    ruolo.corpo = r;
    const out = await fn(richiesta(buono));
    assert.equal(out.status, 403);
    assert.equal(service().length, 0);
  });
}

test('token scaduto (401 dal database): 401, service key non toccata', async () => {
  ruolo.stato = 401;
  const out = await fn(richiesta(buono));
  assert.equal(out.status, 401);
  assert.equal(service().length, 0);
});

test('il database non risponde: 502, service key non toccata', async () => {
  ruolo.lancia = true;
  const out = await fn(richiesta(buono));
  assert.equal(out.status, 502);
  assert.equal(service().length, 0);
});

test('senza token, o col metodo sbagliato: nessuna chiamata', async () => {
  assert.equal((await fn(richiesta(buono, { token: '' }))).status, 401);
  assert.equal((await fn(richiesta(buono, { metodo: 'GET' }))).status, 405);
  assert.equal(chiamate.length, 0);
});

for (const email of ['mario@gmail.com', 'mario@vrs-tech.it.evil.com', 'mario@evilvrs-tech.it',
                     'a@b@vrs-tech.it', '@vrs-tech.it', 'mario rossi@vrs-tech.it', '']) {
  test(`casella rifiutata: ${JSON.stringify(email)}`, async () => {
    const out = await fn(richiesta({ email, password: 'una-password-lunga' }));
    assert.equal(out.status, 400);
    assert.equal(service().length, 0);
  });
}

test('password corta, corpo vuoto o non JSON: 400', async () => {
  assert.equal((await fn(richiesta({ email: 'a@vrs-tech.it', password: '123456789' }))).status, 400);
  assert.equal((await fn(richiesta(undefined))).status, 400);
  assert.equal((await fn(richiesta('{non json'))).status, 400);
  assert.equal(service().length, 0);
});

test('casella gia\' registrata: 409 in italiano', async () => {
  crea = { stato: 422, corpo: { msg: 'A user with this email address has already been registered' } };
  const out = await fn(richiesta(buono));
  assert.equal(out.status, 409);
  assert.match((await out.json()).errore, /gia' un accesso/);
});

test('service key sbagliata: 502, non 401 (non deve buttare fuori l\'admin)', async () => {
  crea = { stato: 401, corpo: { message: 'Invalid API key' } };
  const out = await fn(richiesta(buono));
  assert.equal(out.status, 502);
  assert.match((await out.json()).errore, /SUPABASE_SERVICE_KEY/);
});

test('manca una variabile: 500 che dice quale, nessuna chiamata', async () => {
  delete process.env.SUPABASE_SERVICE_KEY;
  const out = await fn(richiesta(buono));
  assert.equal(out.status, 500);
  assert.match((await out.json()).errore, /SUPABASE_SERVICE_KEY/);
  assert.equal(chiamate.length, 0);
});

test('SUPABASE_URL con la barra finale: niente "//rest/v1"', async () => {
  process.env.SUPABASE_URL = 'https://finto.supabase.co//';
  const out = await fn(richiesta(buono));
  assert.equal(out.status, 200);
  for (const c of chiamate) assert.doesNotMatch(c.url, /\.co\/\//);
});
