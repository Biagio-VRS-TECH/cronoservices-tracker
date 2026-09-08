/* ui.js - primitive: icone, avvisi, modale, mini-hyperscript, formattatori.
   #ANCHOR: ui */

export const ICO = {
  cerca: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.6-3.6"/></svg>',
  cuneo: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="m9 6 6 6-6 6"/></svg>',
  sx: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m15 6-6 6 6 6"/></svg>',
  dx: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m9 6 6 6-6 6"/></svg>',
  ok: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><path d="m4 12.5 5.2 5.2L20 7"/></svg>',
  ics: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>',
  sync: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 11A8 8 0 0 0 6.3 5.7L3 9"/><path d="M3 4v5h5"/><path d="M4 13a8 8 0 0 0 13.7 5.3L21 15"/><path d="M21 20v-5h-5"/></svg>',
  stampa: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9V3h12v6"/><rect x="3" y="9" width="18" height="7" rx="2"/><path d="M6 16h12v5H6z"/></svg>',
  giu: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12"/><path d="m7 11 5 5 5-5"/><path d="M4 20h16"/></svg>',
  oggi: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="5" width="18" height="16" rx="2.5"/><path d="M8 3v4M16 3v4M3 10h18"/><circle cx="12" cy="15.5" r="1.8" fill="currentColor" stroke="none"/></svg>',
  gente: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="8" r="3.4"/><path d="M2.6 20a6.4 6.4 0 0 1 12.8 0"/><path d="M16.5 5.2a3.4 3.4 0 0 1 0 6.6M18 20a6.5 6.5 0 0 0-1.8-4.5"/></svg>',
  copia: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="12" height="12" rx="2.5"/><path d="M15 5.5A2.5 2.5 0 0 0 12.5 3H5.5A2.5 2.5 0 0 0 3 5.5v7A2.5 2.5 0 0 0 5.5 15"/></svg>',
  comprimi: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6-5 6 5"/><path d="m6 15 6 5 6-5"/></svg>',
  espandi: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 4 6 5 6-5"/><path d="m6 20 6-5 6 5"/></svg>',
  tema: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4.5"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.4 1.4M17.6 17.6 19 19M19 5l-1.4 1.4M6.4 17.6 5 19"/></svg>',
};


/* --- il primo colpo di freccia "entra" nella griglia -----------------------
   Vale per la vista Anno e per il foglio del Mese. Appena caricata la pagina il
   fuoco e' su <main class="area"> (e sul body dopo un clic a vuoto): i listener
   di tastiera stanno sui *figli* dell'area, quindi il keydown non li
   raggiungeva mai e i tasti sembravano morti. Qui si intercettano le quattro
   frecce quando il fuoco e' ancora fuori dalla griglia e si mette il fuoco sul
   primo bersaglio utile a schermo, senza far saltare la vista in cima.
   `Home`/`Fine`/`PagSu`/`PagGiu` restano al browser: servono a scorrere. */
export const FRECCE = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -1, ArrowDown: 1 };
const FUORI = '.pop,.foglio,.velo,.tendina,.cassetto,.avviso,.barra-massa,' +
  'input:not([type=checkbox]),textarea,select,[contenteditable]';

/** Porta il fuoco su `n` senza far saltare lo scorrimento. */
export function fuoco(n) {
  if (!n) return false;
  n.focus({ preventScroll: true });
  n.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  return true;
}

/** @param attiva () -> la vista e' quella giusta e disegnata
 *  @param bersagli () -> elementi su cui si puo' mettere il fuoco, in ordine
 *  @param dentro selettore di "il fuoco e' gia' nella griglia" */
export function frecceEntrano(attiva, bersagli, dentro) {
  addEventListener('keydown', e => {
    if (!(e.key in FRECCE) || e.ctrlKey || e.altKey || e.metaKey || e.shiftKey) return;
    if (!attiva()) return;
    if (e.target?.closest?.(dentro + ',' + FUORI)) return;
    const n = bersagli();
    if (!n.length) return;
    const box = (document.querySelector('.area') || document.documentElement)
      .getBoundingClientRect();
    const aSchermo = x => {
      const r = x.getBoundingClientRect();
      return r.height > 0 && r.top >= box.top + 48 && r.bottom <= box.bottom - 4;
    };
    e.preventDefault();
    fuoco(n.find(x => x.tabIndex === 0 && aSchermo(x)) || n.find(aSchermo) || n[0]);
  });
}

/* mini-hyperscript: h('div.classe', {attr}, figli...) */
export function h(sel, attrs, ...kids) {
  const [tag, ...cls] = sel.split('.');
  const n = document.createElement(tag || 'div');
  if (cls.length) n.className = cls.join(' ');
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'html') n.innerHTML = v;
    else if (k === 'testo') n.textContent = v;
    else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
    else n.setAttribute(k, v === true ? '' : v);
  }
  for (const k of kids.flat()) if (k != null) n.append(k);
  return n;
}

export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];

