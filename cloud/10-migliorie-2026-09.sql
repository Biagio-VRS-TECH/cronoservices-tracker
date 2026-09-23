-- 10-migliorie-2026-09.sql - confine col Planning, PDF nel cestino, diario archiviato.
--
-- Il piano e' planning/docs/migliorie-2026-09.md (corsia L2). In ordine:
--   1. SEC-01  autorizzato(): dominio aziendale E non disattivato nel Planning;
--   2. SEC-20  search_path fisso sulle funzioni che non l'avevano;
--   3. SEC-05  i PDF si cancellano "per finta": cestino, evento nel diario,
--              definitiva solo all'amministratore o a chi ha caricato il file;
--   4. SEC-11  azzera_diario() archivia invece di buttare;
--   5. BUG-08 / SEC-10  permessi per NOME e solo sugli oggetti di CronoService;
--   6. SEC-04  la chiave dedicata della edge function crono-sync.
--
-- Si puo' rilanciare: `create or replace`, `if not exists`, `drop ... if exists`,
-- grant e revoke. L'unica scrittura su righe esistenti e' il riempimento di
-- `documenti.creato_uid` (parte 3), che tocca solo le righe dove e' ancora vuoto.
--
-- Ordine: dopo 01-09. Sul database condiviso col Planning NON si rilanciano
-- 01-08 (vedi LEGGIMI.md); questo file basta da solo.
--
-- Da sapere prima di applicarlo (contratto con web/js/documenti.js, corsia L9):
-- dopo questo file lo Storage non lascia piu' cancellare un PDF che ha ancora
-- una riga (in `documenti` o nel cestino). Il client di oggi cancella l'oggetto
-- PRIMA di chiamare elimina_documento: con questo file applicato quel passo
-- risponde 400 e il cestino non parte (nessun dato perso, ma il pulsante da'
-- errore) finche' non arriva il client nuovo, che chiama solo il server.
-- Applicare questo file e pubblicare il client di L9 insieme.

-- ================================================ 1. SEC-01 regola minima ===
-- Prima: bastava una casella @vrs-tech.it. Un profilo DISATTIVATO nel Planning
-- (pl_profiles.active = false) entrava lo stesso in CronoService, perche' il
-- login con la password riesce ancora.
-- Ora: dominio aziendale E "non disattivato nel Planning". Scritta come NON
-- disattivato e non come attivo: l'amministratore di CronoService
-- (administrator@) non ha un profilo nel Planning e deve continuare a entrare.
-- SECURITY DEFINER: pl_profiles ha le sue policy, e questa domanda deve avere
-- la stessa risposta per tutti. Gira anche dentro le policy RLS e Realtime,
-- percio' il JWT resta quello di chi chiede (auth.uid() legge i claims).
-- Su un progetto senza Planning (nessuna pl_profiles) resta la regola vecchia.
do $blocco$
begin
  if to_regclass('public.pl_profiles') is not null then
    execute $def$
      create or replace function public.autorizzato() returns boolean
      language sql stable security definer set search_path = public, pg_temp as $fn$
        select coalesce(public.email_corrente() like '%@vrs-tech.it', false)
           and not exists (select 1 from public.pl_profiles p
                            where p.id = auth.uid() and p.active = false)
      $fn$
    $def$;
  else
    execute $def$
      create or replace function public.autorizzato() returns boolean
      language sql stable security definer set search_path = public, pg_temp as $fn$
        select coalesce(public.email_corrente() like '%@vrs-tech.it', false)
      $fn$
    $def$;
  end if;
end $blocco$;

-- ============================================ 2. SEC-20 search_path fisso ===
-- L'advisor di Supabase ne segnalava 14 (autorizzato e' gia' sistemata sopra).
-- `alter function` cambia solo l'impostazione, non il testo: `_applica` tiene
-- il controllo che vi ha aggiunto il Planning (033/036/037).
-- pg_trgm nello schema public NON si sposta qui: lo usa il Planning
-- (pl_tasks_title_trgm, pl_search), e' della corsia L1.
do $blocco$
declare f regprocedure;
begin
  for f in
    select p.oid::regprocedure
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proconfig is null
       and p.proname = any (array['_applica','_cella_out','_cella_vuota','_doc_out',
                                  '_documenti_json','_mese_scadenza','_presenti',
                                  '_scad_effettiva','_valore_per_ruolo',
                                  '_voce_dizionario_out','email_corrente',
                                  'operatore_corrente','ts_locale'])
  loop
    execute format('alter function %s set search_path = public', f);
  end loop;
