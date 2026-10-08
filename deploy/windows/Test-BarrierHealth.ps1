#Requires -Version 5.1
<#
.SYNOPSIS
  One-command health check for a Barrier Monitor Windows install.
.DESCRIPTION
  Why it exists: first-time operators need one pasteable command that answers
  "is it working, and if not, where?". Fully read-only (changes nothing) and
  never prints secrets: the database password is masked everywhere. Prints
  PASS/WARN/FAIL lines, saves the same report to logs\health-report.txt, and
  exits 1 when anything FAILs so it can gate other automation.
  Paste the FAIL lines (only) when asking for help.
.EXAMPLE
  powershell -ExecutionPolicy Bypass -File .\deploy\windows\Test-BarrierHealth.ps1
  powershell -ExecutionPolicy Bypass -File .\deploy\windows\Test-BarrierHealth.ps1 -InstallDir D:\apps\barrier-monitor
#>
param(
  [string]$InstallDir = 'C:\srv\barrier-monitor',
  [string]$BackupDir = 'D:\backups\barreiras',
  [string]$AppPort = '8000'
)

$ErrorActionPreference = 'SilentlyContinue'
$fail = 0
function Say([string]$level, [string]$msg) {
  $color = @{ PASS = 'Green'; WARN = 'Yellow'; FAIL = 'Red'; INFO = 'Gray' }[$level]
  Write-Host "[$level] $msg" -ForegroundColor $color
  if ($level -eq 'FAIL') { $script:fail++ }
}
$report = New-Object System.Collections.Generic.List[string]
function SayBoth([string]$level, [string]$msg) { Say $level $msg; $report.Add("[$level] $msg") }

SayBoth 'INFO' "Barrier health check: $(Get-Date -Format s) on $env:COMPUTERNAME"

foreach ($s in @('BarrierApp', 'BarrierPoller', 'BarrierAlerts', 'BarrierCaddy', 'postgresql-x64-16')) {
  $svc = Get-Service $s -ErrorAction SilentlyContinue
  if (-not $svc) {
    if ($s -in @('BarrierCaddy', 'BarrierPoller')) { SayBoth 'INFO' "service ${s}: not installed (ok when that role was skipped)." }
    else { SayBoth 'FAIL' "service ${s}: missing (re-run Setup-Production.ps1)." }
  } elseif ($svc.Status -ne 'Running') { SayBoth 'FAIL' "service ${s}: $($svc.Status) (check logs\$s-err.log)." }
  else { SayBoth 'PASS' "service ${s}: Running." }
}

foreach ($p in @(8000, 80, 5432)) {
  if (Get-NetTCPConnection -LocalPort $p -State Listen -ErrorAction SilentlyContinue) { SayBoth 'PASS' "port ${p}: something is listening." }
  elseif ($p -eq 80) { SayBoth 'INFO' 'port 80: nothing listening (ok without Caddy / loopback-only host).' }
  else { SayBoth 'FAIL' "port ${p}: nothing listening." }
}

$sw = [Diagnostics.Stopwatch]::StartNew()
try {
  $h = Invoke-RestMethod "http://127.0.0.1:$AppPort/api/health" -TimeoutSec 10
  $sw.Stop()
  if ($h.ok -eq $true) { SayBoth 'PASS' "app /api/health: ok in $([int]$sw.Elapsed.TotalMilliseconds) ms." }
  else { SayBoth 'FAIL' 'app /api/health: answered but ok != true.' }
} catch { SayBoth 'FAIL' "app /api/health: unreachable ($_)." }
try {
  $login = Invoke-WebRequest "http://127.0.0.1:$AppPort/login" -UseBasicParsing -TimeoutSec 10
  SayBoth 'PASS' "app /login: HTTP $($login.StatusCode)."
} catch { SayBoth 'FAIL' "app /login: unreachable ($_)." }

