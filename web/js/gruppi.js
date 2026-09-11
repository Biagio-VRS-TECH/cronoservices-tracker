/* gruppi.js - i gruppi del pannello di sinistra dei generatori si aprono e si
   chiudono: il titolo (h2) di ogni gruppo e' il suo interruttore, #grpTutti
   nella barra del marchio li gira tutti insieme. Lo stato (quali sono chiusi)
   si ricorda per pagina in localStorage. Il gruppo "Esporta" (#exportGrp) resta
   sempre aperto: e' l'uscita del lavoro. Script classico, non modulo: gira
   prima dei moduli e non dipende da niente. CSS in css/banco.css.

   Qui sta anche l'ENTRATA: all'apertura della pagina, e ogni volta che un file
   entra e i gruppi si riempiono (i generatori chiamano `entrataGruppi()`), i
   pannelli salgono uno dopo l'altro e il filo del titolo corre. Il banco che
   si apparecchia, e l'ordine in cui si lavora che si legge da solo.
   #ANCHOR: gruppi */
(function () {
  var side = document.getElementById('side');
  if (!side) return;
  var CHIAVE = 'cs.gruppi.' + location.pathname.replace(/[^a-z]/gi, '');
  var gruppi = Array.prototype.filter.call(side.querySelectorAll('.grp'), function (g) {
    return g.id !== 'exportGrp' && g.querySelector(':scope > h2');
  });
  var chiusi = {};
  try { chiusi = JSON.parse(localStorage.getItem(CHIAVE) || '{}') || {}; } catch (e) { }
  function salva() { try { localStorage.setItem(CHIAVE, JSON.stringify(chiusi)); } catch (e) { } }
  function titolo(g) { return g.querySelector(':scope > h2'); }
  function metti(g, chiuso) {
    g.classList.toggle('chiuso', chiuso);
    titolo(g).setAttribute('aria-expanded', chiuso ? 'false' : 'true');
    if (g.id) { if (chiuso) chiusi[g.id] = 1; else delete chiusi[g.id]; }
  }
  function tuttiChiusi() {
    return gruppi.length > 0 && gruppi.every(function (g) { return g.classList.contains('chiuso'); });
  }
  var tutti = document.getElementById('grpTutti');
  function aggiornaTutti() {
    if (!tutti) return;
    var t = tuttiChiusi();
    tutti.classList.toggle('chiusi', t);
    tutti.title = t ? 'Apri tutti i gruppi' : 'Chiudi tutti i gruppi';
    tutti.setAttribute('aria-label', tutti.title);
  }
  gruppi.forEach(function (g) {
    var h = titolo(g);
    h.setAttribute('role', 'button');
    h.tabIndex = 0;
    metti(g, !!(g.id && chiusi[g.id]));
    var gira = function () { metti(g, !g.classList.contains('chiuso')); salva(); aggiornaTutti(); };
    h.addEventListener('click', gira);
    h.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); gira(); }
    });
  });
  /* ---- l'entrata a scalare ---------------------------------------------
     Il ritardo di ognuno e' il suo posto nella colonna (--entra-k), scritto
     qui perche' i gruppi visibili cambiano: col file caricato ci sono anche
     l'albero e i controlli. Chi ha chiesto meno movimento non vede niente. */
  function entrata() {
    if (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    var elenco = Array.prototype.filter.call(
      document.querySelectorAll('#side .grp, #treecol .grp'),
      function (g) { return g.offsetParent !== null; });
    elenco.forEach(function (g, i) {
      g.classList.remove('entra');
      g.style.setProperty('--entra-k', i);
    });
    void side.offsetWidth;          // un reflow solo: poi partono tutti insieme
    elenco.forEach(function (g) {
      g.classList.add('entra');
      g.addEventListener('animationend', function via(e) {
        if (e.target !== g) return;   // il filo del titolo e' un ::after dell'h2
        g.classList.remove('entra');
        g.style.removeProperty('--entra-k');
        g.removeEventListener('animationend', via);
      });
    });
  }
  window.entrataGruppi = entrata;

  if (tutti) tutti.addEventListener('click', function () {
    var chiudi = !tuttiChiusi();
    gruppi.forEach(function (g) { metti(g, chiudi); });
    salva(); aggiornaTutti();
  });
  aggiornaTutti();
  entrata();
})();
