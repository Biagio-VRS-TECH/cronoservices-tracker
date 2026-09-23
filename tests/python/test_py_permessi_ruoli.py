"""api_permessi: chi puo' fare cosa (#ANCHOR: ruoli) per ognuno dei tre ruoli,
il PIN dell'amministratore su OGNI azione da admin, l'escalation (nome
dell'admin senza PIN, il proprio ruolo, l'ultimo admin) e gli input strani.
"""
import threading, time
from unittest import mock

from ._aiuti_py import ConDB, PDF, api, db
import base64


class Base(ConDB):
    def setUp(self):
        super().setUp()
        self.ruolo("Bruno", "admin")        # admin di ruolo, non di configurazione
        self.ruolo("Vera", "approvatore")
        self.ruolo("Anna", "tecnico")
        api._PIN_ERRORI.update(n=0, fino=0.0)
        self.addCleanup(api._PIN_ERRORI.update, n=0, fino=0.0)

    # le cinque azioni dell'amministratore: (nome, chiamata(body) -> risposta)
    def azioni(self):
        self.cliente()
        self.servizio()

        def pdf_anno(b):
            api.salva_documento(self.ctx, {}, {"id_service": 10, "anno": 2026, "operatore": "x",
                                               "pdf": base64.b64encode(PDF).decode()})
            return api.elimina_documenti(self.ctx, {}, dict(b, anno=2026))

        def sync(b):
            with mock.patch.object(api.sync, "esegui", return_value={"nuovi": 0}):
                return api.fai_sync(self.ctx, {}, b)

        return [
            ("ruolo", lambda b: api.ruolo(self.ctx, {}, dict(b, nome="Nuovo", ruolo="approvatore"))),
            ("impostazioni", lambda b: api.impostazioni(self.ctx, {}, dict(b, inizio_tracciamento="2026-01"))),
            ("diario", lambda b: api.azzera_diario(self.ctx, {}, b)),
            ("sync", sync),
            ("pdf dell'anno", pdf_anno),
        ]


class ChiPuoCosa(Base):
    def test_matrice_dei_ruoli(self):
        for nome, fai in self.azioni():
            for chi in ("Vera", "Anna", "Sconosciuto", "", None, "capo", "Capo​"):
                self.assertEqual(fai({"operatore": chi})[0], 403, (nome, chi))
            for chi in ("Capo", "Bruno", "  Capo  "):
                self.assertEqual(fai({"operatore": chi})[0], 200, (nome, chi))

    def test_operatore_non_testo_e_un_403_non_un_500(self):
        """DIFETTO: db.ruolo_di fa (nome or "").strip(): un operatore numero,
        lista o oggetto alzava AttributeError, che il server non traduce in 400
        (500 con la traccia)."""
        for nome, fai in self.azioni():
            for chi in (12, ["Capo"], {"nome": "Capo"}, True):
                st, out, _ = fai({"operatore": chi})
                self.assertEqual(st, 403, (nome, chi))


