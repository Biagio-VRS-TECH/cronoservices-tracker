/* web-mese.test.mjs - la vista Mese (web/js/mese.js) senza browser: il disegno
   del foglio su un albero finto (numeri della testa, mese vuoto, nomi con
   caratteri HTML) e le voci della selezione multipla (`vociSelezione`). */
import { servizio, cellaDi, bootstrapDi, avvisi } from './web-ambiente.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as S from '../../web/js/stato.js';
import { disegna, vociSelezione, pulisci } from '../../web/js/mese.js';
import { rete } from '../../web/js/api.js';

const { st } = S;
globalThis.fetch = async () => { throw new TypeError('rete assente (test)'); };

function carica(opz, extra = {}) {
  rete.coda.length = 0;
  localStorage.removeItem('cs.coda.v1');
  st.sospese.clear();
  st.selezione.clear();
  st.filtri = { q: '', prov: '', mostraChiusi: false, stato: '', resp: '' };
  st.vista = 'mese';
  S.applica({ ...bootstrapDi(opz), ...extra });
  avvisi();
}
const aperto = (id, mesi, extra = {}) => servizio(id, { mesi, inizio: '2020-01-01', scad: '2030-12-31', ...extra });
function foglio(mese) {
  st.mese = mese;
  pulisci();
  const area = document.createElement('div');
  disegna(area);
  return area.innerHTML;
}

test('il foglio conta le mappature che SCADONO nel mese, non le schede', () => {
  carica({ services: [
    aperto(1, '001000001000', { cli: 1 }),     // settembre e' una visita
    aperto(2, '000000001000', { cli: 1 }),     // settembre e' la scadenza
    aperto(3, '000000001000', { cli: 2 }),
  ], celle: { '3-9': cellaDi('1111') } });
  const html = foglio(9);
  assert.equal((html.match(/class="scheda/g) || []).length, 3);
  assert.match(html, /<span class="n">2<\/span><span class="et">in scadenza/);
  assert.match(html, /<span class="n">1\/2<\/span><span class="et">complete/);
});

test('i nomi di clienti e siti entrano nel foglio come testo', () => {
  carica({ services: [aperto(1, '000000001000', { dest: '<img src=x onerror=alert(1)>' })],
           clienti: [{ id: 1, rs: 'ROSSI & <FIGLI>' }] });
  const html = foglio(9);
  assert.doesNotMatch(html, /<img src=x/);
  assert.doesNotMatch(html, /<FIGLI>/);
  assert.match(html, /ROSSI &amp; &lt;FIGLI&gt;/);
});

test('mese senza manutenzioni: propone il primo mese dopo con lavoro, anche a cavallo di dicembre', () => {
  carica({ services: [aperto(1, '010000000000')] });
  const html = foglio(11);
  assert.match(html, /Nessuna mappatura in questo mese/);
  assert.match(html, /data-mese="2"\s+style="margin-top:10px">Vai a febbraio/);
});

test('mese vuoto per colpa del filtro del responsabile: lo dice, non «nessun sito ha questo mese»', () => {
  const IO = 'mario.rossi@vrs-tech.it', ALTRA = 'anna.bianchi@vrs-tech.it';
  carica({ services: [aperto(1, '000000001000')] },
    { responsabili: { 1: ALTRA }, persone: [], io: IO });
  st.filtri.resp = 'mie';
  const html = foglio(9);
  assert.match(html, /con questi filtri/);
  assert.doesNotMatch(html, /Nessun sito aperto ha/);
});

test('vociSelezione: solo i passi che mancano davvero', () => {
  carica({ ruolo: 'admin', services: [aperto(1, '001000001000'), aperto(2, '000000001000')],
           celle: { '1-3': cellaDi('1000'), '2-9': cellaDi('0120') } });
  const v = vociSelezione([1, 2], 9, S.CAMPI).map(x => `${x.id}:${x.campo}`);
  // 1: stampata ereditata da marzo; 2: controllata fatta, rapportino proposto (l'admin lo approva)
  assert.deepEqual(v, ['1:controllata', '1:corretta', '1:ricambi', '2:stampata', '2:corretta', '2:ricambi']);
  assert.ok(vociSelezione([1], 9, ['stampata']).length === 0);
  assert.deepEqual(vociSelezione([], 9, S.CAMPI), []);
});

test('vociSelezione: per l operatore una proposta gia fatta non e una spunta da inviare', () => {
  carica({ ruolo: 'tecnico', services: [aperto(2, '000000001000')], celle: { '2-9': cellaDi('1120') } });
  const v = vociSelezione([2], 9, S.CAMPI).map(x => x.campo);
  assert.deepEqual(v, ['ricambi'], 'rapportino e gia in attesa: rimandarlo non cambia niente');
  assert.equal(S.spuntaMolte(vociSelezione([2], 9, S.CAMPI)), v.length, 'il conto detto e quello inviato');
});
