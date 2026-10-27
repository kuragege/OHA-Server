@echo off
cd /d "%~dp0"

echo [OpenHisAssistant v0.4.1] Removing deprecated test module...
if exist "modules\record-print-bridge.js" (
    del /f /q "modules\record-print-bridge.js"
    echo Removed: modules\record-print-bridge.js
) else (
    echo Deprecated module file not present.
)

echo Done.
pause
