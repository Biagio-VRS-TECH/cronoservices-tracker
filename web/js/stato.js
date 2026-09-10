/* stato.js - modello in memoria, stato temporale delle celle, filtri, e l'unico
   punto da cui passa una scrittura di spunta.  #ANCHOR: stato

MODELLO DELL'ANNO (#ANCHOR: anno-modello)
Access non ha la dimensione anno: tServices.Gen..Dic descrive la cadenza del
CONTRATTO, non un calendario. Quindi la stessa riga di mesi vale per ogni anno, e
va incrociata con la finestra contrattuale (DataInizio/DataScadenza), col rinnovo
automatico e con la data da cui l'azienda registra le spunte qui.

UNA MAPPATURA PER SITO PER ANNO (#ANCHOR: mappatura-anno)
La mappatura NON si rifa' a ogni visita, ma si fa per ogni SITO: un service
aperto = un impianto = una mappatura all'anno. Un cliente con nove siti aperti
(ULSS 1 DOLOMITI, ad esempio) ha nove mappature, una per sito, non una sola:
sono nove impianti diversi da mappare. Fatta una volta per un sito, con tutti e
quattro i passi, quel sito e' a posto per tutto l'anno anche se il contratto
prevede quattro visite.

La scadenza della mappatura di un sito e' il PRIMO mese di manutenzione dell'anno
dentro il contratto (`meseScadenza`), qualunque sia l'inizio del tracciamento.
Di conseguenza in tutto l'anno UNA sola cella del sito e' `previsto`: quella del
mese di scadenza. Gli altri mesi di manutenzione dello stesso sito sono `visita`:
si vedono, si spuntano (la mappatura si puo' fare a qualsiasi visita) e chiuderne
una mette a posto l'anno del sito, ma non sono un secondo impegno e non contano
due volte. Se la scadenza cade prima dell'inizio del tracciamento la mappatura
dell'anno e' pre-tracciamento: si vede, si spunta, ma non entra nei totali - e
NON slitta al primo mese tracciato (sarebbe contare una visita).

Il cliente non e' l'unita' di conto: e' il raggruppamento dei suoi siti. La riga
cliente della griglia somma le mappature dei suoi impianti.

Ogni cella (service, anno, mese) ricade in una di queste classi:

  non-previsto     mesi[m] = 0            -> nessuna manutenzione prevista
  prima-contratto  mese < DataInizio      -> il service non c'era ancora
  non-tracciato    mese < inizio traccia. -> lavoro fatto prima dell'adozione:
                                             spuntabile per recupero storico, mai
                                             "in ritardo", fuori dai totali
  previsto         primo mese di          -> LA mappatura dell'anno di questo
                   manutenzione del sito     sito: conta nei totali e puo'
                   dentro il contratto       andare in ritardo. Una per sito
  visita           ogni altro mese di     -> visita: spuntabile (se la mappatura
                   manutenzione del sito     si fa qui), fuori dai totali
  stima            oltre la scadenza, ma  -> proiezione: si prevede di farla,
                   rinnovo automatico        salvo riprogrammazione. Fuori dai totali
  da-rinnovare     oltre la scadenza, e   -> il contratto va rinnovato prima di
                   rinnovo NON automatico    poter pianificare. Fuori dai totali

"In ritardo" esiste solo per `previsto`: mese passato, meno di quattro spunte, e
la mappatura del sito non chiusa in nessun mese dell'anno.

I PASSI (#ANCHOR: passi)
Una mappatura si chiude in quattro passi, in ordine: stampata -> controllata dal
tecnico -> mappatura completa rapportino -> controllo ricambi e scadenze.
`CAMPI` e' l'ordine ufficiale (segmenti della cella, tasti 1..4, colonne CSV):
aggiungere o togliere un passo si fa QUI e in `db.CAMPI`, tutto il resto conta
`PASSI` e non tre.
*/
import { terminePassa } from './affinita.js';
import { accoda, rete, chiama } from './api.js';
import { avviso } from './ui.js';

export const CAMPI = ['stampata', 'controllata', 'corretta', 'ricambi'];
/* La sigla e' la chiave nel payload della cella. 'k' per "corretta" perche' 'c'
   era gia' occupato da "controllata"; 'r' per "ricambi". */
export const SIGLA = { stampata: 's', controllata: 'c', corretta: 'k', ricambi: 'r' };
export const PASSI = CAMPI.length;
/* RUOLI E APPROVAZIONI (#ANCHOR: ruoli). Due passi non li chiude l'operatore
   (il ruolo che nel codice vale 'tecnico'): li PROPONE, e chi ha il potere di
   approvare (amministratore o approvatore) li chiude. Nel modello un passo vale 0 (da
   fare), 1 (fatto/approvato) o PROPOSTA = 2 (spuntato dall'operatore, in attesa
   dell'admin). Il 2 non conta come fatto da nessuna parte: `fatto()` e' l'unico
   modo giusto di chiedere "questo passo c'e'?". Le regole stanno in
   `effettivo()` qui sotto e nel gemello `_valore_per_ruolo` di app/api.py. */
export const DA_APPROVARE = ['corretta', 'ricambi'];
export const PROPOSTA = 2;
export const fatto = (c, campo) => c[SIGLA[campo]] === 1;
export const proposto = (c, campo) => c[SIGLA[campo]] === PROPOSTA;
export const ETICHETTA = {
  stampata: 'Mappatura stampata',
  controllata: 'Controllata dal tecnico',
  corretta: 'Mappatura completa rapportino',
  ricambi: 'Controllo ricambi e scadenze',
};
/* Etichette corte: caselle in linea della vista Mese, cassetto, grafici. */
export const BREVE = {
  stampata: 'Stampata',
  controllata: 'Controllata',
  corretta: 'Rapportino',
  ricambi: 'Ricambi',
};
export const CLASSE_ET = {
  'previsto': "La mappatura dell'anno di questo sito: scade in questo mese",
  'visita': "Visita di manutenzione: la mappatura del sito scade in un altro mese",
  'stima': 'Stima: il contratto si rinnova da solo, salvo riprogrammazione',
  'da-rinnovare': 'Contratto scaduto: rinnovo da richiedere',
  'non-tracciato': 'Prima dell\'inizio del tracciamento: recupero storico',
  'prima-contratto': 'Il service non era ancora attivo',
  'non-previsto': 'Nessuna manutenzione in questo mese',
};

const K_FILTRI = 'cs.filtri.v1';

export const st = {
  anno: new Date().getFullYear(),
  anni: [], oggi: '', meseOggi: 0, annoOggi: 0, ymOggi: '',
  inizioTracciamento: '2000-01',
  indirizzoLan: null,
  altriServer: [],
  mesi: [], mesiNome: [],
  clienti: new Map(), perServ: new Map(), gruppi: [],
  celle: new Map(),        // "idServ-mese" -> {s,c,k,r,rev,by,at,nota}
  cellePrec: new Map(),    // stesse chiavi, ANNO PRIMA: una mappatura rimasta aperta passa i passi all'anno dopo
  fuochi: new Map(),       // nome collega -> {cella, dove, ts}: la cella che ha aperta adesso (#ANCHOR: fuoco)
  ruoli: {},               // nome -> ruolo: SOLO per l'elenco nelle impostazioni
  /* Il MIO ruolo, come lo dice il server (#ANCHOR: ruoli). Non si ricava dal
     nome a schermo: il nome e' una firma, l'identita' e' la casella del login. */
  ruolo: 'tecnico',
  documenti: new Map(),    // idServ -> [PDF delle schede tecnici], dal piu' recente
  sospese: new Set(),      // "idServ-mese-campo" in attesa di conferma
  chiusiCli: new Set(),    // clienti collassati
  online: [], ultimoSync: null,
  vista: 'anno', mese: new Date().getMonth() + 1,
  selezione: new Set(),
  ultimaAzione: null,      // per l'Annulla
  /* `stato`: '' | 'incomplete' | 'ritardo' | 'complete' (#ANCHOR: filtro-stato).
     Il filtro per tipo di gas e' stato tolto alla 15a sessione: nessuno lo
     usava e il tipo si cerca dalla barra di ricerca. */
  filtri: { q: '', prov: '', mostraChiusi: false, stato: '' },
};

