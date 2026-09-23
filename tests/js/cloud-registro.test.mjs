/* cloud-registro.test.mjs - web/registro/registro.js, il modello del Registro
 * dei componenti (nessun DOM: entra l'export, esce una struttura dati).
 *
 * `leggiExport` vuole SheetJS nel globale: qui si prova da `interpretaRiga` in
 * giu', con export finti costruiti a mano.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  chiaveNaturale, cmpNaturale, pianoNumerico, slug, levenshteinMax1, quasiUguali,
  interpretaRiga, costruisciRegistro, dataItaliana, leggiExport, ErroreLettura,
} from '../../web/registro/registro.js';

const OGGI = new Date(2026, 8, 23);
/** Un export finto: una stringa piatta per pezzo, come la colonna A del gestionale. */
function esporta(righe, cliente = 'CASA DI PROVA') {
  const ex = { cliente, righe: [], righeNonInterpretate: [], righeDati: 0, percorso: 'prova.xls' };
  righe.forEach((t, i) => {
    ex.righeDati++;
    const r = interpretaRiga(t, i + 3);
    if (r) ex.righe.push(r); else ex.righeNonInterpretate.push([i + 3, t]);
  });
  return ex;
}
const pezzo = (cod, descr, piano, reparto, stanza) =>
  `${cod} - ${descr} PIANO: ${piano}; REPARTO: ${reparto}; STANZA: ${stanza}; POSIZIONE: A;`;

test('ordine naturale: STANZA 2 prima di STANZA 10, numeri prima delle lettere', () => {
  const l = ['STANZA 10', 'stanza 2', 'STANZA 1', 'BAGNO', '2 LETTI'].sort(cmpNaturale);
  assert.deepEqual(l, ['2 LETTI', 'BAGNO', 'STANZA 1', 'stanza 2', 'STANZA 10']);
  assert.deepEqual(chiaveNaturale('A10b'), [[1, 'a'], [0, 10], [1, 'b']]);
  assert.deepEqual(chiaveNaturale(null), []);
});

test('piano numerico: solo interi, col segno', () => {
  assert.equal(pianoNumerico(' -1 '), -1);
  assert.equal(pianoNumerico('+2'), 2);
  assert.equal(pianoNumerico('0'), 0);
  assert.equal(pianoNumerico('1°'), null);
  assert.equal(pianoNumerico('TERRA'), null);
  assert.equal(pianoNumerico(''), null);
  assert.equal(pianoNumerico(undefined), null);
});

test('slug: minuscolo, trattini, e "x" se non resta niente', () => {
  assert.equal(slug('Piano Terra'), 'piano-terra');
  assert.equal(slug('  --À È--  '), 'x');
  assert.equal(slug(''), 'x');
});

test('refusi: distanza 1 si, cifre diverse e DX/SX no', () => {
  assert.equal(levenshteinMax1('REPARTO', 'REPATRO'), false);   // due sostituzioni
  assert.equal(levenshteinMax1('REPARTO', 'REPARO'), true);
  assert.equal(quasiUguali('REPARTOA', 'REPARTOB', 4), true);
  assert.equal(quasiUguali('REPARTO1', 'REPARTO2', 4), false);
  assert.equal(quasiUguali('LETTODX', 'LETTOSX', 4), false);
  assert.equal(quasiUguali('STANZA1', 'STANZA12', 4), false);    // la cifra in piu' non e' un refuso
  assert.equal(quasiUguali('AB', 'AC', 4), false);               // troppo corti per giudicare
});

test('interpretaRiga: la descrizione puo\' contenere "-", ";" no; il resto e\' null', () => {
  const r = interpretaRiga(pezzo('101236', 'Riduttore - DCn 300 (O2)', '1', 'MEDICINA', 'STANZA 3'), 5, '  nota ');
  assert.deepEqual(r, { indice: 5, codice: '101236', descrizione: 'Riduttore - DCn 300 (O2)',
                        piano: '1', reparto: 'MEDICINA', stanza: 'STANZA 3', nota: 'nota' });
  assert.equal(interpretaRiga('riga qualunque', 1), null);
  assert.equal(interpretaRiga(null, 1), null);
});