end $blocco$;

-- ========================================== 3. SEC-05 PDF nel cestino =======
-- Prima: qualunque operatore cancellava qualunque PDF (policy Storage e
-- elimina_documento guardavano solo autorizzato()), senza una riga nel diario.
-- Ora:
--   * elimina_documento / elimina_documenti (stessa firma, stessa risposta)
--     SPOSTANO la riga in `documenti_cestino`: per Realtime e' una DELETE su
--     `documenti`, quindi gli altri client tolgono l'icona come prima;
--   * ripristina_documento la rimette (per Realtime un INSERT);
--   * elimina_documento_definitivo e svuota_cestino_documenti tolgono la riga
--     per sempre: solo l'amministratore o chi ha caricato il file (il
--     secondo, solo per il suo); poi il client cancella l'oggetto;
--   * lo Storage lascia cancellare un oggetto solo all'amministratore o a chi
--     l'ha caricato, e solo se nessuna riga lo usa piu'.
-- Ogni passo lascia una riga nel diario (campo 'documento').

-- chi ha caricato il file: nasce da solo, dal JWT di chi chiama registra_documento
alter table public.documenti add column if not exists creato_uid uuid default auth.uid();
alter table public.documenti alter column creato_uid set default auth.uid();
update public.documenti d
   set creato_uid = o.owner_id::uuid
  from storage.objects o
 where o.bucket_id = 'documenti' and o.name = d.percorso
   and d.creato_uid is null
   and o.owner_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';

-- il diario prende una colonna di testo per dire QUALE documento (nome del file)
alter table public.eventi add column if not exists dettaglio text;

create table if not exists public.documenti_cestino (
  like public.documenti including defaults,
  eliminato_il  timestamptz not null default now(),
  eliminato_da  text not null default '?',
  eliminato_uid uuid default auth.uid(),
  primary key (id)
);
create index if not exists ix_doc_cestino_il on public.documenti_cestino(eliminato_il);
-- nessuna policy e nessun grant: si passa solo dalle funzioni qui sotto
alter table public.documenti_cestino enable row level security;
revoke all on public.documenti_cestino from public, anon, authenticated;

-- Usata dalla policy dello Storage, che gira coi permessi di chi chiede e il
-- cestino non lo vede: per questo SECURITY DEFINER. Dice solo si'/no.
create or replace function public._documento_in_uso(p_percorso text) returns boolean
language sql stable security definer set search_path = public, pg_temp as $fn$
  select exists (select 1 from public.documenti d where d.percorso = p_percorso)
      or exists (select 1 from public.documenti_cestino c where c.percorso = p_percorso)
$fn$;

drop policy if exists documenti_leggi   on storage.objects;
drop policy if exists documenti_carica  on storage.objects;
drop policy if exists documenti_elimina on storage.objects;
create policy documenti_leggi on storage.objects for select to authenticated
  using (bucket_id = 'documenti' and (select public.autorizzato()));
create policy documenti_carica on storage.objects for insert to authenticated
  with check (bucket_id = 'documenti' and (select public.autorizzato())
              and lower(storage.extension(name)) = 'pdf');
create policy documenti_elimina on storage.objects for delete to authenticated
  using (bucket_id = 'documenti' and (select public.autorizzato())
         and ((select public.e_admin()) or owner_id = (select auth.uid())::text)
         and not public._documento_in_uso(name));

-- una riga di diario per un documento; interna
create or replace function public._doc_evento(
  p_id_service int, p_anno int, p_mese int, p_nome text, p_origine text)
returns void
language sql security definer set search_path = public, pg_temp as $fn$
  insert into public.eventi(ts, operatore, id_service, anno, mese, campo, origine, dettaglio)
  values (public.ts_locale(), public.operatore_corrente(), p_id_service, p_anno,
          p_mese, 'documento', p_origine, left(p_nome, 200))
$fn$;

