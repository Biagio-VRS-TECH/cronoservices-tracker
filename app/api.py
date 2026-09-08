"""Endpoint applicativi. #ANCHOR: api

Convenzione: ogni handler ha firma (ctx, q, body) e ritorna (status, payload, evento).
`evento` (o None) viene diffuso via SSE dal server a tutti gli altri client.

ctx = {"cfg":..., "base":...}
q    = dict dei query string (valori singoli)
body = dict del JSON in ingresso (vuoto sui GET)
"""
import base64, calendar, csv, datetime, io, json, os, re, time, uuid
import db, sync

CAMPI = db.CAMPI  # ("stampata","controllata","corretta","ricambi")

# presenze: nome_operatore -> {"ts": epoch, "dove": "2026-09", "client": id}
PRESENZE = {}
PRESENZA_TTL = 45


# ---------------------------------------------------------------- helpers ----
def _anno(q, c):
    a = q.get("anno")
    if a and str(a).isdigit():
        return int(a)
    return datetime.date.today().year


def _anni_disponibili(c, corrente):
    anni = {corrente, corrente - 1, corrente + 1}
    anni |= {r[0] for r in c.execute("SELECT DISTINCT anno FROM mappature")}
    return sorted(a for a in anni if 2000 < a < 2100)


def _cella(c, sid, anno, mese):
    return c.execute("SELECT * FROM mappature WHERE id_service=? AND anno=? AND mese=?",
                     (sid, anno, mese)).fetchone()


def _cella_out(r):
    return {"s": r["stampata"], "c": r["controllata"], "k": r["corretta"],
            "r": r["ricambi"],
            "rev": r["rev"], "by": r["updated_by"], "at": r["updated_at"],
            "nota": r["nota"] or ""}


def _cella_out_vuota():
    return {"s": 0, "c": 0, "k": 0, "r": 0, "rev": 0, "by": None, "at": None,
            "nota": ""}


def _online():
    ora = time.time()
    for k in [k for k, v in PRESENZE.items() if ora - v["ts"] > PRESENZA_TTL]:
        PRESENZE.pop(k, None)
    return [{"nome": k, "dove": v.get("dove")} for k, v in sorted(PRESENZE.items())]


# ------------------------------------------------------------- bootstrap ----
def bootstrap(ctx, q, body):
    """Tutto quello che serve al client in un colpo solo: ~545 service, payload
    piccolo, cachabile dal service worker per l'uso offline."""
    with db.sess() as c:
        anno = _anno(q, c)
        clienti = [dict(id=r["id_cliente"], rs=r["rag_soc"], citta=r["citta"],
                        prov=r["provincia"], tel=r["telefono"], mail=r["email"])
                   for r in c.execute("SELECT * FROM clienti ORDER BY rag_soc")]
        services = [dict(id=r["id_service"], cli=r["id_cliente"], tipo=r["tipo"] or "",
                         stato=r["stato"] or "", dest=r["destinazione"] or "",
                         loc=r["localita"] or "", prov=r["provincia"] or "",
                         map=r["mappatura"], sub=r["subappalto"], nc=r["n_contratto"] or "",
                         inizio=r["data_inizio"], scad=r["data_scadenza"],
                         cad=r["cadenza"] or "", qva=r["qva"], mesi=r["mesi"],
                         rin=r["rinnovo_auto"], caus=r["causale_rinnovo"] or "",
                         note=r["note"] or "", arch=r["archiviato"])
                    for r in c.execute(
                        "SELECT * FROM services ORDER BY id_cliente, id_service")]
        celle = {}
        for r in c.execute("SELECT * FROM mappature WHERE anno=?", (anno,)):
            celle["%d-%d" % (r["id_service"], r["mese"])] = _cella_out(r)
        ultimo = c.execute("SELECT * FROM sync_log ORDER BY id DESC LIMIT 1").fetchone()
        return 200, {
            "anno": anno,
            "anni": _anni_disponibili(c, anno),
            "oggi": datetime.date.today().isoformat(),
            "clienti": clienti,
            "services": services,
            "celle": celle,
            "operatori": [r["nome"] for r in
                          c.execute("SELECT nome FROM operatori ORDER BY nome")],
            "ultimo_sync": db.get_meta(c, "ultimo_sync"),
            "inizio_tracciamento": db.get_meta(c, "inizio_tracciamento"),
            "indirizzo_lan": ctx.get("lan"),
            "altri_server": ctx.get("altri_server") or [],
            "sync": dict(ultimo) if ultimo else None,
            "documenti": _documenti(c, anno),
            "online": _online(),
            "mesi": db.MESI_ABBR,
            "mesi_nome": db.MESI_NOME,
        }, None


