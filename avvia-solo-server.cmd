@echo off
rem Avvia il server SENZA aprire il browser: serve all'avvio automatico e al PC
rem che fa da server per i colleghi.  Chiudere la finestra ferma il server.
title Crono Mappature - server VRS
cd /d "%~dp0app"
python server.py %*
if errorlevel 1 (
  echo.
  echo Il server si e' fermato con un errore. Premi un tasto per chiudere.
  pause >nul
)
