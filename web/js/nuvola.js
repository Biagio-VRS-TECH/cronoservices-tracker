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
import { dimensione, impostaSegnalatore, umano } from './ui.js';
import { svgIcona } from './vrs-icone.js';

export const attiva = () => !!(URL_SUPABASE && CHIAVE_ANON);

const K_SES = 'cs.sessione.v1';
const K_MAIL = 'cs.email';       // solo per riproporre la casella, mai la password
const emailRicordata = () => localStorage.getItem(K_MAIL) || '';
const ORIGINE = URL_SUPABASE.replace(/\/+$/, '');
/* Dove vive la pagina «Nuova password» (il link della mail di «Password
   dimenticata»): l'account e' lo stesso del Planning. */
const URL_PLANNING = 'https://vrs-planning.netlify.app';

/* La sessione salvata. Chi la scrive puo' essere anche UN'ALTRA SCHEDA dello
   stesso sito: si rilegge prima di ogni rinnovo (vedi `token`). */
function sessioneSalvata() {
  try { return JSON.parse(localStorage.getItem(K_SES) || 'null'); } catch { return null; }
}
let ses = sessioneSalvata();
let ultimoAnno = new Date().getFullYear();
let ultimoErrore = '';           // motivo dell'ultimo rifiuto, mostrato al login
let rinnovo = null;              // il rinnovo in corso: uno solo alla volta

/* ------------------------------------------------------------- sessione -- */
function salvaSessione(s) {
  ses = s && {
    access_token: s.access_token,
    refresh_token: s.refresh_token,
    email: s.user?.email || ses?.email || '',
    scade: Date.now() + (s.expires_in || 3600) * 1000,
  };
  // localStorage puo' mancare o essere pieno (navigazione privata): la
  // sessione in memoria vale lo stesso fino al ricarico
  try {
    if (ses) localStorage.setItem(K_SES, JSON.stringify(ses));
    else localStorage.removeItem(K_SES);
  } catch { }
  return ses;
}

async function auth(percorso, corpo) {
  const r = await fetch(ORIGINE + '/auth/v1/' + percorso, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: CHIAVE_ANON },
    body: JSON.stringify(corpo),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) {
    const e = new Error(d.error_description || d.msg || d.message || 'accesso rifiutato');
    e.stato = r.status;               // c'e' = ha risposto il server, non la rete
    throw e;
  }
  return d;
}

/** Token valido, rinfrescato se sta per scadere. null = non collegato.
 *  Lancia (come un fetch) se il rinnovo non arriva al server: rete giu'. */
async function token() {
  if (!ses) return null;
  // Un'altra scheda puo' aver gia' rinnovato: Supabase RUOTA il refresh token,
  // e quello che teniamo in memoria sarebbe gia' consumato.
  const disco = sessioneSalvata();
  if (disco?.access_token && disco.access_token !== ses.access_token
      && (disco.scade || 0) > (ses.scade || 0)) ses = disco;
  if (Date.now() < ses.scade - 60000) return ses.access_token;
  // Chiamate che partono insieme (bootstrap, ping, coda) aspettano lo STESSO
  // rinnovo: due rinnovi in parallelo col refresh token che ruota si
  // butterebbero fuori a vicenda.
  if (!rinnovo) rinnovo = rinnova().finally(() => { rinnovo = null; });
  return rinnovo;
}

async function rinnova() {
  const vecchio = ses;
  try {
    salvaSessione(await auth('token?grant_type=refresh_token',
      { refresh_token: vecchio.refresh_token }));
    return ses.access_token;
  } catch (e) {
    // Rete giu' o Supabase che risponde 5xx/429: la sessione e' ancora buona,
    // non la si butta. Prima un telefono senza campo, al primo token scaduto,
    // si trovava fuori e doveva rifare il login appena tornava la rete.
    if (!e.stato || e.stato >= 500 || e.stato === 429) throw e;
    // Rifiutato davvero. Ma se nel frattempo un'altra scheda ha rinnovato, il
    // suo refresh token e' quello buono: si prende quello.
    const disco = sessioneSalvata();
    if (disco?.refresh_token && disco.refresh_token !== vecchio.refresh_token) {
      ses = disco;
      return Date.now() < ses.scade - 60000 ? ses.access_token : null;
    }
    salvaSessione(null);            // rinfresco rifiutato: si rifa' il login
    return null;
  }
}

