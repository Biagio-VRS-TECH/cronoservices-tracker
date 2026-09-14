/* app.js - il generatore del REGISTRO DEI COMPONENTI.  #ANCHOR: registro-app

Incolla i tre pezzi e non fa altro:
  registro.js   il file Excel diventa una struttura dati (nessun DOM)
  impagina.js   la struttura dati diventa pagine A4 dentro #pages
  js/ponte.js   le pagine diventano un PDF e il PDF arriva nel tracker

Il giro completo e' sempre lo stesso:
  file -> leggiExport -> dizionario (/api/dizionario) -> costruisciRegistro
       -> impagina -> pannelli (controlli, anomalie, nomi dei componenti)

Il dizionario dei nomi e' CONDIVISO: vive nel database del tracker, non nel
browser. Si rilegge quando si torna sulla scheda (visibilitychange), cosi' il
nome che un collega ha appena cambiato entra nel documento senza ricaricare
niente. */
import { avviaPonte } from '../js/ponte.js';
import { chiama, rete } from '../js/api.js';
import { leggiExport, costruisciRegistro, testoAnomalie, registroInDict, ErroreLettura,
         interpretaRiga, pianoNumerico, cmpNaturale } from './registro.js';
import { impagina, htmlDigitale } from './impagina.js';
import { creaAlbero } from '../js/albero.js';

const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/* --------------------------------------------------------------- lo stato -- */
let exportCorrente = null;    // l'uscita di leggiExport
let reg = null;               // il registro costruito
let nomeFileCaricato = '';
let titoloSito = '';          // il nome del sito collegato nel tracker, se c'e'
let voci = [];                // /api/dizionario: [{codice, nome, descrizione, priorita}]
let dizPronto = null;         // promessa del primo caricamento
let esclusi = new Set();      // stanze tolte dall'albero (chiaveStanza), 30a sessione
let pagineDaRifare = false;   // il documento e' cambiato mentre si era su "Nomi": si impagina al ritorno
let esempioGuida = false;     // e' caricato l'esempio del tutorial, non un file vero

const diz = new Map();        // codice -> nome semplice
const pri = new Map();        // codice -> 1..10

function applicaVoci(lista) {
  voci = lista || [];
  diz.clear(); pri.clear();
  for (const v of voci) {
    if (v.nome) diz.set(v.codice, v.nome);
    if (v.priorita) pri.set(v.codice, v.priorita);
  }
}

/** Il dizionario dal tracker. Non e' un errore fatale se non arriva: il
 *  documento esce comunque, con le descrizioni del gestionale. */
async function caricaDizionario() {
  try {
    const { ok, dati } = await chiama('/api/dizionario');
    if (ok && dati?.voci) applicaVoci(dati.voci);
  } catch { /* senza rete si lavora lo stesso */ }
}

/* ------------------------------------------------------- titolo e nome file */
const titoloDocumento = () => (titoloSito || exportCorrente?.cliente || '').trim();

