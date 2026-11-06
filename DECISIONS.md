# Decisions

Append-only architecture decision records. Newest last.

- D01: additive database indexes only; no feature removal.
- D02: collapse read round-trips with window totals.
- D03: chunked transactional sync apply with batched audit.
- D04: collapse sync-changes list round-trip.
- D05: defer unverifiable performance changes.
- D06: normalize sync timestamps to ISO strings.
- D07: keyset export paging.
- D08: conditional GETs with ETags.
- D09: duplication-guard hardening.
- D10-D18: sync history attribution, contingency links, sync lease contention, Fracttal detail derivations, raw detail panel, sync status timestamp contract, and related implementation decisions.
- D19: performance pass without visual change. Blur is never removed, only
  contained/promoted/resized (contain: paint/strict, translateZ, smaller
  kernels over opaque surfaces, orb pause behind overlays). Server: list
  queries skip the history lateral (detail fetches it), /api/barriers caps
  at 1000 with an id-only listing for select-all, KPI/chart/vocab/sync
  responses memoize in short TTLs so ETags 304, gzip middleware for
  JSON/CSV, single-trip sync-status CTE, collapsed vocabulary scans,
  batched alert cooldown counts, guarded pg_trgm + rule-expression indexes.
  Client: export builders + editor + admin managers load lazily, memoized
  rows/chart, debounced searches/persistence, 30s health heartbeat.

- D20: admin field ownership for Fracttal-synced barrier columns. PATCH records
  newly-different keys in `barriers.manual_fields` (no-change saves take
  nothing); the sync excludes owned fields from its signature and UPDATE so
  manual edits survive sweeps; `releaseFields` returns them to the sync.
  Adds the `manual_fields text[]` column via idempotent migration.

- D21: station access is fail-closed. A non-admin with no access group sees
  zero stations; `null` is reserved for admins. User creation accepts
  `accessGroupIds` so a fresh account can be scoped atomically.

- D22: production configuration is strict. `PUBLIC_API_MODE` must be a known
  value, production refuses mock mode, boot validates config, and
  `/api/ready` is the DB-aware readiness probe while `/api/health` stays
  liveness-only.

- D23: effective availability is defined once in SQL
  (`effective_availability_id`), used by filters/KPI/chart/vocabularies/
  contingencies/stale alerts, and mirrored by the compliance trigger. Alert
  dedup keys include the history row id so a same-day recovery and re-failure
  is not suppressed.

- D24: barrier PATCH is one transaction (status + metadata + contingency
  overlay); sync ownership is enforced inside the UPDATE against the current
  `manual_fields`, closing the long-sweep edit race.

- D25: local SMTP is removed; delivery is the alert provider's job. Fonts are
  self-hosted under `static/fonts` (OFL) and the legacy 1.5k-line sync module
  is split into write/apply/read modules. The UI is now typechecked by
  `deno task check`.

- D26: database credentials are reported by identity, not assumed. `doctor`
  prints the effective `user@host:port/db` and fails when a process-level
  `DATABASE_URL` overrides `.env` (Deno's documented env-file precedence),
  the pool logs one `pool config` line, and the Windows setup script syncs a
  pre-existing role when it writes a fresh `.env`. This turns the
  "migrations work but login fails with password authentication failed"
  class of incident into a named check instead of guesswork.

- D27: station catalog aliases for SM8 and CO. A read-only live equipment
  sweep on 2026-11-06 (18,174 rows, 38 L3 station codes) showed the operator
  user list references 30 station tokens; only CO and SM8 did not resolve.
  SM8 is not L3: "ESTAÇÃO COLETORA SÃO MATEUS - SM-8" (L4/L5 under the SÃO
  MATEUS - SM / ESTAÇÕES COLETORAS - SM branch) carries 1,644 equipment rows
  and mapped to SM. CO is not L3 either: the 3-CO-2-ES, 3-CO-3-ES and
  3-CO-4-ES well clusters under JACUTINGA - JCT / CCS / POÇOS - JCT carry 30
  equipment rows and mapped to JCT. The shared parser now scans segments from
  L3 onward for two explicit aliases: folded exact "estacao coletora sao
  mateus - sm-8" -> SM8 / "São Mateus 8" / "Estação Coletora"; folded
  /^3-co-[0-9]+-es$/ -> CO / null name (UI falls back to the code) / "Campo".
  The 7-JCT-5-ES transformer segment "CO-03" does not match the well pattern
  and stays under JCT; SM-1 stays under SM. The catalog grows from 38 to 40
  station codes; SM drops from 2,445 to 801 rows and JCT from 150 to 120.

- D28: mobile test unit split into CJ-UTM-N and CJ-UTM-C. A read-only live
  sweep on 2026-11-06 found two distinct upstream facilities sharing the
  folded L3 segment `Cj Unidade de Teste Móvel`, separated only by the L2
  area: `// Seacrest Petróleo/ Área Centro/ Cj Unidade de Teste Móvel/ ...`
  (upstream facility code CJ-UND-TST-MOV-CENTRO, 5 equipment rows) and
  `// Seacrest Petróleo/ Área Norte/ Cj Unidade de Teste Móvel/ ...`
  (CJ-UND-TST-MOV-NORTE, 46 equipment rows). Both collapsed to station code
  `CJ UNIDADE DE TESTE MÓVEL` (51 rows); no operator roster entry or access
  group references that code, so no access group changes. The shared parser
  reads the L2 area when the L3 segment folds to that value: Área Centro ->
  CJ-UTM-C / CJ-UTM-C / "Unidade Móvel", Área Norte -> CJ-UTM-N / CJ-UTM-N /
  "Unidade Móvel"; any other area keeps the existing L3 parse, and the old
  CO/SM8 aliases plus the Base Seacrest override stay untouched.
  db/schema.sql renames the old `CJ UNIDADE DE TESTE MÓVEL` locations row to
  CJ-UTM-N in place (guarded, idempotent, re-runnable) so barriers and
  access groups referencing that location id stay valid; CENTRO joins as a
  new row, growing the catalog from 40 to 41 station codes.
  `deno task db:migrate` must run before the next sync so the parser's new
  codes resolve against the catalog.

See git history for full context.
