# PORT MAP

Complete inventory of every network port this project touches — inbound
listeners, Docker published ports, outbound dependencies, and the dev/test
tooling ports.

**Scope:** all tracked sources (`*.ts`, `*.tsx`, `*.js`, `*.jsonc`, `*.yml`,
`Dockerfile`, `.env`, `.env.example`, `docs/`, `readme.md`) plus the live
runtime state of the running stack. Excludes `.git/`, `node_modules/`, the
`_fresh/` build output, and `deno.lock`.

---

## 1. Quick reference

| Port     | Proto | Direction          | What it is                                      | Where it's bound                     |
| -------- | ----- | ------------------ | ----------------------------------------------- | ------------------------------------ |
| **8000** | TCP   | **Inbound**        | App HTTP server (production)                    | `deno serve` default, all interfaces |
| **5173** | TCP   | **Inbound**        | App HTTP server (dev / HMR)                     | Vite, `--host` → `0.0.0.0` in Docker |
| **5432** | TCP   | Outbound           | PostgreSQL                                      | `DATABASE_URL` host                  |
| **587**  | TCP   | Outbound           | SMTP submission (STARTTLS)                      | `OPS_SMTP_PORT` default              |
| **465**  | TCP   | Outbound           | SMTP implicit TLS                               | Selected when `OPS_SMTP_PORT=465`    |
| **443**  | TCP   | Outbound           | Fracttal API + Google Fonts                     | Implicit, no port in any URL         |
| **9333** | TCP   | Inbound (loopback) | Chrome DevTools Protocol — `browser-smoke.ts`   | Chrome, `127.0.0.1`                  |
| **9336** | TCP   | Inbound (loopback) | Chrome DevTools Protocol — `browser-capture.ts` | Chrome, `127.0.0.1`                  |

**Only two ports are ever published to the host: 8000 (prod) and 5173 (dev).**
Everything else is outbound or loopback-only dev tooling.

---

## 2. Run modes and their ports

Five ways to boot. The port is **never written in TypeScript** — it is decided
entirely by which runner starts the process.

| Run mode        | Command                | Server                       | Port     | Bind                                    |
| --------------- | ---------------------- | ---------------------------- | -------- | --------------------------------------- |
| Local dev       | `deno task dev`        | Vite HMR                     | **5173** | loopback (host) / `0.0.0.0` (Docker)    |
| Local prod-like | `deno task preview`    | `deno serve`                 | **8000** | all interfaces                          |
| Local prod      | `deno task start`      | `deno serve --env-file=.env` | **8000** | all interfaces                          |
| Docker prod     | `deno task docker:up`  | `deno serve` in container    | **8000** | published `0.0.0.0:8000`                |
| Docker dev      | `deno task docker:dev` | Vite HMR in container        | **5173** | published `0.0.0.0:5173` (+ inert 8000) |

Evidence that the port is implicit:

- `deno.jsonc:15` — `"start": "deno serve --env-file=.env -A _fresh/server.js"`
  → no `--port` flag, so `deno serve` uses its **8000** default.
- `deno.jsonc:14` — `"preview": "deno serve -A _fresh/server.js"` → same.
- `deno.jsonc:12` — `"dev": "vite"` → no port configured.
- `vite.config.ts:6-8` — `defineConfig({ plugins: [fresh()] })` — **no
  `server.port` key**, so Vite's own **5173** default applies.
- `compose.dev.yml:18` — the only place a port is passed explicitly:
  `["task", "dev", "--host", "--port", "5173"]`.
- There is **no `Deno.serve()`, no `listen()`, no `serve()` call anywhere in
  the source tree.** The listening socket is created by the Fresh-generated
  `_fresh/server.js`, invoked via `deno serve`.

### Consequences of the implicit port

- **There is no `PORT` env var.** Neither `PORT`, `SERVER_PORT`, `APP_PORT`,
  `VITE_PORT`, nor `PGPORT` exists anywhere in the repo. `OPS_SMTP_PORT` is
  the _only_ env var whose name contains "PORT".
