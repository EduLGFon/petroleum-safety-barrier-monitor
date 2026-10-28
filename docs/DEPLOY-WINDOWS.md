# Deploy on Windows Server 2022 / 2025

Supported target: Windows Server 2022/2025, 64-bit, native (no Docker). Docker path
exists but is not recommended (path B).

## Choose a path
| Path | What | When |
| --- | --- | --- |
| A Native (recommended) | Deno + PostgreSQL 16 + NSSM + Caddy TLS | Production |
| B Docker | Linux containers via Hyper-V | Only if org mandates containers |

Native first: Docker Desktop unsupported on Server; Linux image needs Mirantis
runtime or Hyper-V/WSL2; bind-mounts/volumes differ.

## Path A - native
### 1. Prerequisites
- Windows Server 2022/2025, 64-bit, admin access.
- PostgreSQL 16 (EDB). Role `barrier`, db `barreiras`, note port (default 5432).
- Outbound 443, 587/465. Inbound 443. Port 8300 loopback only.

### 2. Lay down the app
```powershell
Copy-Item .env.example .env
notepad .env
```
Minimum `.env`:
```ini
PUBLIC_API_MODE=http
DATABASE_URL=postgres://barrier:<pw>@localhost:5432/barreiras?sslmode=disable
ADMIN_TOKEN=<64 hex>
COMPANY_NAME=Seacrest Petróleo
APP_BASE_URL=https://barreiras.example.com
```
No `export` needed; tasks read `.env` via `--env-file`. For dev/preview/build set
vars in session. Token: `python -c "import secrets;print(secrets.token_hex(32))"`.

One-command path (no git):
```powershell
mkdir C:\srv\barrier-monitor; cd C:\srv\barrier-monitor
Invoke-WebRequest https://github.com/ORG/REPO/archive/refs/heads/master.zip -OutFile repo.zip
Expand-Archive repo.zip .; Copy-Item repo-master\* . -Recurse -Force
.\deploy\windows\Setup.cmd -Hostname barreiras.example.com -CompanyName "Seacrest Petróleo" -AdminEmail you@example.com
```
Setup.cmd self-elevates, runs Setup-Production.ps1: Deno, Postgres 16, NSSM,
Caddy, code, `.env`, services, firewall, backups, smoke tests. Idempotent, fails
hard. Omit `-Hostname` for loopback host; omitted secrets printed once; re-runs
pull/rebuild/migrate/restart without rotating `.env`. Replace ORG/REPO.

Exotic knobs: call Setup-Production.ps1 directly. Lighter alt (prereqs only):
```powershell
powershell -ExecutionPolicy Bypass -File .\deploy\windows\Install-BarrierMonitor.ps1 -InstallDir C:\srv\barrier-monitor
```
Pins Deno 2.9.7, locks `.env` ACLs, runs doctor -> build -> db:migrate, opens
TCP 8300.

### 3. Validate
```powershell
deno run -A --env-file=.env scripts/doctor.ts
deno task db:migrate
deno task admin:create -- --email you@example.com --password 'at-least-12-chars'
deno task build
deno task start
Invoke-RestMethod http://localhost:8300/api/health
```
doctor checks Deno 2.x, `.env`, DATABASE_URL parseable, DB reachable, bundle,
ports 8300/5432.

### 4. Services (NSSM)
```powershell
powershell -ExecutionPolicy Bypass -File .\deploy\windows\Register-Services.ps1 -InstallDir C:\srv\barrier-monitor
Get-Service BarrierApp,BarrierPoller,BarrierAlerts | Select Name,Status
```
| Service | Command | compose |
| --- | --- | --- |
| BarrierApp | `deno task start` | app |
| BarrierPoller | `deno run -A scripts/fracttal-poll.ts` | poller |
| BarrierAlerts | `deno run -A scripts/alerts-poll.ts` | alerts |
Logs `C:\srv\barrier-monitor\logs\*-out.log` (+ `-err.log`), rotated. No NSSM:
Task Scheduler at startup.

### 5. TLS (required)
App HTTP on `:8300`. Set `APP_BASE_URL` to public https so cookie Secure. Never
expose `:8300`. Caddy: edit Caddyfile hostname + `APP_BASE_URL`; run Caddy
service; open 80+443; remove :8300 remote exception. IIS: ARR + URL Rewrite, site
binding 443 with cert, reverse proxy to `127.0.0.1:8300`, enable
`X-Forwarded-*`. App ignores `X-Forwarded-For` for rate limiting; proxied
clients share one throttle bucket.

### 6. Postgres ops
- Backup nightly: `Backup-Database.ps1` via Task Scheduler:
  `schtasks /create /tn "BarrierBackup" /tr "powershell -File C:\srv\barrier-monitor\deploy\windows\Backup-Database.ps1" /sc daily /st 02:00 /ru SYSTEM`.
- Verify restore into empty DB, compare `barriers` / `barrier_status_history`
  counts.
- Port change: adjust port in `DATABASE_URL`.

### 7. Updates
```powershell
Set-Location C:\srv\barrier-monitor
git pull
deno task doctor
deno task build
deno task db:migrate
Restart-Service BarrierApp,BarrierPoller,BarrierAlerts
Invoke-RestMethod http://localhost:8300/api/health
```
Rollback: set `PUBLIC_API_MODE=mock`, restart `BarrierApp` only. DB untouched.

## Path B - Docker (not recommended)
Install Mirantis Container Runtime (or Docker Engine EE) Hyper-V isolation; run
Linux image as-is. Caveats: no Docker Desktop on Server; bind-mount needs
absolute path or `COMPOSE_CONVERT_WINDOWS_PATHS=1`; keep named volume `pgdata`;
Dockerfile is Linux image; save `.env` with LF endings.
```powershell
$env:COMPOSE_CONVERT_WINDOWS_PATHS=1
docker compose build
docker compose run --rm tools deno run -A scripts/migrate.ts
docker compose up -d
curl http://localhost:8300/api/health
```

## Troubleshooting
| Symptom | Cause / fix |
| --- | --- |
| `DATABASE_URL is not set` | Started outside app dir or `.env` misnamed (must be `.env`, not `.env.txt`). |
| `postgres://postgres://...` | Old typo; single-scheme DSN, `@db` only in containers. |
| Login loops / cookie dropped | http serving with https `APP_BASE_URL`, or proxy not forwarding Host. |
| `:8300` reachable on LAN | Firewall too wide; restrict to loopback + proxy host. |
| `deno` not found in service | Service PATH lacks `%LOCALAPPDATA%\deno\bin`; reinstall or pass `-DenoExe`. |
| CRLF weirdness in `.env` | Parser strips `\r`; trailing spaces fail auth. |
| Paths with spaces | Quote in NSSM `AppDirectory`, not in `.env` URLs. |
| Poller exits code 2 | Missing `FRACTTAL_KEY`/`FRACTTAL_SECRET`; set or stop service. |
| Alerts silent | No relay = dry-run; set `OPS_SMTP_*` + recipients, run alerts-check `--apply`. |

## Pre-handover checklist
- [ ] `doctor` green on server.
- [ ] Real `ADMIN_TOKEN`, DB password, `.env` ACLs locked.
- [ ] Services Running, survive reboot.
- [ ] Public URL https, `:8300` not remote.
- [ ] Login -> dashboard -> exports download.
- [ ] Nightly backup task + restore drilled.
- [ ] Consult `docs/PORT-MAP.md` section 10 before changing ports.
