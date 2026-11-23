#Requires -Version 5.1
#Requires -RunAsAdministrator
<#
.SYNOPSIS
  Legacy prerequisite helper (deprecated): use Setup-Production.ps1 instead.
.DESCRIPTION
  Why it exists: it predates Setup-Production.ps1 and only prepares Deno,
  PostgreSQL, .env, the build and migrations; it does not register services,
  Caddy, the backup task or scoped firewall rules. It now fails closed by
  default so an operator cannot mistake it for the supported production path.
  Pass -ForceLegacy only when that old helper is really wanted.
  When forced, it uses the same defaults as setup (SeaMonitor prefix,
  database monitor, app port 8300, vendor PostgreSQL 18) and never opens the
  app port unless -AllowLanAppPort AND -AllowedLanRanges scope it.
.EXAMPLE
  powershell -ExecutionPolicy Bypass -File .\deploy\windows\Setup.cmd -AdminEmail you@example.com -AllowedLanRanges '10.0.0.0/8'
.EXAMPLE
  powershell -ExecutionPolicy Bypass -File .\deploy\windows\Install-BarrierMonitor.ps1 -ForceLegacy
#>
param(
  [string]$InstallDir = 'C:\srv\barrier-monitor',
  [string]$ServicePrefix = 'SeaMonitor',
  [string]$DbUser = 'barrier',
  [string]$DbName = 'monitor',
  [string]$BackupDir = 'D:\backups\monitor',
  [string]$PostgresBinDir = 'C:\sites\seacrest\.vendor\pgsql18\bin',
  [string]$AppPort = '8300',
  [string]$PgPort = '5432',
  [string]$BindHost = '127.0.0.1',
  [string[]]$AllowedLanRanges = @(),
  [string]$DenoVersion = 'v2.9.7',
  [string]$PgPassword = '',
  [switch]$AllowLanAppPort,
  [switch]$SkipPostgres,
  [switch]$SkipFirewall,
  [switch]$ForceLegacy
)

$ErrorActionPreference = 'Stop'

if (-not $ForceLegacy) {
  throw 'Install-BarrierMonitor.ps1 is legacy and is no longer the supported install path. Use deploy\windows\Setup.cmd (or Setup-Production.ps1): it installs PostgreSQL/NSSM/Caddy, registers services, scopes firewall rules and schedules backups. If you intentionally need the old prerequisite-only helper, re-run with -ForceLegacy.'
}

if ($ServicePrefix -cnotmatch '^[A-Za-z][A-Za-z0-9]{0,31}$') {
  throw "-ServicePrefix '$ServicePrefix' invalid: must start with a letter, then letters/digits (max 32 chars)."
}
foreach ($pair in @(@('DbUser', $DbUser), @('DbName', $DbName))) {
  if ($pair[1] -cnotmatch '^[a-z_][a-z0-9_]{0,62}$') {
    throw "-$($pair[0]) '$($pair[1])' invalid: must match ^[a-z_][a-z0-9_]{0,62}$ (lowercase, digits, underscore; max 63 chars)."
  }
}
$appPortNum = 0
if (-not [int]::TryParse($AppPort, [ref]$appPortNum) -or $appPortNum -lt 1 -or $appPortNum -gt 65535) {
  throw "-AppPort '$AppPort' invalid: must be a TCP port number 1-65535."
}
$pgPortNum = 0
if (-not [int]::TryParse($PgPort, [ref]$pgPortNum) -or $pgPortNum -lt 1 -or $pgPortNum -gt 65535) {
  throw "-PgPort '$PgPort' invalid: must be a TCP port number 1-65535."
}
if ($AllowLanAppPort -and $AllowedLanRanges.Count -eq 0) {
  throw '-AllowLanAppPort requires -AllowedLanRanges (office/VPN CIDRs); refusing to open the app port unscoped.'
}
if ($AllowLanAppPort -and -not $PSBoundParameters.ContainsKey('BindHost')) {
  $BindHost = '0.0.0.0'
}
if ($BindHost -eq '0.0.0.0' -and -not ($AllowLanAppPort -and $AllowedLanRanges.Count -gt 0)) {
  throw 'refusing to bind the app to 0.0.0.0 without -AllowLanAppPort plus scoped -AllowedLanRanges.'
}

function Write-Step([string]$msg) { Write-Host "`n==> $msg" -ForegroundColor Cyan }

Write-Step 'Checking prerequisites (Windows Server 2022/2025, 64-bit)'
$os = (Get-CimInstance Win32_OperatingSystem).Caption
Write-Host "OS: $os"
if ([Environment]::Is64BitOperatingSystem -eq $false) { throw 'Need 64-bit Windows.' }

Write-Step 'Installing Deno (official installer, pinned version)'
if (-not (Get-Command deno -ErrorAction SilentlyContinue)) {
  $denoZip = "$env:TEMP\deno.zip"
  Invoke-WebRequest -Uri "https://github.com/denoland/deno/releases/download/$DenoVersion/deno-x86_64-pc-windows-msvc.zip" -OutFile $denoZip
  $denoDir = "$env:LOCALAPPDATA\deno\bin"
  New-Item -ItemType Directory -Force -Path $denoDir | Out-Null
  Expand-Archive -Path $denoZip -DestinationPath $denoDir -Force
  $machinePath = [Environment]::GetEnvironmentVariable('Path', 'Machine')
  if ($machinePath -notlike "*$denoDir*") {
    [Environment]::SetEnvironmentVariable('Path', "$machinePath;$denoDir", 'Machine')
  }
  $env:Path += ";$denoDir"
}
deno --version

