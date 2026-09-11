/* anno.js - la cronostriscia: clienti x 12 mesi, celle a quattro segmenti.
   Disegno via stringhe HTML (fino a ~6600 celle) + delega degli eventi.

   Attributi della cella:
     data-cella="idService-mese"       chiave
     data-s / data-c / data-k / data-r 0|1 -> pilotano i quattro segmenti dal CSS
   Le classi temporali (previsto / visita / stima / da-rinnovare / non-tracciato /
   prima-contratto / non-previsto) vengono da stato.classeMese:
   vedi #ANCHOR: anno-modello in stato.js.

   Una RIGA si legge cosi': in tutto l'anno UNA sola capsula piena, nel mese in
   cui la mappatura di quel SITO scade (il primo mese di manutenzione dentro il
   contratto); tutte le altre capsule hanno il solo contorno, sono visite - la
   mappatura si puo' fare la', ma non e' un secondo impegno (#ANCHOR:
   mappatura-anno). Quando i quattro passi ci sono la capsula si accende di
   verde: quel sito e' a posto per l'anno. I totali per mese contano i SITI la
   cui mappatura *scade* in quel mese, non le celle; la riga cliente somma i
   suoi impianti.
   #ANCHOR: vista-anno */
import { esc, ICO, FRECCE, fuoco, frecceEntrano, tinta, iniziali } from './ui.js';
import { htmlChipDocumento } from './documenti.js';
import {
  st, cella, statoCella, progresso, progressoGruppo, gruppiFiltrati, spunta,
  mappaturaSito, meseScadenza, scadEffettiva, statoMappatura, notaEredita, fuochiSu,
  PROPOSTA, notaProposta, prossimo, fatto,
  CAMPI, SIGLA, PASSI, CLASSE_ET, ET_STATO,
} from './stato.js';
import { apriPop, chiudiPop, popAperto } from './spunte.js';
import { apriCassetto } from './cassetto.js';

let radice = null, contenitore = null;

/* Il pallino in testa alla riga diceva il tipo di gas: tre colori fissi che
   nessuno leggeva, tanto meno da quando il filtro per tipo non c'e' piu'. Ora
   dice come sta LA mappatura dell'anno di quel sito (#ANCHOR: filtro-stato in
   stato.js) - ed e' l'unico segnale che si vede anche quando la casella piena
   sta in un mese fuori dallo schermo. Il tipo resta nel suggerimento. */
const titoloPunto = (s, k) => ET_STATO[k] + (s.tipo ? ' · ' + s.tipo : '');
const htmlPunto = s => {
  const k = statoMappatura(s);
  return `<span class="punto-stato ${k}" title="${esc(titoloPunto(s, k))}"></span>`;
};
/* data-x: 0 niente, 1 fatto QUI, 2 EREDITATO, cioe' fatto in un mese prima o
   l'anno prima e ancora valido (#ANCHOR: passi-cumulativi in stato.js). Il
   CSS disegna il 2 con lo stesso colore, tenue. */
const segAttr = e => CAMPI.map(k =>
  `data-${SIGLA[k]}="${e.c[SIGLA[k]] === 1 ? 1 : e.c[SIGLA[k]] === PROPOSTA ? 3 : e.ered?.[k] ? 2 : 0}"`).join(' ');
/* Un collega ha questa cella aperta adesso (#ANCHOR: fuoco): le sue iniziali
   nel suo colore, sopra la cella. Leggero di proposito: e' un avviso, non un
   blocco. */
const chipFuoco = chi => chi.length
  ? `<span class="fuoco-nome" style="--tinta:${tinta(chi[0])}" title="${esc(chi.join(', '))} ha aperto questa cella">${esc(iniziali(chi[0]))}</span>`
  : '';
const SEG = '<i class="seg s"></i><i class="seg c"></i><i class="seg k"></i>' +
  '<i class="seg r"></i>';
const oggiCl = m => (m === st.meseOggi && st.anno === st.annoOggi) ? ' mese-oggi' : '';

