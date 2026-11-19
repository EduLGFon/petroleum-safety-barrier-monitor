#Requires -Version 5.1
# NOTE: no `#Requires -RunAsAdministrator` here on purpose. The script
# self-elevates below with an argument ARRAY (no string splicing), so spaces,
# quotes, $ and backticks in arguments survive the UAC hop. Setup.cmd forwards
# arguments untouched with `powershell -File ... %*` for the same reason.
<#
.SYNOPSIS
  End-to-end production install of Barrier Monitor on Windows Server 2022/2025.
.DESCRIPTION
  Why it exists: Install-BarrierMonitor.ps1 only prepares prerequisites and
  expects the operator to finish Postgres, NSSM, Caddy, services, firewall,
  backups and smoke tests by hand. This script does the whole chain in one
  invocation and is idempotent: re-run after a code update to pull, rebuild,
  migrate and restart. Fails hard (no warn-and-continue) on doctor, build,
  migrate or smoke errors, because this is the production path.
  Secrets are generated when omitted, printed once at the end, and never
  written to logs. Re-runs never rotate an existing .env.
  No domain? Omit -Hostname for IP mode: plain HTTP on port 80 for the
  office LAN (optionally scoped with -AllowedLanRanges); re-run with
  -Hostname later for automatic https. First time on a server? Run with
  -CheckOnly first: it probes the host and prints the full plan without
  changing anything. Without -Unattended the real run asks for a typed YES
  before touching anything.
.EXAMPLE
  powershell -ExecutionPolicy Bypass -File .\deploy\windows\Setup-Production.ps1 `
    -Hostname monitor.example.com -CompanyName "Seacrest Petróleo" `
    -AdminEmail you@example.com -RepoUrl https://github.com/org/repo.git
.EXAMPLE
  IP-only office server (no domain), LAN-scoped plain HTTP on port 80.
  powershell -ExecutionPolicy Bypass -File .\deploy\windows\Setup-Production.ps1 `
    -CompanyName "Seacrest Petróleo" -AdminEmail you@example.com `
    -AllowedLanRanges '10.0.0.0/8','192.168.0.0/16' -SourceZip C:\temp\repo.zip
.NOTES
  Secrets are NEVER command-line arguments: a CLI value stays visible in
  process lists and shell history. Set ADMIN_PASSWORD / DB_PASSWORD /
  POSTGRES_SUPER_PASSWORD / FRACTTAL_SECRET in the environment or answer the
  interactive prompts. Passing -AdminPassword / -DbPassword /
  -PostgresSuperPassword / -FracttalSecret on the command line aborts.
  Defaults target the APP10 production topology (SeaMonitor* services,
  database monitor, vendor PostgreSQL 18); every default is overridable, and
  passing -ServicePrefix Barrier restores the legacy Barrier* layout.
#>
param(
  [string]$InstallDir = 'C:\srv\barrier-monitor',
  [string]$ToolsDir = 'C:\tools',
  [string]$BackupDir = 'D:\backups\monitor',
  [string]$ServicePrefix = 'SeaMonitor',
  [string]$Hostname = '',
  [string]$ServerIp = '',
  [string[]]$AllowedLanRanges = @(),
  [string]$CompanyName = '',
  [string]$AdminEmail = '',
  [string]$AdminPassword = '',
  [string]$DbUser = 'barrier',
  [string]$DbName = 'monitor',
  [string]$DbPassword = '',
  [string]$PgPort = '5432',
  [string]$PostgresSuperPassword = '',
  [string]$AppPort = '8300',
  [string]$DenoVersion = 'v2.9.7',
  [string]$CaddyVersion = 'v2.11.7',
  [string]$NssmVersion = '2.24',
  [string]$PostgresInstallerUrl = 'https://get.enterprisedb.com/postgresql/postgresql-16.4-1-windows-x64.exe',
  [string]$PostgresBinDir = 'C:\sites\seacrest\.vendor\pgsql18\bin',
  [string]$RepoUrl = '',
  [string]$SourceZip = '',
  [string]$Branch = 'master',
  [string]$FracttalKey = '',
  [string]$FracttalSecret = '',
  [switch]$SkipPostgres,
  [switch]$SkipCaddy,
  [switch]$SkipBackup,
  [switch]$SkipFirewall,
  [switch]$AllowLanAppPort,
  [switch]$Unattended,
  [switch]$CheckOnly
)

$ErrorActionPreference = 'Stop'

# Secrets never ride the command line: a CLI value stays visible in process
# lists (Get-CimInstance/task manager) and shell history. This gate runs
# BEFORE elevation so a secret can never be forwarded to the elevated child
# either. Use the env var or the interactive prompt instead.
foreach ($s in @('AdminPassword', 'DbPassword', 'PostgresSuperPassword', 'FracttalSecret')) {
  if ($PSBoundParameters.ContainsKey($s) -and $PSBoundParameters[$s]) {
    throw "SETUP ABORTED: secret -$s was passed on the command line (visible in process lists/history). Set the $s env var or answer the interactive prompt instead."
  }
}

# Self-elevation (UAC): rebuild the invocation as an argument ARRAY and hand
# it to Start-Process -Verb RunAs, so spaces, quotes, $ and backticks survive
# (no -Command string splicing anywhere). Secrets cannot be in the array: the
# gate above already rejected them, and env vars are inherited by the
# elevated process. Already elevated: skip straight to the install.
if (-not ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  $elevateArgs = @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', $PSCommandPath)
  foreach ($key in $PSBoundParameters.Keys) {
    $val = $PSBoundParameters[$key]
    if ($val -is [switch]) {
      if ($val.IsPresent) { $elevateArgs += "-$key" }
    } elseif ($val -is [System.Array]) {
      foreach ($item in $val) { $elevateArgs += "-$key"; $elevateArgs += "$item" }
    } else {
      $elevateArgs += "-$key"; $elevateArgs += "$val"
    }
  }
  try {
    $elevated = Start-Process powershell -Verb RunAs -ArgumentList $elevateArgs -Wait -PassThru
    exit $elevated.ExitCode
  } catch {
    throw "SETUP ABORTED: elevation was refused or failed ($_). Right-click PowerShell -> Run as administrator and re-run."
  }
}

function Write-Step([string]$msg) { Write-Host "`n==> $msg" -ForegroundColor Cyan }
function Write-Need([string]$msg) { throw "SETUP ABORTED: $msg" }

