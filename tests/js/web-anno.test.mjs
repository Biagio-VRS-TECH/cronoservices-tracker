/* web-anno.test.mjs - la logica della vista Anno che non tocca il DOM
   (web/js/anno.js): i totali per mese in testa, cosa completano e cosa azzerano
   le azioni di massa; e il mese su cui va la spunta "stampata" di un PDF
   (stato.mesePerStampa), ai confini dell'anno. */
import { servizio, cellaDi, bootstrapDi } from './web-ambiente.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as S from '../../web/js/stato.js';
import { totaliMesi, passiMancanti, passiPresenti } from '../../web/js/anno.js';

const { st } = S;
globalThis.fetch = async () => { throw new TypeError('rete assente (test)'); };

function carica(opz) {
  st.filtri = { q: '', prov: '', mostraChiusi: false, stato: '' };
  st.vista = 'anno';
  S.applica(bootstrapDi(opz));
}

test('totaliMesi: una mappatura per sito, nel mese della sua scadenza', () => {
  carica({ services: [
    servizio(1, { cli: 1, mesi: '001000001000', inizio: '2020-01-01', scad: '2030-12-31' }),
    servizio(2, { cli: 1, mesi: '001000000000', inizio: '2020-01-01', scad: '2030-12-31' }),
    servizio(3, { cli: 2, mesi: '000000000001', inizio: '2020-01-01', scad: '2030-12-31' }),
    servizio(4, { cli: 2, stato: 'CHIUSO', mesi: '001000000000', inizio: '2020-01-01', scad: '2030-12-31' }),
  ], celle: { '1-9': cellaDi('1111') } });
  const t = totaliMesi(S.gruppiFiltrati());
  assert.equal(t.length, 12);
  assert.deepEqual(t[2], [1, 2]);          // marzo: 1 e 2 scadono, 1 chiusa (a settembre)
  assert.deepEqual(t[8], [0, 0]);          // settembre e' una visita, non una scadenza
  assert.deepEqual(t[11], [0, 1]);
  assert.deepEqual(totaliMesi([]), Array.from({ length: 12 }, () => [0, 0]));
});

test('totaliMesi: i siti non dovuti (pre-tracciamento, da rinnovare) non contano', () => {
  carica({ inizio_tracciamento: '2026-06', services: [
    servizio(1, { mesi: '001000000000', inizio: '2020-01-01', scad: '2030-12-31' }),
    servizio(2, { mesi: '000000001000', inizio: '2020-01-01', scad: '2026-05-31', rin: 0 }),
  ] });
  assert.ok(totaliMesi(S.gruppiFiltrati()).every(([f, t]) => f === 0 && t === 0));
});

test('passiMancanti: solo le scadenze reali, senza rimettere gli ereditati', () => {
  carica({ ruolo: 'admin', services: [
    servizio(1, { mesi: '001000001000', inizio: '2020-01-01', scad: '2030-12-31' }),
  ], celle: { '1-3': cellaDi('1000') } });
  const reali = passiMancanti(true);
  assert.deepEqual(reali.map(v => `${v.mese}:${v.campo}`), ['3:controllata', '3:corretta', '3:ricambi']);
  // con le visite: settembre eredita "stampata" da marzo, non la si rimette
  const tutte = passiMancanti(false);
  assert.ok(!tutte.some(v => v.mese === 9 && v.campo === 'stampata'));
  assert.equal(tutte.filter(v => v.mese === 9).length, 3);
});

test('passiMancanti: un sito chiuso a una visita dopo la scadenza non ha passi mancanti', () => {
  carica({ ruolo: 'admin', services: [
    servizio(1, { mesi: '001000000010', inizio: '2020-01-01', scad: '2030-12-31' }),   // chiusa a novembre
    servizio(2, { mesi: '001000000010', inizio: '2020-01-01', scad: '2030-12-31' }),   // stampata a novembre
  ], celle: { '1-11': cellaDi('1111'), '2-11': cellaDi('1000') } });
  const v = passiMancanti(true).map(x => `${x.id}-${x.mese}:${x.campo}`);
  assert.deepEqual(v, ['2-3:controllata', '2-3:corretta', '2-3:ricambi'],
    'la mappatura del sito e una sola: quello che e fatto in un mese vale per l anno');
});

