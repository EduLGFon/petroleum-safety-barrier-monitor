# Agent Workspace Rules

## Conversation rules

- Avoid AI tropes and excessive AI fingerprints such as em-dashes ("—"),
  headline biscuit pills, overly robotic filler, and unnatural prose in message
  templates and generated outputs. Prefer clean, standard hyphens ("-") and
  natural human-like formatting.
- Be concise and direct in your responses.

## Code rules

- Imports in every file must be organized descending by line length (longest on
  top to shortest on bottom of the imports section).
- Avoid overly large files (>150 lines) and complex syntax. It's better splitting in several small files or even folders, if needed
- In all files: include a top-of-file comment describing what the file does and
  why it is needed (giving the most important context up front). Always write
  good comments on functions and non-obvious code, adhering to good commenting
  practices.
- Follow Clean Code, SOLID, KISS, YAGNI, and DRY. Keep functions small, pure
  where possible, and with single responsibility. Prefer composition over
  inheritance, explicit error handling over silent failures, and early returns
  over deep nesting.
- This workspace is Deno-only. Prefer in this order: (1) built-in Deno and
  Web-standard APIs like `Deno.serve`, `Deno.mkdir`, `Deno.Command`, `fetch`,
  then (2) Deno-native libraries (std/JSR), then (3) Deno-first packages. Use
  Node/npm packages only as a last resort.

## Architecture rules

- Respect layer boundaries: keep heavy logic, data loading, and aggregation in
  `routes/` / `lib/` / server code, and use `islands/` only for interactive
  UI. Share logic via `lib/` or `utils.ts` instead of duplicating it, define
  narrow types at module boundaries with no `any`, validate external data at
  the edge, and never swallow errors.
- Design for dynamic data, never fixed catalogs. Every station, category,
  agrupamento, tipologia, dono, disponibilidade status, conformidade status,
  criticidade level, author, location description, and their counts can change,
  grow, shrink, or be renamed later without a code change. Concretely:
- Layouts must survive scale: 50+ stations, 70+ categories, 50k+ rows. That
  means scrollable or paginated regions, capped stagger delays, O(N)
  single-pass counting, and no fixed pixel heights that assume small counts.
- Aggregations (KPI, chart, export summaries) must reconcile: totals always
  equal the sum of dynamic buckets, so a brand-new status can never go
  missing or be miscounted.

## Workflow rules

- After any code changes, always verify and format by running these exact
  commands in order, with no file arguments:
  1. `deno check`
  2. `deno lint`
  3. `deno fmt`
- All test scripts, debug scripts, and other helper files created by agents must
  be saved inside the `scripts/` directory. Never leave scratch files in the
  repository root.
- When asked to commit, use atomic Conventional Commits: one commit per small
  logical change (`type(scope): short description`, e.g. `fix(chart): ...`).
  Group several files in the same commit only when together they implement a
  single thing. Never bundle unrelated changes in one commit.
