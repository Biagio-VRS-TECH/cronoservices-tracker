"""api_scadenze: CSV (formule, filtro del mese, righe escluse) e termine in corso
ai bordi del calendario (fine mese, dicembre/gennaio, date rotte)."""
import csv, io

from ._aiuti_py import ConDB, api, db


def s(mesi="001000001000", inizio=None, scad=None, rin=0, stato="APERTO"):
    return {"mesi": mesi, "data_inizio": inizio, "data_scadenza": scad,
            "rinnovo_auto": rin, "stato": stato}


class FormuleNelCsv(ConDB):
    """Formula injection (OWASP "CSV Injection"): una cella che comincia con
    = + - @ TAB o CR, Excel/LibreOffice la leggono come formula. Si neutralizza
    con un apice davanti; un numero negativo semplice resta un numero."""

    def test_testo_csv(self):
        t = api._testo_csv
        for pericolosa in ("=1+1", "+1+1", "-1+1", "@SOMMA(A1)", "\t=1+1", "\r=1+1",
                           "=HYPERLINK(\"http://x\")", "- sostituito filtro",
                           "-cmd|' /C calc'!A0", "+39 0422 1234"):
            self.assertEqual(t(pericolosa), "'" + pericolosa, repr(pericolosa))
        for innocua in ("nota normale", "", "A=B", "3-4", "Città", "'gia' con apice"):
            self.assertEqual(t(innocua), innocua, repr(innocua))
        for numero in ("-5", "-3,5", "-0.25", "+7", "-12345"):
            self.assertEqual(t(numero), numero, numero)
        self.assertEqual(t(None), "")
        self.assertEqual(t(-5), "-5")

    def test_nessuna_colonna_di_testo_passa_una_formula(self):
        self.cliente(rs="=cmd|' /C calc'!A0")
        self.servizio(mesi="001000000000", dest="+SEDE")
        with db.sess() as c:
            c.execute("UPDATE services SET localita='@loc', provincia='-TV', "
                      "tipo='\tANTI', cadenza='\r=x' WHERE id_service=10")
        self.toggle(operatore="=Anna")
        api.nota(self.ctx, {}, dict(id_service=10, anno=2026, mese=3,
                                    nota="=2+5", operatore="=Anna"))
        st, out, _ = api.esporta_csv(self.ctx, {"anno": "2026"}, {})
        r = list(csv.reader(io.StringIO(out["__csv__"], newline=""), delimiter=";"))
        riga = r[1]
        for i in (4, 5, 6, 7, 8, 9, 14, 16):
            self.assertTrue(riga[i].startswith("'"), (r[0][i], riga[i]))
        self.assertEqual(riga[4], "'=cmd|' /C calc'!A0")
        self.assertEqual(riga[14], "'=2+5")
        self.assertEqual(riga[16], "'=Anna")


