/* mese.js - il foglio di lavoro del mese: una scheda per IMPIANTO da visitare in
   quel mese, le caselle dei quattro passi, selezione multipla, stampabile.

   Attenzione all'unita': la mappatura e' una per SITO per anno (#ANCHOR:
   mappatura-anno in stato.js), e scade nel primo mese di manutenzione di quel
   sito. Le schede sono invece TUTTI gli impianti che si visitano in questo mese,
   scadenze e visite insieme. Percio' il riepilogo in testa tiene separate le due
   cose: quante mappature SCADONO qui (l'impegno, quello che si conta anche nella
   griglia e nelle statistiche) e quanti impianti ci sono da visitare (il lavoro
   sul campo, che e' di piu'). Chiamare "mappature" le schede faceva sembrare che
   ce ne fosse una per visita.
   #ANCHOR: vista-mese */
import { esc, ICO, quando, avviso, FRECCE, fuoco, frecceEntrano } from './ui.js';
import {
  st, lavoroDelMese, cella, statoCella, spunta, spuntaMolte, mappaturaSito,
  filtraStato, CAMPI, SIGLA, PASSI, ETICHETTA, BREVE, CLASSE_ET,
} from './stato.js';
import { apriCassetto } from './cassetto.js';

let radice = null;

function htmlPassi(id, mese) {
  const c = cella(id, mese);
  return `<div class="passi-riga">${CAMPI.map((campo, i) => `
    <button class="passo" role="checkbox" aria-checked="${!!c[SIGLA[campo]]}"
            data-campo="${campo}" data-cella="${id}-${mese}"
            title="${ETICHETTA[campo]} (tasto ${i + 1})">
      <span class="box">${ICO.ok}</span>
      <span class="et">${BREVE[campo]}</span>
    </button>`).join('')}</div>`;
}

/* I bolli dicono a che titolo la scheda e' in elenco quando NON e' un impegno
   certo del mese. La classe `visita` non ha bollo di proposito: il committente
   non vuole etichette in piu', la capsula col solo contorno nella vista Anno
   dice gia' che la mappatura scade altrove. */
const BOLLO = {
  'stima': ['stima', 'STIMA'],
  'da-rinnovare': ['darinnovare', 'CONTRATTO SCADUTO'],
  'non-tracciato': ['nontracciato', 'PRE-TRACCIAMENTO'],
};

