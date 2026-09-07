@echo off
rem ============================================================================
rem  Fa girare da sola, una volta al giorno, la lettura del backend Access e il
rem  suo invio a Supabase. Da eseguire SOLO sul PC che ha il file .accdb.
rem  Non serve essere amministratore: l'operazione viene creata per l'utente
rem  corrente e parte quando questo utente e' collegato a Windows.
rem ============================================================================
setlocal
set "NOME=CronoServices - sync verso Supabase"
set "ORA=06:00"

echo.
echo   Crono Mappature - sincronia giornaliera verso il cloud
echo   -----------------------------------------------------
echo   PC:        %COMPUTERNAME%
echo   Utente:    %USERNAME%
echo   Cartella:  %~dp0
echo   Orario:    tutti i giorni alle %ORA%
echo.

if not exist "%~dp0..\app\cloud.json" (
  echo   ATTENZIONE: manca app\cloud.json con le credenziali Supabase.
  echo   Crealo prima, con dentro:
  echo.
  echo     { "supabase_url": "https://xxxx.supabase.co", "service_key": "eyJ..." }
  echo.
  echo   La chiave e' la service_role, si trova in Supabase alla voce
  echo   Project Settings ^> API. Vive solo su questo PC: non va su Netlify.
  echo.
  pause
  exit /b 1
)

schtasks /Query /TN "%NOME%" >nul 2>&1
if not errorlevel 1 (
  echo   La sincronia automatica e' GIA' attiva.
  echo.
  set /p "R=  Vuoi TOGLIERLA? [s/N] "
  if /i "%R%"=="s" (
    schtasks /Delete /TN "%NOME%" /F >nul
    echo   Tolta. L'anagrafica online restera' ferma all'ultimo invio.
  ) else (
    echo   Lasciata come era.
  )
  echo.
  pause
  exit /b 0
)

echo   Verra' creata un'operazione pianificata di Windows che ogni mattina
echo   legge il .accdb e manda clienti e service al database online.
echo   Le spunte non vengono toccate: quelle vivono solo online.
echo.
set /p "R=  Procedo? [s/N] "
if /i not "%R%"=="s" (
  echo   Non ho cambiato niente.
  echo.
  pause
  exit /b 0
)

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0installa-sync-cloud.ps1" -Nome "%NOME%" -Ora "%ORA%"
if errorlevel 1 (
  echo.
  echo   Non e' riuscito. Si puo' fare a mano con l'Utilita' di pianificazione:
  echo   nuova operazione giornaliera alle %ORA% che avvia
  echo   %~dp0sync-cloud.cmd
  echo.
  pause
  exit /b 1
)

echo.
echo   Fatto. Prova subito: sto eseguendo il primo travaso adesso.
echo.
call "%~dp0sync-cloud.cmd" auto
echo.
pause
