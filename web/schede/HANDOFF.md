# Schede Tecnici VRS — `web/schede/index.html`

> **Dal 2026-09-08 il generatore vive qui, dentro Crono Mappature** (era
> `Desktop/Claude/exel pdf converter/Schede-Tecnici-Generatore.html`, che resta
> come copia vecchia). Il legame col tracker e' in `ponte.js` e nella sezione
> `PONTE col tracker` del CSS/HTML: vedi `docs/ai/da-fare.md` (16a sessione).
> Le librerie PDF stanno in `lib/`. Il resto del file e' quello descritto sotto.

Recap per sessioni IA. **Regola del file: solo lo stretto necessario.** Niente
racconti, niente "perché" già leggibili nei commenti del codice. Qui vanno solo
i fatti che costano token da riscoprire e le decisioni che non si possono
dedurre dal sorgente.

## 1. Cos'è

Una pagina HTML **singola, offline, senza dipendenze** (CSS + JS + logo base64
+ SheetJS 0.18.5 dentro). Trasforma un export Excel di mappatura impianto gas
medicali in **fogli A4 da stampare** su cui il tecnico scrive a mano.

- Input `.xls .xlsx .csv` → output: stampa browser / Salva come PDF
- Nessun dato esce dal browser
- Stampa: **A4, margini nessuno, grafica di sfondo attiva**

## 2. Mappa del file (~3800 righe)

Cercare i commenti `/* ====== NOME ====== */`, non fidarsi dei numeri di riga.

| sezione | contenuto |
|---|---|
| `<style>` | token dei due temi, comandi, foglio A4, scheda, copertina, indice, stampa |
| SheetJS | minificato. **Non modificare** |
| HTML | pannello sinistro `#side`, anteprima `#main`, colonna albero `#treecol` |
| utility | `LOGO`, `DENS`, `norm`, `esc`, `natCmp`, calzature |
| PARSING | `parseEntry`, `findNoteCol`, `buildModel` |
| ELENCO NOTE | finestra note operatore |
| SCHEDE | `cardHTML`, `blankHTML`, `headHTML`, `footHTML`, `measure*` |
| COPERTINA E INDICE | `coverHTML`, `voidHTML`, `ixPlan`/`packIndex`/`balanceCols`, `chooseCuts`, `planDocument` |
| RENDER | densità, impaginazione, `updateSplitInfo`, scaffale fascicoli, barra di scorrimento, `fitDescriptions` |
| FILTRI | albero piano/reparto/stanza, `syncTree`, `applyFilter` |
| INPUT | `loadRows` (righe → modello), `readFile`, `unloadFile`, drag&drop |
| ASPETTO | `setTheme` |
| TUTORIAL | `TOUR_STEPS`, `TOUR_DEMO_ROWS`, `tourEl`, `tourPlace`, `tourGo` |
| IMPOSTAZIONI | `localStorage`, zoom, larghezza colonne |

Tre colonne: `#side` (`--sidew` 392) · `#sidegrip` · `#main` · `#treegrip` ·
`#treecol` (`--treew` 320). Le due maniglie sono `makeColGrip()` chiamata due
volte (`fromRight` cambia il verso). Doppio clic = misura di fabbrica.

## 3. Tracciati Excel

Una sola cella A contiene tutto:

```
115961 - FILTRO NEA 172 HP PER O2 PIANO: 0; REPARTO: LASER; STANZA: BOX; POSIZIONE: 65331;
└codice┘ └─descrizione─┘                  └─── campi chiave: valore ; ───┘
```

`parseEntry()` spacca sul primo `PIANO:`. Riga senza `PIANO:` = non è dati
(oltre 25 caratteri finisce fra le "righe ignorate", cliccabili nel pannello).

- **Tracciato A** (2 colonne): nota in **B**.
- **Tracciato B** (3 colonne): B è un'etichetta fissa ripetuta (`NOTE OPERATORE`),
  la nota vera è in **C**.

`findNoteCol()`: 1) cerca `Tipo di dato` nelle prime 8 righe (criterio
primario, marca la colonna del *valore*); 2) ripiego su `note/osservazioni/
annotazioni/commenti`; 3) **verifica sui dati** — se la colonna scelta è piena
su tutte le righe con sempre lo stesso testo è un'etichetta, si sposta a destra
(max 3 volte). Senza il passo 3 un tracciato B senza intestazione stamperebbe
`NOTE OPERATORE` su ogni scheda.

**La nota si legge SOLO da quella colonna.** Nessun ripiego sulla prima cella
non vuota: era la causa dell'etichetta stampata come nota.
Limite noto: etichetta in B, C vuota, valore in D → si ferma su C. Nessun file
reale è così; il punto è il `for(var passi...)` in `findNoteCol`.

## 4. Modello dati

`buildModel(rows)` → `{tree, items, noteCol, withNotes, skipped, skippedRows}`;
`tree` = piano › reparto › stanza › items. `id` = progressivo (link dall'elenco
note alla scheda), `riga` = riga Excel. Dentro la stanza ordine per **posizione
crescente** (`natCmp`, confronto naturale).

