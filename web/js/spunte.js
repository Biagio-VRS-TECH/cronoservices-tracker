/* spunte.js - il popover della cella: i quattro passi, nota, storia.
   Usato dalla vista Anno; la vista Mese ha i passi in linea.
   #ANCHOR: popover */
import { h, ICO, esc, quando, avviso } from './ui.js';
import { chiama, segnalaFuoco } from './api.js';
import { st, CAMPI, SIGLA, PASSI, ETICHETTA, cella, statoCella, spuntaMolte, salvaNota, toccaPasso,
  doveFatto, fatto, proposto, possoApprovare, descriviEvento, ripristina, ripristinabile } from './stato.js';

let aperto = null;

/** C'e' un popover aperto? Serve alla vista Anno: muovendosi con le frecce il
 *  popover segue la cella col fuoco invece di restare appeso a quella vecchia. */
export const popAperto = () => !!aperto;

export function chiudiPop() {
  aperto?.nodo.remove();
  if (aperto) segnalaFuoco('');       // i colleghi vedono che ho lasciato la cella
  aperto = null;
  document.removeEventListener('pointerdown', fuori, true);
  document.removeEventListener('keydown', tasti, true);
}

const fuori = e => { if (aperto && !aperto.nodo.contains(e.target)) chiudiPop(); };
const tasti = e => {
  if (e.key === 'Escape') {
    const cella = aperto?.bersaglio;
    chiudiPop();
    if (cella?.isConnected) cella.focus?.();   // si torna alla cella da cui si era partiti
    return;
  }
  if (!aperto) return;
  /* Tab dalla cella: si entra nel popover (che sta in fondo al body, quindi
     altrimenti sarebbe irraggiungibile senza attraversare tutta la griglia). */
  if (e.key === 'Tab' && !e.shiftKey && e.target === aperto.bersaglio) {
    const primo = aperto.nodo.querySelector('.passo,button,textarea');
    if (primo) { e.preventDefault(); primo.focus(); }
    return;
  }
  const i = '1234'.indexOf(e.key);
  if (i >= 0 && !e.target.matches?.('textarea,input')) { e.preventDefault(); attiva(CAMPI[i]); }
};

function attiva(campo) {
  const { id, mese } = aperto;
  /* un passo ereditato (#ANCHOR: passi-cumulativi) il clic lo toglie da dove
     e' stato messo: ci pensa toccaPasso */
  toccaPasso(id, mese, campo);
  disegnaPassi();
}

/* Costruisce la riga di un passo: numero, casella, etichetta, e per un passo
   ereditato dove e' stato fatto. */
function rigaPasso(campo, n, e) {
  const er = e.ered[campo];
  const pr = !er && proposto(e.c, campo);          // in attesa di chi approva (#ANCHOR: ruoli)
  const on = fatto(e.c, campo) || !!er;
  return h('button.passo' + (er ? '.eredita' : '') + (pr ? '.proposto' : ''), {
    role: 'checkbox', 'aria-checked': pr ? 'mixed' : String(on), 'data-campo': campo,
    title: er ? `Gi\u00e0 fatta ${doveFatto(er)}${er.by ? ' da ' + er.by : ''}: un clic la toglie da l\u00ec`
      : pr ? (possoApprovare() ? 'Proposta dall\u2019operatore: un clic la approva' : 'In attesa di chi approva: un clic la ritira')
      : null,
    onclick: () => attiva(campo),
  },
    h('span.n-passo', { testo: n + '.' }),
    h('span.box', { html: ICO.ok }),
    h('span.et', { testo: ETICHETTA[campo] }),
    er ? h('span.chi', { testo: doveFatto(er) + (er.by ? ' \u00b7 ' + er.by : '') }) : null,
    pr ? h('span.chi', { testo: 'in attesa' + (e.c.by ? ' \u00b7 ' + e.c.by : '') }) : null,
  );
}

function disegnaPassi() {
  if (!aperto) return;
  const e = statoCella(aperto.id, aperto.mese), c = e.c;
  const cont = aperto.nodo.querySelector('.passi');
  cont.replaceChildren(...CAMPI.map((campo, i) => rigaPasso(campo, i + 1, e)));
  const tutte = e.n === PASSI;
  const b = aperto.nodo.querySelector('.js-tutte');
  b.textContent = tutte ? 'Azzera i passi di questo mese' : 'Completa i passi mancanti';
  b.disabled = tutte && e.mie === 0;      // sono tutti ereditati: qui non c'e' niente da togliere
  const firma = aperto.nodo.querySelector('.js-firma');
  firma.textContent = c.at ? `ultima modifica ${quando(c.at)} · ${c.by || '?'}` : 'nessuna modifica';
}

/** La cella e' cambiata mentre il popover era aperto (di solito: un altro
 *  operatore). I quattro passi si riscrivono sempre; la nota **no**, se chi sta
 *  qui l'ha gia' toccata: sovrascrivere il testo sotto le dita e' il modo piu'
 *  sicuro per far perdere del lavoro. In quel caso il testo altrui resta
 *  annunciato sopra la casella, e quando si esce dal campo il server dira' che
 *  c'e' un conflitto (api.nota) offrendo di unire le due frasi. */
