"""db.py: schema, colonne aggiunte, pragma, meta, ruoli, seme del dizionario."""
import os, sqlite3

from ._aiuti_py import ConDB, db


class Schema(ConDB):
    def test_tabelle_presenti(self):
        with db.sess() as c:
            nomi = {r[0] for r in c.execute("SELECT name FROM sqlite_master WHERE type='table'")}
        for t in ("meta", "clienti", "services", "mappature", "eventi", "ops", "operatori",
                  "sync_log", "documenti", "dizionario_componenti"):
            self.assertIn(t, nomi)

    def test_campi_e_colonne_coincidono(self):
        self.assertEqual(db.CAMPI, ("stampata", "controllata", "corretta", "ricambi"))
        with db.sess() as c:
            col = [r["name"] for r in c.execute("PRAGMA table_info(mappature)")]
        for campo in db.CAMPI:
            self.assertIn(campo, col)
        self.assertTrue(set(db.DA_APPROVARE) <= set(db.CAMPI))
        self.assertEqual(db.PROPOSTA, 2)

    def test_init_idempotente_e_inizio_tracciamento_non_si_sovrascrive(self):
        with db.sess() as c:
            db.set_meta(c, "inizio_tracciamento", "2020-01")
        db.init(self.percorso)
        db.init(self.percorso)
        with db.sess() as c:
            self.assertEqual(db.get_meta(c, "inizio_tracciamento"), "2020-01")

    def test_aggiunte_su_un_archivio_vecchio(self):
        """Un .db nato prima di `ricambi`, `ruolo` e `tipo`: init() li aggiunge
        e le righe esistenti ricevono il default."""
        vecchio = os.path.join(self.dir, "vecchio.db")
        c = sqlite3.connect(vecchio)
        c.executescript("""
            CREATE TABLE mappature (id_service INTEGER NOT NULL, anno INTEGER NOT NULL,
              mese INTEGER NOT NULL, stampata INTEGER NOT NULL DEFAULT 0,
              controllata INTEGER NOT NULL DEFAULT 0, corretta INTEGER NOT NULL DEFAULT 0,
              nota TEXT, rev INTEGER NOT NULL DEFAULT 1, updated_at TEXT, updated_by TEXT,
              PRIMARY KEY (id_service, anno, mese));
            INSERT INTO mappature(id_service,anno,mese,stampata,controllata,corretta)
              VALUES(1,2025,3,1,1,1);
            CREATE TABLE operatori (nome TEXT PRIMARY KEY, ultimo_accesso TEXT);
            INSERT INTO operatori(nome) VALUES('Anna');
        """)
        c.commit()
        c.close()
        db.init(vecchio)
        with db.sess() as c:
            r = c.execute("SELECT * FROM mappature").fetchone()
            self.assertEqual(r["ricambi"], 0)
            self.assertEqual(r["corretta"], 1)
            self.assertEqual(c.execute("SELECT ruolo FROM operatori").fetchone()[0], "tecnico")

    def test_pragma_di_ogni_connessione(self):
        with db.sess() as c:
            self.assertEqual(c.execute("PRAGMA journal_mode").fetchone()[0].lower(), "wal")
            self.assertEqual(c.execute("PRAGMA busy_timeout").fetchone()[0], 15000)
            # 1 = NORMAL: prima valeva solo per la connessione di init()
            self.assertEqual(c.execute("PRAGMA synchronous").fetchone()[0], 1)

    def test_sess_chiude_la_connessione(self):
        with db.sess() as c:
            pass
        with self.assertRaises(sqlite3.ProgrammingError):
            c.execute("SELECT 1")

    def test_sess_chiude_anche_su_eccezione(self):
        with self.assertRaises(ZeroDivisionError):
            with db.sess() as c:
                1 / 0
        with self.assertRaises(sqlite3.ProgrammingError):
            c.execute("SELECT 1")

    def test_meta_upsert(self):
        with db.sess() as c:
            self.assertIsNone(db.get_meta(c, "x"))
            self.assertEqual(db.get_meta(c, "x", "d"), "d")
            db.set_meta(c, "x", 1)
            db.set_meta(c, "x", 2)
            self.assertEqual(db.get_meta(c, "x"), "2")
            self.assertEqual(c.execute("SELECT COUNT(*) FROM meta WHERE k='x'").fetchone()[0], 1)

    def test_now_senza_microsecondi(self):
        self.assertRegex(db.now(), r"^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d$")


class Dizionario(ConDB):
    def test_seme_letto_a_tabella_vuota(self):
        n = self.conta("dizionario_componenti")
        self.assertGreater(n, 0)
        with db.sess() as c:
            self.assertEqual(c.execute("SELECT COUNT(*) FROM dizionario_componenti "
                                       "WHERE aggiornato_da<>'seme'").fetchone()[0], 0)

    def test_seme_non_rimette_le_voci_tolte(self):
        with db.sess() as c:
            primo = c.execute("SELECT codice FROM dizionario_componenti LIMIT 1").fetchone()[0]
            c.execute("DELETE FROM dizionario_componenti WHERE codice<>?", (primo,))
        db.init(self.percorso)
        self.assertEqual(self.conta("dizionario_componenti"), 1)


class Ruoli(ConDB):
    def test_ruolo_di(self):
        self.ruolo("Anna", "approvatore")
        self.ruolo("Bruno", "admin")
        self.ruolo("Strano", "boh")
        with db.sess() as c:
            self.assertEqual(db.ruolo_di(c, None, self.cfg), "tecnico")
            self.assertEqual(db.ruolo_di(c, "   ", self.cfg), "tecnico")
            self.assertEqual(db.ruolo_di(c, "Capo", self.cfg), "admin")
            self.assertEqual(db.ruolo_di(c, "  Capo  ", self.cfg), "admin")
            self.assertEqual(db.ruolo_di(c, "Anna", self.cfg), "approvatore")
            self.assertEqual(db.ruolo_di(c, "Bruno", self.cfg), "admin")
            self.assertEqual(db.ruolo_di(c, "Strano", self.cfg), "tecnico")
            self.assertEqual(db.ruolo_di(c, "Sconosciuto", self.cfg), "tecnico")
            self.assertEqual(db.ruolo_di(c, "Capo", None), "tecnico")

    def test_poteri(self):
        self.ruolo("Anna", "approvatore")
        with db.sess() as c:
            self.assertTrue(db.puo_approvare(c, "Anna", self.cfg))
            self.assertFalse(db.e_admin(c, "Anna", self.cfg))
            self.assertTrue(db.puo_approvare(c, "Capo", self.cfg))
            self.assertTrue(db.e_admin(c, "Capo", self.cfg))
            self.assertFalse(db.puo_approvare(c, "Tizio", self.cfg))

    def test_ruoli_comprende_il_seme(self):
        self.ruolo("Anna", "approvatore")
        self.ruolo("Strano", "boh")
        with db.sess() as c:
            r = db.ruoli(c, self.cfg)
        self.assertEqual(r, {"Anna": "approvatore", "Strano": "tecnico", "Capo": "admin"})
