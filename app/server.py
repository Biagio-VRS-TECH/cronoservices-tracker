"""Server HTTP di CronoServices Mappature. #ANCHOR: server

Solo libreria standard: nessun pip install, nessuna rete richiesta.
ThreadingHTTPServer basta e avanza per una decina di operatori in LAN.

Percorsi:
  /                  -> web/index.html
  /api/...           -> api.ROUTE
  /api/stream        -> Server-Sent Events (aggiornamenti in tempo reale)
Avvio: python server.py [--porta 8770] [--no-sync]
"""
import argparse, json, mimetypes, os, queue, socket, sys, threading, time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, parse_qs

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import db, api, sync, rete_locale

BASE = os.path.dirname(os.path.abspath(__file__))
CFG = json.load(open(os.path.join(BASE, "config.json"), encoding="utf-8"))
WEB = os.path.abspath(os.path.join(BASE, CFG["web_dir"]))
CTX = {"cfg": CFG, "base": BASE}

mimetypes.add_type("application/javascript", ".js")
mimetypes.add_type("text/css", ".css")
mimetypes.add_type("image/webp", ".webp")
mimetypes.add_type("application/manifest+json", ".webmanifest")


# ------------------------------------------------------------- hub eventi ----
class Hub:
    """Fan-out degli eventi verso le connessioni SSE aperte. #ANCHOR: sse"""

    def __init__(self):
        self.clients = set()
        self.lock = threading.Lock()
        self.seq = 0

    def iscrivi(self):
        q = queue.Queue(maxsize=200)
        with self.lock:
            self.clients.add(q)
        return q

    def disiscrivi(self, q):
        with self.lock:
            self.clients.discard(q)

    def diffondi(self, evento, escludi=None):
        if not evento:
            return
        with self.lock:
            self.seq += 1
            evento = dict(evento, seq=self.seq, ts=time.time())
            morti = []
            for q in self.clients:
                if escludi is not None and getattr(q, "client_id", None) == escludi:
                    continue
                try:
                    q.put_nowait(evento)
                except queue.Full:
                    morti.append(q)
            for q in morti:
                self.clients.discard(q)

    @property
    def quanti(self):
        with self.lock:
            return len(self.clients)


HUB = Hub()


# ---------------------------------------------------------------- handler ----
class H(BaseHTTPRequestHandler):
    server_version = "CronoServices/1.0"
    protocol_version = "HTTP/1.1"

    def log_message(self, fmt, *a):
        if "--verbose" in sys.argv:
            sys.stderr.write("%s %s\n" % (self.address_string(), fmt % a))

    # -- utilita' di risposta
    def _invia(self, status, corpo, ctype="application/json; charset=utf-8", extra=None):
        if isinstance(corpo, str):
            corpo = corpo.encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(corpo)))
        self.send_header("Cache-Control", "no-store")
        for k, v in (extra or {}).items():
            self.send_header(k, v)
        self.end_headers()
        try:
            self.wfile.write(corpo)
        except (BrokenPipeError, ConnectionResetError):
            pass

    def _json(self, status, obj, extra=None):
        self._invia(status, json.dumps(obj, ensure_ascii=False), extra=extra)

    # -- routing
    def do_GET(self):
        u = urlparse(self.path)
        if u.path == "/api/stream":
            return self._stream(u)
        if u.path.startswith("/api/"):
            return self._api("GET", u, {})
        return self._statico(u.path)

    def do_POST(self):
        u = urlparse(self.path)
        n = int(self.headers.get("Content-Length") or 0)
        raw = self.rfile.read(n) if n else b""
        try:
            body = json.loads(raw.decode("utf-8")) if raw else {}
        except ValueError:
            return self._json(400, {"errore": "JSON non valido"})
        return self._api("POST", u, body)

    def _api(self, metodo, u, body):
        fn = api.ROUTE.get((metodo, u.path))
        if fn is None:
            return self._json(404, {"errore": "endpoint sconosciuto: %s" % u.path})
        q = {k: v[0] for k, v in parse_qs(u.query).items()}
        try:
            st, out, ev = fn(CTX, q, body)
        except Exception as e:
            import traceback
            traceback.print_exc()
            return self._json(500, {"errore": "%s: %s" % (type(e).__name__, e)})
        if isinstance(out, dict) and "__file__" in out:
            # un file binario (i PDF delle schede): inline nel browser, oppure
            # scaricato se la query chiede ?scarica
            nome = out["__nome__"].encode("ascii", "ignore").decode() or "documento"
            disp = "inline" if out.get("__inline__") else "attachment"
            return self._invia(st, out["__file__"], out.get("__tipo__") or
                               "application/octet-stream",
                               {"Content-Disposition": '%s; filename="%s"' % (disp, nome)})
        if isinstance(out, dict) and "__csv__" in out:
            return self._invia(st, "﻿" + out["__csv__"], "text/csv; charset=utf-8",
                               {"Content-Disposition": 'attachment; filename="%s"'
                                                       % out["__nome__"]})
        if ev:
            HUB.diffondi(ev, escludi=body.get("client_id"))
        return self._json(st, out)

    def _stream(self, u):
        """SSE. Ogni client tiene un thread: accettabile per pochi operatori."""
        q = HUB.iscrivi()
        q.client_id = {k: v[0] for k, v in parse_qs(u.query).items()}.get("client_id")
        try:
            self.send_response(200)
            self.send_header("Content-Type", "text/event-stream; charset=utf-8")
            self.send_header("Cache-Control", "no-store")
            self.send_header("Connection", "keep-alive")
            self.send_header("X-Accel-Buffering", "no")
            self.end_headers()
            self.wfile.write(b": benvenuto\n\n")
            self.wfile.flush()
            while True:
                try:
                    ev = q.get(timeout=20)
                    dati = json.dumps(ev, ensure_ascii=False)
                    self.wfile.write(("event: %s\ndata: %s\n\n"
                                      % (ev.get("tipo", "msg"), dati)).encode("utf-8"))
                except queue.Empty:
                    self.wfile.write(b": ping\n\n")   # tiene viva la connessione
                self.wfile.flush()
        except (BrokenPipeError, ConnectionResetError, OSError):
            pass
        finally:
            HUB.disiscrivi(q)

    def _statico(self, path):
        rel = "index.html" if path in ("/", "") else path.lstrip("/")
        f = os.path.abspath(os.path.join(WEB, rel))
        if os.path.isdir(f):                     # /schede/ -> schede/index.html
            f = os.path.join(f, "index.html")
        if not f.startswith(WEB) or not os.path.isfile(f):
            return self._invia(404, "Non trovato: %s" % rel, "text/plain; charset=utf-8")
        ctype = mimetypes.guess_type(f)[0] or "application/octet-stream"
        if ctype.startswith("text/") or ctype in ("application/javascript",
                                                  "application/json",
                                                  "image/svg+xml"):
            ctype += "; charset=utf-8"
        with open(f, "rb") as fh:
            dati = fh.read()
        cache = "no-store" if rel.endswith((".html", "sw.js")) else "no-cache"
        self.send_response(200)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(dati)))
        self.send_header("Cache-Control", cache)
        if rel == "sw.js":
            self.send_header("Service-Worker-Allowed", "/")
        self.end_headers()
        try:
            self.wfile.write(dati)
        except (BrokenPipeError, ConnectionResetError):
            pass


