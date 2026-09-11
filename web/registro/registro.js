/* registro.js - il REGISTRO DEI COMPONENTI, senza DOM.  #ANCHOR: registro-modello

Porting 1:1 di due moduli Python (C:\Claude\mappatura\registro\): `lettura.py`
(apertura dell'export .xls del gestionale e interpretazione della stringa
piatta) e `modello.py` (ordinamenti, raggruppamenti, legenda, quadro
d'insieme, anomalie, controlli). Qui non si tocca nessun elemento della
pagina: entra un ArrayBuffer, esce una struttura dati. L'impaginazione sta in
impagina.js, gli agganci all'interfaccia in app.js.

Le decisioni di dominio NON sono negoziabili (sono del committente, scritte nel
README della mappatura):
  - piani in ordine numerico crescente, i non numerici in coda;
  - dentro il piano prima le centrali e i locali tecnici (PAROLE_TECNICI), poi
    gli altri reparti in ordine alfabetico naturale;
  - stanze in ordine alfabetico naturale ("STANZA 2" prima di "STANZA 10");
  - nessuna invenzione: il nome semplice viene solo dal dizionario, altrimenti
    si stampa la descrizione originale del gestionale;
  - quadratura: la somma delle quantita' del documento deve fare le righe dati.

Due avvertenze di traduzione da Python:
  - gli ordinamenti usano Map e array, non oggetti: l'ORDINE DI INSERIMENTO e'
    il criterio di parita' di tutti i sorted() di modello.py (ordinamento
    stabile), e un oggetto JS riordina da solo le chiavi numeriche;
  - `chiaveNaturale` restituisce un array di coppie [tipo, valore] esattamente
    come la lista di tuple di Python: il confronto e' in `cmpNaturale`.
*/

/* Parole che identificano centrali e locali tecnici: copia di
   mappatura/dati/regole.json. Un reparto il cui nome contiene una di queste
   parole (senza distinzione di maiuscole) viene elencato per primo dentro il
   suo piano. */
export const PAROLE_TECNICI = [
  'CENTRALE', 'LOCALE TECNICO', 'LOC. TECNICO', 'LOC.TECNICO', 'SOTTOCENTRALE',
  'SALA MACCHINE', 'SALA TECNICA', 'SALA COMPRESSORI', 'SALA POMPE', 'CABINA',
];

/* I componenti senza priorita' assegnata vanno dopo tutti quelli con 1..10. */
export const PRIORITA_IN_CODA = 99;

export const MESI = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno',
  'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];

/** Errore comprensibile da mostrare all'utente dell'ufficio. */
export class ErroreLettura extends Error { }

/* ------------------------------------------------------------------ utilita' */

const pulisci = s => String(s ?? '').replace(/\s+/g, ' ').trim();

/** Ordinamento alfabetico naturale: 'STANZA 2' precede 'STANZA 10'.
 *  Stessa chiave di modello.chiave_naturale: [0, numero] per le cifre,
 *  [1, testo] per il resto; le due famiglie non si confrontano mai fra loro
 *  se non per il primo elemento (i numeri prima delle lettere). */
export function chiaveNaturale(s) {
  const parti = String(s ?? '').toLowerCase().trim().split(/(\d+)/);
  const out = [];
  for (const p of parti) {
    if (p === '') continue;
    out.push(/^\d+$/.test(p) ? [0, Number(p)] : [1, p]);
  }
  return out;
}

/** Confronto fra due chiavi naturali (il `<` fra liste di tuple di Python). */
export function cmpChiavi(a, b) {
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    const x = a[i], y = b[i];
    if (x[0] !== y[0]) return x[0] - y[0];
    if (x[1] < y[1]) return -1;
    if (x[1] > y[1]) return 1;
  }
  return a.length - b.length;
}

export const cmpNaturale = (a, b) => cmpChiavi(chiaveNaturale(a), chiaveNaturale(b));

/** Confronto fra stringhe come lo fa Python (per punto di codice). */
export const cmpTesto = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

/** Il piano come numero, oppure null se l'etichetta non e' un numero. */
export function pianoNumerico(etichetta) {
  const m = /^\s*([+-]?\d+)\s*$/.exec(etichetta || '');
  return m ? Number(m[1]) : null;
}