-- Stessa firma e stessa risposta di prima ({http, eliminato, percorso}), piu'
-- `cestino: true`. Il file NON si tocca: il client non deve piu' cancellarlo.
create or replace function public.elimina_documento(p_id text)
returns jsonb
language plpgsql security definer set search_path = public as $fn$
declare d public.documenti%rowtype;
begin
  if not public.autorizzato() then
    raise exception 'non autorizzato' using errcode = '42501';
  end if;
  delete from public.documenti where id = p_id returning * into d;
  if d.id is null then
    -- gia' nel cestino (doppio clic, due schede): e' gia' cosi', non un errore
    if exists (select 1 from public.documenti_cestino c where c.id = p_id) then
      return jsonb_build_object('http', 200, 'eliminato', p_id, 'cestino', true,
        'percorso', (select c.percorso from public.documenti_cestino c where c.id = p_id));
    end if;
    return jsonb_build_object('http', 404, 'errore', 'documento non trovato');
  end if;
  insert into public.documenti_cestino(
    id, id_service, anno, mese, nome, percorso, bytes, pagine, anteprima,
    creato_il, creato_da, gruppo, fascicolo, fascicoli, tipo, creato_uid,
    eliminato_il, eliminato_da, eliminato_uid)
  values (d.id, d.id_service, d.anno, d.mese, d.nome, d.percorso, d.bytes, d.pagine,
          d.anteprima, d.creato_il, d.creato_da, d.gruppo, d.fascicolo, d.fascicoli,
          d.tipo, d.creato_uid, now(), public.operatore_corrente(), auth.uid());
  perform public._doc_evento(d.id_service, d.anno, d.mese, d.nome, 'cestino');
  return jsonb_build_object('http', 200, 'eliminato', d.id, 'percorso', d.percorso,
                            'cestino', true);
end $fn$;

-- In blocco: stesse regole di prima (un ANNO solo l'amministratore, un SITO
-- chiunque), stessa risposta, ma nel cestino. `eliminati[].percorso` resta per
-- compatibilita': lo Storage comunque non lascia cancellare quei file.
create or replace function public.elimina_documenti(
  p_anno int default null, p_id_service int default null)
returns jsonb
language plpgsql security definer set search_path = public as $fn$
declare via jsonb; peso bigint; op text;
begin
  if not public.autorizzato() then
    raise exception 'non autorizzato' using errcode = '42501';
  end if;
  if (p_anno is null) = (p_id_service is null) then
    return jsonb_build_object('http', 400, 'errore',
                              'serve anno OPPURE id_service, non entrambi');
  end if;
  if p_anno is not null and not public.e_admin() then
    return jsonb_build_object('http', 403, 'errore',
                              'questa azione e'' dell''amministratore');
  end if;
  op := public.operatore_corrente();

  with tolti as (
    delete from public.documenti d
     where (p_anno is not null and d.anno = p_anno)
        or (p_id_service is not null and d.id_service = p_id_service)
    returning d.*
  ), nel_cestino as (
    insert into public.documenti_cestino(
      id, id_service, anno, mese, nome, percorso, bytes, pagine, anteprima,
      creato_il, creato_da, gruppo, fascicolo, fascicoli, tipo, creato_uid,
      eliminato_il, eliminato_da, eliminato_uid)
    select id, id_service, anno, mese, nome, percorso, bytes, pagine, anteprima,
           creato_il, creato_da, gruppo, fascicolo, fascicoli, tipo, creato_uid,
           now(), op, auth.uid()
      from tolti
    returning 1
  ), nel_diario as (
    insert into public.eventi(ts, operatore, id_service, anno, mese, campo, origine, dettaglio)
    select public.ts_locale(), op, id_service, anno, mese, 'documento', 'cestino', left(nome, 200)
      from tolti
    returning 1
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', id, 'id_service', id_service, 'anno', anno,
           'percorso', percorso) order by creato_il), '[]'::jsonb),
         coalesce(sum(coalesce(bytes, 0)), 0)
    into via, peso
    from tolti;

  return jsonb_build_object('http', 200, 'eliminati', via,
                            'n', jsonb_array_length(via), 'bytes', peso,
                            'cestino', true);
end $fn$;