function New-RandomPassword([int]$length = 20) {
  $alphabet = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789'.ToCharArray()
  $bytes = New-Object byte[] $length
  [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
  -join ($bytes | ForEach-Object { $alphabet[$_ % $alphabet.Length] })
}

function New-RandomHex([int]$bytes = 32) {
  $b = New-Object byte[] $bytes
  [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b)
  -join ($b | ForEach-Object { '{0:x2}' -f $_ })
}

function Invoke-Download([string]$url, [string]$outFile) {
  [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
  $attempt = 0
  while ($true) {
    $attempt++
    try {
      Invoke-WebRequest -Uri $url -OutFile $outFile -UseBasicParsing
      return
    } catch {
      if ($attempt -ge 3) { throw "download failed after 3 tries: $url -- $_" }
      Start-Sleep -Seconds ($attempt * 10)
    }
  }
}

function Write-AllTextNoBom([string]$path, [string]$text) {
  # PowerShell 5.1 `Set-Content -Encoding UTF8` writes a BOM, which breaks
  # naive .env/Caddyfile readers. .NET with UTF8Encoding($false) is BOM-free
  # on every PowerShell version (5.1 has no -Encoding utf8NoBOM).
  $utf8 = New-Object System.Text.UTF8Encoding $false
  [System.IO.File]::WriteAllText($path, $text, $utf8)
}

function Format-DotEnvValue([string]$value) {
  # Quote values containing whitespace, # or quotes so `KEY=value with space`
  # and `KEY=abc#def` survive a round trip (an unquoted # starts a comment for
  # most .env readers). Double quotes with \ and " escaped; scripts/doctor.ts
  # strips and unescapes them symmetrically.
  if ($value -eq '' -or $value -match '[\s#"''"]' -or $value -match '^\s' -or $value -match '\s$') {
    $esc = ($value -replace '\\', '\\') -replace '"', '\"'
    return '"' + $esc + '"'
  }
  return $value
}

function Set-DotEnvKey([string]$file, [string]$key, [string]$value) {
  # Sanitize: strip CR/LF so a pasted secret can never inject extra .env lines
  # (e.g. "pass`nEVIL=1"). Tabs/spaces are preserved; only line breaks are cut.
  $value = ($value -replace "`r", "") -replace "`n", ""
  if ($value -match '[\x00-\x08\x0b\x0c\x0e-\x1f]') {
    throw "SETUP ABORTED: value for $key contains control characters."
  }
  $lines = @(Get-Content $file)
  $pattern = "^(#\s*)?" + [regex]::Escape($key) + '\s*=.*$'
  $done = $false
  $lines = $lines | ForEach-Object {
    if (-not $done -and $_ -match $pattern) { $done = $true; "$key=$(Format-DotEnvValue $value)" } else { $_ }
  }
  if (-not $done) { $lines += "$key=$(Format-DotEnvValue $value)" }
  # BOM-free rewrite (see Write-AllTextNoBom): PS 5.1 Set-Content -Encoding
  # UTF8 would stamp a BOM on .env.
  Write-AllTextNoBom $file (($lines -join "`r`n") + "`r`n")
}

# ── 0. Host and inputs ──────────────────────────────────────────────
Write-Step 'Checking host (Windows Server 2022/2025, 64-bit, elevated)'
$os = (Get-CimInstance Win32_OperatingSystem).Caption
Write-Host "OS: $os"
if (-not [Environment]::Is64BitOperatingSystem) { Write-Need '64-bit Windows is required.' }
if ($os -notmatch '2022|2025') { Write-Warning "$os is not Server 2022/2025; continuing, verify paths manually." }
# Postgres identifier gate: DbUser/DbName are interpolated into CREATE ROLE /
# CREATE DATABASE, so they must be strict identifiers (no quoting tricks).
# Pattern ^[a-z_][a-z0-9_]{0,62}$ matches Postgres' own 63-byte limit.
foreach ($pair in @(@('DbUser', $DbUser), @('DbName', $DbName))) {
  if ($pair[1] -cnotmatch '^[a-z_][a-z0-9_]{0,62}$') {
    Write-Need "$($pair[0]) '$($pair[1])' invalid: must match ^[a-z_][a-z0-9_]{0,62}$ (lowercase, digits, underscore; max 63 chars)."
  }
}
# Service identity: every service this setup manages carries the prefix
# (APP10 production uses SeaMonitor*; -ServicePrefix Barrier restores the
# legacy Barrier* layout). Names are derived once and used everywhere below.
if ($ServicePrefix -cnotmatch '^[A-Za-z][A-Za-z0-9]{0,31}$') {
  Write-Need "-ServicePrefix '$ServicePrefix' invalid: must start with a letter, then letters/digits (max 32 chars)."
}
$svcApp = "${ServicePrefix}App"
$svcPoller = "${ServicePrefix}Poller"
$svcAlerts = "${ServicePrefix}Alerts"
$svcCaddy = "${ServicePrefix}Caddy"
# Ports travel as strings from the CLI; reject non-numeric/out-of-range early
# so neither CheckOnly nor the firewall rules get a garbage LocalPort.
foreach ($pair in @(@('PgPort', $PgPort), @('AppPort', $AppPort))) {
  if ($pair[1] -notmatch '^\d+$' -or [int]$pair[1] -lt 1 -or [int]$pair[1] -gt 65535) {
    Write-Need "-$($pair[0]) '$($pair[1])' invalid: must be a TCP port number 1-65535."
  }
}
function Read-SecretEnvOrPrompt([string]$envName, [string]$label) {
  $v = [Environment]::GetEnvironmentVariable($envName)
  if (-not [string]::IsNullOrEmpty($v)) { return $v }
  $sec = Read-Host -AsSecureString "$label (input hidden, from env $envName or type here; empty = generate)"
  if ($sec -and $sec.Length -gt 0) {
    $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($sec)
    try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr) }
    finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }
  }
  return ''
}
if (-not $AdminPassword) {
  $fromEnv = Read-SecretEnvOrPrompt 'ADMIN_PASSWORD' 'Admin password'
  if ($fromEnv) { $AdminPassword = $fromEnv }
}
if (-not $DbPassword) {
  $fromEnv = Read-SecretEnvOrPrompt 'DB_PASSWORD' 'Postgres app password'
  if ($fromEnv) { $DbPassword = $fromEnv }
}
if (-not $PostgresSuperPassword -and (Test-Path (Join-Path $PostgresBinDir 'pg_ctl.exe'))) {
  # Existing Postgres needs the superuser now; missing value fails later with
  # a clear message (no silent generation over an existing cluster).
  $fromEnv = [Environment]::GetEnvironmentVariable('POSTGRES_SUPER_PASSWORD')
  if ($fromEnv) { $PostgresSuperPassword = $fromEnv }
}
if (-not $FracttalSecret) {
  $fromEnv = [Environment]::GetEnvironmentVariable('FRACTTAL_SECRET')
  if ($fromEnv) { $FracttalSecret = $fromEnv }
}
if ([string]::IsNullOrWhiteSpace($AdminEmail) -or $AdminEmail -notlike '*@*') {
  Write-Need 'pass -AdminEmail you@example.com (first admin account).'
}
if ($AdminPassword -and $AdminPassword.Length -lt 12) { Write-Need 'AdminPassword must be 12+ characters.' }
$generatedAdmin = $false
if (-not $AdminPassword) { $AdminPassword = New-RandomPassword 20; $generatedAdmin = $true }
if ($Hostname) {
  try {
    $resolved = (Resolve-DnsName $Hostname -Type A -ErrorAction Stop).IPAddress -join ', '
    Write-Host "DNS: $Hostname -> $resolved"
  } catch {
    Write-Warning "DNS: $Hostname does not resolve yet. Caddy cannot issue its certificate until it does (it retries automatically); fix the A record and re-run if https stays down."
  }
}
$lanIps = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
  Where-Object { $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254.*' } |
  Select-Object -ExpandProperty IPAddress
if (-not $ServerIp) { $ServerIp = $lanIps | Select-Object -First 1 }
if (-not $Hostname) {
  if (-not $ServerIp) { $ServerIp = 'SERVER-IP'; Write-Warning 'no LAN address detected; fix the URL in the summary below.' }
  Write-Warning "IP mode: users will open http://${ServerIp} in plain HTTP (no encryption possible without a domain). Keep port 80 reachable from the trusted office network/VPN only - never the internet. Re-run with -Hostname once a domain exists to get automatic https."
}

# ── 0b. Postgres location: vendor path first, installed fallback ───
# APP10 serves Postgres from C:\sites\seacrest\.vendor\pgsql18; a host that
# only has the classic EDB install keeps working via the fallback below.
# Anything else (or two clusters at once) is an explicit operator choice, not
# a silent default: ambiguity aborts in 0c instead of spawning a second DB.
$pg16Bin = 'C:\Program Files\PostgreSQL\16\bin'
$pg18Bin = 'C:\Program Files\PostgreSQL\18\bin'
if (-not (Test-Path (Join-Path $PostgresBinDir 'pg_ctl.exe'))) {
  if (-not $PSBoundParameters.ContainsKey('PostgresBinDir')) {
    $pgFallback = @($pg16Bin, $pg18Bin) | Where-Object { Test-Path (Join-Path $_ 'pg_ctl.exe') }
    if (@($pgFallback).Count -eq 1) {
      Write-Warning "Postgres binaries not found at the default $PostgresBinDir; using the installed $($pgFallback[0]) instead. Pass -PostgresBinDir explicitly to choose."
      $PostgresBinDir = $pgFallback[0]
    }
  }
}

# ── 0c. Parallel-instance guards: scan now, report in CheckOnly, abort live
# Installing a second stack next to APP10's SeaMonitor* services (or a second
# Postgres cluster, or grabbing an occupied port) is always a mistake, so the
# setup refuses instead of creating it. Re-run with the matching
# -ServicePrefix / -PostgresBinDir to update the existing install.
function Test-ListenPort([int]$p) {
  try { $null -ne (Get-NetTCPConnection -LocalPort $p -State Listen -ErrorAction Stop) }
  catch { $false }
}
$knownPrefixes = @('Barrier', 'SeaMonitor')
$knownPgBins = @('C:\sites\seacrest\.vendor\pgsql18\bin', $pg16Bin, $pg18Bin)
$samePrefixServices = @()
$foreignServices = @()
foreach ($prefix in $knownPrefixes) {
  foreach ($suffix in @('App', 'Poller', 'Alerts', 'Caddy')) {
    $nm = "$prefix$suffix"
    if (Get-Service $nm -ErrorAction SilentlyContinue) {
      if ($prefix -eq $ServicePrefix) { $samePrefixServices += $nm } else { $foreignServices += $nm }
    }
  }
}
$otherPgBins = @($knownPgBins | Where-Object { $_ -ne $PostgresBinDir -and (Test-Path (Join-Path $_ 'pg_ctl.exe')) })
$portWatch = @([int]80, [int]443, [int]$AppPort, 8300, [int]$PgPort, 5432) | Sort-Object -Unique
$occupiedPorts = @($portWatch | Where-Object { Test-ListenPort $_ })
$portConflicts = @()
if ($samePrefixServices.Count -eq 0) { $portConflicts = $occupiedPorts }
$conflicts = @()
foreach ($s in $foreignServices) { $conflicts += "service $s exists with a different prefix (this run would install ${ServicePrefix}* alongside it; re-run with the matching -ServicePrefix to update it instead)" }
foreach ($b in $otherPgBins) { $conflicts += "PostgreSQL binaries found at $b outside the selected -PostgresBinDir $PostgresBinDir (re-run with the matching -PostgresBinDir, or -SkipPostgres)" }
foreach ($p in $portConflicts) { $conflicts += "port $p is already listening and no ${ServicePrefix}* service is installed, so it would not be updated by this run (free the port or re-run with the matching -ServicePrefix)" }

# ── 0d. Readiness report: say what WOULD happen, change nothing ─────
if ($CheckOnly) {
  Write-Step 'Readiness report (nothing installed, nothing changed)'
  $drive = Split-Path -Qualifier $InstallDir
  $freeGB = [math]::Round((Get-PSDrive $drive.TrimEnd(':')).Free / 1GB, 1)
  if ($freeGB -ge 10) { Write-Host "PASS disk: $freeGB GB free on $drive (need ~2 GB + backups)." -ForegroundColor Green }
  else { Write-Host "WARN disk: only $freeGB GB free on $drive." -ForegroundColor Yellow }
  $bDrive = Split-Path -Qualifier $BackupDir
  try {
    $bFreeGB = [math]::Round((Get-PSDrive $bDrive.TrimEnd(':')).Free / 1GB, 1)
    if (Test-Path $BackupDir) { $bState = 'exists' } else { $bState = 'absent (setup would create it)' }
    if ($bFreeGB -ge 5) { Write-Host "PASS backup: $bDrive has $bFreeGB GB free; $BackupDir $bState." -ForegroundColor Green }
    else { Write-Host "WARN backup: only $bFreeGB GB free on $bDrive for $BackupDir ($bState)." -ForegroundColor Yellow }
  } catch {
    Write-Host "WARN backup: cannot stat $bDrive for $BackupDir ($_)." -ForegroundColor Yellow
  }
  foreach ($p in $portWatch) {
    if (Test-ListenPort $p) {
      if ($samePrefixServices.Count -gt 0) { Write-Host "WARN port ${p}: already in use (a ${ServicePrefix}* service is installed, so a real run would refresh it and continue)." -ForegroundColor Yellow }
      else { Write-Host "WARN port ${p}: already in use with no ${ServicePrefix}* service installed (a real run would ABORT)." -ForegroundColor Yellow }
    }
    else { Write-Host "PASS port ${p}: free." -ForegroundColor Green }
  }
  foreach ($prefix in $knownPrefixes) {
    foreach ($suffix in @('App', 'Poller', 'Alerts', 'Caddy')) {
      $s = "$prefix$suffix"
      if (Get-Service $s -ErrorAction SilentlyContinue) {
        if ($prefix -eq $ServicePrefix) { Write-Host "INFO service ${s}: already exists (setup will refresh it)." }
        else { Write-Host "WARN service ${s}: foreign prefix installed (a real run ABORTS; re-run with -ServicePrefix $prefix to update it)." -ForegroundColor Yellow }
      }
    }
  }
  foreach ($s in @('postgresql-x64-16', 'postgresql-x64-18')) {
    if (Get-Service $s -ErrorAction SilentlyContinue) { Write-Host "INFO service ${s}: already exists (Postgres cluster present)." }
  }
  foreach ($b in $knownPgBins) {
    if (Test-Path (Join-Path $b 'pg_ctl.exe')) {
      if ($b -eq $PostgresBinDir) { Write-Host "INFO postgres: binaries at $b (selected via -PostgresBinDir)." }
      else { Write-Host "WARN postgres: another install at $b (a real run ABORTS; pass -PostgresBinDir to select it)." -ForegroundColor Yellow }
    }
  }
  if ($conflicts.Count -gt 0) {
    Write-Host 'WARN guards: a real run would ABORT now:' -ForegroundColor Yellow
    foreach ($c in $conflicts) { Write-Host "  - $c" -ForegroundColor Yellow }
  } else {
    Write-Host 'PASS guards: no foreign services, no second Postgres, no stray ports.' -ForegroundColor Green
  }
  if (Test-Path "$InstallDir\deno.jsonc") { Write-Host 'INFO code: already present (setup will pull latest).' }
  else { Write-Host 'INFO code: will be fetched (zip/clone, no git required for zip).' }
  if (Test-Path "$InstallDir\.env") { Write-Host 'INFO .env: exists and will be left untouched.' }
  else { Write-Host 'INFO .env: will be created with generated secrets (shown once).' }
  foreach ($u in @("https://github.com", $PostgresInstallerUrl, "https://nssm.cc", "https://github.com/caddyserver/caddy")) {
    try { Invoke-WebRequest -Uri $u -Method Head -TimeoutSec 15 -UseBasicParsing | Out-Null; Write-Host "PASS net: reachable $u" -ForegroundColor Green }
    catch { Write-Host "WARN net: cannot reach $u (proxy? downloads will fail)." -ForegroundColor Yellow }
  }
  Write-Host ''
  Write-Host 'PLAN (what a real run would do):'
  Write-Host "  install Deno $DenoVersion to $ToolsDir\deno (machine PATH)"
  Write-Host "  reuse PostgreSQL at $PostgresBinDir on port $PgPort (fresh host: EDB install to $pg16Bin); ensure role $DbUser + db $DbName"
  Write-Host "  migrate the database first, then run the doctor gate (fresh DBs pass)"
  Write-Host "  register services $svcApp/$svcPoller/$svcAlerts$(if (-not $SkipCaddy) { " + $svcCaddy (port 80)" } else { ' (no proxy)' })"
  Write-Host "  firewall: TCP $(if ($Hostname -or -not $SkipCaddy) { '80+443' } else { 'unchanged' })$(if ($AllowedLanRanges.Count) { " scoped to $($AllowedLanRanges -join ', ')" } else { ' (whole network: pass -AllowedLanRanges to scope)' })"
  Write-Host "  validate the generated Caddyfile (caddy validate) when Caddy is enabled"
  Write-Host "  nightly backup task BarrierBackup at 02:00 -> $BackupDir"
  Write-Host "  smoke loopback :$AppPort, plus https://$Hostname when -Hostname is set"
  Write-Host "  users would open: $(if ($Hostname) { "https://$Hostname" } else { "http://$ServerIp" })"
  Write-Host 'Re-run without -CheckOnly to do it. Nothing was changed.'
  return
}
if ($conflicts.Count -gt 0) {
  throw ("SETUP ABORTED: refusing to create a parallel instance:`n - " + ($conflicts -join "`n - "))
}
if (-not $Unattended) {
  Write-Host ''
  Write-Host "About to install Barrier Monitor into $InstallDir (${ServicePrefix}* services, Postgres $PostgresBinDir role $DbUser/db $DbName, app port $AppPort, proxy port 80)."
  $answer = Read-Host 'Type YES in capitals to continue, anything else aborts (nothing changes until then)'
  if ($answer -cne 'YES') { Write-Host 'aborted by operator; nothing was changed.'; return }
}

# ── 1. Deno (machine-wide so LocalSystem services see it) ────────────
# Supply-chain pin: verify every downloaded installer against its published
# SHA256 before executing (replace the placeholder hashes below with the
# values from the official release pages for $DenoVersion/$CaddyVersion and
# the EDB Postgres build, then uncomment the Assert-Sha256 calls). Until the
# hashes are pinned, downloads are TLS-only + version-pinned, but not
# hash-pinned - treat a hash mismatch as a hard abort, never warn-and-run.
#   $DenoSha256     = '<paste deno-x86_64-pc-windows-msvc.zip SHA256>'
#   $CaddySha256    = '<paste caddy_WINDOWS_amd64.zip SHA256>'
#   $PostgresSha256 = '<paste postgresql-16.x-windows-x64.exe SHA256>'
#   function Assert-Sha256([string]$file, [string]$expected) {
#     $actual = (Get-FileHash $file -Algorithm SHA256).Hash.ToLower()
#     if ($actual -ne $expected.ToLower()) { throw "SHA256 mismatch for $file (got $actual)" }
#   }
Write-Step "Ensuring Deno $DenoVersion (machine PATH)"
$denoDir = Join-Path $ToolsDir 'deno'
$denoExe = Join-Path $denoDir 'deno.exe'
if (-not (Test-Path $denoExe)) {
  $zip = "$env:TEMP\deno-setup.zip"
  Invoke-Download "https://github.com/denoland/deno/releases/download/$DenoVersion/deno-x86_64-pc-windows-msvc.zip" $zip
  New-Item -ItemType Directory -Force -Path $denoDir | Out-Null
  Expand-Archive -Path $zip -DestinationPath $denoDir -Force
  Remove-Item $zip -Force -ErrorAction SilentlyContinue
  $machinePath = [Environment]::GetEnvironmentVariable('Path', 'Machine')
  if ($machinePath -notlike "*$denoDir*") {
    [Environment]::SetEnvironmentVariable('Path', "$machinePath;$denoDir", 'Machine')
  }
}
$env:Path = "$denoDir;" + $env:Path
& $denoExe --version

# ── 2. PostgreSQL (vendor PG18 when present, EDB PG16 fallback) ───
$pgCtl = Join-Path $PostgresBinDir 'pg_ctl.exe'
if ((Test-Path $pgCtl) -and [string]::IsNullOrWhiteSpace($PostgresSuperPassword)) {
  Write-Need 'PostgreSQL is already installed: pass -PostgresSuperPassword (superuser) so the role/database can be ensured.'
}
$pgPassOwn = $false
if (-not $SkipPostgres -and -not (Test-Path $pgCtl)) {
  Write-Step 'Installing PostgreSQL 16 (unattended EDB installer)'
  if (-not $PostgresSuperPassword) { $PostgresSuperPassword = New-RandomPassword 24; $pgPassOwn = $true }
  $installer = "$env:TEMP\pg16-setup.exe"
  $haveInstaller = $false
  try {
    Invoke-Download $PostgresInstallerUrl $installer
    $haveInstaller = $true
  } catch {
    Write-Warning "EDB direct download failed ($_); trying winget fallback."
  }
  if ($haveInstaller) {
    $args = @('--mode', 'unattended', '--unattendedmodeui', 'none',
      '--superpassword', $PostgresSuperPassword, '--serverport', $PgPort,
      '--servicename', 'postgresql-x64-16', '--installer-language', 'en')
    $p = Start-Process -FilePath $installer -ArgumentList $args -Wait -PassThru
    Remove-Item $installer -Force -ErrorAction SilentlyContinue
    if ($p.ExitCode -ne 0) { Write-Need "PostgreSQL installer exited $($p.ExitCode)." }
  } else {
    if (-not (Get-Command winget -ErrorAction SilentlyContinue)) {
      Write-Need 'no PostgreSQL and no installer source: install PG16 manually, then re-run with -SkipPostgres.'
    }
    winget install -e --id PostgreSQL.PostgreSQL.16 --silent --accept-source-agreements --accept-package-agreements
    # Winget/EDB default superuser password is `postgres`; rotate immediately.
    $PostgresSuperPassword = 'postgres'
    $pgPassOwn = $true
  }
  # The EDB installer always lands in Program Files: adopt it when the
  # default vendor path was requested but is still absent, so a fresh host
  # keeps the old one-command install behavior instead of failing below.
  if (-not (Test-Path $pgCtl) -and (Test-Path (Join-Path $pg16Bin 'pg_ctl.exe')) -and -not $PSBoundParameters.ContainsKey('PostgresBinDir')) {
    Write-Warning "using the freshly installed PostgreSQL at $pg16Bin (default vendor path $PostgresBinDir not present)."
    $PostgresBinDir = $pg16Bin
    $pgCtl = Join-Path $PostgresBinDir 'pg_ctl.exe'
  }
}
if (-not (Test-Path $pgCtl)) {
  if ($SkipPostgres) { Write-Need 'pg_ctl not found and -SkipPostgres was given; nothing to connect to.' }
  Write-Need 'pg_ctl still missing after install. Check the installer log, then re-run.'
}
$psql = Join-Path $PostgresBinDir 'psql.exe'
Write-Step 'Ensuring role and database exist (idempotent)'
$env:PGPASSWORD = $PostgresSuperPassword
try {
  $role = & $psql -U postgres -h localhost -p $PgPort -tAc "SELECT 1 FROM pg_roles WHERE rolname='$DbUser'"
  if ($role -ne '1') {
    $safeDbPass = $DbPassword -replace "'", "''"
    & $psql -U postgres -h localhost -p $PgPort -c "CREATE ROLE $DbUser LOGIN PASSWORD '$safeDbPass'" | Out-Null
    Write-Host "role $DbUser created."
  } else {
    Write-Host "role $DbUser exists, password left untouched."
  }
  $db = & $psql -U postgres -h localhost -p $PgPort -tAc "SELECT 1 FROM pg_database WHERE datname='$DbName'"
  if ($db -ne '1') {
    & $psql -U postgres -h localhost -p $PgPort -c "CREATE DATABASE $DbName OWNER $DbUser" | Out-Null
    Write-Host "database $DbName created."
  } else {
    Write-Host "database $DbName exists."
  }
  if ($pgPassOwn -and $PostgresSuperPassword -eq 'postgres') {
    $PostgresSuperPassword = New-RandomPassword 24
    & $psql -U postgres -h localhost -p $PgPort -c "ALTER USER postgres PASSWORD '$PostgresSuperPassword'" | Out-Null
    Write-Host 'default postgres superuser password rotated.'
  }
} finally {
  Remove-Item Env:\PGPASSWORD -ErrorAction SilentlyContinue
}

# ── 3. Application code ─────────────────────────────────────────────
Write-Step "Ensuring application code at $InstallDir"
if (Test-Path "$InstallDir\deno.jsonc") {
  if (Test-Path "$InstallDir\.git" -and (Get-Command git -ErrorAction SilentlyContinue)) {
    Push-Location $InstallDir
    git fetch origin 2>$null
    git checkout $Branch 2>$null
    git pull --ff-only origin $Branch
    Pop-Location
  } else {
    Write-Host 'code present; no git metadata (or no git) so nothing pulled.'
  }
} elseif ($SourceZip) {
  New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null
  Expand-Archive -Path $SourceZip -DestinationPath "$env:TEMP\bm-src" -Force
  $root = Get-ChildItem "$env:TEMP\bm-src" -Directory | Select-Object -First 1
  Copy-Item "$($root.FullName)\*" $InstallDir -Recurse -Force
  Remove-Item "$env:TEMP\bm-src" -Recurse -Force
} elseif ($RepoUrl) {
  if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
    Write-Need 'git not found: install it (winget install Git.Git) or pass -SourceZip.'
  }
  git clone --branch $Branch $RepoUrl $InstallDir
} else {
  Write-Need "no code at ${InstallDir}: pass -RepoUrl or -SourceZip, or copy the repo there first."
}
$deployDir = Join-Path $InstallDir 'deploy\windows'
if (-not (Test-Path "$deployDir\Register-Services.ps1")) { Write-Need 'checkout is missing deploy/windows scripts.' }