# ----------------------------------------------------------------- toggle ----
def _applica(c, operatore, sid, anno, mese, campo, valore, base_rev, base_valore,
             op_id, origine):
    """Scrive un singolo campo di una cella con merge ottimistico per campo.

    Regole (#ANCHOR: merge):
      - riga assente -> creata a 0 e aggiornata
      - rev invariata            -> scrittura diretta
      - rev cambiata, valore attuale del campo == quello richiesto -> no-op idempotente
      - rev cambiata, valore attuale del campo == base_valore del client
                                 -> il conflitto era su un ALTRO campo: merge silenzioso
      - rev cambiata e anche il campo e' cambiato -> 409, il client mostra il confronto
    """
    if campo not in CAMPI:
        return 400, {"errore": "campo non valido: %s" % campo}
    valore = 1 if valore else 0

    r = _cella(c, sid, anno, mese)
    if r is None:
        # Niente riga e niente da scrivere: non si crea spazzatura a zero.
        if not valore:
            return 200, {"esito": "gia-cosi", "cella": dict(_cella_out_vuota()),
                         "id_service": sid, "anno": anno, "mese": mese}
        c.execute("""INSERT INTO mappature(id_service,anno,mese,rev,updated_at,updated_by)
                     VALUES(?,?,?,0,?,?)""", (sid, anno, mese, db.now(), operatore))
        r = _cella(c, sid, anno, mese)

    attuale = r[campo]
    esito = "ok"
    if base_rev is not None and int(base_rev) != r["rev"]:
        if attuale == valore:
            return 200, {"esito": "gia-cosi", "cella": _cella_out(r),
                         "id_service": sid, "anno": anno, "mese": mese}
        if base_valore is not None and attuale != int(bool(base_valore)):
            return 409, {"esito": "conflitto", "cella": _cella_out(r), "campo": campo,
                         "tuo": valore, "id_service": sid, "anno": anno, "mese": mese}
        esito = "merge"

    if attuale == valore:
        return 200, {"esito": "gia-cosi", "cella": _cella_out(r),
                     "id_service": sid, "anno": anno, "mese": mese}

    ts = db.now()
    c.execute("UPDATE mappature SET %s=?, rev=rev+1, updated_at=?, updated_by=? "
              "WHERE id_service=? AND anno=? AND mese=?" % campo,
              (valore, ts, operatore, sid, anno, mese))
    c.execute("""INSERT INTO eventi(ts,operatore,id_service,anno,mese,campo,da,a,op_id,origine)
                 VALUES(?,?,?,?,?,?,?,?,?,?)""",
              (ts, operatore, sid, anno, mese, campo, attuale, valore, op_id, origine))
    r2 = _cella(c, sid, anno, mese)
    return 200, {"esito": esito, "cella": _cella_out(r2),
                 "id_service": sid, "anno": anno, "mese": mese}


