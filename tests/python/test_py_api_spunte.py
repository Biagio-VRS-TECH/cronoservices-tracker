"""api.py: spunte, merge, ruoli, bulk, nota, ripristino, diario."""
import threading

from ._aiuti_py import ConDB, api, db


class ValorePerRuolo(ConDB):
    def test_tabella(self):
        v = api._valore_per_ruolo
        # passi semplici: 2 non esiste, vale 1
        self.assertEqual(v("stampata", 0, 2, False), (1, None))
        self.assertEqual(v("stampata", 0, "1", False), (1, None))
        self.assertEqual(v("stampata", 1, 0, False), (0, None))
        self.assertEqual(v("stampata", 0, None, False), (0, None))
        # tecnico sui passi da approvare
        self.assertEqual(v("corretta", 0, 1, False), (2, None))
        self.assertEqual(v("corretta", 1, 1, False), (1, None))
        self.assertEqual(v("corretta", 2, 0, False), (0, None))
        st, out = v("corretta", 1, 0, False)[1]
        self.assertEqual(st, 403)
        self.assertTrue(out["approvata"])
        self.assertEqual(v("ricambi", 0, 2, False)[1][0], 403)
        # approvatore: 0/1 si', 2 no
        self.assertEqual(v("ricambi", 2, 1, True), (1, None))
        self.assertEqual(v("ricambi", 1, 0, True), (0, None))
        self.assertEqual(v("ricambi", 1, 2, True)[1][0], 403)
        # admin: anche 2
        self.assertEqual(v("ricambi", 1, 2, True, True), (2, None))
        # valori strani: fuori da 0/1/2 diventano 0/1
        self.assertEqual(v("stampata", 0, 7, False), (1, None))
        self.assertEqual(v("corretta", 0, -3, True), (1, None))
        self.assertEqual(v("stampata", 0, "abc", False), (1, None))


