# AGENTS.md — regole per l'interfaccia

Regole per costruire interfacce accessibili, veloci e curate. `MUST` e' un
obbligo, `SHOULD` una preferenza forte, `NEVER` un divieto.

Adattato dalle [Web Interface Guidelines](https://github.com/vercel-labs/web-interface-guidelines)
di Vercel. **Non e' una copia**: le voci che valgono solo per React/Next.js o
per il marchio Vercel sono state tolte, perche' qui lo stack e' un altro.

## Cosa vale qui e cosa no

Questo file dice **come** si scrive l'interfaccia. Non dice **dov'e'** il
codice ne **perche'** una scelta e' stata fatta: quello sta in
[docs/AI-HANDOFF.md](docs/AI-HANDOFF.md) e in
[docs/ai/frontend.md](docs/ai/frontend.md), che vincono sempre in caso di
contrasto.

Tre vincoli del progetto tagliano fuori mezze soluzioni consigliate altrove:

- **Nessuna dipendenza, nessuna CDN, nessun passo di build.** JS vanilla a
  moduli ES. Se una regola qui sotto suggerisce una libreria, la si realizza a
  mano o non si fa.
- **Deve partire offline** con un doppio clic. Niente font remoti, niente
  richieste a domini terzi, niente che si rompa senza rete.
- **Italiano.** Le etichette a schermo passano da `ETICHETTA_RUOLO` dove
  serve (`tecnico` a schermo si legge **"operatore"**). Nessuna regola di
  copywriting inglese (Title Case, `&` al posto di `and`) si applica.

## Interazioni

### Tastiera

- MUST: tutto il flusso e' usabile da tastiera, secondo i
  [pattern WAI-ARIA](https://www.w3.org/WAI/ARIA/apg/patterns/)
- MUST: anello di focus visibile e non coperto (`:focus-visible`, `:focus-within`
  per i gruppi); testate, piedi e fasce fisse non nascondono mai l'elemento a fuoco
- MUST: gestire il focus (trappola, spostamento, ritorno) come dicono i pattern —
  vale per i popover delle spunte, il cassetto laterale e le modali
- NEVER: `outline: none` senza un focus visibile che lo sostituisca

### Bersagli e input

- MUST: bersaglio del tocco >= 24px (>= 44px su mobile); se il disegno e' piu'
  piccolo, si allarga l'area cliccabile senza allargare il disegno
- MUST: `font-size` degli `<input>` >= 16px su mobile, o iOS Safari zooma da solo
- NEVER: disabilitare lo zoom del browser (`user-scalable=no`, `maximum-scale=1`)
- MUST: `touch-action: manipulation` per togliere lo zoom da doppio tocco
- SHOULD: `-webkit-tap-highlight-color` coerente col tema

### Moduli

- NEVER: bloccare l'incolla in `<input>` e `<textarea>`
- MUST: il pulsante che sta lavorando mostra l'attesa **e tiene la sua etichetta**
- MUST: Invio invia quando il campo di testo e' l'unico controllo; in un
  `<textarea>` Invio va a capo e Ctrl+Invio invia
- MUST: ogni controllo ha una `<label>` associata, o un `aria-label`
- MUST: cliccare l'etichetta porta il focus sul controllo
- MUST: l'invio resta abilitato fino alla partenza della richiesta, poi si
  disabilita mostrando l'attesa
- MUST: accettare qualsiasi testo e validare dopo. Non si bloccano i tasti:
  l'utente non capirebbe perche' non scrive
- MUST: non pre-disabilitare l'invio di un modulo incompleto; si invia e si
  mostrano gli errori
- MUST: errori accanto al loro campo; all'invio, il focus va sul primo errore
- MUST: `autocomplete` e `name` sensati; `type` e `inputmode` giusti
- SHOULD: `spellcheck="false"` su caselle di posta, codici, matricole
- SHOULD: i segnaposto finiscono con `…` e mostrano un esempio del formato
- MUST: avvisare prima di lasciare la pagina con modifiche non salvate
- MUST: compatibile coi gestori di password; l'incolla dei codici funziona
- MUST: `trim()` sui valori — alcune tastiere aggiungono uno spazio in coda
- MUST: nessuna zona morta su spunte e scelte: etichetta e controllo sono **un
  solo** bersaglio generoso

### Stato e navigazione

- MUST: l'URL riflette lo stato — anno, mese, vista, filtri, pannelli aperti.
  Ogni volta che nasce uno stato che l'utente vorrebbe condividere o ritrovare
  dopo un ricarico, finisce nell'URL
- MUST: Indietro/Avanti riportano la posizione dello scorrimento
- MUST: per navigare si usa `<a>`, cosi' Ctrl+clic e il tasto centrale funzionano
- NEVER: un `<div onclick>` al posto di un collegamento o di un pulsante

### Risposte all'utente

- SHOULD: aggiornamento ottimista quando il successo e' probabile; si riconcilia
  con la risposta del server e, se fallisce, si torna indietro o si offre Annulla
  (qui la coda offline fa gia' meta' del lavoro — vedi
  [docs/ai/concorrenza.md](docs/ai/concorrenza.md))
- MUST: le azioni distruttive chiedono conferma o lasciano una finestra per
  annullare. Azzerare in blocco e cancellare i PDF di un anno sono di questa
  famiglia
- MUST: `aria-live="polite"` per gli avvisi che compaiono e per la validazione
- SHOULD: `…` sulle voci che aprono un seguito ("Rinomina…") e sugli stati in
  corso ("Caricamento…", "Salvataggio…")

### Tocco e trascinamento

- MUST: bersagli generosi, affordance chiare, interazioni prevedibili
- MUST: il primo suggerimento di un gruppo ha un ritardo, i successivi no
- MUST: `overscroll-behavior: contain` in modali e cassetti
- MUST: durante il trascinamento si disabilita la selezione del testo e si mette
  `inert` sull'elemento trascinato
- MUST: ogni gesto (trascina, scorri, pizzica) ha un'alternativa a clic **e** da
  tastiera, a meno che il gesto sia il senso stesso della cosa
- MUST: se sembra cliccabile, e' cliccabile. Nessuna zona morta

### Focus automatico

- SHOULD: su desktop, se c'e' un solo campo principale, ci si va col focus.
  Su mobile quasi mai: la tastiera che si apre sposta il layout

## Animazioni

- MUST: rispettare `prefers-reduced-motion` con una variante ridotta o niente
- SHOULD: nell'ordine CSS > Web Animations API > JS. Qui, in pratica, CSS
- MUST: animare solo proprieta' che non ricalcolano il layout (`transform`,
  `opacity`)
- NEVER: animare `top`, `left`, `width`, `height`
- NEVER: `transition: all`. Si elencano le proprieta' una per una
- SHOULD: si anima solo per chiarire causa ed effetto, o per un piacere voluto
- SHOULD: l'attenuazione segue cio' che cambia (dimensione, distanza, innesco)
- MUST: le animazioni si interrompono all'input dell'utente
- MUST: `transform-origin` giusto: il movimento parte da dove "fisicamente" parte
- MUST: i transform SVG vanno su un `<g>` con
  `transform-box: fill-box; transform-origin: center` (Safari sbaglia l'origine)

## Impaginazione

- SHOULD: allineamento ottico, +-1px quando l'occhio batte la geometria
- MUST: ogni elemento si allinea a qualcosa di voluto — griglia, linea di base,
  bordo, centro ottico. Nessuna posizione per caso
- SHOULD: nei blocchi icona + testo si bilanciano peso, dimensione, spazio e
  colore, cosi' non litigano
- MUST: verificare su mobile, portatile e schermo largo (per il largo, zoom al 50%)
- MUST: rispettare le aree sicure con `env(safe-area-inset-*)`
- MUST: nessuna barra di scorrimento di troppo: si aggiusta l'overflow
- SHOULD: far dimensionare al browser. Flex e grid prima di misurare in JS

## Contenuto e accessibilita'

- SHOULD: prima la spiegazione in linea, il suggerimento a comparsa per ultimo
- MUST: gli scheletri di caricamento hanno la forma del contenuto vero, o la
  pagina salta
- MUST: il `<title>` dice dove sei
- MUST: nessun vicolo cieco: ogni schermata offre un passo avanti o una via d'uscita
- MUST: disegnare **tutti** gli stati: vuoto, quasi vuoto, pieno, errore
- SHOULD: virgolette curve; `text-wrap: balance` per evitare righe orfane
- MUST: `font-variant-numeric: tabular-nums` dove i numeri si confrontano in
  colonna — conteggi, ritardi, percentuali
- MUST: lo stato non si affida al solo colore. Sempre anche un'etichetta o una
  forma: chi non distingue i colori deve leggere "in ritardo", non vedere rosso
- MUST: le icone da sole hanno un `aria-label` che dice cosa fanno
- MUST: il nome accessibile esiste anche quando a schermo l'etichetta non c'e'
- MUST: il carattere `…`, non tre punti
- MUST: `scroll-margin-top` sui titoli richiamabili; gerarchia `<h1>`–`<h6>`
  senza salti; un collegamento "Vai al contenuto"
- MUST: regge contenuto scritto dall'utente corto, medio e lunghissimo — i nomi
  dei siti e le note lo sono
- MUST: date, ore e numeri con `Intl.DateTimeFormat` e `Intl.NumberFormat`,
  locale italiana
- MUST: prima la semantica nativa (`button`, `a`, `label`, `table`), poi `aria-*`
- MUST: il decoro e' `aria-hidden`

### Testo che non ci sta

- MUST: i contenitori di testo gestiscono il troppo lungo (troncamento con
  ellissi, `-webkit-line-clamp`, `overflow-wrap: anywhere`)
- MUST: un figlio di flex ha bisogno di `min-width: 0` per potersi troncare
- MUST: stringa vuota e lista vuota non rompono il disegno

## Prestazioni

- MUST: misurare in modo pulito, senza estensioni che falsano i tempi
- MUST: profilare con CPU e rete rallentate
- MUST: raggruppare letture e scritture del layout; evitare ricalcoli inutili
- MUST: le scritture (`POST`/`PATCH`/`DELETE`) stanno sotto i 500ms
- SHOULD: input non controllati; se controllati, il costo per tasto e' basso
- MUST: le liste lunghe (> 50 righe) si virtualizzano, o almeno
  `content-visibility: auto`
- MUST: precaricare solo le immagini sopra la piega, le altre `loading="lazy"`
- MUST: niente salti di layout dalle immagini: dimensioni esplicite e spazio
  riservato
- SHOULD: `font-display: swap` sui caratteri critici. Restano **locali**: qui non
  si preconnette a nessun CDN

## Tema chiaro e scuro

- MUST: `color-scheme: dark` sull'`<html>` nel tema scuro, o le barre di
  scorrimento e i controlli di sistema restano illeggibili
- SHOULD: `<meta name="theme-color">` uguale allo sfondo della pagina
- MUST: sui `<select>` nativi si impostano `background-color` e `color` espliciti,
  altrimenti su Windows in tema scuro il testo scompare

## Disegno

- SHOULD: ombre a strati (ambiente + luce diretta), almeno due
- SHOULD: bordi nitidi: bordo semitrasparente **piu'** ombra
- SHOULD: raggi annidati: il figlio ha raggio <= al padre, e concentrico
- SHOULD: coerenza di tinta: bordi, ombre e testo virano verso la tinta dello sfondo
- MUST: grafici leggibili anche a chi non distingue i colori. La tavolozza si
  verifica con `docs/ai/valida-tavolozza.py` (e vedi la skill `dataviz`)
- MUST: contrasto sufficiente. Meglio [APCA](https://apcacontrast.com/) di WCAG 2
- MUST: `:hover`, `:active` e `:focus` hanno **piu'** contrasto dello stato di riposo
- SHOULD: evitare le fasce nei gradienti verso il nero

---

Per una revisione contro queste regole: il comando `/web-interface-guidelines
<file>` o la skill `web-design-guidelines`. Le regole scritte, comunque, valgono
in fase di scrittura: la revisione e' la rete, non il metodo.
