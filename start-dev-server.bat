@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"

echo ============================================
echo   Cursed Minesweeper - Dev Environment
echo ============================================
echo.

REM --- Check port conflicts ---
set "PORT_CONFLICT=0"
for %%P in (38001 38002 5173) do (
    netstat -ano 2>nul | findstr /R /C:":%%P " | findstr "LISTENING" >nul
    if !errorlevel! equ 0 (
        echo [WARNING] Port %%P is already in use.
        set "PORT_CONFLICT=1"
    )
)
if !PORT_CONFLICT! equ 1 (
    echo.
    echo Aborting: one or more required ports are already occupied.
    echo Please run stop-dev-server.bat first.
    echo.
    pause
    exit /b 1
)

REM --- Store key for child process ---
set "KEY=0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"

REM --- Start game server ---
echo [1/2] Starting game server ^(API :38001 + Admin :38002^)...
start "CMS Server" cmd /k "set ENCRYPTION_KEY=%KEY% && npm run dev:server"

REM --- Wait for server health check (max 60s) ---
echo    Waiting for server to be ready...
<nul set /p "="   Polling"
for /L %%i in (1,1,60) do (
    timeout /t 1 /nobreak >nul
    curl -s --connect-timeout 2 http://localhost:38001/api/health >nul 2>&1
    if !errorlevel! equ 0 (
        echo  OK
        goto :server_ok
    )
    <nul set /p "=."
)
echo.
echo [ERROR] Server failed to respond within 60 seconds.
echo          Check the "CMS Server" console window for errors.
echo.
pause
exit /b 1

:server_ok

REM --- Start frontend dev server ---
echo [2/2] Starting frontend dev server ^(Vite :5173^)...
start "CMS Frontend" cmd /k npm run dev

REM --- Wait for frontend (max 30s) ---
echo    Waiting for frontend to be ready...
<nul set /p "="   Polling"
for /L %%i in (1,1,30) do (
    timeout /t 1 /nobreak >nul
    curl -s --connect-timeout 2 http://localhost:5173 >nul 2>&1
    if !errorlevel! equ 0 (
        echo  OK
        goto :frontend_ok
    )
    <nul set /p "=."
)
echo.
echo [WARNING] Frontend did not respond within 30 seconds.
echo           Check the "CMS Frontend" console window for errors.

:frontend_ok
echo.
echo ============================================
echo   All services started!
echo     Frontend:  http://localhost:5173
echo     Game API:  http://localhost:38001
echo     Admin:     http://localhost:38002  ^(password: admin^)
echo ============================================
echo.
echo Close the console windows to stop services,
echo or run stop-dev-server.bat
echo.
pause
