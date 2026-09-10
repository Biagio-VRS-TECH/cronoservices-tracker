/* app.js - guscio dell'applicazione: avvio, viste, filtri, tema, tastiera,
   identita' operatore, azioni di massa, stato del collegamento.  #ANCHOR: app */
import {
  $, $$, h, ICO, avviso, modale, menu, copia, quando, esc, tinta, iniziali,
} from './ui.js';
import {
  rete, bootstrap, onCambio, setOperatore, apriStream, avviaPresenza, chiama, svuota,
  avviaSessione, esportaCsv, inNuvola, esci, emailSessione, fuocoMioAttuale,
} from './api.js';
import {
  st, on, applica, cambiaAnno, elencoProv, riepilogoAnno, contaStato, filtraStato,
  esitoConferma, esitoConflitto, esitoFallita, eventoRemoto, spuntaMolte, annullaUltima,
  caricaFiltri, salvaFiltri, componiDove, spezzaDove, aggiornaPresenze,
  CAMPI, PASSI, ETICHETTA, CLASSE_ET, ET_STATO,
  sonoAdmin, possoApprovare, ruoloMio, ruoloDi, ETICHETTA_RUOLO,
  proposte, ripristina, ripristinabile, bloccoDi, etichettaBlocco,
  descriviEvento, spunta, BREVE,
} from './stato.js';
import * as vAnno from './anno.js';
import * as vMese from './mese.js';
import * as vStat from './stat.js';
import { chiudiPop, rinfrescaPop } from './spunte.js';
import { chiudiCassetto } from './cassetto.js';
import {
  eventoDocumento, eventoDocumentiEliminati, ricaricaDocumenti, ascoltaAltreSchede,
  collegaChip, rinfrescaChip, urlGeneratore, ICO_PDF,
  riepilogoDocumenti, eliminaDocumenti, dimensione,
} from './documenti.js';
import { doppioni } from './affinita.js';
import { apriCassetto } from './cassetto.js';

const area = $('#area');

/* ------------------------------------------------------------- avvio ----- */
/* La chiamata sta in fondo al file: le costanti dichiarate con const piu' sotto
   (es. FILTRI) non esistono ancora mentre il modulo viene valutato. */

async function avvia() {
  temaIniziale();
  caricaFiltri();
  icone();
  collegaTesta();

  // Online si entra prima di leggere qualsiasi cosa: senza sessione il database
  // non risponde. In locale non fa niente e l'avvio resta quello di sempre.
  await avviaSessione();

  let r;
  try {
    r = await bootstrap();
  } catch (e) {
    area.innerHTML = inNuvola()
      ? `<div class="vuoto"><b>Database non raggiungibile</b>
         ${esc(String(e?.message || ''))}<br>Controlla il collegamento a internet e ricarica
         la pagina.</div>`
      : `<div class="vuoto"><b>Server non raggiungibile</b>
         Avvia <code>avvia.bat</code> sul PC che ospita l'applicazione, poi ricarica
         questa pagina.</div>`;
    statoCollegamento();
    return;
  }
  applica(r.dati);
  if (r.daCache) {
    avviso('Server non raggiungibile: stai lavorando sui dati salvati su questo ' +
      'computer. Le spunte restano in coda e partono da sole al ritorno.',
      { durata: 10000, tono: 'allerta' });
  }

  riflettiFiltri();
  riempiFiltri();
  if (!rete.operatore) chiediNome(); else disegnaIo();
  bottoneEsci();
  disegna();
  statoCollegamento();

  apriStream(eventoRemoto);
  /* "dove sono" porta anche la cella che ho aperta adesso, cosi' i colleghi la
     vedono col mio colore (#ANCHOR: fuoco in stato.js) */
  avviaPresenza(
    () => componiDove(st.anno + '-' + String(st.mese).padStart(2, '0'), fuocoMioAttuale()),
    d => aggiornaPresenze(d.online));

  onCambio((_, ev) => {
    statoCollegamento();
    if (ev?.confermata) esitoConferma(ev.confermata.op, ev.confermata.risposta);
    if (ev?.conflitto) esitoConflitto(ev.conflitto.op, ev.conflitto.server);
    if (ev?.fallita) esitoFallita(ev.fallita.op, ev.fallita.server);
  });

  on('cella', d => {
    rinfrescaPop(d.id, d.mese);   // il popover aperto su quella cella
    if (st.vista === 'anno') vAnno.aggiornaCella(d.id, d.mese, d.remoto);
    /* nel foglio del Mese la scheda di QUESTO mese puo' cambiare anche per una
       spunta messa in un altro mese dello stesso sito: i passi si ereditano */
    else if (st.vista === 'mese') vMese.aggiornaCella(d.id, st.mese);
    else if (st.vista === 'stat') vStat.aggiorna();
    aggiornaTestaPresto();
    aggiornaApprova();
  });
  /* un admin ha nominato o declassato qualcuno: la pillola, il menu Azioni e
     la coda delle approvazioni cambiano faccia (#ANCHOR: ruoli) */
  on('ruoli', () => { disegnaIo(); aggiornaApprova(); });
  on('fuoco', d => {
    if (st.vista === 'anno') vAnno.aggiornaFuoco(d.prima, d.dopo);
    else if (st.vista === 'mese') vMese.aggiornaFuoco(d.prima, d.dopo);
  });
  on('rilegge', d => {
    disegna();
    if (d?.remoto) avviso(`${d.remoto} ha aggiornato più mappature.`);
  });
  on('presenze', statoCollegamento);
  /* I PDF delle schede tecnici: arrivano dal flusso (o da un'altra scheda del
     browser) e toccano solo l'icona accanto al nome del sito. */
  on('documento-remoto', eventoDocumento);
  on('documenti-remoti', eventoDocumentiEliminati);
  on('documenti', d => d?.id ? rinfrescaChip(area, d.id) : disegna());
  collegaChip();
  ascoltaAltreSchede();
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') ricaricaDocumenti();
  });
  on('sync-fatto', rs => {
    avviso(riassuntoSync(rs) + ' Ricarico i dati.', { tono: 'ok' });
    cambiaAnno(st.anno).then(() => { riempiFiltri(); disegna(); });
  });

  tastiera();
  setInterval(statoCollegamento, 10000);
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => { });
}

/* ------------------------------------------------------------- disegno --- */
function disegna() {
  chiudiPop();
  aggiornaApprova();
  vMese.pulisci();
  vStat.pulisci();
  if (st.vista === 'mese') vMese.disegna(area);
  else if (st.vista === 'stat') vStat.disegna(area);
  else vAnno.disegna(area);
  $$('#viste button').forEach(b =>
    b.setAttribute('aria-pressed', String(b.dataset.vista === st.vista)));
  aggiornaTesta();
}

/** Il riepilogo costa un giro su tutti i siti filtrati: durante una raffica di
 *  spunte (o una spunta tenuta premuta) si accumulano le richieste e se ne fa
 *  UNA per frame. Senza questo ogni clic pagava il conteggio intero e la
 *  griglia diventava appiccicosa. */
let testaInCoda = false;
function aggiornaTestaPresto() {
  if (testaInCoda) return;
  testaInCoda = true;
  requestAnimationFrame(() => { testaInCoda = false; aggiornaTesta(); });
}

/** Il riepilogo appartiene alla vista Anno. Cambiando vista va SVUOTATO, non
 *  solo nascosto: lasciarlo pieno mostrava numeri che non c'entravano nulla. */
