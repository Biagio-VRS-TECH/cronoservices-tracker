// @ts-check
/* ============================================================================
   vrs-comunicazioni.js — le «Comunicazioni» dell'amministrazione, anche qui
   ----------------------------------------------------------------------------
   Nel Planning l'amministrazione pubblica le comunicazioni (migrazione 051 del
   Planning, erano gli «Avvisi»). Ognuna ha una priorità (bassa · normale · alta)
   e una consegna:
     · popup       → si apre da sola, una alla volta, e resta finché non si
                     spunta «Ho letto»;
     · silenziosa  → finisce solo nella casella, col numero sul tasto.
   La spunta «Ho letto» si registra per persona (pl_comunicazione_letta) e vale
   in tutte le app: spuntata qui, nel Planning non si ripresenta.

   Modulo senza framework e senza dipendenze (solo ./vrs-icone.js), sul modello
   di vrs-novita.js: chi lo monta passa le tre cose che toccano la rete, così il
   modulo non sa niente di Supabase e le prove lo usano con risposte finte.
     carica()     → { ok, stato, dati }  dati = righe di pl_comunicazioni_mie
     conferma(id) → { ok, stato, dati }  dati = l'istante registrato
     ascolta(fn)  → funzione per smettere; chiama fn a ogni cambio (tempo reale)

   Tre pezzi:
     · il TASTO con la campanella nella testata e il numero delle comunicazioni
       ancora da spuntare (forma e testo, non solo colore; il nome accessibile
       lo dice). Non compare finché la prima lettura non va a buon fine: senza
       sessione, offline, o con le funzioni non ancora sul database resta
       nascosto, senza errori;
     · la CASELLA: l'elenco, dal più recente, con priorità, data, mittente,
       testo espandibile e la casella «Ho letto». Sul telefono è un foglio dal
       basso con «Chiudi» sotto il pollice;
     · il POPUP delle consegne `popup` ancora da spuntare: una alla volta
       («1 di 3»), non si chiude con Esc né con un clic fuori finché non si
       spunta; il fuoco resta dentro e poi torna dov'era. Si apre solo quando
       la pagina è libera (nessun'altra finestra, nessun campo in scrittura,
       scheda in vista): la stessa regola delle Novità.
   Gli stili sono in css/vrs-comunicazioni.css.
   ========================================================================== */

import { PERCORSI } from './vrs-icone.js';

/**
 * @typedef {'bassa'|'normale'|'alta'} Priorita
 * @typedef {{
 *   id: string, titolo: string, testo: string, priorita: Priorita, consegna: 'popup'|'silenziosa',
 *   pubblicata_il: string|null, aggiornata_il: string|null, mittente: string,
 *   letta_il: string|null, confermata_il: string|null,
 * }} Comunicazione
 * @typedef {{ ok: boolean, stato?: number, dati?: any }} Esito
 * @typedef {{
 *   carica: () => Promise<Esito>,
 *   conferma: (id: string) => Promise<Esito>,
 *   ascolta?: ((fn: (x?: unknown) => void) => (() => void)) | null,
 *   occupato?: () => boolean,
 *   ritardo?: number,
 * }} Opzioni
 */

/** Le tre priorità: il nome si legge sempre, il colore lo accompagna soltanto */
export const PRIORITA = /** @type {const} */ ({
  alta: { nome: 'Priorità alta', breve: 'Alta', ordine: 0 },
  normale: { nome: 'Priorità normale', breve: 'Normale', ordine: 1 },
  bassa: { nome: 'Priorità bassa', breve: 'Bassa', ordine: 2 },
});

/** Oltre questa lunghezza (o queste righe) il testo nella casella parte chiuso */
export const TESTO_LUNGO = 220;
const RIGHE_LUNGHE = 4;

/* ------------------------------------------------------------- i dati --- */

const testo = (/** @type {unknown} */ x) => (typeof x === 'string' ? x.trim() : '');
const istante = (/** @type {unknown} */ x) =>
  typeof x === 'string' && x && !Number.isNaN(new Date(x).getTime()) ? x : null;