Globali: **`FULL`** = modello completo, **`DATA`** = sottoinsieme filtrato
dall'albero (quello che si stampa).

## 5. Scheda e densità

Testata (codice + descrizione + POSIZIONE) e, sotto, `NOTE OPERATORE
(RILEVATE)` da Excel + `NOTE IN CANTIERE` a righe vuote. Alle densità 8/10/12
(`compact:true`) i due riquadri spariscono e resta una casella VERIFICA
SERVICE. I codici in `SHOE_CODES_SRC` (calzature) escono arancioni.

`DENS` è un **punto di partenza**. `render()`: misura l'ingombro reale di
intestazione/piè di pagina → riserva le fasce REPARTO/STANZA → ricalibra
altezza scheda e corpi → `spreadSlack()` distribuisce lo spazio residuo.

`fitDescriptions()`: descrizioni >70 caratteri usano `--descl-fs`; se non
entrano stringe il font scheda per scheda fino a 7,5px. Il confronto è
`scrollHeight` vs `clientHeight` — **contare le righe non basta**: `.c-id` ha
altezza fissa e il flex schiaccia il riquadro sotto le righe dichiarate.

## 6. Copertina, indice, fascicoli, modalità libro

Tutto in **`planDocument()`**, che gira a impaginazione delle schede finita
(i numeri dell'indice sono quelli del documento completo).

**Indice** — deve stare in una pagina, due al massimo; le colonne CSS non si
spezzano fra fogli quindi l'impaginazione è a mano: `ixMeasure()` misura
l'ingombro vero di ogni riga (i nomi lunghi vanno a capo) → `packIndex()`
riempie colonna per colonna senza lasciare un titolo solo in fondo →
`balanceCols()` ripareggia l'ultima pagina → `ixPlan()` prova `IX_ATTEMPTS` in
ordine: **completo in 1 pagina → completo in 2 → senza stanze in 1 → senza
stanze in 2**. Rinunciare alle stanze viene dopo aver provato tutte le forme
complete. I numeri vengono da `ANCHORS` + pagine iniziali; `ANCHORS` viene poi
spostato in avanti della stessa quantità (conta pagine nel DOM). L'indice segue
i filtri.

**Fascicoli** — `chooseCuts(info, every)`. Il taglio cade **solo** dove una
pagina apre un piano diverso da quello con cui si è chiusa la precedente: un
piano non finisce mai a cavallo. `every` (1–5, comando `#splitEvery`) dice
quanti piani per fascicolo: si taglia ogni `every` confini. Piani non multipli
di `every` → l'ultimo fascicolo è più sottile, e va bene. Due piani finiscono
insieme solo se **condividono un foglio** ("nuova pagina a ogni reparto"
spento). `partScope()` ricava albero/conteggi/ancoraggi del solo fascicolo:
copertina e indice di un fascicolo parlano di quello che contiene.

**Modalità libro** — quattro pagine per foglio piegato, quindi ogni fascicolo
(e il documento unico) ha un numero di pagine **multiplo di 4**. Struttura:

```
fm    = copertina + rovescio + pagine_indice   (+1 di pareggio se dispari)
corpo = pagine di schede + pagine extra vuote chieste
coda  = pagine di pareggio (schede vuote) + 1 pagina bianca
```

**Il pareggio si fa con pagine intere di schede vuote, non con pagine bianche.**
Bianca (`voidHTML`, `.page.void`, "pagina lasciata intenzionalmente bianca")
sono **due per fascicolo**: il rovescio della copertina (subito dopo, se c'è
una copertina — sempre, senza il suffisso "fine del...") e l'ultima pagina
(con "· fine del fascicolo k di N" / "· fine del documento", il segnale che il
fascicolo finisce lì). Solo il pareggio delle pagine iniziali (`fmPad`) resta
`{t:'free'}`: occupa lo stesso posto nel foglio piegato ma si può riempire.
Sulle pagine pari il numero passa al margine esterno (`.p-foot.rev`).

**Il giro fra numeri e pagine**: quante pagine occupa l'indice dipende dalle
voci, i numeri stampati dipendono dalle pagine iniziali, che dipendono
dall'indice. Il ciclo in `planDocument()` chiude il giro (2 passate bastano, il
limite di 5 è sicurezza). I fascicoli si risolvono in ordine.

**Pagine extra vuote** = pagine intere con schede vuote (`ffieldsHTML` +
`blankHTML`), piano/reparto/stanza a penna, stampabili anche **senza file
caricato**. Tre spunte indipendenti: `extraAtEnd` (fondo documento),
`extraPerPart` (fondo di ogni fascicolo), `extraWhole` (un fascicolo di sole
pagine vuote, con copertina e senza indice). Le ultime due valgono solo a
stampa divisa: restano in vista **disattivate** (`label.row.off`) invece di
sparire. Non stanno nella fila `pages` (`chooseCuts` le vedrebbe come materiale
da tagliare): `render()` prepara `freeCap`/`freeBody`, `planDocument()` le
colloca.

