/* web-responsabile.test.mjs - il responsabile di ogni service (PRD-04):
   i dati accanto al bootstrap, il filtro «Le mie», l'affidamento, il diario, e
   il testo di cloud/11-responsabile.sql. */
import { avvisi, servizio, bootstrapDi } from './web-ambiente.mjs';
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as S from '../../web/js/stato.js';

const { st } = S;
const RADICE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

let chiamate = [];
let rispondi = null;
globalThis.fetch = async (url, opz = {}) => {
  chiamate.push({ url: String(url), opz });
  if (!rispondi) throw new TypeError('rete assente (test)');
  const { stato = 200, dati = {} } = rispondi(String(url), opz) || {};
  return { ok: stato >= 200 && stato < 300, status: stato, text: async () => JSON.stringify(dati) };
};

const IO = 'mario.rossi@vrs-tech.it', ALTRA = 'anna.bianchi@vrs-tech.it';
const PERSONE = [{ email: IO, nome: 'Mario Rossi' }, { email: ALTRA, nome: 'Anna Bianchi' }];

function carica(extra = {}) {
  st.filtri = { q: '', prov: '', mostraChiusi: false, stato: '', resp: '' };
  st.vista = 'anno';
  S.applica({
    ...bootstrapDi({ services: [servizio(1), servizio(2), servizio(3)] }),
    ...extra,
  });
  avvisi();
}
const visibili = () => S.gruppiFiltrati().flatMap(g => g.srvs.map(s => s.id)).sort();

beforeEach(() => { chiamate = []; rispondi = null; });

test('senza responsabili (in locale, o 11 non applicato) il filtro non filtra', () => {
  carica();
  assert.equal(S.responsabiliAttivi(), false);
  st.filtri.resp = 'mie';
  assert.deepEqual(visibili(), [1, 2, 3]);
  assert.equal(S.responsabileDi(1), '');
});

test('«Le mie», «Senza responsabile» e una persona', () => {
  carica({ responsabili: { 1: IO, 2: ALTRA }, persone: PERSONE, io: 'Mario.Rossi@vrs-tech.it' });
  assert.equal(S.responsabiliAttivi(), true);
  assert.equal(st.io, IO);
  st.filtri.resp = 'mie';
  assert.deepEqual(visibili(), [1]);
  st.filtri.resp = 'nessuno';
  assert.deepEqual(visibili(), [3]);
  st.filtri.resp = ALTRA;
  assert.deepEqual(visibili(), [2]);
  // i numeri del filtro di stato contano le sole «mie»
  st.filtri.resp = 'mie';
  assert.equal(S.contaStato().tutte, 1);
  st.filtri.resp = '';
  assert.deepEqual(visibili(), [1, 2, 3]);
});

test('la ricerca trova anche il nome del responsabile', () => {
  carica({ responsabili: { 2: ALTRA }, persone: PERSONE, io: IO });
  st.filtri.q = 'bianchi';
  assert.deepEqual(visibili(), [2]);
});

test('nomeResponsabile: dal nome di operatori, altrimenti dalla casella', () => {
  carica({ responsabili: {}, persone: PERSONE, io: IO });
  assert.equal(S.nomeResponsabile(ALTRA), 'Anna Bianchi');
  assert.equal(S.nomeResponsabile('luca.verdi@vrs-tech.it'), 'Luca Verdi');
  assert.equal(S.nomeResponsabile(''), '');
});

test('affida: il server risponde, la mappa si aggiorna solo per quei service', async () => {
  carica({ responsabili: { 1: IO, 3: IO }, persone: PERSONE, io: IO });
  rispondi = () => ({ dati: { http: 200, cambiati: 2, responsabili: { 1: ALTRA, 2: ALTRA } } });
  const n = await S.affida([1, 2, 2], ALTRA);
  assert.equal(n, 2);
  assert.equal(S.responsabileDi(1), ALTRA);
  assert.equal(S.responsabileDi(2), ALTRA);
  assert.equal(S.responsabileDi(3), IO);
  const corpo = JSON.parse(chiamate[0].opz.body);
  assert.deepEqual(corpo.ids, [1, 2]);
  assert.equal(corpo.email, ALTRA);
  assert.match(chiamate[0].url, /\/api\/responsabile$/);
});

test('affida rifiutato: niente cambia e lo si dice', async () => {
  carica({ responsabili: { 1: IO }, persone: PERSONE, io: IO });
  rispondi = () => ({ stato: 403, dati: { errore: "questa azione e' dell'amministratore" } });
  const n = await S.affida([1], ALTRA);
  assert.equal(n, -1);
  assert.equal(S.responsabileDi(1), IO);
  assert.ok(avvisi().some(t => /non salvato/i.test(t)));
});

test('diario: l affidamento si racconta e non si «ripristina»', () => {
  assert.equal(S.descriviEvento({ campo: 'responsabile', dettaglio: 'Anna <b>' }),
    'ha affidato il sito a <i>Anna &lt;b&gt;</i>');
  assert.equal(S.descriviEvento({ campo: 'responsabile', dettaglio: '' }), 'ha tolto il responsabile');
  assert.equal(S.etichettaBlocco([{ origine: 'responsabile', dettaglio: 'Anna' }, { origine: 'responsabile' }]),
    'Affidati a Anna · 2 siti');
  st.ruolo = 'admin';
  assert.equal(S.ripristinabile({ campo: 'responsabile', op_id: 'x:1', da: 0 }), false);
  st.ruolo = 'tecnico';
});

/* ------------------------------------------------ cloud/11-responsabile.sql */
const sql = fs.readFileSync(path.join(RADICE, 'cloud', '11-responsabile.sql'), 'utf8').replace(/\r\n/g, '\n');

test('11: le due funzioni si fermano su autorizzato(), e affidare e dell amministratore', () => {
  for (const nome of ['app_responsabili', 'imposta_responsabile']) {
    const m = sql.match(new RegExp(`function public\\.${nome}\\([\\s\\S]*?\\$fn\\$([\\s\\S]*?)\\$fn\\$`));
    assert.ok(m, nome);
    assert.match(m[1], /if not public\.autorizzato\(\) then\s+raise exception/, nome);
  }
  assert.match(sql, /if not public\.e_admin\(\) then\s+return jsonb_build_object\('http', 403/);
});

test('11: niente scritture fuori dalle funzioni, anon escluso', () => {
  const fuori = sql.replace(/--[^\n]*/g, '').replace(/(\$\w*\$)[\s\S]*?\1/g, '');
  assert.doesNotMatch(fuori, /\b(insert\s+into|update\s+public\.|delete\s+from|truncate\s+)/i);
  assert.match(fuori, /revoke execute on function public\.app_responsabili\(\) from public, anon, authenticated;/);
  assert.match(fuori, /revoke execute on function public\.imposta_responsabile\(int\[\], text\) from public, anon, authenticated;/);
});
