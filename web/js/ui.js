// @ts-check  (COD-04: controllo dei tipi senza build, jsconfig.json nella radice)
/* ui.js - primitive: icone, avvisi, modale, mini-hyperscript, formattatori.
   #ANCHOR: ui */

import { svgIcona } from './vrs-icone.js';

/* VIS-12: le icone sono quelle di famiglia (vrs-icone.js, copia identica del
   modulo del Planning): stesso disegno e stesso tratto 1.75 nelle due app. Qui
   restano i nomi di CronoService e il lato di ciascuna. */
const ICO_NOMI = {
  esci: ['esci', 14], cerca: ['cerca', 14], cuneo: ['destra', 12],
  sx: ['sinistra', 15], dx: ['destra', 15], ok: ['spunta', 12], ics: ['chiudi', 15],
  sync: ['ricorrenze', 13], stampa: ['stampa', 13], giu: ['download', 13],
  oggi: ['oggi', 13], gente: ['gruppo', 13], copia: ['copia', 13],
  comprimi: ['comprimi', 13], espandi: ['espandi', 13], tema: ['sole', 14],
};
export const ICO = Object.fromEntries(
  Object.entries(ICO_NOMI).map(([k, [nome, lato]]) => [k, svgIcona(nome, lato)]));


/* --- il primo colpo di freccia "entra" nella griglia -----------------------
   Vale per la vista Anno e per il foglio del Mese. Appena caricata la pagina il
   fuoco e' su <main class="area"> (e sul body dopo un clic a vuoto): i listener
   di tastiera stanno sui *figli* dell'area, quindi il keydown non li
   raggiungeva mai e i tasti sembravano morti. Qui si intercettano le quattro
   frecce quando il fuoco e' ancora fuori dalla griglia e si mette il fuoco sul
   primo bersaglio utile a schermo, senza far saltare la vista in cima.
   `Home`/`Fine`/`PagSu`/`PagGiu` restano al browser: servono a scorrere. */
export const FRECCE = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -1, ArrowDown: 1 };
const FUORI = '.auth,.pop,.foglio,.velo,.tendina,.cassetto,.avviso,.barra-massa,' +
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
    if (/** @type {Element} */ (e.target)?.closest?.(dentro + ',' + FUORI)) return;
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

/* ------------------------------------------------ errori: segnala -------- */
/* Un punto solo per gli errori del programma: la console e, online, una riga
   nella tabella degli errori del client (la manda nuvola.js, che si registra
   con `impostaSegnalatore`: ui.js non importa niente). Mai lanciare da qui: chi
   segnala un errore non deve riceverne un altro. Al massimo 20 per pagina, e
   lo stesso messaggio una volta sola.  #ANCHOR: segnala */
let segnalatore = null, segnalati = 0;
const giaSegnalati = new Set();
export function impostaSegnalatore(fn) { segnalatore = fn; }
export function segnala(err, dove = '') {
  try {
    console.error(dove ? `[${dove}]` : '[errore]', err);
    const e = err instanceof Error ? err : new Error(String(err?.message || err));
    const chiave = dove + '|' + e.message;
    if (giaSegnalati.has(chiave) || segnalati >= 20) return;
    giaSegnalati.add(chiave);
    segnalati++;
    segnalatore?.(e, dove);
  } catch { /* niente */ }
}

/* ------------------------------------------- errori: in italiano -------- */
/* I messaggi che arrivano dal browser, da Supabase o da Postgres sono in
   inglese e tecnici («Failed to fetch», «JWT expired», «violates check
   constraint…»). Qui si traducono in UN punto solo: `avviso()` passa da
   `umano()` tutto quello che non e' un «fatto», cosi' i punti che fanno
   `'Non salvato: ' + e.message` non vanno toccati uno a uno. Il testo tecnico
   non si perde: va a `segnala()`.
   Ritorna { testo, tecnico }: `tecnico` c'e' solo se qualcosa e' stato tradotto. */
