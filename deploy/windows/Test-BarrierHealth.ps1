#Requires -Version 5.1
<#
.SYNOPSIS
  One-command health check for a Barrier Monitor Windows install.
.DESCRIPTION
  Why it exists: first-time operators need one pasteable command that answers
  "is it working, and if not, where?". Fully read-only (changes nothing) and
  never prints secrets: the database password is masked everywhere.
  SECURITY: the parsed DATABASE_URL is never passed on a command line. psql
  receives discrete -h/-p/-U/-d arguments and the password travels only in
  PGPASSWORD for the child process.
  Prints PASS/WARN/FAIL lines, saves the same report to logs\health-report.txt,
  and exits 1 when anything FAILs so it can gate other automation.
  Paste the FAIL lines (only) when asking for help.
.EXAMPLE
  powershell -ExecutionPolicy Bypass -File .\deploy\windows\Test-BarrierHealth.ps1
  powershell -ExecutionPolicy Bypass -File .\deploy\windows\Test-BarrierHealth.ps1 -InstallDir D:\apps\barrier-monitor
#>
param(
  [string]$InstallDir = 'C:\srv\barrier-monitor',
  [string]$BackupDir = 'D:\backups\monitor',
  [string]$ServicePrefix = 'SeaMonitor',
  [string]$AppPort = '8300',
  [string]$PostgresBinDir = 'C:\sites\seacrest\.vendor\pgsql18\bin',
  [string]$PgPort = '5432',
  [string]$DbName = 'monitor'
)

$ErrorActionPreference = 'SilentlyContinue'
$fail = 0
$report = New-Object System.Collections.Generic.List[string]
function Say([string]$level, [string]$msg) {
  $color = @{ PASS = 'Green'; WARN = 'Yellow'; FAIL = 'Red'; INFO = 'Gray' }[$level]
  Write-Host "[$level] $msg" -ForegroundColor $color
  if ($level -eq 'FAIL') { $script:fail++ }
}
function SayBoth([string]$level, [string]$msg) { Say $level $msg; $report.Add("[$level] $msg") }

