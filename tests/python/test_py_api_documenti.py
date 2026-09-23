"""api.py: i PDF dei generatori (salva, scarica, elimina) e il percorso su disco."""
import base64, os
from unittest import mock

from ._aiuti_py import ConDB, PDF, api, db


def b64(dati=PDF):
    return base64.b64encode(dati).decode()


class Documenti(ConDB):
    def setUp(self):
        super().setUp()
        self.cliente()
        self.servizio(sid=10, mesi="001000001000")
        self.cartella = os.path.join(self.dir, "documenti")

    def salva(self, **extra):
        body = dict(id_service=10, anno=2026, pdf=b64(), nome="Schede SEDE.pdf",
                    operatore="Anna", pagine=3)
        body.update(extra)
        return api.salva_documento(self.ctx, {}, body)

    def file_su_disco(self):
        out = []
        for d, _, ff in os.walk(self.cartella):
            out += [os.path.join(d, f) for f in ff]
        return out

    # -- salva
    def test_salva_mette_la_stampata_sul_mese_di_scadenza(self):
        st, out, ev = self.salva()
        self.assertEqual(st, 200)
        doc = out["documento"]
        self.assertEqual((doc["tipo"], doc["pagine"], out["mese"]), ("schede", 3, 3))
        self.assertEqual(self.cella(mese=3)["stampata"], 1)
        self.assertEqual(ev["tipo"], "documento")
        self.assertEqual(ev["cella"]["s"], 1)
        self.assertTrue(doc["percorso"].startswith("2026/10-"))
        self.assertEqual(len(self.file_su_disco()), 1)

    def test_mese_indicato_dal_client(self):
        st, out, _ = self.salva(mese=9)
        self.assertEqual(out["mese"], 9)
        self.assertEqual(self.cella(mese=9)["stampata"], 1)
        st, out, _ = self.salva(mese="tredici")
        self.assertEqual(out["mese"], 3)

    def test_registro_non_tocca_la_mappatura(self):
        st, out, ev = self.salva(tipo="registro", mese=3)
        self.assertEqual((out["documento"]["tipo"], out["mese"]), ("registro", 0))
        self.assertIsNone(out["documento"]["mese"])
        self.assertEqual(self.conta("mappature"), 0)
        self.assertNotIn("cella", ev)

    def test_input_rotti(self):
        self.assertEqual(api.salva_documento(self.ctx, {}, {"anno": 2026})[0], 400)
        self.assertEqual(self.salva(anno="abc")[0], 400)
        self.assertEqual(self.salva(pdf="non e' base64!!")[0], 400)
        self.assertEqual(self.salva(pdf=b64(b"GIF89a"))[0], 400)
        self.assertEqual(self.salva(pdf=None)[0], 400)
        self.assertEqual(self.file_su_disco(), [])

    def test_troppo_grande(self):
        with mock.patch.object(api, "MAX_PDF", 10):
            st, out, ev = self.salva()
        self.assertEqual(st, 413)
        self.assertIn("fascicoli", out["errore"])

    def test_service_sconosciuto_non_lascia_il_file(self):
        st, out, ev = self.salva(id_service=999)
        self.assertEqual(st, 404)
        self.assertEqual(self.file_su_disco(), [])
        self.assertEqual(self.conta("documenti"), 0)

    def test_nome_ripulito_niente_percorsi(self):
        for nome in ("../../evil.pdf", "..\\..\\evil", "C:\\Windows\\x.pdf", "a/b:c*?<>|\".pdf",
                     "", "   ", "\n\r"):
            st, out, _ = self.salva(nome=nome)
            self.assertEqual(st, 200, nome)
            n = out["documento"]["nome"]
            self.assertTrue(n.endswith(".pdf"), n)
            for ch in "/\\:*?<>|\"\n\r":
                self.assertNotIn(ch, n)
        for f in self.file_su_disco():
            self.assertTrue(os.path.abspath(f).startswith(os.path.abspath(self.cartella) + os.sep))

    def test_nome_lunghissimo_tagliato(self):
        """Prima un nome di 300 caratteri portava il percorso oltre MAX_PATH e
        open() falliva con un 500."""
        st, out, _ = self.salva(nome="CASA DI RIPOSO " * 30 + ".pdf")
        self.assertEqual(st, 200)
        self.assertLessEqual(len(out["documento"]["nome"]), 124)
        self.assertTrue(out["documento"]["nome"].endswith(".pdf"))
        self.assertEqual(len(self.file_su_disco()), 1)

    def test_pagine_e_fascicoli_strani(self):
        st, out, _ = self.salva(pagine="tante", fascicolo=2, fascicoli=3)
        d = out["documento"]
        self.assertEqual((d["pagine"], d["gruppo"], d["fascicolo"]), (0, None, None))
        st, out, _ = self.salva(gruppo="ABCdef-12;DROP", fascicolo="x", fascicoli=3)
        d = out["documento"]
        self.assertEqual(d["gruppo"], "def12")
        self.assertEqual((d["fascicolo"], d["fascicoli"]), (None, None))

    def test_anteprima_valida_o_niente(self):
        buona = "data:image/jpeg;base64,AAAA"
        self.assertEqual(self.salva(anteprima=buona)[1]["documento"]["anteprima"], buona)
        self.assertIsNone(self.salva(anteprima="javascript:alert(1)")[1]["documento"]["anteprima"])
        self.assertIsNone(self.salva(anteprima="data:image/jpeg;base64," + "A" * 90000)[1]
                          ["documento"]["anteprima"])

    # -- scarica
    def test_scarica(self):
        doc = self.salva()[1]["documento"]
        st, out, _ = api.scarica_documento(self.ctx, {"id": doc["id"]}, {})
        self.assertEqual((st, out["__file__"], out["__inline__"]), (200, PDF, True))
        st, out, _ = api.scarica_documento(self.ctx, {"id": doc["id"], "scarica": "1"}, {})
        self.assertFalse(out["__inline__"])
        self.assertEqual(api.scarica_documento(self.ctx, {"id": "nulla"}, {})[0], 404)
        self.assertEqual(api.scarica_documento(self.ctx, {}, {})[0], 404)

    def test_scarica_file_sparito(self):
        doc = self.salva()[1]["documento"]
        for f in self.file_su_disco():
            os.remove(f)
        st, out, _ = api.scarica_documento(self.ctx, {"id": doc["id"]}, {})
        self.assertEqual(st, 404)

    def test_percorso_manomesso_non_esce_dalla_cartella(self):
        segreto = os.path.join(self.dir, "segreto.txt")
        with open(segreto, "w") as f:
            f.write("non leggere")
        doc = self.salva()[1]["documento"]
        for p in ("../segreto.txt", os.path.abspath(segreto)):
            with db.sess() as c:
                c.execute("UPDATE documenti SET percorso=? WHERE id=?", (p, doc["id"]))
            st, out, _ = api.scarica_documento(self.ctx, {"id": doc["id"]}, {})
            self.assertEqual(st, 404, p)
        # e l'eliminazione non lo cancella
        api.elimina_documento(self.ctx, {}, {"id": doc["id"]})
        self.assertTrue(os.path.exists(segreto))
        doc = self.salva()[1]["documento"]
        with db.sess() as c:
            c.execute("UPDATE documenti SET percorso='../segreto.txt' WHERE id=?", (doc["id"],))
        api.elimina_documenti(self.ctx, {}, {"id_service": 10})
        self.assertTrue(os.path.exists(segreto))

    # -- elimina
    def test_elimina_uno_la_spunta_resta(self):
        doc = self.salva()[1]["documento"]
        st, out, ev = api.elimina_documento(self.ctx, {}, {"id": doc["id"], "operatore": "B"})
        self.assertEqual((st, out["eliminato"]), (200, doc["id"]))
        self.assertEqual(self.file_su_disco(), [])
        self.assertEqual(self.cella(mese=3)["stampata"], 1)
        self.assertEqual(api.elimina_documento(self.ctx, {}, {"id": doc["id"]})[0], 404)

    def test_elimina_in_blocco(self):
        self.servizio(sid=11)
        self.salva()
        self.salva(anno=2025)
        self.salva(id_service=11)
        self.assertEqual(api.elimina_documenti(self.ctx, {}, {"anno": 2026, "id_service": 10})[0], 400)
        self.assertEqual(api.elimina_documenti(self.ctx, {}, {})[0], 400)
        # per anno: solo l'admin
        self.assertEqual(api.elimina_documenti(self.ctx, {}, {"anno": 2025, "operatore": "Anna"})[0], 403)
        st, out, ev = api.elimina_documenti(self.ctx, {}, {"anno": 2025, "operatore": "Capo"})
        self.assertEqual(out["n"], 1)
        self.assertFalse(os.path.exists(os.path.join(self.cartella, "2025")))  # vuota: via
        # per sito: chiunque
        st, out, ev = api.elimina_documenti(self.ctx, {}, {"id_service": "10", "operatore": "Anna"})
        self.assertEqual((out["n"], out["bytes"]), (1, len(PDF)))
        self.assertEqual(ev["ambito"], "id_service")
        self.assertEqual(self.conta("documenti"), 1)
        st, out, ev = api.elimina_documenti(self.ctx, {}, {"id_service": 10})
        self.assertEqual((out["n"], ev), (0, None))

    def test_elenco_per_anno(self):
        self.salva()
        self.salva(anno=2025)
        self.assertEqual(len(api.documenti(self.ctx, {}, {})[1]["documenti"]), 2)
        self.assertEqual(len(api.documenti(self.ctx, {"anno": "2025"}, {})[1]["documenti"]), 1)
        self.assertEqual(len(api.documenti(self.ctx, {"anno": "x"}, {})[1]["documenti"]), 2)
