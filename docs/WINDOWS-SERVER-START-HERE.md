# Windows Server: start here

Whole install is a few pasted commands. Scripts explain themselves; nothing happens without typed YES; uninstaller undoes it. Budget about one hour first time.

## Before access

Ask for: RDP access, local administrator credentials, server IP, outbound internet, and the user network range.

## Concepts

- RDP: remote desktop to the server.
- Administrator PowerShell: elevated terminal.
- Service: program Windows starts at boot.
- Firewall: opens only port 80, optionally office-only.
- PostgreSQL: database for barriers, users and history.

## Install

1. Connect via RDP.
2. Open PowerShell as Administrator.
3. Run the install command from `docs/DEPLOY-WINDOWS.md`.
4. Follow prompts; save printed secrets.

## After install

Open the dashboard URL, sign in with the admin account, and run `deno task doctor` if needed. Backups run nightly.
