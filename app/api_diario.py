"""Letture e diario (COD-07, da app/api.py): storia della cella, attivita',
azzeramento del diario e controlli di qualita' sul dato Access.
"""
import re
import db
from api_comune import _anno
from api_permessi import _solo_admin


# ------------------------------------------------------------- letture ------
def storia(ctx, q, body):
    # solo cifre ASCII e al piu' 18: un id oltre i 64 bit passava int() e
    # SQLite alzava OverflowError, che il server non traduce in 400 (500)
    chiave = tuple(int(v) for v in (str(q.get(k) or "").strip()
                                    for k in ("id_service", "anno", "mese"))
                   if re.fullmatch(r"-?[0-9]{1,18}", v))
    if len(chiave) != 3:
        return 400, {"errore": "servono id_service, anno e mese numerici"}, None
    with db.sess() as c:
        rows = c.execute("""SELECT ts,operatore,campo,da,a,origine,op_id FROM eventi
                            WHERE id_service=? AND anno=? AND mese=?
                            ORDER BY id DESC LIMIT 50""", chiave).fetchall()
    return 200, {"storia": [dict(r) for r in rows]}, None


def attivita(ctx, q, body):
    # `LIMIT -1` in SQLite vuol dire "nessun limite": un ?limit=-5 si sarebbe
    # tirato dietro tutto il diario. Fuori dall'intervallo si torna a 1..300.
    try:
        lim = int(q.get("limit", 60))
    except (TypeError, ValueError):
        lim = 60
    lim = max(1, min(lim, 300))
    with db.sess() as c:
        rows = c.execute("""SELECT e.ts,e.operatore,e.id_service,e.anno,e.mese,e.campo,
                                   e.da, e.a, e.origine, e.op_id, s.destinazione, c.rag_soc
                            FROM eventi e
                            LEFT JOIN services s ON s.id_service=e.id_service
                            LEFT JOIN clienti  c ON c.id_cliente=s.id_cliente
                            ORDER BY e.id DESC LIMIT ?""", (lim,)).fetchall()
    return 200, {"attivita": [dict(r) for r in rows]}, None


def azzera_diario(ctx, q, body):
    """Butta TUTTO il diario, di tutti gli operatori e di tutti gli anni. Solo
    l'amministratore (#ANCHOR: ruoli), e dal client solo dopo aver scritto OK
    (#ANCHOR: conferma-ok in web/js/ui.js).

    Le spunte, le note e i documenti NON si toccano: sparisce la storia di chi
    le ha messe, non il lavoro. Sparisce pero' anche il "Ripristina", che legge
    proprio quelle righe: e' l'unica azione dell'applicazione che non si disfa
    in nessun modo, ed e' per questo che la conferma e' scritta a mano."""
    with db.WRITE_LOCK, db.sess() as c:
        no = _solo_admin(c, body, ctx)
        if no:
            return no
        n = c.execute("SELECT COUNT(*) AS n FROM eventi").fetchone()["n"]
        c.execute("DELETE FROM eventi")
    return 200, {"n": n}, None


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
