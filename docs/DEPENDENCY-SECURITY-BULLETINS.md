# Dependencies

Direct dependencies from `deno.jsonc` (Deno 2.9+, PostgreSQL 18).

| Package              | Version | Notes                    |
| -------------------- | ------- | ------------------------ |
| `@fresh/core`        | 2.3.3   | Fresh 2 runtime          |
| `@fresh/plugin-vite` | 1.1.2   | Vite plugin              |
| `preact`             | 10.29.8 | 11 reverted (breaks SSR) |
| `@preact/signals`    | 2.11.3  |                          |
| `vite`               | 7.x     | dev/build only           |
| `@std/path`          | 1.1.6   |                          |
| `@db/postgres`       | 0.19.5  | Deno-native driver       |
| `xlsx`               | 0.18.5  | seed workbook only       |
| `linkedom`           | 0.18.13 | test DOM                 |
| `openid-client`      | 6.8.8   | Entra SSO                |

Runtime image: `denoland/deno:2.9.7`; database image: `postgres:18-alpine`. Re-run OSV checks before release.
