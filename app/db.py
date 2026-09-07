"""Schema e accesso SQLite. #ANCHOR: db

Access resta la sorgente di verita' per clienti/services (sola lettura, importati
in cache da sync.py). Le spunte mappatura vivono SOLO qui: l'accdb non viene mai
scritto.  Concorrenza: WAL + un lock di scrittura in-process (server.py e' l'unico
scrittore) + colonna `rev` per il merge ottimistico a livello di singolo campo.
"""
import contextlib, os, sqlite3, threading, datetime

WRITE_LOCK = threading.RLock()
_DB_PATH = None

MESI_ABBR = ["Gen", "Feb", "Mar", "Apr", "Mag", "Giu",
             "Lug", "Ago", "Set", "Ott", "Nov", "Dic"]
MESI_NOME = ["Gennaio", "Febbraio", "Marzo", "Aprile", "Maggio", "Giugno",
             "Luglio", "Agosto", "Settembre", "Ottobre", "Novembre", "Dicembre"]
# I quattro passi di una mappatura, in ordine. L'ordine conta: e' quello dei
# segmenti della cella e dei tasti 1..4.  "ricambi" = controllo ricambi e scadenze.
CAMPI = ("stampata", "controllata", "corretta", "ricambi")

SCHEMA = """
PRAGMA journal_mode=WAL;
PRAGMA synchronous=NORMAL;
PRAGMA foreign_keys=ON;

CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT);

CREATE TABLE IF NOT EXISTS clienti (
  id_cliente       INTEGER PRIMARY KEY,
  rag_soc          TEXT NOT NULL DEFAULT '',
  indirizzo        TEXT, cap TEXT, citta TEXT, provincia TEXT,
  telefono         TEXT, email TEXT,
  non_utilizzabile INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS services (
  id_service    INTEGER PRIMARY KEY,
  id_cliente    INTEGER NOT NULL,
  tipo          TEXT, stato TEXT,
  destinazione  TEXT, localita TEXT, provincia TEXT,
  mappatura     INTEGER NOT NULL DEFAULT 0,   -- campo Mappatura di tServices
  subappalto    INTEGER NOT NULL DEFAULT 0,
  n_contratto   TEXT, data_inizio TEXT, data_scadenza TEXT,
  cadenza       TEXT, qva INTEGER,
  causale_rinnovo TEXT,
  rinnovo_auto  INTEGER NOT NULL DEFAULT 0,   -- da tCausaliRinnovo.RinnovoAutomatico
  mesi          TEXT NOT NULL DEFAULT '000000000000',  -- bitmask Gen..Dic
  note          TEXT,
  visto_il      TEXT,                         -- ultimo sync in cui era presente
  archiviato    INTEGER NOT NULL DEFAULT 0    -- 1 = sparito da Access
);
CREATE INDEX IF NOT EXISTS ix_serv_cli   ON services(id_cliente);
CREATE INDEX IF NOT EXISTS ix_serv_stato ON services(stato);

-- Una riga per cella della griglia (service x anno x mese).
CREATE TABLE IF NOT EXISTS mappature (
  id_service  INTEGER NOT NULL,
  anno        INTEGER NOT NULL,
  mese        INTEGER NOT NULL,        -- 1..12
  stampata    INTEGER NOT NULL DEFAULT 0,
  controllata INTEGER NOT NULL DEFAULT 0,
  corretta    INTEGER NOT NULL DEFAULT 0,   -- "mappatura completa rapportino"
  ricambi     INTEGER NOT NULL DEFAULT 0,   -- controllo ricambi e scadenze
  nota        TEXT,
  rev         INTEGER NOT NULL DEFAULT 1,
  updated_at  TEXT, updated_by TEXT,
  PRIMARY KEY (id_service, anno, mese)
);
CREATE INDEX IF NOT EXISTS ix_map_anno ON mappature(anno);

-- Log append-only: chi ha messo/tolto cosa e quando. Alimenta la storia cella.
CREATE TABLE IF NOT EXISTS eventi (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  ts         TEXT NOT NULL,
  operatore  TEXT NOT NULL DEFAULT '?',
  id_service INTEGER, anno INTEGER, mese INTEGER,
  campo      TEXT, da INTEGER, a INTEGER,
  op_id      TEXT, origine TEXT
);
CREATE INDEX IF NOT EXISTS ix_ev_cella ON eventi(id_service, anno, mese, id DESC);
CREATE INDEX IF NOT EXISTS ix_ev_ts    ON eventi(id DESC);

-- Idempotenza: la coda offline puo' rimandare la stessa operazione piu' volte.
CREATE TABLE IF NOT EXISTS ops (
  op_id TEXT PRIMARY KEY, ts TEXT, esito TEXT, rev INTEGER
);

CREATE TABLE IF NOT EXISTS operatori (
  nome TEXT PRIMARY KEY, ultimo_accesso TEXT
);

CREATE TABLE IF NOT EXISTS sync_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT,
  clienti INTEGER, services INTEGER,
  nuovi INTEGER, riaperti INTEGER, chiusi INTEGER,
  mesi_cambiati INTEGER, spunte_orfane INTEGER,
  dettaglio TEXT
);
"""


# Colonne aggiunte dopo la prima versione: SCHEMA le contiene per i DB nuovi,
# qui si recuperano quelli gia' esistenti. Non c'e' un sistema di migrazioni.
AGGIUNTE = [
    ("services", "causale_rinnovo", "TEXT"),
    ("services", "rinnovo_auto", "INTEGER NOT NULL DEFAULT 0"),
    ("mappature", "ricambi", "INTEGER NOT NULL DEFAULT 0"),
]


def init(path):
    global _DB_PATH
    _DB_PATH = os.path.abspath(path)
    os.makedirs(os.path.dirname(_DB_PATH), exist_ok=True)
    with sess() as c:
        c.executescript(SCHEMA)
        for tab, col, tipo in AGGIUNTE:
            try:
                c.execute("ALTER TABLE %s ADD COLUMN %s %s" % (tab, col, tipo))
            except sqlite3.OperationalError:
                pass   # colonna gia' presente
        # Da quando l'azienda registra le spunte qui: i mesi precedenti esistono
        # ma non vanno segnalati come "in ritardo" (non c'e' mai stato un dato).
        if not get_meta(c, "inizio_tracciamento"):
            set_meta(c, "inizio_tracciamento",
                     datetime.date.today().strftime("%Y-%m"))
    return _DB_PATH


def connect():
    c = sqlite3.connect(_DB_PATH, timeout=15, isolation_level=None)
    c.row_factory = sqlite3.Row
    c.execute("PRAGMA busy_timeout=15000")
    return c


@contextlib.contextmanager
def sess():
    """Connessione a vita breve, sempre chiusa. sqlite3 con `with` non chiude."""
    c = connect()
    try:
        yield c
    finally:
        c.close()


def now():
    return datetime.datetime.now().replace(microsecond=0).isoformat()


def get_meta(c, k, default=None):
    r = c.execute("SELECT v FROM meta WHERE k=?", (k,)).fetchone()
    return r["v"] if r else default


def set_meta(c, k, v):
    c.execute("INSERT INTO meta(k,v) VALUES(?,?) ON CONFLICT(k) DO UPDATE SET v=excluded.v",
              (k, str(v)))
