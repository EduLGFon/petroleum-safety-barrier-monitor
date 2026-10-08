# Windows Server: start here (no experience needed)

You can do this. The whole install is three pasted commands, the scripts
explain themselves as they run, nothing happens without your typed YES, and
there is an uninstaller that undoes it. Budget ~1 hour the first time (mostly
waiting on downloads), plus whatever your IT contact needs to grant access.

## 0. Before you have access — ask for these five things

Email whoever provisions the server (IT, hosting, the client) exactly this:

1. **RDP access** to the Windows Server (2022 or 2025) — that's Remote
   Desktop, i.e. the server's screen in a window on your PC.
2. **A local administrator account** (username + password). Plain-user
   accounts cannot install anything; the scripts refuse without elevation.
3. **The server's IP address** on the office network (ask: "is it static?").
   Users will open `http://THAT-IP` in their browsers. No domain is needed.
4. **Outbound internet on the server** (to download Postgres, Deno, Caddy).
   If the server is offline-only, stop here and say so — the install needs
   downloads, done once.
5. **Which network the users sit on** (e.g. `192.168.1.0/24`). You will scope
   the firewall to it. "Everyone on the office wifi/LAN" is a fine answer.

## 1. Five concepts, two minutes

- **RDP**: an app (`mstsc` on Windows) that shows the server desktop.
  Everything below happens *inside that window*, on the server.
- **Administrator PowerShell**: the blue terminal, explicitly elevated
  (title bar says "Administrator"). Installing = writing to `C:\Program
  Files`, registering services — Windows demands elevation for that.
- **A service**: a program Windows starts by itself at boot and restarts on
  crash. The dashboard, the sync loop and the alert loop each become one.
  Reboot-safe by construction.
- **Firewall**: the bouncer. The setup opens **only port 80** (the website),
  optionally limited to your office network. Port 8000 (the raw app) stays
  reachable from inside the server only. Nothing else is opened.
- **PostgreSQL**: the filing cabinet where barriers, users and history live.
  You never touch it directly; the app and the nightly backup do.

## 2. Connect and open the terminal

1. On your PC press `Win+R`, type `mstsc`, Enter. Enter the server IP,
   then the administrator username/password. Accept the certificate warning
   (it just means the server uses a self-signed RDP cert — normal).
2. On the server: click Start, type `PowerShell`, right-click
   **Windows PowerShell → Run as administrator**, accept the UAC "Do you
   want to allow…" prompt. The window title must say **Administrator**.
3. Pasting: copy on your PC (`Ctrl+C`), then click inside the server window
   and press `Ctrl+V` (or right-click). Pasting whole multi-line blocks is
   fine — PowerShell runs them in order.

> "Windows protected your PC / Unknown publisher" when running a script is
> the execution policy, not a virus: our commands include
> `-ExecutionPolicy Bypass`, which relaxes it for that one run only.

## 3. The three commands (in order)

All run in that Administrator PowerShell. Replace `ORG/REPO` with the real
repository path (ask whoever gave you this project).

**Command 1 — get the code** (no git needed):

```powershell
mkdir C:\srv\barrier-monitor; cd C:\srv\barrier-monitor
Invoke-WebRequest https://github.com/ORG/REPO/archive/refs/heads/master.zip -OutFile repo.zip
Expand-Archive repo.zip .; Copy-Item repo-master\* . -Recurse -Force
```

**Command 2 — dry run: see the full plan, change nothing.** Fill in your
values (admin email is required; everything else has a safe default):

```powershell
.\deploy\windows\Setup.cmd -CheckOnly -CompanyName "Your Company" -AdminEmail you@example.com -AllowedLanRanges '192.168.0.0/16'
```

Read the output: every line starts with PASS (good), WARN (acceptable, read
it), FAIL (must fix first) or INFO/PLAN. `-AllowedLanRanges` takes the
answer from section 0, item 5 — ask IT for your office subnet if unsure;
leaving it out works but leaves port 80 open to the whole network.

**Command 3 — the real install** (same line, minus `-CheckOnly`):

```powershell
.\deploy\windows\Setup.cmd -CompanyName "Your Company" -AdminEmail you@example.com -AllowedLanRanges '192.168.0.0/16'
```