test('passiPresenti: anche le orfane, le proposte e i siti chiusi a schermo', () => {
  carica({ services: [
    servizio(1, { mesi: '001000000000', inizio: '2020-01-01', scad: '2030-12-31' }),
    servizio(2, { stato: 'CHIUSO', mesi: '001000000000' }),
  ], celle: { '1-5': cellaDi('1000'), '1-3': cellaDi('0020'), '2-3': cellaDi('0100') } });
  st.filtri.mostraChiusi = true;
  const v = passiPresenti().map(x => `${x.id}-${x.mese}:${x.campo}`).sort();
  assert.deepEqual(v, ['1-3:corretta', '1-5:stampata', '2-3:controllata']);
  assert.ok(passiPresenti().every(x => x.valore === 0));
  st.filtri.mostraChiusi = false;
  assert.ok(!passiPresenti().some(x => x.id === 2), 'i filtri restano il confine');
});

test('mesePerStampa: la prima visita in arrivo, mai una passata', () => {
  carica({ oggi: '2026-09-23', services: [
    servizio(1, { mesi: '001000000010', inizio: '2020-01-01', scad: '2030-12-31' }),
  ] });
  assert.equal(S.mesePerStampa(st.perServ.get(1)), 11);
});

test('mesePerStampa: il mese di oggi vale ancora', () => {
  carica({ oggi: '2026-09-01', services: [servizio(1, { mesi: '000000001000', inizio: '2020-01-01', scad: '2030-12-31' })] });
  assert.equal(S.mesePerStampa(st.perServ.get(1)), 9);
});

test('mesePerStampa: a dicembre con le visite alle spalle torna il mese della mappatura', () => {
  carica({ oggi: '2026-12-20', services: [servizio(1, { mesi: '001000000000', inizio: '2020-01-01', scad: '2030-12-31' })] });
  assert.equal(S.mesePerStampa(st.perServ.get(1)), 3);
});

test("mesePerStampa: l'anno dopo parte da gennaio, un anno passato non cerca futuro", () => {
  carica({ anno: 2027, oggi: '2026-12-20',
           services: [servizio(1, { mesi: '100000000100', inizio: '2020-01-01', scad: '2030-12-31' })] });
  assert.equal(S.mesePerStampa(st.perServ.get(1)), 1);
  carica({ anno: 2025, oggi: '2026-12-20',
           services: [servizio(1, { mesi: '100000000100', inizio: '2020-01-01', scad: '2030-12-31' })],
           celle: { '1-10': cellaDi('1000') } });
  assert.equal(S.mesePerStampa(st.perServ.get(1)), 10);
});

test('mesePerStampa: nessuna mappatura dovuta -> 0 (nessuna spunta)', () => {
  carica({ services: [servizio(1, { mesi: '000000000000' })] });
  assert.equal(S.mesePerStampa(st.perServ.get(1)), 0);
});

test('prestazioni: 300 siti x 12 mesi, un conto di testa sotto i 250 ms', () => {
  const services = Array.from({ length: 300 }, (_, i) => servizio(i + 1, {
    cli: Math.floor(i / 3) + 1, mesi: i % 2 ? '001000001000' : '010001000100',
    inizio: '2020-01-01', scad: '2030-12-31', rin: i % 3 === 0 ? 1 : 0 }));
  const celle = {};
  for (const s of services) if (s.id % 4 === 0) celle[`${s.id}-3`] = cellaDi('1111');
  carica({ services, celle });
  const t0 = performance.now();
  S.riepilogoAnno();
  S.contaStato();
  totaliMesi(S.gruppiFiltrati({ ignoraStato: true }));
  for (const s of services) for (let m = 1; m <= 12; m++) S.statoCella(s.id, m);
  assert.ok(performance.now() - t0 < 250, 'troppo lento: ' + (performance.now() - t0).toFixed(1) + ' ms');
});
