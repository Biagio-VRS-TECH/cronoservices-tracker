-- 06-documenti.sql - i PDF delle schede tecnici, online.
--
-- Il generatore di schede (web/schede/) quando stampa produce anche un PDF e lo
-- consegna al tracker: il file va nel bucket Storage `documenti`, la riga qui
-- sotto lo lega al SITO e all'anno della mappatura e mette la spunta "stampata"
-- sul mese giusto, con le stesse regole di merge di toggle_cella. E' il
-- gemello di api.salva_documento (#ANCHOR: documenti in app/api.py).
--
-- Ordine: dopo i primi cinque file. Poi RIESEGUIRE 03-letture.sql, perche'
-- app_bootstrap ora porta anche l'elenco dei documenti dell'anno.

-- --------------------------------------------------------------- tabella ---
create table if not exists public.documenti (
  id          text primary key,
  id_service  integer not null,
  anno        integer not null,
  mese        integer,
  nome        text not null,
  percorso    text not null,          -- oggetto nel bucket: <anno>/<id_service>/<file>
  bytes       integer not null default 0,
  pagine      integer not null default 0,
  anteprima   text,                   -- miniatura JPEG della prima pagina, data URL
  creato_il   text not null,
  creato_da   text not null default '?'
);
create index if not exists ix_doc_anno on public.documenti(anno, id_service);
-- Un documento diviso in FASCICOLI e' un PDF per fascicolo, tutti con lo stesso
-- `gruppo`; `fascicolo` 1..N, `fascicoli` = N. Un PDF unico: null.
alter table public.documenti add column if not exists gruppo    text;
alter table public.documenti add column if not exists fascicolo integer;
alter table public.documenti add column if not exists fascicoli integer;
-- Realtime deve poter dire ANCHE chi era la riga cancellata (sito e anno), non
-- solo la chiave: senza, il tracker non saprebbe da quale riga togliere l'icona.
alter table public.documenti replica identity full;

alter table public.documenti enable row level security;
drop policy if exists leggi_azienda on public.documenti;
create policy leggi_azienda on public.documenti for select to authenticated
  using (public.autorizzato());
grant select on public.documenti to authenticated;

-- ---------------------------------------------------------------- bucket ---
-- Privato: si legge solo con un indirizzo firmato chiesto da chi e' entrato.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('documenti', 'documenti', false, 41943040, array['application/pdf'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists documenti_leggi   on storage.objects;
drop policy if exists documenti_carica  on storage.objects;
drop policy if exists documenti_elimina on storage.objects;
create policy documenti_leggi on storage.objects for select to authenticated
  using (bucket_id = 'documenti' and public.autorizzato());
create policy documenti_carica on storage.objects for insert to authenticated
  with check (bucket_id = 'documenti' and public.autorizzato()
              and lower(storage.extension(name)) = 'pdf');
create policy documenti_elimina on storage.objects for delete to authenticated
  using (bucket_id = 'documenti' and public.autorizzato());

-- -------------------------------------------------------------- funzioni ---
create or replace function public._doc_out(d public.documenti) returns jsonb
language sql immutable as $fn$
  select jsonb_build_object(
    'id', d.id, 'id_service', d.id_service, 'anno', d.anno, 'mese', d.mese,
    'nome', d.nome, 'percorso', d.percorso, 'bytes', d.bytes, 'pagine', d.pagine,
    'anteprima', d.anteprima, 'creato_il', d.creato_il, 'creato_da', d.creato_da,
    'gruppo', d.gruppo, 'fascicolo', d.fascicolo, 'fascicoli', d.fascicoli)
$fn$;

-- Senza anno (null) tutti i documenti: lo storico dei PDF non scade con l'anno.
create or replace function public._documenti_json(p_anno int) returns jsonb
language sql stable as $fn$
  select coalesce(jsonb_agg(public._doc_out(d) order by d.creato_il), '[]'::jsonb)
    from public.documenti d where p_anno is null or d.anno = p_anno
$fn$;

create or replace function public.app_documenti(p_anno int default null)
returns jsonb
language plpgsql stable security definer set search_path = public as $fn$
begin
  if not public.autorizzato() then
    raise exception 'non autorizzato' using errcode = '42501';
  end if;
  return jsonb_build_object('anno', p_anno, 'documenti', public._documenti_json(p_anno));
end $fn$;

-- Il client ha gia' caricato il PDF nel bucket: qui si registra la riga e si
-- mette la spunta. Se l'oggetto non c'e' davvero nello Storage la riga non
-- nasce: niente icone che puntano nel vuoto.
-- La firma e' cresciuta (gruppo/fascicolo/fascicoli): la vecchia va tolta.
drop function if exists public.registra_documento(int, int, int, text, text, int, int, text);
create or replace function public.registra_documento(
  p_id_service int, p_anno int, p_mese int, p_nome text, p_percorso text,
  p_bytes int default 0, p_pagine int default 0, p_anteprima text default null,
  p_gruppo text default null, p_fascicolo int default null, p_fascicoli int default null)
returns jsonb
language plpgsql security definer set search_path = public as $fn$
declare
  op    text;
  s     public.services%rowtype;
  d     public.documenti%rowtype;
  mese  int := p_mese;
  cella jsonb := null;
  ant   text := p_anteprima;
begin
  if not public.autorizzato() then
    raise exception 'non autorizzato' using errcode = '42501';
  end if;
  op := public.operatore_corrente();

  select * into s from public.services where id_service = p_id_service;
  if s.id_service is null then
    return jsonb_build_object('http', 404, 'errore', 'service #' || p_id_service || ' sconosciuto');
  end if;
  if not exists (select 1 from storage.objects
                  where bucket_id = 'documenti' and name = p_percorso) then
    return jsonb_build_object('http', 400, 'errore', 'file non trovato nello Storage: ' || p_percorso);
  end if;
  if ant is not null and (ant not like 'data:image/jpeg;base64,%' or length(ant) > 80000) then
    ant := null;
  end if;
  if mese is null or mese < 1 or mese > 12 then
    mese := public._mese_scadenza(s, p_anno);
  end if;

  insert into public.documenti(id, id_service, anno, mese, nome, percorso, bytes,
                               pagine, anteprima, creato_il, creato_da,
                               gruppo, fascicolo, fascicoli)
  values (replace(gen_random_uuid()::text, '-', ''), p_id_service, p_anno,
          nullif(mese, 0), coalesce(nullif(p_nome, ''), 'schede.pdf'), p_percorso,
          coalesce(p_bytes, 0), coalesce(p_pagine, 0), ant, public.ts_locale(), op,
          nullif(regexp_replace(coalesce(p_gruppo, ''), '[^0-9a-f]', '', 'g'), ''),
          case when coalesce(p_gruppo, '') = '' then null else nullif(p_fascicolo, 0) end,
          case when coalesce(p_gruppo, '') = '' then null else nullif(p_fascicoli, 0) end)
  returning * into d;

  if mese > 0 then
    cella := public._applica(op, p_id_service, p_anno, mese, 'stampata', 1,
                             null, null, null, 'schede');
  end if;

  return jsonb_build_object('http', 200, 'documento', public._doc_out(d),
                            'mese', mese, 'cella', cella);
end $fn$;

-- Toglie la riga; l'oggetto nel bucket lo cancella il client PRIMA di chiamare
-- (cancellarlo da SQL lascerebbe il file orfano nello Storage). La spunta
-- "stampata" resta: e' una decisione dell'operatore.
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
    return jsonb_build_object('http', 404, 'errore', 'documento non trovato');
  end if;
  return jsonb_build_object('http', 200, 'eliminato', d.id, 'percorso', d.percorso);
end $fn$;

-- CANCELLAZIONE IN BLOCCO, per liberare spazio (#ANCHOR: documenti).
-- Due perimetri, mai insieme: un ANNO intero (potatura d'archivio, solo
-- l'amministratore, come `ripristina_blocco`) oppure un SITO, tutti i suoi
-- anni (chiunque: e' lo stesso potere di `elimina_documento`, in un clic
-- invece di N). Le spunte "stampata" restano.
--
-- Gli oggetti nel bucket li cancella il CLIENT, prima di chiamare, con la
-- lista che ha in memoria (`st.documenti` e' lo specchio di questa tabella).
-- Qui si tolgono le righe secondo il criterio e si restituiscono i `percorsi`
-- effettivamente cancellati: se il client aveva la lista vecchia, ci trova
-- quello che gli era sfuggito e ripulisce anche quello.
create or replace function public.elimina_documenti(
  p_anno int default null, p_id_service int default null)
returns jsonb
language plpgsql security definer set search_path = public as $fn$
declare via jsonb; peso bigint;
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

  with tolti as (
    delete from public.documenti d
     where (p_anno is not null and d.anno = p_anno)
        or (p_id_service is not null and d.id_service = p_id_service)
    returning d.*
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', id, 'id_service', id_service, 'anno', anno,
           'percorso', percorso) order by creato_il), '[]'::jsonb),
         coalesce(sum(coalesce(bytes, 0)), 0)
    into via, peso
    from tolti;

  return jsonb_build_object('http', 200, 'eliminati', via,
                            'n', jsonb_array_length(via), 'bytes', peso);
end $fn$;

-- ----------------------------------------------------------------- grant ---
grant execute on function
  public.app_documenti(int),
  public.registra_documento(int, int, int, text, text, int, int, text, text, int, int),
  public.elimina_documento(text),
  public.elimina_documenti(int, int)
to authenticated;

-- -------------------------------------------------------------- realtime ---
do $blocco$
begin
  if not exists (select 1 from pg_publication_tables
                 where pubname = 'supabase_realtime'
                   and schemaname = 'public' and tablename = 'documenti') then
    alter publication supabase_realtime add table public.documenti;
  end if;
end $blocco$;