$envFile = Join-Path $InstallDir '.env'
if (Test-Path $envFile) {
  $dbUrl = (Get-Content $envFile | Where-Object { $_ -match '^\s*DATABASE_URL\s*=' } | Select-Object -First 1) -replace '^\s*DATABASE_URL\s*=\s*', ''
  $dbUrl = $dbUrl.Trim('"', "'", ' ')
  try {
    $u = [Uri]$dbUrl
    SayBoth 'INFO' "db target: $($u.UserInfo.Split(':')[0])@$($u.Host):$($u.Port)$($u.AbsolutePath) (password masked)."
    $psql = 'C:\Program Files\PostgreSQL\16\bin\psql.exe'
    if (-not (Test-Path $psql)) { $psql = (Get-Command psql -ErrorAction SilentlyContinue).Source }
    if ($psql) {
      $env:PGPASSWORD = $u.UserInfo.Split(':')[1]
      $r = & $psql "postgres://$($u.UserInfo)@$($u.Host):$($u.Port)/postgres" -tAc 'SELECT 1' 2>&1
      Remove-Item Env:\PGPASSWORD -ErrorAction SilentlyContinue
      if ($r -eq '1') { SayBoth 'PASS' 'db: SELECT 1 ok.' } else { SayBoth 'FAIL' "db: query failed ($r)." }
    } else { SayBoth 'WARN' 'db: psql not found, connectivity untested.' }
  } catch { SayBoth 'FAIL' "db: bad DATABASE_URL in .env ($_)." }
} else { SayBoth 'FAIL' '.env: missing (setup never completed?).' }

foreach ($d in @($InstallDir, $BackupDir)) {
  $q = Split-Path -Qualifier $d
  if (Test-Path $d) {
    $gb = [math]::Round((Get-PSDrive $q.TrimEnd(':')).Free / 1GB, 1)
    if ($gb -lt 2) { SayBoth 'WARN' "disk ${q}: only $gb GB free." } else { SayBoth 'PASS' "disk ${q}: $gb GB free." }
  } else { SayBoth 'WARN' "path missing: $d" }
}
$dumps = Get-ChildItem $BackupDir -Filter 'barreiras-*.dump' -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending
if ($dumps) {
  $ageH = ((Get-Date) - $dumps[0].LastWriteTime).TotalHours
  if ($dumps[0].Length -eq 0) { SayBoth 'FAIL' "backup: newest dump is EMPTY ($($dumps[0].Name))." }
  elseif ($ageH -gt 48) { SayBoth 'WARN' "backup: newest dump is $([int]$ageH) h old." }
  else { SayBoth 'PASS' "backup: $($dumps[0].Name) ($([math]::Round($dumps[0].Length / 1MB, 1)) MB, $([int]$ageH) h old)." }
} else { SayBoth 'WARN' 'backup: no dumps found (task never ran or -SkipBackup).' }

$errLog = Join-Path $InstallDir 'logs\BarrierApp-err.log'
if (Test-Path $errLog) {
  $hits = Get-Content $errLog -Tail 200 -ErrorAction SilentlyContinue | Where-Object { $_ -match 'error|fail|exception|panic' } | Select-Object -Last 5
  if ($hits) { SayBoth 'WARN' 'recent app errors:'; $hits | ForEach-Object { SayBoth 'WARN' "  $_" } }
  else { SayBoth 'PASS' 'app error log: nothing alarming in last 200 lines.' }
} else { SayBoth 'INFO' 'app error log: absent (service may log only to stdout).' }

$deno = (Get-Command deno -ErrorAction SilentlyContinue).Source
if ($deno -and (Test-Path "$InstallDir\scripts\doctor.ts")) {
  Push-Location $InstallDir
  & $deno run -A --env-file=.env scripts/doctor.ts 2>&1 | ForEach-Object { SayBoth 'INFO' "  doctor: $_" }
  Pop-Location
}

$out = Join-Path $InstallDir 'logs\health-report.txt'
$report | Set-Content -Path $out -Encoding UTF8
Write-Host ''
Write-Host "report saved: $out (attach the FAIL lines when asking for help)."
exit $fail
