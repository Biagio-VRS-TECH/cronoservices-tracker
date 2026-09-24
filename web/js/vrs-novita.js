// @ts-check
/* ============================================================================
   vrs-novita.js — «Novità»: cosa è cambiato con l'ultimo aggiornamento
   ----------------------------------------------------------------------------
   IDENTICO nei due repository: planning/web/src/lib/vrs-novita.js e
   cronoservice/web/js/vrs-novita.js. Si cambia in uno e si copia nell'altro
   (lo controlla tests/unit/novita.test.ts del Planning).

   Modulo senza dipendenze (solo ./vrs-icone.js, che sta accanto in tutti e due i
   repository) e senza framework: il Planning e lo Scheduler lo montano da React
   (components/NovitaButton.tsx), CronoService dalla sua testata (js/app.js). Gli
   stili sono in vrs-app.css, anche quello identico.

   Tre pezzi:
     · il TASTO «Novità» nella testata, con un pallino (forma, non solo colore)
       e il nome accessibile che lo dice, finché c'è un aggiornamento non visto;
     · il RIASSUNTO: alla prima apertura dopo un aggiornamento (o al clic sul
       tasto) una finestra con le 3–5 novità principali. Si chiude con Esc, con
       un clic fuori, con «Ho capito»; si segna come visto appena si apre, quindi
       non torna per lo stesso aggiornamento;
     · il DETTAGLIO: «Vedi tutte le modifiche…» porta all'elenco completo
       (Novità · Miglioramenti · Bug risolti, sezioni pieghevoli) e allo storico
       degli aggiornamenti precedenti, sfogliabile.

   I contenuti: un file JSON per app, scritto a ogni pubblicazione (docs/novita.md
   del Planning). Il più recente in cima: è la versione in linea.
     { "app": "planning", "rilasci": [ { "id": "2026-09-24", "data": "2026-09-24",
       "titolo": "…", "evidenza": [ { "icona": "campanella", "titolo": "…",
       "testo": "…" } ], "novita": ["…"], "miglioramenti": ["…"],
       "correzioni": ["…"] } ] }

   L'ultimo visto: in localStorage (`vrs.novita.<app>`), subito e anche senza
   rete, e nei metadati dell'account (`vrs_novita_<app>`) tramite `remoto`, così
   chi l'ha visto sul computer non lo rivede sul telefono. Vince il più recente.
   ========================================================================== */

import { PERCORSI } from './vrs-icone.js';

/** La scintilla del tasto e della scena (griglia 24, stesse regole di vrs-icone.js) */
export const SCINTILLA = 'M10 2.5l1.9 5.6 5.6 1.9-5.6 1.9L10 17.5l-1.9-5.6L2.5 10l5.6-1.9zM18 15l.9 2.1 2.1.9-2.1.9-.9 2.1-.9-2.1-2.1-.9 2.1-.9z';

/** Le tre sezioni del dettaglio, nell'ordine in cui si leggono */
export const SEZIONI = /** @type {const} */ ([
  { chiave: 'novita', nome: 'Novità', ico: SCINTILLA },
  { chiave: 'miglioramenti', nome: 'Miglioramenti', ico: PERCORSI.su },
  { chiave: 'correzioni', nome: 'Bug risolti', ico: PERCORSI.spunta },
]);

/** Quante novità al massimo nel riassunto */
export const MAX_EVIDENZA = 5;

/**
 * @typedef {{ icona: string, titolo: string, testo: string }} Voce
 * @typedef {{ id: string, data: string, titolo: string, evidenza: Voce[],
 *   novita: string[], miglioramenti: string[], correzioni: string[] }} Rilascio
 * @typedef {{ leggi: () => (string | null | undefined), scrivi: (id: string) => unknown }} Remoto
 * @typedef {{
 *   app: string,
 *   nomeApp: string,
 *   dati?: unknown,
 *   url?: string,
 *   remoto?: Remoto | null,
 *   automatico?: boolean,
 *   occupato?: () => boolean,
 * }} Opzioni
 */

