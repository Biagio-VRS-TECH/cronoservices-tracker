/* stat.js - la vista Statistiche: quello che i numeri dell'anno dicono, letto a
   colpo d'occhio.  #ANCHOR: vista-stat

   Lavora sugli STESSI dati e sugli STESSI filtri delle altre viste
   (`gruppiFiltrati()`), quindi ricerca, provincia e il filtro di stato (tutte /
   da fare / in ritardo / complete) valgono anche qui: e' la stessa domanda
   posta in un'altra forma.

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

   ALLA 11a SESSIONE la pagina e' diventata un pannello di comando: apre col
   QUADRANTE DELL'ANNO (i dodici mesi a raggiera, `quadranteAnno`), poi due carte
   su cui si agisce - "Da fare adesso" (la lista di lavoro del mese e del
   prossimo, che apre il cassetto) e "Ritmo per chiudere l'anno" (quante al mese
   servono contro quante se ne chiudono) - poi i tre quadranti e le carte di
   prima, tutte, in una griglia a dodici colonne (`c12`, `c8`, `c6`, `c4`, `c3`).

   Niente librerie e niente CDN: i grafici sono barre e colonne HTML (misure in
   percentuale) piu' gli SVG in linea del quadrante e dell'andamento cumulato. Ogni grafico
   ha la sua tabella (bottone "Tabella") perche' il colore non sia mai l'unico
   modo di leggerlo. */
