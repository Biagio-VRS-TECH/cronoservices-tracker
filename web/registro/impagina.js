/* impagina.js - il Registro diventa PAGINE A4 vere.  #ANCHOR: registro-impagina

Nel programma Python l'impaginazione la faceva Chromium: HTML + CSS di stampa,
`break-inside: avoid`, `display: table-header-group`, e i numeri di pagina presi
in due passate leggendo dove fosse finito ogni link interno. Qui Chromium non
c'e': il PDF lo fanno html2canvas + jsPDF (web/js/ponte.js), che fotografano
elementi `div.page` da 210x297mm. Quindi l'impaginazione e' NOSTRA, ed e'
questa.

COME FUNZIONA, in quattro mosse

 1. si costruisce TUTTO il documento una volta sola, in un contenitore di
    misura fuori schermo largo quanto l'area utile (210 - 16 - 16 = 178mm) e con
    lo stesso CSS delle pagine vere: un solo innerHTML, un solo calcolo di
    layout;
 2. si leggono le altezze di ogni UNITA' ATOMICA in un giro solo (nessuna
    scrittura in mezzo: un reflow, non diecimila). Le unita' sono: la
    copertina, i blocchi di testo, e ogni `tbody` delle tabelle - un tbody e'
    una stanza, e una stanza non si spezza MAI fra due pagine;
 3. si impacchetta per altezza (area utile 297 - 16 - 19 = 262mm). Le unita'
    legate ("legaSeguente": il titolo con la prima riga, la fascia del piano con
    il primo reparto) passano di pagina insieme; le tabelle che continuano si
    riaprono con la loro intestazione, col "(segue)" per i reparti;
 4. gli STESSI NODI misurati vengono spostati nelle pagine - non ricostruiti -
    quindi l'altezza impaginata e' per forza quella misurata.

I numeri di pagina del sommario si scrivono DOPO: nella cella c'e' gia' uno
spazio-cifra (U+2007) e la colonna ha larghezza fissa, quindi scrivere il numero
non muove niente e non serve una seconda passata.

Il documento e' BIANCO in tutti e due i temi: e' carta, non interfaccia (stessa
regola del generatore di schede, vedi web/schede/HANDOFF.md sezione 8). */

/* Area della pagina, in millimetri: sono le stesse misure della @page del
   template Python (margin: 16mm 16mm 19mm 16mm). */
export const PAGINA = { larghezza: 210, altezza: 297, sopra: 16, lato: 16, sotto: 19 };
export const UTILE_L = PAGINA.larghezza - PAGINA.lato * 2;              // 178mm
export const UTILE_H = PAGINA.altezza - PAGINA.sopra - PAGINA.sotto;    // 262mm

const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const CIFRA = ' ';   // figure space: largo come una cifra
const plur = (n, uno, molti) => (n === 1 ? uno : molti);

/** Quanti pixel vale un millimetro in questo browser (di solito 96/25.4). */
function pxPerMm(dentro) {
  const p = document.createElement('div');
  p.style.cssText = 'position:absolute;width:100mm;height:100mm;visibility:hidden;pointer-events:none';
  dentro.appendChild(p);
  const h = p.getBoundingClientRect().height / 100;
  p.remove();
  return h || (96 / 25.4);
}

/* ====================================================== MARKUP DEL DOCUMENTO */

/** La copertina: pagina intera, senza margini. La banda verticale e' navy con
 *  il filo cyan del marchio; il logo aziendale al posto della scritta "VRS". */