/* --------------------------------------------------------- emettitore ---- */
const ascolto = {};
export const on = (ev, fn) => ((ascolto[ev] ||= new Set()).add(fn), () => ascolto[ev].delete(fn));
export const emetti = (ev, d) => ascolto[ev]?.forEach(f => f(d));

/* ------------------------------------------------------------- filtri --- */
export const STATI = ['', 'incomplete', 'ritardo', 'complete'];

/** Si leggono solo le chiavi che esistono ancora: la v1 salvava due booleani
 *  (`soloIncomplete`, `soloRitardo`) e un `tipo`, e chi ha gia' l'applicazione
 *  aperta se li ritrova in memoria. I due booleani diventano la posizione
 *  corrispondente del filtro nuovo, il tipo si perde e va bene cosi'. */
export function caricaFiltri() {
  let g = {};
  try { g = JSON.parse(localStorage.getItem(K_FILTRI) || '{}') || {}; } catch { }
  const f = st.filtri;
  f.q = '';
  f.prov = typeof g.prov === 'string' ? g.prov : '';
  f.mostraChiusi = !!g.mostraChiusi;
  f.stato = STATI.includes(g.stato) ? g.stato
    : g.soloRitardo ? 'ritardo' : g.soloIncomplete ? 'incomplete' : '';
}
export function salvaFiltri() {
  try { localStorage.setItem(K_FILTRI, JSON.stringify(st.filtri)); } catch { }
}

/* ------------------------------------------------------------- caricamento */
export function applica(d) {
  st.anno = d.anno; st.anni = d.anni; st.oggi = d.oggi;
  st.mesi = d.mesi; st.mesiNome = d.mesi_nome;
  const [a, m] = d.oggi.split('-').map(Number);
  st.annoOggi = a; st.meseOggi = m; st.ymOggi = ym(a, m);
  st.inizioTracciamento = d.inizio_tracciamento || '2000-01';
  st.indirizzoLan = d.indirizzo_lan || null;
  st.altriServer = d.altri_server || [];
  st.ultimoSync = d.ultimo_sync; st.sync = d.sync; st.online = d.online || [];
  st.operatori = d.operatori || [];
  st.ruoli = d.ruoli || {};
  st.ruolo = d.ruolo || 'tecnico';

  st.clienti = new Map(d.clienti.map(c => [c.id, c]));
  st.perServ = new Map(d.services.map(s => [s.id, s]));
  st.celle = new Map(Object.entries(d.celle));
  st.cellePrec = new Map(Object.entries(d.celle_prec || {}));
  st.documenti = mappaDocumenti(d.documenti);
  riapplicaCoda();

  /* Un sync o un cambio d'anno rifanno i mesi e le date: le memoizzazioni
     temporali vanno buttate, altrimenti restano appese ai dati di prima. */
  memoScad.clear(); memoMap.clear(); memoScadEff.clear();

  const per = new Map();
  for (const s of d.services) {
    if (s.arch) continue;
    if (!per.has(s.cli)) per.set(s.cli, []);
    per.get(s.cli).push(s);
  }
  /* I gruppi sono clienti con dentro i loro siti: la riga cliente della griglia
     somma le mappature dei suoi impianti. `perCli` non c'e' piu': serviva a
     `mappaturaCliente`, che la 7a sessione ha sostituito con `mappaturaSito`. */
  st.gruppi = [...per.entries()]
    .map(([cid, srvs]) => ({
      cli: st.clienti.get(cid) || { id: cid, rs: '(cliente ' + cid + ')' },
      srvs: srvs.sort((x, y) => (y.stato === 'APERTO') - (x.stato === 'APERTO') ||
        x.dest.localeCompare(y.dest, 'it')),
    }))
    .sort((x, y) => x.cli.rs.localeCompare(y.cli.rs, 'it'));
  emetti('caricato');
}

/** Le scritture ancora in coda vanno riproiettate sui dati appena arrivati,
 *  altrimenti un cambio anno o un sync le farebbe sparire dallo schermo. */
function riapplicaCoda() {
  for (const op of rete.coda) {
    const c = op.corpo || {};
    if (c.anno !== st.anno) continue;
    if (c.campo && c.id_service) {
      const { v } = effettivo(c.campo, cella(c.id_service, c.mese)[SIGLA[c.campo]], c.valore);
      scriviLocale(c.id_service, c.mese, { [SIGLA[c.campo]]: v });
    }
    for (const x of c.celle || []) {
      const { v } = effettivo(x.campo, cella(x.id_service, x.mese)[SIGLA[x.campo]], x.valore);
      scriviLocale(x.id_service, x.mese, { [SIGLA[x.campo]]: v });
    }
  }
}

/* -------------------------------------------------------------- letture -- */
/** I PDF delle schede tecnici per sito, dal piu' recente (#ANCHOR: documenti
 *  in documenti.js). Il bootstrap li porta gia' dell'anno giusto. */
export function mappaDocumenti(lista) {
  const m = new Map();
  for (const d of lista || []) (m.get(d.id_service) || m.set(d.id_service, []).get(d.id_service)).push(d);
  for (const l of m.values()) l.sort((a, b) => (b.creato_il || '').localeCompare(a.creato_il || ''));
  return m;
}

export const chiave = (id, mese) => id + '-' + mese;
export const ym = (a, m) => a + '-' + String(m).padStart(2, '0');
export const VUOTA = { s: 0, c: 0, k: 0, r: 0, rev: 0, by: null, at: null, nota: '' };
export const cella = (id, mese) => st.celle.get(chiave(id, mese)) || VUOTA;
export const cellaPrec = (id, mese) => st.cellePrec.get(chiave(id, mese)) || VUOTA;

/* IL RINNOVO AUTOMATICO NON E' UNA SCADENZA (#ANCHOR: rinnovo)
   Un service ancora APERTO con `RinnovoAutomatico` non finisce alla sua
   `data_scadenza`: quel giorno comincia il termine successivo, senza che nessuno
   firmi niente (per fermarlo serve la disdetta). La data scritta in Access e'
   quindi la fine del termine CORRENTE quando e' stata scritta, non la fine del
   contratto: va rimandata avanti di un termine alla volta finche' non copre
   oggi. Senza questo, un contratto rinnovato da solo perdeva tutti i mesi
   successivi a quella data - diventavano `stima`, fuori dai totali - e la
   mappatura dell'anno risultava NON DOVUTA pur essendo dovuta: e' il caso
   LASERJET SPA segnalato dal committente alla 9a sessione (contratto annuale
   scaduto il 2026-08-31, unica manutenzione a settembre).
   Resta `stima` il termine NON ancora iniziato (gli anni oltre quello in corso):
   quella si', e' una proiezione. E resta `da-rinnovare` il rinnovo non
   automatico: quello va davvero richiesto prima di pianificare.
   Solo per i service APERTI: su un service CHIUSO il contratto non si rinnova,
   la causale in Access e' solo storia. */
const memoScadEff = new Map();
const ultimoDelMese = (a, m) => new Date(a, m, 0).getDate();
const finePeriodo = (a, m, g) =>
  ym(a, m) + '-' + String(Math.min(g, ultimoDelMese(a, m))).padStart(2, '0');

/** Durata del termine contrattuale in mesi (inizio -> scadenza), 12 se non si
 *  ricava: si rimanda avanti finche' copre oggi, quindi il passo cambia solo di
 *  quanto la scadenza effettiva finisce nel futuro. */
function durataTermine(s) {
  if (!s.inizio) return 12;
  const [a1, m1, g1] = s.inizio.split('-').map(Number);
  const [a2, m2, g2] = s.scad.split('-').map(Number);
  const n = (a2 - a1) * 12 + (m2 - m1) + (g2 >= g1 ? 1 : 0);
  return n >= 1 ? n : 12;
}

/** Fine del termine in corso oggi: per il rinnovo automatico e' la scadenza da
 *  guardare, per tutti gli altri e' `s.scad` cosi' com'e'. */
