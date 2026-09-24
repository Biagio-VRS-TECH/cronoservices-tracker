/* web-stat.test.mjs - la vista Statistiche (web/js/stat.js): i numeri
   (`raccogli`) con i passi che si accumulano fra i mesi, il ritmo per chiudere
   l'anno ai confini del tracciamento (`ritmo`), e il disegno intero su un
   albero finto: con zero siti, con zero mappature dovute, coi filtri. Niente
   NaN, niente Infinity, niente divisioni per zero a schermo. */
import { servizio, cellaDi, bootstrapDi, testoAlbero } from './web-ambiente.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as S from '../../web/js/stato.js';
import { raccogli, ritmo, disegna } from '../../web/js/stat.js';

const { st } = S;
globalThis.fetch = async () => { throw new TypeError('rete assente (test)'); };

function carica(opz, extra = {}) {
  st.filtri = { q: '', prov: '', mostraChiusi: false, stato: '', resp: '' };
  st.vista = 'stat';
  S.applica({ ...bootstrapDi(opz), ...extra });
}
const tutto = () => {
  const area = document.createElement('div');
  disegna(area, false);
  return testoAlbero(area);
};
const aperto = (id, mesi, extra = {}) => servizio(id, { mesi, inizio: '2020-01-01', scad: '2030-12-31', ...extra });

test('I 4 passi: un passo fatto in un altro mese dello stesso sito conta', () => {
  carica({ services: [aperto(1, '001000001000')],
           celle: { '1-3': cellaDi('1000'), '1-9': cellaDi('0111') } });
  const d = raccogli();
  assert.equal(d.mappature, 1);
  assert.equal(d.complete, 1);
  assert.deepEqual(d.passo, { stampata: 1, controllata: 1, corretta: 1, ricambi: 1 },
    'la mappatura e chiusa: tutti e quattro i passi ci sono');
});

test('I 4 passi: i passi ereditati dall anno prima (mappatura rimasta aperta) contano', () => {
  carica({ services: [aperto(1, '000000001000')], celle_prec: { '1-12': cellaDi('1100') } });
  const d = raccogli();
  assert.equal(d.passo.stampata, 1);
  assert.equal(d.passo.controllata, 1);
  assert.equal(d.passo.corretta, 0);
  assert.equal(d.passiFatti, 2);
});

test('raccogli: chi mette le spunte, le proposte non contano, i clienti a posto', () => {
  carica({ services: [aperto(1, '001000000000', { cli: 1 }), aperto(2, '000000000010', { cli: 2 })],
           celle: { '1-3': cellaDi('1111', { by: 'Anna' }), '2-11': cellaDi('1022', { by: 'Luca' }) } });
  const d = raccogli();
  assert.equal(d.spunte, 5);
  assert.deepEqual([...d.op.values()].map(o => `${o.et}:${o.spunte}:${o.chiuse}`).sort(),
    ['Anna:4:1', 'Luca:1:0']);
  assert.deepEqual(d.cli, { aPosto: 1, iniziati: 1, fermi: 0, arretrati: 0 });
});

test('ritmo: anno in corso, tracciamento da gennaio', () => {
  carica({ oggi: '2026-09-23', inizio_tracciamento: '2026-01', services: [
    aperto(1, '000000000010'), aperto(2, '000000000001'), aperto(3, '000000000010'),
  ], celle: { '1-11': cellaDi('1111') } });
  const d = raccogli();
  const r = ritmo(d);
  assert.equal(r.fase, 'corso');
  assert.equal(r.trascorsi, 9);
  assert.equal(r.restanti, 4);                       // settembre compreso
  assert.equal(r.servono, 0.5);
  assert.equal(r.proiez, 48);
});

test('ritmo: il tracciamento parte piu avanti nell anno, i mesi a disposizione partono da li', () => {
  carica({ oggi: '2026-09-23', inizio_tracciamento: '2026-11', services: [
    aperto(1, '000000000010'), aperto(2, '000000000001'),
  ] });
  const d = raccogli();
  assert.equal(d.mappature, 2);
  const r = ritmo(d);
  assert.equal(r.trascorsi, 0);
  assert.equal(r.restanti, 2, 'novembre e dicembre, non da settembre');
  assert.equal(r.servono, 1);
});

test('ritmo: anno chiuso e anno futuro, e zero mappature', () => {
  carica({ anno: 2025, oggi: '2026-09-23', inizio_tracciamento: '2025-01',
           services: [aperto(1, '000000000010')] });
  let r = ritmo(raccogli());
  assert.equal(r.fase, 'chiuso');
  assert.equal(r.restanti, 0);
  assert.equal(r.servono, 0);
  carica({ anno: 2027, oggi: '2026-09-23', inizio_tracciamento: '2026-01',
           services: [aperto(1, '000000000010')] });
  r = ritmo(raccogli());
  assert.equal(r.fase, 'futuro');
  assert.equal(r.restanti, 12);
  carica({ services: [] });
  r = ritmo(raccogli());
  assert.equal(r.proiez, 0);
  assert.ok(Number.isFinite(r.servono) && Number.isFinite(r.finora));
});

test('disegno con zero siti: nessun NaN, nessun Infinity', () => {
  carica({ services: [] });
  const t = tutto();
  assert.doesNotMatch(t, /NaN|Infinity|undefined/);
  assert.match(t, /Nessun sito aperto/);
});

test('disegno con siti ma nessuna mappatura dovuta (tutto pre-tracciamento): percentuali a zero, non NaN', () => {
  carica({ oggi: '2026-09-23', inizio_tracciamento: '2026-12',
           services: [aperto(1, '001000000000'), aperto(2, '000100000000')] });
  const d = raccogli();
  assert.equal(d.mappature, 0);
  assert.equal(d.preTrac, 2);
  const t = tutto();
  assert.doesNotMatch(t, /NaN|Infinity|undefined/);
  assert.match(t, /0%/);
});

test('disegno di un anno con ritardi, complete e nomi con caratteri HTML', () => {
  carica({ oggi: '2026-09-23', services: [
    aperto(1, '001000000000', { dest: '<b>Sito</b> & co', cli: 1 }),
    aperto(2, '000000000010', { cli: 2 }),
  ], celle: { '2-11': cellaDi('1111') }, clienti: [{ id: 1, rs: 'ROSSI "&" <FIGLI>' }, { id: 2, rs: 'BIANCHI' }] });
  const t = tutto();
  assert.doesNotMatch(t, /NaN|Infinity|undefined/);
  assert.match(t, /in ritardo/);
  // nelle stringhe HTML (svg in innerHTML) i nomi non entrano mai crudi
  const html = (n => { const out = []; (function giro(x) { if (x.innerHTML) out.push(x.innerHTML); x.figli.forEach(giro); })(n); return out.join(''); });
  const area = document.createElement('div');
  disegna(area, false);
  assert.doesNotMatch(html(area), /<FIGLI>|<b>Sito<\/b>/);
});

test('coi filtri accesi la testa dice "sui siti filtrati", anche col solo responsabile', () => {
  const IO = 'mario.rossi@vrs-tech.it';
  carica({ services: [aperto(1, '001000000000'), aperto(2, '000000000010')] },
    { responsabili: { 1: IO }, persone: [{ email: IO, nome: 'Mario Rossi' }], io: IO });
  assert.match(tutto(), /tutti i siti aperti/);
  st.filtri.resp = 'mie';
  assert.equal(raccogli().aperti, 1);
  assert.match(tutto(), /sui siti filtrati/);
});