export function slug(s) {
  const v = String(s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return v || 'x';
}

const normalizza = s => String(s ?? '').toUpperCase().replace(/[^A-Z0-9]+/g, '');

/** Toglie il suffisso numerico del gestionale: 'STANZA 1 (2)' -> 'STANZA 1'. */
const senzaSuffisso = s => String(s ?? '').replace(/\s*\(\d+\)\s*$/, '');

/** True se le due stringhe distano al massimo 1 (sostituzione, inserimento o
 *  cancellazione). */
export function levenshteinMax1(a, b) {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 1) return false;
  if (a.length === b.length) {
    let d = 0;
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) d++;
    return d === 1;
  }
  if (a.length > b.length) { const t = a; a = b; b = t; }
  let i = 0, j = 0, salto = false;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; }
    else if (!salto) { salto = true; j++; }
    else return false;
  }
  return true;
}

/** Nomi normalizzati che sembrano lo stesso nome con un refuso.
 *  Non si segnalano le differenze legittime: cifre diverse ("REPARTO 1" /
 *  "REPARTO 2") e destra/sinistra ("DX" / "SX"). */
export function quasiUguali(a, b, minimo) {
  if (a === b) return true;
  if (Math.min(a.length, b.length) < minimo || !levenshteinMax1(a, b)) return false;
  if (a.length === b.length) {
    const diff = [];
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) diff.push([a[i], b[i]]);
    if (diff.every(([x, y]) => /\d/.test(x) && /\d/.test(y))) return false;
    if (diff.length === 1 && ((diff[0][0] === 'D' && diff[0][1] === 'S') || (diff[0][0] === 'S' && diff[0][1] === 'D'))) {
      let ia = 0;
      while (ia < a.length && a[ia] === b[ia]) ia++;
      const pa = a.slice(ia, ia + 2), pb = b.slice(ia, ia + 2);
      if ((pa === 'DX' || pa === 'SX') && (pb === 'DX' || pb === 'SX')) return false;
    }
    return true;
  }
  const corto = a.length < b.length ? a : b;
  const lungo = a.length < b.length ? b : a;
  // carattere in piu': se e' una cifra non e' un refuso ("STANZA 1" / "STANZA 12")
  for (let i = 0; i < lungo.length; i++) {
    if (lungo.slice(0, i) + lungo.slice(i + 1) === corto) return !/\d/.test(lungo[i]);
  }
  return true;
}

/** Confronto fra etichette grezze: normalizza e applica quasiUguali, escludendo
 *  le differenze legittime del gestionale (suffisso "(n)", ultima parola di una
 *  sola lettera). */
export function nomiQuasiUguali(a, b, minimo) {
  const ba = senzaSuffisso(a), bb = senzaSuffisso(b);
  if ((ba !== a || bb !== b) && normalizza(ba) === normalizza(bb)) return false;
  const ta = ba.split(/\s+/).filter(Boolean), tb = bb.split(/\s+/).filter(Boolean);
  if (ta.length && tb.length && ta.length === tb.length &&
      ta.slice(0, -1).join('\u0000') === tb.slice(0, -1).join('\u0000') &&
      ta[ta.length - 1].length === 1 && tb[tb.length - 1].length === 1) {
    return false;   // "NUCLEO A" / "NUCLEO B"
  }
  return quasiUguali(normalizza(ba), normalizza(bb), minimo);
}

export function dataItaliana(d) {
  return `${d.getDate()} ${MESI[d.getMonth()]} ${d.getFullYear()}`;
}

const isoLocale = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/* ---- piccoli surrogati delle collezioni di Python ---- */

/** Counter: Map chiave -> conteggio, con l'ordine di prima comparsa. */
const conta = (m, k, n = 1) => m.set(k, (m.get(k) || 0) + n);

/** Il piu' frequente, a parita' il primo visto: Counter.most_common(1). */
function piuFrequente(m) {
  let best = null, n = -1;
  for (const [k, v] of m) if (v > n) { best = k; n = v; }
  return best;
}

/** Counter.most_common(): per conteggio decrescente, a parita' ordine di
 *  inserimento (l'ordinamento di JS e' stabile, come quello di Python). */
const perFrequenza = m => [...m.entries()].sort((a, b) => b[1] - a[1]);

/* ==================================================================== LETTURA
   Struttura attesa del foglio (lettura.py):
     riga 1, col A  -> nome del cliente / sito
     riga 2         -> intestazioni
     dalla riga 3   -> una riga per pezzo installato, col A = stringa piatta
                       "CODICE - DESCRIZIONE PIANO: n; REPARTO: X; STANZA: Y; ..."
     col C          -> nota operatore (uso interno, mai nel documento cliente) */

