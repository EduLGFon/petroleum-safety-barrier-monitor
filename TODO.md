# TODO

- Run `deploy/windows/ACCEPTANCE.md` on Windows Server 2022/2025 (`-CheckOnly` first) before production use. (owner)
- Run the DB integration tests against a disposable PostgreSQL instance (`DATABASE_URL` set, then `deno task db:migrate` + `deno task test`). (owner)
- Tune Windows NSSM stop budget and `SeaMonitor Monitor*` firewall pattern after first host run.
- Consider a route-level regression test for POST `authSource: null` handling (currently defaults to `local`).
