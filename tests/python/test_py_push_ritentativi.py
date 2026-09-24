"""push_cloud.py: ritentativi limitati sui guasti passeggeri, niente ritentativi
sui rifiuti, la chiave mai nel messaggio d'errore (che finisce nel log) e una
risposta che non e' JSON detta chiara. `urlopen` e' sempre finto: nessuna
chiamata a Supabase; niente app/cloud.json ne' log veri.
"""
import io, json, os, socket, sys, urllib.error
from unittest import mock

from ._aiuti_py import ConDB
from .test_py_sync import servizio
import push_cloud    # noqa: E402


def ok(corpo=b'{"services": 1}'):
    r = mock.MagicMock()
    r.__enter__.return_value.read.return_value = corpo
    return r


def http_err(codice, corpo=b"errore"):
    return urllib.error.HTTPError("https://x", codice, "no", {}, io.BytesIO(corpo))


class Base(ConDB):
    def setUp(self):
        super().setUp()
        self.p = [mock.patch.object(push_cloud, "BASE", self.dir),
                  mock.patch.object(push_cloud, "LOG", os.path.join(self.dir, "push.log")),
                  mock.patch.object(push_cloud, "ATTESE", (0, 0)),
                  mock.patch.dict(os.environ, {}, clear=False)]
        for x in self.p:
            x.start()
        for k in ("CRONO_SUPABASE_URL", "CRONO_SUPABASE_SERVICE_KEY", "CRONO_SYNC_KEY"):
            os.environ.pop(k, None)

    def tearDown(self):
        for x in reversed(self.p):
            x.stop()
        super().tearDown()

    def manda(self, effetti, via="funzione"):
        with mock.patch.object(push_cloud.urllib.request, "urlopen",
                               side_effect=effetti) as u:
            try:
                return push_cloud.manda("https://x", "chiave-segreta-48", [],
                                        [{"id_service": 1}], via), u
            except Exception as e:     # noqa: BLE001
                return e, u


class Ritentativi(Base):
    def test_guasto_passeggero_poi_ok(self):
        """La rete che cade un attimo alle 08:15 faceva saltare il travaso
        del giorno (l'operazione pianificata gira una volta sola)."""
        r, u = self.manda([urllib.error.URLError("rete giu'"), socket.timeout("lento"),
                           ok()])
        self.assertEqual(r, {"services": 1})
        self.assertEqual(u.call_count, 3)

    def test_5xx_si_ritenta(self):
        r, u = self.manda([http_err(503), http_err(502), ok()])
        self.assertEqual(r, {"services": 1})

    def test_rifiuto_non_si_ritenta(self):
        for codice in (400, 401, 403, 413):
            r, u = self.manda([http_err(codice), ok()])
            self.assertIsInstance(r, RuntimeError, codice)
            self.assertIn(str(codice), str(r))
            self.assertEqual(u.call_count, 1, codice)

    def test_limite_non_ripete_all_infinito(self):
        r, u = self.manda([http_err(500) for _ in range(10)])
        self.assertIsInstance(r, RuntimeError)
        self.assertEqual(u.call_count, len(push_cloud.ATTESE) + 1)

    def test_manda_sempre_tutto_insieme(self):
        """Un solo corpo con tutta l'anagrafica: sync_applica e' una
        transazione, a lotti un errore a meta' lascerebbe mezzo aggiornamento."""
        servs = [{"id_service": i} for i in range(1200)]
        with mock.patch.object(push_cloud.urllib.request, "urlopen",
                               side_effect=[ok()]) as u:
            push_cloud.manda("https://x", "k", [{"id_cliente": 1}], servs, "funzione")
        self.assertEqual(u.call_count, 1)
        corpo = json.loads(u.call_args[0][0].data)
        self.assertEqual(len(corpo["p_services"]), 1200)
        self.assertEqual(corpo["p_clienti"], [{"id_cliente": 1}])


class NienteSegretiNelLog(Base):
    def test_chiave_tolta_dal_messaggio(self):
        r, _ = self.manda([http_err(401, b'{"error": "chiave chiave-segreta-48 non valida"}')])
        self.assertNotIn("chiave-segreta-48", str(r))
        r, _ = self.manda([urllib.error.URLError("https://x?k=chiave-segreta-48")] * 5)
        self.assertNotIn("chiave-segreta-48", str(r))

    def test_main_scrive_ok_nel_log_senza_chiave(self):
        with open(os.path.join(self.dir, "config.json"), "w", encoding="utf-8") as f:
            json.dump({"accdb_backend": "finto.accdb"}, f)
        with open(os.path.join(self.dir, "cloud.json"), "w", encoding="utf-8") as f:
            json.dump({"supabase_url": "https://x.supabase.co", "sync_key": "chiave-segreta-48"}, f)
        risposta = {"services": 1, "clienti": 0, "nuovi": 1, "chiusi": 0, "riaperti": 0,
                    "mesi_cambiati": 0, "archiviati": 0, "spunte_orfane": 0}
        with mock.patch.object(push_cloud.sync, "estrai",
                               return_value={"services": [servizio(1)], "clienti": []}), \
                mock.patch.object(push_cloud.urllib.request, "urlopen",
                                  return_value=ok(json.dumps(risposta).encode())), \
                mock.patch.object(sys, "argv", ["push_cloud.py"]), \
                mock.patch.object(sys, "stdout", io.StringIO()):
            self.assertEqual(push_cloud.main(), 0)
        with open(push_cloud.LOG, encoding="utf-8") as f:
            log = f.read()
        self.assertIn("ok  1 service", log)
        self.assertNotIn("chiave-segreta-48", log)


class RispostaStrana(Base):
    def test_risposta_non_json(self):
        """Un proxy o un portale che risponde 200 con una pagina HTML: prima
        il log diceva solo 'Expecting value: line 1 column 1'."""
        r, _ = self.manda([ok(b"<html>captive portal</html>")])
        self.assertIsInstance(r, RuntimeError)
        self.assertIn("non e' JSON", str(r))

    def test_risposta_json_ma_non_oggetto(self):
        r, _ = self.manda([ok(b"[1, 2]")])
        self.assertIsInstance(r, RuntimeError)