function aggiornaTesta() {
  $('#anno').textContent = st.anno;
  const r = riepilogoAnno();
  aggiornaFilo(r);
  aggiornaFiltroStato();
  const box = $('#riepilogo');
  if (st.vista !== 'anno') { box.innerHTML = ''; box.hidden = true; return; }
  box.hidden = false;
  /* Con `stato` la voce diventa un bottone: il numero E' il filtro. E' il modo
     piu' corto per chiedere "fammi vedere quelle" - un clic su "17/267
     complete" lascia a schermo le complete, un altro clic le rimette tutte.
     I numeri restano quelli dell'anno intero anche a filtro acceso
     (riepilogoAnno ignora il filtro di stato), altrimenti dopo il primo clic
     direbbero "17/17" e non si tornerebbe indietro. */
  const voce = (n, et, stile, tit, stato) => {
    const attiva = stato && st.filtri.stato === stato;
    const t = stato ? 'button' : 'div';
    return `<${t} class="voce${stato ? ' scelta' : ''}${attiva ? ' attiva' : ''}"` +
      (stato ? ` data-stato="${stato}" aria-pressed="${attiva}"` : '') +
      (tit ? ` title="${esc(tit)}"` : '') + '>' +
      `<span class="n"${stile ? ` style="${stile}"` : ''}>${n}</span>` +
      `<span class="et">${et}</span></${t}>`;
  };
  // Tre numeri grandi (il lavoro) + una riga piccola di contesto (che tipo di
  // mesi ci sono in questo anno): sei numeri grandi erano illeggibili.
  const ctx = [
    r.stime && `<b>${r.stime}</b> ${r.stime === 1 ? 'stima' : 'stime'}`,
    r.daRinnovare && `<b>${r.daRinnovare}</b> da rinnovare`,
    r.preTrac && `<b>${r.preTrac}</b> pre-tracciamento`,
  ].filter(Boolean).join(' · ');
  box.innerHTML =
    voce(r.clienti, 'clienti', '',
      `${r.clienti} clienti, ${r.aperti} siti aperti`) +
    voce(r.aperti, 'siti', '',
      'Impianti aperti: uno per mappatura annuale') +
    voce(`${r.complete}/${r.mappature}`, 'complete', '',
      'Mappature complete su quelle dovute quest\'anno. Una mappatura per SITO ' +
      'per anno: conta quella, non i mesi di visita. Clicca per vedere solo ' +
      'le complete', 'complete') +
    voce(r.ritardo, 'in ritardo', r.ritardo ? 'color:var(--allerta)' : '',
      'Mappature con la scadenza (primo mese di manutenzione del sito) ' +
      'gia\' passata e non chiuse in nessun mese. Clicca per vedere solo ' +
      'quelle', 'ritardo') +
    (ctx ? `<div class="contesto" title="Mesi che non entrano nei totali: proiezioni oltre la scadenza del contratto, contratti da rinnovare, mesi prima dell'inizio del tracciamento">${ctx}</div>` : '');
}

/** La linea di stato saldata sotto la barra strumenti: quante delle mappature
 *  dovute dell'anno filtrato sono chiuse. E' l'unico numero che vale in tutte e
 *  tre le viste, quindi sta fuori dal riepilogo (che appartiene alla vista
 *  Anno) e resta sempre a schermo. Se non c'e' niente da fare sparisce: una
 *  barra vuota che non puo' riempirsi non e' un'informazione. */
function aggiornaFilo(r) {
  const filo = $('#filo');
  const p = r.mappature ? Math.round(r.complete / r.mappature * 100) : 0;
  filo.hidden = !r.mappature;
  filo.style.setProperty('--w', p + '%');
  filo.setAttribute('aria-valuenow', String(p));
  filo.setAttribute('aria-valuetext',
    `${r.complete} mappature complete su ${r.mappature} dovute nel ${st.anno}`);
  filo.title = `${st.anno}: ${r.complete} mappature complete su ${r.mappature} ` +
    `dovute · ${p}%` + (r.ritardo ? ` · ${r.ritardo} in ritardo` : '');
}

/** I quattro bottoni del filtro di stato, coi numeri dentro. I numeri arrivano
 *  da `contaStato()`, che guarda l'insieme SENZA il filtro di stato: sono la
 *  fotografia di quello che c'e', non della selezione, e restano il bottone per
 *  cambiare idea. Cambiano con la vista, perche' nella vista Mese la domanda e'
 *  su quel mese soltanto. */
function aggiornaFiltroStato() {
  const c = contaStato();
  const n = { '': c.tutte, incomplete: c.incomplete, ritardo: c.ritardo, complete: c.complete };
  for (const b of $('#f-stato').children) {
    const v = b.dataset.stato;
    b.setAttribute('aria-pressed', String(st.filtri.stato === v));
    b.querySelector('.n').textContent = n[v] ?? '';
  }
}

/* --------------------------------------------------------------- testa --- */
function icone() {
  $('#anno-giu').innerHTML = ICO.sx;
  $('#anno-su').innerHTML = ICO.dx;
  $('#cerca-ico').innerHTML = ICO.cerca;
  $('#tema').innerHTML = ICO.tema;
  $('#schede').innerHTML = ICO_PDF + ' Schede tecnici';
}

function collegaTesta() {
  // Il passo si conta dall'obiettivo, non dall'anno gia' caricato: altrimenti
  // tre clic rapidi indietro finivano tutti sullo stesso anno.
  $('#anno-giu').onclick = () => vaiAnno(annoMirato() - 1);
  $('#anno-su').onclick = () => vaiAnno(annoMirato() + 1);
  $('#oggi').onclick = vaiOggi;
  $('#tema').onclick = giraTema;
  $('#io').onclick = mostraChiSono;
  $('#aiuto').onclick = mostraAiuto;
  $('#schede').onclick = () => open(urlGeneratore(null), '_blank');
  $('#azioni').onclick = e => apriAzioni(e.currentTarget);
  $('#approva').onclick = mostraApprovazioni;
  $('#collegamento').onclick = pannelloCollegamento;

  const q = $('#q');
  q.oninput = () => {
    st.filtri.q = q.value;
    $('#cerca-x').hidden = !q.value;
    ridisegnaFiltrato();
  };
  $('#cerca-x').onclick = () => {
    q.value = ''; st.filtri.q = ''; $('#cerca-x').hidden = true;
    q.focus(); ridisegnaFiltrato();
  };

  $('#f-stato').onclick = e => {
    const b = e.target.closest('[data-stato]');
    if (b) filtraStato(b.dataset.stato);
  };
  // I numeri del riepilogo sono lo stesso filtro: il secondo clic lo toglie.
  $('#riepilogo').onclick = e => {
    const v = e.target.closest('[data-stato]');
    if (v) filtraStato(v.dataset.stato, true);
  };
  $('#f-prov').onchange = e => { st.filtri.prov = e.target.value; salvaFiltri(); ridisegnaFiltrato(); };
  for (const [id, chiave] of FILTRI) {
    $('#' + id).onclick = e => {
      st.filtri[chiave] = !st.filtri[chiave];
      e.currentTarget.setAttribute('aria-pressed', String(st.filtri[chiave]));
      salvaFiltri();
      ridisegnaFiltrato();
    };
  }
  $('#viste').onclick = e => {
    const v = e.target.closest('[data-vista]')?.dataset.vista;
    if (!v || v === st.vista) return;
    st.vista = v; chiudiCassetto(); disegna();
  };
}

/* "Mostra stime" e' stato tolto alla 7a sessione su richiesta del committente:
   era acceso per default e nessuno lo spegneva. Le stime si vedono sempre.
   "Solo incomplete" e "Solo in ritardo" sono diventate due delle quattro
   posizioni del filtro di stato (15a sessione), che non e' una pillola. */
const FILTRI = [['f-chiusi', 'mostraChiusi']];

function riflettiFiltri() {
  $('#q').value = st.filtri.q || '';
  $('#cerca-x').hidden = !st.filtri.q;
  for (const [id, chiave] of FILTRI) {
    $('#' + id).setAttribute('aria-pressed', String(!!st.filtri[chiave]));
  }
  for (const b of $('#f-stato').children) {
    b.setAttribute('aria-pressed', String(st.filtri.stato === b.dataset.stato));
  }
}

function ridisegnaFiltrato() {
  clearTimeout(ridisegnaFiltrato.t);
  ridisegnaFiltrato.t = setTimeout(disegna, 130);
}

/* Il filtro per tipo di gas e' stato tolto alla 15a sessione: era una tendina
   in piu' su tre valori che nessuno restringeva, e il tipo si trova comunque
   scrivendolo nella barra di ricerca (entra nel "fieno" di `passa`). */
function riempiFiltri() {
  const opz = (v, et) => `<option value="${esc(v)}">${esc(et)}</option>`;
  $('#f-prov').innerHTML = opz('', 'Tutte le province') + elencoProv().map(p => opz(p, p)).join('');
  $('#f-prov').value = st.filtri.prov;
}

/* ------------------------------------------------------------ anni ------- */
/* Un clic sulla freccia mentre l'anno precedente e' ancora in caricamento
   perdeva il secondo clic: si tiene un obiettivo e si serializza. */
let annoInCorso = false, annoObiettivo = null;
const annoMirato = () => annoObiettivo ?? st.anno;

async function vaiAnno(a) {
  if (!a || a < 2000 || a > 2100) return;
  annoObiettivo = a;
  $('#anno').textContent = a;
  if (annoInCorso) return;
  annoInCorso = true;
  // NON si disabilitano le frecce: disabilitarle mangiava i clic successivi e
  // sembrava che non funzionassero. Si accumula l'obiettivo e si salta all'ultimo.
  $('#anno').classList.add('caricando');
  try {
    while (annoObiettivo !== null && annoObiettivo !== st.anno) {
      const target = annoObiettivo;
      await cambiaAnno(target);
      if (annoObiettivo === target) annoObiettivo = null;
    }
    disegna();
  } catch {
    $('#anno').textContent = st.anno;
    avviso('Cambio anno non disponibile senza collegamento al server.', { tono: 'allerta' });
  } finally {
    annoInCorso = false;
    $('#anno').classList.remove('caricando');
  }
}