import { h, esc, modale } from './ui.js';
import { apriCassetto } from './cassetto.js';
import {
  st, cella, gruppiFiltrati, mappaturaSito,
  CAMPI, SIGLA, PASSI, ETICHETTA, fatto,
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
        const n = CAMPI.filter(k => fatto(c, k)).length;   // una proposta (2) non e' un passo fatto
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
      for (const c of CAMPI) if (fatto(c0, c)) passo[c]++;
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

/** Barre orizzontali, una tinta sola: qui il dato e' la grandezza, non
 *  l'identita', quindi non serve una tavolozza. `v.sub` (facoltativo) e' la
 *  parte gia' chiusa dentro la barra, nel verde di `--completa`: parte-su-tutto
 *  dentro la grandezza. `opz.rango` numera le righe: l'ordine e' per valore,
 *  quindi il numero E' un dato, non un ornamento. */
function barre(voci, tinta, etichettaValore, opz = {}) {
  const max = Math.max(1, ...voci.map(v => v.val));
  return h('div.barre' + (opz.rango ? '.con-rango' : ''), {}, voci.map((v, i) => h('div.barra-riga', {},
    opz.rango ? h('span.barra-rango.dato', { testo: String(i + 1).padStart(2, '0') }) : null,
    h('span.barra-et', { testo: v.et, title: v.et }),
    h('span.barra-pista', { 'data-tip': v.tip || '' },
      h('i', { style: `--w:${Math.round(v.val / max * 100)}%${tinta ? ';--t:' + tinta : ''}` },
        v.sub != null && v.val
          ? h('b', { style: `--w:${Math.round(v.sub / v.val * 100)}%` })
          : null)),
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
    h('div.legenda.legenda-griglia.legenda-tessere', {}, voci.map(v => h('span.vc', {
      'data-tip': `${v.et}: ${v.val} · ${pct(v.val, tot)}%`, style: `--t:${v.tinta}`,
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

/** Un arco di ciambella in coordinate SVG. `da`/`a` in giri (0..1), da ore 12.
 *  Raggi e centro sono quelli delle torte se non detto altro: il quadrante
 *  dell'anno passa i suoi. */
function arco(da, a, r = R, ri = RI, c = C) {
  if (a - da >= 0.9999) {           // cerchio intero: due mezzi archi
    return `M${c},${c - r}A${r},${r} 0 1 1 ${c},${c + r}A${r},${r} 0 1 1 ${c},${c - r}Z` +
      `M${c},${c - ri}A${ri},${ri} 0 1 0 ${c},${c + ri}A${ri},${ri} 0 1 0 ${c},${c - ri}Z`;
  }
  const p = (t, r) => [
    (c + r * Math.sin(t * 2 * Math.PI)).toFixed(2),
    (c - r * Math.cos(t * 2 * Math.PI)).toFixed(2),
  ];
  const grande = a - da > 0.5 ? 1 : 0;
  const [x1, y1] = p(da, r), [x2, y2] = p(a, r);
  const [x3, y3] = p(a, ri), [x4, y4] = p(da, ri);
  return `M${x1},${y1}A${r},${r} 0 ${grande} 1 ${x2},${y2}` +
    `L${x3},${y3}A${ri},${ri} 0 ${grande} 0 ${x4},${y4}Z`;
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
   quell'impianto, e la capsula a quattro segmenti sono i suoi PASSI - la
   stessa capsula della griglia, in piccolo: piena e verde = a posto per l'anno.
   A destra lo stato in una pillola con la tinta di stato (ambra il ritardo,
   rosso il contratto da rinnovare). Ci sono TUTTI i siti aperti, anche quelli
   fuori conto (pre-avvio o mappatura non dovuta quest'anno), tenui e marcati.
   Cliccare la riga restringe il grafico dei mesi al CLIENTE di quel sito. */
function grafSiti(cl, tot) {
  const testa = h('div.barre-testa', {},
    h('span', { testo: `${tot} impianti` }),
    h('span', { testo: `${PASSI} passi` }),
    h('span', {}),
    h('span', { testo: 'stato' }));
  const righe = h('div.barre.barre-cli' + (cl.length > LIMITE_CLI ? '.lunga' : ''), {},
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
        h('span.barra-et.due', { title: nome },
          h('b', { testo: v.cli }),
          h('span', { testo: v.sito })),
        h('span.seg' + (v.completa ? '.tutta' : ''), {},
          CAMPI.map((c, k) => h('i' + (k < v.n ? '.fatto' : ''), {}))),
        h('span.barra-val.dato', { testo: `${v.n}/${PASSI}` }),
        h('span.stato-pill.' + v.stato, { testo: et }));
    }));
  return h('div', {}, testa, righe);
}

/* L'ELENCO A TUTTA PAGINA
   E' l'unica carta che puo' avere centinaia di righe: dentro la griglia sta in
   uno scorrevole, e per leggerlo tutto insieme si apre in un foglio grande.
   Non e' una vista nuova: sono le stesse righe con piu' spazio, quindi si
   costruisce con lo stesso `grafSiti` e non c'e' un secondo posto dove
   l'elenco puo' divergere dai numeri. */
let chiudiSiti = null;
function apriSiti(clienti) {
  chiudiSiti = modale(chiudi => [
    h('div.siti-testa', {},
      h('div', {},
        h('h2', { testo: 'Mappature per sito' }),
        h('p.sotto', {
          testo: `Tutti i ${clienti.length} siti aperti con questi filtri, i più ` +
            'urgenti in testa. Clicca una riga per vedere i mesi di quel cliente.',
        })),
      h('button.link-tab', { testo: 'Chiudi', onclick: chiudi })),
    h('div.siti-espansi', {}, grafSiti(clienti, clienti.length)),
  ], { classe: 'largo' });
  return chiudiSiti;
}

/* Scegliere un cliente cambia il grafico dei mesi, che sta SOTTO il foglio: se
   restasse aperto si guarderebbe un elenco mentre il grafico si muove dietro. */
function scegliCli(nome) {
  chiudiSiti?.(); chiudiSiti = null;
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

  /* tre righe di riferimento dietro le colonne, con il valore a destra: sono
     un filo del colore del bordo, non una griglia */
  const righe = h('div.griglia-h', {}, [1, .5, 0].map(f => h('span', {
    style: `--y:${(1 - f) * 100}%`,
  }, h('em.dato', { testo: String(Math.round(max * f)) }))));

  const colonne = h('div.colonne', {}, mesi.map((m, i) => {
    const alto = m.prev ? Math.max(Math.round(m.prev / max * 100), 3) : 0;
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
      h('span.col-area', { style: `--h:${alto}%` },
        h('span.col-n.dato', { testo: m.prev ? String(m.prev) : '' }),
        /* i segmenti si impilano dal basso: complete in fondo, non iniziate in
           cima (column-reverse in css/stat.css) */
        h('span.col-pista' + (m.complete ? '.con-chiuse' : ''), {},
          m.isto.map((n, k) => n
            ? h('i', { style: `--h:${n / m.prev * 100}%;--t:var(--pr-${k})` })
            : null))),
      h('span.col-m', { testo: st.mesi[i] }));
  }));
  return h('div.colonne-avvolge', {}, righe, colonne);
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
  const oggi = st.anno === st.annoOggi ? st.meseOggi - 1 : -1;

  /* L'area sfuma verso il basso e la linea ha un alone: e' lo stesso verde,
     non un colore in piu'. Il tratto verticale cyan e' il mese corrente, come
     nella griglia. Il punto finale porta il numero e un'onda lenta. */
  const svg = `
    <svg viewBox="0 0 ${W} ${H}" class="graf" role="img"
         aria-label="Andamento cumulato: ${cc} mappature complete su ${cp} in scadenza nell'anno">
      <defs>
        <linearGradient id="g-area" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" style="stop-color:var(--completa);stop-opacity:.42"/>
          <stop offset="1" style="stop-color:var(--completa);stop-opacity:0"/>
        </linearGradient>
        <filter id="g-alone" x="-5%" y="-40%" width="110%" height="180%">
          <feGaussianBlur stdDeviation="3.5" result="b"/>
          <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
      </defs>
      <g class="griglia-g">
        ${[0, .5, 1].map(f => `<line x1="${SX}" x2="${W - DX}" y1="${y(max * f)}"
             y2="${y(max * f)}"/><text x="${W - DX + 6}" y="${y(max * f) + 3.5}"
             >${Math.round(max * f)}</text>`).join('')}
      </g>
      ${oggi >= 0 ? `<line class="oggi-l" x1="${x(oggi)}" x2="${x(oggi)}" y1="${SU - 6}" y2="${H - GIU}"/>` : ''}
      <path class="area-c" d="${area}"/>
      <polyline class="linea-p" points="${via('prev')}"/>
      <polyline class="linea-c" points="${via('compl')}"/>
      ${punti.map(p => `<g class="ancora" data-i="${p.i}">
         <line class="presa" x1="${x(p.i)}" x2="${x(p.i)}" y1="${SU - 8}" y2="${H - GIU}"/>
         <line class="croce" x1="${x(p.i)}" x2="${x(p.i)}" y1="${SU - 8}" y2="${H - GIU}"/>
         <circle cx="${x(p.i)}" cy="${y(p.compl)}" r="3.4"/>
       </g>`).join('')}
      <g class="fine">
        <circle class="onda" cx="${x(11)}" cy="${y(cc)}" r="4"/>
        <circle class="punto" cx="${x(11)}" cy="${y(cc)}" r="3.6"/>
      </g>
      <g class="assi-x">
        ${punti.map(p => `<text x="${x(p.i)}" y="${H - 8}"${p.i === oggi ? ' class="oggi"' : ''}>${st.mesi[p.i]}</text>`).join('')}
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

/* ------------------------------------------------------- i quattro anelli -- */
/* "I 4 passi" come quattro anelli, uno per passo, nel colore del suo segmento:
   qui l'identita' del passo E' il dato, quindi i colori della cella stanno
   bene. Il numero e' scritto al centro e a fianco, la tabella c'e' comunque. */
function anelliPassi(d) {
  return h('div.anelli', {}, CAMPI.map(c => {
    const f = d.mappature ? d.passo[c] / d.mappature : 0;
    const p = pct(d.passo[c], d.mappature);
    const svg = `<svg viewBox="0 0 64 64" class="anello" role="img"
        aria-label="${esc(ETICHETTA[c])}: ${d.passo[c]} su ${d.mappature}">
      <circle cx="32" cy="32" r="26" fill="none" stroke="var(--st-vuoto)" stroke-width="7"/>
      <g class="fette">${f ? `<path d="${arco(0, f, 29.5, 22.5, 32)}" style="fill:var(--st-${c})"/>` : ''}</g>
      <text class="anello-n" x="32" y="35.5">${p}%</text>
    </svg>`;
    return h('div.anello-box', {
      'data-tip': `${ETICHETTA[c]}: ${d.passo[c]} su ${d.mappature} · ${p}%`,
    },
      h('div.anello-avvolge', { html: svg }),
      h('span.anello-testo', {},
        h('span.anello-et', { testo: ETICHETTA[c] }),
        h('span.anello-v.dato', { testo: `${num(d.passo[c])} su ${num(d.mappature)}` })));
  }));
}

/* ------------------------------------------------ il quadrante dell'anno -- */
/* La firma della pagina (11a sessione): i dodici mesi disposti a quadrante, come
   il ciclo di manutenzione che l'applicazione racconta. Ogni settore e' un
   mese: il verde e' la quota di mappature chiuse fra quelle che scadono la',
   l'ambra la quota rimasta scoperta in un mese gia' passato, il grigio lavoro
   ancora in tempo. I mesi senza scadenze restano un filo. Al centro il numero
   che guida la pagina: la percentuale di complete. E' la stessa lettura di
   "Come stanno le scadenze", distesa sui mesi; le colonne piu' sotto aggiungono
   il dettaglio dei passi. Stesse tinte di stato, nessun colore nuovo. */
const QR = 104, QRI = 80, QC = 120;   // raggio esterno, interno, centro (viewBox 240)
const polare = (t, r) => [
  (QC + r * Math.sin(t * 2 * Math.PI)).toFixed(2),
  (QC - r * Math.cos(t * 2 * Math.PI)).toFixed(2),
];

function quadranteAnno(mesi, d) {
  const G = 0.006;                     // mezzo distacco fra due settori, in giri
  const passato = i => st.anno < st.annoOggi ||
    (st.anno === st.annoOggi && i + 1 < st.meseOggi);
  const oggi = i => st.anno === st.annoOggi && i + 1 === st.meseOggi;

  const settori = mesi.map((m, i) => {
    const da = i / 12 + G, a = (i + 1) / 12 - G, L = a - da;
    const fC = m.prev ? m.complete / m.prev : 0;
    const fR = m.prev ? m.ritardo / m.prev : 0;
    const inTempo = m.prev - m.complete - m.ritardo;
    const tip = m.prev
      ? `${st.mesiNome[i]}: ${m.prev} in scadenza · ${m.complete} complete` +
        (m.ritardo ? ` · ${m.ritardo} in ritardo` : '') +
        (inTempo ? ` · ${inTempo} da fare, in tempo` : '')
      : `${st.mesiNome[i]}: nessuna mappatura in scadenza`;
    const cls = ['settore', !m.prev && 'vuoto', oggi(i) && 'oggi',
      passato(i) && m.complete < m.prev && 'arretrato'].filter(Boolean).join(' ');
    return `<g class="${cls}" data-tip="${esc(tip)}" tabindex="0" role="img"
        aria-label="${esc(tip)}">
      <path class="traccia" d="${arco(da, a, QR, QRI, QC)}"/>
      ${fC ? `<path class="piena" d="${arco(da, da + L * fC, QR, QRI, QC)}"/>` : ''}
      ${fR ? `<path class="tardi" d="${arco(da + L * fC, da + L * (fC + fR), QR, QRI, QC)}"/>` : ''}
    </g>`;
  }).join('');

  const nomi = mesi.map((m, i) => {
    const [x, y] = polare((i + .5) / 12, QR + 15);
    return `<text class="q-mese${oggi(i) ? ' oggi' : ''}" x="${x}" y="${y}">${st.mesi[i]}</text>`;
  }).join('');

  /* la tacca del mese corrente: la "testina di lettura" della griglia, qui a
     raggio; sta fuori dall'anello, non sopra il dato */
  let tacca = '';
  if (st.anno === st.annoOggi) {
    const t = (st.meseOggi - .5) / 12;
    const [x1, y1] = polare(t, QR + 3), [x2, y2] = polare(t, QR + 9);
    tacca = `<line class="q-tacca" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>`;
  }

  /* sessanta tacche interne: il rilievo di uno strumento, non un dato */
  const tacche = Array.from({ length: 60 }, (_, k) => {
    const t = k / 60, lunga = k % 5 === 0;
    const [x1, y1] = polare(t, QRI - 7), [x2, y2] = polare(t, QRI - (lunga ? 13 : 10));
    return `<line class="q-tick${lunga ? ' lunga' : ''}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>`;
  }).join('');

  const p = pct(d.complete, d.mappature);
  return `<svg viewBox="0 0 240 240" class="quadrante" role="group"
      aria-label="Quadrante dell'anno ${st.anno}: ${p}% di mappature complete, ${d.complete} su ${d.mappature}">
    <circle class="q-alone" cx="${QC}" cy="${QC}" r="${QR + 1}"/>
    <g class="q-tacche">${tacche}</g>
    <g class="settori">${settori}</g>
    ${tacca}
    <g class="q-nomi">${nomi}</g>
    <text class="q-sopra" x="${QC}" y="${QC - 26}">${d.complete} / ${d.mappature}</text>
    <text class="q-cifra" x="${QC}" y="${QC + 12}">${p}%</text>
    <text class="q-sotto" x="${QC}" y="${QC + 32}">complete</text>
  </svg>`;
}

/* ------------------------------------------------------------- il ritmo -- */
/* "Ce la facciamo?" e' la domanda che nessuna carta rispondeva. Il ritmo
   necessario e' quante mappature al mese vanno chiuse da qui a dicembre (mese
   corrente compreso) per arrivare al 100%; quello tenuto e' quante ne sono
   state chiuse al mese da quando il tracciamento e' partito. Il confronto e' un
   misuratore con l'obiettivo segnato, e sotto la proiezione: dove si arriva a
   fine anno tenendo questo passo. Il tracciamento puo' partire a meta' anno
   (`inizio_tracciamento`), quindi i mesi trascorsi si contano da li'. */
function ritmo(d) {
  const rimaste = d.mappature - d.complete;
  const [aT, mT] = st.inizioTracciamento.split('-').map(Number);
  const inizioM = aT < st.anno ? 1 : aT === st.anno ? mT : 13;
  let fase, trascorsi, restanti;
  if (st.anno < st.annoOggi) {
    fase = 'chiuso'; trascorsi = Math.max(0, 13 - inizioM); restanti = 0;
  } else if (st.anno > st.annoOggi) {
    fase = 'futuro'; trascorsi = 0; restanti = Math.max(0, 13 - inizioM);
  } else {
    fase = 'corso';
    trascorsi = Math.max(0, st.meseOggi - inizioM + 1);
    restanti = 13 - st.meseOggi;
  }
  const servono = restanti ? rimaste / restanti : 0;
  const finora = trascorsi ? d.complete / trascorsi : 0;
  const proiez = d.mappature
    ? Math.min(100, Math.round((d.complete + finora * restanti) / d.mappature * 100))
    : 0;
  return { rimaste, trascorsi, restanti, servono, finora, proiez, fase };
}
const dec1 = x => (Math.round(x * 10) / 10).toLocaleString('it-IT');

function cartaRitmo(d) {
  const r = ritmo(d);
  const scala = Math.max(r.servono, r.finora, 0.5) * 1.15;
  const nomeMese = st.mesiNome[Math.max(0, st.meseOggi - 1)];

  /* la cifra sale da zero quando la carta entra (contaSu): il valore grezzo
     sta in data-conta, con un decimale se non e' intero */
  const figura = (v, et, nota, tinta) => h('div.ritmo-fig', {},
    h('span.ritmo-n', {
      style: tinta ? `color:${tinta}` : null,
      'data-conta': String(v), 'data-dec': Number.isInteger(v) ? null : '1',
      testo: Number.isInteger(v) ? num(v) : dec1(v),
    }),
    h('span.ritmo-et', { testo: et }),
    h('span.ritmo-nota', { testo: nota }));

  let corpo, frase;
  if (!d.mappature) {
    frase = 'Con questi filtri non c’è nessuna mappatura dovuta.';
    corpo = h('p.niente', { testo: frase });
  } else if (r.fase === 'chiuso') {
    frase = r.rimaste
      ? `Anno chiuso: ${num(r.rimaste)} mappature sono rimaste aperte.`
      : 'Anno chiuso con tutte le mappature fatte.';
    corpo = h('div', {},
      h('div.ritmo-due', {},
        figura(d.complete, 'chiuse', `su ${num(d.mappature)} dovute`, 'var(--completa)'),
        figura(r.rimaste, 'rimaste aperte', 'a fine anno', r.rimaste ? 'var(--allerta)' : null)),
      h('p.ritmo-frase', { testo: frase }));
  } else if (r.fase === 'futuro' || !r.trascorsi) {
    frase = r.fase === 'futuro'
      ? `Anno non ancora iniziato: ${num(r.rimaste)} mappature in ${r.restanti} mesi.`
      : `Il tracciamento parte a ${st.mesiNome[Math.min(11, inizioMese())]}: da lì, ` +
        `${dec1(r.servono)} al mese.`;
    corpo = h('div', {},
      h('div.ritmo-due', {},
        figura(r.servono, 'al mese', 'per chiudere l’anno'),
        figura(r.restanti, 'mesi', 'a disposizione')),
      h('p.ritmo-frase', { testo: frase }));
  } else {
    frase = r.finora
      ? `A questo ritmo l’anno chiude al ${r.proiez}%.`
      : `Nessuna chiusura finora: senza accelerare l’anno chiude al ${r.proiez}%.`;
    corpo = h('div', {},
      h('div.ritmo-due', {},
        figura(r.servono, 'al mese', `servono nei ${r.restanti} mesi che restano`),
        figura(r.finora, 'al mese', `tenute in ${r.trascorsi} mes${r.trascorsi === 1 ? 'e' : 'i'} tracciat${r.trascorsi === 1 ? 'o' : 'i'}`,
          r.finora >= r.servono ? 'var(--completa)' : (r.finora ? 'var(--allerta)' : null))),
      h('div.misura.ritmo-misura', {},
        h('div.misura-et', {},
          h('span', { testo: 'ritmo tenuto contro obiettivo' }),
          h('span.dato', { testo: `${dec1(r.finora)} / ${dec1(r.servono)}` })),
        h('div.pista.con-obiettivo', {
          'data-tip': `Chiuse al mese finora: ${dec1(r.finora)} · servono ${dec1(r.servono)} ` +
            `da ${nomeMese} a Dicembre`,
        },
          h('i', { style: `--w:${Math.min(100, r.finora / scala * 100)}%` }),
          h('b.obiettivo', { style: `--x:${Math.min(100, r.servono / scala * 100)}%` }))),
      h('p.ritmo-frase' + (r.finora >= r.servono ? '.bene' : ''), { testo: frase }));
  }
  const c = carta('Ritmo per chiudere l’anno',
    `Quante mappature al mese vanno chiuse da qui a Dicembre per arrivare al 100%, ` +
    'e quante se ne stanno chiudendo.',
    corpo,
    {
      col: ['Voce', 'Valore'],
      righe: [
        ['Mappature dovute', num(d.mappature)],
        ['Complete', num(d.complete)],
        ['Rimaste', num(r.rimaste)],
        ['Mesi tracciati trascorsi', r.trascorsi],
        ['Mesi che restano', r.restanti],
        ['Servono al mese', dec1(r.servono)],
        ['Chiuse al mese finora', dec1(r.finora)],
        ['Proiezione a fine anno', r.proiez + '%'],
      ],
    });
  c.classList.add('ritmo');
  return c;
}
const inizioMese = () => {
  const [a, m] = st.inizioTracciamento.split('-').map(Number);
  return a === st.anno ? m - 1 : 0;
};

/* ------------------------------------------------------- da fare adesso -- */
/* La lista di lavoro dell'oggi, in TRE gruppi di urgenza: le arretrate (dovute,
   scadute, non chiuse - le piu' vecchie prima), quelle che scadono QUESTO mese e
   quelle del PROSSIMO. I tre gruppi non si sovrappongono: "in ritardo" vuol dire
   scadenza in un mese GIA' passato, quindi mai il mese corrente.

   Prima l'elenco teneva solo gli ultimi due gruppi mentre la testa scriveva "229
   in ritardo": il numero piu' grande della carta non portava a nessuna riga, ed
   era proprio il lavoro piu' urgente a non essere raggiungibile. Ora i tre
   contatori sono anche i filtri: uno acceso isola il suo gruppo.

   L'ordine dentro un gruppo NON guarda quante spunte ha la riga. Ordinare per
   avanzamento faceva saltare via la riga appena toccata - spuntavi un passo su
   quattro e il nome si spostava in fondo al gruppo, fuori dalla parte visibile
   dello scorrimento: sembrava sparito. Ordine per scadenza e poi per nome, che
   mentre si lavora non si muove.

   La riga apre il cassetto del service, cioe' il posto dove si spunta. Vale per
   l'anno in corso: in un altro anno la carta lo dice e non inventa una scadenza
   che non c'e'. */
/* Stato della VISTA: quale gruppo e' isolato (null = tutti e tre). */
let gruppoDaFare = null;

function cartaDaFare(d, dov) {
  const inCorso = st.anno === st.annoOggi;
  const m0 = st.meseOggi, m1 = m0 < 12 ? m0 + 1 : 0;
  const perNome = (a, b) =>
    a.cli.localeCompare(b.cli, 'it') || a.sito.localeCompare(b.sito, 'it');
  const gruppi = inCorso
    ? [
      {
        k: 'tardi', et: 'in ritardo', tinta: 'var(--allerta)',
        righe: dov.filter(v => v.ritardo).sort((a, b) => a.scad - b.scad || perNome(a, b)),
      },
      {
        k: 'ora', et: `scadono a ${st.mesiNome[m0 - 1]}`, tinta: 'var(--marchio-scuro)',
        righe: dov.filter(v => !v.completa && !v.ritardo && v.scad === m0).sort(perNome),
      },
      m1 ? {
        k: 'poi', et: `scadono a ${st.mesiNome[m1 - 1]}`, tinta: null,
        righe: dov.filter(v => !v.completa && !v.ritardo && v.scad === m1).sort(perNome),
      } : null,
    ].filter(Boolean)
    : [];
  /* Il gruppo isolato puo' svuotarsi mentre si lavora (o cambiando filtro):
     allora il filtro cade, invece di lasciare una carta vuota senza spiegazione. */
  if (gruppoDaFare && !gruppi.some(g => g.k === gruppoDaFare && g.righe.length)) {
    gruppoDaFare = null;
  }
  const righe = gruppi
    .filter(g => !gruppoDaFare || g.k === gruppoDaFare)
    .flatMap(g => g.righe);

  const contatore = g => h('button.agenda-conta' + (gruppoDaFare === g.k ? '.acceso' : ''), {
    'aria-pressed': String(gruppoDaFare === g.k),
    'data-tip': g.righe.length
      ? (gruppoDaFare === g.k ? 'Clic per rivedere tutti i gruppi'
        : `Clic per vedere solo queste ${num(g.righe.length)}`)
      : 'Niente in questo gruppo',
    disabled: !g.righe.length && gruppoDaFare !== g.k,
    onclick: () => { gruppoDaFare = gruppoDaFare === g.k ? null : g.k; aggiorna(); },
  },
    h('span.agenda-n', {
      style: g.tinta && g.righe.length ? `color:${g.tinta}` : null,
      'data-conta': String(g.righe.length), testo: num(g.righe.length),
    }),
    h('span.agenda-et', { testo: g.et }));

  const testa = inCorso ? h('div.agenda-testa', {}, gruppi.map(contatore)) : null;

  const etGruppo = v => v.ritardo ? 'in ritardo' : v.scad === m0 ? 'questo mese' : 'il mese prossimo';
  const elenco = !inCorso
    ? h('p.niente', {
      testo: `Questa lista guarda il ritardo, il mese corrente e il prossimo: vale ` +
        `solo per il ${st.annoOggi}. Per il ${st.anno} usa l’elenco per sito ` +
        'in fondo alla pagina.',
    })
    : righe.length
      ? h('div.agenda' + (righe.length > 8 ? '.lunga' : ''), {}, righe.map(v => h('div.agenda-riga', {
        role: 'button', tabindex: '0',
        'data-tip': `${v.cli} — ${v.sito} (#${v.id}): ` +
          `${v.ritardo ? 'scaduta' : 'scade'} a ${st.mesiNome[v.scad - 1]} · ` +
          `${v.n} di ${PASSI} passi · clic per aprire il service`,
        onclick: () => apriCassetto(v.id),
        onkeydown: e => {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); apriCassetto(v.id); }
        },
      },
        h('span.agenda-mese' + (v.ritardo ? '.tardi' : v.scad === m0 ? '.ora' : ''),
          { testo: st.mesi[v.scad - 1] }),
        h('span.agenda-nome', {},
          h('b', { testo: v.cli }),
          h('span', { testo: v.sito })),
        h('span.agenda-passi', {}, CAMPI.map((c, k) =>
          h('i' + (k < v.n ? '.fatto' : ''), {}))),
        h('span.agenda-val.dato', { testo: `${v.n}/${PASSI}` }))))
      : h('p.niente', {
        testo: gruppoDaFare
          ? 'Niente in questo gruppo.'
          : `Niente arretrato e niente in scadenza a ${st.mesiNome[m0 - 1]}` +
            (m1 ? ` e ${st.mesiNome[m1 - 1]}` : '') + ' che non sia già chiuso.',
      });

  const c = carta('Da fare adesso',
    inCorso
      ? 'Le mappature dovute e non chiuse: prima le arretrate, poi quelle che ' +
        'scadono questo mese e il prossimo. Clicca un numero per isolare un ' +
        'gruppo, una riga per aprire il service e spuntare.'
      : 'Le mappature arretrate e quelle che scadono questo mese e il prossimo.',
    h('div.dafare-corpo', {}, testa, elenco),
    righe.length ? {
      col: ['Gruppo', 'Scade', 'Cliente', 'Sito', '#', 'Passi'],
      righe: righe.map(v => [etGruppo(v), st.mesiNome[v.scad - 1], v.cli, v.sito, v.id,
        `${v.n}/${PASSI}`]),
    } : null);
  c.classList.add('dafare');
  return c;
}

/* ------------------------------------------------------------ conta-su --- */
/* Le cifre grandi salgono da zero quando la loro carta entra in vista: e' lo
   stesso gesto delle forme che si riempiono, applicato ai numeri. `data-dec`
   dice che il valore ha un decimale (il ritmo). Dopo una spunta non riparte
   (disegna(area, false)). Rispetta prefers-reduced-motion. */
function contaSu(nodoRadice) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const nodi = [...nodoRadice.querySelectorAll('[data-conta]')];
  if (!nodi.length) return;
  const t0 = performance.now(), durata = 900;
  const passo = t => {
    const f = Math.min(1, (t - t0) / durata), e = 1 - Math.pow(1 - f, 3);
    for (const n of nodi) {
      const v = Number(n.dataset.conta);
      n.textContent = (n.dataset.dec ? dec1(v * e) : num(Math.round(v * e))) +
        (n.dataset.suff || '');
    }
    if (f < 1) requestAnimationFrame(passo);
  };
  requestAnimationFrame(passo);
}

/* ------------------------------------------------------------- l'entrata -- */
/* Ogni carta entra quando arriva in vista (IntersectionObserver): le carte
   sotto la piega non si animano a vuoto e la pagina si accende scorrendo. La
   scalatura (`--r`) e' per gruppo di carte che entrano insieme. Al ridisegno
   dopo una spunta (`animato` falso) tutto e' gia' `.entrata`: non riparte
   nulla e la pagina non lampeggia. */
function rivela(area, animato) {
  const carte = [...area.querySelectorAll('.carta')];
  const subito = !animato || !('IntersectionObserver' in window) ||
    matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (subito) { carte.forEach(c => c.classList.add('entrata')); return; }
  const io = new IntersectionObserver(voci => {
    let k = 0;
    for (const v of voci) {
      if (!v.isIntersecting) continue;
      v.target.style.setProperty('--r', String(k++));
      v.target.classList.add('entrata');
      contaSu(v.target);
      io.unobserve(v.target);
    }
  }, { root: area, threshold: .08 });
  carte.forEach(c => io.observe(c));
}

/* ---------------------------------------------------- lo scorrimento ----- */
/* Gli scorrevoli stanno DENTRO le carte (la lista di lavoro, l'elenco per
   sito) e le carte si ricostruiscono a ogni spunta: senza ricordarne la
   posizione tornavano in cima e la riga su cui si stava lavorando usciva dalla
   vista - l'altra faccia del "nome che sparisce". `aggiorna()` fa la stessa
   cosa per lo scorrimento della pagina. */
const SCORREVOLI = ['.dafare .agenda', '.barre-cli'];
const leggiScorrimento = area =>
  SCORREVOLI.map(s => area.querySelector(s)?.scrollTop || 0);
const rimettiScorrimento = (area, v) => SCORREVOLI.forEach((s, i) => {
  const n = v[i] && area.querySelector(s);
  if (n) n.scrollTop = v[i];
});

/* --------------------------------------------------------------- disegno -- */
/** @param animato false quando si ridisegna dopo una spunta o un clic nei
 *  grafici: le forme non devono ripartire da zero ogni volta. */
export function disegna(area, animato = true) {
  radice = area;
  const scorrimenti = leggiScorrimento(area);
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

  /* --- la carta d'apertura: il quadrante dell'anno e le tessere ---------- */
  const tessera = (n, et, nota, tinta) => h('div.tessera', {},
    h('span.t-n', {
      style: tinta ? `color:${tinta}` : null,
      'data-conta': String(n), testo: num(n),
    }),
    h('span.t-et', { testo: et }),
    nota ? h('span.t-nota', { testo: nota }) : null);

  const f = st.filtri;
  const filtrato = !!(f.q || f.prov || f.stato);
  const eroe = h('section.carta.eroe.c12', {},
    h('div.eroe-quadro', { html: quadranteAnno(mesiTutti, d) }),
    h('div.eroe-testo', {},
      h('span.occhiello', {},
        h('span', { testo: `Mappature ${st.anno}` }),
        h('i'),
        h('span', { testo: filtrato ? 'sui siti filtrati' : 'tutti i siti aperti' })),
      h('h2.eroe-titolo', {},
        h('b', { 'data-conta': String(d.complete), testo: num(d.complete) }),
        ` mappature chiuse su ${num(d.mappature)} dovute`),
      h('p.eroe-frase', {
        testo: `${num(d.passiFatti)} spunte su ${num(d.passiTot)}. Ogni settore del ` +
          'quadrante è un mese: verde chiuso, ambra scoperto in un mese già passato, ' +
          'grigio ancora in tempo.',
      }),
      /* Qui c'era una pista di avanzamento larga quanto la carta. E' stata
         tolta alla 13a sessione: la percentuale la dice gia' il quadrante a
         fianco, in grande e nel mezzo, e a pochi punti percentuali la pista era
         un binario grigio quasi tutto vuoto - "un pezzo di plastica", parole
         del committente. Il segnale sull'avanzamento resta a due misure: la
         linea di stato sotto la barra strumenti e l'alone della casella
         completa. */
      h('div.tessere', {},
        tessera(d.clienti, 'clienti', 'con almeno un sito aperto'),
        tessera(d.aperti, 'siti aperti', 'un service = un impianto'),
        tessera(d.mappature, 'mappature dovute', 'una per sito, annuale'),
        tessera(d.ritardo, 'in ritardo', 'scadenza passata, non chiuse',
          d.ritardo ? 'var(--allerta)' : null),
        tessera(d.preTrac, 'pre-tracciamento', 'scadute prima dell’avvio: fuori dai conti'))));

  const inTesta = tuttiCli ? clienti : clienti.slice(0, LIMITE_CLI);
  /* Due comandi nella testa della carta: restringere alla testa dell'elenco e
     aprirlo a tutta pagina. Vanno in un contenitore, perche' `carta()` accetta
     un solo nodo come extra (dopo mette il suo "Tabella"). */
  const comandiSiti = h('div.carta-comandi', {},
    clienti.length > LIMITE_CLI
      ? h('button.link-tab' + (tuttiCli ? '' : '.acceso'), {
        testo: tuttiCli ? `Solo i primi ${LIMITE_CLI}` : `Tutti i ${clienti.length} siti`,
        onclick: () => { tuttiCli = !tuttiCli; aggiorna(); },
      })
      : null,
    h('button.link-tab.forte', {
      testo: 'Espandi',
      'data-tip': 'Apre l’elenco completo a tutta pagina',
      onclick: () => apriSiti(clienti),
    }));

  /* --- i tre quadranti: le tre domande da un secondo -------------------- */
  const livello = k => k === PASSI ? `complete (${PASSI} su ${PASSI})`
    : k === 0 ? 'non iniziate' : `${k} pass${k === 1 ? 'o' : 'i'} su ${PASSI}`;

  const quadranti = [
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
      { n: pct(d.cli.aPosto, cliConDovute) + '%', et: 'a posto' }),
  ];

  const carte = [
    carta('Mappature per sito',
      `La mappatura è annuale e una per sito: una riga per impianto, la barra ` +
      `sono i suoi ${PASSI} passi, piena = a posto per l’anno. Ci sono tutti i ` +
      'siti aperti, anche quelli fuori conto (pre-avvio o mappatura non dovuta ' +
      'quest’anno). In testa i più urgenti. Clicca una riga per vedere i mesi di ' +
      'quel cliente.',
      grafSiti(inTesta, clienti.length),
      {
        col: ['Cliente', 'Sito', '#', 'Stato', 'Scade', 'Passi'],
        righe: clienti.map(v => [v.cli, v.sito, v.id, STATO[v.stato].et,
          v.scad ? st.mesiNome[v.scad - 1] : '—', `${v.n}/${PASSI}`]),
      },
      comandiSiti),

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
      anelliPassi(d),
      {
        col: ['Passo', 'Fatte', 'Dovute', '%'],
        righe: CAMPI.map(c => [ETICHETTA[c], d.passo[c], d.mappature,
          pct(d.passo[c], d.mappature) + '%']),
      }),

    carta('Mappature per provincia',
      'Dove sta il lavoro dell’anno: una mappatura per sito, nella provincia ' +
      'dell’impianto. Le prime otto; dentro la barra, in verde, quante sono già chiuse.',
      barre(
        province.slice(0, 8).map(v => ({
          et: v.et, val: v.prev, sub: v.complete,
          tip: `${v.et}: ${v.complete} complete su ${v.prev} · ${pct(v.complete, v.prev)}%`,
        })),
        null, v => `${num(v.sub)}/${num(v.val)}`, { rango: true }),
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
        })), null, v => num(v.val), { rango: true })
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

  /* La griglia e' a dodici colonne e ogni carta dichiara quante ne prende. In
     ordine: l'apertura; la lista di lavoro con a fianco, impilati, il ritmo e i
     quattro anelli dei passi (riempiono l'altezza della lista); le tre domande
     da un secondo; il tempo (mese per mese + andamento); tutti i siti; e in
     fondo le tre carte di dettaglio. `--i` scala solo la prima schermata: le
     altre entrano quando arrivano in vista (rivela). */
  const span = (el, c) => { el.classList.add(c); return el; };
  const [siti, mesi, andam, passi, prov, scad, spunte] = carte;
  const ordine = [
    eroe,
    span(cartaDaFare(d, dov), 'c8'),
    h('div.colonna-carte.c4', {}, cartaRitmo(d), passi),
    ...quadranti.map(q => span(q, 'c4')),
    span(mesi, 'c7'), span(andam, 'c5'),
    span(prov, 'c4'), span(scad, 'c4'), span(spunte, 'c4'),
    /* L'elenco per sito chiude la pagina: e' l'archivio completo (tutti gli
       impianti, anche quelli fuori conto), non una domanda da un secondo, e
       col bottone "Espandi" si legge a tutta pagina. Stava in mezzo e
       spezzava in due la fascia dei grafici. */
    span(siti, 'c12'),
  ];

  area.replaceChildren(h('div.stat', {},
    vuoto
      ? h('div.vuoto', {
        html: `<b>Nessun sito aperto, con questi filtri</b>
               Togli un filtro o svuota la ricerca.`,
      })
      : h('div.stat-griglia', {}, ordine)));
  rimettiScorrimento(area, scorrimenti);
  collega(area);
  rivela(area, animato);
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
  chiudiSiti?.(); chiudiSiti = null;
  radice = null;
}
