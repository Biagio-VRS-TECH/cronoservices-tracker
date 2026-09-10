# L'anno e il tempo — il modello

Questo e' il concetto meno ovvio dell'applicazione. Leggerlo prima di toccare
`web/js/stato.js`, `web/js/anno.js` o i conteggi.

Ancore: `#ANCHOR: anno-modello`, `#ANCHOR: classe-mese` e `#ANCHOR: rinnovo` in
`web/js/stato.js`.

## Il problema

In CronoServices i mesi di manutenzione stanno in `tServices.Gen…Dic` come
`Si`/`No`. **Sono una proprieta' del contratto, non di un anno.** Non esiste in
Access nessuna tabella "mesi del 2026": esiste "questo service si fa a maggio e
novembre", e vale finche' il contratto vale.

Nella prima versione la griglia mostrava quelle 12 colonne cosi' come sono, per
qualsiasi anno. Risultato, segnalato dal committente:

- 2025, 2026, 2027 avevano **esattamente le stesse 599 celle** nelle stesse
  posizioni: le frecce dell'anno sembravano non funzionare;
- nel 2025 tutte le 599 celle risultavano **"in ritardo"**, perche' erano mesi
  passati senza spunte — ma le spunte non potevano esistere, l'applicazione non
  c'era;
- nel 2026 erano 367 su 599: l'arancione era rumore, non informazione;
- il futuro veniva presentato come un dato certo invece che come una previsione.

## La soluzione: sette classi temporali

Per ogni terna (service, anno, mese) `classeMese()` decide una classe, incrociando
la riga dei mesi con `data_inizio`, la **scadenza effettiva** (`data_scadenza`
rimandata avanti dal rinnovo automatico, vedi sotto), `rinnovo_auto`,
`inizio_tracciamento` e il **mese di scadenza della mappatura**:

| classe | quando | spuntabile | nei totali | puo' essere "in ritardo" |
|---|---|---|---|---|
| `non-previsto` | `mesi[m] = 0` | no | no | no |
| `prima-contratto` | mese prima di `data_inizio` | no | no | no |
| `non-tracciato` | mese prima di `inizio_tracciamento` | **si** (recupero storico) | no | no |
| `previsto` | mese di scadenza **del sito**: il suo primo mese di manutenzione dentro contratto | **si** | **si** | **si** |
| `visita` | ogni altro mese di manutenzione dello stesso sito | **si** | no | no |
| `stima` | oltre la scadenza **effettiva**, `rinnovo_auto = 1`: il termine successivo non e' ancora iniziato | si | no | no |
| `da-rinnovare` | oltre `data_scadenza`, `rinnovo_auto = 0` | si | no | no |

**"In ritardo" = `previsto` + mese gia' passato + meno di `PASSI` spunte + la
mappatura di quel sito non chiusa in nessun mese dell'anno.** Nient'altro.
Non e' memorizzato in nessuna colonna: si ricalcola a ogni disegno da `oggi`, cosi'
non puo' andare fuori sincrono.

## Una mappatura per SITO per anno (#ANCHOR: mappatura-anno)

Il committente lo ha detto cosi' alla 4a sessione: *"non e' che ogni visita fai
una mappatura: una volta fatta la mappatura completa e ricambi per quel cliente
siamo a posto per tutto l'anno. Quando un contratto ha piu mesi la scadenza e' al
primo mese"*; alla 6a l'unita' era stata letta come il cliente, e alla **7a il
committente ha corretto**, indicando AZIENDA ULSS 1 DOLOMITI: *"come vedi ha 9
siti aperti, va fatta una mappatura per ogni sito, non una in generale"*. Vedi
[decisioni.md](decisioni.md) 10h.

Quindi l'unita' di conto **non e' la cella e non e' il cliente**, e' la coppia
(sito, anno) - dove "sito" = un record di `tServices` aperto, cioe' un impianto
con la sua destinazione:

