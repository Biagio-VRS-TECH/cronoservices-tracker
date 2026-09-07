/* stat.js - la vista Statistiche: quello che i numeri dell'anno dicono, letto a
   colpo d'occhio.  #ANCHOR: vista-stat

   Lavora sugli STESSI dati e sugli STESSI filtri delle altre viste
   (`gruppiFiltrati()`), quindi ricerca, tipo, provincia e "solo in ritardo"
   valgono anche qui: e' la stessa domanda posta in un'altra forma.

   L'unita' di conto e' LA MAPPATURA DELL'ANNO DI UN SITO: un service aperto =
   un impianto = una mappatura, che scade nel primo mese di manutenzione dentro
   il contratto (#ANCHOR: mappatura-anno in stato.js). Un cliente con nove siti
   aperti ha nove righe qui, non una: sono nove impianti da mappare. Un sito con
   quattro visite l'anno resta UNA mappatura: fatta una volta, quel sito e' a
   posto. Visite, stime e scadenze pre-tracciamento non sono un impegno preso e
   restano fuori dai TOTALI.

   Fuori dai totali non vuol dire fuori dallo schermo: l'elenco per sito mostra
   TUTTI i service aperti, anche quelli la cui mappatura non e' dovuta
   quest'anno o scade prima dell'inizio del tracciamento, marcati come fuori
   conto. Prima si vedeva solo la parte dovuta, e sembrava che mancassero dei
   clienti.

   FORMA DELLA PAGINA (8a sessione). Prima la vista Controlli teneva le due
   torte dell'avanzamento: e' stata rimossa e le torte sono qui, in una fascia
   di TRE quadranti sotto il numero grande - "a che punto siamo", "come stanno
   le scadenze", "quanti clienti sono a posto". Sono le tre domande a cui si
   risponde in un secondo; tutto quello che viene dopo serve a decidere dove
   intervenire.

   Per questo i due grafici principali sono, in quest'ordine:
     1. PER SITO - la mappatura e' annuale e una per impianto, quindi la domanda
        naturale e' "quale impianto e' a posto", non "quanto lavoro cade a
        settembre";
     2. PER MESE - a che punto e' il completamento, mese per mese: ogni
        mappatura sta nel SOLO mese in cui scade (il primo di manutenzione), non
        ripetuta a ogni visita. Si restringe cliccando una riga nel primo
        grafico: si aprono i mesi di quel cliente (tutti i suoi impianti).

   Colori: il completamento e' UNA cosa sola (tutti e quattro i passi fatti) ed e'
   una grandezza, quindi ha una tinta sola, `--completa`; "a che punto siamo" e'
   la rampa sequenziale `--pr-0..--pr-4` dello stesso tono. I colori dei quattro
   passi vivono solo nella carta dei passi, dove l'identita' del passo E' il
   dato: usarli altrove faceva sembrare il completamento la terza spunta.

   Niente librerie e niente CDN: i grafici sono barre e colonne HTML (misure in
   percentuale) piu' un solo SVG in linea per l'andamento cumulato. Ogni grafico
   ha la sua tabella (bottone "Tabella") perche' il colore non sia mai l'unico
   modo di leggerlo. */
import { h, esc } from './ui.js';
import {
  st, cella, gruppiFiltrati, mappaturaSito,
  CAMPI, SIGLA, PASSI, ETICHETTA,
} from './stato.js';

let radice = null;
/* Stato della VISTA (non dei dati): il cliente aperto nel grafico dei mesi
   (null = tutti) e se l'elenco dei siti e' tutto o solo la testa. */
let cliSel = null;
/* L'elenco parte COMPLETO: il committente vuole vedere tutti i suoi impianti,
   non una classifica dei primi. Il bottone serve a restringere. */
let tuttiCli = true;

const pct = (a, b) => b ? Math.round(a / b * 100) : 0;
const num = n => n.toLocaleString('it-IT');
const LIMITE_CLI = 12;

/* Stato della mappatura di un sito, in una parola: e' l'ordine dell'elenco e
   quello che si legge nella colonna di destra. */
const STATO = {
  ritardo: { et: 'in ritardo', ord: 0 },
  aperta: { et: 'da fare', ord: 1 },
  completa: { et: 'completa', ord: 2 },
  preTrac: { et: 'pre-avvio', ord: 3 },
  /* Fuori conto, ma non tutti per lo stesso motivo: un "non dovuta" muto e' il
     modo in cui il difetto LASERJET si e' visto (mappatura dovuta data per non
     dovuta). Ora la parola dice quale contratto guardare. */
  daRinnovare: { et: 'da rinnovare', ord: 4 },
  stima: { et: 'oltre il contratto', ord: 5 },
  nonAttivo: { et: 'non ancora attivo', ord: 6 },
  nonDovuta: { et: 'non dovuta', ord: 7 },
};
const MOTIVO = {
  'da-rinnovare': 'daRinnovare', 'stima': 'stima', 'prima-contratto': 'nonAttivo',
};
const statoDi = ma => ma.ritardo ? 'ritardo'
  : ma.prevista ? (ma.completa ? 'completa' : 'aperta')
    : ma.preTrac ? 'preTrac' : (MOTIVO[ma.motivo] || 'nonDovuta');

