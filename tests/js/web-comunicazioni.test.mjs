/* web-comunicazioni.test.mjs - le Comunicazioni dell'amministrazione
   (web/js/vrs-comunicazioni.js, #ANCHOR: comunicazioni in js/famiglia.js).
   Niente Supabase: il modulo riceve carica/conferma/ascolta da chi lo monta, e
   qui sono risposte finte. Il DOM e' quello giocattolo di web-ambiente.mjs, a
   cui si aggiungono gli ascoltatori (clic, change, tasti) per poter spuntare
   «Ho letto» e premere Esc. */
import { avvisi } from './web-ambiente.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizza, daLeggere, daConfermare, funzioneAssente, quando, etichettaTasto, numeroTasto,
  testoLungo, modificata, montaComunicazioni,
} from '../../web/js/vrs-comunicazioni.js';

/* ---- il DOM giocattolo, con gli ascoltatori ---- */
const Nodo = Object.getPrototypeOf(document.createElement('div'));
Nodo.addEventListener = function (tipo, fn) { ((this._asc ??= {})[tipo] ??= []).push(fn); };
Nodo.removeEventListener = function (tipo, fn) { if (this._asc?.[tipo]) this._asc[tipo] = this._asc[tipo].filter(f => f !== fn); };
Nodo.lancia = function (tipo, e = {}) { for (const fn of this._asc?.[tipo] || []) fn({ target: this, preventDefault() { }, stopPropagation() { }, ...e }); };
Nodo.replaceChildren = function (...k) { for (const f of this.figli) f.padre = null; this.figli = []; this.append(...k); };
const ascDoc = {};
document.addEventListener = (tipo, fn) => { (ascDoc[tipo] ??= []).push(fn); };
document.removeEventListener = (tipo, fn) => { if (ascDoc[tipo]) ascDoc[tipo] = ascDoc[tipo].filter(f => f !== fn); };
const tasto = key => { for (const fn of [...(ascDoc.keydown || [])]) fn({ key, shiftKey: false, preventDefault() { }, stopPropagation() { } }); };

const tutti = n => [n, ...n.figli.flatMap(tutti)];
const trova = (n, pred) => tutti(n).find(pred) || null;
const conClasse = (n, c) => trova(n, x => x.classList?.contains(c));
const aspetta = (ms = 0) => new Promise(r => setTimeout(r, ms));

function riga(id, opz = {}) {
  return {
    id, titolo: opz.titolo ?? 'Comunicazione ' + id, testo: opz.testo ?? 'Testo di ' + id,
    priorita: opz.priorita ?? 'normale', consegna: opz.consegna ?? 'silenziosa',
    pubblicata_il: opz.pubblicata_il ?? '2026-09-24T08:00:00+00:00', aggiornata_il: opz.aggiornata_il ?? null,
    mittente: opz.mittente ?? 'Laura Test', letta_il: null, confermata_il: opz.confermata_il ?? null, notifica_id: 1,
  };
}

/** Monta in un posto nuovo con risposte finte; ritorna il modulo e i registri delle chiamate. */
function monta({ righe = [], carica = null, conferma = null, ascolta = true } = {}) {
  const posto = document.createElement('span');
  document.body.append(posto);
  const reg = { letture: 0, conferme: [], ascolti: 0, avvisa: null, staccato: false };
  const com = montaComunicazioni(posto, {
    ritardo: 5,
    carica: carica || (async () => { reg.letture++; return { ok: true, stato: 200, dati: righe }; }),
    conferma: conferma || (async id => { reg.conferme.push(id); return { ok: true, stato: 200, dati: '2026-09-24T10:00:00+00:00' }; }),
    ascolta: ascolta ? fn => { reg.ascolti++; reg.avvisa = fn; return () => { reg.staccato = true; }; } : null,
  });
  return { com, reg, posto };
}
const velo = () => document.body.figli.find(n => n.classList.contains('vrs-com-velo')) || null;
const spunta = radice => {
  const i = trova(radice, x => x.tagName === 'INPUT' && !x.disabled);
  assert.ok(i, 'manca la casella «Ho letto» da spuntare');
  i.checked = true;
  i.lancia('change');
};

