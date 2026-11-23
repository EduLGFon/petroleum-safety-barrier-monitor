#Requires -Version 5.1
#Requires -RunAsAdministrator
<#
.SYNOPSIS
  Safely undo a Barrier Monitor Windows install (default keeps data + code).
.DESCRIPTION
  Why it exists: nobody touches a production server confidently without a way
  back. The default run only stops/removes the prefixed services, the
  Barrier Monitor firewall rules and the backup task - code, database,
  PostgreSQL, Deno and the tools stay exactly where they are, so reinstalling
  is just re-running setup.
  -RemoveCode and -RemoveDatabase are opt-in, each needs a typed YES, and the
  database path takes a final backup before dropping anything.
.EXAMPLE
  powershell -ExecutionPolicy Bypass -File .\deploy\windows\Uninstall-Production.ps1
  $env:POSTGRES_SUPER_PASSWORD = '...'
  powershell -ExecutionPolicy Bypass -File .\deploy\windows\Uninstall-Production.ps1 -RemoveCode -RemoveDatabase
.EXAMPLE
  Legacy Barrier* layout: .\deploy\windows\Uninstall-Production.ps1 -ServicePrefix Barrier -DbName barreiras
#>
param(
  [string]$InstallDir = 'C:\srv\barrier-monitor',
  [string]$ToolsDir = 'C:\tools',
  [string]$BackupDir = 'D:\backups\monitor',
  [string]$ServicePrefix = 'SeaMonitor',
  [string]$DbName = 'monitor',
  [string]$PgPort = '5432',
  [string]$PostgresBinDir = 'C:\sites\seacrest\.vendor\pgsql18\bin',
  [string]$PostgresSuperPassword = '',
  [switch]$RemoveCode,
  [switch]$RemoveDatabase
)

$ErrorActionPreference = 'Stop'

if ($ServicePrefix -cnotmatch '^[A-Za-z][A-Za-z0-9]{0,31}$') {
  throw "-ServicePrefix '$ServicePrefix' invalid: must start with a letter, then letters/digits (max 32 chars)."
}
# DbName is interpolated into DROP DATABASE; use the same strict identifier
# rule as Setup-Production.ps1 (no quoting tricks, max PostgreSQL length).
if ($DbName -cnotmatch '^[a-z_][a-z0-9_]{0,62}$') {
  throw "-DbName '$DbName' invalid: must match ^[a-z_][a-z0-9_]{0,62}$ (lowercase, digits, underscore; max 63 chars)."
}
$pgPortNum = 0
if (-not [int]::TryParse($PgPort, [ref]$pgPortNum) -or $pgPortNum -lt 1 -or $pgPortNum -gt 65535) {
  throw "-PgPort '$PgPort' invalid: must be a TCP port number 1-65535."
}

$svcApp = "${ServicePrefix}App"
$svcPoller = "${ServicePrefix}Poller"
$svcAlerts = "${ServicePrefix}Alerts"
$svcCaddy = "${ServicePrefix}Caddy"

function Resolve-PgTool([string]$ExeName, [string]$BinDir) {
  if (-not [string]::IsNullOrWhiteSpace($BinDir)) {
    $candidate = Join-Path $BinDir "$ExeName.exe"
    if (Test-Path $candidate) { return $candidate }
  }
  $command = Get-Command $ExeName -ErrorAction SilentlyContinue
  if ($command) { return $command.Source }
  throw "$ExeName.exe not found under -PostgresBinDir '$BinDir' or PATH. Pass -PostgresBinDir with the PostgreSQL bin directory."
}

$nssm = Join-Path $ToolsDir 'nssm\nssm.exe'
if (-not (Test-Path $nssm)) {
  $alt = Get-ChildItem $ToolsDir -Recurse -Depth 2 -Filter 'nssm.exe' -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($alt) { $nssm = $alt.FullName }
}

