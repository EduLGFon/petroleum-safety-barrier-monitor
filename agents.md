# Agent Workspace Rules

- Avoid AI tropes and excessive AI fingerprints such as em-dashes ("—"),
  headline biscuit pills, overly robotic filler, and unnatural prose in message
  templates and generated outputs. Prefer clean, standard hyphens ("-") and
  natural human-like formatting.
- Imports in every file must be organized descending by line length (longest on
  top to shortest on bottom of the imports section).
- After fixing any problems or completing code modifications, you MUST always
  run the following commands sequentially to verify and format the codebase (run
  cmds without specifying a file):
  1. `deno check`
  2. `deno lint`
  3. `deno fmt`
- Always follow Clean Code and SOLID principles.
- Avoid overly large files and complex syntax.
- In all files: include a top-of-file comment describing what the file does and
  why it is needed (giving the most important context up front). Always write
  good comments on functions and non-obvious code, adhering to good commenting
  practices.
- This workspace is DENO-only. Always choose DENO native libraries/ways instead
  of DENO-first libraries or NODE libraries (this should only be used as a last
  resort).
- All test scripts, debug scripts, and other helper files created by agents must
  be saved inside the `scripts/` directory. Never leave scratch files in the
  repository root.
- Design for dynamic data, never fixed catalogs. Every station, category,
  agrupamento, tipologia, dono, disponibilidade status, conformidade status,
  criticidade level, author, location description, and their counts can change,
  grow, shrink, or be renamed later without a code change. Concretely:
  - Derive UI option lists (station tabs, filter selects, chart rows, status
    band segments) from the loaded dataset, using constants only as seed or
    display-metadata fallback.
  - Keep TypeScript vocabularies open (allow unknown strings) and give every
    color/label map a deterministic fallback so unseen values render sensibly.
  - Layouts must survive scale: 50+ stations, 70+ categories, 10k+ rows. That
    means scrollable or paginated regions, capped stagger delays, O(N)
    single-pass counting, and no fixed pixel heights that assume small counts.
  - Aggregations (KPI, chart, export summaries) must reconcile: totals always
    equal the sum of dynamic buckets, so a brand-new status can never go
    missing or be miscounted.
