@echo off
setlocal
cd /d "%~dp0"
echo Strata Workflow App — Sales Presentation
echo.

REM Prefer local server — most reliable across browsers
where python >nul 2>&1 && set PY=python && goto :serve
where py >nul 2>&1 && set PY=py && goto :serve

echo Python was not found. Opening index.html directly...
echo If you see a blank page, install Python from python.org and run this file again.
start "" "%~dp0index.html"
pause
exit /b 0

:serve
echo Starting local server at http://localhost:8765
echo Press Ctrl+C to stop.
start "" "http://localhost:8765"
%PY% -m http.server 8765
