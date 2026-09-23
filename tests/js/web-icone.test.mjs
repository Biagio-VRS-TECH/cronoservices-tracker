/* web-icone.test.mjs - le icone di famiglia (VIS-12): web/js/vrs-icone.js e'
   la copia identica del modulo del Planning (planning/web/src/lib/vrs-icone.js,
   confrontato la' con icons.tsx), e le icone di CronoService passano da li'. */
import './web-ambiente.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const { PERCORSI, TRATTO, svgIcona } = await import('../../web/js/vrs-icone.js');
const { ICO } = await import('../../web/js/ui.js');
const { ICO_PDF, ICO_REGISTRO } = await import('../../web/js/documenti.js');

test('ogni icona e\' un solo tracciato che parte con M', () => {
  assert.ok(Object.keys(PERCORSI).length > 80);
  for (const [nome, d] of Object.entries(PERCORSI)) {
    assert.match(d, /^M[0-9.\s,a-zA-Z-]+$/, nome);
  }
});

test('le icone dell\'app hanno il tratto di famiglia e nessun disegno proprio', () => {
  assert.equal(TRATTO, 1.75);
  for (const [k, svg] of Object.entries({ ...ICO, ICO_PDF, ICO_REGISTRO })) {
    assert.ok(svg.includes('stroke-width="1.75"'), k);
    assert.equal((svg.match(/<path /g) || []).length, 1, k);
    assert.ok(!/<(circle|rect)\b/.test(svg), k);
    assert.ok(svg.includes('aria-hidden="true"'), k);
  }
  assert.ok(ICO.cerca.includes(PERCORSI.cerca));
  assert.ok(ICO.esci.includes('width="14"'));
});

test('svgIcona: titolo come nome accessibile, nome sconosciuto = errore', () => {
  const s = svgIcona('occhio', 18, 'Mostra <la> password');
  assert.ok(s.includes('role="img"'));
  assert.ok(s.includes('<title>Mostra &lt;la&gt; password</title>'));
  assert.throws(() => svgIcona('nessuna'));
});
