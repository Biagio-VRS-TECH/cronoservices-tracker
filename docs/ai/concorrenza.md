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

## Cosa vede l'operatore

La concorrenza non serve a niente se e' invisibile. In testa c'e' un solo
pulsante (`#collegamento`, `#ANCHOR: stato-collegamento`) che tiene insieme le
tre cose da sapere:

- una **spia**: verde collegato, cyan lampeggiante ci sono spunte in invio,
  ambra server non raggiungibile;
- i **pallini** degli altri operatori collegati, col nome e cosa stanno guardando;
- un'**etichetta** parlante: "collegato", "3 collegati", "2 in coda - offline".

Cliccandolo si apre il pannello **Lavorare in piu' persone**: indirizzo LAN da
dare ai colleghi (con Copia), chi e' collegato adesso, quante spunte sono in
attesa, e il diario delle ultime modifiche di tutti.

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