class Pin(Base):
    def setUp(self):
        super().setUp()
        self.cfg["pin_admin"] = "4321"

    def test_ogni_azione_da_admin_vuole_il_pin(self):
        for nome, fai in self.azioni():
            for body in ({"operatore": "Capo"}, {"operatore": "Bruno", "pin": "0000"},
                         {"operatore": "Bruno", "pin": ""}, {"operatore": "Capo", "pin": None}):
                st, out, _ = fai(body)
                self.assertEqual((st, out.get("pin_richiesto")), (403, True), (nome, body))
                api._PIN_ERRORI.update(n=0, fino=0.0)
            self.assertEqual(fai({"operatore": "Bruno", "pin": "4321"})[0], 200, nome)

    def test_il_pin_giusto_non_fa_admin_ne_approvatore_ne_tecnico(self):
        for nome, fai in self.azioni():
            for chi in ("Vera", "Anna", "Nessuno"):
                st, out, _ = fai({"operatore": chi, "pin": "4321"})
                self.assertEqual(st, 403, (nome, chi))
                self.assertNotIn("pin_richiesto", out)

    def test_pin_numerico_nel_corpo_e_nella_configurazione(self):
        self.assertEqual(api.azzera_diario(self.ctx, {}, {"operatore": "Capo", "pin": 4321})[0], 200)
        self.cfg["pin_admin"] = 4321
        self.assertEqual(api.azzera_diario(self.ctx, {}, {"operatore": "Capo", "pin": "4321"})[0], 200)
        self.assertEqual(api.azzera_diario(self.ctx, {}, {"operatore": "Capo"})[0], 403)

    def test_pin_zero_in_configurazione_non_spegne_il_pin(self):
        """DIFETTO: str(cfg.get("pin_admin") or "") trattava il PIN numerico 0
        come "nessun PIN": chi scriveva "pin_admin": 0 restava senza protezione
        senza saperlo."""
        self.cfg["pin_admin"] = 0
        st, out, _ = api.azzera_diario(self.ctx, {}, {"operatore": "Capo"})
        self.assertEqual((st, out.get("pin_richiesto")), (403, True))
        self.assertEqual(api.azzera_diario(self.ctx, {}, {"operatore": "Capo", "pin": "0"})[0], 200)
        # vuoto, null o false: nessun PIN, come prima
        for spento in ("", "   ", None, False):
            self.cfg["pin_admin"] = spento
            self.assertEqual(api.azzera_diario(self.ctx, {}, {"operatore": "Capo"})[0], 200, spento)

    def test_i_tentativi_del_non_admin_non_consumano_il_blocco(self):
        """Il PIN si guarda solo per chi e' admin: un tecnico che prova PIN a caso
        col suo nome non puo' bloccare l'amministratore."""
        for _ in range(api.PIN_TENTATIVI * 2):
            api.azzera_diario(self.ctx, {}, {"operatore": "Anna", "pin": "1111"})
        self.assertEqual(api.azzera_diario(self.ctx, {}, {"operatore": "Capo", "pin": "4321"})[0], 200)

    def test_un_successo_azzera_il_conto_degli_errori(self):
        for _ in range(api.PIN_TENTATIVI - 1):
            api.azzera_diario(self.ctx, {}, {"operatore": "Capo", "pin": "1"})
        self.assertEqual(api.azzera_diario(self.ctx, {}, {"operatore": "Capo", "pin": "4321"})[0], 200)
        for _ in range(api.PIN_TENTATIVI - 1):
            api.azzera_diario(self.ctx, {}, {"operatore": "Capo", "pin": "1"})
        self.assertEqual(api.azzera_diario(self.ctx, {}, {"operatore": "Capo", "pin": "4321"})[0], 200)

    def test_blocco_con_tentativi_in_parallelo(self):
        """Venti PIN sbagliati da thread diversi: il conto non si perde per
        strada e alla fine anche il PIN giusto aspetta il minuto."""
        th = [threading.Thread(target=api.azzera_diario,
                               args=(self.ctx, {}, {"operatore": "Capo", "pin": "9"}))
              for _ in range(20)]
        for t in th:
            t.start()
        for t in th:
            t.join()
        st, out, _ = api.azzera_diario(self.ctx, {}, {"operatore": "Capo", "pin": "4321"})
        self.assertEqual(st, 429)
        self.assertTrue(out["pin_richiesto"])
        # durante il blocco anche i tentativi sbagliati rispondono 429 e non
        # allungano la pausa
        fino = api._PIN_ERRORI["fino"]
        self.assertEqual(api.azzera_diario(self.ctx, {}, {"operatore": "Capo", "pin": "9"})[0], 429)
        self.assertEqual(api._PIN_ERRORI["fino"], fino)
        api._PIN_ERRORI["fino"] = time.time() - 1
        self.assertEqual(api.azzera_diario(self.ctx, {}, {"operatore": "Capo", "pin": "4321"})[0], 200)


