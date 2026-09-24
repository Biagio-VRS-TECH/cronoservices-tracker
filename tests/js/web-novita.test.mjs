/* web-novita.test.mjs - le Novita' (web/novita.json e web/js/vrs-novita.js).
   Il file si scrive a mano a ogni pubblicazione (docs/novita.md del Planning):
   qui si controlla che il modulo lo legga tutto, in ordine, con icone che
   esistono e senza gergo da sviluppatori. Il modulo e' identico a quello del
   Planning: il confronto fra i due lo fa tests/unit/novita.test.ts di la'. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { PERCORSI } from '../../web/js/vrs-icone.js';
import { normalizza, daVedere, dataItaliana, MAX_EVIDENZA } from '../../web/js/vrs-novita.js';

const WEB = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'web');
const grezzo = JSON.parse(readFileSync(join(WEB, 'novita.json'), 'utf8'));
const rilasci = normalizza(grezzo);
const GERGO = /\b(migrazion[ei]|RLS|edge function|commit|deploy|SQL|RPC|API|CSS|JSON|Supabase|Netlify|token|cache|service worker|realtime|endpoint|refactor|DPAPI|CSP|query|WAL|UDP|SSE|frontend|backend|null)\b/i;

test('il modulo legge tutti i rilasci, e il file e\' di CronoService', () => {
  assert.equal(grezzo.app, 'cronoservice');
  assert.ok(rilasci.length > 0);
  assert.equal(rilasci.length, grezzo.rilasci.length);
});

test('id unici che cominciano con la data, il piu\' recente in cima', () => {
  assert.equal(new Set(rilasci.map(r => r.id)).size, rilasci.length);
  for (const r of rilasci) assert.ok(r.id.startsWith(r.data), r.id);
  for (let i = 1; i < rilasci.length; i++) assert.ok(rilasci[i - 1].data >= rilasci[i].data);
});

test('in evidenza da 3 a 5 per quello in linea, icone che esistono, testi brevi', () => {
  assert.ok(rilasci[0].evidenza.length >= 3);
  for (const r of rilasci) {
    assert.ok(r.evidenza.length >= 1 && r.evidenza.length <= MAX_EVIDENZA, r.id);
    for (const v of r.evidenza) {
      assert.ok(v.icona === 'scintilla' || v.icona in PERCORSI, v.icona);
      assert.ok(v.titolo.length <= 48, v.titolo);
      assert.ok(v.testo.length > 0 && v.testo.length <= 160, v.testo);
    }
  }
});

test('niente gergo tecnico', () => {
  for (const r of rilasci) {
    for (const t of [r.titolo, ...r.evidenza.flatMap(v => [v.titolo, v.testo]), ...r.novita, ...r.miglioramenti, ...r.correzioni]) {
      assert.doesNotMatch(t, GERGO, t);
      assert.ok(!t.includes('...'), t);
    }
  }
});

test('ultimo visto: chi ha visto il penultimo vede solo l\'ultimo', () => {
  assert.deepEqual(daVedere(rilasci, rilasci[1].id).map(r => r.id), [rilasci[0].id]);
  assert.deepEqual(daVedere(rilasci, rilasci[0].id), []);
  assert.equal(dataItaliana('2026-09-24'), '24 settembre 2026');
});
