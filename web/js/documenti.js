/* documenti.js - i PDF delle schede tecnici, lato tracker.  #ANCHOR: documenti

Il generatore (web/schede/) quando stampa produce anche un PDF e lo consegna
qui: una riga in `documenti` legata al SITO e all'anno, il file nello Storage
(online) o in data/documenti/ (locale), e la spunta "stampata" messa sul mese
della mappatura. Questo modulo e' tutto quello che il tracker sa dei documenti:
il modello in memoria (`st.documenti`), l'icona da mettere accanto al nome del
sito, l'apertura del file e la sua eliminazione.

Lo usa ANCHE il generatore (schede/ponte.js), che vive nella stessa origine e
importa questi stessi moduli: due pagine, un solo trasporto. */
import { chiama, rete } from './api.js';
import * as nuvola from './nuvola.js';
import { st, emetti, mappaDocumenti, mappaturaSito } from './stato.js';
import { h, esc, quando, avviso } from './ui.js';

/* ------------------------------------------------------------- modello --- */
/** Ricostruisce `st.documenti` (id_service -> [documenti], dal piu' recente). */
export function applicaDocumenti(lista) {
  st.documenti = mappaDocumenti(lista);
  emetti('documenti');
}

/* Lo storico dei PDF non ha anno: guardando il 2027 si vedono anche le schede
   stampate nel 2026 (il chip lo dice). Il modello tiene tutto, senza filtro. */
function aggiungi(d, notifica = true) {
  if (!d) return;
  const l = st.documenti.get(d.id_service) || [];
  if (!l.some(x => x.id === d.id)) {
    l.push(d);
    l.sort((a, b) => (b.creato_il || '').localeCompare(a.creato_il || ''));
  }
  st.documenti.set(d.id_service, l);
  if (notifica) emetti('documenti', { id: d.id_service });
}

function togli(id, id_service) {
  const l = (st.documenti.get(id_service) || []).filter(x => x.id !== id);
  if (l.length) st.documenti.set(id_service, l); else st.documenti.delete(id_service);
  emetti('documenti', { id: id_service });
}

export const documentiDi = id => st.documenti.get(id) || [];

/* FASCICOLI. Un documento diviso in fascicoli e' arrivato come N PDF con lo
   stesso `gruppo`: il tracker li mostra come UN documento con N parti. Qui i
   documenti di un sito raggruppati, dal piu' recente: [{capo, docs, pagine,
   bytes, fascicoli}] - `capo` e' il fascicolo 1 (o l'unico PDF). */
export function gruppiDocumenti(id) {
  const per = new Map();
  for (const d of documentiDi(id)) {
    const k = d.gruppo || d.id;
    if (!per.has(k)) per.set(k, []);
    per.get(k).push(d);
  }
  return [...per.values()].map(docs => {
    docs.sort((a, b) => (a.fascicolo || 1) - (b.fascicolo || 1));
    return {
      capo: docs[0], docs,
      pagine: docs.reduce((n, d) => n + (d.pagine || 0), 0),
      bytes: docs.reduce((n, d) => n + (d.bytes || 0), 0),
      fascicoli: docs[0].fascicoli && docs.length > 1 ? docs.length : 1,
      creato_il: docs.reduce((t, d) => (d.creato_il > t ? d.creato_il : t), ''),
    };
  });
}

/** Il titolo di un documento in fascicoli: il nome del PDF senza " - fascicolo k di N". */
export const titoloDocumento = d => String(d.nome || '')
  .replace(/\.pdf$/i, '').replace(/\s*[-\u00b7]\s*fascicolo \d+ di \d+\s*$/i, '');

/** Evento dal flusso (SSE / Realtime / altra scheda del browser). */
export function eventoDocumento(ev) {
  if (ev.documento) aggiungi(ev.documento);
  else if (ev.eliminato) togli(ev.eliminato, ev.id_service);
  // un documento in fascicoli arriva in N pezzi: si avvisa una volta sola
  if (ev.operatore && ev.documento && (!ev.documento.fascicolo || ev.documento.fascicolo === 1)) {
    const s = st.perServ.get(ev.id_service);
    const n = ev.documento.fascicoli > 1 ? ` (${ev.documento.fascicoli} fascicoli)` : '';
    avviso(`${ev.operatore} ha stampato le schede di ${s?.dest || '#' + ev.id_service}${n}.`);
  }
}

/** Rilegge l'elenco completo dal server (al ritorno di visibilita'). Senza
 *  `anno`: tutti gli anni, e' lo storico. */
export async function ricaricaDocumenti() {
  try {
    const { ok, dati } = await chiama('/api/documenti');
    if (ok && dati?.documenti) applicaDocumenti(dati.documenti);
  } catch { }
}

