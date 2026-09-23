/* web-stato.test.mjs - il modello in memoria di web/js/stato.js: passi,
   classi dei mesi, scadenza della mappatura, rinnovo automatico, ritardi,
   passi cumulativi, ruoli, e il ritorno delle scritture (risposte, eco,
   blocchi rifiutati). */
import { avvisi, servizio, cellaDi, bootstrapDi } from './web-ambiente.mjs';
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import * as S from '../../web/js/stato.js';
import { rete, setOperatore } from '../../web/js/api.js';

const { st } = S;

/* Nessuna rete vera: ogni fetch fallisce come se il server fosse spento, cosi'
   le scritture restano in coda e si possono guardare. Chi vuole una risposta
   sostituisce `rispondi`. */
let chiamate = [];
let rispondi = null;
globalThis.fetch = async (url, opz = {}) => {
  chiamate.push({ url: String(url), opz });
  if (!rispondi) throw new TypeError('rete assente (test)');
  const { stato = 200, dati = {} } = rispondi(String(url), opz) || {};
  return { ok: stato >= 200 && stato < 300, status: stato, text: async () => JSON.stringify(dati) };
};

function carica(opz = {}) {
  rete.coda.length = 0;
  st.sospese.clear();
  st.ultimaAzione = null;
  st.vista = 'anno';
  st.filtri = { q: '', prov: '', mostraChiusi: false, stato: '' };
  S.applica(bootstrapDi(opz));
  avvisi();
}

beforeEach(() => { chiamate = []; rispondi = null; setOperatore('Mario'); });

/* ------------------------------------------------------------ i passi ---- */
test('CAMPI, SIGLA e PASSI stanno insieme', () => {
  assert.deepEqual(S.CAMPI, ['stampata', 'controllata', 'corretta', 'ricambi']);
  assert.equal(S.PASSI, S.CAMPI.length);
  for (const c of S.CAMPI) assert.ok(S.SIGLA[c] && S.ETICHETTA[c] && S.BREVE[c], c);
  assert.equal(new Set(Object.values(S.SIGLA)).size, S.PASSI);
});

test('fatto() vuole esattamente 1: la proposta (2) e i truthy non contano', () => {
  assert.equal(S.fatto({ s: 1 }, 'stampata'), true);
  assert.equal(S.fatto({ k: 2 }, 'corretta'), false);
  assert.equal(S.proposto({ k: 2 }, 'corretta'), true);
  assert.equal(S.fatto({ s: '1' }, 'stampata'), false);
  assert.equal(S.fatto({ s: true }, 'stampata'), false);
  assert.equal(S.fatto(S.VUOTA, 'ricambi'), false);
});

/* ------------------------------------------------- classi dei mesi ------- */
test('una sola cella previsto per sito: il primo mese utile, gli altri visite', () => {
  carica({ services: [servizio(1, { mesi: '001000001000', inizio: '2020-01-01', scad: '2030-12-31' })] });
  const s = st.perServ.get(1);
  assert.equal(S.meseScadenza(s), 3);
  assert.equal(S.classeMese(s, 3), 'previsto');
  assert.equal(S.classeMese(s, 9), 'visita');
  assert.equal(S.classeMese(s, 1), 'non-previsto');
  assert.equal(S.statoCella(1, 3).reale, true);
  assert.equal(S.statoCella(1, 9).reale, false);
  assert.equal(S.statoCella(1, 9).spuntabile, true);
  assert.equal(S.statoCella(1, 1).spuntabile, false);
});

test('contratto che parte a meta anno: i mesi prima sono prima-contratto', () => {
  carica({ services: [servizio(1, { mesi: '001000001000', inizio: '2026-05-15', scad: '2027-05-14' })] });
  const s = st.perServ.get(1);
  assert.equal(S.classeMese(s, 3), 'prima-contratto');
  assert.equal(S.meseScadenza(s), 9);
  assert.equal(S.classeMese(s, 9), 'previsto');
});

test('inizio del contratto a fine mese: il mese stesso e gia dentro', () => {
  carica({ services: [servizio(1, { mesi: '010000000000', inizio: '2026-02-28', scad: '2027-02-27' })] });
  assert.equal(S.classeMese(st.perServ.get(1), 2), 'previsto');
});

