#!/bin/bash

# NodePilot with Caddy - Stop Script

echo "⏹️  Stopping NodePilot services..."

# Stop Caddy
if pgrep -x "caddy" > /dev/null; then
    echo "🛑 Stopping Caddy..."
    caddy stop
    echo "✅ Caddy stopped"
fi

# Stop PM2 services
if command -v pm2 &> /dev/null && pm2 list | grep -q "nodepilot"; then
    echo "🛑 Stopping PM2 services..."
    pm2 stop nodepilot-backend nodepilot-frontend 2>/dev/null || true
    pm2 delete nodepilot-backend nodepilot-frontend 2>/dev/null || true
    echo "✅ PM2 services stopped"
fi

# Stop manual processes
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

# Cleanup ports
lsof -ti:9000 2>/dev/null | xargs kill -9 2>/dev/null || true
lsof -ti:9001 2>/dev/null | xargs kill -9 2>/dev/null || true
lsof -ti:9002 2>/dev/null | xargs kill -9 2>/dev/null || true

echo ""
echo "✅ All services stopped"
echo ""
