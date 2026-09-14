/* albero.js - la STRUTTURA AD ALBERO piano > reparto > stanza con cui si
   decide cosa entra nel documento. Porting del blocco buildTree/syncTree/
   applyFilter del generatore di schede (web/schede/index.html, che tiene la
   sua copia per il salto alle pagine e la maniglia): dalla 30a sessione lo
   usa il registro dei componenti. Modulo ES, nessun DOM fuori da `el`.
   CSS in css/banco.css (sezione LA COLONNA DELL'ALBERO).  #ANCHOR: albero

   creaAlbero(el, {
     rami:     [{nome, chiave, kids:[{nome, chiave, kids:[{nome, chiave, n}]}]}]
     tutto:    l'input #selAll ("tutto l'impianto"), facoltativo
     comprimi: il bottone che apre/chiude tutte le tendine, facoltativo
     suCambio: (esclusi: Set di chiavi di stanza) => {}
     suSalto:  (chiave, livello 1|2|3) => bool  clic sul nome; false = non c'e' dove andare
   }) -> { esclusi(), tuttoDentro(v), comprimiTutto(v), sincronizza() }

   Le CHIAVI restano in JavaScript (si ritrovano dagli indici data-p/r/s):
   negli attributi HTML non ci vanno, perche' il registro le compone con un
   carattere NUL e il parser lo sostituisce con U+FFFD - la prima versione
   escludeva una stanza e il documento non se ne accorgeva.

   Quello che si stampa lo decidono le STANZE: piani e reparti sono contenitori
   e il loro cerchio racconta i figli. Si conta dal basso: tutti i figli dentro
   = pieno, nessuno = vuoto, qualcuno = trattino ("in parte" risale). Il clic su
   un contenitore vale per tutto quello che ha sotto; verso l'alto non si
   propaga niente a mano, ci pensa `sincronizza`. */
