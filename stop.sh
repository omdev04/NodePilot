#!/bin/bash

# NodePilot Stop Script
# Stops both backend and frontend services

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "⏹️  Stopping NodePilot..."

# Check if using PM2 or systemd
if command -v pm2 &> /dev/null && pm2 list | grep -q "nodepilot"; then
    # Using PM2
    echo "📦 Stopping PM2 processes..."
    pm2 stop nodepilot-backend nodepilot-frontend 2>/dev/null || true
    pm2 delete nodepilot-backend nodepilot-frontend 2>/dev/null || true
    echo "✅ NodePilot stopped"
elif [ -f "/etc/systemd/system/nodepilot-backend.service" ]; then
    # Using systemd
    echo "📦 Stopping systemd services..."
    sudo systemctl stop nodepilot-backend
    sudo systemctl stop nodepilot-frontend
    echo "✅ NodePilot stopped"
else
    # Manual stop using PID files
    if [ -f ".backend.pid" ]; then
        BACKEND_PID=$(cat .backend.pid)
        kill $BACKEND_PID 2>/dev/null || true
        rm .backend.pid
        echo "✅ Backend stopped"
    fi
    if [ -f ".frontend.pid" ]; then
        FRONTEND_PID=$(cat .frontend.pid)
        kill $FRONTEND_PID 2>/dev/null || true
        rm .frontend.pid
        echo "✅ Frontend stopped"
    fi
    
    # Fallback: kill by port
    lsof -ti:9001 | xargs kill -9 2>/dev/null || true
    lsof -ti:9000 | xargs kill -9 2>/dev/null || true
    echo "✅ NodePilot stopped"
fi

echo ""
