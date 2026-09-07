# AI-HANDOFF — indice

**Questo file e' l'unico da leggere all'inizio di una sessione pulita.** Da qui si
apre solo il file di `docs/ai/` che riguarda la modifica richiesta. Non leggere
il codice a blocco: usa la mappa e le ancore qui sotto.

---

## Cos'e'

Interfaccia web per la checklist delle **mappature service** di VRS Group.
Ogni mappatura si chiude in quattro spunte: `stampata` -> `controllata` (dal
tecnico) -> `corretta` ("mappatura completa rapportino") -> `ricambi`
("controllo ricambi e scadenze"). L'ordine e il numero stanno in un posto solo:
`CAMPI` in `web/js/stato.js` e `db.CAMPI` in `app/db.py`. Tutto il resto conta
`PASSI`, mai "tre".

**Il concetto meno ovvio e' il tempo**: i mesi in Access appartengono al
contratto, non a un anno, e vanno calcolati per anno; `data_scadenza` non e' la
fine di un contratto a **rinnovo automatico** (e' la fine del termine in corso,
si rimanda avanti); e la mappatura e' **una per SITO per anno** (un service aperto = un impianto; non una per cliente e non una
per visita), con scadenza al primo mese di manutenzione di quel sito dentro il
contratto: in tutto l'anno un sito ha una sola cella `previsto`, ogni altro suo
mese di manutenzione e' una visita. Se la modifica riguarda celle, anni, ritardi
o conteggi, leggere prima [ai/anno-e-tempo.md](ai/anno-e-tempo.md).

Sorgente dati: `CronoServices_be.accdb` (backend Access di CronoServices, **sola
lettura, mai scritto**). Le spunte vivono in un SQLite separato.

Stack: **Python 3 solo stdlib** + SQLite + JS vanilla a moduli ES. Nessun `pip
install`, nessun `npm`, nessun passo di build, nessuna CDN: l'app deve partire
offline con un doppio clic su `avvia.bat`.

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
| `api.py` | 469 | tutti gli endpoint. Ogni handler: `(ctx,q,body) -> (status,payload,evento)` |
| `db.py` | 158 | schema SQLite (stringa `SCHEMA`), `sess()`, `WRITE_LOCK`, `CAMPI`, costanti mesi |
| `sync.py` | 208 | import Access -> SQLite, diff, backup |
| `export_access.ps1` | 57 | estrazione ADODB -> JSON. **Deve restare ASCII puro** |
| `rete_locale.py` | 113 | scoperta UDP di altri server Crono in LAN |
| `push_cloud.py` | 160 | Access -> Supabase, spinto dal PC dell'ufficio. #ANCHOR: push-cloud |
| `config.json` | 11 | percorsi, porta, sync all'avvio |
| `cloud.json` | - | credenziali Supabase, **solo sul PC dell'ufficio**, non nel repo |

### Frontend `web/`
| file | righe | cosa contiene |
|---|---|---|
| `index.html` | 114 | struttura statica di testa e barra strumenti (gli `id` sono il contratto con `app.js`) |
| `js/app.js` | 776 | guscio: avvio, viste, filtri, tema, tastiera, operatore, sync, diario |
| `js/stato.js` | 633 | modello in memoria, `CAMPI`/`PASSI`, filtri, **unico varco per le scritture** (`spunta`) |
| `js/api.js` | 200 | fetch, coda offline, flusso, presenza. Sceglie il trasporto |
| `js/nuvola.js` | 330 | lato Supabase: login, rotte -> RPC, Realtime. #ANCHOR: nuvola |
| `js/nuvola-config.js` | 18 | indirizzo del database online. Vuoto = locale |
| `js/anno.js` | 474 | griglia cliente x 12 mesi (vista principale) |
| `js/mese.js` | 266 | foglio di lavoro del mese + azioni multiple |
| `js/stat.js` | 778 | vista Statistiche: raccolta dei numeri + grafici (torte comprese) |
| `js/cassetto.js` | 203 | pannello laterale di un service |
| `js/spunte.js` | 127 | popover della cella |
| `js/ui.js` | 208 | icone, `h()`, avvisi, modale, formattatori, `frecceEntrano()` |
| `css/theme.css` | 200 | **solo token**: colori, font, misure, segnali. Il marchio si cambia qui |
| `css/base.css` | 378 | reset, testa, barra strumenti, linea di stato, diario, componenti comuni |
| `css/griglia.css` | 401 | griglia, cella a 4 segmenti, vista mese |
| `css/stat.css` | 428 | carte, quadranti, torte, misuratori, barre, colonne, tooltip |
| `css/stampa.css` | 37 | foglio cartaceo |
| `sw.js` | 45 | service worker (guscio offline) |

`data/cronoservice.db` = dati applicativi. `data/backup/` = copie automatiche a
ogni sync (ne tiene 20).

### Online `cloud/`
| file | cosa contiene |
|---|---|
| `LEGGIMI.md` | la procedura passo passo: Supabase, utenti, Netlify, sincronia |
| `01-tabelle.sql` | le nove tabelle di `db.py` in Postgres |
| `02-funzioni.sql` | `_applica`, `toggle_cella`, `bulk_celle`, `imposta_nota` |
| `03-letture.sql` | `app_bootstrap` e le altre letture, CSV compreso |
| `04-sicurezza.sql` | RLS, permessi, pubblicazione Realtime |
| `05-sync.sql` | `sync_applica`: il gemello di `sync.esegui` |
| `installa-sync-cloud.cmd` | crea l'operazione pianificata delle 06:00 |
| `sync-cloud.cmd` | un travaso a mano |
| `netlify-build.sh` | scrive `nuvola-config.js` in pubblicazione |

`netlify.toml` sta nella radice. Fuori dall'app: `docs/ai/valida-tavolozza.py` controlla le tavolozze dei grafici
(gemello Python dello script della skill `dataviz`, che e' in JS e qui non gira).
`.claude/launch.json` avvia il server per l'anteprima.

---

## Come muoversi senza leggere tutto

1. **Ancore.** `grep -rn "#ANCHOR" app web` da' la lista dei punti chiave con il
   numero di riga. Ancore esistenti: `db`, `sync`, `api`, `merge`, `server`,
   `sse`, `api-client`, `stato`, `toggle`, `ui`, `popover`, `cassetto`,
   `vista-anno`, `vista-mese`, `vista-stat`, `app`, `sw`, `rinnovo`,
   `tema`, `css-base`, `css-griglia`, `css-stat`, `css-stampa`, `anno-modello`,
   `mappatura-anno`, `classe-mese`, `passi`, `massa`, `stato-collegamento`,
   `scoperta`, `nuvola`, `push-cloud`.
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
| sapere perche' una scelta e' stata fatta cosi' | [ai/decisioni.md](ai/decisioni.md) |
| toccare i grafici, le torte o la vista Statistiche | [ai/frontend.md](ai/frontend.md#la-vista-statistiche) + skill `dataviz` |
| sapere cosa manca / cosa e' rimasto in sospeso | [ai/da-fare.md](ai/da-fare.md) |
| toccare il giro online (Supabase, Netlify, sincronia) | [../cloud/LEGGIMI.md](../cloud/LEGGIMI.md) + [ai/decisioni.md](ai/decisioni.md) 18 |

---

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