async function vaiOggi() {
  st.mese = st.meseOggi;
  if (st.anno !== st.annoOggi) await vaiAnno(st.annoOggi);
  else disegna();
  if (st.vista === 'anno') {
    $('.crono-testa .m.oggi')?.scrollIntoView({ block: 'nearest', inline: 'center' });
  }
}

/* ------------------------------------------------------- azioni di massa - */
function apriAzioni(bottone) {
  const inAnno = st.vista === 'anno';
  const soloAnno = () => avviso('Le azioni di massa si usano dalla vista Anno.');
  /* Le voci dell'amministratore (#ANCHOR: ruoli) a un operatore non compaiono:
     completare/azzerare tutto, rileggere Access, le impostazioni. Il server le
     rifiuta comunque (403), qui si evita di mostrare porte chiuse. */
  const admin = sonoAdmin();
  menu(bottone, [
    ...(admin ? [
      {
        et: 'Completa tutte le spunte', ico: ICO.ok,
        nota: inAnno ? 'anno filtrato' : 'vista Anno',
        fn: () => inAnno ? massa('completa') : soloAnno(),
      },
      {
        et: 'Azzera tutte le spunte', ico: ICO.ics, tono: 'pericolo',
        nota: inAnno ? 'anno filtrato' : 'vista Anno',
        fn: () => inAnno ? massa('azzera') : soloAnno(),
      },
      null,
    ] : []),
    { et: 'Stampa il foglio del mese', ico: ICO.stampa, fn: stampa },
    { et: 'Scarica CSV', ico: ICO.giu, fn: scaricaCsv },
    null,
    { et: 'Diario attività', ico: ICO.gente, nota: 'chi ha fatto cosa', fn: mostraDiario },
    { et: 'Possibili doppioni', ico: ICO.cerca, nota: 'nomi che si somigliano', fn: mostraDoppioni },
    ...(admin ? [
      null,
      { et: 'Sincronizza da Access', ico: ICO.sync, fn: sincronizza },
      { et: 'Impostazioni', nota: 'tracciamento, ruoli', fn: mostraImpostazioni },
    ] : []),
  ]);
}

/* ------------------------------------------------------- approvazioni ---- */
/* #ANCHOR: approvazioni. Rapportino e ricambi spuntati da un operatore arrivano
   qui come proposte: chi approva - amministratore o APPROVATORE - le approva o
   le respinge. La pillola in barra c'e' solo per loro e solo se c'e' qualcosa
   in attesa. L'approvatore finisce qui e basta: le azioni di massa, il sync,
   le impostazioni e i ripristini restano dell'amministratore. */
function aggiornaApprova() {
  const b = $('#approva');
  if (!b) return;
  const n = possoApprovare() ? proposte().length : 0;
  b.hidden = n === 0;
  b.textContent = n === 1 ? '1 da approvare' : `${n} da approvare`;
  b.title = 'Spunte proposte dagli operatori, in attesa della tua approvazione';
}

function mostraApprovazioni() {
  if (!possoApprovare()) return;
  modale(chiudi => {
    const corpo = h('div');
    const testa = h('div', { style: 'display:flex;gap:8px;justify-content:space-between;align-items:center;margin:0 0 10px' });
    const ridisegna = () => {
      const lista = proposte();
      testa.replaceChildren(
        h('p.nota-t', { style: 'margin:0', testo: lista.length
          ? `${lista.length} ${lista.length === 1 ? 'spunta proposta' : 'spunte proposte'} nell\u2019anno ${st.anno}.`
          : `Niente in attesa nell\u2019anno ${st.anno}.` }),
        ...(lista.length > 1 ? [h('button.pill', {
          testo: `Approva tutte (${lista.length})`,
          onclick: () => {
            spuntaMolte(lista.map(v => ({ ...v, valore: 1 })), 'Approvazione di tutte le proposte', 'approvazione');
            avviso(`${lista.length} spunte approvate.`, { tono: 'ok', durata: 15000, azione: {
              et: 'Annulla', fn: () => { const m = annullaUltima(); disegna(); avviso(`Annullato: ${m} spunte di nuovo in attesa.`); } } });
            ridisegna();
          },
        })] : []));
      corpo.replaceChildren(...(lista.length ? [h('ul.elenco-diario', {}, lista.map(v => {
        const s = st.perServ.get(v.id), cli = s ? st.clienti.get(s.cli) : null;
        return h('li', {},
          h('time.dato', { testo: v.at ? quando(v.at) : '' }),
          h('span.d-txt', {},
            h('b', { testo: v.by || '\u2014' }),
            h('span', { testo: ` \u00b7 ${st.mesi[v.mese - 1]} \u00b7 ${BREVE[v.campo]}` }),
            h('button.d-chi.nudo', {
              testo: (cli?.rs || '') + (s?.dest ? ' \u2013 ' + s.dest : '') || `#${v.id}`,
              title: 'Apri il sito', onclick: () => { chiudi(); apriCassetto(v.id); },
            })),
          h('span.azioni-riga', {},
            h('button.pill.mini', { testo: 'Approva', onclick: () => { spunta(v.id, v.mese, v.campo, 1, false, 'approvazione'); ridisegna(); } }),
            h('button.pill.mini.debole', { testo: 'Respingi', title: 'Torna "da fare": l\u2019operatore lo vede',
              onclick: () => { spunta(v.id, v.mese, v.campo, 0, false, 'respinta'); ridisegna(); } })));
      }))] : []));
      if (!lista.length) aggiornaApprova();
    };
    ridisegna();
    return [
      h('h2', { testo: 'Da approvare' }),
      h('p.sotto', { testo: 'Gli operatori spuntano "Rapportino" e "Ricambi", ma quelle due spunte valgono ' +
        'solo dopo il tuo via. Approvare le rende fatte; respingere le rimette da fare. ' +
        'Ogni mossa resta nel diario col tuo nome.' }),
      testa, corpo,
      h('div', { style: 'display:flex;justify-content:flex-end;margin-top:18px' },
        h('button.bottone', { testo: 'Chiudi', onclick: chiudi })),
    ];
  });
}

const ET_FILTRO = {
  incomplete: 'solo quelle da fare', ritardo: 'solo quelle in ritardo',
  complete: 'solo quelle complete',
};

function descrizioneFiltri() {
  const f = st.filtri, p = [];
  if (f.q) p.push(`ricerca "${f.q}"`);
  if (f.prov) p.push('provincia ' + f.prov);
  if (f.stato) p.push(ET_FILTRO[f.stato]);
  return p.length ? p.join(', ') : 'nessun filtro attivo, quindi tutto l\'anno';
}

/** Completa o azzera in blocco. Conferma con i numeri esatti, poi Annulla.
 *  #ANCHOR: massa */
function massa(modo) {
  const completa = modo === 'completa';
  modale(chiudi => {
    const conStime = h('input', { type: 'checkbox' });
    const riga = h('p', { style: 'margin:0 0 14px;font-size:var(--t-mini)' });
    const bottone = h('button.bottone', { testo: '…' });

    const ricalcola = () => {
      const voci = completa
        ? vAnno.passiMancanti(!conStime.checked)
        : vAnno.passiPresenti();
      const celle = new Set(voci.map(v => v.id + '-' + v.mese));
      const serv = new Set(voci.map(v => v.id));
      riga.innerHTML = voci.length
        ? `<b>${voci.length}</b> ${voci.length === 1 ? 'spunta' : 'spunte'} da ` +
        `${completa ? 'mettere' : 'togliere'}, su <b>${celle.size}</b> ` +
        `${celle.size === 1 ? 'mappatura' : 'mappature'} di <b>${serv.size}</b> service.`
        : `Non c'è niente da ${completa ? 'completare' : 'azzerare'} con questi filtri.`;
      bottone.textContent = voci.length
        ? (completa ? `Completa ${voci.length} spunte` : `Azzera ${voci.length} spunte`)
        : 'Chiudi';
      bottone.onclick = () => {
        chiudi();
        if (!voci.length) return;
        const n = spuntaMolte(voci, completa ? 'Completamento di massa' : 'Azzeramento di massa', 'massa');
        disegna();
        const uno = n === 1;
        const detto = completa ? (uno ? 'messa' : 'messe') : (uno ? 'rimossa' : 'rimosse');
        avviso(`${n} ${uno ? 'spunta' : 'spunte'} ${detto}.`, {
          tono: completa ? 'ok' : 'allerta', durata: 15000,
          azione: {
            et: 'Annulla', fn: () => {
              const m = annullaUltima();
              disegna();
              avviso(`Annullato: ${m} spunte riportate come prima.`);
            }
          },
        });
      };
    };
    conStime.onchange = ricalcola;

    const el = [
      h('h2', { testo: completa ? 'Completa tutte le spunte' : 'Azzera tutte le spunte' }),
      h('p.sotto', {
        testo: `Vale sull'anno ${st.anno} e su quello che stai vedendo ora — ` +
          descrizioneFiltri() + '. Per limitarla a un cliente, cercalo prima nella ' +
          'barra di ricerca e ripeti l\'azione.'
      }),
      riga,
      completa ? h('label.scelta-massa', {},
        conStime,
        h('span', {
          html: 'Comprendi anche le <b>visite</b> oltre il mese di scadenza, i mesi ' +
            '<b>non tracciati</b> (prima dell\'inizio del tracciamento) e le ' +
            '<b>stime</b> oltre la scadenza del contratto.'
        })) : null,
      h('p', {
        style: 'margin:0 0 16px;font-size:var(--t-micro);color:var(--tenue)',
        testo: 'Ogni modifica resta nel diario col tuo nome, e subito dopo hai il ' +
          'pulsante Annulla.'
      }),
      h('div', { style: 'display:flex;gap:8px;justify-content:flex-end' },
        h('button.bottone.piatto', { testo: 'Lascia stare', onclick: chiudi }),
        bottone),
    ];
    ricalcola();
    return el;
  });
}

