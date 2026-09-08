/* affinita.js - quanto si somigliano due nomi scritti da mani diverse.
   #ANCHOR: affinita

In Access lo stesso sito compare a volte due volte con due grafie ("REA KLINIC"
e "REA CLINIK", "CASA UMBERTO I" e "CASA DI RIPOSO UMBERTO PRIMO"): un umano
capisce che e' lo stesso posto, `includes()` no. Access non si tocca, quindi la
tolleranza sta qui, ed e' la stessa in tre posti: la barra di ricerca del
tracker, il collegamento automatico Excel -> sito nel generatore, e la lista dei
possibili doppioni.

Il punteggio e' 0..1. Si costruisce cosi':
  1. NORMALIZZAZIONE: minuscole, via gli accenti, "k"->"c", "y"->"i", "ph"->"f",
     "w"->"v", doppie ridotte, ordinali romani e numeri in lettere unificati
     ("i"/"primo"/"1" -> "1"), sigle societarie e articoli tolti;
  2. per ogni PAROLA della domanda, la parola piu' vicina nel testo (uguale,
     prefisso, o bigrammi di Dice); la media pesata sulla lunghezza e' il
     punteggio delle parole;
  3. un secondo punteggio sui bigrammi dell'intera stringa, che perdona gli
     spazi messi male ("gasmedicali");
  il risultato e' il massimo dei due, cosi' ne basta uno per riconoscere. */

const ACCENTI = /[̀-ͯ]/g;
const RUMORE = new Set(['di', 'del', 'della', 'delle', 'dei', 'degli', 'da', 'de', 'la',
  'le', 'il', 'lo', 'gli', 'e', 'ed', 'a', 'al', 'in', 'su', 'per', 'con',
  'srl', 'spa', 'sas', 'snc', 'ss', 'sc', 'scarl', 'soc', 'coop', 'onlus', 'srls',
  'ditta', 'societa']);
const NUMERI = { primo: '1', secondo: '2', terzo: '3', quarto: '4', quinto: '5',
  i: '1', ii: '2', iii: '3', iv: '4', v: '5', vi: '6', vii: '7', viii: '8', ix: '9', x: '10' };

/** Le parole normalizzate di un testo. */
export function parole(testo) {
  return String(testo ?? '')
    .toLowerCase()
    .normalize('NFD').replace(ACCENTI, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .filter(Boolean)
    .map(p => NUMERI[p] ?? p)
    .filter(p => !RUMORE.has(p))
    .map(p => p
      .replace(/ph/g, 'f').replace(/ck/g, 'c').replace(/k/g, 'c').replace(/y/g, 'i')
      .replace(/w/g, 'v').replace(/h/g, '')
      .replace(/([a-z])\1+/g, '$1'));
}

export const chiaveNorm = testo => parole(testo).join(' ');

function bigrammi(s) {
  const m = new Map();
  for (let i = 0; i < s.length - 1; i++) {
    const b = s.slice(i, i + 2);
    m.set(b, (m.get(b) || 0) + 1);
  }
  return m;
}

/** Coefficiente di Dice sui bigrammi: 1 = uguali, 0 = niente in comune. */
export function dice(a, b) {
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return 0;
  const A = bigrammi(a), B = bigrammi(b);
  let comuni = 0;
  for (const [k, n] of A) comuni += Math.min(n, B.get(k) || 0);
  return (2 * comuni) / (a.length - 1 + b.length - 1);
}

/** Distanza di Damerau-Levenshtein (allineamento ottimo): quante lettere
 *  cambiare, togliere, aggiungere o scambiare fra vicine. "umbreto" ->
 *  "umberto" = 1. Sulle parole singole e' molto piu' selettiva dei bigrammi:
 *  "umberto" e "bertoli" condividono meta' dei bigrammi ma distano 4. */
export function distanza(a, b) {
  const n = a.length, m = b.length;
  if (!n) return m; if (!m) return n;
  let prev2 = null, prev = Array.from({ length: m + 1 }, (_, j) => j), cur;
  for (let i = 1; i <= n; i++) {
    cur = [i];
    for (let j = 1; j <= m; j++) {
      const costo = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + costo);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, prev2[j - 2] + 1);
      cur[j] = v;
    }
    prev2 = prev; prev = cur;
  }
  return prev[m];
}

/** Somiglianza 0..1 fra due parole: 1 - distanza / lunghezza maggiore. */
export const simileParola = (a, b) => a === b ? 1 : 1 - distanza(a, b) / Math.max(a.length, b.length);

