@echo off
REM NodePilot with Caddy - Windows Stop Script

echo Stopping NodePilot services...

REM Stop Caddy
taskkill /F /IM caddy.exe 2>nul
if %ERRORLEVEL% EQU 0 echo Caddy stopped

REM Stop backend and frontend
for /f "tokens=5" %%a in ('netstat -aon ^| find ":9000" ^| find "LISTENING"') do (
    echo Stopping frontend ^(PID %%a^)
    taskkill /F /PID %%a 2>nul
)

for /f "tokens=5" %%a in ('netstat -aon ^| find ":9001" ^| find "LISTENING"') do (
    echo Stopping backend ^(PID %%a^)
    taskkill /F /PID %%a 2>nul
)

for /f "tokens=5" %%a in ('netstat -aon ^| find ":9002" ^| find "LISTENING"') do (
    echo Stopping Caddy proxy ^(PID %%a^)
    taskkill /F /PID %%a 2>nul
)

echo.
echo All services stopped
echo.
pause
