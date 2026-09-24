// Le Novita' a ogni pubblicazione (docs/novita.md del Planning), per CronoService.
//
//   node cloud/novita.mjs bozza        i commit che toccano il sito (web/) dopo l'ultima voce di
//                                      web/novita.json: la BOZZA da riscrivere in parole da utente
//   node cloud/novita.mjs controlla    lo stesso elenco; se non e' vuoto si ferma (uscita 1).
//                                      Lo chiama cloud/pubblica-anteprima.mjs; prima del push su
//                                      main (che pubblica in produzione) va lanciato a mano.
//   --senza-novita                     per una pubblicazione senza niente di visibile: solo un avviso
import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const radice = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const FILE = 'web/novita.json';
const PERCORSI = ['web', ':(exclude)web/novita.json', ':(exclude)web/js/nuvola-config.js'];
const git = (...a) => execFileSync('git', a, { cwd: radice, encoding: 'utf8' }).trim();

export function daRaccontare() {
  const base = git('log', '-1', '--format=%H', '--', FILE);
  const righe = git('log', ...(base ? [`${base}..HEAD`] : ['-30']), '--no-merges', '--date=short', '--format=%h %ad %s', '--', ...PERCORSI);
  const sporchi = git('status', '--porcelain', '--', ...PERCORSI);
  return { commit: righe ? righe.split('\n') : [], sporchi: sporchi ? sporchi.split('\n') : [], novitaSporca: !!git('status', '--porcelain', '--', FILE) };
}

function main() {
  const [comando = 'bozza', ...resto] = process.argv.slice(2);
  const { commit, sporchi, novitaSporca } = daRaccontare();
  if (comando === 'bozza') {
    if (!commit.length && !sporchi.length) return console.log(`Novita' di CronoService: niente da raccontare dopo l'ultima voce di ${FILE}.`);
    console.log(`Novita' di CronoService: bozza per la voce nuova di ${FILE}`);
    console.log('(sono messaggi per sviluppatori: vanno riscritti in parole da utente, 3-5 in evidenza)\n');
    for (const c of commit) console.log('  - ' + c);
    if (sporchi.length) console.log('\n  file cambiati e non ancora in un commit:\n' + sporchi.map(s => '    ' + s).join('\n'));
    return;
  }
  if (comando === 'controlla') {
    if (novitaSporca || (!commit.length && !sporchi.length)) return console.log("Novita' di CronoService: in ordine.");
    const msg = `Novita' di CronoService: ${commit.length} commit${sporchi.length ? ' e file non salvati' : ''} dopo l'ultima voce di ${FILE}.\n` +
      commit.map(c => '  - ' + c).join('\n') +
      "\nScrivi la voce nuova (bozza: node cloud/novita.mjs bozza) oppure, se non cambia niente di visibile, usa --senza-novita.";
    if (resto.includes('--senza-novita')) return console.warn('AVVISO ' + msg);
    console.error('FERMO ' + msg);
    process.exitCode = 1;
    return;
  }
  console.error('Uso: node cloud/novita.mjs bozza|controlla [--senza-novita]');
  process.exitCode = 2;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