/* Un 401 dal database: il token `t` non vale piu'. Se pero' un'altra scheda ha
   gia' salvato una sessione nuova, si butta solo la nostra copia in memoria -
   cancellare localStorage avrebbe fatto uscire anche lei. */
function buttaSessione(t) {
  const disco = sessioneSalvata();
  if (disco?.access_token && disco.access_token !== t) { ses = disco; return; }
  salvaSessione(null);
}

export async function entra(email, password) {
  salvaSessione(await auth('token?grant_type=password', { email, password }));
  return ses;
}

export function esci() {
  // Il refresh token si revoca anche sul server (solo questa sessione:
  // `scope=local`, il Planning e gli altri dispositivi restano dentro), se no
  // chi lo avesse copiato potrebbe rinnovarlo per settimane. `keepalive` fa
  // partire la richiesta anche se la pagina si ricarica subito dopo.
  if (ses?.access_token) {
    try {
      fetch(ORIGINE + '/auth/v1/logout?scope=local', {
        method: 'POST', keepalive: true,
        headers: { apikey: CHIAVE_ANON, Authorization: 'Bearer ' + ses.access_token },
      }).catch(() => { });
    } catch { }
  }
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

/* ------------------------------------------------ metadati dell'account -- */
/* VIS-22 (#ANCHOR: famiglia in js/famiglia.js): il tema scelto nel Planning
   viaggia nei metadati dell'utente (`user_metadata`), che sono anche dentro il
   token: leggerli da li' non costa nessuna chiamata. Non servono a nessun
   controllo d'accesso, sono solo preferenze che la persona scrive per se'. */

/** I metadati dentro il token di adesso (null senza sessione o token illeggibile). */
export function metadatiSessione() {
  try {
    const p = ses?.access_token?.split('.')[1];
    if (!p) return null;
    const b = atob(p.replace(/-/g, '+').replace(/_/g, '/'));
    const json = new TextDecoder().decode(Uint8Array.from(b, c => c.charCodeAt(0)));
    return JSON.parse(json).user_metadata || null;
  } catch { return null; }
}

/** I metadati freschi dal server: il token puo' averli di prima del rinnovo. */
export async function metadatiFreschi() {
  const t = await token();
  if (!t) return null;
  const r = await fetch(ORIGINE + '/auth/v1/user', {
    headers: { apikey: CHIAVE_ANON, Authorization: 'Bearer ' + t },
  });
  if (!r.ok) return null;
  const d = await r.json().catch(() => ({}));
  return d.user_metadata || null;
}

/** Aggiunge (o sostituisce) chiavi dei metadati: le altre restano come sono. */
export async function salvaMetadati(dati) {
  const t = await token();
  if (!t) return false;
  const r = await fetch(ORIGINE + '/auth/v1/user', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', apikey: CHIAVE_ANON, Authorization: 'Bearer ' + t },
    body: JSON.stringify({ data: dati }),
  });
  return r.ok;
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
      ultimoErrore = 'Sessione scaduta: accedi di nuovo.';
      buttaSessione(t);
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

/** La sola chiamata che non va a Postgres ma alla Netlify Function
 *  (#ANCHOR: registra-utente). Stessa forma di risposta di `rpc`, cosi' da
 *  fuori - api.js, app.js - non si vede la differenza. Il token viaggia com'e':
 *  e' la Function a chiedere al database chi sei. */
async function funzione(percorso, corpo, ms = 20000) {
  const t = await token();
  if (!t) return { ok: false, stato: 401, dati: { errore: 'sessione scaduta' } };
  const ctrl = new AbortController();
  const orologio = setTimeout(() => ctrl.abort(), ms);
  try {
    const r = await fetch(percorso, {
      method: 'POST', signal: ctrl.signal,
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + t },
      body: JSON.stringify(corpo || {}),
    });
    const testo = await r.text();
    let dati;
    try {
      dati = testo ? JSON.parse(testo) : {};
    } catch {
      // Non e' JSON. Se e' un 200 (o un 404) e' il catch-all di netlify.toml che
      // ha risposto con index.html: la Function non e' pubblicata. Un 5xx col
      // testo di Netlify ("Task timed out") e' invece una Function che c'e' ma
      // e' caduta: dirlo, invece di mandare a ripubblicare.
      if (r.ok || r.status === 404) {
        return { ok: false, stato: 501, dati: { errore:
          'La registrazione non \u00e8 attiva su questo sito: manca la Function ' +
          '(vedi cloud/LEGGIMI.md).' } };
      }
      return { ok: false, stato: r.status, dati: { errore:
        `La Function ha risposto ${r.status} senza un esito leggibile: riprova fra un momento.` } };
    }
    if (r.status === 401) {
      ultimoErrore = 'Sessione scaduta: accedi di nuovo.';
      buttaSessione(t);
      return { ok: false, stato: 401, dati: { errore: ultimoErrore } };
    }
    return { ok: r.ok, stato: r.status,
             dati: r.ok ? dati : { errore: dati.errore || ('errore ' + r.status) } };
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
      /* I responsabili (PRD-04, cloud/11-responsabile.sql) viaggiano accanto,
         in parallelo: app_bootstrap resta com'e'. Se la funzione non c'e' ancora
         (file 11 non applicato) o risponde male, il bootstrap vale lo stesso e
         filtro e scelta del responsabile semplicemente non compaiono. */
      const [r, resp] = await Promise.all([
        rpc('app_bootstrap', { p_anno: num(q.anno) }, ms),
        rpc('app_responsabili', {}, ms).catch(() => null),
      ]);
      if (r.ok && r.dati?.anno) ultimoAnno = r.dati.anno;
      if (r.ok && r.dati && resp?.ok && resp.dati?.responsabili) {
        r.dati.responsabili = resp.dati.responsabili;
        r.dati.persone = resp.dati.persone || [];
        r.dati.io = resp.dati.io || '';
      }
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
    case '/api/ruolo':                     // (#ANCHOR: ruoli) solo un admin passa
      return rpc('imposta_ruolo', { p_nome: b.nome, p_ruolo: b.ruolo }, ms);
    case '/api/responsabile':              // (#ANCHOR: responsabile) solo un admin passa
      return rpc('imposta_responsabile', {
        p_ids: (b.ids || []).map(Number).filter(Number.isFinite),
        p_email: b.email || '',
      }, Math.max(ms, 40000));
    case '/api/registra_utente':
      // L'unica rotta che NON e' una funzione Postgres (#ANCHOR: registra-utente):
      // creare una casella vuole la service key, che sta solo nella Function.
      return funzione('/api/registra-utente', b, ms);
    case '/api/ripristina':                // (#ANCHOR: ripristino) un blocco o una spunta
      return rpc('ripristina_blocco', { p_op_id: b.op_id }, Math.max(ms, 40000));
    case '/api/ping':
      return rpc('app_ping', { p_dove: b.dove || null }, ms);
    case '/api/impostazioni':
      return rpc('imposta_meta', { p_inizio_tracciamento: b.inizio_tracciamento }, ms);
    case '/api/diario_azzera':             // solo admin, e solo dopo aver scritto OK
      return rpc('azzera_diario', {}, Math.max(ms, 40000));

    // i PDF delle schede tecnici (cloud/06-documenti.sql, #ANCHOR: documenti)
    case '/api/documenti':
      return rpc('app_documenti', { p_anno: num(q.anno) }, ms);
    case '/api/documento':
      return rpc('registra_documento', {
        p_id_service: b.id_service, p_anno: b.anno, p_mese: num(b.mese),
        p_nome: b.nome || '', p_percorso: b.percorso,
        p_bytes: b.bytes || 0, p_pagine: b.pagine || 0, p_anteprima: b.anteprima || null,
        p_gruppo: b.gruppo || null, p_fascicolo: num(b.fascicolo) || null,
        p_fascicoli: num(b.fascicoli) || null,
        p_tipo: b.tipo === 'registro' ? 'registro' : 'schede',
      }, ms);
    case '/api/documento_elimina':
      return rpc('elimina_documento', { p_id: b.id }, ms);
    /* il cestino dei PDF (SEC-05, cloud/10-migliorie-2026-09.sql): solo online */
    case '/api/documento_ripristina':
      return rpc('ripristina_documento', { p_id: b.id }, ms);
    case '/api/documento_definitivo':
      return rpc('elimina_documento_definitivo', { p_id: b.id }, ms);
    case '/api/cestino':
      return rpc('app_cestino_documenti', {}, ms);
    case '/api/cestino_svuota':
      return rpc('svuota_cestino_documenti', { p_giorni: num(b.giorni) ?? 30 }, Math.max(ms, 60000));
    case '/api/documenti_elimina':         // in blocco: un anno (solo admin) o un sito
      return rpc('elimina_documenti', { p_anno: num(b.anno) || null,
                                        p_id_service: num(b.id_service) || null },
                 Math.max(ms, 60000));

    // il dizionario dei componenti del registro (cloud/08-dizionario.sql, #ANCHOR: dizionario)
    case '/api/dizionario':
      if (metodo === 'GET') return rpc('app_dizionario', {}, ms);
      return rpc('imposta_voce_dizionario', {
        p_codice: b.codice, p_campi: Object.keys(b).filter(k => k === 'nome' || k === 'priorita'),
        p_nome: b.nome ?? null, p_descrizione: b.descrizione ?? null,
        p_priorita: b.priorita === '' || b.priorita == null ? null : Number(b.priorita),
      }, ms);

    case '/api/sync':
      // Il .accdb sta sul PC dell'ufficio e da qui non si raggiunge: e' quel PC
      // a spingere l'anagrafica, una volta al giorno.
      return { ok: false, stato: 400, dati: { errore:
        'online il database Access non e\' raggiungibile: lo legge il PC ' +
        'dell\'ufficio una volta al giorno, da solo.' } };
  }
  return { ok: false, stato: 404, dati: { errore: 'rotta sconosciuta: ' + u.pathname } };
}