def toggle(ctx, q, body):
    op_id = body.get("op_id")
    with db.WRITE_LOCK:
        c = db.connect()
        try:
            c.execute("BEGIN IMMEDIATE")
            if op_id:
                prec = c.execute("SELECT * FROM ops WHERE op_id=?", (op_id,)).fetchone()
                if prec:  # replay della coda offline: rispondo con lo stato attuale
                    r = _cella(c, int(body["id_service"]), int(body["anno"]),
                               int(body["mese"]))
                    c.execute("COMMIT")
                    return 200, {"esito": "replay",
                                 "cella": _cella_out(r) if r else None,
                                 "id_service": int(body["id_service"]),
                                 "anno": int(body["anno"]), "mese": int(body["mese"])}, None
            st, out = _applica(
                c, body.get("operatore") or "?", int(body["id_service"]),
                int(body["anno"]), int(body["mese"]), body["campo"], body.get("valore"),
                body.get("base_rev"), body.get("base_valore"), op_id,
                body.get("origine") or "live")
            if op_id and st == 200:
                c.execute("INSERT OR REPLACE INTO ops(op_id,ts,esito,rev) VALUES(?,?,?,?)",
                          (op_id, db.now(), out.get("esito"),
                           (out.get("cella") or {}).get("rev")))
            c.execute("COMMIT")
        except Exception:
            c.execute("ROLLBACK")
            raise
        finally:
            c.close()
    ev = None
    if st == 200 and out.get("esito") in ("ok", "merge"):
        ev = {"tipo": "cella", "anno": out["anno"], "id_service": out["id_service"],
              "mese": out["mese"], "cella": out["cella"],
              "operatore": body.get("operatore") or "?"}
    return st, out, ev


def bulk(ctx, q, body):
    """Piu' spunte in una transazione: usato da 'segna tutte stampate' e dalla coda
    offline. Ogni voce riporta il proprio esito; i conflitti non bloccano le altre."""
    anno = int(body["anno"])
    operatore = body.get("operatore") or "?"
    esiti, celle = [], []
    with db.WRITE_LOCK:
        c = db.connect()
        try:
            c.execute("BEGIN IMMEDIATE")
            for i, v in enumerate(body.get("celle") or []):
                op_id = v.get("op_id") or (body.get("op_id") and
                                           "%s:%d" % (body["op_id"], i))
                if op_id and c.execute("SELECT 1 FROM ops WHERE op_id=?",
                                       (op_id,)).fetchone():
                    esiti.append({"esito": "replay", "id_service": v["id_service"],
                                  "mese": v["mese"], "campo": v["campo"]})
                    continue
                st, out = _applica(c, operatore, int(v["id_service"]), anno,
                                   int(v["mese"]), v["campo"], v.get("valore"),
                                   v.get("base_rev"), v.get("base_valore"), op_id,
                                   body.get("origine") or "bulk")
                out["campo"] = v["campo"]
                out["http"] = st
                esiti.append(out)
                if op_id and st == 200:
                    c.execute("INSERT OR REPLACE INTO ops(op_id,ts,esito,rev) "
                              "VALUES(?,?,?,?)", (op_id, db.now(), out.get("esito"),
                                                  (out.get("cella") or {}).get("rev")))
                if st == 200 and out.get("esito") in ("ok", "merge"):
                    celle.append({"id_service": out["id_service"], "mese": out["mese"],
                                  "cella": out["cella"]})
            c.execute("COMMIT")
        except Exception:
            c.execute("ROLLBACK")
            raise
        finally:
            c.close()
    ev = ({"tipo": "celle", "anno": anno, "celle": celle, "operatore": operatore}
          if celle else None)
    return 200, {"esiti": esiti}, ev


