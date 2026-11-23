# Windows acceptance checklist (manual, UNEXECUTED)

**Status: NOT EXECUTED.** This checklist was written from static review only:
no Windows host was available where the deploy scripts were changed, so none
of the steps below has ever been run. Before the setup may be declared
production-ready, execute every step on Windows Server 2022 or 2025 (a
disposable test server first, then the target host) and record the outcome in
the sign-off table at the end. Any FAIL blocks production. This file is a
checklist, not evidence: never cite it as proof that anything ran.

Why it exists: the Windows-only paths (UAC elevation, NSSM services, Task
Scheduler, Caddy, a real Postgres) cannot be exercised on the development
machines, so they need an explicit on-host pass with exact commands and
expected results. Static review, `deno task check` and `deno task test` cover
everything else; `docs/DEPLOY-WINDOWS.md` stays the general deploy guide.

## Ground rules

- Commands are PowerShell 5.1. Run from an **elevated** PowerShell unless the
  step says NON-ELEVATED. `<placeholders>` are host-specific; substitute once
  and keep notes.
- The test server must be disposable: the steps install services, a scheduled
  task and firewall rules, and intentionally trigger aborts.
- Steps F0/F1/G1 assume the merged revision of `Register-Services.ps1`
  (declares `-ServicePrefix` and `-BindHost`) and `Backup-Database.ps1`
  (declares `-DbName` and `-PostgresBinDir`). `Setup-Production.ps1` fails
  closed when the helper lacks them, so an outdated checkout stops at F0/G1
  instead of silently ignoring the listener or the selected database.
- The app's loopback posture is enforced by the helper: `Setup-Production.ps1`
  passes the chosen bind as `-BindHost` and `Register-Services.ps1` owns the
  service command line. Steps F1/F3/F4/H4 verify that enforcement on host.

## A. UAC elevation and argument integrity (spaced path, spaces, quotes, $, backticks)

A1 - NON-ELEVATED, spaced script path with hostile characters. The encoded
child invocation must carry every argument through the UAC hop as one literal
token:

```powershell
Copy-Item .\deploy\windows\Setup-Production.ps1 'C:\temp\setup test\'
powershell -NoProfile -ExecutionPolicy Bypass -File 'C:\temp\setup test\Setup-Production.ps1' `
  -CheckOnly -AdminEmail you@example.com -ServicePrefix 'Bad Prefix' -DbUser 'bad"user'
```

Expected: one UAC prompt; the elevated console aborts before anything runs,
echoing the exact value with its space and double quote intact:

```text
SETUP ABORTED: DbUser 'bad"user' invalid: must match ^[a-z_][a-z0-9_]{0,62}$ (lowercase, digits, underscore; max 63 chars).
```

Re-run with `-ServicePrefix 'Bad Prefix'` alone to see that echo too (drop
`-DbUser`). The launching console then prints
`SETUP ABORTED: the elevated child exited with code 1; review the elevated
console output.`, `$LASTEXITCODE` is `1`, and nothing was installed.

A2 - NON-ELEVATED: cancel the UAC prompt. Expected: the parent aborts with
`SETUP ABORTED: elevation was refused or failed (...)`, exit code `1`.

A3 - ELEVATED: re-run A1's `-CheckOnly` command with `-NoElevate` added.
Expected: no UAC prompt, the full readiness plan prints, exit code `0`.

A4 - `Setup-Production.ps1 -CheckOnly -Elevated -NoElevate` aborts with the
mutually-exclusive message, and `-Elevated` alone from a NON-ELEVATED session
aborts with the not-elevated message. Nothing starts in either case.

## B. Encoded payload: no silent success

B1 - NON-ELEVATED: a failing elevated child must propagate failure, never
exit 0:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\deploy\windows\Setup-Production.ps1 `
  -CheckOnly -AdminEmail you@example.com -AppPort notaport
