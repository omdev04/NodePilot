@echo off
REM Stop NodePilot

echo Stopping NodePilot...

REM Kill processes on port 9001
for /f "tokens=5" %%a in ('netstat -aon ^| find ":9001" ^| find "LISTENING"') do (
    echo Stopping process PID %%a
    taskkill /F /PID %%a 2>nul
)

echo.
echo NodePilot stopped!
echo.
pause
