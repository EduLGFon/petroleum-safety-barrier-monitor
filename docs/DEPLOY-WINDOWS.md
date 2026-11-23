# Deploy on Windows Server 2022/2025

Barrier Monitor has two supported deployment paths:

- **Windows native**: `deploy/windows/Setup.cmd` launches
  `Setup-Production.ps1`, which installs Deno 2.9.7, registers the NSSM
  services SeaMonitorApp, SeaMonitorPoller, SeaMonitorAlerts and
  SeaMonitorCaddy (legacy Barrier* names via `-ServicePrefix Barrier`), and
  puts Caddy TLS in front of the app. Defaults target the APP10 topology:
  database `monitor`, role `barrier`, PostgreSQL 18 binaries at
  `C:\sites\seacrest\.vendor\pgsql18\bin`, backups under
  `D:\backups\monitor`, app on port 8300 bound to loopback.
- **Docker Compose**: `compose.yml` runs PostgreSQL 18-alpine plus the app,
  poller, alerts and one-off tools containers. Use a host with Docker Engine
  and Compose v2. Docker Desktop is not supported on Windows Server. Compose
  is supported but is not the production path on Windows Server; the native
  path above is.

Both paths are supported. This document does not assume which path a given
production host uses; follow the section that matches that host.

## Before you start

Budget about one hour for a first native install. Nothing changes until the
operator types `YES`, unless `-Unattended` is passed. `-CheckOnly` prints the
planned changes without making any. The uninstall script removes what the
setup added, with data removal kept as an explicit opt-in.

Ask the server owner for:

- RDP access and a local administrator account.
- The server LAN address and the client network ranges (office or VPN CIDRs).
- Outbound internet access. Native setup downloads Deno, PostgreSQL, NSSM and
  Caddy; runtime calls reach the upstream CMMS and the alert provider over
  TCP 443.
- A DNS name with an A record pointing at the server, only when automatic
  HTTPS is wanted.

Concepts used below:

- **RDP**: remote desktop session to the server.
- **Administrator PowerShell**: elevated terminal; the setup scripts require
  it.
- **Service**: a program Windows starts at boot. NSSM wraps the Deno
  processes as services with automatic restart.
- **Firewall**: Windows Firewall is default-deny for this install. Setup opens
  only the ports that were explicitly scoped.
- **PostgreSQL**: database for barriers, users, sync history and alerts.
- **Caddy**: TLS reverse proxy. The app speaks plain HTTP on loopback port
  8300; Caddy is the public listener.

## Prerequisites

Windows native:

- Windows Server 2022 or 2025, 64-bit, with a local administrator.
- Code at `C:\srv\barrier-monitor` (the default path). Extract a repository
  archive there, or clone the repository when Git is available.
- PostgreSQL 16 is installed by setup when missing (the vendor PostgreSQL 18
  binaries at `C:\sites\seacrest\.vendor\pgsql18\bin` are used when
  present). When PostgreSQL already exists, persist
  `POSTGRES_SUPER_PASSWORD` at User or Machine scope and start an elevated
  session, or answer the interactive prompt, so setup can ensure the role and
  database. Do not pass `-PostgresSuperPassword` on the command line: setup
  rejects CLI secrets to keep them out of process lists and shell history.
- Port 80 reachable by clients; add 443 when Caddy runs with a hostname.

Docker Compose:

- A host with Docker Engine and Compose v2. Linux is the usual target.
- A code checkout.
- `.env` copied from `.env.example`, with `PUBLIC_API_MODE=http` for
  production.
- A strong `POSTGRES_PASSWORD` (16 or more characters) or an external database
  URL in `DATABASE_URL_DOCKER`.
- Loopback ports 8300 and 5432 free.

## Secrets and elevation

Secrets never ride the command line. `-AdminPassword`, `-DbPassword`,
`-PostgresSuperPassword` and `-FracttalSecret` are rejected when passed on
the CLI, because the value stays visible in process lists and shell history.
Use the matching environment variable (`ADMIN_PASSWORD`, `DB_PASSWORD`,
`POSTGRES_SUPER_PASSWORD`, `FRACTTAL_SECRET`) in an already elevated
PowerShell, or answer the interactive prompt.