- To change the app port you must edit the runner, not the app.
- The client is port-agnostic: `PUBLIC_API_BASE_URL` is empty in `.env`, and
  `routes/index.tsx:48` falls back to `url.origin`, so the browser always
  calls back the origin it was served from. The app works unchanged on
  8000 or 5173.

---

## 3. Inbound (listening) ports

### 3.1 Port 8000 — production app

| Item               | Value                                    | Source                                               |
| ------------------ | ---------------------------------------- | ---------------------------------------------------- |
| Server             | `deno serve` (Fresh 2 production bundle) | `deno.jsonc:15`                                      |
| Bind               | `deno serve` default — all interfaces    | implicit                                             |
| `EXPOSE`           | `EXPOSE 8000`                            | `Dockerfile:19`                                      |
| Docker publish     | `"8000:8000"`                            | `compose.yml:24`                                     |
| Healthcheck target | `http://localhost:8000/api/health`       | `compose.yml:31`                                     |
| Docs               | `curl -s localhost:8000/api/health`      | `compose.yml:12`, `readme.md:141`, `docs/API.md:393` |

`deno serve` is started with full permissions (`-A`). `EXPOSE 8000` matches
the publish and the `deno serve` default.

### 3.2 Port 5173 — dev app with HMR

| Item                        | Value                                                                             | Source                                                          |
| --------------------------- | --------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| Server                      | Vite + `@fresh/plugin-vite`                                                       | `deno.jsonc:12`, `vite.config.ts:6`                             |
| Bind                        | Vite default = loopback on bare `deno task dev`; `0.0.0.0` in Docker via `--host` | `compose.dev.yml:16,18`                                         |
| Docker publish              | `"5173:5173"`                                                                     | `compose.dev.yml:27`                                            |
| Browser tool default target | `http://localhost:5173/`                                                          | `scripts/browser-capture.ts:9`, `scripts/browser-smoke.ts:6,11` |
| Docs                        | `http://localhost:5173/login`                                                     | `readme.md:121,124,148`, `docs/ARCHITECTURE.md:31`              |

`5173` is the **most duplicated port in the repo** (11 locations) and the most
likely to drift — see the change checklist in §10.

### 3.3 Ports 9333 / 9336 — Chrome DevTools Protocol

Both dev-only. Each script spawns its own headless Chrome and polls
`/json/list` before opening a CDP WebSocket. The two ports are deliberately
distinct so capture and smoke can run concurrently.

| Script                       | CDP port | Spawn flag                             | Probe                                     | Profile dir                            |
| ---------------------------- | -------- | -------------------------------------- | ----------------------------------------- | -------------------------------------- |
| `scripts/browser-smoke.ts`   | **9333** | `--remote-debugging-port=9333` (`:51`) | `http://127.0.0.1:9333/json/list` (`:63`) | `/tmp/opencode/chrome-profile` (`:13`) |
| `scripts/browser-capture.ts` | **9336** | `--remote-debugging-port=9336` (`:33`) | `http://127.0.0.1:9336/json/list` (`:45`) | `/tmp/opencode/chrome-capture` (`:34`) |

Both poll 50 × 200 ms (10 s max) waiting for Chrome to come up, then kill the
process in a `finally`. Chrome binds `127.0.0.1` by default. Neither port is
ever published or exposed outside the host.

### 3.4 Services that do NOT listen

`poller`, `alerts`, and `tools` have **no `ports:` and no `EXPOSE`** in either
compose file. They are outbound-only workers — they open connections to
Postgres, Fracttal, and SMTP and never accept any. Note that `docker ps` shows
`8000/tcp` for `poller` and `alerts`; that is inherited image metadata from
`Dockerfile:19`, not a live listener.

---

## 4. Outbound (dependency) ports

### 4.1 Port 5432 — PostgreSQL

| Item           | Value                                                    | Source                                             |
| -------------- | -------------------------------------------------------- | -------------------------------------------------- |
| Driver         | `@db/postgres@^0.19.5` (`Pool`, no ORM)                  | `deno.jsonc:48`, `lib/server/db.ts:5`              |
| Code default   | `port: url.port === "" ? 5432 : Number(url.port)`        | `lib/server/db.ts:33`                              |
| Live `.env`    | `postgres://seacrest:****@167.234.249.7:5432/automation` | `.env:44`                                          |
| `.env.example` | `postgres://user:password@localhost:5432/barreiras`      | `.env.example:35`                                  |
| Pool size      | 10 (lazy), 1 for scripts                                 | `lib/server/db.ts:39,44`; `scripts/migrate.ts:115` |

