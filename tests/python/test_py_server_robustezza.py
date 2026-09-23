"""server.py: i casi al bordo dell'HTTP e l'avvio (main) senza toccare niente di vero.

Corpo troppo grande o a pezzi, client lenti che tengono un thread, cartelle
senza la barra finale, BOM, file che non si apre, porta presa fra il controllo
e il bind, IPv6, e main() con --db/--porta/--no-sync. Tutto su 127.0.0.1 a una
porta scelta dal sistema; rete_locale e sync finti; l'archivio e' un SQLite
temporaneo (mai data/cronoservice.db, mai data/backup vero).
"""
import io, json, os, socket, sys, time, unittest
from unittest import mock

from .test_py_server import ConServer
from ._aiuti_py import ConDB, db
import server, rete_locale, sync    # noqa: E402


def _risposta_grezza(porta, richiesta, attesa=5):
    """Manda byte grezzi e legge finche' il server chiude o passa `attesa`."""
    s = socket.create_connection(("127.0.0.1", porta), timeout=attesa)
    try:
        s.sendall(richiesta)
        dati = b""
        while True:
            try:
                pezzo = s.recv(4096)
            except socket.timeout:
                return dati, False          # ancora aperta
            except ConnectionResetError:
                return dati, True
            if not pezzo:
                return dati, True           # chiusa dal server
            dati += pezzo
    finally:
        s.close()