# ── 4. NSSM + Caddy tooling ─────────────────────────────────────────
Write-Step 'Ensuring NSSM service wrapper'
$nssmExe = Join-Path $ToolsDir 'nssm\nssm.exe'
if (-not (Test-Path $nssmExe)) {
  $zip = "$env:TEMP\nssm-setup.zip"
  Invoke-Download "https://nssm.cc/release/nssm-$NssmVersion.zip" $zip
  Expand-Archive -Path $zip -DestinationPath $ToolsDir -Force
  Remove-Item $zip -Force -ErrorAction SilentlyContinue
  $nssmExe = Join-Path $ToolsDir "nssm-$NssmVersion\win64\nssm.exe"
  if (-not (Test-Path $nssmExe)) { Write-Need 'NSSM layout unexpected after extract.' }
}
$caddyExe = Join-Path $ToolsDir 'caddy\caddy.exe'
$caddyWanted = -not $SkipCaddy
if ($caddyWanted -and -not (Test-Path $caddyExe)) {
  $zip = "$env:TEMP\caddy-setup.zip"
  Invoke-Download "https://github.com/caddyserver/caddy/releases/download/$CaddyVersion/caddy_${CaddyVersion}_windows_amd64.zip" $zip
  New-Item -ItemType Directory -Force -Path (Split-Path $caddyExe) | Out-Null
  Expand-Archive -Path $zip -DestinationPath (Split-Path $caddyExe) -Force
  Remove-Item $zip -Force -ErrorAction SilentlyContinue
}
if (-not $caddyWanted) { Write-Host 'Caddy skipped per -SkipCaddy: port 80 stays closed; app answers on loopback only.' }

