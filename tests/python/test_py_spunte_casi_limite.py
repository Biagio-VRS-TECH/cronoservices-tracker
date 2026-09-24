"""api_spunte: casi limite di toggle, bulk, nota e ripristino (input rotti,
valori fuori dominio, righe spazzatura, archivio occupato) e il contenuto del
diario che le spunte lasciano. Tutto su SQLite temporanei (_aiuti_py.ConDB)."""
import sqlite3
from unittest import mock

from ._aiuti_py import ConDB, api, db


def http(fn, *a, **k):
    """Lo status che il server darebbe (server.py `_api`): KeyError, ValueError e
    TypeError sono la richiesta sbagliata (400), il resto un guasto (500)."""
    try:
        return fn(*a, **k)[0]
    except (KeyError, ValueError, TypeError):
        return 400
    except Exception:          # noqa: BLE001
        return 500


class Dominio(ConDB):
    """Mese, anno e id fuori dall'intervallo: prima finivano nel database (una
    cella del mese 13) o in un OverflowError di SQLite, cioe' un 500."""

    def test_mese_fuori_da_1_12_non_si_scrive(self):
        for mese in (0, 13, -1, 99):
            self.assertEqual(http(self.toggle, mese=mese), 400, mese)
        self.assertEqual(self.conta("mappature"), 0)
        self.assertEqual(self.conta("eventi"), 0)

    def test_anno_e_id_enormi_sono_400_non_500(self):
        self.assertEqual(http(self.toggle, anno=10 ** 30), 400)
        self.assertEqual(http(self.toggle, sid=10 ** 30), 400)
        self.assertEqual(http(self.toggle, anno=0), 400)
        self.assertEqual(http(self.toggle, sid=-4), 400)
        self.assertEqual(self.conta("mappature"), 0)

    def test_infinito_e_decimali_dal_json(self):
        # json.loads accetta Infinity e NaN: int(inf) e' un OverflowError
        self.assertEqual(http(self.toggle, mese=float("inf")), 400)
        self.assertEqual(http(self.toggle, anno=float("nan")), 400)
        self.assertEqual(http(self.toggle, mese=3.7), 400)       # non e' marzo
        self.assertEqual(http(self.toggle, sid=True), 400)
        # il valore invece e' un'intenzione: strano = 1, come "abc"
        st, out, _ = self.toggle(valore=float("inf"))
        self.assertEqual((st, out["cella"]["s"]), (200, 1))
        # i numeri scritti come testo restano validi
        st, out, _ = self.toggle(sid="10", anno="2026", mese="4")
        self.assertEqual((st, out["mese"]), (200, 4))

    def test_base_rev_infinito(self):
        self.toggle()
        self.assertEqual(http(self.toggle, campo="controllata", base_rev=float("inf")), 400)

    def test_bulk_voce_fuori_dominio_non_blocca_le_altre(self):
        st, out, ev = api.bulk(self.ctx, {}, {"anno": 2026, "operatore": "Anna", "celle": [
            dict(id_service=10, mese=13, campo="stampata", valore=1),
            dict(id_service=10, mese=2, campo="stampata", valore=1)]})
        self.assertEqual([e["http"] for e in out["esiti"]], [400, 200])
        self.assertEqual(self.conta("mappature"), 1)
        self.assertEqual(http(api.bulk, self.ctx, {}, {"anno": 10 ** 30, "celle": []}), 400)

    def test_nota_fuori_dominio(self):
        corpo = dict(id_service=10, anno=2026, mese=0, nota="x", operatore="Anna")
        self.assertEqual(http(api.nota, self.ctx, {}, corpo), 400)
        corpo.update(mese=3, anno=10 ** 30)
        self.assertEqual(http(api.nota, self.ctx, {}, corpo), 400)
        self.assertEqual(self.conta("mappature"), 0)