class Toggle(ConDB):
    def test_spunta_semplice_ed_evento(self):
        st, out, ev = self.toggle()
        self.assertEqual((st, out["esito"]), (200, "ok"))
        self.assertEqual(out["cella"]["s"], 1)
        self.assertEqual(out["cella"]["rev"], 1)
        self.assertEqual(ev["tipo"], "cella")
        self.assertEqual(ev["operatore"], "Anna")
        self.assertEqual(self.conta("eventi"), 1)

    def test_zero_su_cella_inesistente_non_crea_righe(self):
        st, out, ev = self.toggle(valore=0)
        self.assertEqual(out["esito"], "gia-cosi")
        self.assertIsNone(ev)
        self.assertEqual(self.conta("mappature"), 0)

    def test_stesso_valore_gia_cosi(self):
        self.toggle()
        st, out, ev = self.toggle()
        self.assertEqual(out["esito"], "gia-cosi")
        self.assertIsNone(ev)
        self.assertEqual(self.conta("eventi"), 1)

    def test_campo_non_valido_anche_se_sembra_sql(self):
        for campo in ("nota", "rev", "stampata=1, rev", "stampata; DROP TABLE eventi"):
            st, out, ev = self.toggle(campo=campo)
            self.assertEqual(st, 400, campo)
        self.assertEqual(self.conta("mappature"), 0)

    def test_campo_mancante_e_id_non_numerico_alzano(self):
        # il server li trasforma in 400 (vedi test_py_server)
        with self.assertRaises(KeyError):
            api.toggle(self.ctx, {}, {"id_service": 1, "anno": 2026, "mese": 3})
        with self.assertRaises(ValueError):
            self.toggle(sid="abc")
        # e la transazione non resta aperta: una scrittura dopo passa
        self.assertEqual(self.toggle()[0], 200)

    def test_proposta_del_tecnico_e_approvazione(self):
        self.ruolo("Vera", "approvatore")
        st, out, _ = self.toggle(campo="corretta")
        self.assertEqual(out["cella"]["k"], db.PROPOSTA)
        st, out, _ = self.toggle(operatore="Vera", campo="corretta")
        self.assertEqual(out["cella"]["k"], 1)
        # il tecnico non toglie una spunta approvata
        st, out, ev = self.toggle(campo="corretta", valore=0)
        self.assertEqual((st, out["esito"]), (403, "vietato"))
        self.assertIsNone(ev)
        self.assertEqual(self.cella()["corretta"], 1)
        # l'approvatore si'
        st, out, _ = self.toggle(operatore="Vera", campo="corretta", valore=0)
        self.assertEqual(out["cella"]["k"], 0)

    def test_il_tecnico_ritira_la_sua_proposta(self):
        self.toggle(campo="ricambi")
        st, out, _ = self.toggle(campo="ricambi", valore=0)
        self.assertEqual((st, out["cella"]["r"]), (200, 0))

    def test_solo_admin_rimette_in_attesa(self):
        self.ruolo("Vera", "approvatore")
        self.toggle(operatore="Capo", campo="ricambi")
        self.assertEqual(self.toggle(operatore="Vera", campo="ricambi", valore=2)[0], 403)
        st, out, _ = self.toggle(operatore="Capo", campo="ricambi", valore=2)
        self.assertEqual(out["cella"]["r"], 2)

    def test_merge_su_un_altro_campo(self):
        self.toggle()                                         # rev 1
        self.toggle(operatore="Bruno", campo="controllata")   # rev 2
        st, out, _ = self.toggle(campo="corretta", base_rev=1, base_valore=0)
        self.assertEqual(out["esito"], "merge")
        self.assertEqual(out["cella"]["rev"], 3)

    def test_rev_vecchia_e_valore_gia_quello(self):
        self.toggle()
        self.toggle(operatore="Bruno", campo="controllata")
        st, out, _ = self.toggle(base_rev=0, base_valore=0)
        self.assertEqual(out["esito"], "gia-cosi")

    def test_conflitto_vero(self):
        self.toggle(operatore="Capo", campo="ricambi")                  # 1
        self.toggle(operatore="Capo", campo="ricambi", valore=2)        # 2
        # il client crede 0 e manda 1, ma il campo e' a 2 (ne' 0 ne' 1)
        st, out, ev = self.toggle(operatore="Capo", campo="ricambi", valore=1,
                                  base_rev=0, base_valore=0)
        self.assertEqual((st, out["esito"]), (409, "conflitto"))
        self.assertIsNone(ev)

    def test_replay_della_coda_offline(self):
        st, out, _ = self.toggle(op_id="op-1")
        st, out, ev = self.toggle(op_id="op-1")
        self.assertEqual(out["esito"], "replay")
        self.assertIsNone(ev)
        self.assertEqual(self.conta("eventi"), 1)
        self.assertEqual(self.cella()["rev"], 1)

    def test_vietato_non_consuma_l_op_id(self):
        self.toggle(operatore="Capo", campo="corretta")
        self.toggle(campo="corretta", valore=0, op_id="op-x")      # 403
        self.assertEqual(self.conta("ops"), 0)

    def test_scritture_concorrenti_non_si_perdono(self):
        """Dieci thread sulla stessa cella, campi e mesi diversi: nessuna
        eccezione "database is locked", nessuna scrittura persa."""
        errori = []

        def lavora(i):
            try:
                mese = 1 + i % 12
                for campo in ("stampata", "controllata"):
                    st, out, _ = self.toggle(operatore="T%d" % i, mese=mese, campo=campo,
                                             sid=100 + i)
                    if st != 200:
                        errori.append(out)
            except Exception as e:          # noqa: BLE001
                errori.append(e)

        th = [threading.Thread(target=lavora, args=(i,)) for i in range(10)]
        for t in th:
            t.start()
        for t in th:
            t.join()
        self.assertEqual(errori, [])
        self.assertEqual(self.conta("eventi"), 20)
        self.assertEqual(self.conta("mappature", "stampata=1 AND controllata=1"), 10)


