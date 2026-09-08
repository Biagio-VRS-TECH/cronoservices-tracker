/* ponte.js - il generatore di schede tecnici parla con Crono Mappature.
   #ANCHOR: ponte

Il generatore (index.html in questa cartella) e' rimasto quello che era: una
pagina sola, offline, che da un Excel fa fogli A4. Questo modulo gli aggiunge il
legame col tracker, che vive nella stessa origine:

  1. la BARRA in testa all'anteprima dice a quale SITO e' collegato il lavoro
     (arriva nell'indirizzo: /schede/?service=ID&anno=..&mese=..) oppure lascia
     sceglierlo cercando fra i siti dell'anno;
  2. alla STAMPA, oltre alla finestra di stampa del browser (che resta com'era),
     le pagine diventano un PDF (html2canvas + jsPDF, in lib/) che viene
     consegnato al tracker: file archiviato, riga in `documenti`, spunta
     "stampata" sul mese della mappatura. Il tracker mostra l'icona accanto al
     nome del sito;
  3. il tema segue quello scelto nel tracker.

Nessuna verifica e' possibile su cosa succede DENTRO la finestra di stampa di
Windows (il browser non lo dice a nessuno): il fatto certo che il tracker
registra e' "il PDF esiste", ed e' quello che mette la spunta. */
import { chiama, avviaSessione, inNuvola } from '../js/api.js';
import * as nuvola from '../js/nuvola.js';
import { st, applica, mappaturaSito } from '../js/stato.js';
import { salvaDocumento } from '../js/documenti.js';

const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/* ---------------------------------------------------------- il contesto -- */
const q = new URLSearchParams(location.search);
const ctx = {
  anno: Number(q.get('anno')) || new Date().getFullYear(),
  id: Number(q.get('service')) || 0,
  mese: Number(q.get('mese')) || 0,
  sito: q.get('sito') || '',
  cliente: q.get('cliente') || '',
  localita: q.get('localita') || '',
};
let servizi = null;        // {id, dest, cliente, loc, mese} dell'anno, per la ricerca
let inCorso = false;

/* ----------------------------------------------------------------- tema -- */
/* Il tracker salva 'chiaro' | 'scuro' (o niente = sistema) in cs.tema; il
   generatore ha la sua terna. Si allinea senza sovrascrivere la scelta fatta
   qui dentro col selettore, che resta valida per la sessione. */
(function tema() {
  const t = localStorage.getItem('cs.tema');
  const mio = localStorage.getItem('vrsSchedeCampo.theme');
  if (!t || mio) return;
  window.setTheme?.(t === 'scuro' ? 'dark' : 'light', false);
})();

/* ---------------------------------------------------------------- barra -- */
function barra() {
  const b = $('#ponte');
  b.hidden = false;
  const conSito = !!ctx.id;
  $('#ponteCerca').hidden = conSito;
  $('#ponteSito').hidden = !conSito;
  if (conSito) {
    $('#ponteCliente').textContent = ctx.cliente || ('service #' + ctx.id);
    $('#ponteDest').textContent = ctx.sito || '';
    const mese = ctx.mese ? MESI[ctx.mese - 1] : '';
    $('#ponteMeta').textContent = `#${ctx.id} · ${ctx.anno}` +
      (ctx.localita ? ' · ' + ctx.localita : '') +
      (mese ? ` · spunta su ${mese}` : ' · mappatura non dovuta quest’anno');
    $('#ponteCambia').hidden = false;
  }
  $('#ponteSalva').disabled = !conSito;
  aggiornaSalvaAbilitato();
}
const MESI = ['Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno',
  'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre'];

function stato(testo, tono = '') {
  const s = $('#ponteStato');
  s.textContent = testo;
  s.className = 'ponte-stato' + (tono ? ' ' + tono : '');
  s.hidden = !testo;
}

/* Il bottone "Salva nel tracker" si accende solo quando c'e' qualcosa da
   salvare: un sito collegato e almeno una pagina in anteprima. */
function aggiornaSalvaAbilitato() {
  const pagine = document.querySelectorAll('#pages .page').length;
  $('#ponteSalva').disabled = inCorso || !ctx.id || !pagine;
}
new MutationObserver(aggiornaSalvaAbilitato).observe($('#pages'), { childList: true });

