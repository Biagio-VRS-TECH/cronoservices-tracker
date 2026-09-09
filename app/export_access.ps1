# export_access.ps1 - Estrae clienti e services dal backend Access in JSON UTF-8.
# Usato da sync.py. Sola lettura: non modifica il file .accdb.
# NB: questo file deve restare ASCII puro (PowerShell 5.1 legge gli .ps1 in ANSI:
#     un nome di campo accentato scritto qui dentro si corrompe). Per tClienti si usa
#     SELECT * cosi' il nome "Citta'" arriva dal recordset e non dal sorgente.
param(
  [Parameter(Mandatory=$true)][string]$Accdb,
  [Parameter(Mandatory=$true)][string]$Out
)

function Read-Table($conn, $sql) {
  $rs = New-Object -ComObject ADODB.Recordset
  $rs.Open($sql, $conn, 3, 1)   # adOpenStatic, adLockReadOnly
  $names = @(); foreach ($f in $rs.Fields) { $names += $f.Name }
  $rows = New-Object System.Collections.ArrayList
  while (-not $rs.EOF) {
    $o = [ordered]@{}
    foreach ($n in $names) {
      $v = $rs.Fields.Item($n).Value
      if ($null -eq $v -or $v -is [DBNull]) { $o[$n] = $null }
      elseif ($v -is [datetime]) { $o[$n] = $v.ToString("yyyy-MM-dd") }
      else { $o[$n] = ([string]$v).Trim() }
    }
    [void]$rows.Add($o)
    $rs.MoveNext()
  }
  $rs.Close()
  return $rows
}

$conn = New-Object -ComObject ADODB.Connection
# Mode=Read: il provider apre in sola lettura. Comunque $Accdb e' una COPIA
# temporanea fatta da sync.py: l'originale sulla rete non viene aperto mai.
$conn.Open("Provider=Microsoft.ACE.OLEDB.12.0;Data Source=$Accdb;Mode=Read;")

$clienti = Read-Table $conn "SELECT * FROM tClienti"

$services = Read-Table $conn @"
SELECT s.IDService, s.IDCliente, s.Tipo, s.Stato, s.Subappalto, s.Destinazione, s.Localita,
       s.Provincia, s.Mappatura, s.NContratto, s.DataInizio, s.DataScadenza, s.Note,
       s.IDCadenza, c.Cadenza, c.QVA,
       s.IDCausaleRinnovo, r.CausaleRinnovo, r.RinnovoAutomatico, r.GGRinnovo,
       s.Gen, s.Feb, s.Mar, s.Apr, s.Mag, s.Giu, s.Lug, s.Ago, s.Sett, s.Ott, s.Nov, s.Dic
FROM (tServices AS s
      LEFT JOIN tCadenza AS c ON s.IDCadenza = c.IDCadenza)
      LEFT JOIN tCausaliRinnovo AS r ON s.IDCausaleRinnovo = r.IDCausaleRinnovo
"@

$conn.Close()

$payload = [ordered]@{
  estratto_il = (Get-Date).ToString("s")
  sorgente    = $Accdb
  clienti     = $clienti
  services    = $services
}
$json = $payload | ConvertTo-Json -Depth 6 -Compress
[System.IO.File]::WriteAllText($Out, $json, (New-Object System.Text.UTF8Encoding($false)))
Write-Output ("OK clienti={0} services={1}" -f $clienti.Count, $services.Count)
