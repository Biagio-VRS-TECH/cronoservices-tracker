// @ts-check  (COD-04, jsconfig.json nella radice)
/* api.js - rete, coda offline, flusso in diretta.  #ANCHOR: api-client

DUE TRASPORTI, UNA FIRMA SOLA. In locale (avvia.bat) si parla con server.py via
fetch e SSE; online (Netlify) le stesse rotte /api/... diventano funzioni
Postgres e il flusso e' Realtime - se ne occupa nuvola.js. Da qui in giu' -
coda, conflitti, presenza, cache - niente sa quale dei due sia attivo, e il
comportamento e' identico.

STRATEGIA CONCORRENZA (lato client; il merge per campo lo fa chi scrive:
api._applica in locale, public._applica in Postgres online)
 1. Ogni spunta e' una scrittura minima e indipendente (un solo campo).
 2. L'interfaccia si aggiorna subito (ottimistica) e mette l'operazione in coda.
 3. La coda vive in localStorage: sopravvive a chiusura browser e assenza di rete.
 4. Ogni operazione ha un op_id: il server la applica una volta sola, quindi la
    coda puo' essere rispedita senza timore di doppioni.
 5. Le modifiche degli altri arrivano dal flusso e ridisegnano solo le celle
    toccate.
 6. Conflitto vero (stesso campo, stessa cella, valori diversi) -> avviso con
    scelta esplicita; tutto il resto viene unito in silenzio.
*/
import { avviso, modale, h, segnala } from './ui.js';
import * as nuvola from './nuvola.js';

const K_CODA = 'cs.coda.v1';
const K_CACHE = 'cs.bootstrap.v2';   // v2: il payload porta `ruolo`
const K_OP = 'cs.operatore';

function leggiCoda() {
  try {
    const v = JSON.parse(localStorage.getItem(K_CODA) || '[]');
    return Array.isArray(v) ? v : [];
  } catch { return []; }
}

export const rete = {
  clientId: sessionStorage.getItem('cs.client') ||
    (sessionStorage.setItem('cs.client', crypto.randomUUID()), sessionStorage.getItem('cs.client')),
  online: navigator.onLine,
  coda: leggiCoda(),
  operatore: localStorage.getItem(K_OP) || '',
  inInvio: false,
  ultimoContatto: 0,
  ascoltatori: new Set(),
};

export const onCambio = fn => { rete.ascoltatori.add(fn); return () => rete.ascoltatori.delete(fn); };
/* Un ascoltatore che lancia (una vista che si rompe ridisegnando la cella) non
   deve fermare gli altri ne' il giro della coda: prima l'eccezione usciva da
   `svuota` a meta' e le operazioni dietro aspettavano il ritento. */
const avvisa = ev => rete.ascoltatori.forEach(f => {
  try { f(rete, ev); } catch (e) { segnala(e, 'coda'); }
});
const notifica = () => avvisa(undefined);

export function setOperatore(nome) {
  rete.operatore = nome;
  localStorage.setItem(K_OP, nome);
}

/* LA CODA E' UNA SOLA PER TUTTE LE SCHEDE (BUG-02). Prima ogni scheda la
   leggeva una volta all'avvio e riscriveva il blob intero dalla sua copia in
   memoria: con due schede aperte offline, la spunta dell'una cancellava quella
   dell'altra. Ora ogni modifica e' un "rileggi, cambia, riscrivi" sincrono (fra
   i tre passi nessun'altra scheda puo' mettersi in mezzo), si toglie per
   op_id e non con shift(), e le altre schede si riallineano sull'evento
   `storage`. `rete.coda` resta lo STESSO array (lo guardano stato.js e
   app.js): si riempie sul posto. Se il disco non accetta la scrittura (spazio
   finito) si continua dalla copia in memoria. */
let discoOk = true;
const rimpiazza = lista => { rete.coda.splice(0, rete.coda.length, ...lista); };
function cambiaCoda(fn) {
  const lista = fn(discoOk ? leggiCoda() : rete.coda.slice());
  try { localStorage.setItem(K_CODA, JSON.stringify(lista)); discoOk = true; } catch { discoOk = false; }
  rimpiazza(lista);
  notifica();
}
const togli = opId => cambiaCoda(c => c.filter(x => x.op_id !== opId));

/* Un'altra scheda ha cambiato la coda. Se ha spedito (e tolto) una MIA
   operazione, il suo esito l'ha avuto lei: qui la si da' per confermata, cosi'
   la cella non resta "in sospeso" per sempre; la cella vera arriva dal flusso. */
