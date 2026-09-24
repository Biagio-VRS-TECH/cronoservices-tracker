"""Scoperta di altri server Crono nella rete locale. #ANCHOR: scoperta

PERCHE' ESISTE
Il rischio piu' probabile quando si lavora in piu' computer non e' un conflitto
di scrittura: e' che ognuno faccia doppio clic su avvia.bat sul PROPRIO PC. Si
ritroverebbero due archivi separati che divergono in silenzio per settimane, e le
spunte di uno non esisterebbero per l'altro. Nessun lock e nessun merge puo'
rimediare a posteriori: va impedito che passi inosservato.

COME
Un piccolo scambio UDP in broadcast sulla porta di annuncio:
  - chi parte manda "CRONO?" a tutta la rete e ascolta 1,2 s;
  - ogni server in ascolto risponde "CRONO! <host> <url>";
  - se risponde qualcuno che non e' questo PC, il server lo scrive in console e
    lo espone nel bootstrap: l'interfaccia mostra una fascia rossa a TUTTI.

La domanda porta anche nome e indirizzo di chi chiede ("CRONO? <host> <url>"):
il risponditore del server partito PER PRIMO se lo segna, cosi' la fascia rossa
la vedono anche i suoi utenti e non solo quelli del secondo. Un server vecchio
che manda solo "CRONO?" riceve la risposta e basta.

Quello che arriva dalla rete e' di chiunque: l'URL finisce in un <a href> e il
nome nella fascia, quindi si accettano solo http(s) e caratteri stampabili.

Se il firewall blocca il broadcast non si scopre nulla e si torna al
comportamento di prima: e' un avviso in piu', non una dipendenza.
"""
import re, socket, threading, time

PORTA_ANNUNCIO = 8771
DOMANDA = b"CRONO?"
RISPOSTA = b"CRONO!"
# Dove va la domanda (le prove la mandano a 127.0.0.1)
DESTINAZIONI = ("255.255.255.255", "<broadcast>")

# Popolato dalla scoperta: [{"host":..., "url":..., "ip":...}]
ALTRI = []
_ALTRI_LOCK = threading.Lock()
MAX_ALTRI = 16
_URL_OK = re.compile(r"^https?://(\[[0-9A-Fa-f:.]+\]|[A-Za-z0-9.\-]+)(:\d{1,5})?"
                     r"(/[A-Za-z0-9._~/\-]*)?$")


def _url_valido(url):
    return bool(url) and len(url) <= 200 and bool(_URL_OK.match(url))


def _voce(ip, host, url):
    """La riga di ALTRI, ripulita: un URL che non e' http(s) diventa quello
    dell'IP da cui e' arrivata la risposta (l'avviso resta, il javascript: no)."""
    host = "".join(ch for ch in (host or "") if ch.isprintable()
                   and ch not in "<>\"'`")[:64].strip()
    return {"ip": ip, "host": host or ip,
            "url": url if _url_valido(url) else "http://%s:8770" % ip}


def _aggiungi(voce):
    with _ALTRI_LOCK:
        if len(ALTRI) >= MAX_ALTRI or any(a["ip"] == voce["ip"] for a in ALTRI):
            return False
        ALTRI.append(voce)
        return True


def _segna_chi_chiede(dati, ip, mio_nome, mio_url):
    """Un altro server che parte e chiede "CRONO? <host> <url>": si segna."""
    pezzi = dati.decode("utf-8", "replace").split(" ", 2)
    if len(pezzi) < 3:
        return                     # versione vecchia: non dice chi e'
    host, url = pezzi[1], pezzi[2].strip()
    if not _url_valido(url) or url == mio_url or host == mio_nome or ip in _ip_locali():
        return
    _aggiungi(_voce(ip, host, url))


def _ip_locali():
    ip = {"127.0.0.1"}
    try:
        for r in socket.getaddrinfo(socket.gethostname(), None, socket.AF_INET):
            ip.add(r[4][0])
    except OSError:
        pass
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(("10.255.255.255", 1))
        ip.add(s.getsockname()[0])
    except OSError:
        pass
    finally:
        s.close()
    return ip


def avvia_risponditore(mio_url, porta=PORTA_ANNUNCIO):
    """Thread che risponde a chi cerca altri server. Non fallisce mai in modo
    fatale: se la porta e' occupata, si rinuncia silenziosamente."""
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        s.bind(("", porta))
    except OSError:
        s.close()          # non resta un socket aperto a vuoto
        return None

    nome = socket.gethostname()

    def ciclo():
        while True:
            try:
                dati, mitt = s.recvfrom(512)
            except ConnectionResetError:
                # Windows (WinError 10054): una nostra risposta e' tornata
                # indietro come "porta irraggiungibile" perche' chi chiedeva ha
                # gia' chiuso. Non e' un guasto del socket: prima il thread
                # usciva e questo server non rispondeva piu' a nessuno.
                continue
            except OSError:
                if s.fileno() == -1:
                    return             # chiuso: fine del thread
                # Il socket e' vivo: WinError 10040 (datagramma oltre i 512
                # byte, lo manda qualunque apparecchio in rete) e simili.
                # Prima il thread usciva anche qui.
                time.sleep(0.01)
                continue
            if dati.startswith(DOMANDA):
                try:
                    s.sendto(b"%s %s %s" % (RISPOSTA, nome.encode(), mio_url.encode()),
                             mitt)
                except OSError:
                    pass
                _segna_chi_chiede(dati, mitt[0], nome, mio_url)

    t = threading.Thread(target=ciclo, daemon=True)
    t.start()
    return s


def cerca_altri(porta=PORTA_ANNUNCIO, attesa=1.2, mio_url=None):
    """Manda la domanda in broadcast e raccoglie le risposte. Ritorna ALTRI.
    Con `mio_url` la domanda dice anche chi siamo (vedi _segna_chi_chiede)."""
    with _ALTRI_LOCK:
        del ALTRI[:]
    miei = _ip_locali()
    domanda = DOMANDA
    if mio_url:
        domanda = b"%s %s %s" % (DOMANDA, socket.gethostname().encode("utf-8", "replace"),
                                 mio_url.encode("utf-8", "replace"))
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    s.setsockopt(socket.SOL_SOCKET, socket.SO_BROADCAST, 1)
    s.settimeout(0.3)
    try:
        for dest in DESTINAZIONI:
            try:
                s.sendto(domanda, (dest, porta))
            except OSError:
                pass
        fine = time.time() + attesa
        while time.time() < fine:
            try:
                dati, mitt = s.recvfrom(512)
            except (socket.timeout, ConnectionResetError):
                continue            # 10054 su Windows: vedi avvia_risponditore
            except OSError:
                # 10040 (un pacchetto grosso): prima interrompeva la ricerca e
                # le risposte vere arrivate dopo andavano perse
                continue
            if not dati.startswith(RISPOSTA):
                continue
            if mitt[0] in miei:
                continue
            pezzi = dati.decode("utf-8", "replace").split(" ", 2)
            _aggiungi(_voce(mitt[0], pezzi[1] if len(pezzi) > 1 else "",
                            pezzi[2].strip() if len(pezzi) > 2 else ""))
    finally:
        s.close()
    return ALTRI