class Bulk(ConDB):
    def celle(self, *mesi, campo="stampata", valore=1):
        return [dict(id_service=10, mese=m, campo=campo, valore=valore) for m in mesi]

    def test_massa_solo_admin(self):
        self.ruolo("Vera", "approvatore")
        for chi in ("Anna", "Vera"):
            st, out, ev = api.bulk(self.ctx, {}, {"anno": 2026, "operatore": chi,
                                                  "origine": "massa", "celle": self.celle(1)})
            self.assertEqual(st, 403)
        st, out, ev = api.bulk(self.ctx, {}, {"anno": 2026, "operatore": "Capo",
                                              "origine": "massa", "celle": self.celle(1, 2)})
        self.assertEqual(st, 200)
        self.assertEqual(len(ev["celle"]), 2)

    def test_blocco_op_id_e_replay(self):
        body = {"anno": 2026, "operatore": "Anna", "op_id": "B", "celle": self.celle(1, 2, 3)}
        api.bulk(self.ctx, {}, body)
        with db.sess() as c:
            ids = sorted(r[0] for r in c.execute("SELECT op_id FROM eventi"))
        self.assertEqual(ids, ["B:0", "B:1", "B:2"])
        st, out, ev = api.bulk(self.ctx, {}, body)
        self.assertEqual([e["esito"] for e in out["esiti"]], ["replay"] * 3)
        self.assertIsNone(ev)

    def test_un_vietato_non_blocca_le_altre(self):
        api.bulk(self.ctx, {}, {"anno": 2026, "operatore": "Capo",
                                "celle": self.celle(1, campo="corretta")})
        celle = self.celle(1, campo="corretta", valore=0) + self.celle(2)
        st, out, ev = api.bulk(self.ctx, {}, {"anno": 2026, "operatore": "Anna",
                                              "celle": celle})
        self.assertEqual([e["http"] for e in out["esiti"]], [403, 200])
        self.assertEqual(len(ev["celle"]), 1)

    def test_senza_celle(self):
        st, out, ev = api.bulk(self.ctx, {}, {"anno": 2026, "operatore": "Anna"})
        self.assertEqual((st, out, ev), (200, {"esiti": []}, None))

    def test_voce_rotta_annulla_tutto_il_blocco(self):
        celle = self.celle(1) + [{"id_service": 10, "mese": 2}]     # senza campo
        with self.assertRaises(KeyError):
            api.bulk(self.ctx, {}, {"anno": 2026, "operatore": "Anna", "celle": celle})
        self.assertEqual(self.conta("mappature"), 0)


class Nota(ConDB):
    def nota(self, testo, operatore="Anna", **extra):
        return api.nota(self.ctx, {}, dict(id_service=10, anno=2026, mese=3, nota=testo,
                                           operatore=operatore, **extra))

    def test_crea_e_taglia(self):
        st, out, ev = self.nota("  " + "x" * 600 + "  ")
        self.assertEqual(len(out["cella"]["nota"]), 500)
        self.assertEqual(ev["tipo"], "cella")

    def test_vuota_su_cella_inesistente(self):
        st, out, ev = self.nota("   ")
        self.assertEqual(out["esito"], "gia-cosi")
        self.assertEqual(self.conta("mappature"), 0)

    def test_cancellare_la_nota_la_mette_a_null(self):
        self.nota("ciao")
        self.nota("")
        self.assertIsNone(self.cella()["nota"])

    def test_conflitto_e_merge(self):
        self.nota("prima")                                        # rev 1
        self.nota("di Bruno", operatore="Bruno")                  # rev 2
        st, out, ev = self.nota("mia", base_rev=1, base_nota="prima")
        self.assertEqual((st, out["esito"]), (409, "conflitto"))
        self.assertEqual(out["cella"]["nota"], "di Bruno")
        self.assertEqual(self.cella()["nota"], "di Bruno")
        # un altro ha toccato solo una spunta: merge
        self.toggle(operatore="Bruno")                            # rev 3
        st, out, ev = self.nota("mia", base_rev=2, base_nota="di Bruno")
        self.assertEqual(out["esito"], "merge")
        self.assertEqual(self.cella()["nota"], "mia")

    def test_unicode(self):
        self.nota("Città — «ok» 🔥")
        self.assertEqual(self.cella()["nota"], "Città — «ok» 🔥")