export function scadEffettiva(s) {
  if (!s.scad || !s.rin || s.stato !== 'APERTO') return s.scad;
  let v = memoScadEff.get(s.id);
  if (v !== undefined) return v;
  const passo = durataTermine(s);
  let [a, m] = s.scad.split('-').map(Number);
  const g = Number(s.scad.slice(8));
  /* Il tetto e' solo una cintura: 200 termini sono oltre un secolo. */
  for (let i = 0; i < 200 && finePeriodo(a, m, g) < st.oggi; i++) {
    m += passo; a += Math.floor((m - 1) / 12); m = ((m - 1) % 12) + 1;
  }
  memoScadEff.set(s.id, v = finePeriodo(a, m, g));
  return v;
}

/** Classe del mese guardando SOLO il calendario del contratto, senza sapere se
 *  e' il primo mese utile dell'anno. #ANCHOR: classe-mese */
function classeBase(s, mese) {
  if (s.mesi[mese - 1] !== '1') return 'non-previsto';
  const primo = ym(st.anno, mese) + '-01';
  const ultimo = ym(st.anno, mese) + '-31';
  const scad = scadEffettiva(s);
  if (scad && scad < primo) return s.rin ? 'stima' : 'da-rinnovare';
  if (s.inizio && s.inizio > ultimo) return 'prima-contratto';
  if (ym(st.anno, mese) < st.inizioTracciamento) return 'non-tracciato';
  return 'previsto';
}

/* La scadenza non cambia mentre si spunta: dipende solo dai mesi del contratto,
   dalle sue date e dall'anno. Stanno tutti nella chiave, cosi' non c'e' niente da
   invalidare a mano; `applica` la svuota quando i dati cambiano davvero. */
const memoScad = new Map();
/* La mappatura di un sito INVECE cambia a ogni spunta, ma solo per quel sito:
   `tocca(id)` butta la sua voce. Senza questa memoria ogni disegno della griglia
   rifaceva dodici volte il giro dei dodici mesi per ognuno dei 274 impianti (e
   di nuovo per il riepilogo in testa a ogni singolo clic): era la latenza. */
const memoMap = new Map();
const tocca = id => memoMap.delete(`${id}:${st.anno}`);

/** Primo mese di manutenzione di un SITO che cade dentro la finestra del
 *  contratto: e' la scadenza della sua mappatura dell'anno. 0 = nessun mese
 *  utile in questo anno, quindi nessuna mappatura dovuta.
 *
 *  NON guarda l'inizio del tracciamento. Prima lo faceva, e la scadenza slittava
 *  al primo mese TRACCIATO: un contratto marzo+settembre si vedeva assegnare la
 *  scadenza a settembre, cioe' una VISITA contata come mappatura. */
export function meseScadenza(s) {
  const k = `${s.id}:${st.anno}`;
  let v = memoScad.get(k);
  if (v === undefined) {
    v = 0;
    for (let m = 1; m <= 12 && !v; m++) {
      const b = classeBase(s, m);
      if (b === 'previsto' || b === 'non-tracciato') v = m;
    }
    memoScad.set(k, v);
  }
  return v;
}

/** LA mappatura dell'anno di un SITO, in un oggetto solo. #ANCHOR: mappatura-anno
 *
 *    scad     mese in cui e' dovuta (0 = non dovuta quest'anno)
 *    mese     dove sta il lavoro: il mese in cui e' stata chiusa se c'e',
 *             altrimenti quello piu' avanti
 *    n        spunte fatte la' (al massimo PASSI: la mappatura del sito e' una)
 *    completa tutti i passi fatti in un mese QUALSIASI dell'anno -> il sito e'
 *             a posto. Qualsiasi vuol dire anche un mese che il calendario del
 *             contratto non prevede: il cassetto le spunte le accetta la', e il
 *             lavoro fatto e' lavoro fatto
 *    prevista impegno dell'anno preso QUI (dovuta e non pre-tracciamento)
 *    preTrac  scadenza anteriore all'inizio del tracciamento: fuori dai conti
 *    motivo   se non e' dovuta, PERCHE': la classe del suo primo mese utile
 *             ('da-rinnovare', 'stima', 'prima-contratto', 'non-previsto')
 *    ritardo  dovuta, scadenza passata, non chiusa in nessun mese
 *
 *  Un cliente con nove siti aperti ha nove di questi oggetti: la mappatura si fa
 *  per impianto. Chiuderla alla visita di novembre mette a posto anche la
 *  scadenza di marzo, ma solo di QUESTO sito. */
export function mappaturaSito(s) {
  const k = `${s.id}:${st.anno}`;
  let v = memoMap.get(k);
  if (v === undefined) memoMap.set(k, v = calcolaMappatura(s));
  return v;
}

function calcolaMappatura(s) {
  const scad = meseScadenza(s);
  const pre = !!scad && ym(st.anno, scad) < st.inizioTracciamento;
  /* Perche' NON e' dovuta: la prima classe utile dei dodici mesi. Serve a dirlo
     ("contratto da rinnovare", "oltre il contratto", "non ancora attivo")
     invece di lasciare un "non dovuta" muto, che e' il modo in cui il difetto
     LASERJET si e' presentato al committente. Se non c'e' nessun mese di
     manutenzione resta 'non-previsto'. Costa un giro solo quando scad = 0. */
  let motivo = '';
  if (!scad) {
    motivo = 'non-previsto';
    for (let m = 1; m <= 12; m++) {
      const b = classeBase(s, m);
      if (b !== 'non-previsto') { motivo = b; break; }
    }
  }
  /* IL LAVORO CONTA IN QUALSIASI MESE IN CUI E' STATO SEGNATO.
     La mappatura di un sito e' UNA per anno: se e' stata chiusa a gennaio, quel
     sito e' a posto anche se la sua scadenza cade a settembre. Prima questo
     giro guardava solo i mesi "utili" del contratto e saltava gli altri, ma il
     cassetto le spunte le accetta in OGNI mese di manutenzione (rigaMese non
     guarda la classe): il lavoro segnato in un mese fuori finestra - tipico dei
     contratti che partono a meta' anno, dove i mesi prima sono
     `prima-contratto` - non contava, e il sito restava "da fare" pur essendo
     chiuso. Era il difetto di "Da fare adesso" segnalato alla 13a sessione.
     I mesi del calendario servono ancora, ma solo come RIPIEGO per dire dove
     starebbe il lavoro quando non ce n'e' ancora nessuno. */
  let ripiego = 0;
  for (let m = 1; m <= 12 && !ripiego; m++) {
    const b = classeBase(s, m);
    if (b !== 'non-previsto' && b !== 'prima-contratto') ripiego = m;
  }
  /* I passi si SOMMANO fra i mesi (e dall'anno prima, se quella mappatura e'
     rimasta aperta): vedi passiSito. `mese` e' dove sta il lavoro piu'
     recente di quest'anno, cioe' dove e' stata chiusa se e' chiusa. */
  const passi = passiSito(s);
  const n = Object.keys(passi).length;
  const completa = n === PASSI;
  let mese = 0;
  for (const p of Object.values(passi)) if (p.anno === st.anno && p.mese > mese) mese = p.mese;
  if (!mese) mese = ripiego;
  const passato = !!scad && ym(st.anno, scad) < st.ymOggi;
  return {
    scad, mese: mese || scad, n, completa, passi, motivo,
    prevista: !!scad && !pre, preTrac: pre,
    ritardo: !!scad && !pre && passato && !completa,
  };
}

/* I PASSI SI ACCUMULANO, NON SI RIFANNO (#ANCHOR: passi-cumulativi).
   E' un tracciamento: quello che e' stato fatto resta fatto. Se a maggio si sono
   messe "stampata" e "controllata" e a settembre c'e' un'altra visita, a
   settembre mancano solo gli altri due passi, non si riparte da zero. Vale
   dentro l'anno (i mesi dopo ereditano dai mesi prima) e a cavallo dell'anno:
   una mappatura rimasta APERTA a dicembre (qualche passo fatto, non tutti)
   porta i suoi passi nell'anno dopo; se era chiusa, l'anno dopo si riparte,
   perche' la mappatura e' una per sito per anno. Si guarda solo l'anno prima
   (`st.cellePrec`), non piu' indietro: una mappatura aperta da due anni non e'
   un caso da coprire. Il passo ereditato si vede nella cella (segmento tenue)
   e nel popover con dove e' stato fatto, ma si toglie solo la'. */
