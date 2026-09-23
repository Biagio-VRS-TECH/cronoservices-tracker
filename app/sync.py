"""Import da Access -> cache SQLite. #ANCHOR: sync

Catena: export_access.ps1 (ADODB, sola lettura) -> JSON temporaneo -> upsert qui.
Motivo del passaggio da PowerShell: l'unico driver Access presente sulla macchina e'
Microsoft.ACE.OLEDB.12.0, raggiungibile da COM senza installare pyodbc.

Ogni sync: backup del .db, diff riassuntivo (nuovi/chiusi/mesi cambiati/spunte
orfane) scritto in sync_log e restituito al client per la notifica.
"""
import datetime, glob, json, os, shutil, sqlite3, subprocess, tempfile, unicodedata, uuid
import db

ACCESS_MESI = ["Gen", "Feb", "Mar", "Apr", "Mag", "Giu",
               "Lug", "Ago", "Sett", "Ott", "Nov", "Dic"]


def _norm(s):
    """Nomi campo Access accentati -> ascii minuscolo. Es. Citta accentata -> citta."""
    s = unicodedata.normalize("NFKD", str(s))
    return "".join(ch for ch in s if not unicodedata.combining(ch)).lower()


def _row(d):
    return {_norm(k): v for k, v in d.items()}


def _si(v):
    return 1 if str(v or "").strip().lower() in ("si", "s", "true", "1", "-1", "yes") else 0


def _int(v):
    try:
        return int(str(v).strip())
    except (TypeError, ValueError):
        return None


def _txt(v):
    if isinstance(v, str):
        v = v.strip()
    return v if v else None


_FORMATI_DATA = ("%Y-%m-%d", "%d/%m/%Y", "%d-%m-%Y", "%d.%m.%Y")


def _data(v):
    """Una data dell'export -> 'AAAA-MM-GG', o None se non e' una data.
    export_access.ps1 le scrive gia' cosi', ma a valle (_scad_effettiva, il
    CSV, stato.js, sync_applica su Postgres) si leggono come AAAA-MM-GG e
    basta: un '31/12/2025' arrivato tale e quale faceva fallire il CSV di
    tutti, e Postgres puo' leggere '01/02/2025' come 2 gennaio. Si accetta
    anche un orario in coda ('2025-12-31T00:00:00', '31/12/2025 00:00')."""
    t = _txt(v)
    if not isinstance(t, str):
        return None
    t = t.replace("T", " ").split(" ")[0]
    for f in _FORMATI_DATA:
        try:
            d = datetime.datetime.strptime(t, f).date()
        except ValueError:
            continue
        return d.isoformat() if d.year >= 1900 else None     # '1/2/25' non e' l'anno 25
    return None


def _righe(x):
    """PowerShell 5.1 srotola una tabella con UNA riga sola: ConvertTo-Json
    scrive un oggetto invece di una lista, e iterarlo dava le sue chiavi."""
    if isinstance(x, dict):
        return [x]
    return [r for r in (x or []) if isinstance(r, dict)]