/* ------------------------------------------------------------- i dati --- */

const testo = (/** @type {unknown} */ x) => (typeof x === 'string' ? x.trim() : '');
const righe = (/** @type {unknown} */ x) => (Array.isArray(x) ? x.map(testo).filter(Boolean) : []);
const DATA = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Il file com'è arrivato, ripulito: solo i rilasci con id, data e titolo, nell'ordine del file
 * (il più recente in cima). Un file rotto dà un elenco vuoto, e il tasto resta senza pallino.
 * @param {unknown} dati
 * @returns {Rilascio[]}
 */
export function normalizza(dati) {
  const lista = dati && typeof dati === 'object' ? /** @type {any} */ (dati).rilasci : null;
  if (!Array.isArray(lista)) return [];
  /** @type {Rilascio[]} */
  const fuori = [];
  for (const r of lista) {
    if (!r || typeof r !== 'object') continue;
    const id = testo(r.id), data = testo(r.data), titolo = testo(r.titolo);
    if (!id || !DATA.test(data) || !titolo || fuori.some((x) => x.id === id)) continue;
    const evidenza = (Array.isArray(r.evidenza) ? r.evidenza : [])
      .map((/** @type {any} */ v) => ({ icona: testo(v?.icona), titolo: testo(v?.titolo), testo: testo(v?.testo) }))
      .filter((/** @type {Voce} */ v) => v.titolo);
    fuori.push({
      id, data, titolo, evidenza,
      novita: righe(r.novita), miglioramenti: righe(r.miglioramenti), correzioni: righe(r.correzioni),
    });
  }
  return fuori;
}

/**
 * Dei due «ultimo visto» (questo browser, l'account) il più recente; un id che il file non
 * conosce più non vince su uno che conosce.
 * @param {Rilascio[]} rilasci @param {(string|null|undefined)[]} ids
 */
export function piuRecente(rilasci, ...ids) {
  let meglio = null, posto = Infinity;
  for (const id of ids) {
    if (!id) continue;
    const i = rilasci.findIndex((r) => r.id === id);
    const p = i < 0 ? Infinity : i;
    if (meglio === null || p < posto) { meglio = id; posto = p; }
  }
  return meglio;
}

/**
 * I rilasci che chi legge non ha ancora visto, dal più recente. Chi non ha mai visto niente
 * (o ha un id che il file non ha più) vede solo l'ultimo: la storia intera sta nel dettaglio.
 * @param {Rilascio[]} rilasci @param {string|null|undefined} visto
 */
export function daVedere(rilasci, visto) {
  if (!rilasci.length) return [];
  const i = visto ? rilasci.findIndex((r) => r.id === visto) : -1;
  if (i === 0) return [];
  return i > 0 ? rilasci.slice(0, i) : rilasci.slice(0, 1);
}

/** Le novità del riassunto: quelle degli aggiornamenti non visti, le più recenti prima. */
export function inEvidenza(/** @type {Rilascio[]} */ elenco) {
  return elenco.flatMap((r) => r.evidenza).slice(0, MAX_EVIDENZA);
}

const FORMATO = { lunga: { day: 'numeric', month: 'long', year: 'numeric' }, corta: { day: 'numeric', month: 'short' } };
/**
 * «24 settembre 2026» (Intl, italiano). A mezzogiorno: nessun fuso sposta il giorno.
 * @param {string} iso @param {'lunga'|'corta'} [come]
 */
export function dataItaliana(iso, come = 'lunga') {
  const d = new Date(iso + 'T12:00:00');
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat('it-IT', /** @type {Intl.DateTimeFormatOptions} */ (FORMATO[come])).format(d);
}

/* ------------------------------------------------------- l'ultimo visto -- */

export const chiaveLocale = (/** @type {string} */ app) => 'vrs.novita.' + app;
/** La chiave nei metadati dell'account di Supabase, la stessa nelle tre app */
export const chiaveMetadati = (/** @type {string} */ app) => 'vrs_novita_' + app;

