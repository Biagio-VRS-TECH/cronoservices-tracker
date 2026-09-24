# Prove automatiche

Tutte le prove girano offline, senza installare niente, e non toccano mai i
dati veri: niente Access (`*.accdb`), niente `\\192.168.1.220`, niente
`data/cronoservice.db` ne' `data/prova.db`, niente Supabase. (Le sole prove
nel browser, `tests/e2e`, *leggono* `data/prova.db` per farne una copia
temporanea: l'originale non si scrive mai.)

Tutto in una volta, dalla radice (~3 minuti, di cui quasi tutti nel browser):

```
python -m unittest discover -s tests/python -t .
node --test "tests/js/*.test.mjs"
python -m unittest discover -s tests/e2e -t .
```

Al 23/09/2026 (ramo `debug-2026-09`): 324 Python, 368 JavaScript, 36 nel
browser, tutte verdi (prima della sessione erano 150 + 198).

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

Serve Python 3 (collaudato con 3.14); ~320 prove, una trentina di secondi.

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
| `test_py_spunte_casi_limite.py` | mese/anno/id fuori dominio (400, niente righe), NaN/Infinity e interi enormi, tipi sbagliati, nome operatore ripulito, niente righe vuote dopo un 409, archivio occupato = 503, Annulla per ruolo, contenuto del diario |
| `test_py_scadenze_casi_limite.py` | CSV senza formule (= + - @ TAB CR con l'apice, numeri negativi intatti), mese del CSV fuori dominio, date rotte che non fanno cadere l'export |
| `test_py_avvio_casi_limite.py` | `?anno=` enorme o strano, bootstrap ai confini dell'anno, ruolo di chi chiede |
| `test_py_documenti_difetti.py` | nomi oltre MAX_PATH in UTF-16, riservati di Windows, anno/id/pagine enormi, PDF troncato (senza `%%EOF`), anteprima con markup, archivio bloccato = 503 senza PDF orfano, disco pieno, corsa con la pulizia delle cartelle |
| `test_py_documenti_http.py` | server vero: nessun input strano sui documenti diventa 500 |
| `test_py_permessi_ruoli.py` | matrice tecnico/approvatore/admin sulle azioni da admin, PIN (anche 0 in config, tentativi in parallelo), `amministratori` scritto male in config, auto-promozione e ultimo admin |
| `test_py_presenze_input.py`, `test_py_diario_input.py`, `test_py_dizionario_input.py` | input non testo, tetti di lunghezza, id enormi, scritture in parallelo, seme uguale a `cloud/08` |
| `test_py_server_robustezza.py` | tetto sul corpo (413), chunked (411), timeout dei client lenti, BOM, NaN = 400, errori SQLite = 400, cartelle senza barra (301), porta presa fra controllo e bind, IPv6 |
| `test_py_sync_robustezza.py` | backup dell'archivio in uso (anche dal WAL), `backup_da_tenere: 0`, JSON temporaneo tolto anche col timeout, stderr OEM di PowerShell, riga singola, date non ISO, archiviati solo nuovi |
| `test_py_rete_robustezza.py` | datagrammi oltre 512 byte, URL ostili dalla rete (solo http/https), il primo server sa del secondo |
| `test_py_push_ritentativi.py` | tre tentativi solo su rete/timeout/5xx, niente sui 4xx, chiave fuori dal log, risposta non JSON |

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
| `web-stato-scritture.test.mjs` | doppio clic sullo stesso passo, blocco confermato da un'altra scheda, coda riapplicata al ricarico, nota in coda contro l'eco del collega, rifiuti senza cella, risposte arrivate dopo un cambio d'anno, azione di massa vuota, filtri coi chiusi |
| `web-api-coda.test.mjs` | 5xx/408/429 restano in coda (fino a 5 tentativi), 4xx con pagina HTML, ascoltatore che lancia, disco pieno sul bootstrap |
| `web-mese.test.mjs`, `web-spunte.test.mjs`, `web-stat.test.mjs`, `web-ui.test.mjs` | vista Mese e selezione multipla, nota salvata alla chiusura del popover, carta dei 4 passi e ritmo, date in quattro fusi e ora legale, dimensioni |
| `web-documenti.test.mjs`, `web-cassetto.test.mjs`, `web-albero.test.mjs` | PDF vuoto/enorme/non file fermato prima della rete, escape nei chip, BroadcastChannel chiuso, «Elimina» in due tempi, cerchio a tre stati |
| `web-documenti-registro.test.mjs`, `web-dizionario.test.mjs` | registro vero in un DOM finto: due file di fila, file tolto a metà lettura, file rotto dopo uno buono; campi del dizionario |
| `web-sw.test.mjs` | elenco del guscio contro i file su disco, installazione tutto-o-niente, niente `index.html` al posto di uno script |
| `web-tour.test.mjs`, `web-ponte.test.mjs`, `web-schede.test.mjs`, `web-condividi.test.mjs`, `web-precarico.test.mjs`, `web-icone.test.mjs`, `web-famiglia.test.mjs`, `web-coda.test.mjs`, `web-responsabile.test.mjs` | guida (selettori contro gli HTML, guida vuota), contesto dall'indirizzo e nome del PDF, lettura del file, copia che lancia, precarico, icone, famiglia, coda, responsabile |
| `web-comunicazioni.test.mjs` | Comunicazioni del Planning (`vrs-comunicazioni.js`) con risposte finte: righe rotte, ordine dei popup (alte prima, poi dalla più vecchia), funzioni assenti = tasto nascosto senza errori, rete giù, numero e nome del tasto, tempo reale che rilegge una volta per raffica, popup uno alla volta («1 di 2») che Esc e clic fuori non chiudono, spunta non registrata, spuntata altrove, casella con «Ho letto» bloccata e stato vuoto |

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
| `cloud-accesso.test.mjs` | pagina d'accesso con `localStorage` bloccato o pieno |
| `cloud-comunicazioni.test.mjs` | `idUtente` dal token, `rpcLibera` (404 di una funzione che manca, scalare com'è), `ascoltaRighe`: canale a sé col filtro, avviso a ogni cambio, riaggancio che avvisa una volta, iscrizione rifiutata che riprova |
| `cloud-sql.test.mjs` | `12`/`13`: search_path, niente scritture sui dati, niente `pl_*`, `_applica`/`imposta_nota` intatte, `ripristina_blocco` senza LIKE, `imposta_meta` 01-12, `_csv` con l'apice, `ruolo_corrente` con `autorizzato()`, lucchetto sugli admin attivi; `09` fedele a `02`/`03`, niente `pl_*`, `search_path`, `autorizzato()` in testa alle funzioni esposte, `09` senza scritture, grant tolti ad `anon`, policy con `(select autorizzato())`; `netlify.toml`, `netlify-build.sh`, `nuvola-config.js` vuoto, `netlify/functions` solo con handler |

Una prova nuova: `tests/js/cloud-<cosa>.test.mjs`.

## Nel browser (e2e)

L'app vera, come la usa una persona, in Chromium senza finestra (Python
Playwright: `pip install playwright` e `python -m playwright install chromium`;
se manca, le prove si saltano invece di fallire). Dalla radice:

```
python -m unittest discover -s tests/e2e -t .
python -m unittest tests.e2e.test_e2e_telefono
```

Circa 110 secondi. Stanno in una cartella a parte, quindi la discovery di
`tests/python` non le prende.

Come sono fatte (`tests/e2e/_server_e2e.py`):

- ogni classe copia `data/prova.db` in una cartella temporanea e avvia
  `app/server.py --no-sync --db <copia>` su una porta libera (mai
  8770/8771/8775), senza scoperta UDP e con Access puntato a un file che non
  esiste; alla fine chiude il server e toglie la copia. `app/config.json` non
  si tocca: il `pin_admin` delle prove sui ruoli va nella configurazione in
  memoria del server;
- ogni pagina raccoglie errori di console, eccezioni e richieste fallite: uno
  non previsto fa fallire la prova.

| file | cosa prova |
|---|---|
| `test_e2e_giro.py` | primo accesso, griglia e i quattro segmenti, popover (anche in fondo alla finestra), nota chiusa con Esc / clic fuori / Tab, pieghe dei clienti, Mese e selezione multipla, Statistiche, cambio anno, ricerca e filtri, azioni di massa con OK e Annulla (e senza niente da fare), Impostazioni, legenda e tasti, diario, PDF consegnato/aperto/eliminato, fascia rossa del doppio server (solo link http/https) |
| `test_e2e_rete.py` | server che cade (fascia arancione, spunta in coda) e torna (la coda si svuota); due schede e due operatori che si vedono via SSE |
| `test_e2e_ruoli.py` | tecnico contro admin, proposta e approvazione, 403 al tecnico, PIN giusto e rifiutato (Impostazioni non dicono "salvato") |
| `test_e2e_telefono.py` | 375×812 e 390×844 col tocco: niente scorrimento orizzontale, bersagli da 44 px, campi da 16 px, testata di una riga, barra multipla dentro lo schermo, popover a foglio dal basso |
| `test_e2e_generatori.py` | guida di schede e registro su computer e telefono (ogni passo ha un bersaglio o lo spiega a parole), dizionario del registro salvato sul server |

Una prova nuova: `tests/e2e/test_e2e_<cosa>.py`, con il server e il browser da
`_server_e2e.py`.
