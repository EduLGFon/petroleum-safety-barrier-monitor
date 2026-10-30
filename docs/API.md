# API layer - Barrier Monitor

Single entry point `lib/api.ts` (barrel over `lib/api/*`). UI calls only `api.getBarriers`, `api.getAllBarriers`, `api.getBarrierById`, `api.getKpi`, `api.getChartData`. Mock and HTTP adapters share the same interface.

## Wire format

Backend exchanges numeric codes, never display strings. Resolvers in `lib/enums/`:
`toXId(string) -> number | undefined`, `fromXId(number) -> string`.

- Location: 0 ALL, 1 FAL, 2 SML, 3 FSR, 4 IBU, 5 FSL, 6 CNC, 7 JCT, 8 FSJ.
- Availability: 0 Disponível, 1 Fora de Operação, 2 Indisponível Contingenciado, 3 Degradado Contingenciado, 4 Degradado, 5 Indisponível.
- Compliance: 0 Conforme, 1 Não Conforme.
- Criticality: 0 ESO, 1 A, 2 B, 3 C, 4 D (ESO/A critical).
- Category, grouping, typology, owner, location description and history author follow the same pattern.

`compliance` is not sent in `WireBarrier`; it is derived from availability via `isCompliant()`. Resolver, mock and SQL all apply the contingency overlay (stored 4/5 with `hasContingency='Sim'` reads as 3/2).

Wire/domain types: `lib/wireTypes.ts`, `lib/types.ts`, `lib/api/types.ts`, `lib/resolve.ts`.

## Main routes

Reads (session cookie or `ADMIN_TOKEN`): `/api/health`, `/api/barriers`, `/api/barriers/:id`, `/api/barriers/:id/contingencies`, `/api/kpi`, `/api/chart`, `/api/vocabularies`, `/api/sync-status`, `/api/sync-runs`, `/api/sync-changes`, `/api/barriers/:id/sync-detail`, `/api/export`, `/api/lookups`, `/api/field-options`. Admin-only reads: `/api/barriers/deleted`, `/api/barriers/:id/fracttal-raw` (`DEV=true`).

Writes (admin): status, barrier edit, contingency links, recipients, users, alert rules, field options. Auth: `/api/auth/login`, `/api/auth/logout`, `/api/auth/me`, `/api/auth/password`.

## Key behaviors

- `/api/barriers` supports location, availability, compliance, category, typology, criticality, criticalOnly, hasActionPlan, rowScope, query, since/until, page, pageSize, sortCol, sortDir.
- Exports stream CSV/XLSX/PDF over the whole filtered scope, 5,000-row batches, 200,000-row ceiling.
- Soft-deleted rows are visible only to admins through `rowScope`.
- Errors use `{ error, code, requestId }` plus `x-request-id`.
- GET JSON responses carry ETags and may return 304.
- Throttle: 120 req/min reads, 30 req/min writes, 120 req/min exports, 10 req/min password changes per remote IP.
- `/api/health` is unthrottled and DB-free.

## SSO

When `AUTH_SSO_ENABLED=true`, Entra routes are available under `/auth/entra/*`. Entra users are pre-provisioned and cannot use local password login or admin password reset. See `docs/SSO-ENTRA-PLAN.md`.

## Setup

1. Start Postgres and run `deno task db:migrate` (and optionally `db:seed`).
2. Set `PUBLIC_API_MODE=http` and `DATABASE_URL`.
3. Run `deno task dev`, `build`, or `start`.

See `docs/DATABASE.md` and `docs/ARCHITECTURE.md`.
