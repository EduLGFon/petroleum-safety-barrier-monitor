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
$repoRoot = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$envFile = Join-Path $repoRoot '.env'
$databaseUrl = $env:DATABASE_URL
if (-not $databaseUrl -and (Test-Path $envFile)) {
  foreach ($line in Get-Content $envFile) {
    if ($line -match '^\s*DATABASE_URL\s*=\s*(.+?)\s*$') {
      $databaseUrl = $Matches[1].Trim('"', "'", ' ')
    }
  }
}
if (-not $databaseUrl) { throw 'DATABASE_URL not found in environment or .env.' }

$pgDump = 'C:\Program Files\PostgreSQL\16\bin\pg_dump.exe'
if (-not (Test-Path $pgDump)) { $pgDump = (Get-Command pg_dump -ErrorAction SilentlyContinue).Source }
if (-not $pgDump) { throw 'pg_dump.exe not found. Install PostgreSQL 16 or add it to PATH.' }

$stamp = Get-Date -Format 'yyyy-MM-dd_HHmm'
$out = Join-Path $BackupDir "barreiras-$stamp.dump"
Write-Host "Backing up to $out …"
$env:PGPASSWORD = ([Uri]$databaseUrl).UserInfo.Split(':')[1]
try {
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
