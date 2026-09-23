"""Permessi e amministrazione (COD-07, da app/api.py): PIN dell'amministratore
(SEC-12), ruoli, impostazioni e sync da Access (#ANCHOR: ruoli).
"""
import hmac, re, threading, time
import db, sync


# SEC-12: in modalita' locale il ruolo lo dichiara il client (`operatore`), e
# chi e' in rete poteva scrivere il nome dell'amministratore e azzerare il
# diario. Con `pin_admin` in config.json le azioni da amministratore vogliono
# anche il PIN (campo `pin` del corpo, lo aggiunge web/js/api.js). Senza la
# chiave tutto resta com'era. Cinque PIN sbagliati di fila fermano i tentativi
# per un minuto: quattro cifre non reggono a un giro di prove a macchina.
PIN_TENTATIVI = 5
PIN_PAUSA = 60
_PIN_LOCK = threading.Lock()
_PIN_ERRORI = {"n": 0, "fino": 0.0}


def _pin_admin(body, cfg):
    """None se il PIN va bene (o non e' richiesto), altrimenti la risposta."""
    v = (cfg or {}).get("pin_admin")
    # `or ""` spegneva anche il PIN numerico 0: spento e' solo assente, null,
    # false o vuoto
    atteso = "" if v is None or v is False else str(v).strip()
    if not atteso:
        return None
    dato = str((body or {}).get("pin") or "").strip()
    with _PIN_LOCK:
        ora = time.time()
        if _PIN_ERRORI["fino"] > ora:
            return 429, {"errore": "troppi PIN sbagliati: riprova fra un minuto",
                         "pin_richiesto": True}, None
        if dato and hmac.compare_digest(dato.encode("utf-8"), atteso.encode("utf-8")):
            _PIN_ERRORI["n"] = 0
            return None
        if dato:
            _PIN_ERRORI["n"] += 1
            if _PIN_ERRORI["n"] >= PIN_TENTATIVI:
                _PIN_ERRORI["n"], _PIN_ERRORI["fino"] = 0, ora + PIN_PAUSA
    return 403, {"errore": ("PIN dell'amministratore sbagliato" if dato
                            else "serve il PIN dell'amministratore"),
                 "pin_richiesto": True}, None


def _nome(v):
    """Il nome di chi chiama, solo se e' testo: db.ruolo_di fa .strip() e un
    numero o un oggetto alzava AttributeError (500 invece di 403)."""
    return v if isinstance(v, str) else ""


def _admin_con_pin(c, body, ctx, operatore=None):
    """True se chi chiama e' admin E (se richiesto) ha dato il PIN giusto: per i
    punti dove l'admin ha un potere in piu' ma l'azione non e' solo sua."""
    nome = _nome(body.get("operatore") if operatore is None else operatore)
    return db.e_admin(c, nome, ctx["cfg"]) and _pin_admin(body, ctx["cfg"]) is None


def _solo_admin(c, body, ctx):
    """None se chi chiama e' admin (col PIN, se c'e'), altrimenti la risposta
    403 (#ANCHOR: ruoli)."""
    if db.e_admin(c, _nome(body.get("operatore")), ctx["cfg"]):
        return _pin_admin(body, ctx["cfg"])
    return 403, {"errore": "questa azione e' dell'amministratore"}, None


def ruolo(ctx, q, body):
    """Un admin nomina (o declassa) un collega fra i tre ruoli (#ANCHOR: ruoli):
    'admin' (tutto), 'approvatore' (approva rapportino e ricambi e basta),
    'tecnico' (propone). I nomi in config.json restano admin comunque; l'ultimo
    admin non si puo' declassare, altrimenti nessuno azzererebbe, sincronizzerebbe
    o ripristinerebbe piu' niente."""
    nome = _nome(body.get("nome")).strip()[:40]
    nuovo = body.get("ruolo")
    if not nome or nuovo not in db.RUOLI:
        return 400, {"errore": "servono nome e ruolo (admin|approvatore|tecnico)"}, None
    with db.WRITE_LOCK, db.sess() as c:
        no = _solo_admin(c, body, ctx)
        if no:
            return no
        # db._amministratori, come db.ruolo_di: con "amministratori": "Capo" un
        # `in` sulla stringa rendeva intoccabili "C" e "apo", con null TypeError
        if nome in db._amministratori(ctx["cfg"]) and nuovo != "admin":
            return 400, {"errore": "%s e' amministratore per configurazione (config.json)" % nome}, None
        attuali = db.ruoli(c, ctx["cfg"])
        if nuovo != "admin" and attuali.get(nome) == "admin" and \
                sum(1 for r in attuali.values() if r == "admin") <= 1:
            return 400, {"errore": "e' l'unico amministratore: nominane prima un altro"}, None
        c.execute("""INSERT INTO operatori(nome,ultimo_accesso,ruolo) VALUES(?,NULL,?)
                     ON CONFLICT(nome) DO UPDATE SET ruolo=excluded.ruolo""", (nome, nuovo))
        ruoli = db.ruoli(c, ctx["cfg"])
    return 200, {"ruoli": ruoli}, {"tipo": "ruoli", "ruoli": ruoli}


def impostazioni(ctx, q, body):
    """Per ora una sola voce: da quale mese l'azienda registra le spunte qui.
    Serve a non dipingere "in ritardo" tutti i mesi precedenti all'adozione."""
    v = str(body.get("inizio_tracciamento") or "").strip()
    # il mese 01..12: un "2026-13" passava e, confrontato come stringa, rendeva
    # "non tracciato" tutto il 2026
    if not re.fullmatch(r"\d{4}-(0[1-9]|1[0-2])", v):
        return 400, {"errore": "formato atteso AAAA-MM"}, None
    with db.WRITE_LOCK, db.sess() as c:
        no = _solo_admin(c, body, ctx)
        if no:
            return no
        db.set_meta(c, "inizio_tracciamento", v)
    return 200, {"inizio_tracciamento": v}, {"tipo": "impostazioni",
                                             "inizio_tracciamento": v}


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
