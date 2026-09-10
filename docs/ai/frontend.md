# Frontend — struttura, CSS, trappole

Moduli ES nativi, nessun bundler. `index.html` carica solo `js/app.js`, il resto
sono `import`. Servito sempre via HTTP dal server Python (con `file://` i moduli
non partono).

## Chi fa cosa

```
app.js        guscio: avvio, cambio vista, filtri, tema, tastiera, operatore, sync
 ├ stato.js   modello + CAMPI/PASSI + filtri + UNICO varco per le scritture: spunta()
 │             (le viste non chiamano mai l'API direttamente)
 ├ api.js     fetch, coda offline, SSE, presenza
 ├ ui.js      icone SVG inline, h(), avviso(), modale(), formattatori
 ├ anno.js    vista Anno        (griglia)
 ├ mese.js    vista Mese        (foglio di lavoro)
 ├ stat.js    vista Statistiche (carte e grafici)
 ├ spunte.js  popover della cella (usato da anno.js)
 └ cassetto.js pannello laterale del service
```

Comunicazione: `stato.js` emette eventi (`on`/`emetti`) — `caricato`, `cella`,
`rilegge`, `presenze`, `sync-fatto`. `app.js` li instrada alla vista attiva.

Le classi temporali delle celle (previsto / visita / stima / da-rinnovare /
non-tracciato / prima-contratto / non-previsto) e la regola **una mappatura per
sito per anno** sono il concetto portante: **leggere
[anno-e-tempo.md](anno-e-tempo.md) prima di toccare celle o conteggi.**
Nessuna vista importa un'altra vista, tranne `anno.js`/`mese.js` -> `cassetto.js`.

## Il disegno: stringhe HTML + delega

La vista Anno crea fino a ~6600 celle: si genera **HTML come stringa** e si
delegano gli eventi sul contenitore `.crono`. Gli aggiornamenti puntuali
(`aggiornaCella`) toccano solo il nodo interessato, mai tutta la griglia — cosi'
una spunta non fa perdere lo scorrimento.

`h()` (hyperscript in `ui.js`) si usa solo per i pezzi interattivi piccoli
(popover, cassetto, modali). Firma: `h('div.classe.altra', {attr, testo, html,
onclick}, ...figli)`.

## Contratto della cella

```html
<button class="cella [visita|stima|darinnovare|nontracciato]
                     [completa|ritardo|orfana|con-nota|sospesa|remota]"
        data-cella="idService-mese"     <!-- chiave -->
        data-s="0|1|2" data-c="0|1|2" data-k="0|1|2" data-r="0|1|2">  <!-- i 4 passi -->
  <i class="seg s"></i><i class="seg c"></i><i class="seg k"></i><i class="seg r"></i>
</button>
```

I segmenti sono pilotati **dal CSS** (`.cella[data-s="1"] .seg.s { transform:none }`):
il JS cambia solo gli attributi, l'animazione e' gratis. `2` = passo
**ereditato** (fatto in un mese prima o l'anno prima, #ANCHOR: passi-cumulativi
in `stato.js`): stesso colore, tenue. La classe `altrui` + `--tinta` e il chip
`.fuoco-nome` nel `.q` dicono che un collega ha la cella aperta (#ANCHOR:
fuoco); `data-tip` conserva il suggerimento base, a cui `dipingi()` aggiunge
"N passi gia' fatti a maggio".
`s` = stampata, `c` = controllata, `k` = corretta / "completa rapportino"
(`k` perche' `c` era occupato), `r` = ricambi (`stato.SIGLA`).
**Il numero dei passi non e' cablato da nessuna parte**: viene da
`stato.CAMPI` / `stato.PASSI` e da un token `--st-<campo>` per la tinta. La
capsula e' una `grid` di `repeat(4, 1fr)` in `griglia.css`: quel 4 e il
`--passo-mese` (44px) sono le due sole cose da ritoccare se i passi cambiano.

## Idea visiva

L'anno e' la cosa piu' caratteristica del mestiere, quindi **la griglia e' l'eroe
della pagina**, non una fila di riquadri con numeri grandi. Ogni cella e' una
capsula divisa in quattro segmenti che si riempiono da sinistra: un anno intero di
tutti i clienti si legge come una tessitura, e si vede a occhio dove il lavoro e'
fermo. In una riga la capsula **piena** e' la mappatura dell'anno di quel sito e quelle
col **solo contorno** sono le visite successive; quando i quattro passi ci sono
la capsula **si accende di verde** (`.cella.completa`, fondo `--completa` e
segmenti schiariti): e' il segnale che quel sito e' a posto per l'anno, e deve
leggersi scorrendo 274 righe. Il mese corrente ha una linea verticale che
attraversa la griglia (la "testina di lettura"). L'unico gesto vistoso e'
l'anello che pulsa quando un collega tocca una cella: la concorrenza resa
visibile. Nell'angolo della testa c'e' **"Chiudi tutti"** (`.piega-tutti`), che
piega o riapre le tendine di tutti i clienti del set filtrato: con 222 clienti si
richiudevano a mano una per una.

**Il segnale sale di livello (14a sessione).** La cella verde da sola non
bastava: puo' stare in un mese fuori schermo, e con 274 righe non si vede quale
sito e quale cliente sono a posto. Ora lo stesso verde arriva a tre livelli,
sempre con la stessa condizione del `.pieno` sul totale (tutti i passi contati
fatti): la **riga del sito** (`.riga-srv.a-posto`: spina di 3px a sinistra,
fondo tinto al 4%, segno di spunta disegnato in CSS nel `.col-tot.pieno`,
etichetta "a posto"), la **carta del cliente** (`.blocco.completo`: bordo e
alone verdi, fascia sfumata sulla riga cliente, etichetta "a posto" - visibile
anche da piegata), e la **scheda del mese** (`.scheda.finita`: spina, fondo,
pista dei passi verde). Le etichette "a posto" stanno **sempre nel markup** e
le mostra il CSS: cosi' `aggiornaTotali` / `rinfrescaRiga` / `aggiornaCella`
cambiano una classe e non inseriscono nodi. Perche' il verde resti UNA cosa,
l'etichetta "N aperti" e' neutra (prima era verde).

**La forma delle carte.** Ogni cliente e' una carta (`.blocco`) con raggio
`--r-carta`, staccata da 6px d'aria e rientrata di `--rientro` ai lati; il
rientro torna nello `left` degli sticky della colonna nome, altrimenti
scorrendo in orizzontale i nomi scivolavano di 12px rispetto al bordo della
carta. I mesi non previsti sono un **punto** di 3px, non un trattino: dodici
trattini per riga facevano una trama che copriva le capsule. I totali per
mese (`.tm`, chiuse/in scadenza) stanno **dentro l'intestazione dei mesi**,
sotto il nome, con un filo di 2px che si riempie (`--p` impostato dal JS): la
riga sticky dei totali non esiste piu', erano quattro fasce impilate prima del
primo cliente. Lo span `.tm` c'e' sempre, anche vuoto (`:empty` lo nasconde),
cosi' `aggiornaRigaTotali` lo trova quando un mese si popola.

**Leggerezza (seconda passata della 14a sessione, "risulta ancora pesante").**
Il peso stava in quattro cose, tolte una a una: le righe dei siti **non hanno
piu' linee** fra loro (le separa l'altezza, 32px); la **capsula vuota** e' un
velo di `--st-vuoto` al 55% con un filo di contorno, non un blocco grigio
pieno - con 274 righe era una muraglia, ora pesa solo il lavoro fatto; le
**carte** non hanno contorno, solo il salto superficie/fondo e `--ombra-1`; le
**pillole dei filtri** (`.pill` in `base.css`) sono piatte, il bordo compare al
passaggio e sull'attivo; le etichette "N aperti / N chiusi" sono solo testo.
Stessa cosa nella vista Mese: schede con ombra e senza bordo, pista dei passi
al 55%.

