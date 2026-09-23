"""server.py: HTTP vero su una porta temporanea di 127.0.0.1, archivio temporaneo.

Il server gira in un thread (niente sync da Access, niente scoperta UDP); le
richieste passano da http.client/urllib come quelle del browser.
"""
import http.client, json, socket, threading, time

from ._aiuti_py import ConDB, PDF, api, db
import server    # noqa: E402


class ConServer(ConDB):
    def setUp(self):
        super().setUp()
        self.srv = server.Server(("127.0.0.1", 0), server.H)
        self.porta = self.srv.server_address[1]
        self.t = threading.Thread(target=self.srv.serve_forever, args=(0.05,), daemon=True)
        self.t.start()
        self.ruolo("Capo", "admin")      # server.CFG e' il config.json vero

    def tearDown(self):
        self.srv.shutdown()
        self.srv.server_close()
        super().tearDown()

    def http(self, metodo, path, corpo=None, headers=None, grezzo=None):
        c = http.client.HTTPConnection("127.0.0.1", self.porta, timeout=10)
        try:
            h = dict(headers or {})
            if grezzo is None and corpo is not None:
                grezzo = json.dumps(corpo).encode()
                h.setdefault("Content-Type", "application/json")
            c.request(metodo, path, body=grezzo, headers=h)
            r = c.getresponse()
            return r.status, dict(r.getheaders()), r.read()
        finally:
            c.close()

    def api(self, metodo, path, corpo=None):
        st, h, dati = self.http(metodo, path, corpo)
        return st, json.loads(dati)


class Statici(ConServer):
    def test_pagina_e_cache(self):
        st, h, dati = self.http("GET", "/")
        self.assertEqual(st, 200)
        self.assertIn(b"<html", dati.lower())
        self.assertEqual(h["Cache-Control"], "no-store")
        self.assertIn("charset=utf-8", h["Content-Type"])
        st, h, _ = self.http("GET", "/sw.js")
        self.assertEqual((st, h["Cache-Control"]), (200, "no-store"))
        self.assertEqual(h["Service-Worker-Allowed"], "/")
        st, h, _ = self.http("GET", "/css/theme.css")
        self.assertEqual((st, h["Cache-Control"]), (200, "no-cache"))

    def test_cartella_serve_index_senza_cache(self):
        st, h, _ = self.http("GET", "/schede/")
        self.assertEqual((st, h["Cache-Control"]), (200, "no-store"))

    def test_path_traversal(self):
        for p in ("/../app/config.json", "/..%2fapp%2fconfig.json", "/../app/cloud.json",
                  "/..\\app\\config.json", "/../web-altro/x", "/../../Windows/win.ini",
                  "/C:/Windows/win.ini", "//etc/passwd"):
            st, h, dati = self.http("GET", p)
            self.assertEqual(st, 404, p)
            self.assertNotIn(b"sqlite_path", dati)

    def test_inesistente(self):
        self.assertEqual(self.http("GET", "/nulla.js")[0], 404)