**No PostgreSQL service exists in this repository.** There is no `postgres`
image, no DB `depends_on`, and no DB volume in either compose file. The DB is
external — `docs/DATABASE.md:11` tells the operator to start one themselves
("local, Docker, RDS, Supabase, whatever you prefer"). The bundled `db`
service (`postgres:18-alpine`, named volume `pgdata`, health-gated) is the
default: host runs reach it at `localhost:${POSTGRES_PORT:-5432}`,
containers as hostname `db` via `DATABASE_URL_DOCKER`.

**TLS behaviour** (`lib/server/db.ts:57-70`): TLS is attempted for any host
that is not `localhost` / `127.0.0.1` / `::1` / `[::1]` and has no
`sslmode=disable` in the query string. The live `.env` value is a remote IP
with no `sslmode`, so **every connection attempts a TLS handshake first**.

**Is `DATABASE_URL` required to boot?** No — the pool is lazy
(`lib/server/db.ts:83-91`) and `loadServerConfig()` runs _per API request_,
not at process start. But with `PUBLIC_API_MODE=http` and no
`DATABASE_URL`, `loadServerConfig` throws (`lib/server/config.ts:31-36`) and
every `/api/*` route returns a 500 naming the variable. `/api/health` never
loads config, so **the container boots and passes its healthcheck even with a
completely broken or unreachable database.**

### 4.2 Ports 587 / 465 — SMTP relay

| Item                    | Value                                                     | Source                                        |
| ----------------------- | --------------------------------------------------------- | --------------------------------------------- |
| Client                  | Raw socket, hand-rolled SMTP (not `fetch`)                | `lib/server/fracttal/smtp.ts`                 |
| Implicit TLS            | `Deno.connectTls({ hostname, port })`                     | `smtp.ts:35`                                  |
| Plain + STARTTLS        | `Deno.connect({ hostname, port })` → `Deno.startTls(...)` | `smtp.ts:36,39`                               |
| Port default (alerts)   | `Number(get("OPS_SMTP_PORT")) \|\| 587`                   | `lib/server/alerts/mailer.ts:64`              |
| Port default (ops mail) | `Number(get("OPS_SMTP_PORT") ?? 587)`                     | `lib/server/fracttal/notify.ts:80`            |
| 465 rule                | `secure: port === 465` / `config.port === 465`            | `mailer.ts:68`, `notify.ts:85`, `smtp.ts:328` |
| Live `.env`             | `OPS_SMTP_HOST=smtp.gmail.com`, `OPS_SMTP_PORT=587`       | `.env:88-89`                                  |
| Defaults in template    | 587; presets for Gmail and Office365                      | `.env.example:81,88-89,95-96`                 |

**465 is a sentinel, not a normal port.** The value is never used to decide
"implicit TLS vs STARTTLS" by convention — it is a hard-coded equality check
in three places. Any port other than 465 opens a plaintext socket and upgrades
only if the server advertises STARTTLS (`smtp.ts:340-346`).

Two independent resolvers read the same env vars: `smtpAlertConfigFromEnv()`
(alert digests + immediate fan-out) and `smtpConfigFromEnv()` (sync-failure
ops mail). They have different defaults for `from` and a divergent port parse
— see §11.2.

Outbound SMTP is triggered from exactly two places, both best-effort inside
`try`/`catch` so a missing relay degrades to enqueue-only:
`routes/api/barriers/[id]/status.ts:157` and `routes/api/barriers/[id].ts:235`
(immediate rule matches), plus the `alerts` digest loop
(`scripts/alerts-poll.ts`) and the poller's failure notifier.

### 4.3 Port 443 — HTTPS upstreams

All HTTPS; **no port appears in any URL**, so all of these are implicit 443.

