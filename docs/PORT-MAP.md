# PORT MAP

Inventory of every network port this project touches: inbound listeners, Docker published ports, outbound dependencies, dev/test tooling.

Scope: tracked sources plus live runtime. Excludes `.git/`, `node_modules/`, `_fresh/`, `deno.lock`.

## 1. Quick reference

| Port | Proto | Direction | What | Bound |
| --- | --- | --- | --- | --- |
| 8300 | TCP | Inbound | App HTTP (prod) | `deno serve` default, all interfaces |
| 5173 | TCP | Inbound | App HTTP (dev/HMR) | Vite; `0.0.0.0` in Docker |
| 5432 | TCP | Outbound | PostgreSQL | `DATABASE_URL` host |
| 587 | TCP | Outbound | SMTP submission (STARTTLS) | `OPS_SMTP_PORT` default |
| 465 | TCP | Outbound | SMTP implicit TLS | selected when `OPS_SMTP_PORT=465` |
| 443 | TCP | Outbound | Fracttal API + Google Fonts | implicit, no port in URL |
| 9333 | TCP | Inbound (loopback) | CDP for `browser-smoke.ts` | Chrome, `127.0.0.1` |
| 9336 | TCP | Inbound (loopback) | CDP for `browser-capture.ts` | Chrome, `127.0.0.1` |

Only two ports are published to the host: 8300 (prod) and 5173 (dev). The rest are outbound or loopback dev tooling.

## 2. Run modes and ports

Port is never written in TypeScript; the runner decides it.

| Mode | Command | Server | Port | Bind |
| --- | --- | --- | --- | --- |
| Local dev | `deno task dev` | Vite HMR | 5173 | loopback (host) / `0.0.0.0` (Docker) |
| Local prod-like | `deno task preview` | `deno serve` | 8300 | all interfaces |
| Local prod | `deno task start` | `deno serve --env-file=.env` | 8300 | all interfaces |
| Docker prod | `deno task docker:up` | `deno serve` in container | 8300 | published `0.0.0.0:8300` |
| Docker dev | `deno task docker:dev` | Vite HMR in container | 5173 | published `0.0.0.0:5173` (+ inert 8300) |

Evidence: `deno.jsonc` uses `deno serve` (8300 default) and Vite (5173 default); `vite.config.ts` has no `server.port`; `compose.dev.yml` passes `--port 5173`. No `Deno.serve()`/`listen()`/`serve()` in source; no `PORT` env var (only `OPS_SMTP_PORT`).

Client is port-agnostic: `PUBLIC_API_BASE_URL` empty, `routes/index.tsx` falls back to `url.origin`.

## 3. Inbound ports

### 3.1 Port 8300 (prod app)
`deno serve` Fresh 2 bundle; all interfaces; `EXPOSE 8300`; publish `"8300:8300"`; healthcheck `http://localhost:8300/api/health`.

### 3.2 Port 5173 (dev app with HMR)
Vite + Fresh plugin; loopback by default, `0.0.0.0` in Docker via `--host`; publish `"5173:5173"`; browser tools default to `http://localhost:5173/`. Most duplicated port (11 locations).

### 3.3 Ports 9333 / 9336 (CDP)
Dev-only. Each script spawns headless Chrome and polls `/json/list`. Distinct ports allow concurrent run. Chrome binds `127.0.0.1`. Never published.

| Script | Port | Profile dir |
| --- | --- | --- |
| `scripts/browser-smoke.ts` | 9333 | `/tmp/opencode/chrome-profile` |
| `scripts/browser-capture.ts` | 9336 | `/tmp/opencode/chrome-capture` |

### 3.4 Non-listening services
`poller`, `alerts`, `tools` have no `ports:` or `EXPOSE`; outbound-only. `docker ps` shows `8300/tcp` as inherited metadata.

## 4. Outbound ports

### 4.1 Port 5432 (PostgreSQL)
Driver `@db/postgres`; code default 5432 when DSN omits port; live `.env` points at remote IP. Bundled `db` service (`postgres:18-alpine`, volume `pgdata`) available in compose. Pool size 10 (lazy), 1 for scripts. TLS for non-loopback hosts without `sslmode=disable`. DB not required to boot; `/api/health` never loads config, so container passes healthcheck even with broken DB.

### 4.2 Ports 587 / 465 (SMTP)
Raw socket, hand-rolled SMTP. 465 is a sentinel for implicit TLS; other ports use plain + STARTTLS if advertised. Defaults 587. Two resolvers read same env vars: `smtpAlertConfigFromEnv()` (digests) and `smtpConfigFromEnv()` (ops mail). Outbound SMTP triggered from status PATCH routes, alert digest loop, and poller failure notifier; best-effort.

