"""sync.py: backup, file temporanei, export strano (una riga sola, date non ISO,
byte non cp1252 da PowerShell) e archiviati. Access non si apre MAI: estrai()
e' sostituita da un payload, o PowerShell da un finto subprocess.run.
"""
import glob, json, os, sqlite3, subprocess, sys
from unittest import mock

from ._aiuti_py import ConDB, db
from .test_py_sync import cliente, servizio
import sync    # noqa: E402


class Backup(ConDB):
    def setUp(self):
        super().setUp()
        self.cfgs = {"sqlite_path": "archivio.db", "backup_dir": "backup",
                     "backup_da_tenere": 3, "accdb_backend": "finto.accdb"}

    def copie(self):
        return sorted(glob.glob(os.path.join(self.dir, "backup", "cronoservice_*.db")))

    def test_copia_l_archivio_in_uso_non_quello_di_config(self):
        """server.py --db lavora su un altro archivio: il backup copiava quello
        di config.json (o niente, se non c'era) invece di quello in uso."""
        cfg = dict(self.cfgs, sqlite_path="un-altro.db")
        self.cliente(7, "IN USO")
        dst = sync.backup(cfg, self.dir)
        self.assertIsNotNone(dst)
        c = sqlite3.connect(dst)
        try:
            self.assertEqual(c.execute("SELECT rag_soc FROM clienti").fetchone()[0], "IN USO")
        finally:
            c.close()

    def test_la_copia_ha_anche_cio_che_e_ancora_nel_wal(self):
        """Con un lettore aperto il checkpoint non riporta il WAL nel file e la
        copia del solo .db perdeva le ultime scritture. Il backup di SQLite no."""
        self.cliente(1, "PRIMA")
        lettore = db.connect()
        try:
            lettore.execute("BEGIN")
            lettore.execute("SELECT COUNT(*) FROM clienti").fetchone()
            self.cliente(2, "DOPO")
            dst = sync.backup(self.cfgs, self.dir)
        finally:
            lettore.execute("ROLLBACK")
            lettore.close()
        c = sqlite3.connect(dst)
        try:
            self.assertEqual(c.execute("SELECT COUNT(*) FROM clienti").fetchone()[0], 2)
            self.assertEqual(c.execute("PRAGMA integrity_check").fetchone()[0], "ok")
        finally:
            c.close()

    def test_nessun_tmp_resta_e_la_rotazione_tiene_i_piu_recenti(self):
        nomi = iter("2026-09-23T10:00:%02d" % i for i in range(10))
        with mock.patch.object(db, "now", side_effect=lambda: next(nomi)):
            for _ in range(5):
                sync.backup(self.cfgs, self.dir)
        self.assertEqual([os.path.basename(x) for x in self.copie()],
                         ["cronoservice_20260923T10000%d.db" % i for i in (2, 3, 4)])
        self.assertEqual(len(os.listdir(os.path.join(self.dir, "backup"))), 3)

    def test_tenerne_zero_non_vuol_dire_tenerle_tutte(self):
        """backup_da_tenere: 0 faceva [:-0] = [] e non cancellava piu' niente."""
        cfg = dict(self.cfgs, backup_da_tenere=0)
        nomi = iter("2026-09-23T10:00:%02d" % i for i in range(10))
        with mock.patch.object(db, "now", side_effect=lambda: next(nomi)):
            for _ in range(4):
                sync.backup(cfg, self.dir)
        self.assertEqual(len(self.copie()), 1)