`POSTGRES_SUPER_PASSWORD` is read from the environment or prompted. Under
`-Unattended`, setup fails closed if it is missing.

Setup self-elevates through an encoded child command: the whole invocation
(script path plus non-secret arguments, single-quoted) is Base64-encoded into
`-EncodedCommand`, so values survive the UAC hop. Windows UAC builds the
elevated child's environment from the persisted User/Machine variables and
does not carry runtime-set process variables across. A non-elevated run with
secret environment variables visible fails closed before elevation, because
the parent cannot tell a persisted secret from a runtime-set one. Run Setup
from an already elevated PowerShell for env-secret workflows. `-Elevated` is
the internal UAC-child marker; `-NoElevate` never opens UAC and requires an
already elevated session.

The `.env` writer rejects values containing double quotes or backslashes, so
generated and prompted secrets stay round-trippable through both readers.

## Windows native path

### Install

1. Connect to the server over RDP.
2. Open PowerShell as Administrator.
3. Put the repository at `C:\srv\barrier-monitor`. Any repository archive
   works; expand it so `deno.jsonc`, `.env.example` and `deploy\windows\` are
   at that root.
4. Run the setup launcher and answer its prompts:

```powershell
cd C:\srv\barrier-monitor
.\deploy\windows\Setup.cmd -Hostname barrier.example.com `
  -CompanyName "Example Operator" -AdminEmail admin@example.com `
  -AllowedLanRanges '10.0.0.0/8'
```

`Setup.cmd` re-launches an elevated PowerShell with `ExecutionPolicy Bypass`
and forwards the arguments. `barrier.example.com` is a placeholder, not a real
hostname. Replace the example range with the office or VPN CIDRs: setup
refuses to open web ports without `-AllowedLanRanges`. On an unfamiliar host,
run setup first with `-CheckOnly`: it probes disk, ports, existing services,
`.env` and network reachability, prints the plan, and changes nothing. Before
production, run every step in `deploy/windows/ACCEPTANCE.md`; that checklist
is unexecuted and must pass on a Windows host first.

A real run does the following:

- Installs pinned Deno 2.9.7 under `C:\tools\deno` and adds it to the machine
  PATH.
- Installs PostgreSQL 16 on port 5432 when missing (unattended EDB installer,
  with a winget fallback), and ensures role `barrier` and database `monitor`
  (legacy `barreiras` via `-DbName barreiras`).
- Installs NSSM and Caddy when needed.
- Creates `.env` once from `.env.example` with a generated database password,
  `ADMIN_TOKEN` and, when omitted, an admin password. Existing `.env` files
  are never rotated. The file ACL is restricted to Administrators and SYSTEM.
  Values containing `"` or `\` are rejected by the `.env` writer.
- Runs `deno task doctor`, builds `_fresh/server.js`, applies migrations, and
  creates the first admin account.
- Registers the services, firewall rules, optional Caddy site and the nightly
  backup task, then smoke tests `/api/health` and `/login`.

Generated secrets and any generated Postgres superuser password are printed
once at the end. Store them before closing the window. Secrets are never passed
on the command line: set `ADMIN_PASSWORD`, `DB_PASSWORD`,
`POSTGRES_SUPER_PASSWORD` or `FRACTTAL_SECRET` in an already elevated
PowerShell, or answer the interactive prompts. Passing `-AdminPassword`,
`-DbPassword`, `-PostgresSuperPassword` or `-FracttalSecret` aborts setup.
`POSTGRES_SUPER_PASSWORD` is read from the environment or prompted; under
`-Unattended` setup fails closed if it is missing. See the Elevation section.

After setup finishes, open the URL in the summary (`https://` hostname in
domain mode, or the server IP in IP mode), sign in with the admin email and the
saved password, and run `Test-BarrierHealth.ps1`. Nightly backups start at
02:00.

Useful parameters:

- `-Hostname <dns>`: automatic HTTPS through Caddy; also opens 443. SSO needs
  an https `APP_BASE_URL`, so SSO requires `-Hostname`. Without it, IP mode
  is plain HTTP with no SSO.
- `-ServicePrefix <name>` (default `SeaMonitor`): service name prefix.
  `-ServicePrefix Barrier` restores the legacy Barrier* layout.