Write-Host "This will stop and remove: ${svcApp}/${svcPoller}/${svcAlerts}/${svcCaddy} services, Barrier Monitor firewall rules, BarrierBackup task."
Write-Host 'It will NOT touch: code, database, PostgreSQL, Deno, backups on disk.'
if ($RemoveCode) { Write-Host "PLUS: delete $InstallDir (code + logs)." -ForegroundColor Yellow }
if ($RemoveDatabase) { Write-Host "PLUS: drop Postgres database $DbName (after a final backup)." -ForegroundColor Red }
$answer = Read-Host 'Type YES in capitals to continue'
if ($answer -cne 'YES') { Write-Host 'aborted; nothing was changed.'; return }

foreach ($s in @($svcApp, $svcPoller, $svcAlerts, $svcCaddy)) {
  if (Get-Service -Name $s -ErrorAction SilentlyContinue) {
    if (Test-Path $nssm) {
      & $nssm stop $s | Out-Null
      & $nssm remove $s confirm | Out-Null
    } else {
      Stop-Service $s -Force -ErrorAction SilentlyContinue
      sc.exe delete $s | Out-Null
    }
    Write-Host "service ${s}: removed."
  }
}

# Setup-Production.ps1 keeps the 'Barrier Monitor ...' display names on
# purpose, so remove them for every prefix. A future prefixed rename is
# covered by the second pattern without touching unrelated rules.
$fwPatterns = @('Barrier Monitor*')
if ($ServicePrefix -ne 'Barrier') { $fwPatterns += "${ServicePrefix} Monitor*" }
$removedRules = 0
foreach ($pattern in $fwPatterns) {
  $rules = @(Get-NetFirewallRule -DisplayName $pattern -ErrorAction SilentlyContinue)
  if ($rules.Count -gt 0) {
    $rules | Remove-NetFirewallRule -ErrorAction SilentlyContinue
    $removedRules += $rules.Count
  }
}
Write-Host "firewall rules: removed ($removedRules)."

$backupTasks = @('BarrierBackup', "${ServicePrefix}Backup") | Sort-Object -Unique
foreach ($task in $backupTasks) {
  schtasks /delete /tn $task /f 2>$null | Out-Null
}
Write-Host 'backup task: removed.'

if ($RemoveDatabase) {
  # Prefer the environment over the command line: a CLI secret is visible in
  # the process list and shell history. The parameter stays for compatibility.
  if (-not $PostgresSuperPassword -and $env:POSTGRES_SUPER_PASSWORD) {
    $PostgresSuperPassword = $env:POSTGRES_SUPER_PASSWORD
  }
  if (-not $PostgresSuperPassword) {
    throw 'refusing: -RemoveDatabase needs POSTGRES_SUPER_PASSWORD in the environment (or the legacy -PostgresSuperPassword parameter).'
  }
  $second = Read-Host "Really DROP database $DbName? Type the database name to confirm"
  if ($second -cne $DbName) { Write-Host 'name mismatch; database kept.'; return }
  $backupScript = Join-Path $InstallDir 'deploy\windows\Backup-Database.ps1'
  if (-not (Test-Path $backupScript)) {
    throw "refusing to drop the database: final backup script not found at $backupScript."
  }
  Write-Host 'taking a final backup first...'
  try {
    & $backupScript -BackupDir $BackupDir -DbName $DbName -PostgresBinDir $PostgresBinDir
  } catch {
    throw "final backup failed, database kept: $_"
  }
  $psql = Resolve-PgTool 'psql' $PostgresBinDir
  $env:PGPASSWORD = $PostgresSuperPassword
  try {
    & $psql -X -U postgres -h localhost -p $pgPortNum -d postgres -w -c "DROP DATABASE $DbName" | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "psql exited $LASTEXITCODE; database may still exist." }
  } finally {
    Remove-Item Env:\PGPASSWORD -ErrorAction SilentlyContinue
  }
  Write-Host "database ${DbName}: dropped."
}
if ($RemoveCode) {
  Remove-Item $InstallDir -Recurse -Force
  Write-Host "code: $InstallDir deleted."
}
Write-Host ''
Write-Host 'Undone. PostgreSQL, Deno, tools and backup files were left alone on purpose.'
