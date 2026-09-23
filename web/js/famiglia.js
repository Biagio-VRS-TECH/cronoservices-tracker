/* famiglia.js - CronoService nella famiglia VRS.  #ANCHOR: famiglia

Tre cose, le stesse del Planning (web/src/components/AppSwitcher.tsx e
web/src/lib/temaCondiviso.ts nel repository del Planning):

 1. IL SELETTORE D'APP (VIS-05 / PRD-01). Il marchio in alto a sinistra e'
    anche il pulsante che apre le app VRS: Planning, CronoService, Cantieri.
    Stesse voci, stessi nomi, stesso foglio di stile (css/vrs-app.css, IDENTICO
    nei due repository). Prima da qui non si tornava al Planning. I nomi sono
    quelli di oggi (D3 non e' decisa): si cambiano in APP_FAMIGLIA, qui e di la'.

 2. IL TEMA A TRE POSIZIONI (VIS-22). Auto (segue il sistema) · Chiaro · Scuro,
    lo stesso controllo del Planning, al posto del bottone a due stati. Sul
    <html> vanno tutti e due gli attributi: `data-tema` (chiaro | scuro, quello
    che leggono i fogli di CronoService e i due generatori) e `data-theme`
    (light | dark, quello del file di famiglia vrs-famiglia.css e del Planning).
    La chiave resta `cs.tema` (#ANCHOR: tema-unico): i generatori la leggono gia'.

 3. LA SCELTA CHE PASSA DA UN'APP ALL'ALTRA (VIS-22). Domini diversi, niente
    localStorage comune e niente cookie comune su *.netlify.app: in comune c'e'
    l'ACCOUNT. La scelta viaggia nei metadati dell'utente di Supabase Auth,
    `user_metadata.vrs_tema = { v: 'auto'|'light'|'dark', t: millisecondi }`.
    Vince la piu' recente: qui si ricorda l'istante dell'ultima scelta in
    `cs.tema.t`. Si legge dal token (nessuna chiamata) dopo il caricamento, e
    dall'utente fresco quando si torna sulla scheda (al massimo una al minuto).
    Solo online: in locale (avvia.bat) il tema resta di questo browser. */
import { h, trappolaTab } from './ui.js';
import * as nuvola from './nuvola.js';

/* ------------------------------------------------------------- le app --- */
const PLANNING = 'https://vrs-planning.netlify.app/';

export const APP_FAMIGLIA = [
  { id: 'planning', nome: 'Planning', nota: 'Attività, assenze e calendario', to: PLANNING,
    ico: 'M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10M12 2.5v2M12 19.5v2M21.5 12h-2M4.5 12h-2M18.7 5.3l-1.4 1.4M6.7 17.3l-1.4 1.4M18.7 18.7l-1.4-1.4M6.7 6.7 5.3 5.3M10 12.2l1.5 1.5 2.7-2.9' },
  { id: 'cronoservice', nome: 'CronoService', nota: 'Mappature e checklist del service', to: '/',
    ico: 'M12 3.5a8.5 8.5 0 1 0 8.5 8.5M12 7.2V12l3.2 1.9M16.4 5.2l2 2 3.4-3.6' },
  { id: 'cantieri', nome: 'Cantieri', nota: 'Anagrafica dei cantieri', to: PLANNING + 'cantieri',
    ico: 'M4 20.5h6.5M7 20.5V6.5M4.2 9.6 7 6.5l2.8 3.1M7 6.5h13M20 6.5v3.4M20 9.9v2.8M18.4 12.7h3.2' },
];
const QUI = 'cronoservice';

/* le icone del Planning (griglia 24, tratto 1.75, currentColor) */
const svg = (d, px = 18) => `<svg width="${px}" height="${px}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="${d}"/></svg>`;
const ICO_TEMA = {
  auto: 'M12 3.5a8.5 8.5 0 1 0 0 17 8.5 8.5 0 0 0 0-17M12 3.5v17M14.6 3.9v16.2M17.2 5.3v13.4M19.5 8v8',
  light: 'M12 7.8a4.2 4.2 0 1 0 0 8.4 4.2 4.2 0 0 0 0-8.4M12 2.6v2M12 19.4v2M21.4 12h-2M4.6 12h-2M18.6 5.4l-1.4 1.4M6.8 17.2l-1.4 1.4M18.6 18.6l-1.4-1.4M6.8 6.8 5.4 5.4',
  dark: 'M20.4 14.3A8.8 8.8 0 0 1 9.7 3.6 8.8 8.8 0 1 0 20.4 14.3',
};

/* ------------------------------------------------------ la finestrella -- */
/* Una sola aperta alla volta. Esc chiude e il fuoco torna al pulsante, il Tab
   gira dentro, un clic fuori chiude senza spostare il fuoco. */
