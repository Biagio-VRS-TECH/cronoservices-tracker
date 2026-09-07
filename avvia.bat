@echo off
title Crono Mappature - VRS Tech
cd /d "%~dp0app"
echo Avvio del server...
start "" http://localhost:8770
python server.py %*
if errorlevel 1 (
  echo.
  echo Il server si e' fermato con un errore. Premi un tasto per chiudere.
  pause >nul
)