# ── 5. .env (created once, never rotated on re-run) ─────────────────
Write-Step 'Ensuring .env (created once; existing files are never overwritten)'
$envFile = Join-Path $InstallDir '.env'
$envCreated = $false
if (-not (Test-Path $envFile)) {
  $envCreated = $true
  if (-not $DbPassword) { $DbPassword = New-RandomPassword 20 }
  Copy-Item (Join-Path $InstallDir '.env.example') $envFile
  $encPass = [uri]::EscapeDataString($DbPassword)
  Set-DotEnvKey $envFile 'PUBLIC_API_MODE' 'http'
  Set-DotEnvKey $envFile 'DENO_ENV' 'production'
  Set-DotEnvKey $envFile 'DATABASE_URL' "postgres://${DbUser}:${encPass}@localhost:${PgPort}/${DbName}?sslmode=disable"
  Set-DotEnvKey $envFile 'ADMIN_TOKEN' (New-RandomHex 32)
  Set-DotEnvKey $envFile 'COMPANY_NAME' $CompanyName
  if ($Hostname) { Set-DotEnvKey $envFile 'APP_BASE_URL' "https://$Hostname" }
  else { Set-DotEnvKey $envFile 'APP_BASE_URL' "http://$ServerIp" }
  if ($FracttalKey) { Set-DotEnvKey $envFile 'FRACTTAL_KEY' $FracttalKey }
  if ($FracttalSecret) { Set-DotEnvKey $envFile 'FRACTTAL_SECRET' $FracttalSecret }
  Write-Host '.env created from template with generated secrets.'
} else {
  Write-Host '.env exists: left untouched (rotate secrets manually if needed).'
}
if ($envCreated) {
  # .env is the credential source of truth for the app and both workers, so
  # the password just written there must also be the role's password. A
  # pre-existing role keeps its old one otherwise (section 2 leaves existing
  # roles untouched), and every connection then fails with
  # "password authentication failed for user ..." while migrations that used
  # different credentials still succeed.
  Write-Step "Syncing role $DbUser password with the new .env"
  $safeDbPass = $DbPassword -replace "'", "''"
  $env:PGPASSWORD = $PostgresSuperPassword
  try {
    & $psql -U postgres -h localhost -p $PgPort -c "ALTER ROLE $DbUser WITH LOGIN PASSWORD '$safeDbPass'" | Out-Null
    if ($LASTEXITCODE -ne 0) {
      Write-Need "could not set the password for existing role $DbUser; database logins would fail."
    }
    Write-Host "role $DbUser password matches .env."
  } finally {
    Remove-Item Env:\PGPASSWORD -ErrorAction SilentlyContinue
  }
}
# Lock .env to Administrators + SYSTEM. Well-known SIDs (not the English group
# names) so the ACL is identical on localized Windows (e.g. pt-BR
# "Administradores"): S-1-5-32-544 = Administrators, S-1-5-18 = SYSTEM.
icacls $envFile /inheritance:r /grant:r '*S-1-5-32-544:F' '*S-1-5-18:F' | Out-Null

