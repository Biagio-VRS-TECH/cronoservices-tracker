/* web-documenti-registro.test.mjs - il generatore del registro dei
   componenti (web/registro/app.js) quando gli arriva un file.
   app.js tocca il DOM al caricamento: qui gira VERO, importato come fa la
   pagina, dentro un DOM finto che dice di si' a tutto e REGISTRA quello che
   gli si scrive (document.querySelector('#x') torna sempre lo stesso finto per
   lo stesso selettore). L'Excel e' un XLSX finto; la rete non c'e'.
   Difetti ripetuti:
   - DUE FILE UNO DOPO L'ALTRO: si leggevano insieme e vinceva l'ultimo ad
     arrivare, non l'ultimo scelto - il documento del primo file sotto il nome
     del secondo;
   - un FILE ILLEGGIBILE dopo uno buono azzerava il modello ma lasciava a
     schermo le pagine del primo, con «Esporta» acceso;
   - un file TOLTO mentre si leggeva tornava a comparire a lettura finita. */
import './web-ambiente.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';

/* ------------------------------------------------------------ il DOM finto */
const vuoti = () => new Proxy([], {
  get(a, k) { return /^\d+$/.test(String(k)) ? finto() : Reflect.get(a, k); },
});
function finto(extra = {}) {
  const dati = { dataset: {}, style: { setProperty() { }, removeProperty() { }, getPropertyValue: () => '' },
    children: vuoti(), tBodies: [], ...extra };
  const cl = new Set();
  const metodi = {
    classList: { add: c => cl.add(c), remove: c => cl.delete(c), toggle: (c, v) => ((v ?? !cl.has(c)) ? cl.add(c) : cl.delete(c)), contains: c => cl.has(c) },
    querySelector: () => finto(), querySelectorAll: () => [], closest: () => null,
    getBoundingClientRect: () => ({ left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 }),
    cloneNode: () => finto(), contains: () => false, getAttribute: () => null,
  };
  const niente = () => { };
  for (const m of ['appendChild', 'append', 'prepend', 'before', 'after', 'remove', 'replaceChildren', 'replaceWith',
    'insertBefore', 'setAttribute', 'removeAttribute', 'addEventListener', 'removeEventListener', 'focus', 'blur',
    'click', 'scrollIntoView', 'setSelectionRange', 'insertAdjacentHTML', 'insertAdjacentElement']) metodi[m] = niente;
  return new Proxy({}, {
    get(_, k) { return k in dati ? dati[k] : metodi[k]; },
    set(_, k, v) { dati[k] = v; return true; },
  });
}
const els = new Map();
const el = sel => { if (!els.has(sel)) els.set(sel, finto()); return els.get(sel); };
// la testata del ponte dentro il pannello (#side): niente nuvoletta, niente misure
el('#ponte').closest = () => ({});
Object.assign(globalThis.document, {
  querySelector: el, querySelectorAll: () => [], getElementById: id => el('#' + id),
  createElement: () => finto(),
});
globalThis.window = globalThis;
globalThis.Tour = { crea: () => ({ avvia() { }, vista: () => true }) };
globalThis.MutationObserver = class { observe() { } disconnect() { } };
globalThis.history = { replaceState() { } };
globalThis.CSS = { escape: s => s };
globalThis.getComputedStyle = () => ({ marginTop: '0' });
globalThis.fetch = async () => { throw new TypeError('rete assente (test)'); };

/* ------------------------------------------------------- l'Excel finto --- */
/* il buffer e' un ArrayBuffer con dentro il nome del cliente */
globalThis.XLSX = {
  read: buf => ({ SheetNames: ['F'], Sheets: { F: new TextDecoder().decode(buf) } }),
  utils: {
    sheet_to_json: cliente => [[cliente], ['intestazione'],
      ['103416 - RAMPA OSSIGENO PIANO: 0; REPARTO: CENTRALE GAS; STANZA: LOCALE BOMBOLE;'],
      ['106345 - PRESA O2 PIANO: 1; REPARTO: DEGENZE A; STANZA: 101;']],
  },
};
/** Un file la cui lettura finisce quando lo decide il test. */
function file(nome, cliente) {
  let fine;
  const pronto = new Promise(ok => { fine = ok; });
  return { name: nome, arrayBuffer: () => pronto, leggi: () => fine(new TextEncoder().encode(cliente).buffer) };
}
const scegli = f => el('#file').onchange({ target: { files: [f] } });
/* web-ambiente toglie il ref ai timer (setTimeout non tiene vivo il processo,
   e un await su di lui in cima al file resta "unsettled"): qui setImmediate,
   qualche giro, quanto basta alle promesse della lettura */
const calma = async () => { for (let i = 0; i < 5; i++) await new Promise(r => setImmediate(r)); };

await import('../../web/registro/app.js');
await calma();

test('due file di fila: vale l’ultimo scelto, anche se il primo finisce di leggersi dopo', async () => {
  const a = file('A.xls', 'CLIENTE A'), b = file('B.xls', 'CLIENTE B');
  scegli(a); scegli(b);
  await calma();
  b.leggi(); await calma();
  a.leggi(); await calma();
  const info = el('#fileinfo').innerHTML;
  assert.match(info, /B\.xls/);
  assert.match(info, /CLIENTE B/);
  assert.doesNotMatch(info, /CLIENTE A/);
  assert.equal(el('#docTitle').value, 'CLIENTE B');
});

test('un file illeggibile dopo uno buono: l’errore si dice, e il documento di prima resta intero', async () => {
  const a = file('Buono.xls', 'CLIENTE BUONO');
  scegli(a); await calma(); a.leggi(); await calma();
  assert.match(el('#fileinfo').innerHTML, /CLIENTE BUONO/);
  const x = file('foto.pdf', '');
  scegli(x); await calma(); x.leggi(); await calma();
  const info = el('#fileinfo').innerHTML;
  assert.match(info, /class="errore"/);
  assert.match(info, /non è un \.xls/);
  assert.match(info, /Resta caricato <b>Buono\.xls<\/b>/);
  // il documento che si esporterebbe e' ancora quello, con il suo titolo...
  assert.equal(el('#docTitle').value, 'CLIENTE BUONO');
  assert.equal(el('#viste').hidden, false);
  // ...e il modello c'e' ancora: cambiare il corpo del testo lo rifa'
  el('#corpo').onchange();
  assert.match(el('#fileinfo').innerHTML, /<b>Buono\.xls<\/b><br>CLIENTE BUONO/);
});

test('un file tolto mentre si legge non torna a lettura finita', async () => {
  const a = file('Tardi.xls', 'CLIENTE TARDI');
  scegli(a); await calma();
  el('#dropFile').onclick();                      // «togli il file»
  a.leggi(); await calma();
  assert.equal(el('#viste').hidden, true);
  assert.equal(el('#print').disabled, true);
  assert.doesNotMatch(String(el('#fileinfo').innerHTML), /CLIENTE TARDI/);
});

test('nomi di file e clienti con caratteri HTML restano testo', async () => {
  const a = file('<img src=x onerror=1>.xls', 'CLIENTE <b>GRASSETTO</b>');
  scegli(a); await calma(); a.leggi(); await calma();
  const info = el('#fileinfo').innerHTML;
  assert.doesNotMatch(info, /<img/);
  assert.doesNotMatch(info, /<b>GRASSETTO/);
  assert.match(info, /&lt;img src=x onerror=1&gt;\.xls/);
});
