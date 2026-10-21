@echo off
title UCS CRM - Start Everything
cd /d C:\Users\Administrator\Desktop\UCS_CRM

echo.
echo   ================================================
echo    UCS CRM - Local Development Environment
echo   ================================================
echo.

:: --- Free the ports we need ---
for %%P in (5000 5173 9000 9999) do (
  for /f "tokens=5" %%a in ('netstat -ano ^| findstr :%%P ^| findstr LISTENING') do (
    taskkill /F /PID %%a >nul 2>&1
  )
)

echo   [1/5] Dashboard server (9999)...
start "UCS Dashboard" /min cmd /c "node dashboard-server.mjs"
timeout /t 2 /nobreak >nul

echo   [2/5] Webhook server (9000)...
start "UCS Webhook" /min cmd /c "node webhook-server.js"
timeout /t 2 /nobreak >nul

echo   [3/5] Backend (5000)...
start "UCS Backend" /min cmd /c "cd backend && node src/index.js"
timeout /t 8 /nobreak >nul

echo   [4/5] Frontend (5173)...
start "UCS Frontend" /min cmd /c "cd client && npm run dev -- --host"
timeout /t 8 /nobreak >nul

echo   [5/5] Cloudflared tunnels + opening dashboard...
start "UCS Tunnel 1" /min cmd /c "cloudflared tunnel --metrics 127.0.0.1:20241 --url http://localhost:9000 2> cf-webhook.log"
start "UCS Tunnel 2" /min cmd /c "cloudflared tunnel --metrics 127.0.0.1:20242 --url http://localhost:5000 2> cf-backend.log"
timeout /t 6 /nobreak >nul
start "" http://localhost:9999

echo.
echo   ================================================
echo    All started.
echo    Dashboard:  http://localhost:9999
echo    Frontend:   http://192.168.1.152:5173
echo    Backend:    http://192.168.1.152:5000/api
echo   ================================================
echo.
echo   Services keep running in the background.
echo   To stop everything, run:  stop.bat
echo.
timeout /t 8 >nul