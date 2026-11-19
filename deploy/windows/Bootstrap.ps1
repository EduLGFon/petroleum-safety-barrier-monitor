#Requires -Version 5.1
#Requires -RunAsAdministrator
<#
.SYNOPSIS
  Zero-git bootstrapper: downloads the repo zip, then hands off to Setup-Production.ps1.
.DESCRIPTION
  Why it exists: production servers often have no git and no repo checkout,
  and Setup-Production.ps1 lives inside the repo (chicken-and-egg). This
  tiny script fetches the zip, expands it to -InstallDir, and forwards every
  other bound parameter to the real setup script via hashtable splatting, so
  known knobs are never silently dropped (PowerShell errors on undeclared
  names instead - run Setup-Production.ps1 directly for those).
  Secrets are NEVER command-line arguments: set ADMIN_PASSWORD /
  DB_PASSWORD / POSTGRES_SUPER_PASSWORD / FRACTTAL_SECRET in the environment
  or answer the setup prompts. Passing them here aborts the setup, because
  Bootstrap forwards them to Setup-Production.ps1 on its command line.
.EXAMPLE
  powershell -ExecutionPolicy Bypass -File .\Bootstrap.ps1 `
    -RepoZipUrl https://github.com/org/repo/archive/refs/heads/master.zip `
    -Hostname monitor.example.com -AdminEmail you@example.com
#>
param(
  [string]$RepoZipUrl = '',
  [string]$InstallDir = 'C:\srv\barrier-monitor',
  [string]$Branch = 'master',
  [string]$ServicePrefix = 'SeaMonitor',
  [string]$Hostname = '',
  [string[]]$AllowedLanRanges = @(),
  [string]$CompanyName = '',
  [string]$AdminEmail = '',
  [string]$AdminPassword = '',
  [string]$DbName = 'monitor',
  [string]$DbPassword = '',
  [string]$PostgresSuperPassword = '',
  [string]$PostgresBinDir = 'C:\sites\seacrest\.vendor\pgsql18\bin',
  [string]$BackupDir = 'D:\backups\monitor',
  [string]$AppPort = '8300',
  [string]$FracttalKey = '',
  [string]$FracttalSecret = '',
  [switch]$SkipCaddy,
  [switch]$SkipFirewall,
  [switch]$AllowLanAppPort,
  [switch]$Unattended,
  [switch]$CheckOnly
)

$ErrorActionPreference = 'Stop'
if (-not $RepoZipUrl) {
  throw 'pass -RepoZipUrl https://github.com/ORG/REPO/archive/refs/heads/master.zip (or clone the repo and run Setup-Production.ps1 directly).'
}

Write-Host "`n==> Downloading code ($Branch)" -ForegroundColor Cyan
$zip = "$env:TEMP\bm-code.zip"
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
Invoke-WebRequest -Uri $RepoZipUrl -OutFile $zip -UseBasicParsing
$tmp = "$env:TEMP\bm-code"
if (Test-Path $tmp) { Remove-Item $tmp -Recurse -Force }
Expand-Archive -Path $zip -DestinationPath $tmp -Force
Remove-Item $zip -Force -ErrorAction SilentlyContinue
$marker = Get-ChildItem $tmp -Recurse -Depth 2 -Filter 'deno.jsonc' | Select-Object -First 1
if (-not $marker) { throw 'zip has no deno.jsonc within two levels; wrong archive?' }
New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null
Copy-Item (Join-Path (Split-Path $marker.FullName) '*') $InstallDir -Recurse -Force
Remove-Item $tmp -Recurse -Force
Write-Host "code ready at $InstallDir."

$setup = Join-Path $InstallDir 'deploy\windows\Setup-Production.ps1'
$forward = @{}
foreach ($k in $PSBoundParameters.Keys) {
  if ($k -notin @('RepoZipUrl', 'InstallDir', 'Branch')) { $forward[$k] = $PSBoundParameters[$k] }
}
& $setup -InstallDir $InstallDir -Branch $Branch @forward
