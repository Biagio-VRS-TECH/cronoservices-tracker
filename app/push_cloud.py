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

Credenziali: app/cloud.json  oppure  le variabili d'ambiente
CRONO_SUPABASE_URL / CRONO_SUPABASE_SERVICE_KEY. La chiave e' la `service_role`:
salta l'RLS, quindi NON deve mai finire nel browser ne' su Netlify. Vive solo su
questo PC.
"""
import datetime, json, os, sys, urllib.error, urllib.request

import sync                      # estrai() + i normalizzatori, gia' collaudati

BASE = os.path.dirname(os.path.abspath(__file__))
LOG = os.path.join(BASE, "..", "data", "push_cloud.log")
TIMEOUT = 180


def _cfg_cloud():
    p = os.path.join(BASE, "cloud.json")
    c = {}
    if os.path.exists(p):
        with open(p, encoding="utf-8") as f:
            c = json.load(f)
    url = (os.environ.get("CRONO_SUPABASE_URL") or c.get("supabase_url") or "").rstrip("/")
    key = os.environ.get("CRONO_SUPABASE_SERVICE_KEY") or c.get("service_key") or ""
    if not url or not key:
        raise RuntimeError(
            "Credenziali Supabase mancanti. Crea app/cloud.json cosi':\n"
            '{ "supabase_url": "https://xxxx.supabase.co", "service_key": "eyJ..." }')
    return url, key


def righe(payload):
    """Payload dell'export -> le due liste, con i nomi di colonna di Postgres.

    Le regole sono quelle di sync.esegui e non vanno reinventate: la bitmask dei
    mesi in ordine Gen..Dic, lo stato in maiuscolo, e solo i clienti che hanno
    almeno un service (gli altri 8000 dell'anagrafica qui non servono)."""
    servs, usati = [], set()
    for raw in payload["services"]:
        s = sync._row(raw)
        sid = sync._int(s.get("idservice"))
        if sid is None:
            continue
        cid = sync._int(s.get("idcliente")) or 0
        servs.append({
            "id_service": sid,
            "id_cliente": cid,
            "tipo": sync._txt(s.get("tipo")),
            "stato": (s.get("stato") or "").strip().upper(),
            "destinazione": sync._txt(s.get("destinazione")),
            "localita": sync._txt(s.get("localita")),
            "provincia": sync._txt(s.get("provincia")),
            "mappatura": sync._si(s.get("mappatura")),
            "subappalto": sync._si(s.get("subappalto")),
            "n_contratto": sync._txt(s.get("ncontratto")),
            "data_inizio": sync._txt(s.get("datainizio")),
            "data_scadenza": sync._txt(s.get("datascadenza")),
            "cadenza": sync._txt(s.get("cadenza")),
            "qva": sync._int(s.get("qva")),
            "causale_rinnovo": sync._txt(s.get("causalerinnovo")),
            "rinnovo_auto": sync._si(s.get("rinnovoautomatico")),
            "mesi": "".join("1" if sync._si(s.get(sync._norm(m))) else "0"
                            for m in sync.ACCESS_MESI),
            "note": sync._txt(s.get("note")),
        })
        usati.add(cid)

    cli = []
    for raw in payload["clienti"]:
        k = sync._row(raw)
        cid = sync._int(k.get("idcliente"))
        if cid is None or cid not in usati:
            continue
        cli.append({
            "id_cliente": cid,
            "rag_soc": (k.get("ragsoc") or "").strip(),
            "indirizzo": sync._txt(k.get("indirizzo")),
            "cap": sync._txt(k.get("cap")),
            "citta": sync._txt(k.get("citta")),
            "provincia": sync._txt(k.get("provincia")),
            "telefono": sync._txt(k.get("telefono")),
            "email": sync._txt(k.get("email")),
            "non_utilizzabile": sync._si(k.get("nonutilizzabile")),
        })
    return cli, servs


def manda(url, key, cli, servs):
    corpo = json.dumps({"p_clienti": cli, "p_services": servs},
                       ensure_ascii=False).encode("utf-8")
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
                          "primo_service": servs[0], "primo_cliente": cli[0]},
                         ensure_ascii=False, indent=2))
        return 0

    url, key = _cfg_cloud()
    r = manda(url, key, cli, servs)
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
