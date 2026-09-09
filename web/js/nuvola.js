/* nuvola.js - il lato Supabase dell'applicazione.  #ANCHOR: nuvola

L'applicazione gira in due modi e non se ne accorge:

  LOCALE (avvia.bat)  browser -> server.py -> SQLite    -> il .accdb sul PC
  NUVOLA (Netlify)    browser -> Supabase  -> Postgres  <- push_cloud.py, una
                                                           volta al giorno

Il varco e' uno solo: `chiama('/api/...')` in api.js. Qui dentro quelle stesse
rotte diventano chiamate RPC a Postgres, con la STESSA forma di risposta
`{ok, stato, dati}`: nessun altro file del frontend cambia.

Tre cose che in locale erano del server e qui non ci sono piu':
 1. l'hub SSE -> Realtime (WebSocket), con ripiego a interrogazione periodica
    se il WebSocket non passa (proxy d'ufficio, reti ostili);
 2. la firma dell'operatore, che era un nome scritto a mano -> ora e' la casella
    con cui si e' fatto il login, e non si puo' fingere;
 3. il sync a comando: online il .accdb non e' raggiungibile, lo legge il PC
    dell'ufficio una volta al giorno.
*/
import { URL_SUPABASE, CHIAVE_ANON } from './nuvola-config.js';

export const attiva = () => !!(URL_SUPABASE && CHIAVE_ANON);

const K_SES = 'cs.sessione.v1';
const K_MAIL = 'cs.email';       // solo per riproporre la casella, mai la password
const emailRicordata = () => localStorage.getItem(K_MAIL) || '';
const ORIGINE = URL_SUPABASE.replace(/\/+$/, '');

let ses = null;
try { ses = JSON.parse(localStorage.getItem(K_SES) || 'null'); } catch { }
let ultimoAnno = new Date().getFullYear();
let ultimoErrore = '';           // motivo dell'ultimo rifiuto, mostrato al login

/* ------------------------------------------------------------- sessione -- */
function salvaSessione(s) {
  ses = s && {
    access_token: s.access_token,
    refresh_token: s.refresh_token,
    email: s.user?.email || ses?.email || '',
    scade: Date.now() + (s.expires_in || 3600) * 1000,
  };
  if (ses) localStorage.setItem(K_SES, JSON.stringify(ses));
  else localStorage.removeItem(K_SES);
  return ses;
}

async function auth(percorso, corpo) {
  const r = await fetch(ORIGINE + '/auth/v1/' + percorso, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: CHIAVE_ANON },
    body: JSON.stringify(corpo),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error_description || d.msg || d.message || 'accesso rifiutato');
  return d;
}

/** Token valido, rinfrescato se sta per scadere. null = non collegato. */
async function token() {
  if (!ses) return null;
  if (Date.now() < ses.scade - 60000) return ses.access_token;
  try {
    salvaSessione(await auth('token?grant_type=refresh_token',
      { refresh_token: ses.refresh_token }));
    return ses.access_token;
  } catch {
    salvaSessione(null);            // rinfresco fallito: si rifa' il login
    return null;
  }
}

export async function entra(email, password) {
  salvaSessione(await auth('token?grant_type=password', { email, password }));
  return ses;
}

export function esci() {
  salvaSessione(null);
  location.reload();
}

export const emailSessione = () => ses?.email || '';

/** Nome di firma proposto, ricavato dalla casella: mario.rossi -> Mario Rossi. */
export function nomeDaEmail(mail = emailSessione()) {
  return (mail.split('@')[0] || '').split(/[._-]+/)
    .filter(Boolean)
    .map(p => p[0].toUpperCase() + p.slice(1).toLowerCase())
    .join(' ');
}

