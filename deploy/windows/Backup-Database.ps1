#Requires -Version 5.1
<#
.SYNOPSIS
  Nightly pg_dump -Fc backup with 14-day rotation (Task Scheduler friendly).
.DESCRIPTION
  Why it exists: pg_dump on Windows has no cron; this script is the body of
  the scheduled task (see docs/DEPLOY-WINDOWS.md operations). It writes a
  custom-format dump, fails when the dump is empty so a silent backup gap is
  visible, and prunes dumps older than -RetainDays.
  SECURITY: the DATABASE_URL is never passed on a command line. The password
  is read from the parsed URL, placed only in PGPASSWORD for the child
  process, and pg_dump receives discrete -h/-p/-U/-d arguments. The URL and
  password therefore never appear in the process list or logs.
.EXAMPLE
  powershell -File .\deploy\windows\Backup-Database.ps1 -BackupDir D:\backups\monitor
  # schedule: schtasks /create /tn "BarrierBackup" /tr "powershell -File C:\srv\barrier-monitor\deploy\windows\Backup-Database.ps1" /sc daily /st 02:00 /ru SYSTEM
#>
param(
  [string]$BackupDir = 'D:\backups\monitor',
  [string]$DbName = 'monitor',
  [string]$PostgresBinDir = 'C:\sites\seacrest\.vendor\pgsql18\bin',
  [int]$RetainDays = 14
)

$ErrorActionPreference = 'Stop'
if ($RetainDays -lt 1) {
  throw "-RetainDays '$RetainDays' invalid: must be 1 or more."
}
New-Item -ItemType Directory -Force -Path $BackupDir | Out-Null

# Load DATABASE_URL from .env next to the repo (same merge rule as doctor:
# a process-level value wins). Values are sanitized (strip CR/LF and
# surrounding quotes) so a pasted secret cannot inject lines; the URI is
# parsed with System.Uri + unescaping so percent-encoded passwords work.
$repoRoot = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$envFile = Join-Path $repoRoot '.env'
$databaseUrl = $env:DATABASE_URL
if (-not $databaseUrl -and (Test-Path $envFile)) {
  foreach ($line in Get-Content $envFile -Encoding UTF8) {
    if ($line -match '^\s*DATABASE_URL\s*=\s*(.+?)\s*$') {
      $databaseUrl = ($Matches[1].Trim('"', "'", ' ') -replace "`r", "") -replace "`n", ""
      break
    }
  }
}
if (-not $databaseUrl) { throw 'DATABASE_URL not found in environment or .env.' }
$databaseUrl = $databaseUrl.Trim('"', "'", ' ')

function ConvertFrom-DatabaseUrl([string]$url) {
  try {
    $uri = [Uri]$url
  } catch {
    throw "DATABASE_URL is not a parseable URI: $_"
  }
  if ($uri.Scheme -notin @('postgres', 'postgresql')) {
    throw "DATABASE_URL scheme '$($uri.Scheme)' is not postgres/postgresql."
  }
  if (-not $uri.UserInfo) {
    throw 'DATABASE_URL has no userinfo (expected postgres://user:password@host:port/db).'
  }
  # UserInfo is still percent-encoded at this point: split on the FIRST colon
  # (passwords may legally contain colons once encoded as %3A), then unescape.
  $colon = $uri.UserInfo.IndexOf(':')
  if ($colon -lt 0) {
    throw 'DATABASE_URL userinfo has no password part (expected user:password@).'
  }
  $user = [Uri]::UnescapeDataString($uri.UserInfo.Substring(0, $colon))
  $encPass = $uri.UserInfo.Substring($colon + 1)
  if ([string]::IsNullOrEmpty($encPass)) {
    throw 'DATABASE_URL password is empty.'
  }
  $password = [Uri]::UnescapeDataString($encPass)
  $hostName = $uri.Host -replace '^\[(.+)\]$', '$1'
  if ([string]::IsNullOrWhiteSpace($hostName)) { $hostName = 'localhost' }
  $port = 5432
  if ($uri.Port -gt 0) { $port = $uri.Port }
  $urlDb = [Uri]::UnescapeDataString(($uri.AbsolutePath -replace '^/+', ''))
  return [pscustomobject]@{
    User = $user
    Password = $password
    Host = $hostName
    Port = $port
    Database = $urlDb
  }
}

function Resolve-PgTool([string]$ExeName, [string]$BinDir) {
  if (-not [string]::IsNullOrWhiteSpace($BinDir)) {
    $candidate = Join-Path $BinDir "$ExeName.exe"
    if (Test-Path $candidate) { return $candidate }
  }
  $command = Get-Command $ExeName -ErrorAction SilentlyContinue
  if ($command) {
    Write-Warning "$ExeName.exe not found under -PostgresBinDir '$BinDir'; falling back to PATH ($($command.Source))."
    return $command.Source
  }
  throw "$ExeName.exe not found under -PostgresBinDir '$BinDir' or PATH. Pass -PostgresBinDir with the PostgreSQL bin directory."
}

$db = ConvertFrom-DatabaseUrl $databaseUrl

# -DbName is the explicit target when passed. Without it, follow the database
# in DATABASE_URL so a manual run cannot silently dump the wrong database.
$targetDb = $db.Database
if ($PSBoundParameters.ContainsKey('DbName')) {
  $targetDb = $DbName
  if ($db.Database -and $db.Database -ne $DbName) {
    Write-Warning "DATABASE_URL targets database '$($db.Database)' but -DbName is '$DbName'; dumping '$DbName'."
  }
} elseif (-not $targetDb) {
  $targetDb = $DbName
}
if ($targetDb -cnotmatch '^[A-Za-z_][A-Za-z0-9_.-]{0,62}$') {
  throw "database name '$targetDb' is unsafe for a dump file prefix; pass -DbName with letters, digits, '_', '.' or '-' only."
}

$pgDump = Resolve-PgTool 'pg_dump' $PostgresBinDir
$stamp = Get-Date -Format 'yyyy-MM-dd_HHmm'
$out = Join-Path $BackupDir "${targetDb}-$stamp.dump"
Write-Host "Backing up $targetDb@$($db.Host):$($db.Port) to $out ..."
$env:PGPASSWORD = $db.Password
try {
  # Discrete libpq arguments: never the URL, which would carry the password
  # in the process command line. -w avoids an interactive prompt.
  & $pgDump -h $db.Host -p $db.Port -U $db.User -d $targetDb -w -Fc -f $out
  if ($LASTEXITCODE -ne 0) {
    if (Test-Path $out) { Remove-Item $out -Force -ErrorAction SilentlyContinue }
    throw "pg_dump exited $LASTEXITCODE"
  }
} finally {
  Remove-Item Env:\PGPASSWORD -ErrorAction SilentlyContinue
}
if (-not (Test-Path $out)) { throw "pg_dump reported success but $out does not exist." }
$dump = Get-Item $out
if ($dump.Length -eq 0) {
  Remove-Item $out -Force
  throw "backup is EMPTY ($out); task will report failure so the gap is noticed."
}
$sizeMB = [math]::Round($dump.Length / 1MB, 1)
Write-Host "OK: $out ($sizeMB MB)"

Get-ChildItem $BackupDir -Filter "${targetDb}-*.dump" |
  Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-$RetainDays) } |
  ForEach-Object { Write-Host "Pruning $($_.Name)"; Remove-Item $_.FullName -Force }
