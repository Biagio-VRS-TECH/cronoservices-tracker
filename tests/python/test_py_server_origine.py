"""server.py, SEC-12: niente POST da un'altra origine o non JSON; di default solo 127.0.0.1."""
import json, os

from .test_py_server import ConServer
import server    # noqa: E402


class Origine(ConServer):
    def test_altra_origine_rifiutata(self):
        for o in ("http://evil.example", "null"):
            st, h, dati = self.http("POST", "/api/ping", {"dove": "x"},
                                    headers={"Origin": o})
            self.assertEqual(st, 403, o)
            self.assertIn("errore", json.loads(dati))

    def test_stessa_origine_passa(self):
        c = "127.0.0.1:%d" % self.porta
        st, _, _ = self.http("POST", "/api/ping", {"dove": "x"},
                             headers={"Origin": "http://" + c, "Host": c})
        self.assertNotEqual(st, 403)

    def test_corpo_non_json_rifiutato(self):
        st, _, dati = self.http("POST", "/api/ping", grezzo=b'{"dove":"x"}',
                                headers={"Content-Type": "text/plain"})
        self.assertEqual(st, 415)
        self.assertIn("errore", json.loads(dati))

    def test_config_solo_questo_pc(self):
        with open(os.path.join(server.BASE, "config.json"), encoding="utf-8") as f:
            self.assertEqual(json.load(f)["host"], "127.0.0.1")
