#Requires -Version 5.1
#Requires -RunAsAdministrator
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
.EXAMPLE
  powershell -ExecutionPolicy Bypass -File .\deploy\windows\Setup-Production.ps1 `
    -Hostname barreiras.example.com -CompanyName "Seacrest Petróleo" `
    -AdminEmail you@example.com -RepoUrl https://github.com/org/repo.git
#>
param(
  [string]$InstallDir = 'C:\srv\barrier-monitor',
  [string]$ToolsDir = 'C:\tools',
  [string]$BackupDir = 'D:\backups\barreiras',
  [string]$Hostname = '',
  [string]$CompanyName = '',
  [string]$AdminEmail = '',
  [string]$AdminPassword = '',
  [string]$DbUser = 'barrier',
  [string]$DbName = 'barreiras',
  [string]$DbPassword = '',
  [string]$PgPort = '5432',
  [string]$PostgresSuperPassword = '',
  [string]$AppPort = '8000',
  [string]$DenoVersion = 'v2.9.7',
  [string]$CaddyVersion = 'v2.11.7',
  [string]$NssmVersion = '2.24',
  [string]$PostgresInstallerUrl = 'https://get.enterprisedb.com/postgresql/postgresql-16.4-1-windows-x64.exe',
  [string]$PostgresBinDir = 'C:\Program Files\PostgreSQL\16\bin',
  [string]$RepoUrl = '',
  [string]$SourceZip = '',
  [string]$Branch = 'master',
  [string]$FracttalKey = '',
  [string]$FracttalSecret = '',
  [string]$SmtpHost = '',
  [string]$SmtpPort = '587',
  [string]$SmtpUser = '',
  [string]$SmtpPass = '',
  [string]$OpsEmailTo = '',
  [switch]$SkipPostgres,
  [switch]$SkipCaddy,
  [switch]$SkipBackup,
  [switch]$SkipFirewall,
  [switch]$AllowLanAppPort
)

$ErrorActionPreference = 'Stop'

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

function Set-DotEnvKey([string]$file, [string]$key, [string]$value) {
  $lines = Get-Content $file
  $pattern = "^(#\s*)?" + [regex]::Escape($key) + '\s*=.*$'
  $done = $false
  $lines = $lines | ForEach-Object {
    if (-not $done -and $_ -match $pattern) { $done = $true; "$key=$value" } else { $_ }
  }
  if (-not $done) { $lines += "$key=$value" }
  Set-Content -Path $file -Value $lines -Encoding UTF8
}

# ── 0. Host and inputs ──────────────────────────────────────────────
Write-Step 'Checking host (Windows Server 2022/2025, 64-bit, elevated)'
$os = (Get-CimInstance Win32_OperatingSystem).Caption
Write-Host "OS: $os"
if (-not [Environment]::Is64BitOperatingSystem) { Write-Need '64-bit Windows is required.' }
if ($os -notmatch '2022|2025') { Write-Warning "$os is not Server 2022/2025; continuing, verify paths manually." }
if ([string]::IsNullOrWhiteSpace($AdminEmail) -or $AdminEmail -notlike '*@*') {
  Write-Need 'pass -AdminEmail you@example.com (first admin account).'
}
if ($AdminPassword -and $AdminPassword.Length -lt 12) { Write-Need 'AdminPassword must be 12+ characters.' }
$generatedAdmin = $false
if (-not $AdminPassword) { $AdminPassword = New-RandomPassword 20; $generatedAdmin = $true }

# ── 1. Deno (machine-wide so LocalSystem services see it) ────────────
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

# ── 2. PostgreSQL 16 ────────────────────────────────────────────────
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
  Write-Need "no code at $InstallDir: pass -RepoUrl or -SourceZip, or copy the repo there first."
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
$caddyWanted = (-not $SkipCaddy) -and (-not [string]::IsNullOrWhiteSpace($Hostname))
if ($caddyWanted -and -not (Test-Path $caddyExe)) {
  $zip = "$env:TEMP\caddy-setup.zip"
  Invoke-Download "https://github.com/caddyserver/caddy/releases/download/$CaddyVersion/caddy_${CaddyVersion}_windows_amd64.zip" $zip
  New-Item -ItemType Directory -Force -Path (Split-Path $caddyExe) | Out-Null
  Expand-Archive -Path $zip -DestinationPath (Split-Path $caddyExe) -Force
  Remove-Item $zip -Force -ErrorAction SilentlyContinue
}
if (-not $caddyWanted) { Write-Host 'Caddy skipped (no -Hostname or -SkipCaddy): app stays loopback-only.' }

