#Requires -Version 5.1
#Requires -RunAsAdministrator
<#
.SYNOPSIS
  One-shot setup for Barrier Monitor on Windows Server 2022/2025 (native path).
.DESCRIPTION
  Why it exists: Windows Server has no systemd and Docker Desktop is NOT
  supported on it, so hosting is native: install Deno + Postgres, lay down
  the app, validate with `deno task doctor`, then register NSSM services.
  Idempotent: safe to re-run after a git pull.
.EXAMPLE
  powershell -ExecutionPolicy Bypass -File .\deploy\windows\Install-BarrierMonitor.ps1 -InstallDir C:\srv\barrier-monitor -PgPassword 'change-me'
#>
param(
  [string]$InstallDir = 'C:\srv\barrier-monitor',
  [string]$AppPort = '8000',
  [string]$PgPort = '5432',
  [string]$DenoVersion = 'v2.9.7',
  [string]$PgPassword = '',
  [switch]$SkipPostgres,
  [switch]$SkipFirewall
)

$ErrorActionPreference = 'Stop'

function Write-Step([string]$msg) { Write-Host "`n==> $msg" -ForegroundColor Cyan }

Write-Step "Checking prerequisites (Windows Server 2022/2025, 64-bit)"
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
  Write-Step 'Checking PostgreSQL 16 (EDB installer path)'
  $pgCtl = 'C:\Program Files\PostgreSQL\16\bin\pg_ctl.exe'
  if (-not (Test-Path $pgCtl)) {
    Write-Warning "PostgreSQL 16 not found. Install it first: https://www.postgresql.org/download/windows/ (EDB installer, port $PgPort), then re-run with -SkipPostgres."
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
} else {
  Write-Host '.env already exists, leaving it untouched.'
}

# Lock .env to Administrators + SYSTEM (plaintext DB password + tokens).
icacls "$InstallDir\.env" /inheritance:r /grant:r 'Administrators:F' 'SYSTEM:F' | Out-Null

Write-Step 'Validating configuration (doctor reads .env like `deno task start` does)'
deno run -A --env-file=.env scripts/doctor.ts
if ($LASTEXITCODE -ne 0) {
  Write-Warning 'doctor reported failures. Fix .env (DATABASE_URL, ADMIN_TOKEN) then re-run. Continuing with build…'
}

Write-Step 'Building the Fresh bundle (_fresh/server.js)'
deno task build

Write-Step 'Applying database migrations (idempotent)'
deno task db:migrate

Write-Step "Opening firewall (TCP $AppPort inbound, app port)"
if (-not $SkipFirewall) {
  $ruleName = "Barrier Monitor app ($AppPort)"
  if (-not (Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue)) {
    New-NetFirewallRule -DisplayName $ruleName -Direction Inbound -Protocol TCP -LocalPort $AppPort -Action Allow | Out-Null
  }
  Write-Host "Firewall rule '$ruleName' present."
} else {
  Write-Host 'Skipped per -SkipFirewall.'
}

Write-Host ''
Write-Host 'Next steps:' -ForegroundColor Green
Write-Host '  1. Edit .env (DATABASE_URL, ADMIN_TOKEN, OPS_SMTP_*, COMPANY_NAME).'
if ($PgPassword) { Write-Host '     (You passed -PgPassword but Postgres user setup stays manual: create role barrier + db barreiras.)' }
Write-Host '  2. deno run -A --env-file=.env scripts/doctor.ts   # all green'
Write-Host "  3. Register services: .\deploy\windows\Register-Services.ps1 -InstallDir $InstallDir"
Write-Host '  4. Reverse proxy + TLS: Caddy (deploy\windows\Caddyfile) or IIS. Never expose :8000 directly.'
Write-Host "  5. Smoke: Invoke-RestMethod http://localhost:$AppPort/api/health"
