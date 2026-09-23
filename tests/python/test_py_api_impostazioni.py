"""api.py: operatori, ruoli, impostazioni, presenze, sync (permesso), dizionario."""
import threading, time
from unittest import mock

from ._aiuti_py import ConDB, api, db


class Operatore(ConDB):
    def test_registra(self):
        self.assertEqual(api.operatore(self.ctx, {}, {"nome": "  "})[0], 400)
        st, out, ev = api.operatore(self.ctx, {}, {"nome": "  " + "N" * 60})
        self.assertEqual(len(out["nome"]), 40)
        self.assertEqual(out["ruolo"], "tecnico")
        self.assertEqual(ev["tipo"], "presenze")
        st, out, _ = api.operatore(self.ctx, {}, {"nome": "Capo"})
        self.assertEqual(out["ruolo"], "admin")
        self.assertEqual(self.conta("operatori"), 2)


class Ruolo(ConDB):
    def r(self, nome, ruolo, chi="Capo"):
        return api.ruolo(self.ctx, {}, {"nome": nome, "ruolo": ruolo, "operatore": chi})

    def test_solo_admin_nomina(self):
        self.assertEqual(self.r("Anna", "admin", chi="Anna")[0], 403)
        self.assertEqual(self.r("Anna", "boh")[0], 400)
        self.assertEqual(self.r("", "admin")[0], 400)
        st, out, ev = self.r("Anna", "approvatore")
        self.assertEqual((st, out["ruoli"]["Anna"]), (200, "approvatore"))
        self.assertEqual(ev["tipo"], "ruoli")

    def test_admin_di_configurazione_non_si_declassa(self):
        self.assertEqual(self.r("Capo", "tecnico")[0], 400)

    def test_ultimo_admin(self):
        ctx = {"cfg": {"amministratori": []}, "base": self.dir}
        self.ruolo("Bruno", "admin")
        st, out, _ = api.ruolo(ctx, {}, {"nome": "Bruno", "ruolo": "tecnico", "operatore": "Bruno"})
        self.assertEqual(st, 400)
        self.ruolo("Carla", "admin")
        st, out, _ = api.ruolo(ctx, {}, {"nome": "Bruno", "ruolo": "tecnico", "operatore": "Carla"})
        self.assertEqual(st, 200)


class Impostazioni(ConDB):
    def imp(self, v, chi="Capo"):
        return api.impostazioni(self.ctx, {}, {"inizio_tracciamento": v, "operatore": chi})

    def test_formato(self):
        for rotto in ("", "2026", "2026-9", "2026-13", "2026-00", "26-09", "2026-09-01", None, 202609):
            self.assertEqual(self.imp(rotto)[0], 400, rotto)
        self.assertEqual(self.imp("2026-09", chi="Anna")[0], 403)
        st, out, ev = self.imp(" 2026-01 ")
        self.assertEqual((st, out["inizio_tracciamento"]), (200, "2026-01"))
        with db.sess() as c:
            self.assertEqual(db.get_meta(c, "inizio_tracciamento"), "2026-01")


class Presenze(ConDB):
    def test_ping_ed_evento_solo_se_cambia_il_dove(self):
        st, out, ev = api.ping(self.ctx, {}, {"operatore": "Anna", "dove": "2026-09"})
        self.assertEqual(out["online"], [{"nome": "Anna", "dove": "2026-09"}])
        self.assertEqual(ev["tipo"], "presenze")
        self.assertIsNone(api.ping(self.ctx, {}, {"operatore": "Anna", "dove": "2026-09"})[2])
        self.assertIsNotNone(api.ping(self.ctx, {}, {"operatore": "Anna",
                                                     "dove": "2026-09 @10-3"})[2])
        # senza nome: nessuna presenza
        self.assertIsNone(api.ping(self.ctx, {}, {"operatore": "  "})[2])

    def test_scade_dopo_il_ttl(self):
        api.ping(self.ctx, {}, {"operatore": "Anna", "dove": "x"})
        api.PRESENZE["Anna"]["ts"] = time.time() - api.PRESENZA_TTL - 1
        self.assertEqual(api._online(), [])

    def test_ping_concorrenti(self):
        """ThreadingHTTPServer: ping e _online() di thread diversi. Senza il
        lock il giro sul dizionario poteva alzare RuntimeError."""
        errori, fine = [], time.time() + 0.6

        def pinga(i):
            try:
                n = 0
                while time.time() < fine:
                    api.ping(self.ctx, {}, {"operatore": "Op%d-%d" % (i, n % 50),
                                            "dove": str(n)})
                    n += 1
            except Exception as e:      # noqa: BLE001
                errori.append(e)

        def guarda():
            try:
                while time.time() < fine:
                    api._online()
            except Exception as e:      # noqa: BLE001
                errori.append(e)

        th = [threading.Thread(target=pinga, args=(i,)) for i in range(4)]
        th += [threading.Thread(target=guarda) for _ in range(4)]
        for t in th:
            t.start()
        for t in th:
            t.join()
        self.assertEqual(errori, [])