test('inizio del tracciamento: la scadenza NON slitta al primo mese tracciato', () => {
  carica({ inizio_tracciamento: '2026-06',
           services: [servizio(1, { mesi: '001000001000', inizio: '2020-01-01', scad: '2030-12-31' })] });
  const s = st.perServ.get(1);
  assert.equal(S.meseScadenza(s), 3);
  assert.equal(S.classeMese(s, 3), 'non-tracciato');
  assert.equal(S.classeMese(s, 9), 'visita');
  const ma = S.mappaturaSito(s);
  assert.equal(ma.preTrac, true);
  assert.equal(ma.prevista, false);
  assert.equal(ma.ritardo, false);
  assert.equal(S.statoMappatura(s), 'pretrac');
});

/* ---------------------------------------------- rinnovo automatico ------- */
test('rinnovo automatico: la scadenza scritta si rimanda avanti fino a oggi (caso LASERJET)', () => {
  carica({ services: [servizio(1, { mesi: '000000001000', inizio: '2025-09-01', scad: '2026-08-31', rin: 1 })] });
  const s = st.perServ.get(1);
  assert.equal(S.scadEffettiva(s), '2027-08-31');
  assert.equal(S.classeMese(s, 9), 'previsto');
  assert.equal(S.mappaturaSito(s).prevista, true);
});

test('senza rinnovo automatico lo stesso mese e da rinnovare', () => {
  carica({ services: [servizio(1, { mesi: '000000001000', inizio: '2025-09-01', scad: '2026-08-31', rin: 0 })] });
  const s = st.perServ.get(1);
  assert.equal(S.scadEffettiva(s), '2026-08-31');
  assert.equal(S.classeMese(s, 9), 'da-rinnovare');
  assert.equal(S.mappaturaSito(s).motivo, 'da-rinnovare');
  assert.equal(S.statoMappatura(s), 'fuori');
});

test('rinnovo automatico su un service CHIUSO non si rinnova', () => {
  carica({ services: [servizio(1, { stato: 'CHIUSO', mesi: '000000001000', inizio: '2025-09-01', scad: '2026-08-31', rin: 1 })] });
  assert.equal(S.scadEffettiva(st.perServ.get(1)), '2026-08-31');
});

test('rinnovo con giorno 31 che cade in un mese corto: il giorno si tiene per i termini dopo', () => {
  // termine di 6 mesi: 2025-10-31 -> 2026-04-30 (aprile ha 30 giorni) -> 2026-10-31
  carica({ services: [servizio(1, { mesi: '111111111111', inizio: '2025-05-01', scad: '2025-10-31', rin: 1 })] });
  assert.equal(S.scadEffettiva(st.perServ.get(1)), '2026-10-31');
});

test('rinnovo a fine febbraio, anno bisestile compreso', () => {
  carica({ oggi: '2028-03-10', anno: 2028,
           services: [servizio(1, { mesi: '010000000000', inizio: '2024-03-01', scad: '2025-02-28', rin: 1 })] });
  assert.equal(S.scadEffettiva(st.perServ.get(1)), '2029-02-28');
});

test("l'anno dopo un termine che non e' ancora iniziato resta stima", () => {
  carica({ anno: 2027, oggi: '2026-09-23',
           services: [servizio(1, { mesi: '001000001000', inizio: '2025-09-01', scad: '2026-08-31', rin: 1 })] });
  const s = st.perServ.get(1);
  // scadenza effettiva 2027-08-31: marzo 2027 dentro, settembre 2027 oltre
  assert.equal(S.classeMese(s, 3), 'previsto');
  assert.equal(S.classeMese(s, 9), 'stima');
});

test('confine di anno: un contratto che finisce il 31 dicembre non vale per gennaio dopo', () => {
  carica({ anno: 2027, oggi: '2027-01-05',
           services: [servizio(1, { mesi: '100000000000', inizio: '2026-01-01', scad: '2026-12-31', rin: 0 })] });
  assert.equal(S.classeMese(st.perServ.get(1), 1), 'da-rinnovare');
});

