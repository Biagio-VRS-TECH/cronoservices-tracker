# Crono Mappature — VRS

Checklist delle mappature service. Ogni mappatura si chiude in quattro spunte: **mappatura stampata → controllata
dal tecnico → mappatura completa rapportino → controllo ricambi e scadenze**.

**Una mappatura per anno, per service.** Non si rifà a ogni visita: fatta una
volta con tutte e quattro le spunte, quel service è a posto per tutto l'anno. Se
il contratto ha più mesi di manutenzione, la mappatura **scade nel primo**; gli
altri mesi restano visibili come visite (capsula col solo contorno) e si possono
spuntare, se la mappatura la fate lì.

---

## C'è anche la versione online

La stessa applicazione può stare in rete (Netlify + Supabase), raggiungibile da
casa e dal telefono, con un login per persona. In quel caso non serve nessun
"computer che fa da server": si apre l'indirizzo e basta.

Il database Access resta dov'è. Il PC dell'ufficio lo legge **una volta al
giorno**, da solo, e manda clienti e impianti alla versione online; le spunte
invece vivono solo online. La procedura per attivarla è in
[cloud/LEGGIMI.md](cloud/LEGGIMI.md).

Finché non la attivate, tutto quello che segue vale esattamente come prima.

---

## Se lavorate in più persone, leggete prima questo

**Un solo computer fa da server. Tutti gli altri lo aprono nel browser.**

È la cosa più importante di tutte. Se ognuno lancia `avvia.bat` sul proprio PC,
ognuno ha il *suo* archivio: le spunte di uno non esistono per l'altro, e nessuno
se ne accorge per settimane.

Per questo l'applicazione si difende da sola:

- se provate a lanciarla due volte sullo stesso PC, dice *"è già in esecuzione"*
  e non parte;
- se in rete ci sono **due server** su due PC diversi, tutti vedono una **fascia
  rossa** in cima con il nome dell'altro computer e il link a cui collegarsi.

Come si fa, in pratica:

1. Scegliete **un** computer (quello che resta più spesso accesso).
2. Su quello, doppio clic su **`avvia.bat`**.
3. Nella finestra del server compaiono due indirizzi:

   ```
   su questo PC .... http://localhost:8770
   per i colleghi .. http://192.168.x.x:8770
   ```

4. I colleghi aprono **il secondo** nel loro browser. Niente da installare.
   Lo stesso indirizzo è sempre disponibile nell'applicazione, cliccando il
   pulsante con la spia in alto a destra → **Copia**.
5. Sul PC che fa da server, doppio clic su **`avvio-automatico.cmd`** una volta
   sola: da lì in poi il server parte a ogni accesso a Windows e nessuno ha
   motivo di aprirne un altro. (Lo stesso file serve anche per togliere l'avvio
   automatico.)

La prima volta che un collega si collega, Windows chiede di autorizzare Python
sulla rete: rispondere **Consenti** sulle reti private.

### Cosa succede se cade la rete o si spegne il server

Niente di grave, e lo vedete subito: compare una fascia arancione in cima e la
spia diventa arancione. **Potete continuare a spuntare.** Le spunte restano in
coda su quel computer (anche chiudendo il browser) e ripartono da sole appena il
server torna. Il pulsante con la spia dice sempre quante ne sono in attesa.

### Quando siete in due sulla stessa cosa

Le spunte del collega arrivano da sole e la cella lampeggia con il suo nome. Se
avete toccato passi diversi della stessa mappatura, l'applicazione unisce le due
cose senza chiedere niente. Solo se cambiate **lo stesso passo nello stesso
momento** vi viene chiesto quale versione tenere.

Al primo accesso ognuno scrive il proprio nome: resta su quel computer e firma
ogni spunta. Il diario di chi ha fatto cosa è nel pulsante con la spia e nella
vista Controlli.

---

## Le viste

- **Anno** — la griglia: clienti in riga, dodici mesi in colonna. Ogni cella è
  una capsula divisa in quattro segmenti che si riempiono da sinistra. In una
  riga la capsula **piena** è la mappatura dell'anno (scade in quel mese) e
  quelle col **solo contorno** sono le visite successive. Clic sulla cella per
  spuntare, clic sul nome del service per il dettaglio, clic sul cliente per
  chiudere o aprire il gruppo. La riga **Mappature in scadenza** in alto dice, per
  ogni mese, quante ne scadono e quante sono chiuse.
- **Mese** — il foglio di lavoro: i service da visitare in quel mese con le
  quattro caselle grandi. Si possono selezionare più righe e spuntarle in
  blocco. È la vista da stampare: sulla carta le caselle escono **vuote**, da
  barrare a penna.
