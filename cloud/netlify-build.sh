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

echo "nuvola-config.js scritto per ${SUPABASE_URL}"