- `-DbName <name>` (default `monitor`): database name. `-DbName barreiras`
  restores the legacy database.
- `-DbUser <name>` (default `barrier`), `-PostgresBinDir <path>` (default
  `C:\sites\seacrest\.vendor\pgsql18\bin`), `-BackupDir <path>` (default
  `D:\backups\monitor`), `-AppPort <port>` (default 8300),
  `-PgPort <port>` (default 5432), `-BindHost <ip>` (default `127.0.0.1`).
- `-AllowedLanRanges '10.0.0.0/8','192.168.0.0/16'`: scopes Windows Firewall to
  the client network; required before web ports are opened.
- `-SkipPostgres`, `-SkipCaddy`, `-SkipBackup`, `-SkipFirewall`: skip those
  stages. Record any skipped control as a documented exception.
- `-SkipCaddy -AllowLanAppPort` with ranges: exposes plain HTTP on the app
  port. Discouraged; only behind a VPN.
- `-SourceZip <path>`: install from a local archive. `-RepoUrl` and `-Branch`
  clone from Git when Git is installed.
- `-Unattended`: skip the typed YES, for scripted re-runs only. Fails closed
  when `POSTGRES_SUPER_PASSWORD` is missing.
- `-CheckOnly`: probe and print the plan without changing anything.
- `-Elevated` / `-NoElevate`: internal UAC marker and opt-out. `-NoElevate`
  never opens UAC and requires an already elevated session.

Without `-Hostname` and with Caddy enabled, setup uses IP mode: users open
plain HTTP on port 80 and there is no TLS, because automatic certificates need
a DNS name. Keep that mode on a trusted LAN or VPN. Re-run with `-Hostname`
later to add HTTPS. Existing `.env` files are preserved, so update
`APP_BASE_URL` to the https URL when switching modes. SSO is unavailable in IP
mode because it requires an https `APP_BASE_URL`.

### Update

Re-run `Setup.cmd` with the same arguments. The setup is idempotent: a Git
checkout is fetched and fast-forwarded, the bundle is rebuilt, migrations run,
and services are re-registered and restarted. `.env` is left untouched. For an
archive install, replace the files with a newer archive and re-run. Expect a
short outage while services restart.

### Firewall

The default posture is deny inbound. With Caddy enabled, setup refuses to open
web ports unless `-AllowedLanRanges` is passed. It then opens inbound TCP 80
and, when `-Hostname` is set, TCP 443, scoped to those ranges. Re-running
setup refreshes the scope so a previously widened rule is tightened again.

Port 8300 is not opened: Caddy reaches the app at `127.0.0.1:8300`. Only
`-SkipCaddy -AllowLanAppPort` with ranges opens 8300, without TLS, which is
acceptable only behind a VPN. `-SkipFirewall` leaves Windows Firewall
unchanged and requires an explicit, documented exception.

### Services

NSSM registers four auto-start services (default prefix `SeaMonitor`; legacy
`Barrier*` via `-ServicePrefix Barrier`):

| Service          | Runs                                                | Listener                                     |
| ---------------- | --------------------------------------------------- | -------------------------------------------- |
| SeaMonitorApp    | `deno serve ... --host <BindHost> --port <AppPort>` | `<BindHost>:<AppPort>` (loopback by default) |
| SeaMonitorPoller | `scripts/fracttal-poll.ts`                          | outbound HTTPS                               |
| SeaMonitorAlerts | `scripts/alerts-poll.ts`                            | outbound HTTPS                               |
| SeaMonitorCaddy  | Caddy with generated config                         | TCP 80; 443 with `-Hostname`                 |

`Register-Services.ps1` owns the service command line. It sets NSSM stop
methods and `POOL_SIZE` to 10 for the app, 4 for the poller and 2 for alerts,
and a shared `DENO_DIR`. The app binds to `-BindHost` (loopback by default);
only `-SkipCaddy -AllowLanAppPort` with ranges switches it to `0.0.0.0`.

Check status and read logs:

```powershell
Get-Service SeaMonitorApp,SeaMonitorPoller,SeaMonitorAlerts,SeaMonitorCaddy
Get-Content C:\srv\barrier-monitor\logs\SeaMonitorApp-err.log -Tail 50
```