/* ------------------------------------------------------ errori (COD-02) - */
/* Gli errori del programma (vedi `segnala` in ui.js) finiscono nella stessa
   tabella del Planning, `pl_client_errors`, con `where_` che comincia per
   "crono:". Solo online e solo da entrati: senza sessione la tabella non
   accetta niente. Mai lanciare: e' l'ultimo anello. */
async function inviaErrore(e, dove) {
  if (!attiva() || !ses) return;
  try {
    const t = await token();
    if (!t) return;
    await fetch(`${ORIGINE}/rest/v1/pl_client_errors`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: CHIAVE_ANON,
                 Authorization: 'Bearer ' + t, Prefer: 'return=minimal' },
      body: JSON.stringify({
        message: String(e?.message || e).slice(0, 1000),
        stack: String(e?.stack || '').slice(0, 4000),
        where_: ('crono:' + (dove || '')).slice(0, 200),
        url: String(globalThis.location?.href || '').slice(0, 500),
        user_agent: String(globalThis.navigator?.userAgent || '').slice(0, 300),
      }),
    });
  } catch { /* niente */ }
}
impostaSegnalatore(inviaErrore);

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

/* `cache-control: un anno, immutable`. Non e' spericolato: il percorso di un
   PDF e' un UUID nuovo a ogni salvataggio e non viene MAI sovrascritto
   (`x-upsert: false`), quindi quell'indirizzo o non esiste o ha per sempre lo
   stesso contenuto. Senza, lo Storage mette il suo default di un'ora e il
   tecnico che riapre lo stesso documento nel pomeriggio se lo riscarica tutto:
   una decina di mega, spesso dal telefono. E' il guadagno piu' grosso sulla
   velocita' e non costa un pixel di resa. */
