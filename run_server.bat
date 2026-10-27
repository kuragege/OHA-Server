@echo off
cd /d "%~dp0"

if not exist config.json (
    echo [ERROR] config.json not found.
    pause
    exit /b 1
)

python app.py

echo.
echo Server stopped.
pause