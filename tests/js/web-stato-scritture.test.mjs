/* web-stato-scritture.test.mjs - il giro di una scrittura in web/js/stato.js
   oltre a quello che prova web-stato: il doppio clic sullo stesso passo, la
   pagina ricaricata con la coda piena, la nota in volo, il rifiuto del server,
   la risposta che arriva dopo un cambio d'anno, l'Annulla di un'azione vuota,
   il filtro di stato coi chiusi a schermo. E le funzioni che nessun test
   toccava: filtri salvati, eta' dell'anagrafica, titolo della scheda, fuochi,
   conflitti, proposte, ripristino. */
import { avvisi, servizio, cellaDi, bootstrapDi } from './web-ambiente.mjs';
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import * as S from '../../web/js/stato.js';
import { rete, setOperatore } from '../../web/js/api.js';

const { st } = S;

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
  localStorage.removeItem('cs.coda.v1');
  st.sospese.clear();
  st.ultimaAzione = null;
  st.vista = 'anno';
  st.filtri = { q: '', prov: '', mostraChiusi: false, stato: '', resp: '' };
  S.applica(bootstrapDi(opz));
  avvisi();
}
/** Toglie dalla coda (in memoria e sul disco) come fa api.svuota prima di
 *  consegnare l'esito: chi riceve l'esito non trova piu' la SUA operazione. */
function spedita(op) {
  const i = rete.coda.indexOf(op);
  if (i >= 0) rete.coda.splice(i, 1);
  localStorage.setItem('cs.coda.v1', JSON.stringify(rete.coda));
}

beforeEach(() => { chiamate = []; rispondi = null; setOperatore('Mario'); });

const svc = () => servizio(1, { mesi: '001000001000', inizio: '2020-01-01', scad: '2030-12-31' });

/* -------------------------------------------------- doppio clic ------------ */
test('doppio clic sullo stesso passo: la conferma del primo non riporta a schermo il valore vecchio', () => {
  carica({ ruolo: 'admin', services: [svc()], celle: { '1-3': cellaDi('0000', { rev: 4 }) } });
  S.spunta(1, 3, 'stampata', 1);
  S.spunta(1, 3, 'stampata', 0);
  assert.equal(rete.coda.length, 2);
  const [op1, op2] = rete.coda.slice();
  spedita(op1);
  S.esitoConferma(op1, { id_service: 1, mese: 3, cella: cellaDi('1000', { rev: 5 }) });
  assert.equal(S.cella(1, 3).s, 0, 'la seconda scrittura e ancora in coda: a schermo resta la sua');
  assert.ok(st.sospese.has('1-3-stampata'), 'il passo resta in volo');
  spedita(op2);
  S.esitoConferma(op2, { id_service: 1, mese: 3, cella: cellaDi('0000', { rev: 6 }) });
  assert.equal(S.cella(1, 3).s, 0);
  assert.equal(S.cella(1, 3).rev, 6);
  assert.equal(st.sospese.size, 0);
});

test('un blocco confermato da un altra scheda (risposta vuota) libera tutte le sue voci', () => {
  carica({ ruolo: 'admin', services: [svc()] });
  S.spuntaMolte(S.CAMPI.map(campo => ({ id: 1, mese: 3, campo, valore: 1 })));
  assert.equal(st.sospese.size, 4);
  const op = rete.coda.at(-1);
  spedita(op);
  S.esitoConferma(op, {});
  assert.equal(st.sospese.size, 0, 'altrimenti i quattro passi ignorerebbero per sempre il server');
  // e un aggiornamento del server su quei passi torna a valere
  S.eventoRemoto({ tipo: 'cella', anno: 2026, id_service: 1, mese: 3, cella: cellaDi('1100', { rev: 9 }) });
  assert.equal(S.cella(1, 3).k, 0);
});