if ($ServicePrefix -cnotmatch '^[A-Za-z][A-Za-z0-9]{0,31}$') {
  SayBoth 'FAIL' "-ServicePrefix '$ServicePrefix' invalid: must start with a letter, then letters/digits (max 32 chars)."
  exit 1
}
$appPortNum = 0
if (-not [int]::TryParse($AppPort, [ref]$appPortNum) -or $appPortNum -lt 1 -or $appPortNum -gt 65535) {
  SayBoth 'FAIL' "-AppPort '$AppPort' invalid: must be a TCP port number 1-65535."
  exit 1
}
$pgPortNum = 0
if (-not [int]::TryParse($PgPort, [ref]$pgPortNum) -or $pgPortNum -lt 1 -or $pgPortNum -gt 65535) {
  SayBoth 'FAIL' "-PgPort '$PgPort' invalid: must be a TCP port number 1-65535."
  exit 1
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

SayBoth 'INFO' "Barrier health check: $(Get-Date -Format s) on $env:COMPUTERNAME"

foreach ($s in @($svcApp, $svcPoller, $svcAlerts, $svcCaddy)) {
  $svc = Get-Service -Name $s -ErrorAction SilentlyContinue
  if (-not $svc) {
    if ($s -eq $svcCaddy -or $s -eq $svcPoller) {
      SayBoth 'INFO' "service ${s}: not installed (ok when that role was skipped)."
    } else {
      SayBoth 'FAIL' "service ${s}: missing (re-run Setup-Production.ps1)."
    }
  } elseif ($svc.Status -ne 'Running') {
    SayBoth 'FAIL' "service ${s}: $($svc.Status) (check logs\${s}-err.log)."
  } else {
    SayBoth 'PASS' "service ${s}: Running."
  }
}

# PostgreSQL service names differ by version and installer. Match the family
# instead of pinning one version; a remote database legitimately has no local
# service, so that case is a WARN and the SELECT 1 below decides.
$pgServices = @(Get-Service -Name 'postgresql*' -ErrorAction SilentlyContinue)
if ($pgServices.Count -eq 0) {
  SayBoth 'WARN' 'service postgresql*: none found (ok when DATABASE_URL points at a remote server).'
} else {
  $pgRunning = @($pgServices | Where-Object { $_.Status -eq 'Running' })
  if ($pgRunning.Count -gt 0) {
    SayBoth 'PASS' "service $($pgRunning[0].Name): Running."
  } else {
    $states = ($pgServices | ForEach-Object { "$($_.Name)=$($_.Status)" }) -join ', '
    SayBoth 'FAIL' "service postgresql*: not running ($states)."
  }
}

$portChecks = @($appPortNum, 80, $pgPortNum) | Sort-Object -Unique
foreach ($p in $portChecks) {
  if (Get-NetTCPConnection -LocalPort $p -State Listen -ErrorAction SilentlyContinue) {
    SayBoth 'PASS' "port ${p}: something is listening."
  } elseif ($p -eq 80) {
    SayBoth 'INFO' 'port 80: nothing listening (ok without Caddy / loopback-only host).'
  } elseif ($p -eq $pgPortNum) {
    SayBoth 'FAIL' "port ${p}: nothing listening (PostgreSQL)."
  } else {
    SayBoth 'FAIL' "port ${p}: nothing listening (app)."
  }
}

$sw = [Diagnostics.Stopwatch]::StartNew()
try {
  $h = Invoke-RestMethod "http://127.0.0.1:$appPortNum/api/health" -TimeoutSec 10
  $sw.Stop()
  if ($h.ok -eq $true) { SayBoth 'PASS' "app /api/health: ok in $([int]$sw.Elapsed.TotalMilliseconds) ms." }
  else { SayBoth 'FAIL' 'app /api/health: answered but ok != true.' }
} catch { SayBoth 'FAIL' "app /api/health: unreachable ($_)." }
try {
  $login = Invoke-WebRequest "http://127.0.0.1:$appPortNum/login" -UseBasicParsing -TimeoutSec 10
  SayBoth 'PASS' "app /login: HTTP $($login.StatusCode)."
} catch { SayBoth 'FAIL' "app /login: unreachable ($_)." }

$envFile = Join-Path $InstallDir '.env'
$dbTarget = $DbName
$dbConfigured = $false
if (Test-Path $envFile) {
  $databaseUrl = $null
  foreach ($line in Get-Content $envFile -Encoding UTF8) {
    if ($line -match '^\s*DATABASE_URL\s*=\s*(.+?)\s*$') {
      $databaseUrl = ($Matches[1].Trim('"', "'", ' ') -replace "`r", "") -replace "`n", ""
      break
    }
  }
  if (-not $databaseUrl) {
    SayBoth 'FAIL' '.env: DATABASE_URL not found.'
  } else {
    try {
      $u = [Uri]$databaseUrl.Trim('"', "'", ' ')
      if ($u.Scheme -notin @('postgres', 'postgresql')) {
        throw "scheme '$($u.Scheme)' is not postgres/postgresql"
      }
      if (-not $u.UserInfo) { throw 'no userinfo in DATABASE_URL' }
      $colon = $u.UserInfo.IndexOf(':')
      if ($colon -lt 0) { throw 'no password part in DATABASE_URL userinfo' }
      $dbUser = [Uri]::UnescapeDataString($u.UserInfo.Substring(0, $colon))
      $dbPassword = [Uri]::UnescapeDataString($u.UserInfo.Substring($colon + 1))
      if ([string]::IsNullOrEmpty($dbPassword)) { throw 'DATABASE_URL password is empty' }
      $dbHost = $u.Host -replace '^\[(.+)\]$', '$1'
      if ([string]::IsNullOrWhiteSpace($dbHost)) { $dbHost = 'localhost' }
      $dbPort = $pgPortNum
      if ($u.Port -gt 0) { $dbPort = $u.Port }
      if ($PSBoundParameters.ContainsKey('PgPort')) { $dbPort = $pgPortNum }
      $urlDb = [Uri]::UnescapeDataString(($u.AbsolutePath -replace '^/+', ''))
      if ($PSBoundParameters.ContainsKey('DbName')) {
        $dbTarget = $DbName
        if ($urlDb -and $urlDb -ne $DbName) {
          SayBoth 'WARN' "db: -DbName '$DbName' differs from the DATABASE_URL database '$urlDb'; checking '$DbName'."
        }
      } elseif ($urlDb) {
        $dbTarget = $urlDb
      }
      $dbConfigured = $true
      SayBoth 'INFO' "db target: ${dbUser}@${dbHost}:${dbPort}/${dbTarget} (password masked)."
    } catch {
      SayBoth 'FAIL' "db: bad DATABASE_URL in .env ($_)."
    }
  }
} else {
  SayBoth 'FAIL' '.env: missing (setup never completed?).'
}

if ($dbConfigured) {
  $psql = $null
  try {
    $psql = Resolve-PgTool 'psql' $PostgresBinDir
  } catch {
    SayBoth 'FAIL' "db: $($_.Exception.Message)"
  }
  if ($psql) {
    $env:PGPASSWORD = $dbPassword
    try {
      $queryResult = & $psql -X -h $dbHost -p $dbPort -U $dbUser -d $dbTarget -w -tAc 'SELECT 1' 2>&1
      $psqlExit = $LASTEXITCODE
    } finally {
      Remove-Item Env:\PGPASSWORD -ErrorAction SilentlyContinue
    }
    $queryText = (($queryResult | ForEach-Object { "$_" }) -join ' ').Trim()
    if ($psqlExit -eq 0 -and $queryText -eq '1') {
      SayBoth 'PASS' 'db: SELECT 1 ok.'
    } else {
      SayBoth 'FAIL' "db: SELECT 1 failed (exit $psqlExit): $queryText"
    }
  }
}

foreach ($d in @($InstallDir, $BackupDir)) {
  $q = Split-Path -Qualifier $d
  if (Test-Path $d) {
    $gb = [math]::Round((Get-PSDrive $q.TrimEnd(':')).Free / 1GB, 1)
    if ($gb -lt 2) { SayBoth 'WARN' "disk ${q}: only $gb GB free." } else { SayBoth 'PASS' "disk ${q}: $gb GB free." }
  } else { SayBoth 'WARN' "path missing: $d" }
}

$dumps = Get-ChildItem $BackupDir -Filter "${dbTarget}-*.dump" -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending
if ($dumps) {
  $ageH = ((Get-Date) - $dumps[0].LastWriteTime).TotalHours
  if ($dumps[0].Length -eq 0) { SayBoth 'FAIL' "backup: newest dump is EMPTY ($($dumps[0].Name))." }
  elseif ($ageH -gt 48) { SayBoth 'WARN' "backup: newest dump is $([int]$ageH) h old." }
  else { SayBoth 'PASS' "backup: $($dumps[0].Name) ($([math]::Round($dumps[0].Length / 1MB, 1)) MB, $([int]$ageH) h old)." }
} else { SayBoth 'WARN' "backup: no ${dbTarget}-*.dump found (task never ran or -SkipBackup)." }

$errLog = Join-Path $InstallDir "logs\${svcApp}-err.log"
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