/* La descrizione puo' contenere qualsiasi cosa (parentesi, virgole, "-"),
   quindi ci si ancora sulle etichette fisse PIANO: / REPARTO: / STANZA:.
   [\s\S] al posto del punto: e' il re.S di Python. */
const RX_RIGA = /^\s*(\S+)\s*-\s*([\s\S]*?)\s*PIANO:\s*([^;]*);\s*REPARTO:\s*([^;]*);\s*STANZA:\s*([^;]*);([\s\S]*)$/;

/** Interpreta la stringa piatta della colonna A. `null` se non ha la forma attesa. */
export function interpretaRiga(testo, indice, nota = '') {
  const m = RX_RIGA.exec(String(testo ?? ''));
  if (!m) return null;
  return {
    indice,
    codice: pulisci(m[1]),
    descrizione: pulisci(m[2]),
    piano: pulisci(m[3]),
    reparto: pulisci(m[4]),
    stanza: pulisci(m[5]),
    nota: pulisci(nota),
  };
}

/**
 * Apre l'export del gestionale e restituisce
 * `{cliente, righe, righeNonInterpretate, righeDati, percorso}`.
 * Usa SheetJS (globale `XLSX`, caricato da /lib/xlsx.min.js).
 * Gli errori sono gli stessi di lettura.py, con lo stesso testo: sono quelli
 * che l'ufficio ha imparato a leggere.
 */
export function leggiExport(arrayBuffer, nomeFile = '') {
  const nome = nomeFile || 'file caricato';
  if (!/\.(xls|xlsx|xlsm)$/i.test(nome)) {
    throw new ErroreLettura('Il file non e\u0300 un .xls: sono accettati solo gli export .xls del gestionale.');
  }
  if (typeof XLSX === 'undefined') throw new ErroreLettura('La libreria di lettura Excel non e\u0300 stata caricata.');

  let wb;
  try {
    wb = XLSX.read(arrayBuffer, { type: 'array', codepage: 1252, cellDates: false, cellStyles: false });
  } catch (e) {
    throw new ErroreLettura('Il file non e\u0300 un .xls leggibile: ' + (e?.message || e));
  }
  if (!wb.SheetNames.length) throw new ErroreLettura('Il file non contiene fogli.');
  const sh = wb.Sheets[wb.SheetNames[0]];
  const righeFoglio = XLSX.utils.sheet_to_json(sh, { header: 1, raw: false, defval: '', blankrows: true });
  if (!righeFoglio.length) throw new ErroreLettura('Il file e\u0300 vuoto.');

  const cliente = pulisci(righeFoglio[0]?.[0]);
  if (!cliente) {
    throw new ErroreLettura('Struttura diversa dall\u0027attesa: la cella A1 dovrebbe contenere il nome del cliente.');
  }

  const ex = { cliente, righe: [], righeNonInterpretate: [], righeDati: 0, percorso: nome };

  if (righeFoglio.length < 3) {
    throw new ErroreLettura(`Il file contiene solo l\u0027intestazione e nessun componente (cliente: ${cliente}).`);
  }

  for (let r = 2; r < righeFoglio.length; r++) {
    const a = String(righeFoglio[r]?.[0] ?? '');
    if (!a.trim()) continue;
    ex.righeDati++;
    const nota = String(righeFoglio[r]?.[2] ?? '');
    const riga = interpretaRiga(a, r + 1, nota);
    if (riga === null) ex.righeNonInterpretate.push([r + 1, pulisci(a)]);
    else ex.righe.push(riga);
  }

  if (ex.righeDati === 0) throw new ErroreLettura(`Il file non contiene componenti (cliente: ${cliente}).`);
  if (!ex.righe.length) {
    const esempio = ex.righeNonInterpretate[0][1].slice(0, 120);
    throw new ErroreLettura(
      'Struttura diversa dall\u0027attesa: nessuna riga ha il formato ' +
      '"CODICE - DESCRIZIONE PIANO: ...; REPARTO: ...; STANZA: ...;". ' +
      `Prima riga trovata: "${esempio}"`);
  }
  return ex;
}

/* ================================================================ COSTRUZIONE */