function stampa() {
  if (st.vista !== 'mese') {
    st.vista = 'mese'; disegna();
    avviso('Passo alla vista Mese: è quella pensata per la stampa.');
  }
  $('.stampa-testa')?.removeAttribute('hidden');
  setTimeout(() => print(), 200);
}

function scaricaCsv() {
  const q = new URLSearchParams({ anno: st.anno });
  if (st.vista === 'mese') q.set('mese', st.mese);
  esportaCsv(q.toString());
}

/* ------------------------------------------------------------ operatore -- */
function disegnaIo() {
  $('#io').replaceChildren(
    h('span.pallino', {
      style: 'background:' + tinta(rete.operatore),
      testo: iniziali(rete.operatore),
    }),
    h('b', { testo: rete.operatore || 'Chi sei?' }),
    ...(ruoloMio() === 'tecnico' ? [] : [h('span.ruolo', {
      testo: ruoloMio() === 'admin' ? 'admin' : 'approva',
      title: ruoloMio() === 'admin'
        ? 'Amministratore: approvi rapportino e ricambi, azioni di massa, sync, ripristini'
        : 'Approvatore: approvi rapportino e ricambi. Le azioni di massa, il sync e i ripristini restano dell\u2019amministratore.',
    })]));
}

/* CHI SONO (#ANCHOR: ruoli). Il nome NON si cambia dall'app.
   Online e' ricavato dalla casella del login: cambiarlo non cambiava chi sei,
   ma spostava la riga in `operatori` - e con quella il ruolo. Bastava scrivere
   il nome di un collega per portargli via la riga e lasciare l'azienda senza
   amministratori. Era il difetto della 25a sessione; ora quel campo non c'e'
   piu' e la riga di un'altra casella il server non la tocca (imposta_operatore
   in cloud/03-letture.sql).
   Restano due cose: una scheda che dice chi sei e cosa puoi fare, e - solo al
   PRIMISSIMO avvio in locale, dove non c'e' nessun login - la domanda del nome. */
function mostraChiSono() {
  const r = ruoloMio();
  const cosaPuoi = {
    admin: 'Approvi "Rapportino" e "Ricambi", completi o azzeri in blocco, ' +
      'rileggi Access, cambi le impostazioni, ripristini dal diario e puoi ' +
      'buttare i PDF di un anno intero.',
    approvatore: 'Approvi "Rapportino" e "Ricambi": le proposte degli operatori le ' +
      'chiudi tu. Le azioni in blocco, la rilettura di Access, le impostazioni e ' +
      'i ripristini restano dell\u2019amministratore.',
    tecnico: 'Spunti tutto; "Rapportino" e "Ricambi" restano proposte finch\u00e9 non ' +
      'le approva un amministratore o un approvatore.',
  }[r];
  modale(chiudi => [
    h('h2', { testo: 'Chi sta lavorando' }),
    h('div', { style: 'display:flex;align-items:center;gap:10px;margin:6px 0 12px' },
      h('span.pallino', { style: 'background:' + tinta(rete.operatore),
                          testo: iniziali(rete.operatore) }),
      h('div', {},
        h('b', { testo: rete.operatore || '?' }),
        h('div.nota-t', { testo: emailSessione() || 'questo computer' }))),
    h('p.nota-t', { style: 'margin:0 0 6px',
      testo: 'Ruolo: ' + ETICHETTA_RUOLO[r] + '.' }),
    h('p.sotto', { testo: cosaPuoi }),
    h('p.sotto', { testo: inNuvola()
      ? 'Il nome viene dalla tua casella aziendale e firma ogni spunta: non si ' +
        'cambia da qui, perch\u00e9 \u00e8 anche quello che dice al server chi sei. ' +
        'Per cambiare ruolo serve un amministratore.'
      : 'Il nome resta su questo computer e firma ogni spunta: si scrive al ' +
        'primo avvio e dall\u2019applicazione non si cambia. Per cambiare ' +
        'ruolo serve un amministratore.' }),
    h('div', { style: 'display:flex;gap:8px;justify-content:flex-end;margin-top:14px' },
      h('button.bottone', { testo: 'Chiudi', onclick: chiudi })),
  ]);
}

/* Solo il primissimo avvio in locale: senza un nome non si firma niente. Dopo,
   il nome non si tocca piu'. Online non compare mai: lo da' il login. */
function chiediNome() {
  if (inNuvola()) { disegnaIo(); return; }
  modale(chiudi => {
    const input = h('input.campo', {
      placeholder: 'Nome e cognome', value: rete.operatore, maxlength: 40,
      onkeydown: e => { if (e.key === 'Enter') conferma(); },
    });
    const conferma = async () => {
      const nome = input.value.trim();
      if (!nome) return input.focus();
      setOperatore(nome);
      disegnaIo();
      statoCollegamento();
      chiudi();
      try {
        const { dati } = await chiama('/api/operatore', { metodo: 'POST', body: { nome } });
        st.operatori = dati.operatori;
        if (dati.ruoli) st.ruoli = dati.ruoli;
        if (dati.ruolo) st.ruolo = dati.ruolo;
        disegnaIo(); aggiornaApprova();
      } catch { }
    };
    return [
      h('h2', { testo: 'Chi sta lavorando?' }),
      h('p.sotto', {
        testo: 'Il nome resta su questo computer e firma ogni spunta, cos\u00ec si sa ' +
          'sempre chi ha fatto cosa quando siete in pi\u00f9 di uno. Si scrive una ' +
          'volta sola: dopo non si cambia pi\u00f9.'
      }),
      input,
      h('div', { style: 'display:flex;gap:8px;justify-content:flex-end;margin-top:8px' },
        h('button.bottone', { testo: 'Continua', onclick: conferma })),
    ];
  }, { chiudibile: false });
}

/* -------------------------------------------------- stato del collegamento */
/* #ANCHOR: stato-collegamento
   Tre informazioni in un solo posto, perche' con piu' operatori sono LA cosa da
   sapere: sei collegato, chi altro c'e', quello che hai spuntato e' arrivato. */