/* ------------------------------------------------------------------ RPC -- */
async function rpc(nome, args, ms = 20000) {
  const t = await token();
  if (!t) return { ok: false, stato: 401, dati: { errore: 'sessione scaduta' } };
  const ctrl = new AbortController();
  const orologio = setTimeout(() => ctrl.abort(), ms);
  try {
    const r = await fetch(`${ORIGINE}/rest/v1/rpc/${nome}`, {
      method: 'POST', signal: ctrl.signal,
      headers: {
        'Content-Type': 'application/json',
        apikey: CHIAVE_ANON,
        Authorization: 'Bearer ' + t,
      },
      body: JSON.stringify(args || {}),
    });
    const testo = await r.text();
    const dati = testo ? JSON.parse(testo) : {};
    const motivo = dati.message || dati.hint || dati.error_description || '';
    if (r.status === 401) {
      // 401 = il token non vale piu'. Questa e' l'UNICA ragione per cui si
      // butta la sessione e si torna alla maschera d'accesso.
      ultimoErrore = 'Sessione scaduta: rientra.';
      salvaSessione(null);
      return { ok: false, stato: 401, dati: { errore: ultimoErrore } };
    }
    if (r.status === 403) {
      // 403 = il token e' buono, ha risposto Postgres di no. Due cause diverse
      // che si somigliano: la casella non e' abilitata (autorizzato() in
      // cloud/02-funzioni.sql) oppure a QUESTA funzione manca il grant execute
      // di cloud/04-sicurezza.sql. La sessione NON si tocca: buttarla rimandava
      // al login a ogni chiamata, e una password giusta sembrava sbagliata. Si
      // riporta il motivo vero e il nome della funzione, cosi' si vede subito
      // quale dei due casi e'.
      return { ok: false, stato: 403, dati: { errore: /autorizzat/i.test(motivo)
        ? 'Questa casella non e\' abilitata: serve un indirizzo @vrs-tech.it.'
        : 'Il database ha negato ' + nome + ': ' + (motivo || 'permesso mancante') + '.' } };
    }
    if (!r.ok) {
      return { ok: false, stato: r.status,
               dati: { errore: motivo || ('errore ' + r.status) } };
    }
    // Postgres risponde sempre 200: lo stato vero viaggia dentro il JSON.
    const stato = Number(dati?.http) || 200;
    return { ok: stato < 400, stato, dati };
  } finally {
    clearTimeout(orologio);
  }
}

/* ------------------------------------------------------- le vecchie rotte - */
/** Stessa firma di api.chiama: le rotte /api/... diventano funzioni Postgres. */
export async function chiama(percorso, { metodo = 'GET', body = {}, ms = 20000 } = {}) {
  const u = new URL(percorso, location.origin);
  const q = Object.fromEntries(u.searchParams);
  const num = v => (v === undefined || v === '' || v === null ? null : Number(v));
  const b = body || {};

  switch (u.pathname) {
    case '/api/bootstrap': {
      const r = await rpc('app_bootstrap', { p_anno: num(q.anno) }, ms);
      if (r.ok && r.dati?.anno) ultimoAnno = r.dati.anno;
      return r;
    }
    case '/api/storia':
      return rpc('app_storia', { p_id_service: num(q.id_service), p_anno: num(q.anno),
                                 p_mese: num(q.mese) }, ms);
    case '/api/attivita':
      return rpc('app_attivita', { p_limit: num(q.limit) || 60 }, ms);
    case '/api/incongruenze':
      return rpc('app_incongruenze', { p_anno: num(q.anno) }, ms);
    case '/api/export.csv':
      return rpc('app_export_csv', { p_anno: num(q.anno), p_mese: num(q.mese) }, 60000);

    case '/api/toggle':
      return rpc('toggle_cella', {
        p_id_service: b.id_service, p_anno: b.anno, p_mese: b.mese,
        p_campo: b.campo, p_valore: b.valore ? 1 : 0,
        p_base_rev: b.base_rev ?? null,
        p_base_valore: b.base_valore == null ? null : (b.base_valore ? 1 : 0),
        p_op_id: b.op_id ?? null, p_origine: b.origine || 'live',
      }, ms);
    case '/api/bulk':
      return rpc('bulk_celle', {
        p_anno: b.anno, p_celle: b.celle || [],
        p_op_id: b.op_id ?? null, p_origine: b.origine || 'bulk',
      }, Math.max(ms, 40000));
    case '/api/nota':
      return rpc('imposta_nota', { p_id_service: b.id_service, p_anno: b.anno,
                                   p_mese: b.mese, p_nota: b.nota || '',
                                   p_base_rev: b.base_rev ?? null,
                                   p_base_nota: b.base_nota ?? null }, ms);
    case '/api/operatore':
      return rpc('imposta_operatore', { p_nome: b.nome }, ms);
    case '/api/ping':
      return rpc('app_ping', { p_dove: b.dove || null }, ms);
    case '/api/impostazioni':
      return rpc('imposta_meta', { p_inizio_tracciamento: b.inizio_tracciamento }, ms);

    // i PDF delle schede tecnici (cloud/06-documenti.sql, #ANCHOR: documenti)
    case '/api/documenti':
      return rpc('app_documenti', { p_anno: num(q.anno) }, ms);
    case '/api/documento':
      return rpc('registra_documento', {
        p_id_service: b.id_service, p_anno: b.anno, p_mese: num(b.mese),
        p_nome: b.nome || '', p_percorso: b.percorso,
        p_bytes: b.bytes || 0, p_pagine: b.pagine || 0, p_anteprima: b.anteprima || null,
      }, ms);
    case '/api/documento_elimina':
      return rpc('elimina_documento', { p_id: b.id }, ms);

    case '/api/sync':
      // Il .accdb sta sul PC dell'ufficio e da qui non si raggiunge: e' quel PC
      // a spingere l'anagrafica, una volta al giorno.
      return { ok: false, stato: 400, dati: { errore:
        'online il database Access non e\' raggiungibile: lo legge il PC ' +
        'dell\'ufficio una volta al giorno, da solo.' } };
  }
  return { ok: false, stato: 404, dati: { errore: 'rotta sconosciuta: ' + u.pathname } };
}

