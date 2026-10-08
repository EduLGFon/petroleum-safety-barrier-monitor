@echo off
REM Double-clickable launcher for Barrier Monitor production setup.
REM Why it exists: servers ship with Restricted execution policy and a plain
REM user shell, so pasting a powershell.exe line fails two ways (policy +
REM elevation). This re-launches Setup-Production.ps1 elevated with Bypass
REM and forwards all arguments. Quote values containing spaces.
REM   Setup.cmd -Hostname barreiras.example.com -AdminEmail you@example.com
powershell -NoProfile -Command "Start-Process powershell -Verb RunAs -ArgumentList '-NoProfile -ExecutionPolicy Bypass -File ""%~dp0Setup-Production.ps1"" %*'"