def normalizza(payload):
    """Payload dell'export -> (clienti, services), liste di dict con i nomi di
    colonna di SQLite (che sono anche quelli di Postgres). UN posto solo per le
    regole, usato da esegui() qui sotto e da push_cloud.righe(): la bitmask dei
    mesi in ordine Gen..Dic, lo stato in maiuscolo, i service senza IDService
    saltati, e solo i clienti che hanno almeno un service (gli altri 8000
    dell'anagrafica qui non servono)."""
    servs, usati = [], set()
    for raw in _righe(payload.get("services")):
        s = _row(raw)
        sid = _int(s.get("idservice"))
        if sid is None:
            continue
        cid = _int(s.get("idcliente")) or 0
        servs.append({
            "id_service": sid,
            "id_cliente": cid,
            "tipo": _txt(s.get("tipo")),
            "stato": (s.get("stato") or "").strip().upper(),
            "destinazione": _txt(s.get("destinazione")),
            "localita": _txt(s.get("localita")),
            "provincia": _txt(s.get("provincia")),
            "mappatura": _si(s.get("mappatura")),
            "subappalto": _si(s.get("subappalto")),
            "n_contratto": _txt(s.get("ncontratto")),
            "data_inizio": _data(s.get("datainizio")),
            "data_scadenza": _data(s.get("datascadenza")),
            "cadenza": _txt(s.get("cadenza")),
            "qva": _int(s.get("qva")),
            "causale_rinnovo": _txt(s.get("causalerinnovo")),
            "rinnovo_auto": _si(s.get("rinnovoautomatico")),
            "mesi": "".join("1" if _si(s.get(_norm(m))) else "0" for m in ACCESS_MESI),
            "note": _txt(s.get("note")),
        })
        usati.add(cid)

    cli = []
    for raw in _righe(payload.get("clienti")):
        k = _row(raw)
        cid = _int(k.get("idcliente"))
        if cid is None or cid not in usati:
            continue
        cli.append({
            "id_cliente": cid,
            "rag_soc": (k.get("ragsoc") or "").strip(),
            "indirizzo": _txt(k.get("indirizzo")),
            "cap": _txt(k.get("cap")),
            "citta": _txt(k.get("citta")),
            "provincia": _txt(k.get("provincia")),
            "telefono": _txt(k.get("telefono")),
            "email": _txt(k.get("email")),
            "non_utilizzabile": _si(k.get("nonutilizzabile")),
        })
    return cli, servs


# L'ordine delle colonne negli INSERT di esegui()
COL_SERVICES = ("id_service", "id_cliente", "tipo", "stato", "destinazione", "localita",
                "provincia", "mappatura", "subappalto", "n_contratto", "data_inizio",
                "data_scadenza", "cadenza", "qva", "causale_rinnovo", "rinnovo_auto",
                "mesi", "note")
COL_CLIENTI = ("id_cliente", "rag_soc", "indirizzo", "cap", "citta", "provincia",
               "telefono", "email", "non_utilizzabile")


def estrai(cfg, base):
    """Lancia l'export PowerShell e ritorna il payload JSON.

    IL FILE ACCESS NON SI APRE MAI DOV'E' (#ANCHOR: copia-access). Dal 2026-09-09
    il backend sta sulla rete (\\\\192.168.1.220\\DATI\\AMMNE\\TECH\\CronoServices) e il
    committente vuole che quel file non venga toccato in nessun modo: nemmeno il
    lock `.laccdb` che il motore Jet crea accanto al file quando lo apre, anche
    in sola lettura. Quindi si copia byte per byte in una cartella temporanea
    locale (copyfile: solo il contenuto, niente attributi), e' la COPIA che
    PowerShell apre, e la copia si butta a fine lavoro. Sul file originale si
    fa una sola cosa: leggerlo per copiarlo."""
    accdb = os.path.abspath(os.path.join(base, cfg["accdb_backend"]))
    if not os.path.exists(accdb):
        raise RuntimeError("Backend Access non trovato: %s" % accdb)
    ps1 = os.path.join(base, "export_access.ps1")
    # Nomi unici per ogni estrazione, non solo per processo: il sync all'avvio,
    # un /api/sync e il push_cloud delle 08:15 possono girare insieme, e con un
    # JSON dal nome fisso uno cancellava (o leggeva a meta') quello dell'altro.
    unico = "%d_%s" % (os.getpid(), uuid.uuid4().hex[:8])
    tmp = os.path.join(tempfile.gettempdir(), "cronoservice_export_%s.json" % unico)
    copia = os.path.join(tempfile.gettempdir(), "cronoservice_be_copia_%s.accdb" % unico)
    try:
        try:
            shutil.copyfile(accdb, copia)
            cmd = ["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass",
                   "-File", ps1, "-Accdb", copia, "-Out", tmp]
            # PowerShell scrive nella codepage OEM (cp850), non in cp1252: con
            # la decodifica di default una 'i' accentata (0x8D) faceva morire il
            # thread che legge stderr, e l'errore vero diventava "None"
            p = subprocess.run(cmd, capture_output=True, text=True, timeout=300,
                               encoding="oem" if os.name == "nt" else None,
                               errors="replace")
        finally:
            for f in (copia, copia[:-6] + ".laccdb"):
                try:
                    os.remove(f)
                except OSError:
                    pass
        if not os.path.exists(tmp):
            raise RuntimeError("Export Access fallito.\n%s\n%s" % (p.stdout, p.stderr))
        with open(tmp, encoding="utf-8-sig") as f:
            d = json.load(f)
    finally:
        # anche se PowerShell va in timeout dopo aver scritto il JSON:
        # l'anagrafica non resta in %TEMP%
        try:
            os.remove(tmp)
        except OSError:
            pass
    d["sorgente"] = accdb          # nel log deve comparire il file vero, non la copia
    return d