/* Il generatore gira in un'altra scheda del browser: quando salva, lo dice
   anche da qui, cosi' il tracker si aggiorna subito anche se il flusso in
   diretta e' caduto o sta in ripiego a interrogazione. */
const CANALE = 'crono-documenti';
export function ascoltaAltreSchede() {
  if (!('BroadcastChannel' in self)) return;
  const bc = new BroadcastChannel(CANALE);
  bc.onmessage = e => { if (e.data?.tipo === 'documento') eventoDocumento(e.data); };
}
export function annunciaAltreSchede(ev) {
  try { new BroadcastChannel(CANALE).postMessage(ev); } catch { }
}

/** L'indirizzo del generatore. Con un sito, ci arriva gia' puntato su quello:
 *  alla stampa il PDF torna qui e la spunta va sul mese della sua mappatura
 *  (quello in cui e' stata chiusa, altrimenti la scadenza). */
export function urlGeneratore(s) {
  const p = new URLSearchParams({ anno: st.anno });
  if (s) {
    const ma = mappaturaSito(s), cli = st.clienti.get(s.cli);
    p.set('service', s.id);
    p.set('mese', ma.mese || ma.scad || '');
    p.set('sito', s.dest || '');
    p.set('cliente', cli?.rs || '');
    if (s.loc) p.set('localita', s.loc);
  }
  return '/schede/?' + p;
}

/* ------------------------------------------------------------- icona ----- */
export const ICO_PDF = '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" ' +
  'stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
  '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/>' +
  '<path d="M14 3v5h5"/><path d="M9 13h6M9 17h4"/></svg>';

/** Il chip da mettere accanto al nome del sito: c'e' solo se il sito ha almeno
 *  un PDF quest'anno. Un clic apre l'ultimo; il passaggio del mouse mostra la
 *  miniatura della prima pagina. Stringa HTML, come le righe della griglia. */
export function htmlChipDocumento(id) {
  const l = documentiDi(id);
  if (!l.length) return `<span class="doc-chip vuoto" data-doc-srv="${id}" hidden></span>`;
  const g = gruppiDocumenti(id);           // i fascicoli di un documento contano uno
  const d = g[0].capo;
  const pag = g[0].pagine ? `${g[0].pagine} pag.` : '';
  const altroAnno = d.anno !== st.anno;      // l'ultimo PDF e' di un altro anno: chip tenue
  const anni = [...new Set(l.map(x => x.anno))].sort();
  const titolo = `Schede tecnici · ${esc(titoloDocumento(d))}` +
    (g[0].fascicoli > 1 ? ` · ${g[0].fascicoli} fascicoli` : '') + (pag ? ' · ' + pag : '') +
    (altroAnno ? ` · del ${d.anno}` : '') +
    ` · ${esc(d.creato_da)} ${quando(d.creato_il)}` +
    (g.length > 1 ? ` · ${g.length} documenti${anni.length > 1 ? ' (' + anni.join(', ') + ')' : ''}` : '');
  return `<button type="button" class="doc-chip${altroAnno ? ' altro-anno' : ''}" data-doc-srv="${id}" data-doc="${d.id}"
      title="${titolo}" aria-label="Apri il PDF delle schede tecnici">
      ${ICO_PDF}${g.length > 1 ? `<i>${g.length}</i>` : ''}
    </button>`;
}

/** Sostituisce in posto il chip di un sito (quando arriva un documento). */
export function rinfrescaChip(radice, id) {
  for (const n of (radice || document).querySelectorAll(`[data-doc-srv="${id}"]`)) {
    const tmp = document.createElement('div');
    tmp.innerHTML = htmlChipDocumento(id);
    n.replaceWith(tmp.firstElementChild);
  }
}

/* La miniatura al passaggio del mouse: una sola per tutta la pagina, si sposta
   sul chip che la chiede. Piccola (la prima pagina in ~110 px), ma e' la
   pagina vera: si riconosce il documento senza aprirlo. */
let ant = null, antTimer = null;
function mostraAnteprima(chip) {
  const d = trovaDoc(chip.dataset.doc);
  if (!d?.anteprima) return;
  ant ||= document.body.appendChild(h('div.doc-anteprima', { role: 'tooltip' }));
  ant.innerHTML = `<img src="${d.anteprima}" alt=""><span>${esc(d.nome)} · ` +
    `${d.pagine || '?'} pag.</span>`;
  const r = chip.getBoundingClientRect();
  ant.style.left = Math.min(innerWidth - 150, r.left) + 'px';
  ant.style.top = (r.bottom + 6) + 'px';
  ant.classList.add('vista');
}
function nascondiAnteprima() { clearTimeout(antTimer); ant?.classList.remove('vista'); }

function trovaDoc(idDoc) {
  for (const l of st.documenti.values()) {
    const d = l.find(x => x.id === idDoc);
    if (d) return d;
  }
  return null;
}

