@echo off
REM Quick Start NodePilot (assumes already built)

echo ========================================
echo   NodePilot - Quick Start
echo ========================================
echo.

cd /d "%~dp0"

REM Kill existing processes
echo Stopping any existing instances...
for /f "tokens=5" %%a in ('netstat -aon ^| find ":9001" ^| find "LISTENING"') do taskkill /F /PID %%a 2>nul

echo.
echo Starting NodePilot...
cd backend
start /B cmd /c "npm run start > ..\logs\nodepilot.log 2>&1"
cd ..

REM Wait for server to start
timeout /t 3 /nobreak >nul

echo.
echo ========================================
echo   NodePilot Running!
echo ========================================
echo.
echo   Main URL: http://localhost:9001
echo.
echo   - Frontend + Backend on single port
echo   - Everything accessible at port 9001
echo.
echo   To stop: run stop.bat
echo   Logs: logs\nodepilot.log
echo.
echo ========================================
echo.

REM Open browser
start http://localhost:9001

echo Press any key to view logs...
pause >nul
type logs\nodepilot.log