**Vista Mese.** I dodici mesi stanno in una pista (`.mese-nav`) con
l'indicatore `::before` che scivola su `--i`; per questo il cambio di mese
**non ridisegna la testa** (`cambiaMese` in `mese.js` aggiorna nav, titolo,
riepilogo e ricostruisce solo `.lavoro`, che riparte con `.entra`). I quattro
passi sono una **capsula segmentata** (`.passi-riga`: pista grigia, il passo
fatto si alza in bianco con la sua casella colorata): e' la cella dell'Anno
letta da vicino. Nel cassetto la capsula e' larga quanto serve (`width: auto`),
in stampa `stampa.css` toglie pista e etichetta.

**Un segnale solo, a tre misure.** Il rilievo dell'interfaccia sta tutto in una
linea che va dal cyan del marchio al verde di `--completa` (`--filo`, cioe'
"iniziato -> finito"), e che torna in tre punti: la **linea di stato** di 2px
saldata sotto la barra strumenti (`.filo`, l'avanzamento dell'anno filtrato,
l'unica cosa che vale in tutte e tre le viste e l'unico movimento permanente -
un riflesso ogni 7 s), la **pista dell'eroe** delle Statistiche (stesso
gradiente, ancorato alla pista intera con `--pn`, non alla parte piena: la tinta
raggiunta e' un dato), e l'**alone della casella completa**. Intorno solo
rilievo, non colore: il velo di cyan al 7% del fondo (`--velo`), la testa di
vetro col gradiente, il filo di luce sul bordo alto della carta al passaggio, il
trattino sotto la vista attiva. Vedi [decisioni.md](decisioni.md) 15d: la regola
e' non sommare effetti.

Tipografia: font di sistema per la prosa, **monospazio per ogni dato** (ID, mesi,
conteggi, date) con `tabular-nums`. Nessun webfont, perche' l'app deve partire
senza rete. L'anno in testa e' l'elemento display: 32px monospazio, tracking
negativo.

## CSS: dove sta cosa

- `theme.css` — **solo token**. Il blocco `MARCHIO` in cima tiene i colori del
  logo piu' i due derivati che servono per il contrasto (`--marchio-scuro`,
  `--su-marchio`, `--accento-scuro`): cambiando quel blocco cambia tutta
  l'app. Sotto ci sono i grigi, i colori di stato, la
  tipografia, le misure, e i due blocchi del tema scuro (media query + override
  `[data-tema]`).
- `base.css` — reset, testa, barra strumenti, avvisi, modale, cassetto.
- `griglia.css` — griglia, cella, vista mese, breakpoint.
- `stampa.css` — la vista Mese diventa una checklist A4 con caselle **vuote** da
  barrare a penna in reparto (le spunte fatte diventano una `X`).

Tema: `data-tema` su `<html>` con tre stati — assente (segue il sistema),
`"chiaro"`, `"scuro"`. Memorizzato in `localStorage: cs.tema`.

## Trappole verificate (non ripeterle)

1. **`.gruppo` era usato due volte.** In `base.css` e' il segmented control della
   barra strumenti; in `anno.js` era anche il contenitore del cliente, che quindi
   ereditava fondo grigio, `border-radius` e `padding`. Ora il contenitore si
   chiama **`.blocco`**. Prima di introdurre una classe, `grep` nei CSS.
   Ricaduto alla 12a sessione con `.pill` (il bottone a capsula di `base.css`)
   usata per la pillola di stato delle Statistiche: ora e' `.stato-pill`.
2. **`e.target` di un `keydown` puo' non essere un Element** (document/window):
   `e.target.matches(...)` lancia e ammazza il gestore. Usare sempre
   `e.target?.matches?.(...)` / `?.closest?.(...)`. Questo bug aveva disattivato
   *tutte* le scorciatoie senza alcun errore in console.
3. **`data-k` era ambiguo**: chiave della cella e flag "corretta". Ora la chiave e'
   `data-cella`.
4. **`::after` assoluti**: `.q` e `.cella` hanno `position: relative` di proposito
   (servono a `.con-nota` e a `.eco-nome`). Non togliere.
5. **La colonna dei nomi e' `minmax(var(--col-min), 1fr)`**: la griglia dei mesi ha
   larghezza fissa (`12 * --passo-mese`) e i nomi si prendono l'avanzo. Con una
   larghezza fissa restavano ~400 px vuoti a destra su schermo grande.
6. `st.celle` e' una `Map` con chiave `"idService-mese"` (`stato.chiave()`): le
   celle inesistenti tornano `VUOTA`, non `undefined`.
7. **`avvia()` va chiamata in fondo al modulo `app.js`.** Chiamandola in cima,
   le `const` dichiarate piu' sotto (es. `FILTRI`) sono in temporal dead zone e
   il modulo muore con "Cannot access before initialization".