/* ------------------------------------------------------ ritardi ---------- */
test('in ritardo solo la scadenza passata e non chiusa; chiuderla a una visita la toglie', () => {
  const svc = servizio(1, { mesi: '001000000010', inizio: '2020-01-01', scad: '2030-12-31' });
  carica({ services: [svc] });
  assert.equal(S.statoCella(1, 3).ritardo, true);
  assert.equal(S.mappaturaSito(svc).ritardo, true);
  assert.equal(S.statoCella(1, 11).ritardo, false);        // la visita di novembre no
  carica({ services: [svc], celle: { '1-11': cellaDi('1111') } });
  assert.equal(S.statoCella(1, 3).ritardo, false);
  assert.equal(S.mappaturaSito(svc).completa, true);
  assert.equal(S.statoMappatura(svc), 'completa');
});

test('il mese di oggi non e ancora in ritardo', () => {
  carica({ services: [servizio(1, { mesi: '000000001000', inizio: '2020-01-01', scad: '2030-12-31' })] });
  assert.equal(S.statoCella(1, 9).ritardo, false);
  assert.equal(S.statoMappatura(st.perServ.get(1)), 'attesa');
});

test('un anno passato: tutte le scadenze non chiuse sono in ritardo', () => {
  carica({ anno: 2025, oggi: '2026-09-23',
           services: [servizio(1, { mesi: '000000000001', inizio: '2020-01-01', scad: '2030-12-31' })] });
  assert.equal(S.statoCella(1, 12).ritardo, true);
});

/* ------------------------------------------------ passi cumulativi ------- */
test('i passi di marzo valgono anche a settembre (ereditati)', () => {
  carica({ services: [servizio(1, { mesi: '001000001000', inizio: '2020-01-01', scad: '2030-12-31' })],
           celle: { '1-3': cellaDi('1100') } });
  const e = S.statoCella(1, 9);
  assert.deepEqual(Object.keys(e.ered).sort(), ['controllata', 'stampata']);
  assert.equal(e.n, 2);
  assert.equal(e.mie, 0);
  assert.equal(S.statoCella(1, 3).n, 2);
  assert.match(S.notaEredita(e), /2 passi gi.* fatti a marzo/);
});

test("l'anno prima passa i passi solo se la mappatura e' rimasta aperta", () => {
  const svc = servizio(1, { mesi: '001000000000', inizio: '2020-01-01', scad: '2030-12-31' });
  carica({ services: [svc], celle_prec: { '1-12': cellaDi('1110') } });
  assert.equal(S.statoCella(1, 3).n, 3);
  assert.equal(S.mappaturaSito(svc).passi.stampata.anno, 2025);
  carica({ services: [svc], celle_prec: { '1-12': cellaDi('1111') } });
  assert.equal(S.statoCella(1, 3).n, 0);
});

test('lavoro segnato in un mese fuori calendario conta per il sito', () => {
  const svc = servizio(1, { mesi: '000000001000', inizio: '2020-01-01', scad: '2030-12-31' });
  carica({ services: [svc], celle: { '1-2': cellaDi('1111') } });
  assert.equal(S.mappaturaSito(svc).completa, true);
  assert.equal(S.mappaturaSito(svc).mese, 2);
});

test('la memoria della mappatura si butta a ogni scrittura (niente stato vecchio)', () => {
  const svc = servizio(1, { mesi: '000000001000', inizio: '2020-01-01', scad: '2030-12-31' });
  carica({ services: [svc], ruolo: 'admin' });
  assert.equal(S.mappaturaSito(svc).n, 0);
  S.spunta(1, 9, 'stampata', 1);
  assert.equal(S.mappaturaSito(svc).n, 1);
});

/* -------------------------------------------------------- conteggi ------- */
test('riepilogoAnno e contaStato contano una mappatura per sito', () => {
  carica({
    services: [
      servizio(1, { cli: 10, mesi: '001000001000', inizio: '2020-01-01', scad: '2030-12-31' }),   // in ritardo
      servizio(2, { cli: 10, mesi: '000000000010', inizio: '2020-01-01', scad: '2030-12-31' }),   // da fare
      servizio(3, { cli: 11, mesi: '010000000000', inizio: '2020-01-01', scad: '2030-12-31' }),   // completa
      servizio(4, { cli: 11, stato: 'CHIUSO', mesi: '010000000000' }),
    ],
    celle: { '3-2': cellaDi('1111') },
  });
  const r = S.riepilogoAnno();
  assert.equal(r.clienti, 2);
  assert.equal(r.aperti, 3);
  assert.equal(r.mappature, 3);
  assert.equal(r.complete, 1);
  assert.equal(r.ritardo, 1);
  assert.equal(r.visite, 1);
  assert.equal(r.passiFatti, 4);
  assert.deepEqual(S.contaStato(), { tutte: 3, incomplete: 2, ritardo: 1, complete: 1 });
  st.filtri.stato = 'complete';
  assert.deepEqual(S.gruppiFiltrati().map(g => g.srvs.map(s => s.id)), [[3]]);
  // i numeri restano quelli dell'insieme intero
  assert.equal(S.contaStato().tutte, 3);
});