const pulisciNome = s => String(s || '').replace(/[\\/:*?"<>|]+/g, '_').replace(/\s+/g, ' ').trim();

function nomePdf() {
  const base = `Registro componenti - ${pulisciNome(titoloDocumento()) || 'sito'} - ${reg?.dataIso || ''}`;
  return base.slice(0, 120) + '.pdf';
}

/* ------------------------------------------------------------- il documento */
let rigenerazioneInCorso = false, rigenerazioneDaRifare = false;

/** Ricostruisce registro + pagine. `nuovoExport` rifa' anche la tabella dei
 *  nomi e l'albero: durante il lavoro NON si toccano, altrimenti la riga
 *  scappa da sotto le dita (e' la regola scritta nel README della mappatura).
 *  Le pagine si rifanno SUBITO solo se l'anteprima e' in vista: dalla scheda
 *  "Nomi dei componenti" ogni nome salvato rigenerava 122 pagine nel DOM
 *  (140 ms di blocco misurati, e la scheda "tremava"); ora si segna
 *  `pagineDaRifare` e si impagina tornando all'anteprima o al momento di
 *  esportare (`assicuraPagine`). Il modello (reg) invece si rifa' sempre:
 *  costa pochi millisecondi e i controlli restano sinceri. */
function ricostruisci({ nuovoExport = false } = {}) {
  if (!exportCorrente) return;
  reg = costruisciRegistro(exportFiltrato(), { dizionario: diz, priorita: pri });
  disegnaControlli();
  if (nuovoExport) { disegnaNomi(); costruisciAlbero(); }
  $('#contaNomi').textContent = $('#nomiCorpo').children.length || reg.legenda.length;
  aggiornaConti();
  $('#print').disabled = false;
  $('#scaricaAnomalie').disabled = $('#scaricaDati').disabled = false;
  if ($('#vistaAnteprima').hidden && !nuovoExport) { pagineDaRifare = true; return null; }
  return impaginaOra();
}

/** Le pagine A4 nel DOM, adesso. */
function impaginaOra() {
  pagineDaRifare = false;
  const esito = impagina(reg, {
    contenitore: $('#pages'), corpo: Number($('#corpo').value) || 10.5,
    titolo: titoloDocumento(), logo: '/assets/logo.webp',
  });
  $('#contaPagine').textContent = esito.pagine + ' pag.';
  console.info(`[registro] ${reg.cliente}: ${esito.pagine} pagine in ${esito.ms} ms`);
  adattaZoom();
  ponte?.ridisegna();
  return esito;
}
/** Prima di guardare o esportare le pagine: se sono rimaste indietro, si rifanno. */
function assicuraPagine() { if (pagineDaRifare && reg) impaginaOra(); }

/* --------------------------------------------- l'albero: cosa entra --------- */
/* La chiave di una stanza e' il suo posto: piano, reparto, stanza cosi' come
   sono scritti nell'export (le stesse stringhe con cui costruisciRegistro
   raggruppa). Escludere una stanza toglie le sue righe PRIMA del modello,
   quindi documento, legenda, quadro e controlli si accordano da soli; le righe
   dati scendono dello stesso numero, cosi' la quadratura resta onesta. */
const SEP = '\u0000';
const chiaveStanza = r => r.piano + SEP + r.reparto + SEP + r.stanza;
function exportFiltrato() {
  if (!esclusi.size) return exportCorrente;
  const righe = exportCorrente.righe.filter(r => !esclusi.has(chiaveStanza(r)));
  const fuori = exportCorrente.righe.length - righe.length;
  return { ...exportCorrente, righe, righeDati: exportCorrente.righeDati - fuori, esclusiDallAlbero: fuori };
}
const ordinaPiani = (a, b) => {
  const na = pianoNumerico(a), nb = pianoNumerico(b);
  if (na !== null && nb !== null) return na - nb;
  if (na !== null) return -1;
  if (nb !== null) return 1;
  return cmpNaturale(a, b);
};
function costruisciAlbero() {
  const piani = new Map();     // piano -> reparto -> stanza -> n
  for (const r of exportCorrente.righe) {
    if (!piani.has(r.piano)) piani.set(r.piano, new Map());
    const reps = piani.get(r.piano);
    if (!reps.has(r.reparto)) reps.set(r.reparto, new Map());
    const stanze = reps.get(r.reparto);
    stanze.set(r.stanza, (stanze.get(r.stanza) || 0) + 1);
  }
  const rami = [...piani.keys()].sort(ordinaPiani).map(p => ({
    nome: p, chiave: p,
    kids: [...piani.get(p).keys()].sort(cmpNaturale).map(rep => ({
      nome: rep, chiave: p + SEP + rep,
      kids: [...piani.get(p).get(rep).entries()].sort((a, b) => cmpNaturale(a[0], b[0]))
        .map(([st, n]) => ({ nome: st, chiave: p + SEP + rep + SEP + st, n })),
    })),
  }));
  esclusi = new Set();
  creaAlbero($('#tree'), {
    rami, tutto: $('#selAll'), comprimi: $('#collAll'),
    suCambio: set => { esclusi = set; ricostruisci(); },
    suSalto: saltaA,
  });
  $('#treecol').hidden = false;
  $('#treegrip').hidden = false;
}
function nascondiAlbero() {
  $('#tree').replaceChildren();
  $('#treecol').hidden = true;
  $('#treegrip').hidden = true;
  esclusi = new Set();
}
/** Clic sul nome di un ramo: l'anteprima va alla pagina di quel piano o di
 *  quel reparto (una stanza porta al suo reparto: nel documento e' una riga). */
function saltaA(chiave, livello) {
  if (!reg) return false;
  mostraVista('anteprima');
  const [piano, reparto] = chiave.split(SEP);
  let id = null;
  for (const s of reg.sezioni) {
    const rep = s.reparti.find(r => r.piano === piano && (livello === 1 || r.nome === reparto));
    if (rep) { id = livello === 1 ? s.id : rep.id; break; }
  }
  /* le sezioni tengono il loro id sul blocco; le tabelle dei reparti nelle
     pagine sono ricostruite da impagina (apriTabella) e portano data-g */
  const el = id ? ($('#pages').querySelector('#' + CSS.escape(id)) ||
                   $('#pages').querySelector(`table[data-g="${CSS.escape(id)}"]`)) : null;
  const pagina = el?.closest('.page');
  if (!pagina) return false;
  const banco = $('#banco');
  banco.scrollTop += pagina.getBoundingClientRect().top - banco.getBoundingClientRect().top - 14;
  return true;
}

/** Rigenerazione in secondo piano dopo un salvataggio del dizionario: le
 *  modifiche fatte nel frattempo entrano nel giro successivo, non ne fanno
 *  partire uno in parallelo. */
async function rigenera() {
  if (rigenerazioneInCorso) { rigenerazioneDaRifare = true; return; }
  rigenerazioneInCorso = true;
  try {
    do {
      rigenerazioneDaRifare = false;
      await new Promise(r => requestAnimationFrame(r));
      ricostruisci();
    } while (rigenerazioneDaRifare);
  } finally {
    rigenerazioneInCorso = false;
  }
}

/* ----------------------------------------------------------- il file Excel */
async function leggiFile(f) {
  if (!f) return;
  esempioGuida = false;   // un file vero prende il posto dell'esempio della guida
  nomeFileCaricato = f.name;
  $('#fileinfo').innerHTML = '<b>Leggo il file…</b>';
  try {
    await dizPronto;
    const buf = await f.arrayBuffer();
    exportCorrente = leggiExport(buf, f.name);
  } catch (e) {
    exportCorrente = null; reg = null;
    $('#fileinfo').innerHTML = `<div class="errore"><b>${esc(e instanceof ErroreLettura ? e.message : 'Errore di lettura: ' + (e?.message || e))}</b></div>`;
    $('#dropFile').hidden = false;
    return;
  }
  $('#empty-state').hidden = true;
  $('#viste').hidden = false;
  $('#dropFile').hidden = false;
  ricostruisci({ nuovoExport: true });
  /* il banco si riapparecchia: i gruppi rientrano a scalare (js/gruppi.js) */
  window.entrataGruppi?.();
  ponte.riconosci(nomeFileCaricato, exportCorrente.cliente);
}

function togliFile() {
  exportCorrente = null; reg = null; nomeFileCaricato = ''; esempioGuida = false; pagineDaRifare = false;
  nascondiAlbero();
  $('#pages').replaceChildren();
  $('#nomiCorpo').replaceChildren();
  $('#fileinfo').textContent = '';
  $('#controlli').replaceChildren();
  $('#anomalie').replaceChildren();
  $('#quadratura').hidden = true;
  $('#dropFile').hidden = true;
  $('#viste').hidden = true;
  $('#empty-state').hidden = false;
  $('#file').value = '';
  mostraVista('anteprima');
  $('#print').disabled = true;
  $('#scaricaAnomalie').disabled = $('#scaricaDati').disabled = true;
  aggiornaTitolo();
  ponte.fileTolto();
}

/** I conteggi sotto la zona del file: cliente, righe, componenti, luoghi. */
function aggiornaConti() {
  if (!reg) return;
  const c = reg.controlli;
  $('#fileinfo').innerHTML =
    `<b>${esc(nomeFileCaricato)}</b><br>${esc(exportCorrente.cliente)}` +
    `<div class="conti">` +
    `<span>Righe nel file</span><b>${c.righeDati}</b>` +
    `<span>Componenti</span><b>${c.totaleDocumento}</b>` +
    `<span>Tipi di componente</span><b>${c.codiciDistinti}</b>` +
    `<span>Piani</span><b>${c.nPiani}</b>` +
    `<span>Reparti</span><b>${c.nReparti}</b>` +
    `<span>Stanze</span><b>${c.nStanze}</b>` +
    (esclusi.size ? `<span>Esclusi dall\u2019albero</span><b>${exportCorrente.righe.length - c.righeInterpretate}</b>` : '') +
    `</div>`;
}

/* ------------------------------------------------- controlli e anomalie --- */
function disegnaControlli() {
  const c = reg.controlli;
  const q = $('#quadratura');
  q.hidden = false;
  q.className = c.quadraturaOk ? 'ok' : 'no';
  q.innerHTML = c.quadraturaOk
    ? `<b>QUADRATURA OK</b> &middot; ${c.totaleDocumento} componenti nel documento = ${c.righeDati} righe dati nel file.`
    : `<b>NON QUADRA</b> &middot; ${c.totaleDocumento} componenti nel documento contro ${c.righeDati} righe dati nel file ` +
      `(${c.righeNonInterpretate} righe non interpretate).`;

  const grado = (buono, medio) => (buono ? 'ok' : medio ? 'medio' : 'no');
  const riga = (cls, et, v) => `<li class="${cls}"><span><i class="pallino"></i>${et}</span><span class="v">${v}</span></li>`;
  $('#controlli').innerHTML =
    riga(grado(c.righeNonInterpretate === 0, false), 'Righe interpretate',
      `${c.righeInterpretate}/${c.righeDati}`) +
    riga(grado(c.coperturaCodici >= 90, c.coperturaCodici >= 60), 'Copertura dizionario (codici)',
      `${c.codiciCoperti}/${c.codiciDistinti} &middot; ${c.coperturaCodici}%`) +
    riga(grado(c.coperturaPezzi >= 90, c.coperturaPezzi >= 60), 'Copertura dizionario (pezzi)',
      `${c.pezziCoperti}/${c.totaleDocumento} &middot; ${c.coperturaPezzi}%`) +
    riga('', 'Anomalie', `${(c.nAnomalie.errore || 0)} err &middot; ${(c.nAnomalie.avviso || 0)} avv &middot; ${(c.nAnomalie.info || 0)} info`);

  $('#anomalie').innerHTML = reg.anomalie.length
    ? reg.anomalie.map(a => `<div><span class="etichetta ${a.gravita}">${a.gravita}</span><b>${esc(a.tipo)}</b> &mdash; ${esc(a.messaggio)}</div>`).join('')
    : '<div>Nessuna anomalia.</div>';
}

/* ---------------------------------------------- nomi dei componenti ------- */
/* Comportamenti obbligati (README della mappatura):
   - clic su casella vuota: ci viene trascritta la descrizione del gestionale,
     da accorciare invece che da riscrivere; se non la si tocca NON si salva
     niente (nel documento si legge comunque quella descrizione, e la copertura
     del dizionario resta un numero sincero);
   - Invio o uscita dalla casella salvano SUBITO; Escape annulla;
   - il documento si rigenera dopo, in secondo piano;
   - l'elenco NON si riordina mentre si lavora. */
function disegnaNomi() {
  const corpo = $('#nomiCorpo');
  corpo.replaceChildren();
  /* la legenda COMPLETA: il dizionario e' di tutto l'impianto, non di quello
     che l'albero lascia nel documento */
  const legenda = esclusi.size
    ? costruisciRegistro(exportCorrente, { dizionario: diz, priorita: pri }).legenda
    : reg.legenda;
  for (const v of legenda) {
    const tr = document.createElement('tr');
    if (v.priorita) tr.className = 'priorita';
    tr.innerHTML = `<td class="cod">${esc(v.codice)}</td><td class="descr">${esc(v.descrizione)}</td>` +
      `<td></td><td class="ord"></td><td class="n">${v.quantita}</td>`;

    const inp = document.createElement('input');
    inp.type = 'text';
    inp.placeholder = v.descrizione;
    inp.value = v.daDizionario ? v.nome : '';
    inp.className = v.daDizionario ? '' : 'originale';
    inp.setAttribute('aria-label', `Nome nel Registro per il codice ${v.codice}`);
    Object.assign(inp.dataset, { codice: v.codice, campo: 'nome', descrizione: v.descrizione, iniziale: inp.value });
    inp.addEventListener('focus', () => {
      if (inp.value.trim()) return;
      inp.value = inp.dataset.descrizione;
      inp.dataset.trascritta = '1';
      inp.classList.remove('originale'); inp.classList.add('trascritta');
      const fine = inp.value.length;
      setTimeout(() => { try { inp.setSelectionRange(fine, fine); } catch { } }, 0);
    });
    inp.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); inp.blur(); }
      if (e.key === 'Escape') { inp.value = inp.dataset.iniziale; inp.dataset.trascritta = ''; inp.classList.remove('trascritta'); inp.blur(); }
    });
    inp.addEventListener('input', () => {
      inp.dataset.trascritta = '';
      inp.classList.remove('trascritta');
      inp.classList.toggle('originale', !inp.value.trim());
    });
    inp.addEventListener('blur', () => salvaCampo(inp));
    tr.children[2].appendChild(inp);

    const ord = document.createElement('input');
    ord.type = 'number'; ord.min = '1'; ord.max = '10'; ord.step = '1'; ord.placeholder = '–';
    ord.title = 'Ordine di comparsa nel quadro d’insieme: 1 = in cima, 10 = per ultimo fra quelli numerati. Vuoto = nessuna priorità.';
    ord.setAttribute('aria-label', `Ordine nel quadro d’insieme per il codice ${v.codice}`);
    ord.value = v.priorita ? String(v.priorita) : '';
    ord.className = 'ordine' + (v.priorita ? '' : ' vuoto');
    Object.assign(ord.dataset, { codice: v.codice, campo: 'priorita', iniziale: ord.value });
    ord.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); ord.blur(); }
      if (e.key === 'Escape') { ord.value = ord.dataset.iniziale; ord.blur(); }
    });
    ord.addEventListener('input', () => ord.classList.toggle('vuoto', !ord.value.trim()));
    ord.addEventListener('blur', () => salvaCampo(ord));
    tr.children[3].appendChild(ord);

    corpo.appendChild(tr);
  }
}