/* ------------------------------------------------------------- i numeri --- */
/** Un solo passaggio sui siti filtrati: tutte le viste dei dati escono da
 *  `voci`, UNA riga per SITO, cosi' i totali non possono raccontare due storie
 *  diverse. Nelle voci ci sono anche i siti fuori conto (`prevista` falso):
 *  l'elenco li mostra, i totali li saltano. */
function raccogli() {
  const passo = Object.fromEntries(CAMPI.map(c => [c, 0]));
  const voci = [];
  /* `op` = chi ha messo le spunte, `cli` = come stanno i clienti nel loro
     insieme: due letture che servono solo qui e che si prendono nello stesso
     giro, per non rifarlo. */
  const op = new Map();
  const cli = { aPosto: 0, iniziati: 0, fermi: 0, arretrati: 0 };
  const r = {
    clienti: 0, aperti: 0, mappature: 0, complete: 0, ritardo: 0,
    passiFatti: 0, passiTot: 0, preTrac: 0, spunte: 0, voci, passo, op, cli,
  };
  const conta = (chi, campo) => {
    const k = chi || '(non firmato)';
    let x = op.get(k);
    if (!x) op.set(k, x = { et: k, spunte: 0, chiuse: 0 });
    x[campo]++;
  };

  for (const g of gruppiFiltrati()) {
    let aperti = 0, dovute = 0, chiuse = 0, iniziate = 0, arretrate = 0;
    for (const s of g.srvs) {
      if (s.stato !== 'APERTO') continue;
      aperti++;
      const ma = mappaturaSito(s);
      voci.push({
        cli: g.cli.rs || '(cliente ' + g.cli.id + ')',
        sito: s.dest || '#' + s.id,
        id: s.id,
        prov: s.prov || '(senza provincia)',
        scad: ma.scad, mese: ma.mese, n: ma.n,
        completa: ma.completa, ritardo: ma.ritardo,
        prevista: ma.prevista, preTrac: ma.preTrac, stato: statoDi(ma),
      });
      /* Le spunte dell'anno, in tutti i mesi: una firma esiste solo se
         qualcuno ha toccato quella casella, quindi la classe del mese qui non
         conta. `by` e' l'ULTIMO che l'ha toccata: e' tutto quello che il
         modello tiene in locale, e la carta lo dichiara. */
      for (let m = 1; m <= 12; m++) {
        const c = cella(s.id, m);
        const n = c.s + c.c + c.k + c.r;
        if (!n) continue;
        r.spunte += n;
        for (let i = 0; i < n; i++) conta(c.by, 'spunte');
      }
      if (ma.preTrac) r.preTrac++;
      if (!ma.prevista) continue;
      r.mappature++; dovute++;
      r.passiTot += PASSI; r.passiFatti += ma.n;
      if (ma.completa) { r.complete++; chiuse++; conta(cella(s.id, ma.mese).by, 'chiuse'); }
      else if (ma.ritardo) { r.ritardo++; arretrate++; }
      if (ma.n > 0) iniziate++;
      const c0 = cella(s.id, ma.mese);
      for (const c of CAMPI) if (c0[SIGLA[c]]) passo[c]++;
    }
    r.aperti += aperti;
    if (aperti) r.clienti++;
    /* Un cliente e' "a posto" quando TUTTI i suoi siti dovuti sono chiusi: e'
       la domanda che si fa al telefono, e non si legge dall'elenco dei siti. */
    if (dovute) {
      if (arretrate) cli.arretrati++;
      else if (chiuse === dovute) cli.aPosto++;
      else if (iniziate) cli.iniziati++;
      else cli.fermi++;
    }
  }
  return r;
}

/** I mesi passati dalla scadenza, per le mappature arretrate: e' la domanda
 *  "da quanto e' ferma", che l'elenco dei siti non risponde. Bin ORDINATI,
 *  quindi il colore e' la rampa sequenziale --ar-* di un tono solo. */
const BIN = [
  { et: 'entro 1 mese', min: 0, max: 1, tinta: 'var(--ar-1)' },
  { et: '2-3 mesi', min: 2, max: 3, tinta: 'var(--ar-2)' },
  { et: '4-6 mesi', min: 4, max: 6, tinta: 'var(--ar-3)' },
  { et: 'oltre 6 mesi', min: 7, max: 999, tinta: 'var(--ar-4)' },
];
function anzianita(voci) {
  const b = BIN.map(x => ({ ...x, val: 0 }));
  for (const v of voci) {
    if (!v.ritardo) continue;
    const m = (st.annoOggi - st.anno) * 12 + (st.meseOggi - v.scad);
    (b.find(x => m >= x.min && m <= x.max) || b[b.length - 1]).val++;
  }
  return b;
}

/** Solo le mappature che sono un impegno di quest'anno: i grafici dei mesi, le
 *  province e l'andamento contano queste. */
const dovute = voci => voci.filter(v => v.prevista);

/** Le mappature dovute (una per sito) raggruppate per un campo: una voce per
 *  provincia. */
function raggruppa(voci, campo) {
  const m = new Map();
  for (const v of voci) {
    let x = m.get(v[campo]);
    if (!x) m.set(v[campo], x = { et: v[campo], prev: 0, complete: 0, ritardo: 0 });
    x.prev++;
    if (v.completa) x.complete++; else if (v.ritardo) x.ritardo++;
  }
  return [...m.values()];
}

