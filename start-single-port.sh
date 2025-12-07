#!/bin/bash

# NodePilot Single Port Startup Script
# Starts both backend and frontend, accessible on single port

echo "🚀 Starting NodePilot in Single Port Mode..."
echo ""

# Get the script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Kill any existing processes on ports
echo "🧹 Cleaning up existing processes..."
lsof -ti:9000 2>/dev/null | xargs kill -9 2>/dev/null || true
lsof -ti:9001 2>/dev/null | xargs kill -9 2>/dev/null || true

# Check if PM2 is available
if command -v pm2 &> /dev/null; then
    echo "📦 Using PM2..."
    
    # Create PM2 ecosystem config for single port mode
    cat > ecosystem.single-port.config.js << 'EOF'
module.exports = {
  apps: [
    {
      name: 'nodepilot-frontend',
      cwd: './frontend',
      script: 'node_modules/next/dist/bin/next',
      args: 'start -p 9000',
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      env: {
        NODE_ENV: 'production',
        NEXT_PUBLIC_API_URL: 'http://localhost:9001',
      },
    },
    {
      name: 'nodepilot-backend-proxy',
      cwd: './backend',
      script: 'dist/index.js',
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      env: {
        NODE_ENV: 'production',
        PORT: '9001',
        FRONTEND_URL: 'http://localhost:9000',
      },
    },
  ],
};
EOF

    # Start with PM2
    pm2 start ecosystem.single-port.config.js
    pm2 save
    
    echo ""
    echo "✅ NodePilot started with PM2!"
    echo ""
    pm2 status
    
else
    echo "📦 Using background processes..."
    
    # Start frontend in background
    cd frontend
    PORT=9000 npm run start > ../logs/frontend-single.log 2>&1 &
    FRONTEND_PID=$!
    echo $FRONTEND_PID > ../frontend.pid
    cd ..
    
    # Wait a bit for frontend to start
    sleep 3
    
    # Start backend with proxy
    cd backend
    PORT=9001 FRONTEND_URL=http://localhost:9000 npm run start > ../logs/backend-single.log 2>&1 &
    BACKEND_PID=$!
    echo $BACKEND_PID > ../backend.pid
    cd ..
    
    echo ""
    echo "✅ NodePilot started!"
    echo "   Frontend PID: $FRONTEND_PID (internal port 9000)"
    echo "   Backend PID: $BACKEND_PID (proxy port 9001)"
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✨ Single Port Access:"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "   🌐 Main URL: http://localhost:9001"
echo ""
echo "   Everything accessible on port 9001:"
echo "   - Frontend UI: http://localhost:9001"
echo "   - Backend API: http://localhost:9001/api"
echo "   - Health Check: http://localhost:9001/api/health"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "📝 Useful commands:"
echo "   ./stop-single-port.sh    - Stop all services"
echo "   pm2 logs                 - View logs (if using PM2)"
echo "   pm2 monit                - Monitor processes (if using PM2)"
echo ""