def nota(ctx, q, body):
    """La nota della cella, con lo stesso merge per campo delle spunte
    (#ANCHOR: merge).

    E' l'unico campo di testo libero dell'applicazione, quindi l'unico dove due
    operatori possono davvero perdere del lavoro: su un booleano i due valori
    possibili si riconciliano sempre da soli (o l'altro ha gia' messo quello che
    volevi, o ha toccato un passo diverso), su una frase no. Le regole, uguali a
    quelle di _applica:
      rev invariata                          -> scrive
      rev cambiata, la nota e' gia' la tua   -> gia-cosi
      rev cambiata, la nota e' quella che il client credeva di avere
                                             -> ha toccato una spunta: merge
      rev cambiata e la nota e' un'altra     -> 409, sceglie l'operatore
    Senza `base_rev` (client vecchio) resta il comportamento di prima: scrive."""
    sid, anno, mese = int(body["id_service"]), int(body["anno"]), int(body["mese"])
    testo = (body.get("nota") or "").strip()[:500]
    base_rev = body.get("base_rev")
    base_nota = body.get("base_nota")
    operatore = body.get("operatore") or "?"
    with db.WRITE_LOCK:
        c = db.connect()
        try:
            c.execute("BEGIN IMMEDIATE")
            r = _cella(c, sid, anno, mese)
            if r is None:
                if not testo:      # niente riga e niente da scrivere
                    c.execute("COMMIT")
                    return 200, {"esito": "gia-cosi", "cella": _cella_out_vuota(),
                                 "id_service": sid, "anno": anno,
                                 "mese": mese}, None
                c.execute("""INSERT INTO mappature(id_service,anno,mese,rev,updated_at,
                             updated_by) VALUES(?,?,?,0,?,?)""",
                          (sid, anno, mese, db.now(), operatore))
                r = _cella(c, sid, anno, mese)
            attuale = r["nota"] or ""
            esito = "ok"
            if base_rev is not None and int(base_rev) != r["rev"]:
                if attuale == testo:
                    c.execute("COMMIT")
                    return 200, {"esito": "gia-cosi", "cella": _cella_out(r),
                                 "id_service": sid, "anno": anno, "mese": mese}, None
                if base_nota is not None and attuale != str(base_nota).strip()[:500]:
                    c.execute("COMMIT")
                    return 409, {"esito": "conflitto", "cella": _cella_out(r),
                                 "campo": "nota", "tuo": testo,
                                 "id_service": sid, "anno": anno, "mese": mese}, None
                esito = "merge"
            if attuale == testo:
                c.execute("COMMIT")
                return 200, {"esito": "gia-cosi", "cella": _cella_out(r),
                             "id_service": sid, "anno": anno, "mese": mese}, None
            ts = db.now()
            c.execute("""UPDATE mappature SET nota=?, rev=rev+1, updated_at=?, updated_by=?
                         WHERE id_service=? AND anno=? AND mese=?""",
                      (testo or None, ts, operatore, sid, anno, mese))
            c.execute("""INSERT INTO eventi(ts,operatore,id_service,anno,mese,campo,da,a,
                         origine) VALUES(?,?,?,?,?,'nota',NULL,NULL,'live')""",
                      (ts, operatore, sid, anno, mese))
            r = _cella(c, sid, anno, mese)
            c.execute("COMMIT")
        except Exception:
            c.execute("ROLLBACK")
            raise
        finally:
            c.close()
    out = {"esito": esito, "cella": _cella_out(r), "id_service": sid, "anno": anno,
           "mese": mese}
    return 200, out, {"tipo": "cella", "anno": anno, "id_service": sid, "mese": mese,
                      "cella": out["cella"], "operatore": operatore}


# ------------------------------------------------------------- letture ------
def storia(ctx, q, body):
    with db.sess() as c:
        rows = c.execute("""SELECT ts,operatore,campo,da,a FROM eventi
                            WHERE id_service=? AND anno=? AND mese=?
                            ORDER BY id DESC LIMIT 50""",
                         (int(q["id_service"]), int(q["anno"]), int(q["mese"]))).fetchall()
    return 200, {"storia": [dict(r) for r in rows]}, None


def attivita(ctx, q, body):
    lim = min(int(q.get("limit", 60)), 300)
    with db.sess() as c:
        rows = c.execute("""SELECT e.ts,e.operatore,e.id_service,e.anno,e.mese,e.campo,
                                   e.a, s.destinazione, c.rag_soc
                            FROM eventi e
                            LEFT JOIN services s ON s.id_service=e.id_service
                            LEFT JOIN clienti  c ON c.id_cliente=s.id_cliente
                            ORDER BY e.id DESC LIMIT ?""", (lim,)).fetchall()
    return 200, {"attivita": [dict(r) for r in rows]}, None