- `meseScadenza(s)` = **primo mese di manutenzione dentro la finestra
  contrattuale** del sito, cioe' primo mese con classe base `previsto` *o*
  `non-tracciato`. 0 = nessun mese utile in quell'anno, quindi nessuna mappatura
  dovuta. Memoizzato su `id:anno` (`memoScad`).
  **Non guarda l'inizio del tracciamento**: se la scadenza gli e' anteriore la
  mappatura di quell'anno e' pre-tracciamento, visibile e spuntabile ma fuori dai
  totali. Prima la scadenza slittava al primo mese *tracciato* e questo era un
  errore di conteggio segnalato dal committente: un contratto marzo+settembre si
  vedeva assegnare la scadenza a settembre, cioe' **una visita contata come
  mappatura** (regola della 5a sessione, [decisioni.md](decisioni.md) 10e);
- `mappaturaSito(s)` = `{scad, mese, n, completa, passi, motivo, prevista,
  preTrac, ritardo}`:
  `passi` e' l'unione per campo di dove ogni passo e' stato fatto (vedi
  #ANCHOR: passi-cumulativi piu' sotto), `n` quanti sono; `mese` e' l'ultimo
  mese di quest'anno con un passo suo (dove e' stata chiusa, se e' chiusa),
  altrimenti il primo mese utile del calendario. **Chiudere la mappatura alla visita
  di novembre toglie il ritardo alla scadenza di marzo dello stesso sito, e solo
  di quello.** Memoizzato su `id:anno` (`memoMap`) e invalidato da `tocca(id)` a
  ogni scrittura su quel sito: ogni scrittura di cella passa da `scriviLocale` o
  da `cellaDalServer`, che lo chiamano. Senza questa memoria il disegno della
  griglia e il riepilogo in testa rifacevano il giro dei dodici mesi per ognuno
  dei 274 impianti a ogni clic: era la latenza segnalata alla 7a sessione;
- `progresso(s)` = la mappatura del sito, cioe' `PASSI` passi in tutto l'anno
  per riga. `progressoGruppo(g)` = la **somma** dei siti aperti del cliente: un
  cliente con nove impianti ha nove mappature e 9 x `PASSI` passi, piu'
  `dovute` / `complete` / `ritardo` per il tooltip della riga cliente.

In tutto l'anno **una sola cella per sito** e' `previsto`: quella del mese di
scadenza. Ogni altro mese di manutenzione dello stesso sito e' `visita`:
visibile, spuntabile, fuori dai totali.

Cosa cambia nei numeri: le "mappature previste" del 2026 erano **219 mesi**, poi
**194 service** (con la scadenza che slittava al tracciamento), poi **266 siti**
con la regola giusta della scadenza, poi **217 clienti** alla 6a sessione, di
nuovo **266 siti** alla 7a, e **267** dalla 9a (il rinnovo automatico non e' una
scadenza, vedi sotto). La riga della griglia si chiama "Mappature in scadenza" e
conta solo quelle dovute (`prevista`), una per sito.
Il gemello Python e' `api._mese_scadenza` e serve solo alla colonna `Ruolo` del
CSV: se si cambia la regola, vanno cambiati entrambi (vale anche per
`api._scad_effettiva`).

Il confronto fra date usa stringhe ISO (`"2026-05-01"`): l'ordinamento
lessicografico coincide con quello cronologico. Il fondo del mese e' `-31`, che va
bene proprio perche' e' un confronto fra stringhe.

## `inizio_tracciamento`

Meta in SQLite (`meta.inizio_tracciamento`, formato `AAAA-MM`), inizializzata al
mese del primo avvio, modificabile da **Azioni > Impostazioni**
(`POST /api/impostazioni`).

Significa: da quando l'azienda registra le spunte qui. Prima di quella data i mesi
si vedono (tenui, tratteggiati) e si possono spuntare per il recupero storico, ma
non sono mai arretrati e non entrano nei denominatori. Senza questo campo ogni
mese passato risulterebbe in ritardo solo perche' il programma non esisteva.

