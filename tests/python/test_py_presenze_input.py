"""api_presenze: registrazione dell'operatore e battito con input strani,
dati lunghissimi e chiamate in parallelo."""
import threading, time

from ._aiuti_py import ConDB, api, db


class Operatore(ConDB):
    def test_nome_non_testo_e_un_400_non_un_500(self):
        """DIFETTO: (body.get("nome") or "").strip() con un numero, una lista o
        un oggetto alzava AttributeError (500)."""
        for nome in (123, ["Anna"], {"n": "Anna"}, True, None, "", "   \t\n"):
            st, out, ev = api.operatore(self.ctx, {}, {"nome": nome})
            self.assertEqual((st, ev), (400, None), nome)
        self.assertEqual(self.conta("operatori"), 0)

    def test_registrazione_ripetuta_aggiorna_l_accesso_e_non_tocca_il_ruolo(self):
        self.ruolo("Vera", "approvatore")
        with db.sess() as c:
            c.execute("UPDATE operatori SET ultimo_accesso='2000-01-01T00:00:00' WHERE nome='Vera'")
        st, out, _ = api.operatore(self.ctx, {}, {"nome": "  Vera "})
        self.assertEqual((out["nome"], out["ruolo"]), ("Vera", "approvatore"))
        with db.sess() as c:
            r = c.execute("SELECT * FROM operatori WHERE nome='Vera'").fetchone()
        self.assertEqual(r["ruolo"], "approvatore")
        self.assertNotEqual(r["ultimo_accesso"], "2000-01-01T00:00:00")
        self.assertEqual(out["operatori"], ["Vera"])

    def test_registrazioni_in_parallelo(self):
        errori = []

        def registra(i):
            try:
                for k in range(10):
                    st, _, _ = api.operatore(self.ctx, {}, {"nome": "Op%d" % ((i + k) % 5)})
                    if st != 200:
                        errori.append(st)
            except Exception as e:      # noqa: BLE001
                errori.append(e)

        th = [threading.Thread(target=registra, args=(i,)) for i in range(6)]
        for t in th:
            t.start()
        for t in th:
            t.join()
        self.assertEqual(errori, [])
        self.assertEqual(self.conta("operatori"), 5)

    def test_nome_unicode_resta_com_e(self):
        st, out, _ = api.operatore(self.ctx, {}, {"nome": "Zoë Ñúñez 李"})
        self.assertEqual(out["nome"], "Zoë Ñúñez 李")


class Ping(ConDB):
    def test_operatore_non_testo_non_rompe_il_battito(self):
        """DIFETTO: (body.get("operatore") or "").strip() con un numero alzava
        AttributeError: il battito di quel client finiva in 500 e la spia
        diceva "server caduto"."""
        for chi in (123, ["Anna"], {"n": 1}, True):
            st, out, ev = api.ping(self.ctx, {}, {"operatore": chi, "dove": "x"})
            self.assertEqual((st, ev), (200, None), chi)
            self.assertEqual(out["online"], [])

    def test_nome_e_dove_lunghissimi_tagliati(self):
        """DIFETTO: nome e "dove" finivano interi nel dizionario delle presenze e
        in ogni evento SSE a tutti: un battito da un megabyte lo riceveva ogni
        collega, ogni venti secondi."""
        st, out, _ = api.ping(self.ctx, {}, {"operatore": "N" * 5000, "dove": "D" * 10 ** 6})
        [p] = out["online"]
        self.assertEqual(p["nome"], "N" * 40)
        self.assertLessEqual(len(p["dove"]), 100)

    def test_dove_non_testo(self):
        st, out, ev = api.ping(self.ctx, {}, {"operatore": "Anna", "dove": {"anno": 2026}})
        [p] = out["online"]
        self.assertIsInstance(p["dove"], str)
        st, out, ev = api.ping(self.ctx, {}, {"operatore": "Anna"})
        self.assertIsNone(out["online"][0]["dove"])
        self.assertIsNotNone(ev)          # e' cambiato: da {"anno":...} a nessuno

    def test_dove_con_la_cella_arriva_intero(self):
        """Il "dove" vero (#ANCHOR: fuoco): "AAAA-MM @sid-mese", corto."""
        api.ping(self.ctx, {}, {"operatore": "Anna", "dove": "2026-09 @812-11"})
        self.assertEqual(api._online(), [{"nome": "Anna", "dove": "2026-09 @812-11"}])

    def test_elenco_in_ordine_e_scaduti_tolti(self):
        for n in ("Zeno", "Anna", "Marco"):
            api.ping(self.ctx, {}, {"operatore": n, "dove": "x"})
        api.PRESENZE["Marco"]["ts"] = time.time() - api.PRESENZA_TTL - 1
        st, out, _ = api.ping(self.ctx, {}, {"operatore": "Bea", "dove": "x"})
        self.assertEqual([p["nome"] for p in out["online"]], ["Anna", "Bea", "Zeno"])
        self.assertNotIn("Marco", api.PRESENZE)