const ANNO_IN_SECONDI = 31536000;

export async function caricaOggetto(bucket, percorso, blob) {
  const r = await fetch(`${ORIGINE}/storage/v1/object/${bucket}/${percorso}`, {
    method: 'POST', body: blob,
    headers: { ...await intestazioni(), 'Content-Type': blob.type || 'application/pdf',
               'cache-control': `max-age=${ANNO_IN_SECONDI}, immutable`,
               'x-upsert': 'false' },
  });
  if (!r.ok) {
    const d = await r.json().catch(() => ({}));
    const grezzo = d.message || d.error || '';
    /* Lo Storage dice "The object exceeded the maximum allowed size", che a chi
       sta salvando non dice niente di utile. Il tetto e' `file_size_limit` del
       bucket (cloud/06-documenti.sql): la via d'uscita e' dividere il documento,
       e la tendina per farlo e' gia' nel generatore. */
    if (r.status === 413 || /maximum allowed size|exceeded.*size|too large/i.test(grezzo)) {
      const mb = blob?.size ? ` (${dimensione(blob.size)})` : '';
      throw new Error(`il PDF${mb} supera il tetto per file dell'archivio: ` +
        'dividi il documento in fascicoli con la tendina del generatore e salva di nuovo.');
    }
    throw new Error(grezzo || ('caricamento rifiutato (' + r.status + ')'));
  }
}

