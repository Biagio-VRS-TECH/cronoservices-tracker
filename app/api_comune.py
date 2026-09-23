"""Aiuti comuni agli endpoint (COD-07, da app/api.py): anno richiesto, anni
disponibili, lettura e forma della cella della mappatura.
"""
import datetime
import db

CAMPI = db.CAMPI  # ("stampata","controllata","corretta","ricambi")


# ---------------------------------------------------------------- helpers ----
ANNO_MIN, ANNO_MAX = 1000, 9999   # quattro cifre: oltre, SQLite va in OverflowError
SID_MAX = 2 ** 31 - 1             # integer del cloud (cloud/01-tabelle.sql)


def _anno(q, c):
    a = str(q.get("anno") or "")
    # isdecimal, non isdigit: "²" e' una cifra per isdigit ma int() la rifiuta.
    # E quattro cifre: "99999999999999999999" arrivava a SQLite (OverflowError, 500)
    if a.isdecimal() and ANNO_MIN <= int(a) <= ANNO_MAX:
        return int(a)
    return datetime.date.today().year


def _intero(v, nome):
    """int() di un numero del corpo JSON che non lascia passare i casi storti:
    json.loads accetta Infinity e NaN (int() -> OverflowError, un 500), un 3.7
    diventava marzo in silenzio, un true diventava 1. Tutto ValueError/TypeError,
    che server.py trasforma in 400."""
    if isinstance(v, bool):
        raise TypeError("%s: atteso un numero" % nome)
    if isinstance(v, float) and not v.is_integer():
        raise ValueError("%s: atteso un intero" % nome)
    return int(v)


def _fuori_dominio(sid, anno, mese):
    """Il messaggio d'errore se la cella non puo' esistere, altrimenti None. Il
    cloud ha `check (mese between 1 and 12)`; SQLite no, lo fa l'API."""
    if not 1 <= mese <= 12:
        return "mese fuori da 1..12: %s" % mese
    if not ANNO_MIN <= anno <= ANNO_MAX:
        return "anno non valido: %s" % anno
    if not 1 <= sid <= SID_MAX:
        return "id_service non valido: %s" % sid
    return None


def _nome_operatore(body):
    """Chi scrive: testo ripulito e tagliato a 40 come in /api/operatore e
    /api/ruolo, "?" se manca. Un numero o una lista e' una richiesta sbagliata
    (prima: AttributeError in ruolo_di, un 500)."""
    v = body.get("operatore")
    if v is None:
        return "?"
    if not isinstance(v, str):
        raise TypeError("operatore: atteso un testo")
    return v.strip()[:40] or "?"


def _op_id(v):
    """L'identificativo dell'operazione (coda offline, blocchi): testo, o un
    numero che diventa testo (le colonne sono TEXT). Un oggetto finiva nel
    binding di SQLite: ProgrammingError, un 500."""
    if v is None or v == "":
        return None
    if isinstance(v, bool) or not isinstance(v, (str, int)):
        raise TypeError("op_id: atteso un testo")
    return str(v)


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
