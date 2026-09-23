/* web-ambiente.mjs - il minimo di browser che serve a importare i moduli di
   web/js/ sotto Node (node:test), senza dipendenze.

   Va importato PER PRIMO nei test: i moduli di web/js leggono sessionStorage e
   localStorage al caricamento (api.js) e agganciano ascoltatori a `window`
   (ui.frecceEntrano). Qui ci sono solo stub: niente rete, niente DOM vero.
   `document` e' un finto albero quanto basta per `ui.avviso` e `ui.h`; gli
   avvisi mostrati si rileggono con `avvisi()`.

   Non e' un file di test (non finisce per .test.mjs): node --test lo salta. */

const memoria = () => {
  const m = new Map();
  return {
    getItem: k => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: k => { m.delete(k); },
    clear: () => m.clear(),
  };
};

class Nodo {
  constructor(tag) {
    this.tagName = String(tag || 'div').toUpperCase();
    this.figli = [];
    this.padre = null;
    this.attributi = {};
    this.testo = '';
    this.innerHTML = '';
    this.style = { setProperty() { }, removeProperty() { }, getPropertyValue: () => '' };
    const cl = this._cl = new Set();
    this.classList = {
      add: (...c) => c.forEach(x => cl.add(x)),
      remove: (...c) => c.forEach(x => cl.delete(x)),
      toggle: (c, v) => ((v ?? !cl.has(c)) ? cl.add(c) : cl.delete(c), cl.has(c)),
      contains: c => cl.has(c),
    };
  }
  set className(v) { this._cl.clear(); String(v).split(/\s+/).filter(Boolean).forEach(c => this._cl.add(c)); }
  get className() { return [...this._cl].join(' '); }
  set textContent(v) { this.testo = String(v ?? ''); this.figli = []; }
  get textContent() { return this.testo + this.figli.map(f => f.textContent).join(''); }
  get isConnected() { let n = this; while (n.padre) n = n.padre; return n === globalThis.document?.body; }
  append(...k) { for (const x of k) { if (x == null) continue; const n = typeof x === 'string' ? Object.assign(new Nodo('#text'), { testo: x }) : x; n.padre = this; this.figli.push(n); } }
  appendChild(n) { this.append(n); return n; }
  remove() { if (this.padre) { this.padre.figli = this.padre.figli.filter(x => x !== this); this.padre = null; } }
  setAttribute(k, v) { this.attributi[k] = String(v); }
  getAttribute(k) { return this.attributi[k] ?? null; }
  removeAttribute(k) { delete this.attributi[k]; }
  addEventListener() { }
  removeEventListener() { }
  querySelector() { return null; }
  querySelectorAll() { return []; }
  contains() { return false; }
  focus() { }
}

globalThis.localStorage = memoria();
globalThis.sessionStorage = memoria();
globalThis.addEventListener ??= () => { };
globalThis.removeEventListener ??= () => { };
globalThis.location ??= new URL('http://localhost/');
globalThis.matchMedia ??= () => ({ matches: false, addEventListener() { } });
globalThis.requestAnimationFrame ??= fn => setTimeout(fn, 0);
globalThis.document = {
  body: new Nodo('body'),
  documentElement: new Nodo('html'),
  createElement: t => new Nodo(t),
  addEventListener() { }, removeEventListener() { },
  querySelector: () => null, querySelectorAll: () => [],
};

/* Gli avvisi restano a schermo 4-20 s (setTimeout in ui.avviso): senza questo il
   processo di ogni file di test aspetterebbe il loro timer prima di chiudersi. */
const _setTimeout = globalThis.setTimeout;
globalThis.setTimeout = (...a) => { const t = _setTimeout(...a); t?.unref?.(); return t; };

/** Il testo degli avvisi mostrati finora (dal piu' vecchio), e li toglie. */
export function avvisi() {
  const cont = globalThis.document.body.figli.find(n => n.classList.contains('avvisi'));
  if (!cont) return [];
  const out = cont.figli.map(n => n.textContent);
  cont.figli = [];
  return out;
}

/** Un service come lo manda `api.bootstrap`. `mesi` e' la stringa dei dodici
 *  mesi del contratto ('1' = manutenzione), le date sono ISO. */
export function servizio(id, opz = {}) {
  return {
    id, cli: opz.cli ?? id, tipo: opz.tipo ?? 'GAS', stato: opz.stato ?? 'APERTO',
    dest: opz.dest ?? 'Sito ' + id, loc: opz.loc ?? 'Treviso', prov: opz.prov ?? 'TV',
    map: 1, sub: 0, nc: '', inizio: opz.inizio ?? null, scad: opz.scad ?? null,
    cad: '', qva: 0, mesi: opz.mesi ?? '001000001000', rin: opz.rin ?? 0,
    caus: '', note: '', arch: opz.arch ?? 0,
  };
}

/** Una cella con i quattro passi: `passi` e' una stringa "sckr" di 0/1/2. */
export function cellaDi(passi = '0000', opz = {}) {
  const [s, c, k, r] = passi.split('').map(Number);
  return { s, c, k, r, rev: opz.rev ?? 1, by: opz.by ?? 'Mario', at: opz.at ?? '2026-05-10T10:00:00',
           nota: opz.nota ?? '' };
}

/** Un bootstrap completo intorno ai service dati. */
export function bootstrapDi({ anno = 2026, oggi = '2026-09-23', services = [], clienti = null,
                              celle = {}, celle_prec = {}, ruolo = 'tecnico',
                              inizio_tracciamento = '2000-01', documenti = [] } = {}) {
  return {
    anno, anni: [anno - 1, anno, anno + 1], oggi,
    clienti: clienti ?? [...new Set(services.map(s => s.cli))].map(id => ({ id, rs: 'CLIENTE ' + id })),
    services, celle, celle_prec, operatori: [], ruoli: {}, ruolo,
    ultimo_sync: null, inizio_tracciamento, indirizzo_lan: null, altri_server: [],
    sync: null, documenti, online: [],
    mesi: ['Gen', 'Feb', 'Mar', 'Apr', 'Mag', 'Giu', 'Lug', 'Ago', 'Set', 'Ott', 'Nov', 'Dic'],
    mesi_nome: ['Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno', 'Luglio',
      'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre'],
  };
}
