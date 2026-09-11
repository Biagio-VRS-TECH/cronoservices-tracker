/* gruppi.js - i gruppi del pannello di sinistra dei generatori si aprono e si
   chiudono: il titolo (h2) di ogni gruppo e' il suo interruttore, #grpTutti
   nella barra del marchio li gira tutti insieme. Lo stato (quali sono chiusi)
   si ricorda per pagina in localStorage. Il gruppo "Esporta" (#exportGrp) resta
   sempre aperto: e' l'uscita del lavoro. Script classico, non modulo: gira
   prima dei moduli e non dipende da niente. CSS in css/banco.css.
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
  if (tutti) tutti.addEventListener('click', function () {
    var chiudi = !tuttiChiusi();
    gruppi.forEach(function (g) { metti(g, chiudi); });
    salva(); aggiornaTutti();
  });
  aggiornaTutti();
})();
