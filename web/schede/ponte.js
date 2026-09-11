/* ponte.js (schede) - il generatore di schede tecnici parla con Crono Mappature.
   #ANCHOR: ponte-schede

   Tutto il lavoro (testata di consegna, riconoscimento del sito, PDF con
   html2canvas + jsPDF, consegna al tracker, nuvoletta) sta in web/js/ponte.js,
   condiviso col generatore del registro (web/registro/). Qui restano solo gli
   agganci alle funzioni globali di index.html: `loadRows` (un file caricato ->
   si riconosce il sito), `unloadFile` (file tolto) e `aggiornaTitoloSito` (il
   titolo del documento dal sito collegato, spunta #titleFromSite). */
import { avviaPonte } from '../js/ponte.js';

const ponte = avviaPonte({
  tipo: 'schede',
  suSito: nome => window.aggiornaTitoloSito?.(nome),
});

/* il caricamento di un file: loadRows e' una funzione globale del generatore,
   riassegnarla su window vale anche per le chiamate interne. Con `label` e'
   l'esempio della guida: quello non si riconosce. */
const caricaOriginale = window.loadRows;
if (typeof caricaOriginale === 'function') {
  window.loadRows = function (rows, name, label) {
    const r = caricaOriginale.apply(this, arguments);
    /* il banco si riapparecchia: i gruppi rientrano a scalare (js/gruppi.js) */
    if (r !== false) window.entrataGruppi?.();
    /* il titolo del FOGLIO, non quello che c'e' scritto nel campo: se il campo
       lo riempie il sito ancora collegato (titleFromSite), il file nuovo
       verrebbe riconosciuto con il nome del sito vecchio */
    if (r !== false && !label) ponte.riconosci(String(name || ''), window.SHEET_TITLE || '');
    return r;
  };
}
const togliOriginale = window.unloadFile;
if (typeof togliOriginale === 'function') {
  window.unloadFile = function () {
    const r = togliOriginale.apply(this, arguments);
    ponte.fileTolto();
    return r;
  };
}