## 7. Comandi

`#side`: **1 File** (drag&drop; sotto i conteggi, note cliccabili → elenco
note, righe ignorate cliccabili) · **2 Intestazione** · **3 Impostazioni
stampa** · **Esporta** (`#exportGrp`, `position:sticky;bottom:0`).

Sotto i conteggi, **`#dropFile`** ("togli il file", `.xrow`) chiama
`unloadFile()`: rimette la schermata dell'apertura. Non basta `FULL=null` —
vanno azzerati anche albero, sua colonna, titolo, cantiere, `LAST_FILE_BASE` e
il **valore di `#file`**, altrimenti lo stesso file scelto due volte di
seguito non emette il cambiamento. Lo usa anche la guida per ritirare il suo
esempio.

**Schermata iniziale** (`#empty-state`) — non spiega piu' il formato delle
righe (serviva una volta, poi era arredamento): un invito che gira fra le
frasi di `HOOKS` (dissolvenza ogni 7s, ferma con "riduci le animazioni", ferma
anche quando ci sono pagine in anteprima) e le due sole cose da fare,
`#pickFile` e `#startTutorial`. Il secondo dice "Avvia" o "Rivedi" secondo
`vrsSchedeCampo.tourSeen` (`syncTutorialBtn`).

**2 Intestazione** — il titolo si autocompila con la prima cella del foglio
(se non contiene `PIANO:`), altrimenti con il nome del file. La spunta
`#titleFromName` (`label.tick`, casella quadrata: non accende un
comportamento della stampa, dice **da dove viene** il testo del campo sopra)
fissa la scelta sul nome del file: `applyTitleSource()` mette il valore, il
campo va in `readOnly` + `.locked` (bordo tratteggiato) e il segnaposto
cambia. Spegnendola torna `MANUAL_TITLE`, quello che c'era scritto prima.
È un'**impostazione salvata** (`FACTORY_DEFAULTS`/`BOOL_KEYS`), non il
titolo: titolo e cantiere restano legati al documento e non si salvano.

**3 Impostazioni stampa** — cinque riquadri `.optgrp`, non un elenco di
interruttori: *Schede nella pagina* (densità, riempimento) · *Piani, reparti
e stanze* (i due salti pagina + pagina finale per stanza) · *Pagine iniziali*
(copertina, indice) · *Rilegatura* (modalità libro, divisione in fascicoli e,
annidato, `#splitEvery`) · *Pagine extra vuote*. Poi le icone
salva/importa/ripristina. Un riquadro dentro un riquadro non ha bordo
proprio: `.optgrp .optgrp` si stacca con un filo in alto, altrimenti
sarebbero scatole dentro scatole.

`#treecol`: **4 Cosa stampare**. Due comandi per riga, due gesti distinti:
il **cerchio** include/esclude, il **nome** salta alla pagina nell'anteprima.
Il cerchio (non il quadrato: quello è per i moduli) ha tre stati — pieno,
vuoto, trattino. La struttura è un **binario verticale per ramo** (bordo
sinistro di `.sub`), che si accende (`.lit`) quando dentro il ramo c'è
qualcosa da stampare; le righe escluse prendono `.out` e sbiadiscono.
`syncTree()` è l'**unico** posto dove si decide lo stato: conta dal basso
(decidono le stanze), i contenitori si ricavano con `rollUp()` e "in parte"
risale. `onchange` propaga solo **verso il basso**. La colonna compare a file
caricato (`showTreeCol()`).

**Interruttore vs spunta**: interruttore (`label.row.sw`, bordo destro della
riga) accende un comportamento della stampa; il cerchio dell'albero scegle un
elemento da un elenco. Nessuno dei due è la casella del browser.

**Tutorial guidato** — tastino `#tourBtn` (punto di domanda) accanto a
`#themeSeg`: sono i due comandi che riguardano l'applicazione e non il
documento. Parte da solo al primo utilizzo; il ricordo sta in
`vrsSchedeCampo.tourSeen`, chiave propria come il tema — **non** in
`FACTORY_DEFAULTS`. Vedi punto 11.