/* classe temporale -> classe CSS aggiuntiva della cella */
const CSS_CLASSE = {
  'previsto': '', 'visita': 'visita', 'non-tracciato': 'nontracciato',
  'stima': 'stima', 'da-rinnovare': 'darinnovare',
};

function htmlCella(s, m) {
  const e = statoCella(s.id, m);
  let tip = CLASSE_ET[e.classe] || '';
  if (e.classe === 'stima' || e.classe === 'da-rinnovare') {
    /* Per il rinnovo automatico la data utile e' la fine del termine IN CORSO,
       non quella scritta in Access: oltre quella comincia la proiezione. */
    const sc = scadEffettiva(s);
    tip += sc ? ` (scadenza contratto ${sc.split('-').reverse().join('/')})` : '';
  }
  if (e.classe === 'visita') {
    const sc = meseScadenza(s);
    if (sc) tip += ` (${st.mesi[sc - 1]})`;
  }

  if (e.classe === 'non-previsto' || e.classe === 'prima-contratto') {
    // spunte su un mese non previsto: si mostrano comunque, marcate orfane
    if (e.mie > 0) {
      return `<div class="q${oggiCl(m)}"><button class="cella orfana" data-cella="${s.id}-${m}"
        tabindex="-1" ${segAttr(e)}
        title="Mese non previsto, ma con spunte registrate">${SEG}</button></div>`;
    }
    const cl = e.classe === 'prima-contratto' ? 'q fuori-contratto' : 'q non-previsto';
    return `<div class="${cl}${oggiCl(m)}" title="${esc(tip)}"></div>`;
  }

  const chi = fuochiSu(s.id, m);
  const pr = e.attesa.map(k => notaProposta(e.c, k)).join(' · ');
  const er = [notaEredita(e), pr].filter(Boolean).join(' · ');
  const cl = ['cella', CSS_CLASSE[e.classe], e.completa && 'completa',
    e.ritardo && 'ritardo', e.c.nota && 'con-nota', chi.length && 'altrui',
    e.attesa.length && 'attesa'].filter(Boolean).join(' ');
  return `<div class="q${oggiCl(m)}"><button class="${cl}" data-cella="${s.id}-${m}"
    tabindex="-1" aria-label="${st.mesi[m - 1]} ${st.anno}: ${e.n} di ${PASSI} passi. ${esc(tip)}${er ? ' ' + esc(er) + '.' : ''}"
    data-tip="${esc(tip)}" title="${esc(tip)}${er ? ' \u00b7 ' + esc(er) : ''}"${chi.length ? ` style="--tinta:${tinta(chi[0])}"` : ''}
    ${segAttr(e)}>${SEG}</button>${chipFuoco(chi)}</div>`;
}

function htmlRigaSrv(s, rit) {
  const p = progresso(s);
  const chiuso = s.stato !== 'APERTO';
  /* `a-posto`: la mappatura dell'anno di questo sito e' chiusa. La riga intera
     lo dice (spina verde, fondo, spunta nel totale), non solo la cella: la
     cella verde puo' stare in un mese fuori dallo schermo. Stessa condizione
     del `.pieno` sul totale, cosi' i due segnali non si contraddicono mai. */
  const aPosto = !chiuso && p.tot > 0 && p.fatti === p.tot;
  let mesi = '';
  for (let m = 1; m <= 12; m++) mesi += htmlCella(s, m);
  return `<div class="riga riga-srv${chiuso ? ' chiuso' : ''}${aPosto ? ' a-posto' : ''} entra-riga"
      data-srv="${s.id}" style="--rit:${rit}ms">
    <div class="col-nome">
      ${htmlPunto(s)}
      <span class="srv-id">#${s.id}</span>
      <span class="srv-dest" title="${esc(s.dest)}">${esc(s.dest || '(senza destinazione)')}</span>
      ${htmlChipDocumento(s.id)}
      <span class="srv-loc">${esc(s.loc || '')}</span>
      ${chiuso ? '<span class="tag">chiuso</span>' : ''}
      <span class="tag completo" title="Mappatura dell'anno completa">a posto</span>
    </div>
    <div class="mesi">${mesi}</div>
    <div class="col-tot${p.tot && p.fatti === p.tot ? ' pieno' : ''}">
      ${p.tot ? `<b>${p.fatti}</b>/${p.tot}` : '&mdash;'}
    </div>
  </div>`;
}

