# Deploy on Windows Server 2022 / 2025

Supported target: Windows Server 2022/2025, 64-bit, native (no Docker). Docker is available but not recommended.

## Paths

- A: Native (recommended): Deno + PostgreSQL 16 + NSSM + Caddy TLS.
- B: Docker via Hyper-V, only if required.

## Native path

Prerequisites: admin access, PostgreSQL 16 role/db, outbound 443 and 587/465, inbound 443, app on loopback 8300.

Minimum `.env`:

```ini
PUBLIC_API_MODE=http
DATABASE_URL=postgres://barrier:<pw>@localhost:5432/barreiras?sslmode=disable
ADMIN_TOKEN=<64 hex>
COMPANY_NAME=...
APP_BASE_URL=https://...
```

One-command install:

```powershell
mkdir C:\srv\barrier-monitor; cd C:\srv\barrier-monitor
Invoke-WebRequest https://github.com/ORG/REPO/archive/refs/heads/master.zip -OutFile repo.zip
Expand-Archive repo.zip .; Copy-Item repo-master\* . -Recurse -Force
.\deploy\windows\Setup.cmd -Hostname barreiras.example.com -CompanyName "..." -AdminEmail you@example.com
```

`Setup.cmd` is idempotent and runs migrations, services, firewall and smoke tests. Re-run to update without rotating `.env`.

See `docs/WINDOWS-SERVER-START-HERE.md` for beginner instructions.