# ── 6. Build, migrate, doctor gate, first admin (hard gates) ──────
# Order matters: migrations run BEFORE the doctor gate, because a fresh
# database has no users/auth_flows tables yet and the SSO checks would abort
# with `relation "users" does not exist`. scripts/doctor.ts also tolerates
# missing tables with a warn (pointing at db:migrate) for manual runs.
Write-Step 'Building the Fresh bundle'
Push-Location $InstallDir
& $denoExe task build
if ($LASTEXITCODE -ne 0) { Pop-Location; Write-Need 'build failed; fix the error above and re-run.' }
Write-Step 'Applying database migrations (idempotent)'
& $denoExe task db:migrate
if ($LASTEXITCODE -ne 0) { Pop-Location; Write-Need 'db:migrate failed; fix DATABASE_URL/role grants and re-run.' }
Write-Step 'Running doctor gate (fails the setup on any failure)'
& $denoExe task doctor
if ($LASTEXITCODE -ne 0) { Pop-Location; Write-Need 'doctor failed; fix .env and re-run.' }
Write-Step "Ensuring admin $AdminEmail (warning is fine when it already exists)"
# Secrets via env, never CLI: --password would leak through the process list.
$env:ADMIN_PASSWORD = $AdminPassword
try {
  & $denoExe task admin:create -- --email $AdminEmail --confirm-existing
  if ($LASTEXITCODE -ne 0) { Write-Warning 'admin:create did not report success; it likely already exists. Verify login later.' }
} finally {
  Remove-Item Env:\ADMIN_PASSWORD -ErrorAction SilentlyContinue
}
Pop-Location