/* ------------------------------------------------------------- i dati --- */

test('normalizza: solo righe con id e titolo, una volta sola, valori di ripiego', () => {
  const l = normalizza([
    riga('a', { priorita: 'alta', consegna: 'popup' }),
    riga('a'),                                   // doppia
    { id: 'b', titolo: '  ' },                   // senza titolo
    null, 7, 'x',
    { id: 'c', titolo: 'Strana', priorita: 'urgentissima', consegna: 'boh', pubblicata_il: 'ieri', mittente: null },
  ]);
  assert.deepEqual(l.map(c => c.id), ['a', 'c']);
  assert.equal(l[0].priorita, 'alta');
  assert.equal(l[0].consegna, 'popup');
  assert.equal(l[1].priorita, 'normale');
  assert.equal(l[1].consegna, 'silenziosa');
  assert.equal(l[1].pubblicata_il, null);
  assert.equal(l[1].mittente, '');
  assert.deepEqual(normalizza(null), []);
  assert.deepEqual(normalizza({ errore: 'x' }), []);
});

test('da leggere e da confermare: prima le alte, poi dalla piu\' vecchia', () => {
  const l = normalizza([
    riga('nuova', { consegna: 'popup', pubblicata_il: '2026-09-24T09:00:00Z' }),
    riga('vecchia', { consegna: 'popup', pubblicata_il: '2026-09-20T09:00:00Z' }),
    riga('alta', { consegna: 'popup', priorita: 'alta', pubblicata_il: '2026-09-24T10:00:00Z' }),
    riga('muta', { consegna: 'silenziosa' }),
    riga('fatta', { consegna: 'popup', confermata_il: '2026-09-24T11:00:00Z' }),
  ]);
  assert.deepEqual(daConfermare(l).map(c => c.id), ['alta', 'vecchia', 'nuova']);
  assert.equal(daLeggere(l), 4);
});

test('funzione assente: 404, PGRST202, 42883; la rete giu\' o un 500 no', () => {
  assert.equal(funzioneAssente({ ok: false, stato: 404, dati: { errore: 'Could not find the function public.pl_comunicazioni_mie' } }), true);
  assert.equal(funzioneAssente({ ok: false, stato: 400, dati: { errore: 'function public.pl_comunicazioni_mie(integer) does not exist' } }), true);
  assert.equal(funzioneAssente({ ok: false, stato: 400, dati: { code: '42883' } }), true);
  assert.equal(funzioneAssente({ ok: false, stato: 500, dati: { errore: 'errore 500' } }), false);
  assert.equal(funzioneAssente({ ok: false, stato: 401, dati: { errore: 'sessione scaduta' } }), false);
  assert.equal(funzioneAssente(null), false);
  assert.equal(funzioneAssente({ ok: true, stato: 200, dati: [] }), false);
});

test('date in italiano, nome accessibile e numero del tasto, testi lunghi', () => {
  assert.match(quando('2026-09-24T10:32:00'), /24 settembre 2026/);
  assert.match(quando('2026-09-24T10:32:00'), /10:32/);
  assert.equal(quando(null), '');
  assert.equal(quando('non una data'), '');
  assert.equal(etichettaTasto(0), 'Comunicazioni: nessuna da leggere');
  assert.equal(etichettaTasto(1), 'Comunicazioni: una da leggere');
  assert.equal(etichettaTasto(3), 'Comunicazioni: 3 da leggere');
  assert.equal(numeroTasto(4), '4');
  assert.equal(numeroTasto(12), '9+');
  assert.equal(testoLungo('breve'), false);
  assert.equal(testoLungo('x'.repeat(400)), true);
  assert.equal(testoLungo('a\nb\nc\nd\ne'), true);
  const [c] = normalizza([riga('m', { pubblicata_il: '2026-09-24T08:00:00Z', aggiornata_il: '2026-09-24T09:00:00Z' })]);
  assert.equal(modificata(c), true);
});

/* ------------------------------------------------------------ il tasto --- */

