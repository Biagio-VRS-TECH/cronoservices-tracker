-- 08-dizionario.sql - il DIZIONARIO DEI COMPONENTI del registro, online.
--
-- Il generatore del registro dei componenti (web/registro/) trasforma l'export
-- del gestionale in un documento per il cliente: i codici articolo diventano
-- nomi leggibili grazie a questo vocabolario (codice -> nome), e la priorita'
-- 1..10 decide quali componenti compaiono per primi nel quadro d'insieme.
-- Prima viveva in un file JSON sul PC dell'ufficio; qui e' condiviso da tutti,
-- come le spunte. Gemello della tabella `dizionario_componenti` di app/db.py e
-- degli endpoint /api/dizionario di app/api.py. #ANCHOR: dizionario
--
-- Ordine: dopo 01-04 (usa public.autorizzato() e public.operatore_corrente()).

-- --------------------------------------------------------------- tabella ---
create table if not exists public.dizionario_componenti (
  codice        text primary key,
  nome          text,                 -- il nome che il cliente legge; null = descrizione del gestionale
  descrizione   text,                 -- descrizione tecnica originale, per riferimento
  priorita      integer check (priorita is null or priorita between 1 and 10),
  aggiornato    text not null,
  aggiornato_da text
);

alter table public.dizionario_componenti enable row level security;
drop policy if exists dizionario_leggi on public.dizionario_componenti;
create policy dizionario_leggi on public.dizionario_componenti for select to authenticated
  using (public.autorizzato());
grant select on public.dizionario_componenti to authenticated;

-- -------------------------------------------------------------- funzioni ---
create or replace function public._voce_dizionario_out(v public.dizionario_componenti) returns jsonb
language sql immutable as $fn$
  select jsonb_build_object(
    'codice', v.codice, 'nome', coalesce(v.nome, ''), 'descrizione', coalesce(v.descrizione, ''),
    'priorita', coalesce(v.priorita, 0), 'aggiornato', v.aggiornato,
    'aggiornato_da', coalesce(v.aggiornato_da, ''))
$fn$;

-- Tutto il vocabolario: {voci: [...]}. E' piccolo (qualche centinaio di righe
-- al massimo), il generatore lo legge una volta all'apertura.
create or replace function public.app_dizionario()
returns jsonb
language plpgsql stable security definer set search_path = public as $fn$
begin
  if not public.autorizzato() then
    raise exception 'non autorizzato' using errcode = '42501';
  end if;
  return jsonb_build_object('voci', (
    select coalesce(jsonb_agg(public._voce_dizionario_out(v) order by v.codice), '[]'::jsonb)
      from public.dizionario_componenti v));
end $fn$;

-- Una voce alla volta, e SOLO i campi elencati in p_campi ('nome' e/o
-- 'priorita'): nome e priorita' sono indipendenti, si puo' avere l'una senza
-- l'altro, e togliendo il nome la priorita' resta. Nome vuoto = si torna alla
-- descrizione del gestionale; priorita' null o 0 = nessuna. Quando non resta
-- niente la riga sparisce. La descrizione, se arriva, si aggiorna sempre.
create or replace function public.imposta_voce_dizionario(
  p_codice text, p_campi text[] default '{}', p_nome text default null,
  p_descrizione text default null, p_priorita int default null)
returns jsonb
language plpgsql security definer set search_path = public as $fn$
declare
  v     public.dizionario_componenti%rowtype;
  cod   text := trim(coalesce(p_codice, ''));
  nome  text;
  descr text;
  prio  int;
  op    text;
begin
  if not public.autorizzato() then
    raise exception 'non autorizzato' using errcode = '42501';
  end if;
  if cod = '' then
    return jsonb_build_object('http', 400, 'errore', 'codice mancante');
  end if;
  op := public.operatore_corrente();
  select * into v from public.dizionario_componenti where codice = cod;
  nome  := nullif(v.nome, '');
  descr := nullif(v.descrizione, '');
  prio  := nullif(v.priorita, 0);
  if 'nome' = any(p_campi) then
    nome := nullif(regexp_replace(trim(coalesce(p_nome, '')), '\s+', ' ', 'g'), '');
  end if;
  if nullif(trim(coalesce(p_descrizione, '')), '') is not null then
    descr := trim(p_descrizione);
  end if;
  if 'priorita' = any(p_campi) then
    prio := nullif(coalesce(p_priorita, 0), 0);
    if prio is not null and (prio < 1 or prio > 10) then
      return jsonb_build_object('http', 400, 'errore', 'priorita ' || prio || ' fuori intervallo (1-10)');
    end if;
  end if;

  if nome is null and prio is null then
    delete from public.dizionario_componenti where codice = cod;
    return jsonb_build_object('http', 200, 'voce', jsonb_build_object(
      'codice', cod, 'nome', '', 'descrizione', coalesce(descr, ''), 'priorita', 0,
      'aggiornato', public.ts_locale(), 'aggiornato_da', op, 'rimossa', true));
  end if;

  insert into public.dizionario_componenti(codice, nome, descrizione, priorita, aggiornato, aggiornato_da)
  values (cod, nome, descr, prio, public.ts_locale(), op)
  on conflict (codice) do update
    set nome = excluded.nome, descrizione = excluded.descrizione, priorita = excluded.priorita,
        aggiornato = excluded.aggiornato, aggiornato_da = excluded.aggiornato_da
  returning * into v;
  return jsonb_build_object('http', 200, 'voce', public._voce_dizionario_out(v));
