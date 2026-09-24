// @ts-check  (COD-04: controllo dei tipi senza build, jsconfig.json nella radice)
/* famiglia.js - CronoService nella famiglia VRS.  #ANCHOR: famiglia

Tre cose, le stesse del Planning (web/src/components/AppSwitcher.tsx e
web/src/lib/temaCondiviso.ts nel repository del Planning):

 1. IL SELETTORE D'APP (VIS-05 / PRD-01). Il marchio in alto a sinistra e'
    anche il pulsante che apre le app VRS: Planning, CronoService, Scheduler.
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
import { montaNovita, chiaveMetadati } from './vrs-novita.js';
import { montaComunicazioni } from './vrs-comunicazioni.js';

/* ------------------------------------------------------------- le app --- */
/* Gli indirizzi degli altri due siti. Con i sottodomini (planning.app.vrs-tech.it,
   scheduler.app.vrs-tech.it: docs/accesso-unico.md del Planning) si cambiano qui,
   come nel Planning si cambiano VITE_PLANNING_URL e VITE_SCHEDULER_URL.
   Lo Scheduler e' il planning dei cantieri, sito a se' dal 24/09/2026. */
const PLANNING = 'https://vrs-planning.netlify.app/';
const SCHEDULER = 'https://vrs-scheduler.netlify.app/';

