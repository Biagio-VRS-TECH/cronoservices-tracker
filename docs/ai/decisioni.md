# Registro delle decisioni

Perche' le cose sono come sono. Cambiare una di queste voci significa cambiare
una scelta, non correggere un errore: leggere prima il motivo.

## 1. Access non viene mai scritto
Le spunte stanno in un SQLite separato. `CronoServices_be.accdb` e' la loro
gestione in produzione da anni, con un frontend Access e 58 query: scriverci
dentro da un'altra applicazione e' il modo piu' rapido per rompere qualcosa che
funziona. Access resta la fonte di verita' per clienti, service, stato e mesi;
noi la leggiamo e ne teniamo una cache.
Conseguenza: se cambia un mese in Access, la spunta gia' messa su quel mese
diventa *orfana* — si conserva (e' lavoro fatto) e si segnala nei Controlli.

## 2. Python invece di Node
Sulla macchina c'e' Python 3.13 e **non** c'e' Node. Nessuna dipendenza esterna:
`http.server` + `sqlite3` + `subprocess`. Zero `pip install` significa che l'app
parte su qualsiasi PC dell'azienda con Python, anche senza rete.
Costo accettato: un thread per connessione SSE (bene fino a ~decine di utenti).

## 3. Access letto via PowerShell, non pyodbc
L'unico driver presente e' `Microsoft.ACE.OLEDB.12.0`, raggiungibile da COM.
Usarlo da Python richiederebbe `pywin32` o `pyodbc` (installazione, e in piu' la
trappola 32/64 bit). `subprocess` -> `export_access.ps1` -> JSON e' brutto ma non
ha prerequisiti e si testa da riga di comando.

## 4. Nessun passo di build, nessuna CDN
Moduli ES nativi e font di sistema. Un `npm run build` in un'azienda che non ha
Node installato e' un ostacolo permanente; un font o una libreria da CDN rompe
l'app appena manca Internet — che e' esattamente lo scenario dichiarato.

## 5. Le spunte compaiono su tutti i service aperti
Deciso dal committente. `tServices.Mappatura = Si` copre solo 68 aperti su 274 e
non limita il lavoro. **Aggiornamento 2026-09-07:** il campo non si mostra piu'
da nessuna parte (bollo, filtro, cassetto, CSV). Quel Si/No diceva "questa
mappatura era stata controllata in passato", non "questo service ha una
mappatura": sono tutte mappature, quindi come filtro divideva su un criterio che
non esiste piu'.

## 5b. I passi sono una lista, non tre colonne cablate
Il quarto passo ("controllo ricambi e scadenze", chiesto il 2026-09-07) e' stato
aggiunto cambiando **una lista** (`CAMPI` in `stato.js` + `db.CAMPI`) e una
colonna SQLite: tutto il resto conta `PASSI = CAMPI.length` e cicla su `CAMPI`
(segmenti della cella, tasti, legenda dell'aiuto, barra delle azioni multiple,
CSV, popover, cassetto). Prima erano tre punti cablati in sette file. Se ne
arriva un quinto, i posti da toccare sono: `CAMPI`, `db.CAMPI`, `db.AGGIUNTE`,
`SIGLA`, `ETICHETTA`, `BREVE`, `_cella_out`, la colonna CSV, un token
`--st-<campo>` e la regola `.cella[data-<sigla>="1"]`.

## 6. Identita' = solo il nome, senza password
Deciso dal committente: rete interna, due operatori. Il nome sta in
`localStorage`, firma ogni spunta ed e' cio' che rende leggibile il log. Se
l'app va su Internet questa scelta va rivista (era stata considerata l'opzione
nome + PIN).

## 7. Merge per campo invece di lock
Vedi [concorrenza.md](concorrenza.md). Un lock su cella avrebbe richiesto
heartbeat, scadenza, sblocco forzato e avrebbe bloccato l'operatore B per una
spunta che non gli interessava. Con unita' di scrittura da un bit, il conflitto
vero e' cosi' raro che vale la pena chiedere solo in quel caso.

**Il merge per campo vale anche fra me e me** (15a sessione). Le risposte del
server portano la cella intera, ma quando ne ho quattro in volo sulla stessa
cella quella risposta e' gia' vecchia per i campi non ancora inviati:
`cellaDalServer()` tiene i campi in `st.sospese` invece di sovrascriverli.
Senza, chiudere una scheda in un colpo faceva lampeggiare le spunte
(1111 -> 1000 -> 1100 -> 1110 -> 1111). La regola: **quello che il server dice
vince, tranne su cio' che il server non ha ancora visto.**

**Sui quattro passi il conflitto non puo' esistere; sulla nota si'**
(18a sessione). Il campo e' un bit e si mandano solo cambiamenti, quindi
`valore` e' sempre l'opposto di `base_valore`: o il server ha gia' il valore
richiesto (`gia-cosi`), o ha ancora quello che il client credeva (`merge`). Il
409 sui passi e' codice che non scatta mai, e va benissimo cosi'. **La nota
invece e' testo libero**, e fino alla 18a sessione era un UPDATE secco: due
persone che scrivevano nello stesso minuto si cancellavano a vicenda in
silenzio. Ora anche `/api/nota` porta `base_rev` + `base_nota` e puo' rispondere
409, con una regola in piu': la base e' **quello che l'operatore aveva sotto gli
occhi** (`notaVista`/`notaRev` del popover), non quello che il modello sa
adesso — il flusso aggiorna `st.celle` mentre si scrive, e prendendo la base da
li' il conflitto si sarebbe "risolto" da solo sovrascrivendo. Dettaglio in
[concorrenza.md](concorrenza.md).

## 8. Coda in `localStorage`, non IndexedDB
La coda contiene decine di oggetti minuscoli. IndexedDB sarebbe piu' corretto in
astratto e molto piu' codice da mantenere. Se un giorno la coda dovesse contenere
migliaia di operazioni o allegati, si cambia.

