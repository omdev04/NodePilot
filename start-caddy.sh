#!/bin/bash

# NodePilot with Caddy - Start Script

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "🚀 Starting NodePilot with Caddy..."
echo ""

# Check if Caddy is installed
if ! command -v caddy &> /dev/null; then
    echo "❌ Caddy not installed!"
    echo ""
    echo "Install Caddy:"
    echo "  Ubuntu/Debian: sudo apt install caddy"
    echo "  macOS: brew install caddy"
    echo "  Windows: choco install caddy"
    echo ""
    exit 1
fi

echo "✅ Caddy found: $(caddy version)"
echo ""

# Check if using PM2
if command -v pm2 &> /dev/null; then
    echo "📦 Starting with PM2..."
    
    # Create PM2 ecosystem with Caddy
    cat > ecosystem.caddy.config.js << 'EOF'
module.exports = {
  apps: [
    {
      name: 'nodepilot-backend',
      cwd: './backend',
      script: 'dist/index.js',
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      env: {
        NODE_ENV: 'production',
        PORT: '9001',
      },
      error_file: './logs/backend-error.log',
      out_file: './logs/backend-out.log',
    },
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
        PORT: '9000',
      },
      error_file: './logs/frontend-error.log',
      out_file: './logs/frontend-out.log',
    },
  ],
};
EOF

    pm2 start ecosystem.caddy.config.js
    pm2 save
    
    echo ""
    echo "✅ Backend & Frontend started with PM2"
    pm2 status
    
else
    echo "📦 Starting services..."
    
    # Start backend
    cd backend
    NODE_ENV=production PORT=9001 npm start > ../logs/backend.log 2>&1 &
    BACKEND_PID=$!
    echo $BACKEND_PID > ../backend.pid
    cd ..
    
    echo "✅ Backend started (PID: $BACKEND_PID)"
    
    # Wait for backend
    sleep 2
    
    # Start frontend
    cd frontend
    NODE_ENV=production PORT=9000 npm start > ../logs/frontend.log 2>&1 &
    FRONTEND_PID=$!
    echo $FRONTEND_PID > ../frontend.pid
    cd ..
    
    echo "✅ Frontend started (PID: $FRONTEND_PID)"
fi

echo ""
echo "🌐 Starting Caddy reverse proxy..."

# Determine which Caddyfile to use
CADDY_CONFIG="Caddyfile"
if [ "$1" = "production" ] || [ "$1" = "prod" ]; then
    CADDY_CONFIG="Caddyfile.production"
    echo "📦 Using production configuration"
else
    echo "🔧 Using development configuration"
fi

# Start Caddy
caddy start --config "$CADDY_CONFIG"

echo ""
echo "=========================================="
echo "✅ NodePilot with Caddy Started!"
echo "=========================================="
echo ""

if [ "$CADDY_CONFIG" = "Caddyfile.production" ]; then
    echo "🌐 Access your application:"
    echo "   https://yourdomain.com"
    echo ""
    echo "   (Update domain in Caddyfile.production)"
else
    echo "🌐 Access your application:"
    echo "   http://localhost:9002"
fi

echo ""
echo "📊 Services:"
echo "   Backend:  http://localhost:9001"
echo "   Frontend: http://localhost:9000"
echo "   Caddy:    Port 80/443 (prod) or 9002 (dev)"
echo ""
echo "🛠️  Commands:"
echo "   ./stop-caddy.sh     - Stop all services"
echo "   caddy reload        - Reload Caddy config"
echo "   pm2 logs            - View logs (if using PM2)"
echo ""
