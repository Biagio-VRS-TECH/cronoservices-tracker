-- 11-responsabile.sql - ogni mappatura ha un responsabile (PRD-04).
--
-- Il piano e' planning/docs/migliorie-2026-09.md (seconda ondata, corsia C).
-- Prima: `services` non aveva un responsabile, quindi "229 in ritardo" era un
-- numero senza nome. Ora:
--   1. `services.responsabile` (la CASELLA di chi ne risponde, minuscola) e
--      `services.responsabile_dal` (da quando, ora locale ISO come il resto);
--   2. `app_responsabili()`: chi risponde di cosa, e fra chi si puo' scegliere
--      (gli operatori con una casella). Una chiamata a se', accanto al
--      bootstrap: app_bootstrap non si tocca;
--   3. `imposta_responsabile(ids, email)`: uno o molti service insieme (dal
--      cassetto o dai filtri), solo l'amministratore; email vuota = nessuno.
--      Ogni service cambiato lascia una riga nel diario (campo 'responsabile').
--
-- Retrocompatibile: la colonna e' nullable e sync_applica (05) non la conosce,
-- quindi il travaso da Access non la tocca mai (ne' la scrive ne' la azzera).
-- I client di oggi non chiamano le funzioni nuove e non se ne accorgono; il
-- client nuovo senza questo file applicato nasconde filtro e scelta.
--
-- Si puo' rilanciare: `if not exists`, `create or replace`, grant e revoke.
-- Nessuna scrittura su righe esistenti.
--
-- Ordine: dopo 01-10. Sul database condiviso col Planning NON si rilanciano
-- 01-08 (vedi LEGGIMI.md); questo file basta da solo.

-- ============================================================ 1. colonne ===
alter table public.services add column if not exists responsabile text;
alter table public.services add column if not exists responsabile_dal text;
-- sempre minuscola: e' con la casella del login (email_corrente(), minuscola)
-- che il filtro "Le mie" la confronta
alter table public.services drop constraint if exists services_responsabile_minuscolo;
alter table public.services add constraint services_responsabile_minuscolo
  check (responsabile is null or responsabile = lower(btrim(responsabile)));
create index if not exists ix_serv_resp on public.services(responsabile)
  where responsabile is not null;

-- ======================================================= 2. chi e di cosa ===
-- { http, io, responsabili: {"<id_service>": "casella"}, persone: [{email, nome}] }
-- `persone` sono gli operatori che hanno una casella (cioe' sono entrati almeno
-- una volta); chi e' disattivato nel Planning non si propone piu'. Un
-- responsabile che non e' piu' fra le persone resta sul service: si vede e si
-- puo' cambiare, non sparisce da solo.
create or replace function public.app_responsabili()
returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $fn$
declare v_persone jsonb;
begin
  if not public.autorizzato() then
    raise exception 'non autorizzato' using errcode = '42501';
  end if;
  if to_regclass('public.pl_profiles') is not null then
    -- nel ramo: su un progetto senza Planning questa istruzione non si prepara mai
    select coalesce(jsonb_agg(jsonb_build_object('email', lower(o.email), 'nome', o.nome)
                              order by o.nome), '[]'::jsonb)
      into v_persone
      from public.operatori o
     where o.email is not null
       and not exists (select 1 from public.pl_profiles p
                        where lower(p.email) = lower(o.email) and p.active = false);
  else
    select coalesce(jsonb_agg(jsonb_build_object('email', lower(o.email), 'nome', o.nome)
                              order by o.nome), '[]'::jsonb)
      into v_persone
      from public.operatori o
     where o.email is not null;
  end if;
  return jsonb_build_object(
    'http', 200,
    'io', public.email_corrente(),
    'responsabili', (select coalesce(jsonb_object_agg(s.id_service::text, s.responsabile),
                                     '{}'::jsonb)
                       from public.services s where s.responsabile is not null),
    'persone', v_persone);
end $fn$;