| Target                                 | Purpose                                               | Source                                                                                                                                                                  |
| -------------------------------------- | ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `https://app.fracttal.com/api`         | Fracttal data API (items, work orders, work requests) | `lib/server/config.ts:60`; `scripts/fracttal-poll.ts:69`, `fracttal-sync.ts:45`, `fracttal-force-sync.ts:38`, `fracttal-audit-stations.ts:32`, `fracttal-capture.ts:20` |
| `https://one.fracttal.com/oauth/token` | OAuth2 client-credentials token                       | `lib/server/fracttal/client.ts:28`                                                                                                                                      |
| `https://fonts.googleapis.com`         | Inter Tight / JetBrains Mono / Inter CSS              | `routes/_app.tsx:49,62`                                                                                                                                                 |
| `https://fonts.gstatic.com`            | Font files                                            | `routes/_app.tsx:52`                                                                                                                                                    |

The Fracttal client applies a 15 s `AbortController` timeout, 3 retries,
one-shot 401 refresh, 406/429 backoff honouring `ratelimit-reset`, and an
adaptive token bucket (initial 180, max 190, burst 10; see
`adaptive-rate.ts`).

**Fracttal is never contacted from a route handler.** The only `fracttal`
imports inside `routes/` are the SMTP notifier. All Fracttal traffic comes
from the `poller` service and the `tools` one-offs.

---

## 5. Docker port mapping

### 5.1 `compose.yml` (production)

| Service  | Image                                           | Command                           | Published ports               | Healthcheck                      |
| -------- | ----------------------------------------------- | --------------------------------- | ----------------------------- | -------------------------------- |
| `db`     | `postgres:18-alpine` (bundled, `pgdata` volume) | — (no command)                    | **`5432:5432`** (host-mapped) | yes, `pg_isready`                |
| `app`    | `barrier-monitor:latest` (build `.`)            | image `CMD` → `deno task start`   | **`8000:8000`** (`:24`)       | yes, `localhost:8000` (`:26-36`) |
| `poller` | same                                            | `run -A scripts/fracttal-poll.ts` | **none**                      | no                               |
| `alerts` | same                                            | `run -A scripts/alerts-poll.ts`   | **none**                      | no                               |
| `tools`  | same                                            | image `CMD`, invoked explicitly   | **none**                      | no                               |

- Project name `barrier-monitor` (`compose.yml:13`) → network
  `barrier-monitor_default`, containers `barrier-monitor-app-1`,
  `-poller-1`, `-alerts-1`, `-tools-1`.
- `tools` is gated behind `profiles: ["tools"]` (`:68`) so `compose up` never
  starts it.
- `env_file: [.env]` and `./.env:/app/.env:ro` on the four app services
  (`db` only gets `POSTGRES_*` interpolation, never the full file).
- `restart: unless-stopped` on `app`/`poller`/`alerts`; not on `tools`.
- No `networks:`, `network_mode:`, or `expose:` in either file — everything
  is on the implicit default bridge. `app`/`poller`/`alerts`/`tools` declare
  `depends_on: db` with a health gate; no service talks to another over the
  network besides that gate.

### 5.2 `compose.dev.yml` (dev override)

| Service  | Command                                   | Published ports         | Volumes                                                             | Healthcheck             |
| -------- | ----------------------------------------- | ----------------------- | ------------------------------------------------------------------- | ----------------------- |
| `app`    | `task dev --host --port 5173`             | **`5173:5173`** (`:27`) | `./:/app`, `/app/node_modules`, `/app/_fresh`, `deno-dir:/deno-dir` | **disabled** (`:28-29`) |
| `poller` | `run --watch -A scripts/fracttal-poll.ts` | **none**                | same 4                                                              | no                      |
| `alerts` | `run --watch -A scripts/alerts-poll.ts`   | **none**                | same 4                                                              | no                      |

- Named volumes: `pgdata` (prod Postgres data — kept as a volume, never a
  bind mount, for Docker Desktop Windows compat) plus `deno-dir` (dev-only
  Deno cache, real name `barrier-monitor_deno-dir`).
