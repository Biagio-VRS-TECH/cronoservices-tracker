"""Endpoint applicativi. #ANCHOR: api

Convenzione: ogni handler ha firma (ctx, q, body) e ritorna (status, payload, evento).
`evento` (o None) viene diffuso via SSE dal server a tutti gli altri client.

ctx = {"cfg":..., "base":...}
q    = dict dei query string (valori singoli)
body = dict del JSON in ingresso (vuoto sui GET)

Il codice sta nei moduli `api_*.py` (COD-07), una responsabilita' ciascuno:
  api_comune     anno, anni, forma della cella
  api_presenze   presenze, ping, operatore
  api_permessi   PIN dell'amministratore, ruoli, impostazioni, sync
  api_spunte     merge per campo, toggle, bulk, nota, ripristino
  api_diario     storia, attivita', azzeramento del diario, incongruenze
  api_scadenze   termine in corso, mese della mappatura, CSV
  api_documenti  PDF archiviati
  api_dizionario dizionario dei componenti
  api_avvio      bootstrap
Questo file resta il punto d'ingresso: server.py legge `api.ROUTE`, le prove
leggono i nomi qui sotto (`api.PRESENZE`, `api._PIN_ERRORI` sono gli stessi
oggetti dei moduli, non copie).
"""
import db, sync  # noqa: F401  (le prove toccano `api.sync`)

from api_comune import (CAMPI, _anni_disponibili, _anno, _cella, _cella_out,  # noqa: F401
                        _cella_out_vuota)
from api_presenze import (PRESENZA_TTL, PRESENZE, _PRESENZE_LOCK, _online,  # noqa: F401
                          operatore, ping)
from api_permessi import (PIN_PAUSA, PIN_TENTATIVI, _PIN_ERRORI, _PIN_LOCK,  # noqa: F401
                          _admin_con_pin, _pin_admin, _solo_admin, fai_sync,
                          impostazioni, ruolo)
from api_spunte import (_applica, _valore_per_ruolo, bulk, nota, ripristina,  # noqa: F401
                        toggle)
from api_diario import attivita, azzera_diario, incongruenze, storia  # noqa: F401
from api_scadenze import (_mese_scadenza, _scad_effettiva, _testo_csv,  # noqa: F401
                          esporta_csv)
from api_documenti import (MAX_PDF, _cartella_documenti, _doc_out, _documenti,  # noqa: F401
                           _file_documento, documenti, elimina_documenti,
                           elimina_documento, salva_documento, scarica_documento)
from api_dizionario import PRIORITA_MAX, _voce_out, dizionario, dizionario_imposta  # noqa: F401
from api_avvio import bootstrap  # noqa: F401


ROUTE = {
    ("GET", "/api/bootstrap"): bootstrap,
    ("GET", "/api/storia"): storia,
    ("GET", "/api/attivita"): attivita,
    ("GET", "/api/incongruenze"): incongruenze,
    ("GET", "/api/export.csv"): esporta_csv,
    ("POST", "/api/toggle"): toggle,
    ("POST", "/api/bulk"): bulk,
    ("POST", "/api/nota"): nota,
    ("POST", "/api/operatore"): operatore,
    ("POST", "/api/ruolo"): ruolo,
    ("POST", "/api/ripristina"): ripristina,
    ("POST", "/api/diario_azzera"): azzera_diario,
    ("POST", "/api/ping"): ping,
    ("POST", "/api/impostazioni"): impostazioni,
    ("POST", "/api/sync"): fai_sync,
    ("GET", "/api/documenti"): documenti,
    ("GET", "/api/documento"): scarica_documento,
    ("POST", "/api/documento"): salva_documento,
    ("POST", "/api/documento_elimina"): elimina_documento,
    ("POST", "/api/documenti_elimina"): elimina_documenti,
    ("GET", "/api/dizionario"): dizionario,
    ("POST", "/api/dizionario"): dizionario_imposta,
}
