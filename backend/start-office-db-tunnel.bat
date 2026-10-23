@echo off
title UCS CRM - office database exposed to the EC2 jump host
cd /d "%~dp0"

rem Run this ON the office machine (192.168.1.152), the one that can reach
rem Postgres on localhost:5432. It dials out to EC2, so it works behind NAT and
rem survives a changing public IP. Nothing is exposed to the internet: the port
rem is bound to the EC2 loopback interface only.
rem
rem To start it automatically at login, put a shortcut to this file in:
rem   %APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup

:loop
node scripts\local-db-tunnel.mjs expose
echo.
echo The tunnel stopped. Restarting in 10 seconds. Close this window to stop.
timeout /t 10 /nobreak >nul
goto loop
