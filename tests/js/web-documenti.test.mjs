/* web-documenti.test.mjs - i PDF lato tracker (web/js/documenti.js,
   #ANCHOR: documenti): il modello in memoria, i fascicoli, i chip accanto al
   nome del sito (HTML scritto a mano: niente deve uscire dagli attributi),
   il caricamento (vuoto, enorme, non un file), l'eliminazione, la rilettura
   con quello che arriva mentre e' in volo (BUG-20) e l'annuncio alle altre
   schede del browser. In locale (nuvola spenta): la rete e' un fetch finto. */
import { avvisi, servizio, bootstrapDi } from './web-ambiente.mjs';
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import * as S from '../../web/js/stato.js';
import * as D from '../../web/js/documenti.js';

const { st } = S;

/* ------------------------------------------------------------ la rete --- */
let chiamate = [], rispondi = null;
globalThis.fetch = async (url, opz = {}) => {
  chiamate.push({ url: String(url), opz, body: opz.body ? JSON.parse(opz.body) : null });
  if (!rispondi) throw new TypeError('rete assente (test)');
  const r = await rispondi(String(url), opz);
  const { stato = 200, dati = {} } = r || {};
  return { ok: stato >= 200 && stato < 300, status: stato, text: async () => JSON.stringify(dati) };
};

/* le altre schede del browser: un canale finto che tiene i messaggi */
const annunci = [];
let canaliAperti = 0;
globalThis.BroadcastChannel = class {
  constructor(nome) { this.nome = nome; canaliAperti++; }
  postMessage(m) { annunci.push({ nome: this.nome, m }); }
  close() { canaliAperti--; }
};

/* FileReader non c'e' in Node: quanto basta a readAsDataURL */
globalThis.FileReader = class {
  readAsDataURL(b) {
    b.arrayBuffer().then(buf => {
      this.result = 'data:application/pdf;base64,' + Buffer.from(buf).toString('base64');
      this.onload();
    }, e => this.onerror(e));
  }
};

const doc = (id, id_service, extra = {}) => ({
  id, id_service, anno: 2026, nome: `Documento ${id}.pdf`, pagine: 4, bytes: 1000,
  creato_il: '2026-09-0' + (extra.giorno || 1) + 'T10:00:00', creato_da: 'Mario', tipo: 'schede', ...extra,
});

function carica(documenti = []) {
  S.applica(bootstrapDi({ services: [servizio(1), servizio(2)] }));
  D.applicaDocumenti(documenti);
  avvisi();
}
beforeEach(() => { chiamate = []; rispondi = null; annunci.length = 0; canaliAperti = 0; carica(); });

/* ------------------------------------------------------------- modello --- */
test('il modello: per sito, dal piu’ recente; un documento gia’ noto non si duplica', () => {
  carica([doc('a', 1, { giorno: 1 }), doc('b', 1, { giorno: 3 }), doc('c', 2)]);
  assert.deepEqual(D.documentiDi(1).map(d => d.id), ['b', 'a']);
  assert.deepEqual(D.documentiDi(99), []);
  D.eventoDocumento({ documento: doc('a', 1, { giorno: 1 }) });
  assert.equal(D.documentiDi(1).length, 2);
  D.eventoDocumento({ eliminato: 'a', id_service: 1 });
  assert.deepEqual(D.documentiDi(1).map(d => d.id), ['b']);
  D.eventoDocumento({ eliminato: 'b', id_service: 1 });
  assert.equal(st.documenti.has(1), false);
});

test('fascicoli: un documento in N parti conta uno, con pagine e peso di tutte', () => {
  const g = 'g1';
  carica([
    doc('f2', 1, { gruppo: g, fascicolo: 2, fascicoli: 2, pagine: 38, bytes: 200, nome: 'ACME - schede - 2026 - fascicolo 2 di 2.pdf' }),
    doc('f1', 1, { gruppo: g, fascicolo: 1, fascicoli: 2, pagine: 40, bytes: 300, nome: 'ACME - schede - 2026 - fascicolo 1 di 2.pdf' }),
    doc('r', 1, { tipo: 'registro', pagine: 12 }),
  ]);
  const gr = D.gruppiDocumenti(1);
  assert.equal(gr.length, 2);
  const f = gr.find(x => x.tipo === 'schede');
  assert.equal(f.capo.id, 'f1');
  assert.equal(f.fascicoli, 2);
  assert.equal(f.pagine, 78);
  assert.equal(f.bytes, 500);
  assert.equal(D.titoloDocumento(f.capo), 'ACME - schede - 2026');
  assert.equal(D.titoloDocumento({ nome: null }), '');
  assert.equal(D.titoloDocumento({ nome: 'Solo.PDF' }), 'Solo');
});

test('riepilogo per anno, e un archivio vuoto', () => {
  assert.deepEqual(D.riepilogoDocumenti(), { anni: [], n: 0, bytes: 0 });
  carica([doc('a', 1, { anno: 2025, bytes: 10 }), doc('b', 2, { bytes: 5 }), doc('c', 2, { bytes: 7 })]);
  const r = D.riepilogoDocumenti();
  assert.deepEqual(r.anni.map(a => [a.anno, a.n, a.bytes]), [[2026, 2, 12], [2025, 1, 10]]);
  assert.equal(r.n, 3);
  assert.equal(r.bytes, 22);
});