## 9. `bootstrap` in un colpo solo
545 service + 319 clienti + celle dell'anno sono pochi kB: mandare tutto al primo
caricamento rende i filtri e la ricerca istantanei (tutti in memoria) e regala il
funzionamento offline (la stessa risposta e' la cache). Con 10x i dati servirebbe
paginare.

## 10. L'anno si CALCOLA, non si copia da Access
La prima versione mostrava le 12 colonne di `tServices` identiche per ogni anno.
Era fedele al dato ma inutile: gli anni erano indistinguibili e tutto il passato
risultava in ritardo. Ora ogni cella riceve una classe temporale incrociando
finestra contrattuale, rinnovo automatico e inizio del tracciamento. Il futuro e'
dichiaratamente una **stima**, il passato non tracciato non e' un arretrato.
Dettagli e numeri di controllo: [anno-e-tempo.md](anno-e-tempo.md).

## 10b. Anno come dimensione di prima classe
`mappature` ha `anno` nella chiave. Le spunte del 2025 restano leggibili quando si
passa al 2027, e il selettore d'anno in testa cambia `bootstrap`. Non e'
"lo storico": e' il modo naturale di un lavoro che si ripete ogni anno.

## 10c. Una mappatura per anno, non una per mese di manutenzione

Detto dal committente alla 4a sessione: *"non e' che ogni visita fai una
mappatura; una volta fatta la mappatura completa e ricambi per quel cliente siamo
a posto per tutto l'anno. Quando un contratto ha piu mesi la scadenza e' al primo
mese"*. Prima ogni mese di manutenzione era una mappatura da chiudere: un
contratto trimestrale chiedeva quattro mappature (16 spunte) invece di una, e i
totali erano gonfiati di conseguenza (219 "previste" nel 2026 contro 194 service).

Scelte fatte, e perche':

- l'unita' e' la coppia (service, anno), non la cella: `mappaturaAnno()`. La
  scadenza e' il **primo** mese utile, gli altri diventano classe `visita`;
- le visite restano **visibili e spuntabili**: il tecnico ci va, e la mappatura
  puo' essere chiusa la'. Nasconderle avrebbe fatto sparire dal foglio del mese
  service che quel mese si visitano davvero;
- una mappatura completa in **qualunque** mese chiude l'anno (`chiusaAltrove`):
  altrimenti chi la fa alla visita di novembre resterebbe "in ritardo" da marzo;
- alla 6a sessione si e' passati al CLIENTE (10g) e alla **7a si e' tornati
  qui**: l'unita' e' il sito. Vedi 10h - questa voce, tranne l'ultimo punto, e'
  di nuovo quella in vigore.

## 10g. ~~L'unita' di conto e' il CLIENTE~~ — SUPERATA dalla 10h

**Non e' piu' in vigore**: alla 7a sessione il committente ha corretto in
"una mappatura per ogni sito". Resta qui perche' spiega che cosa era stato
costruito e perche' i numeri del 2026 sono passati da 217 a 266.

Detto dal committente alla 6a sessione, guardando le Statistiche: *"di mappature
devi averne solo una per ogni cliente, non fai una mappatura ogni visita. Dopo
aver fatto una mappatura sei a posto per quell'anno quindi la casella risulta
completa, quindi anche nelle statistiche, non devono spuntare tutte quelle
mappature"*. Alla 4a sessione, con la stessa frase ("per quel cliente"), si era
scelto il service (10c, ultimo punto): sbagliato: un cliente con sei impianti
vedeva sei mappature dovute e sei righe nelle Statistiche.

Quindi l'unita' e' la coppia **(cliente, anno)**:

- `scadenzaCliente(cid)` = `{scad, srv}`: il **primo** mese di manutenzione
  dentro contratto fra **tutti** i service aperti del cliente, e l'id del service
  che quel mese lo ha (a pari mese il primo in elenco, per destinazione: la
  scelta deve essere stabile fra un disegno e l'altro, altrimenti la capsula
  piena salta di riga);
- in tutto l'anno **una sola cella per cliente** e' `previsto`. Tutte le altre
  manutenzioni - altri mesi, altri impianti dello stesso cliente - sono `visita`:
  visibili, spuntabili, fuori dai totali. Chiuderne una qualsiasi mette a posto
  l'anno del cliente e toglie il ritardo alla cella di scadenza, che puo' stare
  su un ALTRO service (per questo `aggiornaTotali` in `anno.js` ridipinge anche
  la riga di `ma.srv`, non solo quella toccata);
- `mappaturaCliente(cid)` sostituisce `mappaturaAnno(s)` e guarda **tutti** i
  service aperti del cliente **filtri esclusi**. Deliberato: i filtri scelgono
  quali clienti si vedono, non che cos'e' la mappatura di un cliente. Se la
  guardassero, filtrando per provincia le celle cambierebbero classe sotto gli
  occhi e la memoizzazione andrebbe invalidata a ogni tasto.

Cosa cambia nei numeri (2026, `inizio_tracciamento` portato a `2026-01` dal
committente): mappature dovute **da 266 service a 217 clienti**, in ritardo 190,
visite 357. La riga "Mappature in scadenza" della griglia, le colonne di "A che
punto siamo" e il pannello Controlli danno gli stessi numeri: e' il controllo
incrociato immediato.

Restano contati per service, di proposito: `aperti` (274, sono impianti) e le
schede della vista Mese (il tecnico va a visitare impianti, non clienti). Per
questo il riepilogo del mese tiene le due unita' separate e scritte: *"8 in
scadenza · 55 impianti"*. Chiamare "mappature" le 55 schede era la stessa
confusione da un'altra parte.

## 10h. L'unita' di conto e' il SITO (l'impianto), non il cliente

Detto dal committente alla 7a sessione, indicando un cliente preciso: *"aziende
ULSS 1 Dolomiti, prendila come esempio per tutti gli altri: come vedi ha 9 siti
aperti, va fatta una mappatura per ogni sito, non una in generale"*.

E' la terza lettura della stessa frase del brief ("una volta fatta la mappatura
per quel **cliente** siamo a posto per l'anno"), e va risolta cosi': quel
"cliente" voleva dire "questo impianto di questo cliente". Un cliente come
un'azienda sanitaria ha nove ospedali in nove comuni: sono nove impianti da
mappare, non uno.

Quindi l'unita' e' la coppia **(sito, anno)**, dove il sito e' un record di
`tServices` con `Stato = APERTO` (la sua anagrafica e' `Destinazione` +
`Localita`):

- `mappaturaSito(s)` sostituisce `mappaturaCliente(cid)`; `scadenzaCliente` e
  `lavoroServizio` non esistono piu'. La scadenza e' `meseScadenza(s)`, che c'era
  gia' ed era il "mattone": adesso e' di nuovo l'unita';
- in tutto l'anno **una sola cella per sito** e' `previsto`, e sta sulla sua
  stessa riga: `aggiornaTotali` in `anno.js` non deve piu' ridipingere la riga di
  un altro service, ed e' sparito il caso "chiusa altrove, su un altro
  impianto";
- la riga del CLIENTE nella griglia **somma** i suoi siti: nove impianti = 9 x
  `PASSI` nella colonna Anno; nei dodici mesi della sua riga non c'e' piu'
  niente (28a sessione: via la barretta in percentuale e, poche ore dopo,
  anche la capsula a quattro segmenti che l'aveva sostituita);
- la vista Mese tiene le due unita' separate come prima ("10 in scadenza · 55
  impianti"), ma ora "in scadenza" conta i siti la cui mappatura scade in quel
  mese: le schede sono di piu' perche' comprendono le visite;
- le Statistiche hanno **una riga per sito** ("cliente — destinazione"), non per
  cliente; cliccarla restringe il grafico dei mesi a quel cliente (tutti i suoi
  impianti), che e' la lettura che serve quando si guarda un'azienda con nove
  ospedali.

Cosa cambia nei numeri (2026, `inizio_tracciamento = 2026-01`): mappature dovute
**da 217 clienti a 266 siti**, in ritardo 235, siti aperti 274 (che ora e' anche
il denominatore naturale: 266 dovute + 8 senza mesi utili nell'anno).

**Conseguenza sulla performance.** Con l'unita' per cliente ogni cella
interrogava tutti i service del cliente e ogni clic rifaceva il riepilogo
intero: il committente ha segnalato *"troppa latenza"*. Adesso la mappatura di un
sito dipende solo dalle celle di quel sito, quindi si memoizza (`memoMap`,
invalidata da `tocca(id)` a ogni scrittura) e il riepilogo in testa si ricalcola
una volta per frame (`aggiornaTestaPresto` in `app.js`). Misurato in browser sui
dati reali: **1 ms** per spunta, ~18 ms per un disegno completo della griglia
(591 celle, 274 righe).

## 10e. La scadenza della mappatura NON slitta al tracciamento

Detto dal committente alla 5a sessione, guardando settembre 2026 a 51: *"non devi
considerare ogni volta che fai la visita ma la singola mappatura, quindi non
viene 51"*. `meseScadenza` cercava il primo mese con classe `previsto`, e
`previsto` esclude i mesi prima di `inizio_tracciamento`: un contratto
marzo+settembre finiva con la scadenza a **settembre**, cioe' su una visita.

Ora la scadenza e' il primo mese di manutenzione **dentro il contratto**, punto;
se cade prima dell'avvio del tracciamento la mappatura di quell'anno e'
pre-tracciamento (`preTrac`): resta visibile e spuntabile per il recupero
storico, ma non entra nei totali e non e' mai in ritardo. Conseguenza voluta: il
2026 ha **30** mappature dovute (10/8/4/8 fra settembre e dicembre) e 236
pre-tracciamento, non 194. Chi vuole i conti su tutto l'anno sposta
`inizio_tracciamento` a `2026-01` (Azioni > Impostazioni): la leva e' quella, non
la scadenza.

Nota: `progresso()` (la colonna "Anno" della griglia e il cassetto) conta anche
una mappatura pre-tracciamento **se ha almeno una spunta**. Serve a mostrare, non
a totalizzare: chi ha appena fatto quattro spunte in recupero storico vedeva un
trattino.

## 10f. Il verde vuol dire "mappatura completa", e nient'altro

Il terzo passo si chiama "mappatura completa rapportino" e usava
`var(--accento)`, lo stesso verde con cui tutta l'app dice *completa*. Nei
grafici delle Statistiche il committente lo ha letto come "completamento della
terza spunta" invece del completamento intero: *"e' un completamento unico quello
rappresentato quindi va con una spunta unica"*. Scelta: il verde resta al
completamento (`--completa`, una spunta sola, tutti e quattro i passi) e il terzo
passo prende una tinta propria, magenta `#A0307E` (`#CC5FA8` in tema scuro).
Tavolozza dei quattro passi rivalidata con `valida-tavolozza.py` in chiaro e
scuro. "A che punto siamo" usa la rampa sequenziale `--pr-0..--pr-4` dello stesso
verde: un tono solo a cinque chiari, non cinque colori nuovi.

## 10d. Nessuna vista "Fogli", e nessun bollo in piu' sulle schede

Il committente ha spiegato lo scopo del sito parlando dei fogli che tornano dal
tecnico ("se ne do 50 e me ne tornano 47 devo vedere cosa e' successo agli altri
tre"). E' stata costruita una vista dedicata — consegnati / tornati / fuori,
elenco con i giorni, endpoint `/api/fogli`, filtro, carta nelle Statistiche,
bolli `FOGLIO FUORI` / `VISITA` / `ANNO GIÀ FATTO` — e lui l'ha fatta rimuovere
subito: **era un esempio per far capire il senso, non una richiesta**, e le
etichette in piu' sulle schede non le vuole.

Cosa resta valido di quel lavoro, e cosa non ripetere:

- l'informazione c'e' gia' nei dati (`stampata` senza `controllata` = foglio
  fuori) e nel log `eventi` c'e' anche il "da quando": se un giorno la chiedono,
  si rifa' in poche ore. Non serve nessuna colonna nuova;
- la distinzione mappatura/visita si comunica **con la forma, non con una
  targhetta**: capsula piena contro capsula col solo contorno, piu' il tooltip.
  Era gia' la regola della griglia (vedi *Idea visiva* in
  [frontend.md](frontend.md)) e vale anche per la vista Mese;
- morale operativa: quando il committente descrive *perche'* usa il programma,
  non e' automaticamente una specifica. Chiedere prima di costruire una vista
  nuova; una colonna o un tooltip in piu' si tolgono in un minuto, una vista no.

## 10e. Ambra e rosso non sono sinonimi

`da-rinnovare` e "in ritardo" condividevano `--allerta`: a schermo un contratto
scaduto e una mappatura arretrata erano la stessa macchia. Il committente: *"a me
non interessa sapere che il contratto e' in scadenza, ed e' diverso dalla
mappatura in ritardo, quindi fallo di un altro colore tipo rosso"*. Ora ambra =
lavoro nostro in ritardo, rosso (`--scadenza`) = scadenza contrattuale. Il rosso
in tema scuro sta appena sopra la banda di chiarezza della skill `dataviz`, come
ci stava l'ambra che sostituisce: dentro banda diventa marrone e non si legge
piu' come "scadenza".

## 10i. Il rinnovo automatico non e' una scadenza (9a sessione)

Il committente: *"LASERJET SPA che il contratto si rinnova da solo, nelle
statistiche la mappatura la da come non dovuta ma in realta' e' dovuta"*.

`data_scadenza` era letta come la fine del contratto per tutti. Su un service
ancora aperto con `RinnovoAutomatico` non lo e': quel giorno **comincia il
termine successivo**, e per fermarlo serve una disdetta (90 giorni prima, nella
causale). La data in Access e' la fine del *primo* termine, non del contratto.

Conseguenza del vecchio comportamento: tutti i mesi dopo quella data diventavano
`stima`, che e' fuori dai totali; e per LASERJET (#542, annuale, unica
manutenzione a settembre, scadenza 2026-08-31) **tutti** i suoi mesi cadevano
la', quindi l'anno non aveva nessuna cella `previsto` e la mappatura risultava
"non dovuta" - una mappatura in scadenza questo mese, sparita dai conti.

La regola ora e' `scadEffettiva(s)`: la `data_scadenza` viene **rimandata avanti
di un termine alla volta finche' non copre oggi** (durata del termine =
`data_inizio -> data_scadenza`), solo per i service **aperti** con rinnovo
automatico. Tre scelte dentro questa:

- **rimandare avanti, non togliere la scadenza.** Un contratto a rinnovo
  automatico "senza scadenza" avrebbe fatto sparire anche la `stima` dagli anni
  futuri, che e' informazione utile (nel 2027: 174 stime, 204 da rinnovare). Cosi'
  il termine **in corso** e' un fatto (`previsto`), quello **successivo** resta
  una proiezione (`stima`);
- **solo sui service aperti.** Su un service `CHIUSO` il contratto non si rinnova
  e la causale in Access e' solo storia: LASERJET ha sei siti chiusi con la stessa
  causale, e devono restare fuori;
- **`da-rinnovare` non si tocca.** Senza rinnovo automatico la scadenza e' una
  scadenza vera: prima di pianificare serve il rinnovo (vedi 10e). Restano 6 siti
  aperti in quello stato nel 2026, e sono un'informazione commerciale, non un
  difetto di conteggio.

Effetto sui dati reali: 2026 da **266 a 267** mappature; 2025 e 2027 identici.

Corollario, ed e' la parte che vale piu' della correzione: nelle Statistiche
"non dovuta" era una **parola muta**, e ha nascosto il difetto per otto sessioni.
Ora `mappaturaSito().motivo` porta la classe del primo mese utile e la carta
scrive *da rinnovare* / *oltre il contratto* / *non ancora attivo*. Se domani
un'altra regola temporale sbaglia, l'elenco dice quale contratto guardare invece
di dire soltanto "no".

## 11. Il ritardo si calcola, non si memorizza
"In ritardo" = mese gia' passato con meno di `PASSI` spunte. Nessuna colonna, nessun
job: si deriva da `oggi` a ogni disegno. Cosi' non esiste il caso di uno stato
memorizzato che va fuori sincrono.

## 12. Vista Mese oltre alla vista Anno
Non richiesta esplicitamente ma e' dove si lavora davvero: "a settembre devo fare
queste 55 mappature". La vista Anno serve a *vedere*, la vista Mese a *fare*, ed
e' quella che si stampa.

## 13. Aggiunte fatte senza chiedere, perche' a costo quasi zero e utilita' certa
Controlli qualita' (riprende `qVerificaIncongruenze` dei loro dati e ha subito
trovato 9 service incoerenti), diario attivita', ricerca, filtri, export CSV con
`;` e BOM per Excel italiano, stampa come checklist cartacea, azioni multiple,
note per cella, storia per cella, backup automatico a ogni sync, tema scuro,
scorciatoie da tastiera, presenze in tempo reale.