**Giorno e notte** — `#themeSeg` a tre stati (segui il sistema / chiaro /
scuro). `data-theme` sulla radice dice *quale* è scelta (muove l'indicatore);
la classe **`.lt`** dice *quale tavolozza è accesa* ed è l'unica cosa che il
CSS guarda. La tavolozza chiara sta scritta una volta sola in `:root.lt`:
cambia il **valore** dei token `--ui-*`/`--acc*`/`--rail*`, non il nome.
Il tema **non sta in `FACTORY_DEFAULTS`** (vive in `vrsSchedeCampo.theme`):
messo lì, `applySettings(DEFAULTS)` all'apertura e "ripristina impostazioni di
fabbrica" cancellavano la scelta. `readSettings()` lo esporta comunque,
`applySettings()` lo applica solo se il file ne porta uno.

Impostazioni predefinite in `localStorage` (`LS_KEY`) + copia su file JSON.
Aggiungere un'impostazione = toccare `FACTORY_DEFAULTS`, `BOOL_KEYS`/`NUM_KEYS`,
`readSettings`, `applySettings`, `sanitizeSettings` e la lista dei listener.
`sanitizeSettings` converte i nomi vecchi (`extraBlank*` → `extraAtEnd*`).

## 8. Il foglio non ha tema — e come si rompe

I token del foglio A4 (`--brand`, `--ink`, `--card-h`, …) sono **identici nei
due temi**: sarà stampato bianco comunque. L'unica differenza a video è l'ombra
della pagina sul piano di lavoro (dentro `@media screen`, assente in stampa).

**Trappola vera, già capitata**: il comando del tema usava `class="seg"` e
`.seg` nel foglio è il `(segue)` della briciola (`.p-head .crumb .seg`). Le
regole dell'app finivano addosso a una parola del documento, che si ritrovava
in un riquadro con i colori del tema. Ora il comando si aggancia a `#themeSeg`.
**Regola: le regole dell'app si agganciano a un ID o a una classe con prefisso
d'app; mai a una classe corta che potrebbe ricapitare in una pagina.**
Verifica rapida: fotografare i `getComputedStyle` di `#pages .page, #pages *`
in tema chiaro e scuro e confrontare — deve differire solo il `box-shadow`.

`[hidden]{display:none!important}` in cima al CSS: l'attributo `hidden` ha
specificità bassissima e qualunque `display` di classe lo scavalca. Senza,
`.part-strip` (`display:flex`) restava visibile da vuota — un riquadro
fluttuante che non rispondeva ai clic — e la riga "Stampa" (`label.row`)
compariva prima di avere fascicoli.

## 9. Provare una modifica

```bash
cd "C:/Users/utente27/Desktop/Claude/exel pdf converter" && python -m http.server 8731
```

`http://127.0.0.1:8731/Schede-Tecnici-Generatore.html`, **Ctrl+F5** (la cache
fa sembrare che la modifica non abbia effetto). Il doppio clic sul file funziona
ma su `file://` alcuni browser bloccano il fetch dei file di prova.

Caricare un file di prova da automazione senza input file:

```js
const r=await fetch('/mappature/rizzato.xls');
readFile(new File([await r.arrayBuffer()],'rizzato.xls'));
```

File in `..\mappature\` — **ricontrollare questi numeri dopo ogni modifica al
parsing**:

| file | tracciato | componenti | note | piani |
|---|---|---|---|---|
| `CASA DI RIPOSO UMBERTO I.XLS` | A, col. B | 143 | 2 | 6 |
| `CONGREGAZIONE … CASA GEROSA.XLS` | B, col. C | 178 | 3 | 4 |
| `rizzato.xls` | B, col. C | 23 | 0 | 2 |

(`PRO SERVICE.XLS`, 35 componenti / 6 note, citato da sessioni passate, non e'
piu' in queste cartelle.)

## 10. Trappole

- **Copie vecchie**: in `Downloads` ci sono `Schede-Tecnici-Generatore_N.html`
  di versioni passate. La versione buona è **solo** quella in questa cartella
- **Modifiche in parallelo**: il file è già stato toccato da due sessioni nello
  stesso quarto d'ora. Prima: `stat -c '%y' Schede-Tecnici-Generatore.html`
- **Fine riga**: il file ha avuto sia CRLF sia LF. Conservare quella presente
  (leggere e riscrivere con `newline=''`), altrimenti il diff diventa illeggibile
- **`\\` negli heredoc**: patchando con `python - <<'EOF'` la sequenza `\\'`
  arriva a Python già come `\'` e produce JS rotto. Costruire gli escape con
  `chr(92)` o scrivere lo script su file
- **Una scheda non è il suo codice**: nelle mappature lo stesso codice compare
  decine di volte. Per verificare una nota cercare la **posizione** (es.
  `0000084397`)
- `patch-note-operatore.py` e `patch.py` sono avanzi di interventi già
  applicati: non servono al funzionamento

## 11. Tutorial guidato

`TOUR_STEPS` — 17 passi, ognuno `{sel, title, tx, place, pad, note, off}`.
Il bersaglio si indica per **selettore**, non per posizione: un comando che si
sposta nel pannello se lo porta dietro. `sel` a elenco = il primo che si vede
davvero (`['#zoomwrap','#empty-state']`).

Un elemento e' "visibile" se `getClientRects()` ne restituisce uno più grande di
8px: **non** `offsetParent`, che e' `null` anche per la barra di scorrimento e
lo scaffale (`position:fixed`) quando invece si vedono. La soglia serve a
`#zoomwrap`, che esiste sempre ma senza pagine e' alto zero.

**Bersaglio assente → il passo resta.** Colonna albero, barra e scaffale
compaiono solo a file caricato (e spariscono anche da `.cramped`, a margine
insufficiente); il
fumetto va al centro e la nota `off` dice quando comparirà. Alla prima apertura
non c'e' nessun file, ed e' proprio allora che la guida parte da sola: saltare
quei passi vorrebbe dire non spiegarli mai.

La penombra e' l'**ombra smisurata** di `#tourHole` (`box-shadow` con spread
9999px), un elemento solo invece di quattro fasce da far combaciare. Nei passi
senza bersaglio il buco si annulla **al centro dello schermo**, non fuori campo:
l'ombra si espande dai bordi del riquadro, quindi a `-9999px` lascerebbe
scoperto tutto lo schermo (già capitato). I clic li ferma `#tourVeil`, che sta
sotto: `#tourHole` ha `pointer-events:none`.

**L'esempio della guida** — `TOUR_DEMO_ROWS`: quindici componenti su due
piani, tre reparti, sei stanze, tre note, tracciato B (etichetta in B, nota in
C). `tourDemoOn()` lo carica **solo se non c'e' niente di caricato** — con un
file vero la guida si spiega su quello — e intanto accende `splitParts`, per
poter mostrare lo scaffale; `tourDemoOff()` disfa tutto alla chiusura. Passa
dallo stesso `loadRows()` di un file vero: nessuna strada di servizio, quindi
quello che si vede nella guida e' quello che fa l'app.

Un file vero caricato mentre la guida e' aperta (si può: il velo ferma i clic,
non il trascinamento) spegne `TOUR_DEMO` dentro `readFile` — altrimenti la
chiusura della guida si porterebbe via il file dell'utente. `splitParts` torna
comunque al valore di prima: l'aveva acceso la guida.

