-- 03-letture.sql - bootstrap, diario, controlli, presenze, impostazioni, CSV.
--
-- Anche le letture sono SECURITY DEFINER con il controllo di autorizzazione in
-- testa, per lo stesso motivo delle scritture: cosi' le tabelle restano chiuse e
-- l'unica porta e' questa. Le policy RLS di 04-sicurezza.sql servono comunque,
-- perche' Realtime le usa per decidere a chi mandare le celle toccate.

-- ------------------------------------------------------------ bootstrap ----
-- Gemello di api.bootstrap: tutto quello che serve al client in un colpo solo.
-- La forma del JSON e' quella, campo per campo: web/js/app.js non cambia.
create or replace function public.app_bootstrap(p_anno int default null)
returns jsonb
language plpgsql stable security definer set search_path = public as $fn$
declare
  anno int := coalesce(p_anno, extract(year from (now() at time zone 'Europe/Rome'))::int);
  ris jsonb;
begin
  if not public.autorizzato() then
    raise exception 'non autorizzato' using errcode = '42501';
  end if;
  select jsonb_build_object(
    'anno', anno,
    'anni', (select coalesce(jsonb_agg(x.a order by x.a), '[]'::jsonb)
             from (select anno - 1 as a union select anno union select anno + 1
                   union select m.anno from public.mappature m) x
             where x.a > 2000 and x.a < 2100),
    'oggi', to_char(now() at time zone 'Europe/Rome', 'YYYY-MM-DD'),
    'clienti', (select coalesce(jsonb_agg(jsonb_build_object(
                  'id', c.id_cliente, 'rs', c.rag_soc, 'citta', c.citta,
                  'prov', c.provincia, 'tel', c.telefono, 'mail', c.email)
                  order by c.rag_soc), '[]'::jsonb) from public.clienti c),
    'services', (select coalesce(jsonb_agg(jsonb_build_object(
                   'id', s.id_service, 'cli', s.id_cliente,
                   'tipo', coalesce(s.tipo, ''), 'stato', coalesce(s.stato, ''),
                   'dest', coalesce(s.destinazione, ''), 'loc', coalesce(s.localita, ''),
                   'prov', coalesce(s.provincia, ''), 'map', s.mappatura,
                   'sub', s.subappalto, 'nc', coalesce(s.n_contratto, ''),
                   'inizio', s.data_inizio, 'scad', s.data_scadenza,
                   'cad', coalesce(s.cadenza, ''), 'qva', s.qva, 'mesi', s.mesi,
                   'rin', s.rinnovo_auto, 'caus', coalesce(s.causale_rinnovo, ''),
                   'note', coalesce(s.note, ''), 'arch', s.archiviato)
                   order by s.id_cliente, s.id_service), '[]'::jsonb)
                 from public.services s),
    'celle', (select coalesce(jsonb_object_agg(m.id_service || '-' || m.mese,
                                               public._cella_out(m)), '{}'::jsonb)
              from public.mappature m where m.anno = anno),
    'operatori', (select coalesce(jsonb_agg(o.nome order by o.nome), '[]'::jsonb)
                  from public.operatori o),
    'ultimo_sync', (select v from public.meta where k = 'ultimo_sync'),
    'inizio_tracciamento', (select v from public.meta where k = 'inizio_tracciamento'),
    'indirizzo_lan', null,
    'altri_server', '[]'::jsonb,
    'sync', (select to_jsonb(sl) from public.sync_log sl order by sl.id desc limit 1),
    'online', public._presenti(),
    'mesi', to_jsonb(array['Gen','Feb','Mar','Apr','Mag','Giu',
                           'Lug','Ago','Set','Ott','Nov','Dic']),
    'mesi_nome', to_jsonb(array['Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno',
                                'Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre'])
  ) into ris;
  return ris;
end $fn$;

-- ------------------------------------------------------------- presenze ----
-- api.py teneva le presenze in un dizionario in memoria: bastava, perche' il
-- server era uno solo. Online i client stanno su macchine diverse e la memoria
-- non e' condivisa, quindi passano da una tabella con la stessa scadenza (45 s).
create or replace function public._presenti() returns jsonb
language sql stable as $fn$
  select coalesce(jsonb_agg(jsonb_build_object('nome', p.nome, 'dove', p.dove)
                            order by p.nome), '[]'::jsonb)
  from public.presenze p
  where p.ts > now() - interval '45 seconds'
