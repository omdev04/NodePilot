@echo off
REM NodePilot with Caddy - Windows Start Script

echo ========================================
echo   NodePilot with Caddy - Start
echo ========================================
echo.

cd /d "%~dp0"

REM Check if Caddy is installed
where caddy >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo Error: Caddy not installed!
    echo.
    echo Install Caddy:
    echo   choco install caddy
    echo   or download from https://caddyserver.com/download
    echo.
    pause
    exit /b 1
)

echo Found Caddy: 
caddy version
echo.

REM Kill existing processes
echo Stopping any existing instances...
for /f "tokens=5" %%a in ('netstat -aon ^| find ":9000" ^| find "LISTENING"') do taskkill /F /PID %%a 2>nul
for /f "tokens=5" %%a in ('netstat -aon ^| find ":9001" ^| find "LISTENING"') do taskkill /F /PID %%a 2>nul
for /f "tokens=5" %%a in ('netstat -aon ^| find ":9002" ^| find "LISTENING"') do taskkill /F /PID %%a 2>nul
taskkill /F /IM caddy.exe 2>nul

echo.
echo Starting services...
echo.

REM Start Backend
echo Starting backend...
cd backend
start /B cmd /c "set NODE_ENV=production && set PORT=9001 && npm start > ..\logs\backend.log 2>&1"
cd ..
timeout /t 2 /nobreak >nul

REM Start Frontend
echo Starting frontend...
cd frontend
start /B cmd /c "set NODE_ENV=production && set PORT=9000 && npm start > ..\logs\frontend.log 2>&1"
cd ..
timeout /t 2 /nobreak >nul

REM Start Caddy
echo Starting Caddy...
set CADDY_CONFIG=Caddyfile

if "%1"=="production" set CADDY_CONFIG=Caddyfile.production
if "%1"=="prod" set CADDY_CONFIG=Caddyfile.production

start /B caddy run --config %CADDY_CONFIG%

timeout /t 2 /nobreak >nul

echo.
echo ========================================
echo   NodePilot with Caddy Started!
echo ========================================
echo.

if "%CADDY_CONFIG%"=="Caddyfile.production" (
    echo Access: https://yourdomain.com
    echo ^(Update domain in Caddyfile.production^)
) else (
    echo Access: http://localhost:9002
)

echo.
echo Services:
echo   Backend:  http://localhost:9001
echo   Frontend: http://localhost:9000
echo   Caddy:    Port 9002 ^(dev^) or 80/443 ^(prod^)
echo.
echo To stop: stop-caddy.bat
echo.

pause
