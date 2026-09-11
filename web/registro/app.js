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
import { leggiExport, costruisciRegistro, testoAnomalie, registroInDict, ErroreLettura } from './registro.js';
import { impagina, htmlDigitale } from './impagina.js';

const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/* --------------------------------------------------------------- lo stato -- */
let exportCorrente = null;    // l'uscita di leggiExport
let reg = null;               // il registro costruito
let nomeFileCaricato = '';
let titoloSito = '';          // il nome del sito collegato nel tracker, se c'e'
let voci = [];                // /api/dizionario: [{codice, nome, descrizione, priorita}]
let dizPronto = null;         // promessa del primo caricamento

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
 *  nomi: durante il lavoro NON si tocca, altrimenti la riga scappa da sotto le
 *  dita (e' la regola scritta nel README della mappatura). */
function ricostruisci({ nuovoExport = false } = {}) {
  if (!exportCorrente) return;
  reg = costruisciRegistro(exportCorrente, { dizionario: diz, priorita: pri });
  const esito = impagina(reg, {
    contenitore: $('#pages'), corpo: Number($('#corpo').value) || 10.5,
    titolo: titoloDocumento(), logo: '/assets/logo.webp',
  });
  $('#contaPagine').textContent = esito.pagine + ' pag.';
  $('#contaNomi').textContent = reg.legenda.length;
  console.info(`[registro] ${reg.cliente}: ${esito.pagine} pagine in ${esito.ms} ms`);
  disegnaControlli();
  if (nuovoExport) disegnaNomi();
  aggiornaConti();
  $('#print').disabled = false;
  $('#scaricaAnomalie').disabled = $('#scaricaDati').disabled = false;
  adattaZoom();
  ponte?.ridisegna();
  return esito;
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
  ponte.riconosci(nomeFileCaricato, exportCorrente.cliente);
}

function togliFile() {
  exportCorrente = null; reg = null; nomeFileCaricato = '';
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
  for (const v of reg.legenda) {
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
    stato.textContent = 'Salvato · aggiorno il documento…';
    await rigenera();
    stato.textContent = 'Salvato.';
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
  if (ant) adattaZoom();
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
