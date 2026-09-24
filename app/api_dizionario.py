"""Il dizionario dei componenti del registro (COD-07, da app/api.py).
"""
import db


# ------------------------------------------------------------- dizionario ----
# Il vocabolario dei componenti del generatore del registro (web/registro/):
# codice articolo -> nome che il cliente legge + priorita' nel quadro d'insieme.
# Condiviso da tutti, come le spunte. Gemello di cloud/08-dizionario.sql.
# #ANCHOR: dizionario
PRIORITA_MAX = 10


def _voce_out(r):
    return dict(codice=r["codice"], nome=r["nome"] or "", descrizione=r["descrizione"] or "",
                priorita=r["priorita"] or 0, aggiornato=r["aggiornato"],
                aggiornato_da=r["aggiornato_da"] or "")


def dizionario(ctx, q, body):
    with db.sess() as c:
        voci = [_voce_out(r) for r in c.execute(
            "SELECT * FROM dizionario_componenti ORDER BY codice")]
    return 200, {"voci": voci}, None


def dizionario_imposta(ctx, q, body):
    """Una voce alla volta, e solo i campi che il client manda: `nome` (vuoto =
    si torna alla descrizione del gestionale), `priorita` (vuoto o 0 = nessuna),
    `descrizione` (la descrizione tecnica, per riferimento). Nome e priorita'
    sono indipendenti: si puo' avere l'una senza l'altro, e togliendo il nome la
    priorita' resta. Quando non resta niente la riga sparisce."""
    codice = str(body.get("codice") or "").strip()
    if not codice:
        return 400, {"errore": "codice mancante"}, None
    # la firma sempre testo, al massimo 40 come in /api/operatore: un oggetto
    # arrivava all'INSERT e sqlite3 alzava ProgrammingError (500)
    op = body.get("operatore")
    operatore = (op.strip()[:40] if isinstance(op, str) else "") or "?"
    with db.WRITE_LOCK, db.sess() as c:
        r = c.execute("SELECT * FROM dizionario_componenti WHERE codice=?", (codice,)).fetchone()
        nome = (r["nome"] if r else None) or None
        descr = (r["descrizione"] if r else None) or None
        prio = (r["priorita"] if r else None) or None
        if "nome" in body:
            nome = " ".join(str(body.get("nome") or "").split()) or None
        if "descrizione" in body and str(body.get("descrizione") or "").strip():
            descr = str(body["descrizione"]).strip()
        if "priorita" in body:
            v = str(body.get("priorita") or "").strip()
            if v in ("", "0"):
                prio = None
            else:
                try:
                    prio = int(v)
                except ValueError:
                    return 400, {"errore": "priorita non valida: un numero da 1 a %d, oppure vuoto" % PRIORITA_MAX}, None
                if not 1 <= prio <= PRIORITA_MAX:
                    return 400, {"errore": "priorita %d fuori intervallo (1-%d)" % (prio, PRIORITA_MAX)}, None
        if not nome and not prio:
            c.execute("DELETE FROM dizionario_componenti WHERE codice=?", (codice,))
            voce = dict(codice=codice, nome="", descrizione=descr or "", priorita=0,
                        aggiornato=db.now(), aggiornato_da=operatore, rimossa=True)
        else:
            c.execute("INSERT INTO dizionario_componenti(codice,nome,descrizione,priorita,aggiornato,aggiornato_da) "
                      "VALUES(?,?,?,?,?,?) ON CONFLICT(codice) DO UPDATE SET nome=excluded.nome, "
                      "descrizione=excluded.descrizione, priorita=excluded.priorita, "
                      "aggiornato=excluded.aggiornato, aggiornato_da=excluded.aggiornato_da",
                      (codice, nome, descr, prio, db.now(), operatore))
            voce = _voce_out(c.execute("SELECT * FROM dizionario_componenti WHERE codice=?", (codice,)).fetchone())
    ev = {"tipo": "dizionario", "voce": voce, "operatore": operatore}
    return 200, {"voce": voce}, ev