function passiAnno(id, celleDi) {
  const out = {};
  for (let m = 1; m <= 12; m++) {
    const c = celleDi(id, m);
    for (const campo of CAMPI) {
      if (fatto(c, campo) && !out[campo]) out[campo] = { mese: m, by: c.by, at: c.at };
    }
  }
  return out;
}
/** Per ogni passo della mappatura del sito, DOVE e' stato fatto la prima volta:
 *  {anno, mese, by, at}. Quelli dell'anno prima solo se quella era aperta. */
export function passiSito(s) {
  const miei = passiAnno(s.id, cella);
  const out = {};
  for (const campo of CAMPI) if (miei[campo]) out[campo] = { anno: st.anno, ...miei[campo] };
  if (Object.keys(out).length < PASSI && st.cellePrec.size) {
    const prima = passiAnno(s.id, cellaPrec);
    const k = Object.keys(prima).length;
    if (k > 0 && k < PASSI) {
      for (const campo of CAMPI) {
        if (!out[campo] && prima[campo]) out[campo] = { anno: st.anno - 1, ...prima[campo] };
      }
    }
  }
  return out;
}

/** Classe temporale di (service, st.anno, mese). Una sola cella per SITO e'
 *  `previsto`: quella della sua scadenza. Gli altri mesi di manutenzione dello
 *  stesso sito sono visite. */
export function classeMese(s, mese) {
  const b = classeBase(s, mese);
  if (b !== 'previsto') return b;
  return mese === meseScadenza(s) ? 'previsto' : 'visita';
}

/** Il mese su cui va la spunta "stampata" quando si archivia un PDF delle
 *  schede: la PRIMA VISITA IN ARRIVO, mai una passata.  #ANCHOR: mese-stampa
 *
 *  Prima si usava il mese della mappatura (dove sta il lavoro, altrimenti la
 *  scadenza) e con un sito in RITARDO quella spunta finiva su un mese gia'
 *  passato: le schede appena stampate risultavano consegnate a marzo, quando
 *  il tecnico ci va a novembre. Il foglio stampato oggi serve alla prossima
 *  visita, e li' va segnato - anche se la scadenza e' scaduta.
 *
 *  Vale ogni mese di manutenzione spuntabile (visite comprese), non solo la
 *  scadenza. Non cambia niente per chi e' in pari: se la scadenza deve ancora
 *  arrivare, la prima visita in arrivo e' proprio lei. Su un anno gia' chiuso
 *  non c'e' nessun futuro da trovare e si torna al comportamento di prima. */
export function mesePerStampa(s) {
  const ma = mappaturaSito(s);
  const ripiego = ma.mese || ma.scad || 0;
  if (st.anno < st.annoOggi) return ripiego;
  const minimo = st.anno === st.annoOggi ? st.meseOggi : 1;
  for (let m = minimo; m <= 12; m++) {
    const b = classeBase(s, m);
    if (b !== 'non-previsto' && b !== 'prima-contratto') return m;
  }
  // tutte le visite dell'anno sono alle spalle: meglio il mese della mappatura
  // che nessuna spunta.
  return ripiego;
}

export function statoCella(id, mese) {
  const s = st.perServ.get(id);
  const c = cella(id, mese);
  const mie = CAMPI.filter(k => fatto(c, k)).length;      // il 2 (proposta) non conta
  const classe = s ? classeMese(s, mese) : 'non-previsto';
  const passato = ym(st.anno, mese) < st.ymOggi;
  const spuntabile = classe !== 'non-previsto' && classe !== 'prima-contratto';
  /* I passi EREDITATI da questa cella: fatti prima di questo mese, in un mese
     precedente dello stesso anno o l'anno prima (#ANCHOR: passi-cumulativi).
     Solo sulle celle spuntabili: un mese fuori calendario non eredita niente,
     altrimenti ogni puntino della riga diventerebbe una capsula. `n` e' quel
     che conta per la cella (suoi + ereditati), `mie` solo i suoi. */
  const ered = {};
  if (s && spuntabile && mie < PASSI) {
    const tutti = mappaturaSito(s).passi;
    for (const campo of CAMPI) {
      const p = tutti[campo];
      if (!fatto(c, campo) && p && (p.anno < st.anno || p.mese < mese)) ered[campo] = p;
    }
  }
  const n = mie + Object.keys(ered).length;
  return {
    c, n, mie, ered, classe,
    attesa: CAMPI.filter(k => proposto(c, k) && !ered[k]),   // passi proposti, in mano all'admin
    completa: n === PASSI,
    /* In ritardo solo la cella di scadenza, e solo se la mappatura del sito non
       e' chiusa in nessun mese: farla a una visita mette a posto l'anno. */
    ritardo: classe === 'previsto' && passato && n < PASSI &&
      !(s && mappaturaSito(s).completa),
    vuota: n === 0,
    spuntabile,
    reale: classe === 'previsto',
  };
}

/** Dove e' stato fatto un passo ereditato, in parole: "a maggio", "nel 2025". */
export function doveFatto(p) {
  if (!p) return '';
  const mese = (st.mesiNome[p.mese - 1] || '').toLowerCase();
  if (p.anno === st.anno) return (/^[aeiou]/.test(mese) ? 'ad ' : 'a ') + mese;
  return `nel ${p.anno} (${mese})`;
}
/** Riassunto dei passi ereditati di una cella per il suggerimento: "2 passi
 *  gia' fatti a maggio". Vuoto se non ne eredita. */
export function notaEredita(e) {
  const v = Object.values(e.ered || {});
  if (!v.length) return '';
  const posti = [...new Set(v.map(p => doveFatto(p)))];
  return `${v.length} ${v.length === 1 ? 'passo gi\u00e0 fatto' : 'passi gi\u00e0 fatti'} ` +
    (posti.length === 1 ? posti[0] : 'prima');
}

/** Avanzamento da mostrare sulla RIGA di un sito: la sua mappatura dell'anno,
 *  che vale PASSI passi e non quattro per ogni visita. */
export function progresso(s) {
  const ma = mappaturaSito(s);
  const conta = ma.prevista || ma.n > 0;
  return {
    fatti: ma.n, tot: conta ? PASSI : 0, mesi: conta ? 1 : 0,
    mese: ma.mese, scad: ma.scad, completa: ma.completa, ritardo: ma.ritardo,
  };
}

/** La riga del CLIENTE somma i suoi siti: un cliente con nove impianti aperti ha
 *  nove mappature, quindi 9 x PASSI passi. `dovute` e' quello che si conta nei
 *  totali, `complete` quante sono chiuse. */
export function progressoGruppo(g) {
  let aperti = 0, chiusi = 0, fatti = 0, tot = 0;
  let dovute = 0, complete = 0, ritardo = 0, preTrac = 0;
  for (const s of g.srvs) {
    if (s.stato !== 'APERTO') { chiusi++; continue; }
    aperti++;
    const ma = mappaturaSito(s);
    if (ma.preTrac) preTrac++;
    if (ma.prevista) {
      dovute++;
      if (ma.completa) complete++; else if (ma.ritardo) ritardo++;
    }
    if (ma.prevista || ma.n > 0) { tot += PASSI; fatti += ma.n; }
  }
  return { fatti, tot, aperti, chiusi, dovute, complete, ritardo, preTrac };
}

