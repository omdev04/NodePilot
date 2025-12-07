@echo off
REM NodePilot Single Port Startup Script for Windows

echo 🚀 Starting NodePilot in Single Port Mode...
echo.

cd /d "%~dp0"

REM Kill existing processes
echo 🧹 Cleaning up existing processes...
for /f "tokens=5" %%a in ('netstat -aon ^| find ":9000" ^| find "LISTENING"') do taskkill /F /PID %%a 2>nul
for /f "tokens=5" %%a in ('netstat -aon ^| find ":9001" ^| find "LISTENING"') do taskkill /F /PID %%a 2>nul

REM Check if PM2 is available
where pm2 >nul 2>nul
if %ERRORLEVEL% EQU 0 (
    echo 📦 Using PM2...
    
    REM Create PM2 ecosystem config
    (
        echo module.exports = {
        echo   apps: [
        echo     {
        echo       name: 'nodepilot-frontend',
        echo       cwd: './frontend',
        echo       script: 'node_modules/next/dist/bin/next',
        echo       args: 'start -p 9000',
        echo       instances: 1,
        echo       exec_mode: 'fork',
        echo       watch: false,
        echo       env: {
        echo         NODE_ENV: 'production',
        echo         NEXT_PUBLIC_API_URL: 'http://localhost:9001',
        echo       },
        echo     },
        echo     {
        echo       name: 'nodepilot-backend-proxy',
        echo       cwd: './backend',
        echo       script: 'dist/index.js',
        echo       instances: 1,
        echo       exec_mode: 'fork',
        echo       watch: false,
        echo       env: {
        echo         NODE_ENV: 'production',
        echo         PORT: '9001',
        echo         FRONTEND_URL: 'http://localhost:9000',
        echo       },
        echo     },
        echo   ],
        echo };
    ) > ecosystem.single-port.config.js
    
    pm2 start ecosystem.single-port.config.js
    pm2 save
    
    echo.
    echo ✅ NodePilot started with PM2!
    echo.
    pm2 status
    
) else (
    echo 📦 Starting services...
    
    REM Start frontend
    start /B cmd /c "cd frontend && set PORT=9000 && npm run start > ..\logs\frontend-single.log 2>&1"
    
    REM Wait for frontend
    timeout /t 3 /nobreak >nul
    
    REM Start backend with proxy
    start /B cmd /c "cd backend && set PORT=9001 && set FRONTEND_URL=http://localhost:9000 && npm run start > ..\logs\backend-single.log 2>&1"
    
    echo.
    echo ✅ NodePilot started!
)

echo.
echo ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
echo ✨ Single Port Access:
echo ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
echo.
echo    🌐 Main URL: http://localhost:9001
echo.
echo    Everything accessible on port 9001:
echo    - Frontend UI: http://localhost:9001
echo    - Backend API: http://localhost:9001/api
echo    - Health Check: http://localhost:9001/api/health
echo.
echo ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
echo.
echo 📝 To stop: stop-single-port.bat
echo.
pause