/**
 * Costruisce il Registro dalle righe dell'export. Stessa struttura di
 * modello.costruisci_registro (nomi dei campi in italiano, come li' ).
 *   dizionario  Map|oggetto codice -> nome semplice
 *   priorita    Map|oggetto codice -> 1..10 (ordine nel quadro d'insieme)
 *   oggi        Date (default: oggi)
 */
export function costruisciRegistro(ex, { dizionario = {}, priorita = {}, oggi = null,
                                          paroleTecnici = PAROLE_TECNICI } = {}) {
  const giorno = oggi || new Date();
  const diz = dizionario instanceof Map ? dizionario : new Map(Object.entries(dizionario || {}));
  const pri = priorita instanceof Map ? priorita : new Map(Object.entries(priorita || {}));
  const parole = paroleTecnici.map(p => p.toUpperCase());

  const righe = ex.righe;
  const anomalie = [];
  const anom = (gravita, tipo, messaggio, r = []) => anomalie.push({ gravita, tipo, messaggio, righe: r });

  /* --- descrizione di riferimento per ogni codice (la piu' frequente) --- */
  const descrPerCodice = new Map();      // codice -> Counter(descrizione)
  for (const r of righe) {
    if (!descrPerCodice.has(r.codice)) descrPerCodice.set(r.codice, new Map());
    conta(descrPerCodice.get(r.codice), r.descrizione);
  }
  const descrizione = new Map();
  for (const [cod, c] of descrPerCodice) {
    descrizione.set(cod, piuFrequente(c));
    if (c.size > 1) {
      const varianti = perFrequenza(c).map(([d, n]) => `"${d}" (${n})`).join('; ');
      anom('avviso', 'descrizioni diverse per lo stesso codice',
        `Il codice ${cod} compare con ${c.size} descrizioni diverse: ${varianti}. ` +
        'Nel documento si usa la piu\u0300 frequente.',
        righe.filter(r => r.codice === cod).map(r => r.indice));
    }
  }
  const nomeMostrato = new Map();
  for (const cod of descrizione.keys()) nomeMostrato.set(cod, diz.get(cod) || descrizione.get(cod));

  /* --- classificazione dei luoghi --- */
  const eTecnico = reparto => {
    const u = String(reparto || '').toUpperCase();
    return parole.some(p => u.includes(p));
  };

  /* gruppi: chiaveSezione -> (piano|reparto) -> stanza -> Counter(codice).
     Tutto Map: l'ordine di inserimento e' il criterio di parita' dei sorted(). */
  const gruppi = new Map();
  const chiaveSezione = r => {
    const n = pianoNumerico(r.piano);
    return n !== null ? 'piano\u0000' + n : 'altro\u0000' + r.piano;
  };
  for (const r of righe) {
    const k = chiaveSezione(r);
    if (!gruppi.has(k)) gruppi.set(k, new Map());
    const rep = gruppi.get(k);
    const kr = r.piano + '\u0000' + r.reparto;
    if (!rep.has(kr)) rep.set(kr, new Map());
    const stanze = rep.get(kr);
    if (!stanze.has(r.stanza)) stanze.set(r.stanza, new Map());
    conta(stanze.get(r.stanza), r.codice);
  }

  const ordineSezione = k => {
    const [tipo, resto] = k.split('\u0000');
    return tipo === 'piano' ? [1, Number(resto), ''] : [2, 0, resto.toLowerCase()];
  };
  const chiaviSezione = [...gruppi.keys()].sort((a, b) => {
    const x = ordineSezione(a), y = ordineSezione(b);
    return (x[0] - y[0]) || (x[1] - y[1]) || cmpTesto(x[2], y[2]);
  });

  const sezioni = [];
  for (const k of chiaviSezione) {
    const [tipoK, resto] = k.split('\u0000');
    let titolo, breve, sotto, tipo, sid;
    if (tipoK === 'piano') {
      const n = Number(resto);
      titolo = `Piano ${n}`; breve = `P. ${n}`; tipo = 'piano';
      /* 1:1 con modello.py: per i piani negativi la sostituzione tocca anche il
         trattino di "piano-", quindi l'id e' "pianomeno-meno-1". Non si vede
         mai (serve solo come ancora interna), ma resta identico all'originale */
      sid = n < 0 ? `piano-${n}`.split('-').join('meno-') : `piano-${n}`;
      sotto = n < 0 ? 'interrato' : '';
    } else {
      titolo = `Piano \u201c${resto}\u201d`; breve = resto.slice(0, 10); sotto = '';
      tipo = 'altro'; sid = 'piano-' + slug(resto);
      anom('avviso', 'piano non numerico',
        `Il piano "${resto}" non e\u0300 un numero: nel documento compare in coda, dopo i piani numerati.`,
        righe.filter(r => r.piano === resto).map(r => r.indice));
    }

    /* centrali e locali tecnici per primi, poi gli altri in ordine naturale */
    const chiaviRep = [...gruppi.get(k).keys()].sort((a, b) => {
      const ra = a.split('\u0000')[1], rb = b.split('\u0000')[1];
      return (eTecnico(ra) ? 0 : 1) - (eTecnico(rb) ? 0 : 1) || cmpNaturale(ra, rb);
    });
    const reparti = [];
    for (const kr of chiaviRep) {
      const [piano, nomeRep] = kr.split('\u0000');
      const stanze = gruppi.get(k).get(kr);
      const voci = costruisciVoci(stanze, nomeMostrato);
      reparti.push({
        id: `${sid}-${slug(nomeRep)}`, nome: nomeRep, piano, voci,
        totale: voci.reduce((n, v) => n + v.totale, 0),
        nStanze: stanze.size, tecnico: eTecnico(nomeRep), pagina: null,
      });
    }
    // id univoci anche con reparti omonimi nella stessa sezione
    const visti = new Map();
    for (const rep of reparti) {
      conta(visti, rep.id);
      if (visti.get(rep.id) > 1) rep.id = `${rep.id}-${visti.get(rep.id)}`;
    }
    sezioni.push({
      id: sid, tipo, titolo, etichettaBreve: breve, sottotitolo: sotto, reparti,
      totale: reparti.reduce((n, r) => n + r.totale, 0),
      nStanze: reparti.reduce((n, r) => n + r.nStanze, 0), pagina: null,
    });
  }

  /* --- legenda (sempre alfabetica) e quadro d'insieme (per priorita') --- */
  const quantitaCodice = new Map();
  for (const r of righe) conta(quantitaCodice, r.codice);
  const legenda = [...descrizione.keys()].map(cod => ({
    codice: cod,
    nome: nomeMostrato.get(cod),
    descrizione: descrizione.get(cod),
    quantita: quantitaCodice.get(cod) || 0,
    daDizionario: diz.has(cod),
    priorita: Number(pri.get(cod) || 0) || 0,
  })).sort((a, b) => cmpNaturale(a.nome, b.nome));

  /* Il quadro d'insieme segue la priorita' decisa dall'ufficio (1 in cima, poi
     2, 3...); i componenti senza priorita' vengono dopo, in ordine alfabetico.
     La legenda resta alfabetica, perche' li' si cerca un componente per nome. */
  const ordineQuadro = [...legenda].sort((a, b) =>
    ((a.priorita || PRIORITA_IN_CODA) - (b.priorita || PRIORITA_IN_CODA)) || cmpNaturale(a.nome, b.nome));

  /* Un solo giro su tutto il documento invece di uno per riga della matrice:
     con 3200 componenti e 200 codici il conto annidato di modello.py costerebbe
     centinaia di migliaia di confronti. */
  const perSezione = sezioni.map(s => {
    const m = new Map();
    for (const rep of s.reparti) for (const voce of rep.voci) for (const c of voce.componenti) conta(m, c.codice, c.quantita);
    return m;
  });
  const matriceRighe = ordineQuadro.map(v => {
    const valori = perSezione.map(m => m.get(v.codice) || 0);
    return { codice: v.codice, nome: v.nome, valori, totale: valori.reduce((a, b) => a + b, 0), priorita: v.priorita };
  });

  const totale = sezioni.reduce((n, s) => n + s.totale, 0);

  /* --- anomalie sui luoghi e sui dati --- */
  anomalie.push(...anomalieLuoghi(righe, eTecnico));
  if (ex.righeNonInterpretate.length) {
    const esempi = ex.righeNonInterpretate.slice(0, 5).map(([i, t]) => `riga ${i}: "${t.slice(0, 90)}"`).join('; ');
    anom('errore', 'righe non interpretabili',
      `${ex.righeNonInterpretate.length} righe non hanno la struttura attesa e NON compaiono ` +
      `nel documento (la quadratura fallisce). Esempi: ${esempi}`,
      ex.righeNonInterpretate.map(([i]) => i));
  }
  const note = righe.filter(r => r.nota);
  if (note.length) {
    const elenco = note.slice(0, 20).map(r => `riga ${r.indice} (${r.reparto} / ${r.stanza}): "${r.nota.slice(0, 100)}"`).join('; ');
    anom('info', 'note operatore presenti',
      `${note.length} righe hanno una nota operatore (esclusa dal documento cliente): ${elenco}`,
      note.map(r => r.indice));
  }
  const nonCoperti = legenda.filter(v => !v.daDizionario);
  if (nonCoperti.length) {
    const elenco = nonCoperti.map(v => `${v.codice} "${v.descrizione}" (x${v.quantita})`).join('; ');
    anom('info', 'codici assenti dal dizionario',
      `${nonCoperti.length} codici non sono nel dizionario e compaiono con la descrizione ` +
      `originale del gestionale: ${elenco}. Aggiungerli dalla scheda "Nomi dei componenti" per un nome piu\u0300 semplice.`,
      []);
  }

  const ordineGravita = { errore: 0, avviso: 1, info: 2 };
  anomalie.sort((a, b) => (ordineGravita[a.gravita] - ordineGravita[b.gravita]) || cmpTesto(a.tipo, b.tipo));

  /* --- controlli --- */
  const codiciCoperti = legenda.filter(v => v.daDizionario).length;
  const pezziCoperti = legenda.filter(v => v.daDizionario).reduce((n, v) => n + v.quantita, 0);
  const arrotonda1 = x => Math.round(x * 10) / 10;
  const nAnomalie = {};
  for (const a of anomalie) nAnomalie[a.gravita] = (nAnomalie[a.gravita] || 0) + 1;

  const controlli = {
    righeDati: ex.righeDati,
    righeInterpretate: righe.length,
    righeNonInterpretate: ex.righeNonInterpretate.length,
    totaleDocumento: totale,
    quadraturaOk: totale === ex.righeDati,
    codiciDistinti: legenda.length,
    codiciCoperti,
    coperturaCodici: legenda.length ? arrotonda1(100 * codiciCoperti / legenda.length) : 0,
    pezziCoperti,
    coperturaPezzi: totale ? arrotonda1(100 * pezziCoperti / totale) : 0,
    nPiani: sezioni.filter(s => s.tipo === 'piano').length,
    nReparti: sezioni.reduce((n, s) => n + s.reparti.length, 0),
    nStanze: sezioni.reduce((n, s) => n + s.nStanze, 0),
    nAnomalie,
  };

  return {
    cliente: ex.cliente,
    data: dataItaliana(giorno),
    dataIso: isoLocale(giorno),
    sezioni,
    legenda,
    matriceColonne: sezioni,
    matriceRighe,
    totale,
    anomalie,
    controlli,
    origine: ex.percorso || '',
  };
}

