@echo off
REM NodePilot Single Port Stop Script for Windows

echo ⏹️  Stopping NodePilot...

REM Check if using PM2
where pm2 >nul 2>nul
if %ERRORLEVEL% EQU 0 (
    echo 📦 Stopping PM2 processes...
    pm2 stop nodepilot-frontend nodepilot-backend-proxy 2>nul
    pm2 delete nodepilot-frontend nodepilot-backend-proxy 2>nul
    echo ✅ PM2 processes stopped
) else (
    echo 📦 Stopping services by port...
    for /f "tokens=5" %%a in ('netstat -aon ^| find ":9000" ^| find "LISTENING"') do taskkill /F /PID %%a 2>nul
    for /f "tokens=5" %%a in ('netstat -aon ^| find ":9001" ^| find "LISTENING"') do taskkill /F /PID %%a 2>nul
    echo ✅ Services stopped
)

echo.
echo ✅ All services stopped
echo.
pause
