/* web-precarico.test.mjs - PERF-14: web/index.html precarica (modulepreload)
   esattamente i moduli che app.js tira dentro con gli import statici. Un
   modulo nuovo non precaricato torna a scaricarsi "a cascata"; uno tolto dal
   grafo ma rimasto nell'elenco e' un download inutile a ogni avvio. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const WEB = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'web');

function grafo(da) {
  const visti = new Set(), coda = [da];
  while (coda.length) {
    const m = coda.pop();
    if (visti.has(m)) continue;
    visti.add(m);
    const src = readFileSync(join(WEB, 'js', m), 'utf8');
    for (const [, dep] of src.matchAll(/^\s*(?:import|export)\b[^'"]*?from\s*'\.\/([\w-]+\.js)'/gm)) coda.push(dep);
    for (const [, dep] of src.matchAll(/^\s*import\s*'\.\/([\w-]+\.js)'/gm)) coda.push(dep);
  }
  return visti;
}

test('index.html precarica tutto il grafo di app.js, e solo quello', () => {
  const html = readFileSync(join(WEB, 'index.html'), 'utf8');
  const precaricati = new Set([...html.matchAll(/<link rel="modulepreload" href="\/js\/([\w-]+\.js)">/g)]
    .map(m => m[1]));
  const servono = grafo('app.js');
  assert.deepEqual([...precaricati].sort(), [...servono].sort());
});
