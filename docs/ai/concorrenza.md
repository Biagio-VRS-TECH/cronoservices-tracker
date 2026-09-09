# Concorrenza — offline e in rete

Requisito: due o piu' operatori, prima in locale, poi probabilmente su un server.
Lo stesso codice copre i due casi. Ancore: `#ANCHOR: merge` (`api.py`),
`#ANCHOR: api-client` (`web/js/api.js`), `#ANCHOR: sse` (`server.py`).

## Il principio

Non si blocca niente e non si chiede niente all'utente, tranne nell'unico caso
davvero ambiguo. Regge perche' **l'unita' di scrittura e' minuscola**: un singolo
campo booleano di una singola cella. Due operatori che lavorano "sullo stesso
mese" in pratica non si toccano mai.

## Le sei regole

1. **Scrittura minima.** Un `POST /api/toggle` cambia *un* campo di *una* cella.
   Nessun salvataggio di form, nessun record grande da fondere.
2. **Ottimistica.** L'interfaccia si aggiorna subito, poi mette l'operazione in
   coda. Nessuna attesa percepita.
3. **Coda persistente.** La coda sta in `localStorage` (`cs.coda.v1`): sopravvive
   a chiusura del browser e assenza di rete. `beforeunload` avverte se non e'
   vuota. La cella in attesa ha classe `sospesa` (opacita' ridotta) e il
   contatore in barra dice "N spunte in coda"; cliccandolo si forza l'invio.
4. **Idempotenza.** Ogni operazione ha un `op_id` (UUID). Il server registra gli
   `op_id` applicati in tabella `ops`: un rinvio risponde `replay` e non
   raddoppia niente. Per questo la coda puo' essere rispedita senza paura.
5. **Push.** Le modifiche altrui arrivano via SSE (`/api/stream`) e ridisegnano
   **solo** le celle toccate. La cella pulsa una volta con le iniziali/nome di
   chi l'ha cambiata (classe `remota` + `.eco-nome`). Reconnect con backoff
   esponenziale fino a 20 s; alla riconnessione si svuota la coda.
6. **Merge per campo, non per record.** Il client manda `base_rev` (la revisione
   che aveva) e `base_valore` (il valore che credeva di avere per *quel* campo).
   Il server confronta:

   | situazione | esito |
   |---|---|
   | `rev` invariata | scrive, `esito: ok` |
   | `rev` cambiata ma il campo e' gia' al valore richiesto | `gia-cosi`, nessuna scrittura |
   | `rev` cambiata, il campo e' ancora al `base_valore` del client | l'altro ha toccato un campo **diverso** -> scrive, `esito: merge` (silenzioso) |
   | `rev` cambiata e anche il campo e' cambiato | **409 conflitto**: risponde con la versione del server |

   Solo l'ultima riga arriva all'utente, e arriva come frase concreta:
   *"Controllata dal tecnico: Anna Bianchi l'ha messa a «fatta» mentre tu la
   mettevi a «da fare». Ho tenuto la sua."* con un pulsante **Tieni la mia**.
   Vince il server per default: chi arriva secondo non sovrascrive in silenzio.

## Le spunte non possono confliggere davvero. La nota si'

Vale la pena scriverlo, perche' rileggendo la tabella qui sopra sembra il
contrario: **sui quattro passi il 409 non scatta mai**, ed e' giusto cosi'. Il
campo e' un bit e il client manda solo cambiamenti, quindi `valore` e'
per forza l'opposto di `base_valore`: se il valore sul server e' quello
richiesto siamo a `gia-cosi`, se e' quello che il client credeva di avere siamo
a `merge`. Non c'e' un terzo caso. Due operatori che spuntano lo stesso passo
non si accorgono l'uno dell'altro perche' *non c'e' niente di cui accorgersi*:
volevano la stessa cosa.

**La nota e' l'unico campo di testo libero, quindi l'unico dove si perde
davvero del lavoro** (18a sessione: fino ad allora era un UPDATE secco, ultimo
che scrive vince, senza che nessuno lo sapesse). Ora `POST /api/nota` porta
`base_rev` e `base_nota` e segue le stesse quattro regole di sopra; il 409
esiste per lui.

Due dettagli che sembrano cavilli e non lo sono:

- **La base e' quello che l'operatore AVEVA SOTTO GLI OCCHI, non quello che il
  modello sa adesso.** Mentre si scrive nella casella la nota altrui arriva dal
  flusso e aggiorna `st.celle`: prendendo la base da li' il conflitto sarebbe
  gia' stato "risolto" da solo, sovrascrivendo. Chi apre la casella si porta
  dietro `notaVista`/`notaRev` (`spunte.js`) e li passa a `salvaNota`.
- **Il testo che si sta scrivendo non si tocca mai.** `rinfrescaPop` riscrive la
  casella solo se non e' stata modificata; altrimenti la nota dell'altro viene
  *annunciata* sopra (`.js-eco-nota`, ambra) e si decide uscendo dal campo.

L'avviso del conflitto riporta tutte e due le frasi e offre **Unisci le due**
(`sua — mia`) e **Tieni la mia**; senza scegliere resta quella del server.

## Lato database

`WAL` + `busy_timeout` + un `threading.RLock` in-process (`db.WRITE_LOCK`) e
`BEGIN IMMEDIATE` su ogni scrittura. Il server e' l'unico scrittore in condizioni
normali; il `BEGIN IMMEDIATE` serve al caso di `python sync.py` lanciato a mano
mentre il server gira.

`bulk` applica N spunte in **una** transazione, con esito per voce: un conflitto
su una cella non fa fallire le altre.

## Presenza

`POST /api/ping` ogni 20 s con nome e "dove sono" (anno-mese). TTL 45 s. In testa
compaiono i pallini colorati degli altri collegati (colore derivato dal nome, cosi'
la stessa persona ha sempre la stessa tinta). Serve a sapere che c'e' qualcun
altro *prima* di pestarsi i piedi, non dopo.

## Offline: cosa funziona davvero

| scenario | comportamento |
|---|---|
| rete che va e viene, server acceso | spunte accodate e inviate da sole; spia blu lampeggiante |
| server spento, scheda gia' aperta | si continua a spuntare: tutto in coda |
| server spento, scheda da riaprire | serve il **service worker** per il guscio; i dati vengono da `localStorage` (`cs.bootstrap.v1`) con avviso "lavoro sui dati salvati" |
| due copie dell'app su due PC senza server | **non supportato**, ed e' ora attivamente segnalato: vedi "Il rischio vero" |

**Il modello previsto e' un solo processo server** raggiungibile in LAN
(`http://IP-del-PC:8770`): "offline" qui significa senza Internet, non senza
server. Se un giorno servisse il vero multi-master (due PC scollegati che si
riallineano dopo), l'infrastruttura c'e' gia' a meta': la tabella `eventi` e' un
log append-only con `op_id` unici, quindi la fusione e' replay degli eventi
mancanti in ordine di `ts`. Non e' implementato, e non va implementato senza
prima chiederlo.

## Il rischio vero con piu' computer: due server

Il guasto piu' probabile non e' un conflitto di scrittura: e' che **ogni operatore
faccia doppio clic su `avvia.bat` sul proprio PC**. Ognuno avrebbe il suo
`data/cronoservice.db`, i due archivi divergerebbero in silenzio per settimane e
nessun merge potrebbe piu' rimediare. Tre difese, dalla piu' forte alla piu' debole:

1. **Stesso PC, doppio avvio -> bloccato.** `main()` in `server.py` controlla la
   porta prima di partire e stampa "e' GIA' in esecuzione" invece di legarsi
   (su Windows `allow_reuse_address` permetteva a due processi la stessa porta).
2. **PC diversi -> scoperta in rete e fascia rossa.** `app/rete_locale.py`
   (`#ANCHOR: scoperta`) fa un piccolo scambio UDP in broadcast sulla porta 8771:
   chi parte chiede "CRONO?", ogni server risponde "CRONO! host url". Se risponde
   qualcuno che non e' questo PC, il server lo stampa in console e lo mette nel
   bootstrap (`altri_server`); l'interfaccia mostra a **tutti** una fascia rossa
   con il nome del PC e il link all'altro server. Ha la precedenza su qualsiasi
   altro avviso, compresa l'assenza di rete.
   Se il firewall blocca il broadcast non si scopre nulla: e' un avviso in piu',
   non una dipendenza. Il filtro sugli IP locali evita l'autosegnalazione, per
   cui su una sola macchina la scoperta non trova niente: e' corretto.
3. **Un server che c'e' sempre.** `avvio-automatico.cmd` (interattivo, senza
   privilegi di amministratore) mette `avvia-solo-server.cmd` in Esecuzione
   automatica del PC scelto come server. Cosi' non c'e' motivo per cui un altro
   ne apra uno suo.

## Chi ha aperto cosa (#ANCHOR: fuoco)

Il committente alla 20a sessione: *"in una sessione concorrente non si
visualizza chi seleziona la casella: sarebbe bene vedere che click sta facendo
l'altro operatore, senza risultare troppo pesante"*. Il lampo `remota` arriva
DOPO la spunta; qui si vede PRIMA, mentre il collega ha il popover aperto.

Un canale solo, quello che c'era: il **`dove` della presenza** porta anche la
cella aperta, `"2026-09 @22-12"` (`componiDove`/`spezzaDove` in `stato.js`).
`segnalaFuoco('id-mese')` in `api.js` la cambia (la chiamano `apriPop` e
`chiudiPop` in `spunte.js`) e fa partire un battito dopo 250 ms invece di
aspettare i 20 s. Poi:

- **locale**: `api.ping` salva il `dove` e, se e' cambiato, ritorna un evento
  `presenze` che l'hub SSE diffonde a tutti. Chi lo riceve passa da
  `aggiornaPresenze(online)` -> `segnaFuoco(nome, dove)` -> evento `fuoco`;
- **online**: la tabella `presenze` la leggono gli altri al LORO ping (fino a
  20 s dopo), quindi lo stesso `{nome, dove}` viaggia anche in **broadcast
  Realtime** sul canale gia' aperto (`nuvola.trasmetti('fuoco', ...)`, ricevuto
  in `apriStream` come `m.event === 'broadcast'`). Niente SQL: il broadcast non
  tocca il database. Chi arriva dopo lo vede comunque dalla tabella.