test('registro: quadratura, ordine dei piani, tecnici per primi', () => {
  const ex = esporta([
    pezzo('A1', 'Presa ossigeno', '2', 'MEDICINA', 'STANZA 10'),
    pezzo('A1', 'Presa ossigeno', '2', 'MEDICINA', 'STANZA 2'),
    pezzo('B2', 'Riduttore', '2', 'CENTRALE GAS', 'LOCALE'),
    pezzo('A1', 'Presa ossigeno', '-1', 'MAGAZZINO', 'DEPOSITO'),
    pezzo('C3', 'Valvola', 'TERRA', 'INGRESSO', 'ATRIO'),
  ]);
  const reg = costruisciRegistro(ex, { oggi: OGGI, dizionario: { A1: 'Presa O2' } });
  assert.equal(reg.controlli.quadraturaOk, true);
  assert.equal(reg.totale, 5);
  assert.deepEqual(reg.sezioni.map(s => s.titolo), ['Piano -1', 'Piano 2', 'Piano “TERRA”']);
  assert.deepEqual(reg.sezioni[1].reparti.map(r => r.nome), ['CENTRALE GAS', 'MEDICINA']);
  assert.deepEqual(reg.sezioni[1].reparti[1].voci.map(v => v.stanze[0]), ['STANZA 2', 'STANZA 10']);
  assert.equal(reg.legenda.find(v => v.codice === 'A1').nome, 'Presa O2');
  assert.equal(reg.legenda.find(v => v.codice === 'A1').quantita, 3);
  assert.equal(reg.data, '23 settembre 2026');
  assert.equal(reg.controlli.nPiani, 2);             // TERRA non e' un piano numerato
});

test('righe non interpretabili: il registro non quadra e lo dice', () => {
  const ex = esporta([pezzo('A1', 'Presa', '1', 'R', 'S'), 'spazzatura senza etichette']);
  const reg = costruisciRegistro(ex, { oggi: OGGI });
  assert.equal(reg.controlli.quadraturaOk, false);
  assert.ok(reg.anomalie.some(a => a.gravita === 'errore' && a.tipo === 'righe non interpretabili'));
});

test('id delle sezioni univoci anche quando lo slug li schiaccia', () => {
  const ex = esporta([
    pezzo('A1', 'Presa', 'PIANO TERRA', 'R', 'S'),
    pezzo('A1', 'Presa', 'PIANO-TERRA', 'R', 'S'),
    pezzo('A1', 'Presa', 'ÀÀ', 'R', 'S'),
    pezzo('A1', 'Presa', 'ÈÈ', 'R', 'S'),
    pezzo('A1', 'Presa', '1', 'R', 'S'),
    pezzo('A1', 'Presa', '1°', 'R', 'S'),            // slug "1": come il piano numerico 1
  ]);
  const reg = costruisciRegistro(ex, { oggi: OGGI });
  const idSez = reg.sezioni.map(s => s.id);
  assert.equal(new Set(idSez).size, idSez.length, 'id doppi: ' + idSez.join(', '));
  const idRep = reg.sezioni.flatMap(s => s.reparti.map(r => r.id));
  assert.equal(new Set(idRep).size, idRep.length, 'id doppi: ' + idRep.join(', '));
  assert.equal(reg.sezioni.find(s => s.titolo === 'Piano 1').id, 'piano-1');   // il caso normale non cambia
});

test('piani negativi: l\'id resta quello di modello.py', () => {
  const reg = costruisciRegistro(esporta([pezzo('A1', 'P', '-2', 'R', 'S')]), { oggi: OGGI });
  assert.equal(reg.sezioni[0].id, 'pianomeno-meno-2');
  assert.equal(reg.sezioni[0].sottotitolo, 'interrato');
});

test('quadro d\'insieme: prima la priorita\', poi l\'alfabeto; totali per piano', () => {
  const ex = esporta([
    pezzo('Z9', 'Zeta', '0', 'R', 'S'), pezzo('A1', 'Alfa', '0', 'R', 'S'),
    pezzo('M5', 'Emme', '1', 'R', 'S'), pezzo('M5', 'Emme', '0', 'R', 'S'),
  ]);
  const reg = costruisciRegistro(ex, { oggi: OGGI, priorita: { Z9: 1 } });
  assert.deepEqual(reg.matriceRighe.map(r => r.codice), ['Z9', 'A1', 'M5']);
  assert.deepEqual(reg.matriceRighe.find(r => r.codice === 'M5').valori, [1, 1]);
  assert.deepEqual(reg.legenda.map(v => v.codice), ['A1', 'M5', 'Z9']);        // la legenda resta alfabetica
});

test('dataItaliana e leggiExport senza file giusto', () => {
  assert.equal(dataItaliana(new Date(2027, 0, 1)), '1 gennaio 2027');
  assert.throws(() => leggiExport(new ArrayBuffer(0), 'foto.png'), ErroreLettura);
});
