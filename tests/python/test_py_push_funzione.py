"""push_cloud.py, SEC-04: con `sync_key` si va alla edge function crono-sync, non a PostgREST."""
import json, os, unittest
from unittest import mock

from ._aiuti_py import ConDB
import push_cloud    # noqa: E402


class PushFunzione(ConDB):
    def setUp(self):
        super().setUp()
        self.p = [mock.patch.object(push_cloud, "BASE", self.dir),
                  mock.patch.dict(os.environ, {}, clear=False)]
        for x in self.p:
            x.start()
        for k in ("CRONO_SUPABASE_URL", "CRONO_SUPABASE_SERVICE_KEY", "CRONO_SYNC_KEY"):
            os.environ.pop(k, None)

    def tearDown(self):
        for x in reversed(self.p):
            x.stop()
        super().tearDown()

    def test_sync_key_vince_sulla_service_role(self):
        with open(os.path.join(self.dir, "cloud.json"), "w", encoding="utf-8") as f:
            json.dump({"supabase_url": "https://x.supabase.co/", "service_key": "sr",
                       "sync_key": "dedicata"}, f)
        self.assertEqual(push_cloud._cfg_cloud_via(),
                         ("https://x.supabase.co", "dedicata", "funzione"))

    def test_senza_sync_key_resta_la_vecchia_strada(self):
        with open(os.path.join(self.dir, "cloud.json"), "w", encoding="utf-8") as f:
            json.dump({"supabase_url": "https://x.supabase.co", "service_key": "sr"}, f)
        self.assertEqual(push_cloud._cfg_cloud_via()[2], "service_role")

    def test_manda_alla_funzione_senza_service_role(self):
        risposta = mock.MagicMock()
        risposta.__enter__.return_value.read.return_value = b'{"services": 1}'
        with mock.patch.object(push_cloud.urllib.request, "urlopen",
                               return_value=risposta) as u:
            push_cloud.manda("https://x", "dedicata", [], [{"id_service": 1}], "funzione")
        req = u.call_args[0][0]
        self.assertEqual(req.full_url, "https://x/functions/v1/crono-sync")
        h = {k.lower(): v for k, v in req.header_items()}
        self.assertEqual(h["x-api-key"], "dedicata")
        self.assertNotIn("authorization", h)
        self.assertNotIn("apikey", h)


# Una DPAPI finta e reversibile, per provare lettura e scrittura ovunque
_finta = lambda dati, cifra: bytes(reversed(dati))


class CloudJsonCifrato(ConDB):
    """SEC-04: cloud.json chiuso con la DPAPI, con ripiego in chiaro."""

    def setUp(self):
        super().setUp()
        self.p = [mock.patch.object(push_cloud, "BASE", self.dir),
                  mock.patch.dict(os.environ, {}, clear=False)]
        for x in self.p:
            x.start()
        for k in ("CRONO_SUPABASE_URL", "CRONO_SUPABASE_SERVICE_KEY", "CRONO_SYNC_KEY"):
            os.environ.pop(k, None)

    def tearDown(self):
        for x in reversed(self.p):
            x.stop()
        super().tearDown()

    def scrivi(self, dati):
        self.file = os.path.join(self.dir, "cloud.json")
        with open(self.file, "w", encoding="utf-8") as f:
            json.dump(dati, f)

    def test_cifra_e_rilegge(self):
        self.scrivi({"supabase_url": "https://x.supabase.co", "sync_key": "dedicata"})
        with mock.patch.object(push_cloud, "_dpapi", _finta):
            self.assertTrue(push_cloud.cifra_cloud_json(self.file))
            with open(self.file, encoding="utf-8") as f:
                grezzo = f.read()
            self.assertNotIn("dedicata", grezzo)            # la chiave non si legge piu'
            self.assertIn("https://x.supabase.co", grezzo)  # l'URL si'
            self.assertFalse(push_cloud.cifra_cloud_json(self.file))   # gia' fatto
            self.assertEqual(push_cloud._cfg_cloud_via(),
                             ("https://x.supabase.co", "dedicata", "funzione"))

    def test_in_chiaro_si_legge_ancora(self):
        self.scrivi({"supabase_url": "https://x.supabase.co", "service_key": "sr"})
        with mock.patch.object(push_cloud, "_dpapi", side_effect=AssertionError("non serve")):
            self.assertEqual(push_cloud._cfg_cloud_via()[2], "service_role")

    def test_cifrato_che_non_si_apre(self):
        self.scrivi({"supabase_url": "https://x", "dpapi": "AAAA"})
        with mock.patch.object(push_cloud, "_dpapi", side_effect=OSError("altro utente")):
            with self.assertRaises(RuntimeError) as e:
                push_cloud._cfg_cloud_via()
            self.assertIn("--cifra", str(e.exception))
            # ... ma le variabili d'ambiente bastano da sole
            with mock.patch.dict(os.environ, {"CRONO_SUPABASE_URL": "https://y",
                                              "CRONO_SYNC_KEY": "k"}):
                self.assertEqual(push_cloud._cfg_cloud_via(), ("https://y", "k", "funzione"))

    @unittest.skipUnless(os.name == "nt", "la DPAPI vera c'e' solo su Windows")
    def test_dpapi_vera_andata_e_ritorno(self):
        chiuso = push_cloud._dpapi(b"segreto", True)
        self.assertNotIn(b"segreto", chiuso)
        self.assertEqual(push_cloud._dpapi(chiuso, False), b"segreto")
