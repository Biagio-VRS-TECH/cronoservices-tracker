"""api_dizionario: input strani, scritture in parallelo sulla stessa voce e il
seme identico a quello di cloud/08-dizionario.sql."""
import json, os, re, threading

from ._aiuti_py import APP, ConDB, api, db


class Input(ConDB):
    def setUp(self):
        super().setUp()
        with db.sess() as c:
            c.execute("DELETE FROM dizionario_componenti")

    def imposta(self, **body):
        body.setdefault("codice", "EST-6")
        body.setdefault("operatore", "Anna")
        return api.dizionario_imposta(self.ctx, {}, body)

    def voce(self, codice="EST-6"):
        with db.sess() as c:
            return c.execute("SELECT * FROM dizionario_componenti WHERE codice=?",
                             (codice,)).fetchone()

    def test_operatore_non_testo_non_e_un_500(self):
        """DIFETTO: l'operatore finiva cosi' com'era nell'INSERT: un oggetto
        faceva alzare ProgrammingError a sqlite3 (500) e la voce non si salvava."""
        for chi in ({"nome": "Anna"}, ["Anna"], 12, None, "  "):
            st, out, ev = self.imposta(nome="Estintore", operatore=chi)
            self.assertEqual(st, 200, chi)
            self.assertIsInstance(out["voce"]["aggiornato_da"], str)
            self.assertIsInstance(ev["operatore"], str)
        st, out, _ = self.imposta(nome="Estintore", operatore="  " + "Z" * 500)
        self.assertEqual(out["voce"]["aggiornato_da"], "Z" * 40)

    def test_codice_con_spazi_e_la_stessa_voce(self):
        self.imposta(codice="  EST-6 ", nome="Estintore")
        self.imposta(codice="EST-6", priorita=2)
        self.assertEqual(self.conta("dizionario_componenti"), 1)
        self.assertEqual((self.voce()["nome"], self.voce()["priorita"]), ("Estintore", 2))

    def test_codice_non_testo(self):
        st, out, _ = self.imposta(codice=101236, nome="Riduttore")
        self.assertEqual((st, out["voce"]["codice"]), (200, "101236"))
        for rotto in (None, "", "   ", 0, False):
            self.assertEqual(self.imposta(codice=rotto, nome="x")[0], 400, rotto)

    def test_nome_con_a_capo_e_tabulazioni_si_ricompatta(self):
        st, out, _ = self.imposta(nome="Valvola\n a\tsfera \r\n 1/2\"")
        self.assertEqual(out["voce"]["nome"], "Valvola a sfera 1/2\"")

    def test_togliere_una_voce_che_non_c_e(self):
        st, out, ev = self.imposta(codice="NUOVO", nome="")
        self.assertTrue(out["voce"]["rimossa"])
        self.assertEqual(self.conta("dizionario_componenti"), 0)

    def test_priorita_limiti(self):
        for p, atteso in (("1", 1), (10, 10), (" 7 ", 7), ("", None), (None, None), ("0", None)):
            self.imposta(nome="X", priorita=p)
            self.assertEqual(self.voce()["priorita"], atteso, p)
        for p in (0.5, "10.0", [3], {"p": 3}, 10 ** 30):
            self.assertEqual(self.imposta(priorita=p)[0], 400, p)

    def test_nome_e_priorita_in_parallelo_sulla_stessa_voce(self):
        """Due colleghi toccano la stessa voce nello stesso momento, uno il nome e
        l'altro la priorita': sotto WRITE_LOCK nessuno dei due si perde."""
        barriera, errori = threading.Barrier(2), []

        def fai(**body):
            try:
                barriera.wait()
                self.assertEqual(self.imposta(**body)[0], 200)
            except Exception as e:      # noqa: BLE001
                errori.append(e)

        for giro in range(5):
            with db.sess() as c:
                c.execute("DELETE FROM dizionario_componenti")
            th = [threading.Thread(target=fai, kwargs={"nome": "Nome %d" % giro}),
                  threading.Thread(target=fai, kwargs={"priorita": giro + 1})]
            for t in th:
                t.start()
            for t in th:
                t.join()
            self.assertEqual(errori, [])
            v = self.voce()
            self.assertEqual((v["nome"], v["priorita"]), ("Nome %d" % giro, giro + 1))


class Seme(ConDB):
    def test_seme_uguale_a_quello_online(self):
        """app/dizionario-seme.json e il seme di cloud/08-dizionario.sql sono lo
        stesso vocabolario (#ANCHOR: dizionario): codici, nomi e priorita'."""
        with open(os.path.join(APP, "dizionario-seme.json"), encoding="utf-8") as f:
            js = {k: (v.get("nome"), v.get("priorita")) for k, v in json.load(f).items()
                  if not k.startswith("_")}
        with open(os.path.join(APP, "..", "cloud", "08-dizionario.sql"), encoding="utf-8") as f:
            sql = f.read()
        righe = re.findall(r"\('([^']+)', '((?:[^']|'')*)', (?:null|'[^']*'), (null|\d+), '[^']*'\)",
                           sql)
        online = {c: (n.replace("''", "'"), None if p == "null" else int(p)) for c, n, p in righe}
        self.assertEqual(len(online), 24)
        self.assertEqual(js, online)

    def test_il_database_nuovo_contiene_il_seme(self):
        with db.sess() as c:
            voci = {r["codice"]: r for r in c.execute("SELECT * FROM dizionario_componenti")}
        self.assertEqual(len(voci), 24)
        self.assertEqual(voci["133460"]["priorita"], 1)
        self.assertEqual(voci["101490"]["aggiornato_da"], "seme")