/* -------------------------------------------------------------- filtri --- */
/* IL FILTRO DI STATO E' UNO SOLO, A QUATTRO POSIZIONI (#ANCHOR: filtro-stato):
   tutte / da fare / in ritardo / complete. Prima erano due interruttori
   indipendenti ("solo incomplete" + "solo in ritardo") e il contrario - "solo
   le complete" - non c'era: due bottoni per tre risposte su quattro.

   `ignoraStato` serve ai CONTEGGI: i numeri della testa e quelli scritti dentro
   il filtro sono quelli di tutto l'insieme, non del sottoinsieme scelto.
   Altrimenti chiedendo "Complete" gli altri numeri andrebbero a zero e non si
   tornerebbe piu' indietro cliccandoli. */
function passa(s, cli, q, ignoraStato) {
  const f = st.filtri;
  if (s.stato !== 'APERTO' && !f.mostraChiusi) return false;
  if (f.prov && s.prov !== f.prov) return false;
  if (q.length) {
    const fieno = (cli.rs + ' ' + s.dest + ' ' + s.loc + ' ' + s.prov + ' ' +
      s.id + ' ' + s.nc + ' ' + s.tipo).toLowerCase();
    if (!q.every(t => terminePassa(t, fieno))) return false;   // tollera le grafie (#ANCHOR: affinita)
  }
  if (f.stato && !ignoraStato && s.stato === 'APERTO' && !statoPassa(s, f.stato)) return false;
  return true;
}

/** Il sito risponde allo stato chiesto? La domanda cambia con quello che si sta
 *  guardando: nella vista Mese e' SOLO quel mese (prima si guardava sempre tutto
 *  l'anno, quindi completando la mappatura di settembre la riga restava a
 *  schermo perche' dicembre era ancora da fare); nella vista Anno e' l'UNICA
 *  mappatura dell'anno di questo SITO, non i suoi mesi di visita. */
function statoPassa(s, quale) {
  if (st.vista === 'mese') {
    const e = statoCella(s.id, st.mese);
    if (!e.spuntabile) return false;
    if (quale === 'complete') return e.n === PASSI;
    if (quale === 'ritardo') return e.ritardo;
    return e.n < PASSI;                                   // 'incomplete' = da fare
  }
  const ma = mappaturaSito(s);
  if (quale === 'complete') return ma.completa;
  if (quale === 'ritardo') return ma.ritardo;
  return ma.prevista && !ma.completa;                     // 'incomplete' = da fare
}

/** Lo stato della mappatura dell'anno di un sito in una parola sola: e' quello
 *  che colora il pallino in testa alla riga nella vista Anno. Le in ritardo sono
 *  anche "da fare": qui vince il ritardo, perche' e' l'informazione che serve. */
export function statoMappatura(s) {
  if (s.stato !== 'APERTO') return 'chiuso';
  const ma = mappaturaSito(s);
  if (ma.completa) return 'completa';
  if (ma.ritardo) return 'ritardo';
  /* Il lavoro iniziato viene prima del "non dovuta": un sito con tre passi su
     quattro in un anno pre-tracciamento e' una mappatura in corso, e mostrarlo
     come puntino spento sarebbe una bugia. */
  if (ma.n > 0) return 'corso';
  if (ma.prevista) return 'attesa';
  /* Pre-tracciamento non e' "niente da fare": e' lavoro recuperabile, e con
     l'inizio del tracciamento a meta' anno sono la maggioranza delle righe.
     Merita un segno diverso dal sito che quest'anno non ha proprio mappatura. */
  return ma.preTrac ? 'pretrac' : 'fuori';
}

export const ET_STATO = {
  completa: 'Mappatura completa: questo sito è a posto per l\'anno',
  ritardo: 'In ritardo: la scadenza è passata e la mappatura non è chiusa in nessun mese',
  corso: 'Iniziata: mancano dei passi, la scadenza non è ancora passata',
  attesa: 'Da fare: dovuta quest\'anno, nessun passo ancora fatto',
  pretrac: 'Scadenza prima dell\'inizio del tracciamento: fuori dai totali, ma si può recuperare',
  fuori: 'Nessuna mappatura dovuta quest\'anno per questo sito',
  chiuso: 'Service chiuso',
};

/** Cambia il filtro di stato e ridisegna. Sta qui, e non in app.js, perche' lo
 *  usano anche i numeri cliccabili delle viste Anno e Mese. Con `alterna` un
 *  secondo clic sullo stesso stato lo toglie. */
export function filtraStato(quale, alterna = false) {
  const nuovo = alterna && st.filtri.stato === quale ? '' : quale;
  if (nuovo === st.filtri.stato) return;
  st.filtri.stato = nuovo;
  salvaFiltri();
  emetti('rilegge');
}

export const termini = () => st.filtri.q.trim().toLowerCase().split(/\s+/).filter(Boolean);

export function gruppiFiltrati(opz) {
  const q = termini();
  const ignoraStato = !!opz?.ignoraStato;
  const out = [];
  for (const g of st.gruppi) {
    const srvs = g.srvs.filter(s => passa(s, g.cli, q, ignoraStato));
    if (srvs.length) out.push({ cli: g.cli, srvs });
  }
  return out;
}

/** Quante righe lascerebbe a schermo ogni posizione del filtro, sull'insieme
 *  filtrato ma SENZA il filtro di stato: sono i numeri scritti dentro il filtro
 *  stesso, e devono restare fermi mentre lo si usa.
 *
 *  Ogni numero e' esattamente `statoPassa` contato: il bottone non puo' dire 7
 *  e poi mostrarne 18. E' anche il motivo per cui questi numeri non sono quelli
 *  della testa: le complete comprendono i siti chiusi in un anno
 *  pre-tracciamento (lavoro fatto, che si vede), mentre la testa conta le
 *  mappature DOVUTE quest'anno. Due domande diverse, due numeri diversi. */
export function contaStato() {
  const c = { tutte: 0, incomplete: 0, ritardo: 0, complete: 0 };
  for (const g of gruppiFiltrati({ ignoraStato: true })) {
    for (const s of g.srvs) {
      if (s.stato !== 'APERTO') continue;
      if (st.vista === 'mese' && !statoCella(s.id, st.mese).spuntabile) continue;
      c.tutte++;
      for (const k of ['incomplete', 'ritardo', 'complete']) {
        if (statoPassa(s, k)) c[k]++;
      }
    }
  }
  return c;
}

/** Righe di lavoro di un mese: una per (service, mese) da fare. */
export function lavoroDelMese(mese, opz) {
  const q = termini();
  const ignoraStato = !!opz?.ignoraStato;
  const out = [];
  for (const g of st.gruppi) {
    for (const s of g.srvs) {
      if (s.stato !== 'APERTO') continue;
      if (!passa(s, g.cli, q, ignoraStato)) continue;
      const e = statoCella(s.id, mese);
      if (!e.spuntabile) continue;
      out.push({ cli: g.cli, s, ...e });
    }
  }
  return out;
}

/** Riepilogo dell'anno sui service filtrati: alimenta la testa e la linea di
 *  stato sotto la barra strumenti.
 *  `mappature` conta i SITI con una mappatura dovuta quest'anno - non i mesi e
 *  non i clienti: la mappatura e' una per sito (#ANCHOR: mappatura-anno).
 *  `clienti` e `aperti` restano il contesto: quanti clienti si stanno guardando
 *  e con quanti impianti. */
export function riepilogoAnno() {
  const r = {
    clienti: 0, aperti: 0, mappature: 0, complete: 0, ritardo: 0, preTrac: 0,
    stime: 0, daRinnovare: 0, nonTracciate: 0, visite: 0, passi: 0, passiFatti: 0,
  };
  /* Senza il filtro di stato: la testa e la linea di stato dicono come sta
     l'anno, non come sta la selezione. Chiedendo "solo le complete" un
     "17/17 complete" non direbbe piu' niente, e i numeri sono anche i
     bottoni per cambiare filtro. */
  for (const g of gruppiFiltrati({ ignoraStato: true })) {
    let aperti = 0;
    for (const s of g.srvs) {
      if (s.stato !== 'APERTO') continue;
      aperti++;
      for (let m = 1; m <= 12; m++) {
        const e = statoCella(s.id, m);
        if (!e.spuntabile) continue;
        if (e.classe === 'stima') r.stime++;
        else if (e.classe === 'da-rinnovare') r.daRinnovare++;
        else if (e.classe === 'non-tracciato') r.nonTracciate++;
        else if (e.classe === 'visita') r.visite++;
      }
      const ma = mappaturaSito(s);
      if (ma.preTrac) r.preTrac++;
      if (!ma.prevista) continue;
      r.mappature++; r.passi += PASSI; r.passiFatti += ma.n;
      if (ma.completa) r.complete++; else if (ma.ritardo) r.ritardo++;
    }
    r.aperti += aperti;
    if (aperti) r.clienti++;
  }
  return r;
}