function statoCollegamento() {
  const n = rete.coda.length;
  const giu = !rete.online;
  $('#spia').className = 'spia ' + (giu ? 'giu' : n ? 'coda' : '');
  const altri = (st.online || []).filter(o => o.nome && o.nome !== rete.operatore);
  $('#presenze').replaceChildren(...altri.slice(0, 4).map(o =>
    h('span.pallino.piccolo', {
      style: 'background:' + tinta(o.nome), testo: iniziali(o.nome),
      title: o.nome + doveSta(o),
    })));
  $('#collegamento-et').textContent = giu
    ? (n ? `${n} in coda · offline` : 'offline')
    : n ? `${n} in invio` : (altri.length ? `${altri.length + 1} collegati` : 'collegato');
  $('#collegamento').title = giu
    ? `${DOVE_VIVE_MAI} non raggiungibile: le spunte restano in coda su questo computer`
    : `Chi è collegato, indirizzo dell\'applicazione, stato degli invii`;

  const banner = $('#banner');
  // Due archivi separati sono il guasto peggiore possibile: l'avviso viene
  // prima di tutto, anche dell'assenza di rete. Vedi #ANCHOR: scoperta.
  if (st.altriServer?.length) {
    banner.hidden = false;
    banner.className = 'banner grave';
    banner.innerHTML = `<b>Attenzione: in rete c'è più di un Crono Mappature.</b>
      <span>Anche su ${st.altriServer.map(x => esc(x.host)).join(', ')}. Se ne usate
      due, le spunte finiscono in due archivi separati e non si vedono a vicenda.
      Mettetevi d'accordo su uno solo:</span>
      ${st.altriServer.map(x => `<a href="${esc(x.url)}">${esc(x.url)}</a>`).join(' ')}`;
    return;
  }
  if (giu) {
    banner.hidden = false;
    banner.className = 'banner allerta';
    const inCoda = n === 1
      ? 'La tua spunta è al sicuro in coda su questo computer e riparte da sola appena torna.'
      : `Le tue ${n} spunte sono al sicuro in coda su questo computer e ripartono da sole appena torna.`;
    banner.innerHTML = `<b>${DOVE_VIVE_MAI} non raggiungibile.</b> <span>${n ? inCoda
      : 'Puoi continuare a spuntare: tutto resta in coda su questo computer.'
      }</span><button id="banner-riprova">Riprova ora</button>`;
    $('#banner-riprova').onclick = () => { svuota(); statoCollegamento(); };
  } else {
    banner.hidden = true;
    banner.innerHTML = '';
  }
}

/** "sta guardando settembre 2026 · ha aperto #123 (Set)": dal `dove` della
 *  presenza, che porta anche la cella aperta (#ANCHOR: fuoco). */
function doveSta(o) {
  const { dove, cella } = spezzaDove(o.dove);
  let t = '';
  if (dove) {
    const [a, m] = dove.split('-').map(Number);
    t += ' · sta guardando ' + (m ? `${(st.mesiNome[m - 1] || '').toLowerCase()} ${a}` : dove);
  }
  if (cella) {
    const [id, m] = cella.split('-').map(Number);
    const s = st.perServ.get(id);
    t += ` · ha aperto ${s?.dest || '#' + id} (${st.mesi[m - 1] || m})`;
  }
  return t;
}

/* ------------------------------------------------------------- uscita ---- */
/* Solo online: in locale non c'e' nessun login da cui uscire. Il tastino sta
   accanto al segnale "collegato", e chiede conferma perche' dopo si torna alla
   maschera d'accesso. */
function bottoneEsci() {
  const b = $('#esci');
  if (!b) return;
  if (!inNuvola()) { b.hidden = true; return; }
  b.hidden = false;
  b.innerHTML = ICO.esci;
  b.onclick = confermaUscita;
}
function confermaUscita() {
  modale(chiudi => [
    h('h2', { testo: 'Uscire?' }),
    h('p.sotto', { testo: `Sei dentro come ${emailSessione() || rete.operatore || '?'}. ` +
      'Uscendo torni alla maschera di accesso; le spunte gi\u00e0 confermate restano online.' }),
    rete.coda.length
      ? h('p.nota-t', { testo: `Attenzione: ${rete.coda.length} spunte sono ancora in coda su questo computer e ` +
          'partiranno al prossimo accesso.' })
      : null,
    h('div', { style: 'display:flex;gap:8px;justify-content:flex-end;margin-top:8px' },
      h('button.pill', { testo: 'Resta', onclick: chiudi }),
      h('button.bottone', { testo: 'Esci', onclick: () => esci() })),
  ]);
}

/* Come si chiama, per chi legge, il posto dove le spunte vanno a finire. In
   locale e' un PC dell'ufficio che fa da server e i colleghi lo aprono per
   indirizzo LAN; online e' un archivio su internet e nessuno tiene acceso
   niente. Una parola sola, decisa all'avvio, usata dovunque si parli del
   collegamento. */
const DOVE_VIVE = inNuvola() ? 'l’archivio online' : 'il server';
const DOVE_VIVE_MAI = inNuvola() ? 'Archivio online' : 'Server';
const DA_DOVE_VIVE = inNuvola() ? 'dall’archivio online' : 'dal server';

function pannelloCollegamento() {
  modale(chiudi => {
    // online l'indirizzo da passare ai colleghi e' quello del sito, non la LAN
    const lan = inNuvola() ? location.origin : (st.indirizzoLan || '');
    const tutti = (st.online || []).filter(o => o.nome);
    const box = h('div');
    chiama('/api/attivita?limit=12').then(({ dati }) => {
      box.replaceChildren(h('ul.storia', {}, (dati.attivita || []).length
        ? dati.attivita.map(e => h('li', {},
          h('time', { testo: quando(e.ts) }),
          h('span', {
            html: `<b>${esc(e.operatore)}</b> · ${esc(st.mesi[(e.mese || 1) - 1] || '')} · ` +
              descriviEvento(e) + ` · ${esc(e.rag_soc || '')}`
          })))
        : h('li', { testo: 'Nessuna modifica ancora.' })));
    }).catch(() => box.replaceChildren(h('p', {
      testo: 'Diario non disponibile senza collegamento.',
      style: 'color:var(--tenue);font-size:var(--t-mini)',
    })));

    return [
      h('h2', { testo: 'Lavorare in più persone' }),
      h('p.sotto', {
        testo: inNuvola()
          ? 'L’archivio sta online: entrate tutti dallo stesso indirizzo, da ' +
            'qualunque computer, e le spunte si vedono a vicenda in tempo reale.'
          : 'Un solo computer fa da server; gli altri lo aprono nel browser. ' +
            'Le spunte si vedono a vicenda in tempo reale.'
      }),

      h('h3.tit-p', { testo: 'Indirizzo da dare ai colleghi' }),
      lan
        ? h('div', { style: 'display:flex;gap:8px;align-items:center;margin-bottom:6px' },
          h('code.lan', { testo: lan }),
          h('button.pill', {
            html: ICO.copia + '<span>Copia</span>',
            onclick: async e => {
              const ok = await copia(lan);
              e.currentTarget.querySelector('span').textContent = ok ? 'Copiato' : 'Copia a mano';
            }
          }))
        : h('p.nota-t', { testo: `Indirizzo non disponibile: ${DOVE_VIVE} non risponde.` }),
      h('p.nota-t', {
        style: 'margin-bottom:18px',
        testo: inNuvola()
          ? 'Per entrare serve una casella @vrs-tech.it. Non c’è nessun computer ' +
            'da tenere acceso: i dati di Access salgono una volta al giorno dal PC ' +
            'dell’ufficio, le spunte nascono e restano online.'
          : 'Il computer che fa da server deve restare acceso. La prima volta ' +
            'Windows chiede di autorizzare Python sulla rete: rispondere Consenti ' +
            'sulle reti private.'
      }),

      h('h3.tit-p', { testo: 'Collegati ora' }),
      tutti.length
        ? h('ul.elenco-gente', {}, tutti.map(o =>
          h('li', {},
            h('span.pallino', { style: 'background:' + tinta(o.nome), testo: iniziali(o.nome) }),
            h('span', { html: `<b>${esc(o.nome)}</b>${o.nome === rete.operatore ? ' (tu)' : ''}${ruoloDi(o.nome) !== 'tecnico' ? ' · ' + ETICHETTA_RUOLO[ruoloDi(o.nome)] : ''}` }),
            h('span.nota-t', { testo: doveSta(o).replace(/^ · /, '') }))))
        : h('p.nota-t', { style: 'margin-bottom:18px', testo: 'Solo tu, per ora.' }),

      ...(inNuvola() ? [
        h('h3.tit-p', { testo: 'La tua sessione' }),
        h('div', { style: 'display:flex;gap:8px;align-items:center;margin-bottom:18px' },
          h('code.lan', { testo: emailSessione() || '?' }),
          h('button.pill', { html: ICO.esci + '<span>Esci</span>', onclick: () => { chiudi(); confermaUscita(); } })),
      ] : []),

      h('h3.tit-p', { testo: 'Le tue spunte' }),
      h('p', {
        style: 'margin:0 0 18px;font-size:var(--t-mini)',
        html: rete.coda.length
          ? `<b>${rete.coda.length}</b> in attesa di essere ` +
          `${rete.coda.length === 1 ? 'inviata' : 'inviate'}. ` +
          'Restano su questo computer anche se chiudi il browser.'
          : `Tutte inviate e confermate ${DA_DOVE_VIVE}.`
      }),

      h('h3.tit-p', { testo: 'Ultime modifiche di tutti' }),
      box,
      h('div', { style: 'display:flex;justify-content:flex-end;margin-top:18px' },
        h('button.bottone', { testo: 'Chiudi', onclick: chiudi })),
    ];
  });
}

