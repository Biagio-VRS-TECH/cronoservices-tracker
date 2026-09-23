"""api_documenti: i casi al limite dei PDF (nomi strani, numeri fuori scala,
PDF finti o troncati, anteprime sporche, transazioni che saltano, permessi del
blocco per anno, scritture in parallelo). Tutto su SQLite e cartelle temporanee.
"""
import base64, builtins, os, sqlite3, threading
from unittest import mock

from ._aiuti_py import ConDB, PDF, api, db
import api_documenti  # noqa: E402  (app/ e' nel sys.path grazie a _aiuti_py)


def b64(dati=PDF):
    return base64.b64encode(dati).decode()


def unita_utf16(s):
    return len(s.encode("utf-16-le")) // 2


class Base(ConDB):
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


class Nomi(Base):
    def test_nome_di_caratteri_astrali_non_supera_il_limite_di_ntfs(self):
        """DIFETTO: il taglio a 120 contava i caratteri Python, ma NTFS conta le
        unita' UTF-16 (255 per nome di file). 120 lettere matematiche (due
        unita' l'una) + prefisso + .pdf = 256: open() falliva e il server
        rispondeva 500."""
        st, out, _ = self.salva(nome="\U0001D400" * 200)
        self.assertEqual(st, 200)
        nome = out["documento"]["nome"]
        self.assertTrue(nome.endswith(".pdf"))
        self.assertLessEqual(unita_utf16(nome), 124)
        self.assertEqual(len(self.file_su_disco()), 1)
        # e un surrogato non resta spezzato a meta'
        nome.encode("utf-8")

    def test_nomi_riservati_di_windows_e_punti_finali(self):
        """Sul disco il nome ha sempre davanti "<sid>-<id>-": CON, NUL, COM1 non
        arrivano mai a essere il nome intero del file."""
        for nome in ("CON", "NUL.pdf", "com1", "LPT9.PDF", "aux.", "  prn  ", "x. . .",
                     "..", ".", "...pdf", "nome.pdf.pdf", "Città Ωmega №1 °C"):
            st, out, _ = self.salva(nome=nome)
            self.assertEqual(st, 200, nome)
            doc = out["documento"]
            self.assertTrue(doc["nome"].endswith(".pdf"), doc["nome"])
            self.assertFalse(doc["nome"][:-4].endswith((" ", ".")), doc["nome"])
            st, f, _ = api.scarica_documento(self.ctx, {"id": doc["id"]}, {})
            self.assertEqual((st, f["__file__"]), (200, PDF), nome)
        self.assertEqual(len(self.file_su_disco()), 12)

    def test_nome_non_testo(self):
        for nome in (123, ["a", "b"], {"x": 1}, True):
            st, out, _ = self.salva(nome=nome)
            self.assertEqual(st, 200, nome)
            self.assertTrue(out["documento"]["nome"].endswith(".pdf"))


