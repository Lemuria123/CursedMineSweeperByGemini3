@echo off
echo ============================================
echo  Cursed Minesweeper - Dev Environment
echo ============================================
echo.

REM Set encryption key
set ENCRYPTION_KEY=0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef

echo [1/2] Starting game server (API :38001 + Admin :38002)...
start "CMS Server" cmd /c "cd /d "%~dp0server" && npx ts-node --transpile-only src/index.ts"

timeout /t 3 /nobreak >nul

echo [2/2] Starting frontend dev server (Vite :5173)...
start "CMS Frontend" cmd /c "cd /d "%~dp0" && npx vite --host"

timeout /t 3 /nobreak >nul

echo.
echo ============================================
echo  All services started!
echo    Frontend:   http://localhost:5173
echo    Game API:   http://localhost:38001
echo    Admin:      http://localhost:38002  (password: admin)
echo ============================================
echo.
echo Close the console windows to stop services,
echo or run stop-dev-server.bat
echo.
pause