class Temporanei(ConDB):
    def setUp(self):
        super().setUp()
        with open(os.path.join(self.dir, "finto.accdb"), "wb") as f:
            f.write(b"non sono access")
        self.cfgs = {"accdb_backend": "finto.accdb"}

    def test_json_temporaneo_rimosso_anche_se_powershell_va_in_timeout(self):
        """L'export scritto e poi PowerShell fermato dal timeout: il JSON con
        l'anagrafica restava in %TEMP%."""
        visti = {}

        def finto_run(cmd, **kw):
            visti["out"] = cmd[cmd.index("-Out") + 1]
            with open(visti["out"], "w", encoding="utf-8") as f:
                json.dump({"services": [servizio(1)], "clienti": []}, f)
            raise subprocess.TimeoutExpired(cmd, 300)

        with mock.patch.object(sync.subprocess, "run", side_effect=finto_run):
            with self.assertRaises(subprocess.TimeoutExpired):
                sync.estrai(self.cfgs, self.dir)
        self.assertFalse(os.path.exists(visti["out"]))

    def run_con_python(self, script):
        """Un processo VERO (Python al posto di PowerShell) con gli argomenti
        di estrai(): cosi' la decodifica di stdout/stderr e' quella reale."""
        vero = subprocess.run

        def run(cmd, **kw):
            return vero([sys.executable, "-c", script, cmd[cmd.index("-Out") + 1]], **kw)
        return mock.patch.object(sync.subprocess, "run", side_effect=run)

    def test_errore_di_powershell_non_cp1252_arriva_nel_messaggio(self):
        """PowerShell scrive gli errori nella codepage OEM (cp850): una 'i'
        accentata e' il byte 0x8D, che in cp1252 non esiste. Il thread che
        leggeva stderr moriva (traceback nella finestra del server) e il
        messaggio del sync fallito diceva 'None' invece dell'errore vero."""
        script = "import sys; sys.stderr.buffer.write(b'ACE mancante: cos\\x8d non va\\n')"
        with self.run_con_python(script):
            with self.assertRaises(RuntimeError) as e:
                sync.estrai(self.cfgs, self.dir)
        self.assertIn("ACE mancante", str(e.exception))
        if os.name == "nt":
            self.assertIn("così non va", str(e.exception))

    def test_avvisi_non_cp1252_con_export_riuscito(self):
        script = ("import sys, json; json.dump({'services': [{'IDService': '1'}]}, "
                  "open(sys.argv[1], 'w')); sys.stderr.buffer.write(b'avviso: s\\x8d\\x81\\n')")
        with self.run_con_python(script):
            d = sync.estrai(self.cfgs, self.dir)
        self.assertEqual(d["services"], [{"IDService": "1"}])


class ExportStrano(ConDB):
    def test_una_riga_sola_arriva_come_oggetto(self):
        """ConvertTo-Json di PowerShell 5.1 srotola una tabella con UNA riga:
        arriva un oggetto invece di una lista, e normalizza iterava le chiavi."""
        cli, servs = sync.normalizza({"services": servizio(1), "clienti": cliente(1)})
        self.assertEqual([s["id_service"] for s in servs], [1])
        self.assertEqual([c["id_cliente"] for c in cli], [1])

    def test_date_portate_in_iso(self):
        """Le date vanno in services cosi' come arrivano e _scad_effettiva /
        il CSV / sync_applica online le leggono come AAAA-MM-GG: una data
        '31/12/2025' faceva fallire il CSV per tutti (400) e Postgres la
        potrebbe leggere col giorno e il mese scambiati."""
        casi = {"2025-12-31": "2025-12-31", "2025-12-31T00:00:00": "2025-12-31",
                "2025-12-31 00:00:00": "2025-12-31", "31/12/2025": "2025-12-31",
                "1/2/2025": "2025-02-01", "31-12-2025": "2025-12-31",
                "31/02/2025": None, "domani": None, "": None, None: None}
        for grezzo, atteso in casi.items():
            _, servs = sync.normalizza({"services": [servizio(1, DataScadenza=grezzo,
                                                               DataInizio=grezzo)]})
            self.assertEqual(servs[0]["data_scadenza"], atteso, grezzo)
            self.assertEqual(servs[0]["data_inizio"], atteso, grezzo)

    def test_con_una_data_strana_il_csv_funziona(self):
        import api
        with mock.patch.object(sync, "estrai", return_value={
                "services": [servizio(1, DataScadenza="31/12/2027", RinnovoAutomatico="-1")],
                "clienti": [cliente(1)]}):
            sync.esegui({"sqlite_path": "archivio.db", "backup_dir": "backup",
                         "accdb_backend": "x"}, self.dir)
        st, out, _ = api.esporta_csv(self.ctx, {"anno": "2026"}, {})
        self.assertEqual(st, 200)


class Archiviati(ConDB):
    def esegui(self, payload):
        with mock.patch.object(sync, "estrai", return_value=payload):
            return sync.esegui({"sqlite_path": "archivio.db", "backup_dir": "backup",
                                "accdb_backend": "x"}, self.dir)

    def test_contati_e_scritti_solo_quando_spariscono(self):
        """Come sync_applica online (cloud/05-sync.sql): 'archiviati' sono i
        service spariti in QUESTO giro. Prima ogni sync riscriveva nel diario
        tutti quelli archiviati da mesi."""
        self.esegui({"services": [servizio(1), servizio(2)], "clienti": []})
        r = self.esegui({"services": [servizio(1)], "clienti": []})
        self.assertEqual(r["archiviati"], 1)
        self.assertTrue(any(d.startswith("archiviati") for d in r["dettaglio"]))
        r = self.esegui({"services": [servizio(1)], "clienti": []})
        self.assertEqual(r["archiviati"], 0)
        self.assertFalse(any(d.startswith("archiviati") for d in r["dettaglio"]), r["dettaglio"])
        self.assertEqual(self.conta("services", "archiviato=1"), 1)
