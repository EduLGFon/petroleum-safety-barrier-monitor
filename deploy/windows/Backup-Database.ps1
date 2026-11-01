#Requires -Version 5.1
<#
.SYNOPSIS
  Nightly pg_dump -Fc backup with 14-day rotation (Task Scheduler friendly).
.DESCRIPTION
  Why it exists: pg_dump on Windows has no cron; this script is the body of
  the scheduled task (see docs/DEPLOY-WINDOWS.md operations). Verifies the
  dump by listing it; restore drill stays manual (documented alongside).
.EXAMPLE
  powershell -File .\deploy\windows\Backup-Database.ps1 -BackupDir D:\backups\barreiras
  # schedule: schtasks /create /tn "BarrierBackup" /tr "powershell -File C:\srv\barrier-monitor\deploy\windows\Backup-Database.ps1" /sc daily /st 02:00 /ru SYSTEM
#>
param(
  [string]$BackupDir = 'D:\backups\barreiras',
  [int]$RetainDays = 14
)

$ErrorActionPreference = 'Stop'
New-Item -ItemType Directory -Force -Path $BackupDir | Out-Null

# Load DATABASE_URL from .env next to the repo (same merge rule as doctor).
# Values are sanitized (strip CR/LF, surrounding quotes) so a pasted secret
# cannot inject lines; the URI is parsed with System.Uri + unescaping (not
# naive Split(':')) so percent-encoded passwords (e.g. %40 for @) work.
$repoRoot = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$envFile = Join-Path $repoRoot '.env'
$databaseUrl = $env:DATABASE_URL
if (-not $databaseUrl -and (Test-Path $envFile)) {
  foreach ($line in Get-Content $envFile) {
    if ($line -match '^\s*DATABASE_URL\s*=\s*(.+?)\s*$') {
      $databaseUrl = ($Matches[1].Trim('"', "'", ' ') -replace "`r", "") -replace "`n", ""
    }
  }
}
if (-not $databaseUrl) { throw 'DATABASE_URL not found in environment or .env.' }

function Get-PgPasswordFromUrl([string]$url) {
  try {
    $uri = [Uri]$url
  } catch {
    throw "DATABASE_URL is not a parseable URI: $_"
  }
  if (-not $uri.UserInfo) { throw 'DATABASE_URL has no userinfo (expected postgres://user:password@host:port/db).' }
  # UserInfo is still percent-encoded at this point: split on the FIRST colon
  # (passwords may legally contain colons once encoded as %3A), then unescape.
  $colon = $uri.UserInfo.IndexOf(':')
  if ($colon -lt 0) { throw 'DATABASE_URL userinfo has no password part (expected user:password@).' }
  $encPass = $uri.UserInfo.Substring($colon + 1)
  if ([string]::IsNullOrEmpty($encPass)) { throw 'DATABASE_URL password is empty.' }
  return [Uri]::UnescapeDataString($encPass)
}

$pgDump = 'C:\Program Files\PostgreSQL\16\bin\pg_dump.exe'
if (-not (Test-Path $pgDump)) { $pgDump = (Get-Command pg_dump -ErrorAction SilentlyContinue).Source }
if (-not $pgDump) { throw 'pg_dump.exe not found. Install PostgreSQL 16 or add it to PATH.' }

$stamp = Get-Date -Format 'yyyy-MM-dd_HHmm'
$out = Join-Path $BackupDir "barreiras-$stamp.dump"
Write-Host "Backing up to $out …"
$env:PGPASSWORD = Get-PgPasswordFromUrl $databaseUrl
try {
  # Pass the URL positionally: pg_dump accepts a conninfo/URI as dbname, and
  # -Fc -f keep the custom-format dump + explicit output (no shell redirect).
  & $pgDump $databaseUrl -Fc -f $out
  if ($LASTEXITCODE -ne 0) { throw "pg_dump exited $LASTEXITCODE" }
} finally {
  Remove-Item Env:\PGPASSWORD -ErrorAction SilentlyContinue
}
$sizeMB = [math]::Round((Get-Item $out).Length / 1MB, 1)
if ((Get-Item $out).Length -eq 0) {
  Remove-Item $out -Force
  throw "backup is EMPTY ($out); task will report failure so the gap is noticed."
}
Write-Host "OK: $out ($sizeMB MB)"

Get-ChildItem $BackupDir -Filter 'barreiras-*.dump' |
  Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-$RetainDays) } |
  ForEach-Object { Write-Host "Pruning $($_.Name)"; Remove-Item $_.FullName -Force }