/** I dodici mesi: quante mappature scadono in ciascuno e a che punto sono.
 *  `isto[k]` = quante hanno esattamente k passi fatti (k = 0..PASSI). */
function perMese(voci) {
  const mesi = Array.from({ length: 12 }, () => ({
    prev: 0, complete: 0, ritardo: 0,
    isto: Array.from({ length: PASSI + 1 }, () => 0),
  }));
  for (const v of voci) {
    const M = mesi[v.scad - 1];
    M.prev++; M.isto[v.n]++;
    if (v.completa) M.complete++; else if (v.ritardo) M.ritardo++;
  }
  return mesi;
}

/* ------------------------------------------------------------ mattoni ----- */
/** Una carta. `dati` (facoltativo) accende il bottone "Tabella": lo stesso
 *  contenuto in forma leggibile da chiunque, colore compreso chi non lo vede.
 *  `extra` e' un bottone in piu' in testa alla carta. */
function carta(titolo, sotto, corpo, dati, extra) {
  const testa = h('div.carta-testa', {},
    h('div', {},
      h('h3', { testo: titolo }),
      sotto ? h('p', { testo: sotto }) : null));
  const corpoBox = h('div.carta-corpo', {}, corpo);
  const cardo = h('section.carta', {}, testa, corpoBox);
  if (extra) testa.append(extra);
  if (!dati) return cardo;

  const tab = tabella(dati.col, dati.righe);
  tab.hidden = true;
  const b = h('button.link-tab', {
    testo: 'Tabella', 'aria-expanded': 'false',
    onclick: () => {
      tab.hidden = !tab.hidden;
      corpoBox.hidden = !tab.hidden;
      b.textContent = tab.hidden ? 'Tabella' : 'Grafico';
      b.setAttribute('aria-expanded', String(!tab.hidden));
    },
  });
  testa.append(b);
  cardo.append(tab);
  return cardo;
}

function tabella(col, righe) {
  return h('div.tab-avvolge', {}, h('table.tab-dati', {},
    h('thead', {}, h('tr', {}, col.map(c => h('th', { testo: c })))),
    h('tbody', {}, righe.map(rg => h('tr', {}, rg.map((c, i) =>
      h(i ? 'td.dato' : 'td', { testo: String(c) })))))));
}

/** Misuratore orizzontale: una quota su un limite. Il valore e' scritto, non
 *  solo dipinto. */
function misura(et, fatti, tot, tinta, nota) {
  return h('div.misura', {},
    h('div.misura-et', {},
      h('span', { testo: et }),
      h('span.dato', { testo: `${num(fatti)}/${num(tot)} · ${pct(fatti, tot)}%` })),
    h('div.pista', { 'data-tip': nota || `${num(fatti)} su ${num(tot)}` },
      h('i', { style: `--w:${pct(fatti, tot)}%${tinta ? ';--t:' + tinta : ''}` })));
}

/** Barre orizzontali, una tinta sola: qui il dato e' la grandezza, non
 *  l'identita', quindi non serve una tavolozza. */
function barre(voci, tinta, etichettaValore) {
  const max = Math.max(1, ...voci.map(v => v.val));
  return h('div.barre', {}, voci.map(v => h('div.barra-riga', {},
    h('span.barra-et', { testo: v.et, title: v.et }),
    h('span.barra-pista', { 'data-tip': v.tip || '' },
      h('i', { style: `--w:${Math.round(v.val / max * 100)}%${tinta ? ';--t:' + tinta : ''}` })),
    h('span.barra-val.dato', { testo: etichettaValore(v) }))));
}

/** Barra parte-su-tutto: i segmenti sono ORDINATI e la legenda porta la parola,
 *  il numero e la percentuale. I 2px fra i segmenti sono superficie, non un
 *  bordo. */
function stack(voci) {
  const tot = voci.reduce((a, v) => a + v.val, 0) || 1;
  return h('div', {},
    h('div.stack', {}, voci.map(v => v.val
      ? h('i', {
        style: `--w:${v.val / tot * 100}%;--t:${v.tinta}`,
        'data-tip': `${v.et}: ${v.val} · ${pct(v.val, tot)}%`,
      })
      : null)),
    h('div.legenda.legenda-griglia', {}, voci.map(v => h('span.vc', {
      'data-tip': `${v.et}: ${v.val} · ${pct(v.val, tot)}%`,
    },
      h('i', { style: `--t:${v.tinta}` }),
      h('span', { testo: v.et }),
      h('b', { testo: String(v.val) })))));
}

/* ------------------------------------------------------------- le torte --- */
/* Erano nella vista Controlli, che alla 8a sessione e' stata rimossa. Una torta
   va bene per una cosa sola: parte-su-tutto a colpo d'occhio, con pochi spicchi
   (<= 5), la somma che fa il totale, il valore SCRITTO nella legenda e un buco
   in mezzo col numero che riassume. Niente torte a due spicchi (sarebbe un
   numero) e niente confronti fra due torte diverse.
   Le tinte non sono nuove: la rampa --pr-* per "a che punto siamo", i colori di
   stato per le scadenze e per i clienti. Nessuna tavolozza in piu' da validare. */
const R = 52, RI = 34, C = 60;      // raggio esterno, interno, centro