def incongruenze(ctx, q, body):
    """Controlli di qualita' sul dato Access. Riprende l'idea di qVerificaIncongruenze
    (mesi spuntati != visite annue previste dalla cadenza) e aggiunge i casi che
    bloccano il lavoro: aperti senza nessun mese, spunte su mesi non piu' previsti."""
    with db.sess() as c:
        anno = _anno(q, c)
        senza_mesi, cadenza_ko = [], []
        for r in c.execute("""SELECT s.id_service, s.mesi, s.qva, s.cadenza, s.destinazione,
                                     s.tipo, c.rag_soc
                              FROM services s LEFT JOIN clienti c USING(id_cliente)
                              WHERE s.stato='APERTO' AND s.archiviato=0"""):
            n = r["mesi"].count("1")
            base = dict(id=r["id_service"], rs=r["rag_soc"], dest=r["destinazione"],
                        tipo=r["tipo"], mesi=n, qva=r["qva"], cad=r["cadenza"])
            if n == 0:
                senza_mesi.append(base)
            elif r["qva"] and n != r["qva"]:
                cadenza_ko.append(base)
        orfane = [dict(id=r["id_service"], mese=r["mese"], rs=r["rag_soc"],
                       dest=r["destinazione"])
                  for r in c.execute("""
                      SELECT m.id_service, m.mese, s.destinazione, c.rag_soc
                      FROM mappature m JOIN services s USING(id_service)
                      LEFT JOIN clienti c ON c.id_cliente=s.id_cliente
                      WHERE m.anno=? AND substr(s.mesi,m.mese,1)<>'1'
                        AND (m.stampata OR m.controllata OR m.corretta
                             OR m.ricambi)""", (anno,))]
    return 200, {"anno": anno, "senza_mesi": senza_mesi, "cadenza_ko": cadenza_ko,
                 "orfane": orfane}, None


def operatore(ctx, q, body):
    nome = (body.get("nome") or "").strip()[:40]
    if not nome:
        return 400, {"errore": "nome mancante"}, None
    with db.WRITE_LOCK, db.sess() as c:
        c.execute("""INSERT INTO operatori(nome,ultimo_accesso) VALUES(?,?)
                     ON CONFLICT(nome) DO UPDATE SET ultimo_accesso=excluded.ultimo_accesso""",
                  (nome, db.now()))
        elenco = [r["nome"] for r in c.execute("SELECT nome FROM operatori ORDER BY nome")]
    return 200, {"nome": nome, "operatori": elenco}, {"tipo": "presenze",
                                                      "online": _online()}


def impostazioni(ctx, q, body):
    """Per ora una sola voce: da quale mese l'azienda registra le spunte qui.
    Serve a non dipingere "in ritardo" tutti i mesi precedenti all'adozione."""
    v = (body.get("inizio_tracciamento") or "").strip()
    import re
    if not re.fullmatch(r"\d{4}-\d{2}", v):
        return 400, {"errore": "formato atteso AAAA-MM"}, None
    with db.WRITE_LOCK, db.sess() as c:
        db.set_meta(c, "inizio_tracciamento", v)
    return 200, {"inizio_tracciamento": v}, {"tipo": "impostazioni",
                                             "inizio_tracciamento": v}


def ping(ctx, q, body):
    nome = (body.get("operatore") or "").strip()
    if nome:
        PRESENZE[nome] = {"ts": time.time(), "dove": body.get("dove")}
    return 200, {"online": _online(), "ora": db.now()}, None


def fai_sync(ctx, q, body):
    try:
        r = sync.esegui(ctx["cfg"], ctx["base"])
    except Exception as e:
        return 500, {"errore": str(e)}, None
    return 200, r, {"tipo": "sync", "riepilogo": r}


