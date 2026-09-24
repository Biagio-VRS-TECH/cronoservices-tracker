"""Aiuto comune delle prove nel browser (tests/e2e). Non e' un test.

Ogni classe che eredita da `CasoE2E`:
  - copia data/prova.db in una cartella temporanea (%TEMP%/crono_e2e_*): il
    file vero non si apre mai, ne' in lettura ne' in scrittura;
  - avvia app/server.py su quella copia, su una porta libera scelta dal
    sistema (mai 8770/8771/8775), con --no-sync, senza scoperta UDP in rete e
    con `accdb_backend` puntato a un file che non esiste: niente Access,
    niente \\\\192.168.1.220. app/config.json NON si tocca: le chiavi in piu'
    (es. `pin_admin`) si mettono nel dizionario CFG del modulo server prima di
    main(), vedi EXTRA_CFG;
  - apre Chromium headless (service worker bloccati: una cache vecchia non deve
    rispondere al posto del server);
  - alla fine chiude tutto e toglie la copia.

Ogni pagina aperta con `self.pagina()` raccoglie gli errori della console, le
eccezioni non prese e le richieste fallite: in tearDown un errore non previsto
fa fallire la prova. Quelli previsti si dichiarano con `self.permetti(regex)`.

Se Playwright manca le prove si saltano, non falliscono.
"""
import json, os, re, shutil, socket, subprocess, sys, tempfile, time, unittest
import urllib.request

try:
    from playwright.sync_api import sync_playwright
except ImportError:                       # pragma: no cover - dipende dalla macchina
    sync_playwright = None

RADICE = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
APP = os.path.join(RADICE, 'app')
PROVA_DB = os.path.join(RADICE, 'data', 'prova.db')
VIETATE = {8770, 8771, 8775}
with open(os.path.join(RADICE, 'web', 'novita.json'), encoding='utf-8') as _f:
    ULTIMA_NOVITA = json.load(_f)['rilasci'][0]['id']
FOTO = os.environ.get('CRONO_E2E_FOTO') or os.path.join(tempfile.gettempdir(), 'crono_e2e_foto')

DESKTOP = {'viewport': {'width': 1440, 'height': 900}}
TELEFONO = {'viewport': {'width': 375, 'height': 812}, 'is_mobile': True, 'has_touch': True,
            'device_scale_factor': 2}
TELEFONO_GRANDE = {'viewport': {'width': 390, 'height': 844}, 'is_mobile': True, 'has_touch': True,
                   'device_scale_factor': 2}

# Il server vero (app/server.py, la sua main()), con tre ritocchi in memoria:
# niente risponditore/ricerca UDP (le prove non devono vedere ne' disturbare
# altri server in rete: con la ricerca finta si prova la fascia rossa), e le
# chiavi di config in piu' della prova.
_AVVIO = r'''
import json, os, sys
app, porta, dbp, extra, altri = sys.argv[1], sys.argv[2], sys.argv[3], json.loads(sys.argv[4]), json.loads(sys.argv[5])
sys.path.insert(0, app)
os.chdir(app)
import rete_locale
rete_locale.avvia_risponditore = lambda *a, **k: None
rete_locale.cerca_altri = lambda *a, **k: altri
import server
server.CFG.update(extra)
sys.argv = ["server.py", "--no-sync", "--porta", porta, "--db", dbp]
server.main()
'''


def porta_libera():
    while True:
        s = socket.socket()
        s.bind(('127.0.0.1', 0))
        p = s.getsockname()[1]
        s.close()
        if p not in VIETATE:
            return p


