"""I PDF archiviati (COD-07, da app/api.py): elenco, salvataggio con la spunta
"stampata", scaricamento e cancellazione (#ANCHOR: documenti).
"""
import base64, os, re, uuid
import db
from api_permessi import _solo_admin
from api_scadenze import _mese_scadenza
from api_spunte import _applica


# -------------------------------------------------------------- documenti ----
# I PDF che il generatore di schede tecnici (web/schede/) produce quando si
# stampa: archiviati per sito e anno, con la spunta "stampata" messa in
# automatico sul mese della mappatura. Il file vive su disco in
# data/documenti/<anno>/, la riga in `documenti`. #ANCHOR: documenti

# Il tetto per file. Gemello di `file_size_limit` del bucket in
# cloud/06-documenti.sql: se cambia uno deve cambiare l'altro, sono i due soli
# posti dove il numero e' scritto. Online c'e' in piu' il *Global file size
# limit* del progetto, che ha la precedenza e sta tenuto piu' alto (250 MB).
MAX_PDF = 200 * 1024 * 1024


def _cartella_documenti():
    d = os.path.join(os.path.dirname(db._DB_PATH), "documenti")
    os.makedirs(d, exist_ok=True)
    return d


def _file_documento(percorso):
    """Il file su disco di una riga di `documenti`, oppure None se il percorso
    esce dalla cartella. Cintura: il percorso lo scrive solo salva_documento, ma
    una riga messa a mano (o un .db ripristinato) con "../" non deve far leggere
    ne' cancellare niente fuori da data/documenti/."""
    base = os.path.abspath(_cartella_documenti())
    p = os.path.abspath(os.path.join(base, str(percorso or "")))
    return p if p.startswith(base + os.sep) else None


def _doc_out(r):
    return dict(id=r["id"], id_service=r["id_service"], anno=r["anno"], mese=r["mese"],
                nome=r["nome"], percorso=r["percorso"], bytes=r["bytes"],
                pagine=r["pagine"], anteprima=r["anteprima"], creato_il=r["creato_il"],
                creato_da=r["creato_da"], gruppo=r["gruppo"], fascicolo=r["fascicolo"],
                fascicoli=r["fascicoli"],
                tipo=(r["tipo"] if "tipo" in r.keys() else None) or "schede")


def _documenti(c, anno=None):
    """Senza anno, tutti: lo storico dei PDF non scade con l'anno."""
    if anno is None:
        return [_doc_out(r) for r in c.execute("SELECT * FROM documenti ORDER BY creato_il")]
    return [_doc_out(r) for r in c.execute(
        "SELECT * FROM documenti WHERE anno=? ORDER BY creato_il", (anno,))]


def documenti(ctx, q, body):
    with db.sess() as c:
        a = str(q.get("anno") or "")
        anno = int(a) if a.isdigit() else None
        return 200, {"anno": anno, "documenti": _documenti(c, anno)}, None


