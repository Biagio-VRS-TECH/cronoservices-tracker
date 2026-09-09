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
-- #ANCHOR: ruoli. Il ruolo e' legato alla CASELLA del login, mai al nome: il
-- nome e' solo come ti si scrive, e dall'app non si cambia piu'.
-- Due domande diverse, due funzioni diverse:
--   e_admin()       chi comanda: azioni di massa, sync, impostazioni, ripristino
--   puo_approvare() chi chiude le proposte: admin E approvatore
-- L'approvatore approva rapportino e ricambi e nient'altro: non azzera, non
-- ripristina, non entra nelle impostazioni.
create or replace function public.ruolo_corrente() returns text
language sql stable security definer set search_path = public as $fn$
  select coalesce((select o.ruolo from public.operatori o
                    where o.email = public.email_corrente() limit 1), 'tecnico')
$fn$;

create or replace function public.e_admin() returns boolean
language sql stable security definer set search_path = public as $fn$
  select public.ruolo_corrente() = 'admin'
$fn$;

create or replace function public.puo_approvare() returns boolean
language sql stable security definer set search_path = public as $fn$
  select public.ruolo_corrente() in ('admin', 'approvatore')
$fn$;

-- Gemello di api._valore_per_ruolo (#ANCHOR: ruoli): l'INTENZIONE del client
-- (0/1, o 2 solo da un admin che ripristina) diventa il valore scrivibile.
-- Sui passi da approvare (corretta, ricambi) il tecnico propone (1 -> 2) e
-- ritira (2 -> 0), ma non toglie un'approvazione (1 -> 0); chi puo' approvare
-- (admin o approvatore) approva e respinge; rimettere in attesa (il 2 scritto
-- a mano, cioe' il ripristino) resta del solo admin.
-- Ritorna il valore, oppure -1 se la mossa e' vietata.
-- La firma cambia (due booleani invece di uno): la vecchia va tolta, altrimenti
-- restano due _valore_per_ruolo e la chiamata diventa ambigua.
drop function if exists public._valore_per_ruolo(text, int, int, boolean);
create or replace function public._valore_per_ruolo(
  p_campo text, p_attuale int, p_valore int,
  p_approva boolean, p_admin boolean) returns int
language plpgsql immutable as $fn$
declare v int := coalesce(p_valore, 0);
begin
  if v not in (0, 1, 2) then v := case when v <> 0 then 1 else 0 end; end if;
  if p_campo not in ('corretta', 'ricambi') then
    return case when v <> 0 then 1 else 0 end;
  end if;
  if v = 2 then return case when p_admin then 2 else -1 end; end if;
  if p_approva then return v; end if;
  if v = 1 then return case when p_attuale = 1 then 1 else 2 end; end if;
  if p_attuale = 1 then return -1; end if;
  return v;
end $fn$;

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
-- La firma porta i due poteri separati (p_approva, p_admin): le vecchie vanno
-- tolte, altrimenti restano piu' _applica e toggle_cella/bulk_celle diventano
-- ambigue.
drop function if exists public._applica(text, int, int, int, text, int, int, int, text, text);
drop function if exists public._applica(text, int, int, int, text, int, int, int, text, text, boolean);
create or replace function public._applica(
  p_operatore text, p_sid int, p_anno int, p_mese int, p_campo text,
  p_valore int, p_base_rev int, p_base_valore int, p_op_id text, p_origine text,
  p_approva boolean default false, p_admin boolean default false)
returns jsonb
language plpgsql as $fn$
declare
  r       public.mappature%rowtype;
  v       int;
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

  -- il valore che si scrive davvero, secondo il ruolo (#ANCHOR: ruoli); nel
  -- database un passo vale 0, 1 o 2 = proposta in attesa dell'admin
  attuale := case when r.id_service is null then 0
                  when p_campo = 'stampata'    then r.stampata
                  when p_campo = 'controllata' then r.controllata
                  when p_campo = 'corretta'    then r.corretta
                  else                              r.ricambi end;
  v := public._valore_per_ruolo(p_campo, attuale, p_valore,
                                coalesce(p_approva, false), coalesce(p_admin, false));
  if v < 0 then
    return base || jsonb_build_object('http', 403, 'esito', 'vietato', 'campo', p_campo,
      'errore', case when coalesce(p_valore, 0) = 2
                     then 'solo l''amministratore puo'' rimettere in attesa'
                     else 'spunta gia'' approvata: la toglie solo chi approva' end,
      'cella', case when r.id_service is null then null else public._cella_out(r) end);
  end if;

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
    if p_base_valore is not null and attuale <> p_base_valore then
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
                         p_base_rev, p_base_valore, p_op_id, p_origine,
                         public.puo_approvare(), public.e_admin());

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
  adm boolean := public.e_admin();
  app boolean := public.puo_approvare();
begin
  if not public.autorizzato() then
    raise exception 'non autorizzato' using errcode = '42501';
  end if;
  -- "Completa/Azzera tutte" e' del solo amministratore (#ANCHOR: ruoli):
  -- l'approvatore chiude le proposte ("Approva tutte", origine 'approvazione'),
  -- ma non azzera il lavoro di tutti in un clic.
  if p_origine = 'massa' and not adm then
    return jsonb_build_object('http', 403, 'errore', 'le azioni di massa sono dell''amministratore');
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
                           oid, p_origine, app, adm);
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

-- ------------------------------------------------------------ ripristino ----
-- Gemello di api.ripristina (#ANCHOR: ripristino): rimette com'erano PRIMA
-- tutti i passi toccati da un'operazione. p_op_id e' l'op_id di una spunta
-- singola o il blocco `<uuid>` delle celle di un bulk (`<uuid>:<n>`). Dal piu'
-- recente al piu' vecchio; ogni scrittura e' un evento 'ripristino' col suo
-- blocco, quindi si puo' ripristinare anche un ripristino. Solo admin.
create or replace function public.ripristina_blocco(p_op_id text)
returns jsonb
language plpgsql security definer set search_path = public as $fn$
declare
  e public.eventi%rowtype; ris jsonb; op text; i int := 0; n int := 0;
  blocco text := replace(gen_random_uuid()::text, '-', '');
  esiti jsonb := '[]'::jsonb; celle jsonb := '{}'::jsonb; k text;
begin
  if not public.autorizzato() then
    raise exception 'non autorizzato' using errcode = '42501';
  end if;
  if not public.e_admin() then
    return jsonb_build_object('http', 403, 'errore', 'questa azione e'' dell''amministratore');
  end if;
  if coalesce(p_op_id, '') = '' or position(':' in p_op_id) > 0 then
    return jsonb_build_object('http', 400, 'errore', 'op_id mancante o non e'' un blocco');
  end if;
  op := public.operatore_corrente();

  for e in select * from public.eventi
            where op_id = p_op_id or op_id like p_op_id || ':%'
            order by id desc loop
    if e.campo not in ('stampata', 'controllata', 'corretta', 'ricambi') or e.da is null then
      continue;
    end if;
    ris := public._applica(op, e.id_service, e.anno, e.mese, e.campo, e.da,
                           null, null, blocco || ':' || i, 'ripristino', true, true);
    i := i + 1;
    esiti := esiti || jsonb_build_array(ris || jsonb_build_object('campo', e.campo));
    if (ris->>'http')::int = 200 and (ris->>'esito') in ('ok', 'merge') then
      k := e.anno || '|' || e.id_service || '|' || e.mese;
      celle := celle || jsonb_build_object(k, jsonb_build_object(
        'anno', e.anno, 'id_service', e.id_service, 'mese', e.mese, 'cella', ris->'cella'));
    end if;
  end loop;
  if i = 0 and jsonb_array_length(esiti) = 0 then
    return jsonb_build_object('http', 404, 'errore', 'nessuna modifica con questo identificativo');
  end if;
  select count(*) into n from jsonb_object_keys(celle);
  return jsonb_build_object('http', 200, 'esiti', esiti, 'n', n, 'blocco', blocco,
    'celle', (select coalesce(jsonb_agg(v), '[]'::jsonb) from jsonb_each(celle) as t(kk, v)));
end $fn$;

-- ----------------------------------------------------------------- nota ----
-- Gemello di api.nota. La nota e' l'unico campo di testo libero: su un booleano
-- i due valori possibili si riconciliano sempre da soli, su una frase no.
-- Stesse regole di _applica: rev invariata -> scrive; rev cambiata ma la nota e'
-- gia' la tua -> gia-cosi; rev cambiata e la nota e' ancora quella che il client
-- credeva -> l'altro ha toccato una spunta, merge; rev cambiata e la nota e'
-- un'altra -> 409, sceglie l'operatore. Senza p_base_rev si scrive e basta.
-- la firma cambia (base_rev/base_nota): senza il drop la versione a quattro
-- argomenti resterebbe in giro come sovraccarico, e PostgREST sceglierebbe a
-- caso fra le due
drop function if exists public.imposta_nota(int, int, int, text);
create or replace function public.imposta_nota(
  p_id_service int, p_anno int, p_mese int, p_nota text,
  p_base_rev int default null, p_base_nota text default null)
returns jsonb
language plpgsql security definer set search_path = public as $fn$
declare r public.mappature%rowtype; op text; ts text := public.ts_locale();
        testo   text := left(btrim(coalesce(p_nota, '')), 500);
        attuale text;
        esito   text := 'ok';
        base    jsonb := jsonb_build_object('id_service', p_id_service,
                                            'anno', p_anno, 'mese', p_mese);
begin
  if not public.autorizzato() then
    raise exception 'non autorizzato' using errcode = '42501';
  end if;
  op := public.operatore_corrente();

  select * into r from public.mappature
   where id_service = p_id_service and anno = p_anno and mese = p_mese for update;

  if r.id_service is null then
    if testo = '' then
      return base || jsonb_build_object('http', 200, 'esito', 'gia-cosi',
                                        'cella', public._cella_vuota());
    end if;
    insert into public.mappature(id_service, anno, mese, rev, updated_at, updated_by)
    values (p_id_service, p_anno, p_mese, 0, ts, op)
    on conflict (id_service, anno, mese) do nothing;
    select * into r from public.mappature
     where id_service = p_id_service and anno = p_anno and mese = p_mese for update;
  end if;

  attuale := coalesce(r.nota, '');

  if p_base_rev is not null and p_base_rev <> r.rev then
    if attuale = testo then
      return base || jsonb_build_object('http', 200, 'esito', 'gia-cosi',
                                        'cella', public._cella_out(r));
    end if;
    if p_base_nota is not null
       and attuale <> left(btrim(p_base_nota), 500) then
      return base || jsonb_build_object('http', 409, 'esito', 'conflitto',
                                        'cella', public._cella_out(r),
                                        'campo', 'nota', 'tuo', testo);
    end if;
    esito := 'merge';
  end if;

  if attuale = testo then
    return base || jsonb_build_object('http', 200, 'esito', 'gia-cosi',
                                      'cella', public._cella_out(r));
  end if;

  update public.mappature
     set nota = nullif(testo, ''), rev = rev + 1, updated_at = ts, updated_by = op
   where id_service = p_id_service and anno = p_anno and mese = p_mese
  returning * into r;

  insert into public.eventi(ts, operatore, id_service, anno, mese, campo, origine)
  values (ts, op, p_id_service, p_anno, p_mese, 'nota', 'live');

  return base || jsonb_build_object('http', 200, 'esito', esito,
                                    'cella', public._cella_out(r));
end $fn$;