let aperta = null;

function chiudi({ fuoco = false } = {}) {
  if (!aperta) return;
  const { n, bottone } = aperta;
  aperta = null;
  n.remove();
  bottone.setAttribute('aria-expanded', 'false');
  document.removeEventListener('pointerdown', fuori, true);
  document.removeEventListener('keydown', tasti, true);
  removeEventListener('resize', piazza);
  if (fuoco) bottone.focus?.();
}
const fuori = e => {
  if (aperta && !aperta.n.contains(e.target) && !aperta.bottone.contains(e.target)) chiudi();
};
const tasti = e => {
  if (!aperta) return;
  if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); return chiudi({ fuoco: true }); }
  trappolaTab(e, aperta.n);
};
function piazza() {
  if (!aperta) return;
  const { n, bottone, lato } = aperta;
  const r = bottone.getBoundingClientRect();
  const largo = n.offsetWidth || 300;
  const x = lato === 'destra' ? r.right - largo : r.left;
  n.style.left = Math.round(Math.max(12, Math.min(x, innerWidth - largo - 12))) + 'px';
  n.style.top = Math.round(r.bottom + 6) + 'px';
}

function apri(bottone, n, lato) {
  const era = aperta?.bottone;
  chiudi();
  if (era === bottone) return;          // secondo clic sullo stesso pulsante: chiude
  document.body.append(n);
  aperta = { n, bottone, lato };
  bottone.setAttribute('aria-expanded', 'true');
  piazza();
  setTimeout(() => {
    document.addEventListener('pointerdown', fuori, true);
    document.addEventListener('keydown', tasti, true);
    addEventListener('resize', piazza);
  }, 0);
  (n.querySelector('[aria-pressed="true"]') || n.querySelector('a,button'))?.focus();
}

/** Il selettore d'app: si aggancia al marchio della testata (#app-scelta). */
export function collegaSelettoreApp(bottone = document.getElementById('app-scelta')) {
  if (!bottone) return;
  bottone.onclick = () => apri(bottone, finestraApp(), 'sinistra');
}

function finestraApp() {
  return h('div.vrs-app-pop', { role: 'dialog', 'aria-label': 'Le app VRS', id: 'app-pop' },
    h('div.vrs-app-testa', {},
      h('img.vrs-app-logo', { src: '/assets/logo.webp', alt: 'VRS Group', width: '47', height: '36' }),
      h('span.vrs-app-titolo', { 'aria-hidden': 'true', testo: 'Le app VRS' })),
    h('ul.vrs-app-lista', {}, APP_FAMIGLIA.map(a => {
      const qui = a.id === QUI;
      return h('li', {},
        h('a.vrs-app-voce', { href: a.to, ...(qui ? { 'aria-current': 'page' } : {}) },
          h('span.vrs-app-ico', { 'aria-hidden': 'true', html: svg(a.ico) }),
          h('span.vrs-app-testi', {},
            h('span.vrs-app-nome', { testo: a.nome }),
            h('span.vrs-app-nota', { testo: a.nota })),
          qui ? h('span.vrs-app-qui', { testo: 'Sei qui' }) : null));
    })));
}

/* ------------------------------------------------------------- il tema -- */
const K = 'cs.tema';            // 'chiaro' | 'scuro' | '' (segui il sistema)
const KT = 'cs.tema.t';         // istante dell'ultima scelta fatta qui
export const TEMA_META = 'vrs_tema';
export const TEMI = ['auto', 'light', 'dark'];
export const ETICHETTA_TEMA = { auto: 'Auto', light: 'Chiaro', dark: 'Scuro' };
const DA_CS = { '': 'auto', chiaro: 'light', scuro: 'dark' };
const A_CS = { auto: '', light: 'chiaro', dark: 'scuro' };

const leggi = k => { try { return localStorage.getItem(k); } catch { return null; } };
const scrivi = (k, v) => { try { localStorage.setItem(k, v); } catch { /* navigazione privata */ } };