# ── 7. Services ─────────────────────────────────────────────────────
Write-Step "Registering $ServicePrefix services (app + poller + alerts)"
$regSupportsPrefix = (Get-Command "$deployDir\Register-Services.ps1").Parameters.ContainsKey('ServicePrefix')
if (-not $regSupportsPrefix -and $ServicePrefix -ne 'Barrier') {
  Write-Need "Register-Services.ps1 in this checkout does not support -ServicePrefix yet, so it cannot install ${ServicePrefix}* services. Update the checkout (or re-run with -ServicePrefix Barrier for the legacy layout)."
}
$regArgs = @{ InstallDir = $InstallDir; NssmExe = $nssmExe; DenoExe = $denoExe; AppPort = $AppPort }
if ($regSupportsPrefix) { $regArgs['ServicePrefix'] = $ServicePrefix }
& "$deployDir\Register-Services.ps1" @regArgs
$hasFracttal = $false
foreach ($line in Get-Content $envFile) {
  if ($line -match '^\s*FRACTTAL_KEY\s*=\s*\S+') { $hasFracttal = $true }
}
if (-not $hasFracttal) {
  Stop-Service $svcPoller -ErrorAction SilentlyContinue
  Set-Service $svcPoller -StartupType Disabled
  Write-Warning "no FRACTTAL_KEY in .env: $svcPoller disabled (exits code 2 without creds by design). Enable after adding keys."
}
if ($caddyWanted) {
  Write-Step "Registering Caddy reverse proxy for $Hostname"
  $caddyDir = Join-Path $InstallDir 'caddy'
  New-Item -ItemType Directory -Force -Path $caddyDir | Out-Null
  New-Item -ItemType Directory -Force -Path "$InstallDir\logs" | Out-Null
  $logPath = Join-Path $InstallDir 'logs\caddy-access.log'
  $site = if ($Hostname) { $Hostname } else { ':80' }
  # BOM-free write: a BOM before the site address breaks naive parsers.
  Write-AllTextNoBom "$caddyDir\Caddyfile" @"
# Generated by Setup-Production.ps1. Do not edit by hand: re-run the setup
# script to regenerate (template: deploy/windows/Caddyfile).
$site {
	reverse_proxy 127.0.0.1:$AppPort {
		header_up X-Real-IP {remote_host}
	}
	header {
		-Server
		X-Content-Type-Options nosniff
		X-Frame-Options DENY
		Referrer-Policy no-referrer
		# HSTS only after first successful https smoke test (see Caddyfile template).
		# Strict-Transport-Security "max-age=31536000; includeSubDomains"
	}
	log {
		output file $logPath
		format json
	}
}
"@
  Write-Step 'Validating the generated Caddyfile (fails the setup when invalid)'
  & $caddyExe validate --config "$caddyDir\Caddyfile" --adapter caddyfile
  if ($LASTEXITCODE -ne 0) { Write-Need 'caddy validate rejected the generated Caddyfile; fix the template/inputs and re-run.' }
  Write-Host 'Caddyfile valid.'
  $svc = Get-Service $svcCaddy -ErrorAction SilentlyContinue
  if ($svc) {
    & $nssmExe stop $svcCaddy | Out-Null
    & $nssmExe remove $svcCaddy confirm | Out-Null
  }
  & $nssmExe install $svcCaddy "`"$caddyExe`"" "run --config `"$caddyDir\Caddyfile`" --adapter caddyfile" | Out-Null
  & $nssmExe set $svcCaddy AppDirectory $caddyDir | Out-Null
  & $nssmExe set $svcCaddy Description 'Barrier Monitor TLS reverse proxy (Caddy)' | Out-Null
  & $nssmExe set $svcCaddy Start SERVICE_AUTO_START | Out-Null
  & $nssmExe set $svcCaddy AppStdout "$InstallDir\logs\$svcCaddy-out.log" | Out-Null
  & $nssmExe set $svcCaddy AppStderr "$InstallDir\logs\$svcCaddy-err.log" | Out-Null
  & $nssmExe set $svcCaddy AppRotateFiles 1 | Out-Null
  & $nssmExe set $svcCaddy AppRotateOnline 1 | Out-Null
  & $nssmExe start $svcCaddy | Out-Null
  Write-Host "service ${svcCaddy}: installed + started."
}