-- Dal cestino di nuovo in archivio. Chiunque sia autorizzato: e' il "disfa"
-- di un clic che chiunque puo' fare. Se il file nel bucket non c'e' piu' (un
-- client vecchio l'aveva gia' cancellato) la riga non torna: niente icone che
-- aprono il vuoto.
create or replace function public.ripristina_documento(p_id text)
returns jsonb
language plpgsql security definer set search_path = public as $fn$
declare c public.documenti_cestino%rowtype; d public.documenti%rowtype;
begin
  if not public.autorizzato() then
    raise exception 'non autorizzato' using errcode = '42501';
  end if;
  select * into c from public.documenti_cestino where id = p_id for update;
  if c.id is null then
    return jsonb_build_object('http', 404, 'errore', 'documento non trovato nel cestino');
  end if;
  if not exists (select 1 from storage.objects o
                  where o.bucket_id = 'documenti' and o.name = c.percorso) then
    return jsonb_build_object('http', 410, 'errore',
      'il file non c''e'' piu'' nello Storage: non si puo'' ripristinare');
  end if;
  delete from public.documenti_cestino where id = p_id;
  insert into public.documenti(
    id, id_service, anno, mese, nome, percorso, bytes, pagine, anteprima,
    creato_il, creato_da, gruppo, fascicolo, fascicoli, tipo, creato_uid)
  values (c.id, c.id_service, c.anno, c.mese, c.nome, c.percorso, c.bytes, c.pagine,
          c.anteprima, c.creato_il, c.creato_da, c.gruppo, c.fascicolo, c.fascicoli,
          c.tipo, c.creato_uid)
  returning * into d;
  perform public._doc_evento(d.id_service, d.anno, d.mese, d.nome, 'ripristinato');
  return jsonb_build_object('http', 200, 'documento', public._doc_out(d));
end $fn$;

-- Per sempre: solo l'amministratore, o chi ha caricato quel file. Prende il
-- documento dal cestino o, se e' ancora in archivio, direttamente da li'.
-- Risponde col `percorso`: l'oggetto lo cancella il client DOPO (da SQL lo
-- Storage non lo permette), e ora la policy glielo lascia fare.
create or replace function public.elimina_documento_definitivo(p_id text)
returns jsonb
language plpgsql security definer set search_path = public as $fn$
declare v_id text; v_uid uuid; v_perc text; v_sid int; v_anno int; v_mese int; v_nome text;
begin
  if not public.autorizzato() then
    raise exception 'non autorizzato' using errcode = '42501';
  end if;
  select c.id, c.creato_uid, c.percorso, c.id_service, c.anno, c.mese, c.nome
    into v_id, v_uid, v_perc, v_sid, v_anno, v_mese, v_nome
    from public.documenti_cestino c where c.id = p_id for update;
  if v_id is null then
    select d.id, d.creato_uid, d.percorso, d.id_service, d.anno, d.mese, d.nome
      into v_id, v_uid, v_perc, v_sid, v_anno, v_mese, v_nome
      from public.documenti d where d.id = p_id for update;
  end if;
  if v_id is null then
    return jsonb_build_object('http', 404, 'errore', 'documento non trovato');
  end if;
  if not public.e_admin() and v_uid is distinct from auth.uid() then
    return jsonb_build_object('http', 403, 'errore',
      'si cancella per sempre solo un file caricato da te (o dall''amministratore)');
  end if;
  delete from public.documenti_cestino where id = v_id;
  delete from public.documenti where id = v_id;
  perform public._doc_evento(v_sid, v_anno, v_mese, v_nome, 'definitivo');
  return jsonb_build_object('http', 200, 'eliminato', v_id, 'percorso', v_perc);
end $fn$;

-- Svuota il cestino di quello che ci sta da piu' di p_giorni (30 di norma).
-- Solo l'amministratore. Risponde coi percorsi da togliere dallo Storage.
create or replace function public.svuota_cestino_documenti(p_giorni int default 30)
returns jsonb
language plpgsql security definer set search_path = public as $fn$
declare via jsonb; peso bigint;
begin
  if not public.autorizzato() then
    raise exception 'non autorizzato' using errcode = '42501';
  end if;
  if not public.e_admin() then
    return jsonb_build_object('http', 403, 'errore', 'questa azione e'' dell''amministratore');
  end if;
  with tolti as (
    delete from public.documenti_cestino c
     where c.eliminato_il < now() - make_interval(days => greatest(coalesce(p_giorni, 30), 0))
    returning c.*
  ), nel_diario as (
    insert into public.eventi(ts, operatore, id_service, anno, mese, campo, origine, dettaglio)
    select public.ts_locale(), public.operatore_corrente(), id_service, anno, mese,
           'documento', 'definitivo', left(nome, 200)
      from tolti
    returning 1
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', id, 'id_service', id_service, 'anno', anno,
           'percorso', percorso) order by eliminato_il), '[]'::jsonb),
         coalesce(sum(coalesce(bytes, 0)), 0)
    into via, peso
    from tolti;
  return jsonb_build_object('http', 200, 'eliminati', via,
                            'n', jsonb_array_length(via), 'bytes', peso);
end $fn$;