class Api(ConServer):
    def test_endpoint_sconosciuto(self):
        st, out = self.api("GET", "/api/nulla")
        self.assertEqual(st, 404)
        st, out = self.api("POST", "/api/bootstrap", {})      # metodo sbagliato
        self.assertEqual(st, 404)

    def test_json_rotto_o_non_oggetto(self):
        for grezzo in (b"{rotto", b"\xff\xfe", b"[1,2]", b'"x"', b"42", b"null"):
            st, h, dati = self.http("POST", "/api/toggle", grezzo=grezzo,
                                    headers={"Content-Type": "application/json"})
            self.assertEqual(st, 400, grezzo)
            self.assertIn("errore", json.loads(dati))

    def test_content_length_non_valido(self):
        s = socket.create_connection(("127.0.0.1", self.porta), timeout=5)
        try:
            s.sendall(b"POST /api/ping HTTP/1.1\r\nHost: x\r\nContent-Length: abc\r\n\r\n")
            risposta = s.recv(4096)
        finally:
            s.close()
        self.assertTrue(risposta.startswith(b"HTTP/1.1 400"), risposta[:40])

    def test_campi_mancanti_sono_400_non_500(self):
        casi = [("/api/toggle", {"anno": 2026}),
                ("/api/toggle", {"id_service": "abc", "anno": 2026, "mese": 1, "campo": "stampata"}),
                ("/api/bulk", {}),
                ("/api/bulk", {"anno": 2026, "celle": [{"mese": 1}]}),
                ("/api/nota", {"id_service": 1}),
                ("/api/toggle", {"id_service": 1, "anno": 2026, "mese": 1, "campo": "stampata",
                                 "valore": 1, "base_rev": "x"})]
        for path, corpo in casi:
            st, out = self.api("POST", path, corpo)
            self.assertEqual(st, 400, (path, corpo, out))
        st, out = self.api("GET", "/api/storia?id_service=abc&anno=2026&mese=1")
        self.assertEqual(st, 400)

    def test_giro_completo(self):
        self.cliente()
        self.servizio()
        st, out = self.api("POST", "/api/operatore", {"nome": "Anna"})
        self.assertEqual((st, out["ruolo"]), (200, "tecnico"))
        st, out = self.api("POST", "/api/toggle", {"id_service": 10, "anno": 2026, "mese": 3,
                                                   "campo": "stampata", "valore": 1,
                                                   "operatore": "Anna", "op_id": "u1"})
        self.assertEqual((st, out["esito"]), (200, "ok"))
        st, out = self.api("GET", "/api/bootstrap?anno=2026&operatore=Capo")
        self.assertEqual(out["celle"]["10-3"]["s"], 1)
        self.assertEqual(out["ruolo"], "admin")
        st, out = self.api("POST", "/api/ripristina", {"op_id": "u1", "operatore": "Anna"})
        self.assertEqual(st, 403)
        st, out = self.api("POST", "/api/ripristina", {"op_id": "u1", "operatore": "Capo"})
        self.assertEqual((st, out["n"]), (200, 1))

    def test_csv_con_bom(self):
        st, h, dati = self.http("GET", "/api/export.csv?anno=2026")
        self.assertEqual(st, 200)
        self.assertTrue(dati.startswith("\ufeff".encode("utf-8")))
        self.assertIn("mappature_2026.csv", h["Content-Disposition"])

    def test_pdf_con_nome_accentato(self):
        """Content-Disposition va in latin-1: il nome con lettere fuori da
        ASCII non deve far saltare la risposta."""
        import base64
        self.cliente()
        self.servizio()
        st, out = self.api("POST", "/api/documento", {
            "id_service": 10, "anno": 2026, "pdf": base64.b64encode(PDF).decode(),
            "nome": "Città Ωmega №1.pdf", "operatore": "Anna"})
        self.assertEqual(st, 200)
        st, h, dati = self.http("GET", "/api/documento?id=" + out["documento"]["id"])
        self.assertEqual((st, dati), (200, PDF))
        self.assertEqual(h["Content-Type"], "application/pdf")
        self.assertTrue(h["Content-Disposition"].startswith("inline"))
        st, h, _ = self.http("GET", "/api/documento?id=%s&scarica=1" % out["documento"]["id"])
        self.assertTrue(h["Content-Disposition"].startswith("attachment"))