test('la ricerca tollera le grafie ma non e cieca', () => {
  carica({ services: [servizio(1, { cli: 10, dest: 'REA KLINIC' }), servizio(2, { cli: 11, dest: 'OSPEDALE' })] });
  st.filtri.q = 'clinik';
  assert.deepEqual(S.gruppiFiltrati().flatMap(g => g.srvs.map(s => s.id)), [1]);
  st.filtri.q = '   ';
  assert.equal(S.gruppiFiltrati().length, 2);
});

test('un bootstrap vuoto non rompe niente', () => {
  carica({ services: [] });
  assert.deepEqual(S.gruppiFiltrati(), []);
  assert.equal(S.riepilogoAnno().mappature, 0);
  assert.deepEqual(S.proposte(), []);
});

/* ----------------------------------------------------------- ruoli ------- */
test('effettivo(): l operatore propone, chi approva chiude, il 2 e del solo admin', () => {
  carica({ ruolo: 'tecnico' });
  assert.deepEqual(S.effettivo('stampata', 0, 1), { v: 1 });
  assert.deepEqual(S.effettivo('corretta', 0, 1), { v: S.PROPOSTA });
  assert.deepEqual(S.effettivo('corretta', 1, 1), { v: 1 });
  assert.ok(S.effettivo('corretta', 1, 0).errore);
  assert.deepEqual(S.effettivo('corretta', 2, 0), { v: 0 });
  assert.ok(S.effettivo('corretta', 0, 2).errore);
  carica({ ruolo: 'approvatore' });
  assert.deepEqual(S.effettivo('corretta', 2, 1), { v: 1 });
  assert.ok(S.effettivo('ricambi', 0, 2).errore);
  carica({ ruolo: 'admin' });
  assert.deepEqual(S.effettivo('ricambi', 1, 2), { v: 2 });
  assert.deepEqual(S.effettivo('stampata', 0, 7), { v: 1 });   // valori strani: interruttore
});

test('prossimo(): la proposta chi approva la approva, l operatore la ritira', () => {
  carica({ ruolo: 'tecnico', services: [servizio(1)], celle: { '1-3': cellaDi('0020') } });
  assert.equal(S.prossimo(1, 3, 'corretta'), 0);
  carica({ ruolo: 'admin', services: [servizio(1)], celle: { '1-3': cellaDi('0020') } });
  assert.equal(S.prossimo(1, 3, 'corretta'), 1);
  assert.equal(S.prossimo(1, 3, 'stampata'), 1);
});

test("toccaPasso: l'operatore non toglie un passo approvato ereditato, e non si sente dire 'tolta'", () => {
  carica({ ruolo: 'tecnico',
           services: [servizio(1, { mesi: '001000001000', inizio: '2020-01-01', scad: '2030-12-31' })],
           celle: { '1-3': cellaDi('0010', { rev: 3 }) } });
  assert.ok(S.statoCella(1, 9).ered.corretta);
  const fatto = S.toccaPasso(1, 9, 'corretta');
  assert.equal(fatto, false);
  assert.equal(S.cella(1, 3).k, 1);                 // resta approvata
  assert.equal(rete.coda.length, 0);                // nessuna scrittura partita
  const detti = avvisi();
  assert.equal(detti.length, 1);
  assert.match(detti[0], /gi. approvata/);
});

test('toccaPasso su un passo ereditato lo toglie dal mese in cui era stato messo', () => {
  carica({ ruolo: 'admin',
           services: [servizio(1, { mesi: '001000001000', inizio: '2020-01-01', scad: '2030-12-31' })],
           celle: { '1-3': cellaDi('1000', { rev: 3 }) } });
  assert.equal(S.toccaPasso(1, 9, 'stampata'), true);
  assert.equal(S.cella(1, 3).s, 0);
  assert.equal(S.cella(1, 9).s, 0);
  assert.equal(rete.coda.at(-1).corpo.mese, 3);
});

