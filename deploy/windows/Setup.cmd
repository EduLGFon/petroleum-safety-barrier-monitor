@echo off
REM Double-clickable launcher for Barrier Monitor production setup.
REM Why it exists: servers ship with Restricted execution policy and a plain
REM user shell, so pasting a powershell.exe line fails on policy first.
REM This launcher forwards every argument untouched to Setup-Production.ps1
REM with `powershell -File ... %*` (an argument array, no -Command string
REM splicing): spaces, quotes, $ and backticks in values survive intact.
REM Setup-Production.ps1 self-elevates for the UAC prompt with the same
REM argument array, so run or double-click this file from any shell.
REM   Setup.cmd -Hostname monitor.example.com -AdminEmail you@example.com -AllowedLanRanges "10.0.0.0/8"
REM Secrets are NEVER command-line arguments: a CLI value stays visible in
REM process lists and shell history. Set them as environment variables before
REM running (ADMIN_PASSWORD, DB_PASSWORD, POSTGRES_SUPER_PASSWORD,
REM FRACTTAL_SECRET) or answer the interactive prompts. Passing a secret such
REM as -AdminPassword or -DbPassword on the command line aborts the setup.
setlocal DisableDelayedExpansion
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0Setup-Production.ps1" %*
exit /b %errorlevel%
