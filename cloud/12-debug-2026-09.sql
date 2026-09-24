-- 12-debug-2026-09.sql - le correzioni online rimaste aperte dopo il 09/10/11.
--
-- Si puo' rilanciare quante volte si vuole: solo `create or replace function`
-- (tre funzioni, per nome e firma esatti) e revoke/grant su quelle tre. Non
-- tocca NESSUN dato e NESSUN oggetto del Planning (`pl_*`): niente insert,
-- update o delete, niente revoke `on all ...`.
--
-- Ordine: dopo 01-11. Sul database condiviso col Planning NON si rilanciano
-- 01-08 (vedi LEGGIMI.md, §6-bis): questo file basta da solo. `_applica` e
-- `imposta_nota` qui NON si riscrivono: online portano il controllo che vi ha
-- aggiunto il Planning (033/036/037).
--
-- Cosa mette a posto, in ordine di gravita':
--   1. ruolo_corrente(): chi e' disattivato nel Planning restava 'admin' per
--      ruolo_corrente(), e la Netlify Function registra-utente chiede proprio
--      quello: un amministratore disattivato poteva ancora creare caselle;
--   2. ripristina_blocco(): `op_id like p_op_id || ':%'` - con op_id '%' si
--      ripristinavano TUTTI i blocchi del diario, con '_' ogni blocco di un
--      carattere (gia' corretto in app/api_spunte.py, 34a sessione);
--   3. imposta_meta(): '2026-13' passava, e confrontato come testo rendeva
--      "non tracciato" tutto il 2026 (gia' corretto in app/api_permessi.py);
--   4. _csv(): la formula injection del CSV si neutralizza con un apice, come
--      app/api_scadenze.py (_testo_csv). La tabulazione del 09 non bastava.

-- ============================================ 1. ruolo_corrente e il login ===
-- Tutte le funzioni dell'app chiedono prima autorizzato() e poi il ruolo, quindi
-- dentro l'app non cambia niente. Cambia per chi chiede SOLO il ruolo: la
-- Function registra-utente (netlify/functions/registra-utente.mjs), che col
-- token di chi preme chiede ruolo_corrente() e, se risponde 'admin', usa la
-- service key. autorizzato() (10, SEC-01) dice di no a chi e' disattivato nel
-- Planning; ruolo_corrente() invece leggeva `operatori.ruolo` e basta, e il
-- token di un amministratore disattivato si rinnova ancora (Supabase Auth il
-- Planning non lo conosce). Ora chi non e' autorizzato e' 'tecnico': nessun
-- potere, e nessun valore nuovo che il client non conosca.
create or replace function public.ruolo_corrente() returns text
language sql stable security definer set search_path = public as $fn$
  select case when public.autorizzato()
              then coalesce((select o.ruolo from public.operatori o
                              where o.email = public.email_corrente() limit 1), 'tecnico')
              else 'tecnico' end
$fn$;

-- =================================== 2. ripristina_blocco senza jolly nel LIKE ===
-- Il testo e' quello di 02-funzioni.sql parola per parola; cambia solo come si
-- riconosce il blocco. `left(op_id, n + 1) = p_op_id || ':'` e' il gemello di
-- `substr(op_id, 1, n + 1) = op_id + ':'` di app/api_spunte.py: nessun carattere
-- fa da jolly. Solo l'amministratore arriva fin qui, ma un '%' finito nel
-- diario (o scritto a mano nella console) rimetteva indietro il lavoro di tutti.
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

  -- il blocco si confronta per prefisso esatto: in un confronto a modello un
  -- '%' o un '_' dentro p_op_id farebbero da jolly
  for e in select * from public.eventi
            where op_id = p_op_id or left(op_id, length(p_op_id) + 1) = p_op_id || ':'
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

-- ============================================= 3. imposta_meta, mese 01-12 ===
-- Il testo e' quello di 03-letture.sql; cambia solo la regola del formato.
-- `[0-9]` e non `\d`: in Postgres `\d` e' [[:digit:]], che secondo la
-- collazione puo' prendere anche cifre non latine.
create or replace function public.imposta_meta(p_inizio_tracciamento text)
returns jsonb
language plpgsql security definer set search_path = public as $fn$
declare v text := btrim(coalesce(p_inizio_tracciamento, ''));
begin
  if not public.autorizzato() then
    raise exception 'non autorizzato' using errcode = '42501';
  end if;
  if not public.e_admin() then
    return jsonb_build_object('http', 403, 'errore', 'questa azione e'' dell''amministratore');
  end if;
  if v !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' then
    return jsonb_build_object('http', 400, 'errore', 'formato atteso AAAA-MM');
  end if;
  insert into public.meta(k, v) values ('inizio_tracciamento', v)
  on conflict (k) do update set v = excluded.v;
  return jsonb_build_object('http', 200, 'inizio_tracciamento', v);
end $fn$;

-- ============================================= 4. _csv, niente formule ===
-- Gemello di _testo_csv in app/api_scadenze.py. Una cella che comincia con
-- = + - @ TAB o CR, Excel e LibreOffice la leggono come formula (anche una
-- chiamata verso l'esterno). Il 09 ci metteva davanti una tabulazione, che non
-- basta: una cella che cominciava GIA' con TAB o CR passava intatta, e la TAB
-- in testa e' proprio uno dei caratteri da neutralizzare. Ora un apice, che la
-- fa restare testo. Un numero semplice (-5, -3,5, +7) non e' una formula e
-- resta com'e'. Le virgolette per ; " CR LF restano quelle di prima (dopo
-- l'apice: un campo quotato comincia comunque con l'apice, dentro).
-- Interna: la chiama app_export_csv (SECURITY DEFINER), da fuori non si esegue.
create or replace function public._csv(v text) returns text
language sql immutable set search_path = public as $fn$
  select case
    when w is null then ''
    when w ~ '[";\r\n]' then '"' || replace(w, '"', '""') || '"'
    else w end
  from (select case when left(v, 1) in ('=', '+', '-', '@', E'\t', E'\r')
                     and v !~ '^[+-]?[0-9]+([.,][0-9]+)?$'
                    then '''' || v
                    else v end as w) x
$fn$;

-- ================================================================ permessi ===
-- `create or replace` tiene i permessi che c'erano; queste righe servono a un
-- progetto nuovo (una funzione creata da capo nasce eseguibile da PUBLIC) e
-- toccano solo queste quattro, per firma esatta.
revoke execute on function public._csv(text) from public, anon, authenticated;

revoke execute on function
  public.ruolo_corrente(),
  public.ripristina_blocco(text),
  public.imposta_meta(text)
from public, anon;

grant execute on function
  public.ruolo_corrente(),
  public.ripristina_blocco(text),
  public.imposta_meta(text)
to authenticated;

-- ================================================================ controllo ===
-- Dopo averlo eseguito, tutte le colonne devono essere `true` (una riga per
-- funzione). `_csv` e' interna: niente SECURITY DEFINER e niente EXECUTE per
-- chi ha fatto il login, e le colonne lo tengono gia' in conto.
select p.proname,
       p.prosecdef = (p.proname <> '_csv')                        as definer_giusto,
       coalesce(array_to_string(p.proconfig, ',') like '%search_path=public%', false)
                                                                  as search_path_fisso,
       not has_function_privilege('anon', p.oid, 'execute')       as anon_fuori,
       has_function_privilege('authenticated', p.oid, 'execute') = (p.proname <> '_csv')
                                                                  as login_giusto,
       case p.proname
         when 'ruolo_corrente'    then position('autorizzato()' in p.prosrc) > 0
         when 'ripristina_blocco' then position('like' in lower(p.prosrc)) = 0
                                   and position('left(op_id, length(p_op_id) + 1)' in p.prosrc) > 0
         when 'imposta_meta'      then position('(0[1-9]|1[0-2])' in p.prosrc) > 0
         when '_csv'              then position('[+-]?[0-9]+([.,][0-9]+)?' in p.prosrc) > 0
       end                                                        as correzione_presente
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public'
   and p.proname in ('ruolo_corrente', 'ripristina_blocco', 'imposta_meta', '_csv')
 order by 1;

-- La regola del CSV, provata senza scrivere niente: la colonna `giusto` deve
-- essere `true` su ogni riga.
select v as cella, public._csv(v) as esce, public._csv(v) = atteso as giusto
  from (values ('=1+1', '''=1+1'), ('- sostituito filtro', '''- sostituito filtro'),
               (E'\t=1+1', E'''\t=1+1'), ('+39 0422 1234', '''+39 0422 1234'),
               ('-5', '-5'), ('-3,5', '-3,5'), ('nota normale', 'nota normale'),
               ('=a;b', '"''=a;b"'), (null, '')) t(v, atteso);
