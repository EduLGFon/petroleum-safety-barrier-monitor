# Build optimization handoff

Status: paused mid-investigation. Owner connection failed; this file records
the baseline, findings, current step, and the prompt for the next orchestrator.
No product build files were changed before this commit.

## Goal

Make `deno task build` substantially faster on both targets:

- Local: Intel i7-6500U, 2 cores / 4 threads, 2.5 GHz, HDD, 4 logical CPUs.
- Production: AMD EPYC 7763, 64 cores.

Also produce a build phase duration ranking and remove duplicate or useless
build work.

## Environment measured

- Deno 2.9.8, Vite 7.3.7, Fresh plugin 1.1.2, Fresh core 2.3.3.
- `nproc` = 4; `node_modules` = 104 MB; `_fresh` = 2.7 MB.
- Repository at commit `15e0650` when this handoff was written.
- Another orchestrator is active. Worktrees existed for `ports-8300`,
  `settings-foundation`, and several `admin-*` units. Do not disturb them.

## Baseline commands and results

Command: `deno task build` (expands to `vite build`).

| Run | Conditions | Wall clock | Client build | SSR build |
| --- | --- | --- | --- | --- |
| 1 | Warm, no CI flag | 43,359 ms | not captured cleanly | not captured cleanly |
| 2 | `CI=true` | 22,714 ms | 8.05 s | 13.54 s |
| 3 | `CI=true` | 24,629 ms | 9.65 s | 13.93 s |
| 4 | `CI=true` | 24,853 ms | 9.73 s | 14.08 s |
| 5 | `vite build --debug` | 24,398 ms | 9.18 s | 13.86 s |

Vite reported 203 modules in the client environment and 588 modules in the SSR
environment. The 43.4 s first run was treated as an outlier, probably cold
transforms or contention with concurrent work. The stable baseline is about
23 to 25 seconds.

## Build phase ranking

| Rank | Phase | Measured time | Share of 23-25 s | Evidence |
| --- | --- | --- | --- | --- |
| 1 | SSR Vite build | 13.5-14.1 s | about 58-60% | `vite ... building ssr environment`, 588 modules |
| 2 | Client Vite build | 8.0-9.7 s | about 35-39% | `vite ... building client environment`, 203 modules |
| 3 | Vite startup, config, plugin init | about 0.3-0.6 s | about 1-2% | wall clock minus reported build times |
| 4 | Deno task and module startup | about 0.1 s | under 1% | `deno eval "0"` = 96 ms, `deno run -A npm:vite --version` = 108 ms |
| 5 | Fresh update check | about 0.29 s when online | async, normally hidden | `curl https://dl.deno.land/fresh/release-latest.txt` = 287 ms |

The reported client and SSR phases account for nearly all wall clock. There is
no large hidden Deno or task-runner overhead to remove. The update check is not
awaited, but it can become a timeout cost on an offline production host.
`FRESH_NO_UPDATE_CHECK=true` or `CI=true` disables it; `CI=true` did not change
the measured build time materially on this network.

Not yet measured: transform versus render versus minify time inside each Vite
environment, CPU utilization, and disk read volume. A per-plugin timing probe is
still needed before choosing fine-grained build tuning.

## Findings from source review

1. `deno task build` is only `vite build` in `deno.jsonc`; there is no separate
   TypeScript or preact build step to deduplicate.
2. `vite.config.ts` already sets `build.reportCompressedSize: false`, so the
   obvious gzip-size cost is gone.
3. `@fresh/plugin-vite@1.1.2` builds the client environment first and awaits it,
   then runs all other environments in parallel. There is only one other
   environment, SSR, so the two expensive phases are serial by construction.
4. SSR cannot simply be started in parallel with the client build. The
   `fresh:server-snapshot` plugin reads
   `_fresh/client/.vite/manifest.json` during its `load` hook. Starting SSR
   before the client manifest exists will race.
5. Vite 8.3.5 and Rolldown 1.2.15 work under Deno 2.9.8 in a scratch probe:
   `deno run -A npm:vite@8.3.5 --version` succeeded and
   `import("npm:rolldown@1.2.15")` loaded the native binding. Vite 8 is stable
   since March 2026 and replaces Rollup with the Rust, multithreaded Rolldown
   plus Oxc. This is the most promising lever for using all EPYC cores and for
   cutting local build time.
6. Fresh plugin 1.1.2 declares Vite `^7.1.4`, so Vite 8 compatibility is not
   guaranteed by metadata and must be proven by building and smoke-testing the
   real app.
7. `Dockerfile` installs dependencies in the `base` stage, builds in `prod`, then
   prunes build-only packages and runs `deno check --cached-only`. The build
   layer is invalidated by any source change. BuildKit caching currently covers
   only the Deno dependency mount, not transformed modules.
8. Server output is chunked per route, and the SSR bundle includes large shared
   modules such as a 315 KB DB chunk. Selective SSR externalization could cut
   module count, but it must be checked against the Docker runtime prune list and
   verified with `deno check --cached-only`.