/* ----------------------------------------- pagina ricaricata, nota in volo -- */
test('pagina ricaricata con la coda piena: i passi restano in volo e la nota in coda si vede', () => {
  const s1 = svc();
  carica({ ruolo: 'admin', services: [s1], celle: { '1-3': cellaDi('0000', { rev: 4 }) } });
  S.spunta(1, 3, 'stampata', 1);
  S.salvaNota(1, 3, 'da richiamare');
  // la pagina nuova non ha niente in memoria: solo la coda sul disco
  st.sospese.clear();
  S.applica(bootstrapDi({ ruolo: 'admin', services: [s1], celle: { '1-3': cellaDi('0000', { rev: 4 }) } }));
  assert.equal(S.cella(1, 3).s, 1);
  assert.equal(S.cella(1, 3).nota, 'da richiamare', 'la nota ancora da spedire resta a schermo');
  assert.ok(st.sospese.has('1-3-stampata'), 'la cella resta segnata in attesa');
  // l'eco di un collega su un altro passo non cancella quello che e' ancora in coda
  S.eventoRemoto({ tipo: 'cella', anno: 2026, id_service: 1, mese: 3, operatore: 'Luca',
                   cella: cellaDi('0001', { rev: 5, by: 'Luca' }) });
  assert.equal(S.cella(1, 3).r, 1);
  assert.equal(S.cella(1, 3).s, 1);
  assert.equal(S.cella(1, 3).nota, 'da richiamare');
});

test('una nota in coda: l eco di un collega su un passo non la cancella dallo schermo', () => {
  carica({ ruolo: 'admin', services: [svc()], celle: { '1-3': cellaDi('0000', { rev: 4, nota: 'vecchia' }) } });
  S.salvaNota(1, 3, 'nuova');
  const op = rete.coda.at(-1);
  S.eventoRemoto({ tipo: 'cella', anno: 2026, id_service: 1, mese: 3, cella: cellaDi('1000', { rev: 5, nota: 'vecchia' }) });
  assert.equal(S.cella(1, 3).s, 1);
  assert.equal(S.cella(1, 3).nota, 'nuova');
  // arriva la risposta: da li' vale quella del server
  spedita(op);
  S.esitoConferma(op, { id_service: 1, mese: 3, cella: cellaDi('1000', { rev: 6, nota: 'nuova' }) });
  assert.equal(S.cella(1, 3).nota, 'nuova');
  assert.equal(st.sospese.size, 0);
});

test('un cambio di bootstrap su un altro anno non lascia in volo le celle dell anno di prima', () => {
  carica({ ruolo: 'admin', services: [svc()] });
  S.spunta(1, 3, 'stampata', 1);
  S.applica(bootstrapDi({ anno: 2027, ruolo: 'admin', services: [svc()] }));
  assert.equal(st.sospese.size, 0, 'nel 2027 la cella 1-3 non ha niente in coda');
  S.applica(bootstrapDi({ anno: 2026, ruolo: 'admin', services: [svc()] }));
  assert.ok(st.sospese.has('1-3-stampata'), 'tornando al 2026 la spunta in coda e di nuovo in volo');
});

/* -------------------------------------------------- rifiuti del server ---- */
test('spunta rifiutata dal server senza la cella: lo schermo torna com era', () => {
  carica({ ruolo: 'admin', services: [svc()], celle: { '1-3': cellaDi('0000', { rev: 4 }) } });
  S.spunta(1, 3, 'stampata', 1);
  const op = rete.coda.at(-1);
  spedita(op);
  S.esitoFallita(op, { errore: 'anno non valido' });
  assert.equal(S.cella(1, 3).s, 0);
  assert.equal(st.sospese.size, 0);
});

test('nota rifiutata dal server: torna la nota di prima', () => {
  carica({ ruolo: 'admin', services: [svc()], celle: { '1-3': cellaDi('0000', { rev: 4, nota: 'prima' }) } });
  S.salvaNota(1, 3, 'dopo');
  const op = rete.coda.at(-1);
  spedita(op);
  S.esitoFallita(op, { errore: 'nota troppo lunga' });
  assert.equal(S.cella(1, 3).nota, 'prima');
});

test('rifiuto del primo di due clic: resta il valore del secondo, ancora in coda', () => {
  carica({ ruolo: 'admin', services: [svc()], celle: { '1-3': cellaDi('0000', { rev: 4 }) } });
  S.spunta(1, 3, 'stampata', 1);
  S.spunta(1, 3, 'stampata', 0);
  const [op1] = rete.coda.slice();
  spedita(op1);
  S.esitoFallita(op1, { errore: 'x' });
  assert.equal(S.cella(1, 3).s, 0);
  assert.ok(st.sospese.has('1-3-stampata'));
});