8. **Non disabilitare le frecce dell'anno durante il caricamento.** Lo si era
   fatto per evitare richieste sovrapposte, e mangiava tutti i clic successivi:
   tre clic rapidi finivano su un anno solo e sembrava rotto. Ora si accumula
   `annoObiettivo` (il passo si conta da `annoMirato()`, non da `st.anno`) e si
   salta all'ultimo obiettivo; durante l'attesa l'anno si sbiadisce.
9. **Il riepilogo in testa va svuotato, non solo nascosto**, quando si cambia
   vista: `hidden` da solo lasciava numeri della vista Anno visibili altrove e
   sembrava che i filtri non funzionassero.
10. La barra di ricerca ha la lente in un `<span id="cerca-ico">` posizionato dal
   CSS con `top:50%; translate:0 -50%`. Prima l'icona veniva sostituita da JS con
   uno stile inline senza centratura verticale (finiva in alto) e c'era un
   `<kbd>/</kbd>` che sembrava uno slash comparso per caso: rimosso, sostituito
   da una croce di svuotamento (`#cerca-x`).
11. **Il cassetto non si ridisegna a ogni spunta.** `apriCassetto` si iscrive
   all'evento `cella` e chiamava `disegna()`, cioe' `replaceChildren` su tutto il
   pannello: lo scorrimento tornava in cima a ogni clic e con dodici mesi a
   schermo era il difetto piu' fastidioso dell'applicazione ("se clicco una
   delle caselle mi rimanda su"). Ora `rinfresca(mese)` ritocca in posto le
   caselle di quel mese (`.scheda[data-mese]`), la sua cornice, la riga "chi e
   quando" e le due `dd` del riepilogo che dipendono dalla mappatura. Il
   redisegno completo resta solo per il caso in cui la struttura cambia davvero
   (spunta su un mese che in Access non e' di manutenzione).
12. **Un conteggio per frame, non uno per clic.** `aggiornaTesta` costa un giro
   su tutti i siti filtrati: `app.js` lo accoda in un `requestAnimationFrame`
   (`aggiornaTestaPresto`) cosi' una raffica di spunte lo paga una volta. La
   mappatura di un sito e' memoizzata in `stato.js` (`memoMap`, invalidata da
   `tocca(id)` a ogni scrittura). Misure sui dati reali: 1 ms per spunta, ~18 ms
   per il disegno completo della griglia.
13. **Il lavoro di una mappatura puo' stare in un mese che il calendario del
   contratto non prevede.** Il cassetto mostra le quattro caselle per OGNI mese
   con manutenzione in Access (`rigaMese` non guarda la classe temporale),
   quindi si spunta anche dove `statoCella().spuntabile` sarebbe falso: tipico
   dei contratti che partono a meta' anno, dove i mesi prima sono
   `prima-contratto`. `calcolaMappatura` invece saltava quei mesi, e una
   mappatura **chiusa a gennaio** non contava: il sito restava "da fare" in
   settembre e ricompariva in "Da fare adesso" ([decisioni.md](decisioni.md)
   15f). Ora il giro guarda **tutti e dodici i mesi** per il lavoro segnato e
   usa il calendario solo come ripiego per dire dove starebbe il lavoro quando
   non ce n'e' ancora nessuno.
14. **Non ordinare una lista di lavoro per avanzamento.** "Da fare adesso"
   ordinava per `scad, n, nome`: spuntavi un passo su quattro e la riga si
   spostava in fondo al suo gruppo, sotto la piega dello scorrimento — *"se
   completo 1/4 di settembre il nome sparisce"*. Dentro un gruppo l'ordine e'
   per scadenza e nome, cioe' qualcosa che mentre si lavora non si muove.
15. **Gli scorrevoli dentro le carte perdono la posizione al ridisegno.**
   `aggiorna()` conserva lo scorrimento della PAGINA, ma le carte si
   ricostruiscono e gli scorrevoli interni (l'agenda, l'elenco per sito)
   tornavano in cima: dopo una spunta la riga su cui si stava lavorando usciva
   dalla vista. `leggiScorrimento`/`rimettiScorrimento` in `stat.js` li
   rimettono a posto (elenco `SCORREVOLI`).
16. **`flex: 1` con base `auto` su una lista lunga fa esplodere la carta.**
   Per far riempire alla lista lo spazio che avanza serve `flex: 1 1 0`: con
   `1 1 auto` (o `max-height: none` e basta) la lista chiede l'altezza delle sue
   righe — con l'arretrato sono centinaia — e la carta e' diventata alta
   11.000px trascinandosi dietro tutta la fila della griglia. Misurato.

17. **La conferma del server sovrascriveva le spunte ancora in volo, e si
    vedeva lampeggiare.** Il committente: *"e' buggato, le spunte sembrano
    lampeggiare"*. Chiudendo una scheda in un colpo partono quattro
    `/api/toggle` in fila (la coda e' seriale) e ognuno torna la cella **intera**
    come il server la conosce in quel momento: la conferma del primo passo
    riportava a schermo una cella con un solo passo, cancellando gli altri tre
    finche' non arrivavano le loro conferme. Misurato con un `MutationObserver`:
    `1111 -> 1000 -> 1100 -> 1110 -> 1111` in 35 ms su localhost - su rete vera
    e' un lampeggio pieno. Ora `cellaDalServer()` tiene i campi ancora in
    `st.sospese` (e' il merge per campo della decisione 7, applicato al lato
    client): vale anche per gli eventi SSE e per chi clicca in fretta. Corollario
    da non dimenticare: se un campo resta in `st.sospese` per sempre, quel campo
    smette di ricevere gli aggiornamenti del server - per questo la coda ora
    avvisa anche quando **butta via** un'operazione rifiutata (`fallita` ->
    `esitoFallita`), cosa che prima non faceva e lasciava celle "in attesa" a
    vita.

## Barra strumenti e azioni

**Il filtro di stato e' uno solo, a quattro posizioni** (`#f-stato`,
#ANCHOR: filtro-stato in `stato.js`): Tutte / Da fare / In ritardo / Complete,
un segmented control `.gruppo.stati` uguale a quello delle viste. Vale in tutte
e tre le viste, ma la domanda cambia: nel Mese e' la cella di quel mese, nell'
Anno (e nelle Statistiche) e' la mappatura dell'anno del sito - la regola sta
tutta in `statoPassa()`.

Dentro ogni posizione c'e' il suo numero (`contaStato()`), e i numeri della
testa sono bottoni: "19/267 complete" e "225 in ritardo" nella vista Anno,
"6/11 complete" nel foglio del Mese (`.riepilogo .voce.scelta`, un clic filtra,
il secondo rimette tutto). Nel Mese sono rimaste tre voci sole - *in scadenza*,
*complete*, *a schermo* (18a sessione): *impianti* e *da stampare* le ha fatte
togliere il committente. La distinzione fra le mappature che **scadono** qui e
le schede a schermo resta pero' vera e va tenuta a mente leggendo `mese.js`: le
seconde sono di piu', perche' comprendono le visite dei mesi successivi al
primo. **Tutti questi conteggi ignorano il filtro di
stato** (`gruppiFiltrati({ ignoraStato: true })`, e per questo `riepilogoAnno()`
lo passa): se contassero la selezione, al primo clic andrebbero a zero e
sparirebbe il bottone per tornare indietro. Nel Mese, quando il filtro nasconde
delle schede, si aggiunge la voce "N a schermo" - i quattro numeri accanto sono
del mese intero, e senza quella riga sembrerebbero sbagliati.

Il cambio di filtro passa da `stato.filtraStato()` (che salva e emette
`rilegge`) e non da `app.js`: lo chiamano la barra, la testa dell'Anno e la
testa del Mese.

**La nota del popover non si sovrascrive mai sotto le dita** (18a sessione).
`rinfrescaPop(id, mese)` - chiamata da `app.js` a ogni evento `cella` - riscrive
la casella solo se non e' stata toccata; se ci si stava scrivendo, la nota
arrivata da un altro operatore viene **annunciata** sopra (`.js-eco-nota`, in
ambra) e la scelta si fa uscendo dal campo, dove il server puo' rispondere 409.
La base del conflitto e' `notaVista`/`notaRev`, cioe' quello che si aveva sotto
gli occhi: prenderla da `st.celle` vorrebbe dire non accorgersi di niente.
Dettaglio in [concorrenza.md](concorrenza.md).

**Ogni conteggio ignora il filtro di stato, anche quando si aggiorna da solo.**
Vale per `riepilogoAnno`, per `contaStato`, per i totali per mese
dell'intestazione della griglia (`htmlTotaleMese` e `aggiornaRigaTotali`) e per
il ricalcolo della testa del Mese (`aggiornaConteggi`, che usa `mesePieno()`
come il primo disegno). Quest'ultimo era il buco della prima stesura: girava
sulle schede a schermo, e con "Da fare" acceso la voce "complete" scendeva a
zero alla prima spunta. Unica eccezione, la voce **"a schermo"** del Mese, che
si conta dal DOM: e' l'unico numero che parla della selezione, e deve dire
quello che si vede (completando una scheda con "Da fare" acceso la scheda
resta, le righe non spariscono sotto le mani).

Stampa, CSV, Sincronizza, Completa/Azzera di massa, **Diario attivita'** e
Impostazioni stanno in un menu **Azioni** (`ui.menu()`, classe `.tendina`):
sette bottoni in barra diventavano illeggibili. Il diario apre una modale con
le ultime 120 modifiche (`GET /api/attivita?limit=120`, classi `.diario` /
`.elenco-diario` in `base.css`): stava nella vista Controlli, ed e' una cosa che
si guarda quando serve, non un pannello da avere sempre a schermo. In testa restano solo le cose che si guardano sempre:
anno con frecce e "Oggi", ricerca, stato del collegamento, operatore, tema.

Le azioni di massa (`#ANCHOR: massa` in `app.js`) valgono **sull'anno e sui filtri
attivi**, cosa dichiarata nella conferma insieme ai numeri esatti
("1234 spunte da mettere, su 456 mappature di 123 service"). Per limitarle a un
cliente si cerca il cliente e si ripete: un solo meccanismo, componibile.
Dopo l'azione l'avviso resta 15 secondi con **Annulla**, che rimanda le operazioni
inverse (`stato.annullaUltima()`, si appoggia allo stesso percorso di scrittura,
quindi e' anch'esso tracciato e idempotente).

**Nel foglio del Mese il pallino e' il bottone della scheda** (`htmlSelez` e
`completaScheda` in `mese.js`, `.selez` in `griglia.css`). Il colore e' lo stato
dell'**anno**, non del mese: le quattro caselle dicono gia' come sta questo
mese, il pallino dice se il sito e' gia' a posto per l'anno (si aggiorna in
`mese.aggiornaCella` anche quando la spunta e' su un altro mese). Il **clic**
mette tutti e `PASSI` i passi di quel mese - e li toglie se c'erano gia' tutti,
con un avviso perche' quel verso cancella lavoro; da tastiera e' il tasto `0`
sulla scheda col fuoco. Il **ctrl+clic** (o cmd, o shift) seleziona per le
azioni multiple: e' l'unico resto del vecchio checkbox, che non esiste piu', e
si vede dall'anello cyan (`.selez.scelto`). L'alone verde al passaggio dice cosa
fa il clic senza scrivere niente - il verde vuol dire "completa" dappertutto.

