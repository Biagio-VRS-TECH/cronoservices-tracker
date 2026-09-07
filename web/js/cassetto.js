/* cassetto.js - pannello laterale di un sito: dati di contratto, la mappatura
   dell'anno di QUESTO sito (quando scade e in quale mese e' stata chiusa), i
   mesi con le quattro spunte, ultime modifiche.

   Una spunta NON ridisegna il pannello: si aggiornano in posto le caselle del
   mese toccato e le due righe che dipendono da lui. Il redisegno completo
   (`replaceChildren`) riportava lo scorrimento in cima a ogni clic - con dodici
   mesi a schermo era il difetto piu' fastidioso dell'applicazione.
   #ANCHOR: cassetto */
import { h, ICO, esc, dataIt, quando, avviso } from './ui.js';
import { chiama } from './api.js';
import {
  st, cella, statoCella, spunta, spuntaMolte, CAMPI, SIGLA, ETICHETTA, BREVE,
  mappaturaSito, scadEffettiva, on,
} from './stato.js';

let nodo = null, idAperto = null, stacca = null;

export function chiudiCassetto() {
  nodo?.remove(); nodo = null; idAperto = null;
  stacca?.(); stacca = null;
  document.removeEventListener('keydown', esc0);
}
const esc0 = e => { if (e.key === 'Escape') chiudiCassetto(); };

export function apriCassetto(id) {
  if (idAperto === id) return chiudiCassetto();
  chiudiCassetto();
  idAperto = id;
  nodo = h('div.cassetto', { role: 'dialog', 'aria-label': 'Dettaglio service' });
  document.body.append(nodo);
  document.addEventListener('keydown', esc0);
  stacca = on('cella', d => { if (d.id === idAperto) rinfresca(d.mese); });
  disegna();
  caricaStoria(id);
}

function rigaMese(id, m, previsto) {
  const c = cella(id, m), e = statoCella(id, m);
  const cls = ['scheda', e.completa && 'finita',
               e.ritardo && !e.completa && 'ritardo'].filter(Boolean).join('.');
  const dati = { 'data-mese': String(m) };
  const dettagli = previsto
    ? (c.at ? `<span class="dato">${esc(c.by || '?')} ${quando(c.at)}</span>`
            : '<span>da fare</span>')
    : '<span>non previsto in Access</span>';
  return h('div.' + cls, { ...dati, style: previsto ? null : 'opacity:.5' },
    h('div.info', {},
      h('b', { testo: st.mesiNome[m - 1] }),
      h('div.meta', { html: dettagli })),
    h('div.passi-riga', {}, CAMPI.map(campo =>
      h('button.passo', {
        role: 'checkbox', 'aria-checked': String(!!c[SIGLA[campo]]), 'data-campo': campo,
        title: ETICHETTA[campo],
        onclick: () => spunta(id, m, campo, !cella(id, m)[SIGLA[campo]]),
      },
        h('span.box', { html: ICO.ok }),
        h('span.et', { testo: BREVE[campo] }),
      ))),
  );
}

function disegna() {
  const s = st.perServ.get(idAperto);
  if (!s || !nodo) return;
  const cli = st.clienti.get(s.cli) || {};
  /* La mappatura e' di QUESTO sito: si dice quando scade e dove e' stata
     chiusa, che puo' essere un altro mese suo (una visita). */
  const ma = mappaturaSito(s);
  /* Con il rinnovo automatico la validita' che conta e' quella del termine IN
     CORSO, non la data scritta in Access: quella resta a lato, altrimenti
     sembra che l'app la ignori (#ANCHOR: rinnovo in stato.js). */
  const scadEff = scadEffettiva(s);
  const mesi = [];
  for (let m = 1; m <= 12; m++) {
    const prev = s.mesi[m - 1] === '1';
    const e = statoCella(s.id, m);
    if (prev || e.n) mesi.push(rigaMese(s.id, m, prev));
  }
  const storia = nodo.querySelector('.storia');   // conservo la storia già caricata

  nodo.replaceChildren(
    h('header', {},
      h('button.chiudi', { html: ICO.ics, title: 'Chiudi (Esc)', onclick: chiudiCassetto }),
      h('h2', { testo: cli.rs || '(cliente ' + s.cli + ')', style: 'margin:0 30px 2px 0;font-size:var(--t-grande);letter-spacing:-.02em' }),
      h('p', {
        testo: s.dest || '(senza destinazione)',
        style: 'margin:0;color:var(--tenue);font-size:var(--t-mini)'
      })),
    h('div.corpo', {},
      h('dl.dettaglio', {}, [
        ['Service', '#' + s.id], ['Stato', s.stato], ['Tipo', s.tipo],
        ['Cadenza', `${s.cad || '—'}${s.qva ? ` · ${s.qva} visite/anno` : ''}`],
        ['Mesi di manutenzione',
          (s.mesi.split('').filter(x => x === '1').length || 0) +
          ' (' + mesiEtichette(s) + ')'],
        ['Mappatura ' + st.anno + ' (sito)', ma.scad
          ? `scade a ${st.mesiNome[ma.scad - 1]}` + (ma.completa
            ? ` · chiusa a ${st.mesiNome[ma.mese - 1]}`
            : ma.ritardo ? ' · in ritardo'
              : ma.preTrac ? ' · prima dell\'avvio del tracciamento' : '')
          : 'non dovuta quest\'anno'],
        ['Contratto', s.nc || '—'],
        ['Validità', `${dataIt(s.inizio)} → ${dataIt(scadEff)}` +
          (s.rin ? ' · rinnovo automatico' : '') +
          (scadEff !== s.scad ? ` (in Access ${dataIt(s.scad)})` : '')],
        ['Località', [s.loc, s.prov].filter(Boolean).join(' ') || '—'],
        ['Avanzamento del sito', ma.scad || ma.n
          ? `${ma.n}/${CAMPI.length} passi` : '—'],
      ].flatMap(([k, v]) => [h('dt', { testo: k }), h('dd', { testo: String(v) })])),

      s.note ? h('p', {
        testo: s.note,
        style: 'margin:14px 0 0;padding:10px 12px;background:var(--fondo);border-radius:var(--r-2);font-size:var(--t-mini)'
      }) : null,

      h('div', { style: 'display:flex;align-items:center;justify-content:space-between;margin:22px 0 8px' },
        h('h3', { testo: 'Mesi ' + st.anno, style: 'margin:0;font-size:var(--t-mini);font-weight:600' }),
        /* Chiude LA mappatura dell'anno di questo sito, in un mese solo: prima
           un contratto a quattro visite si prendeva 16 spunte. */
        s.stato === 'APERTO' ? h('button.pill', {
          testo: 'Chiudi la mappatura',
          title: ma.mese
            ? `Mette i ${CAMPI.length} passi su ${st.mesiNome[ma.mese - 1]}`
            : '',
          onclick: () => {
            const m = ma.mese;
            if (!m) return avviso('Nessun mese di manutenzione su questo sito.');
            const voci = CAMPI.filter(campo => !cella(s.id, m)[SIGLA[campo]])
              .map(campo => ({ id: s.id, mese: m, campo, valore: 1 }));
            if (!voci.length) return avviso('Mappatura già completa qui.');
            spuntaMolte(voci);
            avviso(`Mappatura di #${s.id} chiusa su ${st.mesiNome[m - 1]}.`, { tono: 'ok' });
            disegna();
          }
        }) : null),
      mesi.length ? mesi : h('p', { testo: 'Nessun mese di manutenzione impostato in Access.', style: 'color:var(--tenue);font-size:var(--t-mini)' }),

      h('h3', { testo: 'Ultime modifiche', style: 'margin:22px 0 4px;font-size:var(--t-mini);font-weight:600' }),
      storia || h('p.js-attesa', { testo: 'Caricamento…', style: 'color:var(--tenue);font-size:var(--t-mini)' }),
    ),
  );
}