/* La riga del cliente NON riassume piu' i mesi: dodici caselle vuote, che
   servono solo a tenere la colonna di oggi (`.mese-oggi`) allineata a quelle
   dei siti. Ci sono state una barretta in percentuale e poi una capsula a
   quattro segmenti (28a sessione): il committente le ha tolte tutte e due -
   "non serve", i passi si leggono sulle righe dei siti e il totale sta nella
   colonna Anno. */
function barreCliente() {
  let out = '';
  for (let m = 1; m <= 12; m++) out += `<div class="q${oggiCl(m)}"></div>`;
  return out;
}

function htmlGruppo(g, rit) {
  const pg = progressoGruppo(g);
  const piegato = st.chiusiCli.has(g.cli.id);
  const righe = piegato ? ''
    : g.srvs.map((s, i) => htmlRigaSrv(s, Math.min(rit + i * 6, 260))).join('');
  /* `completo`: tutti i passi contati del cliente sono fatti. La carta intera
     si accende, anche da piegata: e' il livello piu' alto dello stesso segnale
     della cella. L'etichetta "a posto" e' sempre nel markup e la mostra il CSS,
     cosi' `aggiornaTotali` cambia una classe sola e non tocca il DOM. */
  const completo = pg.tot > 0 && pg.fatti === pg.tot;
  return `<section class="blocco${completo ? ' completo' : ''}" data-cli="${g.cli.id}">
    <div class="riga riga-cli entra-riga" role="button" tabindex="0"
         aria-expanded="${!piegato}" style="--rit:${rit}ms">
      <div class="col-nome">
        <span class="cuneo">${ICO.cuneo}</span>
        <span class="cli-nome" title="${esc(g.cli.rs)}">${esc(g.cli.rs)}</span>
        <span class="cli-id">${g.cli.id}</span>
        ${pg.aperti ? `<span class="tag aperti">${pg.aperti} apert${pg.aperti === 1 ? 'o' : 'i'}</span>` : ''}
        ${pg.chiusi ? `<span class="tag">${pg.chiusi} chius${pg.chiusi === 1 ? 'o' : 'i'}</span>` : ''}
        <span class="tag completo" title="Tutte le mappature dell'anno di questo cliente sono complete">a posto</span>
      </div>
      <div class="mesi">${barreCliente()}</div>
      <div class="col-tot${pg.tot && pg.fatti === pg.tot ? ' pieno' : ''}"
           title="${pg.dovute ? `${pg.complete} mappature complete su ${pg.dovute} dovute` : 'nessuna mappatura dovuta quest\'anno'}">
        ${pg.tot ? `<b>${pg.fatti}</b>/${pg.tot}` : '&mdash;'}
      </div>
    </div>
    ${righe}
  </section>`;
}

/* Mappature complete / in scadenza in un mese, su tutto il set filtrato: una
   per SITO. */
function totaliMese(gruppi, m) {
  let fatte = 0, tot = 0;
  for (const g of gruppi) {
    for (const s of g.srvs) {
      if (s.stato !== 'APERTO') continue;
      const ma = mappaturaSito(s);
      if (!ma.prevista || ma.scad !== m) continue;
      tot++;
      if (ma.completa) fatte++;
    }
  }
  return [fatte, tot];
}

/** Il totale del mese sotto il suo nome, nell'intestazione: chiuse/in scadenza
 *  e il filo che si riempie (`--p`). E' quello che si guarda per capire dove
 *  intervenire senza contare le celle a occhio. Lo span c'e' sempre, anche
 *  vuoto, cosi' `aggiornaRigaTotali` lo trova quando un mese si popola. */
