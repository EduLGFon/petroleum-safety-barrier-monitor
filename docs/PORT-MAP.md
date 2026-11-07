# Port map

| Port | Proto | Direction | What                            |
| ---- | ----- | --------- | ------------------------------- |
| 8300 | TCP   | Inbound   | App HTTP (dev and prod)         |
| 5432 | TCP   | Outbound  | PostgreSQL                      |
| 443  | TCP   | Outbound  | Fracttal API and alert provider |
| 9333 | TCP   | Loopback  | CDP for `browser-smoke.ts`      |
| 9336 | TCP   | Loopback  | CDP for `browser-capture.ts`    |

Only 8300 is published for the app. Port is set by the runner (`deno serve --port`, Vite), not in source.