Se un giorno vogliono recuperare tutto il 2026, basta portare la data a `2026-01`:
quelle scadenze tornano `previsto` e rientrano nei conti. **E' la leva giusta da
suggerire** quando i totali sembrano troppo piccoli: non si sposta la scadenza,
si allarga il tracciamento. Il committente l'ha portato a `2026-01` fra la 5a e
la 6a sessione e **rimesso a `2026-09`** dopo l'8a: nei dati reali
`meta.inizio_tracciamento` e' `2026-09`, ed e' per questo che la testa mostra
**31** mappature dovute e non 267. E' una sua manopola, non un difetto: i numeri
di controllo qui sotto distinguono le due cose.

## `rinnovo_auto` e la scadenza effettiva (#ANCHOR: rinnovo)

Da `tCausaliRinnovo.RinnovoAutomatico`, importato in `services.rinnovo_auto`.
Nei dati reali: 229 service aperti con rinnovo automatico, 250 con
"RINNOVO DA RICHIEDERE ALLA SCADENZA".

**Il rinnovo automatico non e' una scadenza.** Su un service ancora `APERTO` con
`rinnovo_auto = 1`, il giorno scritto in `data_scadenza` non chiude il contratto:
apre il termine successivo, senza che nessuno firmi niente (per fermarlo serve la
disdetta, in genere 90 giorni prima). Quella data e' quindi la fine del *primo*
termine, non la fine del contratto, e va **rimandata avanti di un termine alla
volta finche' non copre oggi**: e' `scadEffettiva(s)` in `web/js/stato.js`, con
il gemello `api._scad_effettiva` per il CSV. La durata del termine si ricava da
`data_inizio -> data_scadenza` (12 mesi se non si ricava; rimandando avanti fino
a oggi il passo cambia solo di quanto la scadenza finisce nel futuro).

Senza questo, un contratto rinnovato da solo perdeva tutti i mesi successivi alla
data in Access: diventavano `stima`, quindi fuori dai totali, e se **tutti** i
suoi mesi di manutenzione cadevano la' la mappatura dell'anno risultava **non
dovuta pur essendo dovuta**. E' il difetto segnalato alla 9a sessione su
**LASERJET SPA** (#542: annuale, unica manutenzione a settembre, `data_scadenza`
2026-08-31; scadenza effettiva 2027-08-31, e settembre 2026 torna `previsto`).
Vale solo per i service **aperti**: su un service `CHIUSO` il contratto non si
rinnova e la causale in Access e' solo storia (LASERJET ha sei siti chiusi con la
stessa causale, e devono restare fuori).

Resta `stima` il termine **non ancora iniziato**: quella si', e' una proiezione.
E' cio' che rende il futuro utile: nel 2027, 174 mappature sono **stime**
(il contratto si rinnova da solo, salvo riprogrammazione) e 204 sono
**da rinnovare** (prima di pianificarle serve il rinnovo). Quest'ultimo numero e'
una scadenza commerciale che prima non era visibile da nessuna parte.

Quando una mappatura **non e' dovuta**, `mappaturaSito(s).motivo` dice perche':
e' la classe del suo primo mese utile (`da-rinnovare`, `stima`,
`prima-contratto`, `non-previsto`). Le Statistiche la scrivono in una parola
("da rinnovare", "oltre il contratto", "non ancora attivo") invece del "non
dovuta" muto che aveva nascosto il difetto LASERJET.

## Come si legge sullo schermo

- `previsto` -> cella piena normale
- `stima` -> alone cyan tenue
- `da-rinnovare` -> alone ambra
- `non-tracciato` -> solo un contorno grigio chiarissimo (deve stare zitta)
- `prima-contratto` -> pallino minuscolo (`.fuori-contratto`)
- `non-previsto` -> trattino (`.non-previsto`)

Le stime e i non tracciati restano spuntabili di proposito: se il rinnovo e' gia'
firmato ma Access non e' ancora aggiornato, bloccare l'operatore sarebbe peggio
del contrassegno.

## Numeri di controllo (2026-09-07, 9a sessione, `inizio_tracciamento = 2026-09`)