/**
 * Le righe di pl_comunicazioni_mie ripulite: solo quelle con id e titolo, una volta sola,
 * nell'ordine in cui arrivano (la più recente in cima). Una risposta rotta dà un elenco vuoto.
 * @param {unknown} righe @returns {Comunicazione[]}
 */
export function normalizza(righe) {
  /** @type {Comunicazione[]} */
  const fuori = [];
  const visti = new Set();
  for (const r of Array.isArray(righe) ? righe : []) {
    if (!r || typeof r !== 'object') continue;
    const id = testo(/** @type {any} */ (r).id) || (typeof r.id === 'number' ? String(r.id) : '');
    const titolo = testo(r.titolo);
    if (!id || !titolo || visti.has(id)) continue;
    visti.add(id);
    fuori.push({
      id, titolo,
      testo: testo(r.testo),
      priorita: r.priorita === 'alta' || r.priorita === 'bassa' ? r.priorita : 'normale',
      consegna: r.consegna === 'popup' ? 'popup' : 'silenziosa',
      pubblicata_il: istante(r.pubblicata_il),
      aggiornata_il: istante(r.aggiornata_il),
      mittente: testo(r.mittente),
      letta_il: istante(r.letta_il),
      confermata_il: istante(r.confermata_il),
    });
  }
  return fuori;
}

/** Quante non hanno ancora la spunta «Ho letto»: il numero sul tasto */
export const daLeggere = (/** @type {Comunicazione[]} */ lista) => lista.filter((c) => !c.confermata_il).length;

const tempo = (/** @type {string|null} */ x) => (x ? new Date(x).getTime() : 0);

/**
 * I popup ancora da spuntare, nell'ordine in cui si mostrano: prima le alte, poi dalla più vecchia
 * (si leggono nell'ordine in cui sono state scritte).
 * @param {Comunicazione[]} lista
 */
export function daConfermare(lista) {
  return lista
    .filter((c) => c.consegna === 'popup' && !c.confermata_il)
    .sort((a, b) => PRIORITA[a.priorita].ordine - PRIORITA[b.priorita].ordine
      || tempo(a.pubblicata_il) - tempo(b.pubblicata_il));
}

/**
 * Le funzioni non ci sono ancora sul database (migrazione non applicata, o applicata a metà):
 * il tasto non compare e non si segnala niente. PostgREST dice 404 (PGRST202); Postgres 42883.
 * @param {Esito|null|undefined} r
 */
export function funzioneAssente(r) {
  if (!r || r.ok) return false;
  const m = String(r.dati?.errore || r.dati?.message || r.dati?.code || '');
  return r.stato === 404 || /PGRST202|42883|42P01|could not find the function|does not exist/i.test(m);
}

const FORMATO = new Intl.DateTimeFormat('it-IT', {
  day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit',
});
const FORMATO_BREVE = new Intl.DateTimeFormat('it-IT', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
/** «24 settembre 2026 alle ore 10:32» (Intl, italiano, ora di chi legge) */
export function quando(/** @type {string|null} */ iso, breve = false) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return (breve ? FORMATO_BREVE : FORMATO).format(d);
}

/** Modificata dopo la pubblicazione (più di un minuto dopo) */
export const modificata = (/** @type {Comunicazione} */ c) =>
  !!c.aggiornata_il && tempo(c.aggiornata_il) - tempo(c.pubblicata_il) > 60000;

/** Il nome accessibile del tasto */
export function etichettaTasto(/** @type {number} */ n) {
  if (!n) return 'Comunicazioni: nessuna da leggere';
  return `Comunicazioni: ${n === 1 ? 'una da leggere' : n + ' da leggere'}`;
}

/** Il numero sul tasto: oltre 9 si scrive «9+» */
export const numeroTasto = (/** @type {number} */ n) => (n > 9 ? '9+' : String(n));

/** Un testo da aprire: lungo, o con molte righe */
export const testoLungo = (/** @type {string} */ t) => t.length > TESTO_LUNGO || t.split('\n').length > RIGHE_LUNGHE;

/* ------------------------------------------------------------ il disegno -- */