function htmlCopertina(reg, o) {
  const c = reg.controlli;
  return `<div class="cop">
  <div class="cop-banda"><div class="cop-verticale">Registro dei componenti · ${esc(reg.data)}</div></div>
  <div class="cop-corpo">
    <div class="cop-marchio">
      <img src="${esc(o.logo)}" alt="VRS Group" class="cop-logo">
      <div class="cop-payoff">Impianti gas medicali e industriali · installazione e manutenzione</div>
    </div>
    <div class="cop-titolo">
      <div class="cop-sopra">Mappatura dell’impianto</div>
      <h1>Registro dei<br>componenti installati</h1>
    </div>
    <div class="cop-cliente">
      <div class="cop-et">Cliente</div>
      <div class="cop-nome" data-cop-cliente>${esc(o.titolo || reg.cliente)}</div>
    </div>
    <div class="cop-cifre">
      <div><div class="v">${reg.totale}</div><div class="e">Componenti</div></div>
      <div><div class="v">${c.nPiani}</div><div class="e">${plur(c.nPiani, 'Piano', 'Piani')}</div></div>
      <div><div class="v">${c.nReparti}</div><div class="e">${plur(c.nReparti, 'Reparto', 'Reparti')}</div></div>
      <div><div class="v">${c.nStanze}</div><div class="e">${plur(c.nStanze, 'Stanza', 'Stanze')}</div></div>
    </div>
    <div class="cop-piede">
      <div>Situazione aggiornata al <b>${esc(reg.data)}</b><br>Dati dal registro di manutenzione VRS Group</div>
      <div class="cop-pag"><span data-cop-pagine></span></div>
    </div>
  </div>
</div>`;
}

const titoloPagina = (h2, destra) =>
  `<div class="pagina-titolo"><h2>${h2}</h2><div class="destra">${destra}</div></div>`;

/** Larghezze delle colonne del quadro d'insieme: la colonna dei nomi si prende
 *  quello che resta, e se i piani sono tanti le colonne dei numeri si
 *  stringono invece di far sfondare la tabella. */
function misureQuadro(nCol) {
  let num = 11.5;
  /* "Totale" e' la parola piu' lunga dell'intestazione e non va a capo: la sua
     colonna si misura su quella, non sui numeri (a 13mm usciva dal foglio) */
  const tot = 17;
  let nome = UTILE_L - tot - nCol * num;
  while (nome < 42 && num > 7) { num -= 0.5; nome = UTILE_L - tot - nCol * num; }
  return { nome: Math.max(nome, 24), num, tot };
}

/** Tutto il documento in una stringa sola: e' quello che finisce nel
 *  contenitore di misura, e i suoi nodi sono gli stessi che finiranno nelle
 *  pagine. Ogni `tbody` e ogni `[data-u]` e' un'unita' atomica. */