/* ------------------------------------------------------------ sync ------- */
const riassuntoSync = r => `Access letto: ${r.services} service, ${r.clienti} clienti` +
  (r.nuovi ? `, ${r.nuovi} nuovi` : '') + (r.chiusi ? `, ${r.chiusi} chiusi` : '') +
  (r.mesi_cambiati ? `, ${r.mesi_cambiati} con mesi cambiati` : '') +
  (r.spunte_orfane ? `, ${r.spunte_orfane} spunte orfane` : '') + '.';

async function sincronizza() {
  const stop = avviso('Lettura del database Access…', { durata: 0 });
  try {
    const { dati, ok } = await chiama('/api/sync', { metodo: 'POST', body: { operatore: rete.operatore }, ms: 300000 });
    stop();
    if (!ok) avviso('Sync non riuscito: ' + (dati.errore || ''), { tono: 'allerta', durata: 10000 });
    // in caso di successo ci pensa l'evento SSE 'sync', che arriva a tutti
  } catch {
    stop();
    avviso('Server non raggiungibile: sync rinviato.', { tono: 'allerta' });
  }
}

/* ------------------------------------------------------ diario ----------- */
/* Stava nella vista Controlli, che non c'e' piu': i grafici sono passati alle
   Statistiche e il diario e' un'azione, non una vista - si apre quando serve
   sapere chi ha toccato cosa, e non occupa un posto in barra. */
function mostraDiario() {
  modale(chiudi => {
    const corpo = h('div.diario', {}, h('p.nota-t', { testo: 'Leggo le ultime modifiche…' }));
    const carica = () => chiama('/api/attivita?limit=200').then(r => {
      const att = r.dati.attivita || [];
      /* Le righe di uno stesso BLOCCO (#ANCHOR: ripristino: un'azione di massa,
         un "Approva tutte", un'azione multipla) stanno insieme: una riga sola
         con l'etichetta dell'azione, il conto, i siti, e un solo Ripristina
         che le rimette tutte com'erano. Le righe singole restano singole. */
      const gruppi = [];
      for (const e of att) {
        const b = (e.op_id || '').includes(':') ? bloccoDi(e) : null;
        const ult = gruppi[gruppi.length - 1];
        if (b && ult && ult.blocco === b) ult.righe.push(e);
        else gruppi.push({ blocco: b, righe: [e] });
      }
      const bottone = (e, testo, titolo, fatto) => ripristinabile(e) ? h('button.pill.mini.ripristina', {
        testo, title: titolo,
        onclick: async ev => {
          ev.currentTarget.disabled = true;
          const n = await ripristina(e);
          if (n >= 0) { avviso(fatto(n), { tono: 'ok' }); carica(); }
          else ev.currentTarget.disabled = false;
        },
      }) : null;
      corpo.replaceChildren(gruppi.length
        ? h('ul.elenco-diario', {}, gruppi.map(g => {
          const e = g.righe[0];
          if (!g.blocco || g.righe.length === 1) {
            return h('li', {},
              h('time.dato', { testo: quando(e.ts) }),
              h('span.d-txt', {},
                h('b', { testo: e.operatore || '—' }),
                h('span', { html: ` · ${st.mesi[(e.mese || 1) - 1]} ${e.anno} · ` + descriviEvento(e) }),
                h('span.d-chi', { testo: e.rag_soc || `#${e.id_service}` })),
              bottone(e, 'Ripristina', `Rimetti "${e.campo}" com\u2019era prima di questa modifica`,
                () => `Ripristinato: ${e.campo} di ${e.rag_soc || '#' + e.id_service} com\u2019era prima.`));
          }
          const siti = new Set(g.righe.map(x => x.id_service));
          const mesi = [...new Set(g.righe.map(x => x.mese))].sort((a, b) => a - b);
          const anni = [...new Set(g.righe.map(x => x.anno))];
          return h('li.blocco', {},
            h('time.dato', { testo: quando(e.ts) }),
            h('span.d-txt', {},
              h('b', { testo: e.operatore || '—' }),
              h('span', { testo: ` · ${etichettaBlocco(g.righe)} · ${siti.size} ${siti.size === 1 ? 'sito' : 'siti'} · ` +
                (mesi.length > 3 ? `${mesi.length} mesi` : mesi.map(m => st.mesi[m - 1]).join(', ')) + ` ${anni.join('/')}` }),
              h('details.d-righe', {},
                h('summary', { testo: `le ${g.righe.length} righe` }),
                h('ul', {}, g.righe.slice(0, 60).map(x => h('li', {
                  html: `${esc(st.mesi[(x.mese || 1) - 1])} · ${descriviEvento(x)} · ${esc(x.rag_soc || '#' + x.id_service)}` })),
                  g.righe.length > 60 ? h('li', { testo: `… e altre ${g.righe.length - 60}` }) : null))),
            bottone(e, 'Ripristina il blocco', `Rimetti com\u2019erano tutte le ${g.righe.length} spunte di questa azione`,
              n => `Ripristinato il blocco: ${n} ${n === 1 ? 'cella rimessa' : 'celle rimesse'} com\u2019erano.`));
        }))
        : h('p.nota-t', { testo: 'Nessuna modifica registrata: il diario parte dalla prima spunta.' }));
    }).catch(() => corpo.replaceChildren(h('p.nota-t', {
      testo: `Diario non disponibile: ${DOVE_VIVE} non risponde.`,
    })));
    carica();
    return [
      h('h2', { testo: 'Diario attività' }),
      h('p.sotto', { testo: 'Le ultime 200 modifiche, di tutti gli operatori e di tutti gli anni; ' +
        'le azioni in blocco sono una riga sola.' +
        (sonoAdmin() ? ' Con "Ripristina" rimetti com\u2019era prima di quella riga, o tutto il blocco.' : '') }),
      corpo,
      h('div', { style: 'display:flex;justify-content:flex-end;margin-top:18px' },
        h('button.bottone', { testo: 'Chiudi', onclick: chiudi })),
    ];
  });
}

