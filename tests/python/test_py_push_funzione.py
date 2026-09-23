"""push_cloud.py, SEC-04: con `sync_key` si va alla edge function crono-sync, non a PostgREST."""
import json, os
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