end $fn$;

grant execute on function
  public.app_dizionario(),
  public.imposta_voce_dizionario(text, text[], text, text, int)
to authenticated;

-- ----------------------------------------------------------------- seme -----
-- Il vocabolario che l'ufficio aveva gia' costruito col programma locale
-- (l'11 settembre 2026, 24 voci). Solo dove il codice non c'e' ancora: le
-- modifiche fatte dall'app non si toccano.
insert into public.dizionario_componenti(codice, nome, descrizione, priorita, aggiornato) values
  ('101236', 'Riduttore di pressione DCn 300 per ossigeno (O2)', null, 2, '2026-09-11T11:35:19'),
  ('101237', 'Riduttore di pressione DCn 300 per azoto (N2)', null, 4, '2026-09-11T11:35:35'),
  ('101490', 'Pompa del vuoto Rietschle VC50', null, null, '2026-09-11T00:00:00'),
  ('101690', 'Valvola a sfera 1/2" per ossigeno', null, 3, '2026-09-11T11:35:40'),
  ('101696', 'Valvola a sfera 1" per ossigeno', null, null, '2026-09-11T00:00:00'),
  ('102569', 'Vuotostato pretarato 0,4 bar', null, null, '2026-09-11T00:00:00'),
  ('103368', 'Presa ossigeno (UNI 9507)', null, null, '2026-09-11T11:29:49'),
  ('103371', 'Presa vuoto (UNI 9507)', null, null, '2026-09-11T11:44:59'),
  ('103397', 'Pressostato 3,6-5,7 bar', null, null, '2026-09-11T11:45:00'),
  ('103411', 'Serpentina in rame 1 m per ossigeno', null, null, '2026-09-11T00:00:00'),
  ('103416', 'Rampa medicale 1/3 posti per ossigeno', null, null, '2026-09-11T11:45:00'),
  ('103426', 'Unità terza fonte ossigeno con riduttore SR-2210M', null, null, '2026-09-11T00:00:00'),
  ('106059', 'Serpentina inox 2,5 m per ossigeno / CO2', null, null, '2026-09-11T00:00:00'),
  ('106341', 'Gruppo controllo vuoto con vuotometro', null, null, '2026-09-11T00:00:00'),
  ('115499', 'Valvola alta pressione per rampa ossigeno', null, null, '2026-09-11T00:00:00'),
  ('115549', 'Filtro Rietschle CMV 290', null, null, '2026-09-11T00:00:00'),
  ('115655', 'Centrale automatica di riduzione ossigeno SR 2210M', null, null, '2026-09-11T00:00:00'),
  ('115713', 'Modulo allarme di centrale gas medicali', null, null, '2026-09-11T00:00:00'),
  ('115926', 'Unità di controllo impianto 6,6-9,6 bar', null, null, '2026-09-11T00:00:00'),
  ('116882', 'Riduttore di II stadio doppio mod. 2290 per ossigeno', null, null, '2026-09-11T00:00:00'),
  ('117047', 'Unità di blocco area ossigeno con presa AFNOR', null, null, '2026-09-11T00:00:00'),
  ('117069', 'Modulo allarme di reparto 2 gas + vuoto', null, null, '2026-09-11T00:00:00'),
  ('133460', 'Filtro Alu NEA-L-HP172 per ossigeno, con elemento filtrante', null, 1, '2026-09-11T11:32:44'),
  ('135906', 'Serbatoio del vuoto orizzontale 500 litri', null, null, '2026-09-11T00:00:00')
on conflict (codice) do nothing;

-- -------------------------------------------------------------- realtime ---
-- Chi ha il generatore aperto vede il nome cambiato da un collega senza
-- ricaricare (il generatore ascolta la tabella come fa per `documenti`).
do $blocco$
begin
  if not exists (select 1 from pg_publication_tables
                 where pubname = 'supabase_realtime'
                   and schemaname = 'public' and tablename = 'dizionario_componenti') then
    alter publication supabase_realtime add table public.dizionario_componenti;
  end if;
end $blocco$;