/* ------------------------------------------------------ impostazioni ----- */
function mostraImpostazioni() {
  if (!sonoAdmin()) return avviso('Le impostazioni sono dell\u2019amministratore.');
  modale(chiudi => {
    const inp = h('input.campo', { type: 'month', value: st.inizioTracciamento });
    /* RUOLI (#ANCHOR: ruoli): il giro e' operatore -> approvatore -> admin ->
       operatore. Le CHIAVI restano 'tecnico'/'approvatore'/'admin' - quelle le
       conosce il server - mentre a schermo si legge ETICHETTA_RUOLO.
       I nomi di config.json (locale) restano admin comunque; l'ultimo
       admin non si declassa, altrimenti nessuno azzera piu' niente.
       Il ruolo si scrive sulla riga del nome, ma online quella riga e' legata a
       una casella: nessuno se la puo' spostare addosso. */
    const GIRO = { tecnico: 'approvatore', approvatore: 'admin', admin: 'tecnico' };
    const SIGLA_RUOLO = { admin: 'admin', approvatore: 'approva', tecnico: 'operatore' };
    const ruoliBox = h('div.righe-scelta');
    const disegnaRuoli = () => {
      const nomi = [...new Set([...(st.operatori || []), ...Object.keys(st.ruoli || {})])]
        .sort((a, b) => a.localeCompare(b, 'it'));
      ruoliBox.replaceChildren(...nomi.map(n => {
        const r = ruoloDi(n);
        const poi = GIRO[r];
        return h('button.pill' + (r === 'tecnico' ? '.debole' : ''), {
          'aria-pressed': String(r !== 'tecnico'),
          title: `${n}: ${ETICHETTA_RUOLO[r]}. Un clic lo rende ${ETICHETTA_RUOLO[poi]}.`,
          onclick: async () => {
            try {
              const { ok, dati } = await chiama('/api/ruolo', { metodo: 'POST',
                body: { nome: n, ruolo: poi, operatore: rete.operatore } });
              if (!ok) return avviso(dati.errore || 'Non cambiato.', { tono: 'allerta' });
              st.ruoli = dati.ruoli || st.ruoli;
              disegnaRuoli(); disegnaIo(); aggiornaApprova();
              avviso(`${n} ora \u00e8 ${ETICHETTA_RUOLO[poi]}.`, { tono: 'ok' });
            } catch { avviso('Non cambiato: server non raggiungibile.', { tono: 'allerta' }); }
          },
        }, h('span', { testo: n }), h('span.ruolo', { testo: SIGLA_RUOLO[r] }));
      }));
    };
    disegnaRuoli();

    /* SPAZIO DEI PDF (#ANCHOR: documenti). Lo Storage online non e' infinito e
       un documento a 288 dpi pesa: qui si vede quanto occupa ogni anno e si
       pota un anno chiuso in un clic. Le spunte "stampata" non si toccano -
       si butta il PDF, non il lavoro. Conferma in due tempi come nel cassetto:
       il bottone diventa "Sicuro?" e torna com'era da solo. */
    const pdfBox = h('div', { style: 'display:grid;gap:6px' });
    const disegnaPdf = () => {
      const r = riepilogoDocumenti();
      if (!r.n) {
        pdfBox.replaceChildren(h('p.nota-t', { style: 'margin:0',
          testo: 'Nessun PDF archiviato.' }));
        return;
      }
      pdfBox.replaceChildren(...r.anni.map(a => {
        const eCorrente = a.anno === st.anno;
        const bott = h('button.pill.mini.debole', {
          testo: 'Cancella',
          title: `Toglie i ${a.n} PDF del ${a.anno} (${dimensione(a.bytes)})` +
            (eCorrente ? ' — è l’anno in corso' : '') +
            '. Le spunte "stampata" restano.',
          onclick: async e => {
            const b = e.currentTarget;
            if (b.dataset.conferma !== '1') {
              b.dataset.conferma = '1';
              b.textContent = `Sicuro? ${a.n} PDF`;
              setTimeout(() => {
                b.dataset.conferma = ''; b.textContent = 'Cancella';
              }, 4000);
              return;
            }
            b.disabled = true; b.textContent = 'Cancello…';
            try {
              const { n, bytes } = await eliminaDocumenti({ anno: a.anno });
              disegnaPdf();
              avviso(`${n} PDF del ${a.anno} eliminati: ${dimensione(bytes)} liberati.`,
                     { tono: 'ok' });
            } catch (ex) {
              b.disabled = false; b.dataset.conferma = ''; b.textContent = 'Cancella';
              avviso('Non cancellati: ' + (ex.message || ex), { tono: 'allerta' });
            }
          },
        });
        return h('div', { style: 'display:flex;align-items:center;gap:10px;' +
                                 'justify-content:space-between' },
          h('span', { html: `<b>${a.anno}</b>${eCorrente ? ' · in corso' : ''}` +
            `<br><span class="dato">${a.n} PDF · ${dimensione(a.bytes)}</span>`,
            style: 'font-size:var(--t-mini)' }),
          bott);
      }), h('p.nota-t', { style: 'margin:4px 0 0',
        testo: `In tutto ${r.n} PDF, ${dimensione(r.bytes)}.` }));
    };
    disegnaPdf();

    return [
      h('h2', { testo: 'Impostazioni' }),
      h('h3.tit-p', { style: 'margin-top:14px', testo: 'Chi pu\u00f2 fare cosa' }),
      h('p.nota-t', {
        style: 'margin-bottom:10px',
        testo: 'Tre ruoli, un clic per girarli. L\u2019OPERATORE spunta tutto, ma ' +
          '"Rapportino" e "Ricambi" restano proposte. L\u2019APPROVATORE chiude quelle ' +
          'due proposte e basta. L\u2019AMMINISTRATORE, oltre ad approvare, completa o ' +
          'azzera in blocco, rilegge Access, cambia queste impostazioni, ' +
          'ripristina dal diario e pu\u00f2 buttare i PDF di un anno intero.'
      }),
      ruoliBox,
      h('h3.tit-p', { style: 'margin-top:14px', testo: 'Da quando registrate le spunte qui' }),
      h('p.nota-t', {
        style: 'margin-bottom:10px',
        testo: 'I mesi precedenti restano visibili e spuntabili per il recupero ' +
          'storico, ma non vengono mai segnalati come "in ritardo" e non entrano ' +
          'nei totali dell\'anno. Senza questa data ogni mese passato risulterebbe ' +
          'arretrato solo perché l\'applicazione non esisteva ancora.'
      }),
      inp,
      h('h3.tit-p', { style: 'margin-top:18px', testo: 'Spazio dei PDF' }),
      h('p.nota-t', {
        style: 'margin-bottom:10px',
        testo: 'I PDF delle schede tecnici restano per sempre, e un documento ' +
          'lungo pesa decine di mega: online lo spazio e il traffico si pagano. ' +
          'Cancellare un anno chiuso libera posto e non tocca nessuna spunta: ' +
          'resta scritto che quelle schede sono state stampate, sparisce solo ' +
          'il file. Non si torna indietro.'
      }),
      pdfBox,
      h('div', { style: 'display:flex;gap:8px;justify-content:flex-end;margin-top:18px' },
        h('button.bottone.piatto', { testo: 'Lascia stare', onclick: chiudi }),
        h('button.bottone', {
          testo: 'Salva', onclick: async () => {
            const v = inp.value;
            if (!/^\d{4}-\d{2}$/.test(v)) return avviso('Scegli un mese.', { tono: 'allerta' });
            chiudi();
            try {
              await chiama('/api/impostazioni', {
                metodo: 'POST', body: { inizio_tracciamento: v, operatore: rete.operatore },
              });
              st.inizioTracciamento = v;
              disegna();
              avviso('Tracciamento a partire da ' + v + '.', { tono: 'ok' });
            } catch { avviso('Non salvato: server non raggiungibile.', { tono: 'allerta' }); }
          }
        })),
    ];
  });
}

/* ------------------------------------------------------------ doppioni --- */
/** Siti dello stesso cliente con destinazioni quasi uguali, e clienti con
 *  ragioni sociali quasi uguali: in Access sono due righe, nella realta'
 *  spesso una sola scritta in due modi. Access non si tocca da qui: questo e'
 *  l'elenco per andare a correggerlo la'. La ricerca e il generatore, intanto,
 *  li trovano comunque (#ANCHOR: affinita). */
function mostraDoppioni() {
  const siti = [...st.perServ.values()].filter(s => s.stato === 'APERTO' && !s.arch);
  const perCli = new Map();
  for (const s of siti) (perCli.get(s.cli) || perCli.set(s.cli, []).get(s.cli)).push(s);
  const coppieSiti = [];
  for (const [cli, l] of perCli) {
    if (l.length < 2) continue;
    for (const d of doppioni(l, s => s.dest, 0.8)) coppieSiti.push({ cli, ...d });
  }
  coppieSiti.sort((x, y) => y.affinita - x.affinita);
  const clienti = [...st.clienti.values()].filter(c => perCli.has(c.id));
  const coppieCli = doppioni(clienti, c => c.rs, 0.86);

  const pct = a => Math.round(a * 100) + '%';
  const rigaSito = ({ cli, a, b, affinita }) => h('li.dop', {},
    h('span.dop-aff', { style: `--a:${pct(affinita)}` }, h('i'), h('b', { testo: pct(affinita) })),
    h('div.dop-nomi', {},
      h('small', { testo: st.clienti.get(cli)?.rs || '' }),
      ...[a, b].map(s => h('button.dop-voce', {
        onclick: () => apriCassetto(s.id), title: 'Apri il sito',
      }, h('span.dato', { testo: '#' + s.id }), h('span', { testo: s.dest || '(senza destinazione)' })))));
  const rigaCli = ({ a, b, affinita }) => h('li.dop', {},
    h('span.dop-aff', { style: `--a:${pct(affinita)}` }, h('i'), h('b', { testo: pct(affinita) })),
    h('div.dop-nomi', {}, ...[a, b].map(c => h('span.dop-voce', {},
      h('span.dato', { testo: 'cliente ' + c.id }), h('span', { testo: c.rs })))));
  const testo = () => [
    ...coppieSiti.map(x => `${pct(x.affinita)}\t${st.clienti.get(x.cli)?.rs || ''}\t#${x.a.id} ${x.a.dest}\t#${x.b.id} ${x.b.dest}`),
    ...coppieCli.map(x => `${pct(x.affinita)}\tclienti\t${x.a.id} ${x.a.rs}\t${x.b.id} ${x.b.rs}`),
  ].join('\n');

  modale(chiudi => [
    h('h2', { testo: 'Possibili doppioni' }),
    h('p.sotto', { html: 'Nomi che si somigliano troppo per essere due cose diverse: lo stesso ' +
      'sito scritto in due modi, o lo stesso cliente con due ragioni sociali. Da qui ' +
      'Access non si tocca: è l\'elenco per correggerlo là. Ricerca e generatore li ' +
      'trovano comunque, anche con le grafie diverse.' }),
    h('h3.dop-titolo', { testo: `Siti dello stesso cliente · ${coppieSiti.length}` }),
    coppieSiti.length ? h('ul.dop-lista', {}, coppieSiti.map(rigaSito))
      : h('p.dop-vuoto', { testo: 'Nessuna destinazione doppia trovata.' }),
    h('h3.dop-titolo', { testo: `Clienti · ${coppieCli.length}` }),
    coppieCli.length ? h('ul.dop-lista', {}, coppieCli.map(rigaCli))
      : h('p.dop-vuoto', { testo: 'Nessuna ragione sociale doppia trovata.' }),
    h('div', { style: 'display:flex;gap:8px;justify-content:flex-end;margin-top:16px' },
      h('button.pill', { testo: 'Copia elenco', onclick: () => copia(testo()) }),
      h('button.bottone', { testo: 'Chiudi', onclick: chiudi })),
  ], { classe: 'largo' });
}