When `.env` has no `FRACTTAL_KEY`, setup disables SeaMonitorPoller because the
poller exits without upstream credentials. After adding the keys, enable it:

```powershell
Set-Service SeaMonitorPoller -StartupType Automatic
Start-Service SeaMonitorPoller
```

### Reverse proxy and TLS

Setup generates `C:\srv\barrier-monitor\caddy\Caddyfile` from
`deploy\windows\Caddyfile` and runs it through the prefixed Caddy service. The
generated file is owned by setup; change the template and re-run instead of
editing it by hand.

Caddy obtains and renews certificates automatically. That requires the DNS A
record to point at the server and the client network to reach ports 80 and 443.
Until the certificate is issued, Caddy retries on its own. The template adds
`X-Real-IP` so the app's throttle uses the real client address, and it leaves
HSTS commented out until HTTPS has passed a smoke test. In IP mode the same
service proxies plain HTTP on port 80.

Keep 8300 loopback-only. It is the upstream of the proxy, not a user-facing
port.

### Health checks

Run the read-only health check. It prints PASS, WARN and FAIL lines for
services, ports, `/api/health`, `/login`, the database, disk space, the newest
backup and recent log errors, writes the same report to
`logs\health-report.txt`, and exits 1 when anything fails:

```powershell
powershell -ExecutionPolicy Bypass -File .\deploy\windows\Test-BarrierHealth.ps1
```

`Test-BarrierHealth.ps1` accepts `-ServicePrefix`, `-AppPort`, `-PgPort`,
`-PostgresBinDir` and `-DbName` so it can follow a non-default install, and
exits with a non-zero code when any check fails.

Other checks:

- `deno task doctor`: validates `.env` and boot configuration. Setup runs it
  as a hard gate.
- `GET /api/health`: DB-free liveness. It answers while the app process is up,
  even when PostgreSQL is down.
- `GET /api/ready`: boot configuration plus a database round-trip. It returns
  503 with `Retry-After` when the database is unreachable, so use it to judge
  data-serving readiness. The compose healthcheck uses this endpoint.
- Smoke test: `Invoke-RestMethod http://127.0.0.1:8300/api/health` and
  `Invoke-WebRequest http://127.0.0.1:8300/login -UseBasicParsing`.

From another machine, test the public URL, not 8300.

### Backup and restore

Setup registers the scheduled task `BarrierBackup` to run daily at 02:00 as
SYSTEM. It calls `deploy\windows\Backup-Database.ps1`, which:

- Reads `DATABASE_URL` from the environment or the repository `.env`.
- Writes a custom-format dump with `pg_dump -Fc` to
  `D:\backups\monitor` by default, named
  `monitor-YYYY-MM-DD_HHmm.dump` (the prefix derives from `-DbName`).
- Uses `PGPASSWORD` for the child process; the database URL is never passed on
  the command line.
- Fails the task when the dump is empty, so a silent backup gap is visible.
- Deletes dumps older than 14 days; override with `-RetainDays` on a manual
  run.

Run a backup manually when needed:

```powershell
powershell -ExecutionPolicy Bypass -File .\deploy\windows\Backup-Database.ps1 `
  -BackupDir D:\backups\monitor
```

There is no restore helper: restore is a manual `pg_restore`. The dump is
destructive to the current database, so verify the archive first and take a
fresh backup before starting.

```powershell
# List the archive contents before restoring.
# Vendor PG18 default path (matches Backup-Database.ps1); substitute your own
# installed path on an EDB PG16 host (e.g. C:\Program Files\PostgreSQL\16\bin\pg_restore.exe).
& 'C:\sites\seacrest\.vendor\pgsql18\bin\pg_restore.exe' `
  --list 'D:\backups\monitor\monitor-YYYY-MM-DD_HHmm.dump'

Stop-Service SeaMonitorApp,SeaMonitorPoller,SeaMonitorAlerts -Force

# Prompts for the barrier role password (the one in .env). --clean replaces objects.
# Vendor PG18 default path (matches Backup-Database.ps1); substitute your own
# installed path on an EDB PG16 host (e.g. C:\Program Files\PostgreSQL\16\bin\pg_restore.exe).
& 'C:\sites\seacrest\.vendor\pgsql18\bin\pg_restore.exe' `
  -U barrier -h localhost -p 5432 -d monitor --clean --if-exists `
  'D:\backups\monitor\monitor-YYYY-MM-DD_HHmm.dump'

Start-Service SeaMonitorApp,SeaMonitorAlerts
if ((Get-Service SeaMonitorPoller).StartType -ne 'Disabled') {
  Start-Service SeaMonitorPoller
}
Invoke-RestMethod http://127.0.0.1:8300/api/ready
```