/* ----------------------------------------------------------------- chip --- */
test('chip: niente documenti = contenitore nascosto; uno per tipo, col conto e l’anno', () => {
  assert.match(D.htmlChipDocumento(1), /class="doc-chips vuoto" data-doc-srv="1" hidden/);
  carica([doc('a', 1), doc('b', 1, { giorno: 2 }), doc('r', 1, { tipo: 'registro', anno: 2025 })]);
  const h = D.htmlChipDocumento(1);
  assert.equal((h.match(/<button /g) || []).length, 2);
  assert.match(h, /t-schede"[^>]*data-doc="b"/);
  assert.match(h, /<i>2<\/i>/);
  assert.match(h, /t-registro altro-anno/);
  assert.match(h, /del 2025/);
});

test('chip: nomi, autori e numeri scritti da altri non escono dall’attributo', () => {
  const cattivo = '"><img src=x onerror=alert(1)>';
  carica([doc(cattivo, 1, { nome: cattivo + '.pdf', creato_da: cattivo, pagine: cattivo, bytes: cattivo,
    anno: cattivo })]);
  const h = D.htmlChipDocumento(1);
  assert.doesNotMatch(h, /<img/);
  assert.doesNotMatch(h, /onerror=alert\(1\)>/);
  // ogni attributo si chiude dove deve: le virgolette sono tutte a coppie dentro i tag
  for (const tag of h.match(/<[^>]+>/g)) assert.equal((tag.match(/"/g) || []).length % 2, 0, tag);
  // e i conti restano numeri
  const g = D.gruppiDocumenti(1)[0];
  assert.equal(g.pagine, 0);
  assert.equal(g.bytes, 0);
});

/* ------------------------------------------------------------ consegna --- */
test('consegna: un PDF vuoto non parte, e non tocca la rete', async () => {
  rispondi = () => ({ dati: { documento: doc('n', 1) } });
  await assert.rejects(D.salvaDocumento({ id_service: 1, anno: 2026, nome: 'x.pdf', pdf: new Blob([]) }),
    /vuoto/i);
  await assert.rejects(D.salvaDocumento({ id_service: 1, anno: 2026, nome: 'x.pdf', pdf: null }),
    /PDF/);
  assert.equal(chiamate.length, 0);
});

test('consegna: oltre i 200 MB del server si dice subito, prima di caricare niente', async () => {
  rispondi = () => ({ dati: { documento: doc('n', 1) } });
  const enorme = { size: D.MAX_PDF + 1, type: 'application/pdf', arrayBuffer: async () => new ArrayBuffer(0) };
  await assert.rejects(D.salvaDocumento({ id_service: 1, anno: 2026, nome: 'x.pdf', pdf: enorme }),
    /200 MB/);
  assert.equal(chiamate.length, 0);
  assert.equal(D.MAX_PDF, 200 * 1024 * 1024);
});

test('consegna in locale: il PDF viaggia in base64, il tipo e’ uno dei due, le altre schede lo sanno', async () => {
  rispondi = () => ({ dati: { documento: doc('nuovo', 1), mese: 3 } });
  const pdf = new Blob(['%PDF-1.4 prova']);
  const r = await D.salvaDocumento({ id_service: 1, anno: 2026, mese: 3, nome: 'x.pdf', pdf, pagine: 1, tipo: 'strano' });
  assert.equal(r.mese, 3);
  assert.equal(chiamate.length, 1);
  const b = chiamate[0].body;
  assert.equal(chiamate[0].url, '/api/documento');
  assert.equal(Buffer.from(b.pdf, 'base64').toString(), '%PDF-1.4 prova');
  assert.equal(b.tipo, 'schede');
  assert.equal(annunci.length, 1);
  assert.equal(annunci[0].nome, 'crono-documenti');
  assert.equal(annunci[0].m.documento.id, 'nuovo');
});

test('consegna rifiutata dal server: l’errore del server arriva a chi salva', async () => {
  rispondi = () => ({ stato: 400, dati: { errore: 'il file non e’ un PDF' } });
  await assert.rejects(D.salvaDocumento({ id_service: 1, anno: 2026, nome: 'x.pdf', pdf: new Blob(['x']) }),
    /non e’ un PDF/);
  assert.equal(annunci.length, 0);
});

test('l’annuncio alle altre schede non lascia canali aperti', () => {
  D.annunciaAltreSchede({ tipo: 'documento', id_service: 1 });
  D.annunciaAltreSchede({ tipo: 'documento', id_service: 2 });
  assert.equal(annunci.length, 2);
  assert.equal(canaliAperti, 0);
});

/* ---------------------------------------------------------- eliminazione -- */
test('elimina: prima la riga sul server, poi il modello; un rifiuto lascia tutto com’era', async () => {
  carica([doc('a', 1), doc('b', 1, { giorno: 2 })]);
  rispondi = () => ({ stato: 403, dati: { errore: 'non puoi' } });
  await assert.rejects(D.eliminaDocumento(D.documentiDi(1)[1]), /non puoi/);
  assert.equal(D.documentiDi(1).length, 2);
  rispondi = () => ({ dati: { ok: true } });
  await D.eliminaDocumento(D.documentiDi(1).find(d => d.id === 'a'));
  assert.deepEqual(D.documentiDi(1).map(d => d.id), ['b']);
  assert.equal(chiamate.at(-1).url, '/api/documento_elimina');
  assert.equal(chiamate.at(-1).body.id, 'a');
  assert.equal(annunci.at(-1).m.eliminato, 'a');
});

test('elimina in blocco: il modello perde quello che il server dice di aver tolto', async () => {
  carica([doc('a', 1), doc('b', 1), doc('c', 2)]);
  rispondi = () => ({ dati: { eliminati: [{ id: 'a', id_service: 1 }, { id: 'b', id_service: 1 }], bytes: 2000 } });
  const r = await D.eliminaDocumenti({ id_service: 1 });
  assert.deepEqual(r, { n: 2, bytes: 2000 });
  assert.equal(st.documenti.has(1), false);
  assert.equal(D.documentiDi(2).length, 1);
  // l'eco da un'altra scheda con una lista vuota o assente non rompe niente
  D.eventoDocumentiEliminati({});
  D.eventoDocumentiEliminati({ eliminati: [] });
  assert.equal(D.documentiDi(2).length, 1);
});

test('eliminazione morbida: il cestino si riconosce da tutte e due le risposte', () => {
  assert.equal(D.eliminazioneMorbida({ cestino: true }), true);
  assert.equal(D.eliminazioneMorbida({ eliminato_il: '2026-09-23' }), true);
  assert.equal(D.eliminazioneMorbida({ ok: true }), false);
  assert.equal(D.eliminazioneMorbida(null), false);
});

/* -------------------------------------------------- rilettura (BUG-20) --- */
test('rilettura: un PDF arrivato (o tolto) mentre la domanda era in volo non sparisce (non torna)', async () => {
  carica([doc('vecchio', 1), doc('tolto', 2)]);
  let sblocca;
  rispondi = () => new Promise(ok => { sblocca = () => ok({ dati: { documenti: [doc('vecchio', 1), doc('tolto', 2)] } }); });
  const p = D.ricaricaDocumenti();
  await new Promise(r => setImmediate(r));
  D.eventoDocumento({ documento: doc('appena', 1, { giorno: 5 }) });
  D.eventoDocumento({ eliminato: 'tolto', id_service: 2 });
  sblocca();
  await p;
  assert.deepEqual(D.documentiDi(1).map(d => d.id).sort(), ['appena', 'vecchio']);
  assert.deepEqual(D.documentiDi(2), []);
});

test('rilettura senza rete o con una risposta storta: resta l’elenco che c’e’', async () => {
  carica([doc('a', 1)]);
  await D.ricaricaDocumenti();                          // fetch che lancia
  assert.equal(D.documentiDi(1).length, 1);
  rispondi = () => ({ dati: { documenti: 'non una lista' } });
  await D.ricaricaDocumenti();
  assert.equal(D.documentiDi(1).length, 1);
});

/* ------------------------------------------------------------- avvisi ---- */
test('un documento in fascicoli si annuncia una volta sola, col nome del sito', () => {
  D.eventoDocumento({ operatore: 'Anna', id_service: 1, documento: doc('f1', 1, { fascicolo: 1, fascicoli: 3 }) });
  D.eventoDocumento({ operatore: 'Anna', id_service: 1, documento: doc('f2', 1, { fascicolo: 2, fascicoli: 3 }) });
  D.eventoDocumento({ operatore: 'Anna', id_service: 2, documento: doc('r', 2, { tipo: 'registro' }) });
  assert.deepEqual(avvisi(), [
    'Anna ha stampato le schede di Sito 1 (3 fascicoli).',
    'Anna ha generato il registro componenti di Sito 2.',
  ]);
});

/* ------------------------------------------------------------ indirizzi -- */
test('l’indirizzo del generatore porta il sito, codificato; un tipo sconosciuto va alle schede', () => {
  const s = { ...st.perServ.get(1), dest: 'Via Roma & C. "nord"', loc: 'Treviso' };
  const u = new URL(D.urlGeneratore(s, 'registro'), 'http://x');
  assert.equal(u.pathname, '/registro/');
  assert.equal(u.searchParams.get('service'), '1');
  assert.equal(u.searchParams.get('sito'), 'Via Roma & C. "nord"');
  assert.equal(u.searchParams.get('anno'), '2026');
  assert.equal(new URL(D.urlGeneratore(null, 'boh'), 'http://x').pathname, '/schede/');
  assert.equal(new URL(D.urlGeneratore(null), 'http://x').search, '?anno=2026');
});

test('in locale il PDF si apre dal server, con l’id codificato', async () => {
  assert.equal(await D.urlDocumento({ id: 'a b/c' }), '/api/documento?id=a%20b%2Fc');
});