`tourPlace()` prova i lati nell'ordine chiesto da `place`
(`right` predefinito, `left`, `below`, `above`), poi il centro, e comunque
serra il fumetto dentro lo schermo. Rifatta a ogni scorrimento (listener in
**capture** su `window`, come lo scaffale: il pannello ha la sua barra) e a ogni
resize. `tourGo()` porta il bersaglio in vista con `scrollToEl(el,true)` prima
di misurarlo.

Tasti: `Esc` chiude, frecce e PagSu/PagGiu scorrono i passi.

Aggiungere un passo = una voce in `TOUR_STEPS`. Aggiungere un comando che il
passo deve indicare = dargli un **id** (per questo `#fileGrp`, `#headGrp`,
`#setGrp`, `#optDens`, `#optFloors`, `#optFront`, `#optBind`, `#setIcons`).

## 12. Barra di scorrimento e scaffale: i due margini

**Lo scaffale dei fascicoli sta nel margine sinistro** (verso `#side`), **la
barra di scorrimento nel margine destro** (verso `#treecol`) — scambiati
rispetto a prima. Stessa meccanica per entrambi: `position:fixed` sopra la
colonna `#main`, non sticky (vedi il commento sopra `.part-strip` nel foglio
di stile per il perche' del fixed), riposizionati da `positionPartStrip()` /
`positionDocScroll()` a ogni resize di `#main` (`ResizeObserver`) e ad ogni
zoom (`applyZoom`).

**La barra ha sostituito la mappa a miniature** (colonna di cloni delle
pagine, sfocati, che mostrava il documento intero senza scorrere). La mappa
richiedeva un budget di spazio per colonne di miniature (`mmSpace`/`mmFit`,
~180 righe) e spariva sotto una certa larghezza di margine; la barra è un
cursore solo — nessun clone di pagina da rifare a ogni render, nessuna soglia
di colonne — quindi il margine minimo per starci è molto più piccolo (`.slim`
non serve più: sotto ~22px di margine (`positionDocScroll`, soglia `22`) si
nasconde del tutto invece di restringersi, ma ci arriva raramente).

`updateDocScroll()` legge **solo** `scrollHeight`/`clientHeight`/`scrollTop`
di chi scorre davvero (`scrollBox(pagesEl)`, la stessa usata da `scrollToEl`):
nessun conto sullo zoom, perché `#zoomwrap` è già ridimensionato alla scala
vera (vedi `applyZoom`) e quei valori la contengono già. Altezza del cursore =
frazione di pagina visibile (`clientHeight/scrollHeight`, minimo 30px);
posizione = frazione già scorsa (`scrollTop/range`).

Clic e trascinamento (`docScrollHit`) convertono il punto toccato sulla
traccia in una frazione e la applicano **direttamente a `scrollTop`** — un
salto secco, come `scrollToEl` fa per lo scaffale e l'albero, non uno
scorrimento animato.

**La bolla con il numero di pagina segue il cursore**, non il centro della
traccia: `updateDocScroll()` le mette lo stesso `top` (via JS, non CSS) del
centro del cursore. Fissarla al centro della traccia (un `top:50%` in CSS,
come sembrerebbe naturale) la lascia ferma a metà mentre il cursore si sposta
— su un documento lungo il cursore passa gran parte del tempo vicino a un
bordo, mai a metà: e' un difetto gia' capitato e corretto in questa stessa
sessione, non un'ipotesi.

Il numero di pagina mostrato è una **stima** (`1 + frac*(n-1)`), non la pagina
esatta sotto il cursore: leggere il DOM per la pagina vera (come faceva la
vecchia mappa con `MM_TOPS`/`MM_HS`) vorrebbe dire un `getBoundingClientRect`
per pagina a ogni scroll, un costo che la mappa pagava perché mostrava anche
le miniature — la barra no, quindi non lo paga nemmeno per il numero.

---

# Registro (dal più recente, solo cosa è cambiato)

### 2026-09-04 — barra di scorrimento al posto della mappa, margini scambiati
- **Via la mappa a miniature** (`#miniMap`, `buildMiniMap`/`mmFit`/`mmSpace`/
  `mmFreeMargin`/`positionMiniMap`/`updateMiniView`/`mmHit`/`mmScrubTo`, le
  variabili `MM_*`, le classi `.mini-map`/`.mm-*`): rimossa per intero, non
  disattivata. Al suo posto **`#docScroll`**, una barra di scorrimento
  disegnata (punto 12) — un cursore verticale (traccia + thumb con gradiente
  sui toni di `--acc`, si allarga al passaggio del mouse e in trascinamento,
  bolla col numero di pagina) che legge `scrollHeight`/`scrollTop` invece di
  clonare le pagine
- **Margini scambiati**: lo scaffale dei fascicoli (`#partStrip`) ora sta nel
  margine **sinistro** (verso `#side`), la barra nel margine **destro** (verso
  `#treecol`) — l'opposto di prima. `positionPartStrip()` ora calcola il
  margine da `wrap.left - main.left` e scrive `style.left` (prima l'inverso);
  `positionDocScroll()` (nuova) prende la formula che prima aveva
  `positionPartStrip()`
- Tutti i richiami nei punti di aggiornamento (`ResizeObserver` su `#main`,
  listener di scroll in capture, fine di `render()`, `applyZoom()`) passati da
  `scheduleMiniMap`/`positionMiniMap`/`updateMiniView` a
  `positionDocScroll`/`updateDocScroll` — diretti, senza il debounce a 90ms
  della mappa: non ci sono più cloni da rifare, quindi non c'è più nulla da
  rimandare
- Passi guida `#miniMap`→`#docScroll` e `#partStrip` aggiornati (testo, `sel`,
  `place`, entrambi gli `off`) alla nuova posizione
- Verificato su `rizzato.xls` (20 pagine) e `CASA DI RIPOSO UMBERTO I` (128
  pagine, 6 fascicoli con `splitParts`): scaffale a sinistra e barra a destra
  presenti insieme, `positionDocScroll`/`positionPartStrip` corretti a
  finestra larga e a zoom ridotto; clic sulla traccia salta alla frazione
  giusta (70% della traccia → pagina 91 di 128); clic sui dorsi dello scaffale
  salta al fascicolo giusto e aggiorna `.active`; bolla della pagina allineata
  al cursore (non al centro della traccia — bug trovato e corretto in questa
  sessione, vedi punto 12); entrambi spariscono sotto gli 980px (media
  query) e in stampa; tema chiaro e scuro; console pulita

### 2026-09-04 — mappa intera, togli il file, schermata iniziale
- **Mappa**: niente scorrimento, ci sta il documento intero (punto 12).
  `mmSpace`/`mmFit`, colonne per ritorno a capo del flex, `.slim`, soglia
  `MM_USE_W`, pagine accese al posto del riquadro, clic per pagina, sfocatura
  in classe. Corretto il caso segnalato: accendendo *pagina finale per stanza*
  (56 → 96 pagine) la mappa spariva
- `tourVis`: la soglia sulla **larghezza** faceva sparire `#sidegrip` (largo
  esattamente 8px) e il **passo 11** finiva al centro senza bersaglio. Ora la
  soglia è solo sull'altezza (serve a `#zoomwrap` vuoto, alto zero)
- `unloadFile()` + `#dropFile`: si può togliere il file caricato. La guida la
  riusa per ritirare il suo esempio
- Schermata iniziale rifatta: `HOOKS` che girano, `#pickFile` e
  `#startTutorial` ("Avvia"/"Rivedi"). Via la spiegazione del formato delle
  righe e il CSS di `.sample`
- `#brandbar h1{min-width:0}` + `gap:10px`: la sottodicitura va a capo fra le
  parole (spezzarle dava "GENERA TORE") e la riga del marchio non sfonda da
  300 a 520px di pannello
- Verificato su `CASA DI RIPOSO UMBERTO I` (96 pagine, 143 componenti): mappa
  visibile con l'opzione per stanza accesa e spenta a ogni zoom, 4-5 colonne,
  clic sulla miniatura 91 → anteprima alla pagina 90-91, pagine accese che
  seguono lo scorrimento; ciclo carica → togli → ricarica lo stesso file
  (96 pagine, 143 componenti, titolo, niente ereditato); guida completa con
  passo 11 sulla maniglia; foglio identico nei due temi tranne il
  `box-shadow` (4001 elementi, 37 differenze, tutte di ombra); console pulita

### 2026-09-04 — la guida si porta un esempio
- `readFile` spaccata in due: `loadRows(rows,name,label)` fa tutto quello che
  veniva dopo il parsing (modello, riquadro informazioni, titolo, albero,
  filtro), `readFile` legge i byte e la chiama. `label` è la prima riga del
  riquadro: di regola il nome del file
- `TOUR_DEMO_ROWS` + `tourDemoOn`/`tourDemoOff`: senza file caricato la guida
  carica quindici componenti d'esempio (2 piani, 3 reparti, 6 stanze, 3 note,
  tracciato B) e accende `splitParts`; alla chiusura toglie tutto e rimette
  l'interruttore come era. Con un file vero caricato non tocca niente
- `readFile` spegne `TOUR_DEMO`: un file trascinato mentre la guida è aperta
  (il velo ferma i clic, non il trascinamento) non deve sparire alla chiusura
- Verificato: esempio caricato all'apertura automatica (15 componenti, 2 piani,
  3 note, colonna C, 0 righe ignorate, 2 fascicoli), punto 4 e scaffale con
  bersaglio vero; a guida chiusa la schermata iniziale torna identica
  (`FULL`/`DATA` nulli, albero nascosto, stampa disabilitata, `splitParts`
  rimesso); con `rizzato.xls` già caricato la guida non carica l'esempio e non
  si porta via niente; file trascinato a guida aperta → resta. Parsing
  invariato: `rizzato.xls` 23/0/colonna C, `CASA DI RIPOSO UMBERTO I` 143/2/6
  colonna B, `CASA GEROSA` 178/3/4 colonna C

