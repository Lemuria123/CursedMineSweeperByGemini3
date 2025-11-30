@echo off
chcp 65001 >nul
echo ========================================
echo   被诅咒的扫雷游戏 - 启动脚本
echo ========================================
echo.

REM 检查 Node.js 是否安装
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [错误] 未检测到 Node.js，请先安装 Node.js
    echo 下载地址: https://nodejs.org/
    pause
    exit /b 1
)

echo [信息] 检测到 Node.js 版本:
node --version
echo.

REM 检查是否已安装依赖
if not exist "node_modules" (
    echo [信息] 检测到未安装依赖，正在安装...
    echo.
    call npm install
    if %errorlevel% neq 0 (
        echo [错误] 依赖安装失败
        pause
        exit /b 1
    )
    echo.
    echo [成功] 依赖安装完成
    echo.
) else (
    echo [信息] 依赖已存在，跳过安装步骤
    echo.
)

REM 启动开发服务器
echo [信息] 正在启动开发服务器...
echo.
echo ========================================
echo   访问地址
echo ========================================
echo [本地] http://localhost:3000
echo.

REM 获取本机 IP 地址
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /i "IPv4"') do (
    set IP=%%a
    set IP=!IP:~1!
    echo [局域网] http://!IP!:3000
    echo [提示] 在手机上访问上述地址（需在同一 WiFi 网络）
)
echo ========================================
echo [提示] 按 Ctrl+C 可以停止服务器
echo.

call npm run dev

pause