/** Un arco di ciambella in coordinate SVG. `da`/`a` in giri (0..1), da ore 12. */
function arco(da, a) {
  if (a - da >= 0.9999) {           // cerchio intero: due mezzi archi
    return `M${C},${C - R}A${R},${R} 0 1 1 ${C},${C + R}A${R},${R} 0 1 1 ${C},${C - R}Z` +
      `M${C},${C - RI}A${RI},${RI} 0 1 0 ${C},${C + RI}A${RI},${RI} 0 1 0 ${C},${C - RI}Z`;
  }
  const p = (t, r) => [
    (C + r * Math.sin(t * 2 * Math.PI)).toFixed(2),
    (C - r * Math.cos(t * 2 * Math.PI)).toFixed(2),
  ];
  const grande = a - da > 0.5 ? 1 : 0;
  const [x1, y1] = p(da, R), [x2, y2] = p(a, R);
  const [x3, y3] = p(a, RI), [x4, y4] = p(da, RI);
  return `M${x1},${y1}A${R},${R} 0 ${grande} 1 ${x2},${y2}` +
    `L${x3},${y3}A${RI},${RI} 0 ${grande} 0 ${x4},${y4}Z`;
}

/** Ciambella + legenda. `voci` = [{et, val, tinta}], `centro` = {n, et}. */
function torta(voci, centro) {
  const tot = voci.reduce((a, v) => a + v.val, 0);
  let acc = 0;
  const spicchi = voci.filter(v => v.val > 0).map(v => {
    const da = acc / tot, a = (acc += v.val) / tot;
    return `<path d="${arco(da, a)}" fill="${v.tinta}"
      data-tip="${esc(v.et)}: ${v.val} su ${tot} · ${pct(v.val, tot)}%"/>`;
  }).join('');
  const svg = `<svg viewBox="0 0 120 120" class="torta" role="img"
      aria-label="${esc(centro.et)}: ${centro.n}. ${voci.map(v =>
    `${v.et} ${v.val}`).join(', ')}">
    <circle cx="${C}" cy="${C}" r="${(R + RI) / 2}" fill="none"
            stroke="var(--st-vuoto)" stroke-width="${R - RI}"/>
    <g class="fette">${tot ? spicchi : ''}</g>
    <text class="torta-n" x="${C}" y="${C + 1}">${centro.n}</text>
    <text class="torta-et" x="${C}" y="${C + 15}">${esc(centro.et)}</text>
  </svg>`;
  return h('div.torta-avvolge', {},
    h('div.torta-box', { html: svg }),
    h('div.legenda-t', {}, voci.map(v => h('div.vt', {
      'data-tip': `${v.et}: ${v.val} su ${tot} · ${pct(v.val, tot)}%`,
    },
      h('i', { style: `background:${v.tinta}` }),
      h('span.vt-et', { testo: v.et }),
      h('span.vt-n.dato', { testo: `${v.val}` }),
      h('span.vt-p.dato', { testo: `${pct(v.val, tot)}%` })))));
}

/** Un quadrante: la carta piccola con la ciambella. La legenda E' la versione
 *  leggibile del grafico (parola, numero, percentuale), quindi la tabella
 *  ripeterebbe la stessa cosa raddoppiando l'altezza: qui non c'e'. */
function quadrante(titolo, sotto, voci, centro) {
  const tot = voci.reduce((a, v) => a + v.val, 0);
  return h('section.carta.quadro', {},
    h('div.carta-testa', {},
      h('div', {}, h('h3', { testo: titolo }), h('p', { testo: sotto })),
      h('span.cnt.dato', { testo: `${tot}` })),
    h('div.carta-corpo', {}, torta(voci, centro)));
}

/* ------------------------------------------- grafico 1: per cliente ------- */
/* La mappatura e' una per SITO per anno: la riga E' la mappatura di
   quell'impianto, e la pista sono i suoi PASSI - piena = a posto per l'anno. Non
   c'e' nessun "quante su quante": e' una. Una tinta sola, il verde di
   `--completa`, perche' il dato e' una grandezza; a destra in che stato e', e in
   ambra il ritardo. Ci sono TUTTI i siti aperti, anche quelli fuori conto
   (pre-avvio o mappatura non dovuta quest'anno), tenui e marcati come tali.
   Cliccare la riga restringe il grafico dei mesi al CLIENTE di quel sito. */
function grafSiti(cl) {
  return h('div.barre.barre-cli' + (cl.length > LIMITE_CLI ? '.lunga' : ''), {},
    cl.map(v => {
      const fuori = !v.prevista;
      const et = STATO[v.stato].et;
      const nome = `${v.cli} — ${v.sito}`;
      return h('div.barra-riga.cliccabile' + (v.cli === cliSel ? '.sel' : '') +
        (fuori ? '.fuori' : ''), {
        role: 'button', tabindex: '0', 'aria-pressed': String(v.cli === cliSel),
        'data-tip': `${nome} (#${v.id}): mappatura ${st.anno} ${et}` +
          (v.scad ? ` · scade a ${st.mesiNome[v.scad - 1]}` : '') +
          ` · ${v.n} di ${PASSI} passi` +
          (v.preTrac ? ' · scadenza prima dell’avvio del tracciamento' : '') +
          ' · clic per i mesi del cliente',
        onclick: () => scegliCli(v.cli),
        onkeydown: e => {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); scegliCli(v.cli); }
        },
      },
        h('span.barra-et', { testo: nome, title: nome }),
        h('span.barra-pista', {},
          h('i', { style: `--w:${pct(v.n, PASSI)}%;--t:var(--completa)` })),
        h('span.barra-val.dato', { testo: `${v.n}/${PASSI}` }),
        h('span.barra-rit.dato', { testo: v.ritardo ? 'in ritardo' : (fuori ? et : '') }));
    }));
}

