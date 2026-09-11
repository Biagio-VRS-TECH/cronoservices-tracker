# AI-HANDOFF — indice

**Questo file e' l'unico da leggere all'inizio di una sessione pulita.**

> **REGOLA: si lavora su branch, `main` lo tocca solo il committente.** Ogni
> lavoro nasce su un branch (`git checkout -b nome-parlante`) e finisce in un
> commit su quel branch: su `main` non si committa e non si pusha mai, se non
> dopo un "fai deploy" esplicito. Il perche' e' anche economico: `git push
> origin main` e' il deploy vero e costa 15 crediti Netlify a colpo, mentre il
> Deploy Preview che nasce da una pull request costa 0. Push del branch e
> apertura della PR: solo se lui li chiede.

Da qui si apre solo il file di `docs/ai/` che riguarda la modifica richiesta.
Non leggere il codice a blocco: usa la mappa e le ancore qui sotto.

---

## Cos'e'

Interfaccia web per la checklist delle **mappature service** di VRS Group.
Ogni mappatura si chiude in quattro spunte: `stampata` -> `controllata` (dal
tecnico) -> `corretta` ("mappatura completa rapportino") -> `ricambi`
("controllo ricambi e scadenze"). L'ordine e il numero stanno in un posto solo:
`CAMPI` in `web/js/stato.js` e `db.CAMPI` in `app/db.py`. Tutto il resto conta
`PASSI`, mai "tre". **Tre ruoli** (#ANCHOR: ruoli), il cui valore in database e'
`'admin' | 'approvatore' | 'tecnico'` ma che a schermo si leggono con
`ETICHETTA_RUOLO` (`tecnico` -> **"operatore"**): il **tecnico/operatore** spunta tutto,
ma `corretta` e `ricambi` restano **proposte** (valore 2); l'**approvatore** le
approva o le respinge e nient'altro; l'**amministratore** in piu' completa/azzera
in blocco, cambia le impostazioni, "Ripristina" dal diario (o lo **azzera**
tutto) e cancella i PDF di un anno intero (i PDF di un singolo sito li butta
chiunque). Le sue azioni in blocco partono solo dopo aver **scritto OK**
(#ANCHOR: conferma-ok).
Due poteri, due domande distinte: `possoApprovare()`/`puo_approvare()` e
`sonoAdmin()`/`e_admin()`. Il ruolo e' legato alla **casella del login**, mai al
nome, e il **nome non si cambia dall'app**. Un passo e' fatto solo se vale 1:
`fatto(c, campo)`, mai un truthy.

**Il concetto meno ovvio e' il tempo**: i mesi in Access appartengono al
contratto, non a un anno, e vanno calcolati per anno; `data_scadenza` non e' la
fine di un contratto a **rinnovo automatico** (e' la fine del termine in corso,
si rimanda avanti); e la mappatura e' **una per SITO per anno** (un service aperto = un impianto; non una per cliente e non una
per visita), con scadenza al primo mese di manutenzione di quel sito dentro il
contratto: in tutto l'anno un sito ha una sola cella `previsto`, ogni altro suo
mese di manutenzione e' una visita. Se la modifica riguarda celle, anni, ritardi
o conteggi, leggere prima [ai/anno-e-tempo.md](ai/anno-e-tempo.md).

Sorgente dati: `CronoServices_be.accdb` (backend Access di CronoServices, **sola
lettura, mai scritto**), dal 2026-09-09 sul percorso di rete
`\\192.168.1.220\DATI\AMMNE\TECH\CronoServices\`. **Quel file non va MAI
toccato**: `sync.estrai` lo copia in `%TEMP%` e apre la copia (#ANCHOR:
copia-access), cosi' sulla rete non nasce nemmeno il lock `.laccdb`. Le
spunte vivono in un SQLite separato.

Stack: **Python 3 solo stdlib** + SQLite + JS vanilla a moduli ES. Nessun `pip
install`, nessun `npm`, nessun passo di build, nessuna CDN: l'app deve partire
offline con un doppio clic su `avvia.bat`. I tre caratteri (Newsreader, Inter,
JetBrains Mono, `web/assets/fonti/`, `css/fonti.css`) sono serviti dal sito,
non da una CDN: offline funzionano lo stesso. L'unica eccezione, e sta fuori
dall'app, e' `netlify/functions/` (`decisioni.md` 23): un
file che gira sul server di Netlify perche' tiene un segreto - anche quello
senza dipendenze.

Se in macchina c'e' Node (non e' richiesto), `node --check` su un file JS dice
subito se e' rotto: comodo dopo una modifica a mano a `web/js/`.

**La stessa applicazione gira anche online** (Netlify + Supabase), con lo stesso
`web/` e senza build. Cambia solo il trasporto: `chiama('/api/...')` in
`web/js/api.js` parla con `server.py` oppure con Postgres (`web/js/nuvola.js`).
Interruttore: `web/js/nuvola-config.js`, vuoto = locale. Se la modifica riguarda
il giro online, leggere [cloud/LEGGIMI.md](../cloud/LEGGIMI.md) e
[ai/decisioni.md](ai/decisioni.md) 18.

---

## Mappa dei file

Righe indicative: servono a decidere se leggere tutto o solo una sezione con
`sed -n 'X,Yp'`.

### Backend `app/`
| file | righe | cosa contiene |
|---|---|---|
| `server.py` | 295 | HTTP + routing + file statici + hub SSE. Avvio: `main()` |
| `api.py` | 655 | tutti gli endpoint. Ogni handler: `(ctx,q,body) -> (status,payload,evento)` |
| `db.py` | 200 | schema SQLite (stringa `SCHEMA`), `sess()`, `WRITE_LOCK`, `CAMPI`, costanti mesi; `documenti.tipo`, `dizionario_componenti` + seme (#ANCHOR: dizionario) |
| `dizionario-seme.json` | - | le 24 voci del vocabolario dei componenti costruite col programma Python: si leggono una volta, a tabella vuota |
| `sync.py` | 208 | import Access -> SQLite, diff, backup |
| `export_access.ps1` | 57 | estrazione ADODB -> JSON. **Deve restare ASCII puro** |
| `rete_locale.py` | 113 | scoperta UDP di altri server Crono in LAN |
| `push_cloud.py` | 160 | Access -> Supabase, spinto dal PC dell'ufficio. #ANCHOR: push-cloud |
| `config.json` | 11 | percorsi, porta, sync all'avvio |
| `cloud.json` | - | credenziali Supabase, **solo sul PC dell'ufficio**, non nel repo |

### Frontend `web/`
| file | righe | cosa contiene |
|---|---|---|
| `index.html` | 127 | struttura statica di testa e barra strumenti (gli `id` sono il contratto con `app.js`; `#f-stato` = filtro di stato) |
| `js/app.js` | 938 | guscio: avvio, viste, filtri, tema, tastiera, operatore, sync, diario |
| `js/stato.js` | 827 | modello in memoria, `CAMPI`/`PASSI`, filtri, **unico varco per le scritture** (`spunta`) |
| `js/api.js` | 224 | fetch, coda offline, flusso, presenza. Sceglie il trasporto |
| `js/nuvola.js` | 342 | lato Supabase: login, rotte -> RPC, Realtime. #ANCHOR: nuvola |
| `js/nuvola-config.js` | 18 | indirizzo del database online. Vuoto = locale |
| `js/anno.js` | 500 | griglia cliente x 12 mesi (vista principale) |
| `js/mese.js` | 390 | foglio di lavoro del mese + azioni multiple |
| `js/stat.js` | 1283 | vista Statistiche: raccolta dei numeri, quadrante dell'anno, ritmo, lista di lavoro, grafici (torte comprese) |
| `js/cassetto.js` | 203 | pannello laterale di un service |
| `js/spunte.js` | 148 | popover della cella |
| `js/affinita.js` | 170 | somiglianza fra nomi scritti male (normalizzazione, Damerau-Levenshtein per parola, pesi di rarita'): ricerca, riconoscimento file nel generatore, doppioni. #ANCHOR: affinita |
| `js/documenti.js` | 420 | i PDF dei due generatori: modello, `TIPI` (`schede` \| `registro`, #ANCHOR: tipi-documento), un chip per tipo accanto al sito, apertura, consegna. #ANCHOR: documenti |
| `js/gruppi.js` | 80 | i gruppi del pannello dei generatori si aprono e chiudono (titolo = interruttore, `#grpTutti` li gira tutti); stato in localStorage. E l'ENTRATA a scalare (`entrataGruppi()`, anche a file caricato). Script classico. #ANCHOR: gruppi |
| `js/tour.js` | 190 | il TUTORIAL GUIDATO condiviso (`Tour.crea({passi, chiave, primaDi, dopo})`): velo, buco, fumetto, tasti. Script classico. #ANCHOR: tour |
| `js/albero.js` | 160 | l'albero piano > reparto > stanza con i cerchi a tre stati (`creaAlbero`), porting del buildTree delle schede: lo usa il registro. #ANCHOR: albero |
| `js/ponte.js` | 560 | il ponte GENERICO generatore -> tracker (`avviaPonte({tipo})`): testata di consegna, riconoscimento del sito dal file, PDF con html2canvas + jsPDF (`web/lib/`), consegna, nuvoletta. #ANCHOR: ponte |
| `schede/index.html` | 3720 | il **generatore di schede tecnici** (per i tecnici), pagina unica. Il guscio: `#app` non scorre, scorre solo `#banco`. Librerie, token dell'app e CSS del ponte sono fuori (vedi sotto). Il suo handoff e' `schede/HANDOFF.md` |
| `schede/ponte.js` | 35 | wrapper: `avviaPonte({tipo:'schede'})` + agganci a `loadRows`/`unloadFile`/`aggiornaTitoloSito` |
| `registro/index.html` | 208 | il **generatore del registro dei componenti** (il documento per il CLIENTE): stesso guscio delle schede, stessa testata `#ponte`. Handoff: `registro/HANDOFF.md` |
| `registro/registro.js` | 683 | porting 1:1 di `mappatura/registro/{lettura,modello}.py`: lettura dell'export, ordinamenti, legenda, quadro d'insieme, anomalie, quadratura. Nessun DOM |
| `registro/impagina.js` | 499 | il registro diventa `div.page` A4 nel DOM (impaginazione a mano, numeri di pagina del sommario, pie' di pagina) + la versione HTML digitale |
| `registro/app.js` | 428 | collante: file -> dizionario (`/api/dizionario`) -> registro -> pagine -> pannelli -> ponte; scheda "Nomi dei componenti" |
| `registro/registro.css` | 380 | l'app del registro (token del banco) e il DOCUMENTO (carta bianca in tutti e due i temi) |
| `lib/` | - | `xlsx.min.js` (SheetJS 0.18.5, era dentro schede/index.html), `html2canvas.min.js`, `jspdf.umd.min.js`: condivise dai due generatori |
| `js/ui.js` | 210 | icone, `h()`, avvisi, modale, formattatori, `frecceEntrano()` |
| `css/theme.css` | 240 | **solo token**: colori, i tre caratteri (`--f-display/--f-ui/--f-dato`), misure, segnali, vetro. Il marchio si cambia qui |
| `css/fonti.css` | 35 | i `@font-face` dei tre caratteri in `assets/fonti/`. #ANCHOR: fonti |
| `css/banco.css` | 250 | i token del **banco di lavoro** dei generatori (`--ui-*`, `--acc*`), derivati da theme.css; poi tutto cio' che le due pagine condividono: gruppi richiudibili, **barra del marchio** a due righe, `#side` a colonna con Esporta inchiodato in fondo, **colonna dell'albero**, **tutorial**. `--ui-0` e' esadecimale di proposito (html2canvas non legge `color-mix`). #ANCHOR: css-banco |
| `css/ponte.css` | 300 | la testata di consegna `#ponte` e la nuvoletta, condivisa dai due generatori. #ANCHOR: css-ponte |
| `css/base.css` | 428 | reset, testa, barra strumenti, linea di stato, diario, componenti comuni |
| `css/griglia.css` | 539 | carte cliente, cella a 4 segmenti, riga/carta "a posto", vista mese (pista dei mesi, capsula dei passi) |
| `css/stat.css` | 748 | griglia a 12 colonne, carte di vetro, quadrante dell'anno, ritmo, agenda, torte, barre, colonne, tooltip |
| `css/stampa.css` | 38 | foglio cartaceo |
| `sw.js` | 45 | service worker (guscio offline) |

`data/cronoservice.db` = dati applicativi. `data/documenti/<anno>/` = i PDF delle schede (locale). `data/backup/` = copie automatiche a
ogni sync (ne tiene 20).

### Serverless `netlify/functions/`
| file | cosa contiene |
|---|---|
| `registra-utente.mjs` | **l'unica cosa che non gira nel browser** (#ANCHOR: registra-utente): l'admin registra un collega. Tiene la service key di Supabase, ma il ruolo lo chiede al database col token di chi chiama. Un file, nessuna dipendenza |

In `netlify/functions/` ci va **solo roba con un handler**: Netlify pubblica come
funzione ogni file di quella cartella, e un file che funzione non e' fa fallire
il build con un `exit code: 2` che non dice quale sia. La prova sta apposta
fuori, in `netlify/prove/`.

### Prove `netlify/prove/`
| file | cosa contiene |
|---|---|
| `prova-registra-utente.mjs` | `node netlify/prove/prova-registra-utente.mjs`. Stubba `process.env` e `fetch`, non tocca niente di vero, esce 0 se e' tutto a posto |

### Online `cloud/`
| file | cosa contiene |
|---|---|
| `LEGGIMI.md` | la procedura passo passo: Supabase, utenti, Netlify, sincronia |
| `01-tabelle.sql` | le nove tabelle di `db.py` in Postgres |
| `02-funzioni.sql` | `_applica`, `toggle_cella`, `bulk_celle`, `imposta_nota` |
| `03-letture.sql` | `app_bootstrap` e le altre letture, CSV compreso |
| `04-sicurezza.sql` | RLS, permessi, pubblicazione Realtime |
| `05-sync.sql` | `sync_applica`: il gemello di `sync.esegui` |
| `06-documenti.sql` | tabella `documenti` (con `tipo`), bucket Storage, `registra_documento(..., p_tipo)` (gemello di `api.salva_documento`) |
| `07-ruoli.sql` | il primo amministratore (per casella). Gli altri si nominano dall'app |
| `08-dizionario.sql` | `dizionario_componenti`, `app_dizionario()`, `imposta_voce_dizionario()`, seme delle 24 voci (#ANCHOR: dizionario) |
| `installa-sync-cloud.cmd` | crea l'operazione pianificata delle 08:15 |
| `sync-cloud.cmd` | un travaso a mano |
| `netlify-build.sh` | scrive `nuvola-config.js` in pubblicazione |

`netlify.toml` sta nella radice: contiene anche il redirect
`/api/registra-utente` -> la Function, che deve stare **prima** del catch-all
verso `index.html`. La Function vuole `SUPABASE_SERVICE_KEY` fra le variabili
d'ambiente del sito (solo scope Functions): senza, il modulo dice
"configurazione incompleta". Vedi [../cloud/LEGGIMI.md](../cloud/LEGGIMI.md). Fuori dall'app: `docs/ai/valida-tavolozza.py` controlla le tavolozze dei grafici
(gemello Python dello script della skill `dataviz`, che e' in JS e qui non gira).
`.claude/launch.json` avvia il server per l'anteprima.

---

## Come muoversi senza leggere tutto

1. **Ancore.** `grep -rn "#ANCHOR" app web` da' la lista dei punti chiave con il
   numero di riga. Ancore esistenti: `db`, `sync`, `api`, `merge`, `server`,
   `sse`, `api-client`, `stato`, `toggle`, `ui`, `popover`, `cassetto`,
   `vista-anno`, `vista-mese`, `vista-stat`, `app`, `sw`, `rinnovo`,
   `filtro-stato`, `tema`, `css-base`, `css-griglia`, `css-stat`, `css-stampa`, `anno-modello`,
   `mappatura-anno`, `classe-mese`, `passi`, `passi-cumulativi`, `fuoco`, `massa`,
   `stato-collegamento`, `scoperta`, `nuvola`, `push-cloud`, `documenti`, `ponte`,
   `ponte-schede`, `affinita`, `ruoli`, `approvazioni`, `ripristino`, `copia-access`,
   `conferma-ok`, `mese-stampa`, `tipi-documento`, `dizionario`, `fonti`,
   `css-banco`, `css-ponte`, `gruppi`, `tour`, `albero`, `onda-massa`.
2. **Ogni file ha un solo compito** e un commento di testa che lo dichiara: leggi
   il commento di testa (prime ~10 righe) prima di aprire il resto.
3. **Non re-interrogare Access.** Lo schema, i valori reali e le trappole sono in
   [ai/dati-access.md](ai/dati-access.md). Sondarlo di nuovo costa molte chiamate.
4. **I nomi sono in italiano** (dominio e interfaccia). Restare coerenti.

## Quale file di approfondimento aprire

| se devi... | leggi |
|---|---|
| toccare celle, anni, ritardi, conteggi, stime | [ai/anno-e-tempo.md](ai/anno-e-tempo.md) |
| capire lo schema Access, i valori, le trappole di encoding | [ai/dati-access.md](ai/dati-access.md) |
| toccare tabelle SQLite o un endpoint | [ai/sqlite-e-api.md](ai/sqlite-e-api.md) |
| toccare concorrenza, coda offline, SSE, conflitti | [ai/concorrenza.md](ai/concorrenza.md) |
| toccare layout, CSS, viste, comportamenti UI | [ai/frontend.md](ai/frontend.md) |
| scrivere o rivedere interfaccia: tastiera, focus, moduli, stati, contrasto | [../AGENTS.md](../AGENTS.md) |
| sapere perche' una scelta e' stata fatta cosi' | [ai/decisioni.md](ai/decisioni.md) |
| toccare i grafici, le torte o la vista Statistiche | [ai/frontend.md](ai/frontend.md#la-vista-statistiche) + skill `dataviz` |
| sapere cosa manca / cosa e' rimasto in sospeso | [ai/da-fare.md](ai/da-fare.md) |
| toccare il giro online (Supabase, Netlify, sincronia) | [../cloud/LEGGIMI.md](../cloud/LEGGIMI.md) + [ai/decisioni.md](ai/decisioni.md) 18 |

---

## Stato al 2026-09-11 (31a sessione)

Branch `registro-componenti-premium` (il terzo giro sullo stesso lavoro).
Quattro richieste dopo la seconda prova; dettaglio in
[ai/da-fare.md](ai/da-fare.md#fatto-il-2026-09-11-31a-sessione---il-quadro-che-si-accavallava-e-tre-animazioni).

**Il quadro d'insieme non si accavalla piu'** (`misureQuadro` in
`web/registro/impagina.js`): le colonne dei piani erano tutte da 11,5mm con
`white-space:nowrap`, e su una tabella `table-layout:fixed` un'intestazione
piu' larga non stringe niente - sborda e si sovrappone alla vicina (CASA DI
RIPOSO UMBERTO I: "INTERRATO", "NUOVO NODO"). Ora le larghezze si MISURANO con
un righello fuori schermo che ha il CSS vero del documento: ogni colonna e'
larga quanto la parola piu' lunga della sua intestazione (che va a capo fra le
parole), il resto va ai nomi dei componenti, e se i piani sono tanti le colonne
si stringono in proporzione lasciandone sempre 42mm ai nomi.

**Il libretto del registro mostra il SUO documento.** La carta del registro era
scritta `#pages .page`, e i cloni del libretto (js/ponte.js) stanno FUORI da
`#pages`: uscivano nudi, testo minuscolo e nessuna impaginazione. La carta ora
si chiama **`.pages .page`** (classe, non id: `<div id="pages" class="pages">`)
e i cloni si portano dietro le classi e le variabili del contenitore. Il
libretto delle schede non e' stato toccato: li' la carta era gia' `.page`.

**Due animazioni nuove.** Nel tracker, dopo un **Completa tutte** o un **Azzera
tutte** un fronte di luce attraversa la griglia e le celle toccate che si
vedono si accendono (verde) o si spengono (ambra) al suo passaggio: prima
centinaia di spunte comparivano senza un movimento (`onda()` in `js/anno.js`,
#ANCHOR: onda-massa; CSS in `css/griglia.css`). Nei generatori i **gruppi del
pannello entrano a scalare** all'apertura e di nuovo quando un file carica e si
riempiono (`entrataGruppi()` in `js/gruppi.js`, CSS in `css/banco.css`).
Tutte e due rispettano `prefers-reduced-motion`.

**Seconda passata, stesso giorno: le azioni di massa.** *Azzera tutte*
lasciava indietro le spunte sulle celle **orfane** (un mese che oggi non e'
piu' previsto) e sui siti chiusi: `passiPresenti` (`js/anno.js`) guardava solo
le celle `spuntabile` di un service `APERTO`, e da li' non si tornava piu'
indietro. Ora toglie tutto quello che c'e' su quello che si sta vedendo (i
filtri restano l'unico confine); `passiMancanti` non cambia, perche' completare
un mese non previsto creerebbe altre orfane. E la griglia **si ridisegnava una
volta per blocco** da 250 (11 volte su 2364 spunte): ora i blocchi non spezzano
mai una cella, `esitoConferma` confronta lo stato prima/dopo il blocco
(`cambiaAVista`) e ridisegna solo se il server ha detto qualcosa di diverso -
un ridisegno in tutto.

Service worker `crono-guscio-v26`.

## Stato al 2026-09-11 (30a sessione)

Branch `registro-componenti-premium` (lo stesso della 29a: sono correzioni a
quel lavoro). Undici punti segnalati dal committente dopo la prova; dettaglio
in [ai/da-fare.md](ai/da-fare.md#fatto-il-2026-09-11-30a-sessione---undici-difetti-dopo-la-prova).

**Nel tracker**: "Mostra chiusi" ora si accende (`.pill.debole` vinceva su
`[aria-pressed]`: stessa specificita', scritta dopo); nel cassetto i PDF
stanno in **due gruppi per tipo** (schede per i tecnici, registro per il
cliente), ognuno col suo occhiello e il conto.

**Nei generatori**: la barra del marchio e' su **due righe** (`.bb-riga` con
il bottone **Tracker** per tornare indietro, la guida, apri/chiudi tutti i
gruppi, giorno/notte; sotto logo e nome) e sta **sopra** il ponte (z 40 contro
il 38 della nuvoletta): a pannello stretto e scorrendo non si accavalla piu'
niente. `#side` e' una colonna flex: **Esporta resta inchiodato in fondo**
anche a gruppi chiusi (`margin-top:auto` + sticky). **"Salva nel tracker" non
c'e' piu'**: Esporta e salva fa tutto (il PDF si scarica e si consegna; si
interrompe dal libretto o con Esc). Nelle schede la barra nativa del banco si
toglie quando c'e' quella blu (`body.ds-attiva`, `syncNativeScrollbar`).
Tutto cio' che le due pagine condividono e' uscito da `schede/index.html`:
`css/banco.css` (barra, albero, tutorial), `js/tour.js` (il motore della
guida), `js/albero.js` (l'albero).

**Nel registro**: la **colonna dell'albero** (`#treecol`, 4 - Cosa entra nel
registro) toglie piani, reparti o stanze dal documento filtrando le righe
PRIMA del modello (le righe dati scendono dello stesso numero: quadratura
onesta; il nome salta alla pagina); il **tutorial** in dodici passi con un
esempio che si carica da solo; e la scheda "Nomi dei componenti" **non
rigenera piu' le pagine a ogni nome salvato** (misurati 140 ms di blocco su
122 pagine: il "tremolio"): si segna `pagineDaRifare` e si impagina tornando
all'anteprima o esportando (`assicuraPagine`, anche nel `pagine()` del
ponte). Service worker `crono-guscio-v25`.

## Stato al 2026-09-11 (29a sessione)

Branch `registro-componenti-premium`. Una richiesta in tre parti; dettaglio in
[ai/da-fare.md](ai/da-fare.md#fatto-il-2026-09-11-29a-sessione---il-registro-dei-componenti-entra-nellapp-un-ponte-solo-un-look-solo),
[ai/decisioni.md](ai/decisioni.md) 25.

**Il Registro dei componenti entra nell'app** (`web/registro/`): il documento
per il CLIENTE che elenca i componenti installati e dove stanno, prima solo
programma Python sul PC dell'ufficio (`Desktop/Claude/mappatura`). Stessa
logica portata in JS (`registro.js`), impaginazione A4 fatta a mano nel DOM
(`impagina.js`, numeri di pagina veri nel sommario, nessuna stanza spezzata),
PDF raster con lo stesso motore delle schede. Provato: RIZZATO 4 pagine, CASA
GEROSA 12, sintetico da 3200 righe 122 pagine in 91 ms, quadratura OK su tutti.

**Il bottone "Schede tecnici" e' diventato "Genera PDF"** (`#documenti`), un
menu a due voci; nel cassetto i due generatori partono gia' puntati sul sito.
**Un ponte solo** (`web/js/ponte.js`, `avviaPonte({tipo})`), un CSS
(`css/ponte.css`), i token del banco derivati da theme.css (`css/banco.css`),
le librerie in `web/lib/` (SheetJS estratto da schede/index.html).

**`documenti.tipo`** = `'schede'` | `'registro'` (#ANCHOR: tipi-documento): il
registro si archivia sul sito **senza spunta** (lo decide il server, in
`salva_documento` e `registra_documento`); due icone accanto al sito (foglio
cyan = schede, libretto grafite = registro). **Dizionario condiviso**
(`dizionario_componenti`, `/api/dizionario`, #ANCHOR: dizionario) al posto del
JSON locale, seminato con le 24 voci esistenti.

**Look premium unico**: tre caratteri self-hosted (`css/fonti.css`), palette
rivista in theme.css (inchiostro grafite-navy, un accento solo), carte dei
documenti con la miniatura grande, stesso logo `/assets/logo.webp` in tracker,
schede e registro. Contrasti AA riverificati, `valida-tavolozza.py`
riallineato (superficie scura `#14191E`, oro del primo passo).

**Da rieseguire su Supabase, in ordine: `06-documenti.sql` (di nuovo, firma
nuova di `registra_documento`) poi `08-dizionario.sql` (nuovo).** Trappola
pagata: html2canvas non legge `color-mix()` sul fondo di `body`/`#app` - a tema
chiaro il PDF moriva - quindi `--ui-0` e' esadecimale. Service worker
`crono-guscio-v24`.

## Stato al 2026-09-10 (28a sessione)

Branch `ruoli-falla-cambio-nome`. Cinque richieste; dettaglio in
[ai/da-fare.md](ai/da-fare.md#fatto-il-2026-09-10-28a-sessione---si-scrive-ok-la-riga-del-cliente-si-legge-il-pdf-guarda-avanti).

**Si scrive OK** (#ANCHOR: conferma-ok, `campoOK` in `web/js/ui.js`): tutte le
azioni in blocco dell'amministratore - Completa tutte, Azzera tutte, *Azzera il
diario attivita'*, *Cancella i PDF* di un anno - tengono il bottone spento
finche' non c'e' scritto OK. Il campo sta dentro la finestra che c'e' gia', non
in una seconda: il conto esatto resta sotto gli occhi. Il "Sicuro?" a due tempi
dello *Spazio dei PDF* non c'e' piu' (lo si prendeva col secondo clic di fila),
e `modale()` ora da' i tasti solo al foglio davanti.

**Azzera il diario attivita'** (nuovo, solo admin): `POST /api/diario_azzera` /
`azzera_diario()`. Butta tutte le righe di `eventi`; spunte, note e PDF
restano, i "Ripristina" no. **Da rieseguire su Supabase, in ordine:
`03-letture.sql` e `04-sicurezza.sql`.**

**La riga del cliente non ha piu' niente nei mesi**: via la barretta in
percentuale, e via anche la capsula a quattro segmenti che l'aveva sostituita
per qualche ora ("non serve"). Restano dodici `.q` vuoti per l'allineamento.

**Un segmento o e' del suo colore o e' vuoto** (seconda passata, stesso
giorno): ereditato (`data-x="2"`) e proposto (`3`) si disegnano **come il
fatto** - il tenue e le righe erano illeggibili. E il passo ereditato **si
toglie da dove sei**: `toccaPasso` in `stato.js` lo toglie dal mese in cui era
stato messo, invece dell'avviso "vai su quel mese".

**I quattro colori non si vedevano da mesi** (terza passata): `stat.css` aveva
un suo `.seg` che schiacciava a larghezza zero i segmenti di ogni cella - ora
`.passi-mini`. E `--st-stampata` da grigio e' diventato **oro**: quattro
colori veri, `--cl-pretrac` resta grigio. **Prima di battezzare una classe,
`grep` in tutti i CSS**: `riepilogo`, `seg` e per poco `capsula-cli` erano gia'
presi.

**Il PDF mette "stampata" sulla prima visita IN ARRIVO** (#ANCHOR:
mese-stampa, `mesePerStampa` in `web/js/stato.js`), mai su un mese passato,
anche se la mappatura e' in ritardo.

**Via il bottone "Sincronizza da Access"**: online non funzionava, in locale il
server rilegge all'avvio e il PC dell'ufficio spinge alle 08:15. `/api/sync`
resta ma non lo chiama piu' nessuna schermata.

**"Come si legge" rifatta** con la leggenda nuova: passo ereditato, passo
proposto, la riga del cliente e la regola del PDF.
Service worker `crono-guscio-v23`.

## Stato al 2026-09-10 (27a sessione)

Controllo finale e **deploy** (il primo dopo la 24a: porta online 25a, 26a e
questa). Dettaglio in
[ai/da-fare.md](ai/da-fare.md#fatto-il-2026-09-10-27a-sessione---il-controllo-finale-prima-del-deploy).
Tre revisioni (correttezza, semplificazione, accessibilita') e un collaudo nel
browser su una copia di `data/prova.db`. Chiusi: il client locale **non
ascoltava** gli eventi SSE `ruoli/impostazioni/documento/documenti`
(`apriStream`); il **proprio ruolo** ora si riaggiorna dal vivo all'evento
`ruoli` (in locale); la cancellazione in blocco dei PDF fa **prima la RPC, poi
il bucket**; il rollback del PDF solo se il server ha detto no; il nome
disambiguato non si perde offline; cache bootstrap `v2`; la Function non
scambia un errore della service key per una sessione scaduta;
`netlify-build.sh` fa `unset SUPABASE_SERVICE_KEY`. Accessibilita': fuoco che
torna (modale, menu, popover, cassetto), Tab intrappolato nella modale, frecce
nel menu, etichette sugli input, contrasti AA (`--tenue-2`, `--su-allerta`,
`--marchio-scuro` al posto di `--marchio` come testo), bersagli a 24px.
`SIGLA_RUOLO` e `dimensione()` (virgola) in un posto solo. La decisione della
26a e' rinumerata **24**. SQL `03` e `06` **applicati** dal committente. Dopo il
deploy: "Azzera tutte" collaudato (mostrava un "null": `modale()` ora salta i
figli nulli) e **produzione azzerata** su richiesta (`eventi`, `ops`,
`mappature`, `documenti`; `meta` e `operatori` intatti).
Service worker `crono-guscio-v19`.

## Stato al 2026-09-10 (26a sessione)

Branch `ruoli-falla-cambio-nome`, lo stesso della 25a (il deploy non e' ancora
stato fatto). Dettaglio in
[ai/da-fare.md](ai/da-fare.md#fatto-il-2026-09-10-26a-sessione---i-pdf-grandi-entrano-si-aprono-in-fretta-e-non-lasciano-orfani),
[ai/decisioni.md](ai/decisioni.md) 24 (che **rovescia la 21**).

**Il tetto dei PDF sale a 200 MB** (#ANCHOR: documenti): l'organizzazione e'
sul piano **Pro**, quindi il motivo per tenerlo a 40 e' caduto - ma un tetto
resta, perche' senza un errore del generatore caricherebbe qualunque cosa. Il
numero vive in `MAX_PDF` (`app/api.py`) e nel `file_size_limit` del bucket
(`cloud/06-documenti.sql`); il ***Global file size limit* del progetto ha la
precedenza e va messo a mano a 250 MB** dal dashboard, prima di rieseguire il
06. **La qualita' non si tocca**: `SCALA = 3` (288 dpi) resta, e cade la scala
adattiva che la 21 proponeva. **Piu' veloce senza toccare la resa**:
`cache-control` di un anno `immutable` in `caricaOggetto` piu' la firma che
dura otto ore e che `urlDocumento` **si tiene** - da sole non servivano, perche'
la cache ha per chiave l'indirizzo e ogni firma ne conia uno nuovo.
**L'errore dice cosa fare** (dividere in fascicoli) invece del testo inglese
dello Storage. **Niente di nuovo per chi usa l'app.**

**Chiuso il buco degli orfani**: `salvaDocumento` caricava e poi registrava, e
un fallimento della registrazione lasciava un file che l'app non mostra. Ora il
caricamento **si disfa**. I tre orfani trovati (73 MB sotto `2026/556/`)
venivano da tre `registra_documento` a **403** durante la riapplicazione
dell'SQL della 25a - letto nei log edge, non dedotto; i grant oggi sono a
posto. **Da fare a mano**: rieseguire `06` e cancellare i tre file dal pannello
Storage (non con una DELETE su `storage.objects`, che lascia il file).
Service worker `crono-guscio-v18`.

## Stato al 2026-09-10 (25a sessione)

Branch `ruoli-falla-cambio-nome` (dettaglio in
[ai/da-fare.md](ai/da-fare.md#fatto-il-2026-09-09-25a-sessione---la-falla-del-cambio-nome-e-il-terzo-ruolo),
[ai/decisioni.md](ai/decisioni.md) 22). **Chiusa una falla nei permessi**
(#ANCHOR: ruoli): `imposta_operatore` (`cloud/03-letture.sql`) si prendeva la
riga di un collega omonimo con `on conflict (nome)`, quindi bastava rinominarsi
come l'amministratore per declassarlo; e il client ricavava il proprio ruolo da
`st.ruoli[rete.operatore]`, cioe' dal nome digitato. Ora il ruolo lo dice il
server (`ruolo_corrente()` / `db.ruolo_di`, campo `ruolo` nel bootstrap), la
riga di un'altra casella non si tocca mai, e **il campo per cambiare nome non
c'e' piu'**: `#io` apre una scheda in sola lettura, la riga in `operatori` nasce
al login. **Terzo ruolo `approvatore`**: approva `corretta`/`ricambi` e basta.
`_valore_per_ruolo`/`_applica` portano `p_approva` e `p_admin` separati (vecchie
firme droppate). **SQL gia' applicato su Supabase** (migrazioni `ruoli_25a_*`) e
verificato in produzione con una prova che rifa' l'attacco e si annulla da sola.

Poi, nello stesso branch: **`'tecnico'` a schermo si legge "operatore"**
(`ETICHETTA_RUOLO`, il valore in database non cambia) e **l'amministratore
registra un collega dall'app** (#ANCHOR: registra-utente), con il primo pezzo
che non gira nel browser - `netlify/functions/registra-utente.mjs`, che tiene la
service key ma il ruolo lo chiede al database col token di chi preme. Richiede
`SUPABASE_SERVICE_KEY` fra le variabili del sito Netlify: **gia' impostata**, e
il giro verificato sul Deploy Preview. Il `web/` e' ancora da deployare (il
merge su `main` e' il deploy vero, lo chiede il committente).
Service worker `crono-guscio-v17`.

## Stato al 2026-09-09 (24a sessione)

Branch `cancella-pdf-in-blocco` (dettaglio in
[ai/da-fare.md](ai/da-fare.md#fatto-il-2026-09-09-24a-sessione---cancellare-i-pdf-in-blocco-per-fare-spazio),
[ai/decisioni.md](ai/decisioni.md) 21). **Cancellazione dei PDF in blocco**
per fare spazio (#ANCHOR: documenti): `/api/documenti_elimina` /
`elimina_documenti(p_anno, p_id_service)` - un **anno** intero solo per
l'amministratore (Azioni > Impostazioni > *Spazio dei PDF*, con quanti PDF e
quanti mega per anno), un **sito** per chiunque (*Elimina tutti* nel
cassetto). Le spunte "stampata" restano. Prima i file, poi le righe;
`nuvola.eliminaOggetti` cancella gli oggetti del bucket a lotti di 100.
**Da rieseguire su Supabase: `06-documenti.sql`.** Il tetto dei 40 MB per PDF
e' nostro (bucket + `api.py`), non del piano Supabase: vedi decisione 21.
(Alla 26a sessione e' salito a **200 MB**: decisione 24.)

## Stato al 2026-09-09 (23a sessione)

Branch `anteprima-rete-blocchi-pdf` (dettaglio in
[ai/da-fare.md](ai/da-fare.md#fatto-il-2026-09-09-23a-sessione---access-dalla-rete-ripristino-a-blocchi-pdf-a-288-dpi-e-in-fascicoli)).
**Access dalla rete**, letto da una copia in `%TEMP%` (#ANCHOR: copia-access in
`app/sync.py`). **Ripristino a blocchi** (#ANCHOR: ripristino): ogni cella di
`spuntaMolte` porta `op_id = <blocco>:<n>`; `/api/ripristina` /
`ripristina_blocco` rimettono tutto il blocco a `da`, e il diario mostra il
blocco come una riga con *Ripristina il blocco*. **PDF a scala 3** (288 dpi,
~300 KB/pagina, tempo uguale) e **un PDF per fascicolo** con lo stesso
`gruppo` (`documenti.gruppo/fascicolo/fascicoli`): il cassetto li mostra come
un documento in N parti (`gruppiDocumenti` in `documenti.js`). SQL 01-04, 06 e
07 **eseguiti** su Supabase dal committente; tutto **verificato online** in
produzione (deploy `0b8ad52`). Sincronia Access -> Supabase alle **08:15** dal
PC dell'ufficio. Service worker `crono-guscio-v15`.

## Stato al 2026-09-09 (22a sessione)

Una richiesta in quattro parti (dettaglio in
[ai/da-fare.md](ai/da-fare.md#fatto-il-2026-09-09-22a-sessione---due-ruoli-lamministratore-approva-azzera-sincronizza-ripristina),
[ai/decisioni.md](ai/decisioni.md) 20).

**Ruoli** (#ANCHOR: ruoli): `operatori.ruolo` = 'admin' | 'tecnico'. Locale:
seme in `config.json["amministratori"]` + `/api/ruolo`; online: legato alla
casella (`e_admin()`), primo admin con `cloud/07-ruoli.sql`, poi Azioni >
Impostazioni > *Chi e' amministratore*. Il bootstrap porta `ruoli`;
`sonoAdmin()` in `stato.js`. **Approvazioni**: `corretta`/`ricambi`
(`DA_APPROVARE`) valgono 0/1/**2 = proposta**; la traduzione intenzione ->
valore e' `_valore_per_ruolo` (api.py, 02-funzioni.sql) e `effettivo()`
(stato.js); un tecnico non toglie un 1 su quei campi (403 `vietato`). A
schermo: segmento a righe `data-x="3"`, `.passo.proposto` /
`aria-checked="mixed"`, pillola ambra `#approva` -> modale *Da approvare*
(#ANCHOR: approvazioni in `app.js`). **Solo admin**: Completa/Azzera tutte
(`origine:'massa'`), Sincronizza, Impostazioni, e **Ripristina** su ogni riga
del diario/storia (`ripristina(e)`, `origine:'ripristino'`); `storia` e
`attivita` portano `da` e `origine`, `descriviEvento(e)` li racconta.

**Da rieseguire su Supabase, in ordine**: `01`, `02` (drop della vecchia
`_applica`), `03`, `04`, poi `07-ruoli.sql` con la casella dell'admin.
Provato in browser su `data/prova.db` (porta 8775). Service worker
`crono-guscio-v14`. Le cose lasciate fuori (identita' locale senza password,
ripristino della nota, undo di un blocco intero) sono in da-fare.md.

## Stato al 2026-09-09 (20a sessione)

Nove richieste (dettaglio in
[ai/da-fare.md](ai/da-fare.md#fatto-il-2026-09-09-20a-sessione---i-passi-si-accumulano-chi-ha-aperto-cosa-esporta-e-salva),
[ai/decisioni.md](ai/decisioni.md) 19 e 15l).

**I passi si accumulano** (#ANCHOR: passi-cumulativi in `web/js/stato.js`): un
passo messo a maggio vale anche alla visita di settembre, e una mappatura
rimasta aperta a dicembre porta i suoi passi nell'anno dopo (se era chiusa si
riparte). `mappaturaSito().passi` e' l'unione per campo; `statoCella()` da'
`ered`, `mie`, `n`. La cella porta l'ereditato come `data-x="2"` (dalla 28a
disegnato **uguale** al fatto), il popover/Mese/cassetto lo mostrano spuntato
con dove e' stato fatto, e **un clic lo toglie da li'** (`toccaPasso`). Il
bootstrap porta `celle_prec` (l'anno prima). Leggere
[ai/anno-e-tempo.md](ai/anno-e-tempo.md) prima di toccare i conteggi.

**Chi ha aperto cosa** (#ANCHOR: fuoco): il `dove` della presenza porta la cella
aperta (`"2026-09 @22-12"`); in locale il ping la diffonde via SSE quando
cambia, online viaggia anche in broadcast Realtime (`nuvola.trasmetti`). A
schermo: anello del colore del collega + iniziali sulla cella (Anno) e sulla
scheda (Mese). La pillola bianca era `.eco-nome` col testo bianco su inchiostro
chiaro nel tema scuro. **Esci** (`#esci`) accanto a "collegato", solo online.

**Lo storico dei PDF non ha anno**: bootstrap e `/api/documenti` portano tutti
i documenti; chip tenue (`.altro-anno`) se l'ultimo e' di un altro anno.

**Generatore**: in modalita' libro il pareggio delle pagine iniziali e' una
pagina bianca dichiarata, non da compilare. Il bottone e' **Esporta e salva**:
PDF con jsPDF, scaricato e consegnato al tracker; la finestra di stampa del
browser (che metteva l'indirizzo netlify.app su ogni foglio) resta su Ctrl+P.
Scala 2 / JPEG 0,74: risoluzione +33% a tempo uguale, ~230 KB a pagina.

**Da rieseguire su Supabase**: `cloud/03-letture.sql` e `cloud/06-documenti.sql`.
Provato in browser su una **copia** del `.db` (`server.py --db`, configurazione
`crono-prova`, porta 8775). Il service worker passa a `crono-guscio-v13`.
Attenzione: con `core.autocrlf=true` alcuni file della copia di lavoro sono
CRLF (`web/js/api.js`, `docs/ai/frontend.md`, `docs/ai/decisioni.md`) e gli
altri LF: guardare il fine riga prima di patchare per sostituzione esatta.

## Stato al 2026-09-08 (18a sessione)

Cinque richieste (dettaglio in
[ai/da-fare.md](ai/da-fare.md#fatto-il-2026-09-08-18a-sessione---la-testata-del-ponte-il-titolo-dal-sito-i-conflitti-sulla-nota),
[ai/decisioni.md](ai/decisioni.md) 15j, 15k e 7).

**Il dock del generatore non galleggia piu': e' la testata della colonna.** Il
difetto non era lo `sticky`, era che sotto non scorreva niente: `#main` ha
`overflow:auto` (serve allo zoom) quindi lo sticky si agganciava al suo riquadro
di scorrimento, che pero' non scorre mai perche' a scorrere era la finestra
intera. Ora `#app` occupa la finestra e non scorre, `#main` e' una colonna, e
l'unico riquadro che scorre e' **`#banco`** (le pagine e la schermata iniziale).
La barra sta **fuori** da quel riquadro: resta in vista da sola e non copre
nessuna pagina in nessun punto - le due meta' della richiesta si risolvono con
la stessa cosa. `scrollBox()` e le due guide `fixed` (scaffale dei fascicoli,
barra di scorrimento) si misurano sul banco, e `--banco-top` le centra sulla
colonna invece che sulla finestra.

**Rinnovata di conseguenza**: tre gradi di lettura in colonna (rotta in
monospazio, nome del sito a 16,5 px, dati in una riga **che va a capo**) al
posto di sei cose in fila su un rigo solo tutte tagliate coi puntini - erano
quelli a mangiare gli indirizzi lunghi. Un segnale solo, e uno solo si muove: la
**spina** di 3px sul bordo sinistro, al posto del led e del "cavo". La **fascia**
in basso compare solo quando c'e' qualcosa da dire e durante il lavoro e' anche
l'avanzamento. Da ~150 px sempre accesi a 74 a riposo / 119 con un esito.

**Scorrendo la testata si stringe fino a diventare una nuvoletta sospesa** (872
x115 px → 388x38), e le pagine le passano sotto. Non e' un secondo stato: e' un
**cursore**, `--r` da 0 a 1 mosso dallo scorrimento, con tutta la forma
interpolata in CSS - larghezza, altezza, raggio, ombra, corpo del testo, spina
che diventa punto. La banda si chiude da se' perche' la testata resta nel
flusso. La regola "non copre il PDF" resta per la testata larga; da ridotta il
committente ha preferito la pillola sospesa. Non si stringe senza sito, con la
lista dei probabili aperta, o mentre prepara il PDF. Le tre trappole da non
ripetere (ResizeObserver che si morde la coda, `line-height:0` che non chiude
le icone, ordine delle regole) sono in `web/schede/HANDOFF.md`.

**Il titolo del documento viene dal sito collegato** (`#titleFromSite`, terza
sorgente accanto a "prima cella del foglio" e "nome del file", accesa di
fabbrica): e' il nome sotto cui il PDF verra' archiviato, e non dipende da come
qualcuno ha battezzato l'Excel.

**Il tracker non parla piu' di "il server" quando gira online**: niente "un solo
computer fa da server", l'indirizzo da dare ai colleghi e' quello del sito, e la
nota parla della casella @vrs-tech.it invece del firewall di Windows. Tre
costanti in `app.js` decise da `inNuvola()`. Nella vista Mese sono sparite le
voci *impianti* e *da stampare*.

**I conflitti: le spunte erano gia' a posto, la nota no.** Su un campo da un bit
il 409 non puo' proprio scattare (o `gia-cosi` o `merge`); la nota invece era un
`UPDATE` secco - due persone che scrivevano insieme si cancellavano in silenzio.
Ora `/api/nota` porta `base_rev` + `base_nota` e segue le stesse quattro regole,
con una precisazione che conta: **la base e' quello che l'operatore aveva sotto
gli occhi**, non quello che il modello sa adesso (il flusso aggiorna `st.celle`
mentre si scrive). Il testo in scrittura non viene mai sovrascritto: la nota
altrui si annuncia sopra la casella, e il conflitto offre *Unisci le due* /
*Tieni la mia*.

**Attenzione**: `cloud/02-funzioni.sql` e `04-sicurezza.sql` sono cambiati
(`imposta_nota` ha due argomenti in piu', con `drop function` della vecchia
firma) e **vanno rieseguiti su Supabase**. Verificato tutto il resto in browser
su una **copia** del `.db` (server sulla 8775): l'archivio del committente non
e' stato toccato. Solo `web/` e `app/api.py`. Il service worker passa a
`crono-guscio-v9`.

## Stato al 2026-09-08 (15a sessione)

Tre richieste in una volta (dettaglio in
[ai/da-fare.md](ai/da-fare.md#fatto-il-2026-09-08-15a-sessione),
[ai/decisioni.md](ai/decisioni.md) 15h e 15i):

*"aggiungi la possibilita' di vedere la vista annuale o mensile senza quelle
gia complete o solo quele in ritardo o solo quele complete (forse con un unico
tasto di quello di prima magari rendendo clicabili i numeri che ci sono tipo
17/267 complete)"* - *"il filtro tutti i tipi toglili"* - *"il pallino
all'inizio del sito mettilo in base allo stato della mappatura, in ritardo,
completa, ecc"*.

**Un filtro solo, a quattro posizioni** (#ANCHOR: filtro-stato in
`web/js/stato.js`): Tutte / Da fare / In ritardo / Complete, al posto delle due
pillole "Solo incomplete" e "Solo in ritardo" - due interruttori per tre
risposte su quattro, e la quarta non era esprimibile. `st.filtri.stato`
sostituisce `soloIncomplete`/`soloRitardo` (i valori vecchi in `localStorage`
vengono convertiti) e `f.tipo` non esiste piu': il **filtro per tipo di gas e'
stato tolto**, il tipo si cerca dalla barra di ricerca.

**I numeri sono il filtro.** Ogni posizione porta il suo conteggio e i numeri
della testa sono bottoni ("19/267 complete", "225 in ritardo" nell'Anno,
"6/11 complete" nel Mese). La regola che tiene in piedi la cosa: **i conteggi
ignorano il filtro di stato** (`gruppiFiltrati({ ignoraStato: true })`, che
`riepilogoAnno` adesso passa). Se contassero la selezione, dopo un clic su
"Complete" la testa direbbe "19/19" e il bottone per tornare indietro
sparirebbe. Il numero dentro il filtro e' `statoPassa` contato riga per riga:
non puo' dire 7 e mostrarne 18. Non coincide con quello della testa, che conta
le mappature **dovute** - "Complete" comprende anche i siti chiusi in un anno
pre-tracciamento.

**Il pallino della riga dice lo stato**, non piu' il tipo di gas
(`statoMappatura()`, `.punto-stato`): verde completa, ambra in ritardo, cyan
iniziata, contorno da fare, contorno tenue pre-tracciamento, puntino non
dovuta. Nessun colore nuovo, nessun nodo in piu': `rinfrescaRiga` cambia una
classe. La legenda e' in "Come si legge".

**Seconda passata, nella stessa sessione**: *"complete spunta a zero ma una
completa c'e'"* - *"in mese invece del quadrato che seleziona il sito metti il
pallino dello stato come nella vista annuale"*. La regola dei conteggi era
applicata a meta': `mese.aggiornaConteggi()` (il ricalcolo della testa del Mese
a ogni spunta) girava sulle schede **a schermo**, quindi con "Da fare" acceso
"complete" andava a zero; stesso difetto nei totali per mese dell'intestazione
della vista Anno. Ora tutti e due usano l'insieme senza filtro di stato. E nel
foglio del Mese il **quadratino di selezione e' diventato il pallino dello
stato**.

**Terza passata**: *"fai che cliccando invece di selezionare, completa tutte e
quattro le spunte"*. Il pallino del Mese e' ora il **bottone della scheda**: un
clic mette tutti e quattro i passi di quel mese (un secondo clic li toglie, con
avviso, perche' cancella lavoro), tasto `0` da tastiera. Il checkbox non c'e'
piu': la selezione per le azioni multiple e' il **ctrl+clic** sul pallino,
scritto nel suggerimento. Il clic semplice va all'azione che si fa cinquanta
volte al giorno.

Il primo giro di quel bottone **faceva lampeggiare le spunte**: quattro
`/api/toggle` in fila, e la conferma di ognuno riportava la cella intera come
il server la conosceva in quel momento, cancellando a schermo i passi non
ancora confermati (`1111 -> 1000 -> 1100 -> 1110 -> 1111`, misurato). Adesso
`cellaDalServer()` tiene i campi ancora in `st.sospese`: **il server vince,
tranne su cio' che non ha ancora visto** - il merge per campo della decisione 7
applicato al lato client. Lo stesso lampeggio c'era cliccando in fretta i
quattro passi nel popover della vista Anno.

Verificato in browser sui dati reali copiati (222 clienti / 274 siti), chiaro e
scuro, nelle tre viste, con `inizio_tracciamento` a 2026-09 (31 dovute) e a
2026-01 (267 dovute, 225 in ritardo): i numeri del filtro sono sempre uguali
alle righe che restano a schermo, i totali per mese non si muovono cambiando
filtro, e la selezione multipla del Mese funziona col pallino. **Le prove di spunta sono state fatte su una
copia del `.db`** servita da un secondo server sulla 8773: l'archivio del
committente non e' stato toccato. Solo `web/`: basta ricaricare. Il service
worker passa a `crono-guscio-v6`.

## Stato al 2026-09-08 (14a sessione)

Una richiesta sola, sulle viste Anno e Mese: *"l'interfaccia grafica di anno e
mese risulta un po' pesante e probabilmente vecchiotta [...] rimodernizzarla
(senza stravolgerla completamente) [...] moderno futuristico dinamico
interattivo semplice minimal elegante [...] se la mappatura e' completa per un
sito, o per un intero cliente, evidenzialo bene non solo quel quadratino [...]
non rendere lento il sito web"*. Dettaglio in
[ai/da-fare.md](ai/da-fare.md#fatto-il-2026-09-08-14a-sessione) e
[ai/decisioni.md](ai/decisioni.md) 15g; il disegno e' descritto in
[ai/frontend.md](ai/frontend.md#idea-visiva).

**Il segnale "completa" sale di livello.** Non cambia il colore, cambia dove
arriva: la cella verde c'era gia'; ora la **riga del sito** si accende
(`.riga-srv.a-posto`: spina verde a sinistra, fondo tinto al 4%, segno di
spunta nel totale, etichetta "a posto") e la **carta del cliente**
(`.blocco.completo`: bordo e alone verdi, fascia in testa, etichetta) - anche
da piegata. Le condizioni sono le stesse del `.pieno` sul totale, cosi' i due
segnali non si contraddicono. Il verde ha un significato solo: l'etichetta
"N aperti" e' diventata neutra.

**La forma.** Nella vista Anno i clienti sono **carte** staccate da 6px d'aria
con rientro `--rientro` (12px) ai lati, niente piu' bordo forte fra un cliente
e l'altro; i mesi non previsti sono un **punto** di 3px invece di un trattino
(la trama dei trattini copriva le capsule); i totali per mese stanno **dentro
l'intestazione dei mesi** con un filo di 2px che si riempie (`--p`): la riga
sticky dei totali e' sparita. Nella vista Mese i dodici mesi stanno in
una **pista** con l'indicatore che scivola (`--i`, il cambio mese non ridisegna
piu' la testa: `cambiaMese` in `mese.js`), e i quattro passi sono una
**capsula segmentata**, la stessa forma della cella dell'Anno letta da vicino;
a scheda finita la pista diventa verde.

**Costo zero sul DOM.** Nessun nodo in piu' per cella: spine, spunte e
etichette sono `::before` o elementi gia' nel markup mostrati dal CSS con una
classe sola, quindi `aggiornaTotali`/`rinfrescaRiga` cambiano classi e basta.
Misurato in browser: ridisegno completo Anno+Mese 29 ms sui dati reali (222
clienti / 274 siti). Verificato chiaro e scuro (nuovo token
`--completa-testo`: il verde scritto sul fondo scuro era illeggibile), 1440 e
900 px, cassetto, stampa (`stampa.css` azzera la pista). Il service worker
passa a `crono-guscio-v5`. Solo `web/`: basta ricaricare.

**Seconda passata nella stessa sessione**, alla replica *"risulta ancora
pesante, non lo riesci a migliorare graficamente?"*: righe dei siti senza
linee (32px), capsula vuota al 55% con filo di contorno invece del blocco
grigio pieno, carte senza contorno (solo `--ombra-1`), pillole dei filtri
piatte in `base.css`, etichette "N aperti" solo testo, totali dei mesi nella
testa (una fascia in meno). Dettaglio in [ai/frontend.md](ai/frontend.md#idea-visiva).

## Stato al 2026-09-08 (13a sessione)

Tre richieste sulla dashboard appena consegnata (dettaglio in
[ai/da-fare.md](ai/da-fare.md#fatto-il-2026-09-08-13a-sessione),
[ai/decisioni.md](ai/decisioni.md) 15f):

*"in statistiche da fare adesso ha un riquadro troppo grande rispetto al
contenuto che occupa meta'"* - *"la barra blu che circola a vuoto nella hero
toglila sembra un pezzo di plastica"*, *"mappature per sito mettilo in fondo
come ultimo riquadro, [...] con possibilita' di espanderlo"* - *"se ho una
mappatura fatta a gennaio, mi compare lo stesso da fare [...] se completo 1/4
di settembre il nome sparisce, e' molto piena di bug questa sezione"*.

**Il difetto stava nel modello, non nella carta.** `calcolaMappatura`
(#ANCHOR: mappatura-anno in `web/js/stato.js`) cercava il lavoro solo nei mesi
"utili" del calendario contrattuale e saltava `prima-contratto` /
`non-previsto`. Il cassetto invece le quattro caselle le mostra per **ogni**
mese di manutenzione scritto in Access: su un contratto che parte ad agosto
(NIPPON SANSO #618/#619, mesi gennaio+maggio+settembre) una mappatura **chiusa
a gennaio** non risultava chiusa, e il sito restava "da fare" a settembre. Ora
il giro guarda tutti e dodici i mesi per il lavoro segnato e usa il calendario
solo come ripiego per dire dove starebbe il lavoro quando non ce n'e' ancora
nessuno. La regola dichiarata da otto sessioni - *chiusa in un mese qualsiasi,
il sito e' a posto per l'anno* - adesso e' davvero implementata.

Le altre correzioni: **"Da fare adesso"** ha tre gruppi di urgenza nella stessa
agenda (arretrate, questo mese, il prossimo) con i contatori che fanno da
filtro - prima la testa scriveva "229 in ritardo" sopra un elenco che le
arretrate non le conteneva; l'ordine dentro un gruppo **non guarda i passi**
(era quello a far "sparire" il nome appena spuntato); gli scorrevoli dentro le
carte conservano la posizione al ridisegno; la lista prende tutta l'altezza
della fila (`flex: 1 1 0`) invece di stare in mezzo a mezza carta vuota. Via la
**pista di avanzamento nell'eroe**, e **Mappature per sito** e' l'ultima carta
della pagina col bottone **Espandi** che la apre in un foglio grande
(`ui.modale` ha l'opzione nuova `classe`).

Verificato in browser sui dati reali (222 clienti / 274 siti / 267 dovute),
chiaro e scuro, a 1440 e 900 px. **Le prove di spunta sono state fatte su una
copia del `.db`** servita da un secondo server sulla 8772: l'archivio del
committente non e' stato toccato. Solo `web/` (`stato.js`, `stat.js`, `ui.js`,
`stat.css`, `base.css`): basta ricaricare la pagina.

## Stato al 2026-09-08 (12a sessione)

*"rinnova la sezione delle statistiche, fai una bella dashboard esteticamente
impeccabile, visivamente d'impatto, super moderna, futuristica ed elegante. non
aggiungere statistiche inutili, quelle che ci sono vanno bene + qualcosa di
veramente utile al massimo ma proponi prima"*.

Proposte tre statistiche, il committente ne ha scelte due: **"Ritmo per
chiudere l'anno"** (quante mappature al mese servono da oggi a dicembre contro
quante se ne chiudono, con la proiezione a fine anno) e **"Da fare adesso"**
(le dovute non chiuse che scadono questo mese e il prossimo; la riga apre il
cassetto del service). Scartata "Contratti da rinnovare". Nessuna carta tolta.

La vista e' diventata un **pannello di comando**
([ai/decisioni.md](ai/decisioni.md) 15e): apre col **quadrante dell'anno**
(`quadranteAnno` in `stat.js`: i dodici mesi a raggiera, verde chiuso / ambra
scoperto in un mese passato / grigio in tempo, tacca sul mese corrente,
percentuale al centro - e' l'unico numero eroe della pagina), a destra titolo e
cinque tessere che salgono da zero (`contaSu`). Sotto, in una griglia a dodici
colonne (`.c12 .c8 .c7 .c6 .c5 .c4 .c3`): Da fare adesso + (Ritmo e I 4 passi
impilati), i tre quadranti, mese per mese + andamento, province / scadute / chi
spunta, e in fondo l'elenco per sito (la 13a sessione l'ha spostato la' e la
pista dell'eroe l'ha tolta). Le carte sono di vetro (`--vetro`, `--lucido`,
`--punti` nuovi in `theme.css`, **senza** `backdrop-filter`) su un fondo a
punti che sfuma, ed entrano una per una quando arrivano in vista (`rivela`).
Al secondo giro il committente ha chiesto piu' dinamicita' e grafici in basso
meno banali: capsula a segmenti + pillole nell'elenco per sito, righe di
riferimento nelle colonne, area a gradiente e onda nell'andamento, quattro
anelli per i passi, barre con rango e parte chiusa. Regole `dataviz`
rispettate: cifre grandi in sans proporzionale, tabella su ogni carta nuova,
nessuna tinta nuova. Il committente ha anche ricordato che **una mappatura
chiusa in un mese qualsiasi mette a posto il sito per l'anno**: e' gia' cosi'
(`mappaturaSito().completa`) e "Da fare adesso" filtra su quello.

Verificato in browser sui dati reali (222 clienti / 274 siti / 267 dovute /
236 in ritardo, `inizio_tracciamento` ora a **2026-01**), chiaro e scuro, a
1440 e 900 px: quadrante, tooltip dei settori, riga dell'agenda che apre il
cassetto, tabella del ritmo (66,8 al mese servono, 0 finora, proiezione 0%).
Solo `web/`: basta ricaricare la pagina. Il service worker e' "prima la rete",
non serve toccarlo.

## Stato al 2026-09-07 (10a sessione)

*"vorrei mettere online su netlify e magari supabase questo gestore, mi
servirebbe che il database venga sincronizzato ogni tot, senza farlo a mano"*.

**Il vincolo che decide tutto**: il `.accdb` sta sul PC dell'ufficio e si legge
solo da Windows con ADODB. Nessun servizio in rete ci arriva, quindi la
sincronia non si tira dal cloud: la **spinge** quel PC, con
`app/push_cloud.py` e un'operazione pianificata alle 06:00. Va in una direzione
sola - clienti e service scendono da Access, le spunte nascono e restano su
Supabase, che ne e' l'unico padrone.

Online il resto e' Netlify (lo stesso `web/`, nessun build) e Postgres: le nove
tabelle di `db.py`, `api.py` riscritto in funzioni PL/pgSQL, Realtime al posto
dell'hub SSE, login Supabase Auth limitato a `@vrs-tech.it`. Il frontend non se
ne accorge: si continua a chiamare `/api/toggle` e a gestire i 409, e
`avvia.bat` parte offline come prima. Dettaglio in
[ai/decisioni.md](ai/decisioni.md) 18, procedura in
[../cloud/LEGGIMI.md](../cloud/LEGGIMI.md).

**Attenzione**: il lato Supabase non e' mai stato eseguito (qui non c'e' un
Postgres). Verificato solo che l'estrazione Access produce le righe giuste
(319 clienti / 545 service) e che l'applicazione **locale** non e' cambiata
(222 clienti / 274 siti / 0-31 complete / 236 pre-tracciamento). La lista di
cosa provare alla prima sessione con un progetto vero e' in
[ai/da-fare.md](ai/da-fare.md#da-verificare-alla-prima-sessione-con-un-progetto-supabase-vero).

## Stato al 2026-09-07 (9a sessione)

Una richiesta (dettaglio in
[ai/da-fare.md](ai/da-fare.md#fatto-il-2026-09-07-9a-sessione)):
*"LASERJET SPA che il contratto si rinnova da solo, nelle statistiche la
mappatura la da come non dovuta ma in realta' e' dovuta"* - *"sistema questo
problema e analoghi"*.

**Il rinnovo automatico non e' una scadenza** ([ai/decisioni.md](ai/decisioni.md)
10i). `data_scadenza` veniva letta come la fine del contratto anche quando il
contratto si rinnova da solo: tutti i mesi successivi diventavano `stima`, fuori
dai totali, e un sito con l'unica manutenzione la' (LASERJET #542, annuale,
settembre, scadenza 2026-08-31) risultava **"non dovuta"** pur avendo la
mappatura in scadenza questo mese. Ora `scadEffettiva(s)` (#ANCHOR: rinnovo in
`web/js/stato.js`, gemello `api._scad_effettiva`) rimanda avanti la scadenza di
un termine alla volta finche' non copre oggi, per i soli service **aperti** con
rinnovo automatico: il termine in corso e' un fatto (`previsto`), quello dopo
resta una proiezione (`stima`). E siccome il difetto e' rimasto invisibile otto
sessioni dietro un "non dovuta" muto, `mappaturaSito().motivo` porta il perche' e
le Statistiche lo scrivono: *da rinnovare*, *oltre il contratto*, *non ancora
attivo*. Il cassetto dichiara il rinnovo nella riga Validita'.

2026 passa da 266 a **267** mappature; 2025 e 2027 identici. Attenzione ai
numeri della testa: il committente ha rimesso `inizio_tracciamento` a
**2026-09**, quindi delle 267 solo **31** sono dovute e 236 sono
pre-tracciamento. E' la sua manopola, non un difetto - i numeri dell'8a sessione
qui sotto erano con `2026-01`.

## Stato al 2026-09-07 (8a sessione)

Tre richieste (dettaglio in
[ai/da-fare.md](ai/da-fare.md#fatto-il-2026-09-07-8a-sessione)):

1. **La vista Controlli non esiste piu'** ([ai/decisioni.md](ai/decisioni.md)
   15c): *"i grafici in controlli spostali nelle statistiche, i controlli
   rimuovili, ma il diario attivita' serve, lo metti in azioni"*. Le due torte
   sono carte delle **Statistiche**, il **diario** e' una voce del menu
   **Azioni** (modale, ultime 120 modifiche), e "Mappature in ritardo" non e'
   stata ricostruita perche' la carta "Mappature per sito" e' gia' quell'elenco.
   Via anche il tasto `C`, `web/js/controlli.js` e il blocco CONTROLLI di
   `griglia.css`; il service worker passa a `crono-guscio-v3`.
2. **Statistiche in tre piani**: la carta eroe, una fascia di **tre quadranti**
   ("A che punto siamo", "Come stanno le scadenze", **"Clienti a posto"** —
   nuova) e la griglia delle carte, dove nascono **"Da quanto sono scadute"**
   (l'anzianita' dell'arretrato in quattro bin ordinati, rampa `--ar-*` nuova e
   validata) e **"Chi mette le spunte"** (per operatore, con le mappature
   chiuse). Un solo `raccogli()` produce anche questi numeri: non possono
   divergere dalla testa.
3. **Interfaccia rinnovata con un segnale solo, a tre misure**
   ([ai/decisioni.md](ai/decisioni.md) 15d): la **linea di stato** di 2px sotto
   la barra strumenti (avanzamento dell'anno filtrato, in tutte le viste), la
   **pista dell'eroe** con lo stesso gradiente cyan->verde, e l'alone della
   casella completa. Intorno solo rilievo — velo di cyan sul fondo, testa di
   vetro, filo di luce sulla carta, trattino sotto la vista attiva, entrata a
   scalare, ciambelle che ruotano — senza nessun colore nuovo oltre a `--ar-*`.

Verificato in browser sui dati reali 2026 (chiaro e scuro): 222 clienti / 274
siti aperti / **266 mappature dovute** / 236 in ritardo / 0 pre-tracciamento; i
quadranti tornano con la testa (scadenze 0+30+236 = 266; clienti 0+0+24+193 =
217, cioe' quelli con almeno una dovuta; "Da quanto sono scadute"
8+58+112+58 = 236). **L'archivio reale ha 0 spunte** (azzerato dal committente),
quindi le forme piene sono state guardate su una copia del `.db` con spunte
finte servita da un secondo server sulla 8771: il `.db` del committente non e'
stato toccato.

Non riavviato il server (era in esecuzione, del committente): le modifiche sono
tutte lato `web/`, quindi basta ricaricare la pagina.

## Stato al 2026-09-07 (7a sessione)

Sette richieste del committente, in una volta (dettaglio in
[ai/da-fare.md](ai/da-fare.md#fatto-il-2026-09-07-7a-sessione)):

1. **Una mappatura per SITO, non per cliente** ([ai/decisioni.md](ai/decisioni.md)
   10h): *"aziende ULSS 1 Dolomiti, prendila come esempio per tutti gli altri:
   come vedi ha 9 siti aperti, va fatta una mappatura per ogni sito, non una in
   generale"*. Alla 6a sessione la stessa frase era stata letta come "per
   cliente": `mappaturaSito(s)` sostituisce `mappaturaCliente(cid)`, e le
   mappature dovute del 2026 passano da **217 clienti a 266 siti**.
2. **La casella completa si accende di verde** (`.cella.completa`): fondo
   `--completa` pieno e segmenti schiariti, non piu' un alone tenue.
3. **"Chiudi tutti"** nella testa della griglia: piega e riapre le tendine di
   tutti i clienti filtrati.
4. **Il cassetto non salta piu' in cima a ogni spunta** e la latenza e' rientrata
   (1 ms per spunta, ~18 ms per il disegno della griglia): aggiornamento in
   posto, memoizzazione per sito, un conteggio della testa per frame
   ([ai/frontend.md](ai/frontend.md#trappole-verificate-non-ripeterle) 11 e 12).
5. **Controlli ripuliti** ([ai/decisioni.md](ai/decisioni.md) 15b): via i tre
   pannelli sul dato Access e via il filtro "Mostra stime" dalla barra; al loro
   posto **due torte** dell'avanzamento (passi fatti, stato delle scadenze).
6. **Vista Mese coerente con l'unita' nuova**: "in scadenza" conta i siti la cui
   mappatura scade in quel mese, le schede restano gli impianti da visitare
   (sono di piu': comprendono le visite).
7. **Riepilogo in testa riallineato** ("mappature complete e' indentato male"):
   quattro voci (clienti · siti · complete · in ritardo) con l'etichetta che non
   va piu' a capo - era quella, su due righe, a far sembrare la colonna
   sfalsata.

Verificato in browser sui dati reali 2026 (chiaro e scuro): 222 clienti / 274
siti aperti / **266 mappature dovute** / 235 in ritardo / 0 pre-tracciamento,
591 celle disegnate; la riga "Mappature in scadenza" (33/25/40/39/33/50/8/8/10/
8/4/8) somma **266** ed e' identica ai totali della testa e delle torte. Su
AZIENDA ULSS 1 DOLOMITI: **8 siti aperti = 8 mappature**, `0/32` sulla riga
cliente; chiudendo i quattro passi su un sito la sua capsula diventa verde, la
riga passa a 4/4 e il mese a 1/7.

Non riavviato il server (era gia' in esecuzione, del committente): `api.py` viene
caricato all'avvio, quindi **la colonna `Ruolo` del CSV continua a uscire con la
regola per cliente finche' non si riavvia**.

## Stato al 2026-09-07 (6a sessione)

Il committente ha corretto l'unita' di conto e due conseguenze, guardando le
Statistiche (dettaglio in
[ai/da-fare.md](ai/da-fare.md#fatto-il-2026-09-07-6a-sessione)):

1. **Una mappatura per CLIENTE, non per service** (#ANCHOR: mappatura-anno):
   *"di mappature devi averne solo una per ogni cliente, non fai una mappatura
   ogni visita"*. Alla 4a sessione la stessa frase era stata letta come "per
   service" ([ai/decisioni.md](ai/decisioni.md) 10c, ultimo punto): sbagliato, e
   ora corretto in 10g. `mappaturaCliente(cid)` e `scadenzaCliente(cid)`
   sostituiscono `mappaturaAnno(s)`; in tutto l'anno **una sola cella per
   cliente** e' `previsto`, tutte le altre sono `visita`, e chiuderne una
   qualsiasi — anche su un altro impianto suo — mette a posto l'anno e toglie il
   ritardo alla cella di scadenza.
2. **Il ritardo sta nel mese della scadenza, non "periodicamente"**: nelle
   Statistiche ogni mappatura pesa su un mese solo (la somma delle colonne = il
   totale dovuto, sempre). La vista Mese ora tiene separate le due unita' e le
   scrive: *"8 in scadenza · 55 impianti"* — le schede sono impianti da
   visitare, non mappature.
3. **Nelle Statistiche ci sono TUTTI i clienti**: l'elenco "Mappature per
   cliente" parte completo (222 righe, scorrevole nella carta) e include anche
   chi e' fuori conto (pre-avvio, mappatura non dovuta), tenue e marcato. Prima
   compariva solo la parte dovuta e sembravano mancare dei clienti.

Verificato in browser sui dati reali 2026 (chiaro e scuro), con
`inizio_tracciamento` ora a `2026-01` (spostato dal committente): **222 clienti**
/ 274 service aperti, **217 mappature dovute** (0 pre-tracciamento), 357 celle
`visita`; complete e in ritardo si muovevano sotto le mani (3→1 e 190→192: il
committente stava spuntando dal suo PC), il resto e' strutturale; la riga "Mappature in scadenza" della
griglia (21/23/34/35/29/40/7/4/8/6/4/6) somma **217** ed e' identica alle colonne
di "A che punto siamo" e al pannello Controlli (190 in ritardo). Provato su
AERMEC SPA (3 impianti, tutti ad agosto + uno a dicembre): **una** capsula piena,
le altre col solo contorno, "0/1" nella riga dei totali, e chiudendo la mappatura
sulla visita di un altro impianto la riga cliente passa a 4/4, il mese a 1/4 e il
ritardo sparisce dalla cella di scadenza.

Il gemello Python (`api._scadenze_cliente`, colonna `Ruolo` del CSV) e' stato
verificato a parte sul `data/cronoservice.db` reale: **217** clienti e la stessa
riga per mese (21/23/34/35/29/40/7/4/8/6/4/6), stessi service scelti a pari mese.
Va fatto cosi': `api.py` e' caricato all'avvio, quindi finche' il server non si
riavvia il CSV continua a uscire con la regola vecchia (per service).

## Stato al 2026-09-07 (5a sessione)

Tre cose chieste dal committente guardando le Statistiche (dettaglio in
[ai/da-fare.md](ai/da-fare.md#fatto-il-2026-09-07-5a-sessione)):

1. **Il conteggio era sbagliato: la scadenza slittava al tracciamento.**
   `meseScadenza` cercava il primo mese `previsto`, che esclude i mesi prima di
   `inizio_tracciamento`: un contratto marzo+settembre si vedeva assegnare la
   scadenza alla **visita** di settembre, e settembre 2026 mostrava 51 mappature
   in scadenza. Ora la scadenza e' il primo mese di manutenzione **dentro il
   contratto**, e se cade prima del tracciamento la mappatura dell'anno e'
   `preTrac`: visibile e spuntabile, fuori dai totali
   ([ai/decisioni.md](ai/decisioni.md) 10e).
2. **Statistiche: due grafici nuovi** — "Mappature per cliente" (righe
   cliccabili) e "A che punto siamo, mese per mese" (colonne divise per numero di
   passi fatti, filtrabili sul cliente scelto). Rimosse su richiesta
   "Composizione dell'anno" e "Completamento per tipo di service".
3. **Il verde e' solo "mappatura completa"**: il terzo passo passa a magenta
   (`--st-corretta` = `#A0307E` / `#CC5FA8`), nascono `--completa` e la rampa
   sequenziale `--pr-0..--pr-4` ([ai/decisioni.md](ai/decisioni.md) 10f).

Verificato in browser sui dati reali 2026 (tema chiaro e scuro): **30 mappature
dovute** = 10 (set) + 8 (ott) + 4 (nov) + 8 (dic) della riga "Mappature in
scadenza" e delle colonne del secondo grafico, 236 pre-tracciamento, 0 in
ritardo, 274 service aperti; clic su un cliente che apre i suoi mesi e bottone
"Tutti i clienti"; tabelle di tutte le carte; tavolozza rivalidata con
`docs/ai/valida-tavolozza.py`.

## Stato al 2026-09-07 (4a sessione)

Due modifiche chieste dal committente (dettaglio in
[ai/da-fare.md](ai/da-fare.md#fatto-il-2026-09-07-4a-sessione)):

1. **Una mappatura per anno, scadenza al primo mese** (#ANCHOR: mappatura-anno).
   Nuova classe `visita` per i mesi di manutenzione oltre il primo: spuntabili,
   fuori dai totali, mai in ritardo. Chiudere la mappatura in un mese qualsiasi
   mette a posto l'anno. Le "mappature previste" del 2026 passano da 219 mesi a
   **194 service** (poi 30 nella 5a sessione: la scadenza non slitta piu' al
   tracciamento).
2. **Rosso per il contratto, ambra per il ritardo**: `--scadenza` /
   `--scadenza-tenue` nuovi token, `da-rinnovare` non condivide piu' l'ambra con
   "in ritardo". Tavolozza rivalidata (`docs/ai/valida-tavolozza.py`).

**Nella stessa sessione era stata costruita anche una vista "Fogli"** (registro
dei fogli consegnati al tecnico e non tornati) con endpoint, filtro, bolli e
carta nelle Statistiche: **il committente l'ha fatta rimuovere** — i fogli erano
un esempio per spiegare il senso dell'applicazione, non una richiesta, e non
vuole etichette in piu' (`VISITA`, `FOGLIO FUORI`, `ANNO GIÀ FATTO`) sulle
schede. Non riproporla senza richiesta esplicita: vedi
[ai/decisioni.md](ai/decisioni.md) punto 10d.

Verificato in browser sui dati reali 2026 (numeri di allora: 194 dovute =
51+41+42+60 della riga "Mappature in scadenza", 8 complete, 0 in ritardo — la
5a sessione ha corretto la regola, vedi sopra); cella
`da-rinnovare` rossa e cella `visita` col solo contorno in tema chiaro e scuro;
cassetto con "Mappatura 2026: scade a Ottobre · chiusa ad Aprile"; vista Mese,
Statistiche e Controlli coerenti coi numeri nuovi.

## Stato al 2026-09-07 (3a sessione)

Chiesto dal committente e fatto (dettaglio in
[ai/da-fare.md](ai/da-fare.md#fatto-il-2026-09-07-3a-sessione)):

1. **quarto passo** `ricambi` = "controllo ricambi e scadenze";
2. terzo passo rinominato **"mappatura completa rapportino"**;
3. **"Solo incomplete" corretto**: in vista Mese guarda solo quel mese (prima
   guardava tutto l'anno, quindi una mappatura di settembre appena chiusa
   restava a schermo perche' dicembre era incompleto);
4. **"Solo mappatura" rimosso** con tutto cio' che mostrava `tServices.Mappatura`
   (bollo `MAP`, riga del cassetto, colonna CSV): sono tutte mappature;
5. **nuova vista Statistiche** (`js/stat.js`, `css/stat.css`).

Verificato in browser sui dati reali (2026): 274 service aperti, 219 mappature
previste, 0/219 complete, 1 stima, 16 da rinnovare, 355 pre-tracciamento — i
numeri di controllo del modello dell'anno non si sono mossi. Provati: la quarta
casella (spunta, cella a 4/4, "1/55 complete" in vista Mese), il popover coi
quattro passi, il filtro "solo incomplete" che ora fa sparire la mappatura
completata **restando su settembre**, la legenda dell'aiuto generata da `CAMPI`,
il bottone "Tabella" di ogni carta, tema chiaro e scuro.

**Le 591 righe `mappature` esistenti hanno `ricambi = 0`**: cio' che era completo
a tre passi ora e' 3/4. E' voluto, ma se serve un recupero storico vedi
[ai/da-fare.md](ai/da-fare.md#da-verificare).

## Stato al 2026-09-04 (dopo la 2a sessione di revisione)

Funzionante e verificato in browser sui dati reali: 319 clienti con service,
545 service (274 APERTO / 271 CHIUSO).

**Modello dell'anno** ([ai/anno-e-tempo.md](ai/anno-e-tempo.md)) — con
`inizio_tracciamento = 2026-09`:

| anno | previste | stime | da rinnovare | pre-tracciamento | in ritardo |
|---|---|---|---|---|---|
| 2026 | 219 | 1 | 16 | 355 | 0 |
| 2027 | 221 | 174 | 204 | 0 | 0 |
| 2028 | 106 | 228 | 265 | 0 | 0 |

Erano i numeri di controllo di allora, quando l'unita' era il MESE di
manutenzione. Quelli validi ora (una mappatura per anno, scadenza che non slitta
al tracciamento) stanno in
[ai/anno-e-tempo.md](ai/anno-e-tempo.md#numeri-di-controllo): 30 / 118 / 59
dovute per 2026 / 2027 / 2028.

Verificato in questa sessione:

- spunta ottimistica, persistenza, firma operatore, SSE fra client, conflitto
  409 sullo stesso campo, merge silenzioso su campo diverso, idempotenza `op_id`;
- coda offline con il **server realmente spento**: fascia ambra, cella `sospesa`,
  ripartenza automatica al ritorno senza alcun intervento;
- azioni di massa: conferma con numeri esatti, esecuzione, **Annulla** che
  ripristina (verificato anche lato server);
- frecce dell'anno: 3 clic rapidi indietro -> 2023, 5 avanti -> 2028, "Oggi" -> 2026;
- doppio avvio sullo stesso PC bloccato; protocollo di scoperta che risponde;
- vista Mese, cassetto, controlli qualita', CSV, tastiera, sync a caldo (2,9 s).

Non verificato (impossibile qui, annotato in [ai/da-fare.md](ai/da-fare.md)):
registrazione del **service worker** (la webview di collaudo la rifiuta; lo
script e' servito 200 con MIME corretto) e il caso reale a **due PC** in LAN,
compresa la fascia rossa del doppio server.

Logo e colori aziendali applicati: cyan `#00AEEF` piu' i due grigi del logo come
scala neutra, contrasti verificati (vedi [ai/frontend.md](ai/frontend.md)).

Cose trovate nei loro dati Access (allora nella vista Controlli, oggi solo in
`GET /api/incongruenze`): 9 service aperti hanno un
numero di mesi diverso dalle visite annue della cadenza; 250 service aperti hanno
"rinnovo da richiedere alla scadenza", che nel 2027 si traduce in 204 mappature
non pianificabili finche' il contratto non e' rinnovato.
