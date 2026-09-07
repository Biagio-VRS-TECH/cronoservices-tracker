@echo off
rem ============================================================================
rem  Fa partire Crono Mappature da sola a ogni accesso a Windows, su QUESTO PC.
rem  Da usare solo sul computer che fa da server per i colleghi.
rem  Non serve essere amministratore: mette un collegamento nella cartella
rem  Esecuzione automatica dell'utente corrente.
rem ============================================================================
setlocal
set "AVVIO=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
set "LINK=%AVVIO%\Crono Mappature.lnk"
set "BERSAGLIO=%~dp0avvia-solo-server.cmd"

echo.
echo   Crono Mappature - avvio automatico
echo   ----------------------------------
echo   PC:        %COMPUTERNAME%
echo   Utente:    %USERNAME%
echo   Cartella:  %~dp0
echo.

if exist "%LINK%" (
  echo   L'avvio automatico e' GIA' attivo.
  echo.
  set /p "R=  Vuoi TOGLIERLO? [s/N] "
  if /i "%R%"=="s" (
    del "%LINK%"
    echo   Togliato. Al prossimo accesso il server non partira' piu' da solo.
  ) else (
    echo   Lasciato come era.
  )
  echo.
  pause
  exit /b 0
)

echo   Verra' creato un collegamento in Esecuzione automatica, cosi' il server
echo   parte a ogni accesso a Windows e i colleghi trovano sempre l'applicazione.
echo.
set /p "R=  Procedo? [s/N] "
if /i not "%R%"=="s" (
  echo   Non ho cambiato niente.
  echo.
  pause
  exit /b 0
)

powershell -NoProfile -Command ^
  "$s=(New-Object -ComObject WScript.Shell).CreateShortcut('%LINK%');" ^
  "$s.TargetPath='%BERSAGLIO%';" ^
  "$s.WorkingDirectory='%~dp0';" ^
  "$s.WindowStyle=7;" ^
  "$s.Description='Server Crono Mappature VRS';" ^
  "$s.Save()"

if exist "%LINK%" (
  echo.
  echo   Fatto. Il server partira' da solo al prossimo accesso.
  echo.
  echo   NOTA sul firewall: la prima volta che un collega si collega, Windows
  echo   puo' chiedere di autorizzare Python sulla rete. Rispondere CONSENTI
  echo   sulle reti private. Se la richiesta non compare e il collega non
  echo   riesce a entrare, aprire un Prompt come amministratore e dare:
  echo.
  echo     netsh advfirewall firewall add rule name="Crono Mappature" ^
  echo       dir=in action=allow protocol=TCP localport=8770 profile=private
  echo.
) else (
  echo   Non e' riuscito. Si puo' fare a mano: premere Win+R, scrivere
  echo   shell:startup, e trascinare dentro avvia-solo-server.cmd.
)
echo.
pause
