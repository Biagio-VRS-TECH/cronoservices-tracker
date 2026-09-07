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
        data-s="0|1" data-c="0|1" data-k="0|1" data-r="0|1">  <!-- i 4 passi -->
  <i class="seg s"></i><i class="seg c"></i><i class="seg k"></i><i class="seg r"></i>
</button>
```

I segmenti sono pilotati **dal CSS** (`.cella[data-s="1"] .seg.s { transform:none }`):
il JS cambia solo gli attributi, l'animazione e' gratis.
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

## Barra strumenti e azioni

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
legge, e il dato **scritto** accanto alla forma. La prima carta e' un numero
grande (percentuale di mappature complete) piu' quattro tessere.

La pagina ha tre piani, in quest'ordine (8a sessione):

1. la carta **eroe**: il numero grande + le quattro tessere;
2. la fascia dei **tre quadranti** (`.quadranti`, tre carte uguali): le tre
   domande a cui si risponde in un secondo. Le prime due erano le torte della
   vista Controlli, che non esiste piu' ([decisioni.md](decisioni.md) 15c);
3. la **griglia delle carte** (`.stat-griglia`), dove le prime due sono a tutta
   larghezza.

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
   etichetta "cliente — destinazione", la pista sono i suoi `PASSI` (piena = a
   posto per l'anno), tinta sola `--completa`, a destra lo stato a parole. Ci
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
2. **A che punto siamo, mese per mese**: una colonna per mese, alta quanto le
   mappature che scadono la', **divisa per quanti dei `PASSI` passi hanno**
   (`isto[k]`), impilata dal basso col piu' completo in fondo. Rampa sequenziale
   `--pr-0..--pr-4`. Ogni mappatura pesa su **un mese solo**, quello della
   scadenza: la somma delle colonne e' il totale dovuto. Bottone "Tutti i
   clienti" quando c'e' un cliente aperto.

Poi, nella griglia: **Andamento cumulato**, **I `PASSI` passi**, **Mappature per
provincia**, e due carte nate alla 8a sessione:

- **Da quanto sono scadute**: l'elenco dei siti dice *quali* sono in ritardo,
  questa dice da *quanto*, che e' l'informazione con cui si decide da dove
  ripartire. Barra parte-su-tutto (`stack()`) su quattro bin — entro 1 mese, 2-3,
  4-6, oltre 6. I bin sono **ordinati**, quindi la tinta e' una rampa
  sequenziale di un tono solo, l'ambra dell'arretrato (`--ar-1..--ar-4`,
  validata: chiarezza monotona, gradi vicini separati in CVD). Se non c'e'
  arretrato la carta lo dice a parole e non disegna niente;
- **Chi mette le spunte**: barre a una tinta per operatore, piu' quante
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
  leggere il dato. L'unica eccezione sono i tre quadranti, dove la legenda porta
  gia' parola, numero e percentuale di ogni spicchio;
- i bin ordinati (l'anzianita' dell'arretrato) prendono una rampa sequenziale di
  UN tono; le categorie senza ordine naturale (province, operatori) prendono
  **una tinta sola**, mai un valore-rampa;
- 2px di superficie fra i segmenti della barra parte-su-tutto;
- un solo tooltip per tutta la vista, delegato su `data-tip`.

Il grafico dell'andamento cumulato e' l'unico SVG: `viewBox` fisso, larghezza
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