export const elencoProv = () => [...new Set([...st.perServ.values()].map(s => s.prov).filter(Boolean))].sort();

/* ------------------------------------------------------------ scritture -- */
function scriviLocale(id, mese, patch) {
  st.celle.set(chiave(id, mese), { ...cella(id, mese), ...patch });
  tocca(id);
}

/** Cella arrivata dal server (conferma o SSE): stessa cosa, ma il valore e'
 *  quello autorevole. Passa da qui per non dimenticare l'invalidazione.
 *
 *  I passi ANCORA IN VOLO per questa cella restano quelli locali: il server non
 *  li ha ancora visti, e la sua risposta e' vecchia per quei campi. Senza
 *  questa riga chiudere una scheda in un colpo faceva **lampeggiare** le
 *  spunte: le quattro scrittura partono in fila, e la conferma della prima
 *  torna una cella con un solo passo, che cancellava a schermo gli altri tre
 *  finche' non arrivavano le loro conferme (misurato: 1111 -> 1000 -> 1100 ->
 *  1110 -> 1111). Vale anche per gli eventi SSE e per chi clicca in fretta con
 *  la rete lenta: il merge per campo (decisione 7) e' la stessa idea, qui
 *  applicata al lato client. */
function cellaDalServer(id, mese, valore) {
  const v = { ...valore };
  if (st.sospese.size) {
    const loc = cella(id, mese);
    for (const campo of CAMPI) {
      if (st.sospese.has(`${id}-${mese}-${campo}`)) v[SIGLA[campo]] = loc[SIGLA[campo]];
    }
  }
  st.celle.set(chiave(id, mese), v);
  tocca(id);
}

/* ------------------------------------------------------------- ruoli ---- */
/* #ANCHOR: ruoli. Tre ruoli e due poteri diversi:
     admin        approva, azzera in blocco, cambia le impostazioni, ripristina
                  dal diario (o lo azzera), butta i PDF di un anno intero
     approvatore  approva rapportino e ricambi e BASTA
     tecnico      a schermo "OPERATORE" (ETICHETTA_RUOLO): propone, e quelle
                  due spunte restano in attesa
   `st.ruolo` arriva dal server col bootstrap ed e' l'unica fonte. Il ruolo NON
   si ricava piu' da `st.ruoli[rete.operatore]`: quella riga era il difetto
   della 25a sessione, perche' il nome a schermo e' solo una firma e bastava
   cambiarlo per vedersi cambiare i permessi. */
export const ruoloMio = () => st.ruolo || 'tecnico';
export const sonoAdmin = () => ruoloMio() === 'admin';
/** Chi chiude le proposte: amministratore e approvatore. */
export const possoApprovare = () => ['admin', 'approvatore'].includes(ruoloMio());
export const ruoloDi = nome => st.ruoli[nome] || 'tecnico';
/* Come si LEGGE un ruolo. Il valore memorizzato resta 'tecnico' - e' la chiave
   in database, in api.py e in tutte le funzioni Postgres - ma a schermo la
   parola e' "operatore": chi spunta le mappature non e' per forza un tecnico.
   Passa tutto da qui: nell'interfaccia non si scrive mai il valore grezzo. */
export const ETICHETTA_RUOLO = {
  admin: 'amministratore', approvatore: 'approvatore', tecnico: 'operatore',
};
/* La forma corta, per le pilloline accanto al nome. */
export const SIGLA_RUOLO = { admin: 'admin', approvatore: 'approva', tecnico: 'operatore' };

/** Cosa succede DAVVERO se `campo`, che ora vale `attuale`, viene chiesto a
 *  `valore` da chi sta lavorando. Gemello di api._valore_per_ruolo: sui passi
 *  da approvare l'operatore propone (1 -> 2) e ritira (2 -> 0), ma non toglie
 *  un'approvazione (1 -> 0); chi approva (admin o approvatore) approva e
 *  respinge; rimettere in attesa (2, dal ripristino) e' del solo admin.
 *  Ritorna { v, errore }. */
export function effettivo(campo, attuale, valore) {
  let v = Number(valore) || 0;
  if (![0, 1, 2].includes(v)) v = v ? 1 : 0;
  if (!DA_APPROVARE.includes(campo)) return { v: v ? 1 : 0 };
  if (v === 2 && !sonoAdmin()) return { v, errore: 'Solo l\u2019amministratore rimette una spunta in attesa.' };
  if (possoApprovare()) return { v };
  if (v === 1) return { v: attuale === 1 ? 1 : PROPOSTA };
  if (attuale === 1) {
    return { v, errore: `${ETICHETTA[campo]}: gi\u00e0 approvata, la toglie solo chi approva.` };
  }
  return { v };
}

/** Il valore che un clic sul passo vuole ottenere: e' un interruttore, ma una
 *  proposta in attesa chi approva la APPROVA (-> 1) e l'operatore la RITIRA (-> 0). */
export function prossimo(id, mese, campo) {
  const a = cella(id, mese)[SIGLA[campo]];
  if (a === PROPOSTA) return possoApprovare() ? 1 : 0;
  return a === 1 ? 0 : 1;
}

/** Cosa manda a schermo un passo proposto: chi e da quando. */
export function notaProposta(c, campo) {
  if (!proposto(c, campo)) return '';
  return `${BREVE[campo]}: proposta${c.by ? ' da ' + c.by : ''}, in attesa di chi approva`;
}

/** Le proposte dell'anno in attesa di chi approva (#ANCHOR: ruoli), le piu' recenti
 *  prima: [{id, mese, campo, by, at}]. */
export function proposte() {
  const out = [];
  for (const [k, c] of st.celle) {
    for (const campo of DA_APPROVARE) {
      if (c[SIGLA[campo]] !== PROPOSTA) continue;
      const [id, mese] = k.split('-').map(Number);
      out.push({ id, mese, campo, by: c.by || '', at: c.at || '' });
    }
  }
  return out.sort((x, y) => (y.at || '').localeCompare(x.at || ''));
}

/** Unico varco per cambiare una spunta. Ottimistica + coda. #ANCHOR: toggle
 *  `valore` e' l'INTENZIONE (0/1; 2 solo dall'admin che ripristina): quello
 *  che si scrive lo decide `effettivo()` secondo il ruolo. */
export function spunta(id, mese, campo, valore, senzaUndo, origine) {
  const prima = cella(id, mese);
  const sig = SIGLA[campo];
  const { v, errore } = effettivo(campo, prima[sig], valore);
  if (errore) { avviso(errore, { tono: 'allerta' }); return; }
  if (prima[sig] === v) return;
  const sosp = `${id}-${mese}-${campo}`;
  st.sospese.add(sosp);
  scriviLocale(id, mese, { [sig]: v, by: rete.operatore, at: new Date().toISOString() });
  if (!senzaUndo) {
    st.ultimaAzione = {
      et: `${ETICHETTA[campo]} su #${id}`,
      inverse: [{ id, mese, campo, valore: prima[sig] }],
    };
  }
  emetti('cella', { id, mese });

  accoda({
    rotta: '/api/toggle',
    corpo: {
      id_service: id, anno: st.anno, mese, campo, valore: Number(valore) || 0,
      base_rev: prima.rev || null, base_valore: prima[sig],
      ...(origine ? { origine } : {}),
    },
    meta: { id, mese, campo, sosp },
  });
}

/** N spunte in una volta. `voci` = [{id, mese, campo, valore}]. `origine`
 *  'massa' e' riservata a Completa/Azzera tutte: il server la accetta solo da
 *  un admin. */