- The anonymous volumes `/app/node_modules` and `/app/_fresh` stop the
  `./:/app` bind mount from hiding the image-installed deps and the
  build-time Fresh bundle.
- `tools` is not overridden, so it keeps its production definition.
- Docker Compose does not need the `deno` word in `command` because the
  official image's entrypoint `exec deno "$@"` for known deno verbs.

### 5.3 The merged dev stack publishes BOTH ports

`docker compose` merges `ports` as a **unique-resources sequence** (key =
`{ip, target, published, protocol}`): entries are appended, and the dev file's
`"5173:5173"` does not collide with the base file's `"8000:8000"`, so the base
mapping survives. Verified against the live Compose v5.5.1:

```
$ docker compose -f compose.yml -f compose.dev.yml config
  app:
    command: [task, dev, --host, --port, "5173"]
    ports:
      - {target: 8000, published: "8000", protocol: tcp}   # inherited, inert
      - {target: 5173, published: "5173", protocol: tcp}   # live
```

So `deno task docker:dev` binds host **5173 (live)** and host **8000 (dead)**.
Nothing in the container listens on 8000 in dev — the mapping accepts the TCP
connection and resets it. This is a real port leak; see §11.1.

Production, for contrast, publishes exactly one port:

```
$ docker compose -f compose.yml config
  app:
    ports: [{target: 8000, published: "8000", protocol: tcp}]
```

### 5.4 Current live runtime state

```
$ docker ps --format '{{.Names}}\t{{.Status}}\t{{.Ports}}'
barrier-monitor-app-1      Up 15 hours (healthy)  0.0.0.0:8000->8000/tcp, [::]:8000->8000/tcp
barrier-monitor-poller-1   Up 15 hours            8000/tcp
barrier-monitor-alerts-1   Up 15 hours            8000/tcp
```

The production stack is up and healthy. Note `app` binds **0.0.0.0:8000** —
it is reachable from anywhere that can route to this host, not just loopback.
`poller` and `alerts` show `8000/tcp` as inherited image metadata, not a
listener.

---

## 6. Route → port / service matrix

26 API route paths (35 method+path combos) plus 2 page routes. Every `/api/*` route except `/api/health`
opens a Postgres connection on 5432. None of them contact Fracttal.

| Route                           | Method(s)     | Postgres | SMTP           |
| ------------------------------- | ------------- | -------- | -------------- |
| `/api/health`                   | GET           | no       | no             |
| `/api/barriers`                 | GET           | yes      | no             |
| `/api/barriers/deleted`         | GET           | yes      | no             |
| `/api/barriers/:id`             | GET, PATCH    | yes      | **PATCH only** |
| `/api/barriers/:id/status`      | PATCH         | yes      | **yes**        |
| `/api/barriers/:id/sync-detail` | GET           | yes      | no             |
| `/api/export`                   | GET, POST     | yes      | no             |
| `/api/kpi`                      | GET           | yes      | no             |
| `/api/chart`                    | GET           | yes      | no             |
| `/api/vocabularies`             | GET           | yes      | no             |
| `/api/lookups`                  | GET           | yes      | no             |
| `/api/field-options`            | GET, PUT      | yes      | no             |
| `/api/sync-status`              | GET           | yes      | no             |
| `/api/sync-runs`                | GET           | yes      | no             |
| `/api/sync-changes`             | GET           | yes      | no             |
| `/api/users`                    | GET, POST     | yes      | no             |
| `/api/users/:id`                | PATCH, DELETE | yes      | no             |
| `/api/recipients`               | GET, POST     | yes      | no             |
| `/api/recipients/:id`           | PATCH, DELETE | yes      | no             |
| `/api/alert-rules`              | GET, POST     | yes      | no             |
| `/api/alert-rules/preview`      | GET           | yes      | no             |
| `/api/alert-rules/:id`          | PATCH, DELETE | yes      | no             |
| `/api/auth/login`               | POST          | yes      | no             |
| `/api/auth/logout`              | POST          | yes      | no             |
| `/api/auth/me`                  | GET           | yes      | no             |
| `/api/auth/password`            | POST          | yes      | no             |
| `/` (page)                      | GET           | yes      | no             |
| `/login` (page)                 | GET           | yes      | no             |

