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

Se il firewall blocca il broadcast non si scopre nulla e si torna al
comportamento di prima: e' un avviso in piu', non una dipendenza.
"""
import socket, threading, time

PORTA_ANNUNCIO = 8771
DOMANDA = b"CRONO?"
RISPOSTA = b"CRONO!"

# Popolato dalla scoperta: [{"host":..., "url":..., "ip":...}]
ALTRI = []


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
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        s.bind(("", porta))
    except OSError:
        return None

    nome = socket.gethostname()

    def ciclo():
        while True:
            try:
                dati, mitt = s.recvfrom(512)
            except OSError:
                return
            if dati.startswith(DOMANDA):
                try:
                    s.sendto(b"%s %s %s" % (RISPOSTA, nome.encode(), mio_url.encode()),
                             mitt)
                except OSError:
                    pass

    t = threading.Thread(target=ciclo, daemon=True)
    t.start()
    return s


def cerca_altri(porta=PORTA_ANNUNCIO, attesa=1.2):
    """Manda la domanda in broadcast e raccoglie le risposte. Ritorna ALTRI."""
    del ALTRI[:]
    miei = _ip_locali()
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    s.setsockopt(socket.SOL_SOCKET, socket.SO_BROADCAST, 1)
    s.settimeout(0.3)
    try:
        for dest in ("255.255.255.255", "<broadcast>"):
            try:
                s.sendto(DOMANDA, (dest, porta))
            except OSError:
                pass
        fine = time.time() + attesa
        visti = set()
        while time.time() < fine:
            try:
                dati, mitt = s.recvfrom(512)
            except socket.timeout:
                continue
            except OSError:
                break
            if not dati.startswith(RISPOSTA):
                continue
            if mitt[0] in miei or mitt[0] in visti:
                continue
            visti.add(mitt[0])
            pezzi = dati.decode("utf-8", "replace").split(" ", 2)
            ALTRI.append({
                "ip": mitt[0],
                "host": pezzi[1] if len(pezzi) > 1 else mitt[0],
                "url": pezzi[2] if len(pezzi) > 2 else "http://%s:8770" % mitt[0],
            })
    finally:
        s.close()
    return ALTRI
