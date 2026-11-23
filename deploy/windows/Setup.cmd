@echo off
REM Double-clickable launcher for Barrier Monitor production setup.
REM Why it exists: servers ship with Restricted execution policy and a plain
REM user shell, so pasting a powershell.exe line fails on policy first.
REM This launcher forwards every argument raw to Setup-Production.ps1
REM with `powershell -File ... %*` (raw cmd forwarding, no -Command string
REM splicing): spaces, quotes, $ and backticks in values survive intact.
REM Setup-Production.ps1 self-elevates for the UAC prompt via -EncodedCommand
REM plus an inherited env-var JSON blob, so run or double-click this file
REM from any shell. Limitation: cmd still expands %VAR% inside %* (Disable-
REM DelayedExpansion only protects !), so a value containing % must invoke
REM Setup-Production.ps1 directly from PowerShell instead of via this .cmd.
REM   Setup.cmd -Hostname monitor.example.com -AdminEmail you@example.com -AllowedLanRanges "10.0.0.0/8"
REM Secrets are NEVER command-line arguments: a CLI value stays visible in
REM process lists and shell history. Set them as environment variables before
REM running (ADMIN_PASSWORD, DB_PASSWORD, POSTGRES_SUPER_PASSWORD,
REM FRACTTAL_SECRET) or answer the interactive prompts. Passing a secret such
REM as -AdminPassword or -DbPassword on the command line aborts the setup.
setlocal DisableDelayedExpansion
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0Setup-Production.ps1" %*
exit /b %errorlevel%