class CsvFiltri(ConDB):
    def test_mese_fuori_dominio_esporta_l_anno(self):
        self.cliente()
        self.servizio()
        for mese in ("13", "0", "99", "²", "-3", "3.0"):
            st, out, _ = api.esporta_csv(self.ctx, {"anno": "2026", "mese": mese}, {})
            self.assertEqual(out["__nome__"], "mappature_2026.csv", mese)
            self.assertEqual(len(out["__csv__"].strip().split("\r\n")), 3, mese)

    def test_anno_rotto_o_enorme_usa_l_anno_corrente(self):
        import datetime
        oggi = datetime.date.today().year
        for anno in ("99999999999999999999999", "0", "abc"):
            st, out, _ = api.esporta_csv(self.ctx, {"anno": anno}, {})
            self.assertEqual(out["__nome__"], "mappature_%d.csv" % oggi, anno)

    def test_chiusi_archiviati_e_senza_cliente(self):
        self.cliente()
        self.servizio(sid=10)
        self.servizio(sid=11, stato="CHIUSO")
        self.servizio(sid=12, archiviato=1)
        self.servizio(sid=13, cli=99)                 # cliente non in anagrafica
        st, out, _ = api.esporta_csv(self.ctx, {"anno": "2026"}, {})
        r = list(csv.reader(io.StringIO(out["__csv__"], newline=""), delimiter=";"))
        self.assertEqual(sorted({x[3] for x in r[1:]}), ["10", "13"])
        self.assertEqual([x[4] for x in r[1:] if x[3] == "13"], ["", ""])

    def test_nota_con_a_capo_e_punto_e_virgola_resta_una_cella(self):
        self.cliente()
        self.servizio(mesi="001000000000")
        api.nota(self.ctx, {}, dict(id_service=10, anno=2026, mese=3,
                                    nota="riga uno;\r\nriga \"due\"", operatore="Anna"))
        st, out, _ = api.esporta_csv(self.ctx, {"anno": "2026"}, {})
        r = list(csv.reader(io.StringIO(out["__csv__"], newline=""), delimiter=";"))
        self.assertEqual(len(r), 2)
        self.assertEqual(len(r[1]), len(r[0]))
        self.assertEqual(r[1][14], "riga uno;\r\nriga \"due\"")

    def test_ruolo_col_rinnovo_automatico(self):
        """Il caso LASERJET (docs/ai/anno-e-tempo.md): unica manutenzione a
        settembre, data in Access scaduta, rinnovo automatico: e' MAPPATURA."""
        self.cliente()
        self.servizio(mesi="000000001000", inizio="2000-09-01", scad="2001-08-31", rin=1)
        st, out, _ = api.esporta_csv(self.ctx, {"anno": "2026"}, {})
        self.assertIn(";MAPPATURA;10;", out["__csv__"])
        with db.sess() as c:
            c.execute("UPDATE services SET rinnovo_auto=0")
        st, out, _ = api.esporta_csv(self.ctx, {"anno": "2026"}, {})
        self.assertIn(";visita;10;", out["__csv__"])

    def test_proposta_non_e_una_x_e_la_approvata_si(self):
        self.cliente()
        self.servizio(mesi="001000000000")
        self.toggle(campo="ricambi")                             # 2
        self.toggle(operatore="Capo", campo="corretta")          # 1
        st, out, _ = api.esporta_csv(self.ctx, {"anno": "2026"}, {})
        r = list(csv.reader(io.StringIO(out["__csv__"], newline=""), delimiter=";"))
        self.assertEqual(r[1][10:14], ["", "", "X", ""])
        self.assertEqual(r[1][16], "Capo")


class TermineAiBordi(ConDB):
    def test_mensile_il_31_non_scivola_al_28(self):
        x = s(inizio="2026-01-01", scad="2026-01-31", rin=1)          # termine di 1 mese
        self.assertEqual(api._scad_effettiva(x, "2026-02-15"), "2026-02-28")
        self.assertEqual(api._scad_effettiva(x, "2026-03-05"), "2026-03-31")
        self.assertEqual(api._scad_effettiva(x, "2028-02-10"), "2028-02-29")

    def test_dicembre_gennaio(self):
        x = s(inizio="2026-10-01", scad="2026-12-31", rin=1)          # trimestrale
        self.assertEqual(api._scad_effettiva(x, "2027-01-01"), "2027-03-31")
        y = s(inizio="2026-12-01", scad="2026-12-31", rin=1)          # mensile
        self.assertEqual(api._scad_effettiva(y, "2027-01-10"), "2027-01-31")

    def test_date_rotte_non_fanno_cadere_il_csv(self):
        """Una data non ISO (un campo testo in Access, o un export diverso)
        faceva saltare con un ValueError l'intero CSV di tutto l'ufficio."""
        for rotta in ("31/08/2026", "2026-13-01", "2026-08", ""):
            x = s(inizio="2025-09-01", scad=rotta, rin=1)
            self.assertEqual(api._scad_effettiva(x, "2026-09-23"), rotta, rotta)
        x = s(inizio="01/09/2025", scad="2026-08-31", rin=1)
        self.assertEqual(api._scad_effettiva(x, "2026-09-23"), "2027-08-31")
        self.cliente()
        self.servizio(scad="31/08/2026", rin=1)
        st, out, _ = api.esporta_csv(self.ctx, {"anno": "2026"}, {})
        self.assertEqual(st, 200)
        self.assertEqual(len(out["__csv__"].strip().split("\r\n")), 3)

    def test_mese_scadenza_bordi(self):
        # inizio il 31 dicembre: nell'anno c'e' solo dicembre
        x = s(mesi="100000000001", inizio="2026-12-31")
        self.assertEqual(api._mese_scadenza(x, 2026, "2026-09-23"), 12)
        # scadenza il 31 gennaio senza rinnovo: gennaio c'e', dicembre no
        y = s(mesi="100000000001", scad="2026-01-31")
        self.assertEqual(api._mese_scadenza(y, 2026, "2026-09-23"), 1)
        self.assertEqual(api._mese_scadenza(y, 2027, "2026-09-23"), 0)
        # chiuso con rinnovo automatico: la data resta quella
        z = s(mesi="000000001000", scad="2026-08-31", rin=1, stato="CHIUSO")
        self.assertEqual(api._mese_scadenza(z, 2026, "2026-09-23"), 0)
