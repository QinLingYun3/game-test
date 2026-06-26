@echo off
chcp 65001 >nul
setlocal EnableDelayedExpansion

set SCRIPT_DIR=%~dp0

echo [Step 1/3] 停止已有进程...

for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":3333 " ^| findstr "LISTENING"') do (
    taskkill /PID %%a /F >nul 2>&1
    if !errorlevel! equ 0 ( echo [OK] 后台 3333 已停止 ) else ( echo [WARN] 后台 3333 停止失败 )
)

for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":5555 " ^| findstr "LISTENING"') do (
    taskkill /PID %%a /F >nul 2>&1
    if !errorlevel! equ 0 ( echo [OK] 前台 5555 已停止 ) else ( echo [WARN] 前台 5555 停止失败 )
)

timeout /t 2 /nobreak >nul

echo.
echo [Step 2/3] 启动后台 (3333)...
start "Game-Test-Backend" /min cmd /c "cd /d "%SCRIPT_DIR%" && set NODE_ENV=production && node server/server.js"
echo [OK] 后台已启动

echo.
echo [Step 3/3] 启动前台 (5555)...
start "Game-Test-Frontend" /min cmd /c "cd /d "%SCRIPT_DIR%" && npx vite preview --port 5555 --host 0.0.0.0"
echo [OK] 前台已启动

echo.
echo ===== 重启完成 =====
echo 后台: http://localhost:3333
echo 前台: http://localhost:5555

endlocal