const leggiLocale = (/** @type {string} */ k) => { try { return localStorage.getItem(k); } catch { return null; } };
const scriviLocale = (/** @type {string} */ k, /** @type {string} */ v) => { try { localStorage.setItem(k, v); } catch { /* navigazione privata */ } };

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

/** @param {string|undefined} d @param {number} [px] */
const svg = (d, px = 20) =>
  `<svg width="${px}" height="${px}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" ` +
  `stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="${d || SCINTILLA}"/></svg>`;

/** L'icona di una novità: un nome di vrs-icone.js o «scintilla»; un nome sconosciuto dà la scintilla */
export const icona = (/** @type {string} */ nome) => (nome && nome in PERCORSI ? /** @type {any} */ (PERCORSI)[nome] : SCINTILLA);

const FOCUSABILI = 'a[href],button:not([disabled]),summary,[tabindex]:not([tabindex="-1"])';
const EDITABILE = 'input,textarea,select,[contenteditable=""],[contenteditable="true"]';

/** Il riassunto largo o il foglio dal basso: decide anche quali sezioni partono aperte */
const stretto = () => typeof matchMedia === 'function' && matchMedia('(max-width: 639px)').matches;

let uid = 0;

/**
 * Monta il tasto «Novità» in `posto` e, se c'è un aggiornamento non visto, apre il riassunto
 * appena la pagina è libera (nessun'altra finestra, nessun campo in scrittura, scheda in vista).
 * @param {HTMLElement} posto
 * @param {Opzioni} opz
 */