### 2026-09-04 — tutorial guidato
- Nuova sezione `TUTORIAL GUIDATO` (CSS + JS) e punto 11 di questo file: 17
  passi con fumetto appoggiato ai comandi veri, il resto in penombra
- `#tourBtn` nella riga del marchio; partenza automatica al primo utilizzo
  (`vrsSchedeCampo.tourSeen`, chiave propria come il tema)
- Id aggiunti solo per poter indicare i riquadri: `#fileGrp`, `#headGrp`,
  `#setGrp`, `#optDens`, `#optFloors`, `#optFront`, `#optBind`, `#setIcons`
- `#brandbar h1{min-width:0}` + `overflow-wrap:anywhere` sulla sottodicitura:
  con un comando in più in quella riga, alla misura minima del pannello (300px)
  un elemento flex non scendeva sotto il suo contenuto minimo e il comando del
  tema finiva fuori dal pannello
- `#tourWrap` aggiunto alla riga di `@media print` che nasconde l'app
- Verificato su `rizzato.xls` (23 componenti / 0 note / colonna C): tutti e 17
  i passi a file caricato e senza file, i tre passi senza bersaglio con la loro
  nota, riapertura dal tastino, nessuna partenza automatica alla seconda
  apertura, tema chiaro e scuro; `#brandbar` senza sfondamento da 300 a 520px;
  foglio identico nei due temi tranne il `box-shadow` (1889 elementi
  confrontati, 20 differenze, tutte di ombra)

