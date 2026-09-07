/* app.js - guscio dell'applicazione: avvio, viste, filtri, tema, tastiera,
   identita' operatore, azioni di massa, stato del collegamento.  #ANCHOR: app */
import {
  $, $$, h, ICO, avviso, modale, menu, copia, quando, esc, tinta, iniziali,
} from './ui.js';
import {
  rete, bootstrap, onCambio, setOperatore, apriStream, avviaPresenza, chiama, svuota,
  avviaSessione, esportaCsv, inNuvola,
} from './api.js';
import {
  st, on, applica, cambiaAnno, elencoTipi, elencoProv, riepilogoAnno,
  esitoConferma, esitoConflitto, eventoRemoto, spuntaMolte, annullaUltima,
  caricaFiltri, salvaFiltri, CAMPI, PASSI, ETICHETTA, CLASSE_ET,
} from './stato.js';
import * as vAnno from './anno.js';
import * as vMese from './mese.js';
import * as vStat from './stat.js';
import { chiudiPop } from './spunte.js';
import { chiudiCassetto } from './cassetto.js';

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
  } catch {
    area.innerHTML = inNuvola()
      ? `<div class="vuoto"><b>Database non raggiungibile</b>
         Controlla il collegamento a internet e ricarica la pagina.</div>`
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
  if (!rete.operatore) chiediOperatore(); else disegnaIo();
  disegna();
  statoCollegamento();

  apriStream(eventoRemoto);
  avviaPresenza(
    () => st.anno + '-' + String(st.mese).padStart(2, '0'),
    d => { st.online = d.online || []; statoCollegamento(); });

  onCambio((_, ev) => {
    statoCollegamento();
    if (ev?.confermata) esitoConferma(ev.confermata.op, ev.confermata.risposta);
    if (ev?.conflitto) esitoConflitto(ev.conflitto.op, ev.conflitto.server);
  });

  on('cella', d => {
    if (st.vista === 'anno') vAnno.aggiornaCella(d.id, d.mese, d.remoto);
    else if (st.vista === 'mese') vMese.aggiornaCella(d.id, d.mese);
    else if (st.vista === 'stat') vStat.aggiorna();
    aggiornaTestaPresto();
  });
  on('rilegge', d => {
    disegna();
    if (d?.remoto) avviso(`${d.remoto} ha aggiornato più mappature.`);
  });
  on('presenze', statoCollegamento);
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
  const box = $('#riepilogo');
  if (st.vista !== 'anno') { box.innerHTML = ''; box.hidden = true; return; }
  box.hidden = false;
  const voce = (n, et, stile, tit) =>
    `<div class="voce"${tit ? ` title="${esc(tit)}"` : ''}>` +
    `<span class="n"${stile ? ` style="${stile}"` : ''}>${n}</span>` +
    `<span class="et">${et}</span></div>`;
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
      'per anno: conta quella, non i mesi di visita') +
    voce(r.ritardo, 'in ritardo', r.ritardo ? 'color:var(--allerta)' : '',
      'Mappature con la scadenza (primo mese di manutenzione del sito) ' +
      'gia\' passata e non chiuse in nessun mese') +
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

/* --------------------------------------------------------------- testa --- */
function icone() {
  $('#anno-giu').innerHTML = ICO.sx;
  $('#anno-su').innerHTML = ICO.dx;
  $('#cerca-ico').innerHTML = ICO.cerca;
  $('#tema').innerHTML = ICO.tema;
}

