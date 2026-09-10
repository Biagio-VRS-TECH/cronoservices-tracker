# SQLite e API

Schema completo: stringa `SCHEMA` in `app/db.py` (`#ANCHOR: db`). Qui il perche'
e il contratto degli endpoint.

## Tabelle

**Cache da Access** (riscritte a ogni sync, mai fonte di verita'):
- `clienti` — solo i 319 con service.
- `services` — un record per service. `mesi` = bitmask di 12 char `'0'/'1'`
  (indice 0 = gennaio). `mappatura`/`subappalto` = 0/1 (`mappatura` si importa ma
  **non si mostra piu' da nessuna parte**: vedi
  [decisioni.md](decisioni.md) punto 5). `archiviato = 1` se il
  service e' sparito da Access (non si cancella mai: le spunte restano leggibili).
  `data_inizio`, `data_scadenza`, `rinnovo_auto` e `causale_rinnovo` non sono
  decorazione: **sono cio' che rende diversi gli anni**, vedi
  [anno-e-tempo.md](anno-e-tempo.md).

**Dati nostri** (l'unica cosa che non si puo' ricostruire — trattare come sacra):
- `mappature` — PK `(id_service, anno, mese)`. Una colonna 0/1 per passo
  (`stampata`, `controllata`, `corretta`, `ricambi` — l'elenco autorevole e'
  `db.CAMPI`) + `nota` + `rev` + `updated_at` + `updated_by`.
  `ricambi` e' stata aggiunta il 2026-09-07 via `db.AGGIUNTE`: i DB esistenti la
  ricevono a 0, quindi **le mappature chiuse a tre passi risultano incomplete
  finche' non si spunta anche il quarto**. E' voluto: quel controllo non era
  stato fatto.
  **La riga si crea solo quando serve davvero**: un toggle a 0 su una cella
  inesistente risponde `gia-cosi` senza inserire nulla, altrimenti la tabella si
  riempie di righe tutte a zero. `nota()` invece la crea, perche' una nota senza
  spunte e' legittima.
  **La riga puo' esistere anche per un mese non piu' previsto in Access**: si
  chiama spunta *orfana*, si conserva e si segnala.
- `eventi` — log append-only (chi, quando, campo, da, a, `op_id`, `origine`).
  Alimenta la storia della cella e il diario. Non si potano.
- `ops` — `op_id` gia' applicati: e' l'idempotenza della coda offline.
- `operatori` — nome + ultimo accesso + `ruolo` ('admin' | 'approvatore' |
  'tecnico', #ANCHOR: ruoli). Il nome e' solo una firma e **dall'app non si
  cambia**; l'identita' e' la casella del login, ed e' li' che sta il ruolo.
  Nessuna password (scelta del committente): in locale il ruolo e' una convenzione,
  col seme `config.json["amministratori"]`; online e' legato alla casella.
  Due poteri distinti: `db.puo_approvare` (admin + approvatore) chiude le
  proposte, `db.e_admin` fa tutto il resto.
- `documenti`: `gruppo`, `fascicolo`, `fascicoli` legano gli N PDF di un documento diviso in fascicoli (NULL = PDF unico).
- I quattro campi di `mappature` valgono 0/1, ma `corretta` e `ricambi` anche
  **2 = proposta** di un tecnico in attesa di chi approva (`db.DA_APPROVARE`,
  `db.PROPOSTA`). "Fatto" e' solo `== 1`.
- `sync_log` — un record per sync con il diff.
- `meta` — chiave/valore: `ultimo_sync` e `inizio_tracciamento` (`AAAA-MM`, il
  mese da cui l'azienda registra le spunte qui).

## Regole di accesso

- `PRAGMA journal_mode=WAL` + `busy_timeout=15000`: molti lettori, uno scrittore.
- `db.sess()` e' un context manager che **chiude** la connessione (`sqlite3` con
  `with` fa commit ma non chiude: usare sempre `sess()`, mai `connect()` nudo,
  tranne dove serve gestire a mano `BEGIN IMMEDIATE`/`ROLLBACK`).
- Ogni scrittura sta dentro `with db.WRITE_LOCK:` + `BEGIN IMMEDIATE`. Il server
  e' l'unico scrittore, quindi il lock in-process basta; il `BEGIN IMMEDIATE`
  copre il caso di un secondo processo (es. `python sync.py` da riga di comando).

## Endpoint

Tabella di dispatch: `api.ROUTE` in fondo a `app/api.py`.
Firma di ogni handler: `(ctx, q, body) -> (status, payload, evento)`.
`evento` non nullo viene diffuso via SSE a tutti **tranne** il client che ha
scritto (esclusione per `client_id` nel body).

| metodo | rotta | note |
|---|---|---|
| GET | `/api/bootstrap?anno=` | tutto in un colpo: clienti, service, celle dell'anno, operatori, presenze, ultimo sync, `inizio_tracciamento`, `indirizzo_lan`, `altri_server`. ~545 service = payload piccolo, cachato in `localStorage` |
| GET | `/api/bootstrap` | tutto il necessario all'avvio. `?operatore=` per farsi dire il proprio `ruolo` (in locale; online lo decide la casella) |
| POST | `/api/toggle` | una spunta. Body: `id_service, anno, mese, campo, valore, base_rev, base_valore, op_id, operatore, client_id` |
| POST | `/api/bulk` | `celle: [...]`, una transazione; ogni voce ha il suo esito, un conflitto non blocca le altre |
| POST | `/api/nota` | nota libera sulla cella (max 500) |
| GET | `/api/storia?id_service&anno&mese` | ultime 50 modifiche della cella |
| GET | `/api/attivita?limit=` | diario globale con ragione sociale |
| GET | `/api/incongruenze?anno=` | aperti senza mesi, mesi != QVA, spunte orfane. **Nessuna vista lo chiama piu'** dalla 7a sessione (i tre pannelli sono stati rimossi, vedi decisioni.md 15b): resta perche' rimetterlo a schermo e' quindici righe |
| GET | `/api/export.csv?anno&mese` | CSV `;` + BOM (Excel italiano), una colonna per passo, piu' `Ruolo` (`MAPPATURA` / `visita`) |
| POST | `/api/operatore` | registra il nome, ritorna l'elenco, `ruoli` e il `ruolo` di chi chiama |
| POST | `/api/ripristina` | `{op_id}`: l'admin rimette a `da` tutti gli eventi di quel blocco (`op_id` o `op_id:*`), come nuovo blocco `ripristino` (#ANCHOR: ripristino). Ritorna `celle` per anno |
| POST | `/api/ruolo` | `{nome, ruolo}` con ruolo `admin|approvatore|tecnico`: un admin nomina o declassa (#ANCHOR: ruoli). 403 se non e' admin, 400 sull'ultimo admin o sui nomi di config.json |
| POST | `/api/ping` | presenza, TTL 45 s; ritorna chi e' collegato |
| POST | `/api/impostazioni` | per ora solo `inizio_tracciamento` (`AAAA-MM`) |
| POST | `/api/sync` | rilegge Access. Timeout client 300 s |
| GET | `/api/documenti?anno=` | i PDF delle schede: senza anno tutti, e' lo storico (#ANCHOR: documenti) |
| GET/POST | `/api/documento` | GET `?id=` scarica il file; POST archivia un PDF del generatore (base64, max 200 MB: `MAX_PDF`) e mette la spunta `stampata` |
| POST | `/api/documento_elimina` | `{id}`: un PDF solo. La spunta resta |
| POST | `/api/documenti_elimina` | in blocco, per fare spazio: `{anno}` (solo admin) **oppure** `{id_service}` (chiunque), mai insieme. Prima i file, poi le righe; le spunte restano. Ritorna `{eliminati, n, bytes}` |
| GET | `/api/stream?client_id=` | SSE. Eventi: `cella`, `celle`, `sync`, `presenze`, `documento`, `documenti` |

Il payload di una cella usa le sigle, non i nomi: `{s, c, k, r, rev, by, at,
nota}` (`_cella_out` in `api.py`, `SIGLA` in `stato.js`).

`esito` possibile in risposta a una scrittura: `ok`, `merge`, `gia-cosi`,
`replay`, `conflitto` (con HTTP 409).

## Server

`app/server.py`, `ThreadingHTTPServer`, `HTTP/1.1`, solo stdlib.
Ogni connessione SSE occupa un thread: adeguato a una decina di operatori, non a
centinaia. Keep-alive con un commento `: ping` ogni 20 s.

Statici: tutto sotto `web/`, con controllo di path traversal
(`f.startswith(WEB)`). `index.html` e `sw.js` vanno `no-store`, il resto
`no-cache` (rivalidazione): serve perche' il codice cambia spesso.

**Trappola Windows (risolta, non rimetterla):** `HTTPServer.allow_reuse_address`
e' 1 per default e su Windows permette a un **secondo** processo di legarsi alla
stessa porta senza errore: due server si contendono le richieste e il
comportamento diventa incomprensibile (visto davvero durante il collaudo: un
`api.py` corretto sembrava non applicato perche' rispondeva il processo vecchio).
Ora `main()` fa `porta_occupata()` prima di partire e imposta
`allow_reuse_address = False`. Se una modifica al server "non ha effetto", la
prima cosa da controllare e' quanti `python.exe` girano.

Avvio: `python server.py [--porta N] [--no-sync] [--verbose]`.
All'avvio fa un sync da Access se `config.json: sync_all_avvio` e' vero; se
Access non e' raggiungibile stampa un avviso e prosegue sulla cache.

## Se serve aggiungere un endpoint

1. Scrivi la funzione in `api.py` con la firma `(ctx,q,body)`.
2. Aggiungila a `ROUTE`.
3. Lato client usa `chiama()` di `web/js/api.js` (gestisce timeout e stato rete);
   se e' una **scrittura** passa da `accoda()` cosi' entra nella coda offline.

## Se serve cambiare lo schema

Non c'e' un sistema di migrazioni. Il meccanismo e': la riga va in `SCHEMA` (per i
DB nuovi) **e** nella lista `db.AGGIUNTE` (per quelli esistenti), che `db.init()`
applica con un `ALTER TABLE` in try/except su `sqlite3.OperationalError`.
Cosi' e' stato aggiunto `services.rinnovo_auto`. `data/backup/` contiene sempre
l'ultima copia buona.