class NumeriFuoriScala(Base):
    def test_anno_e_service_fuori_intervallo_sono_400_non_500(self):
        """DIFETTO: un anno o un id oltre i 64 bit arrivava a SQLite e alzava
        OverflowError (500); anno=True diventava l'anno 1."""
        for anno in (10 ** 30, -5, 0, True, 1999, 2100, "2026.5"):
            st, out, _ = self.salva(anno=anno)
            self.assertEqual(st, 400, anno)
        for sid in (10 ** 30, -1, 0, True):
            st, out, _ = self.salva(id_service=sid)
            self.assertIn(st, (400, 404), sid)
        self.assertEqual(self.file_su_disco(), [])
        self.assertEqual(self.conta("documenti"), 0)

    def test_pagine_e_fascicoli_enormi_non_rompono_il_salvataggio(self):
        """DIFETTO: pagine=10**30 passava max(0, int(...)) e SQLite alzava
        OverflowError: 500 e PDF perso."""
        st, out, _ = self.salva(pagine=10 ** 30)
        self.assertEqual(st, 200)
        self.assertEqual(out["documento"]["pagine"], 0)
        st, out, _ = self.salva(gruppo="abc", fascicolo=10 ** 30, fascicoli=-3)
        self.assertEqual(st, 200)
        d = out["documento"]
        self.assertEqual((d["fascicolo"], d["fascicoli"]), (None, None))
        st, out, _ = self.salva(gruppo="abc", fascicolo=2, fascicoli=3)
        d = out["documento"]
        self.assertEqual((d["gruppo"], d["fascicolo"], d["fascicoli"]), ("abc", 2, 3))

    def test_operatore_non_testo_o_lunghissimo(self):
        """DIFETTO: un operatore oggetto arrivava all'INSERT (ProgrammingError,
        500); uno di 10 000 caratteri finiva intero in documenti e nel diario."""
        st, out, _ = self.salva(operatore={"nome": "Anna"})
        self.assertEqual(st, 200)
        self.assertIsInstance(out["documento"]["creato_da"], str)
        st, out, _ = self.salva(operatore="  " + "Z" * 10000)
        self.assertEqual(st, 200)
        self.assertEqual(out["documento"]["creato_da"], "Z" * 40)
        with db.sess() as c:
            self.assertLessEqual(max(len(r[0]) for r in c.execute(
                "SELECT operatore FROM eventi")), 40)

    def test_elenco_con_anno_enorme_o_strano(self):
        """DIFETTO: /api/documenti?anno=999...9 arrivava a SQLite (500)."""
        self.salva()
        for a in ("9" * 30, "²", "-1", " 2026", "2026x"):
            st, out, _ = api.documenti(self.ctx, {"anno": a}, {})
            self.assertEqual(st, 200, a)
            self.assertEqual(len(out["documenti"]), 1, a)
        self.assertEqual(len(api.documenti(self.ctx, {"anno": "2025"}, {})[1]["documenti"]), 0)

    def test_blocco_con_numeri_enormi_o_cifre_strane(self):
        """DIFETTO: "²" passava isdigit() e int() alzava ValueError; "9"*30 passava
        e SQLite alzava OverflowError (500)."""
        self.salva()
        for body in ({"anno": "9" * 30, "operatore": "Capo"}, {"anno": "²", "operatore": "Capo"},
                     {"id_service": "9" * 30}, {"id_service": "¹"}):
            st, out, _ = api.elimina_documenti(self.ctx, {}, body)
            self.assertEqual(st, 400, body)
        self.assertEqual(self.conta("documenti"), 1)


