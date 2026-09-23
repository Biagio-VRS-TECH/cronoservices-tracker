"""L'avvio del client (COD-07, da app/api.py): `/api/bootstrap`, tutto in un colpo.
"""
import datetime
import db
from api_comune import _anni_disponibili, _anno, _cella_out
from api_documenti import _documenti
from api_presenze import _online


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
            # {nome: ruolo}: serve solo a disegnare l'elenco nelle impostazioni
            "ruoli": db.ruoli(c, ctx["cfg"]),          # (#ANCHOR: ruoli)
            # Il ruolo di CHI CHIEDE: e' questo che il client deve guardare per
            # sapere cosa puo' fare, mai `ruoli[nome a schermo]`.
            "ruolo": db.ruolo_di(c, q.get("operatore"), ctx["cfg"]),
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
