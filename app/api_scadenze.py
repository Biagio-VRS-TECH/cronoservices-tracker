"""Scadenze ed esportazione (COD-07, da app/api.py): termine contrattuale in
corso (#ANCHOR: rinnovo), mese della mappatura e CSV del foglio di lavoro.
"""
import calendar, csv, datetime, io, re
import db
from api_comune import _anno


_ISO = re.compile(r"(\d{4})-(\d{2})-(\d{2})")


def _data_iso(v):
    """(anno, mese, giorno) di una data AAAA-MM-GG, None se non lo e'."""
    x = _ISO.fullmatch(v) if isinstance(v, str) else None
    if not x:
        return None
    a, m, g = (int(p) for p in x.groups())
    return (a, m, g) if a >= 1 and 1 <= m <= 12 and 1 <= g <= 31 else None


def _scad_effettiva(s, oggi=None):
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
    # Una data non AAAA-MM-GG (un campo testo in Access, un export diverso) si
    # lascia com'e': prima un ValueError qui faceva cadere il CSV di tutti.
    d2 = _data_iso(scad)
    if d2 is None:
        return scad
    a2, m2, g2 = d2
    passo = 12
    d1 = _data_iso(s["data_inizio"])
    if d1:
        a1, m1, g1 = d1
        n = (a2 - a1) * 12 + (m2 - m1) + (1 if g2 >= g1 else 0)
        passo = n if n >= 1 else 12
    a, m = a2, m2
    # `oggi` (AAAA-MM-GG) si passa solo nelle prove: di norma e' la data del server
    oggi = oggi or datetime.date.today().isoformat()
    fine = lambda: "%04d-%02d-%02d" % (
        a, m, min(g2, calendar.monthrange(a, m)[1]))
    for _ in range(200):          # cintura: 200 termini sono oltre un secolo
        if fine() >= oggi:
            break
        m += passo
        a += (m - 1) // 12
        m = (m - 1) % 12 + 1
    return fine()


def _mese_scadenza(s, anno, oggi=None):
    """Primo mese di manutenzione di UN SITO dentro la finestra del contratto, e
    cioe' il mese in cui scade la sua mappatura dell'anno: gemello Python di
    `meseScadenza` in web/js/stato.js (#ANCHOR: mappatura-anno). 0 = nessun mese
    utile quest'anno. L'unita' e' il sito: un cliente con nove impianti aperti ha
    nove mappature, una per impianto.

    L'inizio del tracciamento non c'entra: se la scadenza e' anteriore, quella
    mappatura e' pre-tracciamento (fuori dai totali) ma resta la scadenza. Farla
    slittare al primo mese tracciato contava una VISITA come mappatura."""
    scad = _scad_effettiva(s, oggi)
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


_NUMERO = re.compile(r"[+-]?\d+([.,]\d+)?")


def _testo_csv(v):
    """Formula injection (OWASP "CSV Injection"): un testo che comincia con
    = + - @ TAB o CR, Excel e LibreOffice lo leggono come formula (anche una
    chiamata verso l'esterno, =HYPERLINK o =cmd|...). Davanti si mette un
    apice, che lo fa restare testo. La tabulazione usata prima non bastava: una
    cella che cominciava GIA' con TAB o CR passava intatta, e una TAB davanti
    e' proprio uno dei caratteri da neutralizzare. Un numero semplice (-5,
    -3,5) non e' una formula e resta com'e'. Il gemello online `_csv` in
    cloud/09-debug-2026-09-23.sql usa ancora la tabulazione."""
    v = "" if v is None else str(v)
    if v[:1] in ("=", "+", "-", "@", "\t", "\r") and not _NUMERO.fullmatch(v):
        return "'" + v
    return v


def esporta_csv(ctx, q, body):
    """Checklist stampabile/foglio di lavoro. Se manca `mese` esporta l'anno intero."""
    with db.sess() as c:
        anno = _anno(q, c)
        # un mese fuori da 1..12 ("13", o "²" che per isdigit e' una cifra e per
        # int() no: un 400) vale come "tutto l'anno", come un mese non numerico
        m = str(q.get("mese", ""))
        mese = int(m) if m.isascii() and m.isdecimal() and 1 <= int(m) <= 12 else None
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
                            s["id_service"], _testo_csv(s["rag_soc"]),
                            _testo_csv(s["destinazione"]), _testo_csv(s["localita"]),
                            _testo_csv(s["provincia"]), _testo_csv(s["tipo"]),
                            _testo_csv(s["cadenza"]),
                            "X" if cel and cel["stampata"] == 1 else "",
                            "X" if cel and cel["controllata"] == 1 else "",
                            "X" if cel and cel["corretta"] == 1 else "",
                            "X" if cel and cel["ricambi"] == 1 else "",
                            _testo_csv(cel["nota"] if cel else ""),
                            (cel["updated_at"] if cel else "") or "",
                            _testo_csv(cel["updated_by"] if cel else "")])
    nome = "mappature_%d%s.csv" % (anno, "_%02d" % mese if mese else "")
    return 200, {"__csv__": out.getvalue(), "__nome__": nome}, None