## 14. Contro i due archivi paralleli: rilevare, non sperare
Con piu' computer il guasto piu' probabile e' che ognuno avvii il server sul
proprio PC. Documentarlo non basta: nessuno legge il README mentre lavora. Quindi
il doppio avvio sullo stesso PC e' bloccato, e due server su PC diversi si
scoprono a vicenda via UDP broadcast e mostrano una fascia rossa a tutti.
Costa 100 righe e previene l'unico danno irreparabile del progetto.
Vedi [concorrenza.md](concorrenza.md).

## 15. Azioni di massa con conferma numerica e Annulla, non con dialoghi di paura
"Completa tutte le spunte" puo' scrivere migliaia di righe. Invece di un
"Sei sicuro?" generico, la conferma dice quante spunte, su quante mappature, di
quanti service, e su quale perimetro (anno + filtri attivi, elencati). Dopo
l'azione l'avviso resta 15 secondi con **Annulla**, che rimanda le operazioni
inverse per lo stesso percorso tracciato e idempotente. La reversibilita' vale
piu' di qualsiasi avvertimento.

## 15b. Nella vista Controlli solo il nostro lavoro, non le incongruenze Access
Alla 7a sessione il committente ha fatto togliere i tre pannelli sul dato Access
("Service aperti senza mesi", "Mesi diversi dalla cadenza", "Spunte su mesi non
piu' previsti") e il filtro "Mostra stime" dalla barra. Motivo: quelle sono
incongruenze di CronoServices, si correggono in Access, e in una schermata che
si guarda ogni giorno erano rumore; il filtro delle stime era acceso per default
e nessuno lo spegneva mai. Al loro posto due **torte** dell'avanzamento (a che
punto sono i passi, come stanno le scadenze), chieste esplicitamente: *"fai
qualche grafico a torta utile per tracciare i progressi, no cose inutili"*.
`GET /api/incongruenze` resta nel server ma non lo chiama nessuno: se un giorno
lo rivogliono, il pannello e' quindici righe.

## 15c. Niente vista Controlli: i grafici stanno nelle Statistiche, il diario nelle Azioni
Alla 8a sessione il committente l'ha fatta sparire: *"i grafici in controlli
spostali nelle statistiche, i controlli rimuovili, ma il diario attivita' serve,
lo metti in azioni"*. Aveva ragione sulla struttura: dopo la 7a sessione dentro
Controlli restavano solo due torte (che parlano degli stessi numeri delle
Statistiche, calcolati due volte con due giri sui siti) e due elenchi. Una vista
in barra e' un impegno permanente sull'attenzione di chi lavora, e quella non
guadagnava il posto.

Dove sono finite le sue tre parti:

- le **due torte** sono carte della vista Statistiche, in una fascia di tre
  quadranti (la terza, "Clienti a posto", e' nuova). Un solo `raccogli()`
  produce ora anche i loro numeri, quindi non possono piu' divergere da quelli
  della testa;
- **"Mappature in ritardo"** non e' stata ricostruita: la carta "Mappature per
  sito" e' gia' quell'elenco, ordinato per urgenza (in ritardo in testa, con
  `#id`, cliente, destinazione, passi e la parola "in ritardo") e con dentro
  tutti i siti, non solo i primi 200. Ricopiarla sarebbe stato un secondo posto
  da tenere allineato;
- il **diario** e' una voce del menu Azioni che apre una modale con le ultime
  120 modifiche (`GET /api/attivita?limit=120`). E' una cosa che si guarda
  quando serve, non un pannello da avere sempre a schermo.

Spariti con la vista: il tasto `C`, `web/js/controlli.js`, il blocco CONTROLLI di
`griglia.css` (le classi `.pannello`/`.elenco` non le usava nessun altro) e
`js/controlli.js` dall'elenco del service worker. `GET /api/incongruenze` resta
nel server, come dalla 15b, e adesso non lo chiama davvero piu' nessuno.

## 15d. Un solo segnale, a tre misure, invece di tre effetti
La richiesta della 8a sessione era *"rinnovare l'interfaccia grafica per renderla
piu' accattivante dinamica futuristica preservandone la semplicita' e
l'eleganza"*. Il rischio di una richiesta cosi' e' la somma di effetti: ombre
piu' grosse, gradienti dappertutto, animazioni a ogni clic. La regola tenuta e'
l'opposta: **un segnale solo, che torna a tre misure diverse**.

Il segnale e' la linea cyan-che-diventa-verde (`--filo`, cyan del marchio ->
verde di `--completa`, cioe' "iniziato -> finito"):

1. la **linea di stato** saldata sotto la barra strumenti (`.filo` in
   `index.html`, 2px): l'avanzamento delle mappature dell'anno filtrato, visibile
   in tutte e tre le viste, con un riflesso che passa ogni 7 secondi. E' l'unico
   movimento permanente dell'applicazione;
2. la **pista dell'eroe** nelle Statistiche, la stessa cosa alla scala della
   carta. Il gradiente e' ancorato alla pista intera, non alla parte piena
   (`--pn` in `stat.js`, `background-size` in `stat.css`): la tinta raggiunta e'
   un dato, non un ornamento;
3. l'**alone della casella completa** nella griglia, che c'era gia'.

Tutto il resto e' rilievo, non colore: il velo di cyan al 7% in alto a sinistra
del fondo (`--velo`), la testa di vetro con un gradiente al posto del fondo
piatto, il filo di luce sul bordo alto della carta che si accende al passaggio,
il trattino sotto la vista attiva, e l'entrata a scalare delle carte con le
ciambelle che ruotano sul proprio centro. Nessun token di colore nuovo per
questo: sono tutti `color-mix` di token che esistevano (l'unica tavolozza
aggiunta e' `--ar-*`, ed e' un dato - vedi frontend.md). Tutte le animazioni
passano da `.vivo`, che al ridisegno dopo una spunta c'e' gia': la pagina non
lampeggia a ogni clic, e `prefers-reduced-motion` le spegne.