/* ----------------------------------------------------- scelta del sito --- */
/* Senza sito nell'indirizzo (bottone "Schede tecnici" della barra del tracker)
   si sceglie qui: l'elenco e' quello del tracker, letto una volta sola. Il mese
   della spunta lo dice lo stesso modello dell'anno del tracker (stato.js). */
async function caricaServizi() {
  if (servizi) return servizi;
  const { ok, dati } = await chiama('/api/bootstrap?anno=' + ctx.anno);
  if (!ok) throw new Error(dati?.errore || 'elenco dei siti non disponibile');
  applica(dati);
  servizi = [];
  for (const s of st.perServ.values()) {
    if (s.stato !== 'APERTO' || s.arch) continue;
    const ma = mappaturaSito(s);
    servizi.push({ id: s.id, dest: s.dest || '', loc: s.loc || '',
                   cliente: st.clienti.get(s.cli)?.rs || '', mese: ma.mese || ma.scad || 0 });
  }
  servizi.sort((a, b) => a.cliente.localeCompare(b.cliente) || a.dest.localeCompare(b.dest));
  const dl = $('#ponteLista');
  dl.replaceChildren(...servizi.map(s => Object.assign(document.createElement('option'),
    { value: `${s.cliente} · ${s.dest} · #${s.id}` })));
  return servizi;
}

function scegli(s) {
  Object.assign(ctx, { id: s.id, mese: s.mese, sito: s.dest, cliente: s.cliente, localita: s.loc });
  const u = new URL(location.href);
  u.searchParams.set('service', s.id); u.searchParams.set('mese', s.mese || '');
  u.searchParams.set('sito', s.dest); u.searchParams.set('cliente', s.cliente);
  history.replaceState(null, '', u);
  stato('');
  barra();
}

function collegaRicerca() {
  const inp = $('#ponteQ');
  inp.addEventListener('focus', () => caricaServizi().catch(e => stato(e.message, 'errore')));
  inp.addEventListener('change', async () => {
    const m = /#(\d+)\s*$/.exec(inp.value);
    const lista = await caricaServizi().catch(() => []);
    const s = m && lista.find(x => x.id === Number(m[1]));
    if (s) { scegli(s); inp.value = ''; }
    else if (inp.value.trim()) stato('Scegli una voce dall’elenco.', 'errore');
  });
  $('#ponteCambia').onclick = () => {
    ctx.id = 0;
    $('#ponteCambia').hidden = true;
    barra();
    setTimeout(() => inp.focus(), 50);
  };
}

/* ------------------------------------------------------------- il PDF ---- */
/** Le pagine a schermo diventano un PDF A4: ogni pagina e' resa in un'immagine
 *  (scala 2, ~190 dpi) e messa su un foglio. Non e' il PDF "vettoriale" della
 *  stampante, ma e' identico a quello che si vede e si stampa, e si legge bene.
 *  Rispetta la scelta "Stampa: tutto / fascicolo k" del pannello. */
async function generaPdf(avanza) {
  if (!window.html2canvas || !window.jspdf) throw new Error('librerie PDF non caricate');
  const tutte = [...document.querySelectorAll('#pages .page')];
  const k = $('#printPart')?.value || '';
  const pagine = k ? tutte.filter(p => p.getAttribute('data-part') === k) : tutte;
  if (!pagine.length) throw new Error('nessuna pagina in anteprima');

  // la cattura vuole le pagine a scala 1: lo zoom dell'anteprima si toglie e
  // si rimette, senza toccare il layout
  const cont = $('#pages'), main = $('#main');
  const trasf = cont.style.transform, scroll = main.scrollTop;
  cont.style.transform = 'none';
  try {
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
    let anteprima = null;
    for (let i = 0; i < pagine.length; i++) {
      avanza(i + 1, pagine.length);
      const tela = await window.html2canvas(pagine[i], {
        scale: 2, backgroundColor: '#ffffff', logging: false, useCORS: true,
        scrollX: 0, scrollY: 0,
      });
      if (i) pdf.addPage();
      pdf.addImage(tela.toDataURL('image/jpeg', 0.8), 'JPEG', 0, 0, 210, 297, undefined, 'FAST');
      if (i === 0) anteprima = miniatura(tela);
      await new Promise(r => setTimeout(r, 0));   // lascia respirare l'interfaccia
    }
    return { blob: pdf.output('blob'), pagine: pagine.length, anteprima };
  } finally {
    cont.style.transform = trasf;
    main.scrollTop = scroll;
  }
}

