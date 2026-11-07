# Test performance

`deno task test` runs the full suite in parallel without type checking. The
suite went from 320.76s to 7.75s wall clock on a 4-thread i7 with an HDD,
with 672 tests passing (down from 710 after deduplication).

## Why the old run was slow

Two costs dominated:

1. A single test in `lib/server/fracttal/adaptive-rate_test.ts` used real
   time to prove the 5-minute rate-limit hold. It called
   `recordSuccess(0, 0.15)`, which intentionally floors the hold at 300s,
   then slept in 50ms slices until the hold expired. That test alone took
   300.002s, 93.5% of the 320.76s baseline.
2. `deno test` type-checked every module before running and executed test
   modules serially by default.

The remaining suite, with the 300s test excluded, measured 18.26s with
serial execution and checking. The chosen configuration keeps the small gain
from parallel workers and drops the type check that `deno task check` already
performs.

## New command

```sh
deno task test
```

expands to:

```sh
deno test --parallel --no-check \
  --allow-read=scripts/fixtures,db/schema.sql \
  --allow-net=127.0.0.1,localhost \
  --allow-env=ALERT_PROVIDER_BASE_URL,ALERT_PROVIDER_TOKEN,ALERT_PROVIDER_COMPANY_ID,DATABASE_URL \
  .
```

`deno task check` is still the type-check gate: it runs `deno fmt`,
`deno lint`, `deno check` over the tree, and the migration-order check.
Permissions are unchanged.

## Before and after

| Run    | Command                                    | Wall clock | Tests      | Files |
| ------ | ------------------------------------------ | ---------- | ---------- | ----- |
| Before | `deno test` (serial, type-checked)         | 320.76s    | 710 passed | 95    |
| After  | `deno task test` (`--parallel --no-check`) | 7.75s      | 672 passed | 94    |

The final JUnit report records 7.290s of test-suite time and 672 test cases
across 94 files. The difference from the 7.75s wall clock is Deno startup,
module loading, and task overhead. The before run was serial and type-checked;
the after run is parallel and skips type checking.

## Deduplication

Executed tests fell from 710 to 672 (-38, -5.4%) by removing only exact
duplicates, strict subsets, re-export duplicates, and table-driven merges that
preserved every assertion. No auth/authz/security, password/session, SQL
integration, error/malformed-input, or export-format coverage was removed.

Per area:

- components/islands/routes/scripts: -4
- lib/server/fracttal: -10
- lib/export + lib/server/export_test.ts: -4
- lib/dashboard + lib/api + hooks + lib helper tests: -12
- lib/server alerts/auth/sql/validation: -8

Security/auth and database integration coverage were not reduced.

## Slowest remaining tests

The headline wall clock (7.75s) comes from the parallel run. The ranking
below uses a serial run (`DENO_JOBS=1 deno task test`), because parallel
per-test times are inflated by worker contention and are a poor cost signal.
Serial suite time is 21.820s. Times are the per-test values Deno reports.

| Rank | Time     | File                                                  | Test                                                                  |
| ---- | -------- | ----------------------------------------------------- | --------------------------------------------------------------------- |
| 1    | 1655.0ms | `lib/export/pdf/document_test.ts`                     | every page repeats the header and carries a footer                    |
| 2    | 801.0ms  | `lib/server/export_test.ts`                           | streamExportPdf renders real PDF bytes over every batch               |
| 3    | 664.0ms  | `lib/export/xlsx/workbook_test.ts`                    | xlsxBytes spans every batch                                           |
| 4    | 633.0ms  | `lib/server/fracttal/client_test.ts`                  | token bucket spaces sustained requests within the rate                |
| 5    | 483.0ms  | `lib/server/fracttal/client_test.ts`                  | 406 rate-limit pause waits reset header then retries                  |
| 6    | 483.0ms  | `lib/server/fracttal/client_test.ts`                  | client backs the adaptive rate off after a 406                        |
| 7    | 412.0ms  | `hooks/dashboard/server_test.ts`                      | useServerDashboard loads page/kpi/chart after hydration               |
| 8    | 406.0ms  | `hooks/useDashboard_test.ts`                          | useDashboard persists location/filters/selection to storage           |
| 9    | 317.0ms  | `components/barrier-modal/BarrierContingency_test.ts` | useContingencyState preserves data and does not clear on query change |
| 10   | 260.0ms  | `lib/server/auth/password_test.ts`                    | hashPassword verifies the same password                               |
| 11   | 225.0ms  | `lib/server/auth/password_test.ts`                    | verifyPassword rejects wrong passwords and bad hashes                 |
| 12   | 161.0ms  | `hooks/dashboard/server_test.ts`                      | useServerDashboard retry recovers after a failure                     |
| 13   | 159.0ms  | `hooks/dashboard/server_test.ts`                      | useServerDashboard refetches on scope change                          |
| 14   | 154.0ms  | `lib/server/export_test.ts`                           | streamExportXlsx writes a workbook package over every batch           |
| 15   | 130.0ms  | `hooks/dashboard/server_test.ts`                      | useServerDashboard sends full filters to kpi and chart                |
| 16   | 127.0ms  | `hooks/dashboard/server_test.ts`                      | useServerDashboard encodes the wire query for the current scope       |
| 17   | 122.0ms  | `lib/export/xlsx/workbook_test.ts`                    | xlsxBytes builds a workbook any reader can open                       |
| 18   | 92.0ms   | `lib/export/xlsx/xlsx_test.ts`                        | writeZip streams a readable archive with matching CRCs                |
| 19   | 72.0ms   | `hooks/dashboard/export-server_test.ts`               | exportFromServer posts the selection with the scope filters           |
| 20   | 71.0ms   | `lib/server/fracttal/sync-correctness_test.ts`        | fetchRawItem accepts an object envelope as well as an array           |
| 21   | 66.0ms   | `lib/export/xlsx/workbook_test.ts`                    | data rows come from the shared row() mapping                          |
| 22   | 63.0ms   | `hooks/dashboard/sync-status_test.ts`                 | useSyncStatus polls relative paths when baseUrl is same-origin        |
| 23   | 59.0ms   | `context/settings/storage_test.ts`                    | loadSettings defaults a missing fontSize to standard                  |
| 24   | 57.0ms   | `lib/server/fracttal/adaptive-rate_test.ts`           | exhausted window holds takeToken until reset                          |
| 25   | 55.0ms   | `hooks/useDashboard_test.ts`                          | useDashboard defaults: all rows, kpi total, single page               |