/** Deleghe globali: un ascoltatore per tutta la pagina, chip compresi quelli
 *  disegnati dopo. */
export function collegaChip() {
  document.addEventListener('click', e => {
    const c = e.target?.closest?.('.doc-chip[data-doc]');
    if (!c) return;
    e.preventDefault(); e.stopPropagation();
    nascondiAnteprima();
    const d = trovaDoc(c.dataset.doc);
    if (d) apriDocumento(d);
  }, true);
  document.addEventListener('mouseover', e => {
    const c = e.target?.closest?.('.doc-chip[data-doc]');
    if (!c) return;
    clearTimeout(antTimer);
    antTimer = setTimeout(() => mostraAnteprima(c), 260);
  });
  document.addEventListener('mouseout', e => {
    if (e.target?.closest?.('.doc-chip[data-doc]')) nascondiAnteprima();
  });
  addEventListener('scroll', nascondiAnteprima, true);
}

/* ------------------------------------------------------------- file ------ */
/** Apre il PDF in una scheda nuova. Online l'indirizzo e' firmato e dura
 *  un'ora; in locale lo serve server.py. */
export async function apriDocumento(d) {
  // La finestra si apre SUBITO (nel gesto del clic), altrimenti il browser la
  // blocca come popup; l'indirizzo arriva un attimo dopo.
  const w = nuvola.attiva() ? open('', '_blank') : null;
  try {
    const url = await urlDocumento(d);
    if (w) w.location = url; else open(url, '_blank');
  } catch (e) {
    w?.close();
    avviso('Non riesco ad aprire il PDF: ' + (e.message || e), { tono: 'allerta' });
  }
}

export async function urlDocumento(d) {
  if (!nuvola.attiva()) return '/api/documento?id=' + encodeURIComponent(d.id);
  return nuvola.urlFirmato('documenti', percorsoDi(d));
}

/* Il percorso nel bucket lo sa il server (colonna `percorso`), ma per non
   farlo viaggiare in ogni bootstrap si ricostruisce: e' deterministico. */
const percorsoDi = d => d.percorso || `${d.anno}/${d.id_service}/${d.id}.pdf`;

/** Carica un PDF prodotto dal generatore e lo registra. `pdf` e' un Blob.
 *  Ritorna la risposta del server: {documento, mese, cella}. */
export async function salvaDocumento({ id_service, anno, mese, nome, pdf, pagine, anteprima,
                                        gruppo = null, fascicolo = null, fascicoli = null }) {
  const bytes = pdf.size;
  const parti = { gruppo, fascicolo, fascicoli };     // un documento in fascicoli: N PDF, un gruppo
  if (!nuvola.attiva()) {
    const b64 = await blobBase64(pdf);
    const r = await chiama('/api/documento', {
      metodo: 'POST', ms: 180000,
      body: { id_service, anno, mese, nome, pagine, anteprima, pdf: b64, ...parti,
              operatore: rete.operatore },
    });
    if (!r.ok) throw new Error(r.dati?.errore || ('errore ' + r.stato));
    annunciaAltreSchede({ tipo: 'documento', anno, id_service, documento: r.dati.documento });
    return r.dati;
  }
  const id = crypto.randomUUID().replace(/-/g, '');
  const percorso = `${anno}/${id_service}/${id}.pdf`;
  await nuvola.caricaOggetto('documenti', percorso, pdf);
  const r = await nuvola.chiama('/api/documento', {
    metodo: 'POST', ms: 60000,
    body: { id_service, anno, mese, nome, pagine, anteprima, percorso, bytes, ...parti },
  });
  if (!r.ok) throw new Error(r.dati?.errore || ('errore ' + r.stato));
  annunciaAltreSchede({ tipo: 'documento', anno, id_service, documento: r.dati.documento });
  return r.dati;
}

export async function eliminaDocumento(d) {
  if (nuvola.attiva()) await nuvola.eliminaOggetto('documenti', percorsoDi(d));
  const r = await chiama('/api/documento_elimina', {
    metodo: 'POST', body: { id: d.id, operatore: rete.operatore } });
  if (!r.ok) throw new Error(r.dati?.errore || ('errore ' + r.stato));
  togli(d.id, d.id_service);
  annunciaAltreSchede({ tipo: 'documento', anno: d.anno, id_service: d.id_service, eliminato: d.id });
}

const blobBase64 = b => new Promise((ok, ko) => {
  const fr = new FileReader();
  fr.onload = () => ok(String(fr.result).split(',')[1]);
  fr.onerror = ko;
  fr.readAsDataURL(b);
});

export const dimensione = n => n > 1048576 ? (n / 1048576).toFixed(1) + ' MB'
  : n > 1024 ? Math.round(n / 1024) + ' KB' : n + ' B';