export function rinfrescaPop(id, mese) {
  if (!aperto || aperto.id !== id || aperto.mese !== mese) return;
  disegnaPassi();
  const ta = aperto.nodo.querySelector('textarea');
  const c = cella(id, mese), nuova = c.nota || '';
  const mioTesto = ta.value !== aperto.notaVista;
  if (!mioTesto) { ta.value = nuova; aperto.notaVista = nuova; aperto.notaRev = c.rev; }
  const eco = aperto.nodo.querySelector('.js-eco-nota');
  const dillo = mioTesto && nuova !== aperto.notaVista;
  eco.hidden = !dillo;
  if (dillo) eco.textContent = `${c.by || 'Un altro operatore'} intanto ha scritto: “${nuova || '(nota tolta)'}”`;
}

/** Apre il popover ancorato all'elemento della cella. */
export function apriPop(bersaglio, id, mese) {
  chiudiPop();
  const s = st.perServ.get(id);
  const c = cella(id, mese);

  const nodo = h('div.pop', { role: 'dialog', 'aria-label': 'Spunte mappatura' },
    h('h3', { testo: `${st.mesiNome[mese - 1]} ${st.anno}` }),
    h('p.pop-sotto', { testo: `#${id} · ${s?.dest || ''}`.slice(0, 60), title: `#${id} · ${s?.dest || ''}` }),
    h('div.passi'),
    h('div.pop-nota', {},
      h('p.js-eco-nota', { hidden: true }),
      h('textarea', {
        placeholder: 'Nota (opzionale)', 'aria-label': 'Nota', maxlength: 500,
        /* la base e' quella che si vedeva quando la casella e' stata riempita:
           se intanto e' arrivata la nota di un altro, il server se ne accorge e
           chiede quale tenere invece di sovrascriverla in silenzio */
        onchange: e => {
          const v = e.target.value.trim();
          salvaNota(id, mese, v, { rev: aperto?.notaRev, nota: aperto?.notaVista });
          if (aperto) aperto.notaVista = v;
        },
      })),
    h('div.pop-piede', {},
      h('button.js-tutte', {
        onclick: () => {
          const e = statoCella(id, mese);
          const v = e.n !== PASSI;
          // si mettono solo i passi che mancano davvero (non gli ereditati) e
          // si tolgono solo quelli messi in questo mese
          const voci = CAMPI.filter(k => v ? (!fatto(e.c, k) && !e.ered[k]) : e.c[SIGLA[k]] !== 0)
            .map(campo => ({ id, mese, campo, valore: v }));
          if (voci.length) spuntaMolte(voci);
          disegnaPassi();
        }
      }),
      h('button.primario', { testo: 'Storia', onclick: () => mostraStoria(id, mese) })),
    h('p.js-firma', { style: 'margin:8px 0 0;font-size:var(--t-micro);color:var(--tenue-2)' }),
  );

  nodo.querySelector('textarea').value = c.nota || '';
  document.body.append(nodo);

  // posizionamento: sotto la cella, rientrato nella finestra
  const r = bersaglio.getBoundingClientRect();
  const w = nodo.offsetWidth, hh = nodo.offsetHeight;
  let x = Math.min(Math.max(8, r.left + r.width / 2 - w / 2), innerWidth - w - 8);
  let y = r.bottom + 8;
  if (y + hh > innerHeight - 8) y = Math.max(8, r.top - hh - 8);
  nodo.style.left = x + 'px';
  nodo.style.top = y + 'px';

  aperto = { nodo, id, mese, bersaglio, notaVista: c.nota || '', notaRev: c.rev };
  segnalaFuoco(`${id}-${mese}`);      // i colleghi vedono che sono qui (#ANCHOR: fuoco)
  disegnaPassi();
  // la tastiera si collega subito (un Esc immediato andava perso); il
  // pointerdown al giro dopo, per non farsi chiudere dal clic che ha aperto
  document.addEventListener('keydown', tasti, true);
  setTimeout(() => document.addEventListener('pointerdown', fuori, true), 0);
}

async function mostraStoria(id, mese) {
  const cont = aperto?.nodo;
  if (!cont) return;
  let dati;
  try {
    ({ dati } = await chiama(`/api/storia?id_service=${id}&anno=${st.anno}&mese=${mese}`));
  } catch {
    avviso('Storia non disponibile offline.', { tono: 'allerta' });
    return;
  }
  const righe = (dati.storia || []).map(e => h('li', {},
    h('time', { testo: quando(e.ts) }),
    h('span', { html: `<b>${esc(e.operatore)}</b> ${descriviEvento(e)}` }),
    /* il tastino di reversibilita' dell'admin (#ANCHOR: ruoli): rimette il
       passo com'era prima di quella riga, sue mosse comprese */
    ripristinabile(e) ? h('button.pill.mini.ripristina', {
      testo: (e.op_id || '').includes(':') ? 'Ripristina il blocco' : 'Ripristina',
      title: 'Rimetti com\u2019era prima di questa modifica (tutto il blocco, se era un\u2019azione in blocco)',
      onclick: async ev => {
        ev.currentTarget.disabled = true;
        const n = await ripristina(e);
        if (n >= 0) avviso(`Ripristinato: ${n} ${n === 1 ? 'cella' : 'celle'}.`, { tono: 'ok' });
        disegnaPassi();
        mostraStoria(id, mese);
      },
    }) : null,
  ));
  const box = h('ul.storia', {}, righe.length ? righe :
    h('li', { testo: 'Nessuna modifica registrata.' }));
  cont.querySelector('.storia')?.remove();
  cont.append(box);
}
