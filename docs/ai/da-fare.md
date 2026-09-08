# Da fare / in sospeso

Aggiornare questo file a ogni sessione: e' il primo posto dove guardare per
riprendere il filo.

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
