#!/bin/bash

# NodePilot Single Port Stop Script

echo "⏹️  Stopping NodePilot..."

# Check if using PM2
if command -v pm2 &> /dev/null && pm2 list | grep -q "nodepilot"; then
    echo "📦 Stopping PM2 processes..."
    pm2 stop nodepilot-frontend nodepilot-backend-proxy 2>/dev/null || true
    pm2 delete nodepilot-frontend nodepilot-backend-proxy 2>/dev/null || true
    echo "✅ PM2 processes stopped"
else
    # Stop using PID files
    if [ -f "backend.pid" ]; then
        BACKEND_PID=$(cat backend.pid)
        kill $BACKEND_PID 2>/dev/null || true
        rm backend.pid
        echo "✅ Backend stopped"
    fi
    
    if [ -f "frontend.pid" ]; then
        FRONTEND_PID=$(cat frontend.pid)
        kill $FRONTEND_PID 2>/dev/null || true
        rm frontend.pid
        echo "✅ Frontend stopped"
    fi
fi

# Fallback: kill by port
lsof -ti:9000 2>/dev/null | xargs kill -9 2>/dev/null || true
lsof -ti:9001 2>/dev/null | xargs kill -9 2>/dev/null || true

echo ""
echo "✅ All services stopped"
echo ""
