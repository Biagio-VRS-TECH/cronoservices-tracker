"""sync.py e push_cloud.py con dati finti: Access non si apre MAI.

`sync.estrai` e' sostituita da un payload in memoria; dove si prova estrai()
stessa, il .accdb e' un file finto in una cartella temporanea e PowerShell e'
sostituito da un finto subprocess.run.
"""
import glob, io, json, os, sys, tempfile
from unittest import mock

from ._aiuti_py import ConDB, db
import sync, push_cloud    # noqa: E402  (app/ e' nel sys.path grazie ad _aiuti_py)

MESI = sync.ACCESS_MESI


def servizio(sid, cli=1, stato="Aperto", mesi=("Mar", "Sett"), **extra):
    d = {"IDService": str(sid), "IDCliente": str(cli), "Tipo": "ANTINCENDIO ",
         "Stato": stato, "Destinazione": "SEDE %s" % sid, "Localita": "Treviso",
         "Provincia": "TV", "Mappatura": "Si", "Subappalto": "No", "NContratto": "C-1",
         "DataInizio": "2025-01-01", "DataScadenza": "2025-12-31", "Cadenza": "SEMESTRALE",
         "QVA": "2", "CausaleRinnovo": "TACITO", "RinnovoAutomatico": "-1", "Note": " ",
         "IDCadenza": "3"}
    for m in MESI:
        d[m] = "Si" if m in mesi else "No"
    d.update(extra)
    return d


def cliente(cid, rs="CLIENTE"):
    # la chiave accentata arriva cosi' dal recordset di Access
    return {"IDCliente": str(cid), "RagSoc": " %s " % rs, "Città": "Treviso",
            "NonUtilizzabile": "0", "Email": ""}


class Normalizza(ConDB):
    def test_aiutanti(self):
        self.assertEqual(sync._norm("Città"), "citta")
        self.assertEqual(sync._norm("CittÀ"), "citta")
        for si in ("Si", "si ", "S", "true", "1", "-1", "YES"):
            self.assertEqual(sync._si(si), 1, si)
        for no in (None, "", "No", "0", "falso", 0):
            self.assertEqual(sync._si(no), 0, no)
        self.assertEqual(sync._int(" 12 "), 12)
        self.assertIsNone(sync._int("12.5"))
        self.assertIsNone(sync._int(None))
        self.assertEqual(sync._txt("  x "), "x")
        self.assertIsNone(sync._txt("   "))
        self.assertEqual(sync._txt(0), None)

    def test_regole(self):
        p = {"services": [servizio(1), servizio("x"), servizio(2, cli="", stato=" chiuso ")],
             "clienti": [cliente(1), cliente(2), cliente("zz")]}
        cli, servs = sync.normalizza(p)
        self.assertEqual([s["id_service"] for s in servs], [1, 2])
        self.assertEqual(servs[0]["mesi"], "001000001000")
        self.assertEqual(servs[0]["stato"], "APERTO")
        self.assertEqual(servs[1]["stato"], "CHIUSO")
        self.assertEqual(servs[1]["id_cliente"], 0)
        self.assertEqual(servs[0]["tipo"], "ANTINCENDIO")
        self.assertIsNone(servs[0]["note"])
        self.assertEqual(servs[0]["rinnovo_auto"], 1)
        self.assertEqual([c["id_cliente"] for c in cli], [1])     # solo chi ha un service
        self.assertEqual(cli[0]["rag_soc"], "CLIENTE")
        self.assertEqual(cli[0]["citta"], "Treviso")
        self.assertEqual(tuple(servs[0]), sync.COL_SERVICES)
        self.assertEqual(tuple(cli[0]), sync.COL_CLIENTI)

    def test_push_cloud_usa_le_stesse_regole(self):
        p = {"services": [servizio(1)], "clienti": [cliente(1)]}
        self.assertEqual(push_cloud.righe(p), sync.normalizza(p))

    def test_payload_senza_chiavi(self):
        self.assertEqual(sync.normalizza({}), ([], []))