def backup(cfg, base):
    """Copia dell'archivio IN USO (db.init), non per forza quello di
    config.json: con `server.py --db copia.db` si copiava l'archivio vero (o
    niente, se mancava) e la copia su cui si lavorava restava senza backup.
    Si usa il backup di SQLite, non la copia del file: prende anche quello che
    e' ancora nel WAL (con un lettore aperto il checkpoint non lo riporta nel
    .db) e da' una fotografia coerente."""
    src = db._DB_PATH or os.path.abspath(os.path.join(base, cfg["sqlite_path"]))
    if not os.path.exists(src):
        return None
    d = os.path.abspath(os.path.join(base, cfg["backup_dir"]))
    os.makedirs(d, exist_ok=True)
    dst = os.path.join(d, "cronoservice_%s.db" % db.now().replace(":", "").replace("-", ""))
    tmp = dst + ".tmp"           # fuori dal glob della rotazione finche' non e' completa
    with db.WRITE_LOCK:
        sorgente = sqlite3.connect(src, timeout=15)
        try:
            copia = sqlite3.connect(tmp)
            try:
                sorgente.backup(copia)
            finally:
                copia.close()
        finally:
            sorgente.close()
    os.replace(tmp, dst)
    # almeno una: con 0, [:-0] era [] e non si cancellava piu' niente
    tieni = max(1, int(cfg.get("backup_da_tenere", 20)))
    for f in sorted(glob.glob(os.path.join(d, "cronoservice_*.db")))[:-tieni]:
        try:
            os.remove(f)
        except OSError:
            pass
    return dst