/** @type {Array<[RegExp, string]>} */
const TRADUZIONI = [
  [/failed to fetch|networkerror|load failed|network ?error|fetch failed|net::err/i,
    'server non raggiungibile: controlla la rete e riprova'],
  [/\babort|timed? ?out\b|timeout|canceling statement/i,
    'il server ha risposto troppo tardi: riprova fra poco'],
  [/invalid login credentials|invalid (email|password)|email not confirmed/i,
    'email o password non corrette'],
  [/\bjwt\b|invalid token|token (is )?expired|refresh token|not authenticated/i,
    'la sessione è scaduta: esci e rientra'],
  [/permission denied|row-level security|not authori[sz]ed|insufficient.privilege|forbidden/i,
    'non hai il permesso per farlo: se ti serve, chiedi all’amministratore'],
  [/duplicate key|unique constraint|already exists/i,
    'c’è già: ricarica la pagina per vederlo'],
  [/violates .*constraint|check constraint|not-null constraint|foreign key/i,
    'il database non accetta questi dati: controlla i valori e riprova'],
  [/too many requests|rate limit|security purposes/i,
    'troppe richieste in poco tempo: aspetta un minuto e riprova'],
  [/(errore?|status) 50[0-4]\b|internal server error|bad gateway|service unavailable/i,
    'il server ha avuto un problema: riprova fra poco'],
];
const RIPIEGO = 'non è andato a buon fine. Riprova; se succede ancora, avvisa l’amministratore';
/* inglese tecnico senza una traduzione precisa: parole che in un testo
   italiano del programma non compaiono, e nessuna parola italiana */
const INGLESE = /\b(the|is|was|of|for|not|failed|invalid|unexpected|cannot|could|must|does|exist|undefined|null|json|function|relation|column|syntax|object|property|reading)\b/i;
const ITALIANO = /[àèéìòù]|\b(non|il|la|di|che|per|del|della|sono|questo|rifiutat[oa]|riuscit[oa])\b/i;
const tecnico = s => TRADUZIONI.some(([re]) => re.test(s)) || (INGLESE.test(s) && !ITALIANO.test(s));
const traduci = s => TRADUZIONI.find(([re]) => re.test(s))?.[1] || RIPIEGO;
const maiuscola = s => s.charAt(0).toUpperCase() + s.slice(1);

export function umano(testo) {
  const s = String(testo ?? '');
  /* «Contesto: coda tecnica»: si traduce solo la coda, il contesto e' nostro */
  const i = s.indexOf(': ');
  if (i > 0 && i < 80 && !tecnico(s.slice(0, i)) && tecnico(s.slice(i + 2))) {
    return { testo: s.slice(0, i + 2) + traduci(s.slice(i + 2)) + '.', tecnico: s };
  }
  if (tecnico(s)) return { testo: maiuscola(traduci(s)) + '.', tecnico: s };
  return { testo: s, tecnico: '' };
}