### 2026-09-04 — rovescio della copertina sempre bianco
- In modalità libro il rovescio della copertina (`p.lead` in `planDocument`)
  non è più una pagina di schede vuote compilabili (`{t:'free'}`): è una
  pagina dichiarata bianca (`{t:'void'}`, `voidHTML` senza `tail`), come
  l'ultima del fascicolo ma senza il suffisso "fine del..."
- Statistiche (`updatePrint`/riga `#stat`): `nBlank`/`po.nBlank` non contano
  più le schede del rovescio (non ce ne sono); `nFree` ("pagine da
  compilare") non lo include più; `nVoid` ("pagine bianche") ora somma
  `lead+tail`, quindi due bianche per fascicolo invece di una. `nFront`
  ("pagine iniziali") lo conta ancora: resta posizionato prima dell'indice
- Fuori dalla modalità libro non cambia nulla: il rovescio esiste solo a
  libretto (fogli piegati), come prima
- Verificato su `rizzato.xls`: pagina 2 = void senza suffisso subito dopo la
  copertina, sia a documento unico (2 bianche/20 pagine) sia a 2 fascicoli (4
  bianche/28 pagine, una coppia lead+tail per fascicolo); senza modalità
  libro pagina 2 torna a essere l'indice, nessuna bianca extra

### 2026-09-03 — titolo dal nome del file, impostazioni a riquadri, mappa
- `#titleFromName` sotto il campo titolo (`label.tick` + `input.locked`),
  `applyTitleSource`/`MANUAL_TITLE`/`LAST_FILE_BASE`; salvata con le altre
- Le dieci righe sciolte del punto 3 in cinque `.optgrp`; `#splitOpts`
  annidato dentro *Rilegatura* con un filo invece di un secondo bordo
- **Mappa del documento** `#miniMap`: colonna di cloni delle pagine larghi
  54px, sfocati, nel margine libero a **sinistra** dell'anteprima (lo
  scaffale dei fascicoli sta a destra: due domande diverse, due margini).
  `buildMiniMap` (rifatta a `scheduleMiniMap`, 90ms, perché `render()` gira a
  ogni battuta sul titolo) · `positionMiniMap` come `positionPartStrip`, con
  `.cramped` = sparisce se il margine non basta · `updateMiniView` porta la
  proporzione di `#pages` visibile sul riquadro `.mm-view` · `mmScrubTo`
  per clic e trascinamento (il punto toccato diventa il centro della vista).
  La sfocatura sta su **ogni** `.mm-p`, non sulla fila: un filtro solo su
  7500px di cloni fa rasterizzare tutto insieme. `content-visibility:auto`
  toglie dal disegno le miniature fuori dalla finestrella; oltre 200 pagine
  (`MM_MAX`) niente cloni, restano i rettangoli