- **Statistiche** — le stesse cose in grafico: percentuale di mappature chiuse,
  una riga per impianto, avanzamento mese per mese, dove si ferma il lavoro,
  province con più arretrato.
- **Controlli** — due torte che dicono a che punto è l'anno (quanti passi sono
  fatti, come stanno le scadenze), l'elenco delle mappature in ritardo e il
  diario di tutti.

Il pulsante **?** in alto apre la legenda e l'elenco dei tasti.

---

## Perché cambiando anno le caselle cambiano

In CronoServices i mesi di manutenzione appartengono al **contratto**, non a un
anno: "questo service si fa a maggio e novembre" vale finché vale il contratto.
L'applicazione li incrocia con inizio e scadenza del contratto, quindi:

| come appare la cella | cosa significa |
|---|---|
| piena, normale | **la mappatura dell'anno**: scade in questo mese, entra nei conteggi |
| solo il contorno, grigio medio | **visita** di manutenzione: la mappatura dell'anno scade in un altro mese. Si può spuntare, ma non è un secondo impegno |
| alone **arancione** | la scadenza è passata e la mappatura non è chiusa in nessun mese: **in ritardo**. Questo è lavoro vostro |
| alone azzurro tenue | **stima**: oltre il termine in corso di un contratto che si rinnova da solo. Il rinnovo successivo non è ancora partito, quindi è una previsione |
| alone **rosso** | **contratto scaduto, rinnovo da richiedere**: prima di pianificarlo serve il rinnovo. È una scadenza commerciale, non un vostro ritardo — per questo il colore è diverso dall'arancione |
| solo un contorno grigio chiarissimo | mese **prima dell'inizio del tracciamento** (vedi sotto): si può spuntare per recuperare lo storico, ma non è un arretrato |
| trattino | nessuna manutenzione prevista, o service non ancora attivo |

Visite, stime, rinnovi da richiedere e mesi pre-tracciamento **non entrano** nei
totali "mappature complete": la mappatura dovuta è una per service per anno. I
loro numeri si leggono a destra, sotto i numeri grandi.

**Contratti che si rinnovano da soli.** Quando la causale di rinnovo è
automatica, la data di scadenza scritta in CronoServices non chiude il
contratto: apre il periodo successivo. L'applicazione la manda avanti da sé fino
a coprire la data di oggi, quindi quei mesi restano **mappature dovute** e non
diventano stime. Nel dettaglio del sito (clic sulla riga) la riga **Validità**
mostra il periodo in corso e, fra parentesi, la data che sta in CronoServices.
Se invece il rinnovo va richiesto, la scadenza è una scadenza vera: le celle
successive diventano rosse e la mappatura non è dovuta finché il contratto non
viene rinnovato.

### Inizio del tracciamento

**Azioni → Impostazioni** contiene il mese da cui registrate le spunte qui
(all'inizio è il mese della prima accensione). Serve a non vedere segnalati come
arretrati tutti i mesi in cui l'applicazione non esisteva. Se volete recuperare
tutto l'anno in corso, portatelo a gennaio: quei mesi rientrano nei conteggi.

---

## Azioni

Il menu **Azioni** contiene:

- **Completa tutte le spunte** / **Azzera tutte le spunte** — valgono sull'anno
  che state guardando e **sui filtri attivi**. La conferma dice esattamente
  quante spunte, su quante mappature, di quanti service. Subito dopo avete 15
  secondi per premere **Annulla**. Per limitarle a un cliente: cercatelo nella
  barra di ricerca, poi ripetete l'azione.
- **Stampa il foglio del mese** e **Scarica CSV** (formato per Excel italiano).
  Nel CSV la colonna **Ruolo** dice se quel mese è la `MAPPATURA` dell'anno o una
  `visita`.
- **Sincronizza da Access** — rilegge clienti, service e mesi senza fermare
  l'applicazione (~3 secondi). Serve dopo aver aggiunto un service o cambiato i
  mesi di manutenzione in CronoServices. **Le spunte già messe non si perdono
  mai.** Prima di ogni sincronizzazione viene salvata una copia dei dati in
  `data/backup/` (ne tiene le ultime 20).

---

## Dove stanno i dati

- `data/cronoservice.db` — **le spunte, le note e lo storico.** È l'unico file
  che non si può ricostruire: metterlo nel backup aziendale.
- I due `.accdb` di CronoServices restano quelli di sempre: l'applicazione li
  legge e **non li modifica mai**.

## Serve Python

Il PC che fa da server deve avere Python 3 (qui è installato: 3.13). Nessun altro
prerequisito: niente da installare, niente Internet.
