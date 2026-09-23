"""Gli stessi input strani delle prove sugli handler, ma dal server vero (HTTP
su 127.0.0.1, porta del sistema): nessuno deve diventare un 500. Documenti,
presenze, diario, dizionario e permessi."""
import base64, os, sqlite3
from unittest import mock

from ._aiuti_py import PDF, api, db
from .test_py_server import ConServer
import api_documenti  # noqa: E402


def b64(dati=PDF):
    return base64.b64encode(dati).decode()


class NessunCinquecento(ConServer):
    def setUp(self):
        super().setUp()
        self.cliente()
        self.servizio()

    def st(self, metodo, path, corpo=None):
        return self.http(metodo, path, corpo)[0]

    def test_input_strani_sono_4xx(self):
        grande = "9" * 30
        casi = [
            ("POST", "/api/documento", {"id_service": 10, "anno": 10 ** 30, "pdf": b64()}),
            ("POST", "/api/documento", {"id_service": 10 ** 30, "anno": 2026, "pdf": b64()}),
            ("POST", "/api/documento", {"id_service": 10, "anno": 2026, "pdf": b64(b"%PDF")}),
            ("POST", "/api/documenti_elimina", {"anno": "²", "operatore": "Capo"}),
            ("POST", "/api/documenti_elimina", {"id_service": grande}),
            ("GET", "/api/storia?id_service=%s&anno=2026&mese=3" % grande, None),
            ("GET", "/api/storia?anno=2026&mese=3", None),
            ("POST", "/api/operatore", {"nome": 5}),
            ("POST", "/api/ruolo", {"nome": 5, "ruolo": "admin", "operatore": "Capo"}),
            ("POST", "/api/ruolo", {"nome": "Anna", "ruolo": "admin", "operatore": 5}),
            ("POST", "/api/diario_azzera", {"operatore": ["Capo"]}),
            ("POST", "/api/impostazioni", {"inizio_tracciamento": "2026-01", "operatore": 5}),
            ("POST", "/api/documenti_elimina", {"anno": 2026, "operatore": {"n": 1}}),
        ]
        with mock.patch.object(api.sync, "esegui") as es:
            casi.append(("POST", "/api/sync", {"operatore": 5}))
            for metodo, path, corpo in casi:
                st = self.st(metodo, path, corpo)
                self.assertTrue(400 <= st < 500, (st, path, corpo))
            es.assert_not_called()
        self.assertEqual(self.conta("documenti"), 0)

    def test_input_strani_accettati_e_ripuliti(self):
        casi = [
            ("POST", "/api/documento", {"id_service": 10, "anno": 2026, "pdf": b64(),
                                        "pagine": 10 ** 30, "operatore": {"n": 1},
                                        "nome": "\U0001D400" * 200}),
            ("GET", "/api/documenti?anno=" + "9" * 30, None),
            ("POST", "/api/ping", {"operatore": 5, "dove": "x"}),
            ("POST", "/api/ping", {"operatore": "Anna", "dove": "D" * 100000}),
            ("POST", "/api/dizionario", {"codice": "EST", "nome": "E", "operatore": {"n": 1}}),
        ]
        for metodo, path, corpo in casi:
            self.assertEqual(self.st(metodo, path, corpo), 200, (path, corpo))
        self.assertEqual(self.conta("documenti"), 1)

    def test_archivio_bloccato_e_un_503_e_non_lascia_file(self):
        """Il BEGIN IMMEDIATE che non ottiene il lucchetto: prima il ROLLBACK
        senza transazione copriva l'errore (500) e il PDF restava sul disco."""
        vera = db.connect

        class Bloccata:
            def __init__(self):
                self.c = vera()

            def execute(self, sql, *a):
                if sql.startswith("BEGIN"):
                    raise sqlite3.OperationalError("database is locked")
                return self.c.execute(sql, *a)

            def __getattr__(self, k):
                return getattr(self.c, k)

        with mock.patch.object(api_documenti.db, "connect", Bloccata):
            st, h, dati = self.http("POST", "/api/documento",
                                    {"id_service": 10, "anno": 2026, "pdf": b64()})
        self.assertEqual(st, 503, dati)
        cartella = os.path.join(self.dir, "documenti")
        self.assertEqual([f for _, _, ff in os.walk(cartella) for f in ff], [])
