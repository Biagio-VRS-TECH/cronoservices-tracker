# Prove automatiche

Tutte le prove girano offline, senza installare niente, e non toccano mai i
dati veri: niente Access (`*.accdb`), niente `\\192.168.1.220`, niente
`data/cronoservice.db` ne' `data/prova.db`, niente Supabase.

## Python

Il backend locale (`app/*.py`: `db`, `api`, `server`, `sync`, `push_cloud`,
`rete_locale`) con `unittest` della libreria standard. Dalla radice del
progetto (`cronoservice/`):

```
python -m unittest discover -s tests/python -t .
```

Un file solo, o una prova sola:

```
python -m unittest tests.python.test_py_api_spunte
python -m unittest tests.python.test_py_api_spunte.Toggle.test_conflitto_vero
```

Serve Python 3 (collaudato con 3.14); ~130 prove, una decina di secondi.

Come sono fatte:

- ogni prova crea un **SQLite temporaneo** in `%TEMP%\crono_prova_py_*` con
  `db.init()` e lo butta alla fine (`tests/python/_aiuti_py.py`, classe
  `ConDB`, che mette anche `app/` nel `sys.path`). "Capo" e' amministratore
  per configurazione, come `config.json["amministratori"]`;
- `test_py_server.py` avvia il server vero in un thread su **127.0.0.1 a una
  porta scelta dal sistema** (mai 8770/8771/8775) e ci parla in HTTP, SSE
  compreso. Niente sync all'avvio, niente scoperta UDP;
