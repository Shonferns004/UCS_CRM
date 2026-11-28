@echo off
setlocal
cd /d "%~dp0"

if not exist ".venv\Scripts\python.exe" (
  echo.
  echo Creating the Python environment...
  python -m venv .venv
  if errorlevel 1 goto :failed
  echo Installing dependencies...
  ".venv\Scripts\python.exe" -m pip install --upgrade pip
  ".venv\Scripts\python.exe" -m pip install -r requirements.txt
  if errorlevel 1 goto :failed
)

echo.
echo   Starting Aadhaar Scan
echo   Open http://localhost:8010 in your browser.
echo   The first start downloads the OCR models (about 100 MB).
echo.
".venv\Scripts\python.exe" server.py
goto :end

:failed
echo.
echo Something went wrong. Check the messages above.
pause

:end
endlocal
