@echo off
echo =========================================================================
echo Stopping all DAIRY MES WORKBENCH and Gateway background processes...
echo =========================================================================
for %%P in (8000 5173) do (
    for /f "tokens=5" %%a in ('netstat -aon ^| findstr :%%P') do (
        if %%a NEQ 0 ( taskkill /F /T /PID %%a >nul 2>&1 )
    )
)
echo [OK] All MES services on ports 8000 and 5173 terminated cleanly.
pause