const CHEV = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 8l7 8 7-8"/></svg>';
export const ICO_CHIUDI_RAMI = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 15l6-6 6 6"/><path d="M4 20h16"/></svg>';
export const ICO_APRI_RAMI = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/><path d="M4 4h16"/></svg>';
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export function creaAlbero(el, cfg) {
  const rami = cfg.rami || [];
  const tutto = cfg.tutto || null, comprimi = cfg.comprimi || null;
  let compresso = false;

  /* dagli indici di un nodo alla sua voce e al suo livello */
  const voce = d => {
    const p = rami[Number(d.p)];
    if (d.r === undefined) return { nodo: p, livello: 1 };
    const r = p?.kids?.[Number(d.r)];
    if (d.s === undefined) return { nodo: r, livello: 2 };
    return { nodo: r?.kids?.[Number(d.s)], livello: 3 };
  };

  function setSub(btn, sub, aperto) {
    sub.hidden = !aperto;
    btn.classList.toggle('closed', !aperto);
    btn.setAttribute('aria-expanded', aperto ? 'true' : 'false');
    btn.title = aperto ? 'Chiudi' : 'Apri';
  }
  const riga = input => input.closest('.nh') || input.closest('.row');
  const binario = input => {
    const sub = riga(input)?.nextElementSibling;
    return sub && sub.classList.contains('sub') ? sub : null;
  };
  function rollUp(input, kids) {
    let on = 0, part = false;
    for (const x of kids) { if (x.checked) on++; if (x.indeterminate) part = true; }
    if (kids.length) {
      input.checked = on > 0;
      input.indeterminate = on > 0 && (on < kids.length || part);
    }
    return input.checked;
  }
  function dipingi(input) {
    riga(input)?.classList.toggle('out', !input.checked);
    binario(input)?.classList.toggle('lit', input.checked);
  }
  /* l'unico posto dove si decide lo stato dei contenitori */
  function sincronizza() {
    const piani = [...el.querySelectorAll('input[data-p]:not([data-r])')];
    for (const pcb of piani) {
      const p = pcb.dataset.p;
      const reps = [...el.querySelectorAll(`input[data-p="${p}"][data-r]:not([data-s])`)];
      for (const rcb of reps) {
        const stanze = [...el.querySelectorAll(`input[data-p="${p}"][data-r="${rcb.dataset.r}"][data-s]`)];
        rollUp(rcb, stanze); dipingi(rcb);
        for (const scb of stanze) dipingi(scb);
      }
      rollUp(pcb, reps); dipingi(pcb);
    }
    if (tutto) rollUp(tutto, piani);
  }
  function esclusi() {
    const out = new Set();
    for (const scb of el.querySelectorAll('input[data-s]')) {
      if (scb.checked) continue;
      const { nodo } = voce(scb.dataset);
      if (nodo) out.add(nodo.chiave);
    }
    return out;
  }
  const cambiato = () => { sincronizza(); cfg.suCambio?.(esclusi()); };

  function comprimiTutto(v) {
    for (const nh of el.querySelectorAll('.nh')) {
      const btn = nh.querySelector('.tw'), sub = nh.nextElementSibling;
      if (btn && sub && sub.classList.contains('sub')) setSub(btn, sub, !v);
    }
    compresso = !!v;
    if (comprimi) {
      comprimi.innerHTML = v ? ICO_APRI_RAMI : ICO_CHIUDI_RAMI;
      comprimi.title = v ? 'Espandi tutto' : 'Comprimi tutto';
      comprimi.setAttribute('aria-label', comprimi.title);
    }
  }
  function tuttoDentro(v) {
    for (const x of el.querySelectorAll('input[type=checkbox]')) { x.checked = v; x.indeterminate = false; }
    cambiato();
  }

  /* ---- costruzione ---- */
  el.innerHTML = '';
  rami.forEach((p, pi) => {
    const d1 = document.createElement('div'); d1.className = 'lv1 nh';
    d1.innerHTML = `<button type="button" class="tw" aria-expanded="true" title="Chiudi">${CHEV}</button>` +
      `<label class="pick" title="Includi o escludi questo piano"><input type="checkbox" data-p="${pi}" checked></label>` +
      `<span class="nm" data-p="${pi}" title="Vai a questo piano nell'anteprima">PIANO: ${esc(p.nome)}</span>`;
    el.appendChild(d1);
    const sub1 = document.createElement('div'); sub1.className = 'sub'; el.appendChild(sub1);
    d1.querySelector('.tw').onclick = () => setSub(d1.querySelector('.tw'), sub1, sub1.hidden);
    (p.kids || []).forEach((r, ri) => {
      const n = (r.kids || []).reduce((a, s) => a + (s.n || 0), 0);
      const d2 = document.createElement('div'); d2.className = 'lv2 nh';
      d2.innerHTML = `<button type="button" class="tw" aria-expanded="true" title="Chiudi">${CHEV}</button>` +
        `<label class="pick" title="Includi o escludi questo reparto"><input type="checkbox" data-p="${pi}" data-r="${ri}" checked></label>` +
        `<span class="nm" data-p="${pi}" data-r="${ri}" title="Vai a questo reparto nell'anteprima">${esc(r.nome)} <span class="cnt">(${n})</span></span>`;
      sub1.appendChild(d2);
      const sub2 = document.createElement('div'); sub2.className = 'sub'; sub1.appendChild(sub2);
      d2.querySelector('.tw').onclick = () => setSub(d2.querySelector('.tw'), sub2, sub2.hidden);
      (r.kids || []).forEach((s, si) => {
        const d3 = document.createElement('div'); d3.className = 'lv3 row';
        d3.innerHTML = `<label class="pick" title="Includi o escludi questa stanza"><input type="checkbox" data-p="${pi}" data-r="${ri}" data-s="${si}" checked></label>` +
          `<span class="nm" data-p="${pi}" data-r="${ri}" data-s="${si}" title="Vai a questa stanza nell'anteprima">${esc(s.nome)} <span class="cnt">(${s.n || 0})</span></span>`;
        sub2.appendChild(d3);
      });
    });
  });
  comprimiTutto(compresso);
  sincronizza();

  /* clic sul nome (non sulla spunta): il salto all'anteprima; se non c'e' dove
     andare la voce lampeggia di rosso per un attimo */
  el.onclick = e => {
    const nm = e.target.closest?.('.nm');
    if (!nm) return;
    const { nodo, livello } = voce(nm.dataset);
    const ok = nodo && cfg.suSalto ? cfg.suSalto(nodo.chiave, livello) : false;
    if (!ok) {
      nm.style.transition = 'none'; nm.style.background = 'color-mix(in srgb, var(--scadenza, #E5484D) 22%, transparent)';
      setTimeout(() => { nm.style.transition = ''; nm.style.background = ''; }, 500);
    }
  };
  /* un clic su un contenitore vale per tutto quello che ha sotto */
  el.onchange = e => {
    const t = e.target;
    if (t.type !== 'checkbox') return;
    let q = `input[data-p="${t.dataset.p}"]`;
    if (t.dataset.r === undefined) q += '[data-r]';
    else if (t.dataset.s === undefined) q += `[data-r="${t.dataset.r}"][data-s]`;
    else q = '';
    if (q) for (const x of el.querySelectorAll(q)) { x.checked = t.checked; x.indeterminate = false; }
    cambiato();
  };
  if (tutto) tutto.onchange = () => tuttoDentro(tutto.checked);
  if (comprimi) comprimi.onclick = () => comprimiTutto(!compresso);

  return { esclusi, tuttoDentro, comprimiTutto, sincronizza };
}