function htmlTotaleMese(gruppi, m) {
  const [fatte, tot] = totaliMese(gruppi, m);
  return `<span class="tm${tot && fatte === tot ? ' pieno' : ''}"
    style="--p:${tot ? Math.round(fatte / tot * 100) : 0}%"
    title="${fatte} chiuse su ${tot} mappature (una per sito) che scadono in questo mese">${tot ? `${fatte}/${tot}` : ''}</span>`;
}

/** Tutti i clienti a schermo sono piegati? Serve al bottone della testa, che
 *  fa una cosa sola e la dice: chiudi tutto / riapri tutto. */
const tuttiPiegati = gruppi =>
  gruppi.length > 0 && gruppi.every(g => st.chiusiCli.has(g.cli.id));

/** Piega o spiega TUTTI i clienti del set filtrato. Con 222 clienti aperti la
 *  griglia e' lunghissima: senza questo bottone si richiudevano a mano uno a
 *  uno. Agisce sui filtri attivi, come tutto il resto. */
function piegaTutti(chiudi) {
  const gruppi = gruppiFiltrati();
  for (const g of gruppi) {
    chiudi ? st.chiusiCli.add(g.cli.id) : st.chiusiCli.delete(g.cli.id);
  }
  chiudiPop();
  disegna(contenitore);
}

export function disegna(area) {
  const gruppi = gruppiFiltrati();
  /* I totali per mese nell'intestazione contano l'anno, non la selezione: con
     il filtro di stato acceso devono restare fermi, come i numeri della testa
     e quelli dentro il filtro (vedi #ANCHOR: filtro-stato). Senza filtro e'
     lo stesso elenco e non si rifa' il giro. */
  const tutti = st.filtri.stato ? gruppiFiltrati({ ignoraStato: true }) : gruppi;
  const chiuse = tuttiPiegati(gruppi);
  const testa = `<div class="riga crono-testa">
    <div class="col-nome">
      <button class="piega-tutti" data-piega="${chiuse ? 0 : 1}"
              title="${chiuse ? 'Riapri gli impianti di tutti i clienti' : 'Richiudi le tendine di tutti i clienti'}">
        ${chiuse ? ICO.espandi : ICO.comprimi}
        <span>${chiuse ? 'Apri tutti' : 'Chiudi tutti'}</span>
      </button>
      <span>Cliente &middot; sito</span>
      <i title="Sotto ogni mese: mappature chiuse / in scadenza in quel mese">chiuse / in scadenza</i>
    </div>
    <div class="mesi">${st.mesi.map((m, i) =>
    `<div class="m${oggiCl(i + 1) ? ' oggi' : ''}">${m}${htmlTotaleMese(tutti, i + 1)}</div>`).join('')}</div>
    <div class="col-tot">Anno</div>
  </div>`;
  area.innerHTML = `<div class="crono">${testa}${gruppi.length
    ? gruppi.map((g, i) => htmlGruppo(g, Math.min(i * 14, 240))).join('')
    : `<div class="vuoto"><b>Nessun service con questi filtri</b>
         Togli un filtro o svuota la ricerca.</div>`}</div>`;
  contenitore = area;
  radice = area.querySelector('.crono');
  collega(radice);
  radice.querySelector('.cella')?.setAttribute('tabindex', '0');
}

/* --- movimento con le frecce ------------------------------------------------
   La griglia e' bucata: i mesi senza manutenzione prevista non sono celle
   attive (sono dei <div class="q"> vuoti). Muoversi sull'elenco delle .cella
   non bastava: nella maggior parte delle righe ce n'e' una sola e le frecce
   sembravano morte. Si ragiona quindi per colonna (0..11) e si cerca la prima
   cella attiva nella direzione richiesta, saltando i buchi e le righe vuote. */

const colonna = cel => [...cel.closest('.mesi').children].indexOf(cel.closest('.q'));

/* Colonna "desiderata" durante un movimento verticale: senza memoria, salendo e
   scendendo fra righe con mesi diversi il fuoco derivava di mese in mese. */
let colMemo = null;