/* --------------------------------------------------------------- storage - */
/* Il bucket `documenti` e' privato: si carica, si cancella e si legge (con un
   indirizzo firmato a scadenza) solo da chi e' entrato. Le policy stanno in
   cloud/06-documenti.sql. */
export const haSessione = () => !!ses;

async function intestazioni() {
  const t = await token();
  if (!t) throw new Error('sessione scaduta: rientra nel tracker');
  return { apikey: CHIAVE_ANON, Authorization: 'Bearer ' + t };
}

export async function caricaOggetto(bucket, percorso, blob) {
  const r = await fetch(`${ORIGINE}/storage/v1/object/${bucket}/${percorso}`, {
    method: 'POST', body: blob,
    headers: { ...await intestazioni(), 'Content-Type': blob.type || 'application/pdf',
               'x-upsert': 'false' },
  });
  if (!r.ok) {
    const d = await r.json().catch(() => ({}));
    throw new Error(d.message || d.error || ('caricamento rifiutato (' + r.status + ')'));
  }
}

export async function eliminaOggetto(bucket, percorso) {
  const r = await fetch(`${ORIGINE}/storage/v1/object/${bucket}/${percorso}`, {
    method: 'DELETE', headers: await intestazioni() });
  if (!r.ok && r.status !== 404) throw new Error('eliminazione rifiutata (' + r.status + ')');
}

