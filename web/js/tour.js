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
  /* MOV-07: buco e fumetto stanno a 0,0 (css/banco.css) e si muovono solo con
     transform: niente left/top/width/height animati, che rifanno il layout a ogni
     fotogramma. `anima` falso (scorrimento, resize, prima comparsa) = va a posto
     senza corsa, altrimenti il fumetto inseguirebbe la pagina che scorre. */
  function ridotto() {
    try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; }
  }
  function senzaCorsa(n, fai) {
    n.style.transition = 'none';
    fai();
    void n.offsetWidth;          // il browser prende nota del punto d'arrivo...
    n.style.transition = '';     // ...e la transizione torna quella del CSS
  }
  function sposta(n, x, y, anima) {
    var t = 'translate(' + Math.round(x) + 'px,' + Math.round(y) + 'px)';
    if (anima) n.style.transform = t;
    else senzaCorsa(n, function () { n.style.transform = t; });
  }
  /* La corsa del buco (tecnica FLIP), pura: `prima` e' il rettangolo che si vede
     adesso (anche a meta' di una corsa), x/y/w/h il posto e la misura nuovi. Si
     parte da `da` - il posto vecchio, con la scala che rende il buco nuovo grande
     come il vecchio - e si arriva ad `a`, senza deformazioni: a riposo raggio e
     filo sono quelli veri. Durante la scala l'ombra smisurata si rimpicciolisce
     con lui: `spread` la allarga in proporzione. `da` null = niente corsa. */
  function flip(prima, x, y, w, h) {
    var a = 'translate(' + x + 'px,' + y + 'px) scale(1,1)';
    if (!prima || !(prima.width > 0) || !(prima.height > 0) || !(w > 0) || !(h > 0)) {
      return { da: null, a: a, spread: '9999px' };
    }
    var sx = prima.width / w, sy = prima.height / h;
    var minimo = Math.max(Math.min(sx, sy, 1), 0.02);
    return {
      da: 'translate(' + Math.round(prima.left) + 'px,' + Math.round(prima.top) + 'px) scale(' +
        (Math.round(sx * 1000) / 1000) + ',' + (Math.round(sy * 1000) / 1000) + ')',
      a: a,
      spread: Math.ceil(9999 / minimo) + 'px',
    };
  }
  function muoviBuco(hole, x, y, w, h, anima) {
    var firma = [x, y, w, h].join(',');
    if (hole.getAttribute('data-box') === firma) return;   // scroll e rAF: stesso posto, niente da fare
    hole.setAttribute('data-box', firma);
    var f = flip(anima && !ridotto() ? hole.getBoundingClientRect() : null, x, y, w, h);
    senzaCorsa(hole, function () {
      hole.style.width = w + 'px'; hole.style.height = h + 'px';
      hole.style.transform = f.da || f.a;
      hole.style.setProperty('--tour-spread', f.spread);
    });
    if (f.da) hole.style.transform = f.a;
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
       resize, quindi tocca solo misure, mai il contenuto. `anima` solo al
       cambio di passo: il resto delle volte si va a posto e basta */
    function piazza(anima) {
      if (!ON) return;
      anima = anima === true && !ridotto();
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
        muoviBuco(hole, Math.round(vw / 2), Math.round(vh / 2), 0, 0, false);
        sposta(pop, (vw - pw) / 2, (vh - ph) / 2, anima);
        return;
      }
      /* da un passo senza bersaglio (buco a zero) non c'e' niente da cui partire */
      var daBuio = hole.classList.contains('blind');
      hole.classList.remove('blind');
      var pad = (s.pad === undefined) ? 8 : s.pad, r = el.getBoundingClientRect();
      var x = Math.round(Math.max(-4, r.left - pad)), y = Math.round(Math.max(-4, r.top - pad));
      muoviBuco(hole, x, y, Math.round(Math.min(r.right + pad, vw + 4) - x),
        Math.round(Math.min(r.bottom + pad, vh + 4) - y), anima && !daBuio);
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
      sposta(pop, Math.max(M, Math.min(vw - pw - M, px)), Math.max(M, Math.min(vh - ph - M, py)), anima);
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
      piazza(true);                    // unico punto in cui buco e fumetto scivolano
      requestAnimationFrame(function () { piazza(false); });   // dopo lo scorrimento e il rientro del layout
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

    /* a fine corsa l'ombra del buco torna alla sua misura (durante la scala era allargata) */
    $('tourHole').addEventListener('transitionend', function (e) {
      if (e.propertyName === 'transform') this.style.setProperty('--tour-spread', '9999px');
    });
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

  window.Tour = { crea: crea, visibile: vis, flip: flip };
})();