function scegliCli(nome) {
  cliSel = cliSel === nome ? null : nome;
  aggiorna();
}

/* --------------------------- grafico 2: a che punto siamo, mese per mese -- */
/* Una colonna per mese: l'altezza e' quante mappature (una per sito) scadono
   la', e la colonna e' divisa per QUANTI passi hanno. Una mappatura sta in UN
   mese solo, quello in cui e' dovuta: non si ripete a ogni visita. Si legge dal basso: il pieno (il verde di
   `--completa`) e' finito, i gradi piu' chiari sono lavoro iniziato, il grigio
   in cima non e' partito. Nei mesi gia' passati la colonna non finita prende il
   contorno ambra: quello e' arretrato, non lavoro futuro. */
const nomeLiv = k => k === PASSI ? 'complete'
  : k === 0 ? 'da iniziare' : `${k} pass${k === 1 ? 'o' : 'i'}`;

function colonnePasso(mesi) {
  const max = Math.max(1, ...mesi.map(m => m.prev));
  const passato = i => st.anno < st.annoOggi ||
    (st.anno === st.annoOggi && i + 1 < st.meseOggi);

  return h('div.colonne', {}, mesi.map((m, i) => {
    const alto = m.prev ? Math.max(Math.round(m.prev / max * 100), 4) : 0;
    const cl = ['colonna', !m.prev && 'vuota',
      passato(i) && m.complete < m.prev && 'arretrata',
      i + 1 === st.meseOggi && st.anno === st.annoOggi && 'oggi']
      .filter(Boolean).join('.');
    const dettaglio = m.isto
      .map((n, k) => n ? `${n} ${nomeLiv(k)}` : null)
      .filter(Boolean).reverse().join(' · ');
    return h('div.' + cl, {
      'data-tip': m.prev
        ? `${st.mesiNome[i]}: ${m.prev} in scadenza · ${dettaglio}`
        : `${st.mesiNome[i]}: nessuna mappatura in scadenza`,
    },
      h('span.col-n.dato', { testo: m.prev ? String(m.prev) : '' }),
      /* i segmenti si impilano dal basso: complete in fondo, non iniziate in
         cima (column-reverse in css/stat.css) */
      h('span.col-pista', { style: `--h:${alto}%` },
        m.isto.map((n, k) => n
          ? h('i', { style: `--h:${n / m.prev * 100}%;--t:var(--pr-${k})` })
          : null)),
      h('span.col-m', { testo: st.mesi[i] }));
  }));
}

function legendaPassi() {
  const et = k => k === PASSI ? `complete (${PASSI} su ${PASSI})`
    : k === 0 ? 'da iniziare' : `${k} pass${k === 1 ? 'o' : 'i'} su ${PASSI}`;
  return h('div.legenda', {},
    Array.from({ length: PASSI + 1 }, (_, j) => PASSI - j).map(k => h('span.vc', {},
      h('i', { style: `--t:var(--pr-${k})` }),
      h('span', { testo: et(k) }))));
}

/* --------------------------------------------------- andamento cumulato --- */
/* Le mappature si accumulano: la domanda vera e' "siamo in pari col ritmo
   dell'anno?". Area verde = complete cumulate, linea grigia tratteggiata = in
   scadenza cumulate. Due serie, quindi legenda; la seconda e' contesto e resta
   neutra (l'"enfasi" della skill dataviz). */
function andamento(mesi) {
  const W = 640, H = 190, SX = 8, DX = 46, SU = 16, GIU = 26;
  let cp = 0, cc = 0;
  const punti = mesi.map((m, i) => {
    cp += m.prev; cc += m.complete;
    return { i, prev: cp, compl: cc };
  });
  const max = Math.max(1, cp);
  const x = i => SX + i * (W - SX - DX) / 11;
  const y = v => H - GIU - (v / max) * (H - GIU - SU);
  const via = k => punti.map(p => `${x(p.i).toFixed(1)},${y(p[k]).toFixed(1)}`).join(' ');
  const area = `M${x(0)},${y(0)} L` + via('compl') +
    ` L${x(11)},${y(0)} Z`;

  const svg = `
    <svg viewBox="0 0 ${W} ${H}" class="graf" role="img"
         aria-label="Andamento cumulato: ${cc} mappature complete su ${cp} in scadenza nell'anno">
      <g class="griglia-g">
        ${[0, .5, 1].map(f => `<line x1="${SX}" x2="${W - DX}" y1="${y(max * f)}"
             y2="${y(max * f)}"/><text x="${W - DX + 6}" y="${y(max * f) + 3.5}"
             >${Math.round(max * f)}</text>`).join('')}
      </g>
      <path class="area-c" d="${area}"/>
      <polyline class="linea-p" points="${via('prev')}"/>
      <polyline class="linea-c" points="${via('compl')}"/>
      ${punti.map(p => `<g class="ancora" data-i="${p.i}">
         <line class="presa" x1="${x(p.i)}" x2="${x(p.i)}" y1="${SU - 8}" y2="${H - GIU}"/>
         <line class="croce" x1="${x(p.i)}" x2="${x(p.i)}" y1="${SU - 8}" y2="${H - GIU}"/>
         <circle cx="${x(p.i)}" cy="${y(p.compl)}" r="3.4"/>
       </g>`).join('')}
      <g class="assi-x">
        ${punti.map(p => `<text x="${x(p.i)}" y="${H - 8}">${st.mesi[p.i]}</text>`).join('')}
      </g>
      <text class="fine-c" x="${W - DX + 6}" y="${y(cc) + 3.5}">${cc}</text>
    </svg>`;

  const nodo = h('div.graf-avvolge', { html: svg });
  // il tooltip segue il mese piu' vicino: le ancore coprono tutta l'altezza
  nodo.querySelectorAll('.ancora').forEach(a => {
    const i = Number(a.dataset.i);
    a.setAttribute('data-tip',
      `${st.mesiNome[i]}: ${punti[i].compl} complete su ${punti[i].prev} in scadenza ` +
      `da inizio anno`);
  });
  nodo.append(h('div.legenda', {},
    h('span.vc.compl', {}, h('i'), h('span', { testo: 'complete (cumulate)' })),
    h('span.vc.prev', {}, h('i'), h('span', { testo: 'in scadenza (cumulate)' }))));
  return nodo;
}

