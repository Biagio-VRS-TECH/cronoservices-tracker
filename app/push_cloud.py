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
      python push_cloud.py --cifra    (cifra app/cloud.json con la DPAPI, SEC-04)

Credenziali: app/cloud.json  oppure  le variabili d'ambiente.
  * DA PREFERIRE (SEC-04): `sync_key` / CRONO_SYNC_KEY, la chiave DEDICATA
    (pl_secrets.crono_sync_key). Si manda alla edge function `crono-sync`, che
    esegue sync_applica e nient'altro: chi copia cloud.json puo' al massimo
    rimandare l'anagrafica, non leggere o cancellare il database.
  * Vecchia strada, solo finche' la funzione non e' distribuita: `service_key` /
    CRONO_SUPABASE_SERVICE_KEY, la `service_role`, che salta l'RLS su TUTTO il
    progetto (Planning compreso). Quando `sync_key` funziona, va tolta da qui.
  L'URL: `supabase_url` / CRONO_SUPABASE_URL.

cloud.json CIFRATO (SEC-04): `python push_cloud.py --cifra` riscrive cloud.json
con le chiavi chiuse dalla DPAPI di Windows, legate all'utente e al PC che la
lancia (lo stesso che fa girare l'operazione pianificata):
    { "supabase_url": "https://...", "dpapi": "<base64>" }
Copiato su un altro computer, o aperto da un altro utente, il file non dice
niente. Il cloud.json in chiaro di prima si legge ancora (ripiego), e le
variabili d'ambiente valgono sempre, anche se il cifrato non si apre.
"""
import base64, datetime, json, os, sys, time, urllib.error, urllib.request

import sync                      # estrai() + i normalizzatori, gia' collaudati

BASE = os.path.dirname(os.path.abspath(__file__))
LOG = os.path.join(BASE, "..", "data", "push_cloud.log")
TIMEOUT = 180
# Secondi di attesa prima di ogni ritentativo di manda(): 3 tentativi in
# tutto. Le prove li azzerano.
ATTESE = (15, 60)


def _cfg_cloud():
    """(url, chiave). Per sapere anche DOVE mandarla: _cfg_cloud_via()."""
    return _cfg_cloud_via()[:2]


# ---------------------------------------------- SEC-04: la DPAPI di Windows --
# Niente dipendenze (niente pywin32): crypt32 via ctypes. Ambito: l'utente
# corrente, con un'entropia fissa che lega il segreto a questo programma.
DPAPI_ENTROPIA = b"CronoService/cloud.json"
_SENZA_FINESTRE = 0x1            # CRYPTPROTECT_UI_FORBIDDEN: gira senza nessuno davanti


def _dpapi(dati, cifra):
    """bytes -> bytes, cifrati (cifra=True) o in chiaro. Solo Windows."""
    if os.name != "nt":
        raise RuntimeError("cloud.json cifrato: si apre solo su Windows (DPAPI)")
    import ctypes
    from ctypes import wintypes

    class BLOB(ctypes.Structure):
        _fields_ = [("cbData", wintypes.DWORD), ("pbData", ctypes.POINTER(ctypes.c_char))]

    crypt32 = ctypes.WinDLL("crypt32", use_last_error=True)
    kernel32 = ctypes.WinDLL("kernel32", use_last_error=True)
    fn = crypt32.CryptProtectData if cifra else crypt32.CryptUnprotectData
    fn.argtypes = [ctypes.POINTER(BLOB), ctypes.c_void_p, ctypes.POINTER(BLOB),
                   ctypes.c_void_p, ctypes.c_void_p, wintypes.DWORD, ctypes.POINTER(BLOB)]
    fn.restype = wintypes.BOOL
    kernel32.LocalFree.argtypes = [ctypes.c_void_p]
    kernel32.LocalFree.restype = ctypes.c_void_p

    def blob(b):
        buf = ctypes.create_string_buffer(b, len(b))
        return BLOB(len(b), ctypes.cast(buf, ctypes.POINTER(ctypes.c_char))), buf

    ingresso, _tieni1 = blob(dati)
    entropia, _tieni2 = blob(DPAPI_ENTROPIA)
    uscita = BLOB()
    if not fn(ctypes.byref(ingresso), None, ctypes.byref(entropia), None, None,
              _SENZA_FINESTRE, ctypes.byref(uscita)):
        raise RuntimeError("DPAPI: %s" % ctypes.WinError(ctypes.get_last_error()))
    try:
        return ctypes.string_at(uscita.pbData, uscita.cbData)
    finally:
        kernel32.LocalFree(ctypes.cast(uscita.pbData, ctypes.c_void_p))


def leggi_cloud_json(p):
    """Il contenuto di cloud.json come dizionario: in chiaro com'era, oppure
    con la parte `dpapi` aperta e fusa con i campi in chiaro (il cifrato vince).
    Un cifrato che non si apre (altro PC, altro utente) e' un RuntimeError che
    dice cosa fare."""
    if not os.path.exists(p):
        return {}
    with open(p, encoding="utf-8") as f:
        c = json.load(f)
    if not isinstance(c, dict):
        raise RuntimeError("app/cloud.json non e' un oggetto JSON")
    if not c.get("dpapi"):
        return c
    try:
        chiaro = json.loads(_dpapi(base64.b64decode(c["dpapi"]), False).decode("utf-8"))
    except (OSError, ValueError, RuntimeError) as e:
        raise RuntimeError(
            "app/cloud.json e' cifrato per un altro utente o un altro PC e qui non "
            "si apre (%s). Rifallo in chiaro su questo PC e lancia "
            "`python app/push_cloud.py --cifra`." % e)
    fuori = {k: v for k, v in c.items() if k != "dpapi"}
    return {**fuori, **(chiaro if isinstance(chiaro, dict) else {})}


def cifra_cloud_json(p):
    """Riscrive cloud.json con le chiavi cifrate (resta in chiaro solo
    l'URL, che non e' un segreto). Prima di sostituire il file controlla che il
    cifrato si riapra: un file che non si legge piu' fermerebbe la sincronia.
    Ritorna False se era gia' cifrato."""
    with open(p, encoding="utf-8") as f:
        c = json.load(f)
    if not isinstance(c, dict):
        raise RuntimeError("app/cloud.json non e' un oggetto JSON")
    if c.get("dpapi"):
        return False
    segreti = {k: v for k, v in c.items() if k != "supabase_url"}
    if not segreti:
        raise RuntimeError("app/cloud.json non ha chiavi da cifrare")
    chiuso = _dpapi(json.dumps(segreti, ensure_ascii=False).encode("utf-8"), True)
    nuovo = {"supabase_url": c.get("supabase_url", ""),
             "dpapi": base64.b64encode(chiuso).decode("ascii")}
    if json.loads(_dpapi(base64.b64decode(nuovo["dpapi"]), False).decode("utf-8")) != segreti:
        raise RuntimeError("DPAPI: il cifrato non si riapre uguale, cloud.json non toccato")
    tmp = p + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(nuovo, f, ensure_ascii=False, indent=2)
    os.replace(tmp, p)
    return True


def _cfg_cloud_via():
    """(url, chiave, via): via = "funzione" (sync_key -> crono-sync) oppure
    "service_role" (la vecchia strada, rpc/sync_applica)."""
    p = os.path.join(BASE, "cloud.json")
    try:
        c = leggi_cloud_json(p)
    except RuntimeError:
        # le variabili d'ambiente bastano da sole: il file cifrato non serve
        if os.environ.get("CRONO_SUPABASE_URL") and (
                os.environ.get("CRONO_SYNC_KEY") or os.environ.get("CRONO_SUPABASE_SERVICE_KEY")):
            c = {}
        else:
            raise
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
    # Tutta l'anagrafica in UN corpo: sync_applica e' una transazione, a lotti
    # un errore a meta' lascerebbe online mezzo aggiornamento.
    # Ritentativi solo sui guasti passeggeri (rete, timeout, 5xx), e pochi:
    # l'operazione pianificata gira una volta al giorno e prima un attimo di
    # rete giu' alle 08:15 faceva saltare il giorno. sync_applica rifatto con
    # gli stessi dati non cambia niente, quindi ripetere e' sicuro. Un 4xx e'
    # un rifiuto (chiave, formato): ripetere non serve.
    for tentativo in range(len(ATTESE) + 1):
        try:
            with urllib.request.urlopen(req, timeout=TIMEOUT) as r:
                grezzo = r.read().decode("utf-8", "replace")
            break
        except urllib.error.HTTPError as e:
            try:
                corpo = e.read().decode("utf-8", "replace")[:800]
            finally:
                e.close()             # la connessione non resta aperta fino al GC
            errore = RuntimeError("Supabase ha risposto %d: %s" % (e.code, corpo))
            if e.code < 500:
                raise _senza_chiave(errore, key)
        except (urllib.error.URLError, OSError) as e:      # rete, DNS, timeout
            errore = RuntimeError("Supabase non raggiungibile: %s" % e)
        if tentativo < len(ATTESE):
            time.sleep(ATTESE[tentativo])
    else:
        raise _senza_chiave(RuntimeError("%s (dopo %d tentativi)"
                                         % (errore, len(ATTESE) + 1)), key)
    try:
        out = json.loads(grezzo)
    except ValueError:
        out = None
    if not isinstance(out, dict):
        # un proxy o un portale che risponde 200 con una pagina: prima il log
        # diceva solo "Expecting value: line 1 column 1"
        raise _senza_chiave(RuntimeError("la risposta di Supabase non e' JSON atteso: %s"
                                         % grezzo[:200].replace("\n", " ")), key)
    return out


def _senza_chiave(e, key):
    """Il messaggio finisce in data/push_cloud.log: la chiave non ci va mai,
    nemmeno se un server la ripete nella sua risposta d'errore."""
    testo = str(e)
    if key and key in testo:
        return RuntimeError(testo.replace(key, "***"))
    return e


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
    if "--cifra" in sys.argv:
        p = os.path.join(BASE, "cloud.json")
        if not os.path.exists(p):
            raise RuntimeError("manca app/cloud.json: crealo in chiaro, poi --cifra")
        print("cloud.json cifrato con la DPAPI di questo utente."
              if cifra_cloud_json(p) else "cloud.json era gia' cifrato: niente da fare.")
        return 0
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
