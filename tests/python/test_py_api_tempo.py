"""api.py: scadenza effettiva, mese della mappatura, anni, CSV, bootstrap,
incongruenze (docs/ai/anno-e-tempo.md)."""
import datetime

from ._aiuti_py import ConDB, api, db


def s(mesi="001000001000", inizio=None, scad=None, rin=0, stato="APERTO"):
    return {"mesi": mesi, "data_inizio": inizio, "data_scadenza": scad,
            "rinnovo_auto": rin, "stato": stato}


class ScadenzaEffettiva(ConDB):
    def test_senza_rinnovo_resta_quella(self):
        self.assertEqual(api._scad_effettiva(s(scad="2025-06-30"), "2026-09-23"), "2025-06-30")
        self.assertIsNone(api._scad_effettiva(s(scad=None, rin=1), "2026-09-23"))
        # chiuso con rinnovo: non si rimanda
        self.assertEqual(api._scad_effettiva(s(scad="2025-06-30", rin=1, stato="CHIUSO"),
                                             "2026-09-23"), "2025-06-30")

    def test_rinnovo_annuale_rimandato_finche_copre_oggi(self):
        x = s(inizio="2023-01-01", scad="2023-12-31", rin=1)
        self.assertEqual(api._scad_effettiva(x, "2026-09-23"), "2026-12-31")
        # il giorno stesso della scadenza e' ancora coperto
        self.assertEqual(api._scad_effettiva(x, "2026-12-31"), "2026-12-31")
        self.assertEqual(api._scad_effettiva(x, "2027-01-01"), "2027-12-31")

    def test_termine_biennale(self):
        x = s(inizio="2022-07-01", scad="2024-06-30", rin=1)
        self.assertEqual(api._scad_effettiva(x, "2026-09-23"), "2028-06-30")

    def test_29_febbraio_e_fine_mese(self):
        x = s(inizio="2023-03-01", scad="2024-02-29", rin=1)
        self.assertEqual(api._scad_effettiva(x, "2024-03-01"), "2025-02-28")
        self.assertEqual(api._scad_effettiva(x, "2028-01-10"), "2028-02-29")
        y = s(inizio="2025-02-01", scad="2025-04-30", rin=1)      # trimestrale, fine mese
        self.assertEqual(api._scad_effettiva(y, "2025-05-15"), "2025-07-30")

    def test_senza_inizio_passo_annuale_e_confine_d_anno(self):
        x = s(scad="2025-12-31", rin=1)
        self.assertEqual(api._scad_effettiva(x, "2026-01-01"), "2026-12-31")
        z = s(inizio="2025-12-15", scad="2025-12-01", rin=1)      # date invertite
        self.assertEqual(api._scad_effettiva(z, "2026-02-01"), "2026-12-01")

    def test_senza_oggi_usa_la_data_del_server(self):
        x = s(inizio="2000-01-01", scad="2000-12-31", rin=1)
        self.assertGreaterEqual(api._scad_effettiva(x), datetime.date.today().isoformat())


class MeseScadenza(ConDB):
    def test_primo_mese_utile(self):
        self.assertEqual(api._mese_scadenza(s(), 2026, "2026-09-23"), 3)
        self.assertEqual(api._mese_scadenza(s(mesi="0" * 12), 2026, "2026-09-23"), 0)

    def test_inizio_contratto_a_meta_anno(self):
        x = s(inizio="2026-04-10")
        self.assertEqual(api._mese_scadenza(x, 2026, "2026-09-23"), 9)
        # l'inizio dentro il mese: il mese conta (confronto con -31)
        self.assertEqual(api._mese_scadenza(s(inizio="2026-03-31"), 2026, "2026-09-23"), 3)
        self.assertEqual(api._mese_scadenza(x, 2025, "2026-09-23"), 0)
        self.assertEqual(api._mese_scadenza(x, 2027, "2026-09-23"), 3)

    def test_scaduto_senza_rinnovo(self):
        x = s(scad="2026-05-31")
        self.assertEqual(api._mese_scadenza(x, 2026, "2026-09-23"), 3)
        self.assertEqual(api._mese_scadenza(x, 2027, "2026-09-23"), 0)
        y = s(scad="2026-03-01")            # scade il primo del mese: il mese c'e'
        self.assertEqual(api._mese_scadenza(y, 2026, "2026-09-23"), 3)
        z = s(scad="2026-02-28")
        self.assertEqual(api._mese_scadenza(z, 2026, "2026-09-23"), 0)

    def test_rinnovo_automatico_fino_al_termine_in_corso(self):
        x = s(inizio="2024-01-01", scad="2024-12-31", rin=1)
        self.assertEqual(api._mese_scadenza(x, 2027, "2026-09-23"), 0)   # oltre il termine in corso
        self.assertEqual(api._mese_scadenza(x, 2026, "2026-09-23"), 3)


