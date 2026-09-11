/* ponte.js - un generatore di PDF parla con Crono Mappature.  #ANCHOR: ponte

Due generatori vivono nella stessa origine del tracker e producono fogli A4 da
un Excel: le SCHEDE TECNICI (web/schede/, per i tecnici) e il REGISTRO DEI
COMPONENTI (web/registro/, per il cliente). Il legame col tracker e' lo stesso
per tutti e due, ed e' questo modulo:

  1. la TESTATA della colonna dell'anteprima dice a quale SITO e' collegato il
     lavoro. Non galleggia sopra le pagine: sta fuori dal riquadro che scorre
     (#banco), quindi resta in vista da sola e non ne copre nessuna. La spina
     colorata a sinistra e' lo stato del collegamento, la fascia in basso
     l'esito e l'avanzamento. Il sito arriva nell'indirizzo
     (?service=ID&anno=..&mese=..) oppure si RICONOSCE dal nome del file Excel e
     dal titolo del foglio, con la stessa tolleranza alle grafie della ricerca
     del tracker (js/affinita.js): corrispondenza netta e un solo sito ->
     collegato da solo; piu' siti o corrispondenza parziale -> lista dei
     probabili; niente -> avviso, e si sceglie a mano (segnato come tale);
  2. "ESPORTA E SALVA" (il bottone del generatore) e "Salva nel tracker" (nella
     testata) producono lo stesso PDF (html2canvas + jsPDF, in web/lib/): il
     primo lo scarica anche sul computer, tutti e due lo consegnano al tracker -
     file archiviato, riga in `documenti` col suo `tipo`. Per le schede la
     consegna mette anche la spunta "stampata" sulla prima visita in arrivo
     (#ANCHOR: mese-stampa); per il registro NO: e' un documento per il
     cliente, non un passo della mappatura. Il tracker mostra l'icona accanto
     al nome del sito;
  3. il tema segue quello scelto nel tracker.

Il generatore chiama `avviaPonte(cfg)` una volta e riceve indietro le tre cose
che gli servono: `riconosci(nomeFile, titolo)` quando carica un file,
`fileTolto()` quando lo toglie, `esportaESalva()` per il suo bottone. Il markup
della testata (#ponte e figli) e' lo stesso nelle due pagine: vedi
web/schede/index.html, sezione "ponte", e css/ponte.css. */
import { chiama, avviaSessione, inNuvola } from './api.js';
import * as nuvola from './nuvola.js';
import { st, applica, mesePerStampa } from './stato.js';
import { salvaDocumento } from './documenti.js';
import { affinita, pesiParole } from './affinita.js';

const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const MESI = ['Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno',
  'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre'];

/* Soglie del riconoscimento dal nome del file. */
const NETTA = 0.88;      // da qui in su e' lui, se non ha rivali
const PROBABILE = 0.5;   // da qui in su entra nella lista dei probabili
const RIVALE = 0.72;     // un secondo candidato di un ALTRO cliente sopra questa soglia toglie l'automatismo

/* Cio' che distingue i due generatori. `tipo` e' il valore che finisce in
   `documenti.tipo`; `spunta` dice se la consegna mette "stampata". */
const PROFILI = {
  schede: {
    tipo: 'schede', spunta: true,
    cosa: 'schede tecnici', ripiego: 'schede tecnici',
    consegna: 'consegna a',
    titoloSalva: 'Produce il PDF e lo consegna al tracker (spunta “stampata” compresa) senza aprire la finestra di stampa',
  },
  registro: {
    tipo: 'registro', spunta: false,
    cosa: 'registro componenti', ripiego: 'Registro componenti',
    consegna: 'registro per',
    titoloSalva: 'Produce il PDF del registro e lo archivia nel tracker sul sito collegato (nessuna spunta: e’ un documento per il cliente)',
  },
};