## 15e. Le Statistiche come pannello di comando, col quadrante dell'anno (12a sessione)
La richiesta: *"una bella dashboard esteticamente impeccabile, visivamente
d'impatto, super moderna, futuristica ed elegante"*, senza statistiche inutili.
La regola di 15d resta (un segnale, niente somma di effetti); quello che cambia
e' la **forma**: la pagina e' una griglia a dodici colonne di carte di vetro,
e apre con una firma sola, il **quadrante dell'anno** - i dodici mesi a
raggiera, come il ciclo di manutenzione che l'applicazione racconta. Non e' un
grafico in piu': e' "Come stanno le scadenze" distesa sui mesi, con le stesse
tre tinte di stato, e al centro l'unico numero eroe della pagina. La scelta
viene dal soggetto (la cadenza annuale, la testina del mese corrente), non da
un modello di dashboard.

Le due statistiche nuove sono state **proposte prima** e scelte dal
committente fra tre: il **ritmo** ("ce la facciamo?": quante al mese servono
contro quante se ne chiudono, con la proiezione) e **da fare adesso** (la
lista di lavoro del mese e del prossimo, che apre il cassetto). Scartata
"Contratti da rinnovare". Nessuna carta e' stata tolta.

Vincoli tenuti: nessuna tinta nuova (i tre token nuovi - `--vetro`, `--lucido`,
`--punti` - sono superficie, non dato), cifre grandi in sans proporzionale e
mai in monospazio, tabella su ogni carta nuova, `prefers-reduced-motion`
spegne tutto, anche la salita delle cifre.

**Sul movimento** il committente ha poi chiesto *"piu' dinamicita' alla pagina
senza appesantirla troppo"* e che i grafici in basso non restassero *"banali"*.
La regola di 15d ("un solo movimento permanente") si allarga qui, e solo qui, a
**due**: la spazzata dietro il quadrante e l'onda sul punto finale
dell'andamento - entrambe faint, entrambe spente da `prefers-reduced-motion`.
Il resto della dinamicita' non e' permanente: le carte entrano **quando
arrivano in vista** (IntersectionObserver), le forme crescono e le cifre salgono
carta per carta, e al passaggio del mouse colonne, righe e tessere si alzano di
2-3 px. Niente `backdrop-filter`: rendeva le carte una penombra in tema scuro
e pesa a ogni scorrimento.

## 15f. "Da fare adesso" e' la lista del lavoro, non un promemoria di due mesi (13a sessione)
Il committente ha guardato la carta appena fatta e ha trovato tre cose, tutte
vere: *"se ho una mappatura fatta a gennaio, mi compare lo stesso da fare,
invece non deve comparire perche' e' gia' stata completata per questo anno"*,
*"se completo 1/4 di settembre il nome sparisce"*, *"un riquadro troppo grande
rispetto al contenuto, che occupa metà"*.

**Il difetto di fondo era nel modello, non nella carta.** `calcolaMappatura`
cercava il lavoro solo nei mesi "utili" del calendario contrattuale e saltava
`non-previsto` e `prima-contratto`. Ma il cassetto le quattro caselle le mostra
per OGNI mese di manutenzione scritto in Access, senza guardare la classe
temporale: su un contratto che parte ad agosto, gennaio e maggio sono
`prima-contratto` e si spuntano comunque. Risultato: una mappatura **chiusa e
firmata a gennaio** non risultava chiusa, il sito restava "da fare" e
ricompariva nella lista di settembre. La regola dichiarata da otto sessioni -
*una mappatura per sito per anno, chiusa in un mese qualsiasi il sito e' a
posto* - non era implementata fino in fondo. Ora il giro guarda **tutti e
dodici i mesi** per il lavoro segnato, e il calendario serve solo come ripiego
per dire dove starebbe il lavoro quando non ce n'e' ancora nessuno.

**La carta mostrava il numero piu' grande e non le righe che ci stavano
dietro.** In testa scriveva "229 in ritardo" mentre l'elenco teneva solo le
scadenze del mese corrente e del prossimo: il lavoro piu' urgente era l'unico
non raggiungibile. Ora l'elenco ha **tre gruppi in ordine di urgenza**
(arretrate, questo mese, il prossimo) e i tre contatori sono anche i **filtri**
per isolarne uno. La carta non e' piu' un promemoria di due mesi: e' la lista
del lavoro, e i suoi numeri portano tutti a delle righe.

**Una lista di lavoro non si ordina per avanzamento.** Ordinare per passi fatti
faceva saltare via la riga appena toccata. Dentro un gruppo l'ordine e' per
scadenza e nome: qualcosa che mentre si lavora non si muove. Per la stessa
ragione gli scorrevoli dentro le carte conservano la posizione al ridisegno.

**E la carta e' grande quanto il suo contenuto.** La lista prende tutta
l'altezza che la fila della griglia le da' (`flex: 1 1 0`), invece di restare
un riquadro di 336px dentro una carta di 814: la fila la detta la colonna a
fianco, e lo scorrevole la riempie.

Nella stessa passata, per la stessa idea che ogni cosa a schermo debba portare
un dato: via la **pista di avanzamento nell'eroe** (*"la barra blu che circola
a vuoto, sembra un pezzo di plastica"*) - la percentuale la dice il quadrante a
fianco - e l'**elenco per sito** e' passato in fondo alla pagina con un bottone
**Espandi** che lo apre a tutta pagina: e' l'archivio completo, non una domanda
da un secondo, e in mezzo alla pagina spezzava in due la fascia dei grafici.

## 15g. "Completa" si vede a tre livelli, con lo stesso verde (14a sessione)
Richiesta: *"se la mappatura e' completa per un sito, o per un intero cliente,
evidenzialo bene non solo quel quadratino"*, dentro un rinnovo delle viste Anno
e Mese *"senza stravolgerla completamente"*. La tentazione era un secondo
colore o un'icona per riga. La scelta e' l'opposta: **lo stesso segnale sale
di livello**. La cella verde accende la riga del sito (spina, fondo, spunta
nel totale, etichetta "a posto") e la carta del cliente (bordo e alone verdi,
etichetta), con la stessa condizione del totale `.pieno`, cosi' non ci sono mai
due verdetti diversi sulla stessa riga. Per tenere il verde a un significato
solo, "N aperti" - che e' un conteggio, non uno stato - ha perso il verde.

La forma e' cambiata quel tanto che serve a farlo leggere: clienti come
**carte** separate da aria invece che da bordi forti, punti al posto dei
trattini nei mesi vuoti, i passi del mese come **capsula segmentata** uguale
alla cella. Regola di 15d rispettata: nessun effetto in piu', nessun nodo in
piu' per cella (tutto e' `::before` o markup gia' presente mostrato da una
classe), un solo movimento nuovo - l'indicatore della pista dei mesi che
scivola - e solo perche' il cambio mese non ridisegna piu' la testa.

## 15h. Un filtro solo per lo stato, e i numeri sono il filtro (15a sessione)

*"aggiungi la possibilita' di vedere la vista annuale o mensile senza quelle
gia complete o solo quele in ritardo o solo quele complete (forse con un unico
tasto di quello di prima magari rendendo clicabili i numeri che ci sono tipo
17/267 complete)"*.