export async function urlFirmato(bucket, percorso, secondi = 3600) {
  const r = await fetch(`${ORIGINE}/storage/v1/object/sign/${bucket}/${percorso}`, {
    method: 'POST', body: JSON.stringify({ expiresIn: secondi }),
    headers: { ...await intestazioni(), 'Content-Type': 'application/json' },
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || !d.signedURL) throw new Error(d.message || 'indirizzo firmato non ottenuto');
  return ORIGINE + '/storage/v1' + d.signedURL;
}

/* -------------------------------------------------------------- realtime - */
const docDa = r => ({
  id: r.id, id_service: r.id_service, anno: r.anno, mese: r.mese, nome: r.nome,
  percorso: r.percorso, bytes: r.bytes, pagine: r.pagine, anteprima: r.anteprima,
  creato_il: r.creato_il, creato_da: r.creato_da,
});
const cellaDa = r => ({
  s: r.stampata, c: r.controllata, k: r.corretta, r: r.ricambi,
  rev: r.rev, by: r.updated_by, at: r.updated_at, nota: r.nota || '',
});

/** Sostituisce l'hub SSE. `mio()` dice il nome di chi sta a questo schermo: le
 *  proprie modifiche si applicano lo stesso ma senza il lampo "l'ha fatto un
 *  altro". Ritorna la funzione per chiudere. */
export function apriStream(onEvento, mio = () => '') {
  let ws = null, chiuso = false, tentativi = 0, batti = null, sonda = null;
  let rif = 0, ultimoTs = '';
  const TOPIC = 'realtime:crono';

  const spedisci = (event, payload, topic = TOPIC) => {
    if (ws && ws.readyState === 1) {
      ws.send(JSON.stringify({ topic, event, payload, ref: String(++rif), join_ref: '1' }));
    }
  };

  /* Ripiego: se il WebSocket non regge, si chiedono ogni 15 s solo le celle
     cambiate dopo l'ultima vista. Poche righe, non tutto il bootstrap. */
  const avviaSonda = () => {
    if (sonda || chiuso) return;
    sonda = setInterval(async () => {
      const { ok, dati } = await rpc('app_celle_dopo',
        { p_anno: ultimoAnno, p_da: ultimoTs || null });
      if (!ok) return;
      for (const c of dati.celle || []) {
        if (c.cella?.at > ultimoTs) ultimoTs = c.cella.at;
        onEvento({ tipo: 'cella', anno: ultimoAnno, id_service: c.id_service,
                   mese: c.mese, cella: c.cella,
                   operatore: c.cella?.by === mio() ? '' : (c.cella?.by || '') });
      }
    }, 15000);
  };
  const fermaSonda = () => { clearInterval(sonda); sonda = null; };

  const apri = async () => {
    if (chiuso) return;
    const t = await token();
    if (!t) return;
    ws = new WebSocket(
      `${ORIGINE.replace(/^http/, 'ws')}/realtime/v1/websocket?apikey=${CHIAVE_ANON}&vsn=1.0.0`);

    ws.onopen = () => {
      tentativi = 0;
      fermaSonda();
      ws.send(JSON.stringify({
        topic: TOPIC, event: 'phx_join', ref: '1', join_ref: '1',
        payload: {
          access_token: t,
          config: {
            broadcast: { self: false }, presence: { key: '' },
            postgres_changes: [
              { event: '*', schema: 'public', table: 'mappature' },
              { event: '*', schema: 'public', table: 'meta' },
              { event: 'INSERT', schema: 'public', table: 'sync_log' },
              { event: '*', schema: 'public', table: 'documenti' },
            ],
          },
        },
      }));
      batti = setInterval(async () => {
        spedisci('heartbeat', {}, 'phoenix');
        const nuovo = await token();       // il token scade: va rinnovato anche qui
        if (nuovo && nuovo !== t) spedisci('access_token', { access_token: nuovo });
      }, 25000);
    };

    ws.onmessage = e => {
      let m;
      try { m = JSON.parse(e.data); } catch { return; }
      if (m.event !== 'postgres_changes') return;
      const d = m.payload?.data || m.payload || {};
      const r = d.record || d.new || {};
      if (d.table === 'mappature' && r.id_service) {
        if (r.updated_at > ultimoTs) ultimoTs = r.updated_at;
        onEvento({ tipo: 'cella', anno: r.anno, id_service: r.id_service, mese: r.mese,
                   cella: cellaDa(r),
                   operatore: r.updated_by === mio() ? '' : (r.updated_by || '') });
      } else if (d.table === 'meta' && r.k === 'inizio_tracciamento') {
        onEvento({ tipo: 'impostazioni', inizio_tracciamento: r.v });
      } else if (d.table === 'sync_log' && r.ts) {
        onEvento({ tipo: 'sync', riepilogo: r });
      } else if (d.table === 'documenti') {
        const vecchio = d.old_record || d.old || {};
        if (d.type === 'DELETE' || (!r.id && vecchio.id)) {
          onEvento({ tipo: 'documento', anno: vecchio.anno, id_service: vecchio.id_service,
                     eliminato: vecchio.id });
        } else if (r.id) {
          onEvento({ tipo: 'documento', anno: r.anno, id_service: r.id_service,
                     documento: docDa(r),
                     operatore: r.creato_da === mio() ? '' : (r.creato_da || '') });
        }
      }
    };

    ws.onclose = () => {
      clearInterval(batti);
      if (chiuso) return;
      if (++tentativi >= 4) avviaSonda();   // il WebSocket non passa: si ripiega
      setTimeout(apri, Math.min(1000 * 2 ** tentativi, 20000));
    };
    ws.onerror = () => ws.close();
  };

  apri();
  return () => { chiuso = true; clearInterval(batti); fermaSonda(); ws?.close(); };
}

/* -------------------------------------------------------------- accesso -- */
/** Mostra la maschera di accesso finche' non si entra. Si risolve a sessione
 *  buona: chi chiama puo' fare finta che il login non esista. */
export function assicuraSessione() {
  return new Promise(async resolve => {
    if (await token()) return resolve(ses);

    const velo = document.createElement('div');
    velo.className = 'velo accesso';
    velo.innerHTML = `
      <form class="foglio">
        <h2>Crono Mappature</h2>
        <p class="sotto">Entra con la tua casella aziendale. Il nome che firma le
          spunte e' questo: si sa sempre chi ha fatto cosa.</p>
        <label class="acc-et" for="acc-mail">Casella</label>
        <input class="campo" id="acc-mail" type="email" autocomplete="username"
               placeholder="nome.cognome@vrs-tech.it" required>
        <label class="acc-et" for="acc-pwd">Password</label>
        <input class="campo" id="acc-pwd" type="password" autocomplete="current-password"
               required>
        <p class="acc-errore" hidden></p>
        <button class="bottone acc-invia" type="submit">Entra</button>
      </form>`;
    document.body.appendChild(velo);

    const form = velo.querySelector('form');
    const err = velo.querySelector('.acc-errore');
    const bot = velo.querySelector('.acc-invia');
    const mail = velo.querySelector('#acc-mail');
    if (ses?.email || emailRicordata()) mail.value = ses?.email || emailRicordata();
    if (ultimoErrore) { err.textContent = ultimoErrore; err.hidden = false; }
    (mail.value ? velo.querySelector('#acc-pwd') : mail).focus();

    form.addEventListener('submit', async e => {
      e.preventDefault();
      err.hidden = true;
      bot.disabled = true;
      bot.textContent = 'Un attimo…';
      try {
        await entra(mail.value.trim(), velo.querySelector('#acc-pwd').value);
        localStorage.setItem(K_MAIL, mail.value.trim());
        ultimoErrore = '';
        velo.remove();
        resolve(ses);
      } catch (ex) {
        err.textContent = String(ex.message || ex);
        err.hidden = false;
        bot.disabled = false;
        bot.textContent = 'Entra';
      }
    });
  });
}