async function salvaCampo(inp) {
  const campo = inp.dataset.campo;
  const valore = inp.value.trim();
  const precedente = (inp.dataset.iniziale || '').trim();
  const stato = $('#nomiStato');

  // descrizione trascritta col clic e lasciata intatta: non si salva niente
  if (campo === 'nome' && inp.dataset.trascritta === '1' && valore === (inp.dataset.descrizione || '').trim()) {
    inp.value = inp.dataset.iniziale; inp.dataset.trascritta = '';
    inp.classList.remove('trascritta');
    inp.classList.toggle('originale', !inp.value.trim());
    return;
  }
  inp.dataset.trascritta = ''; inp.classList.remove('trascritta');
  if (valore === precedente) return;

  if (campo === 'priorita' && valore !== '') {
    const n = Number(valore);
    if (!Number.isInteger(n) || n < 1 || n > 10) {
      stato.className = 'errore-testo';
      stato.textContent = 'L’ordine nel quadro deve essere un numero intero da 1 a 10, oppure vuoto.';
      inp.value = inp.dataset.iniziale; inp.classList.toggle('vuoto', !inp.value.trim());
      return;
    }
  }

  const corpo = campo === 'priorita'
    ? { codice: inp.dataset.codice, priorita: valore, operatore: rete.operatore }
    : { codice: inp.dataset.codice, nome: valore, descrizione: inp.dataset.descrizione, operatore: rete.operatore };
  inp.classList.add('salvataggio');
  stato.className = ''; stato.textContent = 'Salvataggio…';
  try {
    const { ok, dati } = await chiama('/api/dizionario', { metodo: 'POST', body: corpo });
    if (!ok) throw new Error(dati?.errore || 'errore del server');
    const voce = dati.voce || {};
    inp.dataset.iniziale = valore;
    inp.classList.remove('salvataggio'); inp.classList.add('salvato');
    setTimeout(() => inp.classList.remove('salvato'), 1500);

    // lo stato locale si aggiorna subito: il documento arriva dopo
    if (campo === 'priorita') { if (voce.priorita) pri.set(corpo.codice, voce.priorita); else pri.delete(corpo.codice); }
    else { if (valore) diz.set(corpo.codice, valore); else diz.delete(corpo.codice); }
    const riga = inp.closest('tr');
    if (riga) riga.classList.toggle('priorita', pri.has(corpo.codice));
    stato.textContent = 'Salvato\u2026';
    await rigenera();
    stato.textContent = pagineDaRifare ? 'Salvato \u00b7 il documento si aggiorna quando torni all\u2019anteprima.' : 'Salvato.';
  } catch (e) {
    inp.classList.remove('salvataggio');
    stato.className = 'errore-testo';
    stato.textContent = 'Non salvato: ' + (e?.message || e);
  }
}