export function montaNovita(posto, opz) {
  const { app, nomeApp, remoto = null, automatico = true } = opz;
  const kLocale = chiaveLocale(app);
  const id = 'vrs-nov-' + (++uid);
  /** @type {Rilascio[]} */
  let rilasci = [];
  let smontato = false;
  /** @type {{ velo: HTMLElement, box: HTMLElement, ritorno: Element | null, tasti: (e: KeyboardEvent) => void } | null} */
  let aperta = null;
  /** @type {number | undefined} */
  let attesa;
  /** @type {Rilascio[]} i rilasci che il riassunto racconta (i non visti, o l'ultimo) */
  let riassuntoDi = [];

  /* ---- il tasto ---- */
  const pallino = el('span.vrs-nov-pallino', { 'aria-hidden': 'true' });
  const bottone = /** @type {HTMLButtonElement} */ (el('button.vrs-nov-btn', {
    type: 'button', 'aria-haspopup': 'dialog', 'aria-expanded': 'false', title: 'Novità: cosa è cambiato', hidden: true,
    onclick: () => (aperta ? chiudi() : apri('riassunto')),
  }, el('span.vrs-nov-btn-ico', { html: svg(SCINTILLA, 18) }), el('span.vrs-nov-et', { testo: 'Novità' }), pallino));
  posto.append(bottone);

  /* ---- l'ultimo visto ---- */
  const visto = () => {
    const locale = leggiLocale(kLocale);
    let lontano = null;
    try { lontano = remoto?.leggi() ?? null; } catch { /* token assente o malformato */ }
    const v = piuRecente(rilasci, locale, lontano);
    if (v && v !== locale) scriviLocale(kLocale, v); // visto altrove: qui non si rivede
    return v;
  };
  const nuove = () => daVedere(rilasci, visto());
  function segnaVisto() {
    const ultimo = rilasci[0]?.id;
    if (!ultimo) return;
    scriviLocale(kLocale, ultimo);
    let lontano = null;
    try { lontano = remoto?.leggi() ?? null; } catch { /* niente */ }
    if (remoto && lontano !== ultimo) {
      try { Promise.resolve(remoto.scrivi(ultimo)).catch(() => { /* resta su questo browser */ }); } catch { /* idem */ }
    }
    aggiornaTasto();
  }

  function aggiornaTasto() {
    const n = rilasci.length ? nuove().length : 0;
    bottone.dataset.nuove = n ? 'si' : 'no';
    bottone.setAttribute('aria-label', n
      ? `Novità: ${n === 1 ? 'un aggiornamento' : n + ' aggiornamenti'} da vedere`
      : 'Novità: cosa è cambiato');
  }
  aggiornaTasto();

  /* ---- l'apertura da sola, quando la pagina è libera ---- */
  const occupata = () =>
    document.visibilityState === 'hidden' ||
    !!document.querySelector('[aria-modal="true"], .tour-root') ||
    !!document.activeElement?.matches?.(EDITABILE) ||
    !!opz.occupato?.();
  function programma(tra = 1200) {
    clearTimeout(attesa);
    attesa = window.setTimeout(() => {
      if (smontato || aperta || !nuove().length) return;
      if (occupata()) return programma(2500);
      apri('riassunto', { daSolo: true });
    }, tra);
  }

  /* ---- la finestra ---- */
  /** @param {'riassunto'|'dettaglio'} vista @param {{ daSolo?: boolean, indice?: number }} [come] */
  function apri(vista, come = {}) {
    if (smontato || !rilasci.length) return;
    if (aperta) return mostra(vista, come.indice ?? 0);
    const ritorno = come.daSolo ? document.activeElement : bottone;
    const elenco = nuove();
    const box = el('div.vrs-nov', { role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': id + '-tit', tabindex: '-1' });
    const velo = el('div.vrs-nov-velo', { 'data-app': app }, box);
    velo.addEventListener('mousedown', (e) => { if (e.target === velo) chiudi(); });
    const tasti = (/** @type {KeyboardEvent} */ e) => {
      if (!aperta) return;
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); return chiudi(); }
      if (e.key !== 'Tab') return;
      const f = /** @type {HTMLElement[]} */ ([...box.querySelectorAll(FOCUSABILI)]).filter((x) => x.getClientRects().length);
      if (!f.length) { e.preventDefault(); return; }
      const primo = f[0], ultimo = f[f.length - 1];
      if (e.shiftKey && (document.activeElement === primo || !box.contains(document.activeElement))) { e.preventDefault(); ultimo.focus(); }
      else if (!e.shiftKey && (document.activeElement === ultimo || !box.contains(document.activeElement))) { e.preventDefault(); primo.focus(); }
    };
    document.addEventListener('keydown', tasti, true);
    aperta = { velo, box, ritorno, tasti };
    document.body.append(velo);
    document.documentElement.classList.add('vrs-nov-aperta');
    bottone.setAttribute('aria-expanded', 'true');
    segnaVisto(); // non si ripresenta per lo stesso aggiornamento, anche se si ricarica adesso
    riassuntoDi = elenco.length ? elenco : rilasci.slice(0, 1);
    mostra(vista, come.indice ?? 0);
  }

  function chiudi() {
    if (!aperta) return;
    const { velo, ritorno, tasti } = aperta;
    aperta = null;
    document.removeEventListener('keydown', tasti, true);
    velo.remove();
    document.documentElement.classList.remove('vrs-nov-aperta');
    bottone.setAttribute('aria-expanded', 'false');
    // il fuoco torna dov'era: al tasto, o al punto in cui si lavorava se si è aperta da sola
    const r = /** @type {HTMLElement | null} */ (ritorno);
    if (r && r.isConnected && r !== document.body && typeof r.focus === 'function') r.focus();
    else bottone.focus();
  }

  /** @param {'riassunto'|'dettaglio'} vista @param {number} indice */
  function mostra(vista, indice) {
    if (!aperta) return;
    const { box } = aperta;
    box.dataset.vista = vista;
    box.replaceChildren(vista === 'riassunto' ? riassunto() : dettaglio(indice));
    box.scrollTop = 0;
    const primo = /** @type {HTMLElement | null} */ (box.querySelector('[data-fuoco]'));
    (primo || box).focus({ preventScroll: true });
  }

  const chiusura = () => el('button.vrs-nov-x', {
    type: 'button', 'aria-label': 'Chiudi le novità', title: 'Chiudi (Esc)', onclick: chiudi, html: svg(PERCORSI.chiudi, 18),
  });

  function riassunto() {
    const ultimo = riassuntoDi[0];
    const voci = inEvidenza(riassuntoDi);
    const piu = riassuntoDi.length > 1;
    const quando = piu
      ? `Dal ${dataItaliana(riassuntoDi[riassuntoDi.length - 1].data, 'corta')} al ${dataItaliana(ultimo.data)} · ${riassuntoDi.length} aggiornamenti`
      : dataItaliana(ultimo.data);
    const luci = el('span.vrs-nov-luci', { 'aria-hidden': 'true' },
      ...[1, 2, 3, 4, 5, 6, 7].map((i) => el('i.vrs-nov-luce', { style: `--i:${i}` })));
    const scena = el('header.vrs-nov-scena', {},
      el('span.vrs-nov-bolla.b1', { 'aria-hidden': 'true' }),
      el('span.vrs-nov-bolla.b2', { 'aria-hidden': 'true' }),
      el('span.vrs-nov-bolla.b3', { 'aria-hidden': 'true' }),
      luci,
      el('span.vrs-nov-stemma', { 'aria-hidden': 'true', html: svg(SCINTILLA, 30) }),
      el('p.vrs-nov-sopra', { testo: `Novità di ${nomeApp}` }),
      el('h2.vrs-nov-tit', { id: id + '-tit', testo: ultimo.titolo }),
      el('p.vrs-nov-quando', { testo: quando }),
      chiusura());
    const lista = voci.length
      ? el('ul.vrs-nov-voci', {}, ...voci.map((v, i) =>
        el('li.vrs-nov-voce', { style: `--i:${i}` },
          el('span.vrs-nov-voce-ico', { 'aria-hidden': 'true', html: svg(icona(v.icona), 20) }),
          el('span.vrs-nov-voce-testi', {},
            el('b.vrs-nov-voce-tit', { testo: v.titolo }),
            v.testo ? el('span.vrs-nov-voce-riga', { testo: v.testo }) : null))))
      : el('p.vrs-nov-vuoto', { testo: 'Piccoli ritocchi dietro le quinte: nel dettaglio trovi tutto.' });
    const piede = el('footer.vrs-nov-piede', {},
      el('button.vrs-nov-link', { type: 'button', testo: 'Vedi tutte le modifiche…', onclick: () => mostra('dettaglio', 0) }),
      el('button.vrs-nov-ok', { type: 'button', 'data-fuoco': '', testo: 'Ho capito', onclick: chiudi }));
    return el('div.vrs-nov-pag', {}, scena, el('div.vrs-nov-corpo', {}, lista), piede);
  }

  /** @param {number} indice */
  function dettaglio(indice) {
    const i = Math.max(0, Math.min(indice, rilasci.length - 1));
    const r = rilasci[i];
    const piccolo = stretto();
    const testa = el('header.vrs-nov-testa', {},
      el('button.vrs-nov-indietro', {
        type: 'button', 'data-fuoco': '', 'aria-label': 'Torna al riassunto', onclick: () => mostra('riassunto', 0),
        html: svg(PERCORSI.sinistra, 18) + '<span>Riassunto</span>',
      }),
      el('h2.vrs-nov-testa-tit', { id: id + '-tit', testo: 'Tutte le modifiche' }),
      chiusura());

    // chi sfoglia: ‹ il più vecchio · il più nuovo ›
    const sfoglia = el('nav.vrs-nov-sfoglia', { 'aria-label': 'Sfoglia gli aggiornamenti' },
      el('button.vrs-nov-freccia', {
        type: 'button', 'aria-label': 'Aggiornamento precedente', title: 'Precedente',
        disabled: i >= rilasci.length - 1, onclick: () => mostra('dettaglio', i + 1), html: svg(PERCORSI.sinistra, 18),
      }),
      el('div.vrs-nov-sfoglia-testi', { 'aria-live': 'polite' },
        el('span.vrs-nov-sfoglia-data', { testo: dataItaliana(r.data) + (i === 0 ? ' · in uso ora' : '') }),
        el('b.vrs-nov-sfoglia-tit', { testo: r.titolo }),
        el('span.vrs-nov-sfoglia-n', { testo: `${i + 1} di ${rilasci.length}` })),
      el('button.vrs-nov-freccia', {
        type: 'button', 'aria-label': 'Aggiornamento successivo', title: 'Successivo',
        disabled: i === 0, onclick: () => mostra('dettaglio', i - 1), html: svg(PERCORSI.destra, 18),
      }));

    const piene = SEZIONI.filter((s) => r[s.chiave].length);
    const sezioni = piene.length
      ? piene.map((s, k) =>
        el('details.vrs-nov-sez', { 'data-sez': s.chiave, open: !piccolo || k === 0 },
          el('summary', {},
            el('span.vrs-nov-sez-ico', { 'aria-hidden': 'true', html: svg(s.ico, 16) }),
            el('span.vrs-nov-sez-nome', { testo: s.nome }),
            el('span.vrs-nov-sez-n', { testo: String(r[s.chiave].length), 'aria-label': `${r[s.chiave].length} voci` }),
            el('span.vrs-nov-sez-giu', { 'aria-hidden': 'true', html: svg(PERCORSI.giu, 16) })),
          el('ul', {}, ...r[s.chiave].map((t) => el('li', { testo: t })))))
      : [el('p.vrs-nov-vuoto', { testo: 'Per questo aggiornamento non ci sono altre modifiche da raccontare.' })];

    const storico = el('details.vrs-nov-storico', { open: !piccolo && rilasci.length <= 6 },
      el('summary', {},
        el('span.vrs-nov-sez-nome', { testo: 'Tutti gli aggiornamenti' }),
        el('span.vrs-nov-sez-n', { testo: String(rilasci.length) }),
        el('span.vrs-nov-sez-giu', { 'aria-hidden': 'true', html: svg(PERCORSI.giu, 16) })),
      el('ol', {}, ...rilasci.map((x, k) =>
        el('li', {}, el('button.vrs-nov-storia', {
          type: 'button', 'aria-current': k === i ? 'true' : undefined, onclick: () => mostra('dettaglio', k),
        }, el('span.vrs-nov-storia-data', { testo: dataItaliana(x.data, 'corta') }), el('span.vrs-nov-storia-tit', { testo: x.titolo }))))));

    const piede = el('footer.vrs-nov-piede', {},
      el('button.vrs-nov-ok', { type: 'button', testo: 'Chiudi', onclick: chiudi }));
    return el('div.vrs-nov-pag', {}, testa, el('div.vrs-nov-corpo', {}, sfoglia, ...sezioni, storico), piede);
  }

  /* ---- i dati: già pronti (Planning, Scheduler) o da leggere (CronoService) ---- */
  const carica = opz.dati !== undefined
    ? Promise.resolve(opz.dati)
    : fetch(opz.url || '/novita.json', { cache: 'no-cache' }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  carica.then((d) => {
    if (smontato) return;
    rilasci = normalizza(d);
    bottone.hidden = !rilasci.length;
    aggiornaTasto();
    if (automatico && nuove().length) programma();
  });

  const suVisibile = () => { if (document.visibilityState === 'visible') aggiorna(); };
  document.addEventListener('visibilitychange', suVisibile);

  /** L'ultimo visto può essere cambiato altrove (l'account si è aggiornato): si ricontrolla. */
  function aggiorna() {
    if (smontato || !rilasci.length) return;
    aggiornaTasto();
    if (!aperta && !nuove().length) clearTimeout(attesa);
  }

  return {
    bottone,
    apri: (/** @type {'riassunto'|'dettaglio'} */ vista = 'riassunto') => apri(vista),
    chiudi,
    aggiorna,
    smonta() {
      smontato = true;
      clearTimeout(attesa);
      document.removeEventListener('visibilitychange', suVisibile);
      if (aperta) { document.removeEventListener('keydown', aperta.tasti, true); aperta.velo.remove(); aperta = null; }
      document.documentElement.classList.remove('vrs-nov-aperta');
      bottone.remove();
    },
  };
}
