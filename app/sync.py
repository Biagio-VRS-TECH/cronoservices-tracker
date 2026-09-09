"""Import da Access -> cache SQLite. #ANCHOR: sync

Catena: export_access.ps1 (ADODB, sola lettura) -> JSON temporaneo -> upsert qui.
Motivo del passaggio da PowerShell: l'unico driver Access presente sulla macchina e'
Microsoft.ACE.OLEDB.12.0, raggiungibile da COM senza installare pyodbc.

Ogni sync: backup del .db, diff riassuntivo (nuovi/chiusi/mesi cambiati/spunte
orfane) scritto in sync_log e restituito al client per la notifica.
"""
import glob, json, os, shutil, subprocess, tempfile, unicodedata
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
    tmp = os.path.join(tempfile.gettempdir(), "cronoservice_export.json")
    copia = os.path.join(tempfile.gettempdir(), "cronoservice_be_copia_%d.accdb" % os.getpid())
    try:
        os.remove(tmp)
    except OSError:
        pass
    try:
        shutil.copyfile(accdb, copia)
        cmd = ["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass",
               "-File", ps1, "-Accdb", copia, "-Out", tmp]
        p = subprocess.run(cmd, capture_output=True, text=True, timeout=300)
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
    d["sorgente"] = accdb          # nel log deve comparire il file vero, non la copia
    return d


def backup(cfg, base):
    src = os.path.abspath(os.path.join(base, cfg["sqlite_path"]))
    if not os.path.exists(src):
        return None
    d = os.path.abspath(os.path.join(base, cfg["backup_dir"]))
    os.makedirs(d, exist_ok=True)
    dst = os.path.join(d, "cronoservice_%s.db" % db.now().replace(":", "").replace("-", ""))
    with db.WRITE_LOCK:
        with db.sess() as c:
            c.execute("PRAGMA wal_checkpoint(TRUNCATE)")
        shutil.copy2(src, dst)
    tieni = int(cfg.get("backup_da_tenere", 20))
    for f in sorted(glob.glob(os.path.join(d, "cronoservice_*.db")))[:-tieni]:
        try:
            os.remove(f)
        except OSError:
            pass
    return dst


def esegui(cfg, base):
    """Sync completo. Ritorna il dizionario di riepilogo."""
    payload = estrai(cfg, base)
    backup(cfg, base)
    ts = db.now()
    det = []
    cnt = dict(nuovi=0, riaperti=0, chiusi=0, mesi_cambiati=0, spunte_orfane=0)

    with db.WRITE_LOCK:
        c = db.connect()
        try:
            c.execute("BEGIN IMMEDIATE")
            prima = {r["id_service"]: r for r in
                     c.execute("SELECT id_service, stato, mesi FROM services")}

            servs, usati = [], set()
            for raw in payload["services"]:
                s = _row(raw)
                sid = _int(s.get("idservice"))
                if sid is None:
                    continue
                mesi = "".join("1" if _si(s.get(_norm(m))) else "0" for m in ACCESS_MESI)
                cid = _int(s.get("idcliente")) or 0
                servs.append((sid, cid, _txt(s.get("tipo")),
                              (s.get("stato") or "").strip().upper(),
                              _txt(s.get("destinazione")), _txt(s.get("localita")),
                              _txt(s.get("provincia")), _si(s.get("mappatura")),
                              _si(s.get("subappalto")), _txt(s.get("ncontratto")),
                              _txt(s.get("datainizio")), _txt(s.get("datascadenza")),
                              _txt(s.get("cadenza")), _int(s.get("qva")),
                              _txt(s.get("causalerinnovo")),
                              _si(s.get("rinnovoautomatico")),
                              mesi, _txt(s.get("note")), ts))
                usati.add(cid)

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
            cli = []
            for raw in payload["clienti"]:
                k = _row(raw)
                cid = _int(k.get("idcliente"))
                if cid is None or cid not in usati:
                    continue
                cli.append((cid, (k.get("ragsoc") or "").strip(), _txt(k.get("indirizzo")),
                            _txt(k.get("cap")), _txt(k.get("citta")),
                            _txt(k.get("provincia")), _txt(k.get("telefono")),
                            _txt(k.get("email")), _si(k.get("nonutilizzabile"))))
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

            visti = {s[0] for s in servs}
            spariti = [i for i in prima if i not in visti]
            if spariti:
                c.executemany("UPDATE services SET archiviato=1 WHERE id_service=?",
                              [(i,) for i in spariti])
                det.append("archiviati: %s" % ", ".join("#%d" % i for i in spariti[:20]))

            # Spunte su mesi che in Access non sono piu' di manutenzione: si conservano
            # (sono lavoro fatto) ma vanno segnalate; l'interfaccia le marca "orfane".
            cnt["spunte_orfane"] = c.execute("""
                SELECT COUNT(*) FROM mappature m JOIN services s USING(id_service)
                WHERE substr(s.mesi, m.mese, 1) <> '1'
                  AND (m.stampata OR m.controllata OR m.corretta)
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
    cfg = json.load(open(os.path.join(base, "config.json"), encoding="utf-8"))
    db.init(os.path.join(base, cfg["sqlite_path"]))
    print(json.dumps(esegui(cfg, base), ensure_ascii=False, indent=2))