**Il pallino davanti al sito** (`.punto-stato`, `statoMappatura()`) e' lo
stato della mappatura dell'anno di quel sito: verde completa, ambra in ritardo,
cyan iniziata, cerchio di contorno da fare, cerchio tenue pre-tracciamento,
puntino non dovuta. Prima era il tipo di gas. Sta a sinistra e non scorre via
con i mesi, quindi e' l'unico segnale di stato che si legge sempre; si aggiorna
in posto in `rinfrescaRiga` (una classe e un `title`, nessun nodo nuovo) e la
legenda e' nella finestra "Come si legge".

## Interazioni disponibili

Clic cella -> popover (3 passi + nota + storia). Clic sul nome del service ->
cassetto laterale con tutti i 12 mesi. Clic sulla riga cliente -> piega/spiega.
In vista Mese: caselle grandi in linea, selezione multipla -> barra azioni di
massa ("Segna stampate", "Completa i 3 passi", ...).

**Anche il foglio del Mese ha la tastiera** (keydown in `mese.js:collega`).
Prima non c'era alcun listener qui: i bottoni promettevano "(tasto 1)" nel
`title` e non succedeva nulla.

**L'unita' di lavoro e' la scheda, non la singola spunta.** `su`/`giu'` scelgono
la scheda intera - nome, dati, bolli, i passi - e la evidenziano
(`.scheda:focus, .scheda:focus-within` in `griglia.css`, messe *dopo*
`.finita`/`.ritardo` perche' devono vincere sul loro fondo); `1`..`4`
spuntano su quella e **il fuoco non si sposta**, cosi' si scende con `giu'` e si
spunta coi numeri senza mai perdere il segno. Girare col fuoco fra i passi
non serviva a niente, visto che si spuntano coi numeri: `destra` ci entra
comunque e `sinistra` torna alla scheda, per chi preferisce il fuoco sul
bottone. `Invio` (o `Spazio`) sulla scheda apre il cassetto del service; sulla
casella di selezione `Spazio` resta quello nativo del checkbox.

