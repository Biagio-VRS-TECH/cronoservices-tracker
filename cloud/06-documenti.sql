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
    'anteprima', d.anteprima, 'creato_il', d.creato_il, 'creato_da', d.creato_da)
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
create or replace function public.registra_documento(
  p_id_service int, p_anno int, p_mese int, p_nome text, p_percorso text,
  p_bytes int default 0, p_pagine int default 0, p_anteprima text default null)
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
                               pagine, anteprima, creato_il, creato_da)
  values (replace(gen_random_uuid()::text, '-', ''), p_id_service, p_anno,
          nullif(mese, 0), coalesce(nullif(p_nome, ''), 'schede.pdf'), p_percorso,
          coalesce(p_bytes, 0), coalesce(p_pagine, 0), ant, public.ts_locale(), op)
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

-- ----------------------------------------------------------------- grant ---
grant execute on function
  public.app_documenti(int),
  public.registra_documento(int, int, int, text, text, int, int, text),
  public.elimina_documento(text)
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