/**
 * Un elemento con attributi e figli. `testo` è textContent (mai HTML), `html` solo per le icone.
 * @param {string} tag @param {Record<string, any>} [attr] @param {...(Node|string|null|false|undefined)} figli
 */
function el(tag, attr = {}, ...figli) {
  const [nome, ...classi] = tag.split('.');
  const n = document.createElement(nome || 'div');
  if (classi.length) n.className = classi.join(' ');
  for (const [k, v] of Object.entries(attr)) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'testo') n.textContent = String(v);
    else if (k === 'html') n.innerHTML = v;
    else if (k.startsWith('on') && typeof v === 'function') n.addEventListener(k.slice(2), v);
    else n.setAttribute(k, v === true ? '' : String(v));
  }
  for (const f of figli) if (f) n.append(f);
  return n;
}

/** @param {string} d @param {number} [px] */
const svg = (d, px = 20) =>
  `<svg width="${px}" height="${px}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" ` +
  `stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="${d}"/></svg>`;

const ICO_PRIORITA = { alta: PERCORSI.avviso, normale: PERCORSI.info, bassa: PERCORSI.meno };

const FOCUSABILI = 'a[href],button:not([disabled]),input:not([disabled]),summary,[tabindex]:not([tabindex="-1"])';
const EDITABILE = 'input,textarea,select,[contenteditable=""],[contenteditable="true"]';

let uid = 0;

/**
 * Monta il tasto «Comunicazioni» in `posto`, legge l'elenco e, se ci sono popup da spuntare,
 * li apre appena la pagina è libera.
 * @param {HTMLElement} posto @param {Opzioni} opz
 */
