-- 07-ruoli.sql - il primo amministratore (#ANCHOR: ruoli).
--
-- Online il ruolo sta in operatori.ruolo ed e' legato alla CASELLA del login:
-- da qui in avanti gli altri admin si nominano dall'app (Azioni > Impostazioni
-- > Chi e' amministratore), che chiama imposta_ruolo. Ma il primo non puo'
-- nominarsi da solo: si fa qui, una volta, dall'SQL Editor di Supabase.
--
-- Prerequisiti: 01, 02, 03 e 04 rieseguiti (la colonna `ruolo`, e_admin(),
-- imposta_ruolo e i grant). La persona deve essere ENTRATA almeno una volta
-- nel tracker, cosi' la sua riga in `operatori` esiste.
--
-- Sostituire la casella e lanciare:

update public.operatori
   set ruolo = 'admin'
 where email = 'nome.cognome@vrs-tech.it';

-- Controllo: deve tornare almeno una riga.
select nome, email, ruolo from public.operatori where ruolo = 'admin';
