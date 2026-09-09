/* ponte.js - il generatore di schede tecnici parla con Crono Mappature.
   #ANCHOR: ponte

Il generatore (index.html in questa cartella) e' rimasto quello che era: una
pagina sola, offline, che da un Excel fa fogli A4. Questo modulo gli aggiunge il
legame col tracker, che vive nella stessa origine:

  1. la TESTATA della colonna dell'anteprima dice a quale SITO e' collegato il
     lavoro. Non galleggia sopra le pagine: sta fuori dal riquadro che scorre
     (#banco in index.html), quindi resta sempre in vista e non ne copre
     nessuna. La spina colorata a sinistra e' lo stato del collegamento, la
     fascia in basso l'esito e l'avanzamento. Il sito arriva nell'indirizzo
     (/schede/?service=ID&anno=..&mese=..) oppure si RICONOSCE dal nome del file
     Excel e dal titolo del foglio, con la stessa tolleranza alle grafie della
     ricerca del tracker (js/affinita.js): corrispondenza netta e un solo sito
     -> collegato da solo; piu' siti o corrispondenza parziale -> lista dei
     probabili; niente -> avviso, e si sceglie a mano (segnato come tale);
  2. "ESPORTA E SALVA" (il bottone del generatore) e "Salva nel tracker" (nel
     dock) producono lo stesso PDF (html2canvas + jsPDF, in lib/): il primo lo
     scarica anche sul computer, tutti e due lo consegnano al tracker - file
     archiviato, riga in `documenti`, spunta "stampata" sul mese della
     mappatura. Il tracker mostra l'icona accanto al nome del sito. La
     finestra di stampa del browser non c'e' piu' in mezzo: scrivendo il PDF
     da li' ogni foglio portava in testa e in fondo il titolo della pagina e
     l'indirizzo del sito (quello di Netlify), e il file era quello che il
     browser voleva, non il nostro. Resta raggiungibile con Ctrl+P;
  3. il tema segue quello scelto nel tracker.

Il fatto certo che il tracker registra e' "il PDF esiste", ed e' quello che
mette la spunta. */
import { chiama, avviaSessione, inNuvola } from '../js/api.js';
import * as nuvola from '../js/nuvola.js';
import { st, applica, mappaturaSito } from '../js/stato.js';
import { salvaDocumento } from '../js/documenti.js';
import { affinita, pesiParole } from '../js/affinita.js';

const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const MESI = ['Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno',
  'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre'];

/* Soglie del riconoscimento dal nome del file. */
const NETTA = 0.88;      // da qui in su e' lui, se non ha rivali
const PROBABILE = 0.5;   // da qui in su entra nella lista dei probabili
const RIVALE = 0.72;     // un secondo candidato di un ALTRO cliente sopra questa soglia toglie l'automatismo

/* ---------------------------------------------------------- il contesto -- */
const q = new URLSearchParams(location.search);
const ctx = {
  anno: Number(q.get('anno')) || new Date().getFullYear(),
  id: Number(q.get('service')) || 0,
  mese: Number(q.get('mese')) || 0,
  sito: q.get('sito') || '',
  cliente: q.get('cliente') || '',
  localita: q.get('localita') || '',
  origine: q.get('service') ? 'tracker' : '',   // 'tracker' | 'auto' | 'lista' | 'mano'
};
let siti = null;            // {id, dest, cliente, loc, cli, mese, nome} aperti dell'anno
let pesi = null;            // rarita' delle parole fra i nomi dei siti (affinita.js)
let inCorso = false;
let stretta = 0;            // 0 testata larga, 1 nuvoletta: il cursore di guarda()
let aggiorna = () => { };   // lo riscrive guarda(); prima non fa niente
let rimisura = () => { };   // idem: rimisura la pillola al fotogramma dopo
let ultimoFile = '';        // il testo con cui si e' riconosciuto (nome file / titolo)
let esitoCorrente = null;   // {tono, testo, cand}

