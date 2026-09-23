-- 09-debug-2026-09-23.sql - le correzioni della sessione di debug del 23/09/2026.
--
-- Si puo' rilanciare quante volte si vuole: sono tutti `create or replace`,
-- `revoke`/`grant` e `drop policy if exists`. Non tocca NESSUN dato (nessuna
-- insert, update o delete su righe esistenti).
--
-- ATTENZIONE, prima di rilanciare 01-08 su questo progetto: il database e'
-- CONDIVISO col Planning (tabelle e funzioni `pl_*`). `04-sicurezza.sql` faceva
-- un revoke `on all tables` e `on all functions` di tutto lo schema: rieseguito
-- toglieva i permessi a tutto il Planning. Dal 10-migliorie-2026-09.sql (SEC-10)
-- il 04 tocca solo gli oggetti di CronoService, per nome; resta vero pero' che
-- 02/03 riscriverebbero `_applica` e `imposta_nota` senza il controllo che vi
-- ha aggiunto il Planning. Per le correzioni si usano 09 e 10.
--
-- Cosa mette a posto, in ordine di gravita':
--   1. i tecnici non potevano piu' spuntare niente (ne' scrivere una nota);
--   2. l'ultimo amministratore poteva sparire con due declassamenti incrociati;
--   3. quattro funzioni e una tabella erano aperte al ruolo `anon`;
--   4. le policy di lettura valutavano `autorizzato()` riga per riga.

