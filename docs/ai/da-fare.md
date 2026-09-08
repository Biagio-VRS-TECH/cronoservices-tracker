# Da fare / in sospeso

Aggiornare questo file a ogni sessione: e' il primo posto dove guardare per
riprendere il filo.

## Fatto il 2026-09-08 (11a sessione) - prima prova vera del giro online

Il committente ha collegato Netlify a GitHub e provato il sito pubblicato
(`cronoservices-tracker.netlify.app`): rimaneva bloccato sulla scritta statica
"Caricamento..." per sempre, senza nessun errore visibile.

**Trovato un difetto reale**: `bootstrap()` in [api.js](../../web/js/api.js)
non lanciava piu' quando la RPC Postgres rispondeva con un errore applicativo
(login fallito o `autorizzato()` = falso): l'app provava a leggere campi
mancanti e andava in crash silenzioso in `applica()` (stato.js), lasciando lo
schermo fermo sulla marca statica senza spiegazione. **Sistemato**: ora
`bootstrap()` lancia con il messaggio vero e `avvia()` (app.js) lo mostra
invece del generico "Database non raggiungibile". Verificato che il modo
locale non e' cambiato (avvio pulito, nessun errore in console).

**Dalla console del committente**, due chiamate a Supabase rispondevano 400:
il login (`auth/v1/token?grant_type=password`) e la RPC `app_bootstrap`. Il
codice online non e' mai stato provato prima d'ora (vedi 10a sessione), quindi
e' la prima verifica reale prevista in
[#da-verificare-alla-prima-sessione-con-un-progetto-supabase-vero](#da-verificare-alla-prima-sessione-con-un-progetto-supabase-vero).

Con l'errore ora visibile (invece di uno schermo bloccato), il committente ha
mandato lo screenshot vero: `column reference "anno" is ambiguous` dalla RPC
`app_bootstrap`. **Trovato e sistemato un secondo difetto, questa volta in
SQL**: `app_bootstrap` e `app_incongruenze` in
[03-letture.sql](../../cloud/03-letture.sql) dichiaravano una variabile locale
chiamata `anno`, con lo stesso nome della colonna `mappature.anno` — in
`where m.anno = anno` Postgres non sa piu' quale dei due intendevi. Rinominata
in `v_anno` in entrambe (`app_export_csv`, nello stesso file, gia' lo faceva
bene: e' li' che ho preso il pattern).

## Bloccato in attesa del committente (nuovo)

**Il file `cloud/03-letture.sql` nel repo e' gia' corretto, ma la funzione
che gira davvero sta dentro il suo progetto Supabase e resta quella vecchia
finche' non viene rieseguita.** Serve che il committente, in **SQL Editor**
del suo progetto Supabase, rilanci le due funzioni corrette (si puo' incollare
tutto il file `03-letture.sql` aggiornato, e' idempotente: `create or replace
function`). Poi ricaricare la pagina — e se restasse un'altra cache vecchia,
`localStorage.removeItem('cs.bootstrap.v1')` nella console e ricaricare.

Se dopo questo comparisse un ALTRO errore (es. "casella non abilitata",
"sessione scaduta"), sono i punti rimasti del giro di verifica mai fatto prima
(vedi 10a sessione): utente Supabase esistente/confermato, casella
`@vrs-tech.it`, le altre 4 funzioni SQL eseguite, variabili d'ambiente Netlify
che puntano a questo stesso progetto.

## Fatto il 2026-09-07 (10a sessione)

Richiesta: *"vorrei mettere online su netlify e magari supabase (o altro se hai
idee migliori) questo gestore, mi servirebbe che il database venga magari
sincronizzato ogni tot, come posso fare? senza farlo a mano"*.

Tre scelte del committente, prese prima di scrivere codice: **solo la versione
online** scrive le spunte (l'app locale resta per l'emergenza), sincronia
dell'anagrafica **una volta al giorno**, accesso con **login e solo dominio
vrs-tech.it**. Il perche' dell'architettura sta in [decisioni.md](decisioni.md)
18; la procedura passo passo in [../../cloud/LEGGIMI.md](../../cloud/LEGGIMI.md).

1. **Postgres al posto di SQLite, cinque file in `cloud/`**: `01-tabelle.sql`
   (le stesse nove tabelle di `app/db.py`, booleani 0/1 e date come TESTO ISO
   locale, per non ritradurre niente), `02-funzioni.sql` (`_applica` gemello di
   `api._applica`, `toggle_cella`, `bulk_celle`, `imposta_nota`),
   `03-letture.sql` (`app_bootstrap` con lo stesso JSON campo per campo, diario,
   incongruenze, presenze, CSV coi gemelli `_scad_effettiva`/`_mese_scadenza`),
   `04-sicurezza.sql` (RLS in lettura, scrittura solo via SECURITY DEFINER,
   pubblicazione Realtime), `05-sync.sql` (`sync_applica`, il diff di
   `sync.esegui` in una transazione sola).
2. **`web/js/nuvola.js` (#ANCHOR: nuvola)**: sessione e login, le vecchie rotte
   `/api/...` tradotte in RPC, Realtime al posto dell'SSE con ripiego a
   `app_celle_dopo` ogni 15 s dopo quattro tentativi falliti, maschera
   d'accesso. `api.js` sceglie il trasporto e nient'altro cambia: coda offline,
   conflitti 409, presenza, cache restano quelli.
3. **`app/push_cloud.py`** sul PC dell'ufficio: riusa `sync.estrai` (quindi
   `export_access.ps1`, invariato), normalizza con le stesse regole di
   `sync.esegui` e manda tutto a `rpc/sync_applica`. Solo stdlib, come il resto.
   `cloud/installa-sync-cloud.cmd` crea l'operazione pianificata delle 06:00
   (utente collegato, nessuna password salvata, recupero se il PC era spento).
4. **Netlify**: `netlify.toml` pubblica `web/` senza build; l'unico passo e'
   `cloud/netlify-build.sh` che scrive `web/js/nuvola-config.js` dalle variabili
   d'ambiente. Vuoto = modalita' locale, quindi `avvia.bat` non se ne accorge.

Verificato: `push_cloud.py --prova` legge Access e produce 319 clienti / 545
service con i campi giusti; l'applicazione **locale** aperta dopo le modifiche
da gli stessi numeri di prima (222 clienti / 274 siti / 0-31 complete / 0 in
ritardo / 16 da rinnovare / 236 pre-tracciamento) e i due moduli nuovi si
caricano con `attiva() === false`.

**Non verificato**: tutto il lato Supabase. Qui non c'e' un Postgres, quindi i
cinque file SQL non sono mai stati eseguiti e il giro online non e' mai stato
percorso davvero. Vedi "Da verificare" qui sotto.

## Da verificare alla prima sessione con un progetto Supabase vero

1. **I cinque file SQL girano puliti**, nell'ordine, su un progetto nuovo.
2. **`app_bootstrap` restituisce esattamente il JSON di `api.bootstrap`**: se un
   campo cambia nome o tipo, il frontend se ne accorge in silenzio (numeri
   sbagliati, non errori). Confronto consigliato: `/api/bootstrap` dal server
   locale contro l'RPC, campo per campo, sullo stesso anno.
3. **Il merge per campo e il 409**: due sessioni sullo stesso passo della stessa
   cella devono dare conflitto; su passi diversi, merge silenzioso. E' la parte
   piu' delicata portata a mano da `api._applica`.
4. **L'idempotenza `op_id`** con la coda offline: spegnere la rete, spuntare,
   riaccendere, e verificare che `ops` non lasci passare la stessa operazione
   due volte (compreso il caso `bulk`, dove l'id e' `op_id:indice`).
5. **Realtime**: il formato del messaggio `postgres_changes` e' letto in modo
   difensivo (`data.record || data.new`) perche' non e' stato possibile
   provarlo. Se le celle degli altri non arrivano, e' il primo posto da
   guardare - e il ripiego a interrogazione deve comunque coprire il caso.
6. **`app_export_csv`** contro il CSV del server locale: stesse righe, stesso
   ordine, stessa colonna `Ruolo`.
7. **Il fuso**: `ts_locale()` usa `Europe/Rome`. Se il progetto Supabase nasce in
   un'altra regione le date restano giuste, ma vale la pena guardare una spunta
   fatta dopo mezzanotte.

## Fatto il 2026-09-07 (9a sessione)

Una richiesta: *"LASERJET SPA che il contratto si rinnova da solo, nelle
statistiche la mappatura la da come non dovuta ma in realta' e' dovuta"* -
*"sistema questo problema e analoghi"*.

1. **Il rinnovo automatico non e' una scadenza**
   ([decisioni.md](decisioni.md) 10i, [anno-e-tempo.md](anno-e-tempo.md#rinnovo_auto-e-la-scadenza-effettiva-anchor-rinnovo)).
   `scadEffettiva(s)` in `web/js/stato.js` (#ANCHOR: rinnovo) rimanda avanti
   `data_scadenza` di un termine alla volta finche' non copre oggi, per i soli
   service **aperti** con `rinnovo_auto = 1`; `classeBase` la usa al posto di
   `s.scad`. Gemello Python `api._scad_effettiva`, usato da `_mese_scadenza`
   (colonna `Ruolo` del CSV). LASERJET #542: settembre 2026 da `stima` a
   `previsto`, 2026 da 266 a **267** mappature; 2025 (208) e 2027 (118 dovute /
   174 stime / 204 da rinnovare) **identici**.
2. **"Non dovuta" adesso dice perche'** - era la parola muta che ha nascosto il
   difetto. `mappaturaSito().motivo` porta la classe del primo mese utile e le
   Statistiche scrivono *da rinnovare* (6 siti), *oltre il contratto*, *non
   ancora attivo* (1 sito). Sui 274 siti aperti del 2026: 31 da fare, 236
   pre-avvio, 6 da rinnovare, 1 non ancora attivo, **zero "non dovuta"** senza
   spiegazione.
3. **Il cassetto dichiara il rinnovo**: `Validità 01/09/2025 → 31/08/2027 ·
   rinnovo automatico (in Access 31/08/2026)`. Serve a non far sembrare che
   l'app ignori Access, ed e' il primo posto dove il committente guarda quando
   una data non gli torna. Stesso trattamento nel tooltip delle celle `stima` /
   `da-rinnovare` della griglia.

Verificato in browser sui dati reali (chiaro): 222 clienti / 274 siti / 267
mappature strutturali, di cui **31 dovute** nella testa perche' il committente
ha rimesso `inizio_tracciamento` a **2026-09** (era `2026-01` nei numeri dell'8a
sessione: la manopola e' sua, i numeri della testa vanno letti insieme a quella).
La riga "Mappature in scadenza" somma 31 = testa. CSV: LASERJET esce
`MAPPATURA`, non `visita`.

Il server e' stato riavviato per il collaudo (era spento, nessuno collegato) e
`api.py` e' quindi gia' quello nuovo. **Non e' stata scritta nessuna spunta**:
le uniche scritture nell'archivio sono quelle del committente ("Biagio"), che
alle 13:48 aveva toccato proprio la cella 542-9 - e' cosi' che ha visto il
difetto.

## Fatto il 2026-09-07 (8a sessione)

Tre richieste: *"i grafici in controlli spostali nelle statistiche, i controlli
rimuovili, ma il diario attivita' serve, lo metti in azioni"*; *"pensa a
statistiche da mettere e mettile con grafici nella sezione statistiche come
grafici a torta e altri tipi utili ai fini di mappature, usa la skill frontend
per fare grafici futuristici dinamici e minimal"*; *"rinnovare l'interfaccia
grafica per renderla piu' accattivante dinamica futuristica preservandone la
semplicita' e l'eleganza"*.

1. **Vista Controlli rimossa** ([decisioni.md](decisioni.md) 15c). Le due torte
   sono carte delle Statistiche, il diario e' una voce del menu **Azioni** che
   apre una modale con le ultime 120 modifiche. "Mappature in ritardo" non e'
   stata ricostruita: la carta "Mappature per sito" e' gia' quell'elenco,
   ordinato per urgenza e completo. Spariti il tasto `C`, `web/js/controlli.js`,
   il blocco CONTROLLI di `griglia.css` e la voce nel service worker (cache
   passata a `crono-guscio-v3`).
2. **Tre quadranti** nelle Statistiche, sotto la carta eroe: "A che punto siamo",
   "Come stanno le scadenze" (le due ex Controlli) e **"Clienti a posto"**, nuova
   — un cliente e' a posto quando tutti i suoi siti dovuti sono chiusi, che e' la
   domanda che si fa al telefono e non si leggeva da nessuna parte.
3. **Due carte nuove**: **"Da quanto sono scadute"** (i mesi passati dalla
   scadenza in quattro bin ordinati, rampa sequenziale nuova `--ar-1..--ar-4`
   validata col gemello Python) e **"Chi mette le spunte"** (barre per
   operatore + mappature chiuse; attribuzione = `cella.by`, l'ultimo che ha
   toccato la casella, dichiarato nella carta).
4. **Interfaccia rinnovata con un segnale solo, a tre misure**
   ([decisioni.md](decisioni.md) 15d): la **linea di stato** di 2px saldata sotto
   la barra strumenti (avanzamento dell'anno filtrato, visibile in tutte le
   viste, con un riflesso ogni 7 s), la **pista dell'eroe** con lo stesso
   gradiente ancorato alla pista intera, e l'alone della casella completa che
   c'era gia'. Intorno solo rilievo: velo di cyan al 7% sul fondo, testa di vetro
   col gradiente, filo di luce sul bordo alto della carta, trattino sotto la
   vista attiva, entrata a scalare delle carte, ciambelle che ruotano sul proprio
   centro, testina di lettura del mese corrente con un velo. Nessun colore nuovo
   oltre a `--ar-*`: tutto `color-mix` di token esistenti, e tutto dietro
   `prefers-reduced-motion`.

### Da verificare (8a sessione)

- **Verificato sui dati reali** (porta 8770, tema chiaro e scuro): 222 clienti /
  274 siti aperti / 266 mappature dovute / 236 in ritardo / 0 pre-tracciamento.
  I quadranti tornano con la testa: scadenze 0 + 30 + 236 = 266, clienti
  0 + 0 + 24 + 193 = 217 (i clienti con almeno una dovuta), "Da quanto sono
  scadute" 8 + 58 + 112 + 58 = 236. Provate le tabelle delle carte nuove, il
  diario in Azioni (120 righe), i tasti `A`/`M`/`S`, il `?`.
- **L'archivio reale ha 0 spunte** (il committente ha azzerato tutto), quindi le
  forme piene, la rampa dell'arretrato e le barre per operatore sono state
  guardate su una **copia** del `.db` con spunte finte, servita da un secondo
  server sulla 8771 (`--porta`, config a parte, `web_dir` sul web vero). Il
  `.db` del committente non e' stato toccato. Se serve rifarlo: copia il `.db`,
  metti valori a caso nelle colonne dei quattro passi, avvia con `--porta 8771`.
- **Non riavviato il server della 8770** (era in esecuzione, del committente):
  le modifiche sono tutte lato `web/`, quindi bastano un ricarico e il service
  worker nuovo. Attenzione: se un browser ha ancora in cache `crono-guscio-v2`
  con `js/controlli.js`, il ricarico normale basta (strategia "prima la rete"),
  ma un browser aperto **offline** vedrebbe il guscio vecchio finche' non torna
  in rete.
- Restano non verificabili qui, come dalle sessioni prima: registrazione del
  service worker (la webview di collaudo la rifiuta) e il caso reale a due PC.

## Fatto il 2026-09-07 (7a sessione)

Sette richieste in una volta, guardando l'applicazione: *"aziende ulss 1
dolomiti, prendila come esempio per tutti gli altri, come vedi ha 9 siti aperti,
va fatta una mappatura per ogni sito, non una in generale. Una volta fatta
l'intera casella del sito si illumina di verde per far capire che e' stata
completata. Deve esserci un tasto per richiudere le tendine di tutti i clienti
nella sezione annuale. Ovviamente rendi tutto coerente comunque nella vista
mensile. Sistemare bug interfaccia grafica in cui se clicco una delle caselle mi
rimanda su, inoltre ha troppa latenza ed e' buggatissimo. In controlli togli:
Mesi diversi dalla cadenza, Service aperti senza mesi, Spunte su mesi non piu'
previsti, togli il filtro in alto Mostra stime, fai qualche grafico a torta utile
per tracciare i progressi (no cose inutili). Mappature complete in vista anno e'
indentato male, sistema"*.

1. **L'unita' di conto torna da (cliente, anno) a (sito, anno)**
   ([decisioni.md](decisioni.md) 10h, [anno-e-tempo.md](anno-e-tempo.md)).
   `mappaturaSito(s)` sostituisce `mappaturaCliente(cid)`; via
   `scadenzaCliente`, `lavoroServizio`, `st.perCli`. `classeMese` marca
   `previsto` la sola cella di `meseScadenza(s)`; `progressoGruppo` **somma** i
   siti del cliente (nove impianti = 9 x PASSI) e porta `dovute`/`complete`/
   `ritardo` per il tooltip; `quotaMese`/`totaliMese` in `anno.js` contano siti;
   `aggiornaTotali` non ridipinge piu' la riga di un altro service (la scadenza
   e' sempre sulla stessa riga). Cassetto: "Mappatura 2026 (sito)" e
   "Avanzamento del sito", niente piu' "chiusa altrove su #id". Controlli e
   Statistiche contano siti. Gemello Python: `api._mese_scadenza` da solo,
   `_scadenze_cliente` cancellata.
2. **La capsula completa si accende di verde** (`griglia.css`): fondo
   `--completa` pieno, alone verde, segmenti schiariti al 62% di bianco perche'
   si veda che ci sono tutti e quattro. Prima era un fondo al 16% e un contorno:
   scorrendo 274 righe non si distingueva.
3. **"Chiudi tutti" / "Apri tutti"** nell'angolo della testa della griglia
   (`.piega-tutti`, `piegaTutti()` in `anno.js`, icone `ICO.comprimi`/`espandi`).
   Agisce sul set filtrato, come tutto il resto.
4. **Vista Mese**: `scadenzeDelMese` conta i siti in scadenza invece dei clienti;
   il riepilogo resta a due unita' dichiarate ("10 in scadenza · 55 impianti").
5. **Il bug del cassetto e la latenza** ([frontend.md](frontend.md) trappole 11 e
   12). Il pannello si ridisegnava tutto a ogni spunta (`replaceChildren`) e
   riportava lo scorrimento in cima: ora `rinfresca(mese)` aggiorna in posto.
   La latenza veniva dal conteggio: la mappatura di un cliente interrogava tutti
   i suoi service e il riepilogo in testa rifaceva il giro a ogni clic. Ora
   `memoMap` per sito (invalidata da `tocca(id)` in `scriviLocale` /
   `cellaDalServer`) e `aggiornaTestaPresto` una volta per frame. **Misurato in
   browser: 1 ms per spunta, ~18 ms per il disegno intero della griglia.**
6. **Controlli ripuliti e due torte** ([decisioni.md](decisioni.md) 15b — la
   vista e' poi stata rimossa alla 8a sessione, 15c): via i tre pannelli sul dato
   Access e via il filtro "Mostra stime" (con lui `st.filtri.mostraStime` e il
   ramo in `lavoroDelMese`). Le torte sono SVG scritti a mano (`arco()`), tinte
   gia' validate (`--pr-0..--pr-4` e i colori di stato), legenda con parola +
   numero + percentuale, nessuna tabella doppia sotto.
7. **Riepilogo in testa**: quattro voci (clienti · siti · complete · in ritardo)
   con `white-space: nowrap`; l'etichetta "mappature complete" andava a capo e
   abbassava la voce rispetto alle altre - era quello l'"indentato male".

### Da verificare (7a sessione)

- **Il CSV esce ancora con la regola vecchia** finche' il server non si riavvia:
  `api.py` e' caricato all'avvio e durante la sessione il server del committente
  era gia' in esecuzione (porta 8770, non toccata). Al primo riavvio la colonna
  `Ruolo` torna coerente (`MAPPATURA` sul primo mese di ogni sito).
- **I numeri crescono di nuovo**: 266 mappature dovute invece di 217, 235 in
  ritardo invece di 190. E' l'unita' nuova, nessun dato e' stato toccato.
- **ULSS 1 DOLOMITI ha 8 siti aperti, non 9** (il nono e' chiuso o sta sotto
  un'altra ragione sociale): la griglia mostra `8 aperti` e otto mappature. Se il
  committente ne aspetta nove, si guarda con "Mostra chiusi".

## Fatto il 2026-09-07 (6a sessione)

Chiesto dal committente guardando le Statistiche, in una frase sola: *"di
mappature devi averne solo una per ogni cliente, non fai una mappatura ogni
visita. Dopo aver fatto una mappatura sei a posto per quell'anno quindi la
casella risulta completa, quindi anche nelle statistiche, non devono spuntare
tutte quelle mappature, e il ritardo essendo solo il primo mese nelle statistiche
da fare si colloca su quel mese non periodicamente, inoltre i clienti devono
spuntare tutti dalle statistiche ne spuntano solo una parte"*.

1. **L'unita' di conto passa da (service, anno) a (cliente, anno)**
   ([decisioni.md](decisioni.md) 10g, [anno-e-tempo.md](anno-e-tempo.md)).
   Nuove `scadenzaCliente(cid)`, `mappaturaCliente(cid)`, `lavoroServizio(s)` in
   `stato.js`; via `mappaturaAnno(s)` e `chiusaAltrove`. `classeMese` marca
   `previsto` **una sola cella per cliente**; `statoCella().ritardo`,
   `progresso`, `progressoGruppo`, `riepilogoAnno` e i filtri "solo
   incomplete"/"solo in ritardo" contano per cliente. In `anno.js` `quotaMese` e
   `totaliMese` contano clienti, e `aggiornaTotali` ridipinge anche la riga che
   porta la scadenza (puo' essere un ALTRO service). Cassetto: la riga dice
   "Mappatura 2026 (cliente)" e, se chiusa altrove, su quale impianto; il bottone
   "Chiudi la mappatura" agisce su questo impianto e chiede conferma se il
   cliente e' gia' a posto. Controlli: "Mappature in ritardo" elenca clienti.
   Gemello Python: `api._scadenze_cliente` per la colonna `Ruolo` del CSV.
2. **Statistiche riscritte sull'unita' nuova** (`stat.js`): `raccogli()` fa una
   voce per CLIENTE; la carta "Mappature per cliente" ha una riga per cliente con
   i suoi `PASSI` (non piu' "quante su quante") e **ci sono tutti i clienti**,
   anche quelli fuori conto, tenui (`.fuori`) e marcati "pre-avvio" / "non
   dovuta"; l'elenco parte completo e scorre dentro la carta (`.barre-cli.lunga`,
   max 460px). Ogni mappatura pesa su un mese solo, quello della scadenza.
3. **Vista Mese: due unita' separate e scritte** (`mese.js`): "in scadenza"
   (mappature dovute nel mese, una per cliente) e "impianti" (le schede). Prima
   le schede si chiamavano "mappature" e sembravano una per visita.

Non toccato di proposito: le schede del mese restano per impianto (il tecnico
visita impianti), e la scadenza non slitta al tracciamento (regola della 5a
sessione, [decisioni.md](decisioni.md) 10e).

## Bloccato in attesa del committente

- Frase troncata nel brief originale: *"mappatura corretta ergo"*. Le spunte
  sono implementate come libere (qualsiasi ordine). Se intendeva un vincolo
  di sequenza (non si puo' spuntare "corretta" senza "controllata"), va aggiunto:
  in `api._applica()` un controllo, e in `theme/config` un interruttore
  `ordine_obbligatorio`.
- **Nome breve del quarto passo.** In vista Mese e nel cassetto le caselle sono
  strette e i nomi lunghi: "Mappatura completa rapportino" e "Controllo ricambi e
  scadenze" sono diventati `Rapportino` e `Ricambi` (`BREVE` in `stato.js`). Se
  in reparto li chiamano in un altro modo, e' una riga da cambiare.

## Da verificare

- **Il quarto passo sui dati vecchi.** Le 591 righe `mappature` esistenti hanno
  `ricambi = 0`: le mappature che erano complete a tre passi ora sono 3/4.
  Da concordare se serve un recupero (spuntare in blocco `ricambi` dove i primi
  tre passi ci sono gia': si fa da *Azioni > Completa tutte le spunte* con un
  filtro, oppure con un UPDATE una volta sola).
- **Stampa del foglio del mese con quattro caselle.** In `stampa.css` le caselle
  sono in linea: con quattro il rigo e' piu' largo e su A4 potrebbe andare a capo.
  Non provato su stampante.

- **Service worker.** In Chrome/Edge reale: aprire l'app, DevTools >
  Application > Service Workers, controllare che sia `activated`. Nella webview
  usata per il collaudo la registrazione viene rifiutata con "unknown error when
  fetching the script" pur essendo servito 200 con MIME corretto — molto
  probabilmente e' un limite della webview. Senza SW l'app funziona ugualmente
  online e offline-con-scheda-aperta; serve solo per riaprire l'app a server
  spento.
- Stampa reale su A4 (`stampa.css` non e' stato provato su stampante).
- **Prova con due PC diversi in LAN.** Finora la concorrenza e' stata verificata
  simulando un secondo `client_id` dalla stessa macchina (percorso server/SSE
  identico). Da provare sul campo:
  1. due operatori sullo stesso mese, spunte incrociate -> devono vedersi;
  2. la **fascia rossa del doppio server**: avviare `avvia.bat` su un secondo PC
     e controllare che entrambi la mostrino (il protocollo di scoperta risponde
     correttamente, ma il caso a due macchine non era riproducibile qui);
  3. il firewall di Windows: alla prima connessione da fuori compare la richiesta
     di autorizzare Python -> Consenti su reti private.
- `avvio-automatico.cmd` sul PC che fa da server (mai eseguito qui: modifica
  Esecuzione automatica dell'utente, e' un'azione che spetta a loro).

## Fatto il 2026-09-07 (5a sessione)

Tre cose chieste dal committente guardando le Statistiche.

1. **Conteggio corretto: la scadenza non slitta al tracciamento**
   ([decisioni.md](decisioni.md) 10e). `meseScadenza` prendeva il primo mese di
   classe `previsto`, e `previsto` esclude i mesi prima di
   `inizio_tracciamento`: un contratto marzo+settembre finiva con la scadenza
   sulla *visita* di settembre. Settembre 2026 mostrava 51 mappature in
   scadenza; sono **10**. Ora la scadenza e' il primo mese di manutenzione dentro
   il contratto e basta; se e' anteriore al tracciamento la mappatura dell'anno
   e' `preTrac` (visibile e spuntabile, fuori dai totali). Toccati:
   `stato.js` (`meseScadenza`, `preTracciamento`, `mappaturaAnno`, `progresso`),
   `anno.js` (le due funzioni dei totali per mese contano solo `prevista`),
   `api._mese_scadenza` (gemello Python, ora senza `inizio_trac`).
   **Numeri 2026: 30 dovute (10+8+4+8) e 236 pre-tracciamento, su 274 aperti.**
2. **Statistiche: due grafici nuovi, per cliente e per stato di completamento**
   ([frontend.md](frontend.md#la-vista-statistiche)). "Avanzamento per mese" e'
   diventato "Mappature per cliente" (righe cliccabili) e "A che punto siamo,
   mese per mese" (colonne divise per numero di passi fatti, che si aprono sul
   cliente scelto). Rimosse su richiesta: "Composizione del 2026" e
   "Completamento per tipo di service".
3. **Il verde vuol dire solo "mappatura completa"**
   ([decisioni.md](decisioni.md) 10f): il terzo passo passa da `var(--accento)`
   a magenta (`#A0307E` / `#CC5FA8`), nascono `--completa` e la rampa
   `--pr-0..--pr-4`, tavolozza rivalidata (`valida-tavolozza.py`, ora controlla
   anche il completamento contro i passi e la monotonia della rampa).

### Da verificare (5a sessione)

- **I totali del 2026 sono molto piu' piccoli** (30 invece di 194): e' corretto,
  la mappatura 2026 della maggior parte dei service scadeva prima che
  l'applicazione esistesse. Se il committente vuole i conti su tutto il 2026, la
  leva e' `inizio_tracciamento` = `2026-01` in **Azioni > Impostazioni** (dovute
  2026: 266). Non toccare la regola della scadenza per gonfiare i numeri.
- **Il terzo segmento della cella e' magenta** anche nella griglia, non solo nei
  grafici: e' il prezzo per liberare il verde. Se non piace, e' un solo token
  (`--st-corretta` in `theme.css`, due valori: chiaro e scuro).

## Fatto il 2026-09-07 (4a sessione)

1. **Una mappatura per anno** (#ANCHOR: mappatura-anno in `stato.js`, spiegata in
   [anno-e-tempo.md](anno-e-tempo.md#una-mappatura-per-anno-anchor-mappatura-anno)):
   scadenza al primo mese di manutenzione, nuova classe `visita` per gli altri,
   `mappaturaAnno()` come unita' di conto di testa / griglia / statistiche /
   cassetto, "Completa l'anno" nel cassetto diventa "Chiudi la mappatura" (4
   spunte, non 4x4), riga della griglia rinominata "Mappature in scadenza",
   colonna `Ruolo` nel CSV col gemello Python `api._mese_scadenza`.
2. **Rosso per la scadenza contratto**, ambra solo per l'arretrato: token
   `--scadenza` / `--scadenza-tenue` (chiaro `#C0392B`, scuro `#F2705F`),
   `.cella.darinnovare`, `.bollo.darinnovare` e `--cl-rinnovo` passati al rosso,
   tavolozza rivalidata con `valida-tavolozza.py`.

### Rimosso nella stessa sessione, su richiesta

Era stata costruita anche una **vista Fogli** (registro dei fogli consegnati al
tecnico e non tornati: tessere consegnati/tornati/fuori, elenco con "da N
giorni", endpoint `GET /api/fogli`, filtro "Solo fogli fuori", carta nelle
Statistiche, bolli `FOGLIO FUORI` / `VISITA` / `ANNO GIÀ FATTO` in vista Mese).
Il committente ha chiarito che **i fogli erano un esempio** per spiegare il senso
dell'applicazione, non una richiesta, e che non vuole etichette in piu' sulle
schede: tutto rimosso, `js/fogli.js` cancellato. La distinzione mappatura/visita
resta dove serve — capsula piena contro capsula col solo contorno nella vista
Anno, tooltip, riga "Mappature in scadenza", colonna `Ruolo` del CSV.
**Non riproporre la vista senza richiesta esplicita** ([decisioni.md](decisioni.md)
punto 10d).

### Da verificare (4a sessione)

- **Il numeratore delle mappature complete e' cambiato di significato**: 8/194
  invece di 8/219 (e alla 5a sessione 30 dovute, vedi sopra). Nessun dato e'
  stato toccato, ma se il committente ha in mente i numeri vecchi va spiegato.
- **Recupero storico e mappatura chiusa altrove.** Una mappatura completa in un
  mese *pre-tracciamento* mette a posto l'anno: e' voluto, ma se volessero
  contare solo dalla data di tracciamento e' una riga in `mappaturaCliente`
  (`chiusaAltrove` non esiste piu' dalla 6a sessione: il lavoro si cerca su tutti
  i mesi di tutti i service aperti del cliente).

## Fatto il 2026-09-07 (3a sessione)

- **Quarto passo** `ricambi` = "controllo ricambi e scadenze"; il terzo passo
  rinominato in "mappatura completa rapportino". I passi sono ora una lista
  (`CAMPI`/`PASSI`), non tre punti cablati: vedi
  [decisioni.md](decisioni.md) punto 5b.
- **Filtro "Solo incomplete" corretto.** Guardava sempre tutti i mesi dell'anno,
  quindi in vista Mese una mappatura appena completata restava a schermo perche'
  un *altro* mese era incompleto. Ora in vista Mese guarda solo quel mese; in
  vista Anno resta la domanda dell'anno. Stessa correzione per "Solo in ritardo"
  (`passa()` in `stato.js`).
- **Filtro "Solo mappatura" rimosso**, insieme al bollo `MAP`, alla riga nel
  cassetto e alla colonna CSV: sono tutte mappature, quel Si/No era
  un'informazione superata.
- **Vista Statistiche** (`js/stat.js`, `css/stat.css`): idea 5 di questo elenco,
  fatta. Descritta in [frontend.md](frontend.md#la-vista-statistiche).
- `.tre` rinominata `.passi-riga` (con quattro caselle il nome era falso).
- `.claude/launch.json` per avviare/anteprimare il server dagli strumenti.

## Fatto nella revisione del 2026-09-04 (2a sessione)

- Modello dell'anno con classi temporali: [anno-e-tempo.md](anno-e-tempo.md).
- `Azioni > Completa / Azzera tutte le spunte` con conferma numerica e Annulla.
- Rilevamento di un secondo server in rete + fascia rossa; blocco del doppio
  avvio sullo stesso PC; `avvio-automatico.cmd`; `avvia-solo-server.cmd`.
- Pannello "Lavorare in piu' persone" (indirizzo LAN, chi c'e', coda, diario).
- Fascia ambra quando il server non risponde, con "Riprova ora".
- Riga "Complete nel mese" nella griglia.
- Impostazione `inizio_tracciamento`.
- Filtri ricordati fra le sessioni; pulsante "Oggi"; tasto `O`.
- Correzioni: lente della ricerca, slash spurio, riepilogo che restava con numeri
  vecchi, frecce dell'anno che perdevano i clic, `avvia()` in temporal dead zone.

## Idee non implementate, in ordine di utilita'

1. **Ordinamento della griglia** per ritardo o per avanzamento (oggi e' sempre
   alfabetico per ragione sociale).
2. **Filtro per tecnico/team.** Il backend Access ha `tTeamTecnici`,
   `tTecnici`, `tProgVisite` (visite programmate con data e team). Collegare le
   mappature al team che fa la visita renderebbe la vista Mese assegnabile.
3. **Notifica di scadenza contratto** nella riga service: `data_scadenza` c'e'
   gia' in `services`, oggi si vede solo nel cassetto e nel tooltip della cella
   `da-rinnovare` (ora rossa).
3b. **Tempo di rientro dal tecnico.** Il dato c'e' (`eventi` sa quando e' stata
   messa `stampata` e quando `controllata`), ma non e' esposto da nessuna parte:
   se un giorno servisse, e' l'unica cosa che il log sa e i conteggi no.
4. **Esportazione PDF** della checklist mensile (oggi: stampa dal browser).
4b. **Avviso di contratti in scadenza**: `da-rinnovare` dice quali contratti
   bloccano la pianificazione dell'anno prossimo, ma non c'e' un elenco dedicato
   da nessuna parte. Il posto naturale ora e' una carta delle Statistiche.
   Sarebbe mezz'ora e ha valore commerciale.
5. ~~**Grafico di avanzamento annuale** per direzione~~ — fatto il 2026-09-07
   (vista Statistiche). Prima di toccare quei grafici caricare la skill
   `dataviz`: le regole seguite sono elencate in
   [frontend.md](frontend.md#la-vista-statistiche).
6. **Multi-master vero** (due PC scollegati che si riallineano). Fattibile via
   replay della tabella `eventi`, ma non farlo senza richiesta esplicita: vedi
   [concorrenza.md](concorrenza.md#offline-cosa-funziona-davvero).

## Manutenzione

Controllo contrasto, da rifare se si toccano i colori. Per le tavolozze dei
grafici serve di piu' (banda di chiarezza, saturazione minima, separazione delle
coppie in protanopia/deuteranopia): lo script della skill `dataviz`
(`scripts/validate_palette.js`) e' in JS e **su questi PC non c'e' Node**, quindi
ne e' stato scritto un gemello Python con le stesse soglie e le stesse matrici,
conservato in `docs/ai/valida-tavolozza.py`. Contiene i set usati dall'app: i
quattro passi della cella, le quattro classi temporali, `--completa` contro i
passi, e le due rampe sequenziali (`--pr-*` "a che punto siamo" e `--ar-*`
anzianita' dell'arretrato). In fondo all'output ci sono le note sui WARN
attesi: leggerle prima di dire che qualcosa e' rotto.

```
python docs/ai/valida-tavolozza.py
```

```python
def lum(h):
    r, g, b = [int(h[i:i+2], 16) / 255 for i in (1, 3, 5)]
    f = lambda c: c / 12.92 if c <= .03928 else ((c + .055) / 1.055) ** 2.4
    return .2126 * f(r) + .7152 * f(g) + .0722 * f(b)

def cr(a, b):
    l1, l2 = sorted([lum(a), lum(b)], reverse=True)
    return round((l1 + .05) / (l2 + .05), 2)
```


- `data/backup/` tiene 20 copie (`config.json: backup_da_tenere`). Il file
  `data/cronoservice.db` e' l'unico dato non ricostruibile: va nel backup
  aziendale.
- Non esistono migrazioni di schema: vedi
  [sqlite-e-api.md](sqlite-e-api.md#se-serve-cambiare-lo-schema).
- Se il server non parte: `cd app && python server.py --no-sync --verbose` per
  isolare un problema di Access da un problema di rete.