function htmlDocumento(reg, o) {
  const p = [];
  const cli = esc(o.titolo || reg.cliente);

  /* --- sommario: il titolo, la spiegazione e le righe --- */
  p.push(`<div data-u="blocco" data-lega="1">
    ${titoloPagina('Sommario', cli)}
    <div class="spiegazione">
      <p>Questo registro elenca tutti i componenti dell’impianto installati da VRS Group presso la vostra struttura e indica dove si trovano.</p>
      <p>Il documento è ordinato per <b>luogo</b>: ogni piano dell’edificio dal più basso al più alto. Dentro ogni piano trovate prima le <b>centrali</b> e i locali tecnici, poi i <b>reparti</b> in ordine alfabetico e, per ciascun reparto, le <b>stanze</b> con i componenti presenti e la loro <b>quantità</b>, sempre nella colonna a destra.</p>
      <p>Il <b>quadro d’insieme</b> risponde con un solo sguardo a domande come “quanti riduttori ci sono al secondo piano”. La <b>legenda</b> finale riporta, per ogni componente, il codice e la descrizione tecnica completa.</p>
    </div>
  </div>`);

  const rigaSom = (cls, testo, q, ancora) =>
    `<tbody data-u="riga"><tr class="${cls}">` +
    `<td class="t">${testo}</td><td class="q num">${q}</td>` +
    `<td class="p num"><span class="pnum" data-pag="${esc(ancora)}">${CIFRA}${CIFRA}</span></td></tr></tbody>`;

  const som = [rigaSom('sez', 'Quadro d’insieme', '', 'quadro')];
  for (const s of reg.sezioni) {
    const sotto = s.sottotitolo ? ` <span class="sotto">${esc(s.sottotitolo)}</span>` : '';
    som.push(rigaSom('sez', esc(s.titolo) + sotto, `${s.totale} ${plur(s.totale, 'componente', 'componenti')}`, s.id));
    for (const rep of s.reparti) som.push(rigaSom('rep', esc(rep.nome), rep.totale, rep.id));
  }
  som.push(rigaSom('sez', 'Legenda dei componenti',
    `${reg.legenda.length} ${plur(reg.legenda.length, 'tipo', 'tipi')}`, 'legenda'));
  p.push(`<table class="doc-tab sommario" data-g="sommario" data-senza-testata="1">
    <colgroup><col><col style="width:30mm"><col style="width:12mm"></colgroup>${som.join('')}</table>`);

  /* --- quadro d'insieme --- */
  const m = misureQuadro(reg.matriceColonne.length);
  p.push(`<div data-u="blocco" data-lega="1" class="stacco" id="quadro">${titoloPagina('Quadro d’insieme', 'Quantità di ogni tipo di componente, per piano')}</div>`);
  const colsQ = `<colgroup><col style="width:${m.nome}mm">` +
    reg.matriceColonne.map(() => `<col style="width:${m.num}mm">`).join('') +
    `<col style="width:${m.tot}mm"></colgroup>`;
  const testaQ = `<thead><tr>
    <th class="nome">Componente</th>
    ${reg.matriceColonne.map(s => `<th class="n"><span class="sopra">Piano</span>${esc(s.tipo === 'piano' ? s.titolo.replace('Piano ', '') : s.etichettaBreve)}</th>`).join('')}
    <th class="n tot">Totale</th></tr></thead>`;
  const righeQ = reg.matriceRighe.map((r, i) =>
    `<tbody data-u="riga"${i === 0 ? ' data-ancora="quadro"' : ''}><tr>` +
    `<td class="nome">${esc(r.nome)}<span class="cod">${esc(r.codice)}</span></td>` +
    r.valori.map(v => `<td class="n${v === 0 ? ' zero' : ''}">${v || '·'}</td>`).join('') +
    `<td class="n tot">${r.totale}</td></tr></tbody>`).join('');
  p.push(`<table class="doc-tab matrice" data-g="matrice">${colsQ}${testaQ}${righeQ}</table>`);

  /* --- una sezione per piano: fascia navy legata al primo reparto --- */
  for (const s of reg.sezioni) {
    const titolo = s.tipo === 'piano'
      ? esc(s.titolo.replace('Piano ', '')) + (s.sottotitolo ? `<small>${esc(s.sottotitolo)}</small>` : '')
      : esc(s.titolo);
    p.push(`<div data-u="blocco" data-nuova="1" data-lega="1" id="${esc(s.id)}" data-ancora="${esc(s.id)}">
      <div class="sezione-testa"><div class="st-titolo"><div class="sopra">Piano</div><h2>${titolo}</h2></div></div>
    </div>`);
    for (const rep of s.reparti) {
      const corpi = rep.voci.map((voce, i) => {
        const righe = voce.componenti.map((c, j) =>
          `<tr>${j === 0 ? `<td class="c-stanza" rowspan="${voce.componenti.length}">${esc(voce.stanze[0])}</td>` : ''}` +
          `<td class="c-comp"><div class="comp"><span class="nome">${esc(c.nome)}</span><span class="cod">${esc(c.codice)}</span></div></td>` +
          `<td class="c-qta num">${c.quantita}</td></tr>`).join('');
        return `<tbody class="voce${i % 2 ? ' pari' : ''}" data-u="riga"${i === 0 ? ` data-ancora="${esc(rep.id)}"` : ''}>${righe}</tbody>`;
      }).join('');
      p.push(`<table class="doc-tab registro" id="${esc(rep.id)}" data-g="${esc(rep.id)}" data-segue="1" data-nome="${esc(rep.nome)}">
        <colgroup><col style="width:40mm"><col><col style="width:21mm"></colgroup>
        <thead>
          <tr class="barra"><th colspan="3"><div class="barra-int"><span class="nome-rep">${esc(rep.nome)}</span><span class="segue">(segue)</span></div></th></tr>
          <tr class="colonne"><th class="c-stanza">Stanza</th><th class="c-comp">Componente</th><th class="c-qta">Quantità</th></tr>
        </thead>${corpi}</table>`);
    }
  }

  /* --- legenda: sempre alfabetica, e' li' che un componente si cerca per nome --- */
  p.push(`<div data-u="blocco" data-lega="1" class="stacco" id="legenda">${titoloPagina('Legenda dei componenti', 'Nome usato nel registro, codice articolo<br>e descrizione tecnica del gestionale')}</div>`);
  const righeL = reg.legenda.map((v, i) =>
    `<tbody data-u="riga"${i === 0 ? ' data-ancora="legenda"' : ''}><tr>` +
    `<td class="codice num">${esc(v.codice)}</td><td class="nome">${esc(v.nome)}</td>` +
    `<td class="descr">${esc(v.descrizione)}</td><td class="qta num">${v.quantita}</td></tr></tbody>`).join('');
  p.push(`<table class="doc-tab legenda" data-g="legenda">
    <colgroup><col style="width:15mm"><col style="width:67mm"><col><col style="width:18mm"></colgroup>
    <thead><tr><th>Codice</th><th>Componente</th><th>Descrizione tecnica</th><th class="qta">Quantità</th></tr></thead>
    ${righeL}</table>`);
  p.push(`<div data-u="blocco"><div class="nota-piede">Registro generato il ${esc(reg.data)} dai dati di manutenzione VRS Group. Le quantità indicano il numero di componenti installati; le denominazioni di piani, reparti e stanze sono quelle registrate nell’impianto.</div></div>`);

  return p.join('\n');
}