class TipiSbagliati(ConDB):
    """Un corpo JSON con i tipi sbagliati e' una richiesta sbagliata (400), non un
    AttributeError o un errore di binding di SQLite (500)."""

    def test_operatore_non_testo(self):
        for chi in (5, ["Capo"], {"n": 1}):
            self.assertEqual(http(self.toggle, operatore=chi), 400, chi)
        self.assertEqual(self.conta("mappature"), 0)

    def test_op_id_non_testo(self):
        self.assertEqual(http(self.toggle, op_id={"a": 1}), 400)
        self.assertEqual(http(self.toggle, op_id=[1]), 400)
        # un numero si', diventa testo (la colonna e' TEXT comunque)
        self.assertEqual(self.toggle(op_id=77)[0], 200)
        self.assertEqual(self.toggle(op_id="77")[1]["esito"], "replay")

    def test_nota_non_testo(self):
        corpo = dict(id_service=10, anno=2026, mese=3, nota=123, operatore="Anna")
        self.assertEqual(http(api.nota, self.ctx, {}, corpo), 400)
        corpo["nota"] = {"x": 1}
        self.assertEqual(http(api.nota, self.ctx, {}, corpo), 400)

    def test_bulk_celle_non_lista_o_voci_non_oggetti(self):
        for celle in ("abc", {"id_service": 10}, [1, 2], ["x"]):
            corpo = {"anno": 2026, "operatore": "Anna", "celle": celle}
            self.assertEqual(http(api.bulk, self.ctx, {}, corpo), 400, celle)
        self.assertEqual(self.conta("mappature"), 0)

    def test_ripristina_operatore_non_testo(self):
        self.assertEqual(http(api.ripristina, self.ctx, {}, {"op_id": "x", "operatore": 5}), 400)


class Operatore(ConDB):
    def test_nome_ripulito_e_tagliato(self):
        st, out, ev = self.toggle(operatore="  Anna  ")
        self.assertEqual(out["cella"]["by"], "Anna")
        self.assertEqual(ev["operatore"], "Anna")
        lungo = "N" * 5000
        st, out, ev = self.toggle(operatore=lungo, mese=4)
        self.assertEqual(len(out["cella"]["by"]), 40)
        with db.sess() as c:
            self.assertEqual(c.execute("SELECT MAX(LENGTH(operatore)) FROM eventi").fetchone()[0], 40)

    def test_senza_nome_e_punto_interrogativo(self):
        for chi in (None, "", "   "):
            self.toggle(operatore=chi, valore=1)
            self.toggle(operatore=chi, valore=0)
        with db.sess() as c:
            nomi = {r[0] for r in c.execute("SELECT operatore FROM eventi")}
        self.assertEqual(nomi, {"?"})

    def test_admin_con_spazi_resta_admin(self):
        # ruolo_di toglie gli spazi: "Capo " e' l'admin, e ora anche la firma e' "Capo"
        st, out, _ = self.toggle(operatore="Capo ", campo="corretta")
        self.assertEqual((out["cella"]["k"], out["cella"]["by"]), (1, "Capo"))


class NienteSpazzatura(ConDB):
    """"Niente riga e niente da scrivere: non si crea spazzatura a zero" valeva
    solo senza base_rev: un 409 su una cella che non c'e' la creava a zero."""

    def test_conflitto_su_cella_inesistente_non_la_crea(self):
        st, out, ev = self.toggle(base_rev=3, base_valore=1)
        self.assertEqual((st, out["esito"]), (409, "conflitto"))
        self.assertEqual(out["cella"]["rev"], 0)
        self.assertIsNone(ev)
        self.assertEqual(self.conta("mappature"), 0)

    def test_merge_su_cella_inesistente_la_crea(self):
        st, out, _ = self.toggle(base_rev=3, base_valore=0)
        self.assertEqual((st, out["esito"]), (200, "merge"))
        self.assertEqual(self.cella()["stampata"], 1)

    def test_nota_in_conflitto_su_cella_inesistente(self):
        st, out, ev = api.nota(self.ctx, {}, dict(id_service=10, anno=2026, mese=3,
                                                  nota="mia", base_rev=2,
                                                  base_nota="di Bruno", operatore="Anna"))
        self.assertEqual((st, out["esito"]), (409, "conflitto"))
        self.assertIsNone(ev)
        self.assertEqual(self.conta("mappature"), 0)