def _scad_effettiva(s):
    """Fine del termine contrattuale IN CORSO oggi: gemello Python di
    `scadEffettiva` in web/js/stato.js (#ANCHOR: rinnovo).

    Un service ancora APERTO con rinnovo automatico non finisce alla sua
    `data_scadenza`: quel giorno comincia il termine successivo. La data in
    Access va quindi rimandata avanti di un termine alla volta finche' non copre
    oggi, altrimenti tutti i mesi successivi risultano fuori contratto e la
    mappatura dell'anno non e' dovuta pur essendolo (caso LASERJET SPA)."""
    scad = s["data_scadenza"]
    if not scad or not s["rinnovo_auto"] or s["stato"] != "APERTO":
        return scad
    a2, m2, g2 = (int(x) for x in scad.split("-"))
    passo = 12
    if s["data_inizio"]:
        a1, m1, g1 = (int(x) for x in s["data_inizio"].split("-"))
        n = (a2 - a1) * 12 + (m2 - m1) + (1 if g2 >= g1 else 0)
        passo = n if n >= 1 else 12
    a, m = a2, m2
    oggi = datetime.date.today().isoformat()
    fine = lambda: "%04d-%02d-%02d" % (
        a, m, min(g2, calendar.monthrange(a, m)[1]))
    for _ in range(200):          # cintura: 200 termini sono oltre un secolo
        if fine() >= oggi:
            break
        m += passo
        a += (m - 1) // 12
        m = (m - 1) % 12 + 1
    return fine()


def _mese_scadenza(s, anno):
    """Primo mese di manutenzione di UN SITO dentro la finestra del contratto, e
    cioe' il mese in cui scade la sua mappatura dell'anno: gemello Python di
    `meseScadenza` in web/js/stato.js (#ANCHOR: mappatura-anno). 0 = nessun mese
    utile quest'anno. L'unita' e' il sito: un cliente con nove impianti aperti ha
    nove mappature, una per impianto.

    L'inizio del tracciamento non c'entra: se la scadenza e' anteriore, quella
    mappatura e' pre-tracciamento (fuori dai totali) ma resta la scadenza. Farla
    slittare al primo mese tracciato contava una VISITA come mappatura."""
    scad = _scad_effettiva(s)
    for m in range(1, 13):
        if s["mesi"][m - 1] != "1":
            continue
        ym = "%d-%02d" % (anno, m)
        if scad and scad < ym + "-01":
            continue
        if s["data_inizio"] and s["data_inizio"] > ym + "-31":
            continue
        return m
    return 0


def esporta_csv(ctx, q, body):
    """Checklist stampabile/foglio di lavoro. Se manca `mese` esporta l'anno intero."""
    with db.sess() as c:
        anno = _anno(q, c)
        mese = int(q["mese"]) if str(q.get("mese", "")).isdigit() else None
        out = io.StringIO()
        w = csv.writer(out, delimiter=";", lineterminator="\r\n")
        w.writerow(["Anno", "Mese", "Ruolo", "IDService", "Cliente", "Destinazione",
                    "Localita", "Prov", "Tipo", "Cadenza", "Stampata", "Controllata",
                    "Completa rapportino", "Ricambi e scadenze",
                    "Nota", "Ultimo agg.", "Da"])
        rows = c.execute("""SELECT s.*, c.rag_soc FROM services s
                            LEFT JOIN clienti c USING(id_cliente)
                            WHERE s.stato='APERTO' AND s.archiviato=0
                            ORDER BY c.rag_soc, s.id_service""").fetchall()
        celle = {("%d-%d" % (r["id_service"], r["mese"])): r
                 for r in c.execute("SELECT * FROM mappature WHERE anno=?", (anno,))}
        for s in rows:
            scad = _mese_scadenza(s, anno)
            for m in range(1, 13):
                if s["mesi"][m - 1] != "1":
                    continue
                if mese and m != mese:
                    continue
                cel = celle.get("%d-%d" % (s["id_service"], m))
                w.writerow([anno, db.MESI_NOME[m - 1],
                            "MAPPATURA" if m == scad else "visita",
                            s["id_service"], s["rag_soc"],
                            s["destinazione"], s["localita"], s["provincia"], s["tipo"],
                            s["cadenza"],
                            "X" if cel and cel["stampata"] else "",
                            "X" if cel and cel["controllata"] else "",
                            "X" if cel and cel["corretta"] else "",
                            "X" if cel and cel["ricambi"] else "",
                            (cel["nota"] if cel else "") or "",
                            (cel["updated_at"] if cel else "") or "",
                            (cel["updated_by"] if cel else "") or ""])
    nome = "mappature_%d%s.csv" % (anno, "_%02d" % mese if mese else "")
    return 200, {"__csv__": out.getvalue(), "__nome__": nome}, None