addEventListener('storage', e => {
  if (e.key !== K_CODA && e.key !== null) return;
  if (!discoOk) return;
  const ora = leggiCoda(), ci = new Set(ora.map(x => x.op_id));
  const partite = rete.coda.filter(x => x.client === rete.clientId && !ci.has(x.op_id));
  rimpiazza(ora);
  notifica();
  for (const op of partite) avvisa({ confermata: { op, risposta: {} } });
});

/* ------------------------------------------------- PIN dell'admin --- */
/* SEC-12, solo in locale: se il server ha un `pin_admin` in config.json, le
   azioni da amministratore rispondono 403 con `pin_richiesto`. Si chiede il
   PIN una volta, lo si tiene per la sessione del browser (sessionStorage: si
   scorda chiudendo la scheda) e si riprova. Online non serve: il ruolo lo da'
   il login, non un nome scritto dal client. */
const K_PIN = 'cs.pin';
let pinMem = '';   // se sessionStorage non c'e' (finestra privata bloccata)
const pinDato = () => {
  let p = pinMem;
  try { p = sessionStorage.getItem(K_PIN) || pinMem; } catch { }
  return p ? { pin: p } : {};
};
const tieniPin = p => {
  pinMem = p || '';
  try { if (p) sessionStorage.setItem(K_PIN, p); else sessionStorage.removeItem(K_PIN); } catch { }
};
let pinInCorso = null;
function chiediPin(sbagliato) {
  pinInCorso ||= new Promise(fatto => {
    let dato = null;
    const inp = h('input.campo', {
      id: 'pin-admin', type: 'password', inputmode: 'numeric', autocomplete: 'off',
      name: 'pin-admin', spellcheck: 'false', placeholder: 'PIN…',
    });
    modale(chiudi => {
      const ok = h('button.bottone', { testo: 'Continua', onclick: () => {
        dato = inp.value.trim(); chiudi(); } });
      inp.onkeydown = e => { if (e.key === 'Enter') ok.click(); };
      return [
        h('h2', { testo: 'PIN dell’amministratore' }),
        h('p.sotto', { testo: (sbagliato ? 'Il PIN non era giusto. ' : '') +
          'Questa azione è dell’amministratore: sul server dell’ufficio serve anche il PIN.' }),
        h('label', { for: 'pin-admin', testo: 'PIN', style: 'display:block;margin-bottom:6px' }),
        inp,
        h('div', { style: 'display:flex;gap:8px;justify-content:flex-end;margin-top:16px' },
          h('button.bottone.piatto', { testo: 'Lascia stare', onclick: () => chiudi() }), ok),
      ];
    });
    // la modale si chiude da sola (Esc, clic fuori, un bottone): la risposta arriva li'
    const guarda = new MutationObserver(() => {
      if (inp.isConnected) return;
      guarda.disconnect(); pinInCorso = null; fatto(dato);
    });
    guarda.observe(document.body, { childList: true });
  });
  return pinInCorso;
}

/* --------------------------------------------------------------- fetch --- */
/* Due trasporti, una firma sola. In locale si parla con server.py; online le
   stesse rotte /api/... diventano funzioni Postgres (vedi nuvola.js). Da qui in
   poi - coda, conflitti, presenza - nessun altro file sa quale dei due sia. */
/** Le opzioni di `chiama`, uguali per i due trasporti.
 *  @typedef {{metodo?: string, body?: Record<string, any>, ms?: number}} OpzChiama */
/** @param {string} path  @param {OpzChiama} opz */
async function locale(path, { metodo, body, ms }) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    const r = await fetch(path, {
      method: metodo,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify({ ...body, client_id: rete.clientId, ...pinDato() }) : undefined,
      signal: ctrl.signal,
    });
    const testo = await r.text();
    /* Un errore che non e' JSON (la pagina HTML di un proxy, un 404 del server
       statico) resta un errore col suo stato: prima il JSON.parse lanciava, la
       coda lo prendeva per "rete assente" e riprovava per sempre la stessa
       operazione, con tutte le altre ferme dietro. Una risposta BUONA che non
       e' JSON invece lancia ancora: non e' la risposta che si aspettava. */
    let dati = {};
    if (testo) {
      try { dati = JSON.parse(testo); } catch (e) {
        if (r.ok) throw e;
        dati = { errore: 'errore ' + r.status };
      }
    }
    return { ok: r.ok, stato: r.status, dati };
  } finally {
    clearTimeout(t);
  }
}

