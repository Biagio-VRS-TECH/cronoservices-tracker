/* schede.js - il generatore di SCHEDE TECNICI (web/schede/index.html): logo,
   lettura del foglio Excel, modello piano/reparto/stanza, schede, copertina e
   indice, impaginazione, albero dei filtri, impostazioni, tutorial.
   COD-07: era lo script in linea della pagina, spostato qui tale e quale per
   averlo sotto `node --check` e nelle prove (tests/js/web-schede.test.mjs).
   Script CLASSICO, non modulo, e deve restarlo: le funzioni e le `var` in
   cima sono globali perche' le chiamano gli onclick= scritti nell'HTML che lo
   script stesso genera (closeNotes, showNotes, showSkippedRows...) e perche'
   schede/ponte.js riaggancia window.loadRows, window.unloadFile e
   window.aggiornaTitoloSito. Va caricato dopo /lib/xlsx.min.js e /js/tour.js
   e prima di gruppi.js e ponte.js, nel punto dov'era lo script in linea.
   La mappa delle sezioni (i commenti ====== NOME ======) e' in
   web/schede/HANDOFF.md. */
var LOGO="data:image/png;base64,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";
var DATA=null, FULL=null, ZOOM=1;
/* ANCHORS: chiave piano/reparto/stanza -> indice della prima pagina che la
   contiene, per il salto dall'albero. SHOES: le schede scarpa nell'anteprima. */
var ANCHORS={}, SHOES=[], SHOE_I=-1;
var PART_ANCHORS=[], partObserverRAF=null;
/* barra di scorrimento: nessuno stato da ricordare fra un aggiornamento e
   l'altro (a differenza della vecchia mappa a miniature, che teneva un
   elenco di cloni) - solo se il trascinamento e' in corso */
var DS_DRAG=false;
/* compact:true = scheda senza riquadri note, con la sola spunta di verifica
   del service: e' l'unico modo di far stare 8, 10 o 12 schede in un foglio
   lasciandole ancora leggibili sul campo. clamp = righe di descrizione. */
var DENS={
  4:{h:52,  top:17.5, lines:3, fs:10.5, code:17,   desc:12.6, descl:8.8, clamp:2},
  5:{h:44,  top:16.2, lines:2, fs:10,   code:16.2, desc:12.1, descl:9,   clamp:2},
  6:{h:37.5,top:15,   lines:2, fs:9.6,  code:15.2, desc:11.3, descl:8.6, clamp:2},
  8:{h:28,  top:28,   lines:0, fs:9.2,  code:14.5, desc:10.9, descl:8.1, clamp:2, compact:true},
  10:{h:22, top:22,   lines:0, fs:8.8,  code:13.4, desc:10.1, descl:7.7, clamp:2, compact:true},
  12:{h:18, top:18,   lines:0, fs:8.4,  code:12.7, desc:9.6,  descl:7.3, clamp:1, compact:true}
};

function norm(s){return String(s==null?'':s).replace(/\s*\n\s*/g,' ').replace(/\s+/g,' ').trim();}

/* calzature: il controllo e' sul CODICE dell'articolo, es. in
   "112648 - **FV** SCARPA YODA S3 SRC PIANO: ..." il codice e' 112648.
   L'elenco e' fisso e vive qui nel codice (non e' esposto nel pannello ne' nelle
   impostazioni salvate): codici separati da virgola o spazio, l'asterisco fa da
   jolly, es. 1126* prende tutti i codici che iniziano per 1126.
   Le schede corrispondenti vengono stampate in arancione. */