The rewritten 300s test now takes 57ms in the serial report because it
injects `now` into `createAdaptiveRate`, proves the promise is still pending
at 4:59.999, then advances the clock past the 5-minute floor.

## Slowest files

Aggregated from the same serial report.

| Rank | Time     | Tests | File                                                  |
| ---- | -------- | ----- | ----------------------------------------------------- |
| 1    | 1678.0ms | 3     | `lib/export/pdf/document_test.ts`                     |
| 2    | 1649.0ms | 20    | `lib/server/fracttal/client_test.ts`                  |
| 3    | 1003.0ms | 9     | `lib/server/export_test.ts`                           |
| 4    | 996.0ms  | 6     | `hooks/dashboard/server_test.ts`                      |
| 5    | 927.0ms  | 7     | `lib/export/xlsx/workbook_test.ts`                    |
| 6    | 490.0ms  | 7     | `lib/server/auth/password_test.ts`                    |
| 7    | 478.0ms  | 9     | `hooks/useDashboard_test.ts`                          |
| 8    | 317.0ms  | 1     | `components/barrier-modal/BarrierContingency_test.ts` |
| 9    | 106.0ms  | 13    | `lib/export/xlsx/xlsx_test.ts`                        |
| 10   | 88.0ms   | 10    | `lib/server/fracttal/sync-correctness_test.ts`        |
| 11   | 83.0ms   | 12    | `lib/export/pdf/writer_test.ts`                       |
| 12   | 80.0ms   | 5     | `hooks/dashboard/export-server_test.ts`               |
| 13   | 64.0ms   | 10    | `lib/server/fracttal/live-scope_test.ts`              |
| 14   | 63.0ms   | 1     | `hooks/dashboard/sync-status_test.ts`                 |
| 15   | 62.0ms   | 4     | `context/settings/storage_test.ts`                    |
| 16   | 61.0ms   | 11    | `lib/server/fracttal/adaptive-rate_test.ts`           |
| 17   | 55.0ms   | 7     | `hooks/dashboard/visible-columns_test.ts`             |
| 18   | 51.0ms   | 3     | `context/settings/appliers_test.ts`                   |
| 19   | 50.0ms   | 3     | `hooks/useElementWidth_test.ts`                       |
| 20   | 49.0ms   | 12    | `hooks/dashboard/filter-state_test.ts`                |

## Left unoptimized

The remaining wall-clock waits are small and tied to real behavior, so they
were not changed:

- `lib/server/fracttal/client_test.ts` keeps its real token-bucket waits:
  `ratePerMin: 1200` is clamped by the controller's 190/min ceiling, so
  each refill is about 316ms. Replacing them with an injected clock would
  stop testing that callers are actually spaced. The 406 and adaptive
  backoff tests already cap waits with `maxRateWaitMs: 5`.
- `lib/server/auth/password_test.ts` hashes with the production 210,000
  PBKDF2 iterations. Reducing iterations in the test would no longer
  exercise the real format and verification path.
- PDF and XLSX tests generate real documents and archives. They dominate
  the ranking but are the coverage that catches malformed output, so they
  stay as-is.

## Reproduction

```sh
# Install npm dependencies once for a fresh worktree.
deno install

# Timed full run.
time deno task test

# Full run with a JUnit report for per-test and per-file times.
deno task test --junit-path=/tmp/junit.xml

# If DATABASE_URL is set, run against a dedicated database with one worker
# to avoid cross-suite row contention, because the task now runs modules
# in parallel:
DENO_JOBS=1 deno task test

# Type check, formatter, linter, and migration order, now the sole
# type-checking gate.
deno task check
```

The ranking can be extracted from the JUnit XML by sorting the `time`
attributes on `<testcase>` elements; aggregate by `classname` for the file
table.<|end|><|start|> assistant to=shell<|channel|>analysis <|constrain|>xml<|message|><rfl:parameter name="command">
cd /home/edubot/.local/share/opencode/worktree/13047a/test-perf-doc && grep -n "710\|8.579\|8.147\|17.357\|95 files\|18.26" docs/TEST-PERFORMANCE.md
