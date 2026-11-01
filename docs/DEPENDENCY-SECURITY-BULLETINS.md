# Dependencies

Direct dependencies from `deno.jsonc` (Deno 2.9+, PostgreSQL 18).

| Package              | Version | Notes                      |
| -------------------- | ------- | -------------------------- |
| `@fresh/core`        | 2.3.3   | Fresh 2 runtime            |
| `@fresh/plugin-vite` | 1.1.2   | Vite plugin                |
| `preact`             | 10.29.8 | 11 reverted (breaks SSR)   |
| `@preact/signals`    | 2.11.4  |                            |
| `vite`               | 7.x     | dev/build only             |
| `@std/path`          | 1.1.6   |                            |
| `@db/postgres`       | 0.19.5  | Deno-native driver         |
| `xlsx`               | 0.18.5  | dev script only; see notes |
| `linkedom`           | 0.18.14 | test DOM                   |
| `openid-client`      | 6.8.8   | Entra SSO                  |

Runtime image: `denoland/deno:2.9.7`; database image: `postgres:18-alpine`. Re-run OSV checks before release.

## Known advisories

- `xlsx@0.18.5` (last npm release) has 2 high advisories:
  prototype pollution (GHSA-4r6h-8v6p-xvw6) and ReDoS
  (GHSA-5pgg-2g8v-p4x9), both `<0.19.3`/`<0.20.2`. The package is used
  only by `scripts/geral-coverage.ts` to read a trusted local workbook; it is
  not in the production runtime or export path, which uses the in-house XLSX
  builder in `lib/export/xlsx/`. Accepted risk; re-check on any xlsx upgrade.