class Server:
    """Un server.py su una copia di prova.db. `ferma()` e `riavvia()` servono
    alla prova del server che cade e torna (stessa porta, stesso archivio)."""

    def __init__(self, cartella, extra=None, altri=None):
        self.cartella = cartella
        self.db = os.path.join(cartella, 'prova-e2e.db')
        shutil.copyfile(PROVA_DB, self.db)
        self.porta = porta_libera()
        self.extra = dict({'accdb_backend': os.path.join(cartella, 'nessuno.accdb'),
                           'sync_all_avvio': False}, **(extra or {}))
        self.altri = altri or []
        self.proc = None
        self.log = os.path.join(cartella, 'server.log')

    @property
    def url(self):
        return 'http://127.0.0.1:%d' % self.porta

    def avvia(self):
        self._out = open(self.log, 'ab')
        self.proc = subprocess.Popen(
            [sys.executable, '-c', _AVVIO, APP, str(self.porta), self.db,
             json.dumps(self.extra), json.dumps(self.altri)],
            stdout=self._out, stderr=subprocess.STDOUT, cwd=APP)
        fine = time.time() + 20
        while time.time() < fine:
            if self.proc.poll() is not None:
                raise RuntimeError('server.py e2e uscito subito:\n' + self.leggi_log())
            try:
                with urllib.request.urlopen(self.url + '/api/bootstrap', timeout=2) as r:
                    if r.status == 200:
                        return self
            except OSError:
                time.sleep(0.15)
        raise RuntimeError('server.py e2e non risponde:\n' + self.leggi_log())

    def ferma(self):
        if self.proc and self.proc.poll() is None:
            self.proc.terminate()
            try:
                self.proc.wait(10)
            except subprocess.TimeoutExpired:
                self.proc.kill()
                self.proc.wait(5)
        self.proc = None
        if getattr(self, '_out', None):
            self._out.close()
            self._out = None

    def riavvia(self):
        self.ferma()
        return self.avvia()

    def leggi_log(self):
        try:
            with open(self.log, encoding='utf-8', errors='replace') as f:
                return f.read()[-4000:]
        except OSError:
            return ''

    def api(self, percorso, corpo=None):
        """GET (o POST con `corpo`) diretto al server, per preparare o verificare."""
        dati = None if corpo is None else json.dumps(corpo).encode('utf-8')
        req = urllib.request.Request(self.url + percorso, data=dati,
                                     headers={'Content-Type': 'application/json'})
        with urllib.request.urlopen(req, timeout=10) as r:
            return json.loads(r.read().decode('utf-8'))


class Sonda:
    """Gli errori di una pagina: console, eccezioni, richieste fallite."""

    def __init__(self, pagina, nome):
        self.nome = nome
        self.pagina = pagina
        self.errori = []
        # "Failed to load resource" e' il doppione in console di una risposta
        # >= 400, che arriva gia' (con metodo e indirizzo) dal gestore `response`
        pagina.on('console', lambda m: m.type == 'error'
                  and not m.text.startswith('Failed to load resource') and self.errori.append(
                      'console: %s  [%s]' % (m.text, (m.location or {}).get('url', ''))))
        pagina.on('pageerror', lambda e: self.errori.append('eccezione: %s' % e))
        pagina.on('requestfailed', lambda r: self.errori.append(
            'richiesta fallita: %s %s (%s)' % (r.method, r.url, r.failure)))
        pagina.on('response', lambda r: r.status >= 400 and self.errori.append(
            'risposta %d: %s %s' % (r.status, r.request.method, r.url)))