```

Expected: UAC prompt, the child aborts with
`SETUP ABORTED: -AppPort 'notaport' invalid: must be a TCP port number
1-65535.`, the parent prints its exit-code line and `$LASTEXITCODE` is `1`.
Then verify nothing was created:
`Test-Path C:\srv\barrier-monitor` is `False` and
`Get-Service SeaMonitorApp` reports no such service.

B2 - Missing-script guard (code-verified only): the child re-tests the script
path and exits `1` with an explicit stderr line when the file is gone. This
cannot be triggered deterministically by hand (it would need the script
deleted between UAC consent and the child start), so accept it on the strength
of the child bootstrap code plus B1, which proves a failing child propagates a
non-zero exit. Record "code-verified" in the table.

B3 - Unknown-exit-code guard (code-verified only): when the elevated process
reports no exit code the parent aborts with
`the elevated child exited but its exit code could not be read`. Not
deterministically triggerable manually; record "code-verified".

## C. Secret env fail-closed and CLI-secret gate

C1 - NON-ELEVATED:

```powershell
$env:DB_PASSWORD = 'acceptance-test-value'
powershell -NoProfile -ExecutionPolicy Bypass -File .\deploy\windows\Setup-Production.ps1 `
  -CheckOnly -AdminEmail you@example.com
Remove-Item Env:\DB_PASSWORD
```

Expected: immediate abort BEFORE any UAC prompt:
`SETUP ABORTED: secret environment variables are visible in this non-elevated
session (DB_PASSWORD), and Windows UAC does not carry runtime-set process
variables to the elevated child (...)`, exit code `1`.

C2 - NON-ELEVATED: add `-DbPassword acceptance-test-value` to the C1 command
(with the env var cleared). Expected: abort before elevation with
`SETUP ABORTED: secret -DbPassword was passed on the command line (visible in
process lists/history). Set the DB_PASSWORD environment variable or answer
the interactive prompt instead.`, exit code `1`.

C3 - ELEVATED: set `$env:DB_PASSWORD` / `$env:ADMIN_PASSWORD` in the elevated
session and run for real. Expected: no gate trips, no secret is ever echoed,
and no secret appears on any command line:
`Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -match 'acceptance-test-value' }`
returns nothing.

C4 - Persistence remedy:
`[Environment]::SetEnvironmentVariable('POSTGRES_SUPER_PASSWORD','<secret>','User')`,
then open a NEW elevated PowerShell. Expected: the setup reads the variable
without prompting (see D3). Clean up afterwards with
`[Environment]::SetEnvironmentVariable('POSTGRES_SUPER_PASSWORD',$null,'User')`.

## D. Postgres superuser password prompt (existing cluster)

Precondition: a Postgres cluster exists at the selected `-PostgresBinDir`
(`pg_ctl.exe` present) and `POSTGRES_SUPER_PASSWORD` is not set anywhere.

D1 - Interactive real run. Expected: the hidden prompt
`Postgres superuser password (input hidden; ...)`; the correct password lets
the run proceed; an empty answer aborts hard with the
`Persist POSTGRES_SUPER_PASSWORD at User or Machine scope (...)` message and
exit code `1`.

D2 - Same precondition plus `-Unattended`. Expected: abort without prompting
(no hang), same message as D1.

D3 - After C4, a real run reaches the Postgres step without any prompt.

## E. Port guard, partial retry, second Postgres, -SkipPostgres

E1 - Port guard. NON-ELEVATED or ELEVATED, occupy the app port:

```powershell
$listener = [System.Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback,8300)
$listener.Start()
```

Run `-CheckOnly`. Expected: `WARN port 8300: already in use with no
SeaMonitor* service installed (a real run would ABORT).` Run for real
(NON-ELEVATED). Expected: abort at the guards, before any install, with the
port message. Stop the listener (`$listener.Stop()`), re-run the same real
command. Expected: the run completes (a partial retry after an aborted
attempt must not be blocked, and the selected PgPort stays exempt).

E2 - Foreign service prefix. Create a dummy service and clean up after:

```powershell
New-Service -Name BarrierApp -BinaryFilePathName 'C:\Windows\System32\svchost.exe' -DisplayName 'acceptance dummy'
# real run with the default prefix -> aborts at the guards:
#   service BarrierApp exists with a different prefix (...)
# -CheckOnly shows the same WARN plus the re-run-with-matching-prefix remedy.
Remove-Service -Name BarrierApp
```

E3 - Second Postgres guard and `-SkipPostgres` honoring it. On a test VM
without a second cluster, fake one:

```powershell
New-Item -ItemType File 'C:\Program Files\PostgreSQL\18\bin\pg_ctl.exe' -Force
```

Real run (default vendor `-PostgresBinDir` present). Expected: abort with
`PostgreSQL binaries found at C:\Program Files\PostgreSQL\18\bin outside the
selected -PostgresBinDir ... (re-run with the matching -PostgresBinDir, or
-SkipPostgres)`. Re-run with `-SkipPostgres` added. Expected: the guard is
skipped (no parallel instance is created by a run that does no Postgres work),
the run proceeds past the guards into the Deno/Postgres steps, and the other
binaries stay untouched; interrupt or let it finish on the test VM, then
`Remove-Item 'C:\Program Files\PostgreSQL\18\bin\pg_ctl.exe'`.