/** Una spunta e' arrivata: si ritoccano SOLO le caselle di quel mese, la sua
 *  cornice, e le due righe del riepilogo che dipendono dalla mappatura. Niente
 *  `replaceChildren`, cosi' il pannello non torna in cima. Se il mese non c'era
 *  (spunta su un mese non previsto in Access) si ridisegna, che e' l'unico caso
 *  in cui la struttura cambia davvero. */
function rinfresca(mese) {
  const s = st.perServ.get(idAperto);
  if (!s || !nodo) return;
  const riga = nodo.querySelector(`.scheda[data-mese="${mese}"]`);
  if (!riga) return disegna();
  const c = cella(idAperto, mese), e = statoCella(idAperto, mese);
  riga.classList.toggle('finita', e.completa);
  riga.classList.toggle('ritardo', e.ritardo && !e.completa);
  for (const b of riga.querySelectorAll('.passo')) {
    b.setAttribute('aria-checked', String(!!c[SIGLA[b.dataset.campo]]));
  }
  const meta = riga.querySelector('.meta');
  if (meta) {
    meta.innerHTML = c.at
      ? `<span class="dato">${esc(c.by || '?')} ${quando(c.at)}</span>`
      : '<span>da fare</span>';
  }
  const ma = mappaturaSito(s);
  const dd = nodo.querySelectorAll('dl.dettaglio dd');
  const dt = [...nodo.querySelectorAll('dl.dettaglio dt')];
  const i = dt.findIndex(x => x.textContent.startsWith('Mappatura '));
  if (i >= 0 && dd[i]) {
    dd[i].textContent = ma.scad
      ? `scade a ${st.mesiNome[ma.scad - 1]}` + (ma.completa
        ? ` · chiusa a ${st.mesiNome[ma.mese - 1]}`
        : ma.ritardo ? ' · in ritardo'
          : ma.preTrac ? ' · prima dell\'avvio del tracciamento' : '')
      : 'non dovuta quest\'anno';
  }
  const j = dt.findIndex(x => x.textContent === 'Avanzamento del sito');
  if (j >= 0 && dd[j]) {
    dd[j].textContent = ma.scad || ma.n ? `${ma.n}/${CAMPI.length} passi` : '—';
  }
}

const mesiEtichette = s => st.mesi.filter((_, i) => s.mesi[i] === '1').join(' ') || '—';

async function caricaStoria(id) {
  let dati;
  try {
    ({ dati } = await chiama(`/api/attivita?limit=200`));
  } catch { dati = { attivita: [] }; }
  if (idAperto !== id || !nodo) return;
  const righe = (dati.attivita || []).filter(e => e.id_service === id).slice(0, 25);
  const ul = h('ul.storia', {}, righe.length
    ? righe.map(e => h('li', {},
      h('time', { testo: quando(e.ts) }),
      h('span', {
        html: `<b>${esc(e.operatore)}</b> · ${esc(st.mesiNome[(e.mese || 1) - 1])} · ` +
          (e.campo === 'nota' ? 'nota' : `${e.a ? 'spuntato' : 'tolto'} <i>${esc(e.campo)}</i>`)
      })))
    : h('li', { testo: 'Nessuna modifica registrata.' }));
  (nodo.querySelector('.storia') || nodo.querySelector('.js-attesa'))?.replaceWith(ul);
}