There is **no `_middleware.ts`** in the repo; auth is enforced per route.
`GET /api/health` (`routes/api/health.ts:6-11`) imports nothing from
`lib/server/*` — it is a pure liveness probe that answers even when Postgres
is down. It is the target of the Docker healthcheck, the 5-second browser
heartbeat, and the `curl` smoke check.

In `http` mode the page route calls `/api/barriers` back over HTTP through
`lib/api/http.ts:48` — a self-request that stays on whichever port served the
page (8000 or 5173).

---

## 7. Long-lived and streaming traffic

There is **no SSE, no `EventSource`, no `text/event-stream`, and no WebSocket**
in the application. The only two WebSocket clients are the CDP connections in
`scripts/browser-capture.ts:52` and `scripts/browser-smoke.ts:70`.

One server-to-client stream exists: `GET|POST /api/export` returns a
`ReadableStream<Uint8Array>` of chunked CSV, `.xlsx` bytes or PDF pages
(`routes/api/export.ts`, `lib/server/exportStream.ts` +
`lib/server/exportXlsx.ts` + `lib/server/exportPdf.ts`, one chunk per
5,000-row database batch). That is chunked transfer encoding on 8000/5173,
not a separate port or protocol.

### Client polling cadence

| Consumer               | Interval      | Endpoint                    | Source                                    |
| ---------------------- | ------------- | --------------------------- | ----------------------------------------- |
| Header connection dot  | 5 s           | `/api/health`               | `hooks/useConnection.ts:17,106-108`       |
| Dashboard data refresh | 300 s (5 min) | data + `/api/vocabularies`  | `hooks/dashboard/server.ts:335-354`       |
| Sync pill (idle)       | 60 s          | `/api/sync-status`          | `hooks/dashboard/sync-status.ts:50-53`    |
| Sync pill (syncing)    | 15 s          | `/api/sync-status`          | `islands/dashboard/DashboardView.tsx:152` |
| Sync hover card        | 60 s          | `/api/sync-changes?limit=8` | `hooks/dashboard/sync-changes.ts:44-47`   |

All of these are same-origin and pause on hidden tabs.

### Background loop cadence (not ports, but the outbound consumers)

| Loop            | Default | Min  | Env var                                                 |
| --------------- | ------- | ---- | ------------------------------------------------------- |
| Fracttal poller | 300 s   | 5 s  | `FRACTTAL_POLL_SECONDS` (`scripts/fracttal-poll.ts:87`) |
| Alert digest    | 900 s   | 60 s | `ALERTS_POLL_SECONDS` (`scripts/alerts-poll.ts:52`)     |

---

## 8. Per-service network summary

| Component            | Listens         | → Postgres 5432                   | → Fracttal 443          | → SMTP 587                   | → Fonts 443   |
| -------------------- | --------------- | --------------------------------- | ----------------------- | ---------------------------- | ------------- |
| `app` (8000 / 5173)  | **8000 / 5173** | yes, all routes but `/api/health` | no                      | yes, on immediate rule match | yes (browser) |
| `poller`             | nothing         | yes                               | yes                     | yes, on failure only         | no            |
| `alerts`             | nothing         | yes                               | no                      | yes, digests                 | no            |
| `tools`              | nothing         | yes                               | yes (sync/audit/import) | no                           | no            |
| `browser-capture.ts` | 9336 (Chrome)   | no                                | no                      | no                           | no            |
| `browser-smoke.ts`   | 9333 (Chrome)   | no                                | no                      | no                           | no            |

---

## 9. Env vars that affect networking

