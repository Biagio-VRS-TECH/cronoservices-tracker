"""Access -> Supabase: il travaso che gira da solo. #ANCHOR: push-cloud

Perche' esiste: `CronoServices_be.accdb` sta sul PC dell'ufficio e si legge solo
da Windows con ADODB. Netlify e Supabase non possono andare a prenderlo, quindi
la sincronia non si puo' TIRARE dal cloud: va SPINTA da qui. Questo script e' il
lato "spinta", ed e' l'unica cosa che resta installata sul PC.

Catena, la stessa di sync.py fino a meta' strada:
    export_access.ps1 (ADODB, sola lettura) -> JSON -> qui -> rpc/sync_applica

Il diff (nuovi / chiusi / mesi cambiati / spunte orfane) e la riga di sync_log
li fa Postgres dentro `sync_applica`, in una transazione sola: o entra tutta
l'anagrafica o non entra niente, e nessuno vede mezzo aggiornamento.

Va in una direzione sola. Le spunte NON tornano indietro: da quando si e' online
il padrone delle spunte e' Supabase, e questo script non le tocca mai.

Uso:  python push_cloud.py            (lo chiama cloud/sync-cloud.cmd)
      python push_cloud.py --prova    (legge Access e dice cosa manderebbe)

Credenziali: app/cloud.json  oppure  le variabili d'ambiente.
  * DA PREFERIRE (SEC-04): `sync_key` / CRONO_SYNC_KEY, la chiave DEDICATA
    (pl_secrets.crono_sync_key). Si manda alla edge function `crono-sync`, che
    esegue sync_applica e nient'altro: chi copia cloud.json puo' al massimo
    rimandare l'anagrafica, non leggere o cancellare il database.
  * Vecchia strada, solo finche' la funzione non e' distribuita: `service_key` /
    CRONO_SUPABASE_SERVICE_KEY, la `service_role`, che salta l'RLS su TUTTO il
    progetto (Planning compreso). Quando `sync_key` funziona, va tolta da qui.
  L'URL: `supabase_url` / CRONO_SUPABASE_URL.
"""
import datetime, json, os, sys, urllib.error, urllib.request

import sync                      # estrai() + i normalizzatori, gia' collaudati

BASE = os.path.dirname(os.path.abspath(__file__))
LOG = os.path.join(BASE, "..", "data", "push_cloud.log")
TIMEOUT = 180


def _cfg_cloud():
    """(url, chiave). Per sapere anche DOVE mandarla: _cfg_cloud_via()."""
    return _cfg_cloud_via()[:2]


def _cfg_cloud_via():
    """(url, chiave, via): via = "funzione" (sync_key -> crono-sync) oppure
    "service_role" (la vecchia strada, rpc/sync_applica)."""
    p = os.path.join(BASE, "cloud.json")
    c = {}
    if os.path.exists(p):
        with open(p, encoding="utf-8") as f:
            c = json.load(f)
    url = (os.environ.get("CRONO_SUPABASE_URL") or c.get("supabase_url") or "").rstrip("/")
    sync_key = os.environ.get("CRONO_SYNC_KEY") or c.get("sync_key") or ""
    key = os.environ.get("CRONO_SUPABASE_SERVICE_KEY") or c.get("service_key") or ""
    if url and sync_key:
        return url, sync_key, "funzione"
    if not url or not key:
        raise RuntimeError(
            "Credenziali Supabase mancanti. Crea app/cloud.json cosi':\n"
            '{ "supabase_url": "https://xxxx.supabase.co", "sync_key": "..." }\n'
            "(sync_key = pl_secrets.crono_sync_key, vedi cloud/LEGGIMI.md)")
    return url, key, "service_role"


def righe(payload):
    """Payload dell'export -> le due liste, con i nomi di colonna di Postgres.

    Le regole sono quelle di sync.esegui e non vanno reinventate: la bitmask dei
    mesi in ordine Gen..Dic, lo stato in maiuscolo, e solo i clienti che hanno
    almeno un service (gli altri 8000 dell'anagrafica qui non servono).
    Le regole stanno in sync.normalizza, lo stesso codice del sync locale: una
    copia qui era gia' il secondo posto da tenere allineato a mano."""
    return sync.normalizza(payload)


def manda(url, key, cli, servs, via="service_role"):
    corpo = json.dumps({"p_clienti": cli, "p_services": servs},
                       ensure_ascii=False).encode("utf-8")
    if via == "funzione":
        # SEC-04: la chiave dedicata va solo alla edge function crono-sync
        req = urllib.request.Request(
            url + "/functions/v1/crono-sync", data=corpo, method="POST",
            headers={"Content-Type": "application/json",
                     "x-api-key": key,
                     "Accept": "application/json"})
    else:
        req = urllib.request.Request(
            url + "/rest/v1/rpc/sync_applica", data=corpo, method="POST",
            headers={"Content-Type": "application/json",
                     "apikey": key,
                     "Authorization": "Bearer " + key,
                     "Accept": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT) as r:
            return json.loads(r.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        raise RuntimeError("Supabase ha risposto %d: %s"
                           % (e.code, e.read().decode("utf-8", "replace")[:800]))


def annota(testo):
    """Una riga per esecuzione. L'operazione pianificata gira senza nessuno che
    guarda: se non lascia traccia qui, un fallimento passa inosservato."""
    try:
        os.makedirs(os.path.dirname(os.path.abspath(LOG)), exist_ok=True)
        with open(LOG, "a", encoding="utf-8") as f:
            f.write("%s  %s\n" % (datetime.datetime.now().replace(microsecond=0)
                                  .isoformat(), testo))
    except OSError:
        pass


def main():
    prova = "--prova" in sys.argv
    with open(os.path.join(BASE, "config.json"), encoding="utf-8") as f:
        cfg = json.load(f)

    payload = sync.estrai(cfg, BASE)
    cli, servs = righe(payload)
    if not servs:
        raise RuntimeError("Access non ha restituito nessun service: non mando niente.")

    if prova:
        print(json.dumps({"clienti": len(cli), "services": len(servs),
                          "primo_service": servs[0],
                          "primo_cliente": cli[0] if cli else None},
                         ensure_ascii=False, indent=2))
        return 0

    url, key, via = _cfg_cloud_via()
    r = manda(url, key, cli, servs, via)
    riass = ("ok  %(services)s service, %(clienti)s clienti"
             ", %(nuovi)s nuovi, %(chiusi)s chiusi, %(riaperti)s riaperti"
             ", %(mesi_cambiati)s con mesi cambiati, %(archiviati)s archiviati"
             ", %(spunte_orfane)s spunte orfane" % r)
    annota(riass)
    print(riass)
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as e:                       # noqa: BLE001 - va scritto e basta
        annota("ERRORE  " + str(e).replace("\n", " | ")[:600])
        print("ERRORE:", e, file=sys.stderr)
        sys.exit(1)
