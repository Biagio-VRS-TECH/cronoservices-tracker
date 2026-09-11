# Crono Mappature online — Netlify + Supabase

Da qui l'applicazione si mette in rete senza perdere niente di quella locale:
`avvia.bat` continua a funzionare esattamente come prima, offline e con doppio
clic. Sono la stessa applicazione con due trasporti diversi.

```
   LOCALE                              ONLINE
   browser                             browser (ovunque)
      |                                   |  login @vrs-tech.it
   server.py  ---> SQLite              Supabase (Postgres + Realtime)
      |                                   ^
   .accdb (lettura)                       |  una volta al giorno, alle 08:15
                                    push_cloud.py sul PC dell'ufficio
                                          |
                                    .accdb (lettura)
```

**Il vincolo che decide tutto**: `CronoServices_be.accdb` sta sul PC
dell'ufficio e si legge solo da Windows con ADODB. Netlify e Supabase non
possono andare a prenderlo, quindi la sincronia non si tira dal cloud: la spinge
quel PC. È l'unica cosa che resta installata là.

**Va in una direzione sola.** Clienti e service scendono da Access; le spunte
nascono e vivono solo su Supabase e non tornano mai indietro. Non c'è nessun
conflitto fra due padroni da risolvere, perché il padrone delle spunte è uno.

---

## 1. Il progetto Supabase

