#!/bin/bash

# NodePilot Restart Script
# Restarts both backend and frontend services

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "🔄 Restarting NodePilot..."

# Check if using PM2 or systemd
if command -v pm2 &> /dev/null && pm2 list | grep -q "nodepilot"; then
    # Using PM2
    echo "📦 Restarting PM2 processes..."
    pm2 restart nodepilot-backend nodepilot-frontend
    echo ""
    echo "✅ NodePilot restarted"
    echo ""
    pm2 status
elif [ -f "/etc/systemd/system/nodepilot-backend.service" ]; then
    # Using systemd
    echo "📦 Restarting systemd services..."
    sudo systemctl restart nodepilot-backend
    sudo systemctl restart nodepilot-frontend
    echo ""
    echo "✅ NodePilot restarted"
    echo ""
    sudo systemctl status nodepilot-backend --no-pager
    sudo systemctl status nodepilot-frontend --no-pager
else
    # Manual restart
    echo "📦 Restarting manually..."
    ./stop.sh
    sleep 2
    ./start.sh
fi

echo ""