class Corpo(ConServer):
    def test_corpo_oltre_il_tetto_e_413_subito(self):
        """Prima un Content-Length enorme (o solo dichiarato) teneva il thread
        fermo su rfile.read ad aspettare byte che non arrivano mai."""
        t0 = time.time()
        dati, chiusa = _risposta_grezza(
            self.porta, b"POST /api/ping HTTP/1.1\r\nHost: x\r\nContent-Type: application/json"
                        b"\r\nContent-Length: %d\r\n\r\n" % (server.MAX_CORPO + 1), attesa=4)
        self.assertTrue(dati.startswith(b"HTTP/1.1 413"), dati[:60])
        self.assertTrue(chiusa)
        self.assertLess(time.time() - t0, 3)

    def test_content_length_negativo_o_non_numerico_e_400(self):
        for cl in (b"-5", b"12abc", b"1e3"):
            dati, chiusa = _risposta_grezza(
                self.porta, b"POST /api/ping HTTP/1.1\r\nHost: x\r\nContent-Type: "
                            b"application/json\r\nContent-Length: " + cl + b"\r\n\r\n")
            self.assertTrue(dati.startswith(b"HTTP/1.1 400"), (cl, dati[:60]))
            self.assertTrue(chiusa, cl)

    def test_il_tetto_basta_per_il_pdf_piu_grande(self):
        import api
        self.assertGreater(server.MAX_CORPO, api.MAX_PDF * 4 // 3)

    def test_chunked_e_411(self):
        """Senza Content-Length il corpo a pezzi restava nel flusso e veniva
        letto come la richiesta successiva."""
        dati, chiusa = _risposta_grezza(
            self.porta, b"POST /api/ping HTTP/1.1\r\nHost: x\r\nContent-Type: application/json"
                        b"\r\nTransfer-Encoding: chunked\r\n\r\n2\r\n{}\r\n0\r\n\r\n")
        self.assertTrue(dati.startswith(b"HTTP/1.1 411"), dati[:60])
        self.assertEqual(dati.count(b"HTTP/1.1 "), 1)      # niente seconda risposta spazzatura
        self.assertTrue(chiusa)

    def test_json_con_bom_si_accetta(self):
        st, h, dati = self.http("POST", "/api/operatore",
                                grezzo=b"\xef\xbb\xbf" + b'{"nome": "Anna"}',
                                headers={"Content-Type": "application/json"})
        self.assertEqual(st, 200, dati)
        self.assertEqual(json.loads(dati)["ruolo"], "tecnico")


class ValoriStrani(ConServer):
    def test_nan_e_infinity_sono_400(self):
        """json.loads accetta NaN/Infinity (non sono JSON): arrivavano agli
        handler come float e finivano in int(nan), in SQLite o nel diario."""
        for grezzo in (b'{"dove": NaN}', b'{"dove": Infinity}', b'{"dove": -Infinity}'):
            st, h, dati = self.http("POST", "/api/ping", grezzo=grezzo,
                                    headers={"Content-Type": "application/json"})
            self.assertEqual(st, 400, grezzo)
            self.assertIn("errore", json.loads(dati))

    def test_intero_enorme_e_400_non_500(self):
        """Un id oltre i 64 bit: SQLite alza OverflowError, che finiva in 500."""
        st, out = self.api("POST", "/api/toggle", {"id_service": 10 ** 30, "anno": 2026,
                                                   "mese": 3, "campo": "stampata",
                                                   "valore": 1, "operatore": "Anna"})
        self.assertEqual(st, 400, out)

    def test_errori_di_binding_sqlite_sono_400(self):
        """Una lista o un oggetto dove l'handler aspetta un valore semplice:
        sqlite3.ProgrammingError / InterfaceError, e' la richiesta sbagliata."""
        import sqlite3

        for errore in (sqlite3.ProgrammingError("Error binding parameter 1: type 'list' "
                                                "is not supported"),
                       sqlite3.InterfaceError("Error binding parameter 0"),
                       OverflowError("Python int too large to convert to SQLite INTEGER")):
            def rotto(ctx, q, body, errore=errore):
                raise errore
            with mock.patch.dict(server.api.ROUTE, {("POST", "/api/ping"): rotto}):
                st, out = self.api("POST", "/api/ping", {"x": [1]})
            self.assertEqual(st, 400, (errore, out))


class ClientLenti(ConServer):
    def test_richiesta_a_meta_non_tiene_il_thread_per_sempre(self):
        """Un client che apre e non finisce la richiesta (o che sparisce dalla
        rete) teneva un thread e un socket per sempre: niente timeout."""
        with mock.patch.object(server.H, "timeout", 0.5):
            t0 = time.time()
            dati, chiusa = _risposta_grezza(self.porta, b"GET / HTTP/1.1\r\nHost: x\r\n", attesa=4)
            self.assertTrue(chiusa)
            self.assertLess(time.time() - t0, 3)
            # corpo dichiarato e mai mandato per intero
            dati, chiusa = _risposta_grezza(
                self.porta, b"POST /api/ping HTTP/1.1\r\nHost: x\r\nContent-Type: "
                            b"application/json\r\nContent-Length: 50\r\n\r\n{", attesa=4)
            self.assertTrue(chiusa)

    def test_stream_di_un_client_sparito_esce_dall_hub(self):
        """Il browser chiuso: al primo ping che non passa lo stream finisce e
        la coda esce dall'hub (niente thread e code che si accumulano)."""
        vecchio, ping = server.HUB, server.PING_SSE
        server.HUB, server.PING_SSE = server.Hub(), 0.05
        try:
            s = socket.create_connection(("127.0.0.1", self.porta), timeout=5)
            s.sendall(b"GET /api/stream?client_id=Z HTTP/1.1\r\nHost: x\r\n\r\n")
            letto = b""
            while b"benvenuto" not in letto:
                pezzo = s.recv(4096)
                self.assertTrue(pezzo)
                letto += pezzo
            self.assertEqual(server.HUB.quanti, 1)
            s.close()
            fine = time.time() + 4
            while time.time() < fine and server.HUB.quanti:
                time.sleep(0.05)
            self.assertEqual(server.HUB.quanti, 0)
        finally:
            server.HUB, server.PING_SSE = vecchio, ping

    def test_c_e_un_timeout_di_default(self):
        self.assertTrue(server.H.timeout and server.H.timeout > server.PING_SSE)


class Statici(ConServer):
    def test_cartella_senza_barra_rimanda_alla_barra(self):
        """/schede serviva schede/index.html ma i suoi indirizzi relativi
        (ponte.js, registro.css) finivano sulla radice: pagina rotta."""
        for p, dove in (("/schede", "/schede/"), ("/registro?x=1", "/registro/?x=1")):
            st, h, _ = self.http("GET", p)
            self.assertEqual(st, 301, p)
            self.assertEqual(h["Location"], dove)
        self.assertEqual(self.http("GET", "/schede/")[0], 200)

    def test_file_che_non_si_apre_e_404_non_connessione_caduta(self):
        with mock.patch("server.open", side_effect=PermissionError("bloccato"), create=True):
            st, h, dati = self.http("GET", "/css/theme.css")
        self.assertEqual(st, 404)


class Avvio(ConDB):
    """main() con tutto quello che esce dal PC sostituito."""

    def setUp(self):
        super().setUp()
        s = socket.socket()
        s.bind(("127.0.0.1", 0))
        self.porta_libera = s.getsockname()[1]
        s.close()
        self.altro_db = os.path.join(self.dir, "copia.db")
        # niente percorsi veri: archivio e backup nella cartella di prova
        self.p = [mock.patch.dict(server.CFG, {
                      "sqlite_path": os.path.join(self.dir, "non-esiste.db"),
                      "backup_dir": os.path.join(self.dir, "backup"),
                      "host": "127.0.0.1", "sync_all_avvio": True}),
                  mock.patch.object(rete_locale, "avvia_risponditore", return_value=None),
                  mock.patch.object(rete_locale, "cerca_altri", return_value=[]),
                  mock.patch.object(server, "CTX", {"cfg": server.CFG, "base": server.BASE})]
        for x in self.p:
            x.start()

    def tearDown(self):
        for x in reversed(self.p):
            x.stop()
        db.init(self.percorso)
        super().tearDown()

    def avvia(self, *argv):
        uscita = io.StringIO()
        with mock.patch.object(sys, "argv", ["server.py"] + list(argv)), \
                mock.patch.object(sys, "stdout", uscita), \
                mock.patch.object(server.Server, "serve_forever",
                                  side_effect=KeyboardInterrupt) as sf:
            server.main()
        return uscita.getvalue(), sf

    def test_db_porta_no_sync(self):
        with mock.patch.object(sync, "esegui") as es:
            testo, sf = self.avvia("--db", self.altro_db, "--porta", str(self.porta_libera),
                                   "--no-sync")
        es.assert_not_called()
        sf.assert_called_once()
        self.assertEqual(db._DB_PATH, os.path.abspath(self.altro_db))
        self.assertTrue(os.path.exists(self.altro_db))
        self.assertIn("localhost:%d" % self.porta_libera, testo)
        self.assertIn("Arresto", testo)

    def test_sync_all_avvio_sul_db_scelto_col_backup_giusto(self):
        """Con --db il backup del sync all'avvio copiava l'archivio di
        config.json (qui: uno che non esiste, quindi nessun backup) invece di
        quello su cui si lavora."""
        payload = {"services": [{"IDService": "1", "IDCliente": "1", "Stato": "APERTO"}],
                   "clienti": [{"IDCliente": "1", "RagSoc": "UNO"}]}
        with mock.patch.object(sync, "estrai", return_value=payload):
            testo, _ = self.avvia("--db", self.altro_db, "--porta", str(self.porta_libera))
        self.assertIn("Sync Access: 1 clienti, 1 service", testo)
        copie = os.listdir(os.path.join(self.dir, "backup"))
        self.assertEqual(len(copie), 1, copie)

    def test_sync_che_fallisce_non_ferma_l_avvio(self):
        with mock.patch.object(sync, "estrai", side_effect=RuntimeError("Access assente")):
            testo, sf = self.avvia("--db", self.altro_db, "--porta", str(self.porta_libera))
        self.assertIn("sync Access non riuscito", testo)
        sf.assert_called_once()

    def test_gia_in_esecuzione(self):
        occupa = socket.socket()
        occupa.bind(("127.0.0.1", 0))
        occupa.listen(1)
        try:
            with mock.patch.object(db, "init") as ini:
                testo, sf = self.avvia("--porta", str(occupa.getsockname()[1]))
        finally:
            occupa.close()
        self.assertIn("GIA' in esecuzione", testo)
        sf.assert_not_called()
        ini.assert_not_called()

    def test_porta_presa_fra_controllo_e_bind(self):
        """Due avvii quasi insieme (o "host" su un IP della LAN, dove il
        controllo su 127.0.0.1 non vede niente): il bind falliva con un
        traceback invece del messaggio."""
        occupa = socket.socket()
        occupa.bind(("127.0.0.1", 0))
        occupa.listen(1)
        try:
            with mock.patch.object(server, "porta_occupata", return_value=False):
                testo, sf = self.avvia("--db", self.altro_db, "--no-sync",
                                       "--porta", str(occupa.getsockname()[1]))
        finally:
            occupa.close()
        self.assertIn("GIA' in esecuzione", testo)
        sf.assert_not_called()


def _ipv6_locale():
    if not socket.has_ipv6:
        return False
    try:
        s = socket.socket(socket.AF_INET6)
        s.bind(("::1", 0))
        s.close()
        return True
    except OSError:
        return False


class Ipv6(ConDB):
    @unittest.skipUnless(_ipv6_locale(), "niente ::1 su questo PC")
    def test_host_ipv6(self):
        """"host": "::1" (o "::") in config.json: ThreadingHTTPServer e' solo
        IPv4 e l'avvio falliva."""
        srv = server.crea_server("::1", 0)
        try:
            self.assertEqual(srv.address_family, socket.AF_INET6)
        finally:
            srv.server_close()

    def test_host_ipv4_resta_ipv4(self):
        srv = server.crea_server("127.0.0.1", 0)
        try:
            self.assertEqual(srv.address_family, socket.AF_INET)
        finally:
            srv.server_close()
