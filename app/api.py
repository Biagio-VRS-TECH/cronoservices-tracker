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
        # L'anno prima: una mappatura rimasta aperta a dicembre passa i suoi
        # passi all'anno dopo (#ANCHOR: passi-cumulativi in web/js/stato.js).
        celle_prec = {}
        for r in c.execute("SELECT * FROM mappature WHERE anno=?", (anno - 1,)):
            celle_prec["%d-%d" % (r["id_service"], r["mese"])] = _cella_out(r)
        ultimo = c.execute("SELECT * FROM sync_log ORDER BY id DESC LIMIT 1").fetchone()
        return 200, {
            "anno": anno,
            "anni": _anni_disponibili(c, anno),
            "oggi": datetime.date.today().isoformat(),
            "clienti": clienti,
            "services": services,
            "celle": celle,
            "celle_prec": celle_prec,
            "operatori": [r["nome"] for r in
                          c.execute("SELECT nome FROM operatori ORDER BY nome")],
            "ruoli": db.ruoli(c, ctx["cfg"]),          # {nome: 'admin'|'tecnico'} (#ANCHOR: ruoli)
            "ultimo_sync": db.get_meta(c, "ultimo_sync"),
            "inizio_tracciamento": db.get_meta(c, "inizio_tracciamento"),
            "indirizzo_lan": ctx.get("lan"),
            "altri_server": ctx.get("altri_server") or [],
            "sync": dict(ultimo) if ultimo else None,
            "documenti": _documenti(c),        # di tutti gli anni: e' uno storico
            "online": _online(),
            "mesi": db.MESI_ABBR,
            "mesi_nome": db.MESI_NOME,
        }, None


# ----------------------------------------------------------------- toggle ----
def _valore_per_ruolo(campo, attuale, valore, admin):
    """Traduce l'INTENZIONE del client (0/1, o 2 solo da un admin che ripristina)
    nel valore che si puo' scrivere davvero, secondo il ruolo (#ANCHOR: ruoli).
    Ritorna (valore, errore): errore = (status, payload) se la mossa e' vietata.

    Sui passi DA_APPROVARE (rapportino, ricambi):
      - tecnico che mette 1  -> scrive PROPOSTA (2): la spunta va all'admin
      - tecnico che mette 0  -> puo' ritirare la sua proposta (2 -> 0), ma non
                                togliere una spunta approvata (1 -> 0): 403
      - admin: 1 = approva, 0 = respinge/toglie, 2 = rimette in attesa (ripristino)
    Sugli altri passi 2 non esiste: vale 1. Il gemello e' _applica in
    cloud/02-funzioni.sql."""
    try:
        v = int(valore or 0)
    except (TypeError, ValueError):
        v = 1
    if v not in (0, 1, 2):
        v = 1 if v else 0
    if campo not in db.DA_APPROVARE:
        return (1 if v else 0), None
    if admin:
        return v, None
    if v == 2:
        return v, (403, {"errore": "solo l'amministratore puo' rimettere in attesa"})
    if v == 1:
        return (1 if attuale == 1 else db.PROPOSTA), None
    if attuale == 1:
        return v, (403, {"errore": "spunta approvata dall'amministratore: solo lui la toglie",
                         "approvata": True})
    return v, None


def _applica(c, operatore, sid, anno, mese, campo, valore, base_rev, base_valore,
             op_id, origine, admin=False):
    """Scrive un singolo campo di una cella con merge ottimistico per campo.

    Regole (#ANCHOR: merge):
      - riga assente -> creata a 0 e aggiornata
      - rev invariata            -> scrittura diretta
      - rev cambiata, valore attuale del campo == quello richiesto -> no-op idempotente
      - rev cambiata, valore attuale del campo == base_valore del client
                                 -> il conflitto era su un ALTRO campo: merge silenzioso
      - rev cambiata e anche il campo e' cambiato -> 409, il client mostra il confronto
    Prima del merge il valore passa da _valore_per_ruolo (#ANCHOR: ruoli): i
    valori nel database sono 0, 1 e, sui passi da approvare, 2 = proposta.
    """
    if campo not in CAMPI:
        return 400, {"errore": "campo non valido: %s" % campo}

    r = _cella(c, sid, anno, mese)
    attuale0 = r[campo] if r is not None else 0
    valore, vietato = _valore_per_ruolo(campo, attuale0, valore, admin)
    if vietato:
        st, out = vietato
        out.update({"esito": "vietato", "campo": campo, "id_service": sid, "anno": anno,
                    "mese": mese, "cella": _cella_out(r) if r is not None else None})
        return st, out
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
        if base_valore is not None and attuale != int(base_valore):
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
            operatore = body.get("operatore") or "?"
            st, out = _applica(
                c, operatore, int(body["id_service"]),
                int(body["anno"]), int(body["mese"]), body["campo"], body.get("valore"),
                body.get("base_rev"), body.get("base_valore"), op_id,
                body.get("origine") or "live",
                admin=db.e_admin(c, operatore, ctx["cfg"]))
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
    origine = body.get("origine") or "bulk"
    esiti, celle = [], []
    with db.WRITE_LOCK:
        c = db.connect()
        try:
            admin = db.e_admin(c, operatore, ctx["cfg"])
            # "Completa/Azzera tutte" (#ANCHOR: massa) e' dell'amministratore:
            # un tecnico non azzera il lavoro di tutti in un clic (#ANCHOR: ruoli).
            if origine == "massa" and not admin:
                c.close()
                return 403, {"errore": "le azioni di massa sono dell'amministratore"}, None
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
                                   origine, admin=admin)
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
        rows = c.execute("""SELECT ts,operatore,campo,da,a,origine,op_id FROM eventi
                            WHERE id_service=? AND anno=? AND mese=?
                            ORDER BY id DESC LIMIT 50""",
                         (int(q["id_service"]), int(q["anno"]), int(q["mese"]))).fetchall()
    return 200, {"storia": [dict(r) for r in rows]}, None