/* --------------------------------------------------------------- disegno -- */
/** @param animato false quando si ridisegna dopo una spunta o un clic nei
 *  grafici: le forme non devono ripartire da zero ogni volta. */
export function disegna(area, animato = true) {
  radice = area;
  const d = raccogli();
  const vuoto = !d.clienti;
  const dov = dovute(d.voci);

  /* Tutti i siti, in ordine di urgenza: in ritardo, da fare (chi e' piu'
     indietro prima), complete, poi quelli fuori conto. E' quello che si guarda
     per decidere dove intervenire, e nessun impianto resta fuori dall'elenco. */
  const clienti = [...d.voci].sort((a, b) =>
    STATO[a.stato].ord - STATO[b.stato].ord || a.n - b.n ||
    a.cli.localeCompare(b.cli, 'it') || a.sito.localeCompare(b.sito, 'it'));
  const province = raggruppa(dov, 'prov').sort((a, b) => b.prev - a.prev);
  /* un filtro o un cambio d'anno possono far sparire il cliente aperto */
  if (cliSel && !clienti.some(v => v.cli === cliSel)) cliSel = null;
  const mesiTutti = perMese(dov);
  const mesiSel = cliSel ? perMese(dov.filter(v => v.cli === cliSel)) : mesiTutti;

  /* Quante mappature dovute hanno esattamente k passi: e' l'istogramma
     dell'anno intero, lo stesso che le colonne mostrano mese per mese. */
  const isto = Array.from({ length: PASSI + 1 }, () => 0);
  for (const v of dov) isto[v.n]++;
  const anz = anzianita(dov);
  /* Il denominatore della torta dei clienti sono i clienti con almeno una
     mappatura dovuta, non tutti quelli aperti: altrimenti la percentuale al
     centro non tornerebbe con la somma degli spicchi. */
  const cliConDovute = d.cli.aPosto + d.cli.iniziati + d.cli.fermi + d.cli.arretrati;
  const opere = [...d.op.values()].sort((a, b) => b.spunte - a.spunte || b.chiuse - a.chiuse);

  const tessera = (n, et, nota, tinta) => h('div.tessera', {},
    h('span.t-n', { style: tinta ? `color:${tinta}` : null, testo: n }),
    h('span.t-et', { testo: et }),
    nota ? h('span.t-nota', { testo: nota }) : null);

  const eroe = h('section.carta.eroe', {},
    h('div.eroe-num', {},
      h('span.eroe-et', { testo: `Mappature complete nel ${st.anno}` }),
      h('span.eroe-cifra', { testo: pct(d.complete, d.mappature) + '%' }),
      h('span.eroe-sotto', {
        testo: `${num(d.complete)} chiuse su ${num(d.mappature)} dovute · ` +
          `${num(d.passiFatti)} spunte su ${num(d.passiTot)}`,
      }),
      h('div.pista.pista-eroe', {
        'data-tip': `${num(d.complete)} mappature chiuse su ${num(d.mappature)}`,
      }, h('i', {
        /* `--pn` e' la stessa percentuale come numero puro: serve al CSS per
           tenere il gradiente ancorato alla PISTA e non alla parte piena, cosi'
           il colore raggiunto dice quanto si e' arrivati avanti sulla scala. */
        style: `--w:${pct(d.complete, d.mappature)}%;--pn:${pct(d.complete, d.mappature) || 100}`,
      }))),
    h('div.tessere', {},
      tessera(num(d.clienti), 'clienti',
        `${num(d.aperti)} siti aperti`),
      tessera(num(d.mappature), 'mappature dovute', 'una per sito, annuale'),
      tessera(num(d.ritardo), 'in ritardo', 'scadenza passata, non chiuse',
        d.ritardo ? 'var(--allerta)' : null),
      tessera(num(d.preTrac), 'pre-tracciamento',
        'scadute prima dell’avvio: fuori dai conti')));

  const inTesta = tuttiCli ? clienti : clienti.slice(0, LIMITE_CLI);
  const piuCli = clienti.length > LIMITE_CLI
    ? h('button.link-tab' + (tuttiCli ? '' : '.acceso'), {
      testo: tuttiCli ? `Solo i primi ${LIMITE_CLI}` : `Tutti i ${clienti.length} siti`,
      onclick: () => { tuttiCli = !tuttiCli; aggiorna(); },
    })
    : null;

  /* --- i tre quadranti: le tre domande da un secondo -------------------- */
  const livello = k => k === PASSI ? `complete (${PASSI} su ${PASSI})`
    : k === 0 ? 'non iniziate' : `${k} pass${k === 1 ? 'o' : 'i'} su ${PASSI}`;

  const quadranti = h('div.quadranti', {},
    quadrante('A che punto siamo',
      `Le ${num(d.mappature)} mappature dovute, per quanti dei ${PASSI} passi hanno.`,
      Array.from({ length: PASSI + 1 }, (_, j) => PASSI - j).map(k => ({
        et: livello(k), val: isto[k], tinta: `var(--pr-${k})`,
      })),
      { n: pct(d.complete, d.mappature) + '%', et: 'complete' }),

    quadrante('Come stanno le scadenze',
      'Le stesse mappature dal lato della scadenza. L’ambra è lavoro in ritardo.',
      [
        { et: 'complete', val: d.complete, tinta: 'var(--completa)' },
        { et: 'da fare, in tempo', val: d.mappature - d.complete - d.ritardo,
          tinta: 'var(--st-vuoto)' },
        { et: 'in ritardo', val: d.ritardo, tinta: 'var(--allerta)' },
      ],
      { n: String(d.ritardo), et: 'in ritardo' }),

    quadrante('Clienti a posto',
      'Un cliente è a posto quando tutti i suoi siti dovuti sono chiusi.',
      [
        { et: 'tutti i siti chiusi', val: d.cli.aPosto, tinta: 'var(--completa)' },
        { et: 'iniziati', val: d.cli.iniziati, tinta: 'var(--pr-2)' },
        { et: 'non iniziati', val: d.cli.fermi, tinta: 'var(--st-vuoto)' },
        { et: 'con arretrati', val: d.cli.arretrati, tinta: 'var(--allerta)' },
      ],
      { n: pct(d.cli.aPosto, cliConDovute) + '%', et: 'a posto' }));

  const carte = [
    carta('Mappature per sito',
      `La mappatura è annuale e una per sito: una riga per impianto, la barra ` +
      `sono i suoi ${PASSI} passi, piena = a posto per l’anno. Ci sono tutti i ` +
      'siti aperti, anche quelli fuori conto (pre-avvio o mappatura non dovuta ' +
      'quest’anno). In testa i più urgenti. Clicca una riga per vedere i mesi di ' +
      'quel cliente.',
      grafSiti(inTesta),
      {
        col: ['Cliente', 'Sito', '#', 'Stato', 'Scade', 'Passi'],
        righe: clienti.map(v => [v.cli, v.sito, v.id, STATO[v.stato].et,
          v.scad ? st.mesiNome[v.scad - 1] : '—', `${v.n}/${PASSI}`]),
      },
      piuCli),

    carta(cliSel ? `A che punto siamo · ${cliSel}` : 'A che punto siamo, mese per mese',
      `Colonna = mappature (una per sito) che scadono in quel mese, divisa per ` +
      `quanti dei ${PASSI} passi hanno. Ogni mappatura sta nel solo mese in cui è ` +
      'dovuta. Si legge dal basso: il pieno è chiuso. Contorno ambra dove il mese ' +
      'è già passato e il lavoro non è finito.',
      h('div', {}, colonnePasso(mesiSel), legendaPassi()),
      {
        col: ['Mese', 'In scadenza',
          ...Array.from({ length: PASSI + 1 }, (_, k) => nomeLiv(k)), 'In ritardo'],
        righe: mesiSel.map((m, i) => [st.mesiNome[i], m.prev, ...m.isto, m.ritardo]),
      },
      cliSel
        ? h('button.link-tab.acceso', {
          testo: 'Tutti i clienti',
          onclick: () => { cliSel = null; aggiorna(); },
        })
        : null),

    carta('Andamento cumulato',
      'Quanto lavoro si è accumulato e quanto ne è stato chiuso, mese per mese.',
      andamento(mesiTutti),
      {
        col: ['Mese', 'In scadenza cumulate', 'Complete cumulate'],
        righe: (() => {
          let a = 0, b = 0;
          return mesiTutti.map((m, i) => [st.mesiNome[i], a += m.prev, b += m.complete]);
        })(),
      }),

    carta(`I ${PASSI} passi`,
      'Dove si ferma il lavoro: quante mappature dovute (una per sito) hanno ' +
      'già ciascun passo. ' +
      'Qui i colori sono quelli dei segmenti della cella, perché qui il passo è il dato.',
      h('div.misure', {}, CAMPI.map(c => misura(
        ETICHETTA[c], d.passo[c], d.mappature, `var(--st-${c})`))),
      {
        col: ['Passo', 'Fatte', 'Dovute', '%'],
        righe: CAMPI.map(c => [ETICHETTA[c], d.passo[c], d.mappature,
          pct(d.passo[c], d.mappature) + '%']),
      }),

    carta('Mappature per provincia',
      'Dove sta il lavoro dell’anno: una mappatura per sito, nella provincia ' +
      'dell’impianto. Le prime otto.',
      barre(
        province.slice(0, 8).map(v => ({
          et: v.et, val: v.prev,
          tip: `${v.et}: ${v.complete} complete su ${v.prev}`,
        })),
        null, v => num(v.val)),
      {
        col: ['Provincia', 'In scadenza', 'Complete', '%'],
        righe: province.map(v => [v.et, v.prev, v.complete,
          pct(v.complete, v.prev) + '%']),
      }),

    /* L'elenco dei siti dice QUALI sono in ritardo; questa dice da QUANTO, che
       e' l'informazione con cui si decide da dove ripartire. I bin sono
       ordinati, quindi la tinta e' una rampa di un tono solo (l'ambra). */
    carta('Da quanto sono scadute',
      d.ritardo
        ? `Le ${num(d.ritardo)} mappature arretrate per quanti mesi sono passati ` +
          'dalla loro scadenza. Più il colore è pieno, più la cosa è vecchia.'
        : 'Nessuna mappatura arretrata: niente da recuperare.',
      d.ritardo
        ? stack(anz)
        : h('p.niente', { testo: 'Tutte le scadenze passate sono chiuse.' }),
      d.ritardo
        ? {
          col: ['Da quanto', 'Mappature', '%'],
          righe: anz.map(v => [v.et, v.val, pct(v.val, d.ritardo) + '%']),
        }
        : null),

    carta('Chi mette le spunte',
      d.spunte
        ? `Le ${num(d.spunte)} spunte del ${st.anno} sui siti filtrati — tutti i ` +
          'mesi, visite comprese, quindi più di quelle contate in testa. Una ' +
          'casella tiene la firma di chi l’ha toccata per ultimo: è quella che si ' +
          'conta qui, e a fianco quante mappature ha portato a termine.'
        : `Nel ${st.anno}, sui siti filtrati, non c’è ancora nessuna spunta.`,
      opere.length
        ? barre(opere.slice(0, 8).map(v => ({
          et: v.et, val: v.spunte,
          tip: `${v.et}: ${v.spunte} spunte · ${v.chiuse} mappature chiuse`,
        })), null, v => num(v.val))
        : h('p.niente', {
          testo: 'Appena qualcuno spunta, qui compaiono i nomi. Il diario in ' +
            'Azioni tiene le modifiche di tutti gli anni.',
        }),
      opere.length
        ? {
          col: ['Operatore', 'Spunte', 'Mappature chiuse'],
          righe: opere.map(v => [v.et, v.spunte, v.chiuse]),
        }
        : null),
  ];

  area.replaceChildren(h('div.stat' + (animato ? '' : '.vivo'), {},
    vuoto
      ? h('div.vuoto', {
        html: `<b>Nessun sito aperto, con questi filtri</b>
               Togli un filtro o svuota la ricerca.`,
      })
      : [eroe, quadranti, h('div.stat-griglia', {}, carte)]));
  collega(area);
  // il .vivo arriva al frame dopo: e' cio' che fa crescere le forme da zero
  if (animato) requestAnimationFrame(() =>
    area.querySelector('.stat')?.classList.add('vivo'));
}

