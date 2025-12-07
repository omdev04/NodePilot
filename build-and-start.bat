@echo off
REM Build and Start NodePilot - Single Port Mode

echo ========================================
echo   NodePilot - Build and Start
echo ========================================
echo.

REM Get script directory
cd /d "%~dp0"

REM Step 1: Install dependencies
echo [1/4] Installing dependencies...
echo.
call npm install
if errorlevel 1 (
    echo Error: Failed to install root dependencies
    pause
    exit /b 1
)

cd backend
call npm install
if errorlevel 1 (
    echo Error: Failed to install backend dependencies
    pause
    exit /b 1
)
cd ..

cd frontend
call npm install
if errorlevel 1 (
    echo Error: Failed to install frontend dependencies
    pause
    exit /b 1
)
cd ..

echo.
echo [2/4] Building backend...
echo.
cd backend
call npm run build
if errorlevel 1 (
    echo Error: Backend build failed
    pause
    exit /b 1
)
cd ..

echo.
echo [3/4] Building frontend...
echo.
cd frontend
call npm run build
if errorlevel 1 (
    echo Error: Frontend build failed
    pause
    exit /b 1
)
cd ..

echo.
echo [4/4] Starting server...
echo.

REM Kill existing processes
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
echo   NodePilot Started Successfully!
echo ========================================
echo.
echo   Main URL: http://localhost:9001
echo.
echo   - Frontend: http://localhost:9001
echo   - API: http://localhost:9001/api
echo   - Health: http://localhost:9001/api/health
echo.
echo   To stop: run stop.bat
echo   Logs: logs\nodepilot.log
echo.
echo ========================================
echo.

REM Open browser
start http://localhost:9001

pause