function collegaTesta() {
  // Il passo si conta dall'obiettivo, non dall'anno gia' caricato: altrimenti
  // tre clic rapidi indietro finivano tutti sullo stesso anno.
  $('#anno-giu').onclick = () => vaiAnno(annoMirato() - 1);
  $('#anno-su').onclick = () => vaiAnno(annoMirato() + 1);
  $('#oggi').onclick = vaiOggi;
  $('#tema').onclick = giraTema;
  $('#io').onclick = chiediOperatore;
  $('#aiuto').onclick = mostraAiuto;
  $('#azioni').onclick = e => apriAzioni(e.currentTarget);
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

  $('#f-tipo').onchange = e => { st.filtri.tipo = e.target.value; salvaFiltri(); ridisegnaFiltrato(); };
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
   era acceso per default e nessuno lo spegneva. Le stime si vedono sempre. */
const FILTRI = [['f-inc', 'soloIncomplete'], ['f-rit', 'soloRitardo'],
['f-chiusi', 'mostraChiusi']];

function riflettiFiltri() {
  $('#q').value = st.filtri.q || '';
  $('#cerca-x').hidden = !st.filtri.q;
  for (const [id, chiave] of FILTRI) {
    $('#' + id).setAttribute('aria-pressed', String(!!st.filtri[chiave]));
  }
}

function ridisegnaFiltrato() {
  clearTimeout(ridisegnaFiltrato.t);
  ridisegnaFiltrato.t = setTimeout(disegna, 130);
}

function riempiFiltri() {
  const opz = (v, et) => `<option value="${esc(v)}">${esc(et)}</option>`;
  $('#f-tipo').innerHTML = opz('', 'Tutti i tipi') + elencoTipi().map(t => opz(t, t)).join('');
  $('#f-prov').innerHTML = opz('', 'Tutte le province') + elencoProv().map(p => opz(p, p)).join('');
  $('#f-tipo').value = st.filtri.tipo;
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
  menu(bottone, [
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
    { et: 'Stampa il foglio del mese', ico: ICO.stampa, fn: stampa },
    { et: 'Scarica CSV', ico: ICO.giu, fn: scaricaCsv },
    null,
    { et: 'Diario attività', ico: ICO.gente, nota: 'chi ha fatto cosa', fn: mostraDiario },
    null,
    { et: 'Sincronizza da Access', ico: ICO.sync, fn: sincronizza },
    { et: 'Impostazioni', fn: mostraImpostazioni },
  ]);
}

function descrizioneFiltri() {
  const f = st.filtri, p = [];
  if (f.q) p.push(`ricerca "${f.q}"`);
  if (f.tipo) p.push(f.tipo);
  if (f.prov) p.push('provincia ' + f.prov);
  if (f.soloIncomplete) p.push('solo incomplete');
  if (f.soloRitardo) p.push('solo in ritardo');
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
        const n = spuntaMolte(voci, completa ? 'Completamento di massa' : 'Azzeramento di massa');
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
    h('b', { testo: rete.operatore || 'Chi sei?' }));
}

function chiediOperatore() {
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
      } catch { }
    };
    return [
      h('h2', { testo: 'Chi sta lavorando?' }),
      h('p.sotto', {
        testo: 'Il nome resta su questo computer e firma ogni spunta, così si sa ' +
          'sempre chi ha fatto cosa quando siete in più di uno.'
      }),
      input,
      h('div.righe-scelta', {}, (st.operatori || []).map(n =>
        h('button.pill', { testo: n, onclick: () => { input.value = n; conferma(); } }))),
      h('div', { style: 'display:flex;gap:8px;justify-content:flex-end;margin-top:8px' },
        h('button.bottone', { testo: 'Continua', onclick: conferma })),
    ];
  }, { chiudibile: !!rete.operatore });
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
      title: o.nome + (o.dove ? ' · sta guardando ' + o.dove : ''),
    })));
  $('#collegamento-et').textContent = giu
    ? (n ? `${n} in coda · offline` : 'offline')
    : n ? `${n} in invio` : (altri.length ? `${altri.length + 1} collegati` : 'collegato');
  $('#collegamento').title = giu
    ? 'Server non raggiungibile: le spunte restano in coda su questo computer'
    : 'Chi è collegato, indirizzo per i colleghi, stato degli invii';

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
    banner.innerHTML = `<b>Server non raggiungibile.</b> <span>${n ? inCoda
      : 'Puoi continuare a spuntare: tutto resta in coda su questo computer.'
      }</span><button id="banner-riprova">Riprova ora</button>`;
    $('#banner-riprova').onclick = () => { svuota(); statoCollegamento(); };
  } else {
    banner.hidden = true;
    banner.innerHTML = '';
  }
}

