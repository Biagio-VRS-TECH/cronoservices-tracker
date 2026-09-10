#!/bin/sh
# Scrive web/js/nuvola-config.js con i valori d'ambiente del sito Netlify.
# E' tutto il "build" che c'e': nessun npm, nessun bundler, nessuna dipendenza.
set -eu

: "${SUPABASE_URL:?manca la variabile d'ambiente SUPABASE_URL}"
: "${SUPABASE_ANON_KEY:?manca la variabile d'ambiente SUPABASE_ANON_KEY}"

cat > web/js/nuvola-config.js <<EOF
/* Generato da cloud/netlify-build.sh al momento della pubblicazione.
   Non modificare a mano: la prossima pubblicazione lo riscrive. */
export const URL_SUPABASE = '${SUPABASE_URL}';
export const CHIAVE_ANON = '${SUPABASE_ANON_KEY}';
EOF

# Cintura di sicurezza (25a sessione). Sul piano attuale di Netlify le variabili
# non si possono limitare a un solo scope, quindi SUPABASE_SERVICE_KEY - la
# chiave che scavalca ogni permesso - e' visibile anche qui, nel build. Questo
# script non la usa: scrive solo URL e ANON. Ma se un domani qualcuno la
# aggiungesse all'heredoc qui sopra, finirebbe in un file pubblicato e sarebbe
# pubblica per chiunque apra il sito. Meglio che la pubblicazione si fermi.
if [ -n "${SUPABASE_SERVICE_KEY:-}" ] &&
   grep -qF "${SUPABASE_SERVICE_KEY}" web/js/nuvola-config.js; then
  echo "FERMO: la service key e' finita in nuvola-config.js, che va online." >&2
  exit 1
fi

echo "nuvola-config.js scritto per ${SUPABASE_URL}"