/* ----------------------------------------------------------------- tema -- */
(function tema() {
  const t = localStorage.getItem('cs.tema');
  const mio = localStorage.getItem('vrsSchedeCampo.theme');
  if (!t || mio) return;
  window.setTheme?.(t === 'scuro' ? 'dark' : 'light', false);
})();

/* --------------------------------------------------------------- i siti -- */
async function caricaSiti() {
  if (siti) return siti;
  const { ok, dati } = await chiama('/api/bootstrap?anno=' + ctx.anno);
  if (!ok) throw new Error(dati?.errore || 'elenco dei siti non disponibile');
  applica(dati);
  siti = [];
  for (const s of st.perServ.values()) {
    if (s.stato !== 'APERTO' || s.arch) continue;
    const ma = mappaturaSito(s), cliente = st.clienti.get(s.cli)?.rs || '';
    siti.push({ id: s.id, dest: s.dest || '', loc: s.loc || '', cli: s.cli, cliente,
                mese: ma.mese || ma.scad || 0, nome: cliente + ' ' + (s.dest || '') });
  }
  siti.sort((a, b) => a.cliente.localeCompare(b.cliente) || a.dest.localeCompare(b.dest));
  pesi = pesiParole(siti.map(s => s.nome));
  $('#ponteLista').replaceChildren(...siti.map(s => Object.assign(document.createElement('option'),
    { value: `${s.cliente} · ${s.dest} · #${s.id}` })));
  return siti;
}
const sitiDelCliente = cli => siti.filter(s => s.cli === cli).length;

/* Il titolo del documento quando il sito e' noto: e' il nome sotto cui il PDF
   verra' archiviato, quindi vale piu' di come qualcuno ha battezzato l'Excel.
   Cliente e destinazione insieme, ma una volta sola: in Access capita spesso
   che la destinazione ripeta la ragione sociale ("CASA DI RIPOSO UMBERTO I" /
   "Casa di Riposo Umberto I"), e stamparla due volte in copertina sarebbe
   goffo. Qui si decide solo il testo: se poi il campo lo prenda davvero da qui
   lo dice la spunta `titleFromSite` nel generatore. */
