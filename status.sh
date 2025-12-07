#!/bin/bash

# NodePilot Status Script
# Shows status and logs of NodePilot services

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "📊 NodePilot Status"
echo "===================="
echo ""

# Check if using PM2 or systemd
if command -v pm2 &> /dev/null && pm2 list | grep -q "nodepilot"; then
    # Using PM2
    echo "📦 PM2 Status:"
    pm2 status
    echo ""
    echo "📝 Recent Logs (last 20 lines):"
    echo ""
    pm2 logs --lines 20 --nostream
elif [ -f "/etc/systemd/system/nodepilot-backend.service" ]; then
    # Using systemd
    echo "📦 Systemd Status:"
    echo ""
    echo "Backend:"
    sudo systemctl status nodepilot-backend --no-pager | head -n 15
    echo ""
    echo "Frontend:"
    sudo systemctl status nodepilot-frontend --no-pager | head -n 15
    echo ""
    echo "📝 Recent Backend Logs (last 10 lines):"
    sudo journalctl -u nodepilot-backend -n 10 --no-pager
    echo ""
    echo "📝 Recent Frontend Logs (last 10 lines):"
    sudo journalctl -u nodepilot-frontend -n 10 --no-pager
else
    # Manual check
    echo "📦 Process Status:"
    echo ""
    
    # Check backend
    if lsof -ti:9001 &> /dev/null; then
        BACKEND_PID=$(lsof -ti:9001)
        echo "✅ Backend running (PID: $BACKEND_PID, Port: 9001)"
    else
        echo "❌ Backend not running"
    fi
    
    # Check frontend
    if lsof -ti:9000 &> /dev/null; then
        FRONTEND_PID=$(lsof -ti:9000)
        echo "✅ Frontend running (PID: $FRONTEND_PID, Port: 9000)"
    else
        echo "❌ Frontend not running"
    fi
    
    echo ""
    echo "📝 Recent Logs:"
    if [ -f "logs/backend-out.log" ]; then
        echo ""
        echo "Backend (last 10 lines):"
        tail -n 10 logs/backend-out.log
    fi
    if [ -f "logs/frontend-out.log" ]; then
        echo ""
        echo "Frontend (last 10 lines):"
        tail -n 10 logs/frontend-out.log
    fi
fi

echo ""
echo "🌐 Access URLs:"
echo "   Frontend: http://localhost:9000"
echo "   Backend:  http://localhost:9001"
echo ""