const soloLettere = x => String(x || '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();

/**
 * Avvia il ponte. `cfg`:
 *   tipo        'schede' | 'registro'
 *   pagine()    -> [elementi .page da rendere, in ordine]   (default: #pages .page)
 *   fascicoli() -> [{fascicolo, fascicoli, pagine}]         (default: da data-part, o uno solo)
 *   titolo()    -> titolo del documento scritto nel generatore (per il nome del file)
 *   nomeFile(f) -> nome del PDF (default: "<cliente> - <titolo> - <anno>[ - fascicolo k di N].pdf")
 *   scorrevole  selettore di chi scorre (default '#banco')
 *   bottone     selettore del bottone del generatore che diventa "esporta e salva" (default '#print')
 *   suSito(nome) callback quando il sito collegato cambia ('' = nessuno)
 *   suEsito(e)   callback facoltativa a ogni esito {tono, testo}
 */
export function avviaPonte(cfg = {}) {
  const P = PROFILI[cfg.tipo] || PROFILI.schede;
  const pagineDi = cfg.pagine || (() => [...document.querySelectorAll('#pages .page')]);
  const titoloDoc = cfg.titolo || (() => ($('#docTitle')?.value || '').trim());
  const selScorr = cfg.scorrevole || '#banco';
  const selBottone = cfg.bottone || '#print';
  const suSito = cfg.suSito || (() => { });

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

  /* tema: niente da fare qui. I generatori leggono la stessa chiave del tracker
     (`cs.tema`, #ANCHOR: tema-unico in js/app.js) nel loro script di testa. */

  /* --------------------------------------------------------------- i siti -- */
  async function caricaSiti() {
    if (siti) return siti;
    const { ok, dati } = await chiama('/api/bootstrap?anno=' + ctx.anno);
    if (!ok) throw new Error(dati?.errore || 'elenco dei siti non disponibile');
    applica(dati);
    siti = [];
    for (const s of st.perServ.values()) {
      if (s.stato !== 'APERTO' || s.arch) continue;
      const cliente = st.clienti.get(s.cli)?.rs || '';
      // la spunta va sulla prima visita in arrivo, mai su una passata:
      // #ANCHOR: mese-stampa in js/stato.js
      siti.push({ id: s.id, dest: s.dest || '', loc: s.loc || '', cli: s.cli, cliente,
                  mese: mesePerStampa(s), nome: cliente + ' ' + (s.dest || '') });
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
     goffo. */
  function titoloSito() {
    if (!ctx.id) return '';
    const cli = (ctx.cliente || '').trim(), dest = (ctx.sito || '').trim();
    if (!cli || !dest) return cli || dest || ('service #' + ctx.id);
    const a = soloLettere(cli), b = soloLettere(dest);
    if (a.includes(b) || b.includes(a)) return a.length >= b.length ? cli : dest;
    return cli + ' – ' + dest;
  }
  const dilloAlTitolo = () => suSito(titoloSito(), { ...ctx });

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

  /** Il generatore ha tolto il file: si torna al punto di partenza, salvo che
   *  il sito fosse arrivato dal tracker (quello resta). */
  function fileTolto() {
    ultimoFile = '';
    if (ctx.origine !== 'tracker') { esitoCorrente = null; scollega(); disegna(); }
  }

  /* ------------------------------------------------------------- il dock --- */
  function esito(tono, testo, cand = null) {
    esitoCorrente = { tono, testo, cand };
    cfg.suEsito?.(esitoCorrente);
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
    if (P.spunta) {
      v.push(ctx.mese
        ? `spunta su ${MESI[ctx.mese - 1].toLowerCase()}`
        : 'mappatura non dovuta quest’anno');
    } else {
      v.push('archiviato senza spunta');
    }
    return v.join('');
  }

  function disegna() {
    const dock = $('#ponte');
    if (!dock) return;
    dock.hidden = false;
    const conSito = !!ctx.id;
    const e = esitoCorrente;

    /* La spina a sinistra e' l'unico segnale di stato: colore del collegamento,
       e in movimento mentre si prepara il PDF. */
    const tono = inCorso ? 'lavoro' : (e?.tono || (conSito ? 'ok' : 'idle'));
    dock.className = 't-' + tono;

    $('#ponteCosa').textContent = conSito ? P.consegna : 'a quale sito?';
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
    salva.disabled = inCorso || !conSito || !pagineDi().length;
    salva.title = P.titoloSalva;
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

    $('#ponteSalva').onclick = () => esportaESalva({ scarica: false });
    guarda();
    /* le pagine cambiate dal generatore: cambia "quante pagine ci sono", quindi
       il bottone si accende o si spegne. Non durante la resa del PDF: quelle
       mutazioni sono le nostre (rendiPagine sposta le pagine di lotto in lotto
       in un contenitore d'appoggio) e `progresso` ridisegna gia' per conto suo. */
    const pages = $('#pages');
    if (pages) {
      let prima = pages.querySelectorAll('.page').length;
      new MutationObserver(() => {
        if (!inCorso) disegna();
        const n = pages.querySelectorAll('.page').length;
        if (prima === 0 && n > 0) sfoglia(pages);
        prima = n;
      }).observe(pages, { childList: true, subtree: true });
    }
    addEventListener('keydown', e => { if (e.key === 'Escape' && esitoCorrente?.cand) { chiudiLista(); disegna(); } });
  }

  /* ------------------------------------------------------------ la sfogliata --
     Quando il documento NASCE (da zero pagine a qualcuna: il file appena
     caricato) le prime pagine salgono al loro posto una dopo l'altra, come
     fogli posati sul banco (css/ponte.css, #pages.sfoglia). Solo allora: le
     impaginazioni successive, a ogni impostazione toccata, non si muovono. */
  function sfoglia(pages) {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const pg = [...pages.querySelectorAll('.page')].slice(0, 14);
    pg.forEach((p, i) => p.style.setProperty('--k', String(i)));
    pages.classList.add('sfoglia');
    setTimeout(() => {
      pages.classList.remove('sfoglia');
      pg.forEach(p => p.style.removeProperty('--k'));
    }, 900 + pg.length * 70);
  }

  /* ------------------------------------------------ la testata che si chiude --
     Lo scorrimento non accende uno stato: muove un CURSORE, `--r` da 0 (testata
     larga) a 1 (nuvoletta). Tutta la forma e' interpolata in CSS su quel numero
     (css/ponte.css, sezione LA NUVOLETTA); qui si decide solo quanto vale.
     Le quattro trappole gia' pagate (niente ResizeObserver, line-height:0,
     transizione di --r a filo occupato, ordine delle regole) sono raccontate
     in web/schede/HANDOFF.md. */
  const CORSA = 170;                         // px di scorrimento per chiudere del tutto
  const morbida = t => t * t * (3 - 2 * t);  // smoothstep

  function quantoGiu() {
    const banco = $(selScorr);
    return banco && banco.scrollHeight > banco.clientHeight + 1
      ? banco.scrollTop : (window.scrollY || 0);
  }

  function guarda() {
    const dock = $('#ponte');
    /* dentro il pannello di sinistra (#side) la testata e' un gruppo come gli
       altri: non scorre con le pagine, quindi niente nuvoletta e niente misure */
    if (dock.closest('#side')) return;
    const secco = matchMedia('(prefers-reduced-motion: reduce)').matches;
    let attesa = false, inMisura = false, larghezzaMisurata = -1;

    const puoStringersi = () => !!ctx.id && !inCorso && $('#ponteScelte').hidden;

    const misuraPillola = () => {
      if (dock.hidden || inMisura) return;
      inMisura = true;
      dock.style.transition = 'none';
      dock.classList.add('misura');
      const r = dock.getBoundingClientRect();
      dock.classList.remove('misura');
      void dock.offsetWidth;
      dock.style.removeProperty('transition');
      inMisura = false;
      if (r.width < 40) return;
      larghezzaMisurata = dock.parentElement.clientWidth;
      dock.style.setProperty('--wpill', (Math.ceil(r.width) + 4) + 'px');
      dock.style.setProperty('--hpill', Math.ceil(r.height) + 'px');
    };

    let inCoda = false;
    rimisura = () => {
      if (inCorso || inCoda) return;
      inCoda = true;
      setTimeout(() => { inCoda = false; misuraPillola(); }, 0);
    };

    const scriviR = (r, immediato) => {
      if (r === stretta) return;
      stretta = r;
      if (immediato) dock.style.transition = 'none';
      dock.style.setProperty('--r', r.toFixed(3));
      if (immediato) { void dock.offsetWidth; dock.style.removeProperty('transition'); }
    };

    aggiorna = (immediato = false) => {
      const largo = dock.parentElement.clientWidth;
      if (largo !== larghezzaMisurata) misuraPillola();
      let r = puoStringersi() ? Math.min(1, Math.max(0, quantoGiu() / CORSA)) : 0;
      r = secco ? (r > .5 ? 1 : 0) : morbida(r);
      scriviR(r, immediato);
    };

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
  /* Scala 3 (~288 dpi, la risoluzione di una stampa vera) in JPEG 0,8. Il tempo
     di resa NON dipende dalla scala (e' il clone del DOM a costare), quindi la
     risoluzione e' gratis in tempo e costa solo byte (~300 KB a pagina). Il
     lotto e' di 5 pagine perche' a scala 3 una tela di 8 supererebbe i 200 MB. */
  const SCALA = 3, LOTTO = 5, QUALITA = 0.8;

  /** Le pagine in anteprima divise per FASCICOLO (data-part, messo dal
   *  generatore). Con la tendina "solo il fascicolo k" resta quello; altrimenti
   *  tutti, nell'ordine. Un documento non diviso e' un fascicolo solo. */
  function fascicoliInAnteprima() {
    if (cfg.fascicoli) return cfg.fascicoli();
    const tutte = pagineDi();
    const k = $('#printPart')?.value || '';
    const per = new Map();
    for (const p of tutte) {
      const part = p.getAttribute('data-part') || '1';
      if (!per.has(part)) per.set(part, []);
      per.get(part).push(p);
    }
    const N = per.size;
    const chiavi = [...per.keys()];
    return chiavi.filter(x => !k || x === k)
      .map(x => ({ fascicolo: chiavi.indexOf(x) + 1, fascicoli: N, pagine: per.get(x) }));
  }

  /** Un PDF per fascicolo: [{blob, pagine, anteprima, fascicolo, fascicoli}]. */
  async function generaPdfs(avanza) {
    if (!window.html2canvas || !window.jspdf) throw new Error('librerie PDF non caricate');
    const fasc = fascicoliInAnteprima();
    const totale = fasc.reduce((n, f) => n + f.pagine.length, 0);
    if (!totale) throw new Error('nessuna pagina in anteprima');

    /* chi scorre e' #banco: togliendo la scala alle pagine la colonna si
       accorcia di colpo, e senza rimettere lo scorrimento a posto alla fine si
       tornerebbe in cima al documento */
    const cont = $('#pages'), main = $(selScorr) || $('#main');
    const trasf = cont?.style.transform, scroll = main?.scrollTop;
    if (cont) cont.style.transform = 'none';
    let fatteTot = 0;
    const out = [];
    try {
      for (const f of fasc) {
        const r = await rendiPagine(f.pagine, n => avanza(fatteTot + n, totale));
        fatteTot += f.pagine.length;
        out.push({ ...r, fascicolo: f.fascicolo, fascicoli: f.fascicoli });
      }
      return out;
    } finally {
      if (cont) cont.style.transform = trasf;
      if (main) main.scrollTop = scroll;
    }
  }

  async function rendiPagine(pagine, avanza) {
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
    let anteprima = null, fatte = 0;
    for (let i = 0; i < pagine.length; i += LOTTO) {
      const lotto = pagine.slice(i, i + LOTTO);
      avanza(fatte);
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
      avanza(fatte);
      await new Promise(r => setTimeout(r, 0));
    }
    return { blob: pdf.output('blob'), pagine: pagine.length, anteprima };
  }

  function miniatura(tela) {
    const c = document.createElement('canvas');
    c.width = 240; c.height = Math.round(240 * tela.height / tela.width);
    c.getContext('2d').drawImage(tela, 0, 0, c.width, c.height);
    const d = c.toDataURL('image/jpeg', 0.72);
    return d.length < 80000 ? d : null;
  }

  /** Il nome del file consegnato. Il titolo del documento di regola viene gia'
   *  dal sito, quindi il cliente si mette davanti solo se il titolo non lo
   *  contiene gia'. */
  function nomeFile(f) {
    if (cfg.nomeFile) return cfg.nomeFile(f, { ...ctx });
    const titolo = titoloDoc();
    const chi = ctx.cliente || ctx.sito || '';
    const ripete = chi && titolo && soloLettere(titolo).includes(soloLettere(chi));
    const base = [ripete ? '' : (chi || 'sito'), titolo || P.ripiego, ctx.anno]
      .filter(Boolean).join(' - ');
    const coda = f && f.fascicoli > 1 ? ` - fascicolo ${f.fascicolo} di ${f.fascicoli}` : '';
    return base.replace(/[\\/:*?"<>|]+/g, '_').slice(0, 120) + coda + '.pdf';
  }

  /** L'avanzamento e' la fascia stessa che si riempie dietro alla frase. */
  function progresso(fatte, totale) {
    esitoCorrente = { tono: 'lavoro', testo: `Preparo il PDF · ${fatte} di ${totale} pagine` };
    disegna();
    $('#ponteStato').style.setProperty('--p', totale ? (fatte / totale * 100).toFixed(1) + '%' : '0%');
    aggiornaLibretto();
  }

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
    aggiorna(true);
    apriLibretto();
    const t0 = performance.now();
    try {
      const docs = await generaPdfs(progresso);
      const N = docs.length, inFascicoli = docs[0].fascicoli > 1;
      const gruppo = inFascicoli ? crypto.randomUUID().replace(/-/g, '') : null;
      const pagine = docs.reduce((n, d) => n + d.pagine, 0);
      const bytes = docs.reduce((n, d) => n + d.blob.size, 0);
      const mb = (bytes / 1048576).toFixed(1).replace('.', ',');
      const cosa = N > 1 ? `${N} fascicoli` : `“${nomeFile(docs[0])}”`;
      if (scarica) {
        for (const [i, d] of docs.entries()) {
          if (i) await new Promise(r => setTimeout(r, 500));
          scaricaFile(d.blob, nomeFile(d));
        }
      }
      if (!collegato || !sessione) {
        return esito('dubbio', `${N > 1 ? 'Scaricati' : 'Scaricato'} ${cosa} (${pagine} pag., ${mb} MB), ma non salvato nel tracker: ` +
          (collegato ? 'entra nel tracker e riprova.' : 'nessun sito collegato.'));
      }
      let r = null;
      for (const [i, d] of docs.entries()) {
        esitoCorrente = { tono: 'lavoro', testo: N > 1 ? `Consegno al tracker · fascicolo ${i + 1} di ${N}…` : 'Consegno al tracker…' };
        disegna();
        $('#ponteStato').style.setProperty('--p', '100%');
        aggiornaLibretto();
        const ri = await salvaDocumento({
          id_service: ctx.id, anno: ctx.anno, mese: P.spunta ? (ctx.mese || null) : null,
          tipo: P.tipo,
          nome: nomeFile(d), pdf: d.blob, pagine: d.pagine, anteprima: d.anteprima,
          gruppo, fascicolo: inFascicoli ? d.fascicolo : null, fascicoli: inFascicoli ? d.fascicoli : null,
        });
        r = r || ri;                    // la spunta la mette il primo; gli altri trovano "gia' cosi'"
      }
      const mese = P.spunta && r?.mese ? MESI[r.mese - 1] : '';
      const sec = ((performance.now() - t0) / 1000).toFixed(1).replace('.', ',');
      let coda;
      if (!P.spunta) coda = ' · archiviato per il sito, nessuna spunta';
      else if (mese) coda = r.cella?.esito === 'gia-cosi' ? ` · “stampata” era gia’ su ${mese}` : ` · spunta “stampata” su ${mese}`;
      else coda = ' · nessuna spunta: mappatura non dovuta quest’anno';
      esito('ok', `${scarica ? (N > 1 ? 'Scaricati e salvati' : 'Scaricato e salvato') : (N > 1 ? 'Salvati' : 'Salvato')} nel tracker` +
        (N > 1 ? ` · ${N} fascicoli` : '') + ` · ${pagine} pag., ${mb} MB in ${sec} s` + coda);
    } catch (e) {
      esito('errore', 'Non salvato: ' + (e?.message || e));
    } finally {
      inCorso = false;
      document.body.classList.remove('ponte-lavora');
      chiudiLibretto();
      disegna();
    }
  }

  /* ------------------------------------------------------------- il libretto --
     Per tutta l'attesa della consegna (html2canvas, jsPDF, poi il caricamento
     nel tracker) l'anteprima si vela e in mezzo il documento SFOGLIA: un
     libretto piccolo fatto con le prime pagine vere, clonate e rimpicciolite,
     che girano una dopo l'altra avanti e indietro. Sotto, la frase di stato e
     l'avanzamento. Chiesto dal committente (11 settembre 2026): l'attesa e'
     vera, dai cinque ai venti secondi, e cosi' si vede che e' IL SUO documento
     che sta viaggiando. CSS in css/ponte.css, sezione IL LIBRETTO.
     I cloni perdono gli id (non devono farsi trovare dai getElementById dei
     generatori) e stanno FUORI da #pages: html2canvas fotografa solo le pagine
     vere e non li vede. */
  /* Un libro aperto: pagina 0 a sinistra, 3 fogli (fronte/retro = pagine 1-2,
     3-4, 5-6) e la pagina 7 come base a destra: OTTO facciate clonate. I
     tempi dell'animazione (css) sono scritti per 3 fogli: se il documento ha
     meno pagine si ripetono. Sempre in avanti, poi il libro si chiude e si
     riapre da capo - l'attesa puo' durare anche un minuto. */
  const FOGLI = 3;
  function apriLibretto() {
    chiudiLibretto(true);
    const main = $(selScorr)?.parentElement || $('#main');
    const fonte = pagineDi().slice(0, 2 * FOGLI + 2);
    if (!main || !fonte.length) return;
    const pagina = i => fonte[i % fonte.length];
    const largo = fonte[0].offsetWidth || 794, alto = fonte[0].offsetHeight || 1123;
    const W = 150, S = W / largo, Hh = Math.round(alto * S);
    const faccia = (i, classe) => {
      const f = document.createElement('div'); f.className = 'lb-faccia ' + (classe || '');
      const c = pagina(i).cloneNode(true);
      c.removeAttribute('id'); c.classList.remove('flash');
      c.querySelectorAll('[id]').forEach(e => e.removeAttribute('id'));
      c.style.cssText = `transform:scale(${S});transform-origin:0 0;width:${largo}px;height:${alto}px;margin:0;box-shadow:none;`;
      f.appendChild(c); return f;
    };
    const lb = document.createElement('div');
    lb.id = 'libretto'; lb.className = 'libretto'; lb.setAttribute('aria-hidden', 'true');
    lb.style.setProperty('--lb-w', W + 'px'); lb.style.setProperty('--lb-h', Hh + 'px');
    const libro = document.createElement('div'); libro.className = 'lb-libro';
    const ombra = document.createElement('i'); ombra.className = 'lb-ombra';
    const sx = document.createElement('div'); sx.className = 'lb-sx'; sx.appendChild(faccia(0));
    const dx = document.createElement('div'); dx.className = 'lb-dx'; dx.appendChild(faccia(2 * FOGLI + 1));
    for (let k = 0; k < FOGLI; k++) {
      const f = document.createElement('div'); f.className = 'lb-foglia'; f.dataset.k = String(k);
      /* il primo foglio (k=0) sta in cima alla pila di destra; voltato, il suo
         translateZ gira con lui e lo manda in fondo alla pila di sinistra */
      f.style.setProperty('--z', ((FOGLI - k) * 0.6).toFixed(1) + 'px');
      f.append(faccia(2 * k + 1, 'lb-fronte'), faccia(2 * k + 2, 'lb-retro'));
      dx.appendChild(f);
    }
    const dorso = document.createElement('i'); dorso.className = 'lb-dorso';
    libro.append(ombra, sx, dx, dorso);
    const frase = document.createElement('p'); frase.className = 'lb-frase'; frase.appendChild(document.createElement('span'));
    const barra = document.createElement('div'); barra.className = 'lb-barra'; barra.appendChild(document.createElement('i'));
    lb.append(libro, frase, barra);
    main.appendChild(lb);
    aggiornaLibretto();
  }
  function aggiornaLibretto() {
    const lb = $('#libretto');
    if (!lb) return;
    lb.querySelector('.lb-frase span').textContent = esitoCorrente?.testo || 'Preparo il PDF…';
    const p = $('#ponteStato')?.style.getPropertyValue('--p');
    lb.style.setProperty('--p', p || '0%');
  }
  function chiudiLibretto(subito = false) {
    const lb = $('#libretto');
    if (!lb) return;
    if (subito) { lb.remove(); return; }
    lb.classList.add('chiude');
    setTimeout(() => lb.remove(), 500);   // la dissolvenza dura .45s
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

  /* ---------------------------------------------------------------- avvio -- */
  (async function avvia() {
    collegaDock();
    const b = $(selBottone);
    if (b) b.onclick = () => esportaESalva();
    disegna();
    dilloAlTitolo();      // arrivando dal tracker il sito c'e' gia' nell'indirizzo
    if (inNuvola() && !nuvola.haSessione()) {
      return esito('errore', 'Non sei collegato al tracker: entra da Crono Mappature per salvare i PDF.');
    }
    try { await avviaSessione(); } catch { }
    caricaSiti().catch(() => { });      // pronti per il riconoscimento del file
  })();

  return { ctx, riconosci, fileTolto, esportaESalva, ridisegna: disegna, esito, titoloSito };
}