/* ================================================================ IMPAGINA */

/**
 * Costruisce le pagine dentro `contenitore` (di regola `#pages`).
 *   reg        il registro (registro.js)
 *   opzioni    {contenitore, corpo: 10|10.5|11, titolo, logo}
 * Restituisce {pagine, ms} - quante pagine e quanto ci e' voluto.
 */
export function impagina(reg, opzioni = {}) {
  const t0 = performance.now();
  const cont = opzioni.contenitore || document.getElementById('pages');
  const o = { corpo: 10.5, logo: '/assets/logo.webp', titolo: '', ...opzioni };
  cont.style.setProperty('--corpo', o.corpo + 'pt');
  cont.replaceChildren();

  /* TRAPPOLA (pagata): se l'anteprima e' nascosta - si sta lavorando nella
     scheda "Nomi dei componenti" e il documento si rigenera in secondo piano -
     `display:none` fa misurare ZERO a tutto, e il registro si impagina in
     quattro pagine. Gli antenati nascosti si riaprono per il tempo della
     misura: e' tutto sincrono, quindi non si vede niente. */
  const riaperti = [];
  for (let el = cont; el; el = el.parentElement) if (el.hidden) { el.hidden = false; riaperti.push(el); }
  try {
    return impaginaDavvero(reg, o, cont, t0);
  } finally {
    for (const el of riaperti) el.hidden = true;
  }
}

