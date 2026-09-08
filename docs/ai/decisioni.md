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
  `PASSI` nella colonna Anno, e la barretta di un mese e' la somma delle
  mappature che scadono la' (un cliente puo' averne tre a marzo);
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
settembre, che e' esattamente la cosa che si rischia di rifare. Il checkbox non
e' stato tolto, solo reso invisibile: tastiera, lettori di schermo e azioni
multiple funzionano come prima, e la selezione si legge dall'anello cyan
intorno al pallino, che non copre il colore dello stato.

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