-- Il contenuto del cestino, per la finestra dei documenti (L9). `eliminabile`
-- dice se chi chiede puo' cancellarlo per sempre.
create or replace function public.app_cestino_documenti()
returns jsonb
language plpgsql stable security definer set search_path = public as $fn$
declare adm boolean := public.e_admin();
begin
  if not public.autorizzato() then
    raise exception 'non autorizzato' using errcode = '42501';
  end if;
  return jsonb_build_object('http', 200, 'cestino', coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', c.id, 'id_service', c.id_service, 'anno', c.anno, 'mese', c.mese,
             'nome', c.nome, 'percorso', c.percorso, 'bytes', c.bytes,
             'pagine', c.pagine, 'anteprima', c.anteprima,
             'creato_il', c.creato_il, 'creato_da', c.creato_da,
             'gruppo', c.gruppo, 'fascicolo', c.fascicolo, 'fascicoli', c.fascicoli,
             'tipo', coalesce(c.tipo, 'schede'),
             'eliminato_il', c.eliminato_il, 'eliminato_da', c.eliminato_da,
             'eliminabile', adm or c.creato_uid = auth.uid())
           order by c.eliminato_il desc)
      from public.documenti_cestino c), '[]'::jsonb));
end $fn$;

-- Il diario ora porta anche `dettaglio` (il nome del documento, "n righe
-- archiviate"): stesso testo di 03-letture.sql, una chiave in piu'.
create or replace function public.app_storia(p_id_service int, p_anno int, p_mese int)
returns jsonb
language plpgsql stable security definer set search_path = public as $fn$
begin
  if not public.autorizzato() then
    raise exception 'non autorizzato' using errcode = '42501';
  end if;
  return (
  select jsonb_build_object('http', 200, 'storia', coalesce(jsonb_agg(x), '[]'::jsonb))
  from (
    select jsonb_build_object('ts', e.ts, 'operatore', e.operatore,
                              'campo', e.campo, 'da', e.da, 'a', e.a, 'origine', e.origine,
                              'op_id', e.op_id, 'dettaglio', e.dettaglio) as x
    from public.eventi e
    where e.id_service = p_id_service and e.anno = p_anno and e.mese = p_mese
    order by e.id desc limit 50
  ) t);
end $fn$;

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
    order by e.id desc limit least(coalesce(p_limit, 60), 300)
  ) t);
end $fn$;

-- ================================= 4. SEC-11 il diario si archivia, non sparisce
-- Prima: azzera_diario() buttava tutte le righe di `eventi`, e con loro ogni
-- traccia di chi aveva fatto cosa. Ora le copia in `crono_archivio.eventi`, uno
-- schema che PostgREST non espone e su cui anon e authenticated non hanno
-- nessun permesso (lo legge solo chi entra dal pannello di Supabase), poi le
-- toglie e lascia UNA riga: chi ha azzerato, quando e quante righe.
-- Per l'app non cambia niente: il diario riparte vuoto (piu' quella riga),
-- `ripristina_blocco` sulle righe archiviate non funziona piu', come prima.
-- Conservazione: 24 mesi (SEC-11), da potare a mano:
--   delete from crono_archivio.eventi where archiviato_il < now() - interval '24 months';
create schema if not exists crono_archivio;
revoke all on schema crono_archivio from public, anon, authenticated;

create table if not exists crono_archivio.eventi (
  like public.eventi,
  archiviato_il timestamptz not null default now(),
  archiviato_da text not null default '?'
);
create index if not exists ix_arch_eventi_id on crono_archivio.eventi(id);
revoke all on crono_archivio.eventi from public, anon, authenticated;

create or replace function public.azzera_diario()
returns jsonb
language plpgsql security definer set search_path = public as $fn$
declare n bigint; op text;
begin
  if not public.autorizzato() then
    raise exception 'non autorizzato' using errcode = '42501';
  end if;
  if not public.e_admin() then
    return jsonb_build_object('http', 403, 'errore', 'questa azione e'' dell''amministratore');
  end if;
  op := public.operatore_corrente();
  -- due azzeramenti insieme: il secondo aspetta il primo e trova il diario vuoto
  lock table public.eventi in share row exclusive mode;
  insert into crono_archivio.eventi(id, ts, operatore, id_service, anno, mese, campo,
                                    da, a, op_id, origine, dettaglio,
                                    archiviato_il, archiviato_da)
  select id, ts, operatore, id_service, anno, mese, campo, da, a, op_id, origine,
         dettaglio, now(), op
    from public.eventi where id > 0;
  get diagnostics n = row_count;
  -- IL `where` NON E' DECORATIVO: vedi 03-letture.sql (pg-safeupdate).
  delete from public.eventi where id > 0;
  insert into public.eventi(ts, operatore, campo, origine, dettaglio)
  values (public.ts_locale(), op, 'diario', 'azzerato',
          n || case when n = 1 then ' riga archiviata' else ' righe archiviate' end);
  return jsonb_build_object('http', 200, 'n', n, 'archiviate', n);