It prints each step (`==> …`), then asks for a typed `YES` — nothing is
installed, downloaded or changed before that. Expect 10–30 minutes
(Postgres is a ~350 MB download). At the end it prints the user URL
(`http://SERVER-IP`), the admin login, and any generated passwords under a
**STORE THESE NOW** banner: copy those into your password manager
immediately — they are never shown again and never written to any log.

## 4. Prove it works (two checks)

1. On the server: `http://localhost:8000/api/health` should show
   `{"ok":true,…}` — or just run the diagnostics:
   ```powershell
   powershell -ExecutionPolicy Bypass -File .\deploy\windows\Test-BarrierHealth.ps1
   ```
   All PASS (or INFO) = healthy. WARN = read it, usually fine. FAIL = the
   line tells you exactly what is wrong.
2. From any office PC browser: open `http://SERVER-IP`, log in with the
   admin email. If the server is unreachable, the office PC is on a
   different network/VLAN — that is a network question for IT, not an app
   problem (the diagnostics on the server will still be green).

## 5. Answers to the scary questions

- **Will this break other things on the server?** It only *adds*: three
  folders (`C:\srv\barrier-monitor`, `C:\tools`, Postgres), four services,
  one firewall rule, one nightly task. It never modifies existing software.
  Ports used: 80 (website), 8000 (loopback only), 5432 (database, localhost
  only). If any of those is taken, `-CheckOnly` tells you first.
- **Can I run it twice?** Yes — it is idempotent. Re-running pulls updates,
  rebuilds, migrates and restarts; your `.env` secrets are never rotated.
- **What if the power goes out?** Everything is a service with auto-start:
  on boot, Postgres → app → sync → alerts come back alone. Rerun the health
  script to confirm.
- **Do users install anything?** No. Any modern browser, no plugins.
- **HTTP without a lock icon — is that ok?** Inside a trusted office
  network/VPN: yes, standard practice for internal tools, and passwords
  still travel only within your LAN. Never expose port 80 to the internet
  without a domain + https. When a domain exists, re-run the same command
  with `-Hostname your.domain.com` added — you get automatic https and
  nothing else changes.
- **How do I update later?** Re-run command 3. That is the whole procedure.
- **How do I undo everything?** `Uninstall-Production.ps1` removes services,
  firewall rules and the backup task but *keeps data and code* by default,
  so you can reinstall right after. Deleting data needs extra typed
  confirmations plus takes a final backup first.

## 6. When something fails — the drill

1. Re-run the health script (section 4) and read only the FAIL lines.
2. Match them here:

| FAIL line says | Meaning | Fix |
|---|---|---|
| `service BarrierX: Stopped/Failed` | crashed or never started | open `C:\srv\barrier-monitor\logs\BarrierX-err.log`, read the last lines |
| `/api/health: unreachable` | app not answering | is `BarrierApp` Running? did the install finish, or did the YES prompt time out? |
| `db: query failed` | Postgres down or wrong password | is `postgresql-x64-16` Running? (`.env` untouched on re-runs — check for manual edits) |
| `port 80: nothing listening` | Caddy missing/crashed | `logs\BarrierCaddy-err.log`; port 80 may be taken by IIS/Skype — stop it or uninstall it |
| `backup: no dumps / EMPTY` | night task never ran or failed | run `Backup-Database.ps1` by hand once and read its error |
| download/HEAD failures in `-CheckOnly` | no outbound internet / proxy | give the server internet or a proxy; nothing else proceeds without downloads |

3. Still stuck? Copy the FAIL lines plus the last 20 lines of the relevant
   `logs\*-err.log` and send them to whoever supports you — that packet is
   always sufficient to diagnose remotely. Never send your `.env`.

## 7. First-week chores (15 minutes, do them once)

- Log in as the admin, change the password (avatar → password change).
- Confirm one backup file exists in `D:\backups\barreiras` the morning after
  install (files are named `barreiras-<date>.dump`).
- Save the STORE-THESE-NOW secrets in the team vault, then clear the
  terminal scrollback (right-click → Clear, or just close the window).
- Write down the server IP + admin email somewhere the team finds them.