### 4.3 Port 443 (HTTPS upstreams)
All implicit 443: `https://app.fracttal.com/api` (data), `https://one.fracttal.com/oauth/token` (OAuth2), `https://fonts.googleapis.com`, `https://fonts.gstatic.com`. Fracttal client has 15s timeout, 3 retries, 401 refresh, 406/429 backoff, adaptive token bucket. Fracttal is never called from route handlers.

## 5. Docker port mapping

### 5.1 `compose.yml` (prod)
| Service | Published ports | Healthcheck |
| --- | --- | --- |
| db | `5432:5432` | yes, `pg_isready` |
| app | `8300:8300` | yes, `localhost:8300` |
| poller | none | no |
| alerts | none | no |
| tools | none (profile gated) | no |

Project name `barrier-monitor`; network `barrier-monitor_default`; restart `unless-stopped` on app/poller/alerts. All on implicit default bridge; services declare `depends_on: db` health gate.

### 5.2 `compose.dev.yml` (dev override)
| Service | Published ports | Notes |
| --- | --- | --- |
| app | `5173:5173` | healthcheck disabled |
| poller | none | `--watch` |
| alerts | none | `--watch` |

Named volumes: `pgdata`, `deno-dir` (real name `barrier-monitor_deno-dir`). Anonymous volumes `/app/node_modules`, `/app/_fresh` protect image deps and bundle. `tools` keeps prod definition.

### 5.3 Merged dev stack publishes both ports
Compose appends unique port entries, so dev stack publishes inert 8300 plus live 5173; production publishes one port.

### 5.4 Live runtime state
Production stack up and healthy: `app` binds `0.0.0.0:8300`; workers show `8300/tcp` as metadata only.

## 6. Route to port/service matrix

26 API paths (35 method+path combos) plus 2 page routes. Every `/api/*` except `/api/health` opens Postgres on 5432. None contact Fracttal. SMTP only on status PATCH routes.

| Route | Method(s) | Postgres | SMTP |
| --- | --- | --- | --- |
| `/api/health` | GET | no | no |
| `/api/barriers` | GET | yes | no |
| `/api/barriers/deleted` | GET | yes | no |
| `/api/barriers/:id` | GET, PATCH | yes | PATCH only |
| `/api/barriers/:id/status` | PATCH | yes | yes |
| `/api/barriers/:id/sync-detail` | GET | yes | no |
| `/api/export` | GET, POST | yes | no |
| `/api/kpi` | GET | yes | no |
| `/api/chart` | GET | yes | no |
| `/api/vocabularies` | GET | yes | no |
| `/api/lookups` | GET | yes | no |
| `/api/field-options` | GET, PUT | yes | no |
| `/api/sync-status` | GET | yes | no |
| `/api/sync-runs` | GET | yes | no |
| `/api/sync-changes` | GET | yes | no |
| `/api/users` | GET, POST | yes | no |
| `/api/users/:id` | PATCH, DELETE | yes | no |
| `/api/recipients` | GET, POST | yes | no |
| `/api/recipients/:id` | PATCH, DELETE | yes | no |
| `/api/alert-rules` | GET, POST | yes | no |
| `/api/alert-rules/preview` | GET | yes | no |
| `/api/alert-rules/:id` | PATCH, DELETE | yes | no |
| `/api/auth/login` | POST | yes | no |
| `/api/auth/logout` | POST | yes | no |
| `/api/auth/me` | GET | yes | no |
| `/api/auth/password` | POST | yes | no |
| `/` (page) | GET | yes | no |
| `/login` (page) | GET | yes | no |

No `_middleware.ts`; auth is per route. `/api/health` is a pure liveness probe. In `http` mode page route calls `/api/barriers` back over HTTP on the serving port.

## 7. Long-lived and streaming traffic

No SSE, EventSource, or application WebSocket. Only WebSocket clients are CDP connections in the two browser scripts.

`GET|POST /api/export` returns a chunked `ReadableStream` (CSV/XLSX/PDF) on 8300/5173, 5,000-row DB batches.

### Client polling cadence

| Consumer | Interval | Endpoint |
| --- | --- | --- |
| Header connection dot | 5 s | `/api/health` |
| Dashboard data refresh | 300 s | data + `/api/vocabularies` |
| Sync pill (idle) | 60 s | `/api/sync-status` |
| Sync pill (syncing) | 15 s | `/api/sync-status` |
| Sync hover card | 60 s | `/api/sync-changes?limit=8` |

Same-origin; pauses on hidden tabs.

### Background loop cadence

| Loop | Default | Min | Env var |
| --- | --- | --- | --- |
| Fracttal poller | 300 s | 5 s | `FRACTTAL_POLL_SECONDS` |
| Alert digest | 900 s | 60 s | `ALERTS_POLL_SECONDS` |

## 8. Per-service network summary