/** Il tema di questo browser, nei nomi di famiglia. */
export function temaScelto() { return DA_CS[leggi(K) || ''] || 'auto'; }
/** Istante dell'ultima scelta fatta qui; 0 se non ce n'e' una. */
export function istanteScelta() {
  const n = Number(leggi(KT));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** La scelta salvata nel profilo, se c'e' ed e' ben formata. */
export function temaDalProfilo(meta) {
  const x = meta && typeof meta === 'object' ? meta[TEMA_META] : null;
  if (!x || typeof x !== 'object' || !TEMI.includes(x.v)) return null;
  return typeof x.t === 'number' && Number.isFinite(x.t) && x.t > 0 ? { v: x.v, t: x.t } : null;
}
/** Vince la scelta piu' recente: quella del profilo si applica solo se e' piu' nuova. */
export const daApplicare = (remoto, localeT) => !!remoto && remoto.t > localeT;
export const daInviare = (remoto, localeT) => localeT > 0 && (!remoto || localeT > remoto.t);

/* il cambio di tema sfuma (View Transitions) invece di scattare; dove l'API
   manca, o chi legge ha chiesto meno movimento, si applica e basta */
function inDissolvenza(fn) {
  if (document.startViewTransition && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
    document.startViewTransition(fn);
  } else fn();
}

function attributi(v) {
  const r = document.documentElement;
  r.dataset.tema = A_CS[v];
  if (v === 'auto') delete r.dataset.theme; else r.dataset.theme = v;
  const b = document.getElementById('tema');
  if (b) {
    const et = 'Tema: ' + ETICHETTA_TEMA[v] + (v === 'auto' ? ' (segue il sistema)' : '');
    b.title = et;
    b.setAttribute('aria-label', et);
  }
  aperta?.n.querySelectorAll('.vrs-seg button').forEach(x =>
    x.setAttribute('aria-pressed', String(x.dataset.theme === v)));
}

let invio = null;
function inviaPresto(scelta) {
  if (!nuvola.attiva() || !nuvola.haSessione()) return;
  clearTimeout(invio);
  // tre clic di fila fanno una richiesta sola
  invio = setTimeout(() => {
    nuvola.salvaMetadati({ [TEMA_META]: scelta }).catch(() => { /* resta su questo browser */ });
  }, 800);
}

/** Scelta fatta qui, adesso: si applica, si ricorda con l'istante e va nel profilo. */
export function scegliTema(v, { sfuma = true } = {}) {
  if (!TEMI.includes(v)) return;
  const t = Date.now();
  scrivi(K, A_CS[v]);
  scrivi(KT, String(t));
  (sfuma ? inDissolvenza : f => f())(() => attributi(v));
  inviaPresto({ v, t });
}

/** Scelta arrivata da fuori (Planning, altro browser): non e' una scelta nuova. */
function daFuori(scelta) {
  const prima = temaScelto();
  scrivi(K, A_CS[scelta.v]);
  scrivi(KT, String(scelta.t));
  if (scelta.v !== prima) inDissolvenza(() => attributi(scelta.v));
}

/** Confronta con il profilo: il piu' recente vince, e il nostro, se e' piu' nuovo, parte. */
export function allineaTema(meta) {
  const remoto = temaDalProfilo(meta);
  if (daApplicare(remoto, istanteScelta())) return daFuori(remoto);
  if (daInviare(remoto, istanteScelta())) inviaPresto({ v: temaScelto(), t: istanteScelta() });
}

let ultimaLettura = 0;
/** All'avvio: gli attributi prima di tutto il resto, poi l'ascolto delle altre schede. */
export function temaIniziale() {
  attributi(temaScelto());
  // un'altra scheda dello stesso sito (tracker o generatori) ha cambiato tema
  addEventListener('storage', e => {
    if (e.key === K) inDissolvenza(() => attributi(temaScelto()));
  });
  // tornando sulla scheda (magari dal Planning, dove si e' cambiato tema)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible' || !nuvola.attiva() || !nuvola.haSessione()) return;
    const ora = Date.now();
    if (ora - ultimaLettura < 60000) return;
    ultimaLettura = ora;
    nuvola.metadatiFreschi().then(m => { if (m) allineaTema(m); }).catch(() => { });
  });
}

/** Dopo il primo caricamento il token e' fresco: dentro c'e' il tema del profilo. */
export function allineaDalToken() {
  if (!nuvola.attiva() || !nuvola.haSessione()) return;
  const m = nuvola.metadatiSessione();
  if (m) allineaTema(m);
}

/** Il bottone del tema apre il controllo a tre posizioni. */
export function collegaTema(bottone = document.getElementById('tema')) {
  if (!bottone) return;
  bottone.onclick = () => apri(bottone, finestraTema(), 'destra');
}

function finestraTema() {
  const v = temaScelto();
  return h('div.vrs-app-pop.stretta', { role: 'dialog', 'aria-label': 'Tema', id: 'tema-pop' },
    h('div.vrs-tema', {},
      h('span.vrs-tema-et', { id: 'tema-et', testo: 'Tema' }),
      h('div.vrs-seg', { role: 'group', 'aria-labelledby': 'tema-et' }, TEMI.map(t =>
        h('button', {
          type: 'button', 'data-theme': t, 'aria-pressed': String(t === v),
          title: t === 'auto' ? 'Segue il sistema' : ETICHETTA_TEMA[t],
          onclick: () => scegliTema(t),
          html: svg(ICO_TEMA[t], 16) + '<span>' + ETICHETTA_TEMA[t] + '</span>',
        })))));
}