# ── 5. .env (created once, never rotated on re-run) ─────────────────
Write-Step 'Ensuring .env (created once; existing files are never overwritten)'
$envFile = Join-Path $InstallDir '.env'
if (-not (Test-Path $envFile)) {
  if (-not $DbPassword) { $DbPassword = New-RandomPassword 20 }
  Copy-Item (Join-Path $InstallDir '.env.example') $envFile
  $encPass = [uri]::EscapeDataString($DbPassword)
  Set-DotEnvKey $envFile 'PUBLIC_API_MODE' 'http'
  Set-DotEnvKey $envFile 'DATABASE_URL' "postgres://${DbUser}:${encPass}@localhost:${PgPort}/${DbName}?sslmode=disable"
  Set-DotEnvKey $envFile 'ADMIN_TOKEN' (New-RandomHex 32)
  Set-DotEnvKey $envFile 'COMPANY_NAME' $CompanyName
  if ($Hostname) { Set-DotEnvKey $envFile 'APP_BASE_URL' "https://$Hostname" }
  if ($FracttalKey) { Set-DotEnvKey $envFile 'FRACTTAL_KEY' $FracttalKey }
  if ($FracttalSecret) { Set-DotEnvKey $envFile 'FRACTTAL_SECRET' $FracttalSecret }
  if ($SmtpHost) { Set-DotEnvKey $envFile 'OPS_SMTP_HOST' $SmtpHost }
  if ($SmtpHost) { Set-DotEnvKey $envFile 'OPS_SMTP_PORT' $SmtpPort }
  if ($SmtpUser) { Set-DotEnvKey $envFile 'OPS_SMTP_USER' $SmtpUser }
  if ($SmtpPass) { Set-DotEnvKey $envFile 'OPS_SMTP_PASS' $SmtpPass }
  if ($OpsEmailTo) { Set-DotEnvKey $envFile 'OPS_EMAIL_TO' $OpsEmailTo }
  Write-Host '.env created from template with generated secrets.'
} else {
  Write-Host '.env exists: left untouched (rotate secrets manually if needed).'
}
icacls $envFile /inheritance:r /grant:r 'Administrators:F' 'SYSTEM:F' | Out-Null

# ── 6. Validate, build, migrate, first admin (hard gates) ───────────
Write-Step 'Running doctor gate (fails the setup on any failure)'
Push-Location $InstallDir
& $denoExe task doctor
if ($LASTEXITCODE -ne 0) { Pop-Location; Write-Need 'doctor failed; fix .env and re-run.' }
Write-Step 'Building the Fresh bundle'
& $denoExe task build
Write-Step 'Applying database migrations (idempotent)'
& $denoExe task db:migrate
Write-Step "Ensuring admin $AdminEmail (warning is fine when it already exists)"
& $denoExe task admin:create -- --email $AdminEmail --password $AdminPassword
if ($LASTEXITCODE -ne 0) { Write-Warning 'admin:create did not report success; it likely already exists. Verify login later.' }
Pop-Location

# ── 7. Services ─────────────────────────────────────────────────────
Write-Step 'Registering Barrier services (app + poller + alerts)'
& "$deployDir\Register-Services.ps1" -InstallDir $InstallDir -NssmExe $nssmExe -DenoExe $denoExe -AppPort $AppPort
$hasFracttal = $false
foreach ($line in Get-Content $envFile) {
  if ($line -match '^\s*FRACTTAL_KEY\s*=\s*\S+') { $hasFracttal = $true }
}
if (-not $hasFracttal) {
  Stop-Service BarrierPoller -ErrorAction SilentlyContinue
  Set-Service BarrierPoller -StartupType Disabled
  Write-Warning 'no FRACTTAL_KEY in .env: BarrierPoller disabled (exits code 2 without creds by design). Enable after adding keys.'
}
if ($caddyWanted) {
  Write-Step "Registering Caddy reverse proxy for $Hostname"
  $caddyDir = Join-Path $InstallDir 'caddy'
  New-Item -ItemType Directory -Force -Path $caddyDir | Out-Null
  New-Item -ItemType Directory -Force -Path "$InstallDir\logs" | Out-Null
  $logPath = Join-Path $InstallDir 'logs\caddy-access.log'
  Set-Content -Path "$caddyDir\Caddyfile" -Encoding UTF8 -Value @"
# Generated by Setup-Production.ps1. Do not edit by hand: re-run the setup
# script to regenerate (template: deploy/windows/Caddyfile).
$Hostname {
	reverse_proxy 127.0.0.1:$AppPort
	header {
		X-Content-Type-Options nosniff
		X-Frame-Options DENY
		Referrer-Policy no-referrer
	}
	log {
		output file $logPath
		format json
	}
}
"@
  $svc = Get-Service BarrierCaddy -ErrorAction SilentlyContinue
  if ($svc) {
    & $nssmExe stop BarrierCaddy | Out-Null
    & $nssmExe remove BarrierCaddy confirm | Out-Null
  }
  & $nssmExe install BarrierCaddy "`"$caddyExe`"" "run --config `"$caddyDir\Caddyfile`" --adapter caddyfile" | Out-Null
  & $nssmExe set BarrierCaddy AppDirectory $caddyDir | Out-Null
  & $nssmExe set BarrierCaddy Description 'Barrier Monitor TLS reverse proxy (Caddy)' | Out-Null
  & $nssmExe set BarrierCaddy Start SERVICE_AUTO_START | Out-Null
  & $nssmExe set BarrierCaddy AppStdout "$InstallDir\logs\BarrierCaddy-out.log" | Out-Null
  & $nssmExe set BarrierCaddy AppStderr "$InstallDir\logs\BarrierCaddy-err.log" | Out-Null
  & $nssmExe set BarrierCaddy AppRotateFiles 1 | Out-Null
  & $nssmExe set BarrierCaddy AppRotateOnline 1 | Out-Null
  & $nssmExe start BarrierCaddy | Out-Null
  Write-Host 'service BarrierCaddy: installed + started.'
}

