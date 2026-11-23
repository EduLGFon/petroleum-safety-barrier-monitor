#Requires -Version 5.1
#Requires -RunAsAdministrator
<#
.SYNOPSIS
  Register Barrier Monitor as Windows services via NSSM (app + poller + alerts).
.DESCRIPTION
  Why it exists: Windows Server has no systemd units, so the three long-running
  processes (app, fracttal-poll, alerts-poll) become NSSM services with
  auto-restart. Re-running updates the binaries, environment and stop policy.
  Defaults target the APP10 production topology: SeaMonitor* services,
  database monitor and vendor PostgreSQL 18. Every default is overridable, and
  -ServicePrefix Barrier restores the legacy Barrier* service names.
  The app listens on -BindHost:-AppPort (loopback by default). Only pass
  -BindHost 0.0.0.0 together with a scoped firewall rule from setup
  (-SkipCaddy -AllowLanAppPort with -AllowedLanRanges).
  See docs/DEPLOY-WINDOWS.md, Windows native path, Services.
.EXAMPLE
  powershell -ExecutionPolicy Bypass -File .\deploy\windows\Register-Services.ps1 -InstallDir C:\srv\barrier-monitor
.EXAMPLE
  powershell -ExecutionPolicy Bypass -File .\deploy\windows\Register-Services.ps1 -ServicePrefix Barrier -AppPort 8301
#>
param(
  [string]$InstallDir = 'C:\srv\barrier-monitor',
  [string]$NssmExe = 'C:\tools\nssm\nssm.exe',
  [string]$DenoExe = '',
  [string]$ServicePrefix = 'SeaMonitor',
  [string]$DbName = 'monitor',
  [string]$PostgresBinDir = 'C:\sites\seacrest\.vendor\pgsql18\bin',
  [string]$AppPort = '8300',
  [string]$BindHost = '127.0.0.1',
  [int]$AppPoolSize = 10,
  [int]$PollerPoolSize = 4,
  [int]$AlertsPoolSize = 2
)

$ErrorActionPreference = 'Stop'

# Prefix names are interpolated into service names and log paths; keep them to
# one safe token. This mirrors the Setup-Production.ps1 gate so the caller and
# the service names cannot disagree.
if ($ServicePrefix -cnotmatch '^[A-Za-z][A-Za-z0-9]{0,31}$') {
  throw "-ServicePrefix '$ServicePrefix' invalid: must start with a letter, then letters/digits (max 32 chars)."
}
$appPortNum = 0
if (-not [int]::TryParse($AppPort, [ref]$appPortNum) -or $appPortNum -lt 1 -or $appPortNum -gt 65535) {
  throw "-AppPort '$AppPort' invalid: must be a TCP port number 1-65535."
}
if ([string]::IsNullOrWhiteSpace($BindHost)) {
  throw '-BindHost is empty; use 127.0.0.1 for loopback or 0.0.0.0 only behind a scoped firewall rule.'
}
foreach ($pair in @(
    @('AppPoolSize', $AppPoolSize),
    @('PollerPoolSize', $PollerPoolSize),
    @('AlertsPoolSize', $AlertsPoolSize)
  )) {
  if ($pair[1] -lt 1 -or $pair[1] -gt 50) {
    throw "-$($pair[0]) '$($pair[1])' invalid: POOL_SIZE accepts 1-50 (see lib/server/db.ts)."
  }
}

$svcApp = "${ServicePrefix}App"
$svcPoller = "${ServicePrefix}Poller"
$svcAlerts = "${ServicePrefix}Alerts"

if (-not (Test-Path $NssmExe)) {
  throw "NSSM not found at $NssmExe. Run Setup-Production.ps1, or download https://nssm.cc/download, unpack to C:\tools\nssm\, then re-run."
}
if (-not $DenoExe) {
  $denoCommand = Get-Command deno -ErrorAction SilentlyContinue
  if ($denoCommand) {
    $DenoExe = $denoCommand.Source
  } else {
    foreach ($candidate in @("$env:LOCALAPPDATA\deno\bin\deno.exe", 'C:\tools\deno\deno.exe')) {
      if (Test-Path $candidate) { $DenoExe = $candidate; break }
    }
  }
}
if (-not $DenoExe -or -not (Test-Path $DenoExe)) {
  throw "deno.exe not found ($DenoExe). Run Setup-Production.ps1 first, or pass -DenoExe."
}
if (-not (Test-Path "$InstallDir\_fresh\server.js")) {
  throw "Missing $InstallDir\_fresh\server.js. Run `deno task build` in $InstallDir first."
}
if (-not (Test-Path (Join-Path $InstallDir '.env'))) {
  throw "Missing $InstallDir\.env. Run Setup-Production.ps1 (or create it from .env.example) before registering services."
}