class PdfFinti(Base):
    def test_pdf_senza_fine_o_vuoto_rifiutato(self):
        """DIFETTO: bastava che il contenuto cominciasse per %PDF: un invio
        troncato (o quattro byte) diventava un documento archiviato e metteva la
        spunta "stampata"."""
        for dati in (b"%PDF", b"%PDF-1.4\n1 0 obj<<>>endobj\n", PDF[: len(PDF) // 2], b""):
            st, out, _ = self.salva(pdf=b64(dati))
            self.assertEqual(st, 400, dati)
        self.assertEqual(self.file_su_disco(), [])
        self.assertIsNone(self.cella(mese=3))
        # un PDF vero con righe vuote dopo %%EOF resta buono
        st, out, _ = self.salva(pdf=b64(PDF + b"\r\n\r\n"))
        self.assertEqual(st, 200)

    def test_pdf_non_testo(self):
        for pdf in (123, ["JVBERi0="], {"a": 1}, True):
            self.assertEqual(self.salva(pdf=pdf)[0], 400, pdf)


class Anteprime(Base):
    def test_anteprima_con_markup_dopo_il_prefisso(self):
        """DIFETTO: si controllava solo il prefisso: "data:image/jpeg;base64,"
        seguito da virgolette e HTML finiva nel database e nel bootstrap di tutti
        (il client la escapa dalla 34a sessione, il server no)."""
        for sporca in ('data:image/jpeg;base64,"><img src=x onerror=alert(1)>',
                       "data:image/jpeg;base64,AAAA\" onload=\"x",
                       "data:image/jpeg;base64,",
                       "data:image/jpeg;base64,AA AA",
                       ["data:image/jpeg;base64,AAAA"]):
            st, out, _ = self.salva(anteprima=sporca)
            self.assertEqual(st, 200)
            self.assertIsNone(out["documento"]["anteprima"], sporca)
        buona = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQ=="
        self.assertEqual(self.salva(anteprima=buona)[1]["documento"]["anteprima"], buona)


class Transazioni(Base):
    def test_begin_che_fallisce_non_lascia_il_file_ne_maschera_l_errore(self):
        """DIFETTO: se BEGIN IMMEDIATE falliva (archivio bloccato da un altro
        processo) l'except faceva ROLLBACK senza transazione aperta: quel
        secondo errore copriva il primo (500 invece del 503 "riprova") e il
        file appena scritto restava orfano sul disco."""
        vera = db.connect

        class Bloccata:
            def __init__(self):
                self.c = vera()

            def execute(self, sql, *a):
                if sql.startswith("BEGIN"):
                    raise sqlite3.OperationalError("database is locked")
                return self.c.execute(sql, *a)

            def __getattr__(self, k):
                return getattr(self.c, k)

        with mock.patch.object(api_documenti.db, "connect", Bloccata):
            with self.assertRaises(sqlite3.OperationalError) as e:
                self.salva()
        self.assertIn("locked", str(e.exception))
        self.assertEqual(self.file_su_disco(), [])
        self.assertEqual(self.conta("documenti"), 0)

    def test_errore_dopo_l_insert_annulla_riga_spunta_e_file(self):
        with mock.patch.object(api_documenti, "_applica",
                               side_effect=RuntimeError("guasto a meta'")):
            with self.assertRaises(RuntimeError):
                self.salva()
        self.assertEqual(self.file_su_disco(), [])
        self.assertEqual((self.conta("documenti"), self.conta("mappature")), (0, 0))
        # e la connessione non e' rimasta con una transazione aperta: si scrive
        self.assertEqual(self.salva()[0], 200)

    def test_scrittura_del_file_interrotta_non_lascia_mezzo_pdf(self):
        """DIFETTO: se il disco si riempiva a meta' della scrittura restava un
        PDF troncato in data/documenti/, senza riga che lo ritrovasse."""
        vera = builtins.open

        class Pieno:
            def __init__(self, fh):
                self.fh = fh

            def __enter__(self):
                return self

            def __exit__(self, *a):
                self.fh.close()

            def write(self, dati):
                self.fh.write(dati[:5])
                raise OSError(28, "No space left on device")

        def finto_open(p, modo="r", *a, **k):
            fh = vera(p, modo, *a, **k)
            return Pieno(fh) if "w" in modo else fh

        with mock.patch("builtins.open", finto_open):
            with self.assertRaises(OSError):
                self.salva()
        self.assertEqual(self.file_su_disco(), [])
        self.assertEqual(self.conta("documenti"), 0)


class PermessiDelBlocco(Base):
    def test_per_anno_admin_di_ruolo_si_approvatore_no(self):
        self.ruolo("Bruno", "admin")
        self.ruolo("Vera", "approvatore")
        self.salva()
        for chi in ("Vera", "Anna", "", None, 12, {"x": 1}):
            st, out, _ = api.elimina_documenti(self.ctx, {}, {"anno": 2026, "operatore": chi})
            self.assertEqual(st, 403, chi)
        self.assertEqual(self.conta("documenti"), 1)
        st, out, ev = api.elimina_documenti(self.ctx, {}, {"anno": 2026, "operatore": "Bruno"})
        self.assertEqual((st, out["n"], ev["operatore"]), (200, 1, "Bruno"))

    def test_per_anno_vuole_il_pin(self):
        self.cfg["pin_admin"] = "4321"
        api._PIN_ERRORI.update(n=0, fino=0.0)
        self.addCleanup(api._PIN_ERRORI.update, n=0, fino=0.0)
        self.salva()
        st, out, _ = api.elimina_documenti(self.ctx, {}, {"anno": 2026, "operatore": "Capo"})
        self.assertEqual((st, out.get("pin_richiesto")), (403, True))
        self.assertEqual(self.conta("documenti"), 1)
        self.assertEqual(len(self.file_su_disco()), 1)
        st, out, _ = api.elimina_documenti(self.ctx, {}, {"anno": 2026, "operatore": "Capo",
                                                          "pin": "4321"})
        self.assertEqual((st, out["n"]), (200, 1))
        # per sito il PIN non serve: e' il potere che ognuno ha gia' sul singolo
        self.salva()
        st, out, _ = api.elimina_documenti(self.ctx, {}, {"id_service": 10, "operatore": "Anna"})
        self.assertEqual((st, out["n"]), (200, 1))


class Ids(Base):
    def test_id_inesistenti_o_strani(self):
        for q in ({"id": ""}, {"id": "../../x"}, {"id": "' OR 1=1 --"}, {"id": "x" * 5000}):
            self.assertEqual(api.scarica_documento(self.ctx, q, {})[0], 404, q)
        self.salva()
        for body in ({}, {"id": None}, {"id": 0}, {"id": ["a"]}, {"id": "' OR 1=1 --"}):
            self.assertEqual(api.elimina_documento(self.ctx, {}, body)[0], 404, body)
        self.assertEqual(self.conta("documenti"), 1)

    def test_scarica_percorso_vuoto_o_cartella(self):
        doc = self.salva()[1]["documento"]
        for p in ("", ".", "2026", "2026/"):
            with db.sess() as c:
                c.execute("UPDATE documenti SET percorso=? WHERE id=?", (p, doc["id"]))
            self.assertEqual(api.scarica_documento(self.ctx, {"id": doc["id"]}, {})[0], 404, p)


class Tetto(Base):
    def test_tetto_al_byte(self):
        with mock.patch.object(api_documenti, "MAX_PDF", len(PDF)):
            self.assertEqual(self.salva()[0], 200)
        with mock.patch.object(api_documenti, "MAX_PDF", len(PDF) - 1):
            st, out, _ = self.salva()
        self.assertEqual(st, 413)
        self.assertEqual(len(self.file_su_disco()), 1)


class Concorrenza(Base):
    def test_cartella_dell_anno_tolta_da_una_pulizia_in_blocco(self):
        """DIFETTO: elimina_documenti toglie le cartelle rimaste vuote FUORI dal
        lucchetto; se lo faceva fra il makedirs e l'open di un salvataggio in
        corso, open() alzava FileNotFoundError (500) e il PDF si perdeva."""
        vero = os.makedirs
        tolte = []

        def makedirs_poi_pulizia(p, *a, **k):
            vero(p, *a, **k)
            if os.path.basename(p) == "2026" and not tolte:
                os.rmdir(p)             # la pulizia dell'altro thread arriva qui
                tolte.append(p)

        with mock.patch.object(api_documenti.os, "makedirs", makedirs_poi_pulizia):
            st, out, _ = self.salva()
        self.assertEqual(tolte and st, 200)
        self.assertEqual(len(self.file_su_disco()), 1)
        st, f, _ = api.scarica_documento(self.ctx, {"id": out["documento"]["id"]}, {})
        self.assertEqual((st, f["__file__"]), (200, PDF))

    def test_salvataggi_ed_eliminazioni_in_parallelo(self):
        self.servizio(sid=11)
        errori, ids = [], []

        def salva(i):
            try:
                st, out, _ = self.salva(id_service=10 + i % 2, nome="doc %d" % i, mese=3 + i % 2)
                if st != 200:
                    errori.append(st)
                else:
                    ids.append(out["documento"]["id"])
            except Exception as e:      # noqa: BLE001
                errori.append(e)

        th = [threading.Thread(target=salva, args=(i,)) for i in range(12)]
        for t in th:
            t.start()
        for t in th:
            t.join()
        self.assertEqual(errori, [])
        self.assertEqual((self.conta("documenti"), len(self.file_su_disco())), (12, 12))
        self.assertEqual(self.cella(mese=3)["stampata"], 1)

        def elimina(doc_id):
            try:
                api.elimina_documento(self.ctx, {}, {"id": doc_id})
            except Exception as e:      # noqa: BLE001
                errori.append(e)

        th = [threading.Thread(target=elimina, args=(d,)) for d in ids + ids]
        for t in th:
            t.start()
        for t in th:
            t.join()
        self.assertEqual(errori, [])
        self.assertEqual((self.conta("documenti"), self.file_su_disco()), (0, []))
