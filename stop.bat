@echo off
title UCS CRM - Stop Everything
cd /d C:\Users\Administrator\Desktop\UCS_CRM

echo   Stopping all UCS services...

for %%P in (5000 5173 9000 9999) do (
  for /f "tokens=5" %%a in ('netstat -ano ^| findstr :%%P ^| findstr LISTENING') do (
    echo     stopping port %%P
    taskkill /F /PID %%a >nul 2>&1
  )
)

taskkill /F /IM cloudflared.exe >nul 2>&1
taskkill /FI "WINDOWTITLE eq UCS Backend" >nul 2>&1
taskkill /FI "WINDOWTITLE eq UCS Frontend" >nul 2>&1
taskkill /FI "WINDOWTITLE eq UCS Webhook" >nul 2>&1
taskkill /FI "WINDOWTITLE eq UCS Dashboard" >nul 2>&1
taskkill /FI "WINDOWTITLE eq UCS Tunnel*" >nul 2>&1

echo.
echo   All stopped.
timeout /t 3 >nul