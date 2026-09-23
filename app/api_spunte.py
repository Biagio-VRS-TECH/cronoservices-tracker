"""Le spunte (COD-07, da app/api.py): valore per ruolo, merge ottimistico per
campo (#ANCHOR: merge), spunta singola, in blocco, nota e ripristino.
"""
import uuid
import db
from api_comune import CAMPI, _cella, _cella_out, _cella_out_vuota
from api_permessi import _admin_con_pin, _pin_admin, _solo_admin


# ----------------------------------------------------------------- toggle ----
def _valore_per_ruolo(campo, attuale, valore, approva, admin=False):
    """Traduce l'INTENZIONE del client (0/1, o 2 solo da un admin che ripristina)
    nel valore che si puo' scrivere davvero, secondo il ruolo (#ANCHOR: ruoli).
    Ritorna (valore, errore): errore = (status, payload) se la mossa e' vietata.

    Due poteri distinti: `approva` (admin o approvatore) chiude le proposte,
    `admin` in piu' puo' rimetterle in attesa (il 2, cioe' il ripristino).

    Sui passi DA_APPROVARE (rapportino, ricambi):
      - tecnico che mette 1  -> scrive PROPOSTA (2): la spunta va a chi approva
      - tecnico che mette 0  -> puo' ritirare la sua proposta (2 -> 0), ma non
                                togliere una spunta approvata (1 -> 0): 403
      - chi approva: 1 = approva, 0 = respinge/toglie
      - solo admin: 2 = rimette in attesa (ripristino)
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
    if v == 2 and not admin:
        return v, (403, {"errore": "solo l'amministratore puo' rimettere in attesa"})
    if approva:
        return v, None
    if v == 1:
        return (1 if attuale == 1 else db.PROPOSTA), None
    if attuale == 1:
        return v, (403, {"errore": "spunta gia' approvata: la toglie solo chi approva",
                         "approvata": True})
    return v, None


def _applica(c, operatore, sid, anno, mese, campo, valore, base_rev, base_valore,
             op_id, origine, approva=False, admin=False):
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
    valore, vietato = _valore_per_ruolo(campo, attuale0, valore, approva, admin)
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
                approva=db.puo_approvare(c, operatore, ctx["cfg"]),
                admin=_admin_con_pin(c, body, ctx, operatore))
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
            approva = db.puo_approvare(c, operatore, ctx["cfg"])
            # "Completa/Azzera tutte" (#ANCHOR: massa) e' del solo amministratore:
            # ne' un tecnico ne' un approvatore azzerano il lavoro di tutti in un
            # clic (#ANCHOR: ruoli). "Approva tutte" e' origine 'approvazione'.
            if origine == "massa" and not admin:
                c.close()
                return 403, {"errore": "le azioni di massa sono dell'amministratore"}, None
            # SEC-12: col PIN configurato l'admin senza PIN resta un approvatore
            no_pin = _pin_admin(body, ctx["cfg"]) if admin else None
            if origine == "massa" and no_pin:
                c.close()
                return no_pin
            admin = admin and no_pin is None
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
                                   origine, approva=approva, admin=admin)
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
            # Il blocco si confronta con substr, non con LIKE: in un LIKE un '%' o
            # un '_' dentro l'op_id farebbero da jolly e ripristinerebbero
            # blocchi che non c'entrano (op_id "%" = tutti i bulk del diario).
            eventi = c.execute("""SELECT * FROM eventi
                                  WHERE op_id=? OR substr(op_id,1,?)=?
                                  ORDER BY id DESC""",
                               (op_id, len(op_id) + 1, op_id + ":")).fetchall()
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
                                   "%s:%d" % (blocco, i), "ripristino",
                                   approva=True, admin=True)
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