## Current step

Step 0, baseline: complete. Numbers above.

Step 1, Vite 8 feasibility benchmark: started, not finished.

- A scratch copy was created at `/tmp/vite8-bench` with source, excluding
  `.git`, `node_modules`, `_fresh`, `.env`, `secrets`, and `test`.
- `deno.jsonc` in the copy was changed from `npm:vite@^7` to
  `npm:vite@^8.3.5`.
- The copy is incomplete: `rsync` failed with permission denied on
  `scripts/fixtures/_users_credentials.txt`. That file must never be copied or
  committed.
- A `deno install` was attempted, but the shell output was corrupted by the
  server restart, so the result is not trustworthy.
- No `deno task build` was run against Vite 8 yet.

Next action: recreate the scratch copy with explicit exclusions, run
`deno install`, run `deno task build`, compare `_fresh` behavior, and record
before/after timings. Do not trust the existing `/tmp/vite8-bench` directory.

## Candidate work units for the next orchestrator

| Unit | Scope | Risk | Files likely owned |
| --- | --- | --- | --- |
| U1 | Vite 8 and Rolldown upgrade, then build and smoke-verify output | High; build output contract | `deno.jsonc`, `deno.lock`, `vite.config.ts`, docs |
| U2 | Content-hash build cache or no-op skip wrapper, with CI bypass | Medium; stale artifact risk | `scripts/build.ts` or equivalent, `deno.jsonc`, `.gitignore` |
| U3 | SSR externalization and build tuning matrix (`maxParallelFileOps`, target, minify, chunking) | Medium; runtime and Docker risk | `vite.config.ts`, `Dockerfile`, docs |
| U4 | Dockerfile build-layer caching and duplicate-build removal | Medium; deployment | `Dockerfile`, `.dockerignore`, docs |
| U5 | Final `docs/BUILD-PERFORMANCE.md` ranking and decisions | Low | docs only |

U1 and U3 both touch `vite.config.ts`, so run them sequentially or combine them
into one unit. The unmerged `worktree/ports-8300` branch also touches
`vite.config.ts`; coordinate before editing that file. Do not include that
branch's port changes in a build unit.

## Measurement rules for the next attempt

- Warm the dependency cache first with `deno install`.
- Run each candidate at least three times and report median and range.
- Use `/usr/bin/time` if available, otherwise wrap with
  `start=$(date +%s%N)` and `end=$(date +%s%N)`.
- Keep a separate cold run for the first build after clearing `_fresh` and the
  Deno cache, but report it separately.
- Record client and SSR `built in` values from Vite output.
- Verify output equivalence: compare file lists under `_fresh`, check that
  `_fresh/server.js` boots with `deno task start`, and run the browser smoke or
  preview smoke when routes or islands change.
- Run `deno task check` and `deno task test` for any config or dependency change.
- Measure on the production host separately. Do not assume local HDD results
  predict EPYC results, especially for parallel Rust builds.

## Prompt for the next AI model

You are taking over an orchestrated performance task in
`/home/edubot/Projects/petroleum-safety-barrier-monitor`.

Read `docs/BUILD-OPTIMIZATION-HANDOFF.md`, `agents.md`, and the `orchestrate`
skill before acting. The previous orchestrator was interrupted by an owner
connection failure. No product build files were changed.

Goal: make `deno task build` much faster on a 4-core i7 with an HDD and on a
64-core AMD EPYC 7763, remove duplicate or useless build work, and produce a
build phase duration ranking.

Continue from Step 1. Recreate the Vite 8 scratch benchmark in `/tmp`, never
copying `.env`, `secrets/`, `test/`, or `scripts/fixtures/_users_credentials.txt`.
Prove or disprove the Vite 8 and Rolldown path against the real Fresh app before
proposing an upgrade. Then split the remaining work into independent units,
create unique worktrees and branches, and delegate to cheap subagents. Other
orchestrators are active in the same repository: do not touch their worktrees,
do not stage their changes, and keep file ownership disjoint. The unmerged
`worktree/ports-8300` branch touches `vite.config.ts`, so coordinate or defer
that file until it is clear.

Use tier 0 or tier 1 models first. Do not use tier 3 without owner approval.
Ask the owner before merging and before any destructive git operation. If the
owner is unreachable, stop before merge and report the reviewed diff and
measurements instead.

Deliverables: the optimized build, `docs/BUILD-PERFORMANCE.md` with before and
after rankings, updates to `DECISIONS.md` for any build contract or dependency
change, and a final report with units, models, checks, merge status, and open
issues.

## Session ledger

- Orchestrator model: DeepSeek V4.1 Flash (tier 2), no subagents launched.
- Cost: one orchestrator session, no tier 3 calls.
- Changes before this commit: none.
- Checks run: `git status`, baseline `deno task build` runs, source review,
  Vite 8 and Rolldown load probes.
- Checks not run: Vite 8 build, full `deno task check`, `deno task test`,
  preview smoke, production-host benchmark.