| Variable                           | Default                                   | Affects                              | Source                                              |
| ---------------------------------- | ----------------------------------------- | ------------------------------------ | --------------------------------------------------- |
| `DATABASE_URL`                     | none (throws in `http` mode)              | Postgres host + port (default 5432)  | `lib/server/config.ts:30`, `lib/server/db.ts:19,33` |
| `PUBLIC_API_MODE`                  | `mock`                                    | `mock` vs `http` adapter             | `lib/server/config.ts:29`                           |
| `PUBLIC_API_BASE_URL`              | `""` = same-origin                        | browser → API origin (port-agnostic) | `lib/api.ts:35`, `routes/index.tsx:48`              |
| `FRACTTAL_BASE_URL`                | `https://app.fracttal.com/api`            | Fracttal data host                   | `lib/server/config.ts:59-60`                        |
| `FRACTTAL_KEY` / `FRACTTAL_SECRET` | none (throws)                             | OAuth2 client credentials            | `lib/server/config.ts:48-49,50-54`                  |
| `OPS_SMTP_HOST` / `MAIL_HOST`      | none (throws)                             | SMTP host                            | `mailer.ts:57`, `notify.ts:77`                      |
| `OPS_SMTP_PORT`                    | `587`                                     | **SMTP port; 465 = implicit TLS**    | `mailer.ts:64`, `notify.ts:80`                      |
| `OPS_SMTP_USER` / `MAIL_USER`      | —                                         | SMTP AUTH                            | `mailer.ts:63`, `notify.ts:81`                      |
| `OPS_SMTP_PASS` / `MAIL_PASS`      | —                                         | SMTP AUTH                            | `mailer.ts:70`, `notify.ts:87`                      |
| `OPS_EMAIL_TO`                     | none (null config)                        | required for ops-failure mail        | `notify.ts:78-79`                                   |
| `OPS_EMAIL_FROM`                   | falls back to user                        | `MAIL FROM`                          | `mailer.ts:71`, `notify.ts:88`                      |
| `DENO_DIR`                         | `/deno-dir` (image default)               | cache volume, dev only               | `compose.dev.yml:24,39,50`                          |
| `CHROME_BIN`                       | `/tmp/opencode/.../chrome-headless-shell` | Chrome binary (not a port)           | `browser-capture.ts:17`                             |

`deno task test` is the only task with scoped net permission:
`--allow-net=127.0.0.1,localhost` (`deno.jsonc:11`), so integration tests
never reach the real network — they self-skip when `DATABASE_URL` is unset.
Every other task runs `-A`.

---

## 10. Changing a port — full checklist

### App port 8000 → N

Touches **5 files** because the port is never in TypeScript:

1. `Dockerfile:19` — `EXPOSE 8000`
2. `compose.yml:24` — `"8000:8000"`
3. `compose.yml:31` — the healthcheck fetch URL
4. `deno.jsonc:15` — add `--port N` to the `start` task
5. Docs — `compose.yml:12`, `readme.md:130,141`, `docs/API.md:393`

A systemd deployment (documented at `docs/API.md:417-448` and
`readme.md:660-661`) also needs the new port in the unit file.

### Dev port 5173 → N

Touches **9 locations** — the widest blast radius in the repo:

1. `compose.dev.yml:16` (comment), `:18` (`--port 5173`), `:27` (`"5173:5173"`)
2. `scripts/browser-capture.ts:9` — default target URL
3. `scripts/browser-smoke.ts:6` (comment), `:11` — default target URL
4. `.env:25` — commented example
5. `readme.md:121,124,148`, `docs/ARCHITECTURE.md:31`

### SMTP port

Set `OPS_SMTP_PORT`. Use 465 for implicit TLS, anything else for
plain + STARTTLS. No code change needed.

### DB port

Change the port inside `DATABASE_URL`. The `5432` code default at
`lib/server/db.ts:33` only applies when the DSN omits a port.

### CDP ports

`browser-smoke.ts:51,63` (9333) and `browser-capture.ts:33,45` (9336). Keep
them distinct if you want both scripts to run concurrently.

---

## 11. Findings

### 11.1 `compose.dev.yml` leaks host port 8000

Compose merges `ports` by appending unique entries, so the dev override's
`"5173:5173"` does not remove the base file's `"8000:8000"`. The dev stack
publishes both; the 8000 mapping is inert because Vite only listens on 5173
in the container. It holds a host port for nothing and will produce confusing
connection-reset behaviour if someone curls 8000 expecting the dev server.

Fix with an explicit reset (Compose ≥ v2.24.4):

```yaml
ports: !override ["5173:5173"]
```

### 11.2 The two SMTP resolvers disagree on an empty port