# ── 8. Firewall ─────────────────────────────────────────────────────
# Default-deny posture: no inbound allow rule is created unless explicitly
# required below. Web ports (80/443) REQUIRE -AllowedLanRanges (office/VPN
# CIDRs); opening them to the whole internet in plain HTTP or even https is
# refused - pass the LAN ranges or -SkipFirewall (and document the exception).
# Rule display names stay 'Barrier Monitor ...' on purpose: Uninstall-Production
# (WIN2-owned) removes them by that prefix, so renaming would orphan rules.
if (-not $SkipFirewall) {
  Write-Step 'Configuring Windows Firewall'
  $fwScope = @{}
  if ($AllowedLanRanges.Count -gt 0) { $fwScope['RemoteAddress'] = $AllowedLanRanges }
  if ($caddyWanted) {
    if ($AllowedLanRanges.Count -eq 0) {
      Write-Need 'refusing to open TCP 80/443 to the whole network: pass -AllowedLanRanges (e.g. office/VPN CIDRs) or -SkipFirewall with a documented exception. Default-deny stays.'
    }
    $webPorts = @('80')
    if ($Hostname) { $webPorts += '443' }
    foreach ($port in $webPorts) {
      $rule = "Barrier Monitor web ($port)"
      if (-not (Get-NetFirewallRule -DisplayName $rule -ErrorAction SilentlyContinue)) {
        New-NetFirewallRule -DisplayName $rule -Direction Inbound -Protocol TCP -LocalPort $port -Action Allow @fwScope | Out-Null
      } else {
        # Refresh scope on re-run so a widened rule is tightened back.
        Set-NetFirewallRule -DisplayName $rule -RemoteAddress ($AllowedLanRanges -join ',') | Out-Null
      }
    }
    Write-Host "inbound TCP $($webPorts -join '+') open, scoped to $($AllowedLanRanges -join ', '); app port stays loopback-only."
  } elseif ($AllowLanAppPort) {
    if ($AllowedLanRanges.Count -eq 0) {
      Write-Need 'refusing to open the app port to the whole network: pass -AllowedLanRanges to scope it (TLS-less port) or leave it loopback-only.'
    }
    $rule = "Barrier Monitor app ($AppPort)"
    if (-not (Get-NetFirewallRule -DisplayName $rule -ErrorAction SilentlyContinue)) {
      New-NetFirewallRule -DisplayName $rule -Direction Inbound -Protocol TCP -LocalPort $AppPort -Action Allow @fwScope | Out-Null
    } else {
      Set-NetFirewallRule -DisplayName $rule -RemoteAddress ($AllowedLanRanges -join ',') | Out-Null
    }
    Write-Warning "TCP $AppPort is open to $($AllowedLanRanges -join ', ') without TLS: acceptable only behind VPN; prefer -Hostname with Caddy."
  } else {
    Write-Host 'no inbound rules created: app reachable from this host only until a proxy is added.'
  }
} else {
  Write-Host 'firewall skipped per -SkipFirewall.'
}

