-- 05-sync.sql - l'ingresso della copia di Access.
--
-- Gemello di sync.esegui: stesso diff (nuovi / riaperti / chiusi / mesi cambiati
-- / spunte orfane), stessa riga in sync_log. La differenza e' che qui arriva
-- tutto in una chiamata sola, quindi il travaso e' atomico: o entra tutto o non
-- entra niente, e nessun client vede mai mezza anagrafica.
--
-- La chiama SOLO app/push_cloud.py dal PC dell'ufficio, con la chiave
-- service_role. Nessun utente del browser puo' eseguirla.

create or replace function public.sync_applica(p_clienti jsonb, p_services jsonb)
returns jsonb
language plpgsql security definer set search_path = public as $fn$
declare
  ts        text := public.ts_locale();
  det       text[] := array[]::text[];
  n_nuovi   int := 0; n_riaperti int := 0; n_chiusi int := 0; n_mesi int := 0;
  n_orfane  int := 0; n_cli int := 0; n_srv int := 0; n_arch int := 0;
begin
  if coalesce(jsonb_array_length(p_services), 0) = 0 then
    raise exception 'nessun service in ingresso: sync annullato';
  end if;

  -- 1. Il diff va misurato PRIMA di scrivere, altrimenti non c'e' piu' un prima.
  select count(*) filter (where p.id_service is null),
         count(*) filter (where p.id_service is not null
                            and p.stato is distinct from i.stato and i.stato = 'CHIUSO'),
         count(*) filter (where p.id_service is not null
                            and p.stato is distinct from i.stato and i.stato <> 'CHIUSO'),
         count(*) filter (where p.id_service is not null and p.mesi is distinct from i.mesi)
    into n_nuovi, n_chiusi, n_riaperti, n_mesi
    from jsonb_populate_recordset(null::public.services, p_services) i
    left join public.services p on p.id_service = i.id_service;

  select coalesce(array_agg(riga), array[]::text[]) into det from (
    select case
             when p.stato is distinct from i.stato and i.stato = 'CHIUSO'
               then '#' || i.id_service || ' chiuso'
             when p.stato is distinct from i.stato
               then '#' || i.id_service || ' riaperto (' || coalesce(i.stato, '') || ')'
             else '#' || i.id_service || ' mesi ' || p.mesi || ' -> ' || i.mesi
           end as riga
      from jsonb_populate_recordset(null::public.services, p_services) i
      join public.services p on p.id_service = i.id_service
     where p.stato is distinct from i.stato or p.mesi is distinct from i.mesi
     limit 200) t;

  -- 2. Anagrafica: i service prima (i clienti ci si appoggiano).
  insert into public.services as s (
    id_service, id_cliente, tipo, stato, destinazione, localita, provincia,
    mappatura, subappalto, n_contratto, data_inizio, data_scadenza, cadenza,
    qva, causale_rinnovo, rinnovo_auto, mesi, note, visto_il, archiviato)
  select i.id_service, i.id_cliente, i.tipo, i.stato, i.destinazione, i.localita,
         i.provincia, coalesce(i.mappatura, 0), coalesce(i.subappalto, 0),
         i.n_contratto, i.data_inizio, i.data_scadenza, i.cadenza, i.qva,
         i.causale_rinnovo, coalesce(i.rinnovo_auto, 0),
         coalesce(i.mesi, '000000000000'), i.note, ts, 0
    from jsonb_populate_recordset(null::public.services, p_services) i
  on conflict (id_service) do update set
    id_cliente = excluded.id_cliente, tipo = excluded.tipo, stato = excluded.stato,
    destinazione = excluded.destinazione, localita = excluded.localita,
    provincia = excluded.provincia, mappatura = excluded.mappatura,
    subappalto = excluded.subappalto, n_contratto = excluded.n_contratto,
    data_inizio = excluded.data_inizio, data_scadenza = excluded.data_scadenza,
    cadenza = excluded.cadenza, qva = excluded.qva,
    causale_rinnovo = excluded.causale_rinnovo, rinnovo_auto = excluded.rinnovo_auto,
    mesi = excluded.mesi, note = excluded.note,
    visto_il = excluded.visto_il, archiviato = 0;
  get diagnostics n_srv = row_count;

  insert into public.clienti as c (
    id_cliente, rag_soc, indirizzo, cap, citta, provincia, telefono, email,
    non_utilizzabile)
  select k.id_cliente, coalesce(k.rag_soc, ''), k.indirizzo, k.cap, k.citta,
         k.provincia, k.telefono, k.email, coalesce(k.non_utilizzabile, 0)
    from jsonb_populate_recordset(null::public.clienti, p_clienti) k
  on conflict (id_cliente) do update set
    rag_soc = excluded.rag_soc, indirizzo = excluded.indirizzo, cap = excluded.cap,
    citta = excluded.citta, provincia = excluded.provincia,
    telefono = excluded.telefono, email = excluded.email,
    non_utilizzabile = excluded.non_utilizzabile;
  get diagnostics n_cli = row_count;

  -- 3. Sparito da Access = archiviato, non cancellato: le sue spunte sono lavoro
  --    fatto e restano. `visto_il` dice chi c'era in questo giro.
  update public.services set archiviato = 1
   where archiviato = 0 and coalesce(visto_il, '') <> ts;
  get diagnostics n_arch = row_count;
  if n_arch > 0 then
    det := det || ('archiviati: ' || n_arch::text);
  end if;

  -- 4. Spunte su mesi che in Access non sono piu' di manutenzione: si conservano
  --    ma vanno segnalate (l'interfaccia le marca "orfane").
  select count(*) into n_orfane
    from public.mappature m join public.services s using (id_service)
   where substr(s.mesi, m.mese, 1) <> '1'
     and (m.stampata + m.controllata + m.corretta + m.ricambi) > 0;

  insert into public.sync_log(ts, clienti, services, nuovi, riaperti, chiusi,
                              mesi_cambiati, spunte_orfane, dettaglio)
  values (ts, n_cli, n_srv, n_nuovi, n_riaperti, n_chiusi, n_mesi, n_orfane,
          array_to_string(det[1:200], E'\n'));

  insert into public.meta(k, v) values ('ultimo_sync', ts)
  on conflict (k) do update set v = excluded.v;

  return jsonb_build_object(
    'ts', ts, 'clienti', n_cli, 'services', n_srv, 'nuovi', n_nuovi,
    'riaperti', n_riaperti, 'chiusi', n_chiusi, 'mesi_cambiati', n_mesi,
    'archiviati', n_arch, 'spunte_orfane', n_orfane,
    'dettaglio', to_jsonb(det[1:200]));
end $fn$;

revoke execute on function public.sync_applica(jsonb, jsonb)
  from public, anon, authenticated;
grant  execute on function public.sync_applica(jsonb, jsonb) to service_role;
