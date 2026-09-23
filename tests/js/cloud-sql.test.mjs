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
  const da09 = tutte.imposta_ruolo.find(x => x.file.startsWith('09'));
  assert.ok(da09, 'imposta_ruolo del 09 non trovata');
  const lucchetto = "perform1frompublic.operatoriowhereo.ruolo='admin'forupdate;";
  assert.ok(piatto(da09.corpo).includes(lucchetto));
  assert.equal(piatto(da09.corpo).replace(lucchetto, ''), piatto(da03.corpo));
  // il lucchetto sta PRIMA del conto
  assert.ok(piatto(da09.corpo).indexOf(lucchetto) < piatto(da09.corpo).indexOf('selectcount(*)into'));
  // e l'ULTIMA versione (il 13) lo tiene, sempre prima del conto
  const ult = piatto(ultima(tutte, 'imposta_ruolo').corpo);
  assert.ok(ult.includes(lucchetto), 'l\'ultima imposta_ruolo ha perso il lucchetto');
  assert.ok(ult.indexOf(lucchetto) < ult.indexOf('selectcount(*)'), 'il lucchetto dopo il conto');
});

test('CronoService non dipende da funzioni del Planning', () => {
  for (const f of FILE_SQL) {
    const senzaCommenti = leggi('cloud/' + f).replace(/--[^\n]*/g, '');
    // una tabella del Planning (insert into public.pl_secrets(...)) non e' una funzione
    assert.doesNotMatch(senzaCommenti, /(?<!into\s+public\.)\bpl_\w+\s*\(/, f);
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

/* ----------------------------------------------- 12-debug-2026-09.sql --- */
const F12 = 'cloud/12-debug-2026-09.sql';
const esiste12 = () => fs.existsSync(path.join(RADICE, F12));
/** Il testo del 12 senza commenti e senza i corpi $fn$/$blocco$. */
const fuori12 = () => leggi(F12).replace(/--[^\n]*/g, '').replace(/(\$\w*\$)[\s\S]*?\1/g, '');

test('12 esiste e non tocca dati: niente insert/update/delete/truncate fuori dai corpi', () => {
  assert.ok(esiste12(), F12 + ' manca');
  assert.doesNotMatch(fuori12(), /\b(insert\s+into|update\s+\w+\.|delete\s+from|truncate\s+|alter\s+table|drop\s+table)/i);
});

test('12 non nomina niente del Planning (pl_*) e non fa revoke/grant globali', () => {
  assert.ok(esiste12(), F12 + ' manca');
  const t = leggi(F12).replace(/--[^\n]*/g, '');
  assert.doesNotMatch(t, /\bpl_\w+/);
  assert.doesNotMatch(t, /\bon\s+all\s+(tables|functions|sequences)\b/i);
  assert.doesNotMatch(t, /\bin\s+schema\b/i);
});

test('12: search_path fisso su ogni funzione, SECURITY DEFINER su quelle esposte, _applica/imposta_nota intatte', () => {
  const tutte = funzioni();
  const del12 = Object.entries(tutte).flatMap(([n, vv]) => vv.filter(v => v.file === '12-debug-2026-09.sql')
    .map(v => [n, v]));
  assert.ok(del12.length >= 3, 'nel 12 ci sono ' + del12.length + ' funzioni');
  for (const [nome, v] of del12) {
    assert.match(v.intestazione, /set\s+search_path\s*=\s*public/i, nome);
    // le interne (_csv) girano dentro una SECURITY DEFINER e restano INVOKER
    if (!nome.startsWith('_')) assert.match(v.intestazione, /security\s+definer/i, nome);
    else assert.doesNotMatch(v.intestazione, /security\s+definer/i, nome);
  }
  for (const nome of ['_applica', 'imposta_nota']) {
    assert.ok(!tutte[nome].some(x => x.file.startsWith('12')), nome + ': ha il controllo del Planning');
  }
});

test('ripristina_blocco: il blocco si confronta senza LIKE (con "%" o "_" prendeva altri blocchi)', () => {
  const tutte = funzioni();
  const v = ultima(tutte, 'ripristina_blocco');
  assert.doesNotMatch(v.corpo, /\blike\b/i, 'l\'ultima versione usa ancora LIKE: ' + v.file);
  // il 12 e' quello di 02 parola per parola: cambia solo il criterio del blocco
  const da02 = tutte.ripristina_blocco.find(x => x.file.startsWith('02'));
  const da12 = tutte.ripristina_blocco.find(x => x.file.startsWith('12'));
  const vecchio = "whereop_id=p_op_idorop_idlikep_op_id||':%'";
  const nuovo = "whereop_id=p_op_idorleft(op_id,length(p_op_id)+1)=p_op_id||':'";
  assert.ok(piatto(da12.corpo).includes(nuovo));
  assert.equal(piatto(da12.corpo).replace(nuovo, vecchio), piatto(da02.corpo));
  // l'ULTIMA versione (il 13) e' quella del 12 piu' il solo contatore `trovati`
  // (404 solo se il blocco non ha nessuna riga nel diario)
  assert.ok(piatto(v.corpo).includes(nuovo), 'l\'ultima ripristina_blocco ha perso il prefisso esatto');
  const senzaTrovati = piatto(v.corpo)
    .replace('trovatiint:=0;', '')
    .replace('trovati:=trovati+1;', '')
    .replace('iftrovati=0then', 'ifi=0andjsonb_array_length(esiti)=0then');
  assert.equal(senzaTrovati, piatto(da12.corpo), v.file);
});

/** Il criterio del blocco di 12, rifatto in JS: left(op_id, n+1) = blocco || ':'. */
const delBlocco = (opId, blocco) => opId === blocco || opId.slice(0, blocco.length + 1) === blocco + ':';
test('ripristina_blocco: "%" e "_" non sono piu\' jolly, un blocco vero prende solo le sue celle', () => {
  const diario = ['abc', 'abc:0', 'abc:1', 'abcd:0', 'x:0', 'a_c:0', 'uuid-1'];
  assert.deepEqual(diario.filter(o => delBlocco(o, 'abc')), ['abc', 'abc:0', 'abc:1']);
  assert.deepEqual(diario.filter(o => delBlocco(o, '%')), []);
  assert.deepEqual(diario.filter(o => delBlocco(o, '_')), []);
  assert.deepEqual(diario.filter(o => delBlocco(o, 'a_c')), ['a_c:0']);
});

test('imposta_meta: il mese va da 01 a 12 (prima passava "2026-13" e spegneva il ritardo di un anno)', () => {
  const v = ultima(funzioni(), 'imposta_meta');
  const m = /v\s*!~\s*'([^']+)'/.exec(v.corpo);
  assert.ok(m, 'la regola del formato non si trova in ' + v.file);
  const re = new RegExp(m[1]);
  for (const buono of ['2026-01', '2026-09', '2026-12', '1999-10']) assert.ok(re.test(buono), buono);
  for (const rotto of ['2026-13', '2026-00', '2026-9', '26-09', '2026-09-01', '2026-1a', '']) {
    assert.ok(!re.test(rotto), rotto + ' passa (' + v.file + ')');
  }
  assert.doesNotMatch(m[1], /\\d/, '\\d in Postgres prende anche cifre non latine: [0-9]');
});

/** `_csv` dell'ultimo file, rifatto in JS dai suoi pezzi: i caratteri che fanno
 *  formula, la regola dei numeri semplici e il prefisso. */
function csvDaSql() {
  const v = ultima(funzioni(), '_csv');
  const c = v.corpo;
  const lista = /left\(v,\s*1\)\s+in\s*\(([^)]*)\)/i.exec(c);
  assert.ok(lista, 'i caratteri da neutralizzare non si trovano in ' + v.file);
  const inizi = [...lista[1].matchAll(/(E?)'((?:[^']|'')*)'/g)]
    .map(([, e, s]) => (e ? s.replace(/\\t/g, '\t').replace(/\\r/g, '\r') : s.replace(/''/g, "'")));
  const numero = /v\s*!~\s*'([^']+)'/.exec(c);
  assert.ok(numero, 'manca la regola dei numeri semplici in ' + v.file);
  assert.match(c, /then\s+''''\s*\|\|\s*v\b/, 'il prefisso deve essere un apice (' + v.file + ')');
  const re = new RegExp(numero[1]);
  return { v, t: s => (s == null ? '' : (inizi.includes(s.slice(0, 1)) && !re.test(s) ? "'" + s : s)), inizi };
}

test('_csv: = + - @ TAB CR in testa prendono un apice, i numeri semplici no (come app/api_scadenze.py)', () => {
  const { t, inizi, v } = csvDaSql();
  assert.deepEqual([...inizi].sort(), ['\t', '\r', '+', '-', '=', '@'].sort(), v.file);
  for (const pericolosa of ['=1+1', '+1+1', '-1+1', '@SOMMA(A1)', '\t=1+1', '\r=1+1',
    '=HYPERLINK("http://x")', '- sostituito filtro', "-cmd|' /C calc'!A0", '+39 0422 1234']) {
    assert.equal(t(pericolosa), "'" + pericolosa, JSON.stringify(pericolosa));
  }
  for (const innocua of ['nota normale', '', 'A=B', '3-4', 'Città', "'gia' con apice"]) {
    assert.equal(t(innocua), innocua, JSON.stringify(innocua));
  }
  for (const numero of ['-5', '-3,5', '-0.25', '+7', '-12345']) assert.equal(t(numero), numero, numero);
  assert.equal(t(null), '');
});

test('_csv: l\'ultima versione non mette piu\' la tabulazione davanti, e quota ; " CR LF', () => {
  const v = ultima(funzioni(), '_csv');
  assert.doesNotMatch(v.corpo, /E'\\t'\s*\|\|/, 'la tabulazione davanti e\' ancora li\': ' + v.file);
  assert.match(v.corpo, /w\s*~\s*'\[";\\r\\n\]'/);
  assert.match(v.corpo, /replace\(w,\s*'"',\s*'""'\)/);
  assert.match(v.intestazione, /immutable/i);
});

test('ruolo_corrente: chi non e\' autorizzato (disattivato nel Planning) non e\' mai admin', () => {
  const v = ultima(funzioni(), 'ruolo_corrente');
  assert.match(v.corpo, /public\.autorizzato\(\)/, 'ruolo_corrente non guarda autorizzato(): ' + v.file);
  assert.match(v.intestazione, /security\s+definer/i);
});

/* ------------------------------------------ 13-debug-2026-09-bis.sql --- */
const F13 = 'cloud/13-debug-2026-09-bis.sql';
const N13 = '13-debug-2026-09-bis.sql';
const esiste13 = () => fs.existsSync(path.join(RADICE, F13));
const del13 = () => Object.entries(funzioni())
  .flatMap(([n, vv]) => vv.filter(v => v.file === N13).map(v => [n, v]));
const corpo13 = nome => {
  const v = (funzioni()[nome] || []).find(x => x.file === N13);
  assert.ok(v, nome + ' non e\' nel 13');
  return v;
};
const SEI13 = ['imposta_ruolo', 'imposta_responsabile', 'app_attivita', 'toggle_cella',
  'bulk_celle', 'ripristina_blocco'];

test('13 esiste e non tocca dati: niente insert/update/delete/truncate/DDL fuori dai corpi', () => {
  assert.ok(esiste13(), F13 + ' manca');
  const fuori = leggi(F13).replace(/--[^\n]*/g, '').replace(/(\$\w*\$)[\s\S]*?\1/g, '');
  assert.doesNotMatch(fuori, /\b(insert\s+into|update\s+\w+\.|delete\s+from|truncate\s+|alter\s+(table|function)|drop\s+(table|function))/i);
  assert.doesNotMatch(fuori, /\bcreate\s+(table|index|policy|trigger)\b/i);
});

test('13: del Planning solo la LETTURA di pl_profiles, dentro un ramo to_regclass; nessuna funzione pl_*', () => {
  assert.ok(esiste13(), F13 + ' manca');
  const t = leggi(F13).replace(/--[^\n]*/g, '');
  assert.doesNotMatch(t, /\bpl_\w+\s*\(/, 'una funzione pl_* chiamata');
  const nomi = new Set([...t.matchAll(/\bpl_\w+/g)].map(m => m[0]));
  assert.deepEqual([...nomi], ['pl_profiles']);
  assert.doesNotMatch(t, /\b(insert\s+into|update|delete\s+from|alter\s+table|grant\s+\w+\s+on|revoke\s+\w+\s+on)\s+(public\.)?pl_/i);
  assert.doesNotMatch(t, /\bon\s+all\s+(tables|functions|sequences)\b/i);
  assert.doesNotMatch(t, /\bin\s+schema\b/i);
  // dentro le funzioni: ogni lettura di pl_profiles sta sotto il suo to_regclass
  for (const [nome, v] of del13()) {
    if (!/\bpl_profiles\b/.test(v.corpo)) continue;
    const c = v.corpo.replace(/--[^\n]*/g, '');
    const ramo = c.indexOf("if to_regclass('public.pl_profiles') is not null then");
    assert.ok(ramo >= 0 && ramo < c.search(/public\.pl_profiles\s+p\b/), nome + ': pl_profiles fuori dal ramo');
  }
});

test('13: le sei funzioni, search_path fisso e SECURITY DEFINER; _applica/imposta_nota intatte', () => {
  const trovate = del13();
  assert.deepEqual(trovate.map(([n]) => n).sort(), [...SEI13].sort());
  for (const [nome, v] of trovate) {
    assert.match(v.intestazione, /set\s+search_path\s*=\s*public/i, nome);
    assert.match(v.intestazione, /security\s+definer/i, nome);
    assert.match(v.corpo, /if not public\.autorizzato\(\) then\s+raise exception/, nome);
  }
  const tutte = funzioni();
  for (const nome of ['_applica', 'imposta_nota']) {
    assert.ok(!tutte[nome].some(x => x.file.startsWith('13')), nome + ': ha il controllo del Planning');
  }
  // imposta_responsabile tiene il suo search_path (public, pg_temp) come online
  assert.match(corpo13('imposta_responsabile').intestazione, /search_path\s*=\s*public,\s*pg_temp/i);
});

test('13: revoke da public/anon e grant ad authenticated per firma esatta, tutte e sei', () => {
  const t = leggi(F13).replace(/--[^\n]*/g, '');
  const firme = ['imposta_ruolo(text, text)', 'imposta_responsabile(int[], text)', 'app_attivita(int)',
    'toggle_cella(int, int, int, text, int, int, int, text, text)', 'bulk_celle(int, jsonb, text, text)',
    'ripristina_blocco(text)'];
  const revoke = /revoke execute on function([\s\S]*?)from public, anon;/.exec(t);
  const grant = /grant execute on function([\s\S]*?)to authenticated;/.exec(t);
  assert.ok(revoke && grant, 'mancano revoke o grant');
  for (const f of firme) {
    assert.ok(revoke[1].includes('public.' + f), 'revoke: ' + f);
    assert.ok(grant[1].includes('public.' + f), 'grant: ' + f);
  }
});

test('13 imposta_ruolo: contano solo gli admin attivi (casella @vrs-tech.it, non disattivati)', () => {
  const c = piatto(corpo13('imposta_ruolo').corpo);
  assert.ok(c.includes("lower(o.email)like'%@vrs-tech.it'"), 'manca la casella aziendale');
  assert.ok(c.includes('p.active=false'), 'manca il disattivato del Planning');
  // il bersaglio conta solo se e' fra gli attivi (declassare un disattivato non toglie nessuno)
  assert.ok(c.includes("ifp_ruolo<>'admin'andn_admin<=1andv_bersaglio"), 'condizione del lucchetto');
  assert.ok(c.includes("coalesce(p_ruolo,'')notin('admin','approvatore','tecnico')"));
  // i due rami (con e senza Planning) contano allo stesso modo
  assert.equal((c.match(/selectcount\(\*\),coalesce\(bool_or\(o\.nome=v_nome\),false\)/g) || []).length, 2);
});

test('13 imposta_responsabile: una persona disattivata nel Planning non si sceglie (400), prima dell\'update', () => {
  const c = corpo13('imposta_responsabile').corpo;
  const no = c.search(/disattivato nel Planning/);
  assert.ok(no > 0, 'manca il rifiuto');
  assert.match(c.slice(Math.max(0, no - 200), no), /'http', 400/);
  assert.ok(no < c.indexOf('update public.services'), 'il controllo dopo la scrittura');
  // il resto e' quello dell'11: tolto il ramo nuovo, stesso testo
  const da11 = funzioni().imposta_responsabile.find(x => x.file.startsWith('11'));
  const senza = c.replace(/--[^\n]*/g, '')
    .replace(/if to_regclass\('public\.pl_profiles'\)[\s\S]*?end if;\s*end if;\s*/, '');
  assert.equal(piatto(senza), piatto(da11.corpo.replace(/--[^\n]*/g, '')));
});

test('13 app_attivita: il limite si normalizza (nullo 60, sotto 1 = 1, oltre il tetto = tetto)', () => {
  const c = corpo13('app_attivita').corpo;
  const m = /limit\s+greatest\(\s*1\s*,\s*least\(\s*coalesce\(\s*p_limit\s*,\s*(\d+)\s*\)\s*,\s*(\d+)\s*\)\s*\)/i.exec(c);
  assert.ok(m, 'limite non normalizzato');
  const lim = p => Math.max(1, Math.min(p ?? Number(m[1]), Number(m[2])));
  assert.deepEqual([null, -5, 0, 1, 60, 300, 2 ** 31 - 1].map(lim), [60, 1, 1, 1, 60, 300, 300]);
});

test('13 toggle_cella e bulk_celle: mese 1..12 e anno 2000..2100 danno un 400 prima di _applica', () => {
  for (const nome of ['toggle_cella', 'bulk_celle']) {
    const c = corpo13(nome).corpo;
    const anno = c.search(/p_anno is null or p_anno not between 2000 and 2100/);
    assert.ok(anno > 0, nome + ': manca il controllo dell\'anno');
    assert.ok(c.includes('mese fuori da 1..12'), nome + ': manca il controllo del mese');
    assert.ok(anno < c.indexOf('public._applica('), nome + ': anno controllato dopo _applica');
    assert.ok(c.indexOf('mese fuori da 1..12') < c.indexOf('public._applica('), nome);
    assert.match(c, /'http', 400/, nome);
  }
  assert.match(corpo13('toggle_cella').corpo, /p_mese is null or p_mese not between 1 and 12/);
  // bulk: il mese si guarda come testo prima del cast, e `i` avanza (op_id "<blocco>:<i>")
  const b = corpo13('bulk_celle').corpo;
  assert.match(b, /case when v->>'mese' ~ '\^\[0-9\]\{1,2\}\$'\s+then \(v->>'mese'\)::int between 1 and 12 end/);
  const ramo = b.slice(b.indexOf('mese fuori da 1..12'), b.indexOf('oid := coalesce'));
  assert.match(ramo, /i := i \+ 1;\s+continue;/);
});

/** Il controllo del mese di bulk_celle del 13, rifatto in JS. */
const meseBuono = v => {
  const s = v && typeof v === 'object' && !Array.isArray(v) && v.mese != null ? String(v.mese) : null;
  return s != null && /^[0-9]{1,2}$/.test(s) && Number(s) >= 1 && Number(s) <= 12;
};
test('13 bulk_celle: quali mesi passano (numero o testo di 1-2 cifre fra 1 e 12)', () => {
  assert.deepEqual([{ mese: 3 }, { mese: '12' }, { mese: 1 }].map(meseBuono), [true, true, true]);
  assert.deepEqual([{ mese: 13 }, { mese: 0 }, { mese: -1 }, { mese: 3.5 }, { mese: 'marzo' }, {}, 7, [1],
    { mese: null }].map(meseBuono), Array(9).fill(false));
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