/** Una voce per stanza, in ordine alfabetico naturale; componenti per nome. */
function costruisciVoci(stanze, nomeMostrato) {
  const voci = [];
  for (const stanza of [...stanze.keys()].sort(cmpNaturale)) {
    const componenti = [...stanze.get(stanza).entries()]
      .map(([cod, q]) => ({ codice: cod, nome: nomeMostrato.get(cod), quantita: q }))
      .sort((a, b) => cmpNaturale(a.nome, b.nome));
    voci.push({ stanze: [stanza], componenti, totale: componenti.reduce((n, c) => n + c.quantita, 0) });
  }
  return voci;
}

/* Le otto famiglie di anomalie sui luoghi (modello._anomalie_luoghi). */
function anomalieLuoghi(righe, eTecnico) {
  const out = [];
  const add = (gravita, tipo, messaggio, r = []) => out.push({ gravita, tipo, messaggio, righe: r });
  const K = (p, rep) => p + '\u0000' + rep;

  const righePerReparto = new Map();      // (piano, reparto) -> [indici]
  for (const r of righe) {
    const k = K(r.piano, r.reparto);
    if (!righePerReparto.has(k)) righePerReparto.set(k, []);
    righePerReparto.get(k).push(r.indice);
  }
  const repOrdinati = [...righePerReparto.keys()].sort(cmpTesto);

  // 1. segnaposto del gestionale (piano = reparto = stanza, non numerico)
  const segnaposto = righe.filter(r => pianoNumerico(r.piano) === null && r.piano === r.reparto && r.reparto === r.stanza);
  if (segnaposto.length) {
    const etichette = [...new Set(segnaposto.map(r => r.piano))].sort(cmpTesto);
    add('avviso', 'collocazione non assegnata',
      `${segnaposto.length} componenti hanno piano, reparto e stanza uguali a "${etichette.join(', ')}": ` +
      'probabilmente non sono ancora stati collocati nel gestionale.',
      segnaposto.map(r => r.indice));
  }

  // 2. reparti con nomi quasi uguali (refusi)
  const coppie = repOrdinati.map(k => k.split('\u0000'));
  const nomi = [...new Set(coppie.map(([, rep]) => rep))].sort(cmpNaturale);
  const segnalati = new Set();
  for (let i = 0; i < nomi.length; i++) {
    for (let j = i + 1; j < nomi.length; j++) {
      const a = nomi[i], b = nomi[j];
      if (!nomiQuasiUguali(a, b, 5) || segnalati.has(a + '\u0000' + b)) continue;
      segnalati.add(a + '\u0000' + b);
      const piani = nome => [...new Set(coppie.filter(([, rep]) => rep === nome).map(([p]) => p))]
        .sort((x, y) => (pianoNumerico(x) === null ? 1 : 0) - (pianoNumerico(y) === null ? 1 : 0) ||
                        ((pianoNumerico(x) || 0) - (pianoNumerico(y) || 0)) || cmpTesto(x, y));
      const idx = [];
      for (const [k, v] of righePerReparto) { const rep = k.split('\u0000')[1]; if (rep === a || rep === b) idx.push(...v); }
      add('avviso', 'reparti con nomi quasi uguali',
        `"${a}" (piano ${piani(a).join(', ')}) e "${b}" (piano ${piani(b).join(', ')}) sembrano lo stesso reparto ` +
        'scritto in due modi. Nel documento restano distinti, come nel file.',
        idx.sort((x, y) => x - y));
    }
  }

  // 3. nome del reparto che cita un piano diverso da quello in cui si trova
  const rxPiano = /(?:PIANO|P\.)\s*(-?\d+)|(-?\d+)\s*[\u00b0\u00ba]?\s*PIANO/i;
  for (const k of repOrdinati) {
    const [p, rep] = k.split('\u0000');
    const m = rxPiano.exec(rep);
    if (!m) continue;
    const citato = Number(m[1] !== undefined ? m[1] : m[2]);
    const n = pianoNumerico(p);
    if (n !== null && citato !== n) {
      add('avviso', 'reparto che cita un piano diverso',
        `Il reparto "${rep}" e\u0300 registrato al piano ${p} ma il suo nome cita il piano ${citato}.`,
        righePerReparto.get(k));
    }
  }

  // 4. stanze con nomi quasi uguali dentro lo stesso reparto
  const stanzePerReparto = new Map();     // (piano, reparto) -> stanza -> [indici]
  for (const r of righe) {
    const k = K(r.piano, r.reparto);
    if (!stanzePerReparto.has(k)) stanzePerReparto.set(k, new Map());
    const s = stanzePerReparto.get(k);
    if (!s.has(r.stanza)) s.set(r.stanza, []);
    s.get(r.stanza).push(r.indice);
  }
  const chiaviStanze = [...stanzePerReparto.keys()].sort(cmpTesto);
  for (const k of chiaviStanze) {
    const [p, rep] = k.split('\u0000');
    const stanze = stanzePerReparto.get(k);
    const nomiS = [...stanze.keys()].sort(cmpNaturale);
    for (let i = 0; i < nomiS.length; i++) {
      for (let j = i + 1; j < nomiS.length; j++) {
        const a = nomiS[i], b = nomiS[j];
        if (nomiQuasiUguali(a, b, 6)) {
          add('avviso', 'stanze con nomi quasi uguali',
            `Nel reparto "${rep}" (piano ${p}) le stanze "${a}" e "${b}" sembrano la stessa stanza scritta in due modi.`,
            [...stanze.get(a), ...stanze.get(b)]);
        }
      }
    }
  }

  // 5. stanze che sembrano numeri di posizione (5+ cifre)
  for (const k of chiaviStanze) {
    const [p, rep] = k.split('\u0000');
    for (const [s, idx] of stanzePerReparto.get(k)) {
      if (/^\d{5,}$/.test(s)) {
        add('avviso', 'stanza con nome numerico lungo',
          `Nel reparto "${rep}" (piano ${p}) la stanza si chiama "${s}": sembra un numero di posizione ` +
          'inserito al posto del nome.', idx);
      }
    }
  }

  // 6. reparto e stanza con lo stesso nome (non tecnici)
  for (const k of chiaviStanze) {
    const [p, rep] = k.split('\u0000');
    for (const [s, idx] of stanzePerReparto.get(k)) {
      if (s === rep && !eTecnico(rep) && !(pianoNumerico(p) === null && p === rep)) {
        add('info', 'reparto e stanza omonimi',
          `Al piano ${p} il reparto "${rep}" contiene una stanza chiamata allo stesso modo.`, idx);
      }
    }
  }

  // 7. stanze con suffisso numerico "(2)": convenzione del gestionale
  const conSuffisso = new Map();
  for (const r of righe) {
    if (/\(\d+\)\s*$/.test(r.stanza)) {
      const k = r.piano + '\u0000' + r.reparto + '\u0000' + r.stanza;
      if (!conSuffisso.has(k)) conSuffisso.set(k, []);
      conSuffisso.get(k).push(r.indice);
    }
  }
  if (conSuffisso.size) {
    const chiavi = [...conSuffisso.keys()].sort(cmpTesto);
    const elenco = chiavi.slice(0, 15).map(k => { const [p, rep, s] = k.split('\u0000'); return `"${s}" (${rep}, piano ${p})`; }).join('; ');
    const idx = [];
    for (const v of conSuffisso.values()) idx.push(...v);
    add('info', 'stanze con suffisso numerico',
      `${conSuffisso.size} stanze hanno un suffisso tipo "(2)": ${elenco}. Riportate cosi\u0300 come sono.`,
      idx.sort((a, b) => a - b));
  }

  // 8. reparti con nome solo numerico
  for (const k of repOrdinati) {
    const [p, rep] = k.split('\u0000');
    if (/^\d+$/.test(rep)) {
      add('info', 'reparto con nome numerico', `Al piano ${p} c\u0027e\u0300 un reparto chiamato solo "${rep}".`,
        righePerReparto.get(k));
    }
  }
  return out;
}

