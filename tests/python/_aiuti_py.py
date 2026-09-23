"""Aiuti comuni delle prove del backend Python (area "py").

Ogni prova lavora su un SQLite TEMPORANEO in una cartella di %TEMP%: mai su
data/cronoservice.db ne' su data/prova.db, mai su Access, mai sulla rete.
"""
import os, shutil, sys, tempfile, unittest

APP = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "app"))
if APP not in sys.path:
    sys.path.insert(0, APP)

import db, api   # noqa: E402  (dopo il sys.path)

# Un PDF minimo: a salva_documento basta che cominci per %PDF
PDF = b"%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n"


class ConDB(unittest.TestCase):
    """Un archivio vuoto e nuovo per ogni prova, con "Capo" amministratore
    per configurazione (come config.json["amministratori"])."""

    def setUp(self):
        self.dir = tempfile.mkdtemp(prefix="crono_prova_py_")
        self.percorso = db.init(os.path.join(self.dir, "archivio.db"))
        self.cfg = {"amministratori": ["Capo"]}
        self.ctx = {"cfg": self.cfg, "base": self.dir}
        api.PRESENZE.clear()

    def tearDown(self):
        api.PRESENZE.clear()
        shutil.rmtree(self.dir, ignore_errors=True)

    # -- dati finti
    def cliente(self, cid=1, rs="CLIENTE UNO"):
        with db.sess() as c:
            c.execute("INSERT OR REPLACE INTO clienti(id_cliente,rag_soc,citta) VALUES(?,?,?)",
                      (cid, rs, "Treviso"))

    def servizio(self, sid=10, cli=1, mesi="001000001000", stato="APERTO", inizio=None,
                 scad=None, rin=0, archiviato=0, dest="SEDE"):
        with db.sess() as c:
            c.execute("""INSERT OR REPLACE INTO services(id_service,id_cliente,stato,destinazione,
                         mesi,data_inizio,data_scadenza,rinnovo_auto,archiviato,tipo,cadenza,qva)
                         VALUES(?,?,?,?,?,?,?,?,?,?,?,?)""",
                      (sid, cli, stato, dest, mesi, inizio, scad, rin, archiviato,
                       "ANTINCENDIO", "SEMESTRALE", mesi.count("1")))

    def ruolo(self, nome, ruolo):
        with db.sess() as c:
            c.execute("INSERT OR REPLACE INTO operatori(nome,ruolo) VALUES(?,?)", (nome, ruolo))

    def cella(self, sid=10, anno=2026, mese=3):
        with db.sess() as c:
            return c.execute("SELECT * FROM mappature WHERE id_service=? AND anno=? AND mese=?",
                             (sid, anno, mese)).fetchone()

    def conta(self, tabella, where="1", args=()):
        with db.sess() as c:
            return c.execute("SELECT COUNT(*) FROM %s WHERE %s" % (tabella, where),
                             args).fetchone()[0]

    # -- chiamate
    def toggle(self, operatore="Anna", sid=10, anno=2026, mese=3, campo="stampata", valore=1,
               **extra):
        body = dict(id_service=sid, anno=anno, mese=mese, campo=campo, valore=valore,
                    operatore=operatore, **extra)
        return api.toggle(self.ctx, {}, body)
