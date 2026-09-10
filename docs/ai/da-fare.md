# Da fare / in sospeso

Aggiornare questo file a ogni sessione: e' il primo posto dove guardare per
riprendere il filo.

## Fatto il 2026-09-10 (28a sessione) - si scrive OK, la riga del cliente si legge, il PDF guarda avanti

Branch `ruoli-falla-cambio-nome` (lo stesso della 25a-27a). Cinque richieste in
una.

### 1. "Digita OK" su tutte le azioni in blocco dell'amministratore

`campoOK(bottone, {parola, etichetta})` in `ui.js` (#ANCHOR: conferma-ok):
ritorna l'etichetta col campo e tiene il bottone **disabilitato** finche' non
c'e' scritto OK. Non apre una finestra sua - sta dentro quella che c'e' gia',
cosi' il conto esatto resta sotto gli occhi mentre si conferma. Espone
`rivedi()` per chi cambia le carte in tavola a finestra aperta (in *Completa
tutte* la spunta "comprendi anche le visite" cambia il conto: se scende a zero
il campo sparisce e il bottone diventa "Chiudi").

Dove: **Completa tutte le spunte**, **Azzera tutte le spunte**, **Azzera il
diario attivita'** (nuovo, sotto) e **Cancella i PDF** di un anno nelle
Impostazioni. Quest'ultimo aveva un "Sicuro?" a due tempi sullo stesso
bottone: lo si prendeva col secondo clic di fila, che e' esattamente il gesto
che si voleva impedire. Ora apre una finestra sopra le Impostazioni - e per
questo `modale()` ora **da' i tasti solo al foglio davanti** (prima un Escape
ne chiudeva due e il Tab girava fra due fogli sovrapposti).