If unsure, restore into a scratch database first and inspect it. Then repeat
the restore against `monitor`. Finally run `Test-BarrierHealth.ps1`.

### Uninstall

`Uninstall-Production.ps1` stops and removes the prefixed services
(SeaMonitorApp, SeaMonitorPoller, SeaMonitorAlerts, SeaMonitorCaddy by default),
removes the monitor firewall rules and
the BarrierBackup task, then exits. Code, database, PostgreSQL, Deno, tools and
backup files stay in place, so re-running setup restores the install.

```powershell
powershell -ExecutionPolicy Bypass -File .\deploy\windows\Uninstall-Production.ps1
```

Opt-in switches are:

- `-RemoveCode` deletes the install directory, including logs.
- `-RemoveDatabase` takes a final backup, asks for the database name, and drops
  the database (default `monitor`); it also requires `-PostgresSuperPassword`.

## Docker Compose path

### Install

1. Install Docker Engine and Compose v2 on the host.
2. Copy the repository to the host and create `.env`:

```bash
cp .env.example .env
```

Set `PUBLIC_API_MODE=http`, a strong `POSTGRES_PASSWORD`, and the upstream CMMS
and alert provider settings. The bundled database credentials have dev-only
defaults.

3. Run the production guard, then build, migrate and start:

```bash
sh deploy/check-compose-prod.sh .env
docker compose build
docker compose run --rm tools deno run -A scripts/migrate.ts
docker compose up -d
```

`check-compose-prod.sh` fails closed when `POSTGRES_PASSWORD` is unset, still
the dev default, shorter than 16 characters, or when the app/database ports in
`compose.yml` are no longer loopback-bound.

The stack has these services:

- `db`: PostgreSQL 18-alpine with the named volume `pgdata`.
- `app`: the dashboard and API image, published on `127.0.0.1:8300`.
- `poller`: the upstream sync loop. Without upstream credentials it exits and
  the restart policy retries; it needs `FRACTTAL_KEY`/`FRACTTAL_SECRET`.
- `alerts`: the scheduled alert delivery loop. Without a provider token it
  performs detection and reporting only.
- `tools`: a one-off profile for migrations, seeding and imports; `compose up`
  does not start it.

The bundled database publishes `127.0.0.1:5432` so host-side migrations and
tools can reach it. Containers use hostname `db` and container port 5432 via
`DATABASE_URL_DOCKER`. Compose has no built-in scheduled backup; see below.

For an external database, set `DATABASE_URL_DOCKER` to its URL and clear the
bundled `db` dependency:

```bash
docker compose -f compose.yml -f compose.external.yml up -d --force-recreate app poller alerts
```

The external override also maps `host.docker.internal`, which Linux needs
explicitly. Without it, `up app` would still start the bundled Postgres and
take the host loopback port.

For live-source development, `deno task docker:dev` runs
`compose.yml` plus `compose.dev.yml` with Vite HMR and watched workers. The dev
override maps 8300 on all host interfaces; production keeps the loopback bind.

### Update

Replace or pull the code, then rebuild, migrate and recreate the app workers:

```bash
docker compose build
docker compose run --rm tools deno run -A scripts/migrate.ts
docker compose up -d --force-recreate app poller alerts
docker compose ps
```

Migrations are idempotent. Recreating `db` is not part of an update; the named
volume persists across `up` and `down`.

### Health and logs

- `docker compose ps` shows container state.
- The `app` healthcheck calls `/api/ready`, so a broken database URL fails the
  healthcheck instead of looking healthy.
- `docker compose logs -f app poller alerts` follows logs.
- `curl -s http://localhost:8300/api/health` checks process liveness;
  `curl -s http://localhost:8300/api/ready` checks the database round-trip.