/** Prima cella attiva della riga a partire da `col` (esclusa), verso `dir`. */
function scorriRiga(riga, col, dir) {
  const q = [...riga.querySelector('.mesi').children];
  for (let i = col + dir; i >= 0 && i < q.length; i += dir) {
    const c = q[i].querySelector('.cella');
    if (c) return c;
  }
  return null;
}

/** Cella della riga nella colonna `col`; se il mese non e' previsto, la piu'
 *  vicina a destra o a sinistra. Null se la riga non ha celle attive. */
function vicinaInRiga(riga, col) {
  const q = [...riga.querySelector('.mesi').children];
  const dritto = q[col]?.querySelector('.cella');
  if (dritto) return dritto;
  for (let d = 1; d < q.length; d++) {
    const c = q[col + d]?.querySelector('.cella') || q[col - d]?.querySelector('.cella');
    if (c) return c;
  }
  return null;
}

function vai(alt) {
  if (!fuoco(alt)) return;
  // se il popover era aperto, segue la cella col fuoco
  if (popAperto()) apriPop(alt, ...alt.dataset.cella.split('-').map(Number));
}

/* il primo colpo di freccia entra nella griglia: vedi ui.frecceEntrano */
frecceEntrano(
  () => st.vista === 'anno' && !!radice?.isConnected,
  () => [...radice.querySelectorAll('.cella')],
  '.cella');

function collega(r) {
  if (r.__collegato) return;
  r.__collegato = true;

  r.addEventListener('click', e => {
    colMemo = null;                     // il mouse ridefinisce la colonna
    const cel = e.target?.closest?.('.cella');
    if (cel) return apriPop(cel, ...cel.dataset.cella.split('-').map(Number));
    const pt = e.target?.closest?.('[data-piega]');
    if (pt) return piegaTutti(pt.dataset.piega === '1');
    const cli = e.target?.closest?.('.riga-cli');
    if (cli) return piega(cli);
    const nome = e.target?.closest?.('.riga-srv .col-nome');
    if (nome) apriCassetto(Number(nome.closest('.riga-srv').dataset.srv));
  });

  r.addEventListener('keydown', e => {
    const cli = e.target?.closest?.('.riga-cli');
    if (cli && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); return piega(cli); }
    const cel = e.target?.closest?.('.cella');
    if (!cel) return;
    const [id, m] = cel.dataset.cella.split('-').map(Number);
    const i = '1234'.indexOf(e.key);
    if (i >= 0) {
      e.preventDefault();
      return spunta(id, m, CAMPI[i], prossimo(id, m, CAMPI[i]));
    }
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); return apriPop(cel, id, m); }
    const dx = (e.key === 'ArrowLeft' || e.key === 'ArrowRight') && FRECCE[e.key];
    const dy = (e.key === 'ArrowUp' || e.key === 'ArrowDown') && FRECCE[e.key];
    const bordo = { Home: 1, End: -1 }[e.key];
    if (!dx && !dy && !bordo) return;
    e.preventDefault();
    const riga = cel.closest('.riga-srv');
    const col = colonna(cel);
    let alt = null;
    if (dx || bordo) {
      alt = dx ? scorriRiga(riga, col, dx) : scorriRiga(riga, bordo > 0 ? -1 : 12, bordo);
      if (alt) colMemo = colonna(alt);
    } else {
      const meta = colMemo ?? col;
      colMemo = meta;
      const righe = [...r.querySelectorAll('.riga-srv')];
      for (let i = righe.indexOf(riga) + dy; i >= 0 && i < righe.length && !alt; i += dy) {
        alt = vicinaInRiga(righe[i], meta);
      }
    }
    vai(alt);
  });

  // roving tabindex: una sola cella nell'ordine di tabulazione
  r.addEventListener('focusin', e => {
    if (!e.target.classList?.contains('cella')) return;
    r.querySelectorAll('.cella[tabindex="0"]').forEach(n => { n.tabIndex = -1; });
    e.target.tabIndex = 0;
  });
}

function piega(riga) {
  const sez = riga.closest('.blocco');
  const id = Number(sez.dataset.cli);
  st.chiusiCli.has(id) ? st.chiusiCli.delete(id) : st.chiusiCli.add(id);
  chiudiPop();
  const g = gruppiFiltrati().find(x => x.cli.id === id);
  if (g) sez.outerHTML = htmlGruppo(g, 0);
}