1. [supabase.com](https://supabase.com) → **New project**. Regione **West EU
   (Ireland)** o **Central EU (Frankfurt)**: sono le più vicine. Segna la
   password del database, serve solo in emergenza.
2. **SQL Editor** → esegui i cinque file **in quest'ordine**, uno alla volta:

   | file | cosa mette |
   |---|---|
   | `01-tabelle.sql` | le stesse tabelle di `app/db.py` |
   | `02-funzioni.sql` | spunte, merge per campo, conflitti — il gemello di `app/api.py` |
   | `03-letture.sql` | bootstrap, diario, controlli, presenze, CSV |
   | `04-sicurezza.sql` | chi vede cosa, chi scrive cosa, il canale in diretta |
   | `05-sync.sql` | la porta d'ingresso della copia di Access |

   Se uno si ferma con un errore, fermati lì: i successivi danno per buono il
   precedente.
3. **Project Settings → API**: copia da parte tre cose.
   - `Project URL` → `https://xxxxxxxx.supabase.co`
   - `anon public` → è **pubblica per disegno**, finisce nel browser di
     chiunque. Non protegge niente da sola: a proteggere sono il login e le
     regole di `04-sicurezza.sql`.
   - `service_role` → **questa è segreta**. Salta ogni controllo. Va solo sul PC
     dell'ufficio, mai su Netlify, mai in un file del progetto che gira nel
     browser.

## 2. Chi può entrare

**Authentication → Providers → Email**: togli **Allow new users to sign up**.
Da fuori nessuno si registra: gli account li crei tu.

**Authentication → Users → Add user**: uno per persona, con la casella
aziendale e una password iniziale. Spunta *Auto Confirm User*, altrimenti resta
in attesa di una mail di conferma.

Il controllo del dominio è doppio apposta: anche se le registrazioni venissero
riaperte per sbaglio, `autorizzato()` in `02-funzioni.sql` non fa vedere niente
a chi non ha un indirizzo `@vrs-tech.it`.

> Il nome che firma le spunte non si scrive a mano: è la casella con cui si
> entra (`mario.rossi@vrs-tech.it` → *Mario Rossi*), e **dall'app non si
> cambia**. Il campo dove lo si poteva riscrivere è stato tolto: scrivendo il
> nome di un collega si finiva sulla sua riga in `operatori`, cioè su quella che
> porta il ruolo.

### Chi può fare cosa

Tre ruoli, legati alla **casella del login** (mai al nome):

| ruolo | cosa può fare |
|---|---|
| **tecnico** | spunta tutto; "Rapportino" e "Ricambi" restano *proposte* (a righe) |
| **approvatore** | approva o respinge quelle due proposte, dalla pillola "N da approvare". Nient'altro |
| **amministratore** | approva, completa o azzera in blocco, rilegge Access, cambia le impostazioni, "Ripristina" nel diario, butta i PDF di un anno intero |

### Registrare un collega

Dalla 25a sessione si fa **dall'app**: Azioni → Impostazioni → *Registra un
collega*. Gli dai la casella aziendale e una password iniziale, lui entra
subito (l'utente nasce già confermato, come quando si spuntava *Auto Confirm
User* a mano). Nasce **operatore**; comparirà nell'elenco dei ruoli dopo il suo
primo accesso, ed è lì che gli si cambia ruolo.

Creare una casella richiede la **service_role key**, che in `web/` non può
stare: chiunque apra il sito la leggerebbe. La tiene nascosta l'unica cosa del
progetto che non gira nel browser, `netlify/functions/registra-utente.mjs`
(#ANCHOR: registra-utente). Un file solo, nessun `npm`, nessuna dipendenza. Non
decide niente da sé: prende il token di chi ha premuto il bottone e chiede a
Postgres `ruolo_corrente()` **con quel token**; se non risponde `admin` si
ferma, e la service key non viene nemmeno toccata.

**Va aggiunta una variabile d'ambiente**, altrimenti il modulo risponde
*"configurazione incompleta"*. In Netlify, *Site settings → Environment
variables → Add a variable*:

| variabile | valore | dove si trova |
|---|---|---|
| `SUPABASE_SERVICE_KEY` | la chiave **service_role** | Supabase → Project Settings → API Keys |

Due accortezze quando la crei:

- spunta **Contains secret values**: Netlify la nasconde nell'interfaccia e la
  oscura nei log di deploy;
- negli *Scopes*, se il piano te lo fa scegliere, lascia solo **Functions**. Sul
  piano attuale (`nf_team_dev`) la scelta non c'è e resta *All scopes*: **va
  bene lo stesso**, perché `netlify-build.sh` scrive in `nuvola-config.js` solo
  `SUPABASE_URL` e `SUPABASE_ANON_KEY` — la service key non la tocca mai. E per
  sicurezza, se un domani qualcuno la aggiungesse a quel file, lo script se ne
  accorge e **ferma la pubblicazione** invece di mandare online una chiave che
  può tutto.

Il *Deploy context* dev'essere **All**: serve anche ai Deploy Preview, non solo
alla produzione.

È la chiave che scavalca ogni permesso: non va nel repository, non va in
`nuvola-config.js`, non si incolla in chat.

La password non viene salvata da nessuna parte e non si rilegge: se un collega
la perde, gliene fai una nuova da Supabase → Authentication → Users.

Il primo amministratore si nomina una volta sola, dall'SQL Editor, con
`07-ruoli.sql` (sostituire la casella): la persona deve essere entrata almeno
una volta nel tracker. Da lì in avanti i ruoli si girano dall'app: **Azioni →
Impostazioni → Chi può fare cosa**, un clic per passare da tecnico ad
approvatore ad amministratore e daccapo. L'ultimo amministratore non si può
declassare (nemmeno ad approvatore): resterebbe un'azienda senza nessuno che
azzera, sincronizza o ripristina.

Se il progetto esisteva già, prima di `07` vanno rieseguiti nell'ordine `01`
(la colonna `ruolo` e il suo vincolo), `02`, `03`, `04` e `06` (i fascicoli dei
PDF: `registra_documento` ha tre argomenti in più e la vecchia firma viene
tolta). `02` e `03` vanno rilanciati **anche su un progetto già aggiornato**:
è lì che sta la correzione di `imposta_operatore` e il terzo ruolo.

> Sul progetto in produzione questo è **già stato fatto** il 2026-09-09
> (migrazioni `ruoli_25a_*`). Quanto segue serve solo a un progetto nuovo, o se
> si rilanciano gli script da capo — cosa sempre possibile: sono tutti
> `create or replace`.

Subito dopo, dall'SQL Editor, **controllare che nessuna riga sia finita alla
persona sbagliata** (era possibile finché il difetto era aperto):

```sql
select nome, email, ruolo, ultimo_accesso from public.operatori order by nome;
```

Ogni riga deve avere la casella di quella persona. Se una non torna — o se non
compare più nessun amministratore — si sistema a mano: `delete` della riga
sbagliata, poi la persona rientra nel tracker (la riga si ricrea da sola al
login) e la si rinomina con `07-ruoli.sql`.

## 3. Il primo travaso dell'anagrafica

Sul PC dell'ufficio, crea `app/cloud.json`:

```json
{
  "supabase_url": "https://xxxxxxxx.supabase.co",
  "service_key": "eyJ...la chiave service_role..."
}
```

Poi, sempre da lì:

```bash
python app/push_cloud.py
```

Deve rispondere qualcosa come
`ok  545 service, 319 clienti, 545 nuovi, 0 chiusi, ...`.
Ogni esecuzione lascia una riga in `data/push_cloud.log`.

Per vedere cosa manderebbe senza mandare niente: `python app/push_cloud.py --prova`.

## 4. Che giri da solo, ogni giorno

Sul PC dell'ufficio, doppio clic su **`cloud/installa-sync-cloud.cmd`**.

Crea un'operazione pianificata di Windows che ogni mattina alle **08:15** legge
il `.accdb` e manda clienti e service a Supabase. Non serve essere
amministratore e non serve salvare nessuna password: gira come l'utente
collegato. Se alle 08:15 il PC era spento, parte appena si accende invece di
saltare il giorno.

Lo stesso file, rilanciato, propone di **togliere** la sincronia.

Per forzare un aggiornamento a mano in qualsiasi momento: `cloud/sync-cloud.cmd`.

## 5. Netlify

1. Metti la cartella su un repository (GitHub/GitLab) — **senza**
   `app/cloud.json`, senza i due `.accdb` e senza `data/`.
2. Netlify → **Add new site → Import an existing project**. Non toccare le
   impostazioni di build: le legge da `netlify.toml` (pubblica `web/`, nessun
   npm, nessun bundler).
3. **Site settings → Environment variables**, due voci:
   - `SUPABASE_URL` = il Project URL
   - `SUPABASE_ANON_KEY` = la chiave **anon public**
4. **Deploy**. In pubblicazione, `cloud/netlify-build.sh` scrive
   `web/js/nuvola-config.js` con quei due valori: è l'unico interruttore fra
   modalità locale e modalità online.

Se cambi le variabili, rilancia il deploy: il file viene riscritto solo allora.

### Provare online senza spendere crediti

Netlify conta **15 crediti per ogni deploy di produzione**, cifra fissa: un
build da tre secondi come quello di qui costa quanto uno da otto minuti. Il
piano gratuito ne da' 300 al mese, cioe' una ventina di pubblicazioni. I
**Deploy Preview** invece costano **0**.

Quindi il lavoro non si prova mai pubblicando su `main`:

```
git checkout -b nome-parlante
git add -A && git commit -m "..."
git push -u origin nome-parlante
```

Il push stampa un indirizzo `.../pull/new/nome-parlante`: aprilo e premi
**Create pull request** (la CLI `gh` su questa macchina non c'e', si fa dal
sito).

Netlify commenta la pull request con
`https://deploy-preview-N--cronoservices-tracker.netlify.app`: e' il sito
completo, collegato allo stesso Supabase di produzione. Ogni push successivo sul
branch ricostruisce l'anteprima, sempre a costo zero: si puo' iterare quanto
serve. Quando va bene, **Merge pull request** dalla pagina di GitHub: quello e'
il solo momento in cui parte un deploy di produzione.

Due avvertenze:

- le due variabili d'ambiente devono valere per **tutti i deploy context**, non
  solo "Production", altrimenti `netlify-build.sh` si ferma sul controllo di
  `SUPABASE_URL` e l'anteprima non nasce;
- l'indirizzo dell'anteprima e' **pubblico**: chi ha il link entra. Ci finisce
  solo la chiave `anon`, che e' pubblica anche in produzione, ma vale sapere che
  non c'e' una serratura davanti.

**L'anteprima usa il database vero.** Le spunte messe provando restano nel
Supabase di produzione: per provare i dati, non solo l'aspetto, cancella dopo o
lavora su righe di prova.

---

## 5-bis. Dopo la 28a sessione (2026-09-10): azzerare il diario

Vanno rieseguiti, in quest'ordine, **`03-letture.sql`** e poi
**`04-sicurezza.sql`**. Il `03` aggiunge `azzera_diario()` (solo
l'amministratore, butta tutte le righe di `eventi`); il `04` le da' l'EXECUTE,
senza il quale la funzione c'e' ma nessuno la puo' chiamare.

Finche' non si fanno, la voce *Azzera il diario attivita'* nel menu Azioni
risponde "rotta sconosciuta" online, mentre in locale funziona subito. Nient'
altro cambia: `04` si puo' rilanciare da solo senza rompere i documenti (il
blocco che ridà l'EXECUTE al `06` c'e' apposta).

Se la voce risponde **"DELETE requires a WHERE clause"**, il `03` in Supabase
e' la prima stesura: rieseguilo. Supabase carica *pg-safeupdate* sulla
connessione di PostgREST, e quell'estensione rifiuta ogni `DELETE` senza
clausola anche dentro una funzione `security definer`. La versione buona
cancella con `where id > 0`.

Le spunte, le note e i PDF non si toccano: sparisce la storia, non il lavoro.
Spariscono pero' anche i **Ripristina**, che leggono proprio quelle righe.

---

## 6. I PDF dei generatori (schede tecnici e registro componenti)

Il generatore di schede (`/schede/`) alla stampa consegna il PDF al tracker.
Online serve una tabella e un bucket in piu': **SQL Editor** → esegui
`06-documenti.sql`, poi **riesegui `03-letture.sql`** (il bootstrap ora porta
anche i documenti dell'anno). Il bucket `documenti` nasce da solo, privato, solo
PDF fino a 200 MB. I file si leggono con indirizzi firmati che durano otto ore.

Finche' il 06 non e' eseguito, il tracker online funziona come prima e il
generatore dice "Non salvato" quando prova a consegnare.

**Dopo la 24a sessione (2026-09-09) va rieseguito `06`**: aggiunge
`elimina_documenti(p_anno, p_id_service)`, la cancellazione in blocco dei PDF
per liberare spazio (un anno intero solo per l'amministratore, un sito per
chiunque). Finche' non si fa, i due bottoni nuovi - *Spazio dei PDF* nelle
Impostazioni e *Elimina tutti* nel cassetto - rispondono "rotta sconosciuta"
online, mentre in locale funzionano subito. Gli oggetti nel bucket li cancella
il client prima della chiamata: e' lo stesso ordine di `elimina_documento`, e
serve a non lasciare file orfani, che sono proprio lo spazio da liberare.

**Dopo la 29a sessione (2026-09-11) vanno eseguiti, in ordine: `06-documenti.sql`
(di nuovo) e `08-dizionario.sql` (nuovo).** Il 06 aggiunge la colonna
`documenti.tipo` (`'schede'` | `'registro'`) e la nuova firma di
`registra_documento(..., p_tipo)`: il generatore del REGISTRO DEI COMPONENTI
(`/registro/`, il documento per il cliente) archivia il suo PDF sul sito
**senza** mettere la spunta "stampata", e il tracker lo mostra con un'icona sua
(libretto). Il 08 crea `dizionario_componenti` (codice articolo -> nome
leggibile + priorita' nel quadro d'insieme), le due RPC `app_dizionario()` e
`imposta_voce_dizionario(...)`, e semina le 24 voci che l'ufficio aveva gia'
costruito col programma locale. Finche' il 06 nuovo non e' eseguito, la
consegna del registro online risponde "funzione non trovata" (la firma con
`p_tipo` non esiste ancora); finche' il 08 non c'e', il generatore del registro
si apre ma la scheda *Nomi dei componenti* dice "rotta sconosciuta" e il
documento usa le descrizioni del gestionale.

### Il tetto per file: 200 MB, e i tre posti dove vive

**Il tetto e' nostro, non del piano.** L'organizzazione e' sul **Pro**: lo
Storage sono 100 GB inclusi (poi 0,021 $/GB) e l'egress 250 GB/mese, quindi ne'
lo spazio ne' il traffico sono il vincolo - a 108 MB per cinque documenti ci
stanno ~4.500 PDF di questa taglia. Chiarimento che vale la pena scrivere,
perche' e' un fraintendimento facile: **i 100 GB non sono un contenitore
diverso** in cui spostare i file. Lo Storage e' un'unica quota
dell'organizzazione e il bucket `documenti` e' gia' quello giusto: al bucket si
cambia solo il limite **per file**. Niente secondo bucket, niente migrazioni.

Il numero vive in **tre** posti e vanno tenuti allineati:

| dove | valore | chi lo cambia |
|---|---|---|
| `file_size_limit` del bucket, in `06-documenti.sql` | `209715200` (200 MB) | riesegui il 06 |
| `MAX_PDF` in `app/api.py` (#ANCHOR: documenti) | `200 * 1024 * 1024` | e' nel repo |
| **Global file size limit** del progetto | **250 MB** | **a mano**, dashboard → Storage → Settings |

Il **globale ha la precedenza** sul bucket: se resta sotto, alzare il bucket
non serve a niente. Percio' si alza prima quello, e lo si tiene un po' piu' su
(250), cosi' il tetto che decide davvero resta quello del bucket - che sta in
un file versionato invece che in una casella del pannello. Sul Pro il globale
si puo' portare fino a 500 GB: 250 MB e' una scelta, non un massimo.

Perche' proprio 200 MB: a 288 dpi un PDF pesa ~251 KB a pagina (misurato: 28,4
MB per 116 pagine), quindi 200 MB sono ~800 pagine. Un tetto ci deve restare -
senza, un errore del generatore caricherebbe qualunque cosa - ma e' un
paracadute, non un obiettivo: il caricamento e' un POST unico, non
ripristinabile, e a 200 MB su una linea d'ufficio e' lungo e se cade riparte da
zero. **La qualita' non si tocca**: i 288 dpi di `ponte.js` (`SCALA`) sono
risoluzione da stampa e restano, lo spazio non e' piu' il problema.

### File orfani nel bucket: come si trovano e come si buttano

Un **orfano** e' un oggetto nel bucket senza la sua riga in `public.documenti`:
occupa spazio e nell'app non si vede, perche' l'app mostra le righe, non il
bucket. Dalla 26a sessione il salvataggio non ne fabbrica piu' (se la
registrazione fallisce, `salvaDocumento` disfa il caricamento), ma il controllo
resta utile dopo un lavoro sull'SQL. Dall'SQL Editor, in sola lettura:

```sql
select o.name,
       round((o.metadata->>'size')::bigint / 1048576.0, 1) as mb,
       o.created_at
  from storage.objects o
  left join public.documenti d on d.percorso = o.name
 where o.bucket_id = 'documenti' and d.id is null
 order by o.created_at;
```

**Come si cancellano: dal pannello, non con una DELETE.** Togliere la riga da
`storage.objects` in SQL lascia il file vero dov'e' e lo spazio non si libera.
Si va su **Storage → `documenti`**, si apre la cartella, si selezionano e si usa
*Delete*. In alternativa, dall'app: se il file avesse la sua riga, *Elimina* nel
cassetto farebbe le due cose nell'ordine giusto - ma un orfano la riga non ce
l'ha, ed e' proprio per questo che va preso dal pannello.

**Dopo la 20a sessione (2026-09-09) vanno rieseguiti tutti e due**, `06` e poi
`03`: il bootstrap porta `celle_prec` (le celle dell'anno prima, per i passi
che si accumulano) e i documenti di **tutti** gli anni (`_documenti_json(null)`);
`06` porta anche i grant delle tre funzioni dei documenti che la 19a sessione
aveva trovato mancanti. Finche' non si fa, online i passi si accumulano solo
dentro l'anno e i PDF restano quelli dell'anno: il client tollera l'assenza
di `celle_prec`. "Chi ha aperto cosa" (l'anello col colore del collega) viaggia
in broadcast Realtime sul canale gia' aperto e non chiede SQL.

## Cosa cambia, usandola online

| | locale | online |
|---|---|---|
| chi firma la spunta | un nome scritto a mano | la casella del login |
| modifiche degli altri | SSE dal server | Realtime, con ripiego a interrogazione ogni 15 s se il WebSocket non passa |
| voce **Sync** in Azioni | legge il `.accdb` subito | dice che il `.accdb` non è raggiungibile e lo legge il PC dell'ufficio una volta al giorno |
| CSV | download dal server | composto nel browser, stesso file |
| coda offline, conflitti, presenza | identici | identici |

Una differenza voluta: nel conteggio delle **spunte orfane** (spunte su mesi che
in Access non sono più di manutenzione) qui entra anche il quarto passo
`ricambi`, che `sync.py` non guardava. È il conteggio giusto — quindi il numero
in `sync_log` può essere leggermente più alto di quello locale.

## Se qualcosa non va

**La pagina resta sulla maschera di accesso e dice "casella non abilitata".**
L'utente esiste ma il suo indirizzo non finisce in `@vrs-tech.it`. Nessuna
eccezione: è la regola di `autorizzato()`.

**Entro, ma la griglia è vuota.** L'anagrafica non è mai arrivata: fai il punto
3 dal PC dell'ufficio.

**Le spunte degli altri non compaiono da sole.** Il WebSocket non passa
(succede dietro certi proxy d'ufficio). L'applicazione se ne accorge da sola
dopo quattro tentativi e passa a chiedere le celle cambiate ogni 15 secondi: si
continua a lavorare, con qualche secondo di ritardo.

**L'anagrafica online è ferma a ieri l'altro.** Guarda `data/push_cloud.log` sul
PC dell'ufficio: c'è una riga per esecuzione, `ok ...` o `ERRORE ...`.

**Dopo un'esecuzione del SQL le chiamate rispondono "function not found".**
PostgREST tiene in memoria l'elenco delle funzioni. In SQL Editor:
`notify pgrst, 'reload schema';`

**Il progetto Supabase si è messo in pausa.** Il piano gratuito sospende i
progetti fermi da una settimana. Il travaso giornaliero basta a tenerlo sveglio:
se è successo, vuol dire che la sincronia non sta girando.