class ArchivioOccupato(ConDB):
    """Con l'archivio tenuto da un altro processo oltre il busy_timeout il server
    risponde 503 "riprova" se l'errore dice "locked"/"busy". Il ROLLBACK senza
    transazione aperta lo sostituiva con "cannot rollback": un 500."""

    def setUp(self):
        super().setUp()
        self.toggle(op_id="prima")
        vero = db.connect

        def corto():
            c = vero()
            c.execute("PRAGMA busy_timeout=50")
            return c
        self.p = mock.patch.object(db, "connect", corto)
        self.p.start()
        self.altro = sqlite3.connect(self.percorso, isolation_level=None)
        self.altro.execute("BEGIN IMMEDIATE")

    def tearDown(self):
        self.altro.execute("ROLLBACK")
        self.altro.close()
        self.p.stop()
        super().tearDown()

    def occupato(self, fn, *a):
        with self.assertRaises(sqlite3.OperationalError) as e:
            fn(*a)
        self.assertIn("locked", str(e.exception))

    def test_toggle(self):
        self.occupato(self.toggle)

    def test_bulk(self):
        self.occupato(api.bulk, self.ctx, {}, {"anno": 2026, "operatore": "Anna", "celle": []})

    def test_nota(self):
        self.occupato(api.nota, self.ctx, {}, dict(id_service=10, anno=2026, mese=3,
                                                   nota="x", operatore="Anna"))

    def test_ripristina(self):
        self.occupato(api.ripristina, self.ctx, {}, {"op_id": "prima", "operatore": "Capo"})


class Diario(ConDB):
    """Cosa resta in `eventi` per ogni tipo di scrittura: e' cio' che leggono la
    storia della cella, il diario e il Ripristina."""

    def eventi(self):
        with db.sess() as c:
            return [dict(r) for r in c.execute("SELECT * FROM eventi ORDER BY id")]

    def test_toggle_scrive_da_a_origine_op_id(self):
        self.toggle(op_id="u1")
        self.toggle(campo="corretta", op_id="u2", origine="tastiera")
        self.toggle(valore=0)
        e = self.eventi()
        self.assertEqual([(x["campo"], x["da"], x["a"], x["op_id"], x["origine"]) for x in e],
                         [("stampata", 0, 1, "u1", "live"),
                          ("corretta", 0, db.PROPOSTA, "u2", "tastiera"),
                          ("stampata", 1, 0, None, "live")])
        self.assertTrue(all(x["operatore"] == "Anna" and x["mese"] == 3 for x in e))

    def test_gia_cosi_vietato_e_conflitto_non_scrivono(self):
        self.toggle()
        self.toggle()                                                   # gia-cosi
        self.toggle(operatore="Capo", campo="ricambi")
        self.toggle(campo="ricambi", valore=0)                          # 403
        self.toggle(campo="controllata", base_rev=0, base_valore=1)     # 409
        self.assertEqual(len(self.eventi()), 2)

    def test_bulk_e_nota(self):
        api.bulk(self.ctx, {}, {"anno": 2026, "operatore": "Anna", "origine": "approvazione",
                                "celle": [dict(id_service=10, mese=1, campo="stampata",
                                               valore=1)]})
        api.nota(self.ctx, {}, dict(id_service=10, anno=2026, mese=1, nota="ciao",
                                    operatore="Anna"))
        e = self.eventi()
        self.assertEqual((e[0]["origine"], e[0]["op_id"]), ("approvazione", None))
        self.assertEqual((e[1]["campo"], e[1]["da"], e[1]["a"]), ("nota", None, None))

    def test_ripristino_lascia_eventi_col_suo_blocco(self):
        self.toggle(op_id="u1")
        st, out, _ = api.ripristina(self.ctx, {}, {"op_id": "u1", "operatore": "Capo"})
        ultimo = self.eventi()[-1]
        self.assertEqual((ultimo["origine"], ultimo["op_id"], ultimo["a"]),
                         ("ripristino", out["blocco"] + ":0", 0))

    def test_ripristino_salta_le_note(self):
        api.nota(self.ctx, {}, dict(id_service=10, anno=2026, mese=3, nota="ciao",
                                    operatore="Anna"))
        with db.sess() as c:
            c.execute("UPDATE eventi SET op_id='n1'")
        st, out, ev = api.ripristina(self.ctx, {}, {"op_id": "n1", "operatore": "Capo"})
        self.assertEqual((st, out["n"], ev), (200, 0, None))
        self.assertEqual(self.cella()["nota"], "ciao")


