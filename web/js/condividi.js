/* condividi.js - il link di un sito, da mandare a un collega (MOB-16).
   #ANCHOR: condividi

Sul telefono e sullo schermo a tocco si usa il foglio di condivisione del
sistema (Web Share API, `navigator.share`): WhatsApp, la mail, Teams... Dove
non c'e' (Firefox sul computer, la versione in ufficio servita in http, che
non e' una pagina sicura) o non serve (il computer, dove si incolla) il link
va negli appunti: "Copia link".

Il link e' quello del tracker con `?service=<id>`: chi lo apre, dopo
l'accesso, si trova il cassetto di quel sito gia' aperto (app.js,
#ANCHOR: apri-da-indirizzo).

Modulo puro: niente DOM, niente import. La copia la passa chi chiama (di
solito ui.copia, che ha anche il ripiego per le pagine non sicure). */

/** Schermo a tocco senza mouse, o finestra stretta quanto un telefono: la
 *  stessa soglia del Planning (useHandheld in web/src/lib/useMedia.ts). */
export const TOCCO = '(max-width: 767px), (hover: none) and (pointer: coarse)';

/** C'e' il foglio del sistema, e ha senso usarlo (mano da telefono)? */
export function condivisioneNativa(nav = globalThis.navigator, finestra = globalThis) {
  if (!nav || typeof nav.share !== 'function') return false;
  try { return !!finestra.matchMedia?.(TOCCO).matches; } catch { return false; }
}

/** L'indirizzo del tracker con il cassetto del sito aperto. */
export function linkService(id, origine = globalThis.location?.origin || '') {
  return `${origine}/?service=${encodeURIComponent(String(id))}`;
}

/** L'id del sito chiesto dall'indirizzo (`?service=123`), 0 se non c'e'. */
export function serviceDaIndirizzo(search = globalThis.location?.search || '') {
  const n = Number(new URLSearchParams(search).get('service'));
  return Number.isInteger(n) && n > 0 ? n : 0;
}

/**
 * Condivide `{titolo, testo, url}`. Esiti:
 *   'condiviso'    il foglio del sistema ha fatto il suo lavoro;
 *   'annullato'    chiuso senza scegliere: nessuna copia, nessun avviso;
 *   'copiato'      negli appunti (sul computer, o se il sistema ha rifiutato);
 *   'non-riuscito' ne' foglio ne' appunti.
 * `nativo` falso salta il foglio anche se c'e' (il computer).
 */
export async function condividiLink({ titolo, testo, url }, { nativo = true, copia, nav = globalThis.navigator } = {}) {
  if (nativo && nav && typeof nav.share === 'function') {
    const dati = { title: titolo, url, ...(testo ? { text: testo } : {}) };
    let si = true;
    try { si = typeof nav.canShare !== 'function' || nav.canShare(dati); } catch { si = false; }
    if (si) {
      try {
        await nav.share(dati);
        return 'condiviso';
      } catch (e) {
        if (e?.name === 'AbortError') return 'annullato';
        /* un altro rifiuto: si prova con gli appunti */
      }
    }
  }
  const copiaFn = copia || (async t => {
    try { await nav.clipboard.writeText(t); return true; } catch { return false; }
  });
  return (await copiaFn(url)) ? 'copiato' : 'non-riuscito';
}