class CasoE2E(unittest.TestCase):
    """Base delle prove nel browser: un server e un Chromium per classe."""
    EXTRA_CFG = {}
    ALTRI_SERVER = []
    # Rumore che non e' un difetto: l'EventSource e il ping interrotti quando la
    # pagina si chiude o il server si ferma apposta.
    PERMESSI_BASE = [r'/api/stream.*ERR_ABORTED', r'/api/ping.*ERR_ABORTED']

    @classmethod
    def setUpClass(cls):
        if sync_playwright is None:
            raise unittest.SkipTest('Playwright per Python non installato')
        if not os.path.exists(PROVA_DB):
            raise unittest.SkipTest('manca data/prova.db')
        cls.cartella = tempfile.mkdtemp(prefix='crono_e2e_')
        os.makedirs(FOTO, exist_ok=True)
        cls.server = Server(cls.cartella, cls.EXTRA_CFG, cls.ALTRI_SERVER)
        try:
            cls.server.avvia()
            cls._pw = sync_playwright().start()
            try:
                cls.browser = cls._pw.chromium.launch(headless=True)
            except Exception as e:     # Chromium non scaricato
                cls._pw.stop()
                raise unittest.SkipTest('Chromium di Playwright non disponibile: %s' % e)
        except BaseException:
            cls.server.ferma()
            shutil.rmtree(cls.cartella, ignore_errors=True)
            raise

    @classmethod
    def tearDownClass(cls):
        try:
            cls.browser.close()
            cls._pw.stop()
        finally:
            cls.server.ferma()
            for _ in range(20):          # Windows: il file resta preso un attimo
                shutil.rmtree(cls.cartella, ignore_errors=True)
                if not os.path.exists(cls.cartella):
                    break
                time.sleep(0.2)

    def setUp(self):
        self._sonde = []
        self._contesti = []
        self._permessi = list(self.PERMESSI_BASE)

    def permetti(self, *regex):
        self._permessi.extend(regex)

    def tearDown(self):
        brutti = []
        for i, s in enumerate(self._sonde):
            try:                           # l'ultima immagine di ogni pagina, per capire un errore
                s.pagina.screenshot(path=os.path.join(
                    FOTO, 'ultima-%s-%d.png' % (self._testMethodName, i)))
            except Exception:
                pass
        for s in self._sonde:
            for e in s.errori:
                if not any(re.search(p, e) for p in self._permessi):
                    brutti.append('[%s] %s' % (s.nome, e))
        for c in self._contesti:
            try:
                c.close()
            except Exception:
                pass
        if brutti:
            self.fail('errori non previsti nel browser:\n  ' + '\n  '.join(brutti[:20]))

    # ------------------------------------------------------------ pagine ---
    def contesto(self, operatore='Collaudo', forma=DESKTOP, avviso_anagrafica=False, novita_viste=True):
        """Un profilo di browser nuovo. `operatore` None = primo accesso."""
        c = self.browser.new_context(service_workers='block', locale='it-IT',
                                     timezone_id='Europe/Rome', **forma)
        if novita_viste:
            # il riassunto delle Novita' si apre da solo alla prima visita
            # (js/vrs-novita.js): nelle prove coprirebbe la pagina. Le Novita' si
            # provano a parte (test_e2e_novita.py)
            c.add_init_script("try{localStorage.setItem('vrs.novita.cronoservice',%s)}catch(e){}"
                              % json.dumps(ULTIMA_NOVITA))
        if not avviso_anagrafica:
            # l'avviso "l'anagrafica di Access e' vecchia" esce all'admin una
            # volta al giorno (15 s): nelle prove coprirebbe mezza pagina
            c.add_init_script("try{const d=new Date(),z=n=>String(n).padStart(2,'0');"
                              "localStorage.setItem('cs.anagrafica-avvisata',"
                              "d.getFullYear()+'-'+z(d.getMonth()+1)+'-'+z(d.getDate()))}catch(e){}")
        if operatore:
            c.add_init_script("try{if(!localStorage.getItem('cs.operatore'))"
                              "localStorage.setItem('cs.operatore',%s)}catch(e){}"
                              % json.dumps(operatore))
        self._contesti.append(c)
        return c

    def pagina(self, operatore='Collaudo', forma=DESKTOP, contesto=None, percorso='/',
               aspetta='.crono .cella', nome=None):
        c = contesto or self.contesto(operatore, forma)
        p = c.new_page()
        p.set_default_timeout(10000)
        self._sonde.append(Sonda(p, nome or '%s %s' % (operatore, percorso)))
        p.goto(self.server.url + percorso)
        if aspetta:
            p.wait_for_selector(aspetta)
        return p

    def foto(self, pagina, nome, intera=False):
        f = os.path.join(FOTO, '%s-%s.png' % (type(self).__name__, nome))
        pagina.screenshot(path=f, full_page=intera)
        return f

    # ------------------------------------------------------------ aiuti ----
    @staticmethod
    def cella_vuota(p, sel='.crono .cella:not(.completa)'):
        """La prima cella della griglia (vista Anno) che non e' completa e
        non ha passi: {'chiave': 'id-mese', ...}."""
        return p.evaluate("""sel => {
          for (const c of document.querySelectorAll(sel)) {
            if (['s','c','k','r'].every(k => c.dataset[k] === '0')) return c.dataset.cella;
          }
          return null; }""", sel)

    @staticmethod
    def segmenti(p, chiave):
        return p.evaluate("""k => { const c = document.querySelector(`.cella[data-cella="${k}"]`);
          return c ? ['s','c','k','r'].map(x => c.dataset[x]).join('') : null; }""", chiave)

    def aspetta_segmenti(self, p, chiave, attesi, secondi=8):
        fine = time.time() + secondi
        v = None
        while time.time() < fine:
            v = self.segmenti(p, chiave)
            if v == attesi:
                return v
            p.wait_for_timeout(100)
        self.assertEqual(v, attesi, 'segmenti della cella %s' % chiave)

    @staticmethod
    def chiudi_avvisi(p):
        p.evaluate("document.querySelectorAll('.avviso, .toast').forEach(n => n.remove())")