## F. Register-Services: -BindHost, -AppPort, -ServicePrefix

F0 - Precondition gate:

```powershell
(Get-Command .\deploy\windows\Register-Services.ps1).Parameters.ContainsKey('ServicePrefix')  # True
(Get-Command .\deploy\windows\Register-Services.ps1).Parameters.ContainsKey('BindHost')       # True
```

If either is `False`, the checkout predates the merged helper revision:
stop, sync the checkout (a real run aborts at this gate by design).

F1 - Default install enforces loopback via the helper:

```powershell
& C:\tools\nssm\nssm.exe dump SeaMonitorApp
Get-NetTCPConnection -LocalPort 8300 -State Listen | Select-Object LocalAddress,LocalPort
```

Expected: the app service command line carries the helper's listener with the
bind passed by setup (`127.0.0.1`) and port `8300`, and the listener's
`LocalAddress` is exactly `127.0.0.1` - not `0.0.0.0`, not `::`.

F2a - Same prefix, moved port: re-run the real setup with `-AppPort 8310`.
Expected: `SeaMonitorApp` refreshed, listener on `8310`, generated Caddyfile
`reverse_proxy 127.0.0.1:8310`, firewall/summary/health references to 8310
consistent.

F2b - Custom prefix, clean test VM: real run with `-ServicePrefix Test1`.
Expected: `Test1App/Test1Poller/Test1Alerts/Test1Caddy` registered, health
report and logs use the `Test1*` names; uninstall afterwards.

F3 - The only 0.0.0.0 mode: `-SkipCaddy -AllowLanAppPort
-AllowedLanRanges '10.0.0.0/8'` (no Caddy). Expected: the helper binds
`0.0.0.0:8300` (verify with `Get-NetTCPConnection`), firewall rule
`Barrier Monitor app (8300)` exists scoped to `10.0.0.0/8`, and port 80 stays
closed. Any other combination must keep `127.0.0.1`.

F4 - Helper-support gate: with the pre-merge `Register-Services.ps1` in the
checkout, a real run aborts with `does not declare -BindHost` / `does not
declare -ServicePrefix` instead of registering a service that ignores the
listener or the prefix.

## G. Backup task: -DbName, -PostgresBinDir

G1 - After a real run:

```powershell
schtasks /query /tn BarrierBackup /v /fo LIST
```

Expected: the task action contains the exact values passed by setup, e.g.
`-BackupDir "D:\backups\monitor" -DbName "monitor" -PostgresBinDir
"C:\sites\seacrest\.vendor\pgsql18\bin"`.

G2 - `schtasks /run /tn BarrierBackup`, then list `D:\backups\monitor`.
Expected: a fresh, non-empty dump appears within minutes. The merged
`Backup-Database.ps1` revision owns the file naming and must accept
`-DbName`/`-PostgresBinDir`; prove the right database was dumped with
`& <PostgresBinDir>\pg_restore.exe --list <dump>` (objects from `-DbName`,
not a hardcoded one).

G3 - Real run with `-DbName barreiras -PostgresBinDir 'C:\Program
Files\PostgreSQL\16\bin'`. Expected: the task carries those exact values and a
manual task run dumps `barreiras`.

G4 - `-SkipBackup`. Expected: no `BarrierBackup` task registered and the
summary says backups were skipped.

## H. Caddy validate and public URL

H1 - `& C:\tools\caddy\caddy.exe validate --config
C:\srv\barrier-monitor\caddy\Caddyfile --adapter caddyfile` prints `Valid
configuration` and exits `0` (the setup already aborts on failure; this is the
manual confirmation).

H2 - With `-Hostname <monitor.example.com>` (DNS A record pointing here, 80 +
443 reachable): `Invoke-WebRequest https://<monitor.example.com>/login
-UseBasicParsing` returns 200/302 over a valid certificate. If not, check
`C:\srv\barrier-monitor\logs\SeaMonitorCaddy-err.log` for certificate-issuance
errors (Caddy retries automatically while DNS propagates).

H3 - IP mode (no `-Hostname`, Caddy enabled): from a PC inside an
`-AllowedLanRanges` range, `Invoke-WebRequest http://<server-ip>/login`
returns 200; from outside the range it is refused.