class Esegui(ConDB):
    def setUp(self):
        super().setUp()
        self.cfgs = {"sqlite_path": "archivio.db", "backup_dir": "backup",
                     "backup_da_tenere": 3, "accdb_backend": "finto.accdb"}

    def esegui(self, payload):
        with mock.patch.object(sync, "estrai", return_value=payload):
            return sync.esegui(self.cfgs, self.dir)

    def test_primo_sync_e_differenze(self):
        r = self.esegui({"services": [servizio(1), servizio(2), servizio(3)],
                         "clienti": [cliente(1)]})
        self.assertEqual((r["services"], r["clienti"], r["nuovi"]), (3, 1, 3))
        with db.sess() as c:
            self.assertEqual(db.get_meta(c, "ultimo_sync"), r["ts"])
        self.toggle(sid=3, mese=3, campo="ricambi", operatore="Capo")
        # secondo giro: 1 chiuso, 2 cambia mesi (e marzo non c'e' piu'), 3 sparito
        r = self.esegui({"services": [servizio(1, stato="CHIUSO"),
                                      servizio(2, mesi=("Giu",))],
                         "clienti": [cliente(1)]})
        self.assertEqual((r["nuovi"], r["chiusi"], r["mesi_cambiati"]), (0, 1, 1))
        with db.sess() as c:
            arch = {x[0]: x[1] for x in c.execute("SELECT id_service, archiviato FROM services")}
        self.assertEqual(arch, {1: 0, 2: 0, 3: 1})
        # la spunta sul service archiviato resta (e' lavoro fatto)
        self.assertEqual(self.cella(sid=3)["ricambi"], 1)
        # terzo giro: il 3 torna, il 1 riapre
        r = self.esegui({"services": [servizio(1), servizio(2, mesi=("Giu",)), servizio(3)],
                         "clienti": [cliente(1)]})
        self.assertEqual(r["riaperti"], 1)
        with db.sess() as c:
            self.assertEqual(c.execute("SELECT archiviato FROM services WHERE id_service=3")
                             .fetchone()[0], 0)
            self.assertEqual(c.execute("SELECT COUNT(*) FROM sync_log").fetchone()[0], 3)

    def test_orfane_contano_anche_i_ricambi(self):
        self.esegui({"services": [servizio(1)], "clienti": []})
        self.toggle(sid=1, mese=5, campo="ricambi", operatore="Capo")   # maggio: non previsto
        r = self.esegui({"services": [servizio(1)], "clienti": []})
        self.assertEqual(r["spunte_orfane"], 1)

    def test_export_vuoto_non_archivia_tutto(self):
        """Prima un export senza service (tabella non letta) archiviava in un
        colpo tutti i service. Ora il sync si ferma, come sync_applica online."""
        self.esegui({"services": [servizio(1), servizio(2)], "clienti": []})
        for vuoto in ({"services": [], "clienti": []},
                      {"services": [{"IDService": None}], "clienti": []}, {}):
            with self.assertRaises(RuntimeError):
                self.esegui(vuoto)
        self.assertEqual(self.conta("services", "archiviato=1"), 0)
        self.assertEqual(self.conta("sync_log"), 1)

    def test_errore_a_meta_non_lascia_mezzo_sync(self):
        self.esegui({"services": [servizio(1)], "clienti": []})
        rotto = {"services": [servizio(1, stato="CHIUSO")], "clienti": []}
        with mock.patch.object(db, "set_meta", side_effect=RuntimeError("boom")):
            with self.assertRaises(RuntimeError):
                self.esegui(rotto)
        with db.sess() as c:
            self.assertEqual(c.execute("SELECT stato FROM services").fetchone()[0], "APERTO")
        # e la connessione non e' rimasta in transazione: si scrive ancora
        self.assertEqual(self.toggle(sid=1)[0], 200)

    def test_backup_ruota(self):
        nomi = iter("2026-09-23T10:00:%02d" % i for i in range(10))
        with mock.patch.object(db, "now", side_effect=lambda: next(nomi)):
            for _ in range(5):
                sync.backup(self.cfgs, self.dir)
        tenuti = sorted(glob.glob(os.path.join(self.dir, "backup", "cronoservice_*.db")))
        self.assertEqual(len(tenuti), 3)
        self.assertTrue(tenuti[-1].endswith("20260923T100004.db"))

    def test_backup_senza_archivio(self):
        # si copia l'archivio IN USO (db.init), non quello di config.json:
        # "senza archivio" vuol dire che manca quello
        cfg = dict(self.cfgs, sqlite_path="non-esiste.db")
        with mock.patch.object(db, "_DB_PATH", os.path.join(self.dir, "non-esiste.db")):
            self.assertIsNone(sync.backup(cfg, self.dir))