if (-not $SkipPostgres) {
  Write-Step 'Checking PostgreSQL'
  $pgCtl = Join-Path $PostgresBinDir 'pg_ctl.exe'
  if (-not (Test-Path $pgCtl)) {
    $pg16Bin = 'C:\Program Files\PostgreSQL\16\bin'
    if (Test-Path (Join-Path $pg16Bin 'pg_ctl.exe')) {
      Write-Warning "PostgreSQL not found at $PostgresBinDir; using $pg16Bin. Pass -PostgresBinDir to choose the 18 install."
      $pgCtl = Join-Path $pg16Bin 'pg_ctl.exe'
    } else {
      Write-Warning "PostgreSQL not found under $PostgresBinDir or $pg16Bin. Install it first: https://www.postgresql.org/download/windows/ (port $pgPortNum), then re-run."
    }
  } else {
    Write-Host "PostgreSQL found: $pgCtl"
  }
}

Write-Step "Preparing $InstallDir"
New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null
Set-Location $InstallDir
if (-not (Test-Path "$InstallDir\deno.jsonc")) {
  throw "deno.jsonc not found in $InstallDir. Clone/copy the repo here first (or run from the repo root)."
}

if (-not (Test-Path "$InstallDir\.env")) {
  Write-Step 'Creating .env from .env.example (edit it next)'
  Copy-Item "$InstallDir\.env.example" "$InstallDir\.env"
  # Production defaults: never serve the demo dataset or skip strict boot.
  # The database URL uses the same role/database defaults as setup, with the
  # template's placeholder password; replace it before starting the app.
  $envPath = "$InstallDir\.env"
  $dbUrl = "postgres://${DbUser}:barrier@localhost:${pgPortNum}/${DbName}?sslmode=disable"
  (Get-Content $envPath) `
    -replace '^PUBLIC_API_MODE=.*$', 'PUBLIC_API_MODE=http' `
    -replace '^# DENO_ENV=.*$', 'DENO_ENV=production' `
    -replace '^DATABASE_URL=.*$', "DATABASE_URL=$dbUrl" |
    Set-Content $envPath -Encoding UTF8
  Write-Warning 'The generated .env contains the placeholder database password "barrier". Set the real DATABASE_URL password before production use.'
} else {
  Write-Host '.env already exists, leaving it untouched.'
}

# Lock .env to Administrators + SYSTEM (plaintext DB password + tokens).
icacls "$InstallDir\.env" /inheritance:r /grant:r 'Administrators:F' 'SYSTEM:F' | Out-Null

Write-Step "Validating configuration (doctor reads .env like `deno task start` does)"
deno run -A --env-file=.env scripts/doctor.ts
if ($LASTEXITCODE -ne 0) {
  Write-Warning 'doctor reported failures. Fix .env (DATABASE_URL, ADMIN_TOKEN) then re-run. Continuing with build...'
}

Write-Step 'Building the Fresh bundle (_fresh/server.js)'
deno task build

Write-Step 'Applying database migrations (idempotent)'
deno task db:migrate

Write-Step "Firewall (app port ${appPortNum})"
if ($SkipFirewall) {
  Write-Host 'Skipped per -SkipFirewall.'
} elseif ($AllowLanAppPort) {
  # Validation above guarantees at least one range. Scope the rule to those
  # ranges; never create an all-interface allow rule.
  $ruleName = "Barrier Monitor app ($appPortNum)"
  if (-not (Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue)) {
    New-NetFirewallRule -DisplayName $ruleName -Direction Inbound -Protocol TCP -LocalPort $appPortNum -Action Allow -RemoteAddress $AllowedLanRanges | Out-Null
  } else {
    Set-NetFirewallRule -DisplayName $ruleName -RemoteAddress ($AllowedLanRanges -join ',') | Out-Null
  }
  Write-Warning "TCP $appPortNum is open only to $($AllowedLanRanges -join ', ') without TLS: acceptable only behind VPN; prefer Setup-Production.ps1 with Caddy."
} else {
  Write-Host "app port $appPortNum stays on $BindHost; no inbound rule created. Use Caddy (deploy\windows\Caddyfile) for public access."
}

Write-Host ''
Write-Host 'Next steps:' -ForegroundColor Green
Write-Host '  1. Edit .env (DATABASE_URL, ADMIN_TOKEN, ALERT_PROVIDER_*, COMPANY_NAME).'
if ($PgPassword) { Write-Host "     (You passed -PgPassword but Postgres user setup stays manual: create role $DbUser + db $DbName.)" }
Write-Host '  2. deno run -A --env-file=.env scripts/doctor.ts   # all green'
Write-Host "  3. Register services: .\deploy\windows\Register-Services.ps1 -InstallDir $InstallDir -ServicePrefix $ServicePrefix -DbName $DbName -PostgresBinDir $PostgresBinDir -BindHost $BindHost"
Write-Host '  4. Reverse proxy + TLS: Caddy (deploy\windows\Caddyfile) or IIS. Never expose :8300 directly.'
Write-Host "  5. Smoke: Invoke-RestMethod http://127.0.0.1:$appPortNum/api/health"
Write-Host "  Backups (registered by Setup-Production.ps1, not this helper) default to $BackupDir."