/** Aggiorna in posto una cella. Chiamata dalle spunte locali e dagli eventi SSE. */
export function aggiornaCella(id, mese, remoto) {
  if (!radice) return;
  const n = radice.querySelector(`.cella[data-cella="${id}-${mese}"]`);
  if (!n) {
    // La cella non esiste ancora: succede quando arriva una spunta su un mese
    // non previsto (orfana). Ridisegno la riga del service, poi i totali.
    const riga = radice.querySelector(`.riga-srv[data-srv="${id}"]`);
    const s = st.perServ.get(id);
    if (riga && s) riga.outerHTML = htmlRigaSrv(s, 0);
    aggiornaTotali(id);
    return;
  }
  dipingi(n, id, mese);
  if (remoto) eco(n, remoto);
  /* I passi si ereditano fra i mesi (#ANCHOR: passi-cumulativi): una spunta
     messa o tolta a maggio cambia anche le capsule di settembre e novembre
     della stessa riga. Sono al massimo undici nodi. */
  for (const altra of radice.querySelectorAll(`.cella[data-cella^="${id}-"]`)) {
    if (altra !== n) dipingi(altra, id, Number(altra.dataset.cella.split('-')[1]));
  }
  aggiornaTotali(id);
}

/** Riscrive attributi e classi di una capsula dal modello, senza toccare il DOM
 *  intorno (fuoco della tastiera, chip del collega). */
function dipingi(n, id, mese) {
  const e = statoCella(id, mese);
  /* 1 fatto, 2 ereditato (tenue), 3 PROPOSTO dall'operatore e in attesa di chi approva
     (a righe, #ANCHOR: ruoli), 0 niente */
  for (const k of CAMPI) {
    const v = e.c[SIGLA[k]];
    n.setAttribute('data-' + SIGLA[k], v === 1 ? 1 : v === PROPOSTA ? 3 : e.ered[k] ? 2 : 0);
  }
  n.classList.toggle('attesa', e.attesa.length > 0);
  /* la capsula che DIVENTA completa sotto la mano fiorisce una volta
     (css/griglia.css, .fiorisce): e' il momento che si aspettava */
  const eraCompleta = n.classList.contains('completa');
  n.classList.toggle('completa', e.completa);
  if (e.completa && !eraCompleta && n.isConnected) {
    n.classList.add('fiorisce');
    n.addEventListener('animationend', () => n.classList.remove('fiorisce'), { once: true });
  }
  n.classList.toggle('ritardo', e.ritardo);
  n.classList.toggle('con-nota', !!e.c.nota);
  n.classList.toggle('sospesa', CAMPI.some(x => st.sospese.has(`${id}-${mese}-${x}`)));
  const er = notaEredita(e);
  const pr = e.attesa.map(k => notaProposta(e.c, k)).join(' \u00b7 ');
  const tip = n.dataset.tip ?? (CLASSE_ET[e.classe] || '');
  n.title = tip + (er ? ' \u00b7 ' + er : '') + (pr ? ' \u00b7 ' + pr : '');
  n.setAttribute('aria-label',
    `${st.mesi[mese - 1]} ${st.anno}: ${e.n} di ${PASSI} passi. ${CLASSE_ET[e.classe] || ''}${er ? ' ' + er + '.' : ''}`);
}

/** L'ONDA delle azioni di massa (#ANCHOR: massa in app.js). Dopo un "Completa
 *  tutte" o un "Azzera tutte" la griglia e' gia' ridisegnata, e centinaia di
 *  spunte sono comparse (o sparite) tutte insieme, senza un movimento: qui un
 *  FRONTE DI LUCE attraversa la griglia da sinistra a destra e, al suo
 *  passaggio, le celle toccate che si vedono si accendono - o si spengono -
 *  una dopo l'altra. Si fa vedere quanto e' stato largo il colpo.
 *  Il fronte c'e' SEMPRE, anche quando nessuna delle celle toccate e' in
 *  vista: sono sparse su duecento clienti, quasi mai capitano nella schermata
 *  che si sta guardando. Il turno di ogni cella e' la sua POSIZIONE sotto il
 *  fronte, non il suo posto nell'elenco. `verso`: 'su' completa, 'giu' azzera.
 *  #ANCHOR: onda-massa */
