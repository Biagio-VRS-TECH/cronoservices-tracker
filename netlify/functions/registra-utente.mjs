/* registra-utente.mjs - l'amministratore registra un collega dall'app.
   #ANCHOR: registra-utente
 *
 * Perche' esiste. Creare una casella in Supabase richiede la SERVICE ROLE KEY,
 * la chiave che puo' tutto: non puo' stare in `web/`, che e' statico e che
 * chiunque apra la pagina puo' leggere. Serve un pezzo che la tenga nascosta,
 * ed e' questo: l'unica cosa del progetto che non gira nel browser.
 *
 * Resta fedele alle regole del progetto: un file solo, nessun `npm install`,
 * nessuna dipendenza, nessun passo di build. Il runtime di Netlify ha `fetch`.
 *
 * CHI DECIDE NON E' QUESTA FUNZIONE. Il ruolo lo dice il database: si prende il
 * token di chi ha premuto il bottone e con QUEL token si chiede a Postgres
 * `ruolo_corrente()`. Se non risponde 'admin' non si va avanti. Cosi'
 * l'autorizzazione resta dove sta gia' tutta l'altra (#ANCHOR: ruoli), e questo
 * file non ha una sua idea di chi comanda: se domani cambiano i ruoli, cambia
 * solo il database. La service key entra in gioco SOLO dopo quel via libera, e
 * per una cosa sola: creare l'utente.
 *
 * Variabili d'ambiente del sito Netlify (Site settings -> Environment variables):
 *   SUPABASE_URL          la stessa che usa cloud/netlify-build.sh
 *   SUPABASE_ANON_KEY     la stessa (serve come `apikey` per la verifica)
 *   SUPABASE_SERVICE_KEY  la chiave "service_role". NON deve finire nel client:
 *                         netlify-build.sh non la scrive in nuvola-config.js, e
 *                         va lasciata visibile solo alle Functions.
 */

const DOMINIO = '@vrs-tech.it';
const PASSWORD_MINIMA = 10;

const risposta = (stato, dati) =>
  new Response(JSON.stringify(dati), {
    status: stato,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });

export default async (req) => {
  if (req.method !== 'POST') {
    return risposta(405, { errore: 'metodo non ammesso' });
  }

  const URL_SB = process.env.SUPABASE_URL;
  const ANON = process.env.SUPABASE_ANON_KEY;
  const SERVICE = process.env.SUPABASE_SERVICE_KEY;
  if (!URL_SB || !ANON || !SERVICE) {
    // Detto per intero: e' l'errore che si fa una volta sola, in fase di
    // configurazione, e sapere QUALE manca fa risparmiare mezz'ora.
    return risposta(500, { errore:
      'configurazione incompleta sul sito Netlify: manca ' +
      [['SUPABASE_URL', URL_SB], ['SUPABASE_ANON_KEY', ANON],
       ['SUPABASE_SERVICE_KEY', SERVICE]]
        .filter(([, v]) => !v).map(([k]) => k).join(', ') + '.' });
  }

  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!token) return risposta(401, { errore: 'sessione mancante: rientra.' });

  /* 1. Chi chiede e' amministratore? Lo dice Postgres, con il SUO token. */
  let ruolo = null;
  try {
    const r = await fetch(`${URL_SB}/rest/v1/rpc/ruolo_corrente`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: ANON,
                 Authorization: 'Bearer ' + token },
      body: '{}',
    });
    if (r.status === 401) return risposta(401, { errore: 'sessione scaduta: rientra.' });
    if (!r.ok) return risposta(403, { errore: 'il database non ha confermato il tuo ruolo.' });
    ruolo = (await r.json());
  } catch {
    return risposta(502, { errore: 'database non raggiungibile.' });
  }
  if (ruolo !== 'admin') {
    return risposta(403, { errore: 'questa azione e\' dell\'amministratore' });
  }

  /* 2. Cosa mi hanno chiesto di creare. */
  let corpo;
  try { corpo = await req.json(); } catch { corpo = null; }
  const email = String(corpo?.email || '').trim().toLowerCase();
  const password = String(corpo?.password || '');

  if (!/^[^\s@]+@[^\s@]+$/.test(email) || !email.endsWith(DOMINIO)) {
    return risposta(400, { errore:
      `serve una casella aziendale, che finisca per ${DOMINIO}` });
  }
  if (password.length < PASSWORD_MINIMA) {
    return risposta(400, { errore:
      `la password deve avere almeno ${PASSWORD_MINIMA} caratteri` });
  }

  /* 3. Solo adesso la service key. `email_confirm: true` e' l'"Auto Confirm
        User" che si spuntava a mano nel pannello di Supabase: senza, il collega
        resterebbe ad aspettare una mail di conferma che nessuno manda. */
  let creato;
  try {
    const r = await fetch(`${URL_SB}/auth/v1/admin/users`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: SERVICE,
                 Authorization: 'Bearer ' + SERVICE },
      body: JSON.stringify({ email, password, email_confirm: true }),
    });
    creato = await r.json().catch(() => ({}));
    if (!r.ok) {
      const motivo = creato?.msg || creato?.message || creato?.error_description || '';
      // Il caso di gran lunga piu' probabile, detto in italiano.
      if (r.status === 422 || /already|exist|registrat/i.test(motivo)) {
        return risposta(409, { errore: `${email} ha gia' un accesso.` });
      }
      return risposta(r.status, { errore: motivo || `errore ${r.status}` });
    }
  } catch {
    return risposta(502, { errore: 'database non raggiungibile.' });
  }

  /* La riga in `operatori` NON si crea qui: nasce da sola al primo accesso del
     collega (imposta_operatore, cloud/03-letture.sql), col nome ricavato dalla
     sua casella. E' anche il motivo per cui il ruolo si da' dopo: prima di
     quella riga non c'e' niente da nominare. */
  return risposta(200, { email, id: creato?.id || null });
};