export async function eliminaOggetto(bucket, percorso) {
  const r = await fetch(`${ORIGINE}/storage/v1/object/${bucket}/${percorso}`, {
    method: 'DELETE', headers: await intestazioni() });
  if (!r.ok && r.status !== 404) throw new Error('eliminazione rifiutata (' + r.status + ')');
}

/* Molti oggetti in un colpo: lo Storage prende una lista di percorsi
   (`prefixes`) in una DELETE sola. A lotti di 100 per non spedire richieste
   smisurate quando si pota un anno intero. Ritorna quanti ne ha cancellati
   davvero; i mancanti (gia' spariti) non sono un errore. */
export async function eliminaOggetti(bucket, percorsi) {
  let n = 0;
  for (let i = 0; i < percorsi.length; i += 100) {
    const lotto = percorsi.slice(i, i + 100);
    const r = await fetch(`${ORIGINE}/storage/v1/object/${bucket}`, {
      method: 'DELETE', body: JSON.stringify({ prefixes: lotto }),
      headers: { ...await intestazioni(), 'Content-Type': 'application/json' },
    });
    if (!r.ok) {
      const d = await r.json().catch(() => ({}));
      throw new Error(d.message || d.error || ('eliminazione rifiutata (' + r.status + ')'));
    }
    const d = await r.json().catch(() => []);
    n += Array.isArray(d) ? d.length : lotto.length;
  }
  return n;
}

/* Otto ore, non un'ora - quanto dura una giornata di lavoro. Non allarga i
   permessi: il bucket resta privato e l'indirizzo lo ottiene solo chi e'
   entrato. Serve a due cose:
   1. il tecnico che riapre il PDF dopo pranzo non si ritrova un indirizzo
      scaduto (e, se nel frattempo e' andato giu' di rete, un errore);
   2. e' la durata che rende riusabile l'indirizzo, e l'indirizzo E' la chiave
      della cache. Attenzione: questa chiamata firma un GETTONE NUOVO ogni
      volta - stesso file, indirizzo diverso, quindi cache mancata. A far
      fruttare il `cache-control` di caricaOggetto e' chi chiama, tenendosi
      l'indirizzo finche' vale: vedi `urlDocumento` in js/documenti.js. */
export async function urlFirmato(bucket, percorso, secondi = 8 * 3600) {
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
  gruppo: r.gruppo, fascicolo: r.fascicolo, fascicoli: r.fascicoli,
  tipo: r.tipo || 'schede',
});
const cellaDa = r => ({
  s: r.stampata, c: r.controllata, k: r.corretta, r: r.ricambi,
  rev: r.rev, by: r.updated_by, at: r.updated_at, nota: r.nota || '',
});

/** Da quando chiedere le celle cambiate: `ts` (l'ultimo `updated_at` visto,
 *  ISO locale "2026-09-23T10:00:05") meno un margine. Senza margine se ne
 *  perdevano due tipi, perche' `app_celle_dopo` vuole `updated_at > p_da`:
 *   - quelle scritte nello STESSO secondo dell'ultima vista, dopo la domanda;
 *   - quelle di una transazione lunga (un bulk da 40 s): `updated_at` e' l'ora
 *     d'INIZIO della transazione, e la riga diventa visibile solo al commit.
 *  Le celle ripescate due volte non fanno danno: stessa revisione, si buttano.
 *  null = da sempre (nessuna cella vista ancora). */
export function daQuando(ts, margine = 60) {
  const m = /^(\d{4})-(\d\d)-(\d\d)T(\d\d):(\d\d):(\d\d)/.exec(ts || '');
  if (!m) return null;
  const d = new Date(Date.UTC(+m[1], m[2] - 1, +m[3], +m[4], +m[5], +m[6]) - margine * 1000);
  return d.toISOString().slice(0, 19);
}

/** Le celle di `app_celle_dopo` diventano eventi per stato.js. Poche: una per
 *  una, col nome di chi le ha toccate (il lampo "l'ha fatto un altro"). Tante
 *  (un riaggancio dopo un'ora, un'azione di massa): UN evento `celle`, cioe'
 *  un ridisegno solo invece di centinaia. */