const soloLettere = x => String(x || '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();
function titoloSito() {
  if (!ctx.id) return '';
  const cli = (ctx.cliente || '').trim(), dest = (ctx.sito || '').trim();
  if (!cli || !dest) return cli || dest || ('service #' + ctx.id);
  const a = soloLettere(cli), b = soloLettere(dest);
  if (a.includes(b) || b.includes(a)) return a.length >= b.length ? cli : dest;
  return cli + ' – ' + dest;
}
const dilloAlTitolo = () => window.aggiornaTitoloSito?.(titoloSito());

function collega(s, origine) {
  Object.assign(ctx, { id: s.id, mese: s.mese, sito: s.dest, cliente: s.cliente,
                       localita: s.loc, origine });
  const u = new URL(location.href);
  u.searchParams.set('service', s.id); u.searchParams.set('mese', s.mese || '');
  u.searchParams.set('sito', s.dest); u.searchParams.set('cliente', s.cliente);
  history.replaceState(null, '', u);
  dilloAlTitolo();
}

function scollega() {
  Object.assign(ctx, { id: 0, mese: 0, sito: '', cliente: '', localita: '', origine: '' });
  const u = new URL(location.href);
  for (const k of ['service', 'mese', 'sito', 'cliente']) u.searchParams.delete(k);
  history.replaceState(null, '', u);
  dilloAlTitolo();
}

/* ------------------------------------------------- riconoscimento file --- */
/** Il file e' stato caricato: si prova a capire di quale sito e'. */
async function riconosci(nomeFile, titolo) {
  const domande = [nomeFile, titolo].map(x => String(x || '').replace(/\.[^.]+$/, '').trim()).filter(Boolean);
  if (!domande.length) return;
  ultimoFile = domande.join(' / ');
  let lista;
  try { lista = await caricaSiti(); } catch (e) { return esito('errore', e.message); }

  const punteggio = s => Math.max(...domande.map(d => Math.max(
    affinita(d, s.nome, pesi), affinita(d, s.dest, pesi), affinita(d, s.cliente, pesi) * 0.92)));
  const cand = lista.map(voce => ({ voce, affinita: punteggio(voce) }))
    .filter(c => c.affinita >= PROBABILE)
    .sort((a, b) => b.affinita - a.affinita)
    .slice(0, 6);

  // Gia' collegato dal tracker: il file dice un'altra cosa? Si avvisa, senza
  // cambiare niente da soli.
  if (ctx.id && ctx.origine === 'tracker') {
    const mio = lista.find(s => s.id === ctx.id);
    const a = mio ? punteggio(mio) : 0;
    if (a < PROBABILE && cand.length) {
      return esito('dubbio', `Il file “${domande[0]}” non somiglia a ${ctx.cliente}: controlla di aver caricato l’Excel giusto, o cambia sito.`, cand);
    }
    return esito('ok', a >= NETTA ? 'Il file corrisponde al sito collegato.' : '');
  }

  if (!cand.length) {
    scollega();
    return esito('nessuno', `Nessun sito del tracker somiglia a “${domande[0]}”: il nome e’ sbagliato, o il sito non e’ in Access. Scegli a mano.`);
  }
  const primo = cand[0], secondo = cand[1];
  // un rivale e' un altro cliente vicino al primo: alto in assoluto E senza un
  // distacco netto dal primo (100% contro 79% non e' un dubbio)
  const rivale = secondo && secondo.voce.cli !== primo.voce.cli &&
    secondo.affinita >= RIVALE && secondo.affinita >= primo.affinita - 0.12;
  if (primo.affinita >= NETTA && !rivale && sitiDelCliente(primo.voce.cli) === 1) {
    collega(primo.voce, 'auto');
    return esito('ok', `Riconosciuto dal file (${Math.round(primo.affinita * 100)}%).`);
  }
  scollega();
  esito('lista', primo.affinita >= NETTA && sitiDelCliente(primo.voce.cli) > 1
    ? `${primo.voce.cliente} ha piu’ siti: quale e’ questo?`
    : primo.affinita >= NETTA ? 'Somiglia anche ad altri siti: conferma quello giusto.'
    : 'Somiglia a questi siti: scegli quello giusto.', cand);
}

/* ------------------------------------------------------------- il dock --- */
function esito(tono, testo, cand = null) {
  esitoCorrente = { tono, testo, cand };
  disegna();
}
function chiudiLista() { if (esitoCorrente?.cand) esitoCorrente = { ...esitoCorrente, cand: null }; }

/* La riga dei dati del sito. Ogni voce e' un pezzo a se': quando l'indirizzo e'
   lungo la riga va a capo invece di tagliare - il pezzo che distingue due
   impianti dello stesso cliente sta quasi sempre in fondo. */
function metaSito() {
  const v = [];
  if (ctx.sito) v.push(`<span class="dest">${esc(ctx.sito)}</span>`);
  if (ctx.localita) v.push(esc(ctx.localita));
  v.push(`<span class="dato">#${ctx.id} · ${ctx.anno}</span>`);
  v.push(ctx.mese
    ? `spunta su ${MESI[ctx.mese - 1].toLowerCase()}`
    : 'mappatura non dovuta quest’anno');
  return v.join('');
}

function disegna() {
  const dock = $('#ponte');
  dock.hidden = false;
  const conSito = !!ctx.id;
  const e = esitoCorrente;

  /* La spina a sinistra e' l'unico segnale di stato: colore del collegamento,
     e in movimento mentre si prepara il PDF. */
  const tono = inCorso ? 'lavoro' : (e?.tono || (conSito ? 'ok' : 'idle'));
  dock.className = 't-' + tono;

  $('#ponteCosa').textContent = conSito ? 'consegna a' : 'a quale sito?';
  $('#ponteSito').hidden = !conSito;
  $('#ponteCerca').hidden = conSito;
  $('#ponteCambia').hidden = !conSito;
  if (conSito) {
    $('#ponteCliente').textContent = ctx.cliente || ('service #' + ctx.id);
    $('#ponteMeta').innerHTML = metaSito();
    const come = $('#ponteCome');
    come.textContent = { tracker: 'dal tracker', auto: 'riconosciuto dal file',
                         lista: 'scelto dalla lista', mano: 'scelto a mano' }[ctx.origine] || '';
    come.className = 'pn-come' + (ctx.origine === 'mano' ? ' mano' : '');
    come.hidden = !come.textContent;
  } else {
    $('#ponteCome').hidden = true;
  }

  // la fascia dell'esito: c'e' solo quando c'e' qualcosa da dire
  const stato = $('#ponteStato'), testo = stato.querySelector('span');
  if (e?.testo) {
    stato.hidden = false;
    stato.className = 'pn-strip ' + e.tono;
    if (!inCorso) stato.style.removeProperty('--p');
    if (testo.textContent !== e.testo) {
      testo.textContent = e.testo;
      stato.classList.remove('entra'); void stato.offsetWidth; stato.classList.add('entra');
    }
  } else {
    stato.hidden = true;
    stato.style.removeProperty('--p');
  }

  const salva = $('#ponteSalva');
  salva.disabled = inCorso || !conSito || !document.querySelectorAll('#pages .page').length;
  salva.querySelector('span').textContent = inCorso ? 'Salvo…' : 'Salva nel tracker';

  // la lista dei probabili
  const pan = $('#ponteScelte');
  if (e?.cand?.length) {
    pan.hidden = false;
    pan.querySelector('ul').innerHTML = e.cand.map(c => `
      <li><button type="button" data-id="${c.voce.id}">
        <span class="sc-aff" style="--a:${Math.round(c.affinita * 100)}%"><i></i><b>${Math.round(c.affinita * 100)}%</b></span>
        <span class="sc-nome"><b>${esc(c.voce.cliente)}</b><span>${esc(c.voce.dest)}</span></span>
        <span class="sc-meta">#${c.voce.id}${c.voce.loc ? ' · ' + esc(c.voce.loc) : ''}</span>
      </button></li>`).join('');
  } else {
    pan.hidden = true;
  }

  /* il nome del sito e la parola sul bottone sono cambiati: la pillola ha
     un'altra misura, e possono essere cambiate le condizioni per stringersi */
  rimisura();
  aggiorna();
}

function collegaDock() {
  $('#ponteScelte').addEventListener('click', e => {
    const b = e.target.closest('button[data-id]');
    if (!b) return;
    const s = siti?.find(x => x.id === Number(b.dataset.id));
    if (s) { collega(s, 'lista'); esito('ok', 'Collegato.'); }
  });
  $('#ponteChiudiScelte').onclick = () => { chiudiLista(); disegna(); };
  $('#ponteCambia').onclick = () => {
    esitoCorrente = null; scollega(); disegna();
    setTimeout(() => $('#ponteQ').focus(), 60);
  };

  const inp = $('#ponteQ');
  inp.addEventListener('focus', () => caricaSiti().catch(e => esito('errore', e.message)));
  inp.addEventListener('change', async () => {
    const m = /#(\d+)\s*$/.exec(inp.value);
    const lista = await caricaSiti().catch(() => []);
    const s = m && lista.find(x => x.id === Number(m[1]));
    if (!s) { if (inp.value.trim()) esito('errore', 'Scegli una voce dall’elenco.'); return; }
    inp.value = '';
    // a mano: se c'e' un file caricato che non gli somiglia, resta segnato
    const a = ultimoFile ? affinita(ultimoFile, s.nome, pesi) : 1;
    collega(s, a < PROBABILE ? 'mano' : 'lista');
    esito(a < PROBABILE ? 'dubbio' : 'ok', a < PROBABILE
      ? `Collegato a mano: il file “${ultimoFile}” non somiglia a questo sito.` : 'Collegato.');
  });

  $('#ponteSalva').onclick = salvaNelTracker;
  guarda();
  new MutationObserver(() => disegna()).observe($('#pages'), { childList: true });
  addEventListener('keydown', e => { if (e.key === 'Escape' && esitoCorrente?.cand) { chiudiLista(); disegna(); } });
}

/* ------------------------------------------------ la testata che si chiude --
   Lo scorrimento non accende uno stato: muove un CURSORE, `--r` da 0 (testata
   larga) a 1 (nuvoletta). Tutta la forma e' interpolata in CSS su quel numero
   (sezione LA NUVOLETTA in index.html); qui si decide solo quanto vale.

   Sulla corsa si smorza (`morbida`): a velocita' costante la pillola arriva di
   colpo, cosi' la stretta parte decisa e si posa. */
const CORSA = 170;                         // px di scorrimento per chiudere del tutto
const morbida = t => t * t * (3 - 2 * t);  // smoothstep

/** Quanto si e' scorso sotto le pagine. A scorrere e' #banco; sotto i 980px i
 *  pannelli si impilano e torna a scorrere la finestra. */
function quantoGiu() {
  const banco = $('#banco');
  return banco && banco.scrollHeight > banco.clientHeight + 1
    ? banco.scrollTop : (window.scrollY || 0);
}

function guarda() {
  const dock = $('#ponte');
  const secco = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let attesa = false, inMisura = false, larghezzaMisurata = -1;

  /* La testata resta larga in tre casi, e non sono capricci: senza un sito
     collegato sparirebbe la casella di ricerca; con la lista dei probabili
     aperta si sta scegliendo; mentre prepara il PDF l'avanzamento e' l'unica
     cosa che uno guarda. */
  const puoStringersi = () => !!ctx.id && !inCorso && $('#ponteScelte').hidden;

  /* La larghezza e l'altezza naturali della pillola: l'unica cosa che il CSS
     non sa ricavarsi da solo. Si prendono mettendo la testata a `--r:1` con
     larghezza libera per un fotogramma (invisibile).

     **Mai da un ResizeObserver.** Il primo giro ne aveva uno su #banco, e il
     risultato era una macchina impazzita: misurare cambia per un attimo la
     testata -> cambia l'altezza del banco -> l'osservatore riparte -> misura di
     nuovo, all'infinito. La misura si rifa' solo quando cambia davvero
     qualcosa: il contenuto (`disegna`) o la larghezza della colonna
     (confrontata in `aggiorna`, che gira gia' a ogni scorrimento). */
  const misuraPillola = () => {
    if (dock.hidden || inMisura) return;
    inMisura = true;
    dock.classList.add('misura');
    const r = dock.getBoundingClientRect();
    dock.classList.remove('misura');
    inMisura = false;
    if (r.width < 40) return;
    larghezzaMisurata = dock.parentElement.clientWidth;
    /* due pixel di respiro: alla misura esatta il nome del sito va a capo per
       un decimo di pixel, e la pillola diventa alta il doppio */
    dock.style.setProperty('--wpill', (Math.ceil(r.width) + 4) + 'px');
    dock.style.setProperty('--hpill', Math.ceil(r.height) + 'px');
  };

  /* setTimeout e non requestAnimationFrame: a scheda nascosta il rAF non gira,
     e la pillola resterebbe con la misura di prima - cioe' sbagliata appena si
     torna a guardarla */
  let inCoda = false;
  rimisura = () => {
    if (inCoda) return;
    inCoda = true;
    setTimeout(() => { inCoda = false; misuraPillola(); }, 0);
  };

  aggiorna = () => {
    /* la colonna si e' allargata (finestra ridimensionata, maniglie dei
       pannelli trascinate)? allora la pillola ha un'altra misura. Il confronto
       e' qui e non in un ResizeObserver di proposito: vedi il commento di
       misuraPillola */
    const largo = dock.parentElement.clientWidth;
    if (largo !== larghezzaMisurata) misuraPillola();

    let r = puoStringersi() ? Math.min(1, Math.max(0, quantoGiu() / CORSA)) : 0;
    r = secco ? (r > .5 ? 1 : 0) : morbida(r);
    if (r === stretta) return;
    stretta = r;
    dock.style.setProperty('--r', r.toFixed(3));
  };

  /* in cattura su window: a scorrere e' #banco, e lo scroll di un elemento non
     risale ai genitori (sotto i 980px scorre la finestra, e lo stesso ascolto
     copre anche quel caso) */
  addEventListener('scroll', () => {
    if (attesa) return;
    attesa = true;
    requestAnimationFrame(() => { attesa = false; aggiorna(); });
  }, { passive: true, capture: true });

  addEventListener('resize', () => { rimisura(); aggiorna(); });
  misuraPillola();
  aggiorna();
}

/* ------------------------------------------------------------- il PDF ---- */
/** Le pagine a schermo diventano un PDF A4. html2canvas clona l'intero
 *  documento a OGNI chiamata: chiamarlo pagina per pagina costava ~1 s a
 *  pagina. Qui si catturano LOTTI di pagine in una passata sola (una tela alta
 *  fino a ~18000 px) e poi si ritaglia: ~0,2 s a pagina.
 *
 *  Scala 2 (~192 dpi) in JPEG 0,74. Misurato sulle pagine a 8 schede di
 *  UMBERTO I (20a sessione): il tempo di resa NON dipende dalla scala (e' il
 *  clone del DOM a costare, 1,5 / 2 / 2,5 danno gli stessi ~2 s per lotto),
 *  quindi alzare la risoluzione e' gratis in tempo e costa solo byte: 171 KB
 *  a pagina a 1,5/0,8 -> ~225 KB a 2/0,74. Il PNG (senza perdita) sarebbe
 *  persino piu' piccolo nel PDF (136 KB) ma jsPDF lo decodifica in JS per
 *  ricomprimerlo, +0,4 s a pagina: su 128 pagine raddoppia l'attesa. Chrome
 *  scrive i PNG del canvas sempre in RGBA (colorType 6), anche con
 *  {alpha:false}, quindi non c'e' scorciatoia senza scriversi un encoder. */
const SCALA = 2, LOTTO = 8, QUALITA = 0.74;

async function generaPdf(avanza) {
  if (!window.html2canvas || !window.jspdf) throw new Error('librerie PDF non caricate');
  const tutte = [...document.querySelectorAll('#pages .page')];
  const k = $('#printPart')?.value || '';
  const pagine = k ? tutte.filter(p => p.getAttribute('data-part') === k) : tutte;
  if (!pagine.length) throw new Error('nessuna pagina in anteprima');

  /* chi scorre e' #banco (vedi il guscio in index.html): togliendo la scala
     alle pagine la colonna si accorcia di colpo, e senza rimettere lo
     scorrimento a posto alla fine si tornerebbe in cima al documento */
  const cont = $('#pages'), main = $('#banco') || $('#main');
  const trasf = cont.style.transform, scroll = main.scrollTop;
  cont.style.transform = 'none';
  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
  let anteprima = null, fatte = 0;
  try {
    for (let i = 0; i < pagine.length; i += LOTTO) {
      const lotto = pagine.slice(i, i + LOTTO);
      avanza(fatte, pagine.length);
      // le pagine del lotto finiscono per un attimo in un contenitore proprio,
      // cosi' la tela e' alta quanto loro e non quanto tutto il documento
      const w = document.createElement('div');
      lotto[0].before(w);
      lotto.forEach(p => w.appendChild(p));
      try {
        const tela = await window.html2canvas(w, { scale: SCALA, backgroundColor: '#ffffff',
                                                   logging: false, useCORS: true });
        const wr = w.getBoundingClientRect();
        for (const p of lotto) {
          const r = p.getBoundingClientRect();
          const s = document.createElement('canvas');
          s.width = Math.round(r.width * SCALA); s.height = Math.round(r.height * SCALA);
          s.getContext('2d').drawImage(tela,
            Math.round((r.left - wr.left) * SCALA), Math.round((r.top - wr.top) * SCALA),
            s.width, s.height, 0, 0, s.width, s.height);
          if (fatte) pdf.addPage();
          pdf.addImage(s.toDataURL('image/jpeg', QUALITA), 'JPEG', 0, 0, 210, 297, undefined, 'FAST');
          if (!fatte) anteprima = miniatura(s);
          fatte++;
        }
      } finally {
        lotto.forEach(p => w.before(p));
        w.remove();
      }
      avanza(fatte, pagine.length);
      await new Promise(r => setTimeout(r, 0));
    }
    return { blob: pdf.output('blob'), pagine: pagine.length, anteprima };
  } finally {
    cont.style.transform = trasf;
    main.scrollTop = scroll;
  }
}

function miniatura(tela) {
  const c = document.createElement('canvas');
  c.width = 240; c.height = Math.round(240 * tela.height / tela.width);
  c.getContext('2d').drawImage(tela, 0, 0, c.width, c.height);
  const d = c.toDataURL('image/jpeg', 0.72);
  return d.length < 80000 ? d : null;
}

/** Il nome del file consegnato. Il titolo del documento di regola viene gia' dal
 *  sito (vedi titoloSito), quindi ripetere il cliente davanti darebbe
 *  "NIPPON SANSO - NIPPON SANSO - 2026": il cliente si mette solo se il titolo
 *  non lo contiene gia'. */
function nomeFile() {
  const titolo = ($('#docTitle')?.value || '').trim();
  const chi = ctx.cliente || ctx.sito || '';
  const ripete = chi && titolo && soloLettere(titolo).includes(soloLettere(chi));
  const base = [ripete ? '' : (chi || 'sito'), titolo || 'schede tecnici', ctx.anno]
    .filter(Boolean).join(' - ');
  return base.replace(/[\\/:*?"<>|]+/g, '_').slice(0, 120) + '.pdf';
}

/** L'avanzamento e' la fascia stessa che si riempie dietro alla frase: una
 *  barra in piu' direbbe la stessa cosa in un posto diverso. */
function progresso(fatte, totale) {
  esitoCorrente = { tono: 'lavoro', testo: `Preparo il PDF · ${fatte} di ${totale} pagine` };
  disegna();
  $('#ponteStato').style.setProperty('--p', totale ? (fatte / totale * 100).toFixed(1) + '%' : '0%');
}

/** Il bottone del dock: solo la consegna al tracker. */
const salvaNelTracker = () => esportaESalva({ scarica: false });

/** Il PDF si produce UNA volta; poi si scarica sul computer (`scarica`) e, se
 *  c'e' un sito collegato e una sessione buona, si consegna al tracker. Se una
 *  delle due meta' non si puo' fare, l'altra si fa comunque e la fascia dice
 *  cosa e' successo: un PDF scaricato e non archiviato e' un esito, non un
 *  errore. */
async function esportaESalva({ scarica = true } = {}) {
  if (inCorso) return;
  const collegato = !!ctx.id;
  const sessione = !(inNuvola() && !nuvola.haSessione());
  if (!scarica) {
    if (!collegato) { esito('errore', 'Collega prima un sito.'); $('#ponteQ')?.focus(); return; }
    if (!sessione) return esito('errore', 'Sessione del tracker non trovata: entra nel tracker e riprova.');
  }
  inCorso = true;
  document.body.classList.add('ponte-lavora');
  const t0 = performance.now();
  try {
    const { blob, pagine, anteprima } = await generaPdf(progresso);
    const nome = nomeFile();
    if (scarica) scaricaFile(blob, nome);
    const mb = (blob.size / 1048576).toFixed(1).replace('.', ',');
    if (!collegato || !sessione) {
      return esito('dubbio', `Scaricato “${nome}” (${pagine} pag., ${mb} MB), ma non salvato nel tracker: ` +
        (collegato ? 'entra nel tracker e riprova.' : 'nessun sito collegato.'));
    }
    esitoCorrente = { tono: 'lavoro', testo: 'Consegno al tracker…' }; disegna();
    const r = await salvaDocumento({
      id_service: ctx.id, anno: ctx.anno, mese: ctx.mese || null,
      nome, pdf: blob, pagine, anteprima,
    });
    const mese = r.mese ? MESI[r.mese - 1] : '';
    const sec = ((performance.now() - t0) / 1000).toFixed(1).replace('.', ',');
    esito('ok', `${scarica ? 'Scaricato e salvato' : 'Salvato'} nel tracker · ${pagine} pag., ${mb} MB in ${sec} s` +
      (mese ? (r.cella?.esito === 'gia-cosi' ? ` · “stampata” era gia’ su ${mese}`
                                            : ` · spunta “stampata” su ${mese}`)
            : ' · nessuna spunta: mappatura non dovuta quest’anno'));
  } catch (e) {
    esito('errore', 'Non salvato: ' + (e?.message || e));
  } finally {
    inCorso = false;
    document.body.classList.remove('ponte-lavora');
    disegna();
  }
}

/** Il PDF sul computer, col nome con cui il tracker lo archivia. */
function scaricaFile(blob, nome) {
  const u = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: u, download: nome });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(u), 60000);
}