export const APP_FAMIGLIA = [
  { id: 'planning', nome: 'Planning', nota: 'Attività, assenze e calendario', to: PLANNING,
    ico: 'M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10M12 2.5v2M12 19.5v2M21.5 12h-2M4.5 12h-2M18.7 5.3l-1.4 1.4M6.7 17.3l-1.4 1.4M18.7 18.7l-1.4-1.4M6.7 6.7 5.3 5.3M10 12.2l1.5 1.5 2.7-2.9' },
  { id: 'cronoservice', nome: 'CronoService', nota: 'Mappature e checklist del service', to: '/',
    ico: 'M12 3.5a8.5 8.5 0 1 0 8.5 8.5M12 7.2V12l3.2 1.9M16.4 5.2l2 2 3.4-3.6' },
  { id: 'scheduler', nome: 'Scheduler', nota: 'Planning di cantieri e manutenzioni', to: SCHEDULER,
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
        h('a.vrs-app-voce', { href: qui ? a.to : conTema(a.to), ...(qui ? { 'aria-current': 'page' } : {}) },
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

let invio = null, inAttesa = null;
function inviaPresto(scelta) {
  if (!nuvola.attiva() || !nuvola.haSessione()) return;
  clearTimeout(invio);
  inAttesa = scelta;
  // tre clic di fila fanno una richiesta sola; lasciando la finestra parte subito
  invio = setTimeout(parti, 800);
}
function parti() {
  clearTimeout(invio);
  invio = null;
  const s = inAttesa;
  inAttesa = null;
  if (s) nuvola.salvaMetadati({ [TEMA_META]: s }).catch(() => { /* resta su questo browser */ });
}

/* IL TEMA NEI LINK VERSO LE ALTRE APP (#ANCHOR: tema-avvio). Chi passa al
   Planning o allo Scheduler porta la scelta nell'indirizzo, `?vrs_tema=dark.<ms>`:
   lo script d'avvio di la' la applica prima di disegnare, se e' piu' recente
   della sua. Senza una scelta fatta qui l'indirizzo resta com'e'. */
export function conTema(url) {
  const t = istanteScelta();
  if (!t) return url;
  try {
    const u = new URL(url, location.href);
    u.searchParams.set('vrs_tema', temaScelto() + '.' + t);
    return u.toString();
  } catch { return url; }
}

/* Con i sottodomini (docs/accesso-unico.md del Planning) la scelta va anche nel
   cookie `vrs_tema` del dominio padre, che gli script d'avvio leggono: niente
   lampo neanche aprendo un'app dal segnalibro. Su *.netlify.app il browser non
   accetta cookie comuni: li' restano indirizzo e profilo. */
const DOMINIO_FAMIGLIA = 'app.vrs-tech.it';
function scriviCookie(scelta) {
  if (location.hostname !== DOMINIO_FAMIGLIA && !location.hostname.endsWith('.' + DOMINIO_FAMIGLIA)) return;
  try {
    document.cookie = `vrs_tema=${scelta.v}.${scelta.t}; Domain=.${DOMINIO_FAMIGLIA}; Path=/; Max-Age=31536000; Secure; SameSite=Lax`;
  } catch { /* cookie bloccati */ }
}

/** Scelta fatta qui, adesso: si applica, si ricorda con l'istante e va nel profilo. */
export function scegliTema(v, { sfuma = true } = {}) {
  if (!TEMI.includes(v)) return;
  const t = Date.now();
  scrivi(K, A_CS[v]);
  scrivi(KT, String(t));
  (sfuma ? inDissolvenza : f => f())(() => attributi(v));
  scriviCookie({ v, t });
  // subito alle altre app aperte, e nel profilo per quelle che si apriranno
  canaleTema?.manda({ v, t });
  inviaPresto({ v, t });
}

/** Scelta arrivata da fuori (Planning, altro browser): non e' una scelta nuova. */
function daFuori(scelta) {
  const prima = temaScelto();
  scrivi(K, A_CS[scelta.v]);
  scrivi(KT, String(scelta.t));
  scriviCookie(scelta);
  if (scelta.v !== prima) inDissolvenza(() => attributi(scelta.v));
}

/** Confronta con il profilo: il piu' recente vince, e il nostro, se e' piu' nuovo, parte. */
export function allineaTema(meta) {
  const remoto = temaDalProfilo(meta);
  if (daApplicare(remoto, istanteScelta())) return daFuori(remoto);
  if (daInviare(remoto, istanteScelta())) inviaPresto({ v: temaScelto(), t: istanteScelta() });
}

let ultimaLettura = 0, canaleTema = null;
/* Il profilo fresco: il piu' recente vince. Subito e ancora poco dopo (la
   scelta appena fatta nell'altra app puo' essere in viaggio), al massimo ogni
   5 secondi. Prima era una volta al minuto e solo cambiando scheda: con due
   app aperte fianco a fianco il tema non passava fino al ricarico (24/09/2026). */
function rileggiTema({ forza = false } = {}) {
  if (!nuvola.attiva() || !nuvola.haSessione()) return;
  const ora = Date.now();
  if (!forza && ora - ultimaLettura < 5000) return;
  ultimaLettura = ora;
  const leggi = () => nuvola.metadatiFreschi().then(m => { if (m) allineaTema(m); }).catch(() => { });
  leggi();
  setTimeout(leggi, 1500);
}

/** All'avvio: gli attributi prima di tutto il resto, poi l'ascolto delle altre schede e app. */
export function temaIniziale() {
  attributi(temaScelto());
  // un'altra scheda dello stesso sito (tracker o generatori) ha cambiato tema
  addEventListener('storage', e => {
    if (e.key === K) inDissolvenza(() => attributi(temaScelto()));
  });
  // tornando sulla scheda o sulla finestra (il clic sull'altro schermo non
  // cambia la visibilita' della scheda, il fuoco si')
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') rileggiTema();
    else parti();
  });
  addEventListener('focus', () => rileggiTema());
  addEventListener('blur', parti);
  addEventListener('pagehide', parti);
}

/* Le altre app aperte annunciano la loro scelta sul canale della persona: si
   apre dopo l'accesso (allineaDalToken), una volta sola. */
function ascoltaCanaleTema() {
  if (canaleTema || !nuvola.attiva() || !nuvola.haSessione()) return;
  canaleTema = nuvola.apriCanaleTema(x => {
    const s = x && typeof x === 'object' && TEMI.includes(x.v) && typeof x.t === 'number' && x.t > 0 ? { v: x.v, t: x.t } : null;
    if (daApplicare(s, istanteScelta())) daFuori(s);
  }, () => rileggiTema({ forza: true }));
}

/** Dopo il primo caricamento: prima il token (nessuna chiamata), poi l'utente
 *  FRESCO. Il token salvato qui puo' avere un'ora, e con lui il tema di un'ora
 *  fa: scelto lo scuro nel Planning e aperto CronoService pochi minuti dopo, qui
 *  restava il chiaro (24/09/2026). Chi arriva dal selettore ha gia' il tema
 *  giusto dall'indirizzo (tema-avvio.js); questa lettura copre il segnalibro. */
export function allineaDalToken() {
  if (!nuvola.attiva() || !nuvola.haSessione()) return;
  ascoltaCanaleTema();
  // dal token si APPLICA soltanto (se piu' recente): mandare la scelta di qui
  // perche' il token ne ha una piu' vecchia sovrascriveva nel profilo quella
  // fatta un minuto prima in un'altra app. Il confronto per l'invio lo fa la
  // rilettura fresca, subito dopo.
  const remoto = temaDalProfilo(nuvola.metadatiSessione());
  if (daApplicare(remoto, istanteScelta())) daFuori(remoto);
  ultimaLettura = Date.now();
  nuvola.metadatiFreschi().then(f => { if (f) allineaTema(f); }).catch(() => { });
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

/* ------------------------------------------------------------ le novita -- */
/* «Novita'»: il tasto con la stellina nella testata, il riassunto dopo ogni
   pubblicazione e il dettaglio con lo storico. Il modulo e' vrs-novita.js,
   IDENTICO a quello del Planning (e allo Scheduler); i contenuti sono in
   /novita.json, scritto a ogni pubblicazione (docs/novita.md del Planning).
   L'ultimo visto: in questo browser e, online, nei metadati dell'account
   (`vrs_novita_cronoservice`), come il tema: chi l'ha visto sul telefono non
   lo rivede sul computer. In locale (avvia.bat) resta di questo browser. */
let novita = null;
export function collegaNovita(posto = document.getElementById('novita-posto')) {
  if (!posto || novita) return;
  const chiave = chiaveMetadati('cronoservice');
  let meta = nuvola.attiva() && nuvola.haSessione() ? nuvola.metadatiSessione() : null;
  const remoto = nuvola.attiva() ? {
    leggi: () => (meta && typeof meta[chiave] === 'string' ? meta[chiave] : null),
    scrivi: id => (nuvola.haSessione() ? nuvola.salvaMetadati({ [chiave]: id }) : Promise.resolve(false))
      .then(ok => { if (ok) meta = { ...(meta || {}), [chiave]: id }; }),
  } : null;
  novita = montaNovita(posto, { app: 'cronoservice', nomeApp: 'CronoService', url: '/novita.json', remoto });
  // tornando sulla scheda: magari l'ha visto altrove (al massimo una lettura al minuto)
  let letto = 0;
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible' || !remoto || !nuvola.haSessione() || Date.now() - letto < 60000) return;
    letto = Date.now();
    nuvola.metadatiFreschi().then(m => { if (m) { meta = m; novita?.aggiorna(); } }).catch(() => { });
  });
}