# ── 9. Nightly backup task ──────────────────────────────────────────
# The task name stays 'BarrierBackup' on purpose: Uninstall-Production
# (WIN2-owned) deletes it by that exact name, so renaming would orphan it.
# The dump directory follows -BackupDir (default D:\backups\monitor).
if (-not $SkipBackup) {
  Write-Step "Registering nightly backup task (02:00, $BackupDir)"
  New-Item -ItemType Directory -Force -Path $BackupDir | Out-Null
  schtasks /delete /tn 'BarrierBackup' /f 2>$null | Out-Null
  schtasks /create /tn 'BarrierBackup' /sc daily /st 02:00 /ru SYSTEM /rl HIGHEST /f `
    /tr "powershell -NoProfile -ExecutionPolicy Bypass -File `"$deployDir\Backup-Database.ps1`" -BackupDir `"$BackupDir`"" | Out-Null
  Write-Host 'scheduled task BarrierBackup registered.'
} else {
  Write-Host 'backup skipped per -SkipBackup (no dumps will run).'
}

# ── 10. Smoke test ──────────────────────────────────────────────────
Write-Step 'Smoke test: waiting for the app to answer'
$ok = $false
for ($i = 0; $i -lt 24 -and -not $ok; $i++) {
  try {
    $h = Invoke-RestMethod -Uri "http://127.0.0.1:$AppPort/api/health" -TimeoutSec 10
    if ($h.ok -eq $true) { $ok = $true }
  } catch {
    Start-Sleep -Seconds 5
  }
}
if (-not $ok) { Write-Need "app did not answer /api/health after ~2 min; see $InstallDir\logs\$svcApp-err.log." }
$login = Invoke-WebRequest -Uri "http://127.0.0.1:$AppPort/login" -UseBasicParsing
if ($login.StatusCode -notin @(200, 302)) { Write-Need "/login returned $($login.StatusCode)." }
Write-Host "health ok, /login -> $($login.StatusCode)."
if ($Hostname) {
  # Public smoke: warn-only, because Caddy keeps retrying certificate issuance
  # after DNS propagates; a hard abort here would brick an otherwise good
  # install while the CA is still being contacted.
  try {
    $pub = Invoke-WebRequest -Uri "https://$Hostname/login" -UseBasicParsing -TimeoutSec 20
    if ($pub.StatusCode -notin @(200, 302)) { Write-Warning "public https://$Hostname/login returned $($pub.StatusCode); Caddy may still be issuing its certificate - re-check shortly." }
    else { Write-Host "public smoke ok: https://$Hostname/login -> $($pub.StatusCode)." }
  } catch {
    Write-Warning "public smoke failed ($_); Caddy retries certificate issuance automatically - verify DNS + ports 80/443 and re-check."
  }
}

# ── 11. Summary (no secrets except the one-time box below) ──────────
$summary = @"
Barrier Monitor installed: $(Get-Date -Format s)
OS: $os
Code: $InstallDir (branch $Branch)
Deno: $(& $denoExe --version | Select-Object -First 1)
DB: ${DbUser}@localhost:${PgPort}/${DbName}
App: http://127.0.0.1:$AppPort (service $svcApp)
Public: $(if ($Hostname) { "https://$Hostname (service $svcCaddy)" } elseif ($caddyWanted) { "http://$ServerIp via $svcCaddy (plain HTTP: trusted LAN/VPN only)" } else { 'loopback-only (no proxy installed)' })
Backup task: BarrierBackup daily 02:00 -> $BackupDir
Logs: $InstallDir\logs
"@
# BOM-free write (PS 5.1 Set-Content -Encoding UTF8 would stamp a BOM).
Write-AllTextNoBom "$InstallDir\logs\install-summary.txt" $summary
Write-Host ''
Write-Host $summary -ForegroundColor Green
Write-Host ''
Write-Host 'STORE THESE NOW (shown once, never logged):' -ForegroundColor Yellow
if ($generatedAdmin) { Write-Host "  admin login: $AdminEmail / $AdminPassword  (change it after first login)" -ForegroundColor Yellow }
if ($pgPassOwn) { Write-Host "  postgres superuser password: $PostgresSuperPassword  (store in vault)" -ForegroundColor Yellow }
Write-Host ''
if ($Hostname) {
  Write-Host 'Next: confirm https serves, log in, set FRACTTAL_* + recipients if skipped.'
} else {
  Write-Host "Next: from any office PC open http://$ServerIp and log in. When a domain exists, re-run with -Hostname for automatic https (nothing else changes)."
}
