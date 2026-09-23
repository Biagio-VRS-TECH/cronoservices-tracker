-- 04-sicurezza.sql - chi vede cosa, chi scrive cosa, cosa viaggia in diretta.
--
-- Il modello in una riga: in LETTURA si passa dalle policy RLS (solo chi ha
-- fatto il login con una casella @vrs-tech.it); in SCRITTURA non c'e' nessuna
-- policy, quindi l'unica strada sono le funzioni SECURITY DEFINER di
-- 02-funzioni.sql. Le regole del merge non si possono aggirare scrivendo dritto
-- sulla tabella, nemmeno con un token valido in mano.
--
-- Il ruolo `anon` (chi non ha fatto il login) non arriva a niente.
-- Il ruolo `service_role` (la chiave usata SOLO da app/push_cloud.py sul PC
-- dell'ufficio) salta l'RLS: e' cosi' che entra la copia di Access.
--
-- Dal 23/09/2026 (SEC-10) i grant e i revoke toccano solo gli oggetti di
-- CronoService, per nome: rilanciare questo file non spegne piu' il Planning.
-- Le policy di lettura qui sotto pero' sono nella forma vecchia (senza
-- `(select ...)`): dopo averlo rilanciato, rilanciare anche 09 e 10.

-- ------------------------------------------------------------------ RLS ----
alter table public.meta       enable row level security;
alter table public.clienti    enable row level security;
alter table public.services   enable row level security;
alter table public.mappature  enable row level security;
alter table public.eventi     enable row level security;
alter table public.ops        enable row level security;
alter table public.operatori  enable row level security;
alter table public.presenze   enable row level security;
alter table public.sync_log   enable row level security;

do $blocco$
declare t text;
begin
  foreach t in array array['meta','clienti','services','mappature','eventi',
                           'ops','operatori','presenze','sync_log']
  loop
    execute format('drop policy if exists leggi_azienda on public.%I', t);
    execute format(
      'create policy leggi_azienda on public.%I for select to authenticated
       using (public.autorizzato())', t);
  end loop;
end $blocco$;

-- ---------------------------------------------------------------- grant ----
grant usage on schema public to anon, authenticated;

-- SEC-10: lo schema `public` e' CONDIVISO col Planning (tabelle e funzioni
-- `pl_*`). Qui si tocca SOLO l'elenco esplicito delle tabelle e delle funzioni
-- di CronoService: un tempo c'era un revoke `on all tables` di tutto lo schema, che
-- rieseguito toglieva le scritture a tutte le `pl_*` e l'EXECUTE a
-- `pl_is_active()`, e il Planning si fermava per tutti. Una tabella o una
-- funzione nuova di CronoService va aggiunta a questi elenchi (e a quelli di
-- 10-migliorie-2026-09.sql).
do $blocco$
declare t text;
begin
  foreach t in array array['meta','clienti','services','mappature','eventi',
                           'ops','operatori','presenze','sync_log',
                           'documenti','dizionario_componenti']
  loop
    if to_regclass('public.' || t) is not null then
      execute format('revoke all on public.%I from anon, authenticated', t);
      -- La SELECT diretta serve a una cosa sola: Realtime, che valuta le policy
      -- con i permessi di chi ascolta. L'applicazione legge dalle funzioni app_*.
      execute format('grant select on public.%I to authenticated', t);
    end if;
  end loop;
end $blocco$;

