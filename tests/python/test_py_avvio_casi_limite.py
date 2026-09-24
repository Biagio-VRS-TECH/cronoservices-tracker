"""api_avvio / api_comune: bootstrap e anno richiesto ai bordi."""
import datetime

from ._aiuti_py import ConDB, api, db

OGGI = datetime.date.today().year


class AnnoRichiesto(ConDB):
    def test_anno_fuori_intervallo_torna_all_anno_corrente(self):
        """Un ?anno=99999999999999999999 passava `isdecimal` e arrivava a SQLite:
        OverflowError, cioe' un 500 del bootstrap (e l'app che non parte)."""
        for rotto in ("99999999999999999999", "0", "0000", "10000"):
            self.assertEqual(api._anno({"anno": rotto}, None), OGGI, rotto)
        for buono in ("2026", "1999", "2100"):
            self.assertEqual(api._anno({"anno": buono}, None), int(buono))
        self.assertEqual(api._anno({}, None), OGGI)

    def test_bootstrap_con_anno_enorme(self):
        st, out, _ = api.bootstrap(self.ctx, {"anno": "99999999999999999999"}, {})
        self.assertEqual((st, out["anno"]), (200, OGGI))


class Bootstrap(ConDB):
    def test_gennaio_porta_il_dicembre_prima_e_basta(self):
        self.toggle(anno=2026, mese=1)
        self.toggle(anno=2025, mese=12)
        self.toggle(anno=2024, mese=12)
        self.toggle(anno=2027, mese=1)
        st, out, _ = api.bootstrap(self.ctx, {"anno": "2026"}, {})
        self.assertEqual(list(out["celle"]), ["10-1"])
        self.assertEqual(list(out["celle_prec"]), ["10-12"])
        self.assertEqual(out["celle_prec"]["10-12"]["s"], 1)
        self.assertEqual(out["anni"], [2024, 2025, 2026, 2027])

    def test_forma_della_cella_e_nota(self):
        self.toggle(campo="corretta")
        api.nota(self.ctx, {}, dict(id_service=10, anno=2026, mese=3, nota="ok",
                                    operatore="Anna"))
        st, out, _ = api.bootstrap(self.ctx, {"anno": "2026"}, {})
        cel = out["celle"]["10-3"]
        self.assertEqual(set(cel), {"s", "c", "k", "r", "rev", "by", "at", "nota"})
        self.assertEqual((cel["k"], cel["nota"], cel["rev"], cel["by"]),
                         (db.PROPOSTA, "ok", 2, "Anna"))

    def test_meta_sync_e_servizi_senza_testi(self):
        with db.sess() as c:
            db.set_meta(c, "ultimo_sync", "2026-09-01T10:00:00")
            db.set_meta(c, "inizio_tracciamento", "2026-09")
            c.execute("INSERT INTO sync_log(ts,clienti,services) VALUES('a',1,1)")
            c.execute("INSERT INTO sync_log(ts,clienti,services) VALUES('b',2,2)")
            c.execute("INSERT INTO services(id_service,id_cliente) VALUES(5,1)")
        st, out, _ = api.bootstrap(self.ctx, {}, {})
        self.assertEqual(out["ultimo_sync"], "2026-09-01T10:00:00")
        self.assertEqual(out["inizio_tracciamento"], "2026-09")
        self.assertEqual(out["sync"]["ts"], "b")                  # l'ultimo
        sv = out["services"][0]
        self.assertEqual((sv["tipo"], sv["dest"], sv["nc"], sv["note"], sv["mesi"]),
                         ("", "", "", "", "000000000000"))
        self.assertEqual(out["oggi"], datetime.date.today().isoformat())

    def test_ruolo_di_chi_chiede(self):
        self.ruolo("Vera", "approvatore")
        chiede = lambda nome: api.bootstrap(self.ctx, {"operatore": nome}, {})[1]["ruolo"]
        self.assertEqual(chiede("Capo"), "admin")
        self.assertEqual(chiede(" Vera "), "approvatore")
        self.assertEqual(chiede("Nessuno"), "tecnico")
        self.assertEqual(chiede(""), "tecnico")

    def test_ctx_con_lan_e_altri_server(self):
        self.ctx.update(lan="http://192.0.2.1:8770", altri_server=["x"])
        st, out, _ = api.bootstrap(self.ctx, {}, {})
        self.assertEqual((out["indirizzo_lan"], out["altri_server"]),
                         ("http://192.0.2.1:8770", ["x"]))
