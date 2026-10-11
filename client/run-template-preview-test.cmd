@echo off
REM Server-render tests for the template preview and the template message bubble.
REM A production build does NOT catch undefined variables in JSX (a bare `i` is
REM a legal global until render), so these renders are the guard.
cd /d "%~dp0"
set D=src\panels\fro\components\enhanced
REM Bundled output must sit inside the client tree, otherwise Node cannot
REM resolve react from node_modules.
set OUT=__tpl-render-test.mjs
set DEFINE=--define:import.meta.env="{\"VITE_API_URL\":\"http://localhost:5000/api\"}"
set FAILED=0

for %%F in (%D%\*.render.test.mjs) do (
  echo === %%~nxF ===
  npx esbuild "%%F" --bundle --platform=node --format=esm --jsx=automatic %DEFINE% --outfile="%OUT%" --external:react --external:react-dom --log-level=error
  if errorlevel 1 ( set FAILED=1 & goto :done )
  node "%OUT%"
  if errorlevel 1 set FAILED=1
)

:done
del /q "%OUT%" 2>nul
if "%FAILED%"=="1" ( echo RESULT: FAILURES & exit /b 1 )
echo RESULT: ALL RENDER TESTS PASS
exit /b 0
