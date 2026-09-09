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

revoke all on all tables in schema public from anon, authenticated;
-- La SELECT diretta serve a una cosa sola: Realtime, che valuta le policy con i
-- permessi di chi ascolta. L'applicazione legge dalle funzioni app_*.
grant select on all tables in schema public to authenticated;

-- Le funzioni nascono eseguibili da chiunque: qui si toglie tutto e si ridanno
-- solo quelle che l'applicazione chiama davvero, e solo a chi ha fatto il login.
revoke execute on all functions in schema public from public, anon, authenticated;

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
  public.e_admin(),
  public.puo_approvare(),
  public.ruolo_corrente()
to authenticated;

-- I documenti (06-documenti.sql) nascono dopo questo file: se 04 viene
-- rilanciato da solo, il revoke qui sopra toglierebbe l'EXECUTE anche a loro e
-- il tracker risponderebbe 403 sulle schede tecnici (era il difetto della 19a
-- sessione). Si ridanno qui, ma solo se esistono: su un progetto nuovo, dove 06
-- non e' ancora passato, il blocco non fa niente e non ferma lo script.
do $blocco$
declare f text;
begin
  foreach f in array array['app_documenti(int)',
                           'registra_documento(int, int, int, text, text, int, int, text, text, int, int)',
                           'elimina_documento(text)']
  loop
    if to_regprocedure('public.' || f) is not null then
      execute format('grant execute on function public.%s to authenticated', f);
    end if;
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