/* ------------------------------------------------------------- avvisi ---- */
let contAvvisi;
export function avviso(testo, opz = {}) {
  contAvvisi ||= document.body.appendChild(h('div.avvisi', { 'aria-live': 'polite' }));
  if (opz.tono !== 'ok') {
    const u = umano(testo);
    if (u.tecnico) { segnala(new Error(u.tecnico), 'avviso'); testo = u.testo; }
  }
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

/* --------------------------------------------------- conferma scritta --- */
/* Le azioni che non si disfano davvero - azzerare le spunte in blocco,
   completarle tutte, buttare il diario, cancellare i PDF di un anno - non
   partono con un clic solo: prima si scrive OK. Non e' un secondo "sei
   sicuro?" da schiacciare per riflesso, e' l'unica cosa nella finestra che
   chiede di fermarsi a leggere.
   Il campo non apre una finestra sua: sta DENTRO quella che c'e' gia', cosi'
   il conto esatto ("1.284 spunte da togliere") resta sotto gli occhi mentre si
   conferma. Governa il bottone, che nasce disabilitato.  #ANCHOR: conferma-ok */
/** @param {HTMLButtonElement} bottone
 *  @param {{parola?: string, etichetta?: string}} [opz] */
export function campoOK(bottone, { parola = 'OK', etichetta = '' } = {}) {
  const id = 'ok-' + Math.random().toString(36).slice(2, 8);
  const inp = h('input.campo.campo-ok', {
    id, type: 'text', autocomplete: 'off', spellcheck: 'false', placeholder: parola,
  });
  const giusto = () => inp.value.trim().toUpperCase() === parola.toUpperCase();
  const rivedi = () => { bottone.disabled = !giusto(); };
  inp.oninput = rivedi;
  inp.onkeydown = e => { if (e.key === 'Enter' && giusto()) bottone.click(); };
  rivedi();
  const n = h('label.conferma-ok', { for: id },
    h('span', { testo: etichetta || `Se sei sicuro, digita ${parola}:` }), inp);
  // `rivedi` serve a chi cambia le carte in tavola mentre la finestra e' aperta
  // (in "Completa tutte" una spunta puo' azzerare il conto): il bottone si
  // rimette d'accordo col campo invece di restare acceso per inerzia.
  n.rivedi = rivedi;
  return n;
}

/* ------------------------------------------------------------- modale ---- */
const FOCALIZZABILI = 'input:not([disabled]),button:not([disabled]),select,textarea,a[href],[tabindex]:not([tabindex="-1"])';
/** Tab e Maiusc+Tab girano dentro `contenitore` (modale, cassetto, giro
 *  guidato): dietro un `aria-modal` non si naviga. Da chiamare nel keydown. */
export function trappolaTab(e, contenitore) {
  if (e.key !== 'Tab' || !contenitore) return;
  const f = [...contenitore.querySelectorAll(FOCALIZZABILI)].filter(x => x.offsetParent !== null);
  if (!f.length) return e.preventDefault();
  const i = f.indexOf(document.activeElement);
  if (e.shiftKey && i <= 0) { e.preventDefault(); f[f.length - 1].focus(); }
  else if (!e.shiftKey && (i === -1 || i === f.length - 1)) { e.preventDefault(); f[0].focus(); }
}
export function modale(costruisci, { chiudibile = true, classe = '' } = {}) {
  const velo = h('div.velo');
  const prima = /** @type {HTMLElement | null} */ (document.activeElement);   // a chi torna il fuoco alla chiusura
  const chiudi = () => {
    velo.remove(); document.removeEventListener('keydown', tasto);
    if (prima?.isConnected) prima.focus?.();
  };
  const tasto = e => {
    /* Una modale puo' aprirne un'altra sopra (la conferma scritta prima di
       buttare i PDF di un anno, dentro le Impostazioni): i tasti li prende solo
       quella davanti, altrimenti un Escape ne chiudeva due e il Tab girava fra
       due fogli sovrapposti. */
    if (document.querySelectorAll('.velo').length > 1 &&
        velo !== [...document.querySelectorAll('.velo')].pop()) return;
    if (e.key === 'Escape' && chiudibile) return chiudi();
    /* Tab resta dentro il foglio: dietro il velo non si naviga. */
    trappolaTab(e, foglio);
  };
  /* `classe` serve ai fogli che non stanno nei 520px della modale normale (per
     esempio l'elenco per sito delle Statistiche, aperto a tutta pagina). */
  const foglio = h('div.foglio' + (classe ? '.' + classe : ''), { role: 'dialog', 'aria-modal': 'true' });
  // i figli `null` (un pezzo che c'e' solo in certi casi) si saltano: append()
  // li scriverebbe come testo "null" - si vedeva in "Azzera tutte le spunte"
  foglio.append(...[costruisci(chiudi)].flat().filter(x => x != null));
  const titolo = foglio.querySelector('h2');
  if (titolo) {
    titolo.id ||= 'modale-titolo-' + Math.random().toString(36).slice(2, 8);
    foglio.setAttribute('aria-labelledby', titolo.id);
  }
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
export function chiudiMenu({ fuoco = false } = {}) {
  if (!menuAperto) return;
  menuAperto.n.remove();
  menuAperto.bottone.setAttribute('aria-expanded', 'false');
  if (fuoco) menuAperto.bottone.focus?.();
  menuAperto = null;
  document.removeEventListener('pointerdown', fuoriMenu, true);
  document.removeEventListener('keydown', escMenu, true);
}
const fuoriMenu = e => { if (menuAperto && !menuAperto.n.contains(e.target)) chiudiMenu(); };
const escMenu = e => {
  if (e.key === 'Escape') return chiudiMenu({ fuoco: true });
  if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
  const voci = [...menuAperto.n.querySelectorAll('button.voce')];
  if (!voci.length) return;
  e.preventDefault();
  const i = voci.indexOf(document.activeElement);
  const passo = e.key === 'ArrowDown' ? 1 : -1;
  voci[(i + passo + voci.length) % voci.length].focus();
};

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
  const g = Math.round((new Date(o.toDateString()).getTime() - new Date(d.toDateString()).getTime()) / 864e5);
  const ora = d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
  if (g === 0) return 'oggi ' + ora;
  if (g === 1) return 'ieri ' + ora;
  if (g < 7) return g + ' giorni fa';
  return d.toLocaleDateString('it-IT', { day: '2-digit', month: 'short', year: '2-digit' });
}

/* byte -> testo leggibile, con la virgola italiana */
export const dimensione = n => n > 1048576 ? (n / 1048576).toFixed(1).replace('.', ',') + ' MB'
  : n > 1024 ? Math.round(n / 1024) + ' KB' : n + ' B';

export function dataIt(iso) {
  return iso ? new Date(iso).toLocaleDateString('it-IT') : '—';
}

/* colore stabile per operatore: stesso nome -> sempre stessa tinta */
export function tinta(nome) {
  let x = 0;
  for (const ch of String(nome || '?')) x = (x * 31 + ch.charCodeAt(0)) % 360;
  return `hsl(${x} 60% 36%)`;
}

export function iniziali(nome) {
  const p = String(nome || '?').trim().split(/\s+/);
  return ((p[0]?.[0] || '?') + (p[1]?.[0] || '')).toUpperCase();
}
