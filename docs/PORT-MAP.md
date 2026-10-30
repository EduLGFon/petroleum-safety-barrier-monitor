# Port map

| Port | Proto | Direction | What                         |
| ---- | ----- | --------- | ---------------------------- |
| 8300 | TCP   | Inbound   | App HTTP (prod)              |
| 5173 | TCP   | Inbound   | App HTTP (dev/HMR)           |
| 5432 | TCP   | Outbound  | PostgreSQL                   |
| 587  | TCP   | Outbound  | SMTP submission (STARTTLS)   |
| 465  | TCP   | Outbound  | SMTP implicit TLS            |
| 443  | TCP   | Outbound  | Fracttal API and fonts       |
| 9333 | TCP   | Loopback  | CDP for `browser-smoke.ts`   |
| 9336 | TCP   | Loopback  | CDP for `browser-capture.ts` |

Only 8300 and 5173 are published to the host. Port is set by the runner (`deno serve --port`, Vite), not in source.