test('funzioni non ancora sul database: il tasto non compare, nessun ascolto, nessun errore', async () => {
  const { com, reg } = monta({ carica: async () => ({ ok: false, stato: 404, dati: { errore: 'Could not find the function' } }) });
  await aspetta(20);
  assert.equal(com.bottone.hidden, true);
  assert.equal(com.stato().stato, 'assente');
  assert.equal(reg.ascolti, 0);
  assert.equal(velo(), null);
  assert.deepEqual(avvisi(), []);
  com.smonta();
});

test('rete giu\' alla prima lettura: il tasto resta nascosto, senza eccezioni', async () => {
  const { com } = monta({ carica: async () => { throw new TypeError('Failed to fetch'); } });
  await aspetta(20);
  assert.equal(com.bottone.hidden, true);
  assert.equal(com.stato().stato, 'attesa');
  com.smonta();
});

test('con le comunicazioni: tasto visibile, numero e nome accessibile, tempo reale acceso', async () => {
  const { com, reg } = monta({ righe: [riga('a'), riga('b'), riga('c', { confermata_il: '2026-09-24T09:00:00Z' })] });
  await aspetta(20);
  assert.equal(com.bottone.hidden, false);
  assert.equal(com.bottone.getAttribute('aria-label'), 'Comunicazioni: 2 da leggere');
  assert.equal(com.bottone.getAttribute('data-nuove'), 'si');
  assert.equal(conClasse(com.bottone, 'vrs-com-n').textContent, '2');
  assert.equal(reg.ascolti, 1);
  assert.equal(velo(), null, 'le silenziose non aprono il popup');
  com.smonta();
  assert.equal(reg.staccato, true);
});

test('tempo reale: un cambio fa rileggere (una volta per raffica)', async () => {
  const { com, reg } = monta({ righe: [riga('a')] });
  await aspetta(20);
  assert.equal(reg.letture, 1);
  reg.avvisa(); reg.avvisa(); reg.avvisa();
  await aspetta(450);
  assert.equal(reg.letture, 2);
  com.smonta();
});

/* ------------------------------------------------------------ il popup --- */

test('popup: uno alla volta («1 di 2»), «Ho letto» registra e passa al successivo, poi si chiude', async () => {
  const { com, reg } = monta({
    righe: [
      riga('p2', { consegna: 'popup', pubblicata_il: '2026-09-24T09:00:00Z', titolo: 'Seconda' }),
      riga('p1', { consegna: 'popup', pubblicata_il: '2026-09-23T09:00:00Z', titolo: 'Prima' }),
      riga('s', { consegna: 'silenziosa' }),
    ],
  });
  await aspetta(30);
  assert.equal(com.stato().popup, 'p1');
  let v = velo();
  assert.ok(v, 'il popup non si e\' aperto');
  assert.equal(conClasse(v, 'vrs-com-pop').getAttribute('role'), 'alertdialog');
  assert.equal(conClasse(v, 'vrs-com-pop').getAttribute('aria-modal'), 'true');
  assert.equal(conClasse(v, 'vrs-com-pop-tit').textContent, 'Prima');
  assert.equal(conClasse(v, 'vrs-com-pop-conta').textContent, '1 di 2');

  spunta(v);
  await aspetta(10);
  assert.deepEqual(reg.conferme, ['p1']);
  v = velo();
  assert.equal(com.stato().popup, 'p2');
  assert.equal(conClasse(v, 'vrs-com-pop-tit').textContent, 'Seconda');
  assert.equal(conClasse(v, 'vrs-com-pop-conta').textContent, '2 di 2');
  assert.equal(com.bottone.getAttribute('aria-label'), 'Comunicazioni: 2 da leggere');

  spunta(v);
  await aspetta(10);
  assert.deepEqual(reg.conferme, ['p1', 'p2']);
  assert.equal(velo(), null, 'finite le conferme il popup si chiude');
  assert.equal(com.bottone.getAttribute('aria-label'), 'Comunicazioni: una da leggere');
  com.smonta();
});

test('popup: Esc e clic fuori non lo chiudono finche\' non si spunta', async () => {
  const { com } = monta({ righe: [riga('p', { consegna: 'popup' })] });
  await aspetta(30);
  const v = velo();
  assert.ok(v);
  tasto('Escape');
  v.lancia('mousedown', { target: v });
  assert.equal(velo(), v, 'il popup si e\' chiuso senza la spunta');
  assert.match(conClasse(v, 'vrs-com-pop-nota').textContent, /Ho letto/);
  com.smonta();
  assert.equal(velo(), null);
});

