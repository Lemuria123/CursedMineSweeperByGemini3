@echo off
echo ============================================
echo  Stopping Cursed Minesweeper services...
echo ============================================

REM Kill processes on ports 38001, 38002, and 5173
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":38001 " ^| findstr "LISTENING"') do (
    echo Killing game API on port 38001 (PID %%a)...
    taskkill /F /PID %%a 2>nul
)

for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":38002 " ^| findstr "LISTENING"') do (
    echo Killing admin panel on port 38002 (PID %%a)...
    taskkill /F /PID %%a 2>nul
)

for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":5173 " ^| findstr "LISTENING"') do (
    echo Killing frontend on port 5173 (PID %%a)...
    taskkill /F /PID %%a 2>nul
)

echo.
echo All services stopped.
pause