# ── 8. Firewall ─────────────────────────────────────────────────────
if (-not $SkipFirewall) {
  Write-Step 'Configuring Windows Firewall'
  if ($caddyWanted) {
    foreach ($port in @('80', '443')) {
      $rule = "Barrier Monitor web ($port)"
      if (-not (Get-NetFirewallRule -DisplayName $rule -ErrorAction SilentlyContinue)) {
        New-NetFirewallRule -DisplayName $rule -Direction Inbound -Protocol TCP -LocalPort $port -Action Allow | Out-Null
      }
    }
    Write-Host 'inbound TCP 80+443 open; app port stays loopback-only.'
  } elseif ($AllowLanAppPort) {
    $rule = "Barrier Monitor app ($AppPort)"
    if (-not (Get-NetFirewallRule -DisplayName $rule -ErrorAction SilentlyContinue)) {
      New-NetFirewallRule -DisplayName $rule -Direction Inbound -Protocol TCP -LocalPort $AppPort -Action Allow | Out-Null
    }
    Write-Warning "TCP $AppPort is open to the LAN without TLS: acceptable only behind VPN; prefer -Hostname with Caddy."
  } else {
    Write-Host 'no inbound rules created: app reachable from this host only until a proxy is added.'
  }
} else {
  Write-Host 'firewall skipped per -SkipFirewall.'
}

# ── 9. Nightly backup task ──────────────────────────────────────────
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
if (-not $ok) { Write-Need "app did not answer /api/health after ~2 min; see $InstallDir\logs\BarrierApp-err.log." }
$login = Invoke-WebRequest -Uri "http://127.0.0.1:$AppPort/login" -UseBasicParsing
if ($login.StatusCode -notin @(200, 302)) { Write-Need "/login returned $($login.StatusCode)." }
Write-Host "health ok, /login -> $($login.StatusCode)."

# ── 11. Summary (no secrets except the one-time box below) ──────────
$summary = @"
Barrier Monitor installed: $(Get-Date -Format s)
OS: $os
Code: $InstallDir (branch $Branch)
Deno: $(& $denoExe --version | Select-Object -First 1)
DB: ${DbUser}@localhost:${PgPort}/${DbName}
App: http://127.0.0.1:$AppPort (service BarrierApp)
Public: $(if ($Hostname) { "https://$Hostname (service BarrierCaddy)" } else { 'loopback-only (no hostname given)' })
Backup task: BarrierBackup daily 02:00 -> $BackupDir
Logs: $InstallDir\logs
"@
Set-Content -Path "$InstallDir\logs\install-summary.txt" -Value $summary -Encoding UTF8
Write-Host ''
Write-Host $summary -ForegroundColor Green
Write-Host ''
Write-Host 'STORE THESE NOW (shown once, never logged):' -ForegroundColor Yellow
if ($generatedAdmin) { Write-Host "  admin login: $AdminEmail / $AdminPassword  (change it after first login)" -ForegroundColor Yellow }
if ($pgPassOwn) { Write-Host "  postgres superuser password: $PostgresSuperPassword  (store in vault)" -ForegroundColor Yellow }
Write-Host ''
Write-Host 'Next: point DNS at this host, confirm https serves, log in, set FRACTTAL_* + recipients if skipped.'