/* ------------------------------------------------ cambio d'anno in volo ---- */
test('risposta arrivata dopo un cambio d anno: non scrive nelle celle dell anno che si guarda', () => {
  carica({ ruolo: 'admin', services: [svc()], celle: { '1-3': cellaDi('0000', { rev: 4 }) } });
  S.spunta(1, 3, 'stampata', 1);
  const op = rete.coda.at(-1);
  S.applica(bootstrapDi({ anno: 2027, ruolo: 'admin', services: [svc()] }));
  spedita(op);
  S.esitoConferma(op, { id_service: 1, mese: 3, cella: cellaDi('1000', { rev: 5 }) });
  assert.equal(S.cella(1, 3).s, 0, 'marzo 2027 non ha nessuna spunta');
  // ma e' l'anno prima di quello che si guarda: i passi ereditati la vedono
  assert.equal(S.cellaPrec(1, 3).s, 1);
  assert.equal(S.statoCella(1, 3).ered.stampata?.anno, 2026);
});

test('esiti di un blocco dopo un cambio d anno: niente nelle celle di quest anno', () => {
  carica({ ruolo: 'admin', services: [svc()] });
  S.spuntaMolte([{ id: 1, mese: 9, campo: 'stampata', valore: 1 }]);
  const op = rete.coda.at(-1);
  S.applica(bootstrapDi({ anno: 2030, ruolo: 'admin', services: [svc()] }));
  spedita(op);
  S.esitoConferma(op, { esiti: [{ esito: 'ok', id_service: 1, mese: 9, campo: 'stampata', cella: cellaDi('1000', { rev: 2 }) }] });
  assert.equal(S.cella(1, 9).s, 0);
  assert.equal(S.cellaPrec(1, 9).s, 0, 'il 2026 non e l anno prima del 2030');
});

/* ------------------------------------------------------------ Annulla ----- */
test('"Completa tutte" senza niente da fare non lascia un Annulla che disfa l azione di prima', () => {
  carica({ ruolo: 'admin', services: [svc()], celle: { '1-3': cellaDi('0000', { rev: 2 }) } });
  S.spunta(1, 3, 'ricambi', 1);
  // un collega intanto ha gia' fatto tutto: le voci calcolate prima non cambiano niente
  const n = S.spuntaMolte([{ id: 1, mese: 3, campo: 'ricambi', valore: 1 }], 'Completa tutte', 'massa');
  assert.equal(n, 0);
  const questa = st.ultimaAzione;              // quella che l'avviso si porta dietro
  assert.ok(S.annullaUltima(questa) <= 0);
  assert.equal(S.cella(1, 3).r, 1, 'la spunta di prima resta');
});

/* ------------------------------------------------------------- filtri ----- */
test('filtro di stato con i chiusi a schermo: le righe sono quelle che il bottone conta', () => {
  carica({ services: [
    servizio(1, { cli: 1, mesi: '001000000000', inizio: '2020-01-01', scad: '2030-12-31' }),   // in ritardo
    servizio(2, { cli: 1, stato: 'CHIUSO', mesi: '001000000000', inizio: '2020-01-01', scad: '2030-12-31' }),
  ] });
  st.filtri.mostraChiusi = true;
  st.filtri.stato = 'ritardo';
  const ids = S.gruppiFiltrati().flatMap(g => g.srvs.map(s => s.id));
  assert.deepEqual(ids, [1]);
  assert.equal(S.contaStato().ritardo, ids.length);
  st.filtri.stato = '';
  assert.deepEqual(S.gruppiFiltrati().flatMap(g => g.srvs.map(s => s.id)), [1, 2], 'senza stato i chiusi si vedono');
});

test('filtro per provincia e chiusi nascosti', () => {
  carica({ services: [servizio(1, { prov: 'TV' }), servizio(2, { prov: 'VE' }),
    servizio(3, { prov: 'TV', stato: 'CHIUSO' })] });
  st.filtri.prov = 'TV';
  assert.deepEqual(S.gruppiFiltrati().flatMap(g => g.srvs.map(s => s.id)), [1]);
  assert.deepEqual(S.elencoProv(), ['TV', 'VE']);
});