/* ------------------------------------------------------------- le due viste */
function mostraVista(quale) {
  const ant = quale === 'anteprima';
  $('#vistaAnteprima').hidden = !ant;
  $('#vistaNomi').hidden = ant;
  $('#tabAnteprima').setAttribute('aria-selected', String(ant));
  $('#tabNomi').setAttribute('aria-selected', String(!ant));
  if (ant) { assicuraPagine(); adattaZoom(); }
}
$('#tabAnteprima').onclick = () => mostraVista('anteprima');
$('#tabNomi').onclick = () => mostraVista('nomi');

/* ------------------------------------------------------------------- zoom -- */
const SCALE = [0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1, 1.1, 1.25, 1.5];
let zoom = 1;

function applicaZoom() {
  const p = $('#pages'), w = $('#zoomwrap');
  p.style.transform = zoom === 1 ? 'none' : `scale(${zoom})`;
  const bh = p.offsetHeight, bw = p.offsetWidth;
  w.style.width = bh ? Math.ceil(bw * zoom) + 'px' : '';
  w.style.height = bh ? Math.ceil(bh * zoom) + 'px' : '';
  $('#zoomVal').textContent = 'Zoom ' + Math.round(zoom * 100) + '%';
}

/** La pagina si adatta alla colonna, come nel generatore di schede. */
function adattaZoom() {
  const banco = $('#banco'), p = $('#pages');
  if (!p.firstChild || $('#vistaAnteprima').hidden) return;
  const disponibile = banco.clientWidth - 40;
  const larghezza = p.offsetWidth || 1;
  zoom = Math.min(1, Math.max(0.4, Math.floor(disponibile / larghezza * 100) / 100));
  applicaZoom();
}
$('#zoomOut').onclick = () => { const i = SCALE.findIndex(x => x >= zoom - 0.001); zoom = SCALE[Math.max(0, i - 1)]; applicaZoom(); };
$('#zoomIn').onclick = () => { const i = SCALE.findIndex(x => x > zoom + 0.001); zoom = SCALE[i < 0 ? SCALE.length - 1 : i]; applicaZoom(); };
$('#zoomVal').onclick = adattaZoom;
addEventListener('resize', () => adattaZoom());