export function onda(chiavi, verso) {
  if (!radice || !chiavi || !chiavi.size) return;
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const giu = verso === 'giu';
  const alto = innerHeight, largo = innerWidth || 1;
  const r = radice.getBoundingClientRect();
  const x = Math.max(r.left, 0), y = Math.max(r.top, 0);
  const w = Math.min(r.right, largo) - x, h = Math.min(r.bottom, alto) - y;
  if (w > 0 && h > 0) {
    const velo = document.createElement('div');
    velo.className = 'onda-velo' + (giu ? ' giu' : '');
    velo.style.cssText = `left:${x}px;top:${y}px;width:${w}px;height:${h}px`;
    document.body.appendChild(velo);
    setTimeout(() => velo.remove(), 1400);   // il fronte e la sua dissolvenza
  }
  const classe = giu ? 'onda-giu' : 'onda-su';
  for (const k of chiavi) {
    const n = radice.querySelector(`.cella[data-cella="${k}"]`);
    if (!n) continue;
    const c = n.getBoundingClientRect();
    if (c.bottom < y || c.top > alto) continue;      // fuori dallo schermo
    /* la banda e' inclinata: chi sta in alto la incontra un filo prima */
    const t = c.left / largo + (c.top / alto) * 0.12;
    n.style.setProperty('--onda', Math.round(t * 700) + 'ms');
    n.classList.add(classe);
    n.addEventListener('animationend', () => {
      n.classList.remove(classe);
      n.style.removeProperty('--onda');
    }, { once: true });
  }
}

/** Un collega ha aperto (o lasciato) una cella (#ANCHOR: fuoco): anello del suo
 *  colore e iniziali. `prima`/`dopo` sono chiavi "id-mese", anche vuote. */
export function aggiornaFuoco(prima, dopo) {
  if (!radice) return;
  for (const k of new Set([prima, dopo])) {
    if (!k) continue;
    const n = radice.querySelector(`.cella[data-cella="${k}"]`);
    if (!n) continue;
    const chi = fuochiSu(...k.split('-').map(Number));
    n.classList.toggle('altrui', chi.length > 0);
    n.parentElement.querySelector('.fuoco-nome')?.remove();
    if (chi.length) {
      n.style.setProperty('--tinta', tinta(chi[0]));
      n.parentElement.insertAdjacentHTML('beforeend', chipFuoco(chi));
    } else {
      n.style.removeProperty('--tinta');
    }
  }
}

/* La modifica di un collega si annuncia una volta: anello + nome. */
function eco(n, chi) {
  n.classList.remove('remota');
  void n.offsetWidth;
  n.classList.add('remota');
  n.parentElement.querySelector('.eco-nome')?.remove();
  const et = document.createElement('span');
  et.className = 'eco-nome';
  et.textContent = chi;
  n.parentElement.append(et);
  setTimeout(() => et.remove(), 1700);
}

/** Numero nella colonna "Anno" di una riga service. */
function rinfrescaRiga(id) {
  const s = st.perServ.get(id);
  const riga = radice?.querySelector(`.riga-srv[data-srv="${id}"]`);
  if (!s || !riga) return;
  const p = progresso(s);
  const t = riga.querySelector('.col-tot');
  const pieno = p.tot > 0 && p.fatti === p.tot;
  t.innerHTML = p.tot ? `<b>${p.fatti}</b>/${p.tot}` : '&mdash;';
  t.classList.toggle('pieno', pieno);
  riga.classList.toggle('a-posto', pieno && s.stato === 'APERTO');
  const punto = riga.querySelector('.punto-stato');
  if (punto) {
    const k = statoMappatura(s);
    punto.className = 'punto-stato ' + k;
    punto.title = titoloPunto(s, k);
  }
}

