@echo off
title UCS CRM - Start All
set ROOT=C:\Users\Administrator\Desktop\UCS_CRM

echo [1/4] Starting backend...
cd /d %ROOT%\backend
start "UCS-Backend" /b "C:\Program Files\nodejs\node.exe" src\index.js
timeout /t 12 /nobreak >nul

echo [2/4] Starting frontend (network-exposed)...
cd /d %ROOT%\client
start "UCS-Frontend" /b cmd /c "npm run dev -- --host"
timeout /t 15 /nobreak >nul

echo [3/4] Starting webhook server...
cd /d %ROOT%
start "UCS-Webhook" /b powershell -ExecutionPolicy Bypass -File "%ROOT%\scripts\run-webhook.ps1"
timeout /t 3 /nobreak >nul

echo [4/4] Starting ngrok tunnel...
if defined NGROK_DOMAIN (
  start "UCS-Ngrok" /b ngrok http --domain=%NGROK_DOMAIN% 9000
) else (
  start "UCS-Ngrok" /b ngrok http 9000
)

echo.
echo Done. Open http://192.168.1.152:5173 in your browser.
echo ngrok dashboard: http://localhost:4040
echo Dashboard: http://localhost:9999
pause