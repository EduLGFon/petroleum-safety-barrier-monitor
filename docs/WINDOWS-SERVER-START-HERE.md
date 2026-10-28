# Windows Server: start here (no experience needed)

Whole install is three pasted commands; scripts explain themselves; nothing
happens without typed YES; uninstaller undoes it. Budget ~1 hour first time
(mostly downloads) plus IT access.

## 0. Before access - ask for these five things
1. RDP access to Windows Server 2022/2025.
2. Local administrator account (username + password).
3. Server IP on office network (ask "is it static?"). Users open
   `http://THAT-IP`. No domain needed.
4. Outbound internet on server (downloads). Offline-only? Stop and say so.
5. Which network users sit on (e.g. `192.168.1.0/24`) for firewall scope.

## 1. Five concepts
- **RDP**: `mstsc` shows server desktop; everything below runs inside it.
- **Administrator PowerShell**: elevated blue terminal; installs need elevation.
- **Service**: program Windows starts at boot and restarts on crash. Dashboard,
  sync loop, alert loop each become one.
- **Firewall**: opens only port 80 (website), optionally office-only. Port 8300
  raw app stays server-local. Nothing else opened.
- **PostgreSQL**: filing cabinet for barriers/users/history; app and nightly
  backup touch it.

## 2. Connect and open terminal
1. PC: `Win+R` -> `mstsc`, enter server IP + admin creds, accept cert warning.
2. Server: Start -> `PowerShell` -> right-click **Windows PowerShell -> Run as
   administrator**, accept UAC. Title must say **Administrator**.
3. Paste with `Ctrl+V` (or right-click); multi-line blocks run in order.

> "Windows protected your PC / Unknown publisher" is execution policy, not a
> virus: commands include `-ExecutionPolicy Bypass` for that run only.

## 3. Three commands
Replace `ORG/REPO` with real path.

Command 1 - get code (no git):
```powershell
mkdir C:\srv\barrier-monitor; cd C:\srv\barrier-monitor
Invoke-WebRequest https://github.com/ORG/REPO/archive/refs/heads/master.zip -OutFile repo.zip
Expand-Archive repo.zip .; Copy-Item repo-master\* . -Recurse -Force
```

Command 2 - dry run (change nothing):
```powershell
.\deploy\windows\Setup.cmd -CheckOnly -CompanyName "Your Company" -AdminEmail you@example.com -AllowedLanRanges '192.168.0.0/16'
```
Output lines: PASS/WARN/FAIL/INFO/PLAN. `-AllowedLanRanges` from section 0 item 5;
omit works but opens port 80 to whole network.

Command 3 - real install (same minus `-CheckOnly`):
```powershell
.\deploy\windows\Setup.cmd -CompanyName "Your Company" -AdminEmail you@example.com -AllowedLanRanges '192.168.0.0/16'
```
Prints `==> ...` steps, asks typed `YES`. Expect 10-30 min (Postgres ~350 MB).
End prints user URL, admin login, generated passwords under **STORE THESE NOW**:
copy to password manager immediately; never shown again, never logged.

## 4. Prove it works
1. Server: `http://localhost:8300/api/health` should show `{"ok":true,...}` or
   run:
   ```powershell
   powershell -ExecutionPolicy Bypass -File .\deploy\windows\Test-BarrierHealth.ps1
   ```
   PASS/INFO = healthy, WARN = usually fine, FAIL = line says what is wrong.
2. Office PC browser: open `http://SERVER-IP`, log in as admin. Unreachable =
   network/VLAN issue for IT, not app (server diagnostics still green).

## 5. Scary questions
- Break other things? No - only adds folders/services/rule/task; never modifies
  existing software. Ports 80, 8300 (loopback), 5432 (localhost). `-CheckOnly`
  flags conflicts.
- Run twice? Yes, idempotent; re-runs pull/rebuild/migrate/restart; `.env`
  secrets never rotated.
- Power outage? All services auto-start: Postgres -> app -> sync -> alerts.
- Users install anything? No, any modern browser.
- HTTP no lock icon ok? Inside trusted office network/VPN yes; passwords stay
  in LAN. Never expose port 80 to internet without domain+https. Add
  `-Hostname your.domain.com` for auto https.
- Update later? Re-run command 3.
- Undo? `Uninstall-Production.ps1` removes services/rules/task but keeps data
  and code. Deleting data needs extra confirmations + final backup.

## 6. When something fails
1. Re-run health script, read only FAIL lines.
2. Match:
   | FAIL line | Meaning | Fix |
   | --- | --- | --- |
   | `service BarrierX: Stopped/Failed` | crashed/never started | read `logs\BarrierX-err.log` last lines |
   | `/api/health: unreachable` | app not answering | is `BarrierApp` Running? install finished? |
   | `db: query failed` | Postgres down/wrong password | is `postgresql-x64-16` Running? `.env` untouched on re-runs |
   | `port 80: nothing listening` | Caddy missing/crashed | `logs\BarrierCaddy-err.log`; port 80 may be IIS/Skype |
   | `backup: no dumps / EMPTY` | night task failed | run `Backup-Database.ps1` by hand |
   | download/HEAD failures | no outbound internet/proxy | give server internet/proxy |
3. Still stuck? Send FAIL lines + last 20 lines of relevant `logs\*-err.log`.
   Never send `.env`.

## 7. First-week chores
- Log in as admin, change password (avatar -> password change).
- Confirm backup file in `D:\backups\barreiras` next morning
  (`barreiras-<date>.dump`).
- Save STORE-THESE-NOW secrets in team vault, clear terminal scrollback.
- Write down server IP + admin email where team finds them.
