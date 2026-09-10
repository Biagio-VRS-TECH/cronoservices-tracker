#!/bin/sh
# Scrive web/js/nuvola-config.js con i valori d'ambiente del sito Netlify.
# E' tutto il "build" che c'e': nessun npm, nessun bundler, nessuna dipendenza.
set -eu

# La chiave service (vedi la cintura di sicurezza in fondo) qui non serve a
# niente: la si toglie dall'ambiente prima di tutto. Con `set -u`, se un domani
# qualcuno la scrivesse nell'heredoc, la shell si fermerebbe con un errore che
# la nomina, invece di pubblicarla.
unset SUPABASE_SERVICE_KEY

# Le due variabili che servono. Prima si usava `: "${VAR:?messaggio}"`, che e'
# piu' corto ma fa uscire la shell con un 2 muto: nei log di Netlify si leggeva
# solo "Build script returned non-zero exit code: 2", senza sapere quale
# mancasse. Meglio due righe in piu' e un messaggio che si capisce.
manca=""
[ -n "${SUPABASE_URL:-}" ]      || manca="$manca SUPABASE_URL"
[ -n "${SUPABASE_ANON_KEY:-}" ] || manca="$manca SUPABASE_ANON_KEY"
if [ -n "$manca" ]; then
  echo "FERMO: al build mancano queste variabili d'ambiente:$manca" >&2
  echo "Si impostano in Netlify: Site configuration > Environment variables." >&2
  echo "Devono avere lo scope 'Builds' e il contesto del deploy in corso." >&2
  exit 1
fi

cat > web/js/nuvola-config.js <<EOF
/* Generato da cloud/netlify-build.sh al momento della pubblicazione.
   Non modificare a mano: la prossima pubblicazione lo riscrive. */
export const URL_SUPABASE = '${SUPABASE_URL}';
export const CHIAVE_ANON = '${SUPABASE_ANON_KEY}';
EOF

# Cintura di sicurezza (25a sessione). Sul piano attuale di Netlify le variabili
# non si possono limitare a un solo scope, quindi SUPABASE_SERVICE_KEY - la
# chiave che scavalca ogni permesso - e' visibile anche qui, nel build. Questo
# script non la usa. Ma se un domani qualcuno la aggiungesse all'heredoc qui
# sopra, finirebbe in un file pubblicato e sarebbe pubblica per chiunque apra
# il sito: meglio che la pubblicazione si fermi.
#
# Il controllo non cerca il VALORE della chiave: passarlo a grep lo metterebbe
# nella riga di comando, cioe' a disposizione di chiunque legga la lista dei
# processi. Si guarda la forma del file: due export, con quei due nomi. E si
# controlla per nome, non cercando la parola "service", perche' l'azienda si
# chiama CronoServiceS e un URL con dentro quella parola avrebbe fermato la
# pubblicazione per niente.
intrusi=$(grep -c '^export ' web/js/nuvola-config.js || true)
attesi=$(grep -cE "^export const (URL_SUPABASE|CHIAVE_ANON) = '" web/js/nuvola-config.js || true)
if [ "$intrusi" != "2" ] || [ "$attesi" != "2" ]; then
  echo "FERMO: nuvola-config.js non ha i due export attesi ($intrusi trovati, $attesi buoni)." >&2
  echo "Quel file finisce online: dentro ci va solo roba pubblica." >&2
  exit 1
fi

echo "nuvola-config.js scritto per ${SUPABASE_URL}"