function impaginaDavvero(reg, o, cont, t0) {

  /* ---- 1. il contenitore di misura: stessa larghezza utile, stesso CSS ---- */
  const misura = document.createElement('div');
  misura.className = 'page misura';
  const corpoMis = document.createElement('div');
  corpoMis.className = 'corpo';
  misura.appendChild(corpoMis);
  cont.appendChild(misura);
  corpoMis.innerHTML = htmlDocumento(reg, o);

  const MM = pxPerMm(cont);
  const ALTEZZA = UTILE_H * MM;

  /* ---- 2. le altezze, tutte in un giro solo (una scrittura sola prima) ---- */
  const unita = [];        // {nodo, gruppo, h, lega, nuova, ancora}
  const gruppi = new Map();   // id -> {id, tabella, testata, hTestata, segue, aperta}
  for (const nodo of [...corpoMis.children]) {
    if (nodo.tagName === 'TABLE') {
      const id = nodo.dataset.g;
      const thead = nodo.querySelector('thead');
      const g = { id, modello: nodo, thead, hTestata: 0, segueAmmesso: nodo.dataset.segue === '1', emessa: false, pagina: -1, tabella: null };
      gruppi.set(id, g);
      for (const tb of nodo.tBodies) {
        unita.push({ nodo: tb, gruppo: g, h: 0, lega: false, nuova: false, ancora: tb.dataset.ancora || null });
      }
    } else {
      unita.push({ nodo, gruppo: null, h: 0, lega: nodo.dataset.lega === '1',
                   nuova: nodo.dataset.nuova === '1', ancora: nodo.dataset.ancora || null });
    }
  }
  // lettura pura: nessuna scrittura fra queste misure, quindi un solo reflow
  for (const u of unita) u.h = u.nodo.getBoundingClientRect().height;
  /* il costo di APRIRE una tabella: la sua intestazione piu' lo stacco dalla
     roba che la precede (il margin-top della tabella, che non sta in nessuna
     altezza di riga) */
  for (const g of gruppi.values()) {
    g.hTestata = (g.thead ? g.thead.getBoundingClientRect().height : 0) +
      (parseFloat(getComputedStyle(g.modello).marginTop) || 0);
  }

  /* ---- 3. le catene: unita' che devono stare sulla stessa pagina ---- */
  const catene = [];
  for (let i = 0; i < unita.length; i++) {
    const c = [unita[i]];
    while (unita[i].lega && i + 1 < unita.length) { i++; c.push(unita[i]); }
    catene.push(c);
  }

  /* ---- 4. impacchettamento ---- */
  const pagine = [];
  let pagina = null, corpoPag = null, usato = 0;
  const numeriPagina = new Map();

  function nuovaPagina(classe = '') {
    pagina = document.createElement('div');
    pagina.className = 'page' + (classe ? ' ' + classe : '');
    corpoPag = document.createElement('div');
    corpoPag.className = 'corpo';
    pagina.appendChild(corpoPag);
    cont.appendChild(pagina);
    pagine.push(pagina);
    usato = 0;
    for (const g of gruppi.values()) g.tabella = null;
    return pagina;
  }

  // la copertina e' una pagina intera senza margini: fuori dal ciclo
  const cop = nuovaPagina('copertina');
  cop.replaceChildren();
  cop.insertAdjacentHTML('beforeend', htmlCopertina(reg, o));
  corpoPag = null;
  nuovaPagina();

  const apriTabella = g => {
    const t = document.createElement('table');
    t.className = g.modello.className;
    t.appendChild(g.modello.querySelector('colgroup').cloneNode(true));
    if (g.thead) {
      const th = g.thead.cloneNode(true);
      if (g.emessa && g.segueAmmesso) th.classList.add('continua');
      t.appendChild(th);
    }
    g.emessa = true;
    g.tabella = t;
    corpoPag.appendChild(t);
    return t;
  };

  const altezzaCatena = catena => {
    let h = 0;
    const visti = new Set();
    for (const u of catena) {
      if (u.gruppo && !visti.has(u.gruppo)) {
        visti.add(u.gruppo);
        if (u.gruppo.tabella === null) h += u.gruppo.hTestata;
      }
      h += u.h;
    }
    return h;
  };

  for (const catena of catene) {
    const vuota = usato < 0.5;
    if (catena[0].nuova && !vuota) nuovaPagina();
    if (!vuota && usato + altezzaCatena(catena) > ALTEZZA + 0.5) nuovaPagina();
    for (const u of catena) {
      if (u.gruppo) {
        if (u.gruppo.tabella === null) { apriTabella(u.gruppo); usato += u.gruppo.hTestata; }
        u.gruppo.tabella.appendChild(u.nodo);
      } else {
        corpoPag.appendChild(u.nodo);
      }
      usato += u.h;
      if (u.ancora) numeriPagina.set(u.ancora, pagine.length);
    }
  }
  misura.remove();

  /* ---- 5. numeri di pagina e pie' di pagina ---- */
  const N = pagine.length;
  for (const span of cont.querySelectorAll('.pnum')) {
    const n = numeriPagina.get(span.dataset.pag);
    span.textContent = n ? String(n) : CIFRA;
  }
  const cifre = cont.querySelector('[data-cop-pagine]');
  if (cifre) cifre.textContent = `${N} ${plur(N, 'pagina', 'pagine')}`;
  for (let i = 1; i < N; i++) {
    const pie = document.createElement('div');
    pie.className = 'piede';
    pie.innerHTML = `<span>Registro dei componenti · ${esc(o.titolo || reg.cliente)}</span>` +
                    `<span class="num">Pagina ${i + 1} di ${N}</span>`;
    pagine[i].appendChild(pie);
  }

  return { pagine: N, ms: Math.round(performance.now() - t0) };
}

/* ====================================================== VERSIONE DIGITALE */