class Anni(ConDB):
    def test_anno_dalla_query(self):
        oggi = datetime.date.today().year
        self.assertEqual(api._anno({"anno": "2025"}, None), 2025)
        for rotto in (None, "", "abc", "²", "-1", "2025.0"):
            self.assertEqual(api._anno({"anno": rotto}, None), oggi, rotto)

    def test_anni_disponibili(self):
        self.toggle(anno=2019)
        self.toggle(anno=1990)
        with db.sess() as c:
            self.assertEqual(api._anni_disponibili(c, 2026), [2019, 2025, 2026, 2027])


class Bootstrap(ConDB):
    def test_contenuto(self):
        self.cliente()
        self.servizio()
        self.ruolo("Vera", "approvatore")
        self.toggle(anno=2026)
        self.toggle(anno=2025, mese=12)
        st, out, ev = api.bootstrap(self.ctx, {"anno": "2026", "operatore": "Vera"}, {})
        self.assertEqual(st, 200)
        self.assertIsNone(ev)
        self.assertEqual(out["anno"], 2026)
        self.assertEqual(list(out["celle"]), ["10-3"])
        self.assertEqual(list(out["celle_prec"]), ["10-12"])
        self.assertEqual(out["ruolo"], "approvatore")
        self.assertEqual(out["ruoli"]["Capo"], "admin")
        self.assertEqual(out["services"][0]["dest"], "SEDE")
        self.assertEqual(len(out["mesi"]), 12)
        self.assertIsNone(out["sync"])

    def test_archivio_vuoto(self):
        st, out, _ = api.bootstrap(self.ctx, {}, {})
        self.assertEqual((out["clienti"], out["services"], out["celle"]), ([], [], {}))
        self.assertEqual(out["ruolo"], "tecnico")


class Csv(ConDB):
    def test_righe_ruolo_e_spunte(self):
        self.cliente(rs="ACME; \"virgolette\"")
        self.servizio(mesi="001000001000")
        self.servizio(sid=11, stato="CHIUSO")
        self.toggle(mese=3)
        self.toggle(mese=3, campo="corretta")                 # proposta: 2, non e' una X
        st, out, _ = api.esporta_csv(self.ctx, {"anno": "2026"}, {})
        righe = out["__csv__"].strip().split("\r\n")
        self.assertEqual(len(righe), 3)                        # testata + 2 mesi
        self.assertIn(";MAPPATURA;10;", righe[1])
        self.assertIn(";visita;10;", righe[2])
        self.assertIn("X", righe[1])
        self.assertEqual(out["__nome__"], "mappature_2026.csv")
        self.assertIn('"ACME; ""virgolette"""', righe[1])
        # proposta del tecnico: la colonna del rapportino resta vuota
        import csv, io
        r = list(csv.reader(io.StringIO(out["__csv__"]), delimiter=";"))
        self.assertEqual(r[1][10:14], ["X", "", "", ""])

    def test_niente_formule_excel(self):
        # = + - @ TAB CR in testa: Excel la eseguirebbe come formula. Davanti va un
        # apice (prima una tabulazione; il resto in test_py_scadenze_casi_limite)
        self.cliente(rs="=HYPERLINK(\"http://x\")")
        self.servizio(mesi="001000000000")
        st, out, _ = api.esporta_csv(self.ctx, {"anno": "2026"}, {})
        import csv, io
        r = list(csv.reader(io.StringIO(out["__csv__"]), delimiter=";"))
        self.assertEqual(r[1][4], "'=HYPERLINK(\"http://x\")")
        self.assertEqual(api._testo_csv("- sostituito filtro"), "'- sostituito filtro")
        self.assertEqual(api._testo_csv("nota normale"), "nota normale")
        self.assertEqual(api._testo_csv(None), "")

    def test_filtro_mese(self):
        self.cliente()
        self.servizio()
        st, out, _ = api.esporta_csv(self.ctx, {"anno": "2026", "mese": "9"}, {})
        self.assertEqual(len(out["__csv__"].strip().split("\r\n")), 2)
        self.assertEqual(out["__nome__"], "mappature_2026_09.csv")
        st, out, _ = api.esporta_csv(self.ctx, {"anno": "2026", "mese": "x"}, {})
        self.assertEqual(out["__nome__"], "mappature_2026.csv")


class Incongruenze(ConDB):
    def test_tre_elenchi(self):
        self.cliente()
        self.servizio(sid=1, mesi="0" * 12)
        self.servizio(sid=2, mesi="100000000000")
        with db.sess() as c:
            c.execute("UPDATE services SET qva=4 WHERE id_service=2")
        self.servizio(sid=3, mesi="100000000000")
        self.toggle(sid=3, mese=5, campo="ricambi", operatore="Capo")
        st, out, _ = api.incongruenze(self.ctx, {"anno": "2026"}, {})
        self.assertEqual([x["id"] for x in out["senza_mesi"]], [1])
        self.assertEqual([x["id"] for x in out["cadenza_ko"]], [2])
        self.assertEqual([(x["id"], x["mese"]) for x in out["orfane"]], [(3, 5)])
