#!/bin/bash

# NodePilot Start Script
# Starts both backend and frontend services

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "🚀 Starting NodePilot..."

# Check if using PM2 or systemd
if command -v pm2 &> /dev/null && [ -f "ecosystem.config.js" ]; then
    # Using PM2
    echo "📦 Starting with PM2..."
    pm2 start ecosystem.config.js
    pm2 save
    echo ""
    echo "✅ NodePilot started with PM2"
    echo ""
    pm2 status
elif [ -f "/etc/systemd/system/nodepilot-backend.service" ]; then
    # Using systemd
    echo "📦 Starting with systemd..."
    sudo systemctl start nodepilot-backend
    sudo systemctl start nodepilot-frontend
    echo ""
    echo "✅ NodePilot started with systemd"
    echo ""
    sudo systemctl status nodepilot-backend --no-pager
    sudo systemctl status nodepilot-frontend --no-pager
else
    # Manual start
    echo "📦 Starting manually..."
    cd backend
    node dist/index.js &
    BACKEND_PID=$!
    cd ../frontend
    node node_modules/next/dist/bin/next start -p 9000 &
    FRONTEND_PID=$!
    cd ..
    echo "$BACKEND_PID" > .backend.pid
    echo "$FRONTEND_PID" > .frontend.pid
    echo ""
    echo "✅ NodePilot started"
    echo "Backend PID: $BACKEND_PID"
    echo "Frontend PID: $FRONTEND_PID"
fi

echo ""
echo "🌐 Access NodePilot:"
echo "   Frontend: http://localhost:9000"
echo "   Backend:  http://localhost:9001"
echo ""
