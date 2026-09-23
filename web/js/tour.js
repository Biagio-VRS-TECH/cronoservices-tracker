/* tour.js - il TUTORIAL GUIDATO dei generatori (schede tecnici e registro dei
   componenti). Una guida che parla addosso ai comandi veri: a ogni passo si
   accende il bersaglio (#tourHole, la cui ombra smisurata fa la penombra) e il
   fumetto (#tourPop) si mette accanto, dal lato dove c'e' posto. I clic li
   ferma #tourVeil. Il markup lo costruisce qui `crea()`, una volta: le pagine
   non lo ripetono. CSS in css/banco.css (sezione TUTORIAL GUIDATO).
   Script classico, non modulo: `window.Tour`. Era dentro schede/index.html
   (TOUR_STEPS, tourPlace, tourGo); dalla 30a sessione e' condiviso.
   #ANCHOR: tour

   Tour.crea({
     passi:   [{sel, title, tx, place, pad, note, off}]
              sel: selettore del bersaglio, o elenco (vale il primo che si
                   vede davvero), o null (passo senza bersaglio, fumetto al
                   centro). place: 'right'|'left'|'below'|'above' da provare
                   per primo. note: nota sotto il testo. off: la nota quando il
                   bersaglio non c'e' (una parte che compare solo a file caricato).
     chiave:  la chiave localStorage che ricorda "gia' vista"
     primaDi: () => {}   prima di partire (es. caricare l'esempio)
     dopo:    () => {}   alla chiusura (es. togliere l'esempio)
     scorri:  (el) => {} come portare in vista il bersaglio (default: il riquadro
              che scorre piu' vicino, con un salto secco)
     autoAvvio: true     parte da sola al primo utilizzo (dopo mezzo secondo)
   }) -> { avvia(), chiudi(), attivo(), vista(), piazza() } */