$fn$;

create or replace function public.app_ping(p_dove text default null)
returns jsonb
language plpgsql security definer set search_path = public as $fn$
declare op text;
begin
  if not public.autorizzato() then
    raise exception 'non autorizzato' using errcode = '42501';
  end if;
  op := public.operatore_corrente();
  insert into public.presenze(nome, dove, ts) values (op, p_dove, now())
  on conflict (nome) do update set dove = excluded.dove, ts = excluded.ts;
  delete from public.presenze where ts < now() - interval '10 minutes';
  return jsonb_build_object('http', 200, 'online', public._presenti(),
                            'ora', public.ts_locale());
end $fn$;

-- ------------------------------------------------------------ operatore ----
-- Online il nome non e' piu' libero: e' legato alla casella con cui hai fatto il
-- login. Si puo' cambiare come si scrive, non chi sei.
create or replace function public.imposta_operatore(p_nome text)
returns jsonb
language plpgsql security definer set search_path = public as $fn$
declare v_nome text := left(btrim(coalesce(p_nome, '')), 40);
        v_mail text := public.email_corrente();
begin
  if not public.autorizzato() then
    raise exception 'non autorizzato' using errcode = '42501';
  end if;
  if v_nome = '' then
    return jsonb_build_object('http', 400, 'errore', 'nome mancante');
  end if;
  -- Un solo nome per casella: se cambia come si scrive, il vecchio se ne va.
  delete from public.operatori o where o.email = v_mail and o.nome <> v_nome;
  insert into public.operatori(nome, email, ultimo_accesso)
  values (v_nome, v_mail, public.ts_locale())
  on conflict (nome) do update
    set email = excluded.email, ultimo_accesso = excluded.ultimo_accesso;
  return jsonb_build_object('http', 200, 'nome', v_nome,
    'operatori', (select coalesce(jsonb_agg(o.nome order by o.nome), '[]'::jsonb)
                  from public.operatori o));
end $fn$;

-- --------------------------------------------------------- impostazioni ----
create or replace function public.imposta_meta(p_inizio_tracciamento text)
returns jsonb
language plpgsql security definer set search_path = public as $fn$
declare v text := btrim(coalesce(p_inizio_tracciamento, ''));
begin
  if not public.autorizzato() then
    raise exception 'non autorizzato' using errcode = '42501';
  end if;
  if v !~ '^\d{4}-\d{2}$' then
    return jsonb_build_object('http', 400, 'errore', 'formato atteso AAAA-MM');
  end if;
  insert into public.meta(k, v) values ('inizio_tracciamento', v)
  on conflict (k) do update set v = excluded.v;
  return jsonb_build_object('http', 200, 'inizio_tracciamento', v);
end $fn$;

-- --------------------------------------------------------------- storia ----
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
                              'campo', e.campo, 'da', e.da, 'a', e.a) as x
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
                              'mese', e.mese, 'campo', e.campo, 'a', e.a,
                              'destinazione', s.destinazione, 'rag_soc', c.rag_soc) as x
    from public.eventi e
    left join public.services s on s.id_service = e.id_service
    left join public.clienti  c on c.id_cliente = s.id_cliente
    order by e.id desc limit least(coalesce(p_limit, 60), 300)
  ) t);
end $fn$;