var SHOE_CODES_SRC='112648';
function parseShoeCodes(txt){
  return String(txt||'').split(/[\s,;|]+/).reduce(function(a,x){
    x=x.trim().toUpperCase(); if(!x) return a;
    a.push(x.indexOf('*')>=0
      ? {re:new RegExp('^'+x.replace(/[.+?^${}()|[\]\\]/g,'\\$&').replace(/\*/g,'.*')+'$')}
      : {code:x});
    return a;
  },[]);
}
var SHOE_CODES=parseShoeCodes(SHOE_CODES_SRC);
function isShoe(it){
  if(!SHOE_CODES) SHOE_CODES=parseShoeCodes(SHOE_CODES_SRC);
  var c=String((it&&it.code)||'').trim().toUpperCase();
  if(!c) return false;
  for(var i=0;i<SHOE_CODES.length;i++){
    var p=SHOE_CODES[i];
    if(p.re){ if(p.re.test(c)) return true; }
    else if(p.code===c) return true;
  }
  return false;
}
function esc(s){return String(s).replace(/[&<>]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;'}[c];});}
function escA(s){return esc(s).replace(/"/g,'&quot;');}
/* confronto "naturale": 2 viene prima di 10, e 007 prima di 08. Le posizioni
   sono codici misti (012, 12A, B3) e l'ordine alfabetico puro sballerebbe. */
function natCmp(a,b){
  a=String(a==null?'':a); b=String(b==null?'':b);
  if(!a&&b) return 1;            /* le posizioni non indicate vanno in fondo */
  if(a&&!b) return -1;
  var ra=a.match(/(\d+|\D+)/g)||[], rb=b.match(/(\d+|\D+)/g)||[], n=Math.max(ra.length,rb.length);
  for(var i=0;i<n;i++){
    var x=ra[i], y=rb[i];
    if(x===undefined) return -1;
    if(y===undefined) return 1;
    var dx=/^\d/.test(x), dy=/^\d/.test(y);
    if(dx&&dy){ var d=parseInt(x,10)-parseInt(y,10); if(d) return d<0?-1:1; }
    else { var c=x.localeCompare(y,'it'); if(c) return c; }
  }
  return 0;
}

/* livello edilizio di un piano, per ordinarli in sequenza (interrato, terra,
   primo, secondo...) invece che alfabeticamente: alfabetico metterebbe PRIMO
   prima di TERRA, che e' l'ordine contrario a quello dell'edificio. I piani
   numerici (PIANO: 0, 1, -1) si riconoscono da soli; le etichette italiane piu'
   comuni vengono tradotte allo stesso livello. "PIANO " in testa e roba dopo il
   nome (es. "TERRA EST") non impediscono il riconoscimento. Quello che non si
   riconosce (ESTERNO, nomi liberi) torna null: chi chiama lo mette in fondo */
var FLOOR_WORDS={INTERRATO:-1,SEMINTERRATO:-1,SCANTINATO:-1,
  TERRA:0,TERRENO:0,PT:0,AMMEZZATO:0.5,MEZZANINO:0.5,
  PRIMO:1,P1:1,SECONDO:2,P2:2,TERZO:3,P3:3,QUARTO:4,P4:4,QUINTO:5,P5:5,
  SESTO:6,SETTIMO:7,OTTAVO:8,NONO:9,DECIMO:10,
  ATTICO:100,SOTTOTETTO:100,TETTO:100,COPERTURA:100};
function floorLevel(nameRaw){
  var s=String(nameRaw||'').toUpperCase().trim().replace(/^PIANO\s+/,'');
  var m=s.match(/^-?\d+/);
  if(m) return parseInt(m[0],10);
  if(FLOOR_WORDS.hasOwnProperty(s)) return FLOOR_WORDS[s];
  var w=s.split(/\s+/)[0];
  if(FLOOR_WORDS.hasOwnProperty(w)) return FLOOR_WORDS[w];
  return null;
}

/* ============ PARSING ============ */
function parseEntry(raw,note){
  var t=norm(raw);
  var m=t.match(/\bPIANO\s*:/i);
  var head=t, tail='';
  if(m){ head=t.slice(0,m.index); tail=t.slice(m.index); }
  head=head.replace(/[;,\s]+$/,'').trim();
  var code='', desc=head;
  var cm=head.match(/^([^\s\-–]{2,24})\s*[-–]\s*([\s\S]+)$/);
  if(cm){ code=cm[1]; desc=cm[2].trim(); }
  var f={piano:'',reparto:'',stanza:'',posizione:''};
  tail.split(';').forEach(function(seg){
    seg=seg.trim(); if(!seg) return;
    var k=seg.match(/^([A-ZÀ-Ùa-zà-ù0-9 ._\/-]{2,40}?)\s*:\s*([\s\S]*)$/);
    if(!k) return;
    var key=k[1].trim().toUpperCase(), val=k[2].trim();
    if(key==='PIANO')f.piano=val; else if(key==='REPARTO')f.reparto=val;
    else if(key==='STANZA')f.stanza=val; else if(key==='POSIZIONE')f.posizione=val;
    /* eventuali altri campi (es. date di sostituzione) vengono ignorati di proposito */
  });
  ['piano','reparto','stanza'].forEach(function(k){ f[k]=f[k].replace(/[.;\s]+$/,'').trim()||'— NON INDICATO —'; });
  f.posizione=f.posizione.replace(/[.;\s]+$/,'').trim();
  return {code:code,desc:desc,note:norm(note),piano:f.piano,reparto:f.reparto,stanza:f.stanza,posizione:f.posizione};
}

/* DOVE STA LA NOTA. I file di mappatura arrivano in due tracciati:
     A) due colonne: A descrizione, B nota.
        Intestazione riga 2:  "" | "Tipo di dato"
     B) tre colonne: A descrizione, B etichetta fissa "NOTE OPERATORE", C nota.
        Intestazione riga 2:  "" | "Proprieta'" | "Tipo di dato"
   In tutti e due i casi "Tipo di dato" marca la colonna del VALORE, quindi e'
   quella che si cerca per prima. Se manca si ripiega su un'intestazione tipo
   "note"/"osservazioni", che pero' nel tracciato B cadrebbe sulla colonna
   dell'ETICHETTA: per questo la colonna scelta viene poi verificata sui dati.
   Una colonna che ripete lo stesso identico testo su OGNI riga non contiene
   note, e' l'etichetta del dato: la nota sta nella colonna accanto e ci si
   sposta a destra (saltando la descrizione). Cosi' il valore viene preso sia
   quando sta nella colonna intestata, sia quando sta affianco all'etichetta. */
function findNoteCol(rows,dati){
  var perValore=null, perNome=null;
  for(var r=0;r<Math.min(rows.length,8);r++){
    var row=rows[r]||[];
    for(var c=0;c<row.length;c++){
      var v=norm(row[c]);
      if(perValore===null && /tipo\s*di\s*dato/i.test(v)) perValore=c;
      if(perNome===null && /^(note|osservazion|annotazion|comment)/i.test(v)) perNome=c;
    }
  }
  var col=(perValore!==null)?perValore:perNome;
  if(col===null) return null;
  for(var passi=0; passi<3; passi++){
    var distinti={}, piene=0, tot=0;
    dati.forEach(function(d){
      if(d.di===col) return;
      tot++;
      var v=norm(d.row[col]);
      if(v){ piene++; distinti[v]=1; }
    });
    /* etichetta = colonna piena su tutte le righe e sempre con lo stesso testo */
    if(!(tot>1 && piene===tot && Object.keys(distinti).length===1)) break;
    col++;
    while(dati.some(function(d){return d.di===col;})) col++;
  }
  return col;
}

function buildModel(rows){
  /* prima passata: quali righe sono dati e in che colonna sta la descrizione.
     Serve a findNoteCol per distinguere una colonna di etichette da una di
     valori: dalle sole intestazioni non si puo' sapere. */
  var righe=rows.map(function(row,ri){
    row=row||[];
    var di=-1;
    for(var c=0;c<row.length;c++){ if(/\bPIANO\s*:/i.test(norm(row[c]))){ di=c; break; } }
    return {row:row, ri:ri, di:di};
  });
  var noteCol=findNoteCol(rows,righe.filter(function(x){return x.di>=0;}));
  var items=[], skipped=0, skippedRows=[];
  righe.forEach(function(rec){
    var row=rec.row, ri=rec.ri, di=rec.di;
    if(di<0){ if(norm(row.join(' ')).length>25){ skipped++; skippedRows.push({riga:ri+1,testo:row.join(' | ')}); } return; }
    /* la nota si legge SOLO dalla colonna note. Prima, quando quella cella era
       vuota, si ripiegava sulla prima cella non vuota della riga qualunque
       fosse: e' cosi' che nel riquadro NOTE OPERATORE finivano l'intestazione
       di colonna o altre colonne di servizio. Se la colonna note non c'e' o e'
       vuota, la nota non c'e': la scheda dice "nessuna nota". */
    var note='';
    if(noteCol!==null && noteCol!==di) note=row[noteCol]||'';
    /* id progressivo e numero di riga del file: il primo serve a ritrovare la
       scheda nell'anteprima dall'elenco note, il secondo a dire da dove viene */
    var it=parseEntry(row[di],note);
    it.id=items.length; it.riga=ri+1;
    items.push(it);
  });
  var tree=[];
  function find(a,n){ for(var i=0;i<a.length;i++) if(a[i].name===n) return a[i]; return null; }
  items.forEach(function(it){
    var p=find(tree,it.piano); if(!p){p={name:it.piano,kids:[]};tree.push(p);}
    var r=find(p.kids,it.reparto); if(!r){r={name:it.reparto,kids:[]};p.kids.push(r);}
    var s=find(r.kids,it.stanza); if(!s){s={name:it.stanza,items:[]};r.kids.push(s);}
    s.items.push(it);
  });
  /* i piani escono in sequenza edilizia, non nell'ordine in cui compaiono nel
     file Excel: senza, una parte poteva contenere PIANO 2 e PIANO 0 senza il
     PIANO 1 in mezzo, e chi divide la stampa in fascicoli si aspetta i piani
     in sequenza. I piani senza livello riconosciuto (floorLevel -> null)
     restano in fondo, nell'ordine in cui comparivano nel file: e' l'unica
     informazione che si ha su di loro */
  tree=tree.map(function(p,i){ return {p:p,i:i,lv:floorLevel(p.name)}; })
    .sort(function(a,b){
      if(a.lv===null&&b.lv===null) return a.i-b.i;
      if(a.lv===null) return 1;
      if(b.lv===null) return -1;
      return a.lv-b.lv;
    }).map(function(x){ return x.p; });
  /* dentro ogni stanza le schede escono in ordine di posizione crescente:
     sul campo si segue il giro dei numeri, non l'ordine del file Excel */
  tree.forEach(function(p){ p.kids.forEach(function(r){ r.kids.forEach(function(s){
    s.items.sort(function(x,y){ return natCmp(x.posizione,y.posizione); });
  }); }); });
  return {tree:tree,items:items,skipped:skipped,skippedRows:skippedRows,noteCol:noteCol,withNotes:items.filter(function(i){return i.note;}).length};
}

function showSkippedRows(){
  var rows=(FULL&&FULL.skippedRows)||[];
  if(!rows.length) return;
  var body=rows.map(function(r){
    return '<tr><td class="n">'+r.riga+'</td><td class="note">'+esc(r.testo)+'</td></tr>';
  }).join('');
  /* stesse classi della finestra delle note operatore: due elenchi da
     ricontrollare si leggono allo stesso modo, e lo stile sta tutto nel
     foglio in cima al file invece che ripetuto qui in linea */
  var html='<div id="skipModalBg" class="nmodal-bg" onclick="if(event.target===this)closeSkippedRows()">'
    +'<div class="nmodal sm">'
    +'<div class="nmodal-h"><h3>Righe ignorate <span class="cnt">'+rows.length+'</span></h3>'
    +'<button class="x" onclick="closeSkippedRows()" aria-label="Chiudi">&times;</button></div>'
    +'<div class="nmodal-b"><table class="xls plain">'
    +'<thead><tr><th>Riga</th><th>Contenuto</th></tr></thead>'
    +'<tbody>'+body+'</tbody></table></div>'
    +'<div class="nmodal-f">Queste righe non hanno il formato <b>codice - descrizione PIANO: … ; REPARTO: … ;</b> e non sono finite in nessuna scheda.</div>'
    +'</div></div>';
  var d=document.createElement('div'); d.id='skipModalWrap'; d.innerHTML=html;
  document.body.appendChild(d);
}
function closeSkippedRows(){
  var el=document.getElementById('skipModalWrap'); if(el) el.remove();
}

/* ============ ELENCO NOTE OPERATORE ============ */
/* le note rilevate dall'operatore sono la parte del file che si ricontrolla
   piu' spesso: si aprono tutte insieme in tabella (tipo foglio di calcolo,
   ordinabile e con ricerca) e con un clic si salta alla scheda in anteprima */
var NOTE_COLS=[
  {k:'riga',t:'Riga',cls:'n'},
  {k:'piano',t:'Piano'},
  {k:'reparto',t:'Reparto'},
  {k:'stanza',t:'Stanza'},
  {k:'posizione',t:'Pos.',nat:true},
  {k:'code',t:'Codice'},
  {k:'desc',t:'Descrizione',cls:'desc'},
  {k:'note',t:'Nota operatore',cls:'note'}
];
var NOTE_SORT={k:'',dir:1};
var NOTE_FOOT='Clicca una riga per aprire la scheda corrispondente nell\'anteprima.';
function notesData(){
  return ((FULL&&FULL.items)||[]).filter(function(i){return i.note;});
}
function noteVal(it,k){ var v=it[k]; return (v===undefined||v===null)?'':v; }
/* la scheda e' in anteprima solo se il suo piano/reparto/stanza e' spuntato
   nell'albero: le altre righe restano in elenco ma in grigio */
function cardOf(id){ return document.querySelector('#pages .card[data-id="'+id+'"]'); }
function jumpToItem(id){
  var c=cardOf(id);
  if(!c) return false;
  scrollToEl(c,true);
  flash(c);
  return true;
}
function notesHead(){
  return NOTE_COLS.map(function(c){
    var ar=(NOTE_SORT.k===c.k)?'<span class="ar">'+(NOTE_SORT.dir>0?'▲':'▼')+'</span>':'';
    return '<th data-k="'+c.k+'" title="Clicca per ordinare">'+esc(c.t)+ar+'</th>';
  }).join('');
}
function renderNotes(){
  var all=notesData(), rows=all;
  var q=(document.getElementById('notesSearch').value||'').toLowerCase().trim();
  if(q) rows=rows.filter(function(it){
    for(var i=0;i<NOTE_COLS.length;i++){
      if(String(noteVal(it,NOTE_COLS[i].k)).toLowerCase().indexOf(q)>=0) return true;
    }
    return false;
  });
  if(NOTE_SORT.k){
    var col={};
    NOTE_COLS.forEach(function(c){ if(c.k===NOTE_SORT.k) col=c; });
    rows=rows.slice().sort(function(a,b){
      var x=noteVal(a,NOTE_SORT.k), y=noteVal(b,NOTE_SORT.k), r;
      if(NOTE_SORT.k==='riga') r=x-y;
      else if(col.nat) r=natCmp(String(x),String(y));
      else r=String(x).localeCompare(String(y),'it');
      return r*NOTE_SORT.dir;
    });
  }
  document.getElementById('notesHead').innerHTML=notesHead();
  document.getElementById('notesBody').innerHTML=rows.length
    ? rows.map(function(it){
        var vis=!!cardOf(it.id);
        return '<tr data-id="'+it.id+'"'+(vis?'':' class="off" title="Scheda esclusa dai filtri dell\'albero: non e\' nell\'anteprima"')+'>'
          +NOTE_COLS.map(function(c){
            return '<td'+(c.cls?' class="'+c.cls+'"':'')+'>'+esc(String(noteVal(it,c.k)))+'</td>';
          }).join('')+'</tr>';
      }).join('')
    : '<tr class="void"><td colspan="'+NOTE_COLS.length+'">Nessuna nota corrisponde alla ricerca.</td></tr>';
  document.getElementById('notesCount').textContent=(rows.length===all.length)
    ? all.length+(all.length===1?' nota':' note')
    : rows.length+' di '+all.length;
}
function notesKey(e){ if(e.key==='Escape'||e.keyCode===27) closeNotes(); }
function showNotes(){
  if(document.getElementById('notesModalWrap')) return;
  if(!notesData().length) return;
  NOTE_SORT={k:'',dir:1};
  var d=document.createElement('div');
  d.id='notesModalWrap';
  d.innerHTML='<div class="nmodal-bg" onclick="if(event.target===this)closeNotes()">'
    +'<div class="nmodal">'
      +'<div class="nmodal-h"><h3>Note operatore <span class="cnt" id="notesCount"></span></h3>'
        +'<input id="notesSearch" type="search" placeholder="Cerca in tutte le colonne…" autocomplete="off">'
        +'<button class="x" onclick="closeNotes()" title="Chiudi (Esc)">&times;</button></div>'
      +'<div class="nmodal-b"><table class="xls"><thead><tr id="notesHead"></tr></thead><tbody id="notesBody"></tbody></table></div>'
      +'<div class="nmodal-f" id="notesFoot">'+NOTE_FOOT+'</div>'
    +'</div></div>';
  document.body.appendChild(d);
  document.getElementById('notesHead').onclick=function(e){
    var th=e.target.closest?e.target.closest('th'):null;
    var k=th&&th.getAttribute('data-k');
    if(!k) return;
    if(NOTE_SORT.k===k) NOTE_SORT.dir=-NOTE_SORT.dir; else NOTE_SORT={k:k,dir:1};
    renderNotes();
  };
  document.getElementById('notesBody').onclick=function(e){
    var tr=e.target.closest?e.target.closest('tr[data-id]'):null;
    if(!tr) return;
    /* salto alla scheda: la finestra si chiude solo se la scheda c'e' davvero,
       altrimenti resterebbe il dubbio che il clic non abbia fatto nulla */
    if(jumpToItem(+tr.getAttribute('data-id'))){ closeNotes(); return; }
    tr.classList.add('miss');
    setTimeout(function(){ tr.classList.remove('miss'); },900);
    var f=document.getElementById('notesFoot');
    f.innerHTML='<b>Questa scheda non e\' nell\'anteprima:</b> il suo piano / reparto / stanza e\' escluso dai filtri dell\'albero.';
    setTimeout(function(){ if(f) f.innerHTML=NOTE_FOOT; },4000);
  };
  document.getElementById('notesSearch').oninput=renderNotes;
  document.addEventListener('keydown',notesKey);
  renderNotes();
  document.getElementById('notesSearch').focus();
}
function closeNotes(){
  var el=document.getElementById('notesModalWrap'); if(el) el.remove();
  document.removeEventListener('keydown',notesKey);
}

/* ============ SCHEDE ============ */
function posHTML(p){
  if(!p) return '<span class="val" style="opacity:.85">n/d</span>';
  var m=p.match(/^(0+)(.*)$/);
  return '<span class="val">'+(m?'<span class="lz">'+m[1]+'</span>'+esc(m[2]):esc(p))+'</span>';
}
function rulesHTML(n){ var o=''; for(var i=0;i<n;i++) o+='<span></span>'; return '<div class="rules">'+o+'</div>'; }

/* casella da barrare a fine controllo: sostituisce i due riquadri note nelle
   densita' compatte */
function chkHTML(){
  return '<div class="c-chk"><div class="lbl">VERIFICA<br>SERVICE</div><div class="cbx"></div></div>';
}
function cardHTML(it,lines,compact){
  var top='<div class="c-top"><div class="c-id">'
     +'<div class="c-code">'+esc(it.code||'—')+'</div>'
     +'<div class="c-desc'+(it.desc.length>70?' long':'')+'">'+esc(it.desc)+'</div></div>'
     +'<div class="c-pos"><div class="lbl">POSIZIONE</div>'+posHTML(it.posizione)+'</div>'
     +(compact?chkHTML():'')+'</div>';
  var cls='card'+(compact?' compact':'')+(isShoe(it)?' shoe':'');
  /* l'id resta nel DOM: e' l'aggancio del salto dall'elenco note operatore */
  var ida=(it.id===undefined?'':' data-id="'+it.id+'"');
  if(compact) return '<div class="'+cls+'"'+ida+'>'+top+'</div>';
  return '<div class="'+cls+'"'+ida+'>'+top
   +'<div class="c-mid">'
     +'<div class="box op"><div class="h">NOTE OPERATORE (RILEVATE)</div>'
       +'<div class="v'+(it.note?'':' none')+'">'+esc(it.note||'nessuna nota')+'</div></div>'
     +'<div class="box"><div class="h">NOTE IN CANTIERE</div>'+rulesHTML(lines)+'</div>'
   +'</div></div>';
}
function blankHTML(lines,compact){
  var top='<div class="c-top"><div class="c-id">'
     +'<div class="wfield"><span class="flagline">ARTICOLO NON IN ELENCO — CODICE</span><span class="wline"></span></div>'
     +'<div class="wfield"><span class="flagline">DESCRIZIONE</span><span class="wline"></span></div></div>'
     +'<div class="c-pos"><div class="lbl">POSIZIONE</div><div class="val"></div></div>'
     +(compact?chkHTML():'')+'</div>';
  if(compact) return '<div class="card blank compact">'+top+'</div>';
  return '<div class="card blank">'+top
   +'<div class="c-mid">'
     +'<div class="box"><div class="h">NOTE IN CANTIERE</div>'+rulesHTML(lines)+'</div>'
   +'</div></div>';
}

/* intestazione, briciola e pie' di pagina: le stesse funzioni le usano il render
   e le misure. Prima il probe di misura montava un'intestazione finta ("X", "Y"):
   con titolo, cantiere o nomi di piano/reparto/stanza lunghi l'intestazione vera
   e' piu' alta di quella misurata, il budget di pagina risultava sovrastimato e
   l'ultima scheda sbordava dal foglio (pagine oltre i 297 mm). */
function crumbHTML(c,cont){
  return '<span class="crumb"><i>PIANO</i> '+esc(c.piano||'—')
    +'<span class="sep">›</span><i>REPARTO</i> '+esc(c.reparto||'—')
    +(c.stanza?'<span class="sep">›</span><i>STANZA</i> '+esc(c.stanza):'')
    +(cont?' <span class="seg">(segue)</span>':'')+'</span>';
}
function ffieldsHTML(){
  return '<div class="ffields">'
    +'<div class="frow"><i>PIANO</i><span class="fline"></span></div>'
    +'<div class="frow"><i>REPARTO</i><span class="fline"></span></div>'
    +'<div class="frow"><i>STANZA</i><span class="fline"></span></div>'
    +'</div>';
}
/* Data e Tecnico da firmare stanno solo sulla copertina (cv-fields): sulle
   pagine di scheda e sull'indice l'intestazione non li ripete piu' */
function headHTML(title,sub,crumb){
  return '<div class="p-head"><div class="t1">'
    +'<img class="logo" src="'+LOGO+'" alt="VRS TECH">'
    +'<div class="ttl"><div class="doc">'+esc(title)+'</div>'
    +(sub?'<div class="sub2"><b>Cantiere</b>'+esc(sub)+'</div>':'')+'</div>'
    +'</div>'
    +crumb+'</div>';
}
function footHTML(sub,today,right,rev){
  return '<div class="p-foot'+(rev?' rev':'')+'"><span><b>VRS TECH</b> · '+today
    +(sub?' · Cantiere: '+esc(sub):'')+'</span>'
    +'<span class="r">'+right+'</span></div>';
}

/* la briciola in testa alla pagina va a capo con i nomi lunghi e ruba spazio alle
   schede: per il budget si usa la combinazione piu' larga presente nei dati,
   misurata in pixel (contare i caratteri non basta: "MMM" e "III" sono lunghi
   uguali ma larghi diversi) */
function widestCrumb(tree){
  var lv=[[],[],[]];
  (tree||[]).forEach(function(p){ lv[0].push(p.name);
    p.kids.forEach(function(r){ lv[1].push(r.name);
      r.kids.forEach(function(s){ lv[2].push(s.name); }); }); });
  var probe=document.createElement('div'), html='';
  probe.style.cssText='position:absolute;left:-9999px;top:0;visibility:hidden;white-space:nowrap';
  lv.forEach(function(names,i){ names.forEach(function(nm){
    html+='<span class="crumb" data-l="'+i+'" style="display:inline-block">'+esc(nm)+'</span>';
  }); });
  probe.innerHTML=html;
  document.body.appendChild(probe);
  var best=['','',''], w=[-1,-1,-1];
  Array.prototype.forEach.call(probe.children,function(el){
    var i=+el.getAttribute('data-l');
    if(el.offsetWidth>w[i]){ w[i]=el.offsetWidth; best[i]=el.textContent; }
  });
  probe.remove();
  return {piano:best[0],reparto:best[1],stanza:best[2]};
}

/* misura le altezze reali (px) per riempire le pagine fino al margine utile */
function measure(lines,title,sub,today,crumb,compact){
  var probe=document.createElement('div');
  probe.style.cssText='position:absolute;left:-9999px;top:0;visibility:hidden';
  probe.innerHTML='<div class="page">'+headHTML(title,sub,crumb)
    +'<div class="p-body"><div class="band rep"><span class="lbl">REPARTO</span><span class="val">X</span><span class="cnt">9 comp.</span></div>'
    +'<div class="band stz"><span class="lbl">STANZA</span><span class="val">X</span><span class="cnt">9 comp.</span></div>'+blankHTML(lines,compact)
    +'</div>'+footHTML(sub,today,'Pag. 88 / 88')+'</div>';
  document.body.appendChild(probe);
  var body=probe.querySelector('.p-body');
  var gap=parseFloat(getComputedStyle(body).rowGap)||0;
  var hh=function(sel){ return probe.querySelector(sel).getBoundingClientRect().height+gap; };
  /* 1px di margine sull'altezza utile: clientHeight arrotonda per eccesso */
  var m={H:body.getBoundingClientRect().height-1, gap:gap,
         rep:hh('.band.rep'), stz:hh('.band.stz'), card:hh('.card')};
  probe.remove();
  if(!m.H||!m.card) m={H:930,gap:8,rep:52,stz:45,card:204};
  return m;
}

/* px per mm nel browser corrente, per convertire le altezze misurate in pixel
   nelle unità mm usate dai fogli di stile */
function pxPerMm(){
  var probe=document.createElement('div');
  probe.style.cssText='position:absolute;left:-9999px;top:0;visibility:hidden;height:100mm;width:1mm';
  document.body.appendChild(probe);
  var v=probe.offsetHeight/100;
  probe.remove();
  return v||3.7795;
}

/* misura l'altezza utile del corpo pagina per le pagine libere di fine documento,
   che hanno un'intestazione più alta (piano/reparto/stanza su tre righe intere) */
function measureFree(lines,title,sub,today,compact){
  var probe=document.createElement('div');
  probe.style.cssText='position:absolute;left:-9999px;top:0;visibility:hidden';
  probe.innerHTML='<div class="page">'+headHTML(title,sub,ffieldsHTML())
    +'<div class="p-body">'+blankHTML(lines,compact)+'</div>'+footHTML(sub,today,'Pag. 88 / 88')+'</div>';
  document.body.appendChild(probe);
  var H=probe.querySelector('.p-body').getBoundingClientRect().height-1;
  probe.remove();
  return H||900;
}

/* ============ COPERTINA E INDICE ============ */
/* Copertina e indice sono le pagine "iniziali" (front matter): si costruiscono
   a impaginazione delle schede finita, perche' i numeri stampati nell'indice
   sono quelli del documento completo, copertina compresa.
   In modalita' libro il numero di pagine iniziali viene portato a un numero
   pari con una pagina dichiarata bianca, cosi' la prima scheda cade sempre su
   una pagina destra (dispari) come in un libro stampato in fronte-retro. */

function treeStats(tree){
  var s={piani:0,reparti:0,stanze:0,comp:0};
  (tree||[]).forEach(function(p){ s.piani++;
    p.kids.forEach(function(r){ s.reparti++;
      r.kids.forEach(function(st){ s.stanze++; s.comp+=st.items.length; }); }); });
  return s;
}

/* ---- SUDDIVISIONE IN FASCICOLI ----
   Un documento di 400 fogli non si porta in cantiere: lo si divide in libretti
   piu' piccoli. La divisione segue i PIANI, e solo quelli: un fascicolo per
   piano stampato. Non per numero di pagine, non per reparto - un piano si
   chiude prima che cominci il successivo, perche' in cantiere si sale un piano
   alla volta e il fascicolo che si tiene in mano deve contenere tutto quel
   piano e nient'altro.
   Ognuno e' un libretto a se' - copertina propria, indice proprio - ma la
   numerazione resta unica su tutto il documento, cosi' due fascicoli non hanno
   mai la stessa pagina 12 e un foglio staccato torna sempre al suo posto.
   Quanti fascicoli escono non lo si sceglie: sono i piani stampati. L'unico
   caso in cui due piani finiscono nello stesso fascicolo e' quando condividono
   un foglio, cioe' con "nuova pagina a ogni reparto" spento: una pagina non si
   puo' tagliare a meta'.
   In modalita' libro ogni fascicolo ha un numero di pagine multiplo di 4 (vedi
   planDocument): cosi' ogni libretto si piega e si stampa fronte-retro da solo. */

/* i tagli sono indici di pagina-schede, non numeri di pagina: le pagine
   iniziali di ogni fascicolo non sono ancora note quando si decide dove
   tagliare. Il taglio puo' cadere SOLO dove una pagina apre un piano diverso
   da quello con cui si era chiusa la precedente: un piano non finisce mai a
   cavallo fra due fascicoli, e questo non si negozia.
   "every" dice quanti piani mettere in ogni fascicolo: con 1 si taglia a ogni
   confine (un fascicolo per piano), con 3 si salta due confini e si taglia al
   terzo. Se i piani non sono un multiplo di every l'ultimo fascicolo ne
   contiene meno - un fascicolo piu' sottile degli altri va bene, un piano
   spezzato no. */
function chooseCuts(info,every){
  every=Math.max(1,parseInt(every,10)||1);
  var cuts=[0], seen=0;
  for(var i=1;i<info.length;i++){
    var f=info[i], pv=info[i-1];
    if(!f||!pv) continue;
    if(f.startsRep&&f.piano&&pv.lastPiano!==f.piano){
      seen++;
      if(seen%every===0) cuts.push(i);
    }
  }
  return cuts;
}

/* albero, conteggi e ancoraggi della sola parte: copertina e indice di una
   parte parlano di quello che c'e' dentro quella parte, non del documento */
function partScope(pages,from,to){
  var tree=[], idx={}, anchors={}, comp=0, nBlank=0;
  function node(list,map,name){
    if(!(name in map)){ map[name]={n:{name:name,kids:[],items:[]},kids:{}}; list.push(map[name].n); }
    return map[name];
  }
  for(var i=from;i<=to;i++){
    var pg=pages[i]; if(!pg) continue;
    pg.blocks.forEach(function(b){
      if(b.t==='blank') nBlank++;
      if(!b.piano) return;
      var p=node(tree,idx,b.piano);
      var k1=b.piano, k2=k1+'\u0001'+b.reparto, k3=k2+'\u0001'+b.stanza;
      if(!(k1 in anchors)) anchors[k1]=i;
      if(!b.reparto) return;
      var r=node(p.n.kids,p.kids,b.reparto);
      if(!(k2 in anchors)) anchors[k2]=i;
      if(!b.stanza) return;
      var st=node(r.n.kids,r.kids,b.stanza);
      if(!(k3 in anchors)) anchors[k3]=i;
      if(b.t==='card'){ st.n.items.push(b.it); comp++; }
    });
  }
  return {tree:tree,anchors:anchors,comp:comp,nBlank:nBlank};
}

/* etichetta di parte nel pie' di pagina: un foglio finito fuori dal suo
   fascicolo deve dire da solo dove tornare */
function ptag(o){ return o.part?('Fascicolo '+o.part.k+'/'+o.part.N+' \u00b7 '):''; }

/* la copertina di una parte dice cosa contiene, non come stamparla: se la parte
   prende piu' piani si elencano i piani, se sta dentro un piano solo i suoi
   reparti, se sta dentro un reparto solo le sue stanze. E' il livello che
   distingue davvero una parte dall'altra */
function partScopeHTML(tree){
  if(!tree||!tree.length) return '';
  var lab,items;
  if(tree.length>1){
    lab='Piani compresi';
    items=tree.map(function(p){ return 'PIANO '+p.name; });
  } else {
    var p0=tree[0];
    if(p0.kids.length>1){
      lab='PIANO '+esc(p0.name)+' \u00b7 reparti compresi';
      items=p0.kids.map(function(r){ return r.name; });
    } else if(p0.kids.length===1&&p0.kids[0].kids.length>1){
      lab='PIANO '+esc(p0.name)+' \u203a '+esc(p0.kids[0].name)+' \u00b7 stanze comprese';
      items=p0.kids[0].kids.map(function(st){ return st.name; });
    } else if(p0.kids.length===1){
      lab='Contenuto';
      items=['PIANO '+p0.name+' \u203a '+p0.kids[0].name
        +(p0.kids[0].kids[0]?' \u203a '+p0.kids[0].kids[0].name:'')];
    } else { lab='Contenuto'; items=['PIANO '+p0.name]; }
  }
  var MAX=15, extra=items.length-MAX;
  var ls=items.slice(0,MAX).map(function(t){ return '<span class="ch">'+esc(t)+'</span>'; }).join('');
  if(extra>0) ls+='<span class="ch more">+ altri '+extra+'</span>';
  return '<div class="cv-scope"><div class="h">'+lab+'</div><div class="ls">'+ls+'</div></div>';
}

function factHTML(v,k){ return '<div class="f"><div class="v">'+v+'</div><div class="k">'+esc(k)+'</div></div>'; }
function coverHTML(o,pno,total,rev){
  var st=o.stats, P=o.part, facts='', npag=o.end-o.start+1;
  if(o.hasData){
    facts+=factHTML(o.comp,'componenti');
    if(st.piani>1) facts+=factHTML(st.piani,'piani');
    facts+=factHTML(st.reparti,st.reparti===1?'reparto':'reparti');
    facts+=factHTML(st.stanze,st.stanze===1?'stanza':'stanze');
  }
  facts+=factHTML(o.nBlank,'schede libere');
  facts+=factHTML(npag,P?'pagine in questo fascicolo':'pagine A4');
  /* la numerazione e' unica su tutto il documento: la copertina di una parte
     dice da dove a dove arriva, altrimenti "pagina 214" non si sa di chi e' */
  if(P) facts+=factHTML(o.start+'\u2013'+o.end,'pagine su '+total);
  return '<div class="page cover'+(P?' wpart':'')+'">'
    +'<div class="cv-band"><img src="'+LOGO+'" alt="VRS TECH">'
      +'<div class="who"><div class="n">VRS TECH</div>'
      +'<div class="s">Mappature</div></div>'
      +(P?'<div class="cv-pno"><b>'+P.k+'</b><span>di '+P.N+'</span></div>':'')+'</div>'
    +'<div class="cv-mid">'
      +'<div class="cv-kick">'+(P?'Fascicolo '+P.k+' di '+P.N+' \u00b7 ':'')
        +(o.hasData?'Schede tecnici \u00b7 fogli di campo':'Fogli di campo da compilare')+'</div>'
      +'<div class="cv-title'+(o.title.length>34?' long':'')+'">'+esc(o.title)+'</div>'
      +(o.sub?'<div class="cv-sub"><b>Cantiere</b>'+esc(o.sub)+'</div>':'')
      +(P?partScopeHTML(o.tree):'')
      +'<div class="cv-facts">'+facts+'</div>'
      +'<div class="cv-fields">'
        +'<div class="fl"><i>Data</i><span></span></div>'
        +'<div class="fl"><i>Tecnico</i><span></span></div>'
        +'<div class="fl"><i>Firma</i><span></span></div>'
      +'</div>'
    +'</div>'
    +footHTML(o.sub,o.today,ptag(o)+'Pag. '+pno+' / '+total,rev)+'</div>';
}

/* pagina di pareggio della modalita' libro: bianca ma dichiarata, cosi' chi
   sfoglia non la prende per un errore di stampa */
function voidHTML(o,pno,total,rev,tail){
  return '<div class="page void"><div class="p-body">'
    +'<span class="vmsg">pagina lasciata intenzionalmente bianca'
    +(tail?(o.part?' \u00b7 fine del fascicolo '+o.part.k+' di '+o.part.N
                  :' \u00b7 fine del documento'):'')+'</span></div>'
    +footHTML(o.sub,o.today,ptag(o)+'Pag. '+pno+' / '+total,rev)+'</div>';
}

function ixCrumb(cont,detail,part){
  return '<span class="crumb"><i>INDICE'+(part?' FASCICOLO '+part.k+'/'+part.N:'')+'</i> PIANI<span class="sep">\u203a</span>REPARTI'
    +(detail==='rep'?'':'<span class="sep">\u203a</span>STANZE')
    +(cont?' <span class="seg">(segue)</span>':'')+'</span>';
}
function ixLegend(detail,part){
  return (part?'Indice del <b>fascicolo '+part.k+' di '+part.N+'</b>: elenca solo quello che questo fascicolo contiene. '
             :'')
    +'Fascia blu: piano. In maiuscolo: reparto.'+(detail==='rep'?'':' Rientrate: stanze.')
    +' I numeri a destra sono le pagine di questo documento stampato, copertina compresa'
    +(part?', numerate su tutti i fascicoli.':'.')
    +(detail==='rep'?' <b>Le stanze non sono elencate</b>: voce per voce l\u2019indice non stava in due pagine.':'');
}
function ixRowHTML(r){
  return '<div class="ix-row l'+r.lv+'"><span class="t">'
    +(r.lv===1?'<i>PIANO</i>':'')+esc(r.t)+'</span><span class="d"></span>'
    +(r.c?'<span class="c">'+esc(r.c)+'</span>':'')+'<span class="p">'+r.p+'</span></div>';
}
/* il numero di pagina di una voce viene da ANCHORS (indice della prima pagina
   di schede in cui compare) piu' le pagine iniziali che la precedono */
function ixPageNo(anchors,k,off){
  var v=anchors[k];
  return (v===undefined)?'\u2014':(v+off+1);
}
function tocRows(tree,anchors,off,detail){
  var rows=[];
  (tree||[]).forEach(function(p){
    var k1=p.name, np=0;
    p.kids.forEach(function(r){ r.kids.forEach(function(st){ np+=st.items.length; }); });
    rows.push({lv:1,t:p.name,c:np+' comp.',p:ixPageNo(anchors,k1,off)});
    p.kids.forEach(function(r){
      var k2=k1+'\u0001'+r.name;
      var nr=r.kids.reduce(function(a,st){return a+st.items.length;},0);
      rows.push({lv:2,t:r.name,c:nr+' comp.',p:ixPageNo(anchors,k2,off)});
      if(detail!=='rep') r.kids.forEach(function(st){
        rows.push({lv:3,t:st.name,c:st.items.length+' comp.',p:ixPageNo(anchors,k2+'\u0001'+st.name,off)});
      });
    });
  });
  return rows;
}

/* misura l'altezza utile dell'indice e l'ingombro vero di ogni riga: i nomi
   lunghi vanno a capo e non tutte le righe sono alte uguale, quindi il numero
   di voci per colonna non si puo' dedurre da una divisione */
function ixMeasure(o,A,rows){
  var probe=document.createElement('div');
  probe.style.cssText='position:absolute;left:-9999px;top:0;visibility:hidden';
  var cols=''; for(var c=0;c<A.cols;c++) cols+='<div class="ix-col"></div>';
  probe.innerHTML='<div class="page idx" style="--ix-fs:'+A.fs+'pt">'
    +headHTML(o.title,o.sub,ixCrumb(false,A.detail,o.part))
    +'<div class="p-body"><div class="ix-legend">'+ixLegend(A.detail,o.part)+'</div>'
    +'<div class="ix-wrap">'+cols+'</div></div>'
    +footHTML(o.sub,o.today,'Pag. 88 / 88')+'</div>';
  document.body.appendChild(probe);
  /* prima l'altezza a colonne vuote: riempite, la pagina si allungherebbe */
  var H=probe.querySelector('.ix-wrap').getBoundingClientRect().height-1;
  var col=probe.querySelector('.ix-col');
  col.innerHTML=rows.map(ixRowHTML).join('');
  Array.prototype.forEach.call(col.children,function(el,i){
    rows[i]._h=el.offsetHeight+(parseFloat(getComputedStyle(el).marginTop)||0);
  });
  probe.remove();
  return H||860;
}
/* riempie colonna per colonna e pagina per pagina. Un titolo di piano o reparto
   non resta mai da solo in fondo a una colonna: se la voce che segue non ci sta,
   si passa alla colonna successiva insieme a lui. */
function packIndex(rows,H,cols){
  var out=[], pg=[[]], ci=0, used=0;
  for(var i=0;i<rows.length;i++){
    var need=rows[i]._h+((rows[i].lv<3&&i+1<rows.length)?rows[i+1]._h:0);
    if(pg[ci].length&&used+need>H){
      if(ci+1<cols){ ci++; pg[ci]=[]; used=0; }
      else { out.push(pg); pg=[[]]; ci=0; used=0; }
    }
    pg[ci].push(rows[i]); used+=rows[i]._h;
  }
  for(var j=0;j<pg.length;j++){ if(pg[j].length){ out.push(pg); break; } }
  if(cols>1&&out.length) out[out.length-1]=balanceCols(out[out.length-1],H,cols);
  return out;
}
/* l'ultima pagina dell'indice e' l'unica che resta a meta': riempita colonna
   per colonna avrebbe la prima piena fino in fondo e la seconda mezza vuota.
   Le voci vengono ridistribuite per pari altezza, senza mai sfondare la pagina
   e senza lasciare un titolo di piano o reparto da solo in fondo a una colonna. */
function balanceCols(page,H,cols){
  var flat=[]; page.forEach(function(c){ (c||[]).forEach(function(r){ flat.push(r); }); });
  var T=0; flat.forEach(function(r){ T+=r._h; });
  /* pool = altezza non ancora sistemata nelle colonne chiuse: la misura da
     dividere per le colonne che restano. Scalandola riga per riga (invece che a
     colonna chiusa) la prima colonna si fermava a un terzo dell'elenco. */
  var res=[], cur=[], pool=T, left=cols, u=0;
  for(var k=0;k<flat.length;k++){
    var h=flat[k]._h, tgt=pool/left;
    var brk=cur.length&&left>1&&(u+h>H||(u+h>tgt&&(flat.length-k)>=left-1));
    if(brk){
      var lastR=cur[cur.length-1], moved=(lastR.lv<3&&cur.length>1);
      if(moved) cur.pop();
      var hcol=0; cur.forEach(function(r){ hcol+=r._h; });
      res.push(cur); pool-=hcol; left--;
      cur=moved?[lastR]:[]; u=moved?lastR._h:0;
    }
    cur.push(flat[k]); u+=h;
  }
  res.push(cur);
  while(res.length<cols) res.push([]);
  var ok=(res.length===cols)&&res.every(function(c){
    var t=0; c.forEach(function(r){ t+=r._h; }); return t<=H;
  });
  return ok?res:page;
}
/* l'indice deve stare in una pagina, due al massimo: si prova prima la forma
   piu' leggibile (una colonna, corpo pieno) e si stringe solo quanto serve.
   Se nemmeno a due colonne strette le stanze ci stanno, si scende al livello
   reparto dicendolo in chiaro nella nota in testa all'indice. */
var IX_ATTEMPTS=[
  /* elenco completo, dal piu' leggibile al piu' stretto */
  {cols:1,fs:11,   detail:'full'},
  {cols:1,fs:10.2, detail:'full'},
  {cols:2,fs:11,   detail:'full'},
  {cols:2,fs:9.6,  detail:'full'},
  {cols:2,fs:8.6,  detail:'full'},
  {cols:2,fs:7.8,  detail:'full'},
  /* solo piani e reparti: si rinuncia alle stanze dopo aver provato tutto il
     resto, e anche qui si riparte dalla forma piu' leggibile */
  {cols:1,fs:11,   detail:'rep'},
  {cols:2,fs:11,   detail:'rep'},
  {cols:2,fs:9.6,  detail:'rep'},
  {cols:2,fs:8.6,  detail:'rep'},
  {cols:2,fs:7.6,  detail:'rep'}
];
/* ordine delle preferenze, dalla piu' alla meno desiderabile:
   1. elenco completo in una pagina sola  2. elenco completo in due pagine
   3. senza stanze in una pagina          4. senza stanze in due
   Rinunciare alle stanze viene DOPO l'aver provato tutte le forme complete,
   comprese le piu' strette: due pagine per esteso valgono piu' di una pagina
   con meta' dell'informazione. Le misure sono in cache: si prova solo quello
   che serve davvero. */
function ixPlan(o,off){
  var cache=[];
  function get(i){
    if(cache[i]) return cache[i];
    var A=IX_ATTEMPTS[i], rows=tocRows(o.tree,o.anchors,off,A.detail);
    var H=ixMeasure(o,A,rows);
    return (cache[i]={A:A,pages:packIndex(rows,H,A.cols)});
  }
  function pick(detail,max){
    for(var i=0;i<IX_ATTEMPTS.length;i++){
      if(detail&&IX_ATTEMPTS[i].detail!==detail) continue;
      var t=get(i);
      if(t.pages.length<=max) return t;
    }
    return null;
  }
  return pick('full',1)||pick('full',2)||pick(null,1)||pick(null,2)
      || get(IX_ATTEMPTS.length-1);                  /* elenco enorme: si accettano piu' pagine */
}
function ixPageHTML(o,plan,cols,i,pno,total,rev){
  var body='';
  for(var c=0;c<plan.A.cols;c++) body+='<div class="ix-col">'+(cols[c]||[]).map(ixRowHTML).join('')+'</div>';
  return '<div class="page idx" style="--ix-fs:'+plan.A.fs+'pt">'
    +headHTML(o.title,o.sub,ixCrumb(i>0,plan.A.detail,o.part))
    +'<div class="p-body"><div class="ix-legend">'+ixLegend(plan.A.detail,o.part)+'</div>'
    +'<div class="ix-wrap">'+body+'</div></div>'
    +footHTML(o.sub,o.today,ptag(o)+'Pag. '+pno+' / '+total,rev)+'</div>';
}

/* Il documento non e' piu' "pagine iniziali + schede": e' una fila di fascicoli,
   ognuno con le sue pagine iniziali, il suo tratto di schede e le sue pagine
   vuote. Le pagine si numerano di seguito su tutti i fascicoli.
   Il giro da chiudere e' sempre lo stesso: quante pagine occupa l'indice di un
   fascicolo dipende dalle voci, i numeri stampati dipendono da quante pagine
   iniziali ha il fascicolo. Due passate bastano sempre, il limite e' una
   sicurezza. I fascicoli vanno risolti in ordine: la prima pagina del
   fascicolo k si sa solo quando i precedenti sono chiusi.

   MODALITA' LIBRO. Un libretto fronte-retro e' fatto di fogli piegati: quattro
   pagine per foglio. Quindi ogni fascicolo - e il documento unico, che di
   fascicoli ne ha uno - viene portato a un numero di pagine MULTIPLO DI 4
   aggiungendo pagine intere in fondo. Dentro quel conto ci stanno due pagine
   dichiarate bianche (`voidHTML`), volute e non di riempimento:
     - una a rovescio della copertina, sempre presente quando c'e' una
       copertina: e' la pagina di cortesia del libro stampato, e non si
       compila (l'indice o la prima scheda apre comunque a destra);
     - una in fondo, perche' l'ultima scheda non finisca affacciata alla
       copertina del fascicolo seguente, e dice per scritto che il fascicolo
       finisce li'.
   Le pagine iniziali restano in numero pari: se copertina + rovescio + indice
   fanno un numero dispari, una pagina di pareggio chiude la sequenza.
   ---- il resto del pareggio: pagine da compilare, non bianche ----
   Le pagine che restano per arrivare al multiplo di 4 (pareggio delle pagine
   iniziali, pagine extra richieste) servono solo al conto, non hanno un
   motivo per essere bianche: una pagina A4 bianca in mano a un tecnico e'
   carta buttata, mentre una PAGINA INTERA CON SCHEDE VUOTE (piano, reparto,
   stanza e posizione da scrivere a penna) e' una scorta: occupa lo stesso
   posto nel foglio piegato e si puo' riempire. Quindi quel pareggio si fa
   con quelle. Le uniche due pagine dichiarate bianche restano il rovescio
   della copertina e l'ultima pagina del fascicolo. */
function planDocument(o){
  var pages=o.pages;
  var cuts=(o.wantSplit&&pages.length>1)?chooseCuts(o.pageInfo,o.splitEvery):[0];

  /* la fila dei fascicoli, prima di sapere quante pagine iniziali avranno.
     "free" sono le pagine extra vuote che finiscono dentro quel fascicolo */
  var specs=[];
  if(pages.length){
    for(var k=0;k<cuts.length;k++){
      specs.push({from:cuts[k],to:(k+1<cuts.length?cuts[k+1]-1:pages.length-1),
        free:o.freePerPart+((k===cuts.length-1)?o.freeAtEnd:0),blankPart:false});
    }
  } else {
    /* nessuna scheda: restano le sole pagine extra vuote, che sono comunque un
       documento stampabile */
    specs.push({from:0,to:-1,free:o.freePerPart+o.freeAtEnd,blankPart:false});
  }
  /* un fascicolo intero di sole pagine vuote, in coda: e' scorta da riempire a
     penna, quindi non appartiene a nessun piano */
  if(o.freeWhole>0) specs.push({from:0,to:-1,free:o.freeWhole,blankPart:true});

  var NP=specs.length, parts=[], pos=1;
  specs.forEach(function(sp,k){
    var sc=sp.blankPart?{tree:[],anchors:{},comp:0,nBlank:0}:partScope(pages,sp.from,sp.to);
    var body=Math.max(0,sp.to-sp.from+1)+sp.free;
    var po={title:o.title,sub:o.sub,today:o.today,
      hasData:!sp.blankPart&&o.hasData&&sc.tree.length>0,
      bookMode:o.bookMode,tree:sc.tree,anchors:sc.anchors,stats:treeStats(sc.tree),
      comp:sc.comp,
      part:(NP>1?{k:k+1,N:NP}:null),
      from:sp.from,to:sp.to,free:sp.free,blankPart:sp.blankPart};
    var wantCover=o.wantCover;
    var wantToc=o.wantToc&&po.tree.length>0;
    /* la bianca a rovescio della copertina esiste solo se una copertina c'e' */
    var lead=(o.bookMode&&wantCover)?1:0;
    var plan=null, nToc=wantToc?1:0, fm=0, fmPad=0;
    for(var it=0;it<5;it++){
      fm=(wantCover?1:0)+lead+nToc;
      fmPad=(o.bookMode&&fm%2)?1:0;
      if(!wantToc) break;
      po.plan=null;
      /* le voci dell'indice portano il numero di pagina del documento intero:
         pagina della scheda i = inizio fascicolo + pagine iniziali + (i - from) */
      plan=ixPlan(po,pos-1+fm+fmPad-sp.from);
      if(plan.pages.length===nToc) break;
      nToc=plan.pages.length;
    }
    if(plan){
      nToc=plan.pages.length;
      fm=(wantCover?1:0)+lead+nToc;
      fmPad=(o.bookMode&&fm%2)?1:0;
    }
    var fmTot=fm+fmPad;
    /* in modalita' libro il fascicolo finisce con UNA pagina bianca dichiarata,
       e quello che manca per arrivare al multiplo di 4 sono pagine intere con
       schede vuote, infilate prima di quella: la bianca resta l'ultima */
    var tail=o.bookMode?1:0;
    var tailFree=o.bookMode?(4-((fmTot+body+tail)%4))%4:0;
    po.plan=plan; po.nToc=nToc; po.wantCover=wantCover;
    po.fm=fmTot; po.lead=lead; po.fmPad=fmPad; po.tail=tail; po.tailFree=tailFree;
    /* il rovescio della copertina e il pareggio delle pagine iniziali sono
       bianchi per davvero: niente schede da contare li'. Le schede vuote
       stanno nelle pagine extra chieste e nel pareggio in fondo */
    po.nBlank=sc.nBlank+(sp.free+tailFree)*o.freeCap;
    po.len=body+tailFree;
    po.start=pos; po.end=pos+fmTot+body+tailFree+tail-1;
    parts.push(po); pos=po.end+1;
  });

  var total=pos-1, seq=[];
  parts.forEach(function(p){
    var pno=p.start;
    if(p.wantCover) seq.push({t:'cover',p:p,pno:pno++,first:true});
    var q;
    /* a rovescio della copertina: pagina dichiarata bianca, cosi' l'indice
       (o la prima scheda) apre sempre a destra */
    for(q=0;q<p.lead;q++) seq.push({t:'void',p:p,pno:pno++});
    if(p.plan) p.plan.pages.forEach(function(cols,i){
      seq.push({t:'idx',p:p,plan:p.plan,cols:cols,ci:i,pno:pno++,first:!p.wantCover&&i===0});
    });
    /* pareggio delle pagine iniziali (indice su una pagina sola): bianca
       dichiarata, come il rovescio della copertina. Le pagine da compilare
       stanno tutte in fondo al fascicolo, non in mezzo alle iniziali */
    for(q=0;q<p.fmPad;q++) seq.push({t:'void',p:p,pno:pno++});
    var openNext=!p.wantCover&&!p.nToc;
    for(var i=p.from;i<=p.to;i++) seq.push({t:'schede',p:p,i:i,pno:pno++,first:openNext&&i===p.from});
    for(q=0;q<p.free;q++) seq.push({t:'free',p:p,pno:pno++,first:openNext&&p.to<p.from&&q===0});
    /* pareggio del multiplo di 4: schede vuote, non pagine bianche */
    for(q=0;q<p.tailFree;q++) seq.push({t:'free',p:p,pno:pno++,first:openNext&&p.to<p.from&&!p.free&&q===0});
    /* l'altra pagina davvero bianca del fascicolo: questa porta scritto perche' */
    for(q=0;q<p.tail;q++) seq.push({t:'void',p:p,pno:pno++,tail:true});
  });
  return {seq:seq,parts:parts,total:total,N:NP};
}

/* ============ RENDER ============ */
/* pulsante di stampa e schermata iniziale seguono quello che c'e' davvero
   nell'anteprima: anche le sole pagine vuote sono un documento stampabile */
function updatePrint(){
  var n=document.querySelectorAll('#pages .page').length;
  document.getElementById('print').disabled=!n;
  document.getElementById('empty-state').style.display=n?'none':'';
}
function flash(el,cls){
  if(!el) return;
  el.classList.add('flash');
  setTimeout(function(){ el.classList.remove('flash'); },1400);
}
/* chi scorre davvero. Di regola e' #banco (la colonna dell'anteprima ha il suo
   riquadro di scorrimento, cosi' la testata del ponte resta ferma); sotto i
   980px i pannelli si impilano e torna a scorrere la finestra. Il giro sui
   genitori copre tutti e due i casi senza saperlo. */
function scrollBox(el){
  var p=el.parentElement;
  while(p&&p!==document.body){
    var ov=getComputedStyle(p).overflowY;
    if((ov==='auto'||ov==='scroll')&&p.scrollHeight>p.clientHeight+1) return p;
    p=p.parentElement;
  }
  return document.scrollingElement||document.documentElement;
}
/* porta l'elemento in vista. getBoundingClientRect tiene conto dello zoom (che
   e' una trasformazione), offsetTop no. Lo scorrimento morbido serve solo per
   gli spostamenti brevi: su decine di pagine sarebbe lentissimo. */
function scrollToEl(el,center){
  var sc=scrollBox(el);
  var isDoc=(sc===document.scrollingElement||sc===document.documentElement||sc===document.body);
  var vh=(isDoc?window.innerHeight:sc.clientHeight)||document.documentElement.clientHeight||800;
  var refTop=isDoc?0:sc.getBoundingClientRect().top;
  var r=el.getBoundingClientRect();
  var top=sc.scrollTop+(r.top-refTop)-(center?Math.max(0,(vh-r.height)/2):14);
  top=Math.max(0,Math.round(top));
  /* salto secco: lo scorrimento animato su documenti di decine di pagine e'
     lento e, in qualche browser, viene ignorato del tutto */
  sc.scrollTop=top;
}
/* salto dall'albero: porta l'anteprima alla prima pagina del nodo cliccato */
function jumpToKey(k){
  var i=ANCHORS[k];
  if(i===undefined) return false;
  var pg=document.querySelectorAll('#pages .page')[i];
  if(!pg) return false;
  scrollToEl(pg,false);
  flash(pg);
  return true;
}
/* ogni clic sul contatore scarpe porta alla scheda arancione successiva */
function jumpNextShoe(){
  if(!SHOES.length) return;
  SHOE_I=(SHOE_I+1)%SHOES.length;
  var c=SHOES[SHOE_I];
  scrollToEl(c,true);
  flash(c);
}

/* se le spunte dell'albero riducono la stampa a un solo piano e/o un solo
   reparto, lo si scrive nel titolo: altrimenti il foglio non dice da solo
   cosa contiene rispetto alla mappatura completa. Confrontare con FULL (non
   limitarsi a guardare DATA) e' quello che evita di aggiungere "REPARTO X"
   anche quando il file ha un solo reparto in tutto e non c'e' stata nessuna
   selezione */
function scopeSuffix(full,data){
  if(!full||!full.tree||!data||!data.tree||data.tree.length!==1) return '';
  var p=data.tree[0];
  var fp=full.tree.filter(function(x){return x.name===p.name;})[0];
  var parts=[];
  if(full.tree.length>1) parts.push('PIANO '+p.name);
  if(p.kids.length===1&&fp&&fp.kids.length>1) parts.push('REPARTO '+p.kids[0].name);
  return parts.length?(' — '+parts.join(' · ')):'';
}

/* ---- quanti piani in ogni fascicolo ----
   Il valore vive sull'attributo data-n del comando: un comando segmentato non
   ha un value come un <select>, e tenerlo in una variabile globale vorrebbe
   dire ricordarsi di aggiornarla anche da applySettings. Cosi' c'e' un posto
   solo dove sta scritto. */
var SPLIT_MAX=5;
function getSplitEvery(){
  var n=parseInt(document.getElementById('splitEvery').getAttribute('data-n'),10);
  return (n>=1&&n<=SPLIT_MAX)?n:1;
}
var EVERY_WORD=['','un piano','due piani','tre piani','quattro piani','cinque piani'];
function setSplitEvery(n,redraw){
  n=(n>=1&&n<=SPLIT_MAX)?n:1;
  var seg=document.getElementById('splitEvery');
  seg.setAttribute('data-n',n);
  Array.prototype.forEach.call(seg.querySelectorAll('button'),function(b){
    b.setAttribute('aria-checked',(+b.getAttribute('data-n')===n)?'true':'false');
  });
  /* l'indicatore scorre di una larghezza di segmento per ogni scatto: la
     larghezza e' un quinto del comando, quindi basta il 100% di se stesso */
  seg.querySelector('.ind').style.transform='translateX('+((n-1)*100)+'%)';
  document.getElementById('splitEveryHint').innerHTML=
    (n===1?'Un fascicolo per ogni piano.'
         :'<b>'+EVERY_WORD[n]+'</b> in ogni fascicolo: se i piani stampati non sono un multiplo di '+n
          +', l\'ultimo fascicolo ne contiene meno.')
    +' Il taglio cade sempre dove comincia un piano nuovo, quindi nessun piano finisce a cavallo fra due fascicoli.';
  if(redraw) render();
}
document.getElementById('splitEvery').onclick=function(e){
  var b=e.target.closest?e.target.closest('button[data-n]'):null;
  if(!b||b.disabled) return;
  setSplitEvery(+b.getAttribute('data-n'),true);
};

/* ---- riepilogo dei fascicoli sotto la spunta ----
   Quanti fascicoli escono non lo si scegle piu': sono i piani stampati. Quindi
   qui non c'e' nulla da impostare, solo da dire cosa e' venuto: quanti
   fascicoli, che intervallo di pagine occupa ciascuno (cliccabile: e' il modo
   piu' diretto per passare da un fascicolo all'altro nell'anteprima) e cosa
   contiene il fascicolo di sole pagine vuote, se c'e'. */
function updateSplitInfo(L){
  var hint=document.getElementById('splitHint');
  var sp=document.getElementById('printPartRow'), ps=document.getElementById('printPart');
  var on=document.getElementById('splitParts').checked;
  var cover=document.getElementById('coverPage').checked;
  /* le pagine vuote per fascicolo e il fascicolo vuoto hanno senso solo a
     stampa divisa: spente, si mostrano disattivate invece di sparire, cosi' si
     capisce che esistono e da cosa dipendono */
  ['rowPerPart','rowWholePart','splitOpts'].forEach(function(id){
    var row=document.getElementById(id);
    row.classList.toggle('off',!on);
    Array.prototype.forEach.call(row.querySelectorAll('input,button'),function(x){ x.disabled=!on; });
  });
  if(L&&L.N>1){
    var blankPart=null;
    L.parts.forEach(function(p){ if(p.blankPart) blankPart=p; });
    var nPiani=L.N-(blankPart?1:0), ev=getSplitEvery();
    hint.innerHTML='<b>'+nPiani+'</b> '+(nPiani===1?'fascicolo':'fascicoli')
      +(ev===1?', uno per piano':' da '+EVERY_WORD[ev]+' ciascuno')
      +(blankPart?' + <b>1</b> di sole pagine vuote':'')
      +'. Numerazione unica su '+L.total+' pagine: '
      +L.parts.map(function(p){
        return '<span class="jump" data-page="'+p.start+'" title="Vai alla copertina del fascicolo '+p.part.k+'">'
          +p.start+'\u2013'+p.end+'</span>';
      }).join(' \u00b7 ')
      +'. '+(cover?'Ogni fascicolo ha la sua copertina':'I fascicoli')
      +((L.parts[0]&&L.parts[0].plan)?(cover?' e il suo indice.':' hanno un indice proprio.'):'.')
      +(cover?'':' <b class="warn">Con la copertina spenta i fascicoli non hanno il frontespizio che li distingue.</b>');
    hint.hidden=false;
    Array.prototype.forEach.call(hint.querySelectorAll('.jump'),function(el){
      el.onclick=function(){
        var pg=document.querySelectorAll('#pages .page')[(+el.getAttribute('data-page'))-1];
        if(pg){ scrollToEl(pg,false); flash(pg); }
      };
    });
    var cur=ps.value, oh='<option value="">tutto il documento</option>';
    L.parts.forEach(function(p){
      oh+='<option value="'+p.part.k+'">solo il fascicolo '+p.part.k+' (pagine '+p.start+'\u2013'+p.end+')</option>';
    });
    ps.innerHTML=oh;
    ps.value=ps.querySelector('option[value="'+cur+'"]')?cur:'';
    sp.hidden=false;
  } else {
    /* un solo piano stampato non e' un intoppo: e' un documento che sta in un
       fascicolo. Lo si dice e basta */
    if(on&&L){
      hint.innerHTML=(getSplitEvery()===1?'Un solo piano da stampare: ':'I piani da stampare stanno tutti in un fascicolo: ')
        +'il documento resta a fascicolo unico, '+L.total+' pagine.';
      hint.hidden=false;
    } else hint.hidden=true;
    ps.innerHTML='<option value="">tutto il documento</option>';
    ps.value=''; sp.hidden=true;
  }
  buildPartStrip(L);
}

/* ---- striscia delle miniature (una per parte) ----
   Ogni riquadro e' un clone vero della pagina di apertura della parte
   (copertina se c'e', altrimenti la prima scheda), rimpicciolito con
   transform:scale. Non e' un disegno rifatto a parte: cosi' segue da solo
   titolo, cantiere, densita' e tutto cio' che cambia da un render all'altro.
   Compare solo con piu' di una parte: con una sola non c'e' niente da
   scegliere e occuperebbe spazio senza motivo. */
/* posiziona la striscia (fixed) esattamente sopra il banco, non sopra
   tutta la finestra: cosi' non copre il pannello a sinistra ne' l'albero a
   destra. Richiamata dal ResizeObserver su #banco, quindi segue da sola sia le
   maniglie di ridimensionamento sia il resize della finestra */
function positionPartStrip(){
  var strip=document.getElementById('partStrip'), main=document.getElementById('banco');
  if(!strip||!main||strip.hidden) return;
  var r=main.getBoundingClientRect();
  /* margine bianco disponibile fra il bordo sinistro della pagina in anteprima
     e il bordo della colonna: e' li' che lo scaffale deve stare */
  var wrap=document.getElementById('zoomwrap').getBoundingClientRect();
  var free=wrap.left-r.left;
  var tight=free<106;
  strip.classList.toggle('tight',tight);
  strip.style.left=Math.max(6,r.left+(tight?9:14))+'px';
}
if(window.ResizeObserver) new ResizeObserver(function(){
  positionPartStrip(); positionDocScroll(); updateDocScroll();
}).observe(document.getElementById('banco'));

function buildPartStrip(L){
  var strip=document.getElementById('partStrip');
  PART_ANCHORS=[];
  if(!L||L.N<=1){ strip.hidden=true; strip.innerHTML=''; return; }
  var pageEls=document.querySelectorAll('#pages .page');
  var THUMB_W=64, frag=document.createDocumentFragment();
  /* intestazione dello scaffale: dice che cosa sono quei dorsi, una volta
     sola, invece di ripetere la parola "fascicolo" su ogni miniatura */
  var head=document.createElement('div');
  head.className='shelf-h'; head.textContent='Fascicoli';
  frag.appendChild(head);
  L.parts.forEach(function(p){
    var src=pageEls[p.start-1];
    if(!src) return;
    var w=src.offsetWidth, h=src.offsetHeight;
    if(!w||!h) return;
    var scale=THUMB_W/w;
    var btn=document.createElement('button');
    btn.type='button'; btn.className='part-thumb';
    btn.title='Vai al fascicolo '+p.part.k+' di '+p.part.N+' (pagine '+p.start+'–'+p.end+')';
    var box=document.createElement('div');
    box.className='box';
    box.style.width=THUMB_W+'px'; box.style.height=Math.round(h*scale)+'px';
    var clone=src.cloneNode(true);
    clone.style.width=w+'px'; clone.style.transform='scale('+scale+')';
    box.appendChild(clone);
    /* sotto il dorso il numero del fascicolo, grande, e le pagine che
       contiene: sono le due cose che si cercano guardando una pila */
    var lab=document.createElement('div');
    lab.className='lab';
    lab.innerHTML='<i>'+('0'+p.part.k).slice(-2)+'</i>p. '+p.start+'–'+p.end;
    btn.appendChild(box); btn.appendChild(lab);
    btn.onclick=function(){ scrollToEl(src,false); flash(src); };
    frag.appendChild(btn);
    PART_ANCHORS.push({el:src,thumb:btn});
  });
  strip.innerHTML=''; strip.appendChild(frag);
  strip.hidden=!PART_ANCHORS.length;
  positionPartStrip();
  updateActivePart();
}
/* la parte "attiva" e' l'ultima la cui pagina di apertura ha gia' superato il
   bordo superiore dell'anteprima: e' quella che si sta guardando in questo
   momento, non necessariamente quella su cui si e' cliccato per ultimo */
function updateActivePart(){
  if(!PART_ANCHORS.length) return;
  /* riferimento fisso poco sotto la cima della finestra: lo scaffale sta di
     lato e non copre piu' niente, quindi il margine non dipende dalla sua
     altezza come quando era una fascia orizzontale */
  var ref=110;
  var active=PART_ANCHORS[0];
  for(var i=0;i<PART_ANCHORS.length;i++){
    if(PART_ANCHORS[i].el.getBoundingClientRect().top<=ref) active=PART_ANCHORS[i];
  }
  PART_ANCHORS.forEach(function(a){ a.thumb.classList.toggle('active',a===active); });
}
/* chi scorre davvero e' #banco, o la finestra sotto i 980px (vedi scrollBox()
   sopra), e lo scroll non risale ai genitori: la cattura in fase di capture su
   window intercetta comunque l'evento, scorra la finestra o il banco */
window.addEventListener('scroll',function(){
  if(partObserverRAF) return;
  partObserverRAF=requestAnimationFrame(function(){
    partObserverRAF=null; updateActivePart(); updateDocScroll();
  });
},{passive:true,capture:true});

/* ---- barra di scorrimento ----
   Domande diverse, margini diversi: lo scaffale a sinistra dice dove
   comincia ogni fascicolo, la barra a destra dice a che punto del documento
   si sta guardando - il posto che prima teneva la mappa a miniature. Niente
   cloni delle pagine da rifare a ogni render: la barra legge solo
   scrollHeight/scrollTop di chi scorre davvero (scrollBox(), la stessa usata
   da scrollToEl), quindi non ha uno stato da ricostruire come la vecchia
   mappa (MM_ITEMS/MM_TOPS eccetera) - resta solo DS_DRAG per il
   trascinamento. */
/* margine libero a destra e offset della barra, sullo stesso schema di
   positionPartStrip ma speculare: qui non serve una forma "tight" perche' la
   barra e' gia' stretta di suo (9-13px), quindi sotto una certa soglia si
   nasconde del tutto invece di ridursi ancora - coprire la pagina per un
   cursore che non si legge piu' non sarebbe uno scambio conveniente. */
/* la barra nativa del banco si toglie quando c'e' quella blu (css: body.ds-attiva),
   ma non se c'e' da scorrere in orizzontale */
function syncNativeScrollbar(){
  var bar=document.getElementById('docScroll'), b=document.getElementById('banco');
  if(!bar||!b) return;
  var attiva=!bar.hidden&&!bar.classList.contains('cramped')&&b.scrollWidth<=b.clientWidth+1;
  document.body.classList.toggle('ds-attiva',attiva);
}
function positionDocScroll(){
  var bar=document.getElementById('docScroll'), main=document.getElementById('banco');
  if(!bar||!main) return;
  var r=main.getBoundingClientRect();
  /* le due guide sono fixed rispetto alla finestra, ma devono stare in mezzo al
     BANCO, che comincia sotto la testata del ponte: senza questa misura
     resterebbero centrate sulla finestra e la piu' alta sconfinerebbe sotto la
     testata. Sta qui e non in positionPartStrip perche' quella esce subito
     quando lo scaffale non c'e' (un fascicolo solo). */
  document.documentElement.style.setProperty('--banco-top',Math.round(r.top)+'px');
  var wrap=document.getElementById('zoomwrap').getBoundingClientRect();
  var free=r.right-wrap.right;
  bar.classList.toggle('cramped',free<22);
  bar.style.right=Math.max(4,(window.innerWidth-r.right)+8)+'px';
  syncNativeScrollbar();
}
/* dimensione e posizione del cursore: la frazione della pagina visibile
   (clientHeight/scrollHeight) e la frazione gia' scorsa (scrollTop/range).
   Nessun conto sullo zoom: #zoomwrap e' gia' ridimensionato alla scala vera
   (vedi applyZoom), quindi scrollHeight la contiene gia'. Nasconde la barra
   quando non c'e' niente da scorrere (un documento piu' corto della finestra,
   o nessun file caricato) invece di mostrare un cursore lungo quanto la
   traccia, che non direbbe niente. */
function updateDocScroll(){
  var bar=document.getElementById('docScroll');
  if(!bar) return;
  var pagesEl=document.getElementById('pages');
  var n=pagesEl?document.querySelectorAll('#pages .page').length:0;
  var sc=n?scrollBox(pagesEl):null;
  var range=sc?sc.scrollHeight-sc.clientHeight:0;
  if(!sc||n<2||range<=1){ bar.hidden=true; syncNativeScrollbar(); return; }
  bar.hidden=false;
  var track=bar.querySelector('.ds-track'), trackH=track.clientHeight;
  var frac=Math.max(0,Math.min(1,sc.clientHeight/sc.scrollHeight));
  var top=Math.max(0,Math.min(1,sc.scrollTop/range));
  var thumbH=Math.max(30,Math.round(frac*trackH));
  var thumbTop=Math.round(top*(trackH-thumbH));
  var thumb=bar.querySelector('.ds-thumb');
  thumb.style.height=thumbH+'px';
  thumb.style.top=thumbTop+'px';
  var page=Math.min(n,Math.max(1,Math.round(1+top*(n-1))));
  /* la bolla segue il centro del cursore, non il centro della traccia:
     su un documento lungo il cursore passa gran parte del tempo vicino a un
     bordo, mai a meta' */
  var tip=bar.querySelector('.ds-tip');
  tip.textContent='pag. '+page+' / '+n;
  tip.style.top=(thumbTop+thumbH/2)+'px';
  syncNativeScrollbar();
}
/* clic e trascinamento sulla traccia: la posizione toccata (meno mezzo
   cursore, cosi' il punto sotto il dito resta sotto il cursore) diventa la
   frazione di scorrimento, applicata direttamente a scrollTop - un salto
   secco, come scrollToEl fa per lo scaffale e l'albero. */
function docScrollHit(clientY){
  var bar=document.getElementById('docScroll'), track=bar.querySelector('.ds-track');
  var r=track.getBoundingClientRect();
  var thumbH=bar.querySelector('.ds-thumb').offsetHeight;
  var usable=Math.max(1,r.height-thumbH);
  var frac=Math.max(0,Math.min(1,(clientY-r.top-thumbH/2)/usable));
  var pagesEl=document.getElementById('pages');
  if(!pagesEl) return;
  var sc=scrollBox(pagesEl), range=sc.scrollHeight-sc.clientHeight;
  sc.scrollTop=Math.round(frac*range);
}
(function(){
  var bar=document.getElementById('docScroll');
  bar.addEventListener('mousedown',function(e){
    if(bar.hidden||e.button!==0) return;
    DS_DRAG=true;
    bar.classList.add('scrub'); document.body.classList.add('scrubbing');
    docScrollHit(e.clientY);
    e.preventDefault();
  });
  document.addEventListener('mousemove',function(e){ if(DS_DRAG) docScrollHit(e.clientY); });
  document.addEventListener('mouseup',function(){
    if(!DS_DRAG) return;
    DS_DRAG=false;
    bar.classList.remove('scrub'); document.body.classList.remove('scrubbing');
  });
})();

function render(){
  var pagesEl=document.getElementById('pages');
  pagesEl.innerHTML='';
  ANCHORS={}; SHOES=[]; SHOE_I=-1;

  var densKey=document.getElementById('dens').value;
  var d0=DENS[densKey]||DENS[4];
  var targetN=+densKey||4; /* le "N schede" promesse dal selettore densita' */
  var compact=!!d0.compact;
  var rs=document.documentElement.style;
  /* titolo, cantiere e briciola servono gia' alle misure: sono loro a determinare
     l'altezza dell'intestazione e quindi lo spazio che resta alle schede */
  var title=document.getElementById('docTitle').value.trim()||'ELENCO COMPONENTI';
  title+=scopeSuffix(FULL,DATA);
  var sub=document.getElementById('docSub').value.trim();
  var today=new Date().toLocaleDateString('it-IT');

  /* pagine extra vuote: dove metterle e' una scelta a spunte. Quelle per
     fascicolo e il fascicolo intero vuoto esistono solo a stampa divisa, dove
     "per fascicolo" vuol dire qualcosa */
  var splitOn=document.getElementById('splitParts').checked;
  function extraN(chk,num,def){
    if(!document.getElementById(chk).checked) return 0;
    return Math.max(1,Math.min(50,parseInt(document.getElementById(num).value,10)||def));
  }
  var freeAtEnd=extraN('extraAtEnd','extraAtEndN',1);
  var freePerPart=splitOn?extraN('extraPerPart','extraPerPartN',1):0;
  var freeWhole=splitOn?extraN('extraWhole','extraWholeN',4):0;
  var anyFree=freeAtEnd+freePerPart+freeWhole>0;
  var hasData=!!(DATA&&DATA.tree&&DATA.tree.length);
  /* senza file caricato si possono comunque produrre solo pagine vuote */
  if(!hasData&&!anyFree){ document.getElementById('stat').innerHTML=''; updateSplitInfo(null); updatePrint(); applyZoom(); updateDocScroll(); return; }

  var probeCrumb=crumbHTML(widestCrumb(hasData?DATA.tree:[]),true);

  /* la densita' (numero di schede per pagina) va ricalibrata sulle dimensioni
     reali di intestazione/pie' di pagina: queste possono cambiare (logo, titolo,
     cantiere, firma...) e altrimenti il numero indicato nel menu non
     corrisponderebbe piu' a quello che entra davvero in pagina */
  rs.setProperty('--desc-lines',d0.clamp||2);
  rs.setProperty('--card-h',d0.h+'mm'); rs.setProperty('--top-h',d0.top+'mm'); rs.setProperty('--fs',d0.fs+'pt');
  rs.setProperty('--code-fs',d0.code+'pt'); rs.setProperty('--desc-fs',d0.desc+'pt'); rs.setProperty('--descl-fs',d0.descl+'pt');
  var M0=measure(d0.lines,title,sub,today,probeCrumb,compact);
  var ppm=pxPerMm();
  /* le fasce REPARTO e STANZA stanno in testa alla pagina e rubano spazio alle
     schede: il loro ingombro va riservato, altrimenti su ogni pagina che apre un
     reparto o una stanza (con le impostazioni predefinite, quasi tutte) entrano
     targetN-1 schede invece delle targetN promesse dal selettore */
  var reserve=hasData?(M0.rep+M0.stz):0;
  var idealPx=Math.max(20,(M0.H-reserve)/targetN-M0.gap-2); /* -2px di margine di sicurezza per gli arrotondamenti */
  var scale=(idealPx/ppm)/d0.h;
  var d={h:idealPx/ppm, top:d0.top*scale, lines:d0.lines, fs:d0.fs*scale, code:d0.code*scale, desc:d0.desc*scale, descl:d0.descl*scale};
  rs.setProperty('--card-h',d.h+'mm'); rs.setProperty('--top-h',d.top+'mm'); rs.setProperty('--fs',d.fs+'pt');
  rs.setProperty('--code-fs',d.code+'pt'); rs.setProperty('--desc-fs',d.desc+'pt'); rs.setProperty('--descl-fs',d.descl+'pt');

  var M=measure(d.lines,title,sub,today,probeCrumb,compact), CARD=M.card;
  var fillGap=document.getElementById('fillGap').checked;
  var newRep=document.getElementById('newRep').checked;
  var newRoom=document.getElementById('newRoom').checked;
  var roomBlankPage=document.getElementById('roomBlankPage').checked;
  var bookMode=document.getElementById('bookMode').checked;
  var budget=M.H+M.gap;
  var blanksPerPage=Math.max(1,Math.min(targetN,Math.floor(budget/CARD)));

  /* blocchi: fasce + schede */
  var blocks=[];
  if(hasData) DATA.tree.forEach(function(p){
    p.kids.forEach(function(r){
      blocks.push({t:'rep',h:M.rep,piano:p.name,reparto:r.name,brk:newRep,
        n:r.kids.reduce(function(a,s){return a+s.items.length;},0)});
      r.kids.forEach(function(s,si){
        blocks.push({t:'stz',h:M.stz,piano:p.name,reparto:r.name,stanza:s.name,n:s.items.length,brk:newRoom&&si>0});
        s.items.forEach(function(it){ blocks.push({t:'card',h:CARD,it:it,piano:p.name,reparto:r.name,stanza:s.name}); });
        if(roomBlankPage){
          blocks.push({t:'pagebreak'});
          for(var bi=0;bi<blanksPerPage;bi++) blocks.push({t:'blank',h:CARD,piano:p.name,reparto:r.name,stanza:s.name,dedicated:true});
        }
      });
    });
  });
  if(!blocks.length&&!anyFree){
    pagesEl.innerHTML='<div class="page" style="justify-content:center;text-align:center;color:var(--graphite)">Nessun elemento selezionato.</div>';
    document.getElementById('stat').innerHTML=''; updateSplitInfo(null); updatePrint(); applyZoom(); updateDocScroll(); return;
  }

  var pages=[], cur=null, ctx={piano:'',reparto:'',stanza:''};
  function open(){ cur={blocks:[],used:0,cards:0,ctx:{piano:ctx.piano,reparto:ctx.reparto,stanza:ctx.stanza},cont:false}; pages.push(cur); }
  if(blocks.length){
  open();
  blocks.forEach(function(b){
    if(b.t==='pagebreak'){ if(cur.blocks.length) open(); return; }
    var isCard=(b.t==='card'||b.t==='blank');
    var need=b.h+((b.t==='rep'||b.t==='stz')?CARD:0); /* nessuna fascia orfana a fondo pagina */
    if((b.t==='rep'||b.t==='stz')&&b.brk&&cur.blocks.length){
      if(b.t==='rep'){ctx={piano:b.piano,reparto:b.reparto,stanza:''};} else {ctx.stanza=b.stanza;}
      open();
    /* targetN e' un tetto assoluto: schede componente e schede vuote insieme non
       superano mai il numero scelto nel selettore densita'. Lo spazio che avanza
       sulle pagine senza fasce reparto/stanza (che hanno libero lo spazio delle
       fasce) viene distribuito fra le schede da spreadSlack(), non riempito con
       una scheda in piu'. */
    } else if(cur.blocks.length && (cur.used+need>budget || (isCard&&cur.cards>=targetN))) open();
    if(b.t==='rep'){ ctx.piano=b.piano; ctx.reparto=b.reparto; ctx.stanza=''; }
    if(b.t==='stz'){ ctx.stanza=b.stanza; }
    if(!cur.blocks.length){
      cur.ctx={piano:ctx.piano,reparto:ctx.reparto,stanza:ctx.stanza};
      cur.cont=(b.t==='card'||b.t==='blank');
    }
    cur.blocks.push(b); cur.used+=b.h; if(isCard) cur.cards++;
  });

  /* nessuna pagina composta solo da schede vuote: le si accompagna
     con l'ultimo componente della pagina precedente */
  for(var i=1;i<pages.length;i++){
    var pg=pages[i];
    if(!pg.blocks.length || pg.blocks[0].dedicated) continue;
    if(pg.blocks.every(function(b){return b.t==='blank';})){
      var prev=pages[i-1];
      var lastCard=null;
      for(var j=prev.blocks.length-1;j>=0;j--){ if(prev.blocks[j].t==='card'){ lastCard=j; break; } }
      var nCardsPrev=prev.blocks.filter(function(b){return b.t==='card';}).length;
      if(lastCard!==null && nCardsPrev>1 && pg.used+CARD<=budget && pg.cards<targetN){
        var mv=prev.blocks.splice(lastCard,1)[0];
        prev.used-=mv.h; prev.cards--;
        pg.blocks.unshift(mv); pg.used+=mv.h; pg.cards++;
        pg.ctx={piano:mv.piano,reparto:mv.reparto,stanza:mv.stanza}; pg.cont=true;
      }
    }
  }

  /* ogni pagina viene portata al numero di schede scelto (schede componente +
     schede vuote), mai oltre. Le pagine dedicate (pagina finale di sole schede
     vuote per stanza) sono gia' complete per costruzione. */
  if(fillGap){
    pages.forEach(function(pg){
      if(pg.blocks.length && pg.blocks[0].dedicated) return;
      var guard=0;
      while(pg.cards<targetN && pg.used+CARD<=budget && guard++<40){ pg.blocks.push({t:'blank',h:CARD}); pg.used+=CARD; pg.cards++; }
    });
  }
  /* l'ultima pagina puo' restare vuota se l'elenco finisce esatto su un salto */
  if(pages.length && !pages[pages.length-1].blocks.length) pages.pop();
  }

  /* le pagine extra vuote non stanno nella fila delle schede: le colloca
     planDocument, che sa dove finisce ogni fascicolo. Qui si prepara solo il
     modello di una di quelle pagine - quante schede vuote ci stanno e il loro
     HTML - perche' misurarlo richiede la densita' appena calibrata */
  var freeCap=Math.max(1,Math.min(targetN,Math.floor((measureFree(d.lines,title,sub,today,compact)+M.gap)/CARD)));
  var freeBody='';
  for(var fj=0;fj<freeCap;fj++) freeBody+=blankHTML(d.lines,compact);


  /* copertine e indici si costruiscono ora, a impaginazione delle schede
     finita: e' allora che si sa quante pagine ci sono e dove tagliare le parti */
  var L=planDocument({
    title:title,sub:sub,today:today,hasData:hasData,bookMode:bookMode,pages:pages,
    wantCover:document.getElementById('coverPage').checked&&(pages.length>0||anyFree),
    wantToc:document.getElementById('tocPage').checked&&hasData&&pages.length>0,
    wantSplit:splitOn&&pages.length>1,splitEvery:getSplitEvery(),
    freePerPart:freePerPart,freeAtEnd:freeAtEnd,freeWhole:freeWhole,freeCap:freeCap,
    /* per decidere dove tagliare serve sapere, pagina per pagina, con che piano
       si apre e con che piano si chiude: il taglio cade dove il piano cambia */
    pageInfo:pages.map(function(pg){
      var b0=pg.blocks[0]||{}, lp='';
      for(var q=pg.blocks.length-1;q>=0;q--){ if(pg.blocks[q].piano){ lp=pg.blocks[q].piano; break; } }
      return {ctx:pg.ctx,cont:!!pg.cont,startsRep:b0.t==='rep',piano:b0.piano||'',lastPiano:lp};
    })
  });

  var html=L.seq.map(function(x,di){
    var rev=bookMode&&x.pno%2===0, sep='';
    /* stacco fra una parte e l'altra: nell'anteprima le parti si sfogliano
       come libretti diversi, in stampa lo stacco non esiste (sparisce) */
    if(x.first&&x.p.part&&x.p.part.k>1)
      sep='<div class="partsep" data-page="'+x.pno+'"><b>Fascicolo '+x.p.part.k
        +' di '+x.p.part.N+'</b><span>pagine '+x.p.start+'\u2013'+x.p.end+'</span></div>';
    if(x.t==='cover') return sep+coverHTML(x.p,x.pno,L.total,rev);
    if(x.t==='void')  return sep+voidHTML(x.p,x.pno,L.total,rev,x.tail);
    if(x.t==='idx')   return sep+ixPageHTML(x.p,x.plan,x.cols,x.ci,x.pno,L.total,rev);
    /* pagina extra vuota: intestazione con piano/reparto/stanza da scrivere a
       penna e solo schede vuote */
    if(x.t==='free')  return sep+'<div class="page">'+headHTML(title,sub,ffieldsHTML())
      +'<div class="p-body">'+freeBody+'</div>'
      +footHTML(sub,today,ptag(x.p)+'Pag. '+x.pno+' / '+L.total,rev)+'</div>';
    var pg=pages[x.i];
    /* la scheda che apre un fascicolo non e' "(segue)": comincia un libretto */
    var crumb=crumbHTML(pg.ctx,pg.cont&&x.i!==x.p.from);
    var body=pg.blocks.map(function(b){
      if(b.t==='rep') return '<div class="band rep"><span class="lbl">REPARTO</span><span class="val">'+esc(b.reparto)+'</span><span class="cnt">'+b.n+' comp.</span></div>';
      if(b.t==='stz') return '<div class="band stz"><span class="lbl">STANZA</span><span class="val">'+esc(b.stanza)+'</span><span class="cnt">'+b.n+' comp.</span></div>';
      if(b.t==='blank') return blankHTML(d.lines,compact);
      return cardHTML(b.it,d.lines,compact);
    }).join('');
    return sep+'<div class="page">'+headHTML(title,sub,crumb)
      +'<div class="p-body">'+body+'</div>'
      +footHTML(sub,today,ptag(x.p)+'Pag. '+x.pno+' / '+L.total,rev)+'</div>';
  }).join('');
  pagesEl.innerHTML=html;

  /* ogni pagina sa a quale parte appartiene: e' quello che permette di
     stampare una parte sola senza toccare il resto del documento */
  var pgEls=pagesEl.querySelectorAll('.page');
  L.seq.forEach(function(x,di){
    var el=pgEls[di]; if(!el) return;
    el.setAttribute('data-part',x.p.part?x.p.part.k:'1');
    /* indice dei salti: la prima pagina, nel DOM, in cui compare ogni
       piano/reparto/stanza. Vale la prima volta in assoluto, parti comprese */
    if(x.t!=='schede') return;
    pages[x.i].blocks.forEach(function(b){
      if(!b.piano) return;
      var k1=b.piano, k2=k1+'\u0001'+b.reparto, k3=k2+'\u0001'+b.stanza;
      if(!(k1 in ANCHORS)) ANCHORS[k1]=di;
      if(b.reparto&&!(k2 in ANCHORS)) ANCHORS[k2]=di;
      if(b.stanza&&!(k3 in ANCHORS)) ANCHORS[k3]=di;
    });
  });

  spreadSlack(CARD,targetN);
  fitDescriptions();
  SHOES=Array.prototype.slice.call(pagesEl.querySelectorAll('.card.shoe'));

  updateSplitInfo(L);
  /* pagine intere con schede vuote: quelle chieste a spunta piu' quelle che
     pareggiano la modalita' libro in FONDO al fascicolo (multiplo di 4). Sono
     tutte da compilare a penna, quindi si contano insieme. Il rovescio della
     copertina e il pareggio delle iniziali non ci sono: quelli restano
     bianchi, non da compilare */
  var nFree=L.parts.reduce(function(a,p){return a+p.free+p.tailFree;},0);
  var nBlank=pages.reduce(function(a,pg){return a+pg.blocks.filter(function(b){return b.t==='blank';}).length;},0)
    +nFree*freeCap;
  var nCards=blocks.filter(function(b){return b.t==='card';}).length;
  var nShoe=blocks.filter(function(b){return b.t==='card'&&isShoe(b.it);}).length;
  /* pagine iniziali e pagine bianche si contano a parte: sommarle farebbe
     leggere "45 pagine iniziali" su un documento che ne ha sei. Le bianche
     sono il rovescio della copertina, l'eventuale pareggio delle iniziali e
     l'ultima del fascicolo; il pareggio in fondo sono pagine intere con
     schede vuote, contate in nFree. Rovescio e pareggio contano anche fra le
     iniziali: sono bianchi, ma stanno prima delle schede */
  var nFront=L.parts.reduce(function(a,p){return a+(p.wantCover?1:0)+p.lead+p.nToc+p.fmPad;},0);
  var nVoid=L.parts.reduce(function(a,p){return a+p.lead+p.fmPad+p.tail;},0);
  document.getElementById('stat').innerHTML='<b>'+nCards+'</b> componenti \u00b7 <b>'+nBlank+'</b> schede vuote \u00b7 <b>'+L.total+'</b> pagine A4'
    +(nFront?' \u00b7 <b>'+nFront+'</b> '+(nFront===1?'pagina iniziale':'pagine iniziali'):'')
    +(nFree?' \u00b7 <b>'+nFree+'</b> '+(nFree===1?'pagina da compilare':'pagine da compilare'):'')
    +(nVoid?' \u00b7 <b>'+nVoid+'</b> '+(nVoid===1?'pagina bianca':'pagine bianche'):'')
    +(L.N>1?' \u00b7 <b>'+L.N+'</b> fascicoli':'')
    +(nShoe?' \u00b7 <b class="jump" id="shoejump" title="Clicca per andare alla scheda scarpa successiva" style="color:var(--shoe-dk)">'+nShoe+' '+(nShoe===1?'scarpa':'scarpe')+'</b>':'');
  var sj=document.getElementById('shoejump');
  if(sj) sj.onclick=jumpNextShoe;
  updatePrint();
  applyZoom();
  updateDocScroll();
}

/* le descrizioni oltre la soglia "long" (70 caratteri) possono non entrare
   comunque nelle righe disponibili: invece di tagliarle silenziosamente
   (line-clamp + overflow:hidden), si stringe il font scheda per scheda finche'
   il testo ci sta tutto. L'altezza del riquadro e' in em quindi segue il font:
   il layout della scheda (geometria fissa) non cambia.
   Il confronto e' fra scrollHeight (quello che il testo occuperebbe davvero) e
   clientHeight (il riquadro come lo si vede): contare le righe non bastava,
   perche' .c-id ha altezza fissa (--top-h) e, quando codice + descrizione non
   ci stanno, il flex SCHIACCIA il riquadro della descrizione sotto le due righe
   dichiarate. Il testo restava di due righe (nessuna riduzione) ma la seconda
   veniva tagliata a meta': e' quello che si vedeva a 5 schede/pagina sulle
   descrizioni lunghe. Con clientHeight la compressione viene vista e corretta,
   e le descrizioni corte (che non sbordano) non vengono toccate. */
function fitDescriptions(){
  var MIN_FS=7.5; /* px, sotto diventa illeggibile in stampa: oltre questo si accetta il taglio */
  var STEP=0.3;
  Array.prototype.forEach.call(document.querySelectorAll('#pages .c-desc'),function(el){
    el.style.fontSize='';
    var guard=0;
    while(el.scrollHeight>el.clientHeight+0.5 && guard++<80){
      var fs=parseFloat(getComputedStyle(el).fontSize);
      if(fs<=MIN_FS) break;
      el.style.fontSize=Math.max(MIN_FS,fs-STEP)+'px';
    }
  });
}

/* quello che avanza dopo il riempimento e' sempre meno di una scheda (le fasce
   reparto/stanza occupano piu' spazio di quanto ne liberi una scheda in meno):
   lo si distribuisce fra le schede della pagina, misurando la pagina vera e
   propria, cosi' nessun foglio resta con un buco in fondo e le schede
   mantengono tutte la stessa dimensione. Le fasce restano attaccate alla scheda
   che introducono. offsetTop/offsetHeight e non getBoundingClientRect: questi
   ultimi sono falsati dallo zoom dell'anteprima. */
function spreadSlack(cardPitch,targetN){
  Array.prototype.forEach.call(document.querySelectorAll('#pages .page'),function(p){
    /* copertina, indice e pagine di pareggio non hanno schede da distanziare */
    var body=p.querySelector('.p-body');
    if(!body||p.className.indexOf('cover')>=0||p.className.indexOf('idx')>=0) return;
    var kids=body.children;
    body.style.setProperty('--xgap','0px');
    if(kids.length<2) return;
    var adj=0;
    for(var i=1;i<kids.length;i++){
      if(kids[i].className.indexOf('card')>=0 && kids[i-1].className.indexOf('card')>=0) adj++;
    }
    if(!adj) return;
    var first=kids[0], last=kids[kids.length-1];
    var slack=body.clientHeight-(last.offsetTop+last.offsetHeight-first.offsetTop)-2;
    if(slack<=3) return;
    /* si spalma il vuoto solo quando la pagina e' chiusa: ha raggiunto il numero
       di schede scelto, oppure non ci sta piu' nessuna scheda. Se invece manca
       ancora spazio per una scheda intera (l'utente ha disattivato il
       riempimento con schede vuote) il vuoto resta in fondo, allargare i
       distacchi sfigurerebbe la pagina. */
    var full=p.querySelectorAll('.card').length>=targetN || slack<cardPitch;
    if(full) body.style.setProperty('--xgap',(slack/adj).toFixed(2)+'px');
  });
}

/* ============ FILTRI ============ */
var CHEV='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 8l7 8 7-8"/></svg>';
var ICO_FOLD='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 15l6-6 6 6"/><path d="M4 20h16"/></svg>';
var ICO_UNFOLD='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/><path d="M4 4h16"/></svg>';

/* apre/chiude una tendina: agisce solo sulla visibilita', le spunte non cambiano */
function setSub(btn,sub,open){
  if(open) sub.removeAttribute('hidden'); else sub.setAttribute('hidden','');
  btn.className='tw'+(open?'':' closed');
  btn.setAttribute('aria-expanded',open?'true':'false');
  btn.title=open?'Chiudi':'Apri';
}
function toggleSub(btn,sub){ setSub(btn,sub,sub.hasAttribute('hidden')); }
var TREE_COLLAPSED=false;
function setAllSubs(collapse){
  var el=document.getElementById('tree');
  Array.prototype.forEach.call(el.querySelectorAll('.nh'),function(nh){
    var btn=nh.querySelector('.tw'), sub=nh.nextElementSibling;
    if(btn&&sub&&sub.className.indexOf('sub')>=0) setSub(btn,sub,!collapse);
  });
  TREE_COLLAPSED=!!collapse;
  var b=document.getElementById('collAll');
  b.innerHTML=collapse?ICO_UNFOLD:ICO_FOLD;
  b.title=collapse?'Espandi tutto':'Comprimi tutto';
  b.setAttribute('aria-label',b.title);
}
function setAllChecks(v){
  var el=document.getElementById('tree');
  Array.prototype.forEach.call(el.querySelectorAll('input[type=checkbox]'),function(x){
    x.checked=v; x.indeterminate=false;
  });
  syncTree(); applyFilter();
}
/* ---- stato dell'albero, in un posto solo ----
   Quello che si stampa lo decidono le STANZE: piani e reparti sono contenitori
   e il loro cerchio racconta i figli, non una scelta propria. Quindi si conta
   dal basso: un contenitore con tutti i figli dentro e' pieno, con nessuno e'
   vuoto, con qualcuno porta il trattino. Un contenitore senza figli (il caso
   di un reparto senza stanze) tiene lo stato che ha, perche' non c'e' niente
   da cui dedurlo.
   Nello stesso giro si accendono i binari dei rami che contengono qualcosa e
   si marcano .out le righe che restano fuori dalla stampa: sono due letture
   della stessa informazione, e calcolarle insieme evita che si contraddicano. */
function treeRow(input){ return input.closest('.nh')||input.closest('.row'); }
function treeRail(input){
  var row=treeRow(input);
  var sub=row&&row.nextElementSibling;
  return (sub&&sub.classList.contains('sub'))?sub:null;
}
function treeRollUp(input,kids){
  var on=0, part=false;
  kids.forEach(function(x){ if(x.checked) on++; if(x.indeterminate) part=true; });
  if(kids.length){
    input.checked=on>0;
    /* "in parte" risale: un piano con dentro un reparto a meta' e' a meta'
       anche lui, altrimenti il cerchio del piano direbbe "tutto dentro" su un
       piano da cui manca una stanza */
    input.indeterminate=on>0&&(on<kids.length||part);
  }
  return input.checked;
}
function treePaint(input){
  var row=treeRow(input), rail=treeRail(input);
  if(row) row.classList.toggle('out',!input.checked);
  if(rail) rail.classList.toggle('lit',input.checked);
}
function syncTree(){
  var el=document.getElementById('tree');
  var piani=el.querySelectorAll('input[data-p]:not([data-r])');
  Array.prototype.forEach.call(piani,function(pcb){
    var p=pcb.dataset.p;
    var reps=el.querySelectorAll('input[data-p="'+p+'"][data-r]:not([data-s])');
    Array.prototype.forEach.call(reps,function(rcb){
      var stanze=el.querySelectorAll('input[data-p="'+p+'"][data-r="'+rcb.dataset.r+'"][data-s]');
      treeRollUp(rcb,Array.prototype.slice.call(stanze));
      treePaint(rcb);
      Array.prototype.forEach.call(stanze,function(scb){ treePaint(scb); });
    });
    treeRollUp(pcb,Array.prototype.slice.call(reps));
    treePaint(pcb);
  });
  /* "Tutto l'impianto" si ricava dai piani con la stessa regola, non contando
     tutte le caselle dell'albero: contando anche i contenitori, un piano
     intero escluso su sei dava un parziale diverso da quello che si vede */
  treeRollUp(document.getElementById('selAll'),Array.prototype.slice.call(piani));
}

/* la colonna dell'albero si mostra solo a file caricato */
function showTreeCol(){
  document.getElementById('treegrip').hidden=false;
  document.getElementById('treecol').hidden=false;
}
function buildTree(){
  var el=document.getElementById('tree'); el.innerHTML='';
  FULL.tree.forEach(function(p,pi){
    var k1=p.name;
    var d1=document.createElement('div'); d1.className='lv1 nh';
    d1.innerHTML='<button type="button" class="tw" aria-expanded="true" title="Chiudi">'+CHEV+'</button>'
      +'<label class="pick" title="Includi o escludi questo piano"><input type="checkbox" data-p="'+pi+'" checked></label>'
      +'<span class="nm" data-k="'+escA(k1)+'" title="Vai a questo piano nell\'anteprima">PIANO: '+esc(p.name)+'</span>';
    el.appendChild(d1);
    var sub1=document.createElement('div'); sub1.className='sub'; el.appendChild(sub1);
    (function(btn,sub){ btn.onclick=function(){ toggleSub(btn,sub); }; })(d1.querySelector('.tw'),sub1);
    p.kids.forEach(function(r,ri){
      var d2=document.createElement('div'); d2.className='lv2 nh';
      var k2=k1+'\u0001'+r.name;
      var n=r.kids.reduce(function(a,s){return a+s.items.length;},0);
      d2.innerHTML='<button type="button" class="tw" aria-expanded="true" title="Chiudi">'+CHEV+'</button>'
        +'<label class="pick" title="Includi o escludi questo reparto"><input type="checkbox" data-p="'+pi+'" data-r="'+ri+'" checked></label>'
        +'<span class="nm" data-k="'+escA(k2)+'" title="Vai a questo reparto nell\'anteprima">'+esc(r.name)+' <span class="cnt">('+n+')</span></span>';
      sub1.appendChild(d2);
      var sub2=document.createElement('div'); sub2.className='sub'; sub1.appendChild(sub2);
      (function(btn,sub){ btn.onclick=function(){ toggleSub(btn,sub); }; })(d2.querySelector('.tw'),sub2);
      r.kids.forEach(function(s,si){
        var d3=document.createElement('div'); d3.className='lv3 row';
        d3.innerHTML='<label class="pick" title="Includi o escludi questa stanza"><input type="checkbox" data-p="'+pi+'" data-r="'+ri+'" data-s="'+si+'" checked></label>'
          +'<span class="nm" data-k="'+escA(k2+'\u0001'+s.name)+'" title="Vai a questa stanza nell\'anteprima">'+esc(s.name)+' <span class="cnt">('+s.items.length+')</span></span>';
        sub2.appendChild(d3);
      });
    });
  });
  showTreeCol();
  setAllSubs(TREE_COLLAPSED); /* al cambio file mantiene lo stato scelto delle tendine */
  syncTree();
  /* clic sul nome (non sulla spunta): l'anteprima scorre alla prima pagina di
     quel piano / reparto / stanza e la evidenzia per un attimo */
  el.onclick=function(e){
    var nm=e.target.closest?e.target.closest('.nm'):null;
    if(!nm) return;
    if(!jumpToKey(nm.getAttribute('data-k'))){
      nm.style.transition='none'; nm.style.background='#ffe9e0';
      setTimeout(function(){ nm.style.transition=''; nm.style.background=''; },500);
    }
  };
  /* un clic su un contenitore vale per tutto quello che ha sotto: e' il senso
     di spuntare "PIANO 2". Da un parziale il clic porta tutto dentro (il
     browser passa da indeterminate a checked), il clic dopo porta tutto fuori.
     Verso l'alto non si propaga niente a mano: ci pensa syncTree, che ricava
     lo stato dei contenitori da quello delle stanze - un posto solo dove
     sapere la regola invece di tre rami di if che devono restare d'accordo */
  el.onchange=function(e){
    var t=e.target, q='input[data-p="'+t.dataset.p+'"]';
    if(t.dataset.r===undefined) q+='[data-r]';
    else if(t.dataset.s===undefined) q+='[data-r="'+t.dataset.r+'"][data-s]';
    else q='';
    if(q) el.querySelectorAll(q).forEach(function(x){ x.checked=t.checked; x.indeterminate=false; });
    syncTree();
    applyFilter();
  };
}
function applyFilter(){
  var el=document.getElementById('tree'), tree=[];
  FULL.tree.forEach(function(p,pi){
    var kids=[];
    p.kids.forEach(function(r,ri){
      var rcb=el.querySelector('input[data-p="'+pi+'"][data-r="'+ri+'"]:not([data-s])');
      if(rcb && !rcb.checked) return;
      var skids=r.kids.filter(function(s,si){
        var scb=el.querySelector('input[data-p="'+pi+'"][data-r="'+ri+'"][data-s="'+si+'"]');
        return !scb||scb.checked;
      });
      if(skids.length) kids.push({name:r.name,kids:skids});
    });
    if(kids.length) tree.push({name:p.name,kids:kids});
  });
  DATA={tree:tree}; render();
}

/* ============ INPUT ============ */
/* ---- da dove viene il titolo ----
   Tre sorgenti, in ordine di quanto sono attendibili:
     SITO    il sito del tracker a cui il lavoro e' collegato (ponte.js). E' il
             nome giusto per definizione: e' quello sotto cui il PDF verra'
             archiviato, e non dipende da come qualcuno ha battezzato l'Excel;
     FILE    il nome del file caricato, senza estensione;
     FOGLIO  la prima cella del foglio - il ripiego di sempre, che vale finche'
             non dice niente di utile.
   Le due spunte dicono da DOVE viene il testo del campo sopra, non accendono un
   comportamento della stampa: quando una e' accesa il campo e' in sola lettura
   col bordo tratteggiato, perche' un titolo che dichiara di venire dal sito e
   intanto e' stato riscritto a mano direbbe una bugia. Sono alternative fra
   loro; spegnendole torna quello che c'era scritto prima.
   La spunta del sito compare solo quando un sito c'e' davvero
   (`aggiornaTitoloSito`, chiamata dal ponte a ogni collegamento). */
/* `SHEET_TITLE` e' il titolo che il FILE porta con se' (la prima cella, quando
   dice qualcosa): serve al ripiego, e serve al ponte per riconoscere il sito
   senza farsi confondere da quello che il sito precedente ha scritto nel campo.
   `AUTO_TITLE` e' l'ultimo testo che ci ha messo l'applicazione: e' il modo per
   sapere se quello che c'e' scritto adesso l'ha scritto una persona. */
var LAST_FILE_BASE='', SHEET_TITLE='', MANUAL_TITLE='', SITE_TITLE='', AUTO_TITLE='';
var titoloDiRipiego=function(){ return SHEET_TITLE||LAST_FILE_BASE; };
function fileBaseName(n){ return String(n||'').replace(/\.[^.]+$/,''); }
function titleSource(){
  if(SITE_TITLE&&document.getElementById('titleFromSite').checked) return 'sito';
  if(document.getElementById('titleFromName').checked) return 'file';
  return '';
}
function applyTitleSource(fill){
  var src=titleSource(), on=!!src,
      auto=src==='sito'?SITE_TITLE:(src==='file'?LAST_FILE_BASE:''),
      t=document.getElementById('docTitle');
  t.readOnly=on;
  t.classList.toggle('locked',on);
  /* senza file il campo resta vuoto: il segnaposto dice perche', invece di
     lasciar credere che il titolo sia andato perso */
  t.placeholder=src==='sito'?'Si compila con il sito collegato'
    :src==='file'?'Si compila con il nome del file caricato'
    :'Titolo documento (es. PRO SERVICE)';
  if(!fill) return;
  /* quello che c'e' scritto si mette da parte solo se non ce l'abbiamo messo
     noi: cosi' passando da una sorgente all'altra non si scambia il testo
     automatico della precedente per una scelta di chi lavora */
  if(t.value&&t.value!==AUTO_TITLE) MANUAL_TITLE=t.value;
  /* spegnendo tutto si torna a quello scritto a mano, e se non c'e' al titolo
     del file. Senza il ripiego, staccando il sito resterebbe in copertina il
     nome del sito precedente su un documento che non e' piu' il suo. */
  t.value = on ? auto : (MANUAL_TITLE||titoloDiRipiego());
  AUTO_TITLE = on ? auto : '';
}
/* il ponte ha collegato (o staccato) un sito: '' lo toglie di mezzo */
function aggiornaTitoloSito(nome){
  SITE_TITLE=String(nome||'').trim();
  document.getElementById('titleFromSiteRow').hidden=!SITE_TITLE;
  applyTitleSource(true);
  render();
}
document.getElementById('titleFromSite').onchange=function(){
  if(this.checked) document.getElementById('titleFromName').checked=false;
  applyTitleSource(true); render();
};
document.getElementById('titleFromName').onchange=function(){
  if(this.checked) document.getElementById('titleFromSite').checked=false;
  applyTitleSource(true); render();
};
/* leggere il file e caricare il modello sono due cose diverse: le righe possono
   arrivare da un .xls scelto dall'utente (readFile) o da dentro l'app (le righe
   d'esempio del tutorial). Da qui in giu' non conta piu' da dove vengono.
   `label` e' la prima riga del riquadro sotto il trascinamento: di regola il
   nome del file, per l'esempio della guida una dichiarazione che esempio e'. */
function loadRows(rows,name,label){
  var m=buildModel(rows);
  if(!m.items.length){ alert('Nessuna riga riconosciuta.\nControlla che le righe contengano "PIANO:", "REPARTO:", "STANZA:", "POSIZIONE:".'); return false; }
  FULL=m;
  document.getElementById('fileinfo').innerHTML=(label||('<b>'+esc(name)+'</b>'))+'<br>'+m.items.length+' componenti riconosciuti · '
    /* il contatore apre l'elenco completo delle note: e' il modo piu' diretto
       per passare dal riepilogo alla singola scheda */
    +(m.withNotes
      ? '<span class="jump" onclick="showNotes()" title="Clicca per vedere l\'elenco delle note operatore">'+m.withNotes+' con note operatore</span>'
      : '0 con note operatore')
    /* senza colonna note riconosciuta nessuna scheda puo' avere note: e' bene
       dirlo, altrimenti sembra che il file non ne contenga */
    /* da quale colonna del foglio sono state lette le note: due tracciati
       diversi la mettono in B o in C, saperlo evita di dover indovinare */
    +(m.noteCol===null
      ? '<br><span style="color:#a05a00">nessuna colonna note riconosciuta nel file</span>'
      : ' <span style="color:#8a939c">(colonna '+String.fromCharCode(65+m.noteCol)+')</span>')
    +(m.skipped?'<br><span style="color:#a05a00;cursor:pointer;text-decoration:underline" onclick="showSkippedRows()" title="Clicca per vedere le righe ignorate">'+m.skipped+' righe ignorate (senza campi PIANO/STANZA)</span>':'');
  /* titolo e cantiere si riferiscono al file appena caricato: vanno riscritti da
     zero, altrimenti il file B esce con l'intestazione del file A */
  var first=(rows[0]||[]).map(norm).filter(Boolean)[0]||'';
  LAST_FILE_BASE=fileBaseName(name);
  SHEET_TITLE=(first&&!/PIANO\s*:/i.test(first))?first:'';
  window.SHEET_TITLE=SHEET_TITLE;          // lo legge ponte.js per riconoscere il sito
  MANUAL_TITLE='';
  document.getElementById('docTitle').value=titoloDiRipiego();
  AUTO_TITLE=document.getElementById('docTitle').value;
  applyTitleSource(true);
  document.getElementById('docSub').value='';
  document.getElementById('dropFile').hidden=false;
  buildTree(); applyFilter();
  return true;
}
function readFile(f){
  /* un file vero prende il posto dell'esempio della guida: da qui in poi la
     fine del tutorial non deve piu' portarsi via niente */
  TOUR_DEMO=false;
  var fr=new FileReader();
  fr.onload=function(){
    var rows=[];
    try{
      var wb=XLSX.read(new Uint8Array(fr.result),{type:'array'});
      wb.SheetNames.forEach(function(n){
        rows=rows.concat(XLSX.utils.sheet_to_json(wb.Sheets[n],{header:1,raw:false,defval:''}));
      });
    }catch(err){ alert('Impossibile leggere il file: '+err.message); return; }
    loadRows(rows,f.name);
  };
  fr.readAsArrayBuffer(f);
}
/* togliere il file: la schermata torna quella dell'apertura. Non e' solo
   FULL=null - vanno rimessi a posto anche l'albero, la sua colonna, i campi
   dell'intestazione e il nome da cui il titolo si autocompila, altrimenti il
   file successivo eredita pezzi di quello di prima. Lo usa anche la guida
   quando si porta via il suo esempio. */
function unloadFile(){
  FULL=null; DATA=null;
  document.getElementById('fileinfo').innerHTML='';
  document.getElementById('dropFile').hidden=true;
  document.getElementById('tree').innerHTML='';
  document.getElementById('treecol').hidden=true;
  document.getElementById('treegrip').hidden=true;
  document.getElementById('selAll').checked=true;
  LAST_FILE_BASE=''; SHEET_TITLE=''; MANUAL_TITLE=''; AUTO_TITLE='';
  window.SHEET_TITLE='';
  document.getElementById('docTitle').value='';
  document.getElementById('docSub').value='';
  applyTitleSource(true);
  /* lo stesso file scelto due volte di seguito deve poter rientrare: senza
     azzerare il valore, il campo non emette il cambiamento */
  document.getElementById('file').value='';
  render();
}
document.getElementById('dropFile').onclick=function(){ TOUR_DEMO=false; unloadFile(); };

var drop=document.getElementById('drop'), fi=document.getElementById('file');
drop.onclick=function(){fi.click();};
fi.onchange=function(){ if(fi.files[0]) readFile(fi.files[0]); };
['dragenter','dragover'].forEach(function(e){document.addEventListener(e,function(ev){ev.preventDefault();drop.classList.add('hot');});});
['dragleave','drop'].forEach(function(e){document.addEventListener(e,function(ev){
  ev.preventDefault();
  drop.classList.remove('hot');
  if(e==='drop'){ var f=ev.dataTransfer.files[0]; if(f) readFile(f); }
});});
/* ---- l'invito della schermata iniziale ----
   Prima qui c'era la spiegazione del formato delle righe: serviva la prima
   volta e diventava arredamento tutte le altre. Adesso ci sono le due cose che
   si possono fare - caricare un file o farsi accompagnare dalla guida - e una
   frase che gira, cosi' l'occhio la rilegge invece di saltarla. Le frasi
   dicono la stessa cosa: non sono un notiziario. */
var HOOKS=[
  "Carica un file, o avvia il tutorial.",
  "Trascina qui l'export del gestionale. Oppure fatti accompagnare dalla guida.",
  "Da mappatura Excel a fogli A4 da riempire a penna: comincia da un file, o dal tutorial.",
  "Un file per stampare le schede vere, il tutorial per vedere come funziona."
];
var HOOK_I=0, HOOK_TIMER=null;
function hookText(){
  var h=document.getElementById('emptyHook');
  if(h) h.textContent=HOOKS[HOOK_I%HOOKS.length];
}
function hookTick(){
  var h=document.getElementById('emptyHook'), es=document.getElementById('empty-state');
  /* con le pagine in anteprima la schermata iniziale non c'e': girare a vuoto
     terrebbe sveglio il browser per niente */
  if(!h||!es||es.style.display==='none') return;
  h.classList.add('fade');
  setTimeout(function(){ HOOK_I++; hookText(); h.classList.remove('fade'); },500);
}
(function(){
  hookText();
  var still=window.matchMedia&&window.matchMedia('(prefers-reduced-motion:reduce)').matches;
  if(!still) HOOK_TIMER=setInterval(hookTick,7000);
})();
/* il pulsante del tutorial dice se e' la prima volta o un ripasso */
function syncTutorialBtn(){
  var b=document.getElementById('startTutorial'), seen=null;
  try{ seen=localStorage.getItem(TOUR_KEY); }catch(e){}
  b.textContent=seen?'Rivedi il tutorial':'Avvia il tutorial';
}
document.getElementById('pickFile').onclick=function(){ document.getElementById('file').click(); };
document.getElementById('startTutorial').onclick=function(){ startTour(); };

/* ============ ASPETTO: GIORNO E NOTTE ============ */
/* Tre scelte, non due: "segui il sistema" e' quella di partenza, perche' chi
   apre il generatore alle sette di sera e alle sette di mattina non vuole
   ricordarsi di cambiarlo. L'attributo data-theme dice quale delle tre e'
   scelta (serve all'indicatore del comando segmentato); la classe .lt dice
   quale tavolozza e' accesa davvero, ed e' quella che il CSS guarda.
   Il tema sta nelle impostazioni salvate come tutto il resto, e vive nella
   memoria del browser: la stampa non lo vede, il foglio A4 e' bianco sempre. */
var THEME='auto';
var SYS_LIGHT=(window.matchMedia?window.matchMedia('(prefers-color-scheme:light)'):null);
function setTheme(t,save,dolce){
  THEME=(['auto','light','dark'].indexOf(t)>=0)?t:'auto';
  var light=(THEME==='light')||(THEME==='auto'&&!!(SYS_LIGHT&&SYS_LIGHT.matches));
  var r=document.documentElement;
  var applica=function(){
    r.setAttribute('data-theme',THEME);
    r.classList.toggle('lt',light);
    /* i fogli condivisi (css/theme.css, css/banco.css) leggono data-tema: qui e' sempre esplicito */
    r.setAttribute('data-tema',light?'chiaro':'scuro');
  };
  /* scelto a mano o arrivato da un'altra scheda: sfuma (View Transitions) invece di scattare */
  if(dolce&&document.startViewTransition&&!(window.matchMedia&&matchMedia('(prefers-reduced-motion:reduce)').matches)) document.startViewTransition(applica);
  else applica();
  Array.prototype.forEach.call(document.querySelectorAll('#themeSeg button'),function(b){
    b.setAttribute('aria-pressed',b.getAttribute('data-theme')===THEME?'true':'false');
  });
  /* la chiave e' quella del tracker (#ANCHOR: tema-unico in js/app.js): 'chiaro',
     'scuro', vuoto = segui il sistema. Un tema solo per le tre pagine */
  if(save){ try{ localStorage.setItem('cs.tema',THEME==='auto'?'':THEME==='dark'?'scuro':'chiaro'); }catch(e){} }
}
function temaDaChiave(){
  var t=null;
  try{ t=localStorage.getItem('cs.tema'); }catch(e){}
  return t==='scuro'?'dark':t==='chiaro'?'light':'auto';
}
document.getElementById('themeSeg').onclick=function(e){
  var b=e.target.closest?e.target.closest('button[data-theme]'):null;
  if(b) setTheme(b.getAttribute('data-theme'),true,true);
};
/* col tema su "segui il sistema", il passaggio giorno/notte del computer
   arriva mentre l'app e' aperta */
if(SYS_LIGHT){
  var onSys=function(){ if(THEME==='auto') setTheme('auto',false); };
  if(SYS_LIGHT.addEventListener) SYS_LIGHT.addEventListener('change',onSys);
  else if(SYS_LIGHT.addListener) SYS_LIGHT.addListener(onSys);
}
/* il tema si applica prima di tutto il resto: nessun lampo di scuro all'apertura.
   Poi si resta in ascolto: cambiato nel tracker o nell'altro generatore, si
   cambia anche qui, senza ricaricare */
setTheme(temaDaChiave(),false);
window.addEventListener('storage',function(e){ if(e.key==='cs.tema') setTheme(temaDaChiave(),false,true); });

/* ============ IMPOSTAZIONI PREDEFINITE (salvate nel browser) ============ */
var LS_KEY='vrsSchedeCampo.defaults.v2';
var FACTORY_DEFAULTS={dens:'5',titleFromName:false,titleFromSite:true,fillGap:true,newRep:true,newRoom:true,roomBlankPage:true,
  coverPage:true,tocPage:true,bookMode:true,splitParts:false,splitEvery:'1',
  extraAtEnd:false,extraAtEndN:'1',extraPerPart:false,extraPerPartN:'1',extraWhole:false,extraWholeN:'4'};
/* il tema NON sta fra le predefinite di fabbrica, di proposito: vive nella sua
   chiave (vrsSchedeCampo.theme) ed e' l'unica impostazione che non riguarda il
   foglio stampato. Se stesse qui, aprire il generatore senza predefinite
   salvate - o premere "ripristina impostazioni di fabbrica" - rimetterebbe
   l'aspetto su "segui il sistema" cancellando la scelta di chi lavora al buio.
   readSettings lo scrive comunque nel file esportato, e applySettings lo
   applica solo se il file che arriva ne porta uno. */
/* le spunte a valore booleano e i loro contatori: elencarle una volta evita che
   aggiungerne una richieda di ricordarsi di quattro punti diversi */
var BOOL_KEYS=['titleFromName','titleFromSite','fillGap','newRep','newRoom','roomBlankPage','coverPage','tocPage','bookMode','splitParts',
  'extraAtEnd','extraPerPart','extraWhole'];
var NUM_KEYS=[['extraAtEndN',1,50],['extraPerPartN',1,50],['extraWholeN',1,50]];
/* quanti piani per fascicolo: e' un comando segmentato, non un campo, quindi
   ha le sue due funzioni invece di .value - ma nel file delle impostazioni e'
   un numero come gli altri */
function readSettings(){
  return {
    dens:document.getElementById('dens').value,
    titleFromName:document.getElementById('titleFromName').checked,
    titleFromSite:document.getElementById('titleFromSite').checked,
    fillGap:document.getElementById('fillGap').checked,
    newRep:document.getElementById('newRep').checked,
    newRoom:document.getElementById('newRoom').checked,
    roomBlankPage:document.getElementById('roomBlankPage').checked,
    coverPage:document.getElementById('coverPage').checked,
    tocPage:document.getElementById('tocPage').checked,
    bookMode:document.getElementById('bookMode').checked,
    splitParts:document.getElementById('splitParts').checked,
    splitEvery:String(getSplitEvery()),
    extraAtEnd:document.getElementById('extraAtEnd').checked,
    extraAtEndN:document.getElementById('extraAtEndN').value,
    extraPerPart:document.getElementById('extraPerPart').checked,
    extraPerPartN:document.getElementById('extraPerPartN').value,
    extraWhole:document.getElementById('extraWhole').checked,
    extraWholeN:document.getElementById('extraWholeN').value,
    theme:THEME
  };
}
function applySettings(s){
  document.getElementById('dens').value=s.dens;
  document.getElementById('titleFromName').checked=!!s.titleFromName;
  document.getElementById('titleFromSite').checked=!!s.titleFromSite;
  applyTitleSource(true);
  document.getElementById('fillGap').checked=s.fillGap;
  document.getElementById('newRep').checked=s.newRep;
  document.getElementById('newRoom').checked=s.newRoom;
  document.getElementById('roomBlankPage').checked=s.roomBlankPage;
  document.getElementById('coverPage').checked=s.coverPage;
  document.getElementById('tocPage').checked=s.tocPage;
  document.getElementById('bookMode').checked=s.bookMode;
  document.getElementById('splitParts').checked=s.splitParts;
  setSplitEvery(parseInt(s.splitEvery,10)||1,false);
  document.getElementById('extraAtEnd').checked=s.extraAtEnd;
  document.getElementById('extraAtEndN').value=s.extraAtEndN;
  document.getElementById('extraPerPart').checked=s.extraPerPart;
  document.getElementById('extraPerPartN').value=s.extraPerPartN;
  document.getElementById('extraWhole').checked=s.extraWhole;
  document.getElementById('extraWholeN').value=s.extraWholeN;
  if(s.theme) setTheme(s.theme,true);
}
/* titolo e cantiere sono legati al documento caricato, non alle impostazioni
   predefinite: non vengono ne' salvati ne' ripristinati insieme ad esse */
function loadSavedDefaults(){
  try{
    var raw=localStorage.getItem(LS_KEY);
    if(!raw) return null;
    var obj=JSON.parse(raw)||{};
    var src=(obj.settings&&typeof obj.settings==='object')?obj.settings:obj;
    return {settings:sanitizeSettings(src)};
  }catch(e){ return null; }
}
var SAVED=loadSavedDefaults();
var DEFAULTS=(SAVED&&SAVED.settings)||Object.assign({},FACTORY_DEFAULTS);
applySettings(DEFAULTS); /* all'apertura del file, parte già dalle predefinite salvate */

function flashIco(btn){
  btn.className='ico ok';
  setTimeout(function(){ btn.className='ico'; },1500);
}
/* scarica il file con le impostazioni correnti */
function downloadSettings(){
  var payload={app:'vrsSchedeCampo',version:1,exportedAt:new Date().toISOString(),
    settings:readSettings()};
  var url=URL.createObjectURL(new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}));
  var a=document.createElement('a');
  a.href=url;
  a.download='impostazioni-schede-campo.json';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(function(){ URL.revokeObjectURL(url); },3000);
}
/* salvare le predefinite lascia sempre anche una copia su file */
document.getElementById('saveDefaults').onclick=function(){
  DEFAULTS=readSettings();
  try{ localStorage.setItem(LS_KEY,JSON.stringify({settings:DEFAULTS})); }
  catch(e){ alert('Impossibile salvare le impostazioni in questo browser (memoria locale non disponibile): viene comunque scaricata la copia su file.'); }
  downloadSettings();
  flashIco(this);
};
document.getElementById('reset').onclick=function(){
  applySettings(DEFAULTS);
  render();
};
document.getElementById('clearDefaults').onclick=function(e){
  e.preventDefault();
  try{ localStorage.removeItem(LS_KEY); }catch(e2){}
  DEFAULTS=Object.assign({},FACTORY_DEFAULTS);
  applySettings(DEFAULTS);
  render();
};
['dens','fillGap','newRep','newRoom','roomBlankPage','coverPage','tocPage','bookMode','splitParts',
 'extraAtEnd','extraAtEndN','extraPerPart','extraPerPartN','extraWhole','extraWholeN',
 'docTitle','docSub'].forEach(function(id){
  var el=document.getElementById(id);
  var live=el.tagName==='INPUT'&&(el.type==='text'||el.type==='number');
  el.addEventListener(live?'input':'change',function(){ render(); });
});
/* ---- esporta / importa impostazioni come file .json ---- */
function sanitizeSettings(o){
  o=o||{};
  var f=FACTORY_DEFAULTS, out={};
  out.dens=(['4','5','6','8','10','12'].indexOf(String(o.dens))>=0)?String(o.dens):f.dens;
  var ev=parseInt(o.splitEvery,10);
  out.splitEvery=String((ev>=1&&ev<=5)?ev:1);
  BOOL_KEYS.forEach(function(k){ out[k]=(typeof o[k]==='boolean')?o[k]:f[k]; });
  NUM_KEYS.forEach(function(t){
    var v=parseInt(o[t[0]],10);
    out[t[0]]=String(isNaN(v)?f[t[0]]:Math.max(t[1],Math.min(t[2],v)));
  });
  /* solo se il file o le predefinite salvate ne portano uno: assente vuol dire
     "lascia l'aspetto come lo trovi", non "torna a segui il sistema" */
  if(o.theme!==undefined&&o.theme!==null)
    out.theme=(['auto','light','dark'].indexOf(String(o.theme))>=0)?String(o.theme):'auto';
  /* impostazioni salvate con la vecchia voce unica "pagine extra a fine
     documento": quella diceva la stessa cosa che dice oggi la prima spunta */
  if(typeof o.extraBlank==='boolean'&&!('extraAtEnd' in o)){
    var ov=parseInt(o.extraBlankN,10)||0;
    out.extraAtEnd=o.extraBlank&&ov>0;
    out.extraAtEndN=String(Math.max(1,Math.min(50,ov||1)));
  }
  return out;
}
var setFile=document.getElementById('settingsFile');
document.getElementById('impSettings').onclick=function(){ setFile.value=''; setFile.click(); };
setFile.onchange=function(){
  var f=setFile.files[0]; if(!f) return;
  var btn=document.getElementById('impSettings');
  var fr=new FileReader();
  fr.onload=function(){
    var obj;
    try{ obj=JSON.parse(String(fr.result)); }
    catch(e){ alert('File non valido: non contiene impostazioni leggibili.'); return; }
    var src=(obj&&typeof obj==='object'&&obj.settings&&typeof obj.settings==='object')?obj.settings:obj;
    if(!src||typeof src!=='object'){ alert('File non valido: impostazioni non trovate.'); return; }
    applySettings(sanitizeSettings(src));
    render();
    flashIco(btn);
  };
  fr.readAsText(f);
};

/* ---- selezione e tendine della colonna albero (punto 4) ---- */
document.getElementById('selAll').onchange=function(){ setAllChecks(this.checked); };
document.getElementById('collAll').onclick=function(){ setAllSubs(!TREE_COLLAPSED); };
setAllSubs(false); /* mette l'icona giusta nel tastino */

/* stampare una parte sola: le pagine delle altre parti vengono nascoste solo
   per la durata della stampa. L'ultima pagina rimasta visibile non deve portare
   il salto pagina, altrimenti esce un foglio bianco in fondo */
/* Il bottone #print lo prende in mano ponte.js (Esporta e salva: PDF con jsPDF,
   scaricato e consegnato al tracker). Questa e' la stampa del browser: resta
   per Ctrl+P e come ripiego se il ponte non parte. */
function stampaBrowser(){
  var k=document.getElementById('printPart').value;
  var pgs=Array.prototype.slice.call(document.querySelectorAll('#pages .page'));
  var keep=pgs;
  if(k){
    keep=[];
    pgs.forEach(function(p){
      if(p.getAttribute('data-part')===k) keep.push(p); else p.classList.add('nopr');
    });
  }
  if(keep.length) keep[keep.length-1].classList.add('lastpr');
  window.print();
  pgs.forEach(function(p){ p.classList.remove('nopr'); p.classList.remove('lastpr'); });
}
window.stampaBrowser=stampaBrowser;
document.getElementById('print').onclick=stampaBrowser;
document.addEventListener('keydown',function(e){
  if((e.ctrlKey||e.metaKey)&&!e.shiftKey&&!e.altKey&&e.key.toLowerCase()==='p'
     &&document.querySelectorAll('#pages .page').length){ e.preventDefault(); stampaBrowser(); }
});

/* ---- zoom anteprima: passi fissi dal 40% al 200% ----
   la scala e' una trasformazione (non tocca il layout, quindi non falsa le
   misure delle pagine): perche' compaiano le barre di scorrimento giuste
   l'involucro viene portato alle dimensioni della pagina scalata. */
var ZL=[0.4,0.5,0.6,0.7,0.8,0.9,1,1.1,1.25,1.5,1.75,2], zi=6;
function applyZoom(){
  var p=document.getElementById('pages'), w=document.getElementById('zoomwrap');
  p.style.transform=(ZOOM===1)?'none':'scale('+ZOOM+')';
  var bh=p.offsetHeight, bw=p.offsetWidth;
  /* senza pagine l'involucro non deve occupare spazio, altrimenti compare una
     barra di scorrimento orizzontale sulla schermata iniziale */
  w.style.width=bh?Math.ceil(bw*ZOOM)+'px':'';
  w.style.height=bh?Math.ceil(bh*ZOOM)+'px':'';
  document.getElementById('zoomVal').textContent='Zoom '+Math.round(ZOOM*100)+'%';
  document.getElementById('zoomOut').disabled=(zi<=0);
  document.getElementById('zoomIn').disabled=(zi>=ZL.length-1);
  updateActivePart(); /* lo zoom sposta le pagine sotto il bordo di riferimento */
  positionPartStrip(); /* ...e cambia il margine libero in cui sta lo scaffale */
  positionDocScroll();  /* la barra vive nel margine opposto, stessa storia */
  updateDocScroll();    /* con la scala cambia quanto range c'e' da scorrere */
}
function setZoom(i){ zi=Math.max(0,Math.min(ZL.length-1,i)); ZOOM=ZL[zi]; applyZoom(); }
document.getElementById('zoomOut').onclick=function(){ setZoom(zi-1); };
document.getElementById('zoomIn').onclick=function(){ setZoom(zi+1); };
document.getElementById('zoomVal').onclick=function(){ setZoom(ZL.indexOf(1)); };

/* ---- larghezza delle colonne laterali, regolabile e ricordata ----
   le due maniglie fanno la stessa cosa; cambia solo il verso della misura,
   perche' il pannello si allarga verso destra e la colonna dell'albero verso
   sinistra (il suo bordo destro e' fermo sul bordo dello schermo). */
function makeColGrip(o){
  var grip=document.getElementById(o.grip), col=document.getElementById(o.col),
      root=document.documentElement, drag=false;
  function clamp(w){
    var vw=window.innerWidth||document.documentElement.clientWidth||1200;
    return Math.max(o.min,Math.min(Math.max(o.maxMin,Math.round(vw*o.maxFrac)),Math.round(w)));
  }
  function set(w,save){
    root.style.setProperty(o.varName,clamp(w)+'px');
    if(save){ try{ localStorage.setItem(o.key,String(clamp(w))); }catch(e){} }
  }
  try{ var w0=parseInt(localStorage.getItem(o.key),10); if(w0) set(w0,false); }catch(e){}
  grip.addEventListener('mousedown',function(e){
    drag=true; grip.classList.add('drag'); document.body.classList.add('resizing'); e.preventDefault();
  });
  document.addEventListener('mousemove',function(e){
    if(!drag) return;
    var r=col.getBoundingClientRect();
    set(o.fromRight?(r.right-e.clientX):(e.clientX-r.left),false);
  });
  document.addEventListener('mouseup',function(){
    if(!drag) return;
    drag=false; grip.classList.remove('drag'); document.body.classList.remove('resizing');
    set(parseInt(getComputedStyle(root).getPropertyValue(o.varName),10)||o.def,true);
    applyZoom();
  });
  grip.addEventListener('dblclick',function(){
    root.style.setProperty(o.varName,o.def+'px');
    try{ localStorage.removeItem(o.key); }catch(e){}
    applyZoom();
  });
}
makeColGrip({grip:'sidegrip',col:'side',varName:'--sidew',key:'vrsSchedeCampo.sidew',
  min:300,maxMin:420,maxFrac:.72,def:392});
makeColGrip({grip:'treegrip',col:'treecol',varName:'--treew',key:'vrsSchedeCampo.treew',
  min:230,maxMin:360,maxFrac:.5,def:320,fromRight:true});

/* ============ TUTORIAL GUIDATO ============ */
/* Una guida che si appoggia ai comandi veri: a ogni passo il bersaglio resta
   illuminato, tutto il resto va in penombra e il fumetto si mette dove c'e'
   posto. Niente elenco di istruzioni da leggere altrove: chi impara qui sta
   guardando l'app che usera'.
   Tre regole che tengono in piedi la cosa:
     - i passi indicano gli elementi per selettore, non per posizione: se un
       comando si sposta nel pannello la guida lo segue da sola;
     - un bersaglio che non c'e' (la colonna dell'albero, la mappa e lo
       scaffale compaiono solo a file caricato) non salta il passo: il fumetto
       si mette al centro e la nota dice quando quella parte comparira'. Alla
       prima apertura non c'e' nessun file, ed e' proprio allora che la guida
       parte da sola: saltare quei passi vorrebbe dire non spiegarli mai;
     - le posizioni si ricalcolano a ogni scorrimento e a ogni ridimensionamento
       (il pannello ha la sua barra di scorrimento, le maniglie muovono le
       colonne), quindi il buco non resta mai indietro rispetto al bersaglio. */
/* ---- l'esempio della guida ----
   Senza un file caricato il punto 4 non si capisce: la colonna dell'albero non
   c'e', l'anteprima e' vuota e la spiegazione parla di cose che non si vedono.
   Ed e' proprio senza file che la guida parte da sola, la prima volta.
   Quindi la guida si porta il suo campione: quindici componenti su due piani,
   tre reparti, sei stanze e tre note, nel tracciato a tre colonne (etichetta
   in B, nota in C) che e' quello che arriva piu' spesso. Passa dallo stesso
   `loadRows` di un file vero - nessuna strada di servizio, quindi quello che
   si vede nella guida e' esattamente quello che fa l'app.
   Si accende solo se non c'e' niente di caricato e si spegne alla fine, insieme
   alla divisione in fascicoli che accende per poter mostrare lo scaffale. */
var TOUR_DEMO=false, TOUR_DEMO_SPLIT=null;
var TOUR_DEMO_LABEL='<b>Esempio della guida</b>'
  +' <span style="color:var(--ui-tx3)">\u2014 non \u00e8 un tuo file: si toglie da s\u00e9 quando la guida finisce</span>';
var TOUR_DEMO_ROWS=(function(){
  /* prima riga: diventa il titolo del documento (non contiene PIANO:).
     seconda riga: "Tipo di dato" marca la colonna del valore, la C. */
  var rows=[['ESEMPIO PER LA GUIDA','',''],['','Propriet\u00e0','Tipo di dato']];
  function add(cod,desc,piano,rep,stanza,pos,nota){
    rows.push([cod+' - '+desc+' PIANO: '+piano+' ; REPARTO: '+rep+' ; STANZA: '+stanza
      +' ; POSIZIONE: '+pos+' ;','NOTE OPERATORE',nota||'']);
  }
  add('118220','PRESA UNI 9507 O2','0','PRONTO SOCCORSO','BOX 1','01','Ghiera dura, da revisionare');
  add('118222','PRESA UNI 9507 ARIA MEDICALE','0','PRONTO SOCCORSO','BOX 1','02');
  add('119004','PRESA VUOTO UNI 9507','0','PRONTO SOCCORSO','BOX 1','03');
  add('118220','PRESA UNI 9507 O2','0','PRONTO SOCCORSO','BOX 2','01');
  add('119004','PRESA VUOTO UNI 9507','0','PRONTO SOCCORSO','BOX 2','02');
  add('115961','FILTRO NEA 172 HP PER O2','0','CENTRALE GAS','LOCALE TECNICO','01','Manometro appannato, da sostituire');
  add('120433','RIDUTTORE 2\u00b0 STADIO O2','0','CENTRALE GAS','LOCALE TECNICO','02');
  add('131002','VALVOLA DI ZONA O2 DN20','0','CENTRALE GAS','LOCALE TECNICO','03');
  add('118220','PRESA UNI 9507 O2','1','DEGENZE','104','01');
  add('119004','PRESA VUOTO UNI 9507','1','DEGENZE','104','02');
  add('130455','ALLARME DI REPARTO 4 GAS','1','DEGENZE','104','03','Spia ARIA sempre accesa');
  add('118220','PRESA UNI 9507 O2','1','DEGENZE','105','01');
  add('118221','PRESA UNI 9507 N2O','1','DEGENZE','105','02');
  add('131002','VALVOLA DI ZONA O2 DN20','1','DEGENZE','CORRIDOIO','01');
  add('130455','ALLARME DI REPARTO 4 GAS','1','DEGENZE','CORRIDOIO','02');
  return rows;
})();
function tourDemoOn(){
  /* con un file vero caricato la guida non lo tocca: si spiega su quello, che
     e' meglio di qualunque esempio. Ma se i fascicoli sono spenti lo scaffale
     del passo 14 non avrebbe nulla da mostrare nemmeno sul file vero, quindi
     l'accensione al volo (e il ripristino a fine guida, in tourDemoOff) vale
     anche qui */
  if(FULL&&FULL.items&&FULL.items.length){
    var sp=document.getElementById('splitParts');
    if(!sp.checked){
      TOUR_DEMO_SPLIT=false;
      sp.checked=true;
      render();
    }
    return;
  }
  TOUR_DEMO_SPLIT=document.getElementById('splitParts').checked;
  document.getElementById('splitParts').checked=true; /* per far vedere lo scaffale */
  TOUR_DEMO=loadRows(TOUR_DEMO_ROWS,'esempio-guida.xls',TOUR_DEMO_LABEL);
  if(!TOUR_DEMO&&TOUR_DEMO_SPLIT!==null){
    document.getElementById('splitParts').checked=TOUR_DEMO_SPLIT;
    TOUR_DEMO_SPLIT=null;
  }
}
function tourDemoOff(){
  if(TOUR_DEMO_SPLIT!==null){
    document.getElementById('splitParts').checked=TOUR_DEMO_SPLIT;
    TOUR_DEMO_SPLIT=null;
  }
  if(!TOUR_DEMO){ render(); return; } /* file vero: resta tutto dov'e' */
  TOUR_DEMO=false;
  unloadFile(); /* la stessa strada del pulsante "togli il file" */
}
var TOUR_KEY='vrsSchedeCampo.tourSeen';
/* sel: il bersaglio. Un elenco vuol dire "il primo che si vede davvero"
   (l'anteprima e' #zoomwrap a file caricato, la schermata iniziale altrimenti).
   place: da che lato provare a mettere il fumetto; off: la nota da mostrare
   quando il bersaglio non c'e'. */
var TOUR_STEPS=[
  {sel:null,title:"Benvenuto: cosa fa questa pagina",
   /* TXT-14: i primi tre passi erano tre paragrafi piu' una nota lunga ciascuno;
      qui restano due frasi e una nota breve (Avanti ed Esc si vedono da soli) */
   tx:"<p>Trasforma l'export del gestionale in <b>fogli A4 da stampare</b>, su cui il tecnico scrive a mano in cantiere.</p>"
     +"<p>Tutto resta sul tuo computer: <b>nessun dato esce dal browser</b>.</p>",
   note:"Senza un tuo file la guida carica un <b>esempio</b> e accende i fascicoli per mostrarli; alla fine toglie tutto e le impostazioni tornano come le hai lasciate."},

  {sel:'#fileGrp',title:"1 \u00b7 Il file da leggere",place:'right',
   tx:"<p>Trascina qui l'export (<b>.xls .xlsx .csv</b>) o clicca il riquadro per sceglierlo.</p>"
     +"<p>Sotto compaiono <b>componenti</b>, <b>note operatore</b> e <b>righe ignorate</b>: un clic su note e righe ignorate apre l'elenco.</p>",
   note:"Ogni riga valida porta <b>PIANO:</b>, <b>REPARTO:</b> e <b>STANZA:</b>; quelle senza PIANO finiscono fra le ignorate. Adesso qui c'\u00e8 l'esempio della guida."},

  {sel:'#headGrp',title:"2 \u00b7 Intestazione del documento",place:'right',
   tx:"<p><b>Titolo</b> e <b>cantiere</b> vanno sulla copertina e in testa a ogni pagina.</p>"
     +"<p>Il titolo viene dalla prima cella del foglio, oppure dal nome del file con la spunta <b>Prendi il titolo dal nome del file</b>.</p>",
   note:"Valgono solo per questo documento: non finiscono fra le impostazioni predefinite."},

  {sel:'#optDens',title:"Quante schede in una pagina",place:'right',
   tx:"<p>Da <b>4</b> schede per foglio (massima leggibilit\u00e0) a <b>12</b>. Da 8 in su la scheda diventa compatta: al posto dei due riquadri delle note resta una casella <b>VERIFICA SERVICE</b>.</p>"
     +"<p><b>Riempi lo spazio residuo</b> completa la pagina con schede vuote invece di lasciarla a met\u00e0.</p>"},

  {sel:'#optFloors',title:"Dove cominciano i fogli nuovi",place:'right',
   tx:"<p>Un foglio nuovo a ogni <b>reparto</b> e a ogni <b>stanza</b>: le schede di due stanze diverse non si mescolano sullo stesso foglio, cos\u00ec chi lavora in una stanza ha davanti solo quella.</p>"
     +"<p>La <b>pagina finale di sole schede vuote per stanza</b> serve a chi trova in cantiere componenti che nella mappatura non c'erano.</p>"},

  {sel:'#optFront',title:"Copertina e indice",place:'right',
   tx:"<p>La <b>copertina</b> porta titolo, cantiere e data. L'<b>indice</b> elenca piani, reparti e stanze con il numero di pagina.</p>"
     +"<p>L'indice sta in una pagina, due al massimo, e segue i filtri: se escludi un piano, sparisce anche dall'indice.</p>"},

  {sel:'#optBind',title:"Rilegatura: libro e fascicoli",place:'right',
   tx:"<p><b>Modalit\u00e0 libro</b> prepara la stampa fronte-retro su fogli piegati: le pagine diventano un multiplo di 4, pareggiate con pagine di schede vuote da compilare.</p>"
     +"<p><b>Dividi la stampa in fascicoli</b> taglia il documento dove comincia un piano nuovo \u2014 nessun piano finisce a cavallo fra due fascicoli \u2014 e <b>\u00d71\u2026\u00d75</b> dice quanti piani in ognuno. Ogni fascicolo ha la sua copertina e il suo indice, che parlano solo di quello che contiene.</p>"},

  {sel:'#extraOpts',title:"Pagine extra vuote",place:'right',
   tx:"<p>Pagine intere di schede vuote, con piano, reparto, stanza e posizione da scrivere a penna: in fondo al documento, in fondo a ogni fascicolo, o come fascicolo a s\u00e9.</p>"
     +"<p>Si stampano <b>anche senza aver caricato nessun file</b>: servono a chi va in cantiere a mappare da zero.</p>"},

  {sel:'#setIcons',title:"Salvare le impostazioni",place:'right',
   tx:"<p>Le tre icone, in ordine: <b>salva</b> le impostazioni come predefinite in questo browser (e ne scarica una copia in un file <b>.json</b>), <b>importa</b> quelle di un file, <b>ripristina</b> le predefinite salvate.</p>"
     +"<p>Il collegamento qui sotto torna alle impostazioni <b>di fabbrica</b>.</p>",
   note:"L'aspetto giorno/notte e questa guida hanno una memoria propria: il ripristino delle impostazioni non li tocca."},

  {sel:'#exportGrp',title:"Esportare e salvare",place:'right',
   tx:"<p><b>Esporta e salva</b> produce il PDF, lo <b>scarica</b> sul computer e lo <b>salva nel tracker</b> sul sito collegato, mettendo la spunta \u201cstampata\u201d. Nessuna finestra di stampa in mezzo; per la carta diretta c'\u00e8 sempre <b>Ctrl+P</b>.</p>"
     +"<p>A stampa divisa, la tendina <b>Esporta</b> produce un fascicolo solo. Sotto ci sono lo <b>zoom</b> dell'anteprima e il riepilogo di pagine, schede e pagine bianche.</p>"},

  {sel:'#sidegrip',title:"Le colonne si allargano",place:'right',pad:4,
   tx:"<p>Trascina questa maniglia per allargare o stringere il pannello; il <b>doppio clic</b> torna alla misura di fabbrica. La colonna di destra ha la sua, identica.</p>"
     +"<p>La larghezza scelta resta ricordata per la prossima volta.</p>"},

  {sel:'#filterGrp',title:"4 \u00b7 Cosa stampare",place:'left',
   tx:"<p>L'albero <b>piano \u203a reparto \u203a stanza</b>. Due comandi per riga, due gesti distinti: il <b>cerchio</b> include o esclude il ramo, il <b>nome</b> salta alla sua pagina nell'anteprima.</p>"
     +"<p>Il cerchio ha tre stati \u2014 pieno, vuoto, trattino (in parte). Escludere una stanza la toglie dalle schede, dall'indice e dai conteggi.</p>",
   off:"La colonna compare a destra quando c'\u00e8 un file caricato."},

  {sel:'#docScroll',title:"La barra di scorrimento",place:'left',
   tx:"<p>Nel margine destro dice a che punto del documento stai guardando: il cursore \u00e8 lungo quanto la pagina in vista, alto quanto \u00e8 lungo il documento. Un clic, o un trascinamento, porta l'anteprima l\u00ec.</p>",
   off:"Vive nel margine a destra dell'anteprima: compare con un file caricato, e solo se quel margine basta — a finestra stretta si tira via da sola."},

  {sel:'#partStrip',title:"Lo scaffale dei fascicoli",place:'right',
   tx:"<p>Con la stampa divisa, i dorsi dei fascicoli stanno nel margine sinistro come su uno scaffale: un clic porta alla prima pagina del fascicolo, e quello che stai guardando esce dalla fila.</p>",
   off:"Compare quando la stampa \u00e8 divisa in pi\u00f9 di un fascicolo."},

  {sel:['#zoomwrap','#empty-state'],title:"L'anteprima \u00e8 il documento",place:'left',
   tx:"<p>Qui non c'\u00e8 una bozza: ogni foglio bianco \u00e8 una pagina A4 vera, ricalcolata da capo a ogni cambio di impostazione. Quello che vedi \u00e8 quello che esce dalla stampante.</p>"},

  {sel:'.bb-riga',title:"I comandi dell'applicazione",place:'below',
   tx:"<p>In cima al pannello: <b>Tracker</b> torna a Crono Mappature; il <b>punto di domanda</b> riapre questa guida; le <b>due frecce</b> chiudono o aprono tutti i gruppi del pannello in un colpo (il titolo di ogni gruppo lo apre e lo chiude da solo); poi giorno e notte.</p>"},

  {sel:'#themeSeg',title:"Giorno e notte",place:'below',
   tx:"<p>Tre scelte: <b>segui il sistema</b>, chiaro, scuro. Riguarda solo l'applicazione \u2014 il foglio A4 \u00e8 bianco in tutti e due i temi, come sar\u00e0 stampato.</p>"},

  {sel:'#tourBtn',title:"La guida resta a portata di mano",place:'below',
   tx:"<p>Questo tastino riapre la guida quando serve, dal passo uno.</p><p>\u00c8 tutto: buon lavoro.</p>"}
];
/* il motore della guida e' condiviso (js/tour.js, css/banco.css): qui restano
   i passi (TOUR_STEPS), l'esempio (tourDemoOn/Off) e i tasti della pagina.
   Parte da sola al primo utilizzo; il ricordo sta in TOUR_KEY, chiave propria
   come il tema, non fra le impostazioni di stampa. */
var TOUR=Tour.crea({
  passi:TOUR_STEPS, chiave:TOUR_KEY, autoAvvio:true,
  primaDi:tourDemoOn,   /* prima l'esempio: i passi devono avere qualcosa da indicare */
  dopo:function(){ tourDemoOff(); syncTutorialBtn(); },
  scorri:function(el){ scrollToEl(el,true); }
});
function startTour(){ TOUR.avvia(); }
document.getElementById('tourBtn').onclick=function(){ startTour(); };
syncTutorialBtn();

render(); /* con le predefinite puo' gia' esserci qualcosa da mostrare */