-- --------------------------------------------- 1. i tecnici spuntano di nuovo
-- Lo stato vero del database (letto il 23/09 con pg_get_functiondef) NON e'
-- quello di 02-funzioni.sql: le migrazioni 033/036 del Planning hanno aggiunto
-- in cima a `_applica` e `imposta_nota`
--     if not public.pl_cronoservice_scrivibile() then ... 403 'Sola lettura' ...
-- e dalla 036 `pl_cronoservice_scrivibile()` voleva dire "admin o approvatore":
-- il ruolo `tecnico` (l'operatore, che per disegno spunta tutto) riceveva 403 su
-- ogni spunta e su ogni nota. La correzione sta nel Planning, dove sta la
-- funzione: la migrazione 037 la fa tornare vera per chiunque sia autorizzato,
-- e le regole dei ruoli restano tutte in `_valore_per_ruolo` (#ANCHOR: ruoli).
-- Qui non si riscrivono `_applica` e `imposta_nota`: il loro testo vero e'
-- quello di 02 piu' quel controllo, che adesso non ferma piu' nessuno.

-- --------------------------------------- 2. l'ultimo admin non si perde piu'
-- Il controllo "e' l'unico amministratore" contava gli admin SENZA bloccare
-- niente: due amministratori che si declassano a vicenda nello stesso istante
-- (A toglie B, B toglie A) vedevano entrambi n_admin = 2, passavano entrambi e
-- l'azienda restava senza nessuno che approva, azzera o ripristina - e dall'app
-- non si rimedia piu' (serve 07-ruoli.sql a mano). Ora le righe degli admin si
-- bloccano prima di contarle: il secondo aspetta il primo, e in READ COMMITTED
-- il suo `count(*)` (un'istruzione nuova, una fotografia nuova) vede gia' il
-- declassamento dell'altro. Il resto e' 03-letture.sql parola per parola.
create or replace function public.imposta_ruolo(p_nome text, p_ruolo text)
returns jsonb
language plpgsql security definer set search_path = public as $fn$
declare v_nome text := left(btrim(coalesce(p_nome, '')), 40);
        n_admin int;
begin
  if not public.autorizzato() then
    raise exception 'non autorizzato' using errcode = '42501';
  end if;
  if not public.e_admin() then
    return jsonb_build_object('http', 403, 'errore', 'questa azione e'' dell''amministratore');
  end if;
  if v_nome = '' or p_ruolo not in ('admin', 'approvatore', 'tecnico') then
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
  -- senza casella (seme, o di prima del login) non deve far credere che
  -- "ce n'e' un altro" e lasciare l'azienda senza nessuno che comandi
  select count(*) into n_admin from public.operatori o
   where o.ruolo = 'admin' and o.email is not null;
  if p_ruolo <> 'admin' and n_admin <= 1
     and exists (select 1 from public.operatori o where o.nome = v_nome and o.ruolo = 'admin') then
    return jsonb_build_object('http', 400, 'errore',
      'e'' l''unico amministratore: nominane prima un altro');
  end if;
  update public.operatori set ruolo = p_ruolo where nome = v_nome;
  return jsonb_build_object('http', 200,
    'ruoli', (select coalesce(jsonb_object_agg(o.nome, o.ruolo), '{}'::jsonb)
              from public.operatori o));
end $fn$;

-- ------------------------------------------------ 3. niente piu' per `anon`
-- 06 e 08 sono stati rieseguiti DOPO 04 (firma nuova di registra_documento,
-- tabella nuova del dizionario): una funzione creata da capo nasce eseguibile
-- da PUBLIC, e una tabella nuova in `public` prende i privilegi di default di
-- Supabase, cioe' TUTTO ad anon e authenticated. Letto nel database il 23/09:
--   * registra_documento, app_dizionario, imposta_voce_dizionario,
--     _voce_dizionario_out eseguibili da PUBLIC e da anon;
--   * dizionario_componenti con INSERT/UPDATE/DELETE/TRUNCATE ad anon e
--     authenticated. L'RLS ferma insert/update/delete senza policy, ma
--     TRUNCATE l'RLS non lo guarda.
-- Le funzioni oggi si fermano da sole su autorizzato(), quindi non era una
-- porta aperta: ma e' un solo controllo invece di due, e l'advisor di
-- Supabase lo segnala. Si torna alla regola di 04: solo chi ha fatto il login.
revoke execute on function
  public.registra_documento(int, int, int, text, text, int, int, text, text, int, int, text),
  public.app_dizionario(),
  public.imposta_voce_dizionario(text, text[], text, text, int),
  public._voce_dizionario_out(public.dizionario_componenti)
from public, anon, authenticated;

grant execute on function
  public.registra_documento(int, int, int, text, text, int, int, text, text, int, int, text),
  public.app_dizionario(),
  public.imposta_voce_dizionario(text, text[], text, text, int)
to authenticated;

revoke all on public.dizionario_componenti from anon;
revoke insert, update, delete, truncate, references, trigger
  on public.dizionario_componenti from authenticated;
grant select on public.dizionario_componenti to authenticated;

-- ------------------------------ 4. autorizzato() una volta, non riga per riga
-- `using (public.autorizzato())` si rivaluta per ogni riga letta (legge il JWT
-- con current_setting a ogni riga); `using ((select public.autorizzato()))`
-- diventa un InitPlan valutato una volta per query. Stessa regola, stesso
-- risultato: e' la forma che raccomanda Supabase per le policy.
do $blocco$
declare t text;
begin
  foreach t in array array['meta','clienti','services','mappature','eventi',
                           'ops','operatori','presenze','sync_log','documenti'] loop
    if to_regclass('public.' || t) is not null then
      execute format('drop policy if exists leggi_azienda on public.%I', t);
      execute format(
        'create policy leggi_azienda on public.%I for select to authenticated
         using ((select public.autorizzato()))', t);
    end if;
  end loop;
end $blocco$;

drop policy if exists dizionario_leggi on public.dizionario_componenti;
create policy dizionario_leggi on public.dizionario_componenti for select to authenticated
  using ((select public.autorizzato()));

-- ------------------------------------- 5. niente formule nel CSV esportato
-- Un testo che comincia con = + - @ (una nota "- sostituito filtro", una ragione
-- sociale scritta male) Excel lo esegue come formula, anche una chiamata verso
-- l'esterno. Davanti si mette una tabulazione, invisibile: come app/api.py
-- (_testo_csv) e come il CSV del Planning.
create or replace function public._csv(v text) returns text
language sql immutable set search_path = public as $fn$
  select case
    when w is null then ''
    when w ~ '[";\r\n]' then '"' || replace(w, '"', '""') || '"'
    else w end
  from (select case when left(v, 1) in ('=', '+', '-', '@') then E'\t' || v else v end as w) x
$fn$;

-- ------------------------------------------------------------- controllo ----
-- Deve tornare `anon_esegue = false` su tutte le funzioni della parte 3.
select p.proname,
       has_function_privilege('anon', p.oid, 'execute') as anon_esegue
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public'
   and p.proname in ('registra_documento', 'app_dizionario', 'imposta_voce_dizionario');