| Component | Listens | Postgres | Fracttal | SMTP | Fonts |
| --- | --- | --- | --- | --- | --- |
| app (8300/5173) | 8300/5173 | yes (except health) | no | yes (immediate rule match) | yes (browser) |
| poller | nothing | yes | yes | yes (failure only) | no |
| alerts | nothing | yes | no | yes (digests) | no |
| tools | nothing | yes | yes (sync/audit/import) | no | no |
| browser-capture.ts | 9336 | no | no | no | no |
| browser-smoke.ts | 9333 | no | no | no | no |

## 9. Env vars affecting networking

| Variable | Default | Affects |
| --- | --- | --- |
| `DATABASE_URL` | none (throws in http mode) | Postgres host + port (default 5432) |
| `PUBLIC_API_MODE` | `mock` | mock vs http adapter |
| `PUBLIC_API_BASE_URL` | `""` = same-origin | browser to API origin (port-agnostic) |
| `FRACTTAL_BASE_URL` | `https://app.fracttal.com/api` | Fracttal data host |
| `FRACTTAL_KEY` / `FRACTTAL_SECRET` | none (throws) | OAuth2 client credentials |
| `OPS_SMTP_HOST` / `MAIL_HOST` | none (throws) | SMTP host |
| `OPS_SMTP_PORT` | 587 | SMTP port; 465 = implicit TLS |
| `OPS_SMTP_USER` / `MAIL_USER` | - | SMTP AUTH |
| `OPS_SMTP_PASS` / `MAIL_PASS` | - | SMTP AUTH |
| `OPS_EMAIL_TO` | none (null config) | required for ops-failure mail |
| `OPS_EMAIL_FROM` | falls back to user | `MAIL FROM` |
| `DENO_DIR` | `/deno-dir` (image) | cache volume, dev only |
| `CHROME_BIN` | chrome path | Chrome binary (not a port) |

`deno task test` is the only task with scoped net permission (`127.0.0.1,localhost`); integration tests self-skip when `DATABASE_URL` unset. Other tasks run `-A`.

## 10. Changing a port checklist

App port 8300 to N (5 files): `Dockerfile` EXPOSE; `compose.yml` publish + healthcheck URL; `deno.jsonc` start task `--port N`; docs (`compose.yml` comment, readme, `docs/API.md`). Systemd deployment also needs the new port in unit file.

Dev port 5173 to N (9 locations): `compose.dev.yml` (comment, `--port`, publish); `scripts/browser-capture.ts` default target; `scripts/browser-smoke.ts` default target; `.env` commented example; readme and `docs/ARCHITECTURE.md`.

SMTP port: set `OPS_SMTP_PORT`; 465 implicit TLS, else plain + STARTTLS. No code change. DB port: change inside `DATABASE_URL`; code default 5432 only applies when DSN omits port. CDP ports: `browser-smoke.ts` 9333 and `browser-capture.ts` 9336; keep distinct for concurrent runs.

## 11. Findings

1. `compose.dev.yml` leaks host port 8300: Compose appends unique port entries, so dev stack publishes inert 8300 plus live 5173. Fix with `ports: !override ["5173:5173"]` (Compose >= 2.24.4).
2. Two SMTP resolvers disagree on empty port: `mailer.ts` uses `|| 587` (empty becomes 587); `notify.ts` uses `?? 587` (empty becomes `Number("")` = 0). Empty `OPS_SMTP_PORT=` yields port 0 on ops-failure path. Fix `??` to `||`.
3. App binds `0.0.0.0:8300` with no reverse proxy: terminate TLS in front. Session cookie marked Secure when request is https or `APP_BASE_URL` starts https. `routeClientKey` keys rate limits on `remoteAddr`, never `X-Forwarded-For`, so behind a proxy all clients share one bucket.
4. No readiness probe: `/api/health` never touches Postgres; container reports healthy with unreachable DB. No `/ready` endpoint.
5. Single remote Postgres is hard, unprotected dependency: public IP, plaintext password in git-ignored `.env`, no local fallback in compose.
6. `8300/tcp` appears in `docker ps` for workers as inherited `EXPOSE` metadata, not a listener.
7. `browser-smoke.ts` hardcodes an arm64 Chrome path and ignores `CHROME_BIN`; `browser-capture.ts` honours it. Both scripts are loopback-only and will not run in a container.
8. Live secrets in working tree: `.env` holds real credentials; readable via `docker inspect` and `docker compose config`.

## 12. Negative findings (verified absent)

No `PORT` env var; no `Deno.serve()`/`listen()`/`serve()` call; no `server.port` in `vite.config.ts`; no reverse proxy in repo; no SSE/`EventSource`; no app WebSocket; no CI port matrix; no ports in statuses/glossary/todo/agents/fixtures; only browser scripts contain port literals.