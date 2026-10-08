#Requires -Version 5.1
#Requires -RunAsAdministrator
<#
.SYNOPSIS
  Register Barrier Monitor as Windows services via NSSM (app + poller + alerts).
.DESCRIPTION
  Why it exists: Windows Server has no systemd units, so the three Linux
  long-running processes (app, fracttal-poll, alerts-poll) become NSSM
  services with auto-restart. Without NSSM, use Task Scheduler at startup
  (see docs/DEPLOY-WINDOWS.md path A2). Re-running updates the binaries.
.EXAMPLE
  powershell -ExecutionPolicy Bypass -File .\deploy\windows\Register-Services.ps1 -InstallDir C:\srv\barrier-monitor
#>
param(
  [string]$InstallDir = 'C:\srv\barrier-monitor',
  [string]$NssmExe = 'C:\tools\nssm\nssm.exe',
  [string]$DenoExe = '',
  [string]$AppPort = '8000'
)

$ErrorActionPreference = 'Stop'
if (-not (Test-Path $NssmExe)) {
  throw "NSSM not found at $NssmExe. Download https://nssm.cc/download, unpack to C:\tools\nssm\, then re-run."
}
if (-not $DenoExe) {
  $DenoExe = (Get-Command deno -ErrorAction SilentlyContinue).Source
  if (-not $DenoExe) { $DenoExe = "$env:LOCALAPPDATA\deno\bin\deno.exe" }
}
if (-not (Test-Path $DenoExe)) { throw "deno.exe not found ($DenoExe). Run Install-BarrierMonitor.ps1 first." }
if (-not (Test-Path "$InstallDir\_fresh\server.js")) {
  throw "Missing $InstallDir\_fresh\server.js. Run `deno task build` in $InstallDir first."
}

function Register-NssmService([string]$Name, [string]$Args, [string]$Desc) {
  $existing = Get-Service -Name $Name -ErrorAction SilentlyContinue
  if ($existing) { & $NssmExe stop $Name | Out-Null }
  & $NssmExe install $Name "`"$DenoExe`"" $Args | Out-Null
  & $NssmExe set $Name AppDirectory $InstallDir | Out-Null
  & $NssmExe set $Name Description $Desc | Out-Null
  & $NssmExe set $Name Start SERVICE_AUTO_START | Out-Null
  & $NssmExe set $Name AppStdout "$InstallDir\logs\$Name-out.log" | Out-Null
  & $NssmExe set $Name AppStderr "$InstallDir\logs\$Name-err.log" | Out-Null
  & $NssmExe set $Name AppRotateFiles 1 | Out-Null
  & $NssmExe set $Name AppRotateOnline 1 | Out-Null
  & $NssmExe set $Name AppThrottle 5000 | Out-Null
  & $NssmExe start $Name | Out-Null
  Write-Host "service $Name: installed + started ($Desc)"
}

New-Item -ItemType Directory -Force -Path "$InstallDir\logs" | Out-Null

# NOTE: `deno task start` already embeds `--env-file=.env --port 8000` via
# deno.jsonc, so no port flags are passed here. To move the port, change the
# `start` task AND this file AND the firewall rule together (see PORT-MAP).
Register-NssmService 'BarrierApp' 'task start' 'Barrier Monitor dashboard + API (deno serve :8000)'
Register-NssmService 'BarrierPoller' 'run -A scripts/fracttal-poll.ts' 'Barrier Monitor upstream sync loop'
Register-NssmService 'BarrierAlerts' 'run -A scripts/alerts-poll.ts' 'Barrier Monitor alert digest loop'

Write-Host ''
Write-Host 'Verify: Get-Service BarrierApp,BarrierPoller,BarrierAlerts | Select Name,Status'
Write-Host "Smoke:  Invoke-RestMethod http://localhost:$AppPort/api/health"