-- --------------------------------------------------------- incongruenze ----
-- Controlli di qualita' sul dato Access: mesi spuntati diversi dalle visite
-- annue della cadenza, aperti senza nessun mese, spunte su mesi non piu' previsti.
create or replace function public.app_incongruenze(p_anno int default null)
returns jsonb
language plpgsql stable security definer set search_path = public as $fn$
declare anno int := coalesce(p_anno, extract(year from (now() at time zone 'Europe/Rome'))::int);
begin
  if not public.autorizzato() then
    raise exception 'non autorizzato' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'http', 200, 'anno', anno,
    'senza_mesi', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', s.id_service, 'rs', c.rag_soc, 'dest', s.destinazione,
        'tipo', s.tipo, 'mesi', 0, 'qva', s.qva, 'cad', s.cadenza)), '[]'::jsonb)
      from public.services s left join public.clienti c using (id_cliente)
      where s.stato = 'APERTO' and s.archiviato = 0
        and length(replace(s.mesi, '0', '')) = 0),
    'cadenza_ko', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', s.id_service, 'rs', c.rag_soc, 'dest', s.destinazione,
        'tipo', s.tipo, 'mesi', length(replace(s.mesi, '0', '')),
        'qva', s.qva, 'cad', s.cadenza)), '[]'::jsonb)
      from public.services s left join public.clienti c using (id_cliente)
      where s.stato = 'APERTO' and s.archiviato = 0
        and length(replace(s.mesi, '0', '')) > 0
        and s.qva is not null and s.qva <> 0
        and length(replace(s.mesi, '0', '')) <> s.qva),
    'orfane', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', m.id_service, 'mese', m.mese, 'rs', c.rag_soc,
        'dest', s.destinazione)), '[]'::jsonb)
      from public.mappature m
      join public.services s using (id_service)
      left join public.clienti c on c.id_cliente = s.id_cliente
      where m.anno = anno and substr(s.mesi, m.mese, 1) <> '1'
        and (m.stampata + m.controllata + m.corretta + m.ricambi) > 0)
  );
end $fn$;

-- ---------------------------------------------- modello dell'anno (CSV) ----
-- Gemelli SQL di scadEffettiva/meseScadenza (web/js/stato.js #ANCHOR: rinnovo e
-- mappatura-anno). Servono a una cosa sola: la colonna "Ruolo" del CSV. Il resto
-- del modello dell'anno resta dov'e' sempre stato, nel client.
create or replace function public._scad_effettiva(s public.services) returns text
language plpgsql stable as $fn$
declare
  a2 int; m2 int; g2 int; a1 int; m1 int; g1 int;
  passo int := 12; n int; a int; m int; oggi text; fine text;
begin
  if s.data_scadenza is null or s.rinnovo_auto = 0 or s.stato <> 'APERTO' then
    return s.data_scadenza;
  end if;
  a2 := split_part(s.data_scadenza, '-', 1)::int;
  m2 := split_part(s.data_scadenza, '-', 2)::int;
  g2 := split_part(s.data_scadenza, '-', 3)::int;
  if s.data_inizio is not null then
    a1 := split_part(s.data_inizio, '-', 1)::int;
    m1 := split_part(s.data_inizio, '-', 2)::int;
    g1 := split_part(s.data_inizio, '-', 3)::int;
    n := (a2 - a1) * 12 + (m2 - m1) + (case when g2 >= g1 then 1 else 0 end);
    passo := case when n >= 1 then n else 12 end;
  end if;
  a := a2; m := m2;
  oggi := to_char(now() at time zone 'Europe/Rome', 'YYYY-MM-DD');
  for i in 1..200 loop            -- cintura: 200 termini sono oltre un secolo
    fine := to_char(a, 'FM0000') || '-' || to_char(m, 'FM00') || '-' ||
            to_char(least(g2, extract(day from (make_date(a, m, 1)
              + interval '1 month - 1 day'))::int), 'FM00');
    exit when fine >= oggi;
    m := m + passo;
    a := a + (m - 1) / 12;
    m := (m - 1) % 12 + 1;
  end loop;
  return fine;
end $fn$;

create or replace function public._mese_scadenza(s public.services, p_anno int)
returns int
language plpgsql stable as $fn$
declare scad text := public._scad_effettiva(s); ym text;
begin
  for m in 1..12 loop
    if substr(s.mesi, m, 1) <> '1' then continue; end if;
    ym := p_anno::text || '-' || to_char(m, 'FM00');
    if scad is not null and scad < ym || '-01' then continue; end if;
    if s.data_inizio is not null and s.data_inizio > ym || '-31' then continue; end if;
    return m;
  end loop;
  return 0;
end $fn$;