/** Il CSS del DOCUMENTO sta in registro.css, fra due segnalibri, e da li' viene
 *  preso anche per il file HTML autonomo: una sola fonte, niente doppioni che
 *  divergono. I selettori `#pages .page` diventano `.doc`. */
async function cssDocumento() {
  const testo = await fetch('registro.css').then(r => r.text());
  /* i segnalibri sono l'APERTURA di due commenti, non due commenti interi (il
     primo continua con la spiegazione della sezione): si cerca la parola, poi
     si taglia dopo la chiusura di quel commento. */
  const a = testo.indexOf('==== DOCUMENTO INIZIO ====');
  const b = testo.indexOf('==== DOCUMENTO FINE ====');
  if (a < 0 || b < 0) return '';
  const da = testo.indexOf('*/', a) + 2;
  const fino = testo.lastIndexOf('/*', b);
  if (da < 2 || fino < da) return '';
  return testo.slice(da, fino).split('#pages .page').join('.doc');
}

/* Quel poco che la versione digitale ha in piu': non e' carta, e' una pagina da
   consultare - indice laterale, ricerca, fogli che scorrono. */
const CSS_DIGITALE = `
  body{margin:0;background:#eef1f4}
  .app{display:grid;grid-template-columns:260px 1fr;min-height:100vh}
  .lat{background:#17304A;color:#fff;padding:22px 18px;position:sticky;top:0;height:100vh;overflow:auto;font-size:13px;
       font-family:var(--sans)}
  .lat .marchio img{height:26px;width:auto;filter:brightness(0) invert(1)}
  .lat .cerca{margin:18px 0 12px}
  .lat input{width:100%;padding:9px 10px;border-radius:4px;border:1px solid rgba(255,255,255,.3);
             background:rgba(255,255,255,.08);color:#fff;font:inherit;font-size:14px}
  .lat input::placeholder{color:rgba(255,255,255,.6)}
  .lat .esito{font-size:12px;opacity:.8;min-height:16px;margin-bottom:8px}
  .lat nav a{display:block;padding:6px 8px;border-radius:4px;color:#fff;opacity:.9;text-decoration:none}
  .lat nav a:hover{background:rgba(255,255,255,.12)}
  .lat nav a.sez{font-family:var(--serif);font-size:15px;margin-top:8px;opacity:1}
  .lat nav a.rep{padding-left:18px;font-size:12.5px;opacity:.85;display:flex;justify-content:space-between;gap:6px}
  .lat nav a.rep span{opacity:.7}
  .lat .nota{font-size:12px;opacity:.7;margin-top:18px;line-height:1.5}
  .contenuto{max-width:940px;margin:0 auto;padding:24px 28px 60px}
  .doc{background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.08),0 8px 30px rgba(0,0,0,.06);
       padding:30px 34px;margin-bottom:24px;border-radius:3px;width:auto;height:auto;overflow:visible}
  .doc.copertina{padding:0;overflow:hidden}
  /* la copertina digitale non e' un foglio A4: niente altezza fissa, niente
     banda laterale, e la griglia a due colonne torna a una sola */
  .doc.copertina .cop{height:auto;min-height:0;width:auto;grid-template-columns:1fr}
  .doc.copertina .cop-banda{display:none}
  .doc .cop-corpo{padding:16mm 14mm 12mm}
  .doc .cop-titolo{margin-top:10mm}
  .doc .cop-cliente{margin-top:8mm}
  .doc .cop-cifre{margin-top:8mm}
  .doc .cop-piede{margin-top:10mm}
  .nascosto{display:none!important}
  @media print{.lat{display:none}.app{display:block}.doc{box-shadow:none;padding:0}body{background:#fff}}
  @media (max-width:800px){.app{grid-template-columns:1fr}.lat{position:static;height:auto}}
`;

/**
 * La versione digitale: un file HTML solo, autonomo (nessuna risorsa esterna
 * tranne il logo, che viene incorporato), con ricerca e indice laterale.
 * Stesso contenuto del PDF, stessa famiglia grafica; scorre invece di
 * impaginarsi, perche' su schermo le pagine non servono.
 */