function htmlScheda(v) {
  const e = statoCella(v.s.id, st.mese);
  const cl = ['scheda', e.completa && 'finita', e.ritardo && 'ritardo',
    !e.reale && 'previsione'].filter(Boolean).join(' ');
  const bollo = BOLLO[e.classe];
  return `<div class="${cl}" data-srv="${v.s.id}" tabindex="-1"
    aria-label="${esc(String(v.s.dest || '#' + v.s.id).replace(/\s+/g, ' '))}: ${e.n} di ${PASSI} passi">
    <label class="selez" title="Seleziona per azioni multiple">
      <input type="checkbox" data-sel="${v.s.id}" ${st.selezione.has(v.s.id) ? 'checked' : ''}>
    </label>
    <div class="info">
      <b title="${esc(v.s.dest)}">${esc(v.s.dest || '(senza destinazione)')}</b>
      <div class="meta">
        <span class="dato">#${v.s.id}</span>
        <span>${esc(v.s.loc || '')}${v.s.prov ? ' (' + esc(v.s.prov) + ')' : ''}</span>
        <span>${esc(v.s.tipo)}</span>
        <span>${esc(v.s.cad || '')}</span>
        ${bollo ? `<span class="bollo ${bollo[0]}" title="${esc(CLASSE_ET[e.classe])}">${bollo[1]}</span>` : ''}
        ${e.c.nota ? `<span title="${esc(e.c.nota)}">&#9679; nota</span>` : ''}
        ${e.c.at ? `<span class="dato">${esc(e.c.by || '')} ${quando(e.c.at)}</span>` : ''}
        <span class="tag completo" title="I ${PASSI} passi sono fatti">a posto</span>
      </div>
    </div>
    ${htmlPassi(v.s.id, st.mese)}
  </div>`;
}

/** Il mese senza il filtro di stato: alimenta i numeri della testa, che devono
 *  restare quelli del mese anche quando si guardano solo le complete. Senza
 *  filtro acceso e' lo stesso elenco, e non si rifa' il giro. */
const mesePieno = righe =>
  st.filtri.stato ? lavoroDelMese(st.mese, { ignoraStato: true }) : righe;

/** Le mappature che scadono in questo mese: una per SITO, contate come nella
 *  griglia e nelle statistiche. `righe` sono gli impianti a schermo coi filtri
 *  di adesso: le schede sono di piu' delle scadenze, perche' comprendono le
 *  visite dei mesi successivi al primo. */
function scadenzeDelMese(righe) {
  let tot = 0, complete = 0;
  for (const v of righe) {
    const ma = mappaturaSito(v.s);
    if (!ma.prevista || ma.scad !== st.mese) continue;
    tot++;
    if (ma.completa) complete++;
  }
  return { tot, complete };
}

/* Il corpo del foglio: separatori cliente + schede del mese corrente. */
function htmlCorpo(righe) {
  let corpo = '', ultimo = null;
  for (const v of righe) {
    if (v.cli.id !== ultimo) {
      ultimo = v.cli.id;
      corpo += `<div class="cli-sep"><span>${esc(v.cli.rs)}</span>
        <span class="dato" style="color:var(--tenue-2)">${v.cli.id}</span></div>`;
    }
    corpo += htmlScheda(v);
  }
  return corpo || `<div class="vuoto"><b>Nessuna mappatura in questo mese</b>
      Nessun service aperto ha ${st.mesiNome[st.mese - 1]} tra i mesi di manutenzione.</div>`;
}

/* I numeri contano SEMPRE il mese intero, anche col filtro di stato acceso:
   sono la fotografia del mese, e "complete" e' pure il bottone per vedere solo
   quelle (un secondo clic le rimette tutte). Se il filtro nasconde delle schede
   lo dice la riga di contesto, cosi' non sembra che i conti non tornino. */
const htmlRiepilogo = (tutte, sc, daStampare, mostrati) => `
        <div class="voce" title="Mappature dovute in questo mese: una per sito, annuale"><span class="n">${sc.tot}</span><span class="et">in scadenza</span></div>
        <div class="voce" title="Impianti con una visita di manutenzione in questo mese"><span class="n">${tutte.length}</span><span class="et">impianti</span></div>
        <div class="voce"><span class="n">${daStampare}</span><span class="et">da stampare</span></div>
        <button class="voce scelta${st.filtri.stato === 'complete' ? ' attiva' : ''}"
                data-stato="complete" aria-pressed="${st.filtri.stato === 'complete'}"
                title="Mappature di questo mese coi ${PASSI} passi fatti. Clicca per vedere solo quelle"><span class="n">${sc.complete}/${sc.tot}</span><span class="et">complete</span></button>
        ${mostrati === tutte.length ? '' :
    `<div class="voce" title="Schede che il filtro di stato lascia a schermo: gli altri numeri sono quelli del mese intero"><span class="n">${mostrati}</span><span class="et">a schermo</span></div>`}`;

export function disegna(area) {
  const righe = lavoroDelMese(st.mese);                    // quello che si vede
  const tutte = mesePieno(righe);                          // il mese intero
  const sc = scadenzeDelMese(tutte);
  const daStampare = tutte.filter(v => !cella(v.s.id, st.mese).s).length;

  area.innerHTML = `
    <div class="stampa-testa" hidden>
      <h1>Mappature ${st.mesiNome[st.mese - 1]} ${st.anno}</h1>
      <p>VRS Tech &middot; foglio di lavoro stampato il ${new Date().toLocaleString('it-IT')}
         &middot; ${sc.tot} mappature in scadenza &middot; ${righe.length} impianti</p>
    </div>
    <div class="mese-testa">
      <h2 class="mese-titolo">${st.mesiNome[st.mese - 1]} <span>${st.anno}</span></h2>
      <div class="mese-nav" style="--i:${st.mese - 1}">${st.mesi.map((m, i) =>
    `<button data-mese="${i + 1}" aria-pressed="${i + 1 === st.mese}">${m}</button>`).join('')}</div>
      <div class="riepilogo">${htmlRiepilogo(tutte, sc, daStampare, righe.length)}</div>
    </div>
    <div class="lavoro entra">${htmlCorpo(righe)}</div>`;
  radice = area;
  collega(area);
  area.querySelector('.scheda')?.setAttribute('tabindex', '0');
  barraMassa();
}

/** Cambio di mese dentro il foglio: la testa resta e l'indicatore della pista
 *  scivola (`--i`), si ricostruiscono solo titolo, numeri e schede. Ridisegnare
 *  tutto faceva lampeggiare la pista e perdeva il movimento. */
function cambiaMese(m) {
  st.mese = m;
  st.selezione.clear();
  if (!radice?.querySelector('.mese-nav')) return disegna(radice);
  const righe = lavoroDelMese(st.mese);
  const tutte = mesePieno(righe);
  const sc = scadenzeDelMese(tutte);
  const daStampare = tutte.filter(v => !cella(v.s.id, st.mese).s).length;
  const nav = radice.querySelector('.mese-nav');
  nav.style.setProperty('--i', String(st.mese - 1));
  for (const b of nav.children) b.setAttribute('aria-pressed', String(Number(b.dataset.mese) === st.mese));
  radice.querySelector('.mese-titolo').innerHTML = `${st.mesiNome[st.mese - 1]} <span>${st.anno}</span>`;
  radice.querySelector('.mese-testa .riepilogo').innerHTML =
    htmlRiepilogo(tutte, sc, daStampare, righe.length);
  const st1 = radice.querySelector('.stampa-testa');
  if (st1) {
    st1.querySelector('h1').textContent = `Mappature ${st.mesiNome[st.mese - 1]} ${st.anno}`;
    st1.querySelector('p').innerHTML = `VRS Tech &middot; foglio di lavoro stampato il ${new Date().toLocaleString('it-IT')}
         &middot; ${sc.tot} mappature in scadenza &middot; ${righe.length} impianti`;
  }
  const lav = radice.querySelector('.lavoro');
  lav.classList.remove('entra');
  lav.innerHTML = htmlCorpo(righe);
  void lav.offsetWidth;                 // riparte la comparsa
  lav.classList.add('entra');
  radice.querySelector('.scheda')?.setAttribute('tabindex', '0');
  barraMassa();
}

function collega(r) {
  if (r.__collegatoMese) return;
  r.__collegatoMese = true;
  r.addEventListener('click', e => {
    const m = e.target?.closest?.('[data-mese]');
    if (m) return cambiaMese(Number(m.dataset.mese));
    const fs = e.target?.closest?.('[data-stato]');
    if (fs) return filtraStato(fs.dataset.stato, true);
    const p = e.target.closest('.passo');
    if (p) {
      const [id, mese] = p.dataset.cella.split('-').map(Number);
      const campo = p.dataset.campo;
      spunta(id, mese, campo, !cella(id, mese)[SIGLA[campo]]);
      return;
    }
    const b = e.target.closest('.info b');
    if (b) apriCassetto(Number(b.closest('.scheda').dataset.srv));
  });
  /* Tastiera del foglio. L'unita' di lavoro e' la *scheda*, non la singola
     spunta: su/giu' evidenziano la scheda intera (nome, dati, bolli) e 1/2/3
     agiscono su quella. Girare col fuoco fra le caselle non serviva a nulla,
     visto che si spuntano coi numeri; destra/sinistra restano come scorciatoia
     per chi vuole entrare nei passi e tornare indietro. */
  r.addEventListener('keydown', e => {
    if (st.vista !== 'mese' || e.ctrlKey || e.altKey || e.metaKey) return;
    if (e.target?.matches?.('input:not([type=checkbox]),textarea,select')) return;
    const sch = e.target?.closest?.('.scheda');
    if (!sch) return;
    const passi = [...sch.querySelectorAll('.passo')];
    const passo = e.target.closest('.passo');

    const i = '1234'.indexOf(e.key);
    if (i >= 0) {                       // il fuoco non si sposta: resta la scheda
      e.preventDefault();
      const id = Number(sch.dataset.srv), campo = CAMPI[i];
      return spunta(id, st.mese, campo, !cella(id, st.mese)[SIGLA[campo]]);
    }
    if ((e.key === 'Enter' || e.key === ' ') && !passo && !e.target.closest('input')) {
      e.preventDefault();               // scheda col fuoco: apre il cassetto
      return apriCassetto(Number(sch.dataset.srv));
    }
    if (!(e.key in FRECCE)) return;
    e.preventDefault();
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      const dx = FRECCE[e.key];
      const qui = passi.indexOf(passo);
      if (qui < 0) return void fuoco(dx > 0 ? passi[0] : sch);
      return void fuoco(passi[qui + dx] || (dx < 0 ? sch : passi[qui]));
    }
    const schede = [...r.querySelectorAll('.scheda')];
    fuoco(schede[schede.indexOf(sch) + FRECCE[e.key]]);
  });

  // roving tabindex: una sola scheda nell'ordine di tabulazione
  r.addEventListener('focusin', e => {
    const sch = e.target?.closest?.('.scheda');
    if (!sch) return;
    r.querySelectorAll('.scheda[tabindex="0"]').forEach(n => { n.tabIndex = -1; });
    sch.tabIndex = 0;
  });

  // col mouse: il clic su una scheda la rende quella corrente per i tasti
  r.addEventListener('pointerdown', e => {
    const sch = e.target?.closest?.('.scheda');
    if (sch && !e.target.closest('.passo,input')) fuoco(sch);
  });

  r.addEventListener('change', e => {
    const s = e.target.closest('[data-sel]');
    if (!s) return;
    const id = Number(s.dataset.sel);
    s.checked ? st.selezione.add(id) : st.selezione.delete(id);
    barraMassa();
  });
}

/** Ridisegna solo la scheda toccata: evita di perdere lo scorrimento. */
export function aggiornaCella(id, mese) {
  if (!radice || mese !== st.mese) return;
  const sch = radice.querySelector(`.scheda[data-srv="${id}"]`);
  if (!sch) return;
  const c = cella(id, mese), e = statoCella(id, mese);
  sch.classList.toggle('finita', e.completa);
  sch.classList.toggle('ritardo', e.ritardo && !e.completa);
  for (const p of sch.querySelectorAll('.passo')) {
    p.setAttribute('aria-checked', String(!!c[SIGLA[p.dataset.campo]]));
  }
  aggiornaConteggi();
}

function aggiornaConteggi() {
  if (!radice) return;
  const righe = lavoroDelMese(st.mese);
  const n = radice.querySelectorAll('.mese-testa .riepilogo .n');
  if (n.length < 4) return;
  const sc = scadenzeDelMese(righe);
  n[0].textContent = sc.tot;
  n[2].textContent = righe.filter(v => !cella(v.s.id, st.mese).s).length;
  n[3].textContent = `${sc.complete}/${sc.tot}`;
}

/* ------------------------------------------------------ azioni multiple -- */
let barra = null;
function barraMassa() {
  barra?.remove(); barra = null;
  const n = st.selezione.size;
  if (!n) return;
  barra = document.createElement('div');
  barra.className = 'barra-massa';
  barra.innerHTML = `<b>${n}</b> selezionat${n === 1 ? 'o' : 'i'}
    ${CAMPI.map(campo => `<button data-az="${campo}">${BREVE[campo]}</button>`).join('')}
    <button data-az="tutte">Completa i ${PASSI} passi</button>
    <button data-az="annulla">Deseleziona</button>`;
  barra.addEventListener('click', e => {
    const az = e.target.closest('[data-az]')?.dataset.az;
    if (!az) return;
    if (az === 'annulla') {
      st.selezione.clear();
      radice.querySelectorAll('[data-sel]').forEach(i => { i.checked = false; });
      return barraMassa();
    }
    const campi = az === 'tutte' ? CAMPI : [az];
    const voci = [];
    for (const id of st.selezione) {
      for (const campo of campi) {
        if (!cella(id, st.mese)[SIGLA[campo]]) voci.push({ id, mese: st.mese, campo, valore: 1 });
      }
    }
    if (!voci.length) return avviso('Erano già tutte spuntate.');
    spuntaMolte(voci);
    avviso(`${voci.length} spunte inviate.`, { tono: 'ok' });
    st.selezione.clear();
    barraMassa();
    disegna(radice);
  });
  document.body.append(barra);
}

/* il primo colpo di freccia entra nel foglio: vedi ui.frecceEntrano */
frecceEntrano(
  () => st.vista === 'mese' && !!radice?.isConnected,
  () => [...radice.querySelectorAll('.scheda')],
  '.scheda');

export function pulisci() { barra?.remove(); barra = null; radice = null; }