/* --------------------------------------------------------------- download -- */
function scarica(blob, nome) {
  const u = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: u, download: nome });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(u), 30000);
}
const baseNome = () => `${pulisciNome(titoloDocumento()) || 'sito'} - ${reg?.dataIso || ''}`;

$('#scaricaAnomalie').onclick = () =>
  scarica(new Blob([testoAnomalie(reg)], { type: 'text/plain;charset=utf-8' }), `Anomalie - ${baseNome()}.txt`);
$('#scaricaDati').onclick = () =>
  scarica(new Blob([JSON.stringify(registroInDict(reg), null, 2)], { type: 'application/json;charset=utf-8' }), `Dati - ${baseNome()}.json`);

/* L'interruttore "versione digitale": il PDF lo fa il ponte sul suo bottone,
   l'HTML lo aggiungiamo qui - i due ascoltatori convivono sullo stesso clic. */
$('#print').addEventListener('click', async () => {
  if (!reg || !$('#volHtml').checked) return;
  const html = await htmlDigitale(reg, { corpo: Number($('#corpo').value) || 10.5, titolo: titoloDocumento() });
  scarica(new Blob([html], { type: 'text/html;charset=utf-8' }), `Registro componenti - ${baseNome()}.html`);
});

/* ------------------------------------------------------------- il pannello */
$('#corpo').onchange = () => { if (reg) ricostruisci(); };
$('#file').onchange = e => leggiFile(e.target.files[0]);
$('#pickFile').onclick = () => $('#file').click();
$('#dropFile').onclick = togliFile;

