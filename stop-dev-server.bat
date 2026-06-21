@echo off
setlocal enabledelayedexpansion

echo ============================================
echo   Stopping Cursed Minesweeper services...
echo ============================================
echo.

set "FOUND=0"

REM --- Kill processes by port ---
for /f "tokens=5" %%a in ('netstat -ano 2^>nul ^| findstr /R /C:":38001 " ^| findstr "LISTENING"') do (
    set "FOUND=1"
    echo [38001 Game API] Killing PID %%a and children...
    taskkill /F /T /PID %%a 2>nul
    if !errorlevel! equ 0 (
        echo     Terminated.
    ) else (
        echo     Already exited.
    )
)

for /f "tokens=5" %%a in ('netstat -ano 2^>nul ^| findstr /R /C:":38002 " ^| findstr "LISTENING"') do (
    set "FOUND=1"
    echo [38002 Admin Panel] Killing PID %%a and children...
    taskkill /F /T /PID %%a 2>nul
    if !errorlevel! equ 0 (
        echo     Terminated.
    ) else (
        echo     Already exited.
    )
)

for /f "tokens=5" %%a in ('netstat -ano 2^>nul ^| findstr /R /C:":5173 " ^| findstr "LISTENING"') do (
    set "FOUND=1"
    echo [5173 Vite Frontend] Killing PID %%a and children...
    taskkill /F /T /PID %%a 2>nul
    if !errorlevel! equ 0 (
        echo     Terminated.
    ) else (
        echo     Already exited.
    )
)

if !FOUND! equ 0 (
    echo.
    echo No Cursed Minesweeper services found on ports 38001/38002/5173.
)

echo.
echo Done.
pause
