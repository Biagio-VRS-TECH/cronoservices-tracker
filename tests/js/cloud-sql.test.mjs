/* cloud-sql.test.mjs - controlli sul testo di cloud/*.sql e della
 * pubblicazione (netlify.toml, netlify-build.sh), senza un database.
 *
 * Postgres qui non c'e': si controlla quello che si puo' controllare leggendo,
 * cioe' le regole che si sono gia' rotte una volta.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RADICE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const leggi = f => fs.readFileSync(path.join(RADICE, f), 'utf8').replace(/\r\n/g, '\n');
const FILE_SQL = fs.readdirSync(path.join(RADICE, 'cloud')).filter(f => /^\d\d-.*\.sql$/.test(f)).sort();

/** { nome: [{ file, intestazione, corpo }] } di ogni `create or replace function`. */
function funzioni() {
  const tutte = {};
  for (const f of FILE_SQL) {
    const t = leggi('cloud/' + f);
    const re = /create\s+or\s+replace\s+function\s+public\.(\w+)\s*\(([\s\S]*?)\)\s*returns([\s\S]*?)\bas\s+(\$\w*\$)([\s\S]*?)\4/gi;
    let m;
    while ((m = re.exec(t))) (tutte[m[1]] ||= []).push({ file: f, intestazione: m[3], corpo: m[5] });
  }
  return tutte;
}
const piatto = s => s.replace(/--[^\n]*/g, '').replace(/\s+/g, '');
const ultima = (tutte, nome) => tutte[nome].at(-1);

test('09 non riscrive _applica e imposta_nota: il blocco dei tecnici si toglie nel Planning (037)', () => {
  const tutte = funzioni();
  for (const nome of ['_applica', 'imposta_nota']) {
    assert.ok(!tutte[nome].some(x => x.file.startsWith('09')), nome);
  }
});

test('09: imposta_ruolo e\' quella di 03 piu\' il solo lucchetto sugli admin', () => {
  const tutte = funzioni();
  const da03 = tutte.imposta_ruolo.find(x => x.file.startsWith('03'));
  const da09 = ultima(tutte, 'imposta_ruolo');
  assert.equal(da09.file, '09-debug-2026-09-23.sql');
  const lucchetto = "perform1frompublic.operatoriowhereo.ruolo='admin'forupdate;";
  assert.ok(piatto(da09.corpo).includes(lucchetto));
  assert.equal(piatto(da09.corpo).replace(lucchetto, ''), piatto(da03.corpo));
  // il lucchetto sta PRIMA del conto
  assert.ok(piatto(da09.corpo).indexOf(lucchetto) < piatto(da09.corpo).indexOf('selectcount(*)into'));
});

test('CronoService non dipende da funzioni del Planning', () => {
  for (const f of FILE_SQL) {
    const senzaCommenti = leggi('cloud/' + f).replace(/--[^\n]*/g, '');
    assert.doesNotMatch(senzaCommenti, /\bpl_\w+\s*\(/, f);
  }
});

test('ogni SECURITY DEFINER fissa il search_path', () => {
  const tutte = funzioni();
  for (const [nome, versioni] of Object.entries(tutte)) {
    for (const v of versioni) {
      if (/security\s+definer/i.test(v.intestazione)) {
        assert.match(v.intestazione, /set\s+search_path\s*=\s*public/i, `${nome} in ${v.file}`);
      }
    }
  }
});

test('ogni funzione chiamabile da fuori si ferma su autorizzato() (o sul ruolo)', () => {
  const tutte = funzioni();
  const esposte = ['app_bootstrap', 'app_storia', 'app_attivita', 'app_incongruenze', 'app_export_csv',
    'app_ping', 'app_celle_dopo', 'toggle_cella', 'bulk_celle', 'imposta_nota', 'imposta_operatore',
    'imposta_ruolo', 'ripristina_blocco', 'imposta_meta', 'azzera_diario', 'app_documenti',
    'registra_documento', 'elimina_documento', 'elimina_documenti', 'app_dizionario',
    'imposta_voce_dizionario'];
  for (const nome of esposte) {
    assert.ok(tutte[nome], nome + ' non trovata');
    assert.match(ultima(tutte, nome).corpo, /if not public\.autorizzato\(\) then\s+raise exception/, nome);
  }
});

test('09 non tocca dati: niente insert/update/delete fuori dai corpi delle funzioni', () => {
  const t = leggi('cloud/09-debug-2026-09-23.sql')
    .replace(/--[^\n]*/g, '')
    .replace(/(\$\w*\$)[\s\S]*?\1/g, '');           // via i corpi $fn$ ... $fn$ e $blocco$
  assert.doesNotMatch(t, /\b(insert\s+into|update\s+public\.|delete\s+from|truncate\s+)/i);
});

test('09 toglie ad anon le funzioni e la tabella che 06/08 avevano riaperto', () => {
  const t = leggi('cloud/09-debug-2026-09-23.sql');
  for (const f of ['registra_documento', 'app_dizionario', 'imposta_voce_dizionario', '_voce_dizionario_out']) {
    assert.match(t, new RegExp(`revoke execute on function[\\s\\S]*public\\.${f}\\(`), f);
  }
  assert.match(t, /revoke all on public\.dizionario_componenti from anon;/);
  assert.match(t, /revoke insert, update, delete, truncate/);
});

test('le policy di lettura di 09 valutano autorizzato() una volta per query', () => {
  const t = leggi('cloud/09-debug-2026-09-23.sql').replace(/--[^\n]*/g, '');
  const usi = [...t.matchAll(/\busing\s*\(([^;]*?)\)(?:'|;)/g)].map(m => m[1].replace(/\s+/g, ''));
  assert.ok(usi.length >= 2, 'le due policy (il ciclo e il dizionario)');
  for (const u of usi) assert.equal(u, '(selectpublic.autorizzato())');
});

/* ------------------------------------------------------- pubblicazione --- */
test('netlify.toml: /api/registra-utente PRIMA del catch-all verso index.html', () => {
  const t = leggi('netlify.toml');
  const funz = t.indexOf('from = "/api/registra-utente"');
  const tutto = t.indexOf('from = "/*"');
  assert.ok(funz > 0 && tutto > 0 && funz < tutto);
  assert.match(t, /publish = "web"/);
  assert.match(t, /X-Frame-Options = "DENY"/);
});

test('netlify-build.sh: la service key esce dall\'ambiente e non entra in nuvola-config.js', () => {
  const t = leggi('cloud/netlify-build.sh');
  assert.ok(t.indexOf('unset SUPABASE_SERVICE_KEY') < t.indexOf('cat > web/js/nuvola-config.js'));
  const heredoc = t.slice(t.indexOf('<<EOF'), t.indexOf('\nEOF'));
  assert.doesNotMatch(heredoc, /SERVICE/);
  assert.match(t, /set -eu/);
});

test('nuvola-config.js nel repository e\' vuoto (modo locale)', () => {
  const t = leggi('web/js/nuvola-config.js');
  assert.match(t, /export const URL_SUPABASE = '';/);
  assert.match(t, /export const CHIAVE_ANON = '';/);
});

test('netlify/functions contiene solo file con un handler', () => {
  for (const f of fs.readdirSync(path.join(RADICE, 'netlify', 'functions'))) {
    assert.match(leggi('netlify/functions/' + f), /export default/, f);
  }
});