/** @param {string} path  @param {OpzChiama} [opz]
 *  @returns {Promise<{ok: boolean, stato: number, dati: any}>} */
export async function chiama(path, { metodo = 'GET', body = undefined, ms = 12000 } = {}) {
  try {
    let r = nuvola.attiva()
      ? await nuvola.chiama(path, { metodo, body, ms })
      : await locale(path, { metodo, body, ms });
    // Sessione scaduta mentre si lavorava: si rientra e si riprova una volta,
    // altrimenti la coda si svuoterebbe buttando via le spunte.
    if (r.stato === 401 && nuvola.attiva()) {
      await nuvola.assicuraSessione();
      r = await nuvola.chiama(path, { metodo, body, ms });
    }
    // SEC-12: in locale l'azione da admin vuole il PIN; due tentativi al massimo
    for (let giro = 0; giro < 2 && !nuvola.attiva() && r.stato === 403 && r.dati?.pin_richiesto; giro++) {
      const sbagliato = !!pinDato().pin;
      tieniPin('');
      const pin = await chiediPin(sbagliato);
      if (!pin) break;
      tieniPin(pin);
      r = await locale(path, { metodo, body, ms });
    }
    rete.ultimoContatto = Date.now();
    if (!rete.online) { rete.online = true; notifica(); }
    return r;
  } catch (e) {
    rete.online = false; notifica();
    throw e;
  }
}

/** Login (solo online) e nome di firma. In locale non fa niente. */
export async function avviaSessione() {
  if (!nuvola.attiva()) return null;
  await nuvola.assicuraSessione();
  // Online la firma NON e' un nome scritto a mano: e' la casella con cui si e'
  // entrati, e non si cambia (#ANCHOR: ruoli). Il campo dove la si poteva
  // riscrivere e' stato tolto alla 25a sessione: cambiando nome si finiva sulla
  // riga di un collega e ci si portava dietro - o via - il ruolo.
  // Se il server all'ultimo accesso aveva disambiguato il nome ("Mario Rossi
  // (mario.rossi)"), quello memorizzato comincia col nome della casella e va
  // tenuto: sovrascriverlo con il nome nudo, a un avvio offline, vorrebbe dire
  // firmare col nome del collega omonimo.
  const base = nuvola.nomeDaEmail();
  if (!(rete.operatore === base || rete.operatore.startsWith(base + ' ('))) setOperatore(base);
  // Registra il passaggio in `operatori`: e' quella riga a portare il ruolo, ed
  // e' li' che un amministratore ti trova per nominarti. Prima veniva scritta
  // solo se si apriva la finestra del nome, quindi chi non ci aveva mai
  // cliccato non compariva nell'elenco. Se il nome ricavato e' gia' di un
  // collega, il server ne restituisce uno disambiguato: si tiene quello.
  try {
    const { ok, dati } = await chiama('/api/operatore',
      { metodo: 'POST', body: { nome: rete.operatore } });
    if (ok && dati && dati.nome) setOperatore(dati.nome);
  } catch { /* offline: si firma col nome della casella, la riga arriva dopo */ }
  return nuvola.emailSessione();
}

export const inNuvola = nuvola.attiva;
export const esci = nuvola.esci;
export const emailSessione = nuvola.emailSessione;

