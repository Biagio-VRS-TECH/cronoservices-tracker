/* nuvola-config.js - dove vive il database, quando l'applicazione e' online.

   Vuoto = modalita' LOCALE: l'applicazione parla con server.py, come sempre, e
   `avvia.bat` continua a funzionare offline senza nessuna configurazione.

   Su Netlify questo file viene RISCRITTO al momento della pubblicazione da
   cloud/netlify-build.sh, con i valori delle variabili d'ambiente
   SUPABASE_URL e SUPABASE_ANON_KEY. Non metterli qui a mano: cosi' le chiavi
   restano fuori dai file del progetto.

   La chiave anonima e' pubblica per disegno (finisce nel browser di chiunque):
   non protegge niente da sola. A proteggere i dati sono il login e le regole
   RLS di cloud/04-sicurezza.sql. La chiave `service_role`, quella si' segreta,
   non deve MAI comparire qui: vive solo sul PC dell'ufficio, in app/cloud.json.
*/
export const URL_SUPABASE = '';
export const CHIAVE_ANON = '';