export function eventiDaCelle(celle, anno, io = '', soglia = 20) {
  const lista = (celle || []).filter(c => c && c.cella);
  if (lista.length > soglia) {
    return [{ tipo: 'celle', anno, operatore: '',
              celle: lista.map(c => ({ id_service: c.id_service, mese: c.mese, cella: c.cella })) }];
  }
  return lista.map(c => ({ tipo: 'cella', anno, id_service: c.id_service, mese: c.mese,
                           cella: c.cella,
                           operatore: c.cella.by === io ? '' : (c.cella.by || '') }));
}

/* Il canale aperto da apriStream, per parlare agli altri client senza passare
   dal database: e' il broadcast di Realtime, gratis e immediato. Lo usa la
   presenza per dire quale cella ho aperta (#ANCHOR: fuoco in stato.js). */
let wsAttivo = null, rifBroadcast = 1000;
export function trasmetti(evento, payload) {
  if (!wsAttivo || wsAttivo.readyState !== 1) return false;
  wsAttivo.send(JSON.stringify({
    topic: 'realtime:crono', event: 'broadcast', ref: String(++rifBroadcast), join_ref: '1',
    payload: { type: 'broadcast', event: evento, payload },
  }));
  return true;
}

/** Sostituisce l'hub SSE. `mio()` dice il nome di chi sta a questo schermo: le
 *  proprie modifiche si applicano lo stesso ma senza il lampo "l'ha fatto un
 *  altro". Ritorna la funzione per chiudere. */