export function spuntaMolte(voci, etichetta, origine) {
  const celle = [], inverse = [];
  let vietate = 0;
  /* Il BLOCCO (#ANCHOR: ripristino): tutte le celle di questa azione portano
     `<blocco>:<n>` come op_id, anche se partono in piu' richieste da 250. Cosi'
     nel diario l'azione e' una riga sola e l'admin la ripristina in un colpo. */
  const blocco = crypto.randomUUID().replace(/-/g, '');
  for (const { id, mese, campo, valore } of voci) {
    const prima = cella(id, mese);
    const { v, errore } = effettivo(campo, prima[SIGLA[campo]], valore);
    if (errore) { vietate++; continue; }
    if (prima[SIGLA[campo]] === v) continue;
    inverse.push({ id, mese, campo, valore: prima[SIGLA[campo]] });
    scriviLocale(id, mese, { [SIGLA[campo]]: v, by: rete.operatore, at: new Date().toISOString() });
    celle.push({
      id_service: id, mese, campo, valore: Number(valore) || 0,
      base_rev: prima.rev || null, base_valore: prima[SIGLA[campo]],
      op_id: `${blocco}:${celle.length}`,
    });
  }
  if (vietate) {
    avviso(`${vietate} ${vietate === 1 ? 'spunta approvata lasciata' : 'spunte approvate lasciate'} ` +
      'com\u2019era: le toglie solo l\u2019amministratore.', { tono: 'allerta' });
  }
  if (!celle.length) return 0;
  if (etichetta) st.ultimaAzione = { et: etichetta, inverse };
  emetti('rilegge');
  // A blocchi: una richiesta con migliaia di voci sarebbe un unico punto di rottura.
  for (let i = 0; i < celle.length; i += 250) {
    accoda({
      rotta: '/api/bulk',
      corpo: { anno: st.anno, celle: celle.slice(i, i + 250), ...(origine ? { origine } : {}) },
      meta: { massa: true },
    });
  }
  return celle.length;
}

export function annullaUltima() {
  const a = st.ultimaAzione;
  if (!a) return 0;
  st.ultimaAzione = null;
  const n = spuntaMolte(a.inverse, null, 'annulla');
  emetti('rilegge');
  return n;
}

/* ------------------------------------------------------- diario e ritorni */
/** Una riga di diario/storia in parole: "ha proposto", "ha approvato"... */
export function descriviEvento(e) {
  if (e.campo === 'nota') return 'ha scritto una nota';
  const da = Number(e.da), a = Number(e.a);
  if (e.origine === 'ripristino') {
    const stato = a === PROPOSTA ? 'in attesa' : a === 1 ? 'fatto' : 'da fare';
    return `ha rimesso <i>${e.campo}</i> ${stato}`;
  }
  const rip = '';
  let verbo;
  if (a === PROPOSTA) verbo = 'ha proposto';
  else if (a === 1 && da === PROPOSTA) verbo = 'ha approvato';
  else if (a === 0 && da === PROPOSTA) verbo = e.origine === 'respinta' ? 'ha respinto' : 'ha ritirato';
  else verbo = a ? 'ha spuntato' : 'ha tolto';
  return `${rip}${verbo} <i>${e.campo}</i>`;
}

/** Il blocco di un evento del diario: l'op_id senza il `:n` della cella. Una
 *  spunta singola e' un blocco da una. */
export const bloccoDi = e => (e?.op_id || '').split(':')[0];
export const ripristinabile = e => sonoAdmin() && !!bloccoDi(e) && e.campo !== 'nota' && e.da != null;

/** L'admin rimette com'erano PRIMA tutti i passi di un'operazione (#ANCHOR:
 *  ripristino): il tastino di reversibilita' del diario, che vale anche sulle
 *  sue mosse e su un blocco intero (azione di massa, "Approva tutte", azione
 *  multipla). Lo fa il server (/api/ripristina, ripristina_blocco), che
 *  conosce ogni riga del blocco: qui si applicano le celle che tornano.
 *  Ritorna il numero di celle cambiate, o -1 se non e' andata. */
export async function ripristina(e) {
  const blocco = bloccoDi(e);
  if (!ripristinabile(e)) return -1;
  let r;
  try {
    r = await chiama('/api/ripristina', { metodo: 'POST', ms: 60000,
      body: { op_id: blocco, operatore: rete.operatore } });
  } catch { return -1; }
  if (!r.ok) { avviso(r.dati?.errore || 'Ripristino non riuscito.', { tono: 'allerta' }); return -1; }
  let mio = 0;
  for (const c of r.dati.celle || []) {
    if (c.anno === st.anno) { cellaDalServer(c.id_service, c.mese, c.cella); mio++; }
    else if (c.anno === st.anno - 1) { st.cellePrec.set(chiave(c.id_service, c.mese), c.cella); tocca(c.id_service); }
  }
  if (mio || (r.dati.celle || []).length) emetti('rilegge');
  return r.dati.n ?? mio;
}

/** Una riga di diario che racchiude un blocco: l'etichetta dell'azione. */
export function etichettaBlocco(righe) {
  const o = righe[0]?.origine, a = Number(righe[0]?.a), n = righe.length;
  const sp = n === 1 ? 'spunta' : 'spunte';
  if (o === 'massa') return `${a ? 'Completamento' : 'Azzeramento'} di massa · ${n} ${sp}`;
  if (o === 'approvazione') return `Approvazione di ${n} ${n === 1 ? 'proposta' : 'proposte'}`;
  if (o === 'annulla') return `Annulla · ${n} ${sp} riportate come prima`;
  if (o === 'ripristino') return `Ripristino · ${n} ${sp} rimesse com\u2019erano`;
  return `Azione multipla · ${n} ${sp}`;
}

/** La nota della cella. A differenza dei quattro passi la nota e' testo libero:
 *  due operatori che la riscrivono nello stesso momento si cancellano a vicenda,
 *  e nessuna regola automatica puo' indovinare quale delle due frasi vale. Per
 *  questo parte con la sua base e il server puo' rispondere 409 (api.nota,
 *  imposta_nota).
 *
 *  `base` e' la nota che chi scrive **aveva sotto gli occhi**, non quella che il
 *  modello conosce adesso: se l'altro operatore l'ha cambiata mentre si
 *  scriveva, il modello si e' gia' aggiornato dal flusso ma la casella no, e
 *  prendendo la base da li' il conflitto non lo vedrebbe nessuno. Chi apre una
 *  casella di testo se la porta dietro (vedi spunte.js); chi non ha una casella
 *  aperta usa lo stato corrente, che e' quello che sta guardando. */
export async function salvaNota(id, mese, testo, base) {
  const ora = cella(id, mese);
  const prima = base || { rev: ora.rev, nota: ora.nota };
  if ((ora.nota || '') === testo) return;
  scriviLocale(id, mese, { nota: testo });
  emetti('cella', { id, mese });
  accoda({
    rotta: '/api/nota',
    corpo: { id_service: id, anno: st.anno, mese, nota: testo,
             base_rev: prima.rev || null, base_nota: prima.nota || '' },
    meta: { id, mese, campo: 'nota' },
  });
}

/* --------------------------------------------- ritorni dal server / SSE -- */
export function esitoConferma(op, risposta) {
  if (op.meta?.sosp) st.sospese.delete(op.meta.sosp);
  if (risposta?.cella && risposta.id_service) {
    cellaDalServer(risposta.id_service, risposta.mese, risposta.cella);
    emetti('cella', { id: risposta.id_service, mese: risposta.mese });
  }
  if (Array.isArray(risposta?.esiti)) {
    for (const e of risposta.esiti) {
      if (e.cella && e.id_service) cellaDalServer(e.id_service, e.mese, e.cella);
      st.sospese.delete(`${e.id_service}-${e.mese}-${e.campo}`);
    }
    emetti('rilegge');
  }
}

/** L'operazione e' stata rifiutata dal server (errore applicativo, non un
 *  conflitto): la coda la butta via, quindi il passo non e' piu' "in volo".
 *  Senza questo restava per sempre in `st.sospese` - una cella perennemente in
 *  attesa nella vista Anno, e ora anche un campo che ignora gli aggiornamenti
 *  del server. */
