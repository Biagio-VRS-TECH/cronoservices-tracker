"""Aiuti comuni agli endpoint (COD-07, da app/api.py): anno richiesto, anni
disponibili, lettura e forma della cella della mappatura.
"""
import datetime
import db

CAMPI = db.CAMPI  # ("stampata","controllata","corretta","ricambi")


# ---------------------------------------------------------------- helpers ----
def _anno(q, c):
    a = str(q.get("anno") or "")
    # isdecimal, non isdigit: "²" e' una cifra per isdigit ma int() la rifiuta
    if a.isdecimal():
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
