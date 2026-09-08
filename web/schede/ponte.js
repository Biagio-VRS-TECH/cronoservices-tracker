/* ponte.js - il generatore di schede tecnici parla con Crono Mappature.
   #ANCHOR: ponte

Il generatore (index.html in questa cartella) e' rimasto quello che era: una
pagina sola, offline, che da un Excel fa fogli A4. Questo modulo gli aggiunge il
legame col tracker, che vive nella stessa origine:

  1. il DOCK in testa all'anteprima (sempre visibile, staccato dai bordi) dice a
     quale SITO e' collegato il lavoro. Arriva nell'indirizzo
     (/schede/?service=ID&anno=..&mese=..) oppure si RICONOSCE dal nome del file
     Excel e dal titolo del foglio, con la stessa tolleranza alle grafie della
     ricerca del tracker (js/affinita.js): corrispondenza netta e un solo sito
     -> collegato da solo; piu' siti o corrispondenza parziale -> lista dei
     probabili; niente -> avviso, e si sceglie a mano (segnato come tale);
  2. alla STAMPA, oltre alla finestra di stampa del browser (che resta com'era),
     le pagine diventano un PDF (html2canvas + jsPDF, in lib/) consegnato al
     tracker: file archiviato, riga in `documenti`, spunta "stampata" sul mese
     della mappatura. Il tracker mostra l'icona accanto al nome del sito;
  3. il tema segue quello scelto nel tracker.

Nessuna verifica e' possibile su cosa succede DENTRO la finestra di stampa di
Windows (il browser non lo dice a nessuno): il fatto certo che il tracker
registra e' "il PDF esiste", ed e' quello che mette la spunta. */
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

function collega(s, origine) {
  Object.assign(ctx, { id: s.id, mese: s.mese, sito: s.dest, cliente: s.cliente,
                       localita: s.loc, origine });
  const u = new URL(location.href);
  u.searchParams.set('service', s.id); u.searchParams.set('mese', s.mese || '');
  u.searchParams.set('sito', s.dest); u.searchParams.set('cliente', s.cliente);
  history.replaceState(null, '', u);
}

