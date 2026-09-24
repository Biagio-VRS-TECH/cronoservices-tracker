// Pubblica CronoService in ANTEPRIMA su Netlify (alias «anteprima»:
// https://anteprima--cronoservices-tracker.netlify.app), senza toccare la produzione, che resta
// il push su main. `node cloud/pubblica-anteprima.mjs [--senza-novita]`
//
// 1. controlla le Novita' (cloud/novita.mjs): senza la voce nuova si ferma;
// 2. copia web/ in una cartella temporanea e ci scrive nuvola-config.js con SUPABASE_URL e
//    SUPABASE_ANON_KEY presi dalle variabili del sito Netlify (come cloud/netlify-build.sh, con lo
//    stesso controllo di forma: dentro ci va solo roba pubblica). Il web/js/nuvola-config.js del
//    repository resta vuoto;
// 3. pubblica dalla radice del repository (vale il netlify.toml di CronoService, con le sue
//    intestazioni) la cartella temporanea, con --no-build.
import { execFileSync, spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SITO = '0c78f01c-a74e-438b-b7b9-30babb7e5f18';
const radice = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const win = process.platform === 'win32';

const novita = spawnSync(process.execPath, [join(radice, 'cloud', 'novita.mjs'), 'controlla', ...process.argv.filter(a => a === '--senza-novita')], { stdio: 'inherit' });
if (novita.status !== 0) process.exit(novita.status ?? 1);

const variabile = nome => execFileSync('npx', ['-y', 'netlify-cli', 'env:get', nome, '--site', SITO], { cwd: radice, encoding: 'utf8', shell: win })
  .trim().split(/\r?\n/).pop().trim();
const url = variabile('SUPABASE_URL');
const anon = variabile('SUPABASE_ANON_KEY');
if (!/^https:\/\/[a-z0-9]+\.supabase\.co$/.test(url) || !/^[\w.-]{20,}$/.test(anon)) {
  console.error('FERMO: SUPABASE_URL o SUPABASE_ANON_KEY del sito Netlify non hanno la forma attesa.');
  process.exit(1);
}

const qui = mkdtempSync(join(tmpdir(), 'crono-anteprima-'));
try {
  cpSync(join(radice, 'web'), qui, { recursive: true });
  const conf = join(qui, 'js', 'nuvola-config.js');
  writeFileSync(conf, `/* Scritto da cloud/pubblica-anteprima.mjs per l'anteprima. */\nexport const URL_SUPABASE = '${url}';\nexport const CHIAVE_ANON = '${anon}';\n`);
  const testo = readFileSync(conf, 'utf8');
  if ((testo.match(/^export /gm) || []).length !== 2) throw new Error('nuvola-config.js non ha i due export attesi');
  const args = ['-y', 'netlify-cli', 'deploy', '--no-build', '--dir', qui, '--site', SITO, '--alias', 'anteprima',
    '--message', `CronoService anteprima ${new Date().toISOString()}`];
  const esito = spawnSync('npx', args, { cwd: radice, stdio: 'inherit', shell: win });
  process.exitCode = esito.status ?? 1;
} finally {
  try { rmSync(qui, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 }); }
  catch { console.warn(`Cartella temporanea non tolta (la pulisce il sistema): ${qui}`); }
}
