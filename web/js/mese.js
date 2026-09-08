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
  filtraStato, statoMappatura, CAMPI, SIGLA, PASSI, ETICHETTA, BREVE,
  CLASSE_ET, ET_STATO,
} from './stato.js';
import { apriCassetto } from './cassetto.js';
import { htmlChipDocumento } from './documenti.js';

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

/* IL PALLINO E' IL BOTTONE DELLA SCHEDA.
   Colore: lo stato della mappatura dell'ANNO di quel sito (`statoMappatura`),
   lo stesso della vista Anno - in un foglio di 55 schede dice a colpo d'occhio
   quali siti sono gia' a posto, cosa che le quattro caselle non dicono perche'
   guardano solo questo mese.
   Clic: chiude la scheda, cioe' mette tutti e PASSI i passi DI QUESTO MESE in
   un colpo (il lavoro normale del foglio: si scorre e si chiude). Il
   quadratino di selezione che stava qui e' diventato il ctrl+clic: era usato
   solo per la barra delle azioni multiple, mentre chiudere una scheda si fa
   cinquanta volte al giorno. */
const etichettaSelez = (s, k, pieno) => ({
  titolo: `${ET_STATO[k]} · clic: ${pieno ? 'toglie' : 'mette'} tutti e ${PASSI} i ` +
    `passi di ${(st.mesiNome[st.mese - 1] || '').toLowerCase()} · ctrl+clic: seleziona`,
  aria: `${pieno ? 'Togli' : 'Spunta'} tutti e ${PASSI} i passi di ` +
    `${s.dest || '#' + s.id} in ${st.mesiNome[st.mese - 1] || ''}`,
});

function htmlSelez(s) {
  const k = statoMappatura(s);
  const et = etichettaSelez(s, k, statoCella(s.id, st.mese).n === PASSI);
  return `<button type="button" class="selez${st.selezione.has(s.id) ? ' scelto' : ''}"
      data-comp="${s.id}" title="${esc(et.titolo)}" aria-label="${esc(et.aria)}">
      <span class="punto-stato ${k}"></span>
    </button>`;
}

function htmlScheda(v) {
  const e = statoCella(v.s.id, st.mese);
  const cl = ['scheda', e.completa && 'finita', e.ritardo && 'ritardo',
    !e.reale && 'previsione'].filter(Boolean).join(' ');
  const bollo = BOLLO[e.classe];
  return `<div class="${cl}" data-srv="${v.s.id}" tabindex="-1"
    aria-label="${esc(String(v.s.dest || '#' + v.s.id).replace(/\s+/g, ' '))}: ${e.n} di ${PASSI} passi">
    ${htmlSelez(v.s)}
    <div class="info">
      <b title="${esc(v.s.dest)}">${esc(v.s.dest || '(senza destinazione)')}</b>
      <div class="meta">
        <span class="dato">#${v.s.id}</span>
        ${htmlChipDocumento(v.s.id)}
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
    const pal = e.target?.closest?.('[data-comp]');
    if (pal) {
      const id = Number(pal.dataset.comp);
      return (e.ctrlKey || e.metaKey || e.shiftKey)
        ? alternaSelezione(id, pal) : completaScheda(id);
    }
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
    if (e.key === '0') {                // tutti insieme, come il clic sul pallino
      e.preventDefault();
      return completaScheda(Number(sch.dataset.srv));
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
    if (sch && !e.target.closest('.passo,input,.selez')) fuoco(sch);
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
  // il pallino guarda l'anno, non il mese: cambia anche spuntando altrove
  const srv = st.perServ.get(id), bot = sch.querySelector('.selez');
  if (srv && bot) {
    const k = statoMappatura(srv);
    const et = etichettaSelez(srv, k, e.completa);
    bot.querySelector('.punto-stato').className = 'punto-stato ' + k;
    bot.title = et.titolo;
    bot.setAttribute('aria-label', et.aria);
  }
  aggiornaConteggi();
}

/* I numeri della testa contano il MESE INTERO, filtro di stato compreso: qui si
   rifaceva il conto su `lavoroDelMese(st.mese)` - cioe' sulle sole schede a
   schermo - e con il filtro "Da fare" acceso la voce "complete" scendeva a
   zero alla prima spunta, pur essendocene di complete. Stessa sorgente del
   primo disegno (`mesePieno`), e si riscrive tutta la riga: sono cinque nodi,
   e con quattro `textContent` a indice fisso la voce "a schermo" restava
   indietro. */
function aggiornaConteggi() {
  const box = radice?.querySelector('.mese-testa .riepilogo');
  if (!box) return;
  const tutte = mesePieno(lavoroDelMese(st.mese));
  const daStampare = tutte.filter(v => !cella(v.s.id, st.mese).s).length;
  /* "a schermo" si conta dal DOM, non dal filtro: completando una scheda con
     "Da fare" acceso quella scheda resta a schermo (le righe non spariscono
     sotto le mani), e il numero deve dire quello che si vede. */
  const mostrati = radice.querySelectorAll('.lavoro .scheda').length;
  box.innerHTML = htmlRiepilogo(tutte, scadenzeDelMese(tutte), daStampare, mostrati);
}

/** Chiude (o riapre) la scheda in un clic: tutti e PASSI i passi del mese
 *  insieme. Se c'erano gia' tutti li toglie - i passi sono interruttori e
 *  restarlo anche in blocco e' l'unico modo per correggere un clic di troppo -
 *  ma quel verso cancella lavoro, quindi lo dice. Passa dallo stesso `spunta()`
 *  dei bottoni: coda offline, diario e conflitti restano quelli. */
function completaScheda(id) {
  const c = cella(id, st.mese);
  const valore = statoCella(id, st.mese).n === PASSI ? 0 : 1;
  for (const campo of CAMPI) {
    if (!!c[SIGLA[campo]] === !!valore) continue;
    spunta(id, st.mese, campo, valore);
  }
  if (!valore) {
    const s = st.perServ.get(id);
    avviso(`Tolti i ${PASSI} passi di ${s?.dest || '#' + id}: riclicca il pallino ` +
      'per rimetterli.', { tono: 'allerta' });
  }
}

/** La selezione per le azioni multiple: ctrl (o cmd, o shift) + clic sul
 *  pallino. Non ridisegna la scheda, cambia una classe. */
function alternaSelezione(id, nodo) {
  st.selezione.has(id) ? st.selezione.delete(id) : st.selezione.add(id);
  nodo.classList.toggle('scelto', st.selezione.has(id));
  barraMassa();
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
      radice.querySelectorAll('.selez.scelto').forEach(b => b.classList.remove('scelto'));
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