- Verificato su `CASA DI RIPOSO UMBERTO I.XLS` (96 pagine): il riquadro
  della mappa indica la stessa pagina che sta in cima all'anteprima allo
  0/20/50/80/97% del documento; clic a metà mappa → pagina 47 di 96;
  `rizzato.xls` 23 componenti / 0 note / colonna C; round-trip impostazioni

### 2026-09-03 — fascicoli ×N, pareggio compilabile, albero a cerchi
- `chooseCuts(info,every)`: `every` piani per fascicolo (1–5), comando
  segmentato `#splitEvery` + `getSplitEvery`/`setSplitEvery`; impostazione
  `splitEvery` salvata (file vecchi → `'1'`)
- Modalità libro: il pareggio al multiplo di 4 usa **pagine intere di schede
  vuote** (`{t:'free'}`); resta bianca **solo l'ultima pagina** di ogni
  fascicolo. Rovescio della copertina e pareggio delle iniziali sono `free`.
  `po.tailFree`, `po.nBlank` calcolati dopo il ciclo dell'indice; riepilogo con
  la voce "pagine da compilare"
- Albero: cerchi a tre stati invece delle caselle quadrate, binario `.sub`/`.lit`
  per ramo, righe `.out` sbiadite, stato in un solo posto (`syncTree`+`treeRollUp`,
  "in parte" risale, propagazione solo verso il basso). Via `syncMaster`
- `#themeSeg` invece di `.seg`: la classe collideva con il `(segue)` del foglio
- `[hidden]{display:none!important}`: `.part-strip` vuota non fluttua più
- Verificato su `CASA DI RIPOSO UMBERTO I.XLS`: ×1→6 fascicoli 12/16/32/48/12/8,
  ×2→3 (20/76/16), ×3→2 (44/56), ×4→2 (88/16), ×5→2 (96/8), tutti multipli di 4,
  una bianca ciascuno, struttura `C F I F S…S F… _`, 57 voci d'indice tutte
  giuste; solo pagine extra senza file → 8 pagine `CFFFFFF_`; round-trip
  impostazioni; foglio identico nei due temi tranne l'ombra della pagina

### 2026-09-03 — fascicoli per piano, multipli di 4, giorno e notte
- Divisione a numero (`splitN`, `fillSplitOptions`) sostituita dal taglio ai
  confini di piano; via l'avviso "si ottengono solo N fascicoli"
- Pagine extra vuote da una voce sola a tre spunte indipendenti
  (`extraAtEnd`/`extraPerPart`/`extraWhole`), collocate da `planDocument`
- Tema chiaro/scuro/sistema; interruttori e spunte disegnati nel file
- Riepilogo con "pagine iniziali" e "pagine bianche" separate

### 2026-09-03 — banco di lavoro scuro, scaffale laterale dei fascicoli
- App su superfici scure con token `--ui-*`/`--acc*` separati da quelli del
  foglio; documento invariato
- Miniature dei fascicoli da fascia orizzontale a **scaffale verticale**
  `position:fixed` sul bordo destro di `#main` (`positionPartStrip` da un
  `ResizeObserver`), forma `.tight` da 30px quando il margine non basta.
  Rimossi `#partStripSpacer` e `syncPartStripSpace`
- Ombre delle pagine dentro `@media screen` (nessun `!important` da ricordare);
  in `@media print` aggiunti `#app{background:#fff}` e `body{color:var(--ink)}`
- "parte" → "fascicolo" in tutto il testo utente (identificatori invariati)

### 2026-09-03 — copertina, indice, colonna albero
- Copertina e indice come pagine iniziali costruite in `planDocument`
- Punto 4 spostato in una colonna propria `#treecol` con maniglia, altezza
  piena e scorrimento interno
- `ixPlan` con `IX_ATTEMPTS`: prima tutte le forme complete, poi la rinuncia
  alle stanze

### 2026-09-03 — parsing note deterministico
- `findNoteCol`: `Tipo di dato` come criterio primario + verifica sui dati per
  scartare la colonna-etichetta; **nessun ripiego** su altre colonne
- Lettera della colonna mostrata nel pannello, avviso se nessuna riconosciuta

### 2026-09-03 — descrizioni lunghe
- `fitDescriptions` confronta `scrollHeight`/`clientHeight` e stringe il font
  scheda per scheda fino a 7,5px