export function montaComunicazioni(posto, opz) {
  const { carica, conferma, ascolta = null, ritardo = 900 } = opz;
  const id = 'vrs-com-' + (++uid);
  /** @type {Comunicazione[]} */
  let lista = [];
  /** @type {'attesa'|'assente'|'pronto'} */
  let stato = 'attesa';
  let smontato = false, leggendo = false, rileggere = false, erroreLettura = false, ultimaLettura = 0;
  /** @type {(() => void) | null} */
  let staccaAscolto = null;
  /** @type {ReturnType<typeof setTimeout> | undefined} */
  let attesa;
  /** @type {ReturnType<typeof setTimeout> | undefined} */
  let presto;
  /** gli id in registrazione adesso, e quelli che non sono passati (col motivo) */
  const inCorso = new Set();
  /** @type {Map<string, string>} */
  const errori = new Map();
  /** i testi lunghi aperti nella casella */
  const aperti = new Set();

  /**
   * @typedef {{ velo: HTMLElement, box: HTMLElement, ritorno: Element | null, tasti: (e: KeyboardEvent) => void }} Finestra
   * @type {Finestra | null} */
  let casella = null;
  /** @type {(Finestra & { corrente: string, fatte: number }) | null} */
  let popup = null;

  /* ---- il tasto ---- */
  const numero = el('span.vrs-com-n', { 'aria-hidden': 'true' });
  const bottone = /** @type {HTMLButtonElement} */ (el('button.vrs-com-btn', {
    type: 'button', 'aria-haspopup': 'dialog', 'aria-expanded': 'false', title: 'Comunicazioni dell\'amministrazione',
    'aria-label': etichettaTasto(0), 'data-nuove': 'no',
    onclick: () => (casella ? chiudiCasella() : apriCasella()),
  }, el('span.vrs-com-btn-ico', { html: svg(PERCORSI.campanella, 18) }), el('span.vrs-com-et', { testo: 'Comunicazioni' }), numero));
  bottone.hidden = true;
  // quello che succede senza che si veda (registrata, errore, tutte lette) si dice qui
  const annuncio = el('span.vrs-com-annuncio', { 'aria-live': 'polite', role: 'status' });
  posto.append(bottone, annuncio);
  const annuncia = (/** @type {string} */ t) => {
    annuncio.textContent = '';
    setTimeout(() => { if (!smontato) annuncio.textContent = t; }, 60);
  };

  function aggiornaTasto() {
    const n = daLeggere(lista);
    bottone.hidden = stato !== 'pronto';
    bottone.setAttribute('data-nuove', n ? 'si' : 'no');
    bottone.setAttribute('aria-label', etichettaTasto(n));
    numero.textContent = n ? numeroTasto(n) : '';
  }

  /* ---- la lettura ---- */
  async function leggi() {
    if (smontato) return;
    if (leggendo) { rileggere = true; return; }
    leggendo = true;
    ultimaLettura = Date.now();
    /** @type {Esito | null} */
    let r = null;
    try { r = await carica(); } catch { r = null; }   // rete giù: si riprova al prossimo giro
    leggendo = false;
    if (smontato) return;
    if (r && r.ok) {
      lista = normalizza(r.dati);
      stato = 'pronto';
      erroreLettura = false;
      avviaAscolto();
    } else if (funzioneAssente(r)) {
      stato = 'assente';
      lista = [];
      fermaAscolto();
      if (casella) chiudiCasella();
      if (popup) chiudiPopup();
    } else {
      erroreLettura = true;                           // si tiene l'elenco di prima
      // mai letto (partiti senza rete): si riprova da soli fra un minuto
      if (stato === 'attesa') { clearTimeout(presto); presto = setTimeout(leggi, 60000); }
    }
    aggiornaTasto();
    ridisegna();
    if (stato === 'pronto') programma();
    if (rileggere) { rileggere = false; leggi(); }
  }
  /** una raffica di cambi (pubblica + modifica) fa una lettura sola */
  function leggiPresto(tra = 350) {
    clearTimeout(presto);
    presto = setTimeout(leggi, tra);
  }

  function avviaAscolto() {
    if (staccaAscolto || !ascolta) return;
    try { staccaAscolto = ascolta(() => leggiPresto()); } catch { staccaAscolto = null; }
  }
  function fermaAscolto() {
    try { staccaAscolto?.(); } catch { /* niente */ }
    staccaAscolto = null;
  }

  /* ---- la registrazione di «Ho letto» ---- */
  async function segnaLetta(/** @type {string} */ cid) {
    if (inCorso.has(cid)) return;
    inCorso.add(cid);
    errori.delete(cid);
    ridisegna();
    /** @type {Esito | null} */
    let r = null;
    try { r = await conferma(cid); } catch { r = null; }
    inCorso.delete(cid);
    if (smontato) return;
    if (r && r.ok) {
      const ora = typeof r.dati === 'string' && istante(r.dati) ? r.dati : new Date().toISOString();
      lista = lista.map((c) => (c.id === cid ? { ...c, confermata_il: c.confermata_il || ora, letta_il: c.letta_il || ora } : c));
      if (popup && popup.corrente === cid) popup.fatte++;
      annuncia(daLeggere(lista) ? 'Segnata come letta.' : 'Segnata come letta. Non ce ne sono altre da leggere.');
    } else {
      const motivo = 'Non registrata: controlla il collegamento e riprova.';
      errori.set(cid, motivo);
      annuncia(motivo);
    }
    aggiornaTasto();
    ridisegna();
  }

  /** La casella «Ho letto»: spuntata e bloccata se c'è già, con la rotella mentre parte */
  function casellaLetto(/** @type {Comunicazione} */ c, grande = false) {
    const fatta = !!c.confermata_il;
    const occupata = inCorso.has(c.id);
    const input = /** @type {HTMLInputElement} */ (el('input', {
      type: 'checkbox', 'data-chiave': c.id + ':letto', 'data-fuoco': fatta ? undefined : '',
      'aria-describedby': errori.has(c.id) ? id + '-err-' + c.id : undefined,
    }));
    input.checked = fatta || occupata;
    input.disabled = fatta || occupata;
    input.addEventListener('change', () => {
      if (input.checked) segnaLetta(c.id);
    });
    const dopo = fatta
      ? el('span.vrs-com-letto-quando', { testo: quando(c.confermata_il, true) })
      : occupata ? el('span.vrs-com-rotella', { 'aria-hidden': 'true' }) : null;
    return el('label.vrs-com-letto' + (grande ? '.grande' : ''), { 'data-stato': fatta ? 'fatta' : occupata ? 'invio' : 'da-fare' },
      input, el('span.vrs-com-letto-et', { testo: 'Ho letto' }), dopo);
  }

  const erroreDi = (/** @type {Comunicazione} */ c) => errori.has(c.id)
    ? el('p.vrs-com-err', { id: id + '-err-' + c.id, testo: errori.get(c.id) })
    : null;

  const priorita = (/** @type {Comunicazione} */ c) =>
    el('span.vrs-com-pri', { 'data-priorita': c.priorita },
      el('span.vrs-com-pri-ico', { 'aria-hidden': 'true', html: svg(ICO_PRIORITA[c.priorita], 14) }),
      el('span', { testo: PRIORITA[c.priorita].nome }));

  const meta = (/** @type {Comunicazione} */ c) => el('p.vrs-com-meta', {},
    c.pubblicata_il ? el('time', { datetime: c.pubblicata_il, testo: quando(c.pubblicata_il) }) : null,
    el('span', { testo: c.mittente ? 'da ' + c.mittente : 'dall\'amministrazione' }),
    modificata(c) ? el('span', { testo: 'aggiornata ' + quando(c.aggiornata_il, true) }) : null);

  /* ---- la pagina libera ---- */
  const occupata = () =>
    document.visibilityState === 'hidden' ||
    !!document.querySelector?.('[aria-modal="true"], .tour-root') ||
    !!document.activeElement?.matches?.(EDITABILE) ||
    !!opz.occupato?.();
  function programma(tra = ritardo) {
    clearTimeout(attesa);
    attesa = setTimeout(() => {
      if (smontato || popup || !daConfermare(lista).length) return;
      if (occupata()) return programma(2500);
      apriPopup();
    }, tra);
  }

  /* ---- le finestre: trappola del Tab, fuoco che torna ---- */
  /** @param {HTMLElement} box @param {KeyboardEvent} e */
  function giraTab(box, e) {
    const f = /** @type {HTMLElement[]} */ ([...box.querySelectorAll(FOCUSABILI)]).filter((x) => x.getClientRects().length);
    if (!f.length) { e.preventDefault(); box.focus(); return; }
    const primo = f[0], ultimo = f[f.length - 1];
    if (e.shiftKey && (document.activeElement === primo || !box.contains(document.activeElement))) { e.preventDefault(); ultimo.focus(); }
    else if (!e.shiftKey && (document.activeElement === ultimo || !box.contains(document.activeElement))) { e.preventDefault(); primo.focus(); }
  }
  const restituisci = (/** @type {Element | null} */ ritorno) => {
    const r = /** @type {HTMLElement | null} */ (ritorno);
    if (r && r.isConnected && r !== document.body && typeof r.focus === 'function') r.focus();
    else if (!bottone.hidden) bottone.focus();
  };
  /* il popup ferma lo scorrimento della pagina sotto; la casella solo sul telefono (foglio dal
     basso), sul computer resta una tendina e la barra di scorrimento non deve sparire */
  const bloccaPagina = () => {
    document.documentElement.classList.toggle('vrs-com-popup', !!popup);
    document.documentElement.classList.toggle('vrs-com-casella', !!casella);
  };

  /* ---- la casella ---- */
  function apriCasella() {
    if (smontato || stato !== 'pronto' || casella) return;
    const box = el('div.vrs-com', { role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': id + '-tit', tabindex: '-1' });
    const velo = el('div.vrs-com-velo', {}, box);
    velo.addEventListener('mousedown', (e) => { if (e.target === velo) chiudiCasella(); });
    const tasti = (/** @type {KeyboardEvent} */ e) => {
      if (!casella || popup) return;
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); chiudiCasella(); return; }
      if (e.key === 'Tab') giraTab(box, e);
    };
    document.addEventListener('keydown', tasti, true);
    casella = { velo, box, ritorno: bottone, tasti };
    piazza();
    document.body.append(velo);
    bloccaPagina();
    bottone.setAttribute('aria-expanded', 'true');
    disegnaCasella();
    const primo = /** @type {HTMLElement | null} */ (box.querySelector('[data-fuoco]'));
    (primo || box).focus({ preventScroll: true });
    addEventListener('resize', piazza);
    if (erroreLettura || Date.now() - ultimaLettura > 15000) leggi(); // aprendo si guarda se c'è altro
  }

  /** Sul computer la casella scende dal tasto; sul telefono è un foglio dal basso (solo CSS) */
  function piazza() {
    if (!casella) return;
    const r = bottone.getBoundingClientRect?.();
    if (!r) return;
    casella.box.style.setProperty('--vrs-com-alto', Math.round(r.bottom + 8) + 'px');
    casella.box.style.setProperty('--vrs-com-destra', Math.round(Math.max(12, innerWidth - r.right)) + 'px');
  }

  function chiudiCasella() {
    if (!casella) return;
    const { velo, ritorno, tasti } = casella;
    casella = null;
    document.removeEventListener('keydown', tasti, true);
    removeEventListener('resize', piazza);
    velo.remove();
    bloccaPagina();
    bottone.setAttribute('aria-expanded', 'false');
    restituisci(ritorno);
    programma();                                       // un popup rimasto indietro può partire
  }

  function disegnaCasella() {
    if (!casella) return;
    const { box } = casella;
    // chi aveva il fuoco lo ritrova (la stessa casella «Ho letto», lo stesso «Mostra tutto»)
    const chiave = /** @type {HTMLElement | null} */ (document.activeElement)?.getAttribute?.('data-chiave');
    const corpoPrima = /** @type {HTMLElement | null} */ (box.querySelector('.vrs-com-corpo'));
    const scorso = corpoPrima ? corpoPrima.scrollTop : 0;
    const n = daLeggere(lista);
    const testa = el('header.vrs-com-testa', {},
      el('span.vrs-com-testa-ico', { 'aria-hidden': 'true', html: svg(PERCORSI.campanella, 18) }),
      el('div.vrs-com-testa-testi', {},
        el('h2.vrs-com-tit', { id: id + '-tit', testo: 'Comunicazioni' }),
        el('p.vrs-com-sotto', { testo: !lista.length ? 'Dall\'amministrazione' : n ? (n === 1 ? 'Una da leggere' : n + ' da leggere') : 'Tutte lette' })),
      el('button.vrs-com-x', { type: 'button', 'aria-label': 'Chiudi le comunicazioni', title: 'Chiudi (Esc)', onclick: chiudiCasella, html: svg(PERCORSI.chiudi, 18) }));
    const nota = erroreLettura
      ? el('p.vrs-com-nota', {},
        el('span', { testo: 'Non riesco ad aggiornare l\'elenco: riprovo da solo.' }),
        el('button.vrs-com-riprova', { type: 'button', 'data-chiave': 'riprova', testo: 'Riprova', onclick: () => leggi() }))
      : null;
    const corpo = el('div.vrs-com-corpo', {}, nota, lista.length
      ? el('ul.vrs-com-lista', {}, ...lista.map(voce))
      : el('div.vrs-com-vuoto', {},
        el('span.vrs-com-vuoto-ico', { 'aria-hidden': 'true', html: svg(PERCORSI.campanella, 28) }),
        el('b', { testo: 'Nessuna comunicazione' }),
        el('p', { testo: 'Quando l\'amministrazione ne pubblica una, la trovi qui. Quelle importanti si aprono da sole.' })));
    const piede = el('footer.vrs-com-piede', {},
      el('button.vrs-com-chiudi', { type: 'button', 'data-chiave': 'chiudi', testo: 'Chiudi', onclick: chiudiCasella }));
    box.replaceChildren(testa, corpo, piede);
    corpo.scrollTop = scorso;
    if (chiave) {
      const di = /** @type {HTMLElement | null} */ ([...box.querySelectorAll('[data-chiave]')].find((x) => x.getAttribute('data-chiave') === chiave) || null);
      if (di && !(/** @type {HTMLInputElement} */ (di).disabled)) di.focus({ preventScroll: true });
      else (/** @type {HTMLElement | null} */ (box.querySelector('[data-fuoco]')) || box).focus({ preventScroll: true });
    }
  }

  function voce(/** @type {Comunicazione} */ c) {
    const lungo = testoLungo(c.testo);
    const aperto = aperti.has(c.id);
    const idTesto = id + '-t-' + c.id;
    const corpoTesto = c.testo
      ? el('div.vrs-com-testo', { id: idTesto, 'data-chiuso': lungo && !aperto ? 'si' : undefined, testo: c.testo })
      : null;
    const espandi = c.testo && lungo
      ? el('button.vrs-com-espandi', {
        type: 'button', 'aria-expanded': String(aperto), 'aria-controls': idTesto, 'data-chiave': c.id + ':testo',
        testo: aperto ? 'Mostra meno' : 'Mostra tutto',
        onclick: () => { if (aperti.has(c.id)) aperti.delete(c.id); else aperti.add(c.id); disegnaCasella(); },
      })
      : null;
    return el('li', {}, el('article.vrs-com-voce', {
      'data-priorita': c.priorita, 'data-letta': c.confermata_il ? 'si' : 'no', 'aria-labelledby': idTesto + '-tit',
    },
    el('div.vrs-com-voce-su', {}, priorita(c),
      c.consegna === 'popup' && !c.confermata_il ? el('span.vrs-com-tipo', { testo: 'Da confermare' }) : null),
    el('h3.vrs-com-voce-tit', { id: idTesto + '-tit', testo: c.titolo }),
    meta(c),
    corpoTesto, espandi,
    el('div.vrs-com-voce-giu', {}, casellaLetto(c), erroreDi(c))));
  }

  /* ---- il popup ---- */
  function apriPopup() {
    const coda = daConfermare(lista);
    if (smontato || popup || !coda.length) return;
    const box = el('div.vrs-com-pop', { role: 'alertdialog', 'aria-modal': 'true', 'aria-labelledby': id + '-ptit', 'aria-describedby': id + '-ptesto', tabindex: '-1' });
    const velo = el('div.vrs-com-velo.forte', {}, box);
    // un clic fuori non chiude: ricorda che cosa serve per andare avanti
    velo.addEventListener('mousedown', (e) => { if (e.target === velo) { e.preventDefault(); richiama(); } });
    const tasti = (/** @type {KeyboardEvent} */ e) => {
      if (!popup) return;
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); richiama(); return; }
      if (e.key === 'Tab') giraTab(box, e);
    };
    document.addEventListener('keydown', tasti, true);
    popup = { velo, box, ritorno: document.activeElement, tasti, corrente: coda[0].id, fatte: 0 };
    document.body.append(velo);
    bloccaPagina();
    disegnaPopup(true);
  }

  function richiama() {
    if (!popup) return;
    const nota = popup.box.querySelector('.vrs-com-pop-nota');
    if (nota) {
      nota.textContent = 'Per andare avanti spunta «Ho letto».';
      nota.classList.remove('scossa');
      void (/** @type {HTMLElement} */ (nota)).offsetWidth;   // la scossa riparte anche al secondo Esc
      nota.classList.add('scossa');
    }
    /** @type {HTMLElement | null} */ (popup.box.querySelector('.vrs-com-letto input:not([disabled])'))?.focus();
  }

  function chiudiPopup() {
    if (!popup) return;
    const { velo, ritorno, tasti } = popup;
    popup = null;
    document.removeEventListener('keydown', tasti, true);
    velo.remove();
    bloccaPagina();
    restituisci(ritorno);
  }

  /** @param {boolean} [nuova] la comunicazione è cambiata: il fuoco riparte dall'inizio */
  function disegnaPopup(nuova = false) {
    if (!popup) return;
    const coda = daConfermare(lista);
    // quella in vista è appena stata spuntata (qui o altrove), o archiviata: si passa alla prossima
    const cur = lista.find((c) => c.id === popup?.corrente);
    const inAttesa = cur && inCorso.has(cur.id);
    let c = cur && (inAttesa || !cur.confermata_il) ? cur : null;
    if (!c) {
      if (!coda.length) { chiudiPopup(); return; }
      c = coda[0];
      popup.corrente = c.id;
      nuova = true;
    }
    const { box } = popup;
    // ridisegnando la stessa (il tempo reale ha riletto) chi stava leggendo il testo resta lì
    const corpoPrima = /** @type {HTMLElement | null} */ (box.querySelector('.vrs-com-pop-corpo'));
    const leggeva = !!corpoPrima && document.activeElement === corpoPrima;
    const scorso = corpoPrima ? corpoPrima.scrollTop : 0;
    const rimaste = coda.filter((x) => x.id !== c.id).length;
    const totale = popup.fatte + 1 + rimaste;
    const testa = el('header.vrs-com-pop-testa', { 'data-priorita': c.priorita },
      el('p.vrs-com-pop-sopra', {},
        el('span', { testo: 'Comunicazione' }),
        totale > 1 ? el('span.vrs-com-pop-conta', { testo: `${popup.fatte + 1} di ${totale}` }) : null),
      priorita(c),
      el('h2.vrs-com-pop-tit', { id: id + '-ptit', tabindex: '-1', testo: c.titolo }),
      meta(c));
    const corpo = el('div.vrs-com-pop-corpo', { tabindex: '0', 'aria-label': 'Testo della comunicazione' },
      el('div.vrs-com-testo', { id: id + '-ptesto', testo: c.testo || 'Nessun testo oltre al titolo.' }));
    const piede = el('footer.vrs-com-pop-piede', {},
      el('p.vrs-com-pop-nota', { 'aria-live': 'polite', testo: errori.get(c.id) || (rimaste ? 'Spunta «Ho letto» per passare alla successiva.' : 'Spunta «Ho letto» per chiudere.') }),
      casellaLetto(c, true));
    box.replaceChildren(testa, corpo, piede);
    box.scrollTop = 0;
    if (nuova) {
      corpo.scrollTop = 0;
      // un testo che non sta nella finestra prende il fuoco (si scorre da tastiera); se no la casella
      const lungo = corpo.scrollHeight > corpo.clientHeight + 4;
      const spunta = /** @type {HTMLElement | null} */ (box.querySelector('.vrs-com-letto input'));
      (lungo ? corpo : spunta || box).focus({ preventScroll: true });
    } else if (leggeva) {
      corpo.scrollTop = scorso;
      corpo.focus({ preventScroll: true });
    } else {
      corpo.scrollTop = scorso;
      // mentre parte la registrazione la casella è bloccata: il fuoco aspetta sulla finestra, non sul fondo
      (/** @type {HTMLElement | null} */ (box.querySelector('.vrs-com-letto input:not([disabled])')) || box).focus({ preventScroll: true });
    }
  }

  function ridisegna() {
    if (casella) disegnaCasella();
    if (popup) disegnaPopup();
  }

  /* ---- il ritorno sulla scheda ---- */
  const suVisibile = () => {
    if (document.visibilityState !== 'visible' || smontato) return;
    const pausa = stato === 'assente' ? 300000 : 10000;   // funzioni assenti: si riguarda ogni 5 minuti
    if (Date.now() - ultimaLettura > pausa) leggi();
  };
  document.addEventListener('visibilitychange', suVisibile);

  leggi();

  return {
    bottone,
    /** lo stato di adesso, per le prove */
    stato: () => ({ stato, lista: lista.slice(), casella: !!casella, popup: popup ? popup.corrente : null }),
    apri: apriCasella,
    chiudi: chiudiCasella,
    aggiorna: leggi,
    smonta() {
      smontato = true;
      clearTimeout(attesa);
      clearTimeout(presto);
      fermaAscolto();
      document.removeEventListener('visibilitychange', suVisibile);
      if (casella) { document.removeEventListener('keydown', casella.tasti, true); casella.velo.remove(); casella = null; }
      if (popup) { document.removeEventListener('keydown', popup.tasti, true); popup.velo.remove(); popup = null; }
      removeEventListener('resize', piazza);
      bloccaPagina();
      bottone.remove();
      annuncio.remove();
    },
  };
}