def esegui(cfg, base):
    """Sync completo. Ritorna il dizionario di riepilogo."""
    payload = estrai(cfg, base)
    # Un export vuoto (tabella non letta, copia troncata) avrebbe archiviato
    # TUTTI i service in un colpo. Il gemello online (sync_applica in
    # cloud/05-sync.sql) e push_cloud.main lo rifiutano gia': qui uguale.
    cli_d, servs_d = normalizza(payload)
    if not servs_d:
        raise RuntimeError("Access non ha restituito nessun service: sync annullato.")
    backup(cfg, base)
    ts = db.now()
    det = []
    cnt = dict(nuovi=0, riaperti=0, chiusi=0, mesi_cambiati=0, archiviati=0, spunte_orfane=0)

    with db.WRITE_LOCK:
        c = db.connect()
        try:
            c.execute("BEGIN IMMEDIATE")
            prima = {r["id_service"]: r for r in
                     c.execute("SELECT id_service, stato, mesi, archiviato FROM services")}

            # tuple nell'ordine di COL_SERVICES, piu' visto_il in coda
            servs = [tuple(s[k] for k in COL_SERVICES) + (ts,) for s in servs_d]

            c.executemany("""
                INSERT INTO services(id_service,id_cliente,tipo,stato,destinazione,localita,
                    provincia,mappatura,subappalto,n_contratto,data_inizio,data_scadenza,
                    cadenza,qva,causale_rinnovo,rinnovo_auto,mesi,note,visto_il)
                VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
                ON CONFLICT(id_service) DO UPDATE SET
                    id_cliente=excluded.id_cliente, tipo=excluded.tipo, stato=excluded.stato,
                    destinazione=excluded.destinazione, localita=excluded.localita,
                    provincia=excluded.provincia, mappatura=excluded.mappatura,
                    subappalto=excluded.subappalto, n_contratto=excluded.n_contratto,
                    data_inizio=excluded.data_inizio, data_scadenza=excluded.data_scadenza,
                    cadenza=excluded.cadenza, qva=excluded.qva,
                    causale_rinnovo=excluded.causale_rinnovo,
                    rinnovo_auto=excluded.rinnovo_auto, mesi=excluded.mesi,
                    note=excluded.note, visto_il=excluded.visto_il, archiviato=0
            """, servs)

            # Solo i clienti con almeno un service: gli altri 8000+ non servono qui.
            cli = [tuple(k[x] for x in COL_CLIENTI) for k in cli_d]
            c.executemany("""
                INSERT INTO clienti(id_cliente,rag_soc,indirizzo,cap,citta,provincia,
                    telefono,email,non_utilizzabile)
                VALUES(?,?,?,?,?,?,?,?,?)
                ON CONFLICT(id_cliente) DO UPDATE SET
                    rag_soc=excluded.rag_soc, indirizzo=excluded.indirizzo, cap=excluded.cap,
                    citta=excluded.citta, provincia=excluded.provincia,
                    telefono=excluded.telefono, email=excluded.email,
                    non_utilizzabile=excluded.non_utilizzabile
            """, cli)

            for s in servs:
                sid, stato, mesi = s[0], s[3], s[16]
                old = prima.get(sid)
                if old is None:
                    cnt["nuovi"] += 1
                    continue
                if old["stato"] != stato:
                    if stato == "CHIUSO":
                        cnt["chiusi"] += 1
                        det.append("#%d chiuso" % sid)
                    else:
                        cnt["riaperti"] += 1
                        det.append("#%d riaperto (%s)" % (sid, stato))
                if old["mesi"] != mesi:
                    cnt["mesi_cambiati"] += 1
                    det.append("#%d mesi %s -> %s" % (sid, old["mesi"], mesi))

            # solo quelli spariti in QUESTO giro, come sync_applica online
            # (cloud/05-sync.sql): prima ogni sync riscriveva nel dettaglio
            # anche i service archiviati da mesi
            visti = {s[0] for s in servs}
            spariti = [i for i in prima if i not in visti and not prima[i]["archiviato"]]
            cnt["archiviati"] = len(spariti)
            if spariti:
                c.executemany("UPDATE services SET archiviato=1 WHERE id_service=?",
                              [(i,) for i in spariti])
                det.append("archiviati: %s" % ", ".join("#%d" % i for i in spariti[:20]))

            # Spunte su mesi che in Access non sono piu' di manutenzione: si conservano
            # (sono lavoro fatto) ma vanno segnalate; l'interfaccia le marca "orfane".
            cnt["spunte_orfane"] = c.execute("""
                SELECT COUNT(*) FROM mappature m JOIN services s USING(id_service)
                WHERE substr(s.mesi, m.mese, 1) <> '1'
                  AND (m.stampata OR m.controllata OR m.corretta OR m.ricambi)
            """).fetchone()[0]

            c.execute("""INSERT INTO sync_log(ts,clienti,services,nuovi,riaperti,chiusi,
                         mesi_cambiati,spunte_orfane,dettaglio)
                         VALUES(?,?,?,?,?,?,?,?,?)""",
                      (ts, len(cli), len(servs), cnt["nuovi"], cnt["riaperti"],
                       cnt["chiusi"], cnt["mesi_cambiati"], cnt["spunte_orfane"],
                       "\n".join(det[:200])))
            db.set_meta(c, "ultimo_sync", ts)
            c.execute("COMMIT")
            n_cli, n_srv = len(cli), len(servs)
        except Exception:
            c.execute("ROLLBACK")
            raise
        finally:
            c.close()

    return dict(ts=ts, clienti=n_cli, services=n_srv, dettaglio=det[:200], **cnt)


if __name__ == "__main__":
    base = os.path.dirname(os.path.abspath(__file__))
    with open(os.path.join(base, "config.json"), encoding="utf-8") as f:
        cfg = json.load(f)
    db.init(os.path.join(base, cfg["sqlite_path"]))
    print(json.dumps(esegui(cfg, base), ensure_ascii=False, indent=2))
