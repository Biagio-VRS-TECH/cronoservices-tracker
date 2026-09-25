/* cloud-accesso-suite.test.mjs - l'accesso unico nella Suite VRS (web/js/nuvola.js).
 *
 * CronoService e' un'app della Suite come le altre: riconosce i siti VRS (anche se stesso, per i
 * collegamenti dalle altre app), porta il passaggio d'accesso e lo legge all'arrivo.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

let giro = 0;
async function modulo(href = 'https://cronoservices-tracker.netlify.app/') {
  const u = new URL(href);
  globalThis.localStorage = { getItem: () => null, setItem() { }, removeItem() { } };
  globalThis.sessionStorage = { getItem: () => null, setItem() { }, removeItem() { } };
  globalThis.history = { state: null, replaceState(_s, _t, url) { const n = new URL(url, u); globalThis.location.hash = n.hash; globalThis.location.search = n.search; globalThis.location.pathname = n.pathname; } };
  globalThis.location = { origin: u.origin, hostname: u.hostname, protocol: u.protocol, pathname: u.pathname, search: u.search, hash: u.hash, href };
  return import('../../web/js/nuvola.js?as=' + (++giro));
}

test('i siti della Suite VRS, CronoService compreso, anche in anteprima', async () => {
  const m = await modulo();
  for (const h of ['vrs-planning.netlify.app', 'anteprima--vrs-admin.netlify.app', 'vrs-suite.netlify.app', 'cronoservices-tracker.netlify.app', 'anteprima--cronoservices-tracker.netlify.app', 'crono.app.vrs-tech.it'])
    assert.equal(m.eSitoVrs(h), true, h);
  for (const h of ['esempio.netlify.app', 'vrs-planning.netlify.app.evil.com'])
    assert.equal(m.eSitoVrs(h), false, h);
  assert.equal(m.eAltraAppVrs(new URL('https://vrs-planning.netlify.app/')), true);
  assert.equal(m.eAltraAppVrs(new URL('https://cronoservices-tracker.netlify.app/?service=3')), false, 'questa stessa app');
});

test('all’arrivo il passaggio d’accesso si prende e sparisce dall’indirizzo', async () => {
  const m = await modulo('https://cronoservices-tracker.netlify.app/?service=12#vrs_ponte=abc%20d');
  assert.equal(m.prendiPonte(), 'abc d');
  assert.equal(location.hash, '');
  assert.equal(location.search, '?service=12');
  assert.equal(m.prendiPonte(), null);
});