(function () {
  function vis(el) {
    if (!el) return null;
    var r = el.getClientRects();
    /* getClientRects e non offsetParent, che e' null anche per gli elementi
       position:fixed quando invece si vedono. La soglia sull'altezza serve a
       #zoomwrap, che esiste sempre ma senza pagine e' alto zero */
    return (r.length && r[0].height > 8 && r[0].width > 0) ? el : null;
  }
  function riquadroCheScorre(el) {
    for (var p = el.parentElement; p; p = p.parentElement) {
      var o = getComputedStyle(p).overflowY;
      if ((o === 'auto' || o === 'scroll') && p.scrollHeight > p.clientHeight + 1) return p;
    }
    return null;
  }
  /* MOV-07: la posizione passa da transform (niente layout a ogni passo);
     left/top restano a 0. La misura del riquadro resta width/height: scalarlo
     deformerebbe il raggio e l'ombra. */
  function sposta(n, x, y) {
    n.style.left = '0'; n.style.top = '0';
    n.style.transform = 'translate(' + Math.round(x) + 'px,' + Math.round(y) + 'px)';
  }
  function portaInVista(el) {
    var sc = riquadroCheScorre(el);
    if (!sc) { try { el.scrollIntoView({ block: 'center' }); } catch (e) { } return; }
    var r = el.getBoundingClientRect(), rs = sc.getBoundingClientRect();
    var top = sc.scrollTop + (r.top - rs.top) - Math.max(0, (sc.clientHeight - r.height) / 2);
    sc.scrollTop = Math.max(0, Math.round(top));   // salto secco, come nelle schede
  }
  function markup() {
    var w = document.getElementById('tourWrap');
    if (w) return w;
    w = document.createElement('div');
    w.id = 'tourWrap'; w.hidden = true;
    w.innerHTML =
      '<div id="tourVeil"></div><div id="tourHole"></div>' +
      '<div id="tourPop" role="dialog" aria-modal="true" aria-labelledby="tourTitle">' +
      '<p class="tour-k">Guida &middot; passo <span id="tourNum"></span></p>' +
      '<h3 id="tourTitle"></h3><div class="tour-tx" id="tourText"></div>' +
      '<p id="tourNote" hidden></p><div id="tourDots" aria-hidden="true"></div>' +
      '<div class="tour-nav">' +
      '<button type="button" class="tour-lnk" id="tourSkip">Chiudi la guida</button>' +
      '<button type="button" class="btn sec" id="tourPrev">Indietro</button>' +
      '<button type="button" class="btn" id="tourNext">Avanti</button>' +
      '</div></div>';
    document.body.appendChild(w);
    return w;
  }

  function crea(cfg) {
    var PASSI = cfg.passi || [], KEY = cfg.chiave || 'cs.tour';
    var scorri = cfg.scorri || portaInVista;
    var I = 0, ON = false, RAF = null, prima = null;
    var wrap = markup();
    var $ = function (id) { return document.getElementById(id); };

    function bersaglio(s) {
      if (!s.sel) return null;
      var list = (typeof s.sel === 'string') ? [s.sel] : s.sel;
      for (var i = 0; i < list.length; i++) {
        var el = vis(document.querySelector(list[i]));
        if (el) return el;
      }
      return null;
    }
    /* mette buco e fumetto sul bersaglio: chiamata anche da scorrimento e
       resize, quindi tocca solo misure, mai il contenuto */
    function piazza() {
      if (!ON) return;
      var s = PASSI[I], el = bersaglio(s);
      var hole = $('tourHole'), pop = $('tourPop');
      var vw = window.innerWidth || document.documentElement.clientWidth;
      var vh = window.innerHeight || document.documentElement.clientHeight;
      var pw = pop.offsetWidth, ph = pop.offsetHeight, M = 12;
      if (!el) {
        /* niente da illuminare: il buco si annulla al centro dello schermo, non
           fuori campo - l'ombra si espande dai bordi del riquadro, e un riquadro
           a -9999px lascerebbe scoperto tutto lo schermo */
        hole.classList.add('blind');
        sposta(hole, vw / 2, vh / 2);
        hole.style.width = '0px'; hole.style.height = '0px';
        sposta(pop, (vw - pw) / 2, (vh - ph) / 2);
        return;
      }
      hole.classList.remove('blind');
      var pad = (s.pad === undefined) ? 8 : s.pad, r = el.getBoundingClientRect();
      var x = Math.max(-4, r.left - pad), y = Math.max(-4, r.top - pad);
      sposta(hole, x, y);
      hole.style.width = Math.round(Math.min(r.right + pad, vw + 4) - x) + 'px';
      hole.style.height = Math.round(Math.min(r.bottom + pad, vh + 4) - y) + 'px';
      var G = 14, px = null, py = null;
      var order = (s.place === 'left') ? ['left', 'right', 'below', 'above']
        : (s.place === 'below') ? ['below', 'above', 'right', 'left']
        : (s.place === 'above') ? ['above', 'below', 'right', 'left']
        : ['right', 'left', 'below', 'above'];
      for (var i = 0; i < order.length && px === null; i++) {
        var o = order[i];
        if (o === 'right' && r.right + G + pw + M <= vw) { px = r.right + G; py = r.top + r.height / 2 - ph / 2; }
        else if (o === 'left' && r.left - G - pw - M >= 0) { px = r.left - G - pw; py = r.top + r.height / 2 - ph / 2; }
        else if (o === 'below' && r.bottom + G + ph + M <= vh) { py = r.bottom + G; px = r.left + r.width / 2 - pw / 2; }
        else if (o === 'above' && r.top - G - ph - M >= 0) { py = r.top - G - ph; px = r.left + r.width / 2 - pw / 2; }
      }
      if (px === null) { px = (vw - pw) / 2; py = (vh - ph) / 2; }
      sposta(pop, Math.max(M, Math.min(vw - pw - M, px)), Math.max(M, Math.min(vh - ph - M, py)));
    }
    function vai(i) {
      I = Math.max(0, Math.min(PASSI.length - 1, i));
      var s = PASSI[I], last = (I === PASSI.length - 1), el = bersaglio(s);
      $('tourNum').textContent = (I + 1) + ' di ' + PASSI.length;
      $('tourTitle').textContent = s.title;
      $('tourText').innerHTML = s.tx;
      var nt = el ? (s.note || '') : (s.sel ? (s.off || s.note || '') : (s.note || ''));
      var n = $('tourNote');
      n.innerHTML = nt; n.hidden = !nt;
      var dots = $('tourDots');
      if (dots.children.length !== PASSI.length) {
        dots.innerHTML = PASSI.map(function () { return '<i></i>'; }).join('');
      }
      Array.prototype.forEach.call(dots.children, function (d, k) {
        d.className = (k === I) ? 'on' : (k < I ? 'done' : '');
      });
      $('tourPrev').disabled = (I === 0);
      $('tourNext').textContent = last ? 'Ho capito' : 'Avanti';
      if (el) scorri(el);
      piazza();
      requestAnimationFrame(piazza);   // dopo lo scorrimento e il rientro del layout
      $('tourNext').focus();
    }
    function avvia() {
      if (ON) return;
      if (cfg.primaDi) cfg.primaDi();
      prima = document.activeElement;
      wrap.hidden = false;
      ON = true;
      vai(0);
    }
    function chiudi() {
      if (!ON) return;
      ON = false;
      wrap.hidden = true;
      if (cfg.dopo) cfg.dopo();
      // il fuoco torna a chi aveva aperto la guida
      if (prima && prima.isConnected && prima.focus) { try { prima.focus(); } catch (e) { } }
      prima = null;
      try { localStorage.setItem(KEY, '1'); } catch (e) { }
    }
    function vista() { try { return !!localStorage.getItem(KEY); } catch (e) { return true; } }
    function avanti() { if (I >= PASSI.length - 1) chiudi(); else vai(I + 1); }

    $('tourNext').onclick = avanti;
    $('tourPrev').onclick = function () { vai(I - 1); };
    $('tourSkip').onclick = chiudi;
    /* un clic fuori dal fumetto non chiude niente e non cambia nessuna
       impostazione: il velo esiste apposta */
    $('tourVeil').onclick = function (e) { e.preventDefault(); };
    window.addEventListener('keydown', function (e) {
      if (!ON) return;
      if (e.key === 'Escape') { e.preventDefault(); chiudi(); }
      /* aria-modal vuol dire che dietro non si naviga: il Tab gira fra i
         pulsanti del fumetto (come la modale di ui.js) */
      else if (e.key === 'Tab') {
        var f = Array.prototype.filter.call(
          $('tourPop').querySelectorAll('button:not([disabled]),a[href],[tabindex]:not([tabindex="-1"])'),
          function (x) { return x.offsetParent !== null; });
        if (!f.length) return;
        var k = f.indexOf(document.activeElement);
        if (e.shiftKey && k <= 0) { e.preventDefault(); f[f.length - 1].focus(); }
        else if (!e.shiftKey && (k === -1 || k === f.length - 1)) { e.preventDefault(); f[0].focus(); }
      }
      else if (e.key === 'ArrowRight' || e.key === 'PageDown') { e.preventDefault(); avanti(); }
      else if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); vai(I - 1); }
    });
    /* in fase di capture: lo scorrimento di un pannello non risale fino a
       window, ma l'evento passa comunque da qui */
    window.addEventListener('scroll', function () {
      if (!ON || RAF) return;
      RAF = requestAnimationFrame(function () { RAF = null; piazza(); });
    }, { passive: true, capture: true });
    window.addEventListener('resize', function () { if (ON) piazza(); });

    /* al primo utilizzo la guida parte da sola: chi apre la pagina per la prima
       volta non sa che esiste un tastino con il punto di domanda */
    if (cfg.autoAvvio && !vista()) setTimeout(function () { if (!ON) avvia(); }, 500);

    return { avvia: avvia, chiudi: chiudi, attivo: function () { return ON; }, vista: vista, piazza: piazza };
  }

  window.Tour = { crea: crea, visibile: vis };
})();
