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
  documentiDi, gruppiDocumenti, titoloDocumento, apriDocumento, eliminaDocumento,
  eliminaDocumenti,
  urlGeneratore, dimensione, ICO_PDF,
} from './documenti.js';
import {
  st, cella, statoCella, spuntaMolte, CAMPI, SIGLA, ETICHETTA, BREVE, toccaPasso,
  mappaturaSito, scadEffettiva, on, doveFatto,
  fatto, proposto, notaProposta, descriviEvento, ripristina, ripristinabile,
} from './stato.js';

let nodo = null, idAperto = null, stacca = null, prima = null;

export function chiudiCassetto() {
  const dentro = nodo?.contains(document.activeElement);
  nodo?.remove(); nodo = null; idAperto = null;
  stacca?.(); stacca = null;
  document.removeEventListener('keydown', esc0);
  // il fuoco torna a chi ha aperto il pannello, se era finito dentro
  if (dentro && prima?.isConnected) prima.focus?.();
  prima = null;
}
const esc0 = e => { if (e.key === 'Escape') chiudiCassetto(); };

export function apriCassetto(id) {
  if (idAperto === id) return chiudiCassetto();
  chiudiCassetto();
  idAperto = id;
  prima = document.activeElement;
  nodo = h('div.cassetto', { role: 'dialog', 'aria-label': 'Dettaglio service' });
  document.body.append(nodo);
  document.addEventListener('keydown', esc0);
  /* Tutte le righe, non solo quella del mese toccato: una spunta messa o
     tolta a giugno cambia gli ereditati di settembre e novembre. */
  const s1 = on('cella', d => { if (d.id === idAperto) rinfresca(d.mese); });
  // un PDF nuovo o tolto: si rifa' solo la sezione, il pannello non torna in cima
  const s2 = on('documenti', d => {
    if (!d || d.id === idAperto) nodo?.querySelector('.sez-documenti')?.replaceWith(sezDocumenti());
  });
  stacca = () => { s1(); s2(); };
  disegna();
  caricaStoria(id);
}

/* Un passo ereditato da una visita prima (#ANCHOR: passi-cumulativi in
   stato.js) si vede spuntato come gli altri; il suggerimento dice dove e'
   stato fatto e il clic lo toglie da la' (stato.toccaPasso). */