function pannelloCollegamento() {
  modale(chiudi => {
    const lan = st.indirizzoLan || '';
    const tutti = (st.online || []).filter(o => o.nome);
    const box = h('div');
    chiama('/api/attivita?limit=12').then(({ dati }) => {
      box.replaceChildren(h('ul.storia', {}, (dati.attivita || []).length
        ? dati.attivita.map(e => h('li', {},
          h('time', { testo: quando(e.ts) }),
          h('span', {
            html: `<b>${esc(e.operatore)}</b> · ${esc(st.mesi[(e.mese || 1) - 1] || '')} · ` +
              (e.campo === 'nota' ? 'nota' : `${e.a ? 'spuntato' : 'tolto'} ${esc(e.campo)}`) +
              ` · ${esc(e.rag_soc || '')}`
          })))
        : h('li', { testo: 'Nessuna modifica ancora.' })));
    }).catch(() => box.replaceChildren(h('p', {
      testo: 'Diario non disponibile senza collegamento.',
      style: 'color:var(--tenue);font-size:var(--t-mini)',
    })));

    return [
      h('h2', { testo: 'Lavorare in più persone' }),
      h('p.sotto', {
        testo: 'Un solo computer fa da server; gli altri lo aprono nel browser. ' +
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
        : h('p.nota-t', { testo: 'Indirizzo non disponibile: server non raggiungibile.' }),
      h('p.nota-t', {
        style: 'margin-bottom:18px',
        testo: 'Il computer che fa da server deve restare acceso. La prima volta ' +
          'Windows chiede di autorizzare Python sulla rete: rispondere Consenti ' +
          'sulle reti private.'
      }),

      h('h3.tit-p', { testo: 'Collegati ora' }),
      tutti.length
        ? h('ul.elenco-gente', {}, tutti.map(o =>
          h('li', {},
            h('span.pallino', { style: 'background:' + tinta(o.nome), testo: iniziali(o.nome) }),
            h('span', { html: `<b>${esc(o.nome)}</b>${o.nome === rete.operatore ? ' (tu)' : ''}` }),
            h('span.nota-t', { testo: o.dove ? 'su ' + o.dove : '' }))))
        : h('p.nota-t', { style: 'margin-bottom:18px', testo: 'Solo tu, per ora.' }),

      h('h3.tit-p', { testo: 'Le tue spunte' }),
      h('p', {
        style: 'margin:0 0 18px;font-size:var(--t-mini)',
        html: rete.coda.length
          ? `<b>${rete.coda.length}</b> in attesa di essere ` +
          `${rete.coda.length === 1 ? 'inviata' : 'inviate'}. ` +
          'Restano su questo computer anche se chiudi il browser.'
          : 'Tutte inviate e confermate dal server.'
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
    const { dati, ok } = await chiama('/api/sync', { metodo: 'POST', body: {}, ms: 300000 });
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
    chiama('/api/attivita?limit=120').then(r => {
      const att = r.dati.attivita || [];
      corpo.replaceChildren(att.length
        ? h('ul.elenco-diario', {}, att.map(e => h('li', {},
          h('time.dato', { testo: quando(e.ts) }),
          h('span.d-txt', {},
            h('b', { testo: e.operatore || '—' }),
            h('span', {
              testo: ` · ${st.mesi[(e.mese || 1) - 1]} ${e.anno} · ` +
                (e.campo === 'nota' ? 'nota'
                  : `${e.a ? 'spuntato' : 'tolto'} ${e.campo}`),
            }),
            h('span.d-chi', { testo: e.rag_soc || `#${e.id_service}` })))))
        : h('p.nota-t', { testo: 'Nessuna modifica registrata: il diario parte dalla prima spunta.' }));
    }).catch(() => corpo.replaceChildren(h('p.nota-t', {
      testo: 'Server non raggiungibile: il diario vive sul PC che ospita l’applicazione.',
    })));
    return [
      h('h2', { testo: 'Diario attività' }),
      h('p.sotto', { testo: 'Le ultime 120 modifiche, di tutti gli operatori e di tutti gli anni.' }),
      corpo,
      h('div', { style: 'display:flex;justify-content:flex-end;margin-top:18px' },
        h('button.bottone', { testo: 'Chiudi', onclick: chiudi })),
    ];
  });
}

/* ------------------------------------------------------ impostazioni ----- */
function mostraImpostazioni() {
  modale(chiudi => {
    const inp = h('input.campo', { type: 'month', value: st.inizioTracciamento });
    return [
      h('h2', { testo: 'Impostazioni' }),
      h('h3.tit-p', { style: 'margin-top:14px', testo: 'Da quando registrate le spunte qui' }),
      h('p.nota-t', {
        style: 'margin-bottom:10px',
        testo: 'I mesi precedenti restano visibili e spuntabili per il recupero ' +
          'storico, ma non vengono mai segnalati come "in ritardo" e non entrano ' +
          'nei totali dell\'anno. Senza questa data ogni mese passato risulterebbe ' +
          'arretrato solo perché l\'applicazione non esisteva ancora.'
      }),
      inp,
      h('div', { style: 'display:flex;gap:8px;justify-content:flex-end;margin-top:18px' },
        h('button.bottone.piatto', { testo: 'Lascia stare', onclick: chiudi }),
        h('button.bottone', {
          testo: 'Salva', onclick: async () => {
            const v = inp.value;
            if (!/^\d{4}-\d{2}$/.test(v)) return avviso('Scegli un mese.', { tono: 'allerta' });
            chiudi();
            try {
              await chiama('/api/impostazioni', {
                metodo: 'POST', body: { inizio_tracciamento: v },
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
          'sole quando torna. Solo se due persone cambiano lo stesso passo nello ' +
          'stesso momento ti viene chiesto quale tenere. Il pulsante con la spia in ' +
          'alto mostra chi è collegato e l\'indirizzo da dare ai colleghi.'
      }),
      h('div', { style: 'display:flex;justify-content:flex-end;margin-top:18px' },
        h('button.bottone', { testo: 'Chiudi', onclick: chiudi })),
    ];
  });
}

/* Ultima riga del modulo: ora tutte le costanti sono inizializzate. */
avvia();