# -------------------------------------------------------------- documenti ----
# I PDF che il generatore di schede tecnici (web/schede/) produce quando si
# stampa: archiviati per sito e anno, con la spunta "stampata" messa in
# automatico sul mese della mappatura. Il file vive su disco in
# data/documenti/<anno>/, la riga in `documenti`. #ANCHOR: documenti
def _cartella_documenti():
    d = os.path.join(os.path.dirname(db._DB_PATH), "documenti")
    os.makedirs(d, exist_ok=True)
    return d


def _doc_out(r):
    return dict(id=r["id"], id_service=r["id_service"], anno=r["anno"], mese=r["mese"],
                nome=r["nome"], percorso=r["percorso"], bytes=r["bytes"],
                pagine=r["pagine"], anteprima=r["anteprima"], creato_il=r["creato_il"],
                creato_da=r["creato_da"])


def _documenti(c, anno):
    return [_doc_out(r) for r in c.execute(
        "SELECT * FROM documenti WHERE anno=? ORDER BY creato_il", (anno,))]


def documenti(ctx, q, body):
    with db.sess() as c:
        anno = _anno(q, c)
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
    if len(dati) > 40 * 1024 * 1024:
        return 413, {"errore": "PDF troppo grande (oltre 40 MB)"}, None
    anteprima = body.get("anteprima") or None
    if anteprima and (not str(anteprima).startswith("data:image/jpeg;base64,")
                      or len(anteprima) > 80000):
        anteprima = None
    operatore = body.get("operatore") or "?"
    ts = db.now()
    nome = re.sub(r"[^\w\-. ()°]", "_", str(body.get("nome") or "schede")).strip() or "schede"
    if not nome.lower().endswith(".pdf"):
        nome += ".pdf"
    doc_id = uuid.uuid4().hex
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
            c.execute("INSERT INTO documenti(id,id_service,anno,mese,nome,percorso,bytes,"
                      "pagine,anteprima,creato_il,creato_da) VALUES(?,?,?,?,?,?,?,?,?,?,?)",
                      (doc_id, sid, anno, mese or None, nome, rel.replace(os.sep, "/"),
                       len(dati), int(body.get("pagine") or 0), anteprima, ts, operatore))
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
    p = os.path.join(_cartella_documenti(), r["percorso"])
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
    try:
        os.remove(os.path.join(_cartella_documenti(), r["percorso"]))
    except OSError:
        pass
    ev = {"tipo": "documento", "anno": r["anno"], "id_service": r["id_service"],
          "eliminato": doc_id, "operatore": body.get("operatore") or "?"}
    return 200, {"eliminato": doc_id}, ev


ROUTE = {
    ("GET", "/api/bootstrap"): bootstrap,
    ("GET", "/api/storia"): storia,
    ("GET", "/api/attivita"): attivita,
    ("GET", "/api/incongruenze"): incongruenze,
    ("GET", "/api/export.csv"): esporta_csv,
    ("POST", "/api/toggle"): toggle,
    ("POST", "/api/bulk"): bulk,
    ("POST", "/api/nota"): nota,
    ("POST", "/api/operatore"): operatore,
    ("POST", "/api/ping"): ping,
    ("POST", "/api/impostazioni"): impostazioni,
    ("POST", "/api/sync"): fai_sync,
    ("GET", "/api/documenti"): documenti,
    ("GET", "/api/documento"): scarica_documento,
    ("POST", "/api/documento"): salva_documento,
    ("POST", "/api/documento_elimina"): elimina_documento,
}