/** Ricalcolo dopo una spunta o un clic nei grafici: si ridisegna tutto (i totali
 *  cambiano quasi tutti) ma si conserva lo scorrimento, altrimenti la pagina
 *  salta in cima. */
export function aggiorna() {
  if (!radice || st.vista !== 'stat') return;
  const y = radice.scrollTop;
  disegna(radice, false);
  radice.scrollTop = y;
}

/* ------------------------------------------------------------- tooltip ---- */
/* Uno solo per tutta la vista, delegato: con ~60 bersagli non serve un nodo a
   testa. `data-tip` e' l'unico contratto. */
let tip = null;
function collega(area) {
  if (area.__collegatoStat) return;
  area.__collegatoStat = true;
  tip ||= document.body.appendChild(h('div.stat-tip', { role: 'status' }));

  const mostra = e => {
    const b = e.target?.closest?.('[data-tip]');
    if (!b || !b.dataset.tip) return via();
    tip.textContent = b.dataset.tip;
    tip.classList.add('su');
    const r = b.getBoundingClientRect();
    const w = tip.offsetWidth, hh = tip.offsetHeight;
    const x = Math.min(Math.max(8, (e.clientX || r.left + r.width / 2) - w / 2),
      innerWidth - w - 8);
    tip.style.left = x + 'px';
    tip.style.top = (r.top - hh - 8 < 8 ? r.bottom + 8 : r.top - hh - 8) + 'px';
    area.querySelectorAll('.ancora.viva').forEach(n => n.classList.remove('viva'));
    b.closest('.ancora')?.classList.add('viva');
  };
  const via = () => {
    tip?.classList.remove('su');
    area.querySelectorAll('.ancora.viva').forEach(n => n.classList.remove('viva'));
  };
  area.addEventListener('pointermove', mostra);
  area.addEventListener('pointerleave', via);
  area.addEventListener('focusin', e => { if (e.target?.dataset?.tip) mostra(e); });
  area.addEventListener('scroll', via, { passive: true });
}

export function pulisci() {
  tip?.classList.remove('su');
  radice = null;
}
