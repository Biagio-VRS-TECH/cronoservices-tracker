-- 01-tabelle.sql - le stesse tabelle di app/db.py, in Postgres.
--
-- Regole tenute apposta identiche a SQLite, per non dover ritradurre niente:
--   * i booleani restano 0/1 (smallint), non boolean;
--   * le date e gli orari restano TESTO ISO locale ("2026-09-07T14:33:02"),
--     prodotto da ts_locale(): e' cio' che il frontend gia' sa leggere e cio'
--     che export_access.ps1 gia' produce. Niente fusi orari da indovinare.
--
-- Access resta la sorgente di verita' per clienti/services: qui ci arrivano
-- solo in copia, spinti una volta al giorno da app/push_cloud.py.
-- Le spunte invece NASCONO qui: questo e' l'unico padrone.

create schema if not exists public;

-- Orario locale in formato ISO senza fuso: gemello di db.now().
create or replace function public.ts_locale() returns text
language sql stable as $$
  select to_char(now() at time zone 'Europe/Rome', 'YYYY-MM-DD"T"HH24:MI:SS')
$$;

create table if not exists public.meta (
  k text primary key,
  v text
);

create table if not exists public.clienti (
  id_cliente       integer primary key,
  rag_soc          text not null default '',
  indirizzo text, cap text, citta text, provincia text,
  telefono text, email text,
  non_utilizzabile smallint not null default 0
);

create table if not exists public.services (
  id_service      integer primary key,
  id_cliente      integer not null,
  tipo text, stato text,
  destinazione text, localita text, provincia text,
  mappatura       smallint not null default 0,   -- campo Mappatura di tServices
  subappalto      smallint not null default 0,
  n_contratto text, data_inizio text, data_scadenza text,
  cadenza text, qva integer,
  causale_rinnovo text,
  rinnovo_auto    smallint not null default 0,   -- da tCausaliRinnovo.RinnovoAutomatico
  mesi            text not null default '000000000000',  -- bitmask Gen..Dic
  note text,
  visto_il text,                                 -- ultimo sync in cui era presente
  archiviato      smallint not null default 0    -- 1 = sparito da Access
);
create index if not exists ix_serv_cli   on public.services(id_cliente);
create index if not exists ix_serv_stato on public.services(stato);

-- Una riga per cella della griglia (service x anno x mese).
create table if not exists public.mappature (
  id_service  integer not null,
  anno        integer not null,
  mese        integer not null check (mese between 1 and 12),
  stampata    smallint not null default 0,
  controllata smallint not null default 0,
  corretta    smallint not null default 0,   -- "mappatura completa rapportino"
  ricambi     smallint not null default 0,   -- controllo ricambi e scadenze
  nota        text,
  rev         integer not null default 1,
  updated_at  text, updated_by text,
  primary key (id_service, anno, mese)
);
create index if not exists ix_map_anno on public.mappature(anno);

-- Log append-only: chi ha messo/tolto cosa e quando.
create table if not exists public.eventi (
  id         bigint generated always as identity primary key,
  ts         text not null,
  operatore  text not null default '?',
  id_service integer, anno integer, mese integer,
  campo text, da smallint, a smallint,
  op_id text, origine text
);
create index if not exists ix_ev_cella on public.eventi(id_service, anno, mese, id desc);
create index if not exists ix_ev_ts    on public.eventi(id desc);

-- Idempotenza: la coda offline puo' rimandare la stessa operazione piu' volte.
create table if not exists public.ops (
  op_id text primary key, ts text, esito text, rev integer
);

-- `ruolo`: 'admin' | 'tecnico' (#ANCHOR: ruoli). L'admin approva rapportino e
-- ricambi, fa le azioni di massa e ripristina dal diario. Il primo admin si
-- nomina con 07-ruoli.sql, gli altri dall'app (imposta_ruolo).
create table if not exists public.operatori (
  nome text primary key,
  email text unique,
  ultimo_accesso text,
  ruolo text not null default 'tecnico'
);
alter table public.operatori add column if not exists ruolo text not null default 'tecnico';

-- Chi e' collegato adesso. Sostituisce il dizionario PRESENZE in memoria di
-- api.py: online i client sono su macchine diverse, la memoria non basta piu'.
create table if not exists public.presenze (
  nome text primary key,
  dove text,
  ts   timestamptz not null default now()
);

create table if not exists public.sync_log (
  id bigint generated always as identity primary key,
  ts text,
  clienti integer, services integer,
  nuovi integer, riaperti integer, chiusi integer,
  mesi_cambiati integer, spunte_orfane integer,
  dettaglio text
);

-- ------------------------------------------------------------------ RLS ----
-- Acceso subito, qui, e non solo in 04-sicurezza.sql: fra un file e l'altro le
-- tabelle resterebbero altrimenti leggibili da chiunque abbia la chiave anon.
-- RLS acceso senza nessuna policy = tutto chiuso: e' il punto di partenza
-- giusto. Le policy di lettura le aggiunge 04, quando `autorizzato()` esiste.
--
-- Nove righe distese invece di un ciclo: il controllo dell'editor Supabase
-- legge il testo del comando, e un `execute format(...)` non lo vede.
alter table public.meta      enable row level security;
alter table public.clienti   enable row level security;
alter table public.services  enable row level security;
alter table public.mappature enable row level security;
alter table public.eventi    enable row level security;
alter table public.ops       enable row level security;
alter table public.operatori enable row level security;
alter table public.presenze  enable row level security;
alter table public.sync_log  enable row level security;

-- Da quando l'azienda registra le spunte qui: i mesi precedenti esistono ma non
-- vanno segnalati "in ritardo". E' la manopola del committente, non un difetto.
insert into public.meta(k, v)
values ('inizio_tracciamento', to_char(now() at time zone 'Europe/Rome', 'YYYY-MM'))
on conflict (k) do nothing;