La scheda ha `tabindex="-1"` e roving tabindex come le celle dell'anno, e un
`pointerdown` rende corrente la scheda cliccata: dopo un clic col mouse i
numeri agiscono su quella. L'entrata col primo colpo di freccia e' la stessa
dell'anno (`ui.frecceEntrano`, chiamata una volta al caricamento del modulo e
filtrata da `st.vista`).

Tastiera: `/` cerca, `A`/`M`/`S` viste, `1`..`4` spunta il passo sulla cella
col fuoco, frecce per muoversi nella griglia (`Home`/`Fine` = primo/ultimo mese
della riga), `Invio` apre, `Esc` chiude, `?` apre "Come si legge" (legenda +
tasti + come funziona il lavoro in due).

**Le frecce ragionano per colonna, non per elenco di celle** (`colonna()`,
`scorriRiga()`, `vicinaInRiga()` in `anno.js`). La griglia e' bucata: i mesi
senza manutenzione prevista non sono `.cella` ma `<div class="q">` vuoti, e in
gran parte delle righe esiste **una sola** cella. La prima versione scorreva
`querySelectorAll('.cella')` della riga: destra/sinistra non si muovevano mai e
il verticale cadeva sulla prima cella della riga sotto (o su niente, se quella
riga non aveva mesi previsti). Ora si cerca la prima cella attiva nella
direzione richiesta, saltando buchi e righe vuote; `colMemo` ricorda la colonna
di partenza cosi' che su/giu' non derivino di mese in mese, e il clic la azzera.
Se il popover e' aperto (`popAperto()`), segue la cella col fuoco.

**Il primo colpo di freccia "entra" nella griglia**
(`ui.frecceEntrano()`, condivisa con la vista Mese). Appena caricata la pagina il fuoco e' su
`<main class="area">` (e dopo un clic a vuoto sul `body`): il listener della
griglia sta su `.crono`, che e' *figlio* dell'area, quindi il keydown non gli
arrivava mai e le frecce non facevano nulla — era questo, non la direzione, il
motivo per cui sembravano morte. Ora un listener su `window` intercetta le
quattro frecce quando nessuna cella ha il fuoco e mette il fuoco sulla cella
dell'ordine di tabulazione, se e' a schermo, altrimenti sulla prima visibile
(non si salta in cima). Si tira indietro se il fuoco e' in un campo, nel
popover, in una modale, nella tendina, nel cassetto o nella barra delle azioni
di massa, e se la vista non e' quella che ha chiamato l'helper. `Home`/`Fine`/`PagSu`/`PagGiu` restano al browser: servono a scorrere.

Accessibilita': celle come `<button>` con `aria-label` parlante, roving tabindex
(una sola cella nell'ordine di tabulazione), passi come `role="checkbox"` +
`aria-checked`, `:focus-visible` sempre visibile, `prefers-reduced-motion`
rispettato.

## La vista Statistiche

`js/stat.js` + `css/stat.css`. Sta sugli **stessi filtri** delle altre viste
(`gruppiFiltrati()`): ricerca, tipo, provincia e "solo in ritardo" valgono anche
qui, quindi non esiste un secondo insieme di dati da tenere allineato. Un solo
passaggio (`raccogli()`) produce **una voce per SITO** (`voci`) — la mappatura
e' una per sito per anno — e tutte le carte si derivano da li' con `dovute()`,
`raggruppa()` (provincia) e `perMese()`: i numeri non possono divergere. Nei
**totali** entrano solo le mappature `prevista`, come nel riepilogo in testa; nel
solo elenco per sito entrano **tutte** le voci, anche quelle fuori conto.

Forma delle carte: una carta = una domanda, un titolo, una frase che dice come si
legge, e il dato **scritto** accanto alla forma. Le cifre grandi (tessere,
ritmo, agenda, centro del quadrante) sono in **sans proporzionale**, non in
monospazio: `tabular-nums` resta alle colonne (regola della skill `dataviz`).

Forma della pagina (12a sessione, [decisioni.md](decisioni.md) 15e): una sola
griglia a **dodici colonne** (`.stat-griglia`, carte `.c12 .c8 .c7 .c6 .c5 .c4
.c3`) su un fondo a punti che sfuma (`.stat::before`), carte di **vetro**
(`--vetro`, riflesso `--lucido`, filo di luce `--filo` sul bordo alto sempre
acceso appena; **niente `backdrop-filter`**, vedi il commento in `stat.css`).
Ogni carta **entra quando arriva in vista** (`rivela()`: un
IntersectionObserver mette `.entrata`, scalata per gruppo con `--r`, e fa
salire le cifre `data-conta` di quella carta con `contaSu`); al ridisegno dopo
una spunta tutte le carte nascono gia' `.entrata` e non riparte nulla.
Nell'ordine:

1. la carta **eroe** (`.eroe`, c12): a sinistra il **quadrante dell'anno**, a
   destra occhiello, titolo con la cifra grande ("N mappature chiuse su M
   dovute") e **cinque tessere** (clienti, siti aperti, dovute, in ritardo,
   pre-tracciamento) le cui cifre salgono da zero (`contaSu`, solo al primo
   disegno e non con `prefers-reduced-motion`). Qui c'era anche una pista di
   avanzamento larga quanto la carta: **via alla 13a sessione**, il committente
   l'ha chiamata *"un pezzo di plastica"* — la percentuale la dice gia' il
   quadrante a fianco, e con pochi punti percentuali quella pista era un
   binario vuoto. Il segnale resta a due misure, la linea di stato sotto la
   barra strumenti e l'alone della casella completa;
2. **Da fare adesso** (c8) e, impilati a fianco in `.colonna-carte` (c4),
   **Ritmo per chiudere l'anno** e **I 4 passi** (che si allunga a pareggiare
   la fila): le carte su cui si agisce, vedi sotto;