test('caricaFiltri: la v1 (due booleani) diventa lo stato, la ricerca non si ricorda', () => {
  localStorage.setItem('cs.filtri.v1', JSON.stringify({ q: 'umberto', prov: 'TV', soloIncomplete: true, tipo: 'GAS' }));
  S.caricaFiltri();
  assert.equal(st.filtri.q, '');
  assert.equal(st.filtri.prov, 'TV');
  assert.equal(st.filtri.stato, 'incomplete');
  localStorage.setItem('cs.filtri.v1', JSON.stringify({ stato: 'strano', soloRitardo: true }));
  S.caricaFiltri();
  assert.equal(st.filtri.stato, 'ritardo');
  localStorage.setItem('cs.filtri.v1', '{rotto');
  S.caricaFiltri();
  assert.equal(st.filtri.stato, '');
  st.filtri.stato = 'complete';
  S.salvaFiltri();
  S.caricaFiltri();
  assert.equal(st.filtri.stato, 'complete');
  localStorage.removeItem('cs.filtri.v1');
});

test('filtraStato: un secondo clic sullo stesso stato lo toglie', () => {
  carica({ services: [svc()] });
  S.filtraStato('ritardo', true);
  assert.equal(st.filtri.stato, 'ritardo');
  S.filtraStato('ritardo', true);
  assert.equal(st.filtri.stato, '');
  localStorage.removeItem('cs.filtri.v1');
});

/* ---------------------------------------------- mese, stato, ritardi ------ */
test('lavoroDelMese: solo i siti aperti con quel mese spuntabile', () => {
  carica({ services: [
    servizio(1, { mesi: '001000000000', inizio: '2020-01-01', scad: '2030-12-31' }),
    servizio(2, { mesi: '000100000000', inizio: '2020-01-01', scad: '2030-12-31' }),
    servizio(3, { stato: 'CHIUSO', mesi: '001000000000' }),
    servizio(4, { mesi: '001000000000', inizio: '2026-06-01', scad: '2030-12-31' }),   // non ancora attivo
  ] });
  assert.deepEqual(S.lavoroDelMese(3).map(v => v.s.id), [1]);
  assert.deepEqual(S.lavoroDelMese(2), []);
});

test('statoMappatura: iniziata, chiuso, e la vista Mese guarda il solo mese', () => {
  carica({ services: [servizio(1, { mesi: '000000000011', inizio: '2020-01-01', scad: '2030-12-31' }),
    servizio(2, { stato: 'CHIUSO' })], celle: { '1-11': cellaDi('1100') } });
  assert.equal(S.statoMappatura(st.perServ.get(1)), 'corso');
  assert.equal(S.statoMappatura(st.perServ.get(2)), 'chiuso');
  st.vista = 'mese'; st.mese = 12;
  // dicembre eredita i due passi di novembre: e' "da fare", non "complete"
  assert.deepEqual(S.contaStato(), { tutte: 1, incomplete: 1, ritardo: 0, complete: 0 });
  st.vista = 'anno';
});

test('gennaio e dicembre: la scadenza a dicembre di un anno passato e in ritardo, quella a gennaio di quest anno pure', () => {
  carica({ oggi: '2026-02-03', services: [servizio(1, { mesi: '100000000000', inizio: '2020-01-01', scad: '2030-12-31' })] });
  assert.equal(S.statoCella(1, 1).ritardo, true);
  carica({ oggi: '2026-01-31', services: [servizio(1, { mesi: '100000000000', inizio: '2020-01-01', scad: '2030-12-31' })] });
  assert.equal(S.statoCella(1, 1).ritardo, false, 'il mese in corso non e ancora in ritardo');
});

/* ------------------------------------------------------- il tempo --------- */
test('etaAnagrafica: oggi, ieri, vecchia oltre 26 ore, niente se non c e', () => {
  const adesso = new Date(2026, 8, 23, 10, 0);
  assert.equal(S.etaAnagrafica(null, adesso), null);
  assert.equal(S.etaAnagrafica('rotta', adesso), null);
  const oggi = S.etaAnagrafica('2026-09-23 08:15:00', adesso);
  assert.match(oggi.testo, /oggi 08:15/);
  assert.equal(oggi.vecchia, false);
  const ieri = S.etaAnagrafica('2026-09-22T09:00:00', adesso);
  assert.match(ieri.quando, /^ieri/);
  assert.equal(ieri.vecchia, false);
  const vecchia = S.etaAnagrafica('2026-09-21T07:00:00', adesso);
  assert.equal(vecchia.vecchia, true);
  assert.equal(vecchia.giorni, 2);
  // a cavallo del cambio dell'ora (25 ottobre): i giorni restano giorni
  assert.equal(S.etaAnagrafica('2026-10-24T12:00:00', new Date(2026, 9, 26, 12, 0)).giorni, 2);
});

