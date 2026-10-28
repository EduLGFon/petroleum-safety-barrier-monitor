# Dependency inventory + security bulletins - barrier-monitor

Generated 2026-10-09 (upgrade pass: signals 2.11.3, preact 10.29.8
(11.0.0 reverted, see section 1), vite 7.3.7, postgres 18-alpine). Resolved
versions, Dockerfile, compose.yml. OSV per pinned version; JSR/Deno/Postgres
cross-checked. Point-in-time; re-run before release.

Legend: `AFFECTED` applies to pinned. `NOT AFFECTED` fixed in/prior. `NO KNOWN
BULLETIN` no OSV/NVD hit on 2026-10-09.

## 0. Runtime / platform
| Component | Pinned | Status |
| --- | --- | --- |
| Deno runtime | 2.9.7 | NOT AFFECTED; runs with `-A` so sandbox bypasses high-impact. Rebuild for patches. |
| `denoland/deno:2.9.7` | digest pinned | NOT AFFECTED; digest verified 2026-10-09. |
| `postgres:18-alpine` | 18.6 | CURRENT; supersedes 16.14/16.15 fixes. PG16 `pgdata` cannot start under PG18; dump/restore. |
| Client surface (`@db/postgres`, no libpq) | - | NOT AFFECTED. |

## 1. Direct dependencies
| Package | Pinned | Status / action |
| --- | --- | --- |
| `@fresh/core` | 2.3.3 | NO KNOWN BULLETIN |
| `@fresh/plugin-vite` | 1.1.2 | NO KNOWN BULLETIN |
| `preact` | 10.29.8 (11 reverted, breaks SSR) | NOT AFFECTED (CVE-2026-22028 fixed 10.28.2) |
| `@preact/signals` (+core 1.14.4) | 2.11.3 | NO KNOWN BULLETIN |
| `preact-render-to-string` | 6.7.0 | NO KNOWN BULLETIN |
| `vite` | 7.3.7 | NOT AFFECTED (dev-server only) |
| `@std/path` | 1.1.6 | NO KNOWN BULLETIN |
| `@std/assert` | 1.0.19 | NO KNOWN BULLETIN (dev/test) |
| `@db/postgres` | 0.19.5 | NO KNOWN BULLETIN; DB CVEs still apply |
| `xlsx` (SheetJS CE) | 0.18.5 | **AFFECTED** CVE-2023-30533, CVE-2024-22363 (fixes not on npm). Prod export does not use it; only `scripts/geral-coverage.ts` + one test. Remove or vendor >=0.20.2. |
| `linkedom` | 0.18.13 | NO KNOWN BULLETIN (test-only) |

## 2. Key transitives
| Package | Pinned | Status |
| --- | --- | --- |
| `source-map-js` | 1.2.1 | AFFECTED CVE-2026-93749 DoS; build-time only. Fix 1.2.2 next bump. |
| `esbuild` | 0.25.7/0.25.12/0.28.2 | NOT AFFECTED |
| `rollup` | 4.63.2 | NO KNOWN BULLETIN (build-time) |
| `postcss` | 8.5.28 | NOT AFFECTED |
| `@babel/*` | 7.29.7-7.29.8 | NO KNOWN BULLETIN (build-time) |
| `nanoid` | 3.3.19 | NO KNOWN BULLETIN |
| `semver` | 6.3.1 | NO KNOWN BULLETIN |
| `debug`/`ms` | 4.4.3/2.1.3 | NO KNOWN BULLETIN |
| `browserslist` etc. | various | NO KNOWN BULLETIN |
| `@opentelemetry/api` | 1.9.1 | NO KNOWN BULLETIN |
| `@prefresh/*` | - | NO KNOWN BULLETIN (dev) |
| `picomatch` | 2.3.2/4.0.7 | NOT AFFECTED |
| `tinyglobby`/`fdir`/`lru-cache`/`yallist` | various | NO KNOWN BULLETIN |
| `convert-source-map`/`@jridgewell/*` etc. | various | NO KNOWN BULLETIN |
| `htmlparser2` etc. | various | NO KNOWN BULLETIN (test-only) |
| `cssom`/`html-escaper`/`uhyphen` | various | NO KNOWN BULLETIN (test-only) |
| `cfb` etc. (xlsx deps) | various | See xlsx row |
| `pdf-lib` | 1.17.1 (lock-only) | NOT INSTALLED EFFECTIVELY; orphan lock entry |
| `@std/*`/`@deno/*`/`@fresh/build-id` | various | NO KNOWN BULLETIN |

## 3. What to do (priority)
1. `xlsx@0.18.5`: do not parse untrusted uploads. Remove or vendor >=0.20.2.
2. `postgres:18-alpine`: done; dump/restore PG16 data.
3. `source-map-js@1.2.1`: build-time only; no action unless untrusted sourcemaps.
4. Hygiene: prune orphan `pdf-lib`; keep deno digest fresh; don't expose dev
   `:5173`; keep `-A` services isolated except `db` + `:8300`.

## 4. Reproduce
```sh
curl -s https://api.osv.dev/v1/query -d '{"package":{"name":"xlsx","ecosystem":"npm"},"version":"0.18.5"}' | jq .
grep -A200 '"npm":' deno.lock | grep -E '^    "[^"]+": \{$' | head -50
```
