@echo off
title UCS Dashboard
cd /d "%~dp0"

:: Watchdog: if dashboard-server.mjs ever exits (crash, port hiccup, etc.)
:: it is started again automatically. Delete .dashboard-stopped to allow it
:: to run; stop.bat creates that file so the watchdog stops fighting a stop.

:loop
if exist ".dashboard-stopped" goto wait

node dashboard-server.mjs
echo.
echo [watchdog] dashboard-server exited (code %errorlevel%). Restarting in 3s...
timeout /t 3 /nobreak >nul
goto loop

:wait
timeout /t 5 /nobreak >nul
goto loop