end $fn$;

-- ================================= 5. BUG-08 / SEC-10 permessi, per nome =====
-- Solo oggetti di CronoService, e per NOME: tutte le firme che esistono.
do $blocco$
declare f regprocedure;
begin
  -- interne: nessuno da fuori
  for f in
    select p.oid::regprocedure
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname = any (array['_doc_evento','_documento_in_uso','autorizzato',
                                  'ripristina_documento','elimina_documento_definitivo',
                                  'svuota_cestino_documenti','app_cestino_documenti',
                                  'elimina_documento','elimina_documenti',
                                  'registra_documento','app_documenti',
                                  'azzera_diario','app_storia','app_attivita'])
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
  end loop;
  -- quelle che l'app chiama, e quelle che le policy valutano coi permessi di
  -- chi chiede (autorizzato, _documento_in_uso): solo chi ha fatto il login
  for f in
    select p.oid::regprocedure
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname = any (array['_documento_in_uso','autorizzato',
                                  'ripristina_documento','elimina_documento_definitivo',
                                  'svuota_cestino_documenti','app_cestino_documenti',
                                  'elimina_documento','elimina_documenti',
                                  'registra_documento','app_documenti',
                                  'azzera_diario','app_storia','app_attivita'])
  loop
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $blocco$;

-- ============================== 6. SEC-04 chiave dedicata per la sincronia ===
-- La edge function planning/supabase/functions/crono-sync esegue sync_applica
-- per conto del PC dell'ufficio, che cosi' non tiene piu' la service_role.
-- Qui nasce la sua chiave (48 caratteri casuali), una volta sola: rilanciando
-- il file non cambia. Si legge dall'SQL Editor e va in app/cloud.json come
-- "sync_key" (vedi LEGGIMI.md, §6-bis):
--   select value from public.pl_secrets where key = 'crono_sync_key';
do $blocco$
begin
  if to_regclass('public.pl_secrets') is not null then
    insert into public.pl_secrets(key, value)
    values ('crono_sync_key',
            translate(encode(extensions.gen_random_bytes(36), 'base64'), '+/', '-_'))
    on conflict (key) do nothing;
  end if;
end $blocco$;

-- ================================================================ controllo ===
-- 1) Chi resterebbe fuori con la nuova autorizzato(): deve uscire solo chi e'
--    disattivato nel Planning (il 23/09: test.demetrio). administrator@ resta
--    dentro anche senza profilo.
select u.email, p.active as attivo_nel_planning,
       (p.id is null) as senza_profilo,
       (lower(u.email) like '%@vrs-tech.it'
        and not coalesce(p.active = false, false)) as entra_in_cronoservice
  from auth.users u left join public.pl_profiles p on p.id = u.id
 order by entra_in_cronoservice, u.email;

-- 2) Nessuna funzione di CronoService senza search_path (deve tornare zero righe).
select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.proname !~ '^pl_' and p.proconfig is null
   and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e');

-- 3) Permessi: anon niente, authenticated solo quelle giuste.
select p.proname,
       has_function_privilege('anon', p.oid, 'execute')          as anon_esegue,
       has_function_privilege('authenticated', p.oid, 'execute') as login_esegue
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public'
   and p.proname in ('autorizzato','_documento_in_uso','_doc_evento','elimina_documento',
                     'elimina_documenti','ripristina_documento','elimina_documento_definitivo',
                     'svuota_cestino_documenti','app_cestino_documenti','azzera_diario',
                     'registra_documento')
 order by 1;

-- 4) Il cestino e l'archivio non si leggono da fuori (tutto false).
select has_table_privilege('authenticated', 'public.documenti_cestino', 'select') as cestino_login,
       has_table_privilege('anon', 'public.documenti_cestino', 'select')          as cestino_anon,
       has_schema_privilege('authenticated', 'crono_archivio', 'usage')           as archivio_login,
       has_schema_privilege('anon', 'crono_archivio', 'usage')                    as archivio_anon;

-- 5) Ogni documento ha chi l'ha caricato (creato_uid vuoto = zero righe).
select id, nome, creato_da from public.documenti where creato_uid is null;