/* ---------------------------------------------- gli agganci al generatore -- */
function agganci() {
  // il bottone del generatore: PDF scaricato + consegnato al tracker. La stampa
  // del browser resta su Ctrl+P (stampaBrowser in index.html)
  $('#print').onclick = () => esportaESalva();
  // il caricamento di un file: loadRows e' una funzione globale del generatore,
  // riassegnarla su window vale anche per le chiamate interne. Con `label`
  // e' l'esempio della guida: quello non si riconosce.
  const caricaOriginale = window.loadRows;
  if (typeof caricaOriginale === 'function') {
    window.loadRows = function (rows, name, label) {
      const r = caricaOriginale.apply(this, arguments);
      /* il titolo del FOGLIO, non quello che c'e' scritto nel campo: se il
         campo lo riempie il sito ancora collegato (titleFromSite), il file
         nuovo verrebbe riconosciuto con il nome del sito vecchio - e tutti e
         due risulterebbero al 100% */
      if (r !== false && !label) riconosci(String(name || ''), window.SHEET_TITLE || '');
      return r;
    };
  }
  const togliOriginale = window.unloadFile;
  if (typeof togliOriginale === 'function') {
    window.unloadFile = function () {
      const r = togliOriginale.apply(this, arguments);
      ultimoFile = '';
      if (ctx.origine !== 'tracker') { esitoCorrente = null; scollega(); disegna(); }
      return r;
    };
  }
}

/* ---------------------------------------------------------------- avvio -- */
(async function avvia() {
  collegaDock();
  agganci();
  disegna();
  dilloAlTitolo();      // arrivando dal tracker il sito c'e' gia' nell'indirizzo
  if (inNuvola() && !nuvola.haSessione()) {
    return esito('errore', 'Non sei collegato al tracker: entra da Crono Mappature per salvare i PDF.');
  }
  try { await avviaSessione(); } catch { }
  caricaSiti().catch(() => { });      // pronti per il riconoscimento del file
})();
