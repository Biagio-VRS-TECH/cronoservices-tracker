/* web-ponte.test.mjs - il giudizio del ponte sul file caricato
   (`giudicaFile` in web/js/ponte.js): collegamento automatico, lista dei
   probabili, nessuno, e il sito arrivato dal tracker confrontato con TUTTI gli
   altri (STACCO), il caso UMBERTO I / RIZZATO della 33a sessione. */
import './web-ambiente.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { giudicaFile, SOGLIE } from '../../web/js/ponte.js';
import { pesiParole } from '../../web/js/affinita.js';

const voce = (id, cli, cliente, dest) => ({ id, cli, cliente, dest, loc: '', mese: 3, nome: cliente + ' ' + dest });
const LISTA = [
  voce(556, 1, 'CASA DI RIPOSO UMBERTO I', 'CASA DI RIPOSO UMBERTO I'),
  voce(568, 2, 'RIZZATO SPA', 'STABILIMENTO'),
  voce(570, 3, 'CASA DI RIPOSO CESARE BERTOLI', 'SEDE'),
  voce(600, 4, 'ULSS 1 DOLOMITI', 'OSPEDALE BELLUNO'),
  voce(601, 4, 'ULSS 1 DOLOMITI', 'OSPEDALE FELTRE'),
  voce(700, 5, 'REA KLINIC', 'CLINICA'),
];
const PESI = pesiParole(LISTA.map(s => s.nome));
const UMBERTO = { id: 556, cliente: 'CASA DI RIPOSO UMBERTO I' };
const RIZZATO = { id: 568, cliente: 'RIZZATO SPA' };

test('le soglie sono quelle documentate', () => {
  assert.deepEqual({ ...SOGLIE }, { NETTA: 0.88, PROBABILE: 0.5, RIVALE: 0.72, STACCO: 0.15 });
  assert.ok(Object.isFrozen(SOGLIE));
});

test('corrispondenza netta e cliente con un sito solo: collegato da solo', () => {
  const g = giudicaFile(['casa umberto primo'], LISTA, PESI);
  assert.equal(g.tono, 'ok');
  assert.equal(g.collega.id, 556);
  assert.match(g.testo, /Riconosciuto dal file \(100%\)/);
  assert.equal(giudicaFile(['rea clinik'], LISTA, PESI).collega.id, 700);
});

test('cliente con piu siti: la lista, e si stacca il sito di prima', () => {
  const g = giudicaFile(['ULSS 1 Dolomiti'], LISTA, PESI);
  assert.equal(g.tono, 'lista');
  assert.equal(g.scollega, true);
  assert.deepEqual(g.cand.map(c => c.voce.id).sort(), [600, 601]);
  assert.match(g.testo, /ha piu’ siti/);
});

test('niente di simile: nessuno, si sceglie a mano', () => {
  const g = giudicaFile(['zzzz qqqq'], LISTA, PESI);
  assert.equal(g.tono, 'nessuno');
  assert.equal(g.scollega, true);
  assert.equal(g.cand, null);
});

test('elenco dei siti vuoto: nessuno, senza eccezioni', () => {
  assert.equal(giudicaFile(['RIZZATO'], [], null).tono, 'nessuno');
});

test('dal tracker UMBERTO I, file RIZZATO: si avvisa con le due percentuali (non piu verde e muto)', () => {
  const g = giudicaFile(['RIZZATO'], LISTA, PESI, UMBERTO);
  assert.equal(g.tono, 'dubbio');
  assert.equal(g.cand[0].voce.id, 568);
  assert.match(g.testo, /RIZZATO SPA \(100%\)/);
  assert.match(g.testo, /UMBERTO I \(50%\)/);
  assert.equal(g.collega, undefined, 'il sito del tracker non si cambia da soli');
  assert.equal(g.scollega, undefined);
});

test("dal tracker RIZZATO, file UMBERTO: stesso avviso nell'altro verso", () => {
  const g = giudicaFile(['casa umberto primo'], LISTA, PESI, RIZZATO);
  assert.equal(g.tono, 'dubbio');
  assert.equal(g.cand[0].voce.id, 556);
});

test('dal tracker, il file giusto: ok, nessuna lista', () => {
  const g = giudicaFile(['casa umberto primo'], LISTA, PESI, UMBERTO);
  assert.equal(g.tono, 'ok');
  assert.equal(g.cand, null);
  assert.match(g.testo, /corrisponde al sito collegato/);
});

test("dal tracker, file che non somiglia a nessuno: l'avviso c'e' lo stesso", () => {
  const g = giudicaFile(['zzzz'], LISTA, PESI, { id: 556, cliente: 'CASA' });
  assert.equal(g.tono, 'dubbio');
  assert.equal(g.cand, null);
  assert.match(g.testo, /non somiglia a CASA/);
});

test('dal tracker un sito che non e nella lista (chiuso, altro anno): vale 0, si avvisa', () => {
  const g = giudicaFile(['casa umberto primo'], LISTA, PESI, { id: 99999, cliente: 'SPARITO' });
  assert.equal(g.tono, 'dubbio');
  assert.equal(g.cand[0].voce.id, 556);
});

test('piu domande (nome del file e titolo del foglio): vale la migliore', () => {
  const g = giudicaFile(['export_2026_finale', 'CASA DI RIPOSO UMBERTO PRIMO'], LISTA, PESI);
  assert.equal(g.collega?.id, 556);
});

