/* prova-registra-utente.mjs - la prova di registra-utente.mjs, a mano.
 *
 *   node netlify/functions/prova-registra-utente.mjs
 *
 * Perche' esiste. Tutto il resto del progetto si prova aprendo il browser; la
 * Function no, perche' gira sul server di Netlify. Ed e' proprio il pezzo che
 * tiene la SERVICE KEY, cioe' quello dove un errore costa di piu'. Questo file
 * la esegue davvero, sostituendo `process.env` e `fetch` con dei finti: non
 * tocca ne' Supabase ne' Netlify, e non crea nessun utente.
 *
 * La domanda a cui risponde non e' solo "che stato torna", ma soprattutto:
 * **la service key parte solo dopo il via libera del database?** L'ultima
 * colonna della tabella e' quella che conta.
 *
 * Nessuna dipendenza: solo Node. Se un giorno Node non c'e', gli stessi
 * controlli si fanno importando il modulo nella console del browser - e' ESM
 * standard e usa `process` solo dentro la funzione.
 */
import fn from './registra-utente.mjs';

const vero = process;                  // lo stub qui sotto copre `process`
const chiamate = [];
let creaStato = 200, creaCorpo = { id: 'nuovo-id' }, ruolo = 'admin', tokenUsato = null;

globalThis.fetch = async (url, o) => {
  const via = String(url).replace(/^https?:\/\/[^/]+/, '');
  chiamate.push(via);
  if (via.includes('/rpc/ruolo_corrente')) {
    tokenUsato = o.headers.Authorization;
    if (ruolo === '__401') return new Response('{}', { status: 401 });
    return new Response(JSON.stringify(ruolo), { status: 200 });
  }
  return new Response(JSON.stringify(creaCorpo), { status: creaStato });
};

const AMBIENTE = {
  SUPABASE_URL: 'https://finto.supabase.co',
  SUPABASE_ANON_KEY: 'chiave-anon',
  SUPABASE_SERVICE_KEY: 'chiave-service',
};

const req = (corpo, tok = 'token-di-chi-preme', metodo = 'POST') =>
  new Request('http://sito/api/registra-utente', {
    method: metodo,
    headers: tok ? { Authorization: 'Bearer ' + tok, 'Content-Type': 'application/json' } : {},
    body: metodo === 'POST' && corpo ? JSON.stringify(corpo) : undefined,
  });

let falliti = 0;
async function prova(etichetta, r, atteso, { serviceAmmessa = false } = {}) {
  chiamate.length = 0;
  const out = await fn(r);
  const d = await out.json().catch(() => ({}));
  const usaService = chiamate.some(c => c.includes('/auth/v1/admin/users'));
  const bene = out.status === atteso && (serviceAmmessa || !usaService);
  if (!bene) falliti++;
  console.log((bene ? '  ok   ' : '  KO   ') + etichetta.padEnd(28) +
    String(out.status).padEnd(6) + (d.errore || JSON.stringify(d)).slice(0, 60).padEnd(62) +
    (usaService ? 'SERVICE KEY USATA' : 'service key non toccata'));
}

const buono = { email: 'mario.rossi@vrs-tech.it', password: 'CavalloBatteria9' };

console.log('\n  esito  caso                        stato risposta' +
            ' '.repeat(54) + 'la chiave che puo tutto');
console.log('  ' + '-'.repeat(118));

globalThis.process = { env: {} };
await prova('senza variabili', req(buono), 500);

globalThis.process = { env: AMBIENTE };
await prova('metodo GET', req(null, 'tok', 'GET'), 405);
await prova('senza token', req(buono, null), 401);
ruolo = 'tecnico';     await prova('lo chiede un operatore', req(buono), 403);
ruolo = 'approvatore'; await prova('lo chiede un approvatore', req(buono), 403);
ruolo = '__401';       await prova('token scaduto', req(buono), 401);
ruolo = 'admin';
await prova('casella non aziendale', req({ ...buono, email: 'tizio@gmail.com' }), 400);
// un dominio che FINISCE per qualcosa di simile non deve passare per sbaglio
await prova('dominio somigliante', req({ ...buono, email: 'x@finto-vrs-tech.it' }), 400);
await prova('password corta', req({ ...buono, password: 'corta1234' }), 400);
await prova('corpo vuoto', req({}), 400);
await prova('corpo non JSON', new Request('http://sito/api/registra-utente', {
  method: 'POST', headers: { Authorization: 'Bearer t' }, body: 'non-json' }), 400);
creaStato = 422; creaCorpo = { msg: 'A user with this email address has already been registered' };
await prova('casella gia esistente', req(buono), 409, { serviceAmmessa: true });
creaStato = 200; creaCorpo = { id: 'nuovo-id' };
await prova('AMMINISTRATORE, tutto ok', req(buono), 200, { serviceAmmessa: true });

console.log('  ' + '-'.repeat(118));

/* Il ruolo va chiesto con il token di CHI PREME, non con la service key:
   e' tutta qui la ragione per cui questa funzione non decide niente da sola. */
const conIlTokenGiusto = tokenUsato === 'Bearer token-di-chi-preme';
if (!conIlTokenGiusto) falliti++;
console.log((conIlTokenGiusto ? '  ok   ' : '  KO   ') +
  'il ruolo lo chiede con: ' + tokenUsato + '  (dev\'essere il token di chi preme)');

/* La password non deve tornare indietro nemmeno per sbaglio. */
const testo = await (await fn(req(buono))).text();
const perde = testo.includes(buono.password);
if (perde) falliti++;
console.log((perde ? '  KO   ' : '  ok   ') +
  'la password torna al client: ' + (perde ? 'SI' : 'no'));

console.log('\n  ' + (falliti ? falliti + ' casi NON come previsto' : 'tutti i casi come previsto') + '\n');
vero.exitCode = falliti ? 1 : 0;