test('giornoCambiato e oggiLocale', () => {
  carica({ oggi: '2026-09-23' });
  assert.equal(S.oggiLocale(new Date(2026, 0, 5)), '2026-01-05');
  assert.equal(S.giornoCambiato(new Date(2026, 8, 23, 23, 59)), false);
  assert.equal(S.giornoCambiato(new Date(2026, 8, 24, 0, 1)), true);
  assert.equal(S.giornoCambiato(new Date(2027, 0, 1)), true);
});

test('titoloScheda dice la vista, il mese e l anno', () => {
  carica({});
  st.vista = 'mese'; st.mese = 10;
  assert.equal(S.titoloScheda(), 'Mese di ottobre 2026 · Crono Mappature');
  st.vista = 'stat';
  assert.equal(S.titoloScheda(), 'Statistiche 2026 · Crono Mappature');
  st.vista = 'anno';
  assert.equal(S.titoloScheda(), 'Anno 2026 · Crono Mappature');
});

/* ------------------------------------------------ fuochi e presenze ------- */
test('fuochi: chi ha aperto cosa, io escluso, chi esce sparisce', () => {
  carica({});
  const eventi = [];
  const via = S.on('fuoco', e => eventi.push(e));
  S.aggiornaPresenze([{ nome: 'Luca', dove: '2026-09 @1-3' }, { nome: 'Mario', dove: '2026-09 @1-3' }]);
  assert.deepEqual(S.fuochiSu(1, 3), ['Luca']);
  S.aggiornaPresenze([{ nome: 'Anna', dove: '2026-09' }]);
  assert.deepEqual(S.fuochiSu(1, 3), []);
  via();
  assert.deepEqual(eventi.map(e => `${e.nome}:${e.prima}>${e.dopo}`), ['Luca:>1-3', 'Luca:1-3>']);
});