/* La prima pagina in piccolo (~12 KB): e' quella che il tracker mostra al
   passaggio del mouse sull'icona e nel pannello del sito. */
function miniatura(tela) {
  const c = document.createElement('canvas');
  c.width = 240; c.height = Math.round(240 * tela.height / tela.width);
  c.getContext('2d').drawImage(tela, 0, 0, c.width, c.height);
  const d = c.toDataURL('image/jpeg', 0.72);
  return d.length < 80000 ? d : null;
}

function nomeFile() {
  const titolo = $('#docTitle')?.value?.trim();
  const base = [ctx.cliente || ctx.sito || 'sito', titolo || 'schede tecnici', ctx.anno]
    .filter(Boolean).join(' - ');
  return base.replace(/[\\/:*?"<>|]+/g, '_').slice(0, 120) + '.pdf';
}

/** Il giro completo: PDF -> tracker -> esito nella barra. */
async function salvaNelTracker() {
  if (inCorso) return;
  if (!ctx.id) { stato('Collega prima un sito.', 'errore'); $('#ponteQ')?.focus(); return; }
  if (inNuvola() && !nuvola.haSessione()) {
    stato('Sessione del tracker non trovata: entra nel tracker e riprova.', 'errore');
    return;
  }
  inCorso = true; aggiornaSalvaAbilitato();
  document.body.classList.add('ponte-lavora');
  try {
    const { blob, pagine, anteprima } = await generaPdf((i, n) =>
      stato(`Preparo il PDF… pagina ${i} di ${n}`, 'lavoro'));
    stato('Consegno al tracker…', 'lavoro');
    const r = await salvaDocumento({
      id_service: ctx.id, anno: ctx.anno, mese: ctx.mese || null,
      nome: nomeFile(), pdf: blob, pagine, anteprima,
    });
    const mese = r.mese ? MESI[r.mese - 1] : '';
    const esito = r.cella?.esito;
    stato(`PDF salvato nel tracker (${pagine} pag.)` +
      (mese ? (esito === 'gia-cosi' ? ` · "stampata" era gia’ spuntata su ${mese}`
                                   : ` · spunta "stampata" messa su ${mese}`)
            : ' · nessuna spunta: mappatura non dovuta quest’anno'), 'ok');
  } catch (e) {
    stato('Non salvato: ' + (e?.message || e), 'errore');
  } finally {
    inCorso = false; aggiornaSalvaAbilitato();
    document.body.classList.remove('ponte-lavora');
  }
}

/* ------------------------------------------------------------ la stampa -- */
/* La stampa del browser resta quella di sempre (e' nel gestore gia' scritto
   dal generatore). Qui ci si aggancia DOPO: in Chrome e Firefox print() torna
   quando la finestra di stampa si chiude, con qualunque bottone. */
function agganciaStampa() {
  const btn = $('#print');
  const originale = btn.onclick;
  btn.onclick = function (e) {
    originale?.call(this, e);
    if (ctx.id) salvaNelTracker();
  };
}

/* ---------------------------------------------------------------- avvio -- */
(async function avvia() {
  barra();
  collegaRicerca();
  agganciaStampa();
  $('#ponteSalva').onclick = salvaNelTracker;
  if (inNuvola() && !nuvola.haSessione()) {
    // niente maschera di login qui (e' del tracker, coi suoi stili): si dice
    // dove andare a entrare
    stato('Non sei collegato al tracker: entra da Crono Mappature per salvare i PDF.', 'errore');
    return;
  }
  // il nome dell'operatore per la firma (in locale e' quello scritto nel tracker)
  try { await avviaSessione(); } catch { }
})();
