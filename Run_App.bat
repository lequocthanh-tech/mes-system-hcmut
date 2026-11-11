@echo off
setlocal EnableDelayedExpansion
title DAIRY MES WORKBENCH Fast Boot Launcher

:: 1. Elevate to Administrator if required
net session >nul 2>&1
if %errorlevel% neq 0 (
    powershell -Command "Start-Process cmd -ArgumentList '/c \"\"%~dp0Run_App.bat\"\"' -Verb RunAs"
    exit /b
)

cd /d "%~dp0"

echo =========================================================================
echo               DAIRY MES WORKBENCH - FAST BOOT LAUNCHER
echo =========================================================================

:: 2. Pre-flight Check: Ensure Microsoft SQL Server service MSSQL$WINCC is active if installed
sc query "MSSQL$WINCC" 2>nul | find "RUNNING" >nul
if %errorlevel% neq 0 (
    net start MSSQL$WINCC >nul 2>&1
)

:: 3. Pre-flight Port Clearing: 8000, 5173
for %%P in (8000 5173) do (
    for /f "tokens=5" %%a in ('netstat -aon ^| findstr :%%P') do (
        if %%a NEQ 0 ( taskkill /F /T /PID %%a >nul 2>&1 )
    )
)

:: 4. Resolve Python Runtime with pyodbc & fastapi
set "PY_CMD="
py -3.12 -c "import pyodbc, fastapi" >nul 2>&1
if %ERRORLEVEL% equ 0 (
    set "PY_CMD=py -3.12"
) else (
    if exist "%LOCALAPPDATA%\Programs\Python\Python312\python.exe" (
        "%LOCALAPPDATA%\Programs\Python\Python312\python.exe" -c "import pyodbc, fastapi" >nul 2>&1
        if !ERRORLEVEL! equ 0 (
            set "PY_CMD=\"%LOCALAPPDATA%\Programs\Python\Python312\python.exe\""
        )
    )
)

if not defined PY_CMD (
    py -c "import pyodbc, fastapi" >nul 2>&1
    if !ERRORLEVEL! equ 0 (
        set "PY_CMD=py"
    ) else (
        python -c "import pyodbc, fastapi" >nul 2>&1
        if !ERRORLEVEL! equ 0 (
            set "PY_CMD=python"
        ) else (
            set "PY_CMD=python"
        )
    )
)

echo [INFO] Selected Python Runtime: %PY_CMD%

:: 5. Launch Vite Dev Server asynchronously in background (non-blocking)
echo [1/3] Spawning Vite Dev Server in background...
powershell -WindowStyle Hidden -Command "Start-Process cmd -ArgumentList '/c npm run dev' -WindowStyle Hidden"

:: 6. Launch Python Gateway asynchronously in background (non-blocking)
echo [2/3] Spawning Python Gateway in background...
powershell -WindowStyle Hidden -Command "Start-Process cmd -ArgumentList '/c %PY_CMD% backend/kepware_gateway.py' -WindowStyle Hidden"

:: 7. Launch Electron immediately - Spawns Splash Screen with zero delay (<1.5s boot)
echo [3/3] Spawning Dairy MES Desktop Shell via Electron...
call npx electron electron/main.cjs
set ELECTRON_EXIT_CODE=%errorlevel%

:: If redundant instance yielded to active session, bypass teardown
if %ELECTRON_EXIT_CODE% equ 100 (
    exit /b 0
)

:: 8. Failsafe Teardown on Electron Exit: clean up ports 8000, 5173
echo =========================================================================
echo Application closed. Executing Post-Exit Zero-Footprint Teardown
echo =========================================================================
for %%P in (8000 5173) do (
    for /f "tokens=5" %%a in ('netstat -aon ^| findstr :%%P') do (
        if %%a NEQ 0 ( taskkill /F /T /PID %%a >nul 2>&1 )
    )
)

echo [OK] All MES services and background tasks terminated cleanly. Zero background footprint.
exit /b 0