def attivita(ctx, q, body):
    lim = min(int(q.get("limit", 60)), 300)
    with db.sess() as c:
        rows = c.execute("""SELECT e.ts,e.operatore,e.id_service,e.anno,e.mese,e.campo,
                                   e.da, e.a, e.origine, e.op_id, s.destinazione, c.rag_soc
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
        ruoli = db.ruoli(c, ctx["cfg"])
    return 200, {"nome": nome, "operatori": elenco, "ruoli": ruoli,
                 "ruolo": ruoli.get(nome, "tecnico")}, {"tipo": "presenze",
                                                        "online": _online()}


def ripristina(ctx, q, body):
    """Il tastino di reversibilita' dell'admin (#ANCHOR: ripristino). Rimette
    com'erano PRIMA tutti i passi toccati da un'operazione: `op_id` e' quello di
    una spunta singola (un uuid) oppure il BLOCCO di un'azione di massa, di
    "Approva tutte", di un'azione multipla (le celle di un bulk portano
    `<blocco>:<n>`, quindi si prende tutto cio' che inizia per `<blocco>:`).
    Si applica dal piu' recente al piu' vecchio, cosi' se un passo compare due
    volte vince il suo valore piu' antico. Ogni scrittura e' un evento nuovo con
    origine 'ripristino' e il suo blocco, quindi anche un ripristino si
    ripristina. Solo admin: e' lui che ha il permesso di rimettere in attesa
    (2) e di togliere un'approvazione."""
    op_id = str(body.get("op_id") or "").strip()
    if not op_id or ":" in op_id:
        return 400, {"errore": "op_id mancante o non e' un blocco"}, None
    operatore = body.get("operatore") or "?"
    esiti, celle, anno_ev = [], {}, None
    with db.WRITE_LOCK:
        c = db.connect()
        try:
            no = _solo_admin(c, body, ctx)
            if no:
                c.close()
                return no
            eventi = c.execute("""SELECT * FROM eventi WHERE op_id=? OR op_id LIKE ?
                                  ORDER BY id DESC""", (op_id, op_id + ":%")).fetchall()
            if not eventi:
                c.close()
                return 404, {"errore": "nessuna modifica con questo identificativo"}, None
            blocco = uuid.uuid4().hex
            c.execute("BEGIN IMMEDIATE")
            for i, e in enumerate(eventi):
                if e["campo"] not in CAMPI or e["da"] is None:
                    continue
                st, out = _applica(c, operatore, e["id_service"], e["anno"], e["mese"],
                                   e["campo"], e["da"], None, None,
                                   "%s:%d" % (blocco, i), "ripristino", admin=True)
                out["campo"] = e["campo"]
                out["http"] = st
                esiti.append(out)
                if st == 200 and out.get("esito") in ("ok", "merge"):
                    anno_ev = anno_ev or e["anno"]
                    celle[(e["anno"], e["id_service"], e["mese"])] = out["cella"]
            c.execute("COMMIT")
        except Exception:
            c.execute("ROLLBACK")
            raise
        finally:
            c.close()
    lista = [{"anno": a, "id_service": sid, "mese": m, "cella": cel}
             for (a, sid, m), cel in celle.items()]
    ev = None
    if lista:
        # un blocco sta in un anno solo (il bulk porta l'anno): l'evento SSE
        # e' quello delle azioni di massa, con le celle dell'anno del blocco
        ev = {"tipo": "celle", "anno": anno_ev, "operatore": operatore,
              "celle": [x for x in lista if x["anno"] == anno_ev]}
    return 200, {"esiti": esiti, "celle": lista, "n": len(lista),
                 "blocco": blocco}, ev


def _solo_admin(c, body, ctx):
    """None se chi chiama e' admin, altrimenti la risposta 403 (#ANCHOR: ruoli)."""
    if db.e_admin(c, body.get("operatore"), ctx["cfg"]):
        return None
    return 403, {"errore": "questa azione e' dell'amministratore"}, None


def ruolo(ctx, q, body):
    """Un admin nomina (o declassa) un collega. I nomi in config.json restano
    admin comunque; l'ultimo admin non si puo' declassare, altrimenti nessuno
    approverebbe piu' niente."""
    nome = (body.get("nome") or "").strip()[:40]
    nuovo = body.get("ruolo")
    if not nome or nuovo not in ("admin", "tecnico"):
        return 400, {"errore": "servono nome e ruolo (admin|tecnico)"}, None
    with db.WRITE_LOCK, db.sess() as c:
        no = _solo_admin(c, body, ctx)
        if no:
            return no
        if nome in ctx["cfg"].get("amministratori", []) and nuovo != "admin":
            return 400, {"errore": "%s e' amministratore per configurazione (config.json)" % nome}, None
        attuali = db.ruoli(c, ctx["cfg"])
        if nuovo == "tecnico" and attuali.get(nome) == "admin" and \
                sum(1 for r in attuali.values() if r == "admin") <= 1:
            return 400, {"errore": "e' l'unico amministratore: nominane prima un altro"}, None
        c.execute("""INSERT INTO operatori(nome,ultimo_accesso,ruolo) VALUES(?,NULL,?)
                     ON CONFLICT(nome) DO UPDATE SET ruolo=excluded.ruolo""", (nome, nuovo))
        ruoli = db.ruoli(c, ctx["cfg"])
    return 200, {"ruoli": ruoli}, {"tipo": "ruoli", "ruoli": ruoli}


def impostazioni(ctx, q, body):
    """Per ora una sola voce: da quale mese l'azienda registra le spunte qui.
    Serve a non dipingere "in ritardo" tutti i mesi precedenti all'adozione."""
    v = (body.get("inizio_tracciamento") or "").strip()
    import re
    if not re.fullmatch(r"\d{4}-\d{2}", v):
        return 400, {"errore": "formato atteso AAAA-MM"}, None
    with db.WRITE_LOCK, db.sess() as c:
        no = _solo_admin(c, body, ctx)
        if no:
            return no
        db.set_meta(c, "inizio_tracciamento", v)
    return 200, {"inizio_tracciamento": v}, {"tipo": "impostazioni",
                                             "inizio_tracciamento": v}


def ping(ctx, q, body):
    nome = (body.get("operatore") or "").strip()
    ev = None
    if nome:
        prima = PRESENZE.get(nome, {}).get("dove")
        PRESENZE[nome] = {"ts": time.time(), "dove": body.get("dove")}
        # "dove" porta anche la cella che l'operatore ha aperta (#ANCHOR: fuoco
        # in web/js/stato.js): se e' cambiata, gli altri lo sanno subito via
        # SSE, non al loro prossimo battito venti secondi dopo.
        if prima != body.get("dove"):
            ev = {"tipo": "presenze", "online": _online()}
    return 200, {"online": _online(), "ora": db.now()}, ev


def fai_sync(ctx, q, body):
    """Solo l'amministratore rilegge Access (#ANCHOR: ruoli): il sync riscrive
    l'anagrafica di tutti e chiude/riapre service."""
    with db.sess() as c:
        no = _solo_admin(c, body, ctx)
    if no:
        return no
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
                            "X" if cel and cel["stampata"] == 1 else "",
                            "X" if cel and cel["controllata"] == 1 else "",
                            "X" if cel and cel["corretta"] == 1 else "",
                            "X" if cel and cel["ricambi"] == 1 else "",
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
                creato_da=r["creato_da"], gruppo=r["gruppo"], fascicolo=r["fascicolo"],
                fascicoli=r["fascicoli"])


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
            c.execute("INSERT INTO documenti(id,id_service,anno,mese,nome,percorso,bytes,"
                      "pagine,anteprima,creato_il,creato_da,gruppo,fascicolo,fascicoli) "
                      "VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
                      (doc_id, sid, anno, mese or None, nome, rel.replace(os.sep, "/"),
                       len(dati), int(body.get("pagine") or 0), anteprima, ts, operatore,
                       gruppo, fascicolo, fascicoli))
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
                try:
                    os.remove(os.path.join(base, r["percorso"]))
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
    ("POST", "/api/ruolo"): ruolo,
    ("POST", "/api/ripristina"): ripristina,
    ("POST", "/api/ping"): ping,
    ("POST", "/api/impostazioni"): impostazioni,
    ("POST", "/api/sync"): fai_sync,
    ("GET", "/api/documenti"): documenti,
    ("GET", "/api/documento"): scarica_documento,
    ("POST", "/api/documento"): salva_documento,
    ("POST", "/api/documento_elimina"): elimina_documento,
    ("POST", "/api/documenti_elimina"): elimina_documenti,
}