3. la fascia dei **tre quadranti** (c4 ciascuno): le tre domande da un secondo;
4. il tempo: **mese per mese** (c7) e **andamento cumulato** (c5);
5. province (c4), da quanto sono scadute (c4), chi mette le spunte (c4);
6. **Mappature per sito** (c12) **chiude la pagina** (13a sessione): e'
   l'archivio completo di tutti gli impianti, non una domanda da un secondo, e
   dal bottone **Espandi** si apre a tutta pagina. Stava al punto 5 e spezzava
   in due la fascia dei grafici.

Sotto i 1180px c8/c7/c5/c4 vanno a tutta larghezza (ritmo e passi affiancati),
i quadranti a due per riga; sotto gli 820px tutto in colonna, quadrante sopra
il testo, pillole di stato nascoste.

### Il quadrante dell'anno

`quadranteAnno(mesi, d)` in `stat.js`, SVG 240x240 con lo stesso `arco()` delle
torte (ora con raggi e centro parametrici). Dodici settori, uno per mese, con
un distacco di superficie: la **traccia** e' `--st-vuoto` (quasi invisibile se
il mese non ha scadenze, `--allerta-tenue` se e' passato e non finito), dentro
la quota **chiusa** in `--completa` e la quota **in ritardo** in `--allerta`,
proporzionali alle mappature che scadono la'. E' "Come stanno le scadenze"
distesa sui mesi, con le stesse tinte di stato. Fuori i nomi dei mesi in
monospazio e la **tacca** cyan sul mese corrente (la testina di lettura della
griglia, a raggio); dentro sessanta tacche da strumento e al centro il numero
eroe della pagina (percentuale di complete, sans 800, proporzionale) con
"chiuse / dovute" sopra e COMPLETE sotto. Ogni settore ha `data-tip` e
`tabindex`. Entra ruotando sul proprio centro (`transform-box: fill-box`).
Dietro l'anello gira una **spazzata** lenta (`.eroe-quadro::before`,
conic-gradient mascherato sulla corona, un giro ogni 14 s): e' il movimento
permanente della pagina, insieme all'onda del punto finale dell'andamento
([decisioni.md](decisioni.md) 15e). `prefers-reduced-motion` spegne entrambi.

### Da fare adesso e il ritmo

- **Da fare adesso** (`cartaDaFare`), rifatta alla 13a sessione: tre gruppi di
  urgenza, **arretrate** (le piu' vecchie prima), **scadono questo mese**,
  **scadono il prossimo**, uno dietro l'altro nella stessa agenda. I tre gruppi
  non si sovrappongono ("in ritardo" vuol dire scadenza in un mese GIA' passato,
  quindi mai il mese corrente) e i tre **contatori sono anche i filtri**: uno
  acceso (`.agenda-conta.acceso`, `gruppoDaFare`) isola il suo gruppo.
  Ogni riga ha il mese in capsula (`.agenda-mese.ora` corrente, `.tardi` in
  ambra se arretrata), cliente e sito, la capsula dei passi in piccolo
  (`.agenda-passi`) e `n/PASSI`; il clic apre **il cassetto del service**
  (`apriCassetto`, importato da `cassetto.js`), perche' e' li' che si spunta.
  Vale solo per l'anno in corso: in un altro anno la carta lo dice a parole.
  Oltre 8 righe scorre dentro la carta, e lo scorrevole prende **tutta**
  l'altezza che la fila gli da' (`flex: 1 1 0`, vedi le trappole 14 e 15).
- **Ritmo per chiudere l'anno** (`ritmo(d)` + `cartaRitmo`): `servono` =
  rimaste / mesi che restano (mese corrente compreso), `finora` = complete /
  mesi tracciati trascorsi (da `inizio_tracciamento`, se cade nell'anno),
  `proiez` = dove si arriva a dicembre tenendo il ritmo. Due figure grandi, un
  misuratore con la **tacca dell'obiettivo** (inchiostro, non un colore di
  serie) e la frase. Tre fasi: anno in corso, anno chiuso (rimaste aperte),
  anno futuro o tracciamento non ancora partito (solo il necessario). Tabella
  con tutte le voci.

### I tre quadranti

Ciambelle SVG disegnate a mano (`arco()`: due archi e due raccordi, `R`/`RI` =
raggi esterno e interno) — niente librerie, come tutto il resto. Una torta va
bene per una cosa sola: **parte-su-tutto a colpo d'occhio**, con `<= 5` spicchi,
la somma che fa il totale, il valore SCRITTO nella legenda e un buco in mezzo col
numero che riassume. Non ci sono torte a due spicchi (sarebbe un numero) e non si
confrontano valori vicini fra due torte diverse. La **legenda e' la versione
leggibile del grafico** (parola, numero, percentuale): per questo un quadrante
non ha anche il bottone "Tabella", che ripeterebbe la stessa cosa raddoppiando
l'altezza della carta. I 1,6px fra due spicchi sono **superficie**, non un bordo.

1. **A che punto siamo** — uno spicchio per numero di passi fatti, rampa
   sequenziale `--pr-0..--pr-4`, al centro la percentuale di complete;
2. **Come stanno le scadenze** — complete / da fare in tempo / in ritardo,
   colori di stato, al centro gli arretrati;
3. **Clienti a posto** — un cliente e' "a posto" quando TUTTI i suoi siti dovuti
   sono chiusi: e' la domanda che si fa al telefono e non si legge dall'elenco
   dei siti. Quattro spicchi (tutti chiusi / iniziati / non iniziati / con
   arretrati), al centro la percentuale. Il denominatore sono i clienti con
   almeno una mappatura dovuta (`cliConDovute`), non tutti quelli aperti:
   altrimenti la percentuale al centro non tornerebbe con la somma degli
   spicchi.

### Le carte

Le due carte grandi, nell'ordine (chieste cosi' dal committente alla 5a
sessione — la mappatura e' annuale, quindi la domanda naturale e' per impianto,
non per mese):