/* ============================================================= ESPORTAZIONE */

/** La struttura intera, per il file "Dati - CLIENTE - DATA.json". */
export function registroInDict(reg) {
  return {
    ...reg,
    matriceColonne: reg.matriceColonne.map(s => s.etichettaBreve),
  };
}

/** Il file "Anomalie - CLIENTE - DATA.txt": controlli e anomalie, uso interno VRS. */
export function testoAnomalie(reg) {
  const c = reg.controlli;
  const r = [];
  const pad = (etichetta, valore) => `  ${etichetta.padEnd(32)}${valore}`;
  r.push('ANOMALIE E CONTROLLI - uso interno VRS');
  r.push(`Cliente: ${reg.cliente}`);
  r.push(`File di origine: ${reg.origine}`);
  r.push(`Generato il: ${reg.data} (${reg.dataIso})`);
  r.push('');
  r.push('CONTROLLI');
  r.push(pad('Righe dati nel file:', c.righeDati));
  r.push(pad('Righe interpretate:', c.righeInterpretate));
  r.push(pad('Righe non interpretate:', c.righeNonInterpretate));
  r.push(pad('Componenti nel documento:', c.totaleDocumento));
  r.push(pad('Quadratura:', c.quadraturaOk ? 'OK' : 'NON QUADRA'));
  r.push(pad('Codici distinti:', c.codiciDistinti));
  r.push(pad('Copertura dizionario (codici):', `${c.codiciCoperti}/${c.codiciDistinti} = ${c.coperturaCodici}%`));
  r.push(pad('Copertura dizionario (pezzi):', `${c.pezziCoperti}/${c.totaleDocumento} = ${c.coperturaPezzi}%`));
  r.push(`  Piani: ${c.nPiani}   Reparti: ${c.nReparti}   Stanze: ${c.nStanze}`);
  r.push('');
  r.push(`ANOMALIE (${reg.anomalie.length})`);
  if (!reg.anomalie.length) r.push('  Nessuna.');
  for (const a of reg.anomalie) {
    r.push('');
    r.push(`  [${a.gravita.toUpperCase()}] ${a.tipo}`);
    r.push(`  ${a.messaggio}`);
    if (a.righe && a.righe.length) {
      let righe = a.righe.slice(0, 40).join(', ');
      if (a.righe.length > 40) righe += ` ... (${a.righe.length} righe in tutto)`;
      r.push(`  Righe del file: ${righe}`);
    }
  }
  return r.join('\n') + '\n';
}