/* ----------------------------------------------------------------- tema -- */
function temaIniziale() {
  const t = localStorage.getItem('cs.tema');
  if (t) document.documentElement.dataset.tema = t;
}
function giraTema() {
  const ora = document.documentElement.dataset.tema;
  const scuroSistema = matchMedia('(prefers-color-scheme: dark)').matches;
  const next = !ora ? (scuroSistema ? 'chiaro' : 'scuro') : ora === 'scuro' ? 'chiaro' : 'scuro';
  document.documentElement.dataset.tema = next;
  localStorage.setItem('cs.tema', next);
}

/* -------------------------------------------------------------- tastiera - */
function tastiera() {
  addEventListener('keydown', e => {
    // e.target puo' essere document o window (nessun .matches/.closest): guardie.
    if (e.target?.matches?.('input,textarea,select')) {
      if (e.key === 'Escape') e.target.blur();
      return;
    }
    if (e.key === '/') { e.preventDefault(); $('#q').focus(); return; }
    if (e.key === '?') { e.preventDefault(); mostraAiuto(); return; }
    if (e.ctrlKey || e.altKey || e.metaKey) return;
    if (e.target?.closest?.('.cella')) return;
    const k = e.key.toLowerCase();
    const v = { a: 'anno', m: 'mese', s: 'stat' }[k];
    if (v) { st.vista = v; chiudiCassetto(); disegna(); return; }
    if (k === 'o') vaiOggi();
  });
}

/* -------------------------------------------------------------- aiuto ---- */
function mostraAiuto() {
  modale(chiudi => {
    /* `n` = quanti passi mostrare accesi, da sinistra: la legenda segue CAMPI,
       cosi' aggiungere un passo non richiede di ritoccare questa finestra. */
    const cel = (cl, n) => h('span.cella' + (cl ? '.' + cl : ''), {
      style: 'width:40px;height:20px;flex:none',
      ...Object.fromEntries(CAMPI.map((campo, i) =>
        ['data-' + { stampata: 's', controllata: 'c', corretta: 'k', ricambi: 'r' }[campo],
          i < n ? 1 : 0])),
      html: CAMPI.map(campo =>
        `<i class="seg ${{ stampata: 's', controllata: 'c', corretta: 'k', ricambi: 'r' }[campo]}"></i>`).join(''),
    });
    const riga = (nodo, et) => h('div', { style: 'display:flex;align-items:center;gap:10px' },
      nodo, h('span', { testo: et, style: 'font-size:var(--t-mini)' }));
    const trattino = h('span', {
      style: 'width:40px;display:flex;justify-content:center;flex:none',
    }, h('span', { style: 'width:8px;height:1px;background:var(--bordo-forte)' }));

    return [
      h('h2', { testo: 'Come si legge' }),
      h('p.sotto', {
        testo: `Ogni cella è un mese di manutenzione. I ${PASSI} segmenti si riempiono ` +
          'da sinistra, uno per passo.',
      }),
      h('div', { style: 'display:grid;gap:9px;margin-bottom:20px' },
        riga(cel('', 0), 'Da fare'),
        ...CAMPI.map((campo, i) =>
          riga(cel(i === PASSI - 1 ? 'completa' : '', i + 1),
            `${i + 1}. ${ETICHETTA[campo]}${i === PASSI - 1 ? ' — completa' : ''}`)),
        riga(cel('ritardo', 1), 'In ritardo: la scadenza è passata e la mappatura ' +
          'del sito non è chiusa in nessun mese'),
        riga(cel('visita', 0), CLASSE_ET['visita']),
        riga(cel('stima', 0), CLASSE_ET['stima']),
        riga(cel('darinnovare', 0), CLASSE_ET['da-rinnovare']),
        riga(cel('nontracciato', 0), CLASSE_ET['non-tracciato']),
        riga(trattino, 'Nessuna manutenzione prevista, o service non ancora attivo')),

      h('h3.tit-p', { testo: 'Il pallino davanti al sito' }),
      h('p.nota-t', {
        style: 'margin-bottom:10px',
        testo: 'Dice a colpo d\'occhio come sta la mappatura dell\'anno di quel ' +
          'sito, senza cercare la casella piena fra i dodici mesi. Sono gli ' +
          'stessi stati del filtro nella barra. Nel foglio del Mese il pallino ' +
          `è anche il bottone della scheda: un clic mette tutti e ${PASSI} i passi ` +
          'di quel mese (un altro clic li toglie), ctrl+clic seleziona per le ' +
          'azioni multiple.',
      }),
      h('div', { style: 'display:grid;gap:9px;margin-bottom:20px' },
        ...['completa', 'ritardo', 'corso', 'attesa', 'pretrac', 'fuori'].map(k =>
          riga(h('span', { style: 'width:40px;display:flex;justify-content:center;flex:none' },
            h('span.punto-stato.' + k)), ET_STATO[k]))),

      h('h3.tit-p', { testo: 'Una mappatura per sito, una volta all\'anno' }),
      h('p.nota-t', {
        style: 'margin-bottom:18px',
        testo: 'Ogni sito aperto ha la sua mappatura: un cliente con nove impianti ' +
          'ne ha nove, una per impianto. Ma non si rifà a ogni visita: fatta una ' +
          'volta con tutti e quattro i passi, quel sito è a posto per l\'anno e la ' +
          'casella si accende di verde. Se il contratto ha più mesi di ' +
          'manutenzione la scadenza è il primo: quella cella è piena, le altre ' +
          'restano come visite (capsula col solo contorno) e si possono spuntare ' +
          'se la mappatura si fa lì.'
      }),

      h('h3.tit-p', { testo: 'Perché gli anni non sono identici' }),
      h('p.nota-t', {
        style: 'margin-bottom:18px',
        testo: 'In CronoServices i mesi di manutenzione appartengono al contratto, non ' +
          'a un anno. Qui vengono incrociati con inizio e scadenza del contratto: ' +
          'oltre la scadenza diventano una stima se il rinnovo è automatico, ' +
          'altrimenti segnalano che il contratto va rinnovato. Prima dell\'inizio ' +
          'del contratto non compare nulla.'
      }),

      h('h3.tit-p', { testo: 'Tasti' }),
      h('dl.dettaglio', {}, [
        ['/', 'Cerca'], ['A / M / S', 'Anno · Mese · Statistiche'],
        ['O', 'Torna a oggi'],
        ['1 2 3 4', 'Spunta il passo corrispondente sulla cella (o sulla scheda del mese) col fuoco'],
        ['0', `Mese: mette (o toglie) tutti e ${PASSI} i passi della scheda col fuoco`],
        ['↑ ↓', 'Anno: riga sopra/sotto · Mese: scheda sopra/sotto, evidenziata tutta'],
        ['← →', 'Anno: mese previsto precedente/successivo · Mese: entra ed esce dalle caselle'],
        ['Home / Fine', 'Anno: primo · ultimo mese previsto della riga'],
        ['Invio', 'Apri la cella (nel mese: il dettaglio del service)'],
        ['Esc', 'Chiudi'], ['?', 'Questa finestra'],
      ].flatMap(([k, v]) => [
        h('dt', { html: `<code class="dato">${esc(k)}</code>` }), h('dd', { testo: v }),
      ])),

      h('h3.tit-p', { style: 'margin-top:18px', testo: 'Se siete in due o più' }),
      h('p.nota-t', {
        testo: 'Le spunte degli altri arrivano da sole: la cella lampeggia col nome di ' +
          'chi l\'ha toccata. Se manca la rete le tue restano in coda e partono da ' +
          'sole quando torna. Le spunte si fondono da sole, passo per passo: ti ' +
          'viene chiesto di scegliere solo se due persone scrivono la stessa nota ' +
          'nello stesso momento. Il pulsante con la spia in ' +
          'alto mostra chi è collegato e l\'indirizzo da dare ai colleghi.'
      }),
      h('div', { style: 'display:flex;justify-content:flex-end;margin-top:18px' },
        h('button.bottone', { testo: 'Chiudi', onclick: chiudi })),
    ];
  });
}

/* Ultima riga del modulo: ora tutte le costanti sono inizializzate. */
avvia();