- `test_py_sync.py` non apre Access: `sync.estrai` e' sostituita da un
  payload finto, e dove si prova `estrai()` stessa il `.accdb` e' un file
  qualunque in una cartella temporanea e PowerShell un finto
  `subprocess.run`. `push_cloud` non chiama Supabase (`urlopen` finto) e non
  legge `app/cloud.json` (la sua `BASE` e' spostata nella cartella di prova);
- `test_py_rete_locale.py` usa solo `127.0.0.1` e una porta UDP libera.

| file | cosa prova |
|---|---|
| `test_py_db.py` | schema, `CAMPI`, colonne aggiunte a un archivio vecchio, pragma, `sess()`, meta, ruoli, seme del dizionario |
| `test_py_api_spunte.py` | toggle (valori 0/1/2 per ruolo, merge, conflitto, replay, scritture concorrenti), bulk, nota, ripristino, diario |
| `test_py_api_tempo.py` | scadenza effettiva col rinnovo automatico, mese della mappatura, anni, bootstrap, CSV, incongruenze |
| `test_py_api_documenti.py` | PDF: salva, scarica, elimina (uno, per anno, per sito), nomi e percorsi (niente uscite dalla cartella) |
| `test_py_api_impostazioni.py` | operatori, ruoli, impostazioni, presenze (anche in concorrenza), permesso del sync, dizionario |
| `test_py_sync.py` | normalizzazione dell'export, sync con diff e archiviazione, export vuoto rifiutato, backup, file temporanei, push_cloud |
| `test_py_server.py` | statici e cache, path traversal, JSON rotto, 400 invece di 500, giro completo, CSV, PDF, SSE, hub |
| `test_py_rete_locale.py` | risponditore UDP e ricerca |

Una prova nuova: un file `tests/python/test_py_<cosa>.py`, classi che
ereditano da `ConDB` (`from ._aiuti_py import ConDB, api, db`).

## JavaScript

L'interfaccia web (`web/js/*.js`) con `node:test` e `node:assert` di Node
(collaudato con Node 24), zero dipendenze, niente browser. Dalla radice del
progetto:

```
node --test "tests/js/*.test.mjs"
```

(Con Node 24 `node --test tests/js/` NON funziona: una cartella non e' un
modello di file. Le virgolette servono: il modello lo espande Node, non la
shell, quindi va uguale in cmd, PowerShell e bash.) Solo l'interfaccia:
`node --test "tests/js/web-*.test.mjs"`; un file solo:
`node --test tests/js/web-stato.test.mjs`. Un decimo di secondo in tutto.

Come sono fatte:

- i moduli di `web/js/` si importano **veri**, cosi' come li carica il
  browser. `tests/js/web-ambiente.mjs` (non e' un test: node lo salta) va
  importato per PRIMO e mette il minimo di browser che serve al caricamento:
  `localStorage`/`sessionStorage` in memoria, `addEventListener` finto, un
  `document` giocattolo quanto basta a `ui.avviso` (gli avvisi si rileggono
  con `avvisi()`), e i timer `unref`, perche' un avviso da 20 s non tenga
  aperto il processo. Ha anche i costruttori dei dati: `servizio(id, {...})`,
  `cellaDi('1100', {rev})`, `bootstrapDi({...})` con la forma di
  `api.bootstrap`;
- la **rete non c'e'**: ogni file mette un `globalThis.fetch` che fallisce
  (le scritture restano in `rete.coda` e si guardano da li') o che risponde
  quello che il test decide. Nessuna chiamata a server.py ne' a Supabase;
- dove un modulo mescolava logica e DOM la logica e' uscita in una funzione
  esportata e pura: `giudicaFile` e `SOGLIE` in `ponte.js` (il giudizio sul
  file caricato), `totaliMesi` in `anno.js`. `app.js`, `gruppi.js` e `tour.js`
  toccano il DOM al caricamento e non si importano.

| file | cosa prova |
|---|---|
| `web-stato.test.mjs` | `CAMPI`/`PASSI`/`fatto()`, classi dei mesi (previsto, visita, prima-contratto, non-tracciato, stima, da-rinnovare), rinnovo automatico (giorno 31, febbraio, anni bisestili, service chiuso), ritardi, passi cumulativi e anno prima, conteggi e filtri, ruoli (`effettivo`, `prossimo`, `toccaPasso`), coda, risposte vecchie ed eco di Realtime, blocchi da 250 e blocco rifiutato, Annulla, diario, `cambiaAnno` (operatore nella domanda, errori, due cambi incrociati) |
| `web-affinita.test.mjs` | normalizzazione (accenti, maiuscole, sigle, "I"/"primo"), Damerau-Levenshtein, Dice, pesi di rarita', ricerca tollerante, doppioni, vuoti e nomi lunghissimi; i casi UMBERTO I / RIZZATO / KLINIC |
| `web-ponte.test.mjs` | riconoscimento del sito dal file: collegato da solo, lista dei probabili, nessuno; dal tracker il confronto relativo (`STACCO`) e mai l'esito muto |
| `web-anno.test.mjs` | totali per mese della testa, `passiMancanti`/`passiPresenti` delle azioni di massa, `mesePerStampa` ai confini dell'anno, un conto su 300 siti |

Una prova nuova: `tests/js/web-<cosa>.test.mjs`, con
`import { ... } from './web-ambiente.mjs'` come PRIMA riga di import.

## Cloud

Il giro online: `web/js/nuvola.js` (login, RPC, Realtime), la Netlify
Function `registra-utente.mjs`, il modello del registro dei componenti
(`web/registro/registro.js`) e il testo di `cloud/*.sql` e della
pubblicazione. Stesso motore delle prove JavaScript, zero dipendenze:

```
node --test "tests/js/cloud-*.test.mjs"
```

Come sono fatte:

- **niente Supabase e niente Netlify veri**. `fetch`, `localStorage`,
  `location` e `WebSocket` sono finti e li mette ogni file da se' (non usano
  `web-ambiente.mjs`); per avere una sessione pulita ogni prova importa una
  copia NUOVA di `nuvola.js` (`import('../../web/js/nuvola.js?n=' + n)`).
  `nuvola-config.js` resta quello vuoto del repository: gli indirizzi vanno a
  `/auth/v1/...` e `/rest/v1/rpc/...` e li risponde il finto `fetch`;
- la diretta usa gli orologi finti di `node:test` (`mock.timers`): i
  riagganci da 2-20 s e la sonda da 15 s passano in un istante;
- l'SQL non si esegue (Postgres qui non c'e'): `cloud-sql.test.mjs` legge i
  file e controlla le regole che si sono gia' rotte una volta - che le
  funzioni rimesse da `09` siano identiche a `02`/`03`, che nessuna chiami
  una funzione `pl_*` del Planning, che ogni SECURITY DEFINER fissi il
  `search_path`, che `09` non contenga scritture sui dati;
- la prova a mano della Function (`node netlify/prove/prova-registra-utente.mjs`)
  resta: `cloud-registra-utente.test.mjs` ne ripete i paletti e ne aggiunge.

| file | cosa prova |
|---|---|
| `cloud-nuvola.test.mjs` | token: un rinnovo solo per chiamate parallele, rete giu' o 5xx non buttano la sessione, 400 si', la sessione rinnovata da un'altra scheda; 401/403 dal database; stato dentro il JSON; `esci` revoca solo questa sessione; `localStorage` che lancia; `daQuando` (margine, confini di mese e anno) ed `eventiDaCelle` (a lotti) |
| `cloud-diretta.test.mjs` | `apriStream`: iscrizione, cella in diretta, riaggancio con recupero DOPO la conferma e dal minuto prima, battito col token nuovo una volta sola, diretta che riparte dopo il login, sonda a lotti dopo quattro cadute, chiusura |
| `cloud-registra-utente.test.mjs` | la service key parte solo dopo "admin" detto dal database col token di chi preme; ruoli strani, token scaduto, database giu', caselle non aziendali o somiglianti, password corta, JSON rotto, 409, chiave service sbagliata, variabile mancante, URL con la barra finale |
| `cloud-registro.test.mjs` | ordine naturale, piani numerici, slug, refusi, `interpretaRiga`, registro (quadratura, piani, tecnici per primi, legenda, quadro per priorita'), id univoci anche fra piani che lo slug schiaccia |
| `cloud-sql.test.mjs` | `09` fedele a `02`/`03`, niente `pl_*`, `search_path`, `autorizzato()` in testa alle funzioni esposte, `09` senza scritture, grant tolti ad `anon`, policy con `(select autorizzato())`; `netlify.toml`, `netlify-build.sh`, `nuvola-config.js` vuoto, `netlify/functions` solo con handler |

Una prova nuova: `tests/js/cloud-<cosa>.test.mjs`.
