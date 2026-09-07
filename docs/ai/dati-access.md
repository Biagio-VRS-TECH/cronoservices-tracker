# Dati Access — schema, valori reali, trappole

Rilevato il 2026-09-04 sondando i due .accdb. **Non ri-sondare: usa questo file.**

## I due file

- `CronoServices_be.accdb` — backend, 20 tabelle dati. **L'unico che leggiamo.**
- `CronoServices_1_5_41.accdb` — frontend Access: 58 query salvate + 20 tabelle
  collegate al backend. Non lo usiamo, ma le sue query documentano le regole di
  business (vedi sotto).

Accesso: provider **`Microsoft.ACE.OLEDB.12.0`** via COM ADODB da PowerShell
(64 bit, presente sulla macchina). `pyodbc` non e' installato e non serve.

## tServices — la sorgente delle mappature

58 colonne; ci interessano:

| colonna | tipo | valori reali |
|---|---|---|
| `IDService` | Long | chiave |
| `IDCliente` | Long | -> `tClienti.IDCliente` |
| `Tipo` | Testo | `GAS TECNICI` 288, `GAS MEDICALE` 254, `CARRELLI MOBILI` 2, ` SRL` 1 |
| `Stato` | Testo(6) | `APERTO` 274, `CHIUSO` 271 (maiuscolo nei dati; le query Access confrontano con `"aperto"` minuscolo — Access e' case-insensitive, **SQLite no**: in `sync.py` si normalizza con `.upper()`) |
| `Gen`…`Dic` | **Testo(2)** | `"Si"` / `"No"` / **NULL**. Non booleani! Nel 2026: 187 NULL, 304 `No`, 54 `Si` sulla sola colonna `Gen` |
| `Mappatura` | Testo(2) | `Si` 132, `No` 413. Indica se il service prevede mappatura |
| `IDCadenza` | Long | -> `tCadenza` |
| `DataInizio`, `DataScadenza` | Data | finestra contrattuale: **serve a dare senso all'anno**, vedi [anno-e-tempo.md](anno-e-tempo.md) |
| `IDCausaleRinnovo` | Long | -> `tCausaliRinnovo` (`RinnovoAutomatico` Si/No) |
| `Destinazione`, `Localita`, `Provincia`, `NContratto`, `DataInizio`, `DataScadenza`, `Note`, `Subappalto` | | anagrafica del sito |

**Il nome della colonna di settembre e' `Sett`, non `Set`.** Ordine reale:
`Gen Feb Mar Apr Mag Giu Lug Ago Sett Ott Nov Dic` (costante `ACCESS_MESI` in
`sync.py`). Nell'interfaccia si mostra `Set`.

I 12 mesi diventano una bitmask di 12 caratteri in `services.mesi`
(es. `"000010000010"` = maggio e novembre).

Incrocio Stato x Mappatura x Tipo:

```
APERTO No  CARRELLI MOBILI   2      CHIUSO No   SRL              1
APERTO No  GAS MEDICALE     70      CHIUSO No  GAS MEDICALE    109
APERTO No  GAS TECNICI     134      CHIUSO No  GAS TECNICI      97
APERTO Si  GAS MEDICALE     25      CHIUSO Si  GAS MEDICALE     50
APERTO Si  GAS TECNICI      43      CHIUSO Si  GAS TECNICI      14
```

**Decisione del committente:** le spunte compaiono su **tutti** i 274 service
aperti, non solo sui 68 con `Mappatura = Si`. Il campo `Mappatura` **non si mostra
piu'** (2026-09-07): il committente ha chiarito che quel Si/No registrava un
controllo fatto in passato, non "questo service ha una mappatura" - sono tutte
mappature. La colonna resta importata in `services.mappatura` (costa zero e viene
da Access), ma bollo `MAP`, filtro "Solo mappatura", riga nel cassetto e colonna
CSV sono stati rimossi.

## tClienti

8496 righe, ma solo **319** hanno almeno un service: `sync.py` importa solo
quelle. Colonne: `IDCliente, RagSoc, Indirizzo, CAP, Città, Provincia, Telefono,
Fax, eMail, PI, CF, LegaleRappr, DaEliminare, NonUtilizzabile`.

I booleani arrivano come stringhe `"True"` / `"False"`.

## tCadenza

`IDCadenza, Cadenza, OQG (giorni), QVA (visite/anno)`:

```
1 Giornaliera 1/365   2 Mensile 30/12       3 Bimestrale 60/6
4 Trimestrale 90/4    5 Semestrale 180/2    6 Annuale 365/1
7 Quadrimestrale 120/3  8 Quarantacinquegg 45/8
```

`QVA` serve al controllo di coerenza: numero di mesi a `Si` dovrebbe essere = QVA.
Nei loro dati 9 service aperti non tornano. Lo diceva il pannello "Mesi
diversi dalla cadenza" della vista Controlli, rimosso alla 7a sessione
insieme alla vista alla 8a: il conto sta ancora in `GET /api/incongruenze`,
che nessuno chiama piu'.

## tCausaliRinnovo

`IDCausaleRinnovo, CausaleRinnovo(75), RinnovoAutomatico(Si/No), GGRinnovo`.
Importata in `services.causale_rinnovo` / `services.rinnovo_auto`.

Sui 545 service: 229 con rinnovo automatico
("ANNUALE/BIENNALE/TRIENNALE CON RINNOVO AUTOMATICO ALLA SCADENZA"), 250 con
"RINNOVO DA RICHIEDERE ALLA SCADENZA", 21 con partecipazione a gara, 29 senza
causale.

Finestre contrattuali reali dei service **aperti**: `DataInizio` dal 2016 al 2027,
`DataScadenza` dal 2024 al 2031, con 149 in scadenza nel 2026. E' per questo che
la proiezione del futuro ha senso: nel 2027 meta' del lavoro e' una stima.

L'`export_access.ps1` fa la doppia LEFT JOIN con parentesi, come pretende Jet:
`FROM (tServices s LEFT JOIN tCadenza c ON ...) LEFT JOIN tCausaliRinnovo r ON ...`.

## Altre tabelle del backend (non usate, per orientamento)

`tAnni, tAvvisiScadenza, tCausaliRinnovo, tClientiNoErgo, tContratto, tDisdette,
tDocCorr, tMesi, tNCM, tOpzNRC, tProgVisite, tProposte, tRapportiIntervento,
tTeamTecnici, tTecnici, tTipiInterventi, tVerificaIncongruenze`.

`tProgVisite` (visite programmate con data) e `tRapportiIntervento` sono la
naturale estensione futura: oggi non entrano nella checklist mappature.

## Query Access che documentano le regole

- `qContaServices` — mesi dei soli `Stato="APERTO"`. E' esattamente il nostro
  perimetro.
- `qGen`…`qDic` — un mese alla volta: `WHERE Gen="Si" AND Stato="aperto"`.
- `qVerificaIncongruenze` — somma dei 12 flag confrontata con `QVA`. Ripreso in
  `api.incongruenze()`.
- `qMedAperto` / `qIndustrAperto` — split per `Tipo`. Ripreso come filtro tipo.

## Trappole verificate (costate tempo)

1. **`Nz()` non esiste** fuori da Access: via ADODB da' "Funzione 'Nz' non
   definita". Usare SQL puro e gestire i NULL nel codice chiamante.
2. **Uno script `.ps1` deve restare ASCII puro.** PowerShell 5.1 legge gli `.ps1`
   in ANSI: scrivere `[Città]` nel sorgente lo corrompe e ADO risponde "Nessun
   valore specificato per alcuni parametri necessari" (= colonna inesistente).
   Per questo `export_access.ps1` fa `SELECT * FROM tClienti`: il nome accentato
   arriva dal recordset, non dal sorgente. In Python i nomi campo si normalizzano
   con `unicodedata` (`_norm()` in `sync.py`): `Città` -> `citta`.
3. **Un errore COM in un ciclo PowerShell puo' andare in loop infinito** se si
   continua a leggere un recordset chiuso. Nell'exporter non ci sono cicli di
   ripiego, ma attenzione a introdurne.
4. **L'accentata nella console non e' corruzione del dato**: `UNIVERSIT?` nella
   stampa di un terminale Windows e' solo la code page. Il JSON prodotto e' UTF-8
   corretto (verificato: 0 occorrenze di U+FFFD).
5. Il file `CronoServices_be.laccdb` che appare e sparisce e' il lock di Access:
   normale, la nostra connessione e' in sola lettura e non blocca gli utenti.

## Costo di un sync

Export completo (8496 clienti + 545 service) -> JSON di ~2,8 MB in ~3 s.
Import + diff + backup: totale misurato **2,9 s**. Si puo' lanciare a caldo.