/** Il CSV: in locale e' un download del server, online lo componiamo qui. */
export async function esportaCsv(query) {
  if (!nuvola.attiva()) { location.href = '/api/export.csv?' + query; return; }
  const { ok, dati } = await chiama('/api/export.csv?' + query, { ms: 60000 });
  if (!ok) {
    avviso('Esportazione non riuscita: ' + (dati.errore || ''), { tono: 'allerta' });
    return;
  }
  // Il BOM davanti: senza, Excel apre il CSV in ANSI e sbaglia gli accenti.
  const url = URL.createObjectURL(
    new Blob(['﻿' + dati.__csv__], { type: 'text/csv;charset=utf-8' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: dati.__nome__ });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

/* ---------------------------------------------------------- bootstrap ---- */
export async function bootstrap(anno) {
  try {
    // `operatore` serve solo al server locale per dire di che ruolo sei;
    // online il ruolo lo decide la casella del login, non questo parametro.
    const q = new URLSearchParams();
    if (anno) q.set('anno', anno);
    if (rete.operatore) q.set('operatore', rete.operatore);
    const r = await chiama('/api/bootstrap' + (q.toString() ? '?' + q : ''));
    if (!r.ok) throw new Error(r.dati?.errore || ('errore ' + r.stato));
    /* La copia per l'offline e' un di piu': se il disco e' pieno (quota del
       browser) i dati appena arrivati valgono lo stesso. Prima l'eccezione
       finiva nel catch qui sotto, che li buttava per la copia VECCHIA - o, se
       copia non c'era, faceva fallire l'avvio. */
    try { localStorage.setItem(K_CACHE, JSON.stringify({ salvato: Date.now(), dati: r.dati })); } catch { }
    return { dati: r.dati, daCache: false };
  } catch (e) {
    let c = null;
    try { c = JSON.parse(localStorage.getItem(K_CACHE) || 'null'); } catch { }   // copia rovinata: vale l'errore vero
    if (!c?.dati) throw e;
    return { dati: c.dati, daCache: true, salvato: c.salvato };
  }
}

/* --------------------------------------------------------------- coda ---- */
/** Accoda una scrittura. Ritorna l'op_id per marcare la cella "in sospeso". */
export function accoda(op) {
  const v = { op_id: crypto.randomUUID(), creato: Date.now(), client: rete.clientId, ...op };
  cambiaCoda(c => [...c, v]);
  svuota();
  return v.op_id;
}

/* Ogni scheda spedisce le SUE operazioni; quelle di un'altra solo se ferme da
   piu' di 30 s (la scheda che le ha fatte e' stata chiusa, o e' senza rete):
   cosi' l'esito arriva a chi aspetta, e nessuna resta orfana. */
const ORFANA_MS = 30000;
const tocca = op => !op.client || op.client === rete.clientId || Date.now() - (op.creato || 0) > ORFANA_MS;

/* UN GUASTO DI PASSAGGIO NON E' UN RIFIUTO. Un 5xx (il database che ha
   risposto "locked", il gateway di Supabase in timeout, un proxy che riavvia),
   un 408 o un 429 non dicono che l'operazione e' sbagliata: dicono "non adesso".
   Prima la coda li trattava come un errore applicativo e buttava la spunta -
   persa, e a schermo restava messa. Ora l'operazione resta in coda e si
   riprova al giro dopo; solo dopo MAX_TENTATIVI si rinuncia, perche' una
   richiesta che rompe il server a ogni invio non fermi per sempre quelle
   dietro di lei. */
export const MAX_TENTATIVI = 5;
const transitorio = stato => stato >= 500 || stato === 408 || stato === 429;

let timerRitento = null;
export async function svuota() {
  if (rete.inInvio) return;
  if (discoOk) rimpiazza(leggiCoda());
  if (!rete.coda.some(tocca)) {
    clearTimeout(timerRitento);
    if (rete.coda.length) timerRitento = setTimeout(svuota, 8000);
    return;
  }
  rete.inInvio = true; notifica();
  /* Due schede che spediscono insieme: una alla volta (navigator.locks, dove
     c'e'). Il server applica ogni op_id una volta sola, quindi il lucchetto
     evita solo esiti doppi, non danni. */
  const giro = async () => {
    for (;;) {
      if (discoOk) rimpiazza(leggiCoda());
      const op = rete.coda.find(tocca);
      if (!op) break;
      let r;
      try {
        r = await chiama(op.rotta, { metodo: 'POST', body: { ...op.corpo, op_id: op.op_id, operatore: op.operatore || rete.operatore } });
      } catch {
        break;                       // rete assente: si riprova piu' tardi
      }
      if (r.stato === 409) {
        togli(op.op_id);
        avvisa({ conflitto: { op, server: r.dati } });
        continue;
      }
      if (!r.ok && transitorio(r.stato) && (op.tentativi || 0) + 1 < MAX_TENTATIVI) {
        cambiaCoda(c => c.map(x => x.op_id === op.op_id ? { ...x, tentativi: (x.tentativi || 0) + 1 } : x));
        break;                       // si riprova piu' tardi, come senza rete
      }
      if (!r.ok) {                   // errore applicativo: non ha senso insistere
        togli(op.op_id);
        avvisa({ fallita: { op, server: r.dati } });
        avviso('Operazione rifiutata dal server: ' + (r.dati?.errore || r.stato), { tono: 'allerta' });
        continue;
      }
      togli(op.op_id);
      avvisa({ confermata: { op, risposta: r.dati } });
    }
  };
  try {
    if (globalThis.navigator?.locks?.request) await navigator.locks.request('cs.coda', giro);
    else await giro();
  } finally {
    rete.inInvio = false; notifica();
    clearTimeout(timerRitento);
    if (rete.coda.length) timerRitento = setTimeout(svuota, 8000);
  }
}

addEventListener('online', () => { rete.online = true; notifica(); svuota(); });
addEventListener('offline', () => { rete.online = false; notifica(); });
addEventListener('beforeunload', e => {
  if (rete.coda.length) { e.preventDefault(); e.returnValue = ''; }
});

/* ---------------------------------------------------------------- SSE ---- */
export function apriStream(onEvento) {
  if (nuvola.attiva()) return nuvola.apriStream(onEvento, () => rete.operatore);
  /* `caduto`: il flusso si e' interrotto. L'hub non ripete quello che e'
     passato mentre eravamo fuori (server riavviato, Wi-Fi caduto): al ritorno
     lo si dice a chi ascolta con un evento `riconnesso`, e lo stato rilegge
     l'anno invece di restare indietro in silenzio fino al ricarico.
     `chiuso`: chi ha aperto il flusso lo ha chiuso, e un tentativo gia' in
     programma non deve riaprirlo. */
  let es, tentativi = 0, caduto = false, chiuso = false, timer = null;
  const apri = () => {
    if (chiuso) return;
    es = new EventSource('/api/stream?client_id=' + rete.clientId);
    es.onopen = () => {
      tentativi = 0;
      if (!rete.online) { rete.online = true; notifica(); }
      svuota();
      if (caduto) { caduto = false; try { onEvento({ tipo: 'riconnesso' }); } catch { } }
    };
    es.onerror = () => {
      es.close();
      caduto = true;
      rete.online = false; notifica();
      clearTimeout(timer);
      timer = setTimeout(apri, Math.min(1000 * 2 ** tentativi++, 20000));
    };
    /* Tutti i tipi che api.py emette (`"tipo": ...`): il server li manda come
       `event: <tipo>`, e EventSource consegna solo quelli a cui ci si iscrive.
       Fino alla 27a sessione mancavano ruoli, impostazioni e i due dei PDF:
       un collega che salvava un PDF o veniva nominato, in locale, non si
       vedeva finche' non si ricaricava. */
    for (const t of ['cella', 'celle', 'sync', 'presenze', 'ruoli', 'impostazioni',
                     'documento', 'documenti']) {
      es.addEventListener(t, e => { try { onEvento(JSON.parse(e.data)); } catch { } });
    }
  };
  apri();
  return () => { chiuso = true; clearTimeout(timer); es?.close(); };
}

/* -------------------------------------------------------------- presenza - */
/* La cella che ho aperta adesso ("id-mese", vuota = nessuna). Cambiarla fa
   partire un battito subito, con un piccolo respiro per non mitragliare il
   server girando col popover a colpi di freccia: al prossimo battito regolare
   il collega la vedrebbe venti secondi dopo, cioe' troppo tardi. */
let fuocoMio = '', batteFn = null, fuocoTimer = null;
export function segnalaFuoco(cellaAperta) {
  cellaAperta = cellaAperta || '';
  if (cellaAperta === fuocoMio) return;
  fuocoMio = cellaAperta;
  clearTimeout(fuocoTimer);
  fuocoTimer = setTimeout(() => batteFn?.(), 250);
}
export const fuocoMioAttuale = () => fuocoMio;

export function avviaPresenza(dove, onRisposta) {
  // Il battito serve a due cose: dire agli altri che ci sei, e accorgersi che il
  // server e' caduto anche quando non stai scrivendo niente.
  const batti = async () => {
    const dv = dove();
    /* online il ping finisce in una tabella e gli altri lo leggono al LORO
       battito, fino a 20 s dopo: la cella aperta si annuncia anche in diretta
       sul canale Realtime (#ANCHOR: fuoco in stato.js) */
    if (nuvola.attiva()) nuvola.trasmetti('fuoco', { nome: rete.operatore || '', dove: dv });
    try {
      const { dati } = await chiama('/api/ping', {
        metodo: 'POST', body: { operatore: rete.operatore || '', dove: dv }, ms: 6000 });
      rete.ultimoContatto = Date.now();
      onRisposta?.(dati);
    } catch { }
  };
  batteFn = batti;
  batti();
  return setInterval(batti, 20000);
}