Due famiglie di numeri, e vanno tenute separate: quelli **strutturali** (quante
mappature ha l'anno) non dipendono dal tracciamento, quelli della **testa**
contano solo le dovute dentro il tracciamento. Verificati in browser sui dati
reali:

| 2026 | valore |
|---|---|
| clienti con service aperti | 222 |
| siti (service) aperti | 274 |
| siti con una scadenza di mappatura nel 2026 (strutturale) | **267** |
| di cui pre-tracciamento (scadenza prima di `2026-09`) | 236 |
| **mappature dovute nella testa** (dentro il tracciamento) | **31** |
| complete | 0 |
| in ritardo | 0 |
| stime / da rinnovare (celle) | 0 / 16 |

267 = 266 della 8a sessione **+1**: LASERJET SPA #542, recuperato dalla regola
della scadenza effettiva (vedi sopra). Con `inizio_tracciamento = 2026-01` la
testa tornerebbe a mostrare tutti e 267.

"Complete" e "in ritardo" sono l'unica coppia che si muove: il committente
spunta mentre si collauda (l'archivio e' azzerato, quindi partono da 0). Gli
altri numeri sono strutturali e vanno riprodotti identici.

Per mese, la riga "Mappature in scadenza" della griglia conta solo le dovute
dentro il tracciamento: gennaio-agosto **vuoti** (pre-tracciamento), poi
11 / 8 / 4 / 8 = **31**,
identica al numero della testa e alle colonne del grafico "A che punto siamo".
E' il controllo incrociato immediato:
`[...document.querySelectorAll('.riga-totali .tm')]` sommato per il secondo
termine deve dare il numero della testa. (Con `inizio_tracciamento = 2026-01` la
riga era 33 / 25 / 40 / 39 / 33 / 50 / 8 / 8 / 10 / 8 / 4 / 8 = 266, oggi 267 con
settembre a 11.)

Gli altri anni non si muovono con questa correzione, ed e' il controllo che dice
se si e' rotto qualcosa: **2025** = 208 siti con scadenza (tutti
pre-tracciamento), **2027** = 118 dovute, 174 stime, 204 da rinnovare.

AZIENDA ULSS 1 DOLOMITI (il caso citato dal committente): **8 siti aperti**, 8
mappature (7 in scadenza a gennaio e 1 a marzo), `0/32` nella colonna Anno della
riga cliente. E' l'esempio da riguardare se si tocca l'unita' di conto - con
`inizio_tracciamento = 2026-09` quelle 8 scadenze sono tutte pre-tracciamento,
quindi fuori dalla testa: e' la manopola, non un difetto.