export async function htmlDigitale(reg, opzioni = {}) {
  const o = { corpo: 10.5, logo: '/assets/logo.webp', titolo: '', ...opzioni };
  const css = await cssDocumento();
  let logo = o.logo;
  try {
    const b = await fetch(o.logo).then(r => r.blob());
    logo = await new Promise(res => { const f = new FileReader(); f.onload = () => res(f.result); f.readAsDataURL(b); });
  } catch { /* senza rete resta il percorso: il file si apre lo stesso */ }

  /* Si riusa esattamente il markup del documento stampato, ma senza
     impaginazione: ogni pezzo va nel suo "foglio" che scorre. */
  const tmp = document.createElement('div');
  tmp.innerHTML = htmlDocumento(reg, { ...o, logo });
  for (const s of tmp.querySelectorAll('.pnum')) s.closest('td').innerHTML = '';
  for (const t of tmp.querySelectorAll('table.registro')) {
    const rep = t.dataset.nome || '';
    t.setAttribute('data-cerca', rep.toLowerCase());
  }
  for (const tb of tmp.querySelectorAll('table.registro tbody.voce')) {
    tb.setAttribute('data-cerca', tb.textContent.toLowerCase().replace(/\s+/g, ' '));
  }
  const pezzi = [...tmp.children];
  // la copertina apre anche la versione digitale: su schermo non e' una pagina
  // intera, e' il primo foglio (il CSS digitale le toglie banda e altezza fissa)
  const fogli = [`<div class="doc copertina">${htmlCopertina(reg, { ...o, logo })}</div>`];
  let buffer = [];
  const chiudi = (cls = '') => { if (buffer.length) { fogli.push(`<div class="doc ${cls}">${buffer.join('')}</div>`); buffer = []; } };
  for (const el of pezzi) {
    // un foglio nuovo a ogni piano, e davanti al quadro e alla legenda
    if (el.dataset.nuova === '1' || el.classList.contains('stacco')) chiudi();
    buffer.push(el.outerHTML);
  }
  chiudi();

  const nav = [`<a href="#quadro" class="sez">Quadro d’insieme</a>`];
  for (const s of reg.sezioni) {
    nav.push(`<a href="#${esc(s.id)}" class="sez">${esc(s.titolo)}</a>`);
    for (const rep of s.reparti) nav.push(`<a href="#${esc(rep.id)}" class="rep">${esc(rep.nome)}<span>${rep.totale}</span></a>`);
  }
  nav.push(`<a href="#legenda" class="sez">Legenda</a>`);

  return `<!doctype html>
<html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Registro dei componenti – ${esc(reg.cliente)}</title>
<style>:root{--corpo:${o.corpo}pt}
${css}
${CSS_DIGITALE}</style></head>
<body><div class="app">
<aside class="lat">
  <div class="marchio"><img src="${logo}" alt="VRS Group"></div>
  <div class="cerca"><input id="cerca" type="search" placeholder="Cerca stanza, reparto o componente…" autocomplete="off" aria-label="Cerca nel registro"></div>
  <div class="esito" id="esito" role="status"></div>
  <nav>${nav.join('')}</nav>
  <div class="nota">Versione digitale del Registro dei componenti. Il documento stampabile è il PDF con lo stesso contenuto.</div>
</aside>
<main class="contenuto">${fogli.join('\n')}</main>
</div>
<script>
(function(){
  var campo=document.getElementById('cerca'), esito=document.getElementById('esito');
  var voci=[].slice.call(document.querySelectorAll('tbody.voce'));
  var tab=[].slice.call(document.querySelectorAll('table.registro'));
  function n(s){return (s||'').toLowerCase().normalize('NFD').replace(/[\\u0300-\\u036f]/g,'');}
  campo.addEventListener('input',function(){
    var q=n(campo.value.trim()), trovate=0;
    voci.forEach(function(v){
      var ok=!q||n(v.getAttribute('data-cerca')).indexOf(q)>=0||n(v.closest('table').getAttribute('data-cerca')).indexOf(q)>=0;
      v.classList.toggle('nascosto',!ok); if(ok&&q) trovate++;
    });
    tab.forEach(function(t){ t.classList.toggle('nascosto', t.querySelectorAll('tbody.voce:not(.nascosto)').length===0); });
    esito.textContent=q?(trovate?trovate+(trovate===1?' voce trovata':' voci trovate'):'Nessun risultato'):'';
  });
})();
<\/script>
</body></html>`;
}