test('popup: se la registrazione non passa resta aperto, con il motivo e la casella da rifare', async () => {
  let prove = 0;
  const { com } = monta({
    righe: [riga('p', { consegna: 'popup' })],
    conferma: async () => { prove++; return { ok: false, stato: 500, dati: { errore: 'errore 500' } }; },
  });
  await aspetta(30);
  spunta(velo());
  await aspetta(10);
  assert.equal(prove, 1);
  const v = velo();
  assert.ok(v, 'il popup si e\' chiuso anche se la spunta non e\' registrata');
  assert.match(conClasse(v, 'vrs-com-pop-nota').textContent, /Non registrata/);
  const input = trova(v, x => x.tagName === 'INPUT');
  assert.equal(input.checked, false);
  assert.equal(input.disabled, false);
  com.smonta();
});

test('popup: spuntata altrove (il tempo reale rilegge) passa da sola alla successiva', async () => {
  let righe = [riga('p1', { consegna: 'popup', pubblicata_il: '2026-09-23T09:00:00Z' }), riga('p2', { consegna: 'popup', pubblicata_il: '2026-09-24T09:00:00Z' })];
  const { com, reg } = monta({ carica: async () => ({ ok: true, stato: 200, dati: righe }) });
  await aspetta(30);
  assert.equal(com.stato().popup, 'p1');
  righe = [{ ...righe[0], confermata_il: '2026-09-24T10:00:00Z' }, righe[1]];
  reg.avvisa();
  await aspetta(450);
  assert.equal(com.stato().popup, 'p2');
  righe = [];                                    // archiviate tutte
  reg.avvisa();
  await aspetta(450);
  assert.equal(velo(), null);
  assert.equal(com.bottone.getAttribute('aria-label'), 'Comunicazioni: nessuna da leggere');
  com.smonta();
});

/* ----------------------------------------------------------- la casella --- */

test('casella: elenco con priorita\' in parole, «Ho letto» gia\' spuntata e bloccata dove c\'e\'', async () => {
  const { com, reg } = monta({
    righe: [
      riga('a', { priorita: 'alta', titolo: 'Urgente' }),
      riga('b', { confermata_il: '2026-09-24T09:00:00Z' }),
    ],
  });
  await aspetta(20);
  com.apri();
  const v = velo();
  assert.ok(v);
  assert.equal(com.bottone.getAttribute('aria-expanded'), 'true');
  const box = conClasse(v, 'vrs-com');
  assert.equal(box.getAttribute('role'), 'dialog');
  const voci = tutti(v).filter(x => x.classList?.contains('vrs-com-voce'));
  assert.equal(voci.length, 2);
  assert.match(conClasse(voci[0], 'vrs-com-pri').textContent, /Priorità alta/);
  const [i1, i2] = voci.map(x => trova(x, y => y.tagName === 'INPUT'));
  assert.equal(i1.checked, false);
  assert.equal(i2.checked, true);
  assert.equal(i2.disabled, true);

  spunta(voci[0]);
  await aspetta(10);
  assert.deepEqual(reg.conferme, ['a']);
  assert.equal(com.bottone.getAttribute('aria-label'), 'Comunicazioni: nessuna da leggere');
  tasto('Escape');
  assert.equal(velo(), null);
  assert.equal(com.bottone.getAttribute('aria-expanded'), 'false');
  com.smonta();
});

test('casella vuota: lo dice a parole, e si chiude con un clic fuori', async () => {
  const { com } = monta({ righe: [] });
  await aspetta(20);
  assert.equal(com.bottone.hidden, false, 'il tasto c\'e\' anche senza comunicazioni');
  com.apri();
  const v = velo();
  assert.match(conClasse(v, 'vrs-com-vuoto').textContent, /Nessuna comunicazione/);
  v.lancia('mousedown', { target: v });
  assert.equal(velo(), null);
  com.smonta();
});
