@echo off
cd /d "%~dp0"
set OUT=%TEMP%\session-probe.mjs
npx esbuild session-realtime.probe.mjs --bundle --platform=node --format=esm --banner:js="import{createRequire as __cr}from'module';const require=__cr(import.meta.url);" --define:import.meta.env="{\"VITE_API_URL\":\"http://localhost:5000/api\",\"VITE_SOCKET_URL\":\"http://localhost:5000\"}" --outfile="%OUT%" --log-level=error
if errorlevel 1 ( echo BUILD FAILED & exit /b 1 )
node "%OUT%"
exit /b %errorlevel%