-- ===================================================== 3. affidare i siti ===
-- p_ids: i service (uno dal cassetto, molti dai filtri). p_email: la casella di
-- un operatore, oppure '' / null per togliere il responsabile. Risponde con
-- quanti sono cambiati e con la mappa aggiornata di quei soli service.
create or replace function public.imposta_responsabile(p_ids int[], p_email text)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $fn$
declare
  v_email text := nullif(lower(btrim(coalesce(p_email, ''))), '');
  v_nome  text;
  v_op    text;
  v_blocco text := gen_random_uuid()::text;
  v_ts    text := public.ts_locale();
  v_anno  int := extract(year from (now() at time zone 'Europe/Rome'))::int;
  v_mese  int := extract(month from (now() at time zone 'Europe/Rome'))::int;
  n       int := 0;
begin
  if not public.autorizzato() then
    raise exception 'non autorizzato' using errcode = '42501';
  end if;
  if not public.e_admin() then
    return jsonb_build_object('http', 403, 'errore', 'questa azione e'' dell''amministratore');
  end if;
  if coalesce(cardinality(p_ids), 0) = 0 then
    return jsonb_build_object('http', 400, 'errore', 'nessun service scelto');
  end if;
  if cardinality(p_ids) > 5000 then
    return jsonb_build_object('http', 400, 'errore', 'troppi service in una volta sola');
  end if;
  if v_email is not null then
    select o.nome into v_nome from public.operatori o where lower(o.email) = v_email limit 1;
    if v_nome is null then
      return jsonb_build_object('http', 400, 'errore',
        'questa persona non e'' ancora entrata in CronoService: si affida dopo il primo accesso');
    end if;
  end if;
  v_op := public.operatore_corrente();

  with cambiati as (
    update public.services s
       set responsabile = v_email,
           responsabile_dal = case when v_email is null then null else v_ts end
     where s.id_service = any (p_ids)
       and s.responsabile is distinct from v_email
    returning s.id_service
  ), numerati as (
    select c.id_service, row_number() over (order by c.id_service) as k from cambiati c
  ), diario as (
    -- un blocco solo nel diario (op_id "<blocco>:<n>"), come le azioni di massa;
    -- `da` resta vuoto: non e' una spunta, il Ripristina non la tocca
    insert into public.eventi(ts, operatore, id_service, anno, mese, campo, op_id,
                              origine, dettaglio)
    select v_ts, v_op, x.id_service, v_anno, v_mese, 'responsabile',
           v_blocco || ':' || x.k, 'responsabile', coalesce(v_nome, '')
      from numerati x
    returning 1
  )
  select count(*) into n from diario;

  return jsonb_build_object(
    'http', 200, 'cambiati', n, 'email', v_email, 'nome', v_nome,
    'responsabili', (select coalesce(jsonb_object_agg(s.id_service::text, s.responsabile),
                                     '{}'::jsonb)
                       from public.services s where s.id_service = any (p_ids)));
end $fn$;

-- =================================================================== grant ===
-- Nascono eseguibili da chiunque: si tolgono e si ridanno solo a chi e' entrato.
revoke execute on function public.app_responsabili() from public, anon, authenticated;
revoke execute on function public.imposta_responsabile(int[], text) from public, anon, authenticated;
grant execute on function public.app_responsabili() to authenticated;
grant execute on function public.imposta_responsabile(int[], text) to authenticated;

-- ====================================================== verifica: tutte 1 ===
select 1 as colonne
  where (select count(*) from information_schema.columns
          where table_schema = 'public' and table_name = 'services'
            and column_name in ('responsabile', 'responsabile_dal')) = 2;
select 1 as vincolo_minuscolo
  from pg_constraint where conname = 'services_responsabile_minuscolo';
select 1 as solo_chi_e_entrato
  where has_function_privilege('authenticated', 'public.app_responsabili()', 'execute')
    and has_function_privilege('authenticated', 'public.imposta_responsabile(int[], text)', 'execute')
    and not has_function_privilege('anon', 'public.app_responsabili()', 'execute')
    and not has_function_privilege('anon', 'public.imposta_responsabile(int[], text)', 'execute');
select 1 as sync_non_la_tocca
  where position('responsabile' in pg_get_functiondef('public.sync_applica(jsonb, jsonb)'::regprocedure)) = 0;