export function apriStream(onEvento, mio = () => '') {
  let ws = null, chiuso = false, tentativi = 0, batti = null, sonda = null;
  let rif = 1, ultimoTs = '';        // il ref '1' e' dell'iscrizione (phx_join)
  const TOPIC = 'realtime:crono';

  const spedisci = (event, payload, topic = TOPIC) => {
    if (ws && ws.readyState === 1) {
      ws.send(JSON.stringify({ topic, event, payload, ref: String(++rif), join_ref: '1' }));
    }
  };

  /* Le celle cambiate dopo l'ultima vista (con un margine: vedi `daQuando`).
     Le serve la sonda e il riaggancio dopo un buco del WebSocket. Le celle gia'
     viste tornano indietro e si buttano da sole (#ANCHOR: eco-vecchia). */
  const recupera = async () => {
    let r;
    try {
      r = await rpc('app_celle_dopo', { p_anno: ultimoAnno, p_da: daQuando(ultimoTs) });
    } catch { return; }                // rete giu': ci riprova il prossimo giro
    if (!r.ok) return;
    for (const ev of eventiDaCelle(r.dati?.celle, ultimoAnno, mio())) onEvento(ev);
    for (const c of r.dati?.celle || []) if (c.cella?.at > ultimoTs) ultimoTs = c.cella.at;
  };

  /* Ripiego: se il WebSocket non regge, si chiedono ogni 15 s solo le celle
     cambiate dopo l'ultima vista. Poche righe, non tutto il bootstrap. */
  const avviaSonda = () => {
    if (sonda || chiuso) return;
    sonda = setInterval(recupera, 15000);
  };
  const fermaSonda = () => { clearInterval(sonda); sonda = null; };

  let giaAperto = false;             // il primo aggancio non ha niente da recuperare
  let daRecuperare = false;
  const riprova = () => { if (!chiuso) setTimeout(apri, Math.min(1000 * 2 ** ++tentativi, 20000)); };

  const apri = async () => {
    if (chiuso) return;
    let t;
    try { t = await token(); } catch { riprova(); return; }   // rete giu'
    // Senza sessione si riprova piu' tardi: se si rientra (401 -> maschera
    // d'accesso in api.js) la diretta riparte da sola, senza ricaricare.
    if (!t) { if (!chiuso) setTimeout(apri, 20000); return; }
    ws = new WebSocket(
      `${ORIGINE.replace(/^http/, 'ws')}/realtime/v1/websocket?apikey=${CHIAVE_ANON}&vsn=1.0.0`);

    ws.onopen = () => {
      tentativi = 0;
      wsAttivo = ws;
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
        let nuovo = null;
        try { nuovo = await token(); } catch { }   // rete giu': al prossimo battito
        // il token scade: va rinnovato anche qui, una volta sola per token nuovo
        if (nuovo && nuovo !== t) { t = nuovo; spedisci('access_token', { access_token: nuovo }); }
      }, 25000);
      // Riaggancio dopo un buco: quello che e' cambiato mentre eravamo staccati
      // Realtime non lo rimanda, e lo schermo restava indietro fino al ricarico.
      // Si chiede DOPO la conferma dell'iscrizione (phx_reply qui sotto), cosi'
      // fra la domanda e la diretta non resta scoperto niente.
      daRecuperare = giaAperto;
      giaAperto = true;
    };

    ws.onmessage = e => {
      let m;
      try { m = JSON.parse(e.data); } catch { return; }
      if (m.event === 'phx_reply' && m.topic === TOPIC && m.ref === '1' && daRecuperare) {
        daRecuperare = false;
        recupera();
        return;
      }
      if (m.event === 'broadcast') {
        const p = m.payload || {};
        if (p.event === 'fuoco' && p.payload?.nome && p.payload.nome !== mio()) {
          onEvento({ tipo: 'fuoco', nome: p.payload.nome, dove: p.payload.dove || '' });
        }
        return;
      }
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
      if (wsAttivo === ws) wsAttivo = null;
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
/** Mostra la pagina d'accesso finche' non si entra. Si risolve a sessione
 *  buona: chi chiama puo' fare finta che il login non esista. */
export function assicuraSessione() {
  return new Promise(async resolve => {
    try {
      if (await token()) return resolve(ses);
    } catch {
      // Rete giu' con una sessione da rinnovare: la sessione c'e', si lavora
      // dalla copia e dalla coda offline, e si rinnova quando torna la rete.
      // Prima qui la promessa restava appesa e l'app non partiva.
      return resolve(ses);
    }

    /* VIS-06 / PRD-11 / TXT-09: una PAGINA d'accesso, non una modale sopra
       l'app (che lasciava gia' vedere «collegato»). Stessa struttura, stesse
       parole e stesso ordine della pagina del Planning (pages/Login.tsx):
       marchio con la riga del tempo, «Email», «Password» con l'occhio,
       «Accedi», «Password dimenticata». Le classi `auth-*` sono le stesse del
       Planning; lo stile e' in css/base.css (sezione accesso). */
    const pagina = document.createElement('section');
    pagina.className = 'auth';
    pagina.setAttribute('aria-labelledby', 'acc-tit');
    pagina.innerHTML = `
      <div class="auth-box">
        <div class="auth-brand">
          <div class="auth-name" translate="no">Crono Mappature</div>
          <div class="auth-sub" translate="no">VRS</div>
          <div class="auth-rail" aria-hidden="true">
            <span class="auth-rail-now"></span><span class="auth-rail-label">oggi</span>
          </div>
        </div>
        <div class="auth-card">
          <h1 class="solo-lettori" id="acc-tit">Accedi a Crono Mappature</h1>
          <p class="auth-intro">Accedi con le credenziali aziendali. Il nome che firma
            le spunte è questo: si sa sempre chi ha fatto cosa.</p>
          <p class="auth-avviso" role="status" hidden></p>
          <p class="auth-errore" role="alert" hidden></p>
          <form class="auth-form" novalidate>
            <div class="auth-campo">
              <label for="acc-mail">Email</label>
              <input class="campo" id="acc-mail" type="email" name="email" inputmode="email"
                     autocapitalize="none" autocorrect="off" spellcheck="false"
                     enterkeyhint="next" autocomplete="username">
              <p class="auth-campo-err" id="acc-mail-err" hidden></p>
            </div>
            <div class="auth-campo">
              <label for="acc-pwd">Password</label>
              <div class="auth-pw">
                <input class="campo" id="acc-pwd" type="password" name="password"
                       enterkeyhint="go" autocomplete="current-password">
                <button type="button" class="auth-eye" aria-pressed="false" aria-controls="acc-pwd"
                        aria-label="Mostra la password" title="Mostra la password">${svgIcona('occhio', 18)}</button>
              </div>
              <p class="auth-campo-err" id="acc-pwd-err" hidden></p>
            </div>
            <button class="bottone auth-invia" type="submit">Accedi</button>
          </form>
          <div class="auth-links">
            <button type="button" class="auth-link" data-dimenticata>Password dimenticata</button>
          </div>
        </div>
      </div>`;
    /* L'app sotto non si raggiunge ne' con il Tab ne' con il lettore di
       schermo finche' non si e' entrati. */
    const sotto = [...document.body.children].filter(n => !n.inert);
    for (const n of sotto) n.inert = true;
    document.body.appendChild(pagina);

    const $ = s => pagina.querySelector(s);
    const form = $('form'), bot = $('.auth-invia'), mail = $('#acc-mail'), pwd = $('#acc-pwd');
    const occhio = $('.auth-eye'), dimenticata = $('[data-dimenticata]');
    const avv = $('.auth-avviso'), err = $('.auth-errore');
    const mostra = (n, testo) => { n.textContent = testo || ''; n.hidden = !testo; };

    /* Errore sotto il campo, come nel Planning: il campo lo annuncia e il
       fuoco ci va (AGENTS.md: modulo inviabile incompleto, errori in linea). */
    const erroreCampo = (campo, testo) => {
      const p = $('#' + campo.id + '-err');
      mostra(p, testo);
      if (testo) { campo.setAttribute('aria-invalid', 'true'); campo.setAttribute('aria-describedby', p.id); }
      else { campo.removeAttribute('aria-invalid'); campo.removeAttribute('aria-describedby'); }
    };
    const valida = (conPassword = true) => {
      const m = mail.value.trim();
      const eM = !m ? 'Scrivi la tua email aziendale.'
        : !/^\S+@\S+\.\S+$/.test(m) ? 'L’indirizzo non sembra un’email: controlla la chiocciola e il dominio.' : '';
      const eP = conPassword && !pwd.value ? 'Scrivi la password.' : '';
      erroreCampo(mail, eM);
      erroreCampo(pwd, eP);
      const primo = eM ? mail : eP ? pwd : null;
      primo?.focus();
      return !primo;
    };
    /* In attesa: la rotella accanto all'etichetta, che resta «Accedi» (AGENTS.md) */
    const attesa = si => {
      bot.disabled = si; dimenticata.disabled = si;
      if (si) bot.dataset.loading = ''; else delete bot.dataset.loading;
      bot.setAttribute('aria-busy', String(si));
    };

    if (ses?.email || emailRicordata()) mail.value = ses?.email || emailRicordata();
    if (ultimoErrore) mostra(avv, ultimoErrore);
    (mail.value ? pwd : mail).focus();

    occhio.addEventListener('click', () => {
      const chiaro = pwd.type === 'password';
      pwd.type = chiaro ? 'text' : 'password';
      const et = chiaro ? 'Nascondi la password' : 'Mostra la password';
      occhio.setAttribute('aria-pressed', String(chiaro));
      occhio.setAttribute('aria-label', et);
      occhio.title = et;
    });

    // Password dimenticata: la mail la manda Supabase; il link apre la pagina
    // «Nuova password» del Planning, perche' l'account e' lo stesso.
    dimenticata.addEventListener('click', async () => {
      mostra(err, ''); mostra(avv, '');
      if (!mail.value.trim()) {
        erroreCampo(mail, 'Scrivi qui la tua email, poi premi di nuovo «Password dimenticata».');
        erroreCampo(pwd, '');
        mail.focus();
        return;
      }
      if (!valida(false)) return;
      attesa(true);
      try {
        await auth('recover?redirect_to=' + encodeURIComponent(URL_PLANNING + '/reimposta-password'),
          { email: mail.value.trim() });
        mostra(avv, `Se l’indirizzo ${mail.value.trim()} è registrato riceverai una mail con il link per ` +
          'scegliere una nuova password (si apre nel Planning: la password è la stessa). ' +
          'Controlla anche la posta indesiderata.');
      } catch (ex) {
        mostra(err, umano(String(ex.message || ex)).testo);
      } finally {
        attesa(false);
      }
    });

    form.addEventListener('submit', async e => {
      e.preventDefault();
      mostra(err, '');
      if (!valida()) return;
      mostra(avv, '');
      attesa(true);
      try {
        await entra(mail.value.trim(), pwd.value);
        localStorage.setItem(K_MAIL, mail.value.trim());
        ultimoErrore = '';
        pagina.remove();
        for (const n of sotto) n.inert = false;
        resolve(ses);
      } catch (ex) {
        mostra(err, umano(String(ex.message || ex)).testo);
        attesa(false);
        pwd.focus();
      }
    });
  });
}
