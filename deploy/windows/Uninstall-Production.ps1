#Requires -Version 5.1
#Requires -RunAsAdministrator
<#
.SYNOPSIS
  Safely undo a Barrier Monitor Windows install (default keeps data + code).
.DESCRIPTION
  Why it exists: nobody touches a production server confidently without a way
  back. The default run only stops/removes the four Barrier services, the
  firewall rules and the backup task - code, database, Postgres, Deno and the
  tools stay exactly where they are, so reinstalling is just re-running setup.
  -RemoveCode and -RemoveDatabase are opt-in, each needs a typed YES, and the
  database path takes a final backup first.
.EXAMPLE
  powershell -ExecutionPolicy Bypass -File .\deploy\windows\Uninstall-Production.ps1
  powershell -ExecutionPolicy Bypass -File .\deploy\windows\Uninstall-Production.ps1 -RemoveCode -RemoveDatabase -PostgresSuperPassword '...'
#>
param(
  [string]$InstallDir = 'C:\srv\barrier-monitor',
  [string]$ToolsDir = 'C:\tools',
  [string]$BackupDir = 'D:\backups\barreiras',
  [string]$DbName = 'barreiras',
  [string]$PgPort = '5432',
  [string]$PostgresSuperPassword = '',
  [switch]$RemoveCode,
  [switch]$RemoveDatabase
)

$ErrorActionPreference = 'Stop'
$nssm = Join-Path $ToolsDir 'nssm\nssm.exe'
if (-not (Test-Path $nssm)) {
  $alt = Get-ChildItem $ToolsDir -Recurse -Depth 2 -Filter 'nssm.exe' -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($alt) { $nssm = $alt.FullName }
}

Write-Host 'This will stop and remove: BarrierApp/Poller/Alerts/Caddy services, Barrier firewall rules, BarrierBackup task.'
Write-Host 'It will NOT touch: code, database, PostgreSQL, Deno, backups on disk.'
if ($RemoveCode) { Write-Host "PLUS: delete $InstallDir (code + logs)." -ForegroundColor Yellow }
if ($RemoveDatabase) { Write-Host "PLUS: drop Postgres database $DbName (after a final backup)." -ForegroundColor Red }
$answer = Read-Host 'Type YES in capitals to continue'
if ($answer -cne 'YES') { Write-Host 'aborted; nothing was changed.'; return }

foreach ($s in @('BarrierApp', 'BarrierPoller', 'BarrierAlerts', 'BarrierCaddy')) {
  if (Get-Service $s -ErrorAction SilentlyContinue) {
    if (Test-Path $nssm) { & $nssm stop $s | Out-Null; & $nssm remove $s confirm | Out-Null }
    else { Stop-Service $s -Force -ErrorAction SilentlyContinue; sc.exe delete $s | Out-Null }
    Write-Host "service ${s}: removed."
  }
}
Get-NetFirewallRule -DisplayName 'Barrier Monitor*' -ErrorAction SilentlyContinue | Remove-NetFirewallRule -ErrorAction SilentlyContinue
Write-Host 'firewall rules: removed.'
schtasks /delete /tn 'BarrierBackup' /f 2>$null | Out-Null
Write-Host 'backup task: removed.'

if ($RemoveDatabase) {
  if (-not $PostgresSuperPassword) { throw 'refusing: -RemoveDatabase needs -PostgresSuperPassword.' }
  $second = Read-Host "Really DROP database $DbName? Type the database name to confirm"
  if ($second -cne $DbName) { Write-Host 'name mismatch; database kept.'; return }
  $backupScript = Join-Path $InstallDir 'deploy\windows\Backup-Database.ps1'
  if (Test-Path $backupScript) {
    Write-Host 'taking a final backup first…'
    powershell -NoProfile -ExecutionPolicy Bypass -File $backupScript -BackupDir $BackupDir
  }
  $env:PGPASSWORD = $PostgresSuperPassword
  try {
    & 'C:\Program Files\PostgreSQL\16\bin\psql.exe' -U postgres -h localhost -p $PgPort -c "DROP DATABASE $DbName" | Out-Null
  } finally { Remove-Item Env:\PGPASSWORD -ErrorAction SilentlyContinue }
  Write-Host "database ${DbName}: dropped."
}
if ($RemoveCode) {
  Remove-Item $InstallDir -Recurse -Force
  Write-Host "code: $InstallDir deleted."
}
Write-Host ''
Write-Host 'Undone. PostgreSQL, Deno, tools and backup files were left alone on purpose.'