CSS nuovo in `base.css`: `.conferma-ok` (fascia d'allerta), `.campo-ok`,
`.bottone.pericolo` e `.bottone:disabled`.

### 2. Azzera il diario attivita'

Voce nuova nel menu Azioni, solo admin. `POST /api/diario_azzera` ->
`api.azzera_diario`; online `azzera_diario()` in `cloud/03-letture.sql`, con
l'EXECUTE in `04-sicurezza.sql`. **Da rieseguire su Supabase: `03` e poi
`04`.** Cancella `eventi` e basta: spunte, note e PDF restano dove sono.
La `DELETE` porta un `where id > 0` che sembra inutile e non lo e': Supabase
carica **pg-safeupdate** sulla connessione di PostgREST, e quella rifiuta ogni
`DELETE` senza clausola anche dentro una `security definer` ("DELETE requires
a WHERE clause" - preso in faccia al primo tentativo online). `where true` non
basta, il pianificatore lo butta via; `id > 0` resta e prende tutto, perche'
`id` e' un'identita' che parte da 1.
Spariscono pero' i **Ripristina**, che leggono proprio quelle righe - e' l'unica
azione dell'applicazione che non si disfa in nessun modo, ed e' per questo che
la conferma e' scritta a mano. `eventi` non e' nella pubblicazione Realtime,
quindi la cancellazione non fa partire una valanga di eventi verso i client.
Nessun evento SSE: chi ha il diario gia' aperto lo rilegge riaprendolo.

### 3. La riga del cliente: quattro segmenti al posto della barretta

`capsulaCliente`/`quotaMese` in `anno.js`, `.cella.capsula-cli` in
`griglia.css`. Per ogni mese, i `PASSI` segmenti della cella, piu' bassi
(11px): pieno = quel passo e' fatto su **tutti** i siti del cliente in scadenza
quel mese, tenue = su alcuni, spento = su nessuno; verde = tutto fatto. Prima
era `.qb`, una barretta unica che si riempiva da sinistra: diceva a che
percentuale si era arrivati, non a quale passo. Riusa per intero le regole dei
segmenti di `.cella`, quindi non nasce un secondo linguaggio di colori.
`aggiornaTotali` riscrive la capsula intera (dodici nodi per cliente) invece di
rincorrere quattro attributi.
**Trappola trovata**: il nome `riepilogo` era gia' preso da `base.css` (i
totali in barra, `display:flex` + `margin-left:auto`) e mandava a destra le
capsule della legenda. Da qui `capsula-cli`.

### 4. Il PDF mette la spunta sulla prima visita IN ARRIVO

`mesePerStampa(s)` in `stato.js` (#ANCHOR: mese-stampa), usata da
`urlGeneratore` (`documenti.js`) e da `caricaSiti` (`schede/ponte.js`). Prima
era `ma.mese || ma.scad`, cioe' il mese della mappatura: con un sito in
**ritardo** la spunta finiva su un mese gia' passato - le schede stampate oggi
risultavano consegnate a marzo, quando il tecnico ci va a novembre. Ora: primo
mese di manutenzione spuntabile **>= il mese di oggi** (visite comprese, non
solo la scadenza); su un anno futuro il primo dell'anno; su un anno gia' chiuso,
o se tutte le visite sono alle spalle, si torna al comportamento di prima.
Verificato sui dati veri: 8 siti cambiano, tutti del tipo `000001000001`
(giugno + dicembre, scadenza giugno) -> la spunta passa da giugno a dicembre.

### 5. Via il bottone "Sincronizza da Access"

Non serviva piu': online il `.accdb` non si raggiunge (rispondeva con un
messaggio di scuse) e in locale il server lo rilegge da solo all'avvio, mentre
il PC dell'ufficio spinge su Supabase alle 08:15. Tolti la voce di menu e
`sincronizza()`; **restano** `POST /api/sync`, `sync.esegui` e l'evento
`sync-fatto`, che continua ad avvisare chi e' collegato quando il travaso
avviene davvero.

### E la finestra "Come si legge"

Rifatta la legenda con quello che mancava e con quello che e' cambiato: il
**passo ereditato** (tenue) e il **passo proposto** (a righe) - c'erano nella
griglia dalla 20a e dalla 22a, non nella legenda -, la nuova sezione **"La
riga del cliente"** con due capsule d'esempio, e **"Il PDF delle schede e la
spunta Stampata"**. Il costruttore `cel()` prende ora anche il *valore* del
segmento (1/2/3), come funzione dell'indice per la riga delle proposte, cosi'
la legenda continua a seguire `CAMPI` e `DA_APPROVARE` senza numeri scritti a
mano.

Service worker `crono-guscio-v20`. Collaudato nel browser su una copia di
`data/prova.db` (porta 8775): menu Azioni senza il sync, il campo OK che
abilita e disabilita, il diario azzerato davvero (7294 righe, spunte intatte),
la finestra dei PDF sopra le Impostazioni con l'Escape che ne chiude una sola,
le capsule del cliente che si aggiornano dal vivo a ogni spunta, la legenda
allineata. Nessun errore in console.

### Seconda passata, stesso giorno: "cosa orrenda e' sta cosa tenue e a righe?"

Dopo il deploy, dal committente: la cella deve essere `[colore 1][colore 2]
[colore 3][colore 4]` in base alle spunte, **fine**; e "Controllata: gia' fatta
a giugno, per toglierla vai su quel mese" mentre lui e' amministratore e - a
suo dire - su quel mese. Due cose:

- **Un segmento o e' del suo colore o e' vuoto.** `data-x="2"` (ereditato) e
  `3` (proposto) si disegnano **identici all'1**, in `griglia.css`; nei
  bottoni `.passo` lo stesso: `.eredita` non e' piu' tenue e
  `aria-checked="mixed"` (proposta) ha la casella piena. Gli attributi e le
  classi restano nel DOM: sono il modello (statoCella, effettivo, i conteggi
  che contano solo l'1), cambia solo il disegno. A distinguere una proposta
  restano il tooltip, la pillola ambra "N da approvare" e il fatto che la
  capsula non diventa verde. Nella capsula del cliente `2` = "su alcuni siti"
  ora si vede acceso come "su tutti": la legenda dice "almeno uno".
- **Il passo ereditato si toglie da dove sei.** `toccaPasso(id, mese, campo)`
  in `stato.js`: se il passo e' ereditato dallo stesso anno lo toglie dal mese
  in cui era stato messo (`spunta(id, er.mese, campo, 0)`), emette `cella`
  anche per la cella cliccata (che perde l'ereditato) e lo dice ("Controllata
  tolta a settembre, dove era stata messa da Biagio"). Se viene dall'anno prima
  non si raggiunge da `st.celle` e l'avviso dice in che anno andare. Lo usano
  popover (`attiva`), Mese (clic e tasti 1-4), cassetto; il pallino del Mese
  (`completaScheda`) nel verso "togli" toglie anche gli ereditati. Il cassetto
  ora rinfresca **tutte** le righe a ogni `cella`, perche' una spunta a giugno
  cambia gli ereditati di settembre. L'avviso "per toglierla vai su quel mese"
  non esiste piu' in nessun file.
  Il caso "sono su quel mese e mi dice vai su quel mese" non si riproduce dal
  codice (`ered` esclude per costruzione il mese stesso): la spiegazione piu'
  probabile e' che il passo venisse da **giugno dell'anno prima**, e
  `doveFatto` lo diceva ("nel 2025 (giugno)") ma di sfuggita. Ora in quel caso
  l'avviso e' esplicito: "Si toglie dall'anno 2025".

Collaudato su `data/prova.db`: #174 con i quattro passi a settembre, la cella
di dicembre li eredita; dal popover di dicembre il clic su Controllata la
toglie da settembre (settembre 3/4, dicembre non piu' verde, popover e capsula
del cliente aggiornati); dal foglio di dicembre il clic su Stampata idem.
Service worker `crono-guscio-v21`.

### Rimasto fuori

- **L'azzeramento del diario non avvisa gli altri client**: chi ha il diario
  aperto in quel momento vede ancora le righe vecchie finche' non lo riapre.
  Basterebbe un evento `diario` (SSE + tipo nuovo in `apriStream`), ma
  online non ci sarebbe il gemello Realtime e i due giri direbbero cose
  diverse.
- **`POST /api/sync` non lo chiama piu' nessuna schermata.** Resta per una
  chiamata a mano: toglierlo vorrebbe dire togliere anche il ramo di
  `nuvola.js` e la voce in `ROUTE`, e il giorno che serve rimetterlo e' peggio.

## Fatto il 2026-09-10 (27a sessione) - il controllo finale prima del deploy

Branch `ruoli-falla-cambio-nome`, poi **deploy** (merge in `main` e push): e'
il primo deploy dopo la 24a, quindi porta online 25a, 26a e questa sessione
insieme. Richiesta: "un controllo finale a tutte le funzionalita' e
all'interfaccia, poi il deploy". Fatto con tre revisioni in parallelo
(correttezza del diff rispetto a `main`, semplificazione, accessibilita' con la
skill `web-design-guidelines`) e un collaudo nel browser su una copia di
`data/prova.db` (porta 8776): Anno, Mese, Statistiche, popover, cassetto,
ricerca, tema, "Chi sta lavorando", approvazioni, Impostazioni, Diario, menu
Azioni per operatore e per amministratore. Nessun errore in console.

### Difetti veri trovati e chiusi

- **Il client locale non ascoltava meta' degli eventi SSE** (`apriStream` in
  `api.js`): `EventSource` consegna solo i tipi a cui ci si iscrive, e la
  lista era ferma a `cella/celle/sync/presenze`. `ruoli`, `impostazioni`,
  `documento`, `documenti` cadevano nel vuoto: in locale un collega che
  salvava un PDF o veniva nominato non si vedeva finche' non si ricaricava.
  Ora sono iscritti tutti gli otto tipi che `api.py` emette.
- **Il proprio ruolo non si aggiornava mai dal vivo** (`eventoRemoto`,
  `stato.js`): `st.ruolo` arrivava solo dal bootstrap e il ramo `if
  (ev.ruolo)` era morto (l'evento e' un broadcast, non porta il ruolo di
  ciascuno). Ora, all'evento `ruoli`, il client richiede il proprio a
  `/api/operatore`: chi viene nominato approvatore vede la pillola subito,
  chi viene declassato perde il menu senza ricaricare. Provato: la
  promozione di un collega arriva in un secondo. (Online l'evento non
  esiste: `operatori` non e' nella pubblicazione Realtime; resta in sospeso.)
- **Cancellazione in blocco dei PDF: prima il server, poi il bucket**
  (`eliminaDocumenti`). Cancellava gli oggetti e POI chiamava la RPC: un 403
  (ruolo stantio), o un 404 perche' `06` non e' ancora stato rieseguito,
  lasciava le righe in piedi e i file spariti. Ora si cancella solo cio' che
  il server dice di aver tolto. Un orfano nel bucket e' il male minore.
- **Il rollback del PDF solo se il server ha detto no** (`salvaDocumento`): su
  timeout o rete caduta la riga poteva essere gia' scritta, e togliere il file
  dava il difetto opposto (riga senza file).
- **Il nome disambiguato non si perde a un avvio offline** (`avviaSessione`):
  `setOperatore(nomeDaEmail())` era incondizionato e sovrascriveva "Mario
  Rossi (mario.rossi)" con "Mario Rossi", cioe' il nome del collega omonimo.
- **Cache del bootstrap** `cs.bootstrap.v1` -> `v2`: i payload vecchi non
  hanno `ruolo`, e un admin che partiva offline veniva mostrato come operatore.
- **Function `registra-utente`**: un 401/403 di GoTrue sulla chiave service
  tornava al client com'era, e `funzione()` lo leggeva come "sessione
  scaduta" buttando fuori l'amministratore; ora e' un 502 che nomina
  `SUPABASE_SERVICE_KEY`. Un 404 su `ruolo_corrente` dice che vanno
  rieseguiti `02` e `04`. Lato client, un 5xx con testo non JSON (timeout di
  Netlify) non viene piu' scambiato per "manca la Function".
- **`netlify-build.sh`**: `unset SUPABASE_SERVICE_KEY` in testa: con `set -u`
  un uso accidentale ferma il build nominando la variabile.
- **SQL `03`**: il conto degli amministratori per il blocco "ultimo admin"
  considera solo le righe con una casella (una riga senza email non puo'
  entrare, e non deve far credere che "ce n'e' un altro"); terzo tentativo
  di disambiguazione del nome che non puo' collidere.

### Accessibilita' e interfaccia (dalla revisione)

- `modale()`: il fuoco torna a chi l'ha aperta, Tab gira dentro il foglio,
  `aria-labelledby` sull'`h2`. Menu Azioni: frecce su/giu' fra le voci, Esc
  rimette il fuoco sul bottone. Popover: Tab dalla cella entra nel popover,
  Esc torna alla cella; i tasti 1-4 non scattano dentro la nota. Cassetto: il
  fuoco torna alla riga; "Chiudi" ha l'`aria-label`.
- Etichette sugli input (nome, mese, casella e password del collega, nota);
  la password iniziale ha `spellcheck=false autocapitalize=off`; l'errore del
  login e' `role="alert"`; `title` sui testi troncati (diario, popover).
- Contrasti: `--tenue-2` #707377 / #9A9DA2 (era 3,7:1); `--marchio` come
  TESTO sostituito da `--marchio-scuro` (chip ruolo, mese corrente, "Storia",
  frecce); `.tm.pieno` con `--completa-testo`; nuovo token `--su-allerta` per
  banner e avvisi (nel tema scuro il bianco sull'ambra faceva 2,5:1);
  `.pill.attesa` con l'ambra scurita; `tinta()` a luminosita' 36% (le iniziali
  bianche passano su ogni tonalita').
- Bersagli a 24px (`.pill.mini`, `.pop-piede button`, `.cerca-x`, `.doc-chip`);
  la tendina delle province ha la freccina; `color-scheme` sui due temi;
  `theme-color` doppio; il logo ha `width/height`; `prefers-reduced-motion`
  ferma anche le animazioni infinite.
- Pulizia: `SIGLA_RUOLO` in `stato.js` accanto a `ETICHETTA_RUOLO` (era una
  copia locale piu' un ternario); `eAdmin` tolto (nessun chiamante);
  `dimensione()` in `ui.js` con la virgola italiana, riesportato da
  `documenti.js` e usato anche dall'errore del 413; `notaProposta` e i
  commenti dicono "chi approva", non "amministratore". La decisione della
  26a era numerata 23 come quella della 25a: ora e' la **24**.

### Dopo il deploy: "Azzera tutte" collaudato, e la produzione azzerata

Il committente ha segnalato che "Azzera tutte le spunte" dava problemi nella
preview. Provato in locale su `data/prova.db` da amministratore: l'azzeramento
(94 spunte, un `/api/bulk` a 200), il completamento (118) e l'**Annulla**
funzionano. Il difetto era **visivo**: nella finestra compariva la parola
"null", perche' `modale()` faceva `append(...)` anche del figlio `null` (la
riga delle opzioni che c'e' solo per "Completa") e il browser lo scrive come
testo. Ora `modale()` salta i figli nulli. Sul database di produzione i log
edge dicono che i `bulk_celle` del 10/09 alle 09:51 sono andati a 200 e le
mappature erano gia' tutte a zero.

**Produzione azzerata su richiesta** (10/09, dopo il deploy): `delete` su
`eventi`, `ops`, `mappature`, `documenti` (erano 2644, 2642, 293 e 0 righe).
**Non toccati**: `meta` (la data di inizio tracciamento la decide e la cambia
l'amministratore da Impostazioni), `operatori`, `presenze`, `sync_log`,
`clienti`/`services`. Nel bucket resta solo il segnaposto vuoto della
cartella `2026/556/` creato dal pannello. Il committente aveva gia' fatto da
solo: *Global file size limit* a 250 MB, `03` e `06` rieseguiti, orfani
cancellati.

### Da fare su Supabase (a mano, dal committente)

Niente: tutto applicato (vedi sopra). Resta come promemoria:

- **`06-documenti.sql`** (dalla 24a/26a: `elimina_documenti` e il tetto a
  200 MB; prima alzare il *Global file size limit* a 250 MB). Finche' non e'
  applicato, "Elimina tutti"/"Cancella anno" online rispondono con un errore
  e **non toccano niente** (e' il senso del nuovo ordine).
- **`03-letture.sql`** (il conto degli admin e la disambiguazione).
- I tre orfani sotto `2026/556/` dal pannello Storage (vedi 26a).

### Lasciato fuori, con motivo

- Online il proprio ruolo cambia solo al prossimo avvio: `operatori` non e'
  in Realtime. Aggiungerla alla pubblicazione e iscriversi in `nuvola.js` e'
  mezz'ora di lavoro, ma vuole SQL in piu' da rieseguire: alla prossima.
- In locale l'identita' resta il nome in `localStorage` (convenzione fra
  colleghi, come dice `decisioni.md` 22): il server non la puo' verificare
  senza un login. Il testo di "Chi sta lavorando" lo dice.
- `imposta_operatore` accetta ancora `p_nome` dal client al primo accesso (il
  nome lo si potrebbe ricavare solo dalla casella, lato server).
- Duplicati minori segnalati dalla revisione: il bottone "Sicuro?" a due
  tempi ripetuto tre volte (`cassetto.js` x2, `app.js`), `funzione()` e
  `rpc()` che condividono il grosso del trasporto, dominio aziendale e
  lunghezza minima della password scritti in piu' posti (client, Function,
  `autorizzato()`), indice mancante su `documenti(id_service)`.

Service worker `crono-guscio-v19`.

## Fatto il 2026-09-10 (26a sessione) - i PDF grandi entrano, si aprono in fretta, e non lasciano orfani

Branch `ruoli-falla-cambio-nome` (lo stesso: il deploy non e' ancora stato
fatto). Nato da un "Non salvato: The object exceeded the maximum allowed size"
salvando un documento lungo. Dettaglio del ragionamento in
[decisioni.md](decisioni.md) 24, che **rovescia la 21**.

### 1. Il tetto per file: da 40 a 200 MB

Il tetto era **nostro**, non del piano: l'organizzazione e' passata al **Pro**
(100 GB di Storage inclusi, egress 250 GB/mese, limite globale alzabile fino a
500 GB), quindi il motivo per cui la 21 lo teneva a 40 e' caduto. Un tetto pero'
resta: senza, un errore del generatore caricherebbe qualunque cosa.

- `file_size_limit` del bucket in `cloud/06-documenti.sql`: **209715200**.
- `MAX_PDF` in `app/api.py` (costante nuova, accanto a #ANCHOR: documenti):
  `200 * 1024 * 1024`. Prima il numero era murato nell'`if`.
- **A mano nel dashboard**: *Global file size limit* a **250 MB** (Storage →
  Settings). Ha la **precedenza** sul bucket, quindi va alzato **prima**;
  tenuto un gradino sopra, cosi' il tetto che decide resta quello del bucket,
  che sta in un file versionato.
- Grepato: non c'era **nessun** altro punto col limite, client compreso -
  `ponte.js` e `documenti.js` non guardano la dimensione del blob.
- 200 MB sono ~800 pagine a 288 dpi (251 KB a pagina, misurato). Nota: il
  caricamento e' un POST unico non ripristinabile, quindi 200 MB e' un
  paracadute, non un obiettivo.
- **La qualita' non e' stata toccata**: `SCALA = 3` in `ponte.js` resta. Cade
  anche la scala adattiva che la 21 indicava come "strada giusta": dava la
  copia peggiore proprio all'impianto piu' grande, e lo spazio non e' piu' un
  vincolo.

### 2. Piu' veloce da aprire, senza toccare la resa

- **`cache-control: un anno, immutable`** in `nuvola.caricaOggetto`: non era
  impostato e lo Storage metteva il suo default di un'ora. E' sicuro perche' il
  percorso e' un UUID nuovo a ogni salvataggio e `x-upsert` e' `false`: quel
  file non cambia mai.
- **Da solo non serviva a niente**, ed e' la parte meno ovvia: la cache ha per
  chiave l'**indirizzo**, e `urlFirmato` conia un gettone nuovo a ogni
  chiamata. Quindi la firma passa da un'ora a **otto ore** e `urlDocumento`
  (`documenti.js`) **se la tiene** in una mappa finche' vale (un minuto di
  margine). Chi riapre lo stesso PDF nel pomeriggio non riscarica dieci mega
  dal telefono. La mappa si svuota quando il documento viene eliminato
  (`scordaFirma`, chiamata da `eliminaDocumento` e `eliminaDocumenti`).
- Il bucket resta **privato**: nessun permesso e' cambiato.

### 3. Il messaggio d'errore dice cosa fare

`caricaOggetto` riconosce il 413 / "maximum allowed size" e risponde "il PDF
(N MB) supera il tetto per file dell'archivio: dividi il documento in fascicoli
con la tendina del generatore e salva di nuovo", invece del testo inglese dello
Storage. Stessa cosa lato locale in `api.py`. **Nessun passo nuovo per chi usa
l'app**: si genera, si salva, il PDF e' nel tracker.

### 4. I tre orfani: causa trovata nei log, e il buco chiuso

Tre oggetti sotto `2026/556/` (27,4 + 24,0 + 24,0 MB) senza riga in
`documenti`. **Non era la cancellazione in blocco** (quella toglie gli oggetti
*prima* delle righe). I log edge del 2026-09-09 dicono la cosa esatta: upload
**200**, poi `registra_documento` **403**, tre volte fra le 12:12 e le 12:13 -
la finestra in cui si stava riapplicando l'SQL della 25a sessione e il `revoke`
di `04` aveva tolto l'EXECUTE prima del ri-grant (lo stesso difetto corretto in
`bf951dc`). Verificato: **oggi i quattro grant dei documenti sono a posto**.

Il difetto strutturale era pero' un altro: `salvaDocumento` caricava e **poi**
registrava, quindi qualunque fallimento della registrazione lasciava un file
invisibile all'app. Ora **il caricamento si disfa**: `nuvola.eliminaOggetto` sul
percorso appena caricato, in un `try` suo, e viene rilanciato l'errore
originale (non quello della pulizia). Con i fascicoli, se salta il terzo di tre
i primi due restano registrati: sono documenti veri e visibili, si buttano dal
cassetto.

- **Da fare a mano**: cancellare i tre orfani dal pannello **Storage →
  `documenti` → `2026/556/`** (`e03faa5e…`, `6851af19…`, `efc4bce6…`). **Non**
  con una DELETE su `storage.objects`: toglierebbe la riga e lascerebbe il
  file, cioe' lo spazio che si vuole liberare.
- La query che elenca gli orfani sta in [../../cloud/LEGGIMI.md](../../cloud/LEGGIMI.md) 6.

### Da fare su Supabase

**Rieseguire `06-documenti.sql`** (porta il nuovo `file_size_limit`), dopo aver
alzato il *Global file size limit* a 250 MB. Il tentativo di applicarlo da qui
con l'MCP e' stato **bloccato dal classificatore dei permessi**: la scrittura
sul database di produzione la fa il committente.

Service worker `crono-guscio-v18`.

## Fatto il 2026-09-09/10 (25a sessione) - la falla del cambio nome, il terzo ruolo,
## l'etichetta "operatore" e la registrazione dall'app

Branch `ruoli-falla-cambio-nome`. Due cose, una grave e una richiesta.

### 1. Cambiare nome cambiava i permessi (difetto grave, online)

Il racconto del committente: entrato da amministratore, cambiato il nome,
permessi spariti; poi con un clic "sotto admin" se li e' ripresi. Sotto ci
sono tre difetti diversi, tutti chiusi:

- **`imposta_operatore` si portava via la riga di un collega**
  (`cloud/03-letture.sql`). Era un `on conflict (nome) do update set email =
  excluded.email, ruolo = excluded.ruolo`: scrivendo il nome di un altro, la
  riga di QUEL nome passava alla tua casella e prendeva il tuo ruolo.
  Bastava rinominarsi come l'amministratore per declassarlo e lasciare
  l'azienda senza nessuno che approvasse. Ora la riga di un'altra casella non
  si tocca mai: se il nome ricavato dalla posta e' gia' preso, il *proprio*
  viene disambiguato (`Mario Rossi (mario.rossi2)`).
- **Il client si fidava del nome digitato**: `sonoAdmin()` era
  `st.ruoli[rete.operatore]`. Cambiando nome i permessi sparivano a schermo
  prima ancora di parlare col server. Ora il ruolo di chi sta lavorando e'
  `st.ruolo`, che arriva **dal server** col bootstrap (`ruolo_corrente()`
  online, `db.ruolo_di` in locale). `st.ruoli` resta, ma serve solo a
  disegnare l'elenco nelle impostazioni.
- **Il campo per cambiare nome non c'e' piu'** (scelta del committente).
  `#io` ora apre una scheda in sola lettura: chi sei, la casella, il ruolo e
  cosa puoi fare. Il nome si chiede una volta sola, e solo al primissimo
  avvio in locale (online lo da' il login e non si tocca).
- In piu': la riga in `operatori` ora nasce **al login**
  (`avviaSessione` chiama `/api/operatore`). Prima veniva scritta solo se si
  apriva quella finestra, quindi chi non ci aveva mai cliccato non compariva
  nell'elenco dei ruoli e non poteva essere nominato.

### 2. Terzo ruolo: l'approvatore

`operatori.ruolo` = `'admin' | 'approvatore' | 'tecnico'` (vincolo `check` in
`01-tabelle.sql`). L'**approvatore** approva e respinge "Rapportino" e
"Ricambi" - la pillola "N da approvare" e' anche sua - e **basta**: niente
Completa/Azzera tutte, niente Sincronizza, niente Impostazioni, niente
"Ripristina", niente cancellazione dei PDF di un anno.

I due poteri sono ora due domande diverse, in tutti e tre i posti:

| | online | locale | client |
|---|---|---|---|
| chi approva | `puo_approvare()` | `db.puo_approvare` | `possoApprovare()` |
| chi comanda | `e_admin()` | `db.e_admin` | `sonoAdmin()` |

`_valore_per_ruolo` e `_applica` portano i due booleani separati (`p_approva`,
`p_admin`): rimettere una spunta *in attesa* (il 2, cioe' il ripristino) resta
del solo amministratore. Le vecchie firme vengono droppate negli script.
Nelle impostazioni la pillola di ogni collega gira in tondo: tecnico ->
approvatore -> amministratore -> tecnico.

**SQL applicato su Supabase in questa sessione**, come migrazioni
`ruoli_25a_01_vincolo_ruolo`, `..._02a/b/c/d`, `..._03a/b`, `..._04_permessi`
(il delta di `01`, `02`, `03`, `04`: tutti `create or replace`, quindi
rilanciare i file interi da capo resta possibile e innocuo). Il `web/` e'
ancora da deployare. Service worker `crono-guscio-v17`.

In `04` e' stato aggiunto `elimina_documenti(int, int)` al ri-grant dei
documenti: era stato dimenticato alla 24a sessione, e rilanciare `04` da solo
avrebbe revocato l'EXECUTE facendo tornare 403 la cancellazione dei PDF in
blocco - lo stesso difetto della 19a sessione, un anno dopo.

### Provato

**In produzione, su Supabase** (tutto dentro transazioni che si annullano da
sole, database pulito prima e dopo):
- l'attacco rifatto: un tecnico entra, poi si rinomina "Admin". Prima gli
  avrebbe portato via la riga; ora resta "Tecnico Finto / tecnico", la riga
  dell'amministratore non e' toccata, e `imposta_ruolo` gli risponde 403;
- il ciclo completo: tecnico che propone (k=2), approvatore che approva (k=1);
- all'approvatore rispondono 403 "Azzera tutte", "Ripristina", Impostazioni,
  la nomina di un admin e la cancellazione dei PDF di un anno; "Approva tutte"
  (origine `approvazione`) invece passa;
- al tecnico risponde 403 il tentativo di togliere una spunta approvata;
- la matrice di `_valore_per_ruolo` per i tre ruoli, valore per valore;
- una firma sola per `_applica` e `_valore_per_ruolo` (nessun sovraccarico
  ambiguo rimasto), e i grant giusti: le RPC aperte a `authenticated`, gli
  interni (`_applica`, `_valore_per_ruolo`, `operatore_corrente`) chiusi,
  niente ad `anon`. Advisor di sicurezza: nessun ERROR.

Su `data/prova.db` (porta 8775), matrice completa: tecnico che propone (2),
approvatore che approva (1) e respinge (0), tecnico che prova a togliere
un'approvazione (403), approvatore che prova a rimettere in attesa (403),
azioni di massa negate a tecnico e approvatore e concesse all'admin,
`/api/impostazioni`, `/api/sync`, `/api/ripristina` e `/api/ruolo` a 403 per
chi non e' admin, l'ultimo admin che non si declassa, un ruolo inventato
rifiutato. In browser: badge "approva", menu Azioni senza le voci dell'admin,
"Approva tutte (3)" che svuota la coda, la scheda di `#io` senza campi.

### "Tecnico" a schermo si legge "operatore" (stessa sessione)

Richiesta del committente. Cambia **solo l'etichetta**: il valore in database, in
`api.py` e nelle funzioni Postgres resta `'tecnico'`. Il posto per farlo c'era
gia' (`ETICHETTA_RUOLO` in `stato.js`), e cambiare il dato avrebbe rotto il sito
in produzione, che gira ancora col client vecchio e manda `'tecnico'`.
Toccati: `ETICHETTA_RUOLO`, `SIGLA_RUOLO` nelle impostazioni, il pannello
presenze (mostrava il valore grezzo), la coda *Da approvare*, il tooltip della
cella proposta, la scheda di `#io` e i commenti.

**Lasciato apposta**: `ETICHETTA.controllata` = "Controllata dal tecnico" (e'
il nome del passo 2, non del ruolo: li' "tecnico" e' chi fa il controllo sul
campo, e la parola arriva dal rapportino) e "Schede tecnici", che e' il nome del
generatore. Se il committente li vuole allineati, sono due stringhe.

### Registrare un collega dall'app (stessa sessione)

Richiesta del committente: prima si passava dal pannello di Supabase. Ora sta in
Azioni > Impostazioni > *Registra un collega*, sotto le pillole dei ruoli, e
compare **solo online**.

Ha richiesto il primo pezzo del progetto che non gira nel browser:
`netlify/functions/registra-utente.mjs` (#ANCHOR: registra-utente). Creare una
casella vuole la **service_role key**, che in `web/` non puo' stare. Resta
fedele alle regole: un file, nessun `npm`, nessuna dipendenza, nessun build.

**Il punto del disegno**: la Function non decide chi comanda. Prende il token di
chi ha premuto il bottone e chiede a Postgres `ruolo_corrente()` **con quel
token**; solo se risponde `admin` va avanti, e solo allora tocca la service key.
Cosi' l'autorizzazione resta nel database insieme a tutta l'altra, e se domani
cambiano i ruoli questo file non si tocca.

Scelte del committente: **password scritta dall'admin** (non invito per email -
l'SMTP di Supabase non e' configurato e i quattro utenti attuali sono tutti
creati a mano) e **solo registrazione**: disattivare e azzerare le password
restano in Supabase. Minimo di 10 caratteri e un bottone *Genera* facoltativo,
con un alfabeto senza i caratteri che si leggono male al telefono (O/0, l/1/I).

Serve una variabile in piu' su Netlify, `SUPABASE_SERVICE_KEY`, con lo scope
**solo Functions**: la procedura e' in `cloud/LEGGIMI.md`. Senza, il modulo
risponde "configurazione incompleta" e dice quale manca.

**Provato** con `node netlify/prove/prova-registra-utente.mjs`, rimasto nel
repo (fuori da `functions/`: vedi qui sotto): la esegue davvero sostituendo
`process.env` e `fetch` con dei finti, senza toccare ne' Supabase ne' Netlify.
Tredici casi - variabili mancanti, GET, senza token, operatore, approvatore,
token scaduto, casella non aziendale, dominio somigliante (`@finto-vrs-tech.it`),
password corta, corpo vuoto, corpo non JSON, casella gia' esistente, admin che
riesce - piu' due controlli che sono il punto di tutto il disegno: **in ogni
caso negativo la chiamata con la service key non parte**, e il ruolo viene
chiesto **col token di chi preme**. Esce 0 se e' tutto a posto.

Non e' un test framework e non vuole diventarlo: e' l'unico pezzo del progetto
che non si prova aprendo il browser, ed e' quello che tiene la chiave che puo'
tutto. Il giro end-to-end vero si vedra' sul Deploy Preview, dopo che il
committente ha messo `SUPABASE_SERVICE_KEY` fra le variabili del sito.

### La trappola di `netlify/functions/` (stessa sessione)

Il file di prova era stato messo accanto alla Function, in
`netlify/functions/`. **Netlify pubblica come funzione ogni file di quella
cartella**: uno script di test, che un handler non ce l'ha, fa fallire il build.
E l'errore non aiuta - `Failed during stage 'building site': Build script
returned non-zero exit code: 2`, senza dire quale file.

Costato tempo perche' il 2 e' anche la firma di `${VAR:?messaggio}` in dash, e
la pista sbagliata sembrava solida: sono stati sospettati i fine riga CRLF (nel
repo sono LF, `core.autocrlf=true` normalizza), la sintassi dello script
(valida, provata con `dash -n`) e la variabile `SUPABASE_SERVICE_KEY` marcata
secret (creata *dopo* il primo fallimento). Quello che ha risolto e' stato
guardare **quando** i deploy hanno iniziato a fallire, commit per commit, via
API di GitHub: l'ultimo verde era quello prima del file di prova.

La regola, adesso scritta anche in AI-HANDOFF: in `netlify/functions/` ci va
solo roba con un handler; le prove stanno in `netlify/prove/`.

### Cosa manca / da decidere (25a)

- **Il declassamento non arriva in diretta**: se un admin ti toglie il ruolo
  mentre lavori, il tuo `st.ruolo` resta quello vecchio fino al prossimo
  bootstrap. Il server rifiuta comunque (403), quindi e' solo cosmetico.
  L'evento `ruoli` puo' gia' portare `ruolo`, basta che il server lo mandi
  per-destinatario: online serve un canale per casella.
- **Il nome non si cambia piu' da nessuna parte**, nemmeno dall'admin. Se
  serve correggere un refuso, oggi si fa in `operatori` da Supabase.
- **In locale l'identita' resta un nome** (vedi 22a): il committente ha detto
  che in locale non lavorera' piu', quindi non e' stato messo nessun PIN.
- **Della registrazione manca il resto della gestione utenti**: disattivare chi
  esce dall'azienda e rifare la password a chi la perde restano da Supabase.
  Scelta del committente, non una dimenticanza: sono le due operazioni che fanno
  danni se partono per sbaglio. La Function e' pronta ad accoglierle - stesso
  controllo del ruolo, stessa Admin API (`PUT`/`DELETE /auth/v1/admin/users/<id>`).
- **La registrazione non finisce nel diario**: `eventi` e' fatto per le celle
  (id_service, anno, mese) e una riga senza cella non ci sta. Se servisse la
  traccia di chi ha registrato chi, il posto giusto e' una colonna
  `creato_da` in `operatori`, non un evento.

## Fatto il 2026-09-09 (24a sessione) - cancellare i PDF in blocco, per fare spazio

Nato da un "Non salvato: The object exceeded the maximum allowed size" del
committente: il tetto e' **nostro**, 40 MB per PDF (`file_size_limit` del
bucket in `cloud/06-documenti.sql`, `40 * 1024 * 1024` in `api.py`), e a
scala 3 (~300 KB/pagina) un documento lungo lo sfonda. Il piano Supabase non
c'entra: sul Free il tetto di progetto e' 50 MB **per file** (lo spazio totale
e' ~1 GB, il traffico ~5 GB/mese), sul Pro il limite si alza ma i PDF pesanti
restano lenti da aprire e mangiano traffico. Chiesto e scelto da lui:
**una funzione che cancella i PDF in blocco**, per anno e per sito.

- **`/api/documenti_elimina`** (`api.py`, `elimina_documenti`) e
  **`elimina_documenti(p_anno, p_id_service)`** (`06-documenti.sql`). Due
  perimetri, mai insieme: `{anno}` = tutto un anno, **solo amministratore**
  (e' potatura d'archivio, come azzerare in blocco); `{id_service}` = tutti i
  PDF di un sito, di ogni anno, **per chiunque** (e' lo stesso potere che
  l'Elimina di ogni riga da' gia' a tutti, in un clic invece di N).
- **Le spunte "stampata" restano**, come per il documento singolo: si butta il
  file, non il lavoro. Provato: sito 556 svuotato, `stampata` di maggio
  ancora 1.
- **Ordine: prima i file, poi le righe**, uguale locale e online (online gli
  oggetti li cancella il client con la lista del modello, poi il server
  cancella per criterio e risponde con i `percorsi` che ha davvero tolto -
  se il modello era vecchio, lo strascico si ripulisce subito dopo). Se si
  spezza a meta' restano righe senza file e ridare lo stesso comando finisce
  il lavoro; nell'ordine opposto resterebbero file orfani, cioe' lo spazio
  che si voleva liberare. In locale si buttano anche le cartelle dell'anno
  rimaste vuote.
- **UI**: Azioni > Impostazioni > **Spazio dei PDF** (solo admin, come tutte
  le impostazioni): un rigo per anno con `n PDF · peso`, il totale, e
  *Cancella* con conferma in due tempi ("Sicuro? N PDF", torna da solo dopo
  4 s). Nel cassetto, sotto la lista delle schede, **Elimina tutti (N)**
  compare da due documenti in su. I numeri vengono da `riepilogoDocumenti()`
  in `documenti.js`, cioe' dal modello: nessuna chiamata in piu'.
- **Nuovo in `nuvola.js`**: `eliminaOggetti(bucket, percorsi)`, una DELETE
  sola con `prefixes` a lotti di 100. Evento in blocco `{tipo:'documenti',
  eliminati:[...]}` -> `emetti('documenti-remoti')` in `stato.js` ->
  `eventoDocumentiEliminati` (`togliMolti`, un solo ridisegno). Online l'eco
  arriva gia' da Realtime, una DELETE per riga.
- Provato in browser su `data/prova.db` (porta 8775) con due anni finti:
  2024 cancellato (2 PDF, righe + file + cartella via), 403 a un tecnico che
  chiede un anno, 400 se arrivano anno e sito insieme, 200 con 0 se non c'e'
  niente. **Da rieseguire su Supabase: `06`** (vedi `cloud/LEGGIMI.md` 6).
- **Lasciato fuori**: alzare i 40 MB (serve il peso vero del PDF che gli da'
  errore) e la scala adattiva in `ponte.js` (288 dpi sui documenti corti,
  192 sui lunghi), che e' l'altra strada per non sfondare il tetto.

## Fatto il 2026-09-09 (23a sessione) - Access dalla rete, ripristino a blocchi, PDF a 288 dpi e in fascicoli

Quattro richieste, sul branch `anteprima-rete-blocchi-pdf` (deploy preview, non main).

- **Access dal percorso di rete** `\\192.168.1.220\DATI\AMMNE\TECH\CronoServices\CronoServices_be.accdb`
  (`config.json`, con le barre in avanti). Regola del committente: **quel file non
  va MAI modificato**. Quindi `sync.estrai` (#ANCHOR: copia-access) non lo apre
  piu' dov'e': lo copia byte per byte in `%TEMP%` (`copyfile`, niente attributi),
  PowerShell apre la **copia** (con `Mode=Read` in piu'), la copia e il suo
  eventuale `.laccdb` si buttano a fine lavoro. Sulla rete non compare nessun
  lock. Misurato: 8496 clienti, 545 service in 7,1 s. Vale anche per
  `push_cloud.py`, che usa la stessa `estrai`. Prima `../CronoServices_be.accdb`
  non esisteva nemmeno: il sync falliva e si andava avanti con la cache.
- **Ripristino a blocchi** (#ANCHOR: ripristino). `spuntaMolte` da' a ogni cella
  `op_id = <blocco>:<n>` (un blocco per azione, anche se le richieste sono
  piu' di una da 250). `/api/ripristina {op_id}` / `ripristina_blocco(p_op_id)`
  rimettono a `da` TUTTI gli eventi di quel blocco (o della spunta singola),
  dal piu' recente al piu' vecchio, come nuovo blocco con origine
  `ripristino`: si ripristina anche un ripristino. Solo admin. `storia` e
  `attivita` portano `op_id`; il diario raggruppa le righe consecutive dello
  stesso blocco in una (`li.blocco`: etichetta dell'azione, siti, mesi, le
  righe in un `details`) con **Ripristina il blocco**. Il client (`ripristina(e)`
  in `stato.js`) non tocca piu' il modello da solo: applica le celle che il
  server restituisce (anno corrente e anno prima). `descriviEvento` per un
  ripristino dice "ha rimesso X in attesa / fatto / da fare". Provato:
  Approva tutte (3) -> una riga -> Ripristina il blocco -> le 3 tornano in
  attesa e la pillola torna a 3. **Il "non succede nulla" riferito dal
  committente era online: le funzioni SQL nuove non erano ancora state
  eseguite su Supabase** (la vecchia `_applica` riportava il 2 a 1 -> gia' cosi').
- **PDF a scala 3 (~288 dpi), JPEG 0,8, lotti da 5** (`ponte.js`). La qualita'
  "massima e istantanea" che il committente ricorda era la stampa del browser,
  vettoriale: quel PDF il browser non lo consegna a nessuno, quindi non puo'
  finire nel tracker. Misurato sull'esempio della guida: 24 pagine in 7,1 s,
  ~300 KB a pagina (7,3 MB). Il tempo non dipende dalla scala.
- **Fascicoli**: con "Dividi la stampa in fascicoli" acceso e "tutto il
  documento" nella tendina, `generaPdfs` fa **un PDF per fascicolo**
  (`data-part` delle pagine), nome `... - fascicolo k di N.pdf`, scaricati
  uno dopo l'altro e consegnati con lo stesso `gruppo` (colonne nuove in
  `documenti`: `gruppo`, `fascicolo`, `fascicoli`, SQLite via AGGIUNTE e
  Postgres in `06`; `registra_documento` ha tre argomenti in piu', **drop
  della vecchia firma**). Il tracker li mostra come UN documento
  (`gruppiDocumenti`, `titoloDocumento` in `documenti.js`): nel cassetto una
  voce con miniatura del primo, "N fascicoli · pag. · MB · spunta", una fila
  di bottoni "1 · 12 pag." "2 · 12 pag.", Elimina toglie tutti; il chip
  accanto al sito conta i documenti, non i PDF; l'avviso "X ha stampato" esce
  una volta. La spunta "stampata" la mette il primo, gli altri trovano gia'
  cosi'.
- **Da rieseguire su Supabase, in ordine: 01, 02, 03, 04, 06, poi 07** con la
  casella dell'admin. Service worker `crono-guscio-v15`. Provato in browser su
  `data/prova.db` (porta 8775).

### Verificato online il 2026-09-09 (produzione, dopo il deploy `0b8ad52`)

Con l'SQL eseguito dal committente (01-04, 06, 07; `administrator@vrs-tech.it`
e' admin) e il suo login nel riquadro browser: proposta (valore 2) -> pillola
"1 da approvare" via Realtime -> Approva -> 1 -> Ripristina dal diario -> 2 ->
seconda proposta -> Approva tutte -> riga di blocco -> Ripristina il blocco ->
entrambe in attesa -> Respingi -> 0. Generatore online: 24 pagine, 2
fascicoli, 7,4 MB in 5,2 s, due oggetti nello Storage con lo stesso `gruppo`,
cassetto con la scheda a fascicoli, Elimina toglie oggetti e righe. Tutto
rimesso com'era (cella 519-7, documenti). La **sincronia verso Supabase gira
alle 08:15** (operazione pianificata registrata su questo PC, `cloud/installa-sync-cloud.*`).

### Da decidere / resta fuori (23a)

- Download multipli: Chrome chiede una volta il permesso "scaricare piu' file";
  se negato arriva solo il primo fascicolo, ma nel tracker arrivano tutti.
- Il ripristino della nota resta fuori (il diario non ha il testo precedente).

## Fatto il 2026-09-09 (22a sessione) - due ruoli: l'amministratore approva, azzera, sincronizza, ripristina

*"separa la gestione dei ruoli, gli utenti normali e l'utente admin: l'admin
approva le spunte di rapportino e ricambi [...] solo lui azzera o completa
tutte le spunte [...] solo lui ha un tastino di reversibilita' nelle azioni
degli utenti, comprese le sue [...] solo l'admin puo' sincronizzare da access"*.
Decisione 20 in [decisioni.md](decisioni.md), #ANCHOR: ruoli e approvazioni.

- **Il ruolo** sta in `operatori.ruolo` ('admin' | 'tecnico'), SQLite e
  Postgres. In locale il seme e' `config.json["amministratori"]` (nomi che
  restano admin comunque); online il ruolo e' legato alla **casella** del
  login (`e_admin()`), il primo si nomina con `cloud/07-ruoli.sql`, gli altri
  dall'app (Azioni > Impostazioni > Chi e' amministratore -> `/api/ruolo` /
  `imposta_ruolo`). L'ultimo admin non si declassa. Il bootstrap porta
  `ruoli`; `st.ruoli`, `sonoAdmin()`, `eAdmin(nome)` in `stato.js`.
- **Le due spunte da approvare** (`DA_APPROVARE` = corretta, ricambi) hanno un
  terzo valore nella stessa colonna: **2 = proposta**. Il tecnico che le
  spunta scrive 2 (e puo' ritirarlo, 2 -> 0); l'admin le porta a 1 (approva),
  a 0 (respinge) o, dal ripristino, di nuovo a 2. Un tecnico **non toglie un
  1** su quei campi: 403 `vietato`, e il client rimette la cella com'e'
  (`esitoFallita` ora riceve la cella del server). La traduzione
  intenzione -> valore e' in un posto per lato: `api._valore_per_ruolo` /
  `_valore_per_ruolo` SQL / `effettivo()` in `stato.js`. `spunta()` e
  `spuntaMolte()` la applicano; `prossimo(id, mese, campo)` e' il valore che
  un clic vuole (2 -> 1 per l'admin, 2 -> 0 per il tecnico).
- **Il 2 non conta mai come fatto**: `fatto(c, campo)` (=== 1) sostituisce
  ogni `c[SIGLA[campo]]` truthy - passi cumulativi, `statoCella.mie`, stat,
  CSV (Python `== 1`, SQL era gia' `= 1`). `statoCella().attesa` elenca i
  passi proposti. A schermo: segmento **a righe** (`data-x="3"`,
  `.cella.attesa`), `.passo.proposto` con `aria-checked="mixed"` in Mese,
  cassetto e popover, tooltip "proposta da X, in attesa dell'amministratore".
- **La coda dell'admin**: pillola ambra `#approva` ("3 da approvare"), solo
  per lui e solo se c'e' qualcosa, apre *Da approvare* (#ANCHOR: approvazioni
  in `app.js`): chi, mese, passo, sito (clic -> cassetto), Approva / Respingi
  per riga, Approva tutte con Annulla. Le origini `approvazione`, `respinta`,
  `ripristino`, `massa`, `annulla` finiscono in `eventi.origine`.
- **Solo admin**: Completa/Azzera tutte (menu nascosto + `/api/bulk` con
  `origine:'massa'` -> 403), Sincronizza da Access (`/api/sync` 403; online
  il sync e' del PC dell'ufficio comunque), Impostazioni (`/api/impostazioni`
  / `imposta_meta` 403). Il tecnico nel menu Azioni vede: Stampa, CSV, Diario,
  Doppioni. Le azioni multiple della vista Mese (selezione + "tutte") e
  "Chiudi la mappatura" del cassetto **restano a tutti**: passano da
  `spuntaMolte` senza `origine:'massa'`, e sui due campi il tecnico propone.
- **Ripristina** (il tastino di reversibilita'): nel Diario, nella storia del
  popover e nelle ultime modifiche del cassetto, solo per l'admin, su ogni
  riga di spunta di chiunque (sue comprese): rimette il campo a `da`, con
  `origine:'ripristino'` (`ripristina(e)` in `stato.js`; su un altro anno va
  dritto al server e aggiorna `cellePrec` se e' l'anno prima). `storia` e
  `attivita` portano ora `da` e `origine`; `descriviEvento(e)` scrive "ha
  proposto / approvato / respinto / ritirato / ripristinato".
- Postgres: `01` (colonna `ruolo`), `02` (`e_admin`, `_valore_per_ruolo`,
  `_applica` con `p_admin` - **drop della vecchia firma**), `03` (`ruoli` nel
  bootstrap, `imposta_operatore` conserva il ruolo, `imposta_ruolo`,
  `imposta_meta` solo admin, `da`/`origine` in storia e attivita), `04`
  (grant `imposta_ruolo`, `e_admin`), nuovo `07-ruoli.sql`. **Da rieseguire
  su Supabase nell'ordine 01, 02, 03, 04, poi 07 con la casella dell'admin.**
- Provato in browser sulla copia `data/prova.db` (porta 8775) con due nomi:
  tecnico propone/ritira e prende 403 sull'approvata; admin approva dalla coda,
  ripristina dal diario (1 -> 2), nomina e declassa dalle Impostazioni, l'unico
  admin non si declassa. Service worker a `crono-guscio-v14`.

### Cosa manca / da decidere (ruoli)

- **In locale l'identita' e' un nome scritto a mano**: chi scrive il nome
  dell'admin nel "Chi sei?" e' admin. Non c'e' password (scelta del
  committente, decisione 3). Online invece e' il login, e non si finge. Se
  serve anche in locale, la strada e' un PIN in `config.json` chiesto dal
  server a ogni scrittura admin: non fatto perche' non chiesto.
- **Chi propone non e' tracciato nella cella**: `by` e' l'ultimo che l'ha
  toccata. La coda mostra quello; il diario ha la verita' riga per riga.
- **Il ripristino della nota** non c'e': `eventi` non conserva il testo
  precedente (`da`/`a` sono interi). Servirebbe una colonna.
- **Ripristino di un'azione di massa** e' riga per riga (una per spunta): un
  "annulla tutto il blocco" dovrebbe raggruppare per `op_id`.
- **Eliminare un PDF** (`/api/documento_elimina`) resta di tutti: non chiesto.
- **Nessun avviso in diretta all'admin** quando arriva una proposta: la
  pillola si aggiorna da sola, ma non suona.
- **Il 2 in un anno "chiuso a dicembre"**: una proposta rimasta in attesa a
  dicembre non si eredita nell'anno dopo (si eredita solo l'1). Voluto.

## Fatto il 2026-09-09 (21a sessione) - la barra del generatore durante il salvataggio

- *"durante l'attivita' di salvataggio nella scheda generatore, la barra in
  alto continua a crashare"* -> era la **transizione di `--r`** (`ponte.js`,
  #ANCHOR: ponte). `misuraPillola` porta la testata a `--r:1` e la rimette a
  posto nello stesso giro di JS: il browser non vede due valori in un
  fotogramma, vede solo il ritorno, e sul ritorno accende
  `transition:--r .18s`. Una transizione appena nata mostra il valore di
  **partenza** — 1, cioe' la testata schiacciata a pillola ma larga quanto la
  colonna — finche' non arriva un fotogramma; e mentre html2canvas prepara il
  PDF il filo e' occupato per secondi interi. Risultato: la barra si
  accartocciava e tornava a posto un colpo per lotto di pagine, cioe'
  "continua a crashare". Tre correzioni:
  - la misura si fa a **transizioni spente**, con `void dock.offsetWidth`
    prima di riaccenderle: il ritorno a `--r` e' immediato e non lascia
    niente in attesa;
  - `aggiorna(immediato)` -> `scriviR(r, immediato)`: all'inizio del
    salvataggio la testata si riapre **d'imperio** (`aggiorna(true)` in
    `esportaESalva`), senza animazione, perche' da li' in avanti il filo non
    e' piu' suo. Sullo scorrimento a mano la transizione resta;
  - `rimisura` non misura mentre `inCorso` (la pillola non puo' comparire, la
    sua misura non serve a nessuno) e il `MutationObserver` su `#pages` non
    ridisegna mentre `inCorso`: quelle mutazioni sono di `generaPdf`, che
    sposta le pagine di lotto in lotto, e `progresso` ridisegna gia' da se'.
  Misurato sull'esempio della guida (24 pagine, 4,0 MB in 2,4 s): prima
  `--r` restava a 1 con una transizione in attesa a `currentTime 0`; ora resta
  a 0 per tutta la resa e torna alla pillola a lavoro finito.

## Fatto il 2026-09-09 (20a sessione) - i passi si accumulano, chi ha aperto cosa, Esporta e salva

Nove richieste in una volta, quattro sul generatore e cinque sul tracker
(dettaglio in [decisioni.md](decisioni.md) 19 e 15l; il modello dei passi in
[anno-e-tempo.md](anno-e-tempo.md#i-passi-si-accumulano-non-si-rifanno-anchor-passi-cumulativi)).

**Tracker**

- *"se un sito ha visite in piu' mesi e ho delle spunte gia' segnate il primo
  mese, quelle valgono anche per i successivi [...] anche per l'anno"* -> **i
  passi si accumulano** (#ANCHOR: passi-cumulativi in `stato.js`).
  `mappaturaSito(s).passi` e' l'unione per campo di tutti i mesi dell'anno
  (prima era il mese "migliore"), piu' i passi dell'anno prima **se quella
  mappatura era rimasta aperta** (0 < n < PASSI); se era chiusa l'anno dopo si
  riparte. Il bootstrap porta `celle_prec` (l'anno prima) da tutti e due i
  backend. `statoCella` ritorna `ered` (campo -> {anno, mese, by, at}), `mie`
  (i suoi) e `n` = suoi + ereditati. La cella li disegna con `data-x="2"`
  (segmento tenue), il popover, il foglio del Mese e il cassetto li mostrano
  spuntati-tenui con "gia' fatta a maggio da X · si toglie da li'": **da una
  cella non si toglie un passo fatto altrove**, e "Completa i passi mancanti"
  mette solo quelli che mancano davvero. Una spunta in un mese ridipinge
  tutte le capsule della riga (`aggiornaCella` in `anno.js`), e la scheda del
  Mese si aggiorna anche per spunte messe in altri mesi dello stesso sito.
  **Limite scelto**: la mappatura dell'anno prima resta segnata incompleta
  anche se il quarto passo arriva a marzo dell'anno dopo (servirebbero le
  celle dell'anno DOPO, e una regola circolare). Si guarda un anno indietro,
  non due.
- *"lo storico dei pdf sarebbe meglio se rimane anche per gli anni dopo"* ->
  il bootstrap e `/api/documenti` (senza `anno`) portano **tutti** i documenti;
  `documenti.js` non filtra piu' per anno; il chip e' tenue (`.altro-anno`)
  quando l'ultimo PDF non e' di quest'anno e il suggerimento dice di che anno
  e'. `06-documenti.sql`: `_documenti_json(null)` = tutti.
- *"un tastino per il logout"* -> `#esci` accanto al segnale "collegato", solo
  online (`bottoneEsci` in `app.js`), con conferma che ricorda le spunte in
  coda; la stessa uscita sta nel pannello *Lavorare in piu' persone*, sezione
  "La tua sessione" con la casella.
- *"vedere che click sta facendo l'altro operatore, senza risultare pesante"*
  -> **il fuoco** (#ANCHOR: fuoco in `stato.js`). Il `dove` della presenza
  porta la cella aperta: `"2026-09 @22-12"`. La manda `segnalaFuoco()` in
  `api.js` (popover aperto/chiuso in `spunte.js`), con un battito subito
  (250 ms) invece di aspettare i 20 s. In locale `api.ping` diffonde
  `presenze` via SSE quando il `dove` cambia; online lo stesso valore viaggia
  anche in **broadcast Realtime** (`nuvola.trasmetti`, evento `fuoco`), oltre
  che nella tabella `presenze` per chi arriva dopo. A schermo: anello del
  colore del collega (`outline`, cosi' non litiga con i box-shadow) + iniziali
  (`.fuoco-nome`) sulla cella nell'Anno, bordo + iniziali sulla scheda nel
  Mese; il pallino in testa dice "ha aperto <sito> (Dic)". Nessuna riga SQL
  nuova: il broadcast non tocca il database.
- *"non si legge il nome, appare solo una pillola bianca"* -> `.eco-nome` aveva
  `color:#fff` su `background: var(--inchiostro)`: nel tema scuro l'inchiostro
  e' quasi bianco. Ora il testo e' `var(--superficie)`.

**Generatore**

- *"in modalita' libro la quarta pagina spunta come scheda vuota da compilare,
  dovrebbe essere intenzionalmente bianca"* -> il pareggio delle pagine
  iniziali (`fmPad`) e' `{t:'void'}`, come il rovescio della copertina; le
  pagine da compilare restano solo in fondo. Conteggi: `nVoid` lo comprende,
  `nFree`/`nBlank` no. UMBERTO I a documento unico: 96 pagine, bianche 2-4-96,
  "1 pagina da compilare · 3 pagine bianche".
- *"quando esporto lo salva con netlify"* e *"il tasto stampa e' inutile,
  sostituiscilo con Esporta e salva (e salva anche nel tracker)"* -> un solo
  bottone **Esporta e salva** (`esportaESalva` in `ponte.js`): produce il PDF
  con jsPDF UNA volta, lo scarica (`scaricaFile`) e lo consegna al tracker. La
  finestra di stampa del browser non c'e' piu' in mezzo - era lei a mettere
  titolo e indirizzo del sito (netlify.app) in testa e in fondo a ogni foglio -
  e resta su **Ctrl+P** (`stampaBrowser` in index.html). Senza sito o senza
  sessione il file si scarica comunque e la fascia dice perche' non e' stato
  archiviato. Il bottone del dock resta "Salva nel tracker" (solo consegna).
- *"la qualita' del file mi sembra bassina, si puo' alzare senza rallentare il
  download?"* -> scala **1,5 -> 2** (~192 dpi), JPEG 0,8 -> 0,74. Misurato: il
  tempo di resa non dipende dalla scala (html2canvas paga il clone del DOM,
  non i pixel), quindi la risoluzione e' gratis in tempo; i byte no: 171 ->
  ~230 KB a pagina (UMBERTO I 96 pagine: 22,3 MB in 25 s). Il PNG sarebbe
  piu' piccolo e senza perdita ma jsPDF lo ricomprime in JS (+0,4 s a pagina):
  scartato, i numeri sono nel commento sopra `SCALA`. **La velocita' del
  download non e' di Netlify**: i PDF stanno nello Storage di Supabase,
  Netlify serve solo l'applicazione. Pagare Netlify non cambierebbe niente.

**Da fare sul progetto Supabase**: rieseguire `cloud/03-letture.sql`
(`celle_prec`, documenti di tutti gli anni) e `cloud/06-documenti.sql`
(`_documenti_json(null)`, e i grant della 19a sessione). Finche' non si fa,
online i passi si accumulano solo dentro l'anno e i PDF restano quelli
dell'anno: il client tollera la mancanza di `celle_prec`.

**Come e' stato provato**: `server.py --db ../data/prova.db` (argomento nuovo)
su una copia dell'archivio, configurazione `crono-prova` in
`.claude/launch.json` sulla porta 8775 - `data/` e' ignorata da git, la copia
va rifatta a ogni sessione. Casi seminati: #12 con 3 passi a novembre 2025
(ereditati a maggio 2026, "3 passi gia' fatti nel 2025"), #22 con 2 passi ad
aprile 2026 (agosto e dicembre `2200`, poi `2220` dopo un passo ad agosto,
riga 3/4), #23 chiusa nel 2025 (niente ereditato). Secondo operatore simulato
con `curl` su `/api/ping` (`dove: "2026-09 @22-12"`): anello e iniziali sulla
cella entro un secondo via SSE; `/api/toggle` da un altro `client_id`:
capsula `remota`, etichetta leggibile nel tema scuro (testo #16181B su
#EDEEF0). Il generatore ha consegnato 96 pagine al tracker di prova con la
spunta su dicembre. **L'archivio vero non e' stato toccato.** Il broadcast
Realtime e il bottone Esci vanno provati online dal committente.

**Trappola della copia di lavoro, scoperta qui**: git ha `core.autocrlf=true`,
quindi i file che ha toccato lui sono CRLF su disco (`api.js`, `frontend.md`,
`decisioni.md`) e quelli riscritti dagli strumenti sono LF. Nel repo sono tutti
LF. Chi patcha per sostituzione esatta deve guardare il fine riga file per file.

## Fatto il 2026-09-09 (19a sessione) - il login che rifiutava una password giusta

Il committente: *"c'e' un bug, non mi fa accedere mi chiede sempre autenticazione
e me la da pure sbagliata"*, e poi il dettaglio che ha risolto il caso:
*"all'inizio fa entrare, poi la richiede dopo che vado su generatore fogli"*.
La scritta rossa era "Questa casella non e' abilitata: serve un indirizzo
@vrs-tech.it", con `helpdesk@vrs-tech.it`.

**Come si e' chiuso senza indovinare.** Dalla API di amministrazione di Supabase
(chiave in `app/cloud.json`, sola lettura): l'utente esiste, e' confermato, non
e' bloccato e ha un accesso **riuscito** quel giorno. Quindi il login funziona e
il 403 arriva da una RPC, dopo. E siccome `app_bootstrap` gira (si entra) e usa
lo **stesso** `autorizzato()` di `app_documenti`, il 403 non poteva essere
"casella non abilitata": era `permission denied for function`.

**Difetto 1, SQL.** `04-sicurezza.sql` fa `revoke execute on all functions ...
from authenticated` e poi rida' l'EXECUTE a una lista **scritta prima che
esistessero i documenti**: `app_documenti`, `registra_documento` e
`elimina_documento` stanno in `06-documenti.sql`. Rilanciato `04` dopo `06` -
cosa normale quando si ripassano gli script - le tre funzioni restano senza
permesso e il tracker prende 403 appena tocca le schede tecnici (il giro che
parte andando sul generatore, e `ricaricaDocumenti()` al ritorno di visibilita'
in `app.js`). **Sistemato**: in fondo ai grant di `04` c'e' ora un blocco `do`
che rida' l'EXECUTE alle tre, ma solo se esistono (`to_regprocedure`), cosi' su
un progetto nuovo - dove `06` non e' ancora passato - non fa niente e non ferma
lo script.

**Difetto 2, client (quello che faceva il muro).** In `rpc()` di
[nuvola.js](../../web/js/nuvola.js) il 403 era trattato come il 401: sessione
buttata via e ritorno alla maschera d'accesso, con un messaggio **indovinato**
("casella non abilitata") che copriva quello vero di Postgres. Risultato: un
permesso mancante su una funzione qualsiasi diventava un login che si ripresenta
all'infinito e sembra rifiutare una password giusta. **Sistemato**: il 401 resta
l'unico caso che butta la sessione; il 403 la lascia stare e riporta il motivo
vero e **il nome della funzione** che ha detto di no ("Il database ha negato
app_documenti: permission denied for function app_documenti"). La scritta
"casella non abilitata" compare ancora, ma solo quando il motivo di Postgres e'
davvero il nostro `non autorizzato`.

Lezione, la stessa della 11a sessione: un messaggio d'errore inventato dal
client costa piu' del silenzio. Se il server dice perche', si mostra quello.

**Da fare sul progetto Supabase** (il repo e' a posto, il database no): in SQL
Editor rilanciare `cloud/06-documenti.sql` - e' idempotente e rimette i tre
grant. In alternativa il solo pezzo che serve:

    grant execute on function public.app_documenti(int),
      public.registra_documento(int, int, int, text, text, int, int, text),
      public.elimina_documento(text) to authenticated;

Se `06` non fosse mai stato eseguito, il rilancio crea anche tabella, policy e
bucket: e' la strada buona in tutti e due i casi.

Verificato qui: l'applicazione locale carica tutto il grafo dei moduli senza
errori di sintassi e arriva al suo ramo normale (`attiva() === false`, il modo
locale non cambia). Il giro online va provato dal committente.

## Fatto il 2026-09-08 (18a sessione) - la testata del ponte, il titolo dal sito, i conflitti sulla nota

Cinque richieste in una volta: *"il dock nuovo del generatore e' fissato in
alto, quindi se scorro giu' nel file non si vede, invece dovrebbe sempre
rimanere in vista, senza coprire il pdf in nessun punto. inoltre usando la
skill frontend rinnovala perche' risulta antica, e alcune cose non si leggono
per intero se ho un sito con un indirizzo molto lungo"*; *"il nome del titolo
del documento, nel punto due intestazione, se c'e' un sito collegato, lo prende
da li' in automatico"*; *"nel tracker la scritta che c'e' cliccando su online
che spiega che una solo computer fa da server non penso abbia piu senso visto
che e' online su netlify"*; *"nella schermata mesi togli le scritte del
conteggio impianti, togli da stampare"*; *"i conflitti sono gestiti? se due
operatori entrano assieme?"*.

- **Il guscio del generatore** (`schede/index.html`). `#app` occupa la finestra
  e non scorre; `#main` e' una colonna con la testata `#ponte` e **`#banco`**,
  l'unico riquadro che scorre. Il dock era `sticky` dentro `#main`, che ha
  `overflow:auto` ma non scorre mai (a scorrere era la finestra): si agganciava
  a un riquadro fermo e usciva dallo schermo. Ora sta **fuori** dal riquadro che
  scorre, quindi resta in vista e non copre nessuna pagina.
  `scrollBox()`/`positionPartStrip`/`positionDocScroll` guardano `#banco`, la
  seconda scrive `--banco-top` per centrare le due guide `fixed` sulla colonna,
  e `@media print` rimette `#app`/`#main`/`#banco` a scorrimento libero
  (verificato: 96 pagine impaginate, 111.514 px di documento).
- **Il dock rinnovato** (decisione 15j): rotta in monospazio, nome del sito a
  16,5 px, dati in una riga che **va a capo** (via ogni `text-overflow`: era
  quello a mangiare gli indirizzi lunghi), spina di 3px come unico segnale di
  stato al posto del led e del "cavo", fascia in basso per l'esito che durante
  il lavoro fa anche da avanzamento. 74 px a riposo, 119 px con un esito
  (prima ~150 sempre). `@container (max-width:620px)`: bottone a tutta
  larghezza, etichetta della provenienza nascosta.
- **La nuvoletta**, al terzo tentativo (`guarda()` in `ponte.js`, sezione
  `LA NUVOLETTA` nel CSS). Non due stati con un salto: **un cursore**, `--r` da
  0 a 1 mosso dallo scorrimento (170 px di corsa, smoothstep), con tutta la
  forma interpolata in CSS. La testata resta nel flusso e si accorcia col suo
  contenuto; un margine negativo (`--hpill` + stacco) chiude quel che avanza,
  cosi' a `--r:1` la banda vale zero e le pagine passano sotto la pillola.
  Misurato: 872x115 px → 388x38 px, banda 115 → 0.
  Le due passate buttate: banda che si accorciava senza far fluttuare niente
  (*"meglio fluttuante e moderna che questo obrobrio"*), e poi due stati con
  una soglia.
  **Tre trappole, tutte incontrate davvero**: (a) misurare la pillola da un
  ResizeObserver su `#banco` e' un giro senza fine, perche' misurare cambia
  l'altezza del banco - la misura si rifa' solo a contenuto o colonna cambiati,
  e con `setTimeout` perche' a scheda nascosta il rAF non gira; (b)
  `line-height:0` chiude il testo ma non l'icona e il bottone dentro la rotta,
  che tenevano la pillola alta il doppio - dentro `.pn-rotta` tutto e' in `em`;
  (c) le interpolazioni della fascia devono stare nella sua regola base, che
  nel foglio viene dopo e altrimenti le scavalca.
- **Il file nuovo non eredita piu' il sito vecchio.** Con `titleFromSite` acceso
  il campo del titolo porta il nome del sito collegato; il riconoscimento
  leggeva quel campo, quindi caricando un secondo Excel il sito precedente
  risultava al 100% insieme a quello giusto. Ora ponte.js guarda
  `window.SHEET_TITLE` - il titolo che il FILE porta con se' - e non il campo.
  Nello stesso giro `applyTitleSource` ha imparato a distinguere il testo
  scritto a mano da quello messo dall'applicazione (`AUTO_TITLE`) e ha un
  ripiego (`titoloDiRipiego`): staccando il sito il campo torna al titolo del
  file, invece di restare col nome di un sito che non c'entra piu'.
- **Titolo dal sito collegato** (decisione 15k): `#titleFromSite`,
  `titleSource()` a tre valori, `titoloSito()` in `ponte.js` (cliente +
  destinazione, una volta sola se l'una ripete l'altra),
  `aggiornaTitoloSito()` come varco. `nomeFile()` non premette piu' il cliente
  a un titolo che lo contiene gia'.
- **Il tracker non parla piu' di "il server" quando e' online**:
  `DOVE_VIVE`/`DOVE_VIVE_MAI`/`DA_DOVE_VIVE` in `app.js`, decise da
  `inNuvola()`. Nel pannello *Lavorare in piu' persone* l'indirizzo da dare ai
  colleghi diventa `location.origin`, la nota parla della casella
  @vrs-tech.it invece del firewall di Windows, e sparisce "un solo computer fa
  da server".
- **Vista Mese**: via le voci *impianti* e *da stampare* dal riepilogo. Restano
  *in scadenza*, *complete* (che e' anche il filtro) e *a schermo*, quest'ultima
  solo quando un filtro nasconde qualcosa.
- **I conflitti**: le spunte erano gia' a posto e **non possono confliggere**
  (un bit con due valori: o `gia-cosi` o `merge`, il 409 sui passi non scatta
  mai). Il buco era la **nota**: `UPDATE` secco, ultimo che scrive vince, in
  silenzio. Ora `api.nota` e `imposta_nota` seguono le quattro regole del merge
  con `base_rev`+`base_nota`; la base e' quello che l'operatore **aveva sotto
  gli occhi** (`notaVista`/`notaRev` nel popover), non quello che il modello sa
  adesso; il testo che si sta scrivendo non viene mai sovrascritto (la nota
  altrui si annuncia sopra la casella, `.js-eco-nota`); l'avviso del conflitto
  mostra le due frasi e offre *Unisci le due* / *Tieni la mia* (`ui.avviso`
  accetta una seconda azione).
- **Verificato** su una copia del `.db` servita da un server sulla 8775
  (l'archivio del committente non e' stato toccato): riconoscimento del sito,
  titolo dal sito, salvataggio del PDF (20 pagine, 3,3 MB in 1,8 s) con
  l'avanzamento nella fascia, scorrimento del banco con la testata ferma, chiaro
  e scuro, 1440 e 1100 px, colonna stretta (372 px), regole della stampa
  simulate. Conflitto nota: le quattro regole via curl (ok / conflitto 409 /
  merge / gia-cosi) e il giro completo in browser con due operatori.
- **Non pubblicato**: commit locale. Il deploy solo su richiesta esplicita.

### Rimasto in sospeso
- `cloud/02-funzioni.sql` e `04-sicurezza.sql` sono cambiati (`imposta_nota` ha
  due argomenti in piu' e c'e' un `drop function` della vecchia firma): **vanno
  rieseguiti su Supabase** prima che il conflitto sulla nota funzioni online.
  Come sempre, il lato Postgres non e' stato eseguito qui.
- Il service worker passa a `crono-guscio-v9`.

## Fatto il 2026-09-08 (17a sessione) - PDF veloce, nomi tolleranti, dock nuovo

Richieste: *"e' cosi' lento quando prepara il pdf [...] sono pdf grandi
abbastanza"*; *"segna nell'handoff che non devi mai fare il deploy a meno che
non sono io a chiederlo esplicitamente"* (fatto: in testa a AI-HANDOFF.md e in
memoria); *"siti doppi [...] per errori di battitura [...] rea klinic / rea
clinik [...] avendo un affinita' alta nella barra di ricerca lo farei spuntare
lo stesso [...] se carico un excel chiamato casa umberto primo e combacia alla
perfezione allora lo collega automaticamente [...] se ha affinita' piu' bassa o
piu' siti, una tabellina [...] se non combacia un alert"*; *"la barra con salva
nel tracker sempre visibile e staccata, rinnovala"*.

- **PDF 3x piu' veloce e 40% piu' leggero** (`schede/ponte.js`, `generaPdf`):
  html2canvas clona TUTTO il documento a ogni chiamata, quindi pagina per
  pagina costava ~1 s a pagina. Ora si catturano lotti di 8 pagine in una
  tela sola (spostate per un attimo in un contenitore proprio, poi rimesse) e
  si ritaglia. Scala 1,5 e JPEG 0,8. Misurato: 20 pagine da 4,4 s / 5,2 MB a
  1,5 s / 3,1 MB. Provato anche `foreignObjectRendering`: piu' lento e tele
  vuote, scartato.
- **`js/affinita.js`**: normalizzazione (accenti, k->c, y->i, ph->f, h via,
  doppie ridotte, "I"/"primo" -> 1, sigle e articoli tolti), somiglianza per
  parola con Damerau-Levenshtein (i bigrammi davano 0,67 a umberto/bertoli:
  troppo), pesi di rarita' delle parole (`pesiParole`: "casa", "riposo",
  "via" contano poco). `terminePassa` nella ricerca del tracker (`passa()` in
  stato.js): "umberto primo" trova UMBERTO I, "clinik" trova KLINIK.
- **Riconoscimento del sito dal file Excel** (`riconosci()` in ponte.js):
  nome del file + titolo del foglio contro cliente+destinazione di tutti i
  siti aperti dell'anno. Soglie: `NETTA` 0,88 e cliente con un solo sito e
  nessun rivale (altro cliente >= 0,72 e a meno di 0,12 dal primo) ->
  collegato da solo, tag "riconosciuto dal file"; altrimenti la lista dei
  probabili (max 6, con la barra dell'affinita'); sotto 0,5 -> avviso rosso
  "nessun sito somiglia", si sceglie a mano e resta il tag ambra "scelto a
  mano". Se il sito arriva dal tracker e il file non gli somiglia, avviso
  senza cambiare niente. `loadRows`/`unloadFile` sono globali del generatore
  riassegnate su `window` (vale anche per le chiamate interne); l'esempio
  della guida (`label`) non si riconosce.
- **Il dock** (HTML/CSS in `schede/index.html`, sezione `PONTE col tracker`):
  lastra staccata, `position:sticky` sopra le pagine, vetro sfumato, il
  "cavo" con il led di stato (grigio / cyan / pulsa / ambra / rosso), chip del
  sito con il tag dell'origine, esito su due righe, bottone primario "Salva nel
  tracker" con la barra di avanzamento nel bordo basso. `#main` e' un
  `container-type:inline-size`: sotto 1000 px di anteprima (i due pannelli
  laterali la stringono anche su schermi larghi) l'esito scende su una riga
  sua. Riduzione del movimento rispettata.
- **Azioni -> Possibili doppioni** (`mostraDoppioni` in app.js, `.dop-*` in
  base.css): siti dello stesso cliente con destinazioni >= 0,80 e clienti con
  ragioni sociali >= 0,86, con "Copia elenco". Access non si tocca: e' la
  lista per correggerlo la'. Sui dati veri: 5 coppie di siti, 4 di clienti.
- **Non pubblicato**: commit locale. Il deploy solo su richiesta esplicita.

## Fatto il 2026-09-08 (16a sessione) - il generatore di schede dentro il tracker, coi PDF

Richiesta: *"se metto online anche schede tecnici generatore collegato tramite
un pulsante da cronoservice [...] se genero un pdf e clicco su stampa [...] si
spunterebbe in automatico nel service tracker, e si salverebbe anche il
documento nel db supabase che apparirebbe nel tracker con un'icona del file in
miniatura accanto al nome di ogni sito"* - poi *"fai spuntare sia la stampa
come e' adesso sia si salva il pdf, collega tutto bene anche esteticamente"*.

- **Il generatore vive in `web/schede/`** (copia di
  `Desktop/Claude/exel pdf converter/Schede-Tecnici-Generatore.html`, che da ora
  e' la copia vecchia: si lavora qui). Stessa origine del tracker, quindi
  stessa sessione Supabase, stesso `nuvola-config.js`, stesso operatore.
  `server.py` serve `/schede/` come cartella con `index.html`; su Netlify e'
  automatico.
- **Barra "ponte" in testa all'anteprima** (`schede/ponte.js`, HTML e CSS
  dentro `schede/index.html` sotto `PONTE col tracker`): torna al tracker,
  cliente / destinazione / #id / anno / mese della spunta. Dal cassetto di un
  sito ("Genera dall'Excel") arriva gia' collegata; dal pulsante "Schede
  tecnici" della barra strumenti si sceglie il sito da un `datalist` con tutti
  gli aperti dell'anno (legge `/api/bootstrap` e usa `mappaturaSito` di
  `stato.js` per il mese). Il tema segue `cs.tema` del tracker se qui non se
  n'e' scelto uno.
- **Alla stampa succedono due cose**: la finestra di stampa del browser come
  prima, e poi (quando si chiude, con qualunque bottone) il PDF: ogni `.page`
  resa con html2canvas a scala 2 in JPEG 0.8, un foglio A4 per pagina con
  jsPDF (`schede/lib/`, niente CDN). ~250 KB/pagina. La prima pagina in
  piccolo (240 px, ~10 KB) e' la **miniatura** salvata nella riga. Il bottone
  "Salva nel tracker" fa solo la seconda parte.
- **Non si puo' sapere se l'operatore ha premuto "Stampa" o "Annulla"** nella
  finestra di Windows: il browser non lo dice. Il fatto certo che il tracker
  registra e' "il PDF esiste", ed e' quello che mette la spunta `stampata` sul
  mese della mappatura (quello passato nell'indirizzo, altrimenti
  `_mese_scadenza`), con `_applica` e origine `schede`. Se il PDF era
  sbagliato si elimina dal cassetto; la spunta resta, si toglie a mano.
- **Modello**: tabella `documenti` (SQLite `db.py` e Postgres
  `cloud/06-documenti.sql`, stessa forma), file in `data/documenti/<anno>/`
  in locale e nel bucket Storage privato `documenti` online (indirizzi firmati
  di un'ora). Rotte `/api/documenti`, `/api/documento` GET (il file) e POST
  (base64 in locale; online il client carica nello Storage e poi chiama
  `registra_documento`, che verifica che l'oggetto esista), `/api/documento_elimina`.
  Il bootstrap porta `documenti` dell'anno; `st.documenti` = Map sito ->
  [PDF dal piu' recente].
- **Nel tracker** (`js/documenti.js`): il chip `.doc-chip` accanto al nome del
  sito nella vista Anno e nella scheda del Mese (c'e' solo se il sito ha un
  PDF quest'anno, cyan tenue: "c'e' il documento", non "e' a posto"); clic =
  apre l'ultimo, passaggio del mouse = miniatura vera della prima pagina
  (`.doc-anteprima`, una sola per pagina). Nel cassetto la sezione "Schede
  tecnici <anno>" con l'elenco (miniatura, pagine, peso, mese della spunta,
  chi/quando, Apri, Elimina con conferma a doppio clic) e il bottone che apre
  il generatore puntato sul sito. Gli eventi: SSE/Realtime `documento`
  (tabella `documenti` con `replica identity full` per il DELETE) +
  `BroadcastChannel('crono-documenti')` fra le due schede del browser +
  ricarica al ritorno sulla scheda (`visibilitychange`).
- **Da fare sul progetto Supabase**, a mano dal committente: eseguire
  `cloud/06-documenti.sql`, poi rieseguire `03-letture.sql`
  (`cloud/LEGGIMI.md` §6). Finche' non e' fatto, online il generatore dice
  "Non salvato".
- Provato in locale su un server di prova (porta 8771, `.claude/launch.json`
  `crono-8771`): 20 pagine -> PDF in 4,4 s, 5,2 MB (con 0.86; ora 0.8), spunta
  e icona arrivate, eliminazione ok. Non provato: la stampa vera dal browser
  interno (apre la finestra di sistema), il giro Storage online (serve il 06).

## Fatto il 2026-09-08 (15a sessione) - un filtro solo per lo stato, e il pallino dice lo stato

Tre richieste in una volta: *"aggiungi la possibilita' di vedere la vista
annuale o mensile senza quelle gia complete o solo quele in ritardo o solo quele
complete (forse con un unico tasto di quello di prima magari rendendo clicabili
i numeri che ci sono tipo 17/267 complete)"* - *"il filtro tutti i tipi
toglili"* - *"il pallino all'inizio del sito mettilo in base allo stato della
mappatura, in ritardo, completa, ecc"*.

- **Un filtro di stato solo, a quattro posizioni** (`#f-stato` in `index.html`,
  #ANCHOR: filtro-stato in `stato.js`): Tutte / Da fare / In ritardo /
  Complete, segmented control come le viste. Sostituisce le due pillole "Solo
  incomplete" e "Solo in ritardo", che per tre risposte su quattro erano due
  interruttori, e la quarta - "solo le complete" - non c'era proprio.
  `st.filtri.stato` ('' | 'incomplete' | 'ritardo' | 'complete') prende il
  posto di `soloIncomplete`/`soloRitardo`; `caricaFiltri` converte i vecchi
  valori salvati in `localStorage`.
- **Ogni posizione porta il suo numero, e il numero e' il bottone**
  (`contaStato()`). I numeri contano l'insieme **senza** il filtro di stato,
  altrimenti al primo clic gli altri andrebbero a zero e non si tornerebbe piu'
  indietro. Per lo stesso motivo `riepilogoAnno()` ora gira su
  `gruppiFiltrati({ ignoraStato: true })`: la testa dice come sta l'anno, non
  come sta la selezione.
- **I numeri della testa sono cliccabili**: "19/267 complete" e "225 in
  ritardo" nella vista Anno, "6/11 complete" nel foglio del Mese. Un clic
  filtra, un secondo clic rimette tutto (`filtraStato(quale, alterna)`, che sta
  in `stato.js` perche' lo usano tre file). Nel Mese, quando il filtro nasconde
  delle schede, compare la voce "N a schermo".
- **Via il filtro per tipo di gas** (`#f-tipo`, `st.filtri.tipo`,
  `elencoTipi()`): tre valori che nessuno restringeva. Il tipo si cerca
  comunque dalla barra di ricerca, che lo tiene nel suo "fieno".
- **Il pallino davanti al sito dice lo STATO della mappatura**, non piu' il
  tipo di gas (`statoMappatura()`, `.punto-stato` in `griglia.css`): verde
  completa, ambra in ritardo, cyan iniziata, cerchio pieno di contorno da fare,
  cerchio appena accennato pre-tracciamento, puntino tenue non dovuta. Nessun
  colore nuovo. Si aggiorna in posto a ogni spunta (`rinfrescaRiga`), e la
  legenda e' nella finestra "Come si legge".
- `sw.js` -> `crono-guscio-v6`.

### Seconda passata (stessa sessione)

*"complete spunta a zero ma una completa c'e'"* - *"in mese invece del quadrato
che seleziona il sito metti il pallino dello stato come nella vista annuale"*.

- **La regola "i conteggi ignorano il filtro di stato" era applicata a meta'.**
  `mese.aggiornaConteggi()` (il ricalcolo della testa del Mese dopo ogni
  spunta) rifaceva i conti su `lavoroDelMese(st.mese)`, cioe' sulle sole schede
  a schermo: con "Da fare" acceso "complete" andava a **0** alla prima spunta,
  pur essendocene di complete. Ora usa `mesePieno()` come il primo disegno, e
  riscrive tutta la riga (cinque nodi) invece di quattro `textContent` a indice
  fisso, che lasciavano indietro la voce "a schermo". Stesso difetto nei
  **totali per mese dell'intestazione della vista Anno** (`htmlTotaleMese` e
  `aggiornaRigaTotali`): adesso girano su `gruppiFiltrati({ ignoraStato: true })`
  e restano fermi qualunque filtro sia acceso.
- **"a schermo" si conta dal DOM**: completando una scheda con "Da fare" acceso
  la scheda resta a schermo (le righe non spariscono sotto le mani), quindi il
  numero deve dire quello che si vede, non quello che il filtro lascerebbe
  passare al prossimo disegno.
- **Nel foglio del Mese il quadratino di selezione e' diventato il pallino
  dello stato** (`htmlSelez` in `mese.js`), lo stesso della vista Anno: dice se
  quel sito e' gia' a posto **per l'anno**, cosa che le quattro caselle non
  dicono (guardano solo questo mese). Si aggiorna anche quando la spunta arriva
  da un altro mese.

### Terza passata (stessa sessione)

*"fai che cliccando invece di selezionare, completa tutte e quattro le
spunte"*.

- **Il pallino e' il bottone della scheda**: un clic mette tutti e `PASSI` i
  passi di quel mese in un colpo (`completaScheda` in `mese.js`), che e' il
  lavoro normale del foglio - si scorre e si chiude. Se c'erano gia' tutti, li
  toglie: i passi sono interruttori e serve un modo per correggere un clic di
  troppo, ma quel verso cancella lavoro e quindi lo dice con un avviso. Passa
  dallo stesso `spunta()` dei bottoni dei passi, quindi coda offline, diario e
  conflitti non cambiano.
- **La selezione per le azioni multiple e' passata al ctrl+clic** (o cmd, o
  shift) sul pallino, scritto nel suggerimento; l'anello cyan resta il segno
  della selezione, il `<label>` col checkbox e' sparito. Chiudere una scheda si
  fa cinquanta volte al giorno, selezionarne un gruppo quasi mai: il clic
  semplice va all'azione frequente.
- **Tasto `0`** sulla scheda col fuoco: la stessa cosa da tastiera, accanto a
  `1`..`4` che spuntano un passo per volta. In "Come si legge" c'e' la riga
  nuova.
- **Le spunte lampeggiavano** (*"e' buggato, le spunte sembrano
  lampeggiare"*): quattro `/api/toggle` in fila, e la conferma di ognuno
  riportava la cella intera come il server la conosceva **in quel momento**,
  cancellando a schermo i passi non ancora confermati. Misurato con un
  `MutationObserver`: `1111 -> 1000 -> 1100 -> 1110 -> 1111`. Ora
  `cellaDalServer()` (in `stato.js`) tiene i campi ancora in `st.sospese`: il
  server vince, tranne su cio' che non ha ancora visto. Non riguarda solo il
  bottone nuovo - lo stesso lampeggio c'era cliccando in fretta i quattro passi
  nel popover della vista Anno, ed e' sparito anche li'.
- Nel farlo e' venuto fuori un difetto vecchio: quando la coda **butta via**
  un'operazione rifiutata dal server non avvisava nessuno, e la spunta restava
  in `st.sospese` per sempre (cella perennemente "in attesa"). Ora la coda
  emette `fallita` e `esitoFallita()` pulisce.

### Da verificare (15a sessione)

- Verificato in browser sui dati reali copiati (222 clienti / 274 siti), chiaro
  e scuro, viste Anno / Mese / Statistiche, con `inizio_tracciamento` a
  **2026-09** (31 dovute) e a **2026-01** (267 dovute, 225 in ritardo): i
  numeri del filtro sono sempre uguali alle righe che restano a schermo.
- **Le prove di spunta sono state fatte su una copia del `.db`** servita da un
  secondo server sulla 8773: l'archivio del committente non e' stato toccato.
- Da guardare col committente: nella vista Anno il filtro "Complete" mostra
  anche i siti chiusi in un anno pre-tracciamento (18 righe con
  `inizio_tracciamento` = 2026-09), mentre la testa scrive "7/31 complete", che
  conta solo le mappature **dovute**. Sono due domande diverse e i suggerimenti
  lo dicono, ma se dovesse dare fastidio la strada e' aggiungere una quinta
  posizione, non cambiare i conti della testa.

## Fatto il 2026-09-08 (14a sessione) - Anno e Mese piu' leggere, "completa" a tre livelli

- **Riga sito e carta cliente "a posto"** (`.riga-srv.a-posto`,
  `.blocco.completo`, `.scheda.finita`): spina verde, fondo tinto, spunta nel
  totale, etichetta "a posto" sempre nel markup e mostrata dal CSS. Stessa
  condizione del `.pieno`. "N aperti" e' diventata un'etichetta neutra.
- **Vista Anno**: clienti come carte (`--rientro`, `--r-carta`), sticky della
  colonna nome a `left: var(--rientro)`, punti da 3px per i mesi non previsti,
  filo `--p` sotto i totali per mese (ora dentro l'intestazione, la riga
  `.riga-totali` non esiste piu'), hover con velo cyan, spunta CSS nel
  `.col-tot.pieno`.
- **Seconda passata ("ancora pesante")**: righe sito senza linee (`--h-riga`
  32px), capsula vuota al 55% con contorno, carte senza bordo, `.pill` piatte,
  etichette "N aperti" solo testo, schede del mese con ombra e senza bordo.
- **Vista Mese**: pista dei mesi con indicatore che scivola (`--i`),
  `cambiaMese` non ridisegna la testa, capsula segmentata dei passi, separatore
  cliente con filo, `.lavoro.entra` al cambio mese.
- **Tema scuro**: token `--completa-testo` (verde profondo in chiaro, verde
  del marchio in scuro) per il testo "a posto" e il totale pieno.
- `stampa.css` azzera pista ed etichetta; `sw.js` -> `crono-guscio-v5`.
- Misurato: ridisegno Anno+Mese 29 ms; nessun nodo in piu' per cella.

## Fatto il 2026-09-08 (13a sessione) - "Da fare adesso" era piena di difetti

Tre richieste in una volta, guardando la dashboard appena consegnata:

1. *"in statistiche da fare adesso ha un riquadro troppo grande rispetto al
   contenuto che occupa meta', risolvi, ridimensionala"*;
2. *"la barra blu che circola a vuoto nella hero toglila sembra un pezzo di
   plastica"*, *"mappature per sito mettilo in fondo come ultimo riquadro,
   emettilo con possibilita' magari di espanderlo a schermo intero o quasi tipo
   pop up a parte"*;
3. *"se ho una mappatura fatta a gennaio, mi compare lo stesso da fare, invece
   non deve comparire perche' e' gia' stata completata per questo anno, e non
   solo, se completo 1/4 di settembre il nome sparisce, e' molto piena di bug
   questa sezione risolvila"*.

**Il difetto vero era nel modello** ([decisioni.md](decisioni.md) 15f,
[frontend.md](frontend.md#trappole-verificate-non-ripeterle) 13).
`calcolaMappatura` in [stato.js](../../web/js/stato.js) cercava il lavoro solo
nei mesi "utili" del contratto e saltava `prima-contratto` / `non-previsto`; il
cassetto invece le quattro caselle le mostra per ogni mese di manutenzione
scritto in Access. Su un contratto che parte ad agosto (NIPPON SANSO #618/#619,
mesi gennaio+maggio+settembre, `data_inizio` 2026-08-01) una mappatura **chiusa
a gennaio** non contava: il sito restava "da fare" a settembre. Ora il giro
guarda tutti e dodici i mesi per il lavoro segnato e usa il calendario solo
come ripiego. Riproducibile e riprodotto: gennaio 4/4 su #619, la riga restava
in lista con "0 di 4 passi"; dopo la correzione sparisce e le complete passano
da 14 a 15.

**Il nome che sparisce** era l'ordinamento: `scad, n, nome` spostava la riga in
fondo al suo gruppo appena prendeva una spunta (verificato: #274 passava dalla
posizione 1 alla 5). Ora l'ordine dentro un gruppo e' scadenza + nome. E per la
stessa ragione gli scorrevoli dentro le carte conservano la posizione al
ridisegno (`SCORREVOLI` in `stat.js`): prima l'agenda tornava in cima a ogni
spunta e la riga usciva dalla vista.

**La carta e' stata rifatta**: tre gruppi di urgenza nella stessa agenda
(arretrate, questo mese, il prossimo) con i contatori che fanno da filtro.
Prima la testa scriveva "229 in ritardo" sopra un elenco che le arretrate non
le conteneva: il numero piu' grande della carta non portava a nessuna riga.
Ora la lista e' piena e la carta e' grande quanto il suo contenuto
(`flex: 1 1 0` sull'agenda, [frontend.md](frontend.md#trappole-verificate-non-ripeterle) 16).

**Le altre due**: via `.pista-eroe` dalla carta d'apertura; **Mappature per
sito** e' l'ultima carta della pagina e ha il bottone **Espandi**, che la apre
in un foglio grande (`ui.modale` con l'opzione nuova `classe`, `.foglio.largo`).

- Verificato in browser sui dati reali (222 clienti / 274 siti / 267 dovute),
  chiaro e scuro, a 1440 e 900 px: i tre gruppi e i loro filtri, la riga che
  non salta piu' quando si spunta, lo scorrimento dell'agenda che resta dov'e',
  il foglio grande che si apre e si chiude scegliendo un cliente, l'ordine
  nuovo delle carte.
- **Le prove di spunta sono state fatte su una COPIA del `.db`** servita da un
  secondo server sulla 8772: l'archivio del committente non e' stato toccato.
- Solo `web/` (stato.js, stat.js, ui.js, stat.css, base.css): basta ricaricare
  la pagina, il server non va riavviato.

### Da verificare (13a sessione)

- **Il gemello Python.** `api._scad_effettiva` e i conteggi lato server non
  hanno l'equivalente della correzione: se qualcuno chiude una mappatura in un
  mese fuori finestra contrattuale, la colonna `Ruolo` del CSV e i conteggi di
  `GET /api/incongruenze` possono raccontarla diversamente dall'interfaccia.
  Non e' stato toccato perche' nessun endpoint espone "completa"; da guardare se
  nasce un report lato server.
- **Il giro online**: `cloud/03-letture.sql` ha la stessa logica in PL/pgSQL.
  Se e quando si tocca, allineare anche quella.

## Fatto il 2026-09-08 (12a sessione) - la dashboard delle Statistiche

Richiesta: *"rinnova la sezione delle statistiche, fai una bella dashboard
esteticamente impeccabile, visivamente d'impatto, super moderna, futuristica ed
elegante. non aggiungere statistiche inutili, quelle che ci sono vanno bene +
qualcosa di veramente utile al massimo ma proponi prima"*.

- Proposte tre statistiche, scelte due: **Ritmo per chiudere l'anno** e **Da
  fare adesso**. Scartata "Contratti da rinnovare" (non riproporla senza
  richiesta).
- Vista rifatta come pannello di comando: quadrante dell'anno, griglia a dodici
  colonne, carte di vetro, cifre che salgono, entrata carta per carta allo
  scorrimento. Al secondo giro (*"i grafici sotto non mi pare che tu li abbia
  rimodernizzati"*) anche le carte in basso: capsula a segmenti e pillole di
  stato nell'elenco per sito, righe di riferimento e linea del mese corrente
  nelle colonne, area a gradiente e onda nell'andamento, quattro anelli per i
  passi, barre con rango e parte chiusa per le province, legenda a tessere per
  l'arretrato. Ordine nuovo: lista di lavoro + ritmo/passi, quadranti, tempo
  (mesi + andamento), siti, dettaglio. Dettaglio in
  [frontend.md](frontend.md#la-vista-statistiche) e
  [decisioni.md](decisioni.md) 15e.
- Solo `web/` (stat.js, stat.css, tre token in theme.css). Nessun endpoint,
  nessuna tabella, nulla lato cloud.

### Da verificare (12a sessione)

- Il **ritmo** con spunte vere: qui l'archivio ha 0 chiusure, quindi "finora"
  e' 0 e la proiezione coincide con le complete. Da guardare quando ci saranno
  chiusure: il misuratore e la tacca dell'obiettivo si spostano da soli.
- **Da fare adesso a dicembre**: il "prossimo mese" sarebbe gennaio dell'anno
  dopo, che il modello dell'anno corrente non ha; la carta mostra solo dicembre
  e lo dice nel contatore. Se serve lo sguardo oltre l'anno va preso da
  `mappaturaSito` sull'anno successivo.
- ~~Il committente ha ricordato che *"basta fare una mappatura che per quel
  sito si e' a posto per tutto l'anno"*: la lista "Da fare adesso" filtra su
  `mappaturaSito(s).completa`, quindi la regola e' rispettata per
  costruzione.~~ **Falso, ed e' esattamente il difetto trovato alla 13a
  sessione**: `completa` era vero solo se i quattro passi stavano in un mese
  che il calendario del contratto considerava utile. Chiusa a gennaio su un
  contratto che parte ad agosto, la mappatura non risultava chiusa. Lezione: la
  frase "rispettata per costruzione" va provata a schermo, non dedotta dal
  nome di un campo.

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