class Ripristino(ConDB):
    def test_solo_admin_e_argomenti(self):
        self.assertEqual(api.ripristina(self.ctx, {}, {"op_id": "x", "operatore": "Anna"})[0], 403)
        self.assertEqual(api.ripristina(self.ctx, {}, {"op_id": "", "operatore": "Capo"})[0], 400)
        self.assertEqual(api.ripristina(self.ctx, {}, {"op_id": "a:1", "operatore": "Capo"})[0], 400)
        self.assertEqual(api.ripristina(self.ctx, {}, {"op_id": "nulla", "operatore": "Capo"})[0], 404)

    def test_ripristina_un_blocco(self):
        api.bulk(self.ctx, {}, {"anno": 2026, "operatore": "Anna", "op_id": "B",
                                "celle": [dict(id_service=10, mese=m, campo="stampata",
                                               valore=1) for m in (1, 2)]})
        self.toggle(mese=5, op_id="altro")
        st, out, ev = api.ripristina(self.ctx, {}, {"op_id": "B", "operatore": "Capo"})
        self.assertEqual((st, out["n"]), (200, 2))
        self.assertEqual(self.cella(mese=1)["stampata"], 0)
        self.assertEqual(self.cella(mese=5)["stampata"], 1)      # un altro blocco: resta
        self.assertEqual(ev["tipo"], "celle")
        # anche un ripristino si ripristina
        st, out, ev = api.ripristina(self.ctx, {}, {"op_id": out["blocco"], "operatore": "Capo"})
        self.assertEqual(self.cella(mese=1)["stampata"], 1)

    def test_jolly_del_like_non_prendono_altri_blocchi(self):
        """Prima era `op_id LIKE ?||':%'`: con op_id "%" si ripristinavano
        tutti i blocchi del diario, con "_" ogni blocco di un carattere."""
        api.bulk(self.ctx, {}, {"anno": 2026, "operatore": "Anna", "op_id": "B",
                                "celle": [dict(id_service=10, mese=1, campo="stampata",
                                               valore=1)]})
        for jolly in ("%", "_"):
            st, out, ev = api.ripristina(self.ctx, {}, {"op_id": jolly, "operatore": "Capo"})
            self.assertEqual(st, 404, jolly)
        self.assertEqual(self.cella(mese=1)["stampata"], 1)

    def test_rimette_la_proposta(self):
        self.toggle(campo="corretta", op_id="p")              # tecnico: 0 -> 2
        self.toggle(operatore="Capo", campo="corretta", op_id="a")   # 2 -> 1
        api.ripristina(self.ctx, {}, {"op_id": "a", "operatore": "Capo"})
        self.assertEqual(self.cella()["corretta"], 2)


class Diario(ConDB):
    def test_azzera_solo_admin(self):
        self.toggle()
        self.assertEqual(api.azzera_diario(self.ctx, {}, {"operatore": "Anna"})[0], 403)
        st, out, ev = api.azzera_diario(self.ctx, {}, {"operatore": "Capo"})
        self.assertEqual(out["n"], 1)
        self.assertEqual(self.conta("eventi"), 0)
        self.assertEqual(self.cella()["stampata"], 1)       # il lavoro resta

    def test_storia_ordine_e_limite(self):
        for i in range(60):
            self.toggle(valore=i % 2 == 0)
        st, out, _ = api.storia(self.ctx, {"id_service": "10", "anno": "2026", "mese": "3"}, {})
        self.assertEqual(len(out["storia"]), 50)
        self.assertEqual(out["storia"][0]["a"], 0)          # la piu' recente per prima

    def test_attivita_limite(self):
        self.cliente()
        self.servizio()
        for m in range(1, 6):
            self.toggle(mese=m)
        n = lambda q: len(api.attivita(self.ctx, q, {})[1]["attivita"])
        self.assertEqual(n({}), 5)
        self.assertEqual(n({"limit": "2"}), 2)
        # LIMIT negativo in SQLite = nessun limite: ora si torna a 1
        self.assertEqual(n({"limit": "-5"}), 1)
        self.assertEqual(n({"limit": "abc"}), 5)
        self.assertEqual(n({"limit": "99999"}), 5)
        riga = api.attivita(self.ctx, {}, {})[1]["attivita"][0]
        self.assertEqual(riga["rag_soc"], "CLIENTE UNO")