class Stream(ConServer):
    def leggi_evento(self, r, timeout=5):
        fine = time.time() + timeout
        buf = b""
        while time.time() < fine:
            riga = r.fp.readline()
            if not riga:
                break
            buf += riga
            if buf.endswith(b"\n\n") and b"data:" in buf:
                return buf.decode("utf-8")
        return None

    def test_evento_agli_altri_non_a_chi_scrive(self):
        c = http.client.HTTPConnection("127.0.0.1", self.porta, timeout=10)
        c.request("GET", "/api/stream?client_id=A")
        r = c.getresponse()
        self.assertEqual(r.getheader("Content-Type"), "text/event-stream; charset=utf-8")
        self.assertEqual(r.fp.readline(), b": benvenuto\n")
        r.fp.readline()
        try:
            # scritto da A stesso: non gli torna indietro
            self.api("POST", "/api/toggle", {"id_service": 10, "anno": 2026, "mese": 3,
                                             "campo": "stampata", "valore": 1,
                                             "operatore": "Anna", "client_id": "A"})
            self.api("POST", "/api/toggle", {"id_service": 10, "anno": 2026, "mese": 4,
                                             "campo": "stampata", "valore": 1,
                                             "operatore": "Bruno", "client_id": "B"})
            ev = self.leggi_evento(r)
            self.assertIsNotNone(ev)
            self.assertTrue(ev.startswith("event: cella\n"), ev)
            dati = json.loads(ev.split("data: ", 1)[1])
            self.assertEqual((dati["mese"], dati["operatore"]), (4, "Bruno"))
            self.assertIn("seq", dati)
        finally:
            c.close()


class Hub(ConDB):
    def test_coda_piena_scarta_e_iscritto_lo_dice(self):
        hub = server.Hub()
        q = hub.iscrivi()
        self.assertTrue(hub.iscritto(q))
        for i in range(201):
            hub.diffondi({"tipo": "x", "i": i})
        self.assertFalse(hub.iscritto(q))
        self.assertEqual(hub.quanti, 0)

    def test_esclusione_e_seq(self):
        hub = server.Hub()
        a, b = hub.iscrivi(), hub.iscrivi()
        a.client_id, b.client_id = "A", "B"
        hub.diffondi({"tipo": "x"}, escludi="A")
        hub.diffondi(None)
        self.assertTrue(a.empty())
        ev = b.get_nowait()
        self.assertEqual((ev["tipo"], ev["seq"]), ("x", 1))
        hub.disiscrivi(a)
        hub.disiscrivi(a)            # due volte: nessun errore
        self.assertEqual(hub.quanti, 1)

    def test_stream_scartato_si_chiude(self):
        """Prima una connessione SSE buttata fuori per coda piena restava
        aperta a soli ping: il browser credeva di essere collegato e non
        riceveva piu' niente. Ora lo stream finisce e il browser si riconnette."""
        vecchio, ping = server.HUB, server.PING_SSE
        server.HUB, server.PING_SSE = server.Hub(), 0.05
        try:
            srv = server.Server(("127.0.0.1", 0), server.H)
            threading.Thread(target=srv.serve_forever, args=(0.05,), daemon=True).start()
            try:
                c = http.client.HTTPConnection("127.0.0.1", srv.server_address[1], timeout=5)
                c.request("GET", "/api/stream?client_id=Z")
                r = c.getresponse()
                self.assertEqual(r.fp.readline(), b": benvenuto\n")
                self.assertEqual(server.HUB.quanti, 1)
                # la si butta fuori come farebbe diffondi() a coda piena
                with server.HUB.lock:
                    server.HUB.clients.clear()
                chiuso, fine = False, time.time() + 4
                while time.time() < fine:
                    if not r.fp.readline():
                        chiuso = True
                        break
                self.assertTrue(chiuso)
                c.close()
            finally:
                srv.shutdown()
                srv.server_close()
        finally:
            server.HUB, server.PING_SSE = vecchio, ping


class Porta(ConDB):
    def test_porta_occupata(self):
        s = socket.socket()
        s.bind(("127.0.0.1", 0))
        s.listen(1)
        p = s.getsockname()[1]
        try:
            self.assertTrue(server.porta_occupata(p))
        finally:
            s.close()
        self.assertFalse(server.porta_occupata(p))

    def test_ip_lan_e_un_ip(self):
        self.assertRegex(server.ip_lan(), r"^\d+\.\d+\.\d+\.\d+$")
