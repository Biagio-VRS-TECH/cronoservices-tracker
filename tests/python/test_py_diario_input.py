"""api_diario: storia della cella, diario generale e azzeramento con input
strani (id mancanti, non numerici, oltre i 64 bit) e cio' che l'azzeramento
lascia stare."""
import base64

from ._aiuti_py import ConDB, PDF, api, db


class Storia(ConDB):
    def setUp(self):
        super().setUp()
        self.cliente()
        self.servizio()

    def test_parametri_mancanti_o_rotti_sono_400(self):
        """DIFETTO: storia faceva int(q["id_service"]) nudo: un id oltre i 64 bit
        passava int() e arrivava a SQLite (OverflowError, 500). Mancanti o non
        numerici ora sono un 400 detto dall'handler, non un KeyError."""
        buoni = {"id_service": "10", "anno": "2026", "mese": "3"}
        for k in buoni:
            q = dict(buoni)
            del q[k]
            self.assertEqual(api.storia(self.ctx, q, {})[0], 400, k)
            for rotto in ("abc", "", "9" * 30, "-" + "9" * 30, "1.5", "²"):
                self.assertEqual(api.storia(self.ctx, dict(buoni, **{k: rotto}), {})[0], 400,
                                 (k, rotto))

    def test_cella_senza_storia_e_cella_di_un_altro_mese(self):
        self.toggle(mese=3)
        self.assertEqual(len(api.storia(self.ctx, {"id_service": "10", "anno": "2026",
                                                   "mese": "4"}, {})[1]["storia"]), 0)
        st, out, _ = api.storia(self.ctx, {"id_service": "10", "anno": "2026", "mese": "3"}, {})
        self.assertEqual((st, len(out["storia"])), (200, 1))
        self.assertEqual(out["storia"][0]["operatore"], "Anna")


class Attivita(ConDB):
    def test_limite_strano(self):
        self.cliente()
        self.servizio()
        for m in (3, 9):
            self.toggle(mese=m)
        for lim, n in (("9" * 30, 2), ("-" + "9" * 30, 1), ("", 2), ("1e3", 2), ("0x10", 2),
                       (None, 2)):
            q = {} if lim is None else {"limit": lim}
            self.assertEqual(len(api.attivita(self.ctx, q, {})[1]["attivita"]), n, lim)

    def test_eventi_di_un_service_sparito_restano_nel_diario(self):
        """LEFT JOIN: un service tolto dalla cache non fa sparire la sua storia."""
        self.cliente()
        self.servizio()
        self.toggle()
        with db.sess() as c:
            c.execute("DELETE FROM services")
        [e] = api.attivita(self.ctx, {}, {})[1]["attivita"]
        self.assertEqual((e["id_service"], e["destinazione"], e["rag_soc"]), (10, None, None))


class Azzera(ConDB):
    def test_azzera_lascia_spunte_note_documenti_e_operatori(self):
        self.cliente()
        self.servizio()
        self.toggle()
        api.nota(self.ctx, {}, {"id_service": 10, "anno": 2026, "mese": 3, "nota": "ciao",
                                "operatore": "Anna"})
        api.salva_documento(self.ctx, {}, {"id_service": 10, "anno": 2026, "operatore": "Anna",
                                           "pdf": base64.b64encode(PDF).decode()})
        api.operatore(self.ctx, {}, {"nome": "Anna"})
        self.assertGreater(self.conta("eventi"), 0)
        st, out, ev = api.azzera_diario(self.ctx, {}, {"operatore": "Capo"})
        self.assertEqual((st, ev), (200, None))
        self.assertEqual(self.conta("eventi"), 0)
        c = self.cella()
        self.assertEqual((c["stampata"], c["nota"]), (1, "ciao"))
        self.assertEqual((self.conta("documenti"), self.conta("operatori")), (1, 1))
        # un secondo azzeramento: zero righe, nessun errore
        self.assertEqual(api.azzera_diario(self.ctx, {}, {"operatore": "Capo"})[1]["n"], 0)

    def test_rifiutato_non_cancella_niente(self):
        self.cliente()
        self.servizio()
        self.toggle()
        self.ruolo("Vera", "approvatore")
        for chi in ("Vera", "Anna", 5, None):
            self.assertEqual(api.azzera_diario(self.ctx, {}, {"operatore": chi})[0], 403, chi)
        self.assertEqual(self.conta("eventi"), 1)
