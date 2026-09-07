-- 02-funzioni.sql - le funzioni che sostituiscono app/api.py.
--
-- Ogni handler di api.py diventa una funzione qui, con lo STESSO nome di campo
-- e la STESSA forma del JSON: il frontend non deve accorgersi del cambio.
-- Le funzioni che scrivono sono SECURITY DEFINER (le tabelle sono chiuse in
-- scrittura, si passa solo di qui) e controllano l'autorizzazione da sole.
--
-- Convenzione: il campo "http" dentro il JSON di ritorno e' lo status che il
-- client si aspettava dal server Python (200, 409, 400). PostgREST risponde
-- sempre 200: e' web/js/nuvola.js a rimetterlo al suo posto.

-- ------------------------------------------------------------- identita' ---
create or replace function public.email_corrente() returns text
language sql stable as $fn$
  select lower(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'email')
$fn$;

-- Cintura: anche se qualcuno riaprisse le registrazioni, chi non ha una casella
-- aziendale non vede e non scrive niente.
create or replace function public.autorizzato() returns boolean
language sql stable as $fn$
  select coalesce(public.email_corrente() like '%@vrs-tech.it', false)
$fn$;

-- La firma della spunta non arriva piu' dal client: e' chi ha fatto il login.
create or replace function public.operatore_corrente() returns text
language sql stable as $fn$
  select coalesce(
    (select o.nome from public.operatori o where o.email = public.email_corrente()),
    initcap(replace(split_part(public.email_corrente(), '@', 1), '.', ' ')),
    '?')
$fn$;

-- ------------------------------------------------------------- una cella ---
create or replace function public._cella_out(r public.mappature) returns jsonb
language sql immutable as $fn$
  select jsonb_build_object(
    's', r.stampata, 'c', r.controllata, 'k', r.corretta, 'r', r.ricambi,
    'rev', r.rev, 'by', r.updated_by, 'at', r.updated_at,
    'nota', coalesce(r.nota, ''))
$fn$;

create or replace function public._cella_vuota() returns jsonb
language sql immutable as $fn$
  select jsonb_build_object('s',0,'c',0,'k',0,'r',0,'rev',0,
                            'by',null,'at',null,'nota','')
$fn$;

