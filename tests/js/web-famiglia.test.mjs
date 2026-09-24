/* web-famiglia.test.mjs - CronoService nella famiglia VRS (web/js/famiglia.js):
   le tre app del selettore (VIS-05 / PRD-01) e il tema che passa dal profilo
   dell'account (VIS-22): vince la scelta piu' recente, e i nomi dei temi sono
   quelli del Planning. */
import './web-ambiente.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  APP_FAMIGLIA, TEMI, TEMA_META, temaDalProfilo, daApplicare, daInviare,
  temaScelto, istanteScelta, stessoAmbiente,
} from '../../web/js/famiglia.js';

test('il selettore ha le tre app, nell’ordine del Planning, e porta al Planning vero', () => {
  assert.deepEqual(APP_FAMIGLIA.map(a => a.nome), ['Planning', 'CronoService', 'Scheduler']);
  assert.equal(APP_FAMIGLIA[0].to, 'https://vrs-planning.netlify.app/');
  // lo Scheduler e' un sito suo, non la pagina /cantieri del Planning
  assert.equal(APP_FAMIGLIA[2].to, 'https://vrs-scheduler.netlify.app/');
});

test('dall’anteprima si resta in anteprima, in produzione niente cambia', () => {
  const a = 'anteprima--cronoservices-tracker.netlify.app';
  assert.equal(stessoAmbiente('https://vrs-planning.netlify.app/', a), 'https://anteprima--vrs-planning.netlify.app/');
  assert.equal(stessoAmbiente('https://vrs-scheduler.netlify.app/?vrs_tema=dark.1', a), 'https://anteprima--vrs-scheduler.netlify.app/?vrs_tema=dark.1');
  for (const h of ['cronoservices-tracker.netlify.app', 'localhost', 'deploy-preview-6--cronoservices-tracker.netlify.app', undefined]) {
    assert.equal(stessoAmbiente('https://vrs-planning.netlify.app/', h), 'https://vrs-planning.netlify.app/');
  }
  assert.equal(stessoAmbiente('https://planning.app.vrs-tech.it/', a), 'https://planning.app.vrs-tech.it/');
});

test('i temi hanno i nomi di famiglia, e la chiave del profilo e’ quella del Planning', () => {
  assert.deepEqual(TEMI, ['auto', 'light', 'dark']);
  assert.equal(TEMA_META, 'vrs_tema');
});

test('dal profilo si prende solo una scelta ben formata', () => {
  assert.deepEqual(temaDalProfilo({ vrs_tema: { v: 'dark', t: 5 } }), { v: 'dark', t: 5 });
  assert.equal(temaDalProfilo({ vrs_tema: { v: 'scuro', t: 5 } }), null);
  assert.equal(temaDalProfilo({ vrs_tema: { v: 'dark' } }), null);
  assert.equal(temaDalProfilo({ full_name: 'Mario' }), null);
  assert.equal(temaDalProfilo(null), null);
});

test('vince la scelta piu’ recente, e la nostra parte solo se e’ piu’ nuova', () => {
  assert.equal(daApplicare({ v: 'dark', t: 10 }, 5), true);
  assert.equal(daApplicare({ v: 'dark', t: 5 }, 10), false);
  assert.equal(daApplicare(null, 0), false);
  assert.equal(daInviare({ v: 'dark', t: 5 }, 10), true);
  assert.equal(daInviare(null, 10), true);
  assert.equal(daInviare(null, 0), false);
});

test('cs.tema resta la chiave di sempre, letta nei nomi di famiglia', () => {
  localStorage.removeItem('cs.tema');
  assert.equal(temaScelto(), 'auto');
  localStorage.setItem('cs.tema', 'scuro');
  assert.equal(temaScelto(), 'dark');
  localStorage.setItem('cs.tema', 'chiaro');
  assert.equal(temaScelto(), 'light');
  localStorage.removeItem('cs.tema');
  assert.equal(istanteScelta(), 0);
});

test('il foglio del selettore e’ identico a quello del Planning (se la copia c’e’)', () => {
  const qui = readFileSync(new URL('../../web/css/vrs-app.css', import.meta.url), 'utf8');
  assert.match(qui, /IDENTICO nei due repository/);
  assert.doesNotMatch(qui, /transition:\s*all/);
  let la;
  try {
    la = readFileSync(new URL('../../../planning/web/src/styles/vrs-app.css', import.meta.url), 'utf8');
  } catch { return; }      // repository del Planning non accanto: niente confronto
  assert.equal(qui, la);
});

test('«Le app VRS» porta anche alla Suite, la pagina di casa, restando in anteprima dall’anteprima', async () => {
  const { SUITE } = await import('../../web/js/famiglia.js');
  assert.equal(SUITE, 'https://vrs-suite.netlify.app/');
  const css = readFileSync(new URL('../../web/css/vrs-app.css', import.meta.url), 'utf8');
  assert.match(css, /\.vrs-app-casa/);
});