const drop = $('#drop');
drop.onclick = () => $('#file').click();
drop.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); $('#file').click(); } };
for (const ev of ['dragenter', 'dragover']) drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add('hot'); });
for (const ev of ['dragleave', 'drop']) drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove('hot'); });
drop.addEventListener('drop', e => leggiFile(e.dataTransfer?.files?.[0]));
addEventListener('dragover', e => e.preventDefault());
addEventListener('drop', e => e.preventDefault());

function aggiornaTitolo() {
  $('#docTitle').value = titoloDocumento();
}

/* Il titolo cambia (sito collegato o scollegato): non si rifa' tutto il
   documento, si riscrivono le tre righe che lo nominano. */
function aggiornaNomeInPagina() {
  const t = titoloDocumento();
  const cop = $('#pages [data-cop-cliente]');
  if (cop) cop.textContent = t;
  for (const p of document.querySelectorAll('#pages .piede span:first-child')) {
    p.textContent = `Registro dei componenti · ${t}`;
  }
  const destra = document.querySelector('#pages .pagina-titolo .destra');
  if (destra && destra.textContent && !destra.textContent.includes('Quantit')) destra.textContent = t;
}

/* ---------------------------------------------------------------- il ponte */
const ponte = avviaPonte({
  tipo: 'registro',
  pagine: () => { assicuraPagine(); return [...document.querySelectorAll('#pages .page')]; },
  titolo: () => titoloDocumento(),
  nomeFile: () => nomePdf(),
  suSito: nome => {
    titoloSito = nome || '';
    aggiornaTitolo();
    if (reg) aggiornaNomeInPagina();
  },
});

/* ------------------------------------------------------------------ avvio -- */
dizPronto = caricaDizionario();
aggiornaTitolo();
mostraVista('anteprima');

/* Torna la scheda in primo piano: il dizionario puo' essere cambiato altrove
   (un collega, oppure la stessa persona su un'altra scheda). */
document.addEventListener('visibilitychange', async () => {
  if (document.hidden || !reg) return;
  const prima = JSON.stringify([...diz], null, 0) + JSON.stringify([...pri], null, 0);
  await caricaDizionario();
  if (JSON.stringify([...diz], null, 0) + JSON.stringify([...pri], null, 0) !== prima) {
    disegnaNomi();
    rigenera();
  }
});

/* ------------------------------------------------------------ il tutorial -- */
/* L'esempio della guida: dodici componenti su due piani, quattro reparti,
   sei stanze, un codice con due descrizioni (per far comparire un'anomalia).
   Righe scritte come le scrive il gestionale, lette con la stessa
   interpretaRiga del file vero: niente scorciatoie nel modello. */
