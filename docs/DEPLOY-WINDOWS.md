# Deploy on Windows Server 2022 / 2025

Supported, tested target: **Windows Server 2022 and 2025, 64-bit, native
deployment** (no Docker). A Docker path exists but is _not_ recommended on
Windows Server (see path B).

## Choose a path

| Path                        | What                                                 | When                                               |
| --------------------------- | ---------------------------------------------------- | -------------------------------------------------- |
| **A. Native (recommended)** | Deno + PostgreSQL 16 + NSSM services + Caddy for TLS | Production on Windows Server                       |
| **B. Docker**               | Linux containers via Hyper-V isolation               | Only if the org already runs containers on Windows |

Why native first: Docker Desktop is **not supported on Windows Server**
(Docker's own docs restrict it to Windows 10/11). Running the provided
Linux image on Server needs Mirantis Container Runtime or manual
Hyper-V / WSL2 plumbing, and bind-mounts (`./.env:/app/.env:ro`) plus
named volumes behave differently there. The compose stack stays the
Linux/macOS path; on Windows Server use path A.

## Path A — native (step by step)

### 1. Prerequisites

- Windows Server 2022 or 2025, 64-bit, with Administrator access.
- PostgreSQL 16 (EDB installer: https://www.postgresql.org/download/windows/).
  Create role `barrier` + database `barreiras`, note the port (default 5432).
- Outbound 443 (Fracttal API, Deno/JSR downloads, fonts) and 587/465 (SMTP).
- Inbound 443 (public site). Port 8000 stays **loopback-only** behind the proxy.

### 2. Lay down the app

```powershell
# From an elevated PowerShell in the repo (or C:\srv\barrier-monitor):
Copy-Item .env.example .env
notepad .env   # set at least DATABASE_URL, ADMIN_TOKEN, COMPANY_NAME
```

Minimum `.env` for a first boot (host run, Postgres on the same box):

```ini
PUBLIC_API_MODE=http
DATABASE_URL=postgres://barrier:<password>@localhost:5432/barreiras?sslmode=disable
ADMIN_TOKEN=<openssl rand -hex 32 | 64 hex chars>
COMPANY_NAME=Seacrest Petróleo
APP_BASE_URL=https://barreiras.example.com
```

> PowerShell has no `export $(grep -v '^#' .env | xargs)` (a bash-ism used in
> `readme.md`). Do **not** export anything: `deno task start`, `db:migrate`,
> `doctor` and the poll loops all read `.env` via `--env-file=.env`
> themselves. For `dev`/`preview`/`build` (shell-env only), set vars in the
> current session instead:
>
> ```powershell
> Get-Content .env | Where-Object { $_ -match '^\s*[A-Z_]+=' } | ForEach-Object {
>   $k, $v = $_ -split '=', 2; Set-Item "env:$($k.Trim())" $v.Trim().Trim('"')
> }
> ```
>
> Token generation without openssl:
> `python -c "import secrets;print(secrets.token_hex(32))"` or
> `[Convert]::ToHexString((1..32 | ForEach-Object { Get-Random -Max 256 }))`.

Full production install in one invocation (recommended: installs Deno,
PostgreSQL 16, NSSM, Caddy, code, `.env` with generated secrets, services,
firewall, nightly backups, then smoke-tests; idempotent, fails hard on any
gate — see its header for all parameters):

```powershell
powershell -ExecutionPolicy Bypass -File .\deploy\windows\Setup-Production.ps1 `
  -Hostname barreiras.example.com -CompanyName "Seacrest Petróleo" `
  -AdminEmail you@example.com -RepoUrl https://github.com/org/repo.git
```

Omit `-Hostname` for a loopback-only host (Caddy and 80/443 stay off; add a
proxy later). Any secret you omit is generated and printed once at the end.
Re-runs pull, rebuild, migrate and restart without rotating `.env`.

Lighter alternative (prerequisites only — Postgres/services/Caddy stay
manual) when you want step-by-step control:

```powershell
powershell -ExecutionPolicy Bypass -File .\deploy\windows\Install-BarrierMonitor.ps1 -InstallDir C:\srv\barrier-monitor
```

It pins Deno **2.9.7** (repo-verified), locks `.env` ACLs to
Administrators + SYSTEM, then runs `doctor` → `build` → `db:migrate` and
opens TCP 8000 inbound.

### 3. Validate before serving

```powershell
deno run -A --env-file=.env scripts/doctor.ts   # must be all green
deno task db:migrate                            # idempotent schema + lookups
deno task admin:create -- --email you@example.com --password 'at-least-12-chars'
deno task build
deno task start                                 # serves :8000 from _fresh/server.js
Invoke-RestMethod http://localhost:8000/api/health
```

`doctor` checks: Deno 2.x, `.env` present, `DATABASE_URL` parseable (catches
the old `postgres://postgres://` typo), DB reachable, bundle built, ports
8000/5432 state. It exits non-zero on any failure so scripts can gate on it.

### 4. Run as services (NSSM)

```powershell
powershell -ExecutionPolicy Bypass -File .\deploy\windows\Register-Services.ps1 -InstallDir C:\srv\barrier-monitor
Get-Service BarrierApp,BarrierPoller,BarrierAlerts | Select Name,Status
```

This registers three auto-start services (same trio as `compose.yml`):

| Service         | Command                                | Matches compose |
| --------------- | -------------------------------------- | --------------- |
| `BarrierApp`    | `deno task start`                      | `app`           |
| `BarrierPoller` | `deno run -A scripts/fracttal-poll.ts` | `poller`        |
| `BarrierAlerts` | `deno run -A scripts/alerts-poll.ts`   | `alerts`        |

Logs: `C:\srv\barrier-monitor\logs\*-out.log` (+ `-err.log`), rotated.
No NSSM? Fallback is Task Scheduler at startup running the same three
commands with "Run whether user is logged on or not".

### 5. TLS (required)

The app speaks plain HTTP on `:8000`, and the session cookie only sets
`Secure` over https. Never expose `:8000` directly. Two options:

**Caddy (recommended, single exe, auto-HTTPS):**

1. Edit `deploy/windows/Caddyfile` hostname + `APP_BASE_URL` in `.env` to match.
2. Run Caddy as a service (nssm or `caddy run --config …` under Task Scheduler).
3. Open TCP 80 + 443, remove the :8000 firewall exception for remote hosts.

**IIS (if the shop already runs it):** install ARR + URL Rewrite, create a
site binding 443 with the cert, add a reverse-proxy rule to
`127.0.0.1:8000`, enable `X-Forwarded-*` passthrough. The app intentionally
ignores `X-Forwarded-For` for rate limiting (forgeable header), so all
proxied clients share one throttle bucket — fine for an internal dashboard.

### 6. Postgres ops on Windows

- Backup (nightly): `deploy/windows/Backup-Database.ps1` via Task Scheduler:
  `schtasks /create /tn "BarrierBackup" /tr "powershell -File C:\srv\barrier-monitor\deploy\windows\Backup-Database.ps1" /sc daily /st 02:00 /ru SYSTEM`.
- Verify: restore into an empty DB and compare `barriers` /
  `barrier_status_history` counts (same drill as `docs/API.md`).
- Stuck on port 5432? Set `POSTGRES_PORT`-equivalent by changing the port in
  `DATABASE_URL` (the `5432` default in `lib/server/db.ts` only applies when
  the DSN omits it).

### 7. Updates

```powershell
Set-Location C:\srv\barrier-monitor
git pull
deno task doctor     # catches env drift before anything restarts
deno task build
deno task db:migrate # idempotent
Restart-Service BarrierApp,BarrierPoller,BarrierAlerts
Invoke-RestMethod http://localhost:8000/api/health
```

Rollback: set `PUBLIC_API_MODE=mock` in `.env`, restart `BarrierApp` only.
The DB is untouched.

## Path B — Docker on Windows Server (not recommended)

Only if the org mandates containers: install **Mirantis Container Runtime**
(or Docker Engine EE) with Hyper-V isolation and run the Linux image as-is —
no code change needed. Caveats, all verified against this repo:

- No Docker Desktop: unsupported on Server; WSL2-backend tricks from dev
  laptops do not transfer.
- Bind-mount `./.env:/app/.env:ro` needs an absolute path or a
  `COMPOSE_CONVERT_WINDOWS_PATHS=1` env; prefer copying `.env` next to
  `compose.yml` and running from there.
- The bundled `db` service uses a **named volume** (`pgdata`) deliberately —
  keep it, do not switch to a bind mount (NTFS permission + fsync issues).
- `Dockerfile` is a Linux image; it cannot build or run as a Windows
  container. Do not attempt `FROM mcr.microsoft.com/windows/...`.
- Save the file with LF endings if edited in Notepad (CRLF in `compose.yml`
  is tolerated, CRLF inside `.env` values is not — no trailing spaces).

```powershell
$env:COMPOSE_CONVERT_WINDOWS_PATHS=1
docker compose build
docker compose run --rm tools deno run -A scripts/migrate.ts
docker compose up -d
curl http://localhost:8000/api/health
```

## Troubleshooting (Windows-specific)

| Symptom                              | Cause / fix                                                                                                                                                        |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `DATABASE_URL is not set` on `start` | Started outside the app dir or `.env` misnamed (must be exactly `.env`, not `.env.txt` — disable "hide extensions").                                               |
| `postgres://postgres://…`            | Old typo fixed in this release; value must be single-scheme `postgres://barrier:…@localhost:5432/barreiras?sslmode=disable` on host, `@db` only inside containers. |
| Login loops / cookie dropped         | Serving over http while `APP_BASE_URL` is https, or proxy not forwarding Host: Secure cookies need real TLS (path A step 5).                                       |
| `:8000` reachable on LAN             | Firewall rule too wide — restrict to loopback + proxy host.                                                                                                        |
| `deno` not found in service          | Service PATH lacks `%LOCALAPPDATA%\deno\bin`; reinstall with Install script (sets Machine PATH) or pass `-DenoExe` explicitly.                                     |
| CRLF weirdness in `.env`             | `doctor`'s parser strips `\r`; but values with trailing spaces fail auth — don't pad `KEY = value`.                                                                |
| Paths with spaces                    | Quote them (`"C:\srv\barrier monitor\…"`) in NSSM `AppDirectory`, not in `.env` URLs.                                                                              |
| Poller exits code 2                  | Missing `FRACTTAL_KEY`/`FRACTTAL_SECRET` — by design it exits instead of idling. Set them or stop the `BarrierPoller` service for offline sites.                   |
| Alerts silent                        | No relay configured = visible dry-run by design; set `OPS_SMTP_*` + recipients, then `deno run -A --env-file=.env scripts/alerts-check.ts --apply`.                |

## Pre-handover checklist

- [ ] `doctor` green on the server itself (not just the admin laptop).
- [ ] Real `ADMIN_TOKEN` (64 hex), real DB password, `.env` ACLs locked.
- [ ] `BarrierApp/Poller/Alerts` all `Running`, survive a reboot.
- [ ] Public URL serves https, `:8000` not reachable remotely.
- [ ] Login → dashboard → export CSV/XLSX/PDF each download a file.
- [ ] Nightly backup task exists and a restore was drilled once.
- [ ] `docs/PORT-MAP.md` §10 consulted before changing any port.