function aggiornaTotali(id) {
  const s = st.perServ.get(id);
  if (!s || !radice) return;
  /* La mappatura e' del sito: chiuderla alla visita di novembre toglie il
     ritardo alla sua cella di scadenza, che sta sulla stessa riga ma in un
     altro mese. Va ridipinta anche lei. */
  const ma = mappaturaSito(s);
  if (ma.scad) {
    const cs = radice.querySelector(`.cella[data-cella="${id}-${ma.scad}"]`);
    if (cs) cs.classList.toggle('ritardo', statoCella(id, ma.scad).ritardo);
  }
  rinfrescaRiga(id);
  const sez = radice.querySelector(`.blocco[data-cli="${s.cli}"]`);
  const g = st.gruppi.find(x => x.cli.id === s.cli);
  if (!sez || !g) return;
  const pg = progressoGruppo(g);
  const t2 = sez.querySelector('.riga-cli .col-tot');
  const completo = pg.tot > 0 && pg.fatti === pg.tot;
  t2.innerHTML = pg.tot ? `<b>${pg.fatti}</b>/${pg.tot}` : '&mdash;';
  t2.classList.toggle('pieno', completo);
  /* LA FESTA: l'ultima spunta che chiude la mappatura del cliente accende la
     carta e una luce verde la attraversa, una volta (css/griglia.css) */
  const eraCompleto = sez.classList.contains('completo');
  sez.classList.toggle('completo', completo);
  if (completo && !eraCompleto) {
    sez.classList.remove('festa'); void sez.offsetWidth;
    sez.classList.add('festa');
    sez.addEventListener('animationend', () => sez.classList.remove('festa'), { once: true });
  }
  aggiornaRigaTotali();
}

/* Tiene al passo i totali per mese nell'intestazione durante le spunte in serie. */
function aggiornaRigaTotali() {
  const tms = radice?.querySelectorAll('.crono-testa .tm');
  if (!tms?.length) return;
  const gruppi = gruppiFiltrati({ ignoraStato: true });   // come in `disegna`
  for (let m = 1; m <= 12; m++) {
    const tm = tms[m - 1];
    if (!tm) continue;
    const [fatte, tot] = totaliMese(gruppi, m);
    tm.textContent = tot ? `${fatte}/${tot}` : '';
    tm.title = `${fatte} chiuse su ${tot} mappature che scadono in questo mese`;
    tm.classList.toggle('pieno', tot > 0 && fatte === tot);
    tm.style.setProperty('--p', (tot ? Math.round(fatte / tot * 100) : 0) + '%');
  }
}

/** Passi ancora da spuntare nel set filtrato: alimenta "Completa tutto".
 *  `soloReali` limita ai mesi dentro contratto e dentro il tracciamento. */
export function passiMancanti(soloReali = true) {
  const voci = [];
  for (const g of gruppiFiltrati()) {
    for (const s of g.srvs) {
      if (s.stato !== 'APERTO') continue;
      for (let m = 1; m <= 12; m++) {
        const e = statoCella(s.id, m);
        if (soloReali ? !e.reale : !e.spuntabile) continue;
        for (const campo of CAMPI) {
          // un passo ereditato da una visita prima e' gia' fatto: non si rimette
          if (!fatto(e.c, campo) && !e.ered[campo]) voci.push({ id: s.id, mese: m, campo, valore: 1 });
        }
      }
    }
  }
  return voci;
}

/** Passi da togliere nel set filtrato: per "Azzera". */
export function passiPresenti() {
  const voci = [];
  for (const g of gruppiFiltrati()) {
    for (const s of g.srvs) {
      if (s.stato !== 'APERTO') continue;
      for (let m = 1; m <= 12; m++) {
        const e = statoCella(s.id, m);
        if (!e.spuntabile) continue;
        for (const campo of CAMPI) {
          if (e.c[SIGLA[campo]] !== 0) voci.push({ id: s.id, mese: m, campo, valore: 0 });   // anche le proposte
        }
      }
    }
  }
  return voci;
}