const titoloPasso = (campo, er, c) => er
  ? `${ETICHETTA[campo]}: gi\u00e0 fatta ${doveFatto(er)}${er.by ? ' da ' + er.by : ''} \u00b7 un clic la toglie da l\u00ec`
  : (c && proposto(c, campo)) ? notaProposta(c, campo)
  : ETICHETTA[campo];

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
      h('button.passo' + (e.ered[campo] ? '.eredita' : '') +
        (!e.ered[campo] && proposto(c, campo) ? '.proposto' : ''), {
        role: 'checkbox',
        'aria-checked': (!e.ered[campo] && proposto(c, campo)) ? 'mixed' : String(fatto(c, campo) || !!e.ered[campo]),
        'data-campo': campo,
        title: titoloPasso(campo, e.ered[campo], c),
        onclick: () => toccaPasso(id, m, campo),
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
    if (prev || e.mie) mesi.push(rigaMese(s.id, m, prev));
  }
  const storia = nodo.querySelector('.storia');   // conservo la storia già caricata

  nodo.replaceChildren(
    h('header', {},
      h('button.chiudi', { html: ICO.ics, title: 'Chiudi (Esc)', 'aria-label': 'Chiudi',
        onclick: chiudiCassetto }),
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

      sezDocumenti(),

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
            const voci = CAMPI.filter(campo => !fatto(cella(s.id, m), campo))
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

/** Le schede tecnici del sito: il bottone che apre il generatore gia' puntato
 *  su questo impianto, e i PDF gia' stampati quest'anno con la miniatura della
 *  prima pagina. #ANCHOR: documenti */
function sezDocumenti() {
  const s = st.perServ.get(idAperto);
  const docs = documentiDi(idAperto);
  return h('div.sez-documenti', {},
    h('div', { style: 'display:flex;align-items:center;justify-content:space-between;margin:22px 0 8px' },
      h('h3', { testo: 'Schede tecnici ' + st.anno, style: 'margin:0;font-size:var(--t-mini);font-weight:600' }),
      h('a.pill', {
        href: urlGeneratore(s), target: '_blank', rel: 'opener',
        html: ICO_PDF + ' Genera dall\'Excel',
        title: 'Apre il generatore con questo sito gia\' scelto: alla stampa il PDF ' +
          'torna qui e la spunta "stampata" si mette da sola',
      })),
    /* Un documento diviso in FASCICOLI e' UNA voce: la miniatura e il titolo del
       primo, il conto di pagine e peso di tutti, e sotto una fila di bottoni
       "1 · 40 pag." "2 · 38 pag."... uno per fascicolo. Elimina toglie tutto
       il documento (tutti i fascicoli), con la stessa conferma di prima. */
    docs.length
      ? h('ul.doc-lista', {}, gruppiDocumenti(idAperto).map(g => {
        const d = g.capo, N = g.fascicoli;
        return h('li' + (N > 1 ? '.doc-gruppo' : ''), {},
          h('button.doc-mini', {
            title: N > 1 ? 'Apri il fascicolo 1' : 'Apri il PDF', 'aria-label': 'Apri ' + d.nome,
            onclick: () => apriDocumento(d),
          }, d.anteprima ? h('img', { src: d.anteprima, alt: '' }) : h('span', { html: ICO_PDF })),
          h('div.doc-info', {},
            h('b', { testo: N > 1 ? titoloDocumento(d) : d.nome, title: d.nome }),
            h('span.meta', { html:
              (N > 1 ? `<b>${N} fascicoli</b> · ` : '') +
              `${g.pagine ? g.pagine + ' pag. · ' : ''}${dimensione(g.bytes || 0)}` +
              (d.mese ? ` · spunta su ${esc(st.mesiNome[d.mese - 1])}` : '') +
              `<br><span class="dato">${esc(d.creato_da || '?')} ${quando(g.creato_il || d.creato_il)}</span>` }),
            N > 1 ? h('div.fascicoli', {}, g.docs.map(f => h('button.pill.mini', {
              title: `Apri il fascicolo ${f.fascicolo} di ${N} · ${f.nome}`,
              onclick: () => apriDocumento(f),
            }, h('b', { testo: String(f.fascicolo) }),
               h('span', { testo: f.pagine ? ` · ${f.pagine} pag.` : '' })))) : null),
          h('div.doc-azioni', {},
            N > 1 ? null : h('button.pill.mini', { testo: 'Apri', onclick: () => apriDocumento(d) }),
            h('button.pill.mini.debole', {
              testo: 'Elimina', title: N > 1 ? `Toglie tutti i ${N} fascicoli (la spunta resta)` : 'Toglie il PDF (la spunta resta)',
              onclick: async e => {
                const b = e.currentTarget;
                if (b.dataset.conferma !== '1') {
                  b.dataset.conferma = '1'; b.textContent = 'Sicuro?';
                  setTimeout(() => { b.dataset.conferma = ''; b.textContent = 'Elimina'; }, 3000);
                  return;
                }
                try {
                  for (const f of g.docs) await eliminaDocumento(f);
                  avviso(N > 1 ? `${N} fascicoli eliminati.` : 'PDF eliminato.');
                } catch (ex) { avviso('Non riesco a eliminarlo: ' + (ex.message || ex), { tono: 'allerta' }); }
              },
            })));
      }))
      : h('p', {
          testo: 'Nessun PDF ancora: dal generatore, alla stampa, il documento arriva qui da solo.',
          style: 'color:var(--tenue);font-size:var(--t-mini);margin:0',
        }),
    /* Rifare le schede di un impianto lascia dietro le versioni vecchie, e a
       288 dpi ognuna pesa: da due documenti in su si buttano tutti in un clic
       invece di N. Non serve essere amministratore - e' lo stesso potere che
       l'Elimina di ogni riga da' gia' a tutti (l'anno intero, quello si',
       e' dell'admin: sta nelle Impostazioni). Le spunte restano. */
    docs.length > 1 ? h('div', { style: 'display:flex;justify-content:flex-end;margin-top:8px' },
      h('button.pill.mini.debole', {
        testo: `Elimina tutti (${docs.length})`,
        title: 'Toglie tutti i PDF di questo sito, di ogni anno. Le spunte ' +
          '"stampata" restano.',
        onclick: async e => {
          const b = e.currentTarget;
          if (b.dataset.conferma !== '1') {
            b.dataset.conferma = '1'; b.textContent = `Sicuro? ${docs.length} PDF`;
            setTimeout(() => {
              b.dataset.conferma = ''; b.textContent = `Elimina tutti (${docs.length})`;
            }, 4000);
            return;
          }
          b.disabled = true; b.textContent = 'Elimino…';
          try {
            const { n, bytes } = await eliminaDocumenti({ id_service: idAperto });
            avviso(`${n} PDF eliminati: ${dimensione(bytes)} liberati.`, { tono: 'ok' });
          } catch (ex) {
            avviso('Non riesco a eliminarli: ' + (ex.message || ex), { tono: 'allerta' });
          }
        },
      })) : null);
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
  for (const r of nodo.querySelectorAll('.scheda[data-mese]')) {
    const m = Number(r.dataset.mese);
    const c = cella(idAperto, m), e = statoCella(idAperto, m);
    r.classList.toggle('finita', e.completa);
    r.classList.toggle('ritardo', e.ritardo && !e.completa);
    for (const b of r.querySelectorAll('.passo')) {
      const campo = b.dataset.campo, er = e.ered[campo], pr = !er && proposto(c, campo);
      b.setAttribute('aria-checked', pr ? 'mixed' : String(fatto(c, campo) || !!er));
      b.classList.toggle('eredita', !!er);
      b.classList.toggle('proposto', pr);
      b.title = titoloPasso(campo, er, c);
    }
  }
  const c = cella(idAperto, mese);
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
        html: `<b>${esc(e.operatore)}</b> · ${esc(st.mesiNome[(e.mese || 1) - 1])}${e.anno !== st.anno ? ' ' + e.anno : ''} · ` +
          descriviEvento(e),
      }),
      /* il tastino di reversibilita' dell'admin (#ANCHOR: ruoli) */
      ripristinabile(e) ? h('button.pill.mini.ripristina', {
        testo: (e.op_id || '').includes(':') ? 'Ripristina il blocco' : 'Ripristina',
        title: 'Rimetti com\u2019era prima di questa modifica (tutto il blocco, se era un\u2019azione in blocco)',
        onclick: async ev => {
          ev.currentTarget.disabled = true;
          const n = await ripristina(e);
          if (n >= 0) avviso(`Ripristinato: ${n} ${n === 1 ? 'cella' : 'celle'}.`, { tono: 'ok' });
          caricaStoria(id);
        },
      }) : null))
    : h('li', { testo: 'Nessuna modifica registrata.' }));
  (nodo.querySelector('.storia') || nodo.querySelector('.js-attesa'))?.replaceWith(ul);
}