/* ----------------------------------------------------- conflitti ---------- */
test('conflitto sulla nota: l avviso riporta le due frasi, lunghe tagliate', () => {
  carica({ services: [svc()], celle: { '1-3': cellaDi('0000', { rev: 4, nota: 'base' }) } });
  S.salvaNota(1, 3, 'la mia nota');
  const op = rete.coda.at(-1);
  spedita(op);
  const lunga = 'x'.repeat(200);
  S.esitoConflitto(op, { id_service: 1, mese: 3, cella: cellaDi('0000', { rev: 5, nota: lunga, by: 'Anna' }) });
  assert.equal(S.cella(1, 3).nota, lunga, 'vince il server');
  const [t] = avvisi();
  assert.match(t, /Anna ne ha scritta un'altra/);
  assert.match(t, /x{88}…/);
  assert.match(t, /la mia nota/);
  assert.equal(st.sospese.size, 0);
});

test('conflitto su un passo: si tiene la sua e lo si dice', () => {
  carica({ ruolo: 'admin', services: [svc()], celle: { '1-3': cellaDi('0000', { rev: 4 }) } });
  S.spunta(1, 3, 'stampata', 1);
  const op = rete.coda.at(-1);
  spedita(op);
  S.esitoConflitto(op, { id_service: 1, mese: 3, cella: cellaDi('0000', { rev: 7, by: 'Anna' }) });
  assert.equal(S.cella(1, 3).s, 0);
  assert.match(avvisi()[0], /Anna l'ha messa a "da fare" mentre tu la mettevi a "fatta"/);
});

/* ---------------------------------------------- proposte e ripristino ----- */
test('proposte: le piu recenti prima, solo i passi da approvare', () => {
  carica({ services: [svc()], celle: {
    '1-3': cellaDi('0020', { at: '2026-05-01T10:00:00', by: 'Luca' }),
    '1-9': cellaDi('2002', { at: '2026-09-01T10:00:00', by: 'Anna' }),
  } });
  assert.deepEqual(S.proposte().map(p => `${p.mese}:${p.campo}:${p.by}`), ['9:ricambi:Anna', '3:corretta:Luca']);
  assert.equal(S.notaProposta(S.cella(1, 3), 'corretta'), 'Rapportino: proposta da Luca, in attesa di chi approva');
  assert.equal(S.notaProposta(S.cella(1, 3), 'stampata'), '');
});

test('ripristina: le celle tornano, anche quelle dell anno prima; un operatore non puo', async () => {
  carica({ ruolo: 'admin', services: [svc()], celle: { '1-3': cellaDi('1111', { rev: 5 }) } });
  rispondi = () => ({ dati: { n: 2, celle: [
    { anno: 2026, id_service: 1, mese: 3, cella: cellaDi('0000', { rev: 6 }) },
    { anno: 2025, id_service: 1, mese: 12, cella: cellaDi('1000', { rev: 3 }) },
  ] } });
  const n = await S.ripristina({ op_id: 'abc:0', campo: 'stampata', da: 1, a: 0 });
  assert.equal(n, 2);
  assert.equal(S.cella(1, 3).s, 0);
  assert.equal(S.cellaPrec(1, 12).s, 1);
  assert.equal(JSON.parse(chiamate[0].opz.body).op_id, 'abc');
  carica({ ruolo: 'tecnico', services: [svc()] });
  assert.equal(await S.ripristina({ op_id: 'abc:0', campo: 'stampata', da: 1 }), -1);
});

test('eventoRemoto: un documento porta la spunta di quest anno, l anno prima aggiorna i passi ereditati', () => {
  carica({ services: [svc()] });
  const doc = [];
  const via = S.on('documento-remoto', e => doc.push(e));
  S.eventoRemoto({ tipo: 'documento', anno: 2026, id_service: 1, mese: 9, cella: cellaDi('1000', { rev: 2 }) });
  assert.equal(S.cella(1, 9).s, 1);
  assert.equal(doc.length, 1);
  via();
  S.eventoRemoto({ tipo: 'cella', anno: 2025, id_service: 1, mese: 11, cella: cellaDi('0100', { rev: 2 }) });
  assert.equal(S.statoCella(1, 3).ered.controllata?.anno, 2025);
});

test('conflitto di un anno che non si guarda piu: lo si dice, senza scrivere nell anno a schermo', () => {
  carica({ services: [svc()], celle: { '1-3': cellaDi('0000', { rev: 4, nota: 'base' }) } });
  S.salvaNota(1, 3, 'mia');
  const op = rete.coda.at(-1);
  S.applica(bootstrapDi({ anno: 2030, services: [svc()] }));
  spedita(op);
  S.esitoConflitto(op, { id_service: 1, mese: 3, cella: cellaDi('0000', { rev: 5, nota: 'sua', by: 'Anna' }) });
  assert.equal(S.cella(1, 3).nota, '', 'marzo 2030 non si tocca');
  const [t] = avvisi();
  assert.match(t, /Nota \(2026\): Anna/);
  assert.equal(rete.coda.length, 0, 'e niente parte da solo');
});

test('un blocco in coda torna in volo dopo un nuovo bootstrap', () => {
  const s1 = svc();
  carica({ ruolo: 'admin', services: [s1] });
  S.spuntaMolte([{ id: 1, mese: 3, campo: 'stampata', valore: 1 }, { id: 1, mese: 3, campo: 'ricambi', valore: 1 }]);
  st.sospese.clear();
  S.applica(bootstrapDi({ ruolo: 'admin', services: [s1] }));
  assert.deepEqual([...st.sospese].sort(), ['1-3-ricambi', '1-3-stampata']);
  assert.equal(S.cella(1, 3).r, 1);
});

test('lo stesso passo in due blocchi: il rifiuto del primo non disfa il secondo ancora in coda', () => {
  carica({ ruolo: 'admin', services: [svc()], celle: { '1-3': cellaDi('0000', { rev: 1 }) } });
  S.spuntaMolte([{ id: 1, mese: 3, campo: 'stampata', valore: 1 }]);
  S.spuntaMolte([{ id: 1, mese: 3, campo: 'controllata', valore: 1 }, { id: 1, mese: 3, campo: 'stampata', valore: 0 }]);
  const [b1] = rete.coda.slice();
  spedita(b1);
  S.esitoFallita(b1, { errore: 'x' });
  assert.equal(S.cella(1, 3).s, 0, 'vale il secondo blocco');
  assert.equal(S.cella(1, 3).c, 1);
  assert.ok(st.sospese.has('1-3-stampata'));
});