C'erano due pillole indipendenti, "Solo incomplete" e "Solo in ritardo": due
interruttori che coprivano tre risposte su quattro, e la quarta - *fammi vedere
solo quelle gia' chiuse* - non era esprimibile. Sono diventati **un filtro solo
a quattro posizioni** (#ANCHOR: filtro-stato in `stato.js`): Tutte / Da fare /
In ritardo / Complete, uno stato per volta, quindi non ci sono piu'
combinazioni che non vogliono dire niente ("solo incomplete" + "solo in
ritardo" era un and che nessuno sapeva di aver acceso).

**La domanda cambia con la vista, non con l'etichetta.** Nella vista Mese lo
stato e' quello della cella di QUEL mese; nella vista Anno e' quello dell'unica
mappatura dell'anno del sito. Era gia' cosi' per le due pillole ed e' rimasto:
`statoPassa()` e' l'unico posto dove la regola e' scritta.

**I numeri sono il filtro.** Ogni posizione porta il suo conteggio e i numeri
della testa ("19/267 complete", "225 in ritardo") sono bottoni. Da qui la
regola meno ovvia: **i conteggi ignorano il filtro di stato**
(`gruppiFiltrati({ ignoraStato: true })`). Se contassero la selezione, dopo un
clic su "Complete" la testa direbbe "19/19" e gli altri numeri sarebbero zero:
il bottone per tornare indietro sparirebbe proprio quando serve. Cosi' invece
la testa e il filtro restano la fotografia dell'anno, e solo la griglia si
stringe.

Il numero dentro il filtro e' `statoPassa` contato riga per riga: il bottone
non puo' dire 7 e poi mostrarne 18. Non e' lo stesso numero della testa, che
conta le mappature **dovute**: "Complete" comprende anche i siti chiusi in un
anno pre-tracciamento, che sono lavoro fatto e vanno mostrati. Due domande
diverse, due numeri diversi, entrambi spiegati nel suggerimento.

La regola vale per **tutti** i numeri, non solo per quelli del filtro: la testa
dell'Anno, i totali per mese nell'intestazione della griglia, la testa del
foglio del Mese - anche quando si aggiornano durante una raffica di spunte. E'
proprio la' che si era rotta al primo giro: il ricalcolo della testa del Mese
girava sulle schede a schermo, e con "Da fare" acceso "complete" andava a zero
pur essendocene di complete. Se un numero si muove quando cambio filtro, e' un
difetto.

Nella stessa richiesta e' sparito il **filtro per tipo di gas**: tre valori che
nessuno restringeva, e il tipo si cerca dalla barra di ricerca.

## 15i. Il pallino della riga dice lo stato, non il tipo di gas (15a sessione)

*"il pallino all'inizio del sito mettilo in base allo stato della mappatura, in
ritardo, completa, ecc"*. Il pallino colorava il tipo di gas (medicale /
tecnici / altro): un'informazione che non cambia mai, che nessuno consultava, e
che dal momento in cui il filtro per tipo non esiste piu' non serve nemmeno a
capire cosa si sta filtrando. Adesso dice **lo stato della mappatura dell'anno
di quel sito** (`statoMappatura()`), che e' la stessa scala del filtro nella
barra: verde completa, ambra in ritardo, cyan iniziata, contorno da fare,
contorno tenue pre-tracciamento, puntino non dovuta.

Nessun colore nuovo: sono gli stessi verde e ambra delle celle, con lo stesso
significato (10f, 10e). Il valore aggiunto e' che il pallino sta **a sinistra,
sempre a schermo**, mentre la cella piena puo' stare in un mese fuori dalla
finestra: con 274 righe e' l'unico posto dove lo stato si legge scorrendo.

Il tipo di gas non e' perso: e' nel suggerimento del pallino, nel cassetto,
nella scheda del Mese e nella ricerca.

**Nel foglio del Mese il pallino ha preso il posto del quadratino di
selezione** (richiesta della stessa sessione). Le quattro caselle di una scheda
parlano solo di quel mese; il pallino dice se il sito e' a posto **per
l'anno** - una mappatura chiusa a gennaio si vede anche sulla visita di
settembre, che e' esattamente la cosa che si rischia di rifare.

**E il pallino e' anche il bottone della scheda**: *"fai che cliccando invece
di selezionare, completa tutte e quattro le spunte"*. Il clic semplice va
all'azione frequente - chiudere una scheda si fa cinquanta volte al giorno,
selezionarne un gruppo quasi mai - e la selezione per le azioni multiple si
sposta sul **ctrl+clic**, scritto nel suggerimento del pallino. Un secondo clic
su una scheda gia' chiusa toglie i quattro passi: i passi sono interruttori
(10f) e senza questo verso un clic di troppo si correggerebbe solo a mano, uno
per uno; siccome pero' cancella lavoro, lo dice con un avviso. Da tastiera e'
il tasto `0`, accanto a `1`..`4`.

Non c'e' piu' un `<input type=checkbox>`: il bottone porta `aria-label` e
suggerimento che dicono cosa fa il clic, e la selezione multipla resta un gesto
da mouse. E' la sola cosa che si perde da tastiera, e vale il baratto: il
quadratino serviva una volta ogni tanto, il pallino-bottone e' il gesto del
foglio.

## 15j. Il ponte non e' una barra che galleggia: e' la testata della colonna (18a sessione)
Chiesto dal committente: *"il dock nuovo del generatore e' fissato in alto,
quindi se scorro giu' nel file non si vede, invece dovrebbe sempre rimanere in
vista, senza coprire il pdf in nessun punto [...] rinnovala perche' risulta
antica, e alcune cose non si leggono per intero se ho un sito con un indirizzo
molto lungo"*.

Il difetto non era il `position:sticky`: era che **non c'era niente che
scorresse** sotto di lui. `#main` ha `overflow:auto` (serve allo zoom oltre il
100%), quindi lo sticky si agganciava al riquadro di scorrimento di `#main` —
che pero' non scorre mai, perche' a scorrere era la finestra intera. La stessa
trappola era gia' scritta nel commento di `.part-strip`, che l'aveva evitata
usando `fixed`.

Con `fixed` la barra sarebbe rimasta in vista **coprendo le pagine**, ed era
l'altra meta' della richiesta. Quindi il guscio: `#app` occupa la finestra e non
scorre, `#main` e' una colonna, e a scorrere e' solo `#banco`. La barra sta
**fuori** dal riquadro che scorre: non e' piu' un oggetto che galleggia sopra il
documento, e' la testata della colonna, come l'etichetta di consegna sopra una
risma di fogli. E' la stessa cosa che risolve i due problemi in una volta.

**Rinnovata di conseguenza.** Non piu' una lastra di vetro sfumato con l'ombra
profonda e sei cose in fila su un rigo solo, tutte tagliate con i puntini: tre
gradi di lettura in colonna — la **rotta** in monospazio (`‹ CRONO MAPPATURE /
CONSEGNA A`, con l'etichetta della provenienza e "cambia sito" in fondo), il
**nome del sito** a 16,5px, i **dati** in una riga che va a capo. Niente
`text-overflow` da nessuna parte: su un sito con l'indirizzo lungo i puntini
mangiavano proprio la parte che distingue un impianto dall'altro.

**Scorrendo diventa una nuvoletta** (chiesto subito dopo: *"quando si scrolla
in giu' diventa una semplice nuvoletta moderna centrale con scritto solo il nome
del sito e salva tracker"*, poi *"fagli un'animazione dinamica scroll down che
scrollando in basso si rimpicciolisce piano piano fino a diventare una pillola
con ombra"*).

Due tentativi buttati prima di quello giusto, e vale la pena ricordarli.
Il **primo** accorciava la banda insieme alla pillola per non contraddire il
"non copre il PDF in nessun punto" di mezz'ora prima: *"meglio fluttuante e
moderna che questo obrobrio"*. Il **secondo** faceva fluttuare la pillola ma con
un salto, due stati e una soglia.

Quello che regge e' **un cursore, non due stati**: `--r` da 0 a 1 mosso dallo
scorrimento, e tutta la forma interpolata su quel numero in CSS - larghezza,
altezza, raggio, ombra, corpo del testo, spina che diventa punto. Nessun salto
da nascondere, e la trasformazione sta in piedi a qualunque punto la si fermi.
La banda si chiude da se' perche' la testata **resta nel flusso**: si accorcia
col suo contenuto, e un margine negativo toglie quel che avanza. **La regola
"non copre il PDF" vale ancora per la testata larga**; da ridotta si accetta la
striscia coperta in cambio dell'altezza guadagnata.

Le tre trappole (ResizeObserver che si morde la coda, `line-height:0` che non
chiude le icone, ordine delle regole nel foglio) sono scritte in
`web/schede/HANDOFF.md`: costano mezz'ora ognuna a riscoprirle.

Un segnale solo, e uno solo si muove: la **spina** di 3px sul bordo sinistro
(grigio / cyan / ambra / rosso, e scorre mentre prepara il PDF) al posto del led
e del "cavo". La **fascia** in basso c'e' solo quando c'e' qualcosa da dire, e
durante il lavoro e' anche l'avanzamento (il riempimento sta dietro alla frase,
non e' una barra in piu'). Il dock passa da ~150 px di roba sempre accesa a
74 px a riposo e 119 px con un esito.

## 15k. Il titolo del documento viene dal sito collegato (18a sessione)
Chiesto: *"nel punto due intestazione, se c'e' un sito collegato, lo prende da
li' in automatico"*. Terza sorgente accanto a "prima cella del foglio" e "nome
del file", e la piu' attendibile delle tre: e' il nome sotto cui il PDF verra'
archiviato nel tracker, e non dipende da come qualcuno ha battezzato l'Excel.
Resta una spunta come le altre — dice **da dove viene** il testo, non accende un
comportamento della stampa — accesa di fabbrica e visibile solo quando un sito
c'e' davvero. Cliente e destinazione una volta sola quando l'una ripete l'altra;
per lo stesso motivo `nomeFile()` non premette piu' il cliente a un titolo che
lo contiene gia' (si otteneva
`CASA DI RIPOSO UMBERTO I - CASA DI RIPOSO UMBERTO I - 2026.pdf`).

## 15l. Esporta e salva: il PDF lo fa jsPDF, non la stampante del browser (20a sessione)

Il committente: *"quando esporto lo salva con netlify [...] quando invece clicco
salva nel tracker non compare il powered by netlify"* e *"il tasto stampa a
questo punto e' inutile, sostituiscilo con Esporta e salva"*. Erano due strade
per lo stesso documento: "Stampa / Salva PDF" apriva la finestra di stampa del
browser, che scrive titolo della pagina e indirizzo del sito
(cronoservices-tracker.netlify.app) in testa e in fondo a ogni foglio e produce
il PDF che vuole lei; "Salva nel tracker" usava jsPDF. Ora un bottone solo
produce il PDF UNA volta, lo scarica e lo consegna. La stampa del browser resta
su Ctrl+P per chi vuole la carta subito. Quello che non si puo' fare e' sapere
cosa succede DENTRO la finestra di stampa: per questo la spunta "stampata" la
mette solo il PDF che esiste.

Sulla qualita': la scala e' passata da 1,5 a 2 perche' misurando si e' visto che
html2canvas paga il clone del DOM e non i pixel (stesso tempo a 1,5, 2 e 2,5),
quindi la risoluzione e' gratis in tempo e costa solo byte (+35%). Il PNG
sarebbe stato meglio su tutto tranne il tempo (jsPDF lo ricomprime in JS,
+0,4 s a pagina) ed e' stato scartato con i numeri scritti sopra `SCALA`.

## 16. Un solo perimetro per le azioni di massa: i filtri
Non esistono "completa per cliente", "completa per mese", "completa per tipo":
esiste "completa quello che stai vedendo". Cercare il cliente e ripetere l'azione
copre tutti i casi con un solo meccanismo da capire e da mantenere.

## 17. Documentazione spezzata in indice + file per argomento
Il committente ha chiesto esplicitamente di ottimizzare i token. Un unico file
monolitico costringe a rileggere tutto per ogni revisione; un indice piccolo
(`AI-HANDOFF.md`) piu' file tematici fa pagare solo l'argomento toccato. Le
ancore `#ANCHOR:` nel codice servono allo stesso scopo: si salta al punto giusto
con un `grep` invece di leggere 300 righe.

## 18. Online: Netlify statico + Supabase, e la sincronia la SPINGE l'ufficio
Chiesto dal committente: *"vorrei mettere online su netlify e magari supabase
questo gestore, mi servirebbe che il database venga sincronizzato ogni tot, senza
farlo a mano"*.

**Il vincolo che ha deciso tutto** e' che `CronoServices_be.accdb` sta sul PC
dell'ufficio e si legge solo da Windows con ADODB: nessun servizio in rete puo'
andare a prenderlo. Quindi la sincronia non si puo' TIRARE dal cloud (nessuna
funzione pianificata di Netlify o di Supabase ci arriva), va SPINTA da quel PC.
`app/push_cloud.py` piu' un'operazione pianificata di Windows sono tutto quello
che resta installato la'.

**Perche' non le Netlify Functions**: non eseguono Python. `api.py` non ci va
com'e'. Riscriverlo in JS per poi tenerne due copie era il peggiore dei mondi.

**Perche' Supabase e non un server Python su Fly.io/Render con Postgres**: la
logica di dominio (modello dell'anno, mappatura per sito, scadenze, rinnovo) non
sta nel server, sta in `web/js/stato.js`, lato client. Del server serviva poco:
il merge per campo, l'idempotenza `op_id`, qualche lettura. Tutto questo diventa
una manciata di funzioni PL/pgSQL, e in cambio spariscono tre pezzi di codice
nostro - l'API di lettura (PostgREST), l'hub SSE (Realtime) e il login (Auth) -
senza nessun processo da tenere acceso.

**Un solo padrone delle spunte.** Il committente ha scelto "solo la versione
online": Supabase e' l'unico posto dove le spunte nascono, l'applicazione locale
resta per l'emergenza. Due padroni avrebbero voluto dire sincronia bidirezionale
e risoluzione di conflitti fra archivi, cioe' la parte piu' fragile di tutto il
progetto, per un vantaggio nullo.

**Un solo varco, due trasporti.** `chiama('/api/...')` in `web/js/api.js` era
gia' l'unico punto di rete del frontend: e' li' che si sceglie fra server.py e
Postgres (`web/js/nuvola.js`, #ANCHOR: nuvola). Le rotte restano scritte
`/api/toggle`, `/api/bootstrap`: nessun altro file sa che modo sia attivo, e
`avvia.bat` continua a partire offline con `nuvola-config.js` vuoto. Le funzioni
Postgres ritornano il vecchio status HTTP dentro il JSON (campo `http`) proprio
per non dover cambiare la gestione dei conflitti 409 lato client.

**Le tabelle sono chiuse in scrittura.** Nessuna policy RLS di INSERT/UPDATE:
l'unica strada sono le funzioni SECURITY DEFINER. Le regole del merge non si
possono aggirare scrivendo dritto sulla tabella, nemmeno con un token valido.
La SELECT diretta e' concessa per una cosa sola, Realtime, che valuta le policy
coi permessi di chi ascolta.

**La firma non e' piu' un nome scritto a mano**: online e' la casella del login.
Era l'unico modo per rispondere davvero a "chi ha fatto cosa" su una pagina
raggiungibile da internet.

## 19. I passi si accumulano: un tracciamento non si azzera (20a sessione)

Il committente: *"se un sito ha visite in piu' mesi e ho delle spunte gia'
segnate il primo mese, quelle valgono anche per i successivi, non si resetta
cio' che e' stato fatto, e' un tracciamento [...] anche per l'anno"*.

Fino alla 19a sessione la mappatura del sito era il mese "migliore": tre passi
a maggio e uno a settembre facevano 3, non 4, e la cella di settembre partiva
vuota. Ora e' l'**unione per campo** dei mesi dell'anno, piu' i passi dell'anno
prima se quella mappatura era rimasta aperta (#ANCHOR: passi-cumulativi in
`web/js/stato.js`, regola completa in
[anno-e-tempo.md](anno-e-tempo.md#i-passi-si-accumulano-non-si-rifanno-anchor-passi-cumulativi)).

Tre scelte dentro la scelta:

- **il tempo va in una direzione**: settembre eredita da maggio, non il
  contrario. Cosi' la cella dove si chiude il quarto passo diventa verde e le
  precedenti restano com'erano: si legge dove e' stato fatto cosa;
- **l'ereditato non si tocca dalla cella che lo eredita**: e' spuntato, tenue,
  con "gia' fatta a maggio da X · si toglie da li'". Un clic che rimettesse lo
  stesso passo due volte o lo togliesse nel mese sbagliato farebbe piu' danno
  del viaggio a maggio;
- **a cavallo dell'anno si eredita solo da una mappatura aperta**, e solo
  dall'anno prima. Se era chiusa si riparte, perche' la mappatura resta una
  per sito per anno. Il prezzo e' che la mappatura dell'anno prima resta
  segnata aperta anche quando la si finisce a marzo: chiuderla a ritroso
  chiede le celle dell'anno dopo e una regola circolare, e non e' stato
  chiesto.

Costo: `celle_prec` nel bootstrap (l'anno prima, ~600 celle) e una ridipintura
di tutta la riga a ogni spunta (undici nodi). Niente colonne nuove: il modello
resta "un bit per campo per cella", e l'eredita' si ricalcola a ogni disegno
come il ritardo.

## 20. Due ruoli, e le due spunte che valgono solo col via dell'amministratore (22a sessione)

Richiesta: *"separa la gestione dei ruoli [...] l'admin ha il ruolo di
approvare le spunte di rapportino e ricambi [...] solo lui puo' azzerare o
completare tutte le spunte [...] un tastino di reversibilita' [...] solo l'admin
puo' sincronizzare da access"*.

**La proposta e' un terzo valore nella stessa colonna, non una tabella a
parte.** `corretta` e `ricambi` valgono 0, 1 o **2 = proposta in attesa**.
L'alternativa - colonne `corretta_proposta_da/il` o una tabella `proposte` -
avrebbe spezzato il merge per campo (decisione 7), che ragiona su un valore
solo per campo, e la coda offline, che rimanda intenzioni. Col 2 tutto il
giro (rev, base_valore, 409, replay, Realtime) resta com'e': cambia solo che
il server traduce l'intenzione secondo il ruolo prima di scrivere
(`_valore_per_ruolo`, gemello Python e SQL) e che "e' fatto?" si chiede con
`=== 1`. Il prezzo e' aver dovuto trovare ogni `c[SIGLA[campo]]` truthy nel
frontend: sono passati tutti per `fatto()`.

**Il ruolo lo decide il server, il client nasconde le porte chiuse.** Menu e
pillola cambiano faccia per il tecnico, ma i 403 su toggle, bulk `massa`,
sync, impostazioni e ruolo scattano anche a chi forgia la richiesta. Con una
differenza onesta fra i due mondi: online il ruolo e' attaccato alla casella
del login (`e_admin()`), in locale a un nome scritto a mano piu' il seme di
`config.json` - senza password (decisione 3) e' una convenzione fra colleghi,
e la documentazione lo dice.

**La reversibilita' e' nel diario, non un "undo" globale.** Ogni riga di
`eventi` sa `da` e `a`: "Ripristina" rimette `da` con `origine:'ripristino'`,
e la mossa finisce anch'essa nel diario. Vale su tutti, admin compreso, e
vale sull'unico posto dove si vede la storia intera; un undo a pila per
utente non avrebbe coperto le mosse degli altri.

**Le azioni multiple restano ai tecnici, quelle di massa no.** "Completa
tutte / Azzera tutte" (menu Azioni, `origine:'massa'`) sono dell'admin:
azzerare il lavoro di tutti in un clic e' la cosa da proteggere. La selezione
nella vista Mese e "Chiudi la mappatura" nel cassetto passano dallo stesso
`spuntaMolte` ma senza quell'origine: sono lavoro ordinario, e sui due campi
il tecnico propone come sempre.

## 21. I PDF si cancellano in blocco, e chi puo' farlo dipende dal perimetro (24a sessione)

Richiesta, dopo un "Non salvato: The object exceeded the maximum allowed size":
*"allora servirebbe una funzione che cancella tutti i pdf"*. Scelti da lui due
perimetri su tre: **per anno** e **per sito**; scartato il pulsante unico che
svuota tutto l'archivio in un colpo.

**"Tutti i PDF" non e' un perimetro, e' due.** Un anno intero e' potatura
d'archivio: si fa una volta a gennaio, riguarda il lavoro di tutti, ed e'
dell'**amministratore**, accanto alle altre azioni di massa (decisione 20).
Un sito e' lavoro ordinario - si rifanno le schede di un impianto e le
versioni vecchie restano li' a pesare - e resta di **chiunque**: e' lo stesso
potere che l'Elimina di ogni riga del cassetto da' gia' a tutti, in un clic
invece di N. Proteggere il secondo avrebbe solo insegnato ai tecnici a
cliccare Elimina otto volte di fila.

**Le spunte non si toccano.** Come per il documento singolo: `stampata` resta
1. Cancellare il PDF non e' dire "non l'ho stampato", e' dire "il file non mi
serve piu'". Portarsi dietro le spunte avrebbe fatto sembrare arretrato un
anno chiuso, per aver liberato spazio.

**Prima i file, poi le righe.** Vale locale e online. Se qualcosa si spezza a
meta' restano righe senza file - visibili ("file mancante"), e ridare lo
stesso comando le trova ancora e finisce il lavoro. Nell'ordine opposto
resterebbero file orfani nello Storage: spazio pagato che nessuna schermata
mostra piu', cioe' esattamente il problema da cui si e' partiti. Online la
lista dei percorsi la da' il modello (`st.documenti` e' lo specchio della
tabella), ma il server cancella **per criterio** e risponde con i percorsi
che ha davvero tolto: se il client aveva la lista vecchia, ci trova lo
strascico e lo ripulisce.

**Il numero prima del bottone.** *Spazio dei PDF* mostra anno, quanti PDF e
quanti mega, presi dal modello senza una chiamata in piu': si decide cosa
potare guardando il peso, non a memoria. La conferma e' quella di sempre -
il bottone diventa "Sicuro? N PDF" e torna com'era da solo (decisione 15) -
perche' qui il numero **e'** l'avvertimento.

**Il tetto dei 40 MB resta dov'e'.** [SUPERATA dalla decisione 24: col piano
Pro il tetto e' salito a 200 MB e la scala adattiva e' stata scartata.]
Non e' di Supabase: e' scritto da noi nel
bucket e in `api.py`. Alzarlo si puo', ma sul piano Free il progetto si ferma
comunque a 50 MB per file, e un PDF da 60 MB e' lento da aprire per il
tecnico e mangia il traffico incluso. La strada giusta, quando servira', e'
la scala adattiva in `ponte.js` (288 dpi sui documenti corti, 192 sui
lunghi), non un piano piu' caro per archiviare JPEG.

## 24. Il tetto dei PDF sale a 200 MB, e un caricamento che non si registra si disfa (26a sessione)

Questa voce **rovescia la decisione 21** ("il tetto dei 40 MB resta dov'e'").
Il motivo per cui restava e' caduto: l'organizzazione e' passata al piano
**Pro**. Sul Free il progetto si fermava comunque a 50 MB per file, quindi
alzare il nostro tetto non serviva a niente; sul Pro lo Storage e' 100 GB
inclusi, l'egress 250 GB/mese e il limite globale si porta fino a 500 GB.

**Il tetto resta pero' un tetto, e resta nostro.** 200 MB (~800 pagine a 288
dpi, misurate: 251 KB a pagina). Senza limite, un errore del generatore
caricherebbe qualunque cosa: e' un paracadute, non un obiettivo. Il numero vive
in `06-documenti.sql` (bucket) e in `MAX_PDF` di `api.py`, e in piu' c'e' il
*Global file size limit* del progetto - che **ha la precedenza** e va alzato
prima, tenuto un gradino sopra (250 MB) proprio perche' il tetto che decide
resti quello scritto in un file versionato.

**Cade anche la strada che la 21 indicava**, cioe' la scala adattiva in
`ponte.js` (288 dpi sui documenti corti, 192 sui lunghi). Era un modo di far
quadrare i conti dello spazio, e i conti dello spazio non hanno piu' bisogno di
quadrare: a 100 GB ci stanno ~4.500 documenti di questa taglia. Abbassare la
risoluzione di un documento **perche' e' lungo** significa dare al tecnico la
copia peggiore proprio dell'impianto piu' grande. I 288 dpi restano su tutto.

**Sulla velocita' si e' lavorato dove non costa niente alla resa.** Il PDF nel
bucket e' immutabile per costruzione - il percorso e' un UUID nuovo a ogni
salvataggio e `x-upsert` e' `false` - quindi si carica con `cache-control` di
un anno, `immutable`. Da solo pero' non serviva a niente, ed e' la parte meno
ovvia: la cache ha per chiave **l'indirizzo**, e `urlFirmato` conia un gettone
nuovo a ogni chiamata, percio' lo stesso file arrivava sempre da un indirizzo
diverso e la copia locale non veniva mai riusata. Quindi la firma dura otto ore
(una giornata di lavoro) e `urlDocumento` **se la tiene** finche' vale: chi
riapre lo stesso documento nel pomeriggio non riscarica una decina di mega dal
telefono. Il bucket resta privato: non e' cambiato nessun permesso.

**Il messaggio d'errore dice cosa fare.** "Non salvato: The object exceeded the
maximum allowed size" descriveva il problema in inglese e lasciava l'operatore
fermo. Ora `caricaOggetto` riconosce il caso e dice di dividere in fascicoli
con la tendina che c'e' gia'. Nessun passo nuovo per chi usa l'app: si genera,
si salva, il PDF e' nel tracker.

**L'ordine "prima il file, poi la riga" non basta: va disfatto.** Nel bucket
c'erano tre PDF (73 MB) senza riga in `documenti`, caricati il 2026-09-09 fra
le 12:12 e le 12:13. Non era la cancellazione in blocco, che gli oggetti li
toglie **prima** delle righe (decisione 21). I log edge dicono la cosa esatta:
upload 200, poi `registra_documento` **403**, tre volte. Era la finestra in cui
si stava riapplicando l'SQL della 25a sessione, e il `revoke` di `04` aveva
tolto l'EXECUTE prima che il ri-grant lo rimettesse - lo stesso difetto di
`elimina_documenti` corretto in `bf951dc`.

Il permesso e' a posto, ma il difetto vero era un altro ed e' strutturale:
`salvaDocumento` caricava e **poi** registrava, quindi *qualunque* fallimento
della registrazione (403, sito sconosciuto, sessione scaduta, rete caduta)
lasciava un file che occupa spazio e che nell'app non si vede - l'app mostra le
righe, non il bucket. Ora il caricamento si disfa: se la registrazione non va,
l'oggetto appena caricato viene rimosso e l'errore rilanciato. La pulizia ha un
`catch` suo, perche' l'errore che deve arrivare a chi salva e' il primo, non
quello della pulizia. Con i fascicoli, se salta il terzo di tre i primi due
restano registrati: sono documenti veri e visibili, si buttano dal cassetto -
un orfano e' un'altra cosa.

I tre orfani esistenti li cancella il committente dal pannello Storage: una
DELETE su `storage.objects` toglierebbe la riga e lascerebbe il file, cioe'
esattamente lo spazio che si voleva liberare. La query che li elenca sta in
`cloud/LEGGIMI.md` 6.

## 22. Il ruolo sta sulla casella, non sul nome; e chi approva non e' chi comanda (25a sessione)

Il nome che firma le spunte e il ruolo erano la stessa chiave: `operatori.nome`
era la primary key, il ruolo una sua colonna, e il client chiedeva "sono
admin?" con `st.ruoli[rete.operatore]`, cioe' col nome scritto nel campo
"Chi sei?". Comodo finche' nessuno lo cambia. Cambiandolo succedeva questo:

- online `imposta_operatore` faceva `on conflict (nome) do update set email =
  excluded.email, ruolo = excluded.ruolo` - la riga del nome che scrivevi
  diventava tua, con la tua casella e il tuo ruolo. Scrivere il nome
  dell'amministratore lo cancellava di fatto: la sua casella spariva da
  `operatori` e nessuno approvava piu' niente;
- il client, appena rinominato, si vedeva togliere i permessi a schermo,
  perche' `st.ruoli` non conosceva ancora il nome nuovo.

**La decisione**: il nome e' *solo una firma*, l'identita' e' la casella del
login. Da qui tre conseguenze, tutte nel codice:

1. **Il nome non si cambia dall'app.** Il campo e' sparito; `#io` mostra una
   scheda in sola lettura. Online il nome viene dalla posta; in locale si
   scrive una volta al primissimo avvio. Non e' un ripiego: finche' quel campo
   esiste, esiste un modo per scrivere sulla riga di un altro.
2. **Nessuna scrittura tocca la riga di un'altra casella.** Un omonimo si
   disambigua allungando il *proprio* nome, mai prendendo il suo.
3. **Il ruolo di chi lavora lo dice il server** (`ruolo_corrente()` /
   `db.ruolo_di`) e viaggia nel bootstrap come `ruolo`. La rubrica `ruoli`
   resta, ma solo per disegnare l'elenco delle impostazioni: da un dizionario
   indicizzato per nome non si decide piu' niente.

L'altra meta' della sessione e' il terzo ruolo. La richiesta era precisa:
"uno che approva ma non cancella tutte le spunte". Si poteva fare con un
permesso per azione (una tabella di flag); si e' scelto **un terzo ruolo con un
nome**, `approvatore`, perche' l'interfaccia deve poter dire in due parole cosa
sei - la pillola accanto al nome, la riga nelle impostazioni - e perche' finora
i poteri chiesti sono due soli: *approvare* e *comandare*. Il codice li tratta
come due domande separate ovunque (`puo_approvare()` / `e_admin()`,
`p_approva` / `p_admin`), quindi un quarto ruolo domani e' una riga, non una
riscrittura. Rimettere una spunta *in attesa* (il valore 2, cioe' il
ripristino) resta del solo amministratore: e' una macchina del tempo, non
un'approvazione.

## 23. Un solo pezzo fuori dal browser, e non e' lui a decidere chi comanda (25a sessione)

Il progetto ha una regola forte (decisione 18): online e' Netlify **statico** piu'
Supabase, niente server nostro. Registrare un collega la rompe, perche' creare
una casella richiede la `service_role` key - quella che scavalca ogni permesso -
e una chiave del genere in `web/` sarebbe pubblica: `web/` e' un mucchio di file
che il browser scarica, non c'e' nessun posto dove nascondere niente.

Le strade erano tre. **Lasciare tutto in Supabase**: gratis, ma ogni collega
nuovo e' un giro nel pannello di amministrazione, ed e' quello che il committente
ha chiesto di togliere. **L'invito per email**, che non avrebbe bisogno di
segreti: ma l'SMTP non e' configurato e quello di default di Supabase manda
poche mail all'ora, quindi il collega resterebbe fermo ad aspettare una mail che
non arriva - i quattro utenti esistenti sono infatti tutti creati a mano.
**Una Netlify Function**: un pezzo che gira sul server, che la chiave la puo'
tenere.

Si e' scelta la terza, con due paletti perche' resti l'eccezione e non l'inizio
di un backend: **un file solo**, e **nessuna dipendenza** - niente `npm
install`, niente `@supabase/supabase-js`, solo il `fetch` che il runtime ha
gia'. Se un domani servisse la seconda funzione, e' il momento di rileggere
questa decisione, non di aggiungerne una terza.

Il punto vero, pero', e' un altro: **la Function non sa chi comanda**. Sarebbe
stato naturale farle leggere la tabella `operatori` con la service key e
decidere. Invece prende il token di chi ha premuto il bottone e chiede a
Postgres `ruolo_corrente()` **con quel token**, cioe' si fa dire dal database
"questa persona, che poteri ha?". Solo se la risposta e' `admin` va avanti, e la
service key entra in scena dopo, per una cosa sola: creare l'utente.

Costa una chiamata in piu' e vale il prezzo. Le regole sui ruoli stanno tutte in
un posto (#ANCHOR: ruoli), e questo file non ne ha una copia sua che un giorno
divergerebbe: il difetto della 25a sessione era esattamente una copia divergente
- il client che si calcolava il ruolo per conto suo dal nome digitato. Fare due
volte lo stesso errore nella stessa sessione sarebbe stato un peccato.

## 25. Due documenti, un ponte, un tipo: il registro non e' un passo della mappatura (29a sessione)

Il **Registro dei componenti** - il documento per il cliente che elenca cosa e'
installato e dove, nato come programma Python sul PC dell'ufficio
(`Desktop/Claude/mappatura`) - entra nell'app come **secondo generatore**,
`web/registro/`, accanto alle schede tecnici. Tre scelte lo tengono semplice:

1. **Un ponte solo.** Tutto quello che lega un generatore al tracker (testata di
   consegna, riconoscimento del sito dal nome del file, PDF con html2canvas +
   jsPDF, consegna, nuvoletta) e' in `web/js/ponte.js`, generico: `avviaPonte({
   tipo })`. `schede/ponte.js` e' rimasto un wrapper di trenta righe che aggancia
   le funzioni globali di quel file. Il markup della testata e' identico nelle due
   pagine, il CSS e' uno (`css/ponte.css`) e i token del banco di lavoro
   (`--ui-*`, `--acc*`) non hanno piu' valori propri: `css/banco.css` li deriva
   da `theme.css`. Un marchio, una tavolozza, tre pagine.
2. **Il tipo sta sul documento, e lo decide il server.** `documenti.tipo` e'
   `'schede'` o `'registro'`; `registra_documento`/`salva_documento` mettono la
   spunta "stampata" solo per le schede. Il registro e' un documento per il
   cliente, non un passo della mappatura: si archivia sul sito, nessuna casella
   si tocca, e il tracker lo mostra con un'icona sua (libretto, grafite) accanto
   a quella delle schede (foglio, cyan). Non si e' fatto un secondo modello ne'
   una seconda tabella: e' lo stesso storico, con due icone.
3. **Il dizionario e' condiviso, come le spunte.** I nomi leggibili dei codici
   articolo e la priorita' nel quadro d'insieme vivevano in un JSON sul PC
   dell'ufficio: online sarebbero rimasti a chi ha quel PC. Ora stanno in
   `dizionario_componenti` (SQLite e Postgres, `08-dizionario.sql`), dietro
   `/api/dizionario`, con lo stesso contratto del vecchio `Dizionario` Python
   (nome e priorita' indipendenti, riga che sparisce quando non resta niente).
   Il vocabolario di partenza e' seminato dal JSON (`app/dizionario-seme.json`),
   una volta sola, dove il codice non c'e' ancora.

Con questo cade il vincolo "font di sistema, nessun webfont": l'app deve
partire offline, e lo fa lo stesso, perche' i tre caratteri (Newsreader, Inter,
JetBrains Mono, ~210 KB in tutto, `web/assets/fonti/`) sono serviti dal sito,
non da una CDN. Il vincolo che resta e' quello vero: nessun `npm`, nessuna
build, nessuna dipendenza esterna a tempo di esecuzione.

## 26. Il restyling premium: porcellana, laguna, tre materiali, un tema solo (30a sessione)

Il committente: "non sembra di lusso". Il cyan puro del logo e il grigio freddo
da pannello di controllo facevano un cruscotto, non un oggetto di pregio. Cosa
e' cambiato, e dove vive (tutto in `css/theme.css`, il resto lo eredita):

- **Neutri**: fondo PORCELLANA calda (`#F3F1EC`) e inchiostro GRAFITE neutro
  (`#15181C`); in notte carbone caldo (`#0C0E11` / `#151719`) e avorio. E' la
  carta di pregio: avorio, nero, un colore vivo solo. Contrasti rimisurati
  (inchiostro 17,8:1, tenue 5,4:1 su bianco e 4,8:1 sul fondo).
- **Il blu**: da cyan (`#00AEEF`) a LAGUNA (`#0D96CF`, notte `#2FB3EA`), stessa
  tonalita' - cosi' i quattro passi restano distinti anche in CVD - ma piu'
  profonda: 3,3:1 su bianco come riempimento (il cyan faceva 2,5, sotto la
  soglia). `--cl-stima` scende a `#085F87` per restare a distanza 15 dal
  "previsto". `valida-tavolozza.py` aggiornato e rilanciato: tutto ok.
- **Tre materiali** (`--btn-*`, `--vetro-fondo`, `--satin`, `--pista-*`,
  `--filo-platino`): INCHIOSTRO per il bottone primario e la posizione attiva
  dei comandi segmentati (pieno scuro tinto del fondo della laguna, filo di
  luce sul bordo alto; in notte si inverte in AVORIO); VETRO per pillole,
  campi e carte; SATIN sui riempimenti di capsule e barre. Il cyan non e' piu'
  un bottone: e' solo il segnale. Le piste sono un incavo, non un grigio.
- **Un tema solo** (#ANCHOR: tema-unico in `js/app.js`): chiave `cs.tema` per
  tracker e generatori, con l'evento `storage` che gira le schede aperte. La
  vecchia `vrsSchedeCampo.theme` faceva divergere i generatori appena si
  sceglieva qualcosa li'; `ponte.js` non traduce piu' fra due chiavi.

Cosa NON e' cambiato, di proposito: i quattro colori dei passi, il verde di
"completa", ambra e rosso; il DOCUMENTO stampato dei due generatori (e' carta,
non interfaccia); il vincolo html2canvas sul fondo del banco in esadecimale
(`--ui-0`, `--fondo-banco`: ora `#ECEAE5` / `#0F1215`).

Movimento (stessa sessione, su richiesta "qualche dinamicita' qua e la'"): poco e
sempre con un senso. Il cambio tema SFUMA con `document.startViewTransition`
(tracker `inDissolvenza()`, generatori `setTheme(t, save, dolce)`), anche quando
arriva da un'altra scheda; sui bottoni d'inchiostro passa un LAMPO (`--lampo`,
`::after` inclinato, una volta al passaggio); la posizione attiva dei comandi
segmentati si assesta (`premi`); le carte delle Statistiche salgono di 2px al
passaggio dopo l'entrata; la ricerca si allarga a fuoco; l'anno scivola mentre
carica; nei generatori la pagina di partenza e i gruppi del pannello si rivelano
in sequenza una volta sola (`sale`). Tutto sotto `prefers-reduced-motion`.

Seconda passata sullo stesso giorno, tre correzioni del committente:
- la rivelazione a scatti dei generatori ("sembra un bug") e' tolta;
- il PONTE non e' piu' la testata sopra l'anteprima: e' il primo gruppo del
  pannello di sinistra ("Collegamento al tracker", `#ponteGrp`). Li' non
  scorre con le pagine, quindi niente nuvoletta: `guarda()` in ponte.js non
  parte se `#ponte` sta dentro `#side`, e `css/ponte.css` (sezione NEL
  PANNELLO) gli toglie vetro, ombra e griglia a due colonne. Il markup di
  #ponte e' identico a prima, spostato;
- i GRUPPI del pannello si aprono e chiudono: il titolo e' l'interruttore,
  `#grpTutti` nella barra del marchio li gira tutti (`js/gruppi.js`, stato in
  `cs.gruppi.<pagina>`; CSS in `css/banco.css`). "Esporta" non si chiude.
Le due animazioni SCENICHE, entrambe legate a un momento vero e non decorative:
la SFOGLIATA (`sfoglia()` in ponte.js, `#pages.sfoglia`) - quando il documento
nasce da zero pagine le prime quattordici salgono al posto una dopo l'altra con
un accenno di prospettiva; e la FESTA (anno.js, `.blocco.festa` / `.cella.fiorisce`
in griglia.css) - l'ultima spunta che chiude la mappatura di un cliente accende
la carta e una luce verde la attraversa una volta, mentre la capsula fiorisce.
Terza scena, IL LIBRETTO (`apriLibretto()` in ponte.js, css/ponte.css sezione
omonima): per tutta l'attesa della consegna al tracker l'anteprima si vela e in
mezzo il documento sfoglia - otto fogli (le prime pagine vere, clonate senza
id e ridotte a 190px, ripetute se sono meno) girano sul dorso SEMPRE IN AVANTI,
uno ogni 0,6 s, in un giro infinito senza cuciture: il foglio girato torna in
fondo alla pila coperto dagli altri e risale con la PROFONDITA' (translateZ in
uno spazio preserve-3d), non con lo z-index. Storia: sei fogli in `alternate`
(il ritorno indietro sembrava un bug, e con attese di 25-50 s erano pochi), poi
dodici con lo z-index animato: laggava, perche' lo z-index passa dal thread
principale che html2canvas tiene bloccato. Regola che ne esce: durante la resa
del PDF si anima SOLO transform/opacity, niente z-index, niente filter o
backdrop-filter sopra cose in movimento. La chiusura e' una dissolvenza, i
fogli non si fermano di colpo; sotto la frase di stato e
l'avanzamento della fascia. Si chiude da solo alla fine, bene o male che vada.
Il velo e' in rgba e i cloni stanno fuori da #pages: html2canvas gira proprio
in quel momento e non deve ne' vederli ne' inciampare in un color-mix.
