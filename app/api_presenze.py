"""Chi c'e' (COD-07, da app/api.py): le presenze in memoria, il battito
(`/api/ping`) e la registrazione dell'operatore (`/api/operatore`).
"""
import threading, time
import db


# presenze: nome_operatore -> {"ts": epoch, "dove": "2026-09", "client": id}
PRESENZE = {}
PRESENZA_TTL = 45
# ThreadingHTTPServer: ping e bootstrap di operatori diversi girano in thread
# diversi. Senza lock il giro di _online() su PRESENZE mentre un altro thread ci
# scrive puo' alzare "dictionary changed size during iteration" (500 a caso).
_PRESENZE_LOCK = threading.Lock()
# Il "dove" vero e' corto ("2026-09 @812-11", #ANCHOR: fuoco): finisce in ogni
# evento SSE a tutti, quindi ha un tetto. Il nome ha quello di /api/operatore.
DOVE_MAX = 100


def _testo(v):
    """Solo testo: un numero o un oggetto facevano alzare AttributeError a
    .strip() (500)."""
    return v if isinstance(v, str) else ""


def _online():
    ora = time.time()
    with _PRESENZE_LOCK:
        for k in [k for k, v in PRESENZE.items() if ora - v["ts"] > PRESENZA_TTL]:
            PRESENZE.pop(k, None)
        return [{"nome": k, "dove": v.get("dove")} for k, v in sorted(PRESENZE.items())]


def operatore(ctx, q, body):
    nome = _testo(body.get("nome")).strip()[:40]
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


def ping(ctx, q, body):
    nome = _testo(body.get("operatore")).strip()[:40]
    dove = body.get("dove")
    if dove is not None:
        dove = (dove if isinstance(dove, str) else str(dove))[:DOVE_MAX]
    ev = None
    if nome:
        with _PRESENZE_LOCK:
            prima = PRESENZE.get(nome, {}).get("dove")
            PRESENZE[nome] = {"ts": time.time(), "dove": dove}
        # "dove" porta anche la cella che l'operatore ha aperta (#ANCHOR: fuoco
        # in web/js/stato.js): se e' cambiata, gli altri lo sanno subito via
        # SSE, non al loro prossimo battito venti secondi dopo.
        if prima != dove:
            ev = {"tipo": "presenze", "online": _online()}
    return 200, {"online": _online(), "ora": db.now()}, ev
