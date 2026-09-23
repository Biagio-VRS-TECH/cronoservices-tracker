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

# Gli anni che hanno senso (gli stessi di api_comune._anni_disponibili) e il
# tetto degli id di Access (int a 32 bit, come online).
ANNO_MIN, ANNO_MAX = 2001, 2099
ID_MAX = 2 ** 31 - 1
# Il nome del file sul disco: NTFS conta le unita' UTF-16, non i caratteri.
NOME_MAX = 120


def _intero(v, minimo, massimo):
    """int(v) se sta fra minimo e massimo, altrimenti None. Gli interi del
    client finiscono in colonne INTEGER: oltre i 64 bit sqlite3 alzava
    OverflowError (500). Niente bool (True non e' l'anno 1) e solo cifre ASCII
    ("²" passa isdigit ma int() la rifiuta)."""
    if isinstance(v, bool):
        return None
    if isinstance(v, float):
        v = int(v) if v.is_integer() else None
    elif isinstance(v, str):
        v = v.strip()
        v = int(v) if re.fullmatch(r"-?[0-9]{1,18}", v) else None
    elif not isinstance(v, int):
        v = None
    return v if v is not None and minimo <= v <= massimo else None


def _operatore(body):
    """La firma: sempre testo e al massimo 40 caratteri, come in /api/operatore.
    Un oggetto arrivava all'INSERT e sqlite3 alzava ProgrammingError (500)."""
    v = body.get("operatore")
    return (v.strip()[:40] if isinstance(v, str) else "") or "?"


def _taglia_utf16(s, n):
    """Al massimo n unita' UTF-16: 120 lettere "astrali" (due unita' l'una)
    portavano il nome del file oltre i 255 di NTFS e open() falliva."""
    while len(s.encode("utf-16-le")) // 2 > n:
        s = s[:-1]
    return s


# Un'anteprima e' una miniatura JPEG in data URL e nient'altro: dopo il prefisso
# solo base64, cosi' virgolette e markup non arrivano nel bootstrap di tutti.
_ANTEPRIMA = re.compile(r"data:image/jpeg;base64,[A-Za-z0-9+/]+={0,2}")


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
        anno = _intero(q.get("anno"), 1, 9999)
        return 200, {"anno": anno, "documenti": _documenti(c, anno)}, None


def salva_documento(ctx, q, body):
    """Il generatore ha prodotto un PDF: si archivia il file, si registra la riga
    e si mette la spunta "stampata" sul mese della mappatura del sito (quello
    indicato dal client, altrimenti il mese di scadenza). Riga e spunta stanno
    nella stessa transazione; se salta, il file appena scritto viene tolto."""
    sid = _intero(body.get("id_service"), 1, ID_MAX)
    anno = _intero(body.get("anno"), ANNO_MIN, ANNO_MAX)
    if sid is None or anno is None:
        return 400, {"errore": "id_service e anno obbligatori (anno fra %d e %d)"
                               % (ANNO_MIN, ANNO_MAX)}, None
    try:
        dati = base64.b64decode(body.get("pdf") or "", validate=True)
    except (ValueError, TypeError):
        return 400, {"errore": "PDF non leggibile"}, None
    if not dati.startswith(b"%PDF"):
        return 400, {"errore": "il contenuto non e' un PDF"}, None
    # Un PDF finisce con %%EOF (al piu' seguito da qualche a capo: la tolleranza
    # di Acrobat e' 1024 byte). Senza, e' un invio troncato: archiviarlo
    # vorrebbe dire mettere la spunta "stampata" su un file che non si apre.
    if b"%%EOF" not in dati[-1024:]:
        return 400, {"errore": "PDF incompleto (manca la fine del file): "
                               "rigeneralo e salva di nuovo"}, None
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
    if anteprima and (not isinstance(anteprima, str) or len(anteprima) > 80000
                      or not _ANTEPRIMA.fullmatch(anteprima)):
        anteprima = None
    operatore = _operatore(body)
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
    nome = (_taglia_utf16(nome[:NOME_MAX], NOME_MAX).rstrip(" .") or tipo) + ".pdf"
    pagine = _intero(body.get("pagine"), 0, 10 ** 6) or 0
    doc_id = uuid.uuid4().hex
    # un documento in fascicoli: un PDF per fascicolo, stesso `gruppo`. Un
    # numero che non si legge (o fuori scala) toglie tutti e due.
    gruppo = re.sub(r"[^0-9a-f]", "", str(body.get("gruppo") or ""))[:32] or None
    grezzi = (body.get("fascicolo"), body.get("fascicoli"))
    letti = [_intero(v, 1, 9999) if v else None for v in grezzi]
    fascicolo, fascicoli = letti
    if not gruppo or any(v and n is None for v, n in zip(grezzi, letti)):
        fascicolo = fascicoli = None
    rel = os.path.join(str(anno), "%d-%s-%s" % (sid, doc_id[:8], nome))
    percorso = os.path.join(_cartella_documenti(), rel)
    # Disco pieno a meta' scrittura: niente PDF troncato senza riga che lo trovi.
    try:
        for tentativo in (1, 2):
            os.makedirs(os.path.dirname(percorso), exist_ok=True)
            try:
                with open(percorso, "wb") as fh:
                    fh.write(dati)
                break
            except FileNotFoundError:
                # la cartella dell'anno tolta da elimina_documenti (che pulisce
                # le vuote fuori dal lucchetto) fra il makedirs e l'open: si rifa'
                if tentativo == 2:
                    raise
    except BaseException:
        try:
            os.remove(percorso)
        except OSError:
            pass
        raise

    cella = None
    with db.WRITE_LOCK:
        c = db.connect()
        try:
            c.execute("BEGIN IMMEDIATE")
            s = c.execute("SELECT * FROM services WHERE id_service=?", (sid,)).fetchone()
            if not s:
                c.execute("ROLLBACK")
                try:
                    os.remove(percorso)
                except OSError:
                    pass
                return 404, {"errore": "service #%d sconosciuto" % sid}, None
            mese = _intero(body.get("mese"), 1, 12) or _mese_scadenza(s, anno)
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
            # la rilettura PRIMA del COMMIT: dopo, un suo errore farebbe
            # togliere il file di una riga ormai scritta
            r = c.execute("SELECT * FROM documenti WHERE id=?", (doc_id,)).fetchone()
            c.execute("COMMIT")
        except Exception:
            # Se a fallire e' stato il BEGIN (archivio bloccato da un altro
            # processo) una transazione non c'e': un ROLLBACK alzerebbe un
            # secondo errore che copre il primo (500 invece del 503 "riprova")
            # e salterebbe la rimozione del file.
            if c.in_transaction:
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
          "eliminato": doc_id, "operatore": _operatore(body)}
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
    # solo cifre ASCII e numeri che SQLite sa tenere: "²" passava isdigit() e
    # int() alzava ValueError, "9"*30 arrivava alla query (OverflowError, 500)
    a = _intero(body.get("anno"), 0, 9999)
    sid = _intero(body.get("id_service"), 0, ID_MAX)
    per_anno = a is not None
    if per_anno == (sid is not None):
        return 400, {"errore": "serve anno OPPURE id_service, non entrambi"}, None
    operatore = _operatore(body)
    dove, val = ("anno", a) if per_anno else ("id_service", sid)

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
