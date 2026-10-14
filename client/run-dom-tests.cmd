@echo off
REM Build + run the jsdom interaction tests for the composer components.
REM Clicks are really dispatched, so a button that silently does nothing fails here.
cd /d "%~dp0"
set DIR=src\panels\fro\components\enhanced
set OUT=%TEMP%\tpl-dom.mjs
set FAILED=0

for %%F in (%DIR%\*.dom.test.mjs %DIR%\*.send.test.mjs) do (
  echo === %%~nxF ===
  npx esbuild "%%F" --bundle --platform=node --format=esm --jsx=automatic --define:import.meta.env="{\"VITE_API_URL\":\"http://localhost:5000/api\"}" --outfile="%OUT%" --log-level=error
  if errorlevel 1 ( set FAILED=1 & goto :done )
  node "run-dom-test-helper.mjs" "%OUT%"
  if errorlevel 1 set FAILED=1
)

:done
del /q "%OUT%" 2>nul
if "%FAILED%"=="1" ( echo RESULT: FAILURES & exit /b 1 )
echo RESULT: ALL DOM TESTS PASS
exit /b 0