class Estrai(ConDB):
    """estrai() con un .accdb FINTO (un file qualunque in tmp) e PowerShell
    finto: si verifica che la copia e il JSON temporanei spariscano."""

    def setUp(self):
        super().setUp()
        self.accdb = os.path.join(self.dir, "finto.accdb")
        with open(self.accdb, "wb") as f:
            f.write(b"non sono access")
        self.cfgs = {"accdb_backend": "finto.accdb"}

    def test_manca_il_file(self):
        with self.assertRaises(RuntimeError):
            sync.estrai({"accdb_backend": "assente.accdb"}, self.dir)

    def test_copia_e_json_temporanei_rimossi(self):
        visti = {}

        def finto_run(cmd, **kw):
            copia, out = cmd[cmd.index("-Accdb") + 1], cmd[cmd.index("-Out") + 1]
            visti["copia"], visti["out"] = copia, out
            self.assertNotEqual(os.path.abspath(copia), os.path.abspath(self.accdb))
            self.assertTrue(os.path.exists(copia))
            with open(out, "w", encoding="utf-8-sig") as f:
                json.dump({"services": [servizio(1)], "clienti": []}, f)
            return mock.Mock(stdout="OK", stderr="")

        with mock.patch.object(sync.subprocess, "run", side_effect=finto_run):
            d = sync.estrai(self.cfgs, self.dir)
        self.assertEqual(d["sorgente"], os.path.abspath(self.accdb))
        self.assertEqual(len(d["services"]), 1)
        self.assertFalse(os.path.exists(visti["copia"]))
        self.assertFalse(os.path.exists(visti["out"]))
        with open(self.accdb, "rb") as f:
            self.assertEqual(f.read(), b"non sono access")      # l'originale intatto

    def test_nomi_temporanei_unici(self):
        """Due estrazioni insieme (sync all'avvio + push delle 08:15, o due
        /api/sync) non devono condividere il JSON ne' la copia."""
        visti = []

        def finto_run(cmd, **kw):
            visti.append((cmd[cmd.index("-Accdb") + 1], cmd[cmd.index("-Out") + 1]))
            with open(visti[-1][1], "w", encoding="utf-8") as f:
                f.write('{"services": [], "clienti": []}')
            return mock.Mock(stdout="", stderr="")

        with mock.patch.object(sync.subprocess, "run", side_effect=finto_run):
            sync.estrai(self.cfgs, self.dir)
            sync.estrai(self.cfgs, self.dir)
        self.assertNotEqual(visti[0][0], visti[1][0])
        self.assertNotEqual(visti[0][1], visti[1][1])

    def test_export_fallito(self):
        with mock.patch.object(sync.subprocess, "run",
                               return_value=mock.Mock(stdout="", stderr="ACE mancante")):
            with self.assertRaises(RuntimeError) as e:
                sync.estrai(self.cfgs, self.dir)
        self.assertIn("ACE mancante", str(e.exception))


class PushCloud(ConDB):
    def setUp(self):
        super().setUp()
        # niente app/cloud.json vero, niente log vero
        self.p = [mock.patch.object(push_cloud, "BASE", self.dir),
                  mock.patch.object(push_cloud, "LOG", os.path.join(self.dir, "push.log")),
                  mock.patch.dict(os.environ, {}, clear=False)]
        for x in self.p:
            x.start()
        os.environ.pop("CRONO_SUPABASE_URL", None)
        os.environ.pop("CRONO_SUPABASE_SERVICE_KEY", None)

    def tearDown(self):
        for x in reversed(self.p):
            x.stop()
        super().tearDown()

    def test_credenziali(self):
        with self.assertRaises(RuntimeError):
            push_cloud._cfg_cloud()
        with open(os.path.join(self.dir, "cloud.json"), "w", encoding="utf-8") as f:
            json.dump({"supabase_url": "https://x.supabase.co/", "service_key": "k"}, f)
        self.assertEqual(push_cloud._cfg_cloud(), ("https://x.supabase.co", "k"))
        os.environ["CRONO_SUPABASE_URL"] = "https://y.supabase.co"
        self.assertEqual(push_cloud._cfg_cloud()[0], "https://y.supabase.co")

    def test_manda_e_errore_http(self):
        risposta = mock.MagicMock()
        risposta.__enter__.return_value.read.return_value = b'{"services": 1}'
        with mock.patch.object(push_cloud.urllib.request, "urlopen",
                               return_value=risposta) as u:
            self.assertEqual(push_cloud.manda("https://x", "k", [], [{"id_service": 1}]),
                             {"services": 1})
        req = u.call_args[0][0]
        self.assertEqual(req.full_url, "https://x/rest/v1/rpc/sync_applica")
        self.assertEqual(json.loads(req.data)["p_services"], [{"id_service": 1}])
        err = push_cloud.urllib.error.HTTPError("u", 401, "no", {}, io.BytesIO(b"JWT scaduto"))
        with mock.patch.object(push_cloud.urllib.request, "urlopen", side_effect=err):
            with self.assertRaises(RuntimeError) as e:
                push_cloud.manda("https://x", "k", [], [])
        self.assertIn("401", str(e.exception))

    def test_main_prova_e_vuoto(self):
        with open(os.path.join(self.dir, "config.json"), "w", encoding="utf-8") as f:
            json.dump({"accdb_backend": "finto.accdb"}, f)
        uscita = io.StringIO()
        with mock.patch.object(push_cloud.sync, "estrai",
                               return_value={"services": [servizio(1, cli=9)], "clienti": []}), \
                mock.patch.object(sys, "argv", ["push_cloud.py", "--prova"]), \
                mock.patch.object(sys, "stdout", uscita):
            # nessun cliente: prima cli[0] alzava IndexError
            self.assertEqual(push_cloud.main(), 0)
        self.assertIn('"services": 1', uscita.getvalue())
        with mock.patch.object(push_cloud.sync, "estrai",
                               return_value={"services": [], "clienti": []}):
            with self.assertRaises(RuntimeError):
                push_cloud.main()

    def test_annota(self):
        push_cloud.annota("riga di prova")
        with open(push_cloud.LOG, encoding="utf-8") as f:
            self.assertIn("riga di prova", f.read())