class Server(ThreadingHTTPServer):
    """Il browser che chiude una connessione (o una pagina SSE) fa alzare
    ConnectionReset/BrokenPipe: socketserver ne stamperebbe il traceback e la
    finestra che vedono gli operatori si empirebbe di errori innocui."""

    daemon_threads = True
    allow_reuse_address = False

    def handle_error(self, request, client_address):
        e = sys.exc_info()[1]
        if isinstance(e, (ConnectionResetError, ConnectionAbortedError,
                          BrokenPipeError, TimeoutError)):
            return
        super().handle_error(request, client_address)


def porta_occupata(porta):
    """Su Windows allow_reuse_address permette a un SECONDO processo di legarsi
    alla stessa porta: si ritroverebbero due server a contendersi le richieste
    (succede appena si fa doppio clic su avvia.bat due volte). Quindi si guarda
    prima se qualcuno risponde."""
    s = socket.socket()
    s.settimeout(0.6)
    try:
        s.connect(("127.0.0.1", porta))
        return True
    except OSError:
        return False
    finally:
        s.close()


def ip_lan():
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(("10.255.255.255", 1))
        return s.getsockname()[0]
    except OSError:
        return "127.0.0.1"
    finally:
        s.close()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--porta", type=int, default=CFG.get("port", 8770))
    ap.add_argument("--no-sync", action="store_true")
    ap.add_argument("--verbose", action="store_true")
    a, _ = ap.parse_known_args()

    if porta_occupata(a.porta):
        print("")
        print("  Crono Mappature e' GIA' in esecuzione su questo PC.")
        print("  Apri http://localhost:%d nel browser." % a.porta)
        print("  (Se credi che sia un errore, chiudi l'altra finestra del server")
        print("   e riprova, oppure usa un'altra porta: python server.py --porta 8771)")
        print("")
        return

    CTX["lan"] = "http://%s:%d" % (ip_lan(), a.porta)

    # Scoperta di altri server Crono in rete: vedi #ANCHOR: scoperta.
    rete_locale.avvia_risponditore(CTX["lan"])
    altri = rete_locale.cerca_altri()
    CTX["altri_server"] = altri
    if altri:
        print("")
        print("  !! ATTENZIONE: c'e' gia' un altro Crono Mappature in rete:")
        for x in altri:
            print("     %s  ->  %s" % (x["host"], x["url"]))
        print("")
        print("  Se ne usate due, le spunte finiscono in DUE archivi separati.")
        print("  Chiudi questa finestra e apri l'indirizzo qui sopra nel browser.")
        print("")
    db.init(os.path.join(BASE, CFG["sqlite_path"]))
    if CFG.get("sync_all_avvio") and not a.no_sync:
        try:
            r = sync.esegui(CFG, BASE)
            print("Sync Access: %d clienti, %d service (nuovi %d, chiusi %d, "
                  "mesi cambiati %d)" % (r["clienti"], r["services"], r["nuovi"],
                                         r["chiusi"], r["mesi_cambiati"]))
        except Exception as e:
            print("ATTENZIONE: sync Access non riuscito (%s). Si prosegue con la "
                  "cache locale." % e)

    srv = Server((CFG.get("host", "0.0.0.0"), a.porta), H)
    print("")
    print("  CronoServices Mappature attivo")
    print("  su questo PC .... http://localhost:%d" % a.porta)
    print("  per i colleghi .. http://%s:%d" % (ip_lan(), a.porta))
    print("  CTRL+C per fermare")
    print("")
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        print("Arresto.")
    finally:
        srv.server_close()


if __name__ == "__main__":
    main()