-- ------------------------------------------------------------------ CSV ----
create or replace function public._csv(v text) returns text
language sql immutable as $fn$
  select case
    when v is null then ''
    when v ~ '[";\r\n]' then '"' || replace(v, '"', '""') || '"'
    else v end
$fn$;

-- Checklist stampabile / foglio di lavoro. Senza p_mese esporta l'anno intero.
create or replace function public.app_export_csv(p_anno int default null,
                                                 p_mese int default null)
returns jsonb
language plpgsql stable security definer set search_path = public as $fn$
declare
  v_anno int := coalesce(p_anno, extract(year from (now() at time zone 'Europe/Rome'))::int);
  mesi_nome text[] := array['Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno',
                            'Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre'];
  righe text[] := array[]::text[];
  r record; s public.services; cel public.mappature%rowtype; scad int; m int;
begin
  if not public.autorizzato() then
    raise exception 'non autorizzato' using errcode = '42501';
  end if;
  righe := righe || (
    'Anno;Mese;Ruolo;IDService;Cliente;Destinazione;Localita;Prov;Tipo;Cadenza;' ||
    'Stampata;Controllata;Completa rapportino;Ricambi e scadenze;Nota;Ultimo agg.;Da');

  -- La riga del service viaggia intera (`sv as srv`), non spacchettata: serve
  -- del tipo public.services per poterla passare a _mese_scadenza.
  for r in
    select sv as srv, c.rag_soc as rag_soc
    from public.services sv
    left join public.clienti c on c.id_cliente = sv.id_cliente
    where sv.stato = 'APERTO' and sv.archiviato = 0
    order by c.rag_soc, sv.id_service
  loop
    s := r.srv;
    scad := public._mese_scadenza(s, v_anno);
    for m in 1..12 loop
      if substr(s.mesi, m, 1) <> '1' then continue; end if;
      if p_mese is not null and m <> p_mese then continue; end if;
      -- SELECT INTO senza righe azzera `cel`: le celle mai toccate escono vuote.
      select * into cel from public.mappature mp
       where mp.id_service = s.id_service and mp.anno = v_anno and mp.mese = m;
      righe := righe || concat_ws(';',
        v_anno::text, mesi_nome[m],
        case when m = scad then 'MAPPATURA' else 'visita' end,
        s.id_service::text, public._csv(r.rag_soc), public._csv(s.destinazione),
        public._csv(s.localita), public._csv(s.provincia), public._csv(s.tipo),
        public._csv(s.cadenza),
        case when cel.stampata    = 1 then 'X' else '' end,
        case when cel.controllata = 1 then 'X' else '' end,
        case when cel.corretta    = 1 then 'X' else '' end,
        case when cel.ricambi     = 1 then 'X' else '' end,
        public._csv(coalesce(cel.nota, '')),
        coalesce(cel.updated_at, ''), public._csv(coalesce(cel.updated_by, '')));
    end loop;
  end loop;

  return jsonb_build_object('http', 200,
    '__csv__', array_to_string(righe, E'\r\n') || E'\r\n',
    '__nome__', 'mappature_' || v_anno ||
                coalesce('_' || to_char(p_mese, 'FM00'), '') || '.csv');
end $fn$;

-- ------------------------------------------------ celle toccate di recente --
-- Rete di scorta del Realtime: se il WebSocket non regge (rete d'ufficio dietro
-- un proxy, per esempio) il client passa a chiedere ogni tot solo le celle
-- cambiate dopo un certo istante. Poche righe, non tutto il bootstrap.
create or replace function public.app_celle_dopo(p_anno int, p_da text)
returns jsonb
language plpgsql stable security definer set search_path = public as $fn$
begin
  if not public.autorizzato() then
    raise exception 'non autorizzato' using errcode = '42501';
  end if;
  return (
    select jsonb_build_object('http', 200,
      'ora', public.ts_locale(),
      'celle', coalesce(jsonb_agg(jsonb_build_object(
        'id_service', m.id_service, 'mese', m.mese,
        'cella', public._cella_out(m))), '[]'::jsonb))
    from public.mappature m
    where m.anno = p_anno
      and m.updated_at is not null
      and m.updated_at > coalesce(p_da, ''));
end $fn$;