class Sync(ConDB):
    def test_solo_admin(self):
        with mock.patch.object(api.sync, "esegui") as es:
            self.assertEqual(api.fai_sync(self.ctx, {}, {"operatore": "Anna"})[0], 403)
            es.assert_not_called()
            es.return_value = {"nuovi": 1}
            st, out, ev = api.fai_sync(self.ctx, {}, {"operatore": "Capo"})
        self.assertEqual((st, ev["tipo"]), (200, "sync"))

    def test_errore_del_sync_e_un_500_leggibile(self):
        with mock.patch.object(api.sync, "esegui", side_effect=RuntimeError("Access assente")):
            st, out, ev = api.fai_sync(self.ctx, {}, {"operatore": "Capo"})
        self.assertEqual((st, out["errore"], ev), (500, "Access assente", None))


class Dizionario(ConDB):
    def setUp(self):
        super().setUp()
        with db.sess() as c:
            c.execute("DELETE FROM dizionario_componenti")

    def imposta(self, **body):
        body.setdefault("codice", "EST-6")
        body.setdefault("operatore", "Anna")
        return api.dizionario_imposta(self.ctx, {}, body)

    def test_nome_e_priorita_indipendenti(self):
        st, out, ev = self.imposta(nome="  Estintore   a polvere ", descrizione="EST PLV 6KG")
        self.assertEqual(out["voce"]["nome"], "Estintore a polvere")
        self.assertEqual(ev["tipo"], "dizionario")
        self.imposta(priorita="3")
        v = api.dizionario(self.ctx, {}, {})[1]["voci"][0]
        self.assertEqual((v["nome"], v["priorita"], v["descrizione"]),
                         ("Estintore a polvere", 3, "EST PLV 6KG"))
        # togliendo il nome la priorita' resta
        self.imposta(nome="")
        v = api.dizionario(self.ctx, {}, {})[1]["voci"][0]
        self.assertEqual((v["nome"], v["priorita"]), ("", 3))
        # senza ne' l'uno ne' l'altra la riga sparisce
        st, out, _ = self.imposta(priorita=0)
        self.assertTrue(out["voce"]["rimossa"])
        self.assertEqual(self.conta("dizionario_componenti"), 0)

    def test_priorita_non_valide(self):
        for p in ("11", "-1", "1.5", "tre", True):
            self.assertEqual(self.imposta(priorita=p)[0], 400, p)
        self.assertEqual(self.imposta(codice="  ")[0], 400)
        self.assertEqual(self.conta("dizionario_componenti"), 0)

    def test_descrizione_vuota_non_cancella(self):
        self.imposta(nome="X", descrizione="orig")
        self.imposta(descrizione="   ")
        self.assertEqual(api.dizionario(self.ctx, {}, {})[1]["voci"][0]["descrizione"], "orig")


class PinAdmin(ConDB):
    """SEC-12: con `pin_admin` in config.json l'azione da admin vuole il PIN."""

    def setUp(self):
        super().setUp()
        self.cfg["pin_admin"] = "4321"
        api._PIN_ERRORI.update(n=0, fino=0.0)

    def tearDown(self):
        api._PIN_ERRORI.update(n=0, fino=0.0)
        super().tearDown()

    def azzera(self, **extra):
        return api.azzera_diario(self.ctx, {}, {"operatore": "Capo", **extra})

    def test_senza_pin_configurato_come_prima(self):
        del self.cfg["pin_admin"]
        self.assertEqual(self.azzera()[0], 200)

    def test_senza_pin_o_sbagliato_403(self):
        st, out, _ = self.azzera()
        self.assertEqual((st, out.get("pin_richiesto")), (403, True))
        st, out, _ = self.azzera(pin="0000")
        self.assertEqual((st, out.get("pin_richiesto")), (403, True))
        self.assertEqual(self.azzera(pin=" 4321 ")[0], 200)

    def test_il_pin_non_fa_admin_chi_non_lo_e(self):
        st, out, _ = api.azzera_diario(self.ctx, {}, {"operatore": "Anna", "pin": "4321"})
        self.assertEqual(st, 403)
        self.assertNotIn("pin_richiesto", out)

    def test_troppi_tentativi_fermano_anche_il_pin_giusto(self):
        for _ in range(api.PIN_TENTATIVI):
            self.assertEqual(self.azzera(pin="1111")[0], 403)
        self.assertEqual(self.azzera(pin="4321")[0], 429)
        api._PIN_ERRORI["fino"] = time.time() - 1       # passato il minuto
        self.assertEqual(self.azzera(pin="4321")[0], 200)

    def test_massa_vuole_il_pin(self):
        body = {"anno": 2026, "operatore": "Capo", "origine": "massa",
                "celle": [dict(id_service=10, mese=3, campo="stampata", valore=1)]}
        self.assertEqual(api.bulk(self.ctx, {}, dict(body))[0], 403)
        self.cliente(); self.servizio()
        self.assertEqual(api.bulk(self.ctx, {}, dict(body, pin="4321"))[0], 200)
