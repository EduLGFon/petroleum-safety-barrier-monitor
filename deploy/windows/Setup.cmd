@echo off
REM Double-clickable launcher for Barrier Monitor production setup.
REM Why it exists: servers ship with Restricted execution policy and a plain
REM user shell, so pasting a powershell.exe line fails on policy first.
REM This launcher forwards every argument raw to Setup-Production.ps1
REM with `powershell -File ... %*` (raw cmd forwarding, no -Command string
REM splicing): spaces, quotes, $ and backticks in values survive intact.
REM Setup-Production.ps1 self-elevates for the UAC prompt by encoding the
REM whole child invocation (script path + non-secret arguments) in
REM -EncodedCommand, so run or double-click this file from any shell. Secret
REM env vars do not cross that UAC hop: set them in an elevated shell instead.
REM In an already elevated shell, -NoElevate skips the UAC hop entirely.
REM Limitation: cmd still expands %VAR% inside %* (Disable-DelayedExpansion
REM only protects !), so a value containing % must invoke Setup-Production.ps1
REM directly from PowerShell instead of via this .cmd.
REM   Setup.cmd -Hostname monitor.example.com -AdminEmail you@example.com -AllowedLanRanges "10.0.0.0/8"
REM Secrets are NEVER command-line arguments: a CLI value stays visible in
REM process lists and shell history. Set the environment variables
REM (ADMIN_PASSWORD, DB_PASSWORD, POSTGRES_SUPER_PASSWORD, FRACTTAL_SECRET) in
REM an already elevated PowerShell, or answer the prompts in the elevated
REM window. Passing a secret such as -AdminPassword or -DbPassword on the
REM command line aborts the setup.
setlocal DisableDelayedExpansion
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0Setup-Production.ps1" %*
exit /b %errorlevel%
