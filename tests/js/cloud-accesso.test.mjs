/* cloud-accesso.test.mjs - la pagina d'accesso di web/js/nuvola.js
 * (`assicuraSessione`), con localStorage che non collabora.
 *
 * Un DOM giocattolo quanto basta alla pagina (createElement, querySelector,
 * addEventListener): niente browser. Il modulo si importa fresco a ogni prova
 * (`?a=...`), come in cloud-nuvola.test.mjs.
 *
 * Il caso vero: Safari con i dati dei siti bloccati, o una navigazione privata
 * piena, dove `localStorage.getItem`/`setItem` LANCIANO. La sessione in memoria
 * era gia' a prova di questo (salvaSessione), la pagina d'accesso no: la casella
 * ricordata si leggeva e si scriveva senza rete di sicurezza.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

const json = (stato, dati) => new Response(JSON.stringify(dati), { status: stato });

function elemento(sel = '') {
  const ascolta = {};
  return {
    sel, id: sel.startsWith('#') ? sel.slice(1) : '',
    value: '', hidden: true, textContent: '', dataset: {}, attributi: {}, disabled: false,
    type: 'password', inert: false, rimosso: false, figli: {},
    setAttribute(k, v) { this.attributi[k] = v; },
    removeAttribute(k) { delete this.attributi[k]; },
    focus() { },
    remove() { this.rimosso = true; },
    addEventListener(t, f) { (ascolta[t] ||= []).push(f); },
    ascoltatori: t => (ascolta[t] || []).length,
    emetti(t, e) { return Promise.all((ascolta[t] || []).map(f => f(e))); },
    querySelector(s) { return (this.figli[s] ||= elemento(s)); },
  };
}

let giro = 0;
async function prepara(storage) {
  let pagina = null;
  globalThis.localStorage = storage;
  globalThis.location = { origin: 'http://sito', reload() { } };
  globalThis.document = {
    createElement: () => (pagina = elemento()),
    body: { children: [], appendChild(n) { this.children.push(n); } },
  };
  globalThis.fetch = async url => (String(url).includes('grant_type=password')
    ? json(200, { access_token: 'entrato', refresh_token: 'rt', expires_in: 3600,
                  user: { email: 'mario.rossi@vrs-tech.it' } })
    : json(200, {}));
  const m = await import('../../web/js/nuvola.js?a=' + (++giro));
  return { m, pagina: () => pagina };
}

/** Promessa o scadenza: una pagina d'accesso che non si chiude non deve
 *  appendere la prova. */
const entro = (p, ms = 500) => Promise.race([p,
  new Promise((_, no) => setTimeout(() => no(new Error('la pagina d\'accesso non si e\' chiusa')), ms).unref())]);

async function accedi(m, pagina) {
  const attesa = m.assicuraSessione();
  await new Promise(r => setImmediate(r));
  const p = pagina();
  assert.ok(p, 'la pagina d\'accesso non e\' comparsa');
  const form = p.querySelector('form');
  assert.equal(form.ascoltatori('submit'), 1, 'il modulo non ascolta l\'invio');
  p.querySelector('#acc-mail').value = 'mario.rossi@vrs-tech.it';
  p.querySelector('#acc-pwd').value = 'password-lunga';
  await form.emetti('submit', { preventDefault() { } });
  return { ses: await entro(attesa), p };
}

test('localStorage che lancia su tutto: la pagina d\'accesso funziona e si entra', async () => {
  const { m, pagina } = await prepara({
    getItem() { throw new Error('SecurityError'); },
    setItem() { throw new Error('SecurityError'); },
    removeItem() { throw new Error('SecurityError'); },
  });
  const { ses, p } = await accedi(m, pagina);
  assert.equal(ses.access_token, 'entrato');
  assert.equal(p.rimosso, true);
  assert.equal(m.haSessione(), true);
});

test('localStorage pieno (setItem lancia): la casella non si ricorda ma si entra lo stesso', async () => {
  const dentro = new Map();
  const { m, pagina } = await prepara({
    getItem: k => (dentro.has(k) ? dentro.get(k) : null),
    setItem() { throw new Error('QuotaExceededError'); },
    removeItem: k => { dentro.delete(k); },
  });
  const { ses, p } = await accedi(m, pagina);
  assert.equal(ses.access_token, 'entrato');
  assert.equal(p.rimosso, true);
  assert.equal(p.querySelector('.auth-errore').hidden, true, 'nessun errore a chi ha la password giusta');
});

test('con localStorage buono la casella si ricorda e si ripropone', async () => {
  const dentro = new Map();
  const { m, pagina } = await prepara({
    getItem: k => (dentro.has(k) ? dentro.get(k) : null),
    setItem: (k, v) => { dentro.set(k, String(v)); },
    removeItem: k => { dentro.delete(k); },
  });
  await accedi(m, pagina);
  assert.equal(dentro.get('cs.email'), 'mario.rossi@vrs-tech.it');
});