test('al massimo sei candidati, dal piu simile', () => {
  const tante = Array.from({ length: 20 }, (_, i) => voce(1000 + i, 100 + i, 'OSPEDALE CIVILE ' + i, 'REPARTO'));
  const g = giudicaFile(['ospedale civile'], tante, pesiParole(tante.map(s => s.nome)));
  assert.equal(g.tono, 'lista');
  assert.ok(g.cand.length <= 6);
  assert.ok(g.cand.every((c, i) => i === 0 || g.cand[i - 1].affinita >= c.affinita));
});

/* ------------------------------------------------ il contesto dall'indirizzo --
   Il generatore si apre con ?service=..&anno=..&mese=..: e' un indirizzo che si
   copia, si incolla e si scrive a mano. Un mese fuori da 1..12 arrivava fino
   alla testata (MESI[mese - 1].toLowerCase() su undefined) e la rompeva al
   primo disegno. */
import { contestoDaIndirizzo, nomePdf } from '../../web/js/ponte.js';

test('contesto: un indirizzo pulito arriva com’e’, dal tracker', () => {
  const c = contestoDaIndirizzo('?anno=2026&service=556&mese=3&sito=Sede&cliente=ACME&localita=Treviso', 2030);
  assert.deepEqual({ ...c }, { anno: 2026, id: 556, mese: 3, sito: 'Sede', cliente: 'ACME', localita: 'Treviso', origine: 'tracker' });
  assert.equal(contestoDaIndirizzo('?service=5&come=auto').origine, 'auto');
  assert.equal(contestoDaIndirizzo('?service=5&come=mano').origine, 'mano');
});

test('contesto: mese, sito e anno storti non passano', () => {
  const c = contestoDaIndirizzo('?anno=abc&service=12&mese=13', 2026);
  assert.equal(c.mese, 0);
  assert.equal(c.anno, 2026);
  assert.equal(c.id, 12);
  for (const m of ['0', '-1', '1.5', 'x', '']) assert.equal(contestoDaIndirizzo('?service=1&mese=' + m).mese, 0, m);
  assert.equal(contestoDaIndirizzo('?service=1&mese=12').mese, 12);
  // un sito che non e' un numero intero positivo non e' un sito: niente "dal tracker"
  for (const id of ['abc', '-3', '1.5', '0']) {
    const x = contestoDaIndirizzo('?service=' + id + '&come=tracker');
    assert.equal(x.id, 0, id);
    assert.equal(x.origine, '', id);
  }
  // un modo sconosciuto vale "dal tracker", come senza
  assert.equal(contestoDaIndirizzo('?service=4&come=boh').origine, 'tracker');
  assert.equal(contestoDaIndirizzo('?anno=99999', 2026).anno, 2026);
  assert.equal(contestoDaIndirizzo('', 2026).id, 0);
});

/* --------------------------------------------------------- il nome del PDF --
   Il titolo viene dalla prima cella dell'Excel (a volte con un a capo dentro)
   o da chi lo scrive: il nome del file non deve portarsi dietro caratteri che
   Windows rifiuta, a capo, punti in coda, ne' mezza emoji tagliata a 120. */
test('nome del PDF: cliente, titolo, anno; il cliente non si ripete', () => {
  assert.equal(nomePdf({ titolo: 'Schede impianto', cliente: 'ACME', anno: 2026, ripiego: 'schede tecnici' }),
    'ACME - Schede impianto - 2026.pdf');
  assert.equal(nomePdf({ titolo: 'ACME spa - sede', cliente: 'ACME SPA', anno: 2026, ripiego: 'x' }),
    'ACME spa - sede - 2026.pdf');
  assert.equal(nomePdf({ titolo: '', cliente: '', sito: '', anno: 2026, ripiego: 'schede tecnici' }),
    'sito - schede tecnici - 2026.pdf');
  assert.equal(nomePdf({ titolo: 'T', cliente: 'C', anno: 2026, fascicolo: 2, fascicoli: 3 }),
    'C - T - 2026 - fascicolo 2 di 3.pdf');
  assert.equal(nomePdf({ titolo: 'T', sito: 'Sede nord', anno: 2026 }), 'Sede nord - T - 2026.pdf');
});

test('nome del PDF: niente caratteri proibiti, a capo, controlli o punti in coda', () => {
  const n = nomePdf({ titolo: 'CASA\nDI RIPOSO\t"A/B": C?*<>|\u0000', cliente: 'Cli\\ente', anno: 2026 });
  assert.doesNotMatch(n, /[\\/:*?"<>|\u0000-\u001f]/);
  assert.equal(n, 'Cli_ente - CASA DI RIPOSO _A_B_ C_ - 2026.pdf');
  const punti = nomePdf({ titolo: 'Titolo...', cliente: '', anno: '', ripiego: 'x' });
  assert.equal(punti, 'sito - Titolo.pdf');
});

test('nome del PDF: tagliato a 120 caratteri senza spezzare un carattere doppio', () => {
  const lungo = 'A'.repeat(113) + '\u{1F600}'.repeat(10);        // l'emoji cade sul taglio
  const n = nomePdf({ titolo: lungo, cliente: 'C', anno: 2026, fascicolo: 1, fascicoli: 2 });
  assert.ok(n.endsWith(' - fascicolo 1 di 2.pdf'));
  assert.doesNotMatch(n, /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/);
  assert.ok([...n.replace(' - fascicolo 1 di 2.pdf', '')].length <= 120);
});