H4 - Loopback posture: from another PC,
`Test-NetConnection <server-ip> -Port 8300` reports `TcpTestSucceeded: False`
(the helper binds the app to 127.0.0.1; only the F3 LAN mode may differ).

## I. .env writer runtime round-trip and fail-closed values

The writer emits no escapes: values containing `"` or `\` are refused, values
with whitespace/`#`/`'` are plain-quoted, everything else is bare. Both
readers (Deno `--env-file` at runtime and `scripts/doctor.ts`) must read the
same value.

I1 - Fresh install (empty `-InstallDir`) with
`-CompanyName "Seacrest Petróleo LTDA #1"` (inner space + `#`). Expected: the
`.env` line is `COMPANY_NAME="Seacrest Petróleo LTDA #1"` - plain double
quotes, no backslashes anywhere in the file.

I2 - Both readers agree: in the install dir, `deno task doctor` exits `0` and
reports the expected database identity, and the login page (browser tab title
and brand line) shows `Seacrest Petróleo LTDA #1` exactly once per brand spot

- identical through the runtime reader and the doctor reader.

I3 - Fail closed: fresh `-InstallDir`, first with `-CompanyName 'Acme\Traders'`
and then with `-CompanyName 'Say "hi"'`. Expected: each run aborts at the .env
step with `SETUP ABORTED: value for COMPANY_NAME contains a double quote or
backslash; ...`, exit code `1`; a re-run with a value without those characters
completes.

I4 - Single-quote edge: `-CompanyName "it's"`. Expected: `.env` shows
`COMPANY_NAME="it's"` and both the doctor output and the UI brand line read
`it's`.

## J. Zero-git bootstrap (once per release)

```powershell
powershell -ExecutionPolicy Bypass -File .\deploy\windows\Bootstrap.ps1 `
  -RepoZipUrl https://github.com/<org>/<repo>/archive/refs/heads/master.zip `
  -CheckOnly -AdminEmail you@example.com
```

Expected: zip downloaded and expanded to `C:\srv\barrier-monitor`, then the
real setup starts (UAC prompt) and prints the readiness plan; exit code `0`.
Passing `-DbPassword ...` to Bootstrap.ps1 aborts before anything is
downloaded.

## Sign-off

Fill this in on the target host. Every row must be PASS on Windows Server
2022/2025 before production; re-run the whole checklist after any change to
`Setup-Production.ps1`, `Setup.cmd`, `Bootstrap.ps1`, `Register-Services.ps1`,
`Backup-Database.ps1` or the .env writer.

| Step | Host (name + OS build) | Date | Result (PASS/FAIL/code-verified) | Notes |
| ---- | ---------------------- | ---- | -------------------------------- | ----- |
| A1   |                        |      |                                  |       |
| A2   |                        |      |                                  |       |
| A3   |                        |      |                                  |       |
| A4   |                        |      |                                  |       |
| B1   |                        |      |                                  |       |
| B2   |                        |      |                                  |       |
| B3   |                        |      |                                  |       |
| C1   |                        |      |                                  |       |
| C2   |                        |      |                                  |       |
| C3   |                        |      |                                  |       |
| C4   |                        |      |                                  |       |
| D1   |                        |      |                                  |       |
| D2   |                        |      |                                  |       |
| D3   |                        |      |                                  |       |
| E1   |                        |      |                                  |       |
| E2   |                        |      |                                  |       |
| E3   |                        |      |                                  |       |
| F0   |                        |      |                                  |       |
| F1   |                        |      |                                  |       |
| F2a  |                        |      |                                  |       |
| F2b  |                        |      |                                  |       |
| F3   |                        |      |                                  |       |
| F4   |                        |      |                                  |       |
| G1   |                        |      |                                  |       |
| G2   |                        |      |                                  |       |
| G3   |                        |      |                                  |       |
| G4   |                        |      |                                  |       |
| H1   |                        |      |                                  |       |
| H2   |                        |      |                                  |       |
| H3   |                        |      |                                  |       |
| H4   |                        |      |                                  |       |
| I1   |                        |      |                                  |       |
| I2   |                        |      |                                  |       |
| I3   |                        |      |                                  |       |
| I4   |                        |      |                                  |       |
| J    |                        |      |                                  |       |

Finish with `powershell -ExecutionPolicy Bypass -File
.\deploy\windows\Test-BarrierHealth.ps1` and `deno task doctor` in the install
dir; both must be green and their output attached to the release notes.