class BulkEAnnulla(ConDB):
    """L'Annulla del client (web/js/stato.js annullaUltima) rimanda a /api/bulk
    le voci inverse, coi valori di prima: anche il 2 di una proposta."""

    def test_admin_completa_e_annulla(self):
        self.toggle(campo="corretta")                           # proposta del tecnico
        celle = [dict(id_service=10, mese=3, campo=k, valore=1, op_id="M:%d" % i)
                 for i, k in enumerate(("stampata", "corretta"))]
        st, out, ev = api.bulk(self.ctx, {}, {"anno": 2026, "operatore": "Capo",
                                              "origine": "massa", "celle": celle})
        self.assertEqual((self.cella()["stampata"], self.cella()["corretta"]), (1, 1))
        rev = self.cella()["rev"]
        inverse = [dict(id_service=10, mese=3, campo="stampata", valore=0, base_rev=rev,
                        base_valore=1),
                   dict(id_service=10, mese=3, campo="corretta", valore=2, base_rev=rev,
                        base_valore=1)]
        st, out, ev = api.bulk(self.ctx, {}, {"anno": 2026, "operatore": "Capo",
                                              "origine": "annulla", "celle": inverse})
        self.assertEqual([e["esito"] for e in out["esiti"]], ["ok", "merge"])
        self.assertEqual((self.cella()["stampata"], self.cella()["corretta"]), (0, 2))
        self.assertEqual(len(ev["celle"]), 2)

    def test_tecnico_annulla_la_sua_proposta(self):
        api.bulk(self.ctx, {}, {"anno": 2026, "operatore": "Anna",
                                "celle": [dict(id_service=10, mese=3, campo="ricambi",
                                               valore=1)]})
        self.assertEqual(self.cella()["ricambi"], db.PROPOSTA)
        st, out, _ = api.bulk(self.ctx, {}, {"anno": 2026, "operatore": "Anna",
                                             "origine": "annulla",
                                             "celle": [dict(id_service=10, mese=3,
                                                            campo="ricambi", valore=0)]})
        self.assertEqual(self.cella()["ricambi"], 0)

    def test_approvatore_non_rimette_in_attesa(self):
        self.ruolo("Vera", "approvatore")
        self.toggle(campo="ricambi")
        api.bulk(self.ctx, {}, {"anno": 2026, "operatore": "Vera", "origine": "approvazione",
                                "celle": [dict(id_service=10, mese=3, campo="ricambi",
                                               valore=1)]})
        st, out, ev = api.bulk(self.ctx, {}, {"anno": 2026, "operatore": "Vera",
                                              "origine": "annulla",
                                              "celle": [dict(id_service=10, mese=3,
                                                             campo="ricambi", valore=2)]})
        self.assertEqual(out["esiti"][0]["http"], 403)
        self.assertIsNone(ev)
        self.assertEqual(self.cella()["ricambi"], 1)

    def test_op_id_per_voce_vince_sul_blocco(self):
        api.bulk(self.ctx, {}, {"anno": 2026, "operatore": "Anna", "op_id": "B", "celle": [
            dict(id_service=10, mese=1, campo="stampata", valore=1, op_id="mio"),
            dict(id_service=10, mese=2, campo="stampata", valore=1)]})
        with db.sess() as c:
            self.assertEqual(sorted(r[0] for r in c.execute("SELECT op_id FROM ops")),
                             ["B:1", "mio"])

    def test_stessa_voce_due_volte_nello_stesso_blocco(self):
        voce = dict(id_service=10, mese=1, campo="stampata", valore=1, op_id="x")
        st, out, _ = api.bulk(self.ctx, {}, {"anno": 2026, "operatore": "Anna",
                                             "celle": [voce, dict(voce)]})
        self.assertEqual([e["esito"] for e in out["esiti"]], ["ok", "replay"])
        self.assertEqual(self.conta("eventi"), 1)


class Replay(ConDB):
    def test_replay_su_cella_mai_scritta(self):
        # un op_id gia' visto il cui esito era gia-cosi (0 su cella vuota)
        self.toggle(valore=0, op_id="z")
        st, out, ev = self.toggle(op_id="z")
        self.assertEqual((st, out["esito"], out["cella"], ev), (200, "replay", None, None))
        self.assertEqual(self.conta("mappature"), 0)

    def test_il_409_non_consuma_l_op_id(self):
        self.toggle(operatore="Capo", campo="ricambi")
        self.toggle(operatore="Capo", campo="ricambi", valore=2)
        st, _, _ = self.toggle(operatore="Capo", campo="ricambi", base_rev=0,
                               base_valore=0, op_id="c")
        self.assertEqual(st, 409)
        self.assertEqual(self.conta("ops"), 0)