- `mailer.ts:64` — `Number(get("OPS_SMTP_PORT")) || 587` → `""` becomes 587
- `notify.ts:80` — `Number(get("OPS_SMTP_PORT") ?? 587)` → `""` becomes
  `Number("")` = **0**

So an empty `OPS_SMTP_PORT=` yields 587 on the alert path and **port 0** on the
ops-failure path, which will fail to connect. The `??` in `notify.ts:80` is
the wrong operator here; it should be `||` to match.

### 11.3 The app binds `0.0.0.0:8000` with no reverse proxy

`deno serve` binds all interfaces and compose publishes `0.0.0.0:8000`, with
no nginx/Caddy/Traefik anywhere in the repo. Whatever fronts this in
production must terminate TLS, because the session cookie only sets `Secure`
when the request itself is `https:` (`lib/server/auth/session.ts:58,67-74`).
Also note `routeClientKey` keys rate limits on `remoteAddr` and never reads
`X-Forwarded-For` (`lib/server/throttle.ts:76,88-91`), so behind a proxy all
clients share one rate-limit bucket.

### 11.4 No readiness probe, and health cannot detect a dead database

`/api/health` is the only probe and never touches Postgres. A container with an
unreachable database reports **healthy** while every `/api/*` route returns
500. There is no `/ready` or `/readyz` endpoint.

### 11.5 A single remote Postgres is a hard, unprotected dependency

The whole stack depends on one Postgres at a public IP with a plaintext
password in a git-ignored `.env`, and no compose service provides a local
fallback. There is also no Postgres port published — correct, but it means
there is no way to run this stack self-contained without an external DB.

### 11.6 Port 8000 appears in `docker ps` for the worker services

`poller` and `alerts` display `8000/tcp` because they inherit
`Dockerfile:19`'s `EXPOSE`. They listen on nothing. Cosmetic, but it reads as
a false positive when auditing the stack.

### 11.7 `browser-smoke.ts` hardcodes an arm64 Chrome path

`scripts/browser-smoke.ts:14-15` hardcodes
`/tmp/opencode/chrome/hs-arm64/chrome-headless-shell-linux-arm64/...` and
ignores `CHROME_BIN`, even though its own comment at `:9` and
`readme.md:192` both point at that variable. `browser-capture.ts:17` honours it
correctly. Also, both scripts are loopback-only and will not work inside a
container.

### 11.8 Live secrets in the working tree

`.env` (git-ignored, `.dockerignore`d) holds real credentials, and
`env_file: [.env]` on all four services means they are readable via
`docker inspect` and `docker compose config`. Redacted in this document.

---

## 12. Negative findings (verified absent)

- No `PORT`, `SERVER_PORT`, `APP_PORT`, `VITE_PORT`, or `PGPORT` env var.
- No `Deno.serve()`, `.listen()`, or `serve()` call in the source tree.
- No `server.port` block in `vite.config.ts`.
- No `networks:`, `network_mode:`, `expose:`, `depends_on:`, or `links:` in
  either compose file.
- No reverse proxy (nginx / Caddy / Traefik / proxy_pass) config in the repo
  (Windows hosts get one at `deploy/windows/Caddyfile`).
- No SSE, `EventSource`, or `text/event-stream`.
- No application WebSocket; the only two are CDP clients in scripts.
- No CI workflow or port matrix.
- No ports in `docs/STATUSES.md`, `docs/GLOSSARY.md`, `docs/todo.md`,
  `agents.md`, or `scripts/fixtures/README.md`.
- No ports in the scripts other than the two browser scripts:
  `migrate.ts`, `seed.ts`, `alerts-poll.ts`, `alerts-check.ts`,
  `create-admin.ts`, `fracttal-poll.ts`, `fracttal-sync.ts`,
  `fracttal-force-sync.ts`, `fracttal-capture.ts`, `fracttal-extract.ts`,
  `fracttal-audit-stations.ts`, `fracttal-import.ts`, `test-dom.ts`,
  `chaos-scale.ts`, `geral-coverage.ts`, `import-sort.ts` are all
  port-literal-free (they are env-driven).
