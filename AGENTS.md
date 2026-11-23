Global defaults: ~/.config/opencode/AGENTS.md

## Identity

- Petroleum Safety Barrier Monitor: web dashboard of safety barriers protecting process equipment; barriers imported read-only from the operator's CMMS (Fracttal), normalized into Postgres, served by Fresh/Preact.
- Stack: Deno 2.9+ (images denoland/deno:2.9.7); Fresh 2.3.3 + Vite 7; Preact 10 + signals; PostgreSQL via jsr:@db/postgres (18 compose, 16 Windows); auth local passwords + optional Entra ID OIDC/PKCE; alerts via MSGFLOW provider (no local SMTP). App version 0.4.0. No package.json/tsconfig.json; deno.jsonc owns tasks/imports/fmt/lint; deno.lock pins.
- Language: TypeScript app/API/sync/alerts/tooling; SQL re-runnable; user-visible strings pt-BR; code/docs/commits English; docs/GLOSSARY.md is the only PT-to-EN map. Imports use the @/ alias, sorted by scripts/import-sort.ts --fix.
- No telemetry, analytics, ads, crash reporting, or a second database/driver/ORM/UI framework without an explicit project rule and privacy review. No local DB.

## Commands

- `deno task check` (fmt writes, lint, check, migration-order guard); `deno task test`; `deno task dev`; `deno task build`; `deno task start` (8300, reads .env), `start:alt` (8301), `preview`.
- DB: `deno task db:migrate` (re-runnable schema + lookup seeds); `deno task db:seed` (sample, not idempotent; `--force` needs SEED_FORCE=1 + typed YES).
- Other: `deno task doctor`, `admin:create`, `import:users`, `browser:capture`, `alerts:*`, `fracttal:*`, `docker:*`.
- Import sort: `deno run -A scripts/import-sort.ts --fix`. Format/lint/typecheck: `deno fmt`, `deno lint`, `deno check`.

## Map

- Root: readme.md, AGENTS.md, DECISIONS.md, TODO.md; docs/ (ARCHITECTURE, API, DATABASE, DEPLOY-WINDOWS, FRACTTAL, GLOSSARY, STATUSES, PORT-MAP, USO, DOCUMENTACAO-TECNICA); scripts/fixtures/README.md.
- Code: routes/ (SSR/HTTP edge), islands/ (hydrated UI, Dashboard.tsx root), lib/ (shared pure), lib/server/ (server-only), scripts/ (CLIs), db/ (schema.sql, seed_lookups.sql).
- Read ARCHITECTURE.md before auth/permissions/retention/sync/alerts/export work; GLOSSARY.md and STATUSES.md before user-visible text or status rules; API.md and DATABASE.md before contracts/schema.

## Invariants

- Deno/Fresh/Preact/Postgres only; no ORM; pure SQL; db/schema.sql + db/seed_lookups.sql re-runnable; migrations additive/idempotent via scripts/migrate.ts; never rewrite applied history; retire rows with soft delete or is_active=false.
- Fracttal is read-only CMMS sync: client refuses non-GET data calls; host allow-list app.fracttal.com; adaptive token bucket; backoff on 406/429/5xx. Station alias mapping and mobile test unit split (CJ-UTM-N/C) per DECISIONS.md D27-D28.
- Auth: lowercase emails; PBKDF2-SHA256 210k iterations per-user salt; opaque 12h sessions stored only as SHA-256; HttpOnly SameSite=Lax, Secure on HTTPS; password change revokes every session; passwords 12-256 chars; forced password change gates guarded reads/writes with 403 PASSWORD_CHANGE_REQUIRED; Entra bind by email first then object id (D29-D31).
- Station access fail-closed: non-admin with no group sees zero stations; null scope admin-only. Alert audience derives from active users and access groups, filtered per station at delivery; alert_recipients is legacy manual list.
- Status ids 0-5 and compliance fixed by id: 0-3 Conforme, 4-5 Nao Conforme; unknown id fails closed to Nao Conforme. Effective availability lives once in SQL (D23).
- Export streams 5,000-row batches, 200,000-row ceiling, same station scope; in-house XLSX; 30-column mapping is a public contract.
- Batch endpoints: one admin-only POST per resource with documented id caps (500 users/recipients/rules; 200 groups with 500 related ids and 20k cross-product cap); typed ValidationError mapped 400, other errors 500 INTERNAL (D34-D35).
- LGPD/Brazil privacy: no production personal data in dev/tests; synthetic/anonymized fixtures; collect only documented data; exports are downloads, never stored server-side; upstream read-only.
- Public contracts compatibility-sensitive: route paths, wire fields, filter keys, vocabulary shapes, enum ids, export mapping, alert dedup keys, localStorage keys, .env.example keys. Add, do not remove.
- SQL parameterized; never interpolate values or ORDER BY outside SORTABLE whitelist; errors {error,code,requestId} plus x-request-id; never leak internals.
- Settings is a centered workspace with blurred backdrop (D33). Reduced motion and "Desativar desfoque" respected.

## Do not touch

- Generated artifacts: `_fresh/`, node_modules, captures, downloaded exports, scratch files. Regenerate via official tasks.
- `.env` (untracked, follows .env.example); secrets, credentials, tokens, connection strings never committed or printed.
- Shared/prod databases, upstream CMMS tenant, real alert audience: no migrate/seed --force/admin:create/fracttal:* --apply/live polls without explicit authorization.
- Do not import lib/server/* from islands/components/hooks/context; no Postgres from hooks; API only via lib/api.

## Verify

- After code changes: `deno task check`, then `deno task test`. `deno task build` when islands/routes/styles/client bundles change. `scripts/chaos-scale.ts` for dynamic data; `scripts/browser-smoke.ts` or `deno task browser:capture` for hydration/interaction.
- Before release: scan for accidentally tracked secrets and recheck permission matrix in docs/API.md, ARCHITECTURE.md, DATABASE.md. Report exactly what ran and what did not.
- Auth boundaries tested: anonymous vs dead credential, admin vs user, admin-only rowScope, last-admin protection, session-only password change, throttle windows, sort whitelist, export scope.

## Overrides

- Override: web UI may use backdrop blur/glass effects (settings backdrop, login backdrop, modal/card surfaces) as an intentional visual design (DECISIONS.md D33). The global "no blur / extremely fast / extremely low battery" surface rule does not apply here. Keep effects bounded: respect prefers-reduced-motion and the "Desativar desfoque" setting, avoid animating blur, and keep non-visual paths (sync, alerts, exports) efficient.
