@echo off
title UCS CRM - Webhook Log (Live)
cd /d C:\Users\Administrator\Desktop\UCS_CRM
echo Watching webhook.log for changes... (Ctrl+C to stop)
echo.
powershell -NoExit -Command "Get-Content 'C:\Users\Administrator\Desktop\UCS_CRM\webhook.log' -Wait -Tail 30"