test('toccaPasso ereditato dall anno prima: si dice dove andare, non si scrive', () => {
  carica({ ruolo: 'admin', services: [servizio(1, { mesi: '001000000000', inizio: '2020-01-01', scad: '2030-12-31' })],
           celle_prec: { '1-11': cellaDi('1000') } });
  assert.equal(S.toccaPasso(1, 3, 'stampata'), false);
  assert.equal(rete.coda.length, 0);
  assert.match(avvisi()[0], /anno 2025/);
});

/* ------------------------------------------- scritture e ritorni --------- */
test('spunta: ottimistica, in coda con base_rev, sospesa finche non torna', () => {
  carica({ ruolo: 'admin', services: [servizio(1)], celle: { '1-3': cellaDi('0000', { rev: 4 }) } });
  assert.equal(S.spunta(1, 3, 'stampata', 1), true);
  assert.equal(S.cella(1, 3).s, 1);
  assert.ok(st.sospese.has('1-3-stampata'));
  const op = rete.coda.at(-1);
  assert.equal(op.rotta, '/api/toggle');
  assert.equal(op.corpo.base_rev, 4);
  assert.equal(op.corpo.base_valore, 0);
  // la stessa spunta due volte: la seconda non manda niente
  const n = rete.coda.length;
  assert.equal(S.spunta(1, 3, 'stampata', 1), true);
  assert.equal(rete.coda.length, n);
});

test('una risposta piu vecchia della cella che abbiamo non la riporta indietro', () => {
  carica({ ruolo: 'admin', services: [servizio(1)], celle: { '1-3': cellaDi('0000', { rev: 4 }) } });
  S.spunta(1, 3, 'stampata', 1);
  const op = rete.coda.at(-1);
  // prima della risposta arriva l'eco di un collega che ha messo "ricambi" dopo di noi
  S.eventoRemoto({ tipo: 'cella', anno: 2026, id_service: 1, mese: 3, operatore: 'Luca',
                   cella: cellaDi('1001', { rev: 6, by: 'Luca' }) });
  S.esitoConferma(op, { id_service: 1, mese: 3, cella: cellaDi('1000', { rev: 5 }) });
  assert.equal(S.cella(1, 3).r, 1, 'la spunta del collega resta');
  assert.equal(S.cella(1, 3).rev, 6);
  assert.equal(st.sospese.size, 0);
});

test('la risposta di pari revisione si applica (e la stessa fotografia)', () => {
  carica({ ruolo: 'tecnico', services: [servizio(1)], celle: { '1-3': cellaDi('0000', { rev: 4 }) } });
  S.spunta(1, 3, 'corretta', 1);
  const op = rete.coda.at(-1);
  S.esitoConferma(op, { id_service: 1, mese: 3, cella: cellaDi('0020', { rev: 5 }) });
  assert.equal(S.cella(1, 3).k, 2);
  assert.equal(S.cella(1, 3).rev, 5);
});

test("l'eco vecchia di Realtime non rimette a schermo una spunta tolta", () => {
  carica({ ruolo: 'admin', services: [servizio(1)], celle: { '1-3': cellaDi('0000', { rev: 8 }) } });
  S.eventoRemoto({ tipo: 'cella', anno: 2026, id_service: 1, mese: 3, cella: cellaDi('0111', { rev: 6 }) });
  assert.equal(S.cella(1, 3).c, 0);
  S.eventoRemoto({ tipo: 'celle', anno: 2026, celle: [{ id_service: 1, mese: 3, cella: cellaDi('0011', { rev: 7 }) }] });
  assert.equal(S.cella(1, 3).k, 0);
  S.eventoRemoto({ tipo: 'cella', anno: 2026, id_service: 1, mese: 3, cella: cellaDi('1000', { rev: 9 }) });
  assert.equal(S.cella(1, 3).s, 1);
});

test('un evento di un altro anno non tocca le celle di questo', () => {
  carica({ services: [servizio(1)] });
  S.eventoRemoto({ tipo: 'cella', anno: 2030, id_service: 1, mese: 3, cella: cellaDi('1111', { rev: 9 }) });
  assert.equal(S.cella(1, 3).s, 0);
});

test('spuntaMolte: blocchi che non spezzano una cella, voci in volo, rifiuto in blocco che torna indietro', () => {
  const services = Array.from({ length: 70 }, (_, i) => servizio(i + 1, { mesi: '000000001000', inizio: '2020-01-01', scad: '2030-12-31' }));
  carica({ ruolo: 'admin', services });
  const voci = services.flatMap(s => S.CAMPI.map(campo => ({ id: s.id, mese: 9, campo, valore: 1 })));
  assert.equal(S.spuntaMolte(voci, 'Completa tutte', 'massa'), 280);
  const blocchi = rete.coda.filter(o => o.rotta === '/api/bulk');
  assert.equal(blocchi.length, 2);
  // il taglio cade fra due celle, mai dentro
  const primo = blocchi[0].corpo.celle, secondo = blocchi[1].corpo.celle;
  assert.notEqual(`${primo.at(-1).id_service}`, `${secondo[0].id_service}`);
  assert.equal(primo.length % S.PASSI, 0);
  assert.equal(st.sospese.size, 280);
  // lo stesso blocco (op_id) in tutte le richieste
  const blocco = primo[0].op_id.split(':')[0];
  assert.ok(secondo.every(c => c.op_id.startsWith(blocco + ':')));
  // il server rifiuta il primo blocco (403): le sue celle tornano com'erano
  S.esitoFallita(blocchi[0], { errore: "le azioni di massa sono dell'amministratore" });
  const id0 = primo[0].id_service;
  assert.equal(S.cella(id0, 9).s, 0);
  assert.equal(st.sospese.has(`${id0}-9-stampata`), false);
  assert.equal(st.sospese.size, 280 - primo.length);
});

test('esiti di un blocco: una cella torna una volta per passo e alla fine e quella del server', () => {
  carica({ ruolo: 'tecnico', services: [servizio(1)], celle: { '1-3': cellaDi('0000', { rev: 1 }) } });
  S.spuntaMolte(S.CAMPI.map(campo => ({ id: 1, mese: 3, campo, valore: 1 })));
  const op = rete.coda.at(-1);
  assert.equal(S.cella(1, 3).k, 2);                 // l'operatore propone
  // un'eco di mezzo arriva prima della risposta: la cella scritta in locale non si dimezza
  S.eventoRemoto({ tipo: 'cella', anno: 2026, id_service: 1, mese: 3, cella: cellaDi('1000', { rev: 2 }) });
  assert.equal(S.cella(1, 3).c, 1);
  const esiti = ['1000', '1100', '1120', '1122'].map((p, i) => ({
    esito: 'ok', id_service: 1, mese: 3, campo: S.CAMPI[i], cella: cellaDi(p, { rev: 2 + i }) }));
  S.esitoConferma(op, { esiti });
  assert.deepEqual([S.cella(1, 3).s, S.cella(1, 3).c, S.cella(1, 3).k, S.cella(1, 3).r], [1, 1, 2, 2]);
  assert.equal(S.cella(1, 3).rev, 5);
  assert.equal(st.sospese.size, 0);
});

test("Annulla rimette com'era l'ultima azione", () => {
  carica({ ruolo: 'admin', services: [servizio(1)], celle: { '1-3': cellaDi('1000', { rev: 2 }) } });
  S.spuntaMolte([{ id: 1, mese: 3, campo: 'controllata', valore: 1 }, { id: 1, mese: 3, campo: 'stampata', valore: 0 }], 'prova');
  assert.equal(S.cella(1, 3).c, 1);
  assert.equal(S.annullaUltima(), 2);
  assert.equal(S.cella(1, 3).c, 0);
  assert.equal(S.cella(1, 3).s, 1);
  assert.equal(S.annullaUltima(), 0);
});

test("l'Annulla di un avviso vecchio non disfa un'azione arrivata dopo", () => {
  carica({ ruolo: 'admin', services: [servizio(1)], celle: { '1-3': cellaDi('0000', { rev: 2 }) } });
  S.spuntaMolte([{ id: 1, mese: 3, campo: 'controllata', valore: 1 }], 'Completa tutte', 'massa');
  const questa = st.ultimaAzione;
  S.spunta(1, 3, 'ricambi', 1);                     // una spunta dopo: e' lei l'ultima
  assert.equal(S.annullaUltima(questa), -1);
  assert.equal(S.cella(1, 3).r, 1, 'la spunta nuova resta');
  assert.equal(S.cella(1, 3).c, 1);
  assert.ok(S.annullaUltima() > 0, 'senza argomento resta il comportamento di prima');
});

test('le scritture in coda sopravvivono a un nuovo bootstrap', () => {
  const svc = servizio(1);
  carica({ ruolo: 'admin', services: [svc] });
  S.spunta(1, 3, 'stampata', 1);
  S.applica(bootstrapDi({ ruolo: 'admin', services: [svc] }));
  assert.equal(S.cella(1, 3).s, 1);
});

/* ------------------------------------------------------ diario ----------- */
test('descriviEvento: verbi giusti e campo come testo', () => {
  assert.equal(S.descriviEvento({ campo: 'corretta', da: 0, a: 2 }), 'ha proposto <i>corretta</i>');
  assert.equal(S.descriviEvento({ campo: 'corretta', da: 2, a: 1 }), 'ha approvato <i>corretta</i>');
  assert.equal(S.descriviEvento({ campo: 'corretta', da: 2, a: 0, origine: 'respinta' }), 'ha respinto <i>corretta</i>');
  assert.equal(S.descriviEvento({ campo: 'nota' }), 'ha scritto una nota');
  assert.equal(S.descriviEvento({ campo: '<img src=x onerror=alert(1)>', da: 0, a: 1 }),
    'ha spuntato <i>&lt;img src=x onerror=alert(1)&gt;</i>');
});

test('bloccoDi e etichettaBlocco', () => {
  assert.equal(S.bloccoDi({ op_id: 'abc:12' }), 'abc');
  assert.equal(S.bloccoDi({}), '');
  assert.match(S.etichettaBlocco([{ origine: 'massa', a: 1 }, { origine: 'massa', a: 1 }]), /Completamento di massa · 2 spunte/);
  assert.match(S.etichettaBlocco([{ origine: 'approvazione', a: 1 }]), /1 proposta/);
});

test('spezzaDove / componiDove si rovesciano', () => {
  assert.deepEqual(S.spezzaDove(S.componiDove('2026-09', '12-3')), { dove: '2026-09', cella: '12-3' });
  assert.deepEqual(S.spezzaDove('2026-09'), { dove: '2026-09', cella: '' });
  assert.deepEqual(S.spezzaDove(null), { dove: '', cella: '' });
});

/* --------------------------------------------------- cambio d'anno ------- */
test("cambiaAnno porta l'operatore (il ruolo in locale viene da li') e non applica un errore", async () => {
  carica({ ruolo: 'admin', services: [servizio(1)] });
  setOperatore('Anna Admin');
  rispondi = url => url.startsWith('/api/bootstrap')
    ? { dati: bootstrapDi({ anno: 2025, ruolo: 'admin', services: [servizio(1)] }) } : { dati: {} };
  await S.cambiaAnno(2025);
  const u = new URL(chiamate.find(c => c.url.startsWith('/api/bootstrap')).url, 'http://x');
  assert.equal(u.searchParams.get('anno'), '2025');
  assert.equal(u.searchParams.get('operatore'), 'Anna Admin');
  assert.equal(st.anno, 2025);
  assert.equal(st.ruolo, 'admin');

  rispondi = () => ({ stato: 500, dati: { errore: 'rotto' } });
  await assert.rejects(S.cambiaAnno(2024), /rotto/);
  assert.equal(st.anno, 2025, 'il modello resta quello di prima');
});

test('due cambi d anno incrociati: vale l ultimo chiesto', async () => {
  carica({ services: [servizio(1)] });
  const attese = [];
  rispondi = url => {
    const a = Number(new URL(url, 'http://x').searchParams.get('anno'));
    return { dati: bootstrapDi({ anno: a, services: [servizio(1)] }) };
  };
  // il primo risponde DOPO il secondo
  const lento = globalThis.fetch;
  globalThis.fetch = async (url, opz) => {
    if (String(url).includes('anno=2023')) await new Promise(r => attese.push(r));
    return lento(url, opz);
  };
  try {
    const p1 = S.cambiaAnno(2023);
    await S.cambiaAnno(2024);
    attese.forEach(r => r());
    await p1;
    assert.equal(st.anno, 2024);
  } finally {
    globalThis.fetch = lento;
  }
});
