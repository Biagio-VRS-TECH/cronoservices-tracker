"""rete_locale.py: il risponditore UDP e la ricerca, solo su 127.0.0.1 e su
una porta libera (mai la 8771 dell'utente)."""
import socket, time, unittest
from unittest import mock

from . import _aiuti_py  # noqa: F401  (mette app/ nel sys.path)
import rete_locale     # noqa: E402


def porta_udp_libera():
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    s.bind(("127.0.0.1", 0))
    p = s.getsockname()[1]
    s.close()
    return p


class Risponditore(unittest.TestCase):
    def setUp(self):
        self.porta = porta_udp_libera()
        self.s = rete_locale.avvia_risponditore("http://10.0.0.5:8790", porta=self.porta)
        self.assertIsNotNone(self.s)

    def tearDown(self):
        self.s.close()

    def chiedi(self, domanda=rete_locale.DOMANDA):
        c = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        c.settimeout(2)
        try:
            c.sendto(domanda, ("127.0.0.1", self.porta))
            return c.recvfrom(512)[0]
        except socket.timeout:
            return None
        finally:
            c.close()

    def test_risponde_con_host_e_url(self):
        r = self.chiedi()
        self.assertIsNotNone(r)
        pezzi = r.decode().split(" ", 2)
        self.assertEqual(pezzi[0], "CRONO!")
        self.assertEqual(pezzi[2], "http://10.0.0.5:8790")

    def test_ignora_il_resto(self):
        self.assertIsNone(self.chiedi(b"CIAO"))
        self.assertIsNotNone(self.chiedi())

    def test_sopravvive_a_chi_chiude_prima_della_risposta(self):
        """Su Windows la risposta a un socket gia' chiuso torna come
        WinError 10054 sulla recvfrom successiva: prima il thread usciva."""
        for _ in range(3):
            c = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            c.sendto(rete_locale.DOMANDA, ("127.0.0.1", self.porta))
            c.close()
        time.sleep(0.2)
        self.assertIsNotNone(self.chiedi())

    def test_porta_occupata_non_e_fatale(self):
        occupa = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        occupa.bind(("127.0.0.1", 0))
        try:
            with mock.patch.object(socket.socket, "bind", side_effect=OSError("occupata")):
                self.assertIsNone(rete_locale.avvia_risponditore("x", porta=1))
        finally:
            occupa.close()


class Cerca(unittest.TestCase):
    def test_se_stesso_non_conta(self):
        porta = porta_udp_libera()
        s = rete_locale.avvia_risponditore("http://127.0.0.1:8790", porta=porta)
        try:
            self.assertEqual(rete_locale.cerca_altri(porta=porta, attesa=0.4), [])
        finally:
            s.close()

    def test_ip_locali(self):
        ip = rete_locale._ip_locali()
        self.assertIn("127.0.0.1", ip)
