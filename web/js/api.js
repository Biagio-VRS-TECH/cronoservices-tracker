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
import { avviso } from './ui.js';
import * as nuvola from './nuvola.js';

const K_CODA = 'cs.coda.v1';
const K_CACHE = 'cs.bootstrap.v1';
const K_OP = 'cs.operatore';

export const rete = {
  clientId: sessionStorage.getItem('cs.client') ||
    (sessionStorage.setItem('cs.client', crypto.randomUUID()), sessionStorage.getItem('cs.client')),
  online: navigator.onLine,
  coda: JSON.parse(localStorage.getItem(K_CODA) || '[]'),
  operatore: localStorage.getItem(K_OP) || '',
  inInvio: false,
  ultimoContatto: 0,
  ascoltatori: new Set(),
};

export const onCambio = fn => { rete.ascoltatori.add(fn); return () => rete.ascoltatori.delete(fn); };
const notifica = () => rete.ascoltatori.forEach(f => f(rete));

export function setOperatore(nome) {
  rete.operatore = nome;
  localStorage.setItem(K_OP, nome);
}

function salvaCoda() {
  localStorage.setItem(K_CODA, JSON.stringify(rete.coda));
  notifica();
}

/* --------------------------------------------------------------- fetch --- */
/* Due trasporti, una firma sola. In locale si parla con server.py; online le
   stesse rotte /api/... diventano funzioni Postgres (vedi nuvola.js). Da qui in
   poi - coda, conflitti, presenza - nessun altro file sa quale dei due sia. */
async function locale(path, { metodo, body, ms }) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    const r = await fetch(path, {
      method: metodo,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify({ ...body, client_id: rete.clientId }) : undefined,
      signal: ctrl.signal,
    });
    const testo = await r.text();
    const dati = testo ? JSON.parse(testo) : {};
    return { ok: r.ok, stato: r.status, dati };
  } finally {
    clearTimeout(t);
  }
}

export async function chiama(path, { metodo = 'GET', body, ms = 12000 } = {}) {
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
  // Online la firma non e' piu' un nome scritto a mano: e' la casella con cui si
  // e' entrati. Si puo' cambiare come si scrive, non chi si e'.
  if (!rete.operatore || rete.operatore !== nuvola.nomeDaEmail()) {
    setOperatore(nuvola.nomeDaEmail());
  }
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
    const r = await chiama('/api/bootstrap' + (anno ? '?anno=' + anno : ''));
    if (!r.ok) throw new Error(r.dati?.errore || ('errore ' + r.stato));
    localStorage.setItem(K_CACHE, JSON.stringify({ salvato: Date.now(), dati: r.dati }));
    return { dati: r.dati, daCache: false };
  } catch (e) {
    const c = JSON.parse(localStorage.getItem(K_CACHE) || 'null');
    if (!c) throw e;
    return { dati: c.dati, daCache: true, salvato: c.salvato };
  }
}

/* --------------------------------------------------------------- coda ---- */
/** Accoda una scrittura. Ritorna l'op_id per marcare la cella "in sospeso". */
export function accoda(op) {
  const v = { op_id: crypto.randomUUID(), creato: Date.now(), ...op };
  rete.coda.push(v);
  salvaCoda();
  svuota();
  return v.op_id;
}

let timerRitento = null;
export async function svuota() {
  if (rete.inInvio || !rete.coda.length) return;
  rete.inInvio = true; notifica();
  try {
    while (rete.coda.length) {
      const op = rete.coda[0];
      let r;
      try {
        r = await chiama(op.rotta, { metodo: 'POST', body: { ...op.corpo, op_id: op.op_id, operatore: op.operatore || rete.operatore } });
      } catch {
        break;                       // rete assente: si riprova piu' tardi
      }
      if (r.stato === 409) {
        rete.coda.shift(); salvaCoda();
        rete.ascoltatori.forEach(f => f(rete, { conflitto: { op, server: r.dati } }));
        continue;
      }
      if (!r.ok) {                   // errore applicativo: non ha senso insistere
        rete.coda.shift(); salvaCoda();
        rete.ascoltatori.forEach(f => f(rete, { fallita: { op } }));
        avviso('Operazione rifiutata dal server: ' + (r.dati.errore || r.stato), { tono: 'allerta' });
        continue;
      }
      rete.coda.shift(); salvaCoda();
      rete.ascoltatori.forEach(f => f(rete, { confermata: { op, risposta: r.dati } }));
    }
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
  let es, tentativi = 0;
  const apri = () => {
    es = new EventSource('/api/stream?client_id=' + rete.clientId);
    es.onopen = () => { tentativi = 0; if (!rete.online) { rete.online = true; notifica(); } svuota(); };
    es.onerror = () => {
      es.close();
      rete.online = false; notifica();
      setTimeout(apri, Math.min(1000 * 2 ** tentativi++, 20000));
    };
    for (const t of ['cella', 'celle', 'sync', 'presenze']) {
      es.addEventListener(t, e => { try { onEvento(JSON.parse(e.data)); } catch { } });
    }
  };
  apri();
  return () => es?.close();
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