1. **Mappature per sito**: una riga per sito = la sua UNICA mappatura dell'anno,
   cliente sopra e destinazione sotto, la **capsula a quattro segmenti**
   (`.seg`, la cella della griglia in piccolo; piena e verde = a posto per
   l'anno), `n/PASSI` e a destra lo stato in una **pillola** (`.stato-pill.<stato>`, non `.pill` che e' il bottone di base.css:
   ambra il ritardo, verde la completa, cyan la "da fare", rosso il contratto
   da rinnovare, grigio il resto). Una riga di testa dice quanti impianti. Ci
   sono **tutti** i service aperti: quelli fuori conto (pre-avvio, mappatura non
   dovuta) prendono `.fuori` e restano tenui. Ordine per urgenza
   (`STATO[..].ord`: in ritardo, da fare, complete, pre-avvio, da rinnovare,
   oltre il contratto, non ancora attivo, non dovuta - le ultime quattro sono il
   `motivo` della mappatura non dovuta, perche' un "non dovuta" muto ha nascosto
   il difetto LASERJET, vedi anno-e-tempo.md), poi
   meno passi prima, poi alfabetico per cliente e destinazione. L'elenco parte
   **completo** e scorre dentro la carta (`.barre-cli.lunga`); il bottone
   restringe ai primi 12, non il contrario — il committente vuole vedere tutti i
   suoi impianti. L'etichetta si prende `2fr` contro `1fr` della pista: con nove
   ospedali dello stesso cliente e' la seconda meta' del nome a distinguere le
   righe. La riga e' un `role="button"`: **cliccarla apre quel CLIENTE nella
   carta dei mesi** (`cliSel`, stato della vista, azzerato se un filtro lo fa
   sparire).
   Alla 13a sessione la carta e' passata **in fondo alla pagina** e ha preso il
   bottone **Espandi** (`apriSiti`): apre le stesse righe in un foglio grande
   (`ui.modale` con `classe: 'largo'`, `.foglio.largo` in `base.css` +
   `.siti-testa` / `.siti-espansi` in `stat.css`) dove lo scorrevole prende
   l'altezza del foglio invece dei 470px della carta. E' lo stesso `grafSiti`,
   quindi non c'e' un secondo posto dove l'elenco possa divergere dai numeri.
   Cliccare una riga nel foglio sceglie il cliente **e chiude il foglio**
   (`scegliCli`), altrimenti si resterebbe a guardare un elenco mentre sotto si
   muove il grafico dei mesi. `pulisci()` lo chiude uscendo dalla vista.
2. **A che punto siamo, mese per mese**: una colonna per mese, alta quanto le
   mappature che scadono la', **divisa per quanti dei `PASSI` passi hanno**
   (`isto[k]`), impilata dal basso col piu' completo in fondo. Rampa sequenziale
   `--pr-0..--pr-4`. Dietro, tre righe di riferimento col valore
   (`.griglia-h`, allineate alla fascia delle piste perche' `.colonna` e' una
   griglia a tre righe e la pista sta nella riga `1fr`); il mese corrente ha
   una linea verticale cyan alle spalle; al passaggio la colonna si alza di
   3px. Ogni mappatura pesa su **un mese solo**, quello della
   scadenza: la somma delle colonne e' il totale dovuto. Bottone "Tutti i
   clienti" quando c'e' un cliente aperto.

Poi: **Andamento cumulato** (area a gradiente `#g-area` e alone `#g-alone` in
`<defs>`, linea del mese corrente, punto finale con l'onda), **I `PASSI`
passi** (quattro **anelli** `anelliPassi()`, uno per passo nel colore del suo
segmento, percentuale al centro e "fatte su dovute" a fianco), **Mappature per
provincia** (barre con **rango** e, dentro la barra, la parte gia' chiusa in
verde: `v.sub` in `barre()`), e due carte nate alla 8a sessione:

- **Da quanto sono scadute**: l'elenco dei siti dice *quali* sono in ritardo,
  questa dice da *quanto*, che e' l'informazione con cui si decide da dove
  ripartire. Barra parte-su-tutto (`stack()`) su quattro bin — entro 1 mese, 2-3,
  4-6, oltre 6. I bin sono **ordinati**, quindi la tinta e' una rampa
  sequenziale di un tono solo, l'ambra dell'arretrato (`--ar-1..--ar-4`,
  validata: chiarezza monotona, gradi vicini separati in CVD). La legenda e'
  una fila di tessere con la tinta sul bordo sinistro (`.legenda-tessere`). Se
  non c'e' arretrato la carta lo dice a parole e non disegna niente;
- **Chi mette le spunte**: barre a una tinta per operatore, con rango, piu' quante
  mappature ha portato a termine. Conta **tutti** i mesi (visite comprese),
  quindi il totale e' piu' alto delle "spunte" della carta eroe, che guarda solo
  le mappature dovute: la carta lo dichiara nel sottotitolo. L'attribuzione e'
  `cella.by`, cioe' l'ULTIMO che ha toccato quella casella — e' tutto quello che
  il modello tiene in locale, e anche questo sta scritto nella carta.

Rimosse alla 5a sessione: "Composizione dell'anno" e "Completamento per tipo di
service" (chiesto dal committente); con loro e' uscita anche la tavolozza
`--cl-*` dai grafici. Rimossa alla 8a sessione la vista Controlli, con le sue
torte passate qui e "Mappature in ritardo" che non e' stata ricostruita perche'
la carta "Mappature per sito" e' gia' quell'elenco
([decisioni.md](decisioni.md) 15c).

Regole seguite (skill `dataviz`), da non regredire:

- **una tinta sola** dove il dato e' una grandezza (clienti, province); il
  completamento e' una cosa sola e ha la sua tinta, `--completa` (il verde), e
  "a che punto siamo" e' la **rampa sequenziale** `--pr-0..--pr-4` dello stesso
  tono, non cinque colori;
- i colori dei passi si usano **solo** nella carta "I 4 passi", dove l'identita'
  del passo *e'* il dato. Per questo il terzo passo non e' piu' verde (vedi
  [decisioni.md](decisioni.md) 10f): il verde altrove significa "mappatura
  completa" e le due cose si confondevano;