-- ---------------------------------------------------------------- merge ----
-- Gemello di api._applica (#ANCHOR: merge). Le regole, nell'ordine:
--   riga assente             -> creata a 0 e aggiornata (a 0 non si crea niente)
--   rev invariata            -> scrittura diretta
--   rev cambiata, valore gia' quello richiesto         -> no-op idempotente
--   rev cambiata, il campo e' ancora quello del client -> merge silenzioso
--   rev cambiata e anche il campo e' cambiato          -> 409, decide l'operatore
-- Il lock in-process di SQLite (db.WRITE_LOCK) qui e' il SELECT ... FOR UPDATE:
-- PostgREST esegue ogni chiamata dentro una transazione sua.
create or replace function public._applica(
  p_operatore text, p_sid int, p_anno int, p_mese int, p_campo text,
  p_valore int, p_base_rev int, p_base_valore int, p_op_id text, p_origine text)
returns jsonb
language plpgsql as $fn$
declare
  r       public.mappature%rowtype;
  v       int := case when coalesce(p_valore, 0) <> 0 then 1 else 0 end;
  attuale int;
  esito   text := 'ok';
  ts      text := public.ts_locale();
  base    jsonb := jsonb_build_object('id_service', p_sid, 'anno', p_anno, 'mese', p_mese);
begin
  if p_campo not in ('stampata', 'controllata', 'corretta', 'ricambi') then
    return jsonb_build_object('http', 400, 'errore', 'campo non valido: ' || p_campo);
  end if;

  select * into r from public.mappature
   where id_service = p_sid and anno = p_anno and mese = p_mese for update;

  if r.id_service is null then
    if v = 0 then
      return base || jsonb_build_object('http', 200, 'esito', 'gia-cosi',
                                        'cella', public._cella_vuota());
    end if;
    insert into public.mappature(id_service, anno, mese, rev, updated_at, updated_by)
    values (p_sid, p_anno, p_mese, 0, ts, p_operatore)
    on conflict (id_service, anno, mese) do nothing;
    select * into r from public.mappature
     where id_service = p_sid and anno = p_anno and mese = p_mese for update;
  end if;

  attuale := case p_campo when 'stampata'    then r.stampata
                          when 'controllata' then r.controllata
                          when 'corretta'    then r.corretta
                          else                    r.ricambi end;

  if p_base_rev is not null and p_base_rev <> r.rev then
    if attuale = v then
      return base || jsonb_build_object('http', 200, 'esito', 'gia-cosi',
                                        'cella', public._cella_out(r));
    end if;
    if p_base_valore is not null
       and attuale <> (case when p_base_valore <> 0 then 1 else 0 end) then
      return base || jsonb_build_object('http', 409, 'esito', 'conflitto',
                                        'cella', public._cella_out(r),
                                        'campo', p_campo, 'tuo', v);
    end if;
    esito := 'merge';
  end if;

  if attuale = v then
    return base || jsonb_build_object('http', 200, 'esito', 'gia-cosi',
                                      'cella', public._cella_out(r));
  end if;

  update public.mappature set
    stampata    = case when p_campo = 'stampata'    then v else stampata    end,
    controllata = case when p_campo = 'controllata' then v else controllata end,
    corretta    = case when p_campo = 'corretta'    then v else corretta    end,
    ricambi     = case when p_campo = 'ricambi'     then v else ricambi     end,
    rev = rev + 1, updated_at = ts, updated_by = p_operatore
  where id_service = p_sid and anno = p_anno and mese = p_mese
  returning * into r;

  insert into public.eventi(ts, operatore, id_service, anno, mese, campo, da, a, op_id, origine)
  values (ts, p_operatore, p_sid, p_anno, p_mese, p_campo, attuale, v, p_op_id, p_origine);

  return base || jsonb_build_object('http', 200, 'esito', esito,
                                    'cella', public._cella_out(r));
end $fn$;

-- --------------------------------------------------------------- toggle ----
create or replace function public.toggle_cella(
  p_id_service int, p_anno int, p_mese int, p_campo text, p_valore int,
  p_base_rev int default null, p_base_valore int default null,
  p_op_id text default null, p_origine text default 'live')
returns jsonb
language plpgsql security definer set search_path = public as $fn$
declare r public.mappature%rowtype; ris jsonb; op text;
begin
  if not public.autorizzato() then
    raise exception 'non autorizzato' using errcode = '42501';
  end if;
  op := public.operatore_corrente();

  -- Replay della coda offline: l'operazione e' gia' passata, rispondo con lo
  -- stato attuale invece di riapplicarla.
  if p_op_id is not null and exists (select 1 from public.ops where op_id = p_op_id) then
    select * into r from public.mappature
     where id_service = p_id_service and anno = p_anno and mese = p_mese;
    return jsonb_build_object('http', 200, 'esito', 'replay',
      'cella', case when r.id_service is null then null else public._cella_out(r) end,
      'id_service', p_id_service, 'anno', p_anno, 'mese', p_mese);
  end if;

  ris := public._applica(op, p_id_service, p_anno, p_mese, p_campo, p_valore,
                         p_base_rev, p_base_valore, p_op_id, p_origine);

  if p_op_id is not null and (ris->>'http')::int = 200 then
    insert into public.ops(op_id, ts, esito, rev)
    values (p_op_id, public.ts_locale(), ris->>'esito', (ris#>>'{cella,rev}')::int)
    on conflict (op_id) do update
      set ts = excluded.ts, esito = excluded.esito, rev = excluded.rev;
  end if;
  return ris;
end $fn$;

-- ----------------------------------------------------------------- bulk ----
-- Piu' spunte in una transazione: "segna tutte stampate" e la coda offline.
-- Un conflitto su una cella non ferma le altre: ognuna porta il suo esito.
create or replace function public.bulk_celle(
  p_anno int, p_celle jsonb, p_op_id text default null,
  p_origine text default 'bulk')
returns jsonb
language plpgsql security definer set search_path = public as $fn$
declare
  v jsonb; i int := 0; op text; oid text; ris jsonb;
  esiti jsonb := '[]'::jsonb;
begin
  if not public.autorizzato() then
    raise exception 'non autorizzato' using errcode = '42501';
  end if;
  op := public.operatore_corrente();

  for v in select * from jsonb_array_elements(coalesce(p_celle, '[]'::jsonb)) loop
    oid := coalesce(v->>'op_id',
                    case when p_op_id is null then null else p_op_id || ':' || i end);
    if oid is not null and exists (select 1 from public.ops where op_id = oid) then
      esiti := esiti || jsonb_build_array(jsonb_build_object(
        'esito', 'replay', 'id_service', (v->>'id_service')::int,
        'mese', (v->>'mese')::int, 'campo', v->>'campo'));
      i := i + 1;
      continue;
    end if;

    ris := public._applica(op, (v->>'id_service')::int, p_anno, (v->>'mese')::int,
                           v->>'campo', (v->>'valore')::int,
                           (v->>'base_rev')::int, (v->>'base_valore')::int,
                           oid, p_origine);
    ris := ris || jsonb_build_object('campo', v->>'campo');

    if oid is not null and (ris->>'http')::int = 200 then
      insert into public.ops(op_id, ts, esito, rev)
      values (oid, public.ts_locale(), ris->>'esito', (ris#>>'{cella,rev}')::int)
      on conflict (op_id) do update
        set ts = excluded.ts, esito = excluded.esito, rev = excluded.rev;
    end if;
    esiti := esiti || jsonb_build_array(ris);
    i := i + 1;
  end loop;

  return jsonb_build_object('http', 200, 'esiti', esiti);
end $fn$;

-- ----------------------------------------------------------------- nota ----
create or replace function public.imposta_nota(
  p_id_service int, p_anno int, p_mese int, p_nota text)
returns jsonb
language plpgsql security definer set search_path = public as $fn$
declare r public.mappature%rowtype; op text; ts text := public.ts_locale();
        testo text := nullif(left(btrim(coalesce(p_nota, '')), 500), '');
begin
  if not public.autorizzato() then
    raise exception 'non autorizzato' using errcode = '42501';
  end if;
  op := public.operatore_corrente();

  insert into public.mappature(id_service, anno, mese, rev, updated_at, updated_by)
  values (p_id_service, p_anno, p_mese, 0, ts, op)
  on conflict (id_service, anno, mese) do nothing;

  update public.mappature
     set nota = testo, rev = rev + 1, updated_at = ts, updated_by = op
   where id_service = p_id_service and anno = p_anno and mese = p_mese
  returning * into r;

  insert into public.eventi(ts, operatore, id_service, anno, mese, campo, origine)
  values (ts, op, p_id_service, p_anno, p_mese, 'nota', 'live');

  return jsonb_build_object('http', 200, 'cella', public._cella_out(r),
    'id_service', p_id_service, 'anno', p_anno, 'mese', p_mese);
end $fn$;