function scollega() {
  Object.assign(ctx, { id: 0, mese: 0, sito: '', cliente: '', localita: '', origine: '' });
  const u = new URL(location.href);
  for (const k of ['service', 'mese', 'sito', 'cliente']) u.searchParams.delete(k);
  history.replaceState(null, '', u);
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
    return esito('ok', `Riconosciuto dal nome del file (${Math.round(primo.affinita * 100)}%).`);
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

function disegna() {
  const dock = $('#ponte');
  dock.hidden = false;
  const conSito = !!ctx.id;
  const e = esitoCorrente;

  // il chip del sito
  $('#ponteSito').hidden = !conSito;
  $('#ponteCerca').hidden = conSito;
  if (conSito) {
    $('#ponteCliente').textContent = ctx.cliente || ('service #' + ctx.id);
    $('#ponteDest').textContent = ctx.sito || '';
    const mese = ctx.mese ? MESI[ctx.mese - 1] : '';
    $('#ponteMeta').textContent = `#${ctx.id} · ${ctx.anno}` +
      (ctx.localita ? ' · ' + ctx.localita : '') +
      (mese ? ` · spunta su ${mese}` : ' · mappatura non dovuta quest’anno');
    const come = $('#ponteCome');
    come.textContent = { tracker: 'dal tracker', auto: 'riconosciuto dal file',
                         lista: 'scelto dalla lista', mano: 'scelto a mano' }[ctx.origine] || '';
    come.className = 'ponte-come' + (ctx.origine === 'mano' ? ' mano' : '');
    come.hidden = !come.textContent;
  }

  // il led e lo stato
  const tono = inCorso ? 'lavoro' : (e?.tono || (conSito ? 'ok' : 'idle'));
  $('#ponteLed').className = 'ponte-led ' + tono;
  const stato = $('#ponteStato');
  if (e?.testo) {
    stato.hidden = false;
    stato.className = 'ponte-stato ' + e.tono;
    if (stato.textContent !== e.testo) {
      stato.textContent = e.testo;
      stato.classList.remove('entra'); void stato.offsetWidth; stato.classList.add('entra');
    }
  } else {
    stato.hidden = true;
  }
  $('#ponteSalva').disabled = inCorso || !conSito || !document.querySelectorAll('#pages .page').length;
  $('#ponteSalva').querySelector('span').textContent = inCorso ? 'Salvo…' : 'Salva nel tracker';

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
  new MutationObserver(() => disegna()).observe($('#pages'), { childList: true });
  addEventListener('keydown', e => { if (e.key === 'Escape' && esitoCorrente?.cand) { chiudiLista(); disegna(); } });
}

/* ------------------------------------------------------------- il PDF ---- */
/** Le pagine a schermo diventano un PDF A4. html2canvas clona l'intero
 *  documento a OGNI chiamata: chiamarlo pagina per pagina costava ~1 s a
 *  pagina. Qui si catturano LOTTI di pagine in una passata sola (una tela alta
 *  fino a ~14000 px) e poi si ritaglia: ~0,2 s a pagina. Scala 1,5 (~145 dpi)
 *  in JPEG 0,8: ~100 KB a pagina, leggibile anche a 8 schede per foglio. */
const SCALA = 1.5, LOTTO = 8, QUALITA = 0.8;

async function generaPdf(avanza) {
  if (!window.html2canvas || !window.jspdf) throw new Error('librerie PDF non caricate');
  const tutte = [...document.querySelectorAll('#pages .page')];
  const k = $('#printPart')?.value || '';
  const pagine = k ? tutte.filter(p => p.getAttribute('data-part') === k) : tutte;
  if (!pagine.length) throw new Error('nessuna pagina in anteprima');

  const cont = $('#pages'), main = $('#main');
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

function nomeFile() {
  const titolo = $('#docTitle')?.value?.trim();
  const base = [ctx.cliente || ctx.sito || 'sito', titolo || 'schede tecnici', ctx.anno]
    .filter(Boolean).join(' - ');
  return base.replace(/[\\/:*?"<>|]+/g, '_').slice(0, 120) + '.pdf';
}

function progresso(fatte, totale) {
  const bar = $('#ponteProg');
  bar.hidden = false;
  bar.style.setProperty('--p', totale ? (fatte / totale * 100).toFixed(1) + '%' : '0%');
  esitoCorrente = { tono: 'lavoro', testo: `Preparo il PDF · ${fatte} di ${totale} pagine` };
  disegna();
}

/** Il giro completo: PDF -> tracker -> esito nel dock. */
async function salvaNelTracker() {
  if (inCorso) return;
  if (!ctx.id) { esito('errore', 'Collega prima un sito.'); $('#ponteQ')?.focus(); return; }
  if (inNuvola() && !nuvola.haSessione()) {
    return esito('errore', 'Sessione del tracker non trovata: entra nel tracker e riprova.');
  }
  inCorso = true;
  document.body.classList.add('ponte-lavora');
  const t0 = performance.now();
  try {
    const { blob, pagine, anteprima } = await generaPdf(progresso);
    esitoCorrente = { tono: 'lavoro', testo: 'Consegno al tracker…' }; disegna();
    const r = await salvaDocumento({
      id_service: ctx.id, anno: ctx.anno, mese: ctx.mese || null,
      nome: nomeFile(), pdf: blob, pagine, anteprima,
    });
    const mese = r.mese ? MESI[r.mese - 1] : '';
    const sec = ((performance.now() - t0) / 1000).toFixed(1).replace('.', ',');
    const mb = (blob.size / 1048576).toFixed(1).replace('.', ',');
    esito('ok', `Salvato nel tracker · ${pagine} pag., ${mb} MB in ${sec} s` +
      (mese ? (r.cella?.esito === 'gia-cosi' ? ` · “stampata” era gia’ su ${mese}`
                                            : ` · spunta “stampata” su ${mese}`)
            : ' · nessuna spunta: mappatura non dovuta quest’anno'));
  } catch (e) {
    esito('errore', 'Non salvato: ' + (e?.message || e));
  } finally {
    inCorso = false;
    $('#ponteProg').hidden = true;
    document.body.classList.remove('ponte-lavora');
    disegna();
  }
}

/* ---------------------------------------------- gli agganci al generatore -- */
function agganci() {
  // la stampa del browser resta quella di sempre; dopo, il PDF al tracker
  const btn = $('#print');
  const stampaOriginale = btn.onclick;
  btn.onclick = function (e) {
    stampaOriginale?.call(this, e);
    if (ctx.id) salvaNelTracker();
    else esito('dubbio', 'Stampato, ma non salvato nel tracker: nessun sito collegato.');
  };
  // il caricamento di un file: loadRows e' una funzione globale del generatore,
  // riassegnarla su window vale anche per le chiamate interne. Con `label`
  // e' l'esempio della guida: quello non si riconosce.
  const caricaOriginale = window.loadRows;
  if (typeof caricaOriginale === 'function') {
    window.loadRows = function (rows, name, label) {
      const r = caricaOriginale.apply(this, arguments);
      if (r !== false && !label) riconosci(String(name || ''), $('#docTitle')?.value || '');
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
  if (inNuvola() && !nuvola.haSessione()) {
    return esito('errore', 'Non sei collegato al tracker: entra da Crono Mappature per salvare i PDF.');
  }
  try { await avviaSessione(); } catch { }
  caricaSiti().catch(() => { });      // pronti per il riconoscimento del file
})();