export function esitoFallita(op, server) {
  if (op?.meta?.sosp) st.sospese.delete(op.meta.sosp);
  const { id, mese } = op?.meta || {};
  /* un "vietato" dal server (#ANCHOR: ruoli) porta la cella com'e' davvero:
     la scrittura ottimistica va rimessa a posto, non lasciata a schermo */
  if (server?.cella && server.id_service) cellaDalServer(server.id_service, server.mese, server.cella);
  if (id) emetti('cella', { id, mese });
}

export function esitoConflitto(op, server) {
  if (op.meta?.sosp) st.sospese.delete(op.meta.sosp);
  const { id, mese, campo } = op.meta || {};
  const mio = op.corpo.valore;
  if (server.cella) cellaDalServer(server.id_service, server.mese, server.cella);
  emetti('cella', { id, mese });
  if (!campo) return;
  /* La nota e' testo, non un interruttore: dire "ho tenuto la sua" senza far
     vedere le due frasi non basterebbe a decidere. L'avviso le riporta
     entrambe, e le azioni sono le tre cose sensate da farci. */
  if (campo === 'nota') {
    const sua = server.cella?.nota || '', mia = op.corpo.nota || '';
    const chi = server.cella?.by || 'un altro operatore';
    const taglia = t => (t.length > 90 ? t.slice(0, 88).trimEnd() + '…' : t) || '(vuota)';
    avviso(
      `Nota: ${chi} ne ha scritta un'altra mentre scrivevi la tua. ` +
      `Ho tenuto la sua: “${taglia(sua)}”. La tua era ` +
      `“${taglia(mia)}”.`,
      {
        tono: 'allerta', durata: 20000,
        azione: { et: 'Unisci le due', fn: () => salvaNota(id, mese,
          [sua, mia].filter(Boolean).join(' — ').slice(0, 500)) },
        azione2: { et: 'Tieni la mia', fn: () => salvaNota(id, mese, mia) },
      });
    return;
  }
  avviso(
    `${ETICHETTA[campo]}: ${server.cella?.by || 'un altro operatore'} l'ha messa a ` +
    `"${server.cella?.[SIGLA[campo]] ? 'fatta' : 'da fare'}" mentre tu la mettevi a ` +
    `"${mio ? 'fatta' : 'da fare'}". Ho tenuto la sua.`,
    {
      tono: 'allerta', durata: 12000,
      azione: { et: 'Tieni la mia', fn: () => spunta(id, mese, campo, mio) },
    });
}

/* CHI HA APERTO COSA (#ANCHOR: fuoco). `dove` viaggia dentro la presenza come
   "AAAA-MM @id-mese": dopo la chiocciola c'e' la cella che quel collega ha
   aperta adesso (popover nella vista Anno, scheda nella vista Mese). Sullo
   schermo degli altri e' un anello del suo colore con le iniziali: si vede che
   e' li' PRIMA di cliccarci sopra anche tu. Un solo canale (la presenza), sia
   in locale (ping + SSE) che online (ping + broadcast Realtime). */
export const componiDove = (dove, cellaAperta) => cellaAperta ? `${dove} @${cellaAperta}` : dove;
export function spezzaDove(dove) {
  const m = /^(.*?)\s*@(\d+-\d+)$/.exec(dove || '');
  return m ? { dove: m[1], cella: m[2] } : { dove: dove || '', cella: '' };
}
export function segnaFuoco(nome, dove) {
  if (!nome || nome === rete.operatore) return;
  const sp = spezzaDove(dove);
  const prima = st.fuochi.get(nome)?.cella || '';
  if (sp.cella) st.fuochi.set(nome, { cella: sp.cella, dove: sp.dove, ts: Date.now() });
  else st.fuochi.delete(nome);
  if (prima !== sp.cella) emetti('fuoco', { nome, prima, dopo: sp.cella });
}
/** L'elenco dei collegati e' arrivato (ping o flusso): aggiorna anche i fuochi,
 *  compresi quelli di chi non c'e' piu'. */
export function aggiornaPresenze(online) {
  st.online = online || [];
  const nomi = new Set();
  for (const o of st.online) if (o.nome) { nomi.add(o.nome); segnaFuoco(o.nome, o.dove); }
  for (const nome of [...st.fuochi.keys()]) if (!nomi.has(nome)) segnaFuoco(nome, '');
  emetti('presenze');
}
/** Chi (oltre a me) ha aperta questa cella adesso. */
export const fuochiSu = (id, mese) =>
  [...st.fuochi.entries()].filter(([, f]) => f.cella === `${id}-${mese}`).map(([nome]) => nome);

export function eventoRemoto(ev) {
  if (ev.tipo === 'presenze') { aggiornaPresenze(ev.online); return; }
  if (ev.tipo === 'ruoli') {
    st.ruoli = ev.ruoli || {};
    emetti('ruoli');
    /* Il MIO ruolo (st.ruolo) lo dice il server, non st.ruoli[nome]: l'evento
       e' un broadcast e non puo' portare quello di ciascun destinatario, quindi
       glielo si richiede. Cosi' chi viene nominato approvatore vede la pillola
       "da approvare" subito, e chi viene declassato perde il menu senza dover
       ricaricare. (Questo evento nasce solo dal server locale.) */
    chiama('/api/operatore', { metodo: 'POST', body: { nome: rete.operatore } })
      .then(({ ok, dati }) => {
        if (ok && dati?.ruolo && dati.ruolo !== st.ruolo) { st.ruolo = dati.ruolo; emetti('ruoli'); }
      }).catch(() => {});
    return;
  }
  if (ev.tipo === 'fuoco') { segnaFuoco(ev.nome, ev.dove); return; }
  if (ev.tipo === 'sync') { emetti('sync-fatto', ev.riepilogo); return; }
  if (ev.tipo === 'impostazioni') {
    st.inizioTracciamento = ev.inizio_tracciamento;
    memoScad.clear(); memoMap.clear();
    emetti('rilegge');
    return;
  }
  if (ev.tipo === 'documento') {
    // un PDF delle schede tecnici: si tiene di qualunque anno (lo storico non
    // scade), la spunta "stampata" che porta con se' solo se e' di quest'anno
    if (ev.cella && ev.anno === st.anno) {
      cellaDalServer(ev.id_service, ev.mese, ev.cella);
      emetti('cella', { id: ev.id_service, mese: ev.mese, remoto: ev.operatore });
    }
    emetti('documento-remoto', ev);
    return;
  }
  if (ev.tipo === 'documenti') {
    // una potatura in blocco (un anno, o un sito): le spunte non le tocca,
    // quindi non c'e' niente da riapplicare, solo documenti da togliere
    emetti('documenti-remoti', ev);
    return;
  }
  /* L'anno prima cambia sotto i piedi (un collega recupera dello storico): le
     celle di quest'anno di quel sito possono aver ereditato qualcosa. */
  if (ev.anno === st.anno - 1 && (ev.tipo === 'cella' || ev.tipo === 'celle')) {
    const lista = ev.tipo === 'cella'
      ? [{ id_service: ev.id_service, mese: ev.mese, cella: ev.cella }] : ev.celle;
    for (const c of lista) { st.cellePrec.set(chiave(c.id_service, c.mese), c.cella); tocca(c.id_service); }
    if (ev.tipo === 'cella') emetti('cella', { id: ev.id_service, mese: 0 });
    else emetti('rilegge');
    return;
  }
  if (ev.anno !== st.anno) return;
  if (ev.tipo === 'cella') {
    cellaDalServer(ev.id_service, ev.mese, ev.cella);
    emetti('cella', { id: ev.id_service, mese: ev.mese, remoto: ev.operatore });
  } else if (ev.tipo === 'celle') {
    for (const c of ev.celle) cellaDalServer(c.id_service, c.mese, c.cella);
    emetti('rilegge', { remoto: ev.operatore });
  }
}

export async function cambiaAnno(anno) {
  const { dati } = await chiama('/api/bootstrap?anno=' + anno);
  applica(dati);
}