Compose publishes both 8300 and 5432 on the host loopback. It does not open
host firewall ports. To serve users on a LAN, put a TLS reverse proxy in front
of 8300; do not bind the app to all interfaces.

### Backup and restore

There is no scheduled backup in the compose stack. Take a custom-format dump
from the `db` container and copy it out; restore with `pg_restore`.

```bash
docker compose exec db pg_dump -U barrier -Fc -f /tmp/barreiras.dump barreiras
docker compose cp db:/tmp/barreiras.dump ./barreiras.dump

docker compose stop app poller alerts
docker compose cp ./barreiras.dump db:/tmp/barreiras.dump
docker compose exec db pg_restore -U barrier -d barreiras --clean --if-exists /tmp/barreiras.dump
docker compose start app poller alerts
```

Schedule these commands with the host's own scheduler and keep the dump files
outside the repository. `docker compose down` keeps the `pgdata` volume;
`docker compose down -v` deletes all database data.

### Uninstall

```bash
docker compose down
```

This keeps the `pgdata` volume and the code. Use `docker compose down -v` only
when the database can be destroyed. Remove `.env` and any local secrets when
decommissioning the host.

A PostgreSQL major-version upgrade inside the container is not a normal
update; dump, recreate the volume, and restore with the procedure above.

## Troubleshooting

- **Setup aborts on firewall**: Caddy is enabled but no `-AllowedLanRanges`
  was passed. Add the office/VPN ranges, or use `-SkipFirewall` and document the
  exception.
- **Setup asks for a Postgres superuser password**: an existing PostgreSQL 16
  cluster was found. Persist `POSTGRES_SUPER_PASSWORD` at User or Machine scope
  and start an elevated session, or answer the interactive prompt. Do not pass
  `-PostgresSuperPassword` on the command line: setup rejects CLI secrets to
  keep them out of process lists and shell history.
- **doctor fails**: fix `DATABASE_URL` and `ADMIN_TOKEN` in `.env`, then run
  `deno task doctor` again. Setup fails hard on doctor errors.
- **SeaMonitorApp is stopped**: check `logs\SeaMonitorApp-err.log`, confirm port 8300
  is free, and confirm `.env` is readable by the service account. Re-run setup
  to re-register services.
- **Dashboard loads but data fails**: call `/api/ready`. A 503 points at the
  database or boot configuration, not at the frontend.
- **No certificate for the hostname**: confirm the DNS A record, that clients
  and the ACME challenge can reach ports 80 and 443, and check
  `logs\SeaMonitorCaddy-err.log`. Caddy retries automatically after DNS is fixed.
- **SeaMonitorPoller is disabled or restarting**: `.env` has no upstream
  credentials. Add them, then set the service back to Automatic and start it.
- **Alerts do not send**: delivery uses the alert provider API, not a local
  mail server. Add the provider token; without it the loop only detects and
  reports.
- **Backup task fails or the health check warns**: confirm `D:\backups` exists
  and SYSTEM can write it, and that the vendorized PG18 `pg_dump.exe` is present at `C:\sites\seacrest\.vendor\pgsql18\bin`.
  Run `Backup-Database.ps1` manually to see the error.
- **Compose guard fails**: set a unique `POSTGRES_PASSWORD` of at least 16
  characters, or use an external database with `DATABASE_URL_DOCKER`.
- **Compose cannot bind 5432**: another PostgreSQL is using the host port.
  Stop it, change `POSTGRES_PORT`, or use `compose.external.yml`.
- **8300 is unreachable from another PC on native Windows**: this is intended;
  it is a loopback port. Use the Caddy URL. Only the dev compose override
  publishes 8300 on all interfaces.
- **Uninstall left data behind**: code and database removal are opt-in by
  design. Use `-RemoveCode` and `-RemoveDatabase`, or the compose volume
  commands above.

## See also

- [Windows acceptance checklist (unexecuted)](../deploy/windows/ACCEPTANCE.md)
- [Port map](./PORT-MAP.md)
- [Architecture](./ARCHITECTURE.md)
- [Database](./DATABASE.md)
- [API](./API.md)