const ESEMPIO_GUIDA = [
  '103416 - Rampa medicale 1/3 posti per ossigeno PIANO: 0; REPARTO: CENTRALE GAS; STANZA: LOCALE BOMBOLE; POSIZIONE: parete nord;',
  '103416 - Rampa medicale 1/3 posti per ossigeno PIANO: 0; REPARTO: CENTRALE GAS; STANZA: LOCALE BOMBOLE; POSIZIONE: parete sud;',
  '115925 - CENTRALE AUTOMATICA SINGOLO STADIO PER O2 RID. SR-2210M PIANO: 0; REPARTO: CENTRALE GAS; STANZA: LOCALE BOMBOLE;',
  '103419 - VALVOLA ALTA PRESSIONE PER SPURGO RAMPE PIANO: 0; REPARTO: CENTRALE GAS; STANZA: LOCALE BOMBOLE;',
  '132235 - AMBRA - ALLARME MOD. SDAL-MED L5 CENTRALE + RS485 SDAMNET PIANO: 0; REPARTO: PORTINERIA; STANZA: GUARDIOLA;',
  '106345 - PRESA CORTA UNI 9507 PER O2 PIANO: 1; REPARTO: DEGENZE A; STANZA: 101;',
  '106345 - PRESA CORTA UNI 9507 PER O2 PIANO: 1; REPARTO: DEGENZE A; STANZA: 102;',
  '106347 - PRESA CORTA UNI 9507 PER VUOTO PIANO: 1; REPARTO: DEGENZE A; STANZA: 102;',
  '131655 - GRUPPO CONTROLLO VUOTO CON VUOTOMETRO - ENTRATA SX PIANO: 1; REPARTO: DEGENZE A; STANZA: CORRIDOIO;',
  '132237 - AMBRA - ALLARME MOD. SDAL-MED V4 STATO VALVOLE NAMUR DI AREA PIANO: 1; REPARTO: DEGENZE A; STANZA: CORRIDOIO;',
  '106345 - PRESA CORTA UNI 9507 PER OSSIGENO PIANO: 1; REPARTO: PRONTO SOCCORSO; STANZA: BOX 1;',
  '106347 - PRESA CORTA UNI 9507 PER VUOTO PIANO: 1; REPARTO: PRONTO SOCCORSO; STANZA: BOX 1;',
];
function caricaEsempioGuida() {
  if (exportCorrente) return;   // con un file vero la guida si spiega su quello
  const righe = ESEMPIO_GUIDA.map((t, i) => interpretaRiga(t, i + 3, '')).filter(Boolean);
  exportCorrente = { cliente: 'ESEMPIO DELLA GUIDA', righe, righeNonInterpretate: [], righeDati: righe.length, percorso: 'esempio-guida.xls' };
  nomeFileCaricato = 'esempio-guida.xls';
  esempioGuida = true;
  $('#empty-state').hidden = true;
  $('#viste').hidden = false;
  $('#dropFile').hidden = false;
  ricostruisci({ nuovoExport: true });
}
function syncTutorialBtn() {
  $('#startTutorial').textContent = TOUR.vista() ? 'Rivedi il tutorial' : 'Avvia il tutorial';
}
const TOUR = window.Tour.crea({
  chiave: 'cs.registro.tourSeen', autoAvvio: true,
  primaDi: caricaEsempioGuida,
  dopo: () => { if (esempioGuida) togliFile(); syncTutorialBtn(); },
  passi: [
    { sel: null, title: 'Benvenuto: cosa fa questa pagina',
      tx: '<p>Trasforma l\u2019export del gestionale nel <b>Registro dei componenti</b>: il libretto A4 per il CLIENTE con copertina, sommario, quadro d\u2019insieme, una sezione per piano e la legenda.</p>' +
          '<p>Tutto avviene nel browser; il PDF finisce nel tracker, sul sito collegato, <b>senza mettere spunte</b>: e\u2019 un documento per il cliente, non un passo della mappatura.</p>' +
          '<p><b>Avanti</b> per proseguire, <b>Esc</b> per chiudere.</p>',
      note: 'Senza un file caricato la guida ne carica uno <b>d\u2019esempio</b>: dodici componenti su due piani. Alla fine si toglie da s\u00e9.' },
    { sel: '#ponteGrp', title: 'Collegamento al tracker', place: 'right',
      tx: '<p>A quale <b>sito</b> del tracker appartiene il registro. Arrivando dal cassetto del sito e\u2019 gi\u00e0 scelto; altrimenti lo si riconosce dal nome del file, e se non basta si sceglie dalla lista o si cerca qui.</p>' +
          '<p><b>cambia sito</b> lo stacca; la riga sotto dice com\u2019e\u2019 andata (riconosciuto, scelto a mano, dubbio).</p>' },
    { sel: '#fileGrp', title: '1 \u00b7 Export del gestionale', place: 'right',
      tx: '<p>Trascina qui l\u2019export <b>.xls</b> del gestionale, o clicca per sceglierlo. Sotto compaiono i conteggi: righe, componenti, tipi, piani, reparti, stanze.</p>',
      note: 'Righe scritte cos\u00ec: <b>codice - descrizione PIANO: \u2026; REPARTO: \u2026; STANZA: \u2026;</b> Le altre finiscono fra le anomalie e non entrano nel documento.' },
    { sel: '#docGrp', title: '2 \u00b7 Documento', place: 'right',
      tx: '<p>L\u2019<b>intestatario</b> viene dal sito collegato (o dalla cella A1 dell\u2019export). Il <b>corpo del testo</b> cambia quante righe stanno in una pagina.</p>' +
          '<p>La <b>versione digitale HTML</b> e\u2019 un file solo, con ricerca e indice: si apre col doppio clic anche senza rete.</p>' },
    { sel: '#checkGrp', title: '3 \u00b7 Controlli e anomalie', place: 'right',
      tx: '<p>Uso interno: niente di questo entra nel documento. La <b>quadratura</b> (componenti nel documento = righe dati), la <b>copertura del dizionario</b>, e le anomalie sui luoghi: reparti scritti in due modi, stanze quasi uguali, piani non numerici.</p>' +
          '<p>I due bottoni scaricano anomalie (.txt) e dati (.json).</p>' },
    { sel: '#exportGrp', title: 'Esporta e salva', place: 'right',
      tx: '<p>Produce il PDF, lo <b>scarica</b> sul computer e lo <b>archivia nel tracker</b> sul sito collegato. Nessuna spunta: nel cassetto del sito compare fra i registri, con la miniatura.</p>' +
          '<p>Sotto, lo <b>zoom</b> dell\u2019anteprima; il valore al centro la adatta alla colonna.</p>' },
    { sel: '#treecol', title: '4 \u00b7 Cosa entra nel registro', place: 'left',
      tx: '<p>L\u2019albero <b>piano \u203a reparto \u203a stanza</b>. Il <b>cerchio</b> include o esclude il ramo (pieno, vuoto, trattino = in parte); il <b>nome</b> porta l\u2019anteprima a quella pagina.</p>' +
          '<p>Una stanza esclusa sparisce dal documento, dal quadro e dai conteggi; le righe dati scendono dello stesso numero, cos\u00ec la quadratura resta onesta.</p>',
      off: 'La colonna compare a destra quando c\u2019e\u2019 un file caricato.' },
    { sel: '#viste', title: 'Le due viste', place: 'below',
      tx: '<p><b>Anteprima</b>: le pagine A4 vere, come usciranno. <b>Nomi dei componenti</b>: il dizionario condiviso con cui il codice del gestionale diventa un nome leggibile per il cliente.</p>',
      off: 'Le due linguette compaiono sopra l\u2019anteprima a file caricato.' },
    { sel: '#tabNomi', title: 'Nomi dei componenti', place: 'below',
      tx: '<p>Il nome che il cliente legge. Si scrive e si preme <b>Invio</b>: il dizionario si salva subito ed e\u2019 lo stesso per tutti i colleghi. <b>Ordine nel quadro</b> (1\u201310) decide chi compare per primo nel quadro d\u2019insieme.</p>' +
          '<p>Mentre si lavora qui il documento non si rifa\u2019 a ogni nome: si aggiorna quando si torna all\u2019anteprima.</p>',
      off: 'La linguetta compare a file caricato.' },
    { sel: ['#zoomwrap', '#empty-state'], title: 'L\u2019anteprima e\u2019 il documento', place: 'left',
      tx: '<p>Ogni foglio e\u2019 una pagina A4 vera, impaginata qui: una stanza non si spezza mai fra due pagine, il sommario ha i numeri di pagina giusti. Quello che vedi e\u2019 quello che esce.</p>' },
    { sel: '.bb-riga', title: 'I comandi dell\u2019applicazione', place: 'below',
      tx: '<p><b>Tracker</b> torna a Crono Mappature; il <b>punto di domanda</b> riapre questa guida; le <b>due frecce</b> chiudono o aprono tutti i gruppi del pannello (il titolo di ogni gruppo lo fa da solo); poi giorno e notte.</p>' },
    { sel: '#tourBtn', title: 'La guida resta a portata di mano', place: 'below',
      tx: '<p>Questo tastino riapre la guida quando serve, dal passo uno.</p><p>\u00c8 tutto: buon lavoro.</p>' },
  ],
});
$('#tourBtn').onclick = () => TOUR.avvia();
$('#startTutorial').onclick = () => TOUR.avvia();
syncTutorialBtn();