`st.fuochi` e' nome -> {cella, dove, ts}; chi sparisce dall'elenco dei
collegati viene tolto. A schermo (`aggiornaFuoco` in `anno.js` e `mese.js`):
anello del colore del collega (`outline`, che non litiga con i `box-shadow`
delle classi temporali) e le sue iniziali in un chip sopra la cella; nel Mese
bordo della scheda e iniziali all'angolo (`data-altrui`). Il pallino in testa e
il pannello dicono "sta guardando settembre 2026 · ha aperto <sito> (Dic)".
Il proprio nome e' escluso ovunque (`segnaFuoco` ignora `rete.operatore`).

**La pillola bianca** (stessa sessione): `.eco-nome` aveva `color:#fff` su
`background: var(--inchiostro)`, e nel tema scuro l'inchiostro e' #EDEEF0. Il
testo ora e' `var(--superficie)`: si inverte col tema.

**Esci**: solo online c'e' un login da cui uscire; `#esci` sta accanto a
"collegato" (`bottoneEsci`/`confermaUscita` in `app.js`) e nel pannello, e la
conferma dice quante spunte sono ancora in coda su quel computer.

## Cosa vede l'operatore

La concorrenza non serve a niente se e' invisibile. In testa c'e' un solo
pulsante (`#collegamento`, `#ANCHOR: stato-collegamento`) che tiene insieme le
tre cose da sapere:

