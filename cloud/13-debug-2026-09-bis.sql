-- 13-debug-2026-09-bis.sql - la seconda tornata di correzioni online, dopo il 12.
--
-- Si puo' rilanciare quante volte si vuole: solo `create or replace function`
-- (sei funzioni, per nome e firma esatti) e revoke/grant su quelle sei. Non
-- tocca NESSUN dato: niente insert, update o delete fuori dai corpi, niente
-- revoke `on all ...`. Del Planning LEGGE soltanto `pl_profiles` (chi e'
-- disattivato), come gia' fanno autorizzato() (10) e app_responsabili() (11),
-- e sempre dentro un ramo `to_regclass(...)`: su un progetto senza Planning
-- quell'istruzione non si prepara mai. Nessuna funzione pl_* chiamata.
--
-- Ordine: dopo 01-12. Sul database condiviso col Planning NON si rilanciano
-- 01-08 (vedi LEGGIMI.md, §6-bis): questo file basta da solo. `_applica` e
-- `imposta_nota` qui NON si riscrivono: online portano il controllo che vi ha
-- aggiunto il Planning (033/036/037). Ogni testo qui sotto parte da quello
-- online (pg_get_functiondef, 23/09/2026) e cambia il minimo.
--
-- Cosa mette a posto:
--   1. imposta_ruolo(): il lucchetto "non si toglie l'ultimo admin" contava
--      anche gli amministratori disattivati nel Planning: con un solo admin
--      attivo e uno disattivato, quello attivo poteva declassarsi e lasciare
--      l'azienda senza nessuno che comandi;
--   2. imposta_responsabile(): si poteva affidare un sito a una persona
--      disattivata nel Planning (la tendina non la propone, la RPC si');
--   3. app_attivita(): un limite negativo dava l'errore SQL "LIMIT must not
--      be negative" (un 500 al client), zero una lista vuota;
--   4. toggle_cella() e bulk_celle(): un mese fuori da 1..12 arrivava al
--      vincolo mappature_mese_check (errore grezzo, e in un bulk annullava
--      TUTTE le celle); un anno assurdo (0, 99999) creava righe fantasma. Ora
--      un {http: 400} come le altre risposte (come _fuori_dominio in
--      app/api_comune.py). La nota (imposta_nota) resta com'e': e' essa stessa
--      la funzione esposta, non ha un involucro da correggere senza riscriverla;
--   5. ripristina_blocco(): un blocco che esiste ma non ha niente da
--      ripristinare (solo righe 'responsabile', o passi senza `da`) rispondeva
--      404 "nessuna modifica"; in locale (app/api_spunte.py) e' un 200 con n=0.
--      Il 404 resta per un op_id che nel diario non c'e' proprio.

-- ======================================= 1. imposta_ruolo, solo admin attivi ===
-- Testo online (09 + search_path del 10); cambia solo il conto. Contano gli
-- amministratori che `autorizzato()` lascerebbe entrare: casella @vrs-tech.it
-- e non disattivati in pl_profiles. autorizzato() guarda `auth.uid()`, qui si
-- parla degli ALTRI: si riconoscono per casella e, se la 042 del Planning ha
-- riempito operatori.profile_id, anche per quello (letto con to_jsonb: senza
-- la 042 la colonna non c'e' e l'istruzione deve prepararsi lo stesso).
-- E il bersaglio conta solo se e' un admin attivo: declassare un admin
-- disattivato (o senza casella) non toglie nessuno che comandi.
-- `coalesce(p_ruolo, '')`: un ruolo nullo passava il controllo (null not in
-- ... e' null, non true) e finiva sul vincolo not null di operatori.ruolo.
create or replace function public.imposta_ruolo(p_nome text, p_ruolo text)
returns jsonb
language plpgsql security definer set search_path = public as $fn$
declare v_nome text := left(btrim(coalesce(p_nome, '')), 40);
        n_admin int;
        v_bersaglio boolean;
begin
  if not public.autorizzato() then
    raise exception 'non autorizzato' using errcode = '42501';
  end if;
  if not public.e_admin() then
    return jsonb_build_object('http', 403, 'errore', 'questa azione e'' dell''amministratore');
  end if;
  if v_nome = '' or coalesce(p_ruolo, '') not in ('admin', 'approvatore', 'tecnico') then
    return jsonb_build_object('http', 400, 'errore',
      'servono nome e ruolo (admin|approvatore|tecnico)');
  end if;
  if not exists (select 1 from public.operatori o where o.nome = v_nome) then
    return jsonb_build_object('http', 400, 'errore',
      v_nome || ' non e'' ancora entrato: il ruolo si da'' dopo il primo accesso');
  end if;
  -- un declassamento alla volta (vedi sopra): prima il lucchetto, poi il conto
  perform 1 from public.operatori o where o.ruolo = 'admin' for update;
  -- contano solo gli amministratori che possono davvero entrare: una riga
  -- senza casella (seme, o di prima del login) o disattivata nel Planning non
  -- deve far credere che "ce n'e' un altro" e lasciare l'azienda senza nessuno
  -- che comandi
  if to_regclass('public.pl_profiles') is not null then
    select count(*), coalesce(bool_or(o.nome = v_nome), false)
      into n_admin, v_bersaglio
      from public.operatori o
     where o.ruolo = 'admin' and lower(o.email) like '%@vrs-tech.it'
       and not exists (select 1 from public.pl_profiles p
                        where p.active = false
                          and (lower(p.email) = lower(o.email)
                               or p.id::text = to_jsonb(o)->>'profile_id'));
  else
    select count(*), coalesce(bool_or(o.nome = v_nome), false)
      into n_admin, v_bersaglio
      from public.operatori o
     where o.ruolo = 'admin' and lower(o.email) like '%@vrs-tech.it';
  end if;
  if p_ruolo <> 'admin' and n_admin <= 1 and v_bersaglio then
    return jsonb_build_object('http', 400, 'errore',
      'e'' l''unico amministratore: nominane prima un altro');
  end if;
  update public.operatori set ruolo = p_ruolo where nome = v_nome;
  return jsonb_build_object('http', 200,
    'ruoli', (select coalesce(jsonb_object_agg(o.nome, o.ruolo), '{}'::jsonb)
              from public.operatori o));
end $fn$;

-- =============================== 2. imposta_responsabile, niente disattivati ===
-- Testo online (11); in piu' solo il controllo sul disattivato, dopo quello su
-- "non e' ancora entrato". Stesso criterio di app_responsabili() (11), che
-- nella tendina gia' non li propone. Togliere il responsabile (email vuota) o
-- lasciarlo a chi c'era resta possibile: il controllo scatta solo su chi si
-- sceglie adesso.
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
    -- nel ramo: su un progetto senza Planning questa istruzione non si prepara mai
    if to_regclass('public.pl_profiles') is not null then
      if exists (select 1 from public.operatori o join public.pl_profiles p
                   on lower(p.email) = lower(o.email)
                   or p.id::text = to_jsonb(o)->>'profile_id'
                  where lower(o.email) = v_email and p.active = false) then
        return jsonb_build_object('http', 400, 'errore',
          v_nome || ' e'' disattivato nel Planning: i siti si affidano a chi lavora ancora');
      end if;
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

-- ============================================ 3. app_attivita, limite sano ===
-- Testo online (10); cambia solo il limite: nullo = 60 come prima, sotto 1 = 1
-- (prima un negativo era un errore SQL), sopra il tetto di 300 = 300.
create or replace function public.app_attivita(p_limit int default 60)
returns jsonb
language plpgsql stable security definer set search_path = public as $fn$
begin
  if not public.autorizzato() then
    raise exception 'non autorizzato' using errcode = '42501';
  end if;
  return (
  select jsonb_build_object('http', 200, 'attivita', coalesce(jsonb_agg(x), '[]'::jsonb))
  from (
    select jsonb_build_object('ts', e.ts, 'operatore', e.operatore,
                              'id_service', e.id_service, 'anno', e.anno,
                              'mese', e.mese, 'campo', e.campo, 'da', e.da, 'a', e.a,
                              'origine', e.origine, 'op_id', e.op_id,
                              'dettaglio', e.dettaglio,
                              'destinazione', s.destinazione, 'rag_soc', c.rag_soc) as x
    from public.eventi e
    left join public.services s on s.id_service = e.id_service
    left join public.clienti  c on c.id_cliente = s.id_cliente
    order by e.id desc limit greatest(1, least(coalesce(p_limit, 60), 300))
  ) t);
end $fn$;

-- ======================== 4. toggle_cella e bulk_celle, mese e anno sensati ===
-- Testi online (02 + search_path del 10); in piu' solo i controlli, PRIMA di
-- arrivare a _applica (che resta quella del Planning). Mese 1..12 (il vincolo
-- di mappature), anno 2000..2100 (il tracciamento parte dal 2026; in locale
-- api_comune.anni_disponibili tiene 2000 < anno < 2100). Il messaggio e'
-- quello di _fuori_dominio in app/api_comune.py. `x is null or x not between`
-- e non il contrario: `null not between` e' null, e un IF lo leggerebbe falso.
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
  -- la cella non puo' esistere: un 400 come le altre, non l'errore del vincolo
  if p_mese is null or p_mese not between 1 and 12 then
    return jsonb_build_object('http', 400, 'esito', 'non-valido',
      'errore', 'mese fuori da 1..12: ' || coalesce(p_mese::text, 'vuoto'),
      'id_service', p_id_service, 'anno', p_anno, 'mese', p_mese);
  end if;
  if p_anno is null or p_anno not between 2000 and 2100 then
    return jsonb_build_object('http', 400, 'esito', 'non-valido',
      'errore', 'anno non valido: ' || coalesce(p_anno::text, 'vuoto'),
      'id_service', p_id_service, 'anno', p_anno, 'mese', p_mese);
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

-- L'anno sbagliato ferma tutta la richiesta (come bulk in app/api_spunte.py);
-- un mese sbagliato ferma solo la sua cella, con un esito 400, e le altre
-- vanno avanti (prima l'errore del vincolo annullava tutto il blocco). Il mese
-- si guarda come testo prima del cast: '3.5' o 'marzo' davano un altro errore
-- grezzo. `i` avanza anche qui, cosi' gli op_id "<blocco>:<i>" delle celle
-- dopo restano quelli che il client ha in coda.
create or replace function public.bulk_celle(p_anno int, p_celle jsonb,
  p_op_id text default null, p_origine text default 'bulk')
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
  if p_anno is null or p_anno not between 2000 and 2100 then
    return jsonb_build_object('http', 400,
      'errore', 'anno non valido: ' || coalesce(p_anno::text, 'vuoto'));
  end if;
  -- "Completa/Azzera tutte" e' del solo amministratore (#ANCHOR: ruoli):
  -- l'approvatore chiude le proposte ("Approva tutte", origine 'approvazione'),
  -- ma non azzera il lavoro di tutti in un clic.
  if p_origine = 'massa' and not adm then
    return jsonb_build_object('http', 403, 'errore', 'le azioni di massa sono dell''amministratore');
  end if;
  op := public.operatore_corrente();

  for v in select * from jsonb_array_elements(coalesce(p_celle, '[]'::jsonb)) loop
    -- case e non `and`: in SQL l'ordine di un `and` non e' garantito, e il cast
    -- di un mese non numerico non deve mai partire
    if not coalesce(case when v->>'mese' ~ '^[0-9]{1,2}$'
                         then (v->>'mese')::int between 1 and 12 end, false) then
      esiti := esiti || jsonb_build_array(jsonb_build_object(
        'http', 400, 'esito', 'non-valido',
        'errore', 'mese fuori da 1..12: ' || coalesce(v->>'mese', 'vuoto'),
        'id_service', v->'id_service', 'anno', p_anno, 'mese', v->'mese',
        'campo', v->>'campo'));
      i := i + 1;
      continue;
    end if;
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

-- ============================ 5. ripristina_blocco, blocco vuoto = 200 n=0 ===
-- Testo del 12 (quello online); cambia solo quando si risponde 404. Prima si
-- guardava `i`, che conta i passi RIPRISTINATI: un blocco di sole righe
-- 'responsabile' (11) o di passi senza `da` dava "nessuna modifica con questo
-- identificativo", come se l'op_id fosse sbagliato. Ora `trovati` conta le
-- righe del diario del blocco: 404 solo se sono zero, altrimenti 200 con
-- esiti [], n 0 e celle [] (come `if not eventi` in app/api_spunte.py).
create or replace function public.ripristina_blocco(p_op_id text)
returns jsonb
language plpgsql security definer set search_path = public as $fn$
declare
  e public.eventi%rowtype; ris jsonb; op text; i int := 0; n int := 0; trovati int := 0;
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

  -- il blocco si confronta per prefisso esatto: in un confronto a modello un
  -- '%' o un '_' dentro p_op_id farebbero da jolly
  for e in select * from public.eventi
            where op_id = p_op_id or left(op_id, length(p_op_id) + 1) = p_op_id || ':'
            order by id desc loop
    trovati := trovati + 1;
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
  if trovati = 0 then
    return jsonb_build_object('http', 404, 'errore', 'nessuna modifica con questo identificativo');
  end if;
  select count(*) into n from jsonb_object_keys(celle);
  return jsonb_build_object('http', 200, 'esiti', esiti, 'n', n, 'blocco', blocco,
    'celle', (select coalesce(jsonb_agg(v), '[]'::jsonb) from jsonb_each(celle) as t(kk, v)));
end $fn$;

-- ================================================================ permessi ===
-- `create or replace` tiene i permessi che c'erano (online: solo authenticated
-- e service_role); queste righe servono a un progetto nuovo, dove una funzione
-- creata da capo nasce eseguibile da PUBLIC. Solo queste sei, per firma esatta.
revoke execute on function
  public.imposta_ruolo(text, text),
  public.imposta_responsabile(int[], text),
  public.app_attivita(int),
  public.toggle_cella(int, int, int, text, int, int, int, text, text),
  public.bulk_celle(int, jsonb, text, text),
  public.ripristina_blocco(text)
from public, anon;

grant execute on function
  public.imposta_ruolo(text, text),
  public.imposta_responsabile(int[], text),
  public.app_attivita(int),
  public.toggle_cella(int, int, int, text, int, int, int, text, text),
  public.bulk_celle(int, jsonb, text, text),
  public.ripristina_blocco(text)
to authenticated;

-- ================================================================ controllo ===
-- Dopo averlo eseguito, tutte le colonne devono essere `true` (una riga per
-- funzione, sei righe). Prima di applicarlo `correzione_presente` e' `false`.
select p.oid::regprocedure::text                                  as funzione,
       p.prosecdef                                                as definer,
       coalesce(array_to_string(p.proconfig, ',') like '%search_path=public%', false)
                                                                  as search_path_fisso,
       not has_function_privilege('anon', p.oid, 'execute')       as anon_fuori,
       has_function_privilege('authenticated', p.oid, 'execute')  as login_dentro,
       case p.proname
         when 'imposta_ruolo'        then position('p.active = false' in p.prosrc) > 0
                                      and position('v_bersaglio' in p.prosrc) > 0
         when 'imposta_responsabile' then position('disattivato nel Planning' in p.prosrc) > 0
         when 'app_attivita'         then position('greatest(1, least(coalesce(p_limit, 60), 300))' in p.prosrc) > 0
         when 'toggle_cella'         then position('mese fuori da 1..12' in p.prosrc) > 0
                                      and position('between 2000 and 2100' in p.prosrc) > 0
         when 'bulk_celle'           then position('mese fuori da 1..12' in p.prosrc) > 0
                                      and position('between 2000 and 2100' in p.prosrc) > 0
         when 'ripristina_blocco'    then position('if trovati = 0 then' in p.prosrc) > 0
                                      and position('like' in lower(p.prosrc)) = 0
       end                                                        as correzione_presente
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public'
   and p.proname in ('imposta_ruolo', 'imposta_responsabile', 'app_attivita',
                     'toggle_cella', 'bulk_celle', 'ripristina_blocco')
 order by 1;

-- Il conto che ora usa imposta_ruolo, senza nomi: `admin_attivi` deve essere
-- almeno 1 (se e' 1, quell'amministratore non puo' declassarsi).
select count(*) filter (where o.email is not null)                as admin_con_casella,
       count(*) filter (where lower(o.email) like '%@vrs-tech.it'
                          and not exists (select 1 from public.pl_profiles p
                                           where p.active = false
                                             and (lower(p.email) = lower(o.email)
                                                  or p.id::text = to_jsonb(o)->>'profile_id')))
                                                                  as admin_attivi
  from public.operatori o
 where o.ruolo = 'admin';
