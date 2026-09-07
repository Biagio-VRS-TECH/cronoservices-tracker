<#
  installa-sync-cloud.ps1 - registra l'operazione pianificata.
  Lo chiama installa-sync-cloud.cmd: non serve lanciarlo a mano.

  Scelte, e il perche':
   - LogonType Interactive: gira come l'utente collegato, quindi NON serve
     salvare nessuna password e il driver ACE.OLEDB trova l'ambiente che si
     aspetta. Prezzo: il PC deve essere acceso e l'utente collegato.
   - StartWhenAvailable: se alle 06:00 il PC era spento, il travaso parte
     appena si accende invece di saltare il giorno.
   - RunOnlyIfNetworkAvailable: senza rete non ha senso provarci.
#>
param(
  [string]$Nome = 'CronoServices - sync verso Supabase',
  [string]$Ora  = '06:00'
)
$ErrorActionPreference = 'Stop'

$cmd = Join-Path $PSScriptRoot 'sync-cloud.cmd'
if (-not (Test-Path $cmd)) { throw "Non trovo $cmd" }

$azione = New-ScheduledTaskAction -Execute $cmd -Argument 'auto' -WorkingDirectory $PSScriptRoot
$quando = New-ScheduledTaskTrigger -Daily -At $Ora
$come   = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType Interactive -RunLevel Limited
$regole = New-ScheduledTaskSettingsSet -StartWhenAvailable -RunOnlyIfNetworkAvailable `
            -ExecutionTimeLimit (New-TimeSpan -Minutes 30) -MultipleInstances IgnoreNew

Register-ScheduledTask -TaskName $Nome -Action $azione -Trigger $quando `
  -Principal $come -Settings $regole -Description `
  'Legge CronoServices_be.accdb e manda clienti e service a Supabase. Una direzione sola: le spunte non tornano indietro.' `
  -Force | Out-Null

Write-Output "Operazione '$Nome' creata: tutti i giorni alle $Ora."