- una **spia**: verde collegato, cyan lampeggiante ci sono spunte in invio,
  ambra server non raggiungibile;
- i **pallini** degli altri operatori collegati, col nome e cosa stanno guardando;
- un'**etichetta** parlante: "collegato", "3 collegati", "2 in coda - offline".

Cliccandolo si apre il pannello **Lavorare in piu' persone**: indirizzo da dare
ai colleghi (con Copia), chi e' collegato adesso, quante spunte sono in attesa,
e il diario delle ultime modifiche di tutti.

**Le parole cambiano fra locale e online** (18a sessione). In locale c'e' un PC
che fa da server, un indirizzo LAN e un computer da tenere acceso; su Netlify
non c'e' niente di tutto questo, e spiegarlo lo stesso confondeva e basta.
`DOVE_VIVE` / `DOVE_VIVE_MAI` / `DA_DOVE_VIVE` in `app.js` sono le tre forme
della stessa parola ("il server" / "l'archivio online"), decise una volta a
inizio modulo da `inNuvola()`; l'indirizzo da dare ai colleghi online e'
`location.origin`, e la nota sotto dice che serve una casella @vrs-tech.it
invece di parlare del firewall di Windows.

Quando il server non risponde compare una **fascia ambra** in cima con il numero
di spunte in coda e un pulsante "Riprova ora": e' impossibile lavorare mezz'ora
credendo di stare salvando.

