@echo off
rem ============================================================================
rem  Legge il backend Access e spinge l'anagrafica su Supabase.
rem  Lo lancia l'operazione pianificata creata da installa-sync-cloud.cmd;
rem  si puo' anche eseguire a mano per forzare un aggiornamento.
rem  Traccia di ogni esecuzione: data\push_cloud.log
rem ============================================================================
setlocal
cd /d "%~dp0..\app"

python push_cloud.py
set ESITO=%ERRORLEVEL%

if not "%ESITO%"=="0" (
  echo.
  echo   Il travaso NON e' riuscito. Il dettaglio e' in ..\data\push_cloud.log
  if "%1"=="" pause
)
exit /b %ESITO%