/** Quanto la parola `p` e' vicina alla piu' simile fra `lista`. */
function parolaVicina(p, lista) {
  let meglio = 0;
  for (const q of lista) {
    let v;
    if (q === p) v = 1;
    else if (p.length >= 3 && q.startsWith(p)) v = 0.92;           // "umb" -> "umberto"
    else if (q.length >= 3 && p.startsWith(q)) v = 0.85;
    else v = simileParola(p, q);
    if (v > meglio) meglio = v;
    if (meglio === 1) break;
  }
  return meglio;
}

/** Quanto pesa ogni parola in un insieme di nomi: le rare valgono 1, quelle
 *  che stanno ovunque ("casa", "riposo", "via", "ospedale") scendono verso
 *  0,3. Cosi' "casa di riposo umberto 1" e "casa di riposo cesare bertoli" non
 *  sembrano parenti solo perche' sono entrambe case di riposo. */
export function pesiParole(testi) {
  const df = new Map();
  for (const t of testi) for (const p of new Set(parole(t))) df.set(p, (df.get(p) || 0) + 1);
  const N = Math.max(1, testi.length), pesi = new Map();
  for (const [p, n] of df) pesi.set(p, Math.max(0.3, Math.min(1, Math.log(N / n) / Math.log(N / 2))));
  return pesi;
}

/** Affinita' 0..1 fra una domanda e un testo (nome di sito, cliente, ecc.).
 *  `pesi` (da pesiParole) rende le parole comuni meno decisive. */
export function affinita(domanda, testo, pesi = null) {
  const D = parole(domanda), T = parole(testo);
  if (!D.length || !T.length) return 0;
  let somma = 0, peso = 0;
  for (const p of D) {
    const w = Math.min(p.length, 8) * (pesi ? (pesi.get(p) ?? 1) : 1);
    somma += parolaVicina(p, T) * w;
    peso += w;
  }
  const perParole = somma / peso;
  // La domanda e' spesso una parte del testo (il nome del sito senza il
  // cliente): il punteggio sui bigrammi si misura sulla parte piu' vicina in
  // lunghezza, non sull'intero testo, altrimenti "umberto 1" contro "casa
  // riposo umberto 1 via roma 3 treviso" varrebbe poco.
  const d = D.join(''), t = T.join('');
  const perIntero = t.length > d.length * 1.6 ? dice(d, t) * 1.15 : dice(d, t);
  return Math.min(1, Math.max(perParole, perIntero));
}

/** Un termine di ricerca "passa" su un testo: substring (come prima) oppure,
 *  da 4 lettere in su, una parola abbastanza vicina. Tollerante ma non
 *  cieco: "rea" resta un prefisso, "clinik" trova "klinic". */
export function terminePassa(termine, testo) {
  if (testo.includes(termine)) return true;
  if (termine.length < 4) return false;
  const p = parole(termine);
  if (!p.length) return false;
  const T = parole(testo);
  return p.every(x => parolaVicina(x, T) >= 0.75);
}

/** I candidati ordinati per affinita', con il punteggio. `nome(x)` da' il testo
 *  da confrontare per ogni voce. Sotto `minimo` non si torna niente. */
export function classifica(domanda, voci, nome, minimo = 0.45, pesi = null) {
  const out = [];
  for (const v of voci) {
    const a = affinita(domanda, nome(v), pesi);
    if (a >= minimo) out.push({ voce: v, affinita: a });
  }
  return out.sort((x, y) => y.affinita - x.affinita);
}

/** Coppie di voci che si somigliano troppo per essere due cose diverse.
 *  Confronto tutti-con-tutti dentro lo stesso gruppo (es. lo stesso cliente):
 *  con qualche centinaio di voci costa niente. */
export function doppioni(voci, nome, soglia = 0.82) {
  const out = [];
  const N = voci.map(v => chiaveNorm(nome(v)));
  const pesi = pesiParole(N);
  for (let i = 0; i < voci.length; i++) {
    if (!N[i]) continue;
    for (let j = i + 1; j < voci.length; j++) {
      if (!N[j]) continue;
      const a = N[i] === N[j] ? 1 : Math.max(affinita(N[i], N[j], pesi), affinita(N[j], N[i], pesi));
      if (a >= soglia) out.push({ a: voci[i], b: voci[j], affinita: a });
    }
  }
  return out.sort((x, y) => y.affinita - x.affinita);
}