## Passaggio a un server in Internet

Il codice non cambia. Cambiano tre cose intorno:

1. Mettere un reverse proxy davanti (HTTPS). **Disattivare il buffering** sulla
   rotta `/api/stream`, altrimenti l'SSE non arriva
   (nginx: `proxy_buffering off;` — l'header `X-Accel-Buffering: no` e' gia'
   inviato dal server).
2. Il `POST /api/sync` legge un `.accdb` locale: su un server Linux non funziona.
   Va sostituito con un caricamento periodico del JSON prodotto da
   `export_access.ps1` sul PC dove vive Access, oppure spostando i dati Access
   su un vero DB.
3. Aggiungere l'autenticazione: oggi l'identita' e' solo un nome (scelta del
   committente per la rete interna). Su rete pubblica serve almeno il PIN che
   era stato considerato.

## Cosa e' stato verificato in browser (2026-09-04)

- SSE: scrittura da un altro `client_id` -> la cella del primo operatore passa a
  `data-c="1"`, prende classe `remota` e mostra l'etichetta "Anna Bianchi".
- Conflitto stesso campo con `rev` vecchia -> HTTP 409 con la cella del server.
- Campo diverso con `rev` vecchia -> `esito: merge`, `rev` 1 -> 3, entrambi i
  campi conservati.
- Stesso `op_id` inviato due volte -> `ok` poi `replay`.
- Coda offline: `fetch` sabotato, 2 spunte -> coda 2, celle `sospesa`, spia
  "2 spunte in coda"; ripristinato `fetch` + evento `online` -> coda 0, entrambi
  i campi sul server.
- Server **davvero spento** (processo ucciso), spunta fatta -> fascia ambra,
  pill "1 in coda - offline", cella `sospesa`, coda 1; server riacceso ->
  entro il ritento automatico coda 0, fascia via, valore sul server. Nessun
  intervento dell'utente.
- Doppio avvio sullo stesso PC -> messaggio "e' GIA' in esecuzione", nessun
  secondo server.
- Protocollo di scoperta -> il server risponde
  `CRONO! DESKTOP-1KJ9K54 http://192.168.1.122:8770`.
  **Non verificato end-to-end** il caso a due PC veri (non riproducibile qui):
  la fascia rossa e' codice diritto, ma va provata sul campo.