def salva_documento(ctx, q, body):
    """Il generatore ha prodotto un PDF: si archivia il file, si registra la riga
    e si mette la spunta "stampata" sul mese della mappatura del sito (quello
    indicato dal client, altrimenti il mese di scadenza). Riga e spunta stanno
    nella stessa transazione; se salta, il file appena scritto viene tolto."""
    try:
        sid, anno = int(body["id_service"]), int(body["anno"])
    except (KeyError, TypeError, ValueError):
        return 400, {"errore": "id_service e anno obbligatori"}, None
    try:
        dati = base64.b64decode(body.get("pdf") or "", validate=True)
    except (ValueError, TypeError):
        return 400, {"errore": "PDF non leggibile"}, None
    if not dati.startswith(b"%PDF"):
        return 400, {"errore": "il contenuto non e' un PDF"}, None
    # Il gemello di `file_size_limit` del bucket in cloud/06-documenti.sql: il
    # tetto vive in questi due posti e basta, e i due numeri devono restare
    # uguali. 200 MB sono ~800 pagine a 288 dpi. Il messaggio dice cosa fare,
    # non solo cosa e' successo: la via d'uscita e' dividere in fascicoli.
    if len(dati) > MAX_PDF:
        return 413, {"errore": "PDF troppo grande (%d MB, il tetto e' %d MB): "
                               "dividi il documento in fascicoli con la tendina "
                               "del generatore e salva di nuovo."
                               % (len(dati) // (1024 * 1024), MAX_PDF // (1024 * 1024))}, None
    anteprima = body.get("anteprima") or None
    if anteprima and (not str(anteprima).startswith("data:image/jpeg;base64,")
                      or len(anteprima) > 80000):
        anteprima = None
    operatore = body.get("operatore") or "?"
    ts = db.now()
    # Che documento e' (#ANCHOR: documenti): le SCHEDE tecnici mettono la spunta
    # "stampata"; il REGISTRO dei componenti (web/registro/) e' un documento per
    # il cliente e si archivia e basta, senza toccare la mappatura.
    tipo = "registro" if body.get("tipo") == "registro" else "schede"
    nome = re.sub(r"[^\w\-. ()°]", "_", str(body.get("nome") or tipo)).strip() or tipo
    # Un nome lunghissimo (una ragione sociale intera piu' destinazione) portava
    # il percorso oltre i 260 caratteri di Windows: open() falliva con un 500.
    # 120 bastano e avanzano per leggerlo nell'elenco.
    if nome.lower().endswith(".pdf"):
        nome = nome[:-4]
    nome = (nome[:120].rstrip(" .") or tipo) + ".pdf"
    try:
        pagine = max(0, int(body.get("pagine") or 0))
    except (TypeError, ValueError):
        pagine = 0
    doc_id = uuid.uuid4().hex
    # un documento in fascicoli: un PDF per fascicolo, stesso `gruppo`
    gruppo = re.sub(r"[^0-9a-f]", "", str(body.get("gruppo") or ""))[:32] or None
    try:
        fascicolo = int(body.get("fascicolo") or 0) or None
        fascicoli = int(body.get("fascicoli") or 0) or None
    except (TypeError, ValueError):
        fascicolo = fascicoli = None
    if not gruppo:
        fascicolo = fascicoli = None
    rel = os.path.join(str(anno), "%d-%s-%s" % (sid, doc_id[:8], nome))
    percorso = os.path.join(_cartella_documenti(), rel)
    os.makedirs(os.path.dirname(percorso), exist_ok=True)
    with open(percorso, "wb") as fh:
        fh.write(dati)

    cella = None
    with db.WRITE_LOCK:
        c = db.connect()
        try:
            c.execute("BEGIN IMMEDIATE")
            s = c.execute("SELECT * FROM services WHERE id_service=?", (sid,)).fetchone()
            if not s:
                c.execute("ROLLBACK")
                os.remove(percorso)
                return 404, {"errore": "service #%d sconosciuto" % sid}, None
            try:
                mese = int(body.get("mese") or 0)
            except (TypeError, ValueError):
                mese = 0
            if not 1 <= mese <= 12:
                mese = _mese_scadenza(s, anno)
            if tipo == "registro":
                mese = 0          # nessuna spunta: non e' un passo della mappatura
            c.execute("INSERT INTO documenti(id,id_service,anno,mese,nome,percorso,bytes,"
                      "pagine,anteprima,creato_il,creato_da,gruppo,fascicolo,fascicoli,tipo) "
                      "VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
                      (doc_id, sid, anno, mese or None, nome, rel.replace(os.sep, "/"),
                       len(dati), pagine, anteprima, ts, operatore,
                       gruppo, fascicolo, fascicoli, tipo))
            if mese:
                st, out = _applica(c, operatore, sid, anno, mese, "stampata", 1,
                                   None, None, None, "schede")
                if st == 200:
                    cella = out
            c.execute("COMMIT")
            r = c.execute("SELECT * FROM documenti WHERE id=?", (doc_id,)).fetchone()
        except Exception:
            c.execute("ROLLBACK")
            try:
                os.remove(percorso)
            except OSError:
                pass
            raise
        finally:
            c.close()
    doc = _doc_out(r)
    ev = {"tipo": "documento", "anno": anno, "id_service": sid, "documento": doc,
          "operatore": operatore}
    if cella and cella.get("esito") in ("ok", "merge"):
        ev["mese"], ev["cella"] = mese, cella["cella"]
    return 200, {"documento": doc, "mese": mese, "cella": cella}, ev


def scarica_documento(ctx, q, body):
    with db.sess() as c:
        r = c.execute("SELECT * FROM documenti WHERE id=?", (q.get("id"),)).fetchone()
    if not r:
        return 404, {"errore": "documento non trovato"}, None
    p = _file_documento(r["percorso"])
    if p is None:
        return 404, {"errore": "percorso del documento non valido"}, None
    if not os.path.isfile(p):
        return 404, {"errore": "file mancante sul disco: " + r["percorso"]}, None
    with open(p, "rb") as fh:
        dati = fh.read()
    return 200, {"__file__": dati, "__nome__": r["nome"], "__tipo__": "application/pdf",
                 "__inline__": "scarica" not in q}, None


def elimina_documento(ctx, q, body):
    """Toglie un PDF sbagliato. La spunta "stampata" resta: e' una decisione
    dell'operatore, si toglie dalla cella se serve."""
    doc_id = str(body.get("id") or "")
    with db.WRITE_LOCK:
        with db.sess() as c:
            r = c.execute("SELECT * FROM documenti WHERE id=?", (doc_id,)).fetchone()
            if not r:
                return 404, {"errore": "documento non trovato"}, None
            c.execute("DELETE FROM documenti WHERE id=?", (doc_id,))
    p = _file_documento(r["percorso"])
    try:
        if p:
            os.remove(p)
    except OSError:
        pass
    ev = {"tipo": "documento", "anno": r["anno"], "id_service": r["id_service"],
          "eliminato": doc_id, "operatore": body.get("operatore") or "?"}
    return 200, {"eliminato": doc_id}, ev


def elimina_documenti(ctx, q, body):
    """Cancellazione in BLOCCO dei PDF, per liberare spazio (#ANCHOR: documenti).

    Due perimetri, mai insieme:
      - {"anno": 2024}       tutti i PDF di quell'anno. Solo l'amministratore:
                             e' potatura d'archivio, come azzerare in blocco.
      - {"id_service": 812}  tutti i PDF di quel sito, di qualunque anno. La
                             puo' fare chiunque: e' lo stesso potere che ha
                             gia' con Elimina su ogni singolo documento, in un
                             clic invece di N.

    Le spunte "stampata" restano, come per il documento singolo: il PDF si
    butta per fare posto, il lavoro fatto resta scritto.
    """
    a = str(body.get("anno") or "")
    sid = str(body.get("id_service") or "")
    per_anno = a.isdigit()
    if per_anno == sid.isdigit():
        return 400, {"errore": "serve anno OPPURE id_service, non entrambi"}, None
    operatore = body.get("operatore") or "?"
    dove, val = ("anno", int(a)) if per_anno else ("id_service", int(sid))

    with db.WRITE_LOCK:
        with db.sess() as c:
            if per_anno:
                no = _solo_admin(c, body, ctx)
                if no:
                    return no
            righe = c.execute("SELECT id,id_service,anno,percorso,bytes FROM documenti "
                              "WHERE %s=?" % dove, (val,)).fetchall()
            if not righe:
                return 200, {"eliminati": [], "n": 0, "bytes": 0}, None

            # Prima i file, poi le righe - lo stesso ordine del giro online
            # (cloud/06-documenti.sql): se qualcosa si spezza a meta' restano
            # righe senza file, e ridare lo stesso comando le trova ancora e
            # finisce il lavoro. Nell'ordine opposto i file resterebbero
            # orfani per sempre, che e' esattamente lo spazio che qui si
            # vuole liberare.
            base = _cartella_documenti()
            for r in righe:
                p = _file_documento(r["percorso"])
                try:
                    if p:
                        os.remove(p)
                except OSError:
                    pass
            c.executemany("DELETE FROM documenti WHERE id=?", [(r["id"],) for r in righe])

    for cartella, _, _ in os.walk(base, topdown=False):
        if cartella == base:
            continue
        try:
            os.rmdir(cartella)          # solo se e' rimasta vuota
        except OSError:
            pass

    eliminati = [{"id": r["id"], "id_service": r["id_service"], "anno": r["anno"]}
                 for r in righe]
    peso = sum(r["bytes"] or 0 for r in righe)
    ev = {"tipo": "documenti", "eliminati": eliminati, "n": len(eliminati),
          "bytes": peso, "ambito": dove, "valore": val, "operatore": operatore}
    return 200, {"eliminati": eliminati, "n": len(eliminati), "bytes": peso}, ev
