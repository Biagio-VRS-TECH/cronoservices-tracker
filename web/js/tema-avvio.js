/* tema-avvio.js - il tema PRIMA del primo disegno (VIS-22).  #ANCHOR: tema-avvio

Script classico nel <head> di index.html (niente type=module: i moduli partono
dopo che la pagina e' gia' stata disegnata, e senza questo si vedeva un lampo
del tema chiaro prima di quello scuro). Legge la stessa chiave di
js/famiglia.js (`cs.tema`: 'chiaro' | 'scuro' | '' = segui il sistema) e mette
sul <html> tutti e due gli attributi: `data-tema` (i fogli di CronoService) e
`data-theme` (vrs-famiglia.css, come il Planning).

Chi arriva dal Planning o dallo Scheduler porta la scelta nell'indirizzo,
`?vrs_tema=<auto|light|dark>.<millisecondi>` (la aggiungono i loro link di
«Le app VRS»; i nostri verso di loro la aggiungono in famiglia.js); con i
sottodomini c'e' anche il cookie `vrs_tema` sul dominio padre. Vince la scelta
piu' recente (`cs.tema.t`), il parametro poi si toglie dall'indirizzo. E' il
gemello di public/tema-avvio.js del Planning: si cambiano insieme. */
(function () {
  var A_CS = { auto: '', light: 'chiaro', dark: 'scuro' };
  var DA_CS = { chiaro: 'light', scuro: 'dark' };
  var tema = '';
  var quando = 0;
  var st = null;
  try {
    st = window.localStorage;
    tema = st.getItem('cs.tema') || '';
    quando = Number(st.getItem('cs.tema.t')) || 0;
  } catch {
    st = null; // navigazione privata: vale l'indirizzo, il resto lo rifa' famiglia.js
  }
  function prendi(valore) {
    var m = /^(auto|light|dark)\.(\d{10,16})$/.exec(valore || '');
    if (!m || Number(m[2]) <= quando) return;
    tema = A_CS[m[1]];
    quando = Number(m[2]);
    try {
      if (st) { st.setItem('cs.tema', tema); st.setItem('cs.tema.t', String(quando)); }
    } catch { /* pieno o bloccato: vale per questa pagina */ }
  }
  try {
    var q = new URLSearchParams(location.search);
    if (q.has('vrs_tema')) {
      prendi(q.get('vrs_tema'));
      q.delete('vrs_tema');
      var resto = q.toString();
      history.replaceState(history.state, '', location.pathname + (resto ? '?' + resto : '') + location.hash);
    }
    var c = /(?:^|;\s*)vrs_tema=([^;]+)/.exec(document.cookie);
    if (c) prendi(decodeURIComponent(c[1]));
  } catch { /* indirizzo o cookie illeggibili: resta il tema di questo browser */ }
  var r = document.documentElement;
  if (tema === 'chiaro' || tema === 'scuro') {
    r.dataset.tema = tema;
    r.dataset.theme = DA_CS[tema];
  }
})();
