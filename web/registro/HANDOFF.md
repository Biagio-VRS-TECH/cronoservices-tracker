# Registro dei componenti — consegne

Generatore del **Registro dei componenti**: l'export `.xls` del gestionale
diventa un libretto A4 per il cliente (copertina, sommario con i numeri di
pagina, quadro d'insieme, una sezione per piano, legenda), più una versione
digitale HTML con ricerca e due file di uso interno (anomalie, dati).

È il porting nel browser del programma Python in
`C:\Users\utente27\Desktop\Claude\mappatura`. **Le regole del documento sono
decisioni del committente**: stanno nel `README.md` di quella cartella e non si
cambiano per comodità di impaginazione.

Vive nella stessa origine del tracker e del generatore di schede: stesso guscio,
stesso ponte (`web/js/ponte.js`), stesso tema, stesse librerie in `/lib/`.
Niente npm, niente build, niente CDN.

---

## 1. Mappa dei file

| file | contenuto |
|---|---|
| `index.html` | il guscio (`#app` / `#side` / `#main` / `#ponte` / `#banco`), i due pannelli, le due viste, `setTheme` |
| `registro.js` | **nessun DOM**: `leggiExport` (SheetJS) e `costruisciRegistro` (ordinamenti, legenda, quadro, 8 famiglie di anomalie, controlli), più `testoAnomalie` e `registroInDict` |
| `impagina.js` | il registro diventa `div.page` da 210×297mm dentro `#pages`; e `htmlDigitale` |
| `registro.css` | due sezioni: **APPLICAZIONE** (token condivisi) e **DOCUMENTO** (la carta), separate da due segnalibri |
| `app.js` | incolla tutto: file → dizionario → registro → pagine → pannelli → ponte |

Corrispondenza col Python: `registro.js` = `registro/lettura.py` +
`registro/modello.py`; `impagina.js` + la sezione DOCUMENTO del CSS =
`templates/registro.html` + `registro/pdf.py`; `app.js` + `index.html` =
`templates/app.html` + `app.py`. Le parole dei locali tecnici di
`dati/regole.json` sono la costante `PAROLE_TECNICI` in `registro.js`.

Il **dizionario dei nomi** non è più un file JSON locale: è il database del
tracker, `GET`/`POST /api/dizionario` (`#ANCHOR: dizionario` in `app/api.py`).
Si rilegge al `visibilitychange`, così il nome cambiato da un collega entra nel
documento senza ricaricare.

## 2. L'impaginazione (il pezzo nuovo)

Nel Python impaginava Chromium. Qui il PDF lo fanno html2canvas + jsPDF, che
**fotografano** elementi `.page`: nessuno spezza le tabelle al posto nostro.

Quattro mosse, tutte in `impagina()`:

1. **una costruzione sola.** Tutto il documento finisce in un contenitore di
   misura fuori schermo (`.page.misura`), largo quanto l'area utile
   (210 − 16 − 16 = **178mm**), con lo stesso CSS delle pagine vere: un
   `innerHTML`, un calcolo di layout;
2. **una lettura sola.** Si leggono le altezze di ogni **unità atomica** senza
   scrivere niente in mezzo (un reflow, non diecimila). Le unità sono la
   copertina, i blocchi `[data-u=blocco]` e ogni `tbody` delle tabelle — **un
   tbody è una stanza**, ed è per questo che una stanza non si spezza mai;
3. **impacchettamento** per altezza (area utile 297 − 16 − 19 = **262mm**). Le
   unità *legate* (`data-lega`) passano di pagina insieme: titolo + prima riga,
   fascia del piano + primo reparto. Le sezioni (`data-nuova`) aprono sempre
   pagina nuova. Aprire una tabella costa `thead` + il suo `margin-top`
   (lo "stacco"), e quel costo si paga di nuovo a ogni riapertura;
4. **gli stessi nodi** misurati vengono *spostati* nelle pagine, non
   ricostruiti: l'altezza impaginata è per forza quella misurata.

I **numeri di pagina** del sommario si scrivono dopo: nella cella c'è già uno
spazio-cifra (U+2007) e la colonna è a larghezza fissa con `nowrap`, quindi
scrivere il numero non muove niente — niente seconda passata come nel Python.
Il **piè di pagina** si appende a ogni pagina tranne la copertina; la copertina
è l'unica pagina senza margini e porta il totale delle pagine.

Quando un reparto continua, la testata si ripete con **"(segue)"**
(`thead.continua`).

## 3. Le trappole (tutte già pagate)

- **niente margini nelle unità misurate.** `getBoundingClientRect()` non
  comprende i margini, e un margine che collassa fuori dal blocco non entra in
  nessuna somma: le pagine sfondavano. Ogni `[data-u=blocco]` è `display:
  flow-root` (così i margini dei figli restano dentro l'altezza misurata) e lo
  stacco fra le tabelle è un `margin-top` della **tabella**, contato una volta
  sola insieme all'intestazione;
- **`display:none` misura zero.** Rigenerando il documento con la scheda "Nomi
  dei componenti" aperta, `#vistaAnteprima` è `hidden` e tutto misurava 0: 178
  componenti si impaginavano in 6 pagine invece di 12. `impagina()` riapre gli
  antenati nascosti per il tempo della misura (è tutto sincrono: non si vede
  niente) e li richiude in un `finally`;
- **html2canvas non sa leggere `color()`.** In tema chiaro `css/banco.css`
  calcola `--ui-0` con `color-mix()`, e Chrome lo restituisce come
  `color(srgb …)`: la resa del PDF moriva con *"unsupported color function
  color"* prima di disegnare la prima pagina, perché html2canvas legge il fondo
  di `<body>` e di `#app` anche quando deve fotografare solo una `.page`. Qui
  quei due usano `--fondo-banco`, le stesse tinte in esadecimale.
  **`web/schede/index.html` ha ancora la regola vecchia** (`background:
  var(--ui-0)` su `body` e `#app`): il difetto è lì, e si vede solo a tema
  chiaro;
- **`display:flex` su una cella di tabella** la butta fuori dal contesto
  tabellare: la barra del reparto e la riga del componente hanno un `div`
  dentro il `th`/`td`, come nel template Python;
- **`*/` dentro un commento JS** lo chiude. Un commento che citava il
  terminatore di commento ha rotto tutto il modulo: `node --check` dice subito
  dove;
- **`table-layout: fixed` ovunque**, anche nel quadro d'insieme: col layout
  automatico una riga misurata in una tabella con 200 righe cambia altezza
  quando finisce in una tabella con 3. Le larghezze del quadro si calcolano in
  `misureQuadro()`: la colonna "Totale" si misura sulla **parola**, non sui
  numeri (a 13mm usciva dal foglio).

## 4. La versione digitale HTML

`htmlDigitale(reg)` riusa lo **stesso markup** del documento stampato, senza
impaginazione, e rilegge il CSS del documento da `registro.css` fra i due
segnalibri `==== DOCUMENTO INIZIO/FINE ====`, sostituendo `#pages .page` con
`.doc`: una fonte sola, niente doppioni che divergono. I segnalibri sono
l'**apertura** di due commenti, non due commenti interi. Il logo viene
incorporato come `data:` URI, quindi il file è autonomo.

## 5. Il ponte

`avviaPonte({ tipo: 'registro', … })`. Profilo `registro` in `web/js/ponte.js`:
`documenti.tipo = 'registro'` e **nessuna spunta** — è un documento per il
cliente, non un passo della mappatura. Il nome del PDF è
`Registro componenti - <sito o cliente> - <data ISO>.pdf`.
`ponte.riconosci(nomeFile, clienteA1)` dopo il caricamento,
`ponte.fileTolto()` quando si toglie. L'interruttore "versione digitale HTML"
è un **secondo ascoltatore** sullo stesso clic di `#print`: il PDF resta
affare del ponte.

## 6. Provare una modifica

```bash
cd "C:/Users/utente27/Desktop/Claude/cronoservice"
copy data\prova.db data\prova-registro.db
cd app && python server.py --no-sync --porta 8781 --db ../data/prova-registro.db
```

`http://127.0.0.1:8781/registro/`, **Ctrl+F5**. I file di prova stanno in
`C:\Users\utente27\Desktop\Claude\mappatura\`. Da automazione si caricano con
`page.setInputFiles('#file', …)` oppure aprendo il selettore con un clic su
`#drop`.

**Numeri misurati (11 settembre 2026, Chrome, 1440×900).** Da ricontrollare
dopo ogni modifica a `registro.js` o a `impagina.js`:

| file | righe | componenti | quadratura | pagine | impaginazione |
|---|---|---|---|---|---|
| `esempio excel.xls` (RIZZATO) | 23 | 23 | OK | 4 | 16 ms |
| `esempio 2 excel.XLS` (CASA GEROSA) | 178 | 178 | OK | 12 | ~25 ms |
| `sintetico grande.xls` | 3200 | 3200 | OK | 122 | 91 ms |

Controlli automatici utili da rifare (tutti a zero):

```js
// nessuna pagina sfonda l'area utile
[...document.querySelectorAll('#pages .page:not(.copertina) .corpo')]
  .filter(c => c.scrollHeight > c.clientHeight + 1).length
// ogni numero del sommario punta alla pagina vera
// (confrontare .pnum[data-pag] con la pagina di [data-ancora])
// ogni pagina tranne la copertina ha il piè di pagina
```

PDF di CASA GEROSA: 12 pagine, 4,1 MB in 3,2 s, consegnato al tracker con
`tipo = 'registro'` e `mese = null` (nessuna spunta); il chip
`doc-chip t-registro` compare accanto al sito nel tracker.

## 7. Quello che non c'è (e perché)

- **niente zoom a passi salvato**: lo zoom parte adattato alla colonna e i due
  bottoni lo muovono, ma non si ricorda fra una sessione e l'altra come nelle
  schede;
- **niente fascicoli**: il registro è un libretto solo. `fascicoliInAnteprima()`
  del ponte trova un fascicolo unico da sé;
- **niente filtro di cosa stampare**: il registro è il documento dell'impianto
  intero, per definizione.


## Dalla 30a sessione: albero, tutorial, pagine pigre

**Cosa entra nel registro** (`#treecol`, a destra, a file caricato):
`costruisciAlbero()` in `app.js` raggruppa `exportCorrente.righe` per
piano > reparto > stanza (stringhe cosi' come sono nell'export) e chiama
`creaAlbero` (`js/albero.js`, CSS in `css/banco.css`). Escludere una stanza
mette la sua chiave (`piano\0reparto\0stanza`) in `esclusi`; `exportFiltrato()`
toglie quelle righe PRIMA di `costruisciRegistro` e abbassa `righeDati` dello
stesso numero, cosi' la quadratura resta OK e i conteggi dicono "Esclusi
dall'albero: N". La tabella dei Nomi usa la legenda COMPLETA (il dizionario e'
dell'impianto). Il nome di un ramo salta alla pagina: `saltaA()` cerca
`s.id`/`rep.id` in `reg.sezioni` e scorre `#banco` alla `.page` che li
contiene (una stanza porta al suo reparto).

**Pagine pigre**: `ricostruisci()` rifa' sempre il modello, ma impagina
(`impaginaOra()`) solo se l'anteprima e' in vista; altrimenti `pagineDaRifare`
e `assicuraPagine()` al ritorno (`mostraVista`) o all'export (hook `pagine()`
del ponte). Era il "tremolio" dei Nomi: 140 ms di blocco a ogni Invio su 122
pagine.

**Tutorial**: `Tour.crea` (`js/tour.js`) con 12 passi in coda ad `app.js`,
chiave `cs.registro.tourSeen`, parte da solo la prima volta. Senza file carica
`ESEMPIO_GUIDA` (12 righe lette con `interpretaRiga`, `esempioGuida=true`) e
lo toglie alla chiusura; un file vero lo scavalca.

La barra del marchio, il bottone Tracker, `#grpTutti` e `#tourBtn` sono in
`index.html` con il CSS condiviso di `css/banco.css`; il "Salva nel tracker"
non c'e' piu' (fa tutto Esporta e salva).
