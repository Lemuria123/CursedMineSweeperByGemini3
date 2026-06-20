@echo off
setlocal enabledelayedexpansion

echo ============================================
echo   Stopping Cursed Minesweeper services...
echo ============================================
echo.

set "FOUND=0"

REM ── 按端口查找并终止进程，使用 /T 递归杀死子进程 ──
REM ── 每个端口独立循环，带中文标签 ──
REM ── 38001: 游戏 API ──
for /f "tokens=5" %%a in ('netstat -ano 2^>nul ^| findstr /R /C:":38001 " ^| findstr "LISTENING"') do (
    set "FOUND=1"
    echo [38001 Game API ^] Killing PID %%a and children...
    taskkill /F /T /PID %%a 2>nul
    if !errorlevel! equ 0 (
        echo     Process terminated successfully.
    ) else (
        echo     Process may have already exited.
    )
)

REM ── 38002: 管理后台 ──
for /f "tokens=5" %%a in ('netstat -ano 2^>nul ^| findstr /R /C:":38002 " ^| findstr "LISTENING"') do (
    set "FOUND=1"
    echo [38002 Admin Panel] Killing PID %%a and children...
    taskkill /F /T /PID %%a 2>nul
    if !errorlevel! equ 0 (
        echo     Process terminated successfully.
    ) else (
        echo     Process may have already exited.
    )
)

REM ── 5173: Vite 前端 ──
for /f "tokens=5" %%a in ('netstat -ano 2^>nul ^| findstr /R /C:":5173 " ^| findstr "LISTENING"') do (
    set "FOUND=1"
    echo [5173 Vite Frontend] Killing PID %%a and children...
    taskkill /F /T /PID %%a 2>nul
    if !errorlevel! equ 0 (
        echo     Process terminated successfully.
    ) else (
        echo     Process may have already exited.
    )
)

if !FOUND! equ 0 (
    echo.
    echo No Cursed Minesweeper services were found running on ports 38001/38002/5173.
)

echo.
echo Done.
pause