-- Le funzioni nascono eseguibili da chiunque: qui si toglie tutto e si ridanno
-- solo quelle che l'applicazione chiama davvero, e solo a chi ha fatto il login.
-- Per NOME, tutte le firme che esistono (BUG-08: una firma scritta a mano
-- invecchia appena la funzione prende un argomento in piu').
do $blocco$
declare f regprocedure;
begin
  for f in
    select p.oid::regprocedure
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname = any (array[
         '_applica','_cella_out','_cella_vuota','_csv','_doc_out','_documenti_json',
         '_mese_scadenza','_presenti','_scad_effettiva','_valore_per_ruolo',
         '_voce_dizionario_out','_documento_in_uso',
         'app_attivita','app_bootstrap','app_celle_dopo','app_dizionario',
         'app_documenti','app_export_csv','app_incongruenze','app_ping','app_storia',
         'app_cestino_documenti',
         'autorizzato','azzera_diario','bulk_celle','e_admin','elimina_documenti',
         'elimina_documento','elimina_documento_definitivo','ripristina_documento',
         'svuota_cestino_documenti','email_corrente','imposta_meta','imposta_nota',
         'imposta_operatore','imposta_ruolo','imposta_voce_dizionario',
         'operatore_corrente','puo_approvare','registra_documento',
         'ripristina_blocco','ruolo_corrente','sync_applica','toggle_cella',
         'ts_locale'])
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
  end loop;
end $blocco$;

grant execute on function
  public.app_bootstrap(int),
  public.app_storia(int, int, int),
  public.app_attivita(int),
  public.app_incongruenze(int),
  public.app_export_csv(int, int),
  public.app_ping(text),
  public.toggle_cella(int, int, int, text, int, int, int, text, text),
  public.bulk_celle(int, jsonb, text, text),
  public.imposta_nota(int, int, int, text, int, text),
  public.imposta_operatore(text),
  public.imposta_ruolo(text, text),
  public.ripristina_blocco(text),
  public.imposta_meta(text),
  public.azzera_diario(),
  public.e_admin(),
  public.puo_approvare(),
  public.ruolo_corrente()
to authenticated;

-- I documenti (06-documenti.sql) nascono dopo questo file: se 04 viene
-- rilanciato da solo, il revoke qui sopra toglierebbe l'EXECUTE anche a loro e
-- il tracker risponderebbe 403 sulle schede tecnici (era il difetto della 19a
-- sessione). Si ridanno qui, ma solo se esistono: su un progetto nuovo, dove 06
-- non e' ancora passato, il blocco non fa niente e non ferma lo script.
-- BUG-08: per NOME e non per firma. La firma scritta qui (11 argomenti) era
-- rimasta indietro rispetto a quella di 06 (12, con `tipo`): rilanciato 04 dopo
-- 06, ogni consegna di PDF rispondeva 403. Ora si prende ogni firma che esiste.
do $blocco$
declare f regprocedure;
begin
  for f in
    select p.oid::regprocedure
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname = any (array['app_documenti','registra_documento',
                                  'elimina_documento','elimina_documenti',
                                  'app_dizionario','imposta_voce_dizionario',
                                  -- 10-migliorie-2026-09.sql
                                  'ripristina_documento','elimina_documento_definitivo',
                                  'svuota_cestino_documenti','app_cestino_documenti',
                                  '_documento_in_uso'])
  loop
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $blocco$;

-- Queste due le chiama la policy RLS, cioe' vengono valutate con i permessi di
-- chi ascolta Realtime: senza EXECUTE la diretta non arriverebbe a nessuno.
grant execute on function public.autorizzato(), public.email_corrente()
  to authenticated;

-- Tutto il resto (_applica, _cella_out, i gemelli del modello dell'anno...)
-- resta interno: gira dentro le funzioni SECURITY DEFINER, coi permessi del
-- proprietario, e da fuori non e' raggiungibile.

-- ------------------------------------------------------------- realtime ----
-- Sostituisce l'hub SSE di server.py: ogni client sente le celle toccate dagli
-- altri. Realtime rispetta l'RLS, quindi arriva solo a chi puo' gia' leggere.
do $blocco$
declare t text;
begin
  foreach t in array array['mappature','presenze','meta','sync_log'] loop
    if not exists (select 1 from pg_publication_tables
                   where pubname = 'supabase_realtime'
                     and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $blocco$;

grant execute on function public.app_celle_dopo(int, text) to authenticated;