# NSSM writes the extra environment into the service registry. POOL_SIZE is
# the runtime ceiling read by lib/server/db.ts (app 10, poller 4, alerts 2);
# DENO_DIR is one shared module cache under the install so worker and app
# processes read the same built dependencies.
$denoDir = Join-Path $InstallDir '.deno'
New-Item -ItemType Directory -Force -Path $denoDir | Out-Null
New-Item -ItemType Directory -Force -Path "$InstallDir\logs" | Out-Null

function Register-NssmService([string]$Name, [string]$ServiceArgs, [string]$Desc, [int]$PoolSize, [int]$StopGraceMs) {
  $existing = Get-Service -Name $Name -ErrorAction SilentlyContinue
  if ($existing) {
    & $NssmExe stop $Name | Out-Null
    & $NssmExe remove $Name confirm | Out-Null
  }
  & $NssmExe install $Name "`"$DenoExe`"" $ServiceArgs | Out-Null
  & $NssmExe set $Name AppDirectory $InstallDir | Out-Null
  & $NssmExe set $Name Description $Desc | Out-Null
  & $NssmExe set $Name Start SERVICE_AUTO_START | Out-Null
  & $NssmExe set $Name AppStdout "$InstallDir\logs\${Name}-out.log" | Out-Null
  & $NssmExe set $Name AppStderr "$InstallDir\logs\${Name}-err.log" | Out-Null
  & $NssmExe set $Name AppRotateFiles 1 | Out-Null
  & $NssmExe set $Name AppRotateOnline 1 | Out-Null
  & $NssmExe set $Name AppThrottle 5000 | Out-Null
  # Graceful shutdown: Ctrl-C first, then the thread-exit wait. Deno has no
  # window message loop, so skip only that method (2). The per-service timeout
  # follows the compose stop_grace_period (app 30s, poller 3m, alerts 1m) so
  # an in-flight sweep can finish before NSSM terminates the process.
  & $NssmExe set $Name AppStopMethodConsole $StopGraceMs | Out-Null
  & $NssmExe set $Name AppStopMethodWindow 5000 | Out-Null
  & $NssmExe set $Name AppStopMethodThreads $StopGraceMs | Out-Null
  & $NssmExe set $Name AppStopMethodSkip 2 | Out-Null
  $envLines = @("POOL_SIZE=$PoolSize", "DENO_DIR=$denoDir")
  & $NssmExe set $Name AppEnvironmentExtra ($envLines -join "`r`n") | Out-Null
  & $NssmExe start $Name | Out-Null
  Write-Host "service ${Name}: installed + started ($Desc, POOL_SIZE=$PoolSize)"
}

# The app command is explicit (not `deno task start`) because the task pins
# port 8300 in deno.jsonc. -AppPort and -BindHost must reach deno serve so a
# non-default listener is real, not just a firewall label.
$appArgs = "serve --env-file=.env --allow-net --allow-env --allow-read --host $BindHost --port $appPortNum _fresh/server.js"
$pollerArgs = 'run -A --env-file=.env scripts/fracttal-poll.ts'
$alertsArgs = 'run -A --env-file=.env scripts/alerts-poll.ts'

Register-NssmService $svcApp $appArgs "$ServicePrefix dashboard + API (db $DbName)" $AppPoolSize 30000
Register-NssmService $svcPoller $pollerArgs "$ServicePrefix upstream sync loop" $PollerPoolSize 180000
Register-NssmService $svcAlerts $alertsArgs "$ServicePrefix alert digest loop" $AlertsPoolSize 60000

Write-Host ''
Write-Host "DB: $DbName (DATABASE_URL stays in $InstallDir\.env and is never printed)."
Write-Host "PostgreSQL tools for backup/health/uninstall: $PostgresBinDir"
Write-Host "App binding: ${BindHost}:${appPortNum} (loopback unless -BindHost 0.0.0.0 was passed with a scoped firewall rule)."
Write-Host "Verify: Get-Service ${svcApp},${svcPoller},${svcAlerts} | Select Name,Status"
Write-Host "Smoke:  Invoke-RestMethod http://127.0.0.1:$appPortNum/api/health"