LASERJET SPA (il caso della 9a sessione): **1 sito aperto** #542 con l'unica
manutenzione a settembre e `data_scadenza` 2026-08-31 in Access. Nel cassetto la
validita' dice `01/09/2025 -> 31/08/2027 · rinnovo automatico (in Access
31/08/2026)`, la cella di settembre e' `previsto` (non `stima`), le Statistiche
dicono "1 mappatura dovuta · da fare" e il CSV la marca `MAPPATURA`. Ha anche
**sei siti CHIUSI** con la stessa causale di rinnovo: quelli devono restare
fuori. E' l'esempio da riguardare se si tocca la scadenza effettiva.

Numeri delle versioni precedenti, per confronto: **219** "previste" nel 2026 era
il conteggio dei *mesi* di manutenzione; **194** i service con la scadenza fatta
slittare al primo mese tracciato; **30** i siti dovuti con
`inizio_tracciamento = 2026-09` prima della scadenza effettiva (oggi 31);
**217** i clienti della 6a sessione. Se al posto di 267 riappare 217, si e'
tornati a contare i clienti invece dei siti; se riappare 266, la scadenza
effettiva del rinnovo automatico non c'e' piu'.

## I passi si accumulano, non si rifanno (#ANCHOR: passi-cumulativi)

Il committente alla 20a sessione: *"se un sito ha visite in piu' mesi e ho
delle spunte gia' segnate il primo mese, quelle valgono anche per i
successivi, non si resetta cio' che e' stato fatto, e' un tracciamento [...]
anche per l'anno: 3 spunte a novembre e a marzo una visita, non devo farle
tutte e quattro da capo, ci manca la quarta"*.

Regola, in `passiSito(s)` (`web/js/stato.js`):

- **dentro l'anno**: per ogni passo, il primo mese in cui e' stato messo. La
  mappatura del sito e' l'**unione** dei mesi (prima era il mese "migliore":
  s+c a maggio e k a settembre contavano 2, oggi 3). `mese` e' l'ultimo mese
  con un passo suo, cioe' dove e' stata chiusa se e' chiusa;
- **a cavallo dell'anno**: se la mappatura dell'anno prima e' rimasta APERTA
  (0 < passi < PASSI) i suoi passi valgono anche quest'anno, per tutti i mesi.
  Se era chiusa, si riparte: la mappatura resta una per sito per anno. Si
  guarda solo l'anno prima (`st.cellePrec`, chiavi `id-mese` come `st.celle`,
  dal bootstrap `celle_prec`), non due;
- **per la cella** (`statoCella`): `ered[campo]` = passo fatto PRIMA di questo
  mese (mese precedente dello stesso anno, o l'anno prima) e non messo qui;
  `mie` i suoi; `n` = `mie` + ereditati, ed e' `n` che decide `completa`,
  `ritardo` e i conteggi del Mese. Solo le celle spuntabili ereditano: un mese
  fuori calendario resta un puntino. Marzo non eredita da maggio: il tempo va
  in una direzione sola.

Conseguenze: chiudere il quarto passo a settembre rende **verde la cella di
settembre** (4 = 1 suo + 3 ereditati) e la riga 4/4; la cella di maggio resta
a 3. Un passo ereditato si vede spuntato **uguale agli altri** e il clic
**lo toglie da dove e' stato messo** (`toccaPasso` in `stato.js`, 28a
sessione: prima c'era un avviso "vai su quel mese" che era un vicolo cieco);
il tooltip dice "gia' fatta a maggio da X · un clic la toglie da li'". Se viene
dall'anno prima da qui non si raggiunge (`st.celle` e' l'anno corrente) e lo
si dice. "Completa i passi mancanti" mette solo quelli che mancano
davvero (anche `passiMancanti` per le azioni di massa). Ogni spunta ridipinge
tutte le capsule della riga: cambia anche settembre quando si tocca maggio.

**Limite scelto**: la mappatura dell'anno prima resta segnata aperta (e in
ritardo, se dovuta) anche quando il quarto passo arriva a marzo dell'anno
dopo. Chiuderla retroattivamente vorrebbe le celle dell'anno DOPO e una regola
che si morde la coda (Y eredita da Y-1 se Y-1 e' aperta; Y-1 e' chiusa grazie
a Y). Se un giorno servisse, la strada e' contare solo i passi PROPRI di ogni
anno in tutte e due le direzioni, e caricare `celle_succ`.

## Cosa NON fare

- Non scrivere l'anno in Access, e non inventare una tabella "mesi per anno":
  la cadenza del contratto e' la loro fonte di verita' e va rispettata.
- Non memorizzare "in ritardo" da nessuna parte.
- Non far entrare stime e non tracciati nei denominatori: e' esattamente il
  difetto che si e' corretto.
- Non contare i passi di una cella con `c.s + c.c + c.k + c.r` quando serve lo
  stato del mese: quello e' `mie`. Lo stato e' `statoCella(id, m).n`, che
  comprende gli ereditati.
- Non trattare `data_scadenza` come la fine del contratto quando
  `rinnovo_auto = 1` e il service e' aperto: e' la fine del termine in corso, e
  il termine dopo parte da solo. E' il difetto LASERJET.
- Non lasciare un "non dovuta" senza motivo nelle Statistiche: e' cio' che ha
  reso invisibile il difetto LASERJET per otto sessioni.