/* ------------------------------------------------------------- avvisi ---- */
let contAvvisi;
export function avviso(testo, opz = {}) {
  contAvvisi ||= document.body.appendChild(h('div.avvisi', { 'aria-live': 'polite' }));
  const n = h('div.avviso' + (opz.tono ? '.' + opz.tono : ''), {}, h('span', { testo }));
  /* Due azioni al massimo: il conflitto sulla nota ne ha bisogno (unisci /
     tieni la mia), tutto il resto ne ha una sola o nessuna. Con piu' di due
     l'avviso diventerebbe una finestra, e allora tanto vale aprirne una. */
  for (const az of [opz.azione, opz.azione2].filter(Boolean)) {
    n.append(h('button', { testo: az.et, onclick: () => { az.fn(); via(); } }));
  }
  const via = () => {
    if (!n.isConnected) return;
    n.classList.add('esce');
    setTimeout(() => n.remove(), 200);
  };
  contAvvisi.append(n);
  if (opz.durata !== 0) setTimeout(via, opz.durata || 4200);
  return via;
}

/* ------------------------------------------------------------- modale ---- */
export function modale(costruisci, { chiudibile = true, classe = '' } = {}) {
  const velo = h('div.velo');
  const chiudi = () => { velo.remove(); document.removeEventListener('keydown', tasto); };
  const tasto = e => { if (e.key === 'Escape' && chiudibile) chiudi(); };
  /* `classe` serve ai fogli che non stanno nei 520px della modale normale (per
     esempio l'elenco per sito delle Statistiche, aperto a tutta pagina). */
  const foglio = h('div.foglio' + (classe ? '.' + classe : ''), { role: 'dialog', 'aria-modal': 'true' });
  foglio.append(...[costruisci(chiudi)].flat());
  velo.append(foglio);
  if (chiudibile) velo.addEventListener('click', e => { if (e.target === velo) chiudi(); });
  document.addEventListener('keydown', tasto);
  document.body.append(velo);
  (foglio.querySelector('input,button,select,textarea') || foglio).focus?.();
  return chiudi;
}

/* ------------------------------------------------------------- menu ------ */
/** Menu a tendina ancorato a un bottone. `voci` = [{et, ico, fn, tono}] oppure
 *  null per un separatore. Serve a togliere bottoni dalla barra strumenti. */
export function menu(bottone, voci) {
  chiudiMenu();
  const n = h('div.tendina', { role: 'menu' },
    voci.map(v => v ? h('button.voce' + (v.tono ? '.' + v.tono : ''), {
      role: 'menuitem',
      onclick: () => { chiudiMenu(); v.fn(); },
    },
      h('span.voce-ico', { html: v.ico || '' }),
      h('span.voce-et', { testo: v.et }),
      v.nota ? h('span.voce-nota', { testo: v.nota }) : null,
    ) : h('span.voce-sep')));
  document.body.append(n);
  const r = bottone.getBoundingClientRect();
  n.style.left = Math.min(r.left, innerWidth - n.offsetWidth - 8) + 'px';
  n.style.top = Math.min(r.bottom + 6, innerHeight - n.offsetHeight - 8) + 'px';
  bottone.setAttribute('aria-expanded', 'true');
  menuAperto = { n, bottone };
  setTimeout(() => {
    document.addEventListener('pointerdown', fuoriMenu, true);
    document.addEventListener('keydown', escMenu, true);
  }, 0);
  n.querySelector('button')?.focus();
}

let menuAperto = null;
export function chiudiMenu() {
  if (!menuAperto) return;
  menuAperto.n.remove();
  menuAperto.bottone.setAttribute('aria-expanded', 'false');
  menuAperto = null;
  document.removeEventListener('pointerdown', fuoriMenu, true);
  document.removeEventListener('keydown', escMenu, true);
}
const fuoriMenu = e => { if (menuAperto && !menuAperto.n.contains(e.target)) chiudiMenu(); };
const escMenu = e => { if (e.key === 'Escape') chiudiMenu(); };

/** Copia negli appunti con ritorno booleano: navigator.clipboard non c'e'
 *  sempre (contesti non sicuri), quindi c'e' il ripiego con textarea. */
export async function copia(testo) {
  try {
    await navigator.clipboard.writeText(testo);
    return true;
  } catch {
    try {
      const t = document.createElement('textarea');
      t.value = testo;
      t.style.position = 'fixed';
      t.style.opacity = '0';
      document.body.append(t);
      t.select();
      const ok = document.execCommand('copy');
      t.remove();
      return ok;
    } catch { return false; }
  }
}

/* --------------------------------------------------------- formattatori -- */
export const esc = s => String(s ?? '').replace(/[&<>"]/g,
  c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export function quando(iso) {
  if (!iso) return '';
  const d = new Date(iso), o = new Date();
  const g = Math.round((new Date(o.toDateString()) - new Date(d.toDateString())) / 864e5);
  const ora = d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
  if (g === 0) return 'oggi ' + ora;
  if (g === 1) return 'ieri ' + ora;
  if (g < 7) return g + ' giorni fa';
  return d.toLocaleDateString('it-IT', { day: '2-digit', month: 'short', year: '2-digit' });
}

export function dataIt(iso) {
  return iso ? new Date(iso).toLocaleDateString('it-IT') : '—';
}

/* colore stabile per operatore: stesso nome -> sempre stessa tinta */
export function tinta(nome) {
  let x = 0;
  for (const ch of String(nome || '?')) x = (x * 31 + ch.charCodeAt(0)) % 360;
  return `hsl(${x} 62% 44%)`;
}

export function iniziali(nome) {
  const p = String(nome || '?').trim().split(/\s+/);
  return ((p[0]?.[0] || '?') + (p[1]?.[0] || '')).toUpperCase();
}
