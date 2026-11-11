@echo off
title MES Level 3 - Unified Kepware OPC UA & SQL Historian Gateway
cd /d "%~dp0"
echo ======================================================================
echo    ISA-95 LEVEL 3 MOM - UNIFIED KEPWARE OPC UA & SQL GATEWAY
echo    Target OPC UA Endpoint: opc.tcp://127.0.0.1:49320
echo    Target SQL Historian:   localhost\WINCC [MES_Milk_Production]
echo    Local FastAPI Port:     http://127.0.0.1:8000
echo ======================================================================
echo.

set "PY_CMD="

:: 1. Priority 1: Check Python 3.12 via py launcher
py -3.12 -c "import pyodbc, fastapi" >nul 2>&1
if %ERRORLEVEL% equ 0 (
    set "PY_CMD=py -3.12"
    goto :launch
)

:: 2. Priority 2: Check standard Python 3.12 installation directory
if exist "%LOCALAPPDATA%\Programs\Python\Python312\python.exe" (
    "%LOCALAPPDATA%\Programs\Python\Python312\python.exe" -c "import pyodbc, fastapi" >nul 2>&1
    if %ERRORLEVEL% equ 0 (
        set "PY_CMD=%LOCALAPPDATA%\Programs\Python\Python312\python.exe"
        goto :launch
    )
)

:: 3. Priority 3: Check default py launcher
py -c "import pyodbc, fastapi" >nul 2>&1
if %ERRORLEVEL% equ 0 (
    set "PY_CMD=py"
    goto :launch
)

:: 4. Priority 4: Check default ambient python
python -c "import pyodbc, fastapi" >nul 2>&1
if %ERRORLEVEL% equ 0 (
    set "PY_CMD=python"
    goto :launch
)

:: 5. Priority 5: Fallback to any python found on PATH
where python >nul 2>nul
if %ERRORLEVEL% equ 0 (
    set "PY_CMD=python"
    goto :launch
)

:launch
if defined PY_CMD (
    echo [INFO] Starting Unified MES Backend Gateway with: %PY_CMD%
    %PY_CMD% kepware_gateway.py
) else (
    echo [ERROR] No compatible Python runtime with pyodbc and fastapi was found.
    pause
)