- **nessun asse doppio**, mai;
- le tinte delle classi temporali sono i token `--cl-previsto` / `--cl-stima` /
  `--cl-rinnovo` / `--cl-pretrac`, un set **validato** (banda di chiarezza,
  saturazione minima, separazione delle coppie adiacenti in
  protanopia/deuteranopia, contrasto sulla superficie). Se si cambiano, va
  rifatto il controllo: lo script della skill e' in JS e su questa macchina non
  c'e' Node, quindi ne e' stato usato un gemello Python (vedi
  [da-fare.md](da-fare.md#manutenzione));
- **ogni carta ha il bottone "Tabella"**: il colore non e' mai l'unico modo di
  leggere il dato. Le eccezioni sono i tre quadranti, dove la legenda porta
  gia' parola, numero e percentuale di ogni spicchio, e la carta eroe, dove il
  quadrante ha tooltip e `aria-label` per settore e le cinque tessere sono gia'
  la lettura scritta;
- i bin ordinati (l'anzianita' dell'arretrato) prendono una rampa sequenziale di
  UN tono; le categorie senza ordine naturale (province, operatori) prendono
  **una tinta sola**, mai un valore-rampa;
- 2px di superficie fra i segmenti della barra parte-su-tutto;
- un solo tooltip per tutta la vista, delegato su `data-tip`.

Il grafico dell'andamento cumulato e il quadrante sono gli SVG a mano: `viewBox` fisso, larghezza
100%, `vector-effect: non-scaling-stroke` perche' i tratti restino di 2px a ogni
dimensione. La "presa" del tooltip e' una linea invisibile larga un mese
(`stroke-width: 53` in unita' di viewBox), non il punto: centrare un cerchio da
3px col mouse e' un lavoro, non un'interazione.

Dopo una spunta la vista si **ridisegna tutta** (cambiano quasi tutti i totali)
ma conserva lo scorrimento e non rianima le barre: `disegna(area, false)`.

## L'ambra e il rosso

**Non sono sinonimi**: ambra (`--allerta`) = lavoro nostro in
ritardo, rosso (`--scadenza`) = contratto scaduto / da rinnovare. Prima
condividevano `--allerta` e a schermo sembravano la stessa cosa; il committente
ha chiesto esplicitamente di distinguerle. La tavolozza dei grafici e' stata
rivalidata con `docs/ai/valida-tavolozza.py`.

## Il logo e la palette VRS

`web/assets/logo.webp` (copia di `VRS-Group_logo.webp` nella radice). Se il file
manca, `onerror` in `index.html` mette un segnaposto (`.segno-logo`).
Il logo e' trasparente e la parola "GROUP" e' grigio scuro: in tema scuro riceve
una piastrina bianca (regola nello `<style>` in fondo a `index.html`), altrimenti
si perderebbe.

Colori estratti dal file (decodifica WebP via WIC / `PresentationCore`, perche'
`System.Drawing` non legge WebP e risponde "Memoria insufficiente"):

| ruolo | hex | dove |
|---|---|---|
| cyan del marchio | `#00AEEF` | `--marchio`: segmento "controllata", focus, mese corrente |
| grigio scuro | `#58595B` | `--inchiostro-2`: testo secondario |
| grigio chiaro | `#A7A9AC` | famiglia di `--tenue-2` e dei bordi |

I grigi del logo sono diventati la **scala neutra di tutta l'app**: e' cio' che la
fa leggere come VRS e non come un tema generico.

**Contrasti gia' verificati: non regredirli.** Il cyan puro su bianco fa solo
2,5:1, quindi:

- il testo cyan usa `--marchio-scuro` `#00719B` (5,5:1);
- cio' che sta **sopra** il cyan pieno (etichetta del bottone primario, spunta
  della casella "controllata") usa `--su-marchio` `#00323F` (5,4:1 su chiaro,
  6,9:1 su scuro), **non** bianco;
- il testo bianco sul verde usa `--accento-scuro` `#007A5C` (5,3:1);
- `--tenue` `#6E7175` = 4,9:1; `--tenue-2` `#83868A` = 3,7:1, solo etichette
  terziarie.

Lo snippet per ricalcolare i rapporti e' in
[da-fare.md](da-fare.md#manutenzione).

## Ruoli e proposte a schermo (#ANCHOR: ruoli, 22a e 25a sessione)

Un passo proposto (valore 2, solo `corretta`/`ricambi`) si disegna **a righe**
col colore del passo: nella cella `data-x="3"` (e classe `.attesa` sulla
capsula), nei bottoni `.passo.proposto` con `aria-checked="mixed"` (Mese,
cassetto, popover), tooltip "proposta da X, in attesa di chi approva".
Il clic passa sempre da `prossimo(id, mese, campo)`: su un 2 chi approva
approva (-> 1), il tecnico ritira (-> 0). Ogni "e' fatto?" e' `fatto(c, campo)`.

**Registrare un collega** (#ANCHOR: registra-utente) sta in Azioni ->
Impostazioni, e compare solo `inNuvola()`: in locale non c'e' nessun login da
creare. E' l'unica rotta che non diventa una funzione Postgres - in `nuvola.js`
la serve `funzione()` invece di `rpc()` - perche' creare una casella vuole la
service key, che vive solo nella Netlify Function.

**Il nome del ruolo a schermo passa da `ETICHETTA_RUOLO`**: il valore `'tecnico'`
si legge **"operatore"** (25a sessione, richiesta del committente). Nel codice, in
`api.py` e nelle funzioni Postgres la chiave resta `'tecnico'`: nell'interfaccia
non si scrive mai il valore grezzo.

**Il ruolo di chi lavora e' `st.ruolo`, e arriva dal server** col bootstrap.
Non si ricava dal nome a schermo: `st.ruoli[nome]` serve solo all'elenco delle
impostazioni (era la falla della 25a sessione). Due domande diverse:
`possoApprovare()` (admin + approvatore) e `sonoAdmin()`.

A chi approva compaiono: il badge `.ruolo` nella pillola `#io` ("admin" o
"approva") e la pillola ambra `#approva` (`.pill.attesa`, nascosta a zero) che
apre *Da approvare*. **Solo all'admin**: le voci
Completa/Azzera/Sincronizza/Impostazioni nel menu Azioni e il bottone
`.pill.mini.ripristina` su ogni riga di diario, storia del popover e ultime
modifiche del cassetto. Il tecnico non vede niente di tutto questo.

`#io` non e' piu' un campo: apre una scheda in sola lettura (chi sei, la
casella, il ruolo, cosa puoi fare). Il nome si chiede una volta sola, e solo al
primo avvio in locale.