class Escalation(Base):
    def r(self, nome, ruolo, chi, **extra):
        return api.ruolo(self.ctx, {}, dict(nome=nome, ruolo=ruolo, operatore=chi, **extra))

    def test_nessuno_si_promuove_da_solo(self):
        self.assertEqual(self.r("Anna", "admin", "Anna")[0], 403)
        self.assertEqual(self.r("Anna", "approvatore", "Anna")[0], 403)
        self.assertEqual(self.r("Vera", "admin", "Vera")[0], 403)
        self.assertEqual(self.r("Anna", "admin", "Vera")[0], 403)
        with db.sess() as c:
            self.assertEqual((db.ruolo_di(c, "Anna"), db.ruolo_di(c, "Vera")),
                             ("tecnico", "approvatore"))

    def test_nome_dell_admin_senza_pin_non_basta(self):
        self.cfg["pin_admin"] = "4321"
        self.assertEqual(self.r("Anna", "admin", "Capo")[0], 403)
        self.assertEqual(self.r("Anna", "admin", "Bruno", pin="1")[0], 403)
        with db.sess() as c:
            self.assertEqual(db.ruolo_di(c, "Anna"), "tecnico")
        self.assertEqual(self.r("Anna", "admin", "Bruno", pin="4321")[0], 200)

    def test_l_admin_puo_declassarsi_se_ne_resta_un_altro(self):
        st, out, _ = self.r("Bruno", "tecnico", "Bruno")
        self.assertEqual((st, out["ruoli"]["Bruno"]), (200, "tecnico"))
        # e da quel momento non comanda piu'
        self.assertEqual(self.r("Bruno", "admin", "Bruno")[0], 403)

    def test_l_admin_di_configurazione_non_si_declassa_neanche_da_solo(self):
        for nome in ("Capo", "  Capo  "):
            for nuovo in ("tecnico", "approvatore"):
                self.assertEqual(self.r(nome, nuovo, "Capo")[0], 400, (nome, nuovo))
                self.assertEqual(self.r(nome, nuovo, "Bruno")[0], 400, (nome, nuovo))
        # rinominarlo "admin" e' innocuo
        self.assertEqual(self.r("Capo", "admin", "Bruno")[0], 200)

    def test_l_ultimo_admin_di_ruolo_resta(self):
        ctx = {"cfg": {"amministratori": []}, "base": self.dir}
        for nuovo in ("tecnico", "approvatore"):
            st, out, _ = api.ruolo(ctx, {}, {"nome": "Bruno", "ruolo": nuovo, "operatore": "Bruno"})
            self.assertEqual(st, 400, nuovo)
        with db.sess() as c:
            self.assertTrue(db.e_admin(c, "Bruno", ctx["cfg"]))

    def test_due_admin_che_si_declassano_a_vicenda_in_parallelo(self):
        """Sotto WRITE_LOCK il secondo vede il primo gia' declassato: resta
        sempre almeno un amministratore."""
        ctx = {"cfg": {"amministratori": []}, "base": self.dir}
        self.ruolo("Carla", "admin")
        esiti, barriera = [], threading.Barrier(2)

        def declassa(chi, altro):
            barriera.wait()
            esiti.append(api.ruolo(ctx, {}, {"nome": altro, "ruolo": "tecnico",
                                             "operatore": chi})[0])

        th = [threading.Thread(target=declassa, args=("Bruno", "Carla")),
              threading.Thread(target=declassa, args=("Carla", "Bruno"))]
        for t in th:
            t.start()
        for t in th:
            t.join()
        with db.sess() as c:
            admin = [n for n, r in db.ruoli(c, ctx["cfg"]).items() if r == "admin"]
        self.assertEqual(len(admin), 1)
        self.assertEqual(sorted(esiti), [200, 403])

    def test_nome_e_ruolo_strani(self):
        """DIFETTO: (body.get("nome") or "").strip() con un numero alzava
        AttributeError (500)."""
        for nome in (123, ["Anna"], {"n": 1}, True):
            self.assertEqual(self.r(nome, "admin", "Capo")[0], 400, nome)
        for ruolo in ("ADMIN", " admin", ["admin"], {"admin": 1}, None, 1):
            self.assertEqual(self.r("Anna", ruolo, "Capo")[0], 400, ruolo)
        # nome lungo: tagliato a 40 come in /api/operatore
        st, out, _ = self.r("N" * 60, "approvatore", "Capo")
        self.assertEqual(out["ruoli"]["N" * 40], "approvatore")

    def test_amministratori_di_configurazione_scritti_male(self):
        """DIFETTO (api_permessi.ruolo): `nome in cfg.get("amministratori", [])`
        con una stringa ("Capo") e' un confronto fra sottostringhe, quindi "C" e
        "apo" risultavano amministratori per configurazione e non si potevano
        declassare; con null alzava TypeError (500); con " Capo " (spazi) il
        declassamento dell'admin di configurazione passava come 200 senza
        effetto. Ora si legge da db._amministratori, come fa db.ruolo_di."""
        self.cfg["amministratori"] = "Capo"
        for nome in ("C", "apo", "Cap"):
            st, out, _ = self.r(nome, "approvatore", "Capo")
            self.assertEqual((st, out["ruoli"][nome]), (200, "approvatore"), nome)
        self.assertEqual(self.r("Capo", "tecnico", "Bruno")[0], 400)

        self.cfg["amministratori"] = None
        st, out, _ = self.r("Anna", "approvatore", "Bruno")
        self.assertEqual((st, out["ruoli"]["Anna"]), (200, "approvatore"))

        self.cfg["amministratori"] = ["  Capo  ", 7, None]
        st, out, _ = self.r("Capo", "tecnico", "Bruno")
        self.assertEqual(st, 400)
        with db.sess() as c:
            self.assertTrue(db.e_admin(c, "Capo", self.cfg))

    def test_il_ruolo_si_legge_anche_da_operatore(self):
        self.r("Anna", "approvatore", "Capo")
        st, out, _ = api.operatore(self.ctx, {}, {"nome": "Anna"})
        self.assertEqual(out["ruolo"], "approvatore")
        st, out, _ = api.operatore(self.ctx, {}, {"nome": "Capo"})
        self.assertEqual(out["ruolo"], "admin")


class ImpostazioniESync(Base):
    def test_impostazioni_non_testo(self):
        for v in (["2026-01"], {"a": 1}, 2026.01):
            self.assertEqual(api.impostazioni(self.ctx, {}, {"inizio_tracciamento": v,
                                                             "operatore": "Capo"})[0], 400, v)

    def test_impostazioni_rifiutata_non_scrive(self):
        with db.sess() as c:
            prima = db.get_meta(c, "inizio_tracciamento")
        api.impostazioni(self.ctx, {}, {"inizio_tracciamento": "2020-01", "operatore": "Vera"})
        with db.sess() as c:
            self.assertEqual(db.get_meta(c, "inizio_tracciamento"), prima)

    def test_sync_rifiutato_non_parte_col_pin_sbagliato(self):
        self.cfg["pin_admin"] = "4321"
        with mock.patch.object(api.sync, "esegui") as es:
            self.assertEqual(api.fai_sync(self.ctx, {}, {"operatore": "Capo", "pin": "1"})[0], 403)
            es.assert_not_called()
