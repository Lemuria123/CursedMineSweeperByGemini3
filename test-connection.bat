@echo off
chcp 65001 >nul
echo ========================================
echo   连接测试工具
echo ========================================
echo.

echo [测试 1] 从电脑 ping 手机...
echo 请确保手机 IP 是 192.168.1.20
echo.
ping -n 2 192.168.1.20
echo.

echo [测试 2] 检查防火墙规则...
netsh advfirewall firewall show rule name="Vite Dev Server Port 3000" | findstr /i "已启用 配置文件"
echo.

echo [测试 3] 检查端口监听状态...
netstat -an | findstr ":3000" | findstr "LISTENING"
echo.

echo ========================================
echo   如果 ping 不通手机，可能的原因：
echo ========================================
echo 1. 路由器开启了 AP 隔离（客户端隔离）
echo    解决方法：登录路由器管理界面，关闭"AP 隔离"或"客户端隔离"
echo.
echo 2. 手机防火墙或安全软件阻止
echo    解决方法：检查手机的安全设置
echo.
echo 3. Windows 防火墙的公用网络配置
echo    解决方法：将网络类型改为"专用网络"
echo.
echo ========================================
pause

