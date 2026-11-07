# Test performance

`deno task test` runs the full suite in parallel without type checking. The
suite went from 320.76s to 8.579s wall clock on a 4-thread i7 with an HDD,
with the same 710 tests passing.

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
serial execution and checking, 15.20s with `--parallel` and checking, and
8.64s with `--parallel --no-check`. The chosen configuration keeps the
small gain from parallel workers and drops the type check that
`deno task check` already performs.

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

| Run    | Command                                    | Wall clock | Tests      |
| ------ | ------------------------------------------ | ---------- | ---------- |
| Before | `deno test` (serial, type-checked)         | 320.76s    | 710 passed |
| After  | `deno task test` (`--parallel --no-check`) | 8.579s     | 710 passed |

The final JUnit report records 8.147s of test-suite time and 710 test cases
across 95 files. The difference from the 8.579s wall clock is Deno startup,
module loading, and task overhead.

## Slowest remaining tests

The headline wall clock (8.579s) comes from the parallel run. The ranking
below uses a serial run (`DENO_JOBS=1 deno task test`), because parallel
per-test times are inflated by worker contention and are a poor cost signal.
Serial suite time is 17.357s. Times are the per-test values Deno reports.

| Rank | Time    | File                                                  | Test                                                                  |
| ---- | ------- | ----------------------------------------------------- | --------------------------------------------------------------------- |
| 1    | 929.0ms | `lib/export/pdf/document_test.ts`                     | every page repeats the header and carries a footer                    |
| 2    | 663.0ms | `lib/server/export_test.ts`                           | streamExportPdf renders real PDF bytes over every batch               |
| 3    | 634.0ms | `lib/server/fracttal/client_test.ts`                  | token bucket spaces sustained requests within the rate                |
| 4    | 527.0ms | `lib/export/xlsx/workbook_test.ts`                    | xlsxBytes spans every batch                                           |
| 5    | 483.0ms | `lib/server/fracttal/client_test.ts`                  | client backs the adaptive rate off after a 406                        |
| 6    | 482.0ms | `lib/server/fracttal/client_test.ts`                  | 406 rate-limit pause waits reset header then retries                  |
| 7    | 404.0ms | `hooks/useDashboard_test.ts`                          | useDashboard persists location/filters/selection to storage           |
| 8    | 312.0ms | `components/barrier-modal/BarrierContingency_test.ts` | useContingencyState preserves data and does not clear on query change |
| 9    | 260.0ms | `hooks/dashboard/server_test.ts`                      | useServerDashboard loads page/kpi/chart after hydration               |
| 10   | 217.0ms | `lib/server/auth/password_test.ts`                    | hashPassword verifies the same password                               |
| 11   | 217.0ms | `lib/server/auth/password_test.ts`                    | verifyPassword rejects wrong passwords and bad hashes                 |
| 12   | 131.0ms | `hooks/dashboard/server_test.ts`                      | useServerDashboard retry recovers after a failure                     |
| 13   | 113.0ms | `lib/server/export_test.ts`                           | streamExportXlsx writes a workbook package over every batch           |
| 14   | 107.0ms | `hooks/dashboard/server_test.ts`                      | useServerDashboard refetches on scope change                          |
| 15   | 106.0ms | `hooks/dashboard/server_test.ts`                      | useServerDashboard sends full filters to kpi and chart                |
| 16   | 99.0ms  | `hooks/dashboard/server_test.ts`                      | useServerDashboard encodes the wire query for the current scope       |
| 17   | 69.0ms  | `hooks/dashboard/visible-columns_test.ts`             | useVisibleColumns starts from defaults with empty storage             |
| 18   | 66.0ms  | `lib/export/xlsx/workbook_test.ts`                    | xlsxBytes builds a workbook any reader can open                       |
| 19   | 56.0ms  | `lib/server/fracttal/adaptive-rate_test.ts`           | exhausted window holds takeToken until reset                          |
| 20   | 52.0ms  | `hooks/dashboard/export-server_test.ts`               | exportFromServer posts the selection with the scope filters           |
| 21   | 49.0ms  | `lib/export/xlsx/xlsx_test.ts`                        | writeZip streams a readable archive with matching CRCs                |
| 22   | 45.0ms  | `hooks/dashboard/sync-status_test.ts`                 | useSyncStatus polls relative paths when baseUrl is same-origin        |
| 23   | 39.0ms  | `hooks/dashboard/filter-state_test.ts`                | useFilterState starts from defaults and hydrates with empty storage   |
| 24   | 38.0ms  | `context/settings_test.ts`                            | setters called in the same tick both land                             |
| 25   | 38.0ms  | `hooks/useDashboard_test.ts`                          | useDashboard defaults: all rows, kpi total, single page               |

The rewritten 300s test now takes 56ms in the serial report (54ms when run
alone) because it injects `now` into `createAdaptiveRate`, proves the
promise is still pending at 4:59.999, then advances the clock past the
5-minute floor.

## Slowest files

Aggregated from the same serial report.

| Rank | Time     | Tests | File                                                  |
| ---- | -------- | ----- | ----------------------------------------------------- |
| 1    | 1642.0ms | 20    | `lib/server/fracttal/client_test.ts`                  |
| 2    | 950.0ms  | 3     | `lib/export/pdf/document_test.ts`                     |
| 3    | 814.0ms  | 10    | `lib/server/export_test.ts`                           |
| 4    | 711.0ms  | 6     | `hooks/dashboard/server_test.ts`                      |
| 5    | 656.0ms  | 8     | `lib/export/xlsx/workbook_test.ts`                    |
| 6    | 452.0ms  | 9     | `hooks/useDashboard_test.ts`                          |
| 7    | 435.0ms  | 7     | `lib/server/auth/password_test.ts`                    |
| 8    | 312.0ms  | 1     | `components/barrier-modal/BarrierContingency_test.ts` |
| 9    | 77.0ms   | 7     | `hooks/dashboard/visible-columns_test.ts`             |
| 10   | 65.0ms   | 12    | `lib/export/pdf/writer_test.ts`                       |
| 11   | 60.0ms   | 5     | `hooks/dashboard/export-server_test.ts`               |
| 12   | 60.0ms   | 11    | `lib/server/fracttal/adaptive-rate_test.ts`           |
| 13   | 57.0ms   | 13    | `lib/export/xlsx/xlsx_test.ts`                        |
| 14   | 52.0ms   | 13    | `hooks/dashboard/filter-state_test.ts`                |
| 15   | 51.0ms   | 10    | `lib/server/fracttal/live-scope_test.ts`              |
| 16   | 45.0ms   | 6     | `context/settings_test.ts`                            |
| 17   | 45.0ms   | 1     | `hooks/dashboard/sync-status_test.ts`                 |
| 18   | 36.0ms   | 3     | `hooks/useElementWidth_test.ts`                       |
| 19   | 36.0ms   | 3     | `context/settings/appliers_test.ts`                   |
| 20   | 33.0ms   | 4     | `context/settings/storage_test.ts`                    |

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
table.