/* ------------------------------------------------------ le comunicazioni -- */
/* «Comunicazioni» dell'amministrazione, pubblicate nel Planning (migrazione 051
   del Planning, erano gli «Avvisi»).  #ANCHOR: comunicazioni
   Il tasto con la campanella accanto a «Novita'», la casella con l'elenco e
   «Ho letto», il popup per quelle da confermare: tutto in vrs-comunicazioni.js.
   Solo online e con una sessione: in locale (avvia.bat) non c'e' nessun account
   a cui indirizzarle e il tasto non compare. Se le funzioni non sono ancora sul
   database (404) il tasto resta nascosto e non si segnala niente.
   Tempo reale: a ogni pubblicazione, modifica o archiviazione che mi riguarda
   cambia una mia riga di `pl_notifications` (la RLS fa vedere solo le proprie):
   la si ascolta su un canale a se' e si rilegge l'elenco. */
let comunicazioni = null;
export function collegaComunicazioni(posto = document.getElementById('comunicazioni-posto')) {
  if (!posto || comunicazioni || !nuvola.attiva() || !nuvola.haSessione()) return;
  const io = nuvola.idUtente();
  comunicazioni = montaComunicazioni(posto, {
    carica: () => nuvola.rpcLibera('pl_comunicazioni_mie', { p_limite: 30 }),
    conferma: id => nuvola.rpcLibera('pl_comunicazione_letta', { p_id: id }),
    ascolta: io ? avvisa => nuvola.ascoltaRighe(
      { tabella: 'pl_notifications', filtro: 'user_id=eq.' + io, canale: 'crono-comunicazioni' }, avvisa) : null,
    // le finestrelle di CronoService che non sono modali (popover delle spunte, selettore d'app, tema)
    occupato: () => !!document.querySelector('.pop, .vrs-app-pop'),
  });
}
