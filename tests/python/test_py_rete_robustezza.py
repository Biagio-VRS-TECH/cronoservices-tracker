"""rete_locale.py: il risponditore che non deve morire, cosa arriva all'interfaccia
e il server partito per primo che viene a sapere del secondo. Solo 127.0.0.1 e
porte UDP libere (mai la 8771 dell'utente); la "rete" e' ridotta a 127.0.0.1
spostando DESTINAZIONI e togliendo 127.0.0.1 dagli indirizzi "miei".
"""
import socket, threading, time, unittest
from unittest import mock

from . import _aiuti_py  # noqa: F401  (mette app/ nel sys.path)
from .test_py_rete_locale import porta_udp_libera
import rete_locale     # noqa: E402


def chiedi(porta, domanda=rete_locale.DOMANDA, attesa=2):
    c = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    c.settimeout(attesa)
    try:
        c.sendto(domanda, ("127.0.0.1", porta))
        return c.recvfrom(512)[0]
    except socket.timeout:
        return None
    finally:
        c.close()


class FintoServer:
    """Un 'altro Crono' su 127.0.0.1 che risponde quello che si vuole."""

    def __init__(self, risposte):
        self.s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        self.s.bind(("127.0.0.1", 0))
        self.porta = self.s.getsockname()[1]
        self.domande = []
        threading.Thread(target=self._ciclo, args=(risposte,), daemon=True).start()

    def _ciclo(self, risposte):
        try:
            dati, mitt = self.s.recvfrom(512)
        except OSError:
            return
        self.domande.append(dati)
        for r in risposte:
            try:
                self.s.sendto(r, mitt)
            except OSError:
                pass

    def chiudi(self):
        self.s.close()


class Base(unittest.TestCase):
    def setUp(self):
        del rete_locale.ALTRI[:]
        self.p = [mock.patch.object(rete_locale, "_ip_locali", return_value=set()),
                  mock.patch.object(rete_locale, "DESTINAZIONI", ("127.0.0.1",))]
        for x in self.p:
            x.start()

    def tearDown(self):
        for x in reversed(self.p):
            x.stop()
        del rete_locale.ALTRI[:]


class RisponditoreCheNonMuore(unittest.TestCase):
    def test_datagramma_troppo_grande(self):
        """Su Windows un datagramma oltre i 512 byte del buffer alza
        WinError 10040 (e non ConnectionReset): il thread usciva e il server
        non rispondeva piu' a nessuno. Basta un apparecchio in rete che manda
        un pacchetto grosso sulla 8771."""
        porta = porta_udp_libera()
        s = rete_locale.avvia_risponditore("http://10.0.0.5:8790", porta=porta)
        try:
            c = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            c.sendto(b"x" * 2000, ("127.0.0.1", porta))
            c.close()
            time.sleep(0.2)
            self.assertIsNotNone(chiedi(porta))
        finally:
            s.close()


class CosaArrivaAllInterfaccia(Base):
    def cerca(self, risposte):
        f = FintoServer(risposte)
        try:
            return rete_locale.cerca_altri(porta=f.porta, attesa=0.6), f
        finally:
            f.chiudi()

    def test_risposta_buona(self):
        altri, _ = self.cerca([b"CRONO! PC-UFFICIO http://192.168.1.20:8770"])
        self.assertEqual(altri, [{"ip": "127.0.0.1", "host": "PC-UFFICIO",
                                  "url": "http://192.168.1.20:8770"}])

    def test_url_non_http_non_arriva_al_link(self):
        """L'URL finisce in <a href> nella fascia rossa: chiunque in rete puo'
        rispondere alla domanda in broadcast, e un javascript: si eseguiva al
        clic. Resta l'avviso, col link all'indirizzo da cui e' arrivata."""
        for url in (b"javascript:alert(1)", b"data:text/html,x", b"http://a b/",
                    b'http://x/"><script>', b"http://" + b"a" * 300):
            del rete_locale.ALTRI[:]
            altri, _ = self.cerca([b"CRONO! PC " + url])
            self.assertEqual(len(altri), 1, url)
            self.assertEqual(altri[0]["url"], "http://127.0.0.1:8770", url)

    def test_nome_ripulito_e_corto(self):
        altri, _ = self.cerca([b"CRONO! " + b"\x1b[31m" + b"N" * 200 + b" http://h:1"])
        self.assertNotIn("\x1b", altri[0]["host"])
        self.assertLessEqual(len(altri[0]["host"]), 64)

    def test_pacchetto_grosso_non_ferma_la_ricerca(self):
        """Il 10040 anche nella ricerca: prima interrompeva il giro e la
        risposta vera, arrivata dopo, andava persa."""
        altri, _ = self.cerca([b"z" * 2000, b"CRONO! PC-DUE http://192.168.1.21:8770"])
        self.assertEqual([a["host"] for a in altri], ["PC-DUE"])

    def test_la_domanda_dice_chi_sono(self):
        f = FintoServer([])
        try:
            rete_locale.cerca_altri(porta=f.porta, attesa=0.3, mio_url="http://10.0.0.7:8770")
        finally:
            f.chiudi()
        self.assertEqual(len(f.domande), 1)
        pezzi = f.domande[0].decode().split(" ")
        self.assertEqual(pezzi[0], "CRONO?")
        self.assertEqual(pezzi[-1], "http://10.0.0.7:8770")


class IlPrimoSaDelSecondo(Base):
    """Il server partito per primo non cercava piu' nessuno: la fascia rossa
    la vedeva solo chi usava il SECONDO. Ora la domanda del secondo porta il
    suo indirizzo e il risponditore del primo se lo segna."""

    def setUp(self):
        super().setUp()
        self.porta = porta_udp_libera()
        self.s = rete_locale.avvia_risponditore("http://10.0.0.5:8790", porta=self.porta)

    def tearDown(self):
        self.s.close()
        super().tearDown()

    def aspetta_altri(self, n, attesa=1.0):
        fine = time.time() + attesa
        while time.time() < fine and len(rete_locale.ALTRI) < n:
            time.sleep(0.02)
        return list(rete_locale.ALTRI)

    def test_domanda_con_indirizzo_segnata(self):
        self.assertIsNotNone(chiedi(self.porta, b"CRONO? PC-DUE http://10.0.0.9:8770"))
        self.assertEqual(self.aspetta_altri(1), [{"ip": "127.0.0.1", "host": "PC-DUE",
                                                 "url": "http://10.0.0.9:8770"}])
        # la stessa domanda ripetuta non raddoppia la riga
        chiedi(self.porta, b"CRONO? PC-DUE http://10.0.0.9:8770")
        self.assertEqual(len(self.aspetta_altri(2, 0.3)), 1)

    def test_domande_da_non_segnare(self):
        for d in (rete_locale.DOMANDA,                                   # versione vecchia
                  b"CRONO? PC-DUE javascript:alert(1)",
                  b"CRONO? %s http://10.0.0.9:8770" % socket.gethostname().encode(),
                  b"CRONO? PC-DUE http://10.0.0.5:8790"):                # il mio stesso URL
            self.assertIsNotNone(chiedi(self.porta, d), d)
        self.assertEqual(self.aspetta_altri(1, 0.3), [])
