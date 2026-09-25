/* noindex.test.mjs - CronoService e' un'app interna: nessun motore di ricerca deve indicizzarla.
 *
 * Tre livelli, controllati qui leggendo i file: l'intestazione X-Robots-Tag su ogni file servito
 * (netlify.toml, regola "/*"), il <meta name="robots"> in ogni pagina HTML e un robots.txt che NON
 * vieta la lettura (con "Disallow: /" il motore non vedrebbe mai il noindex).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RADICE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const leggi = f => fs.readFileSync(path.join(RADICE, f), 'utf8').replace(/\r\n/g, '\n');

/** Ogni .html sotto web/ (escluse le librerie di terzi in web/lib) */
function pagine(dir = 'web') {
  const out = [];
  for (const d of fs.readdirSync(path.join(RADICE, dir), { withFileTypes: true })) {
    const rel = path.posix.join(dir, d.name);
    if (d.isDirectory() && rel !== 'web/lib') out.push(...pagine(rel));
    else if (d.name.endsWith('.html')) out.push(rel);
  }
  return out;
}

test('netlify.toml: X-Robots-Tag noindex nella regola "/*"', () => {
  const blocco = leggi('netlify.toml').split(/\n(?=\[\[)/).find(b => /for\s*=\s*"\/\*"/.test(b));
  assert.ok(blocco, 'manca la regola di intestazioni per "/*"');
  assert.match(blocco, /X-Robots-Tag\s*=\s*"noindex, nofollow[^"]*"/);
});

test('ogni pagina HTML ha <meta name="robots" content="noindex, nofollow…">', () => {
  const tutte = pagine();
  assert.ok(tutte.length >= 3, 'trovate troppe poche pagine: ' + tutte.join(', '));
  for (const f of tutte) assert.match(leggi(f), /<meta name="robots" content="noindex, nofollow/, f);
});

test('robots.txt lascia leggere le pagine (altrimenti il noindex non si vede)', () => {
  const r = leggi('web/robots.txt');
  assert.match(r, /^User-agent: \*$/m);
  assert.doesNotMatch(r, /^Disallow:\s*\/\s*$/m);
});
