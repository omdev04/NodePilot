#!/bin/bash

# NodePilot Complete Setup Script for Linux
# Supports Ubuntu 20.04+ and Debian 11+

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}=========================================="
echo "  🚀 NodePilot Linux Setup"
echo "==========================================${NC}"
echo ""

# Check if running as root
if [ "$EUID" -ne 0 ]; then 
    echo -e "${RED}❌ Please run as root or with sudo${NC}"
    exit 1
fi

# Detect OS
if [ -f /etc/os-release ]; then
    . /etc/os-release
    OS=$ID
    VER=$VERSION_ID
else
    echo -e "${RED}❌ Cannot detect OS${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Detected OS: $OS $VER${NC}"

# Check if Ubuntu/Debian
if [[ "$OS" != "ubuntu" && "$OS" != "debian" ]]; then
    echo -e "${YELLOW}⚠️  This script is designed for Ubuntu/Debian${NC}"
    read -p "Continue anyway? (y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

# Update system
echo -e "${BLUE}📦 Updating system packages...${NC}"
apt-get update -qq

# Install required system packages
echo -e "${BLUE}📦 Installing system dependencies...${NC}"
apt-get install -y curl wget git build-essential debian-keyring debian-archive-keyring apt-transport-https

# Install Node.js 20 LTS
if ! command -v node &> /dev/null; then
    echo -e "${BLUE}📦 Installing Node.js 20 LTS...${NC}"
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt-get install -y nodejs
else
    echo -e "${GREEN}✅ Node.js already installed: $(node --version)${NC}"
fi

# Verify Node.js version
NODE_VERSION=$(node --version | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    echo -e "${RED}❌ Node.js version must be 18 or higher${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Node.js: $(node --version)${NC}"
echo -e "${GREEN}✅ npm: $(npm --version)${NC}"

# Install PM2 globally
if ! command -v pm2 &> /dev/null; then
    echo -e "${BLUE}📦 Installing PM2...${NC}"
    npm install -g pm2
else
    echo -e "${GREEN}✅ PM2 already installed: $(pm2 --version)${NC}"
fi

# Setup PM2 startup script
echo -e "${BLUE}🔧 Configuring PM2 startup...${NC}"
pm2 startup systemd -u $SUDO_USER --hp /home/$SUDO_USER

# Get current directory
CURRENT_DIR=$(pwd)
echo -e "${BLUE}📂 Working directory: $CURRENT_DIR${NC}"

# Install project dependencies
echo -e "${BLUE}📦 Installing project dependencies...${NC}"
npm install

# Build backend
echo -e "${BLUE}🔨 Building backend...${NC}"
cd backend
npm install
npm run build
cd ..

# Build frontend
echo -e "${BLUE}🔨 Building frontend...${NC}"
cd frontend
npm install
npm run build
cd ..

# Create required directories
echo -e "${BLUE}📁 Creating required directories...${NC}"
mkdir -p projects
mkdir -p backups
mkdir -p logs
mkdir -p backend/logs
mkdir -p frontend/logs
mkdir -p backend/uploads
mkdir -p /etc/caddy/projects || true

# Set proper permissions
echo -e "${BLUE}🔐 Setting permissions...${NC}"
chown -R $SUDO_USER:$SUDO_USER projects backups logs backend/logs frontend/logs backend/uploads
chmod -R 755 projects backups logs

# Create .env files if they don't exist
if [ ! -f backend/.env ]; then
    echo -e "${YELLOW}⚠️  Backend .env file not found${NC}"
    if [ -f backend/.env.example ]; then
        echo -e "${BLUE}📝 Creating backend/.env from example...${NC}"
        cp backend/.env.example backend/.env
        echo -e "${YELLOW}⚠️  Please edit backend/.env with your configuration${NC}"
    else
        echo -e "${YELLOW}⚠️  Creating minimal backend/.env...${NC}"
        cat > backend/.env << EOF
PORT=9001
HOST=0.0.0.0
JWT_SECRET=$(openssl rand -hex 32)
DB_PATH=./deployer.db
PROJECTS_DIR=../projects
BACKUPS_DIR=../backups
LOG_DIR=../logs
MAX_UPLOAD_SIZE=209715200
NODE_ENV=production
EOF
    fi
fi

if [ ! -f frontend/.env.local ]; then
    echo -e "${YELLOW}⚠️  Frontend .env.local file not found${NC}"
    echo -e "${BLUE}📝 Creating frontend/.env.local...${NC}"
    cat > frontend/.env.local << EOF
NEXT_PUBLIC_API_URL=http://localhost:9001
EOF
fi

# Initialize database
echo -e "${BLUE}💾 Initializing database...${NC}"
cd backend
node dist/utils/database.js || true
cd ..

# Install Caddy
read -p "$(echo -e ${YELLOW}Install Caddy reverse proxy with automatic SSL? \(y/n\)${NC}) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo -e "${BLUE}📦 Installing Caddy...${NC}"
    
    # Install Caddy - Official installation for Debian/Ubuntu
    curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
    curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | tee /etc/apt/sources.list.d/caddy-stable.list
    apt-get update
    apt-get install -y caddy
    
    echo -e "${GREEN}✅ Caddy installed: $(caddy version)${NC}"
    
    # Create Caddy projects directory
    mkdir -p /etc/caddy/projects
    mkdir -p /var/log/caddy
    chown -R caddy:caddy /etc/caddy/projects /var/log/caddy
    
    # Setup Caddyfile
    echo -e "${BLUE}🌐 Setting up Caddyfile...${NC}"
    
    # Backup existing Caddyfile if it exists
    if [ -f /etc/caddy/Caddyfile ]; then
        cp /etc/caddy/Caddyfile /etc/caddy/Caddyfile.backup.$(date +%Y%m%d_%H%M%S)
    fi
    
    # Copy Caddyfile from project
    cp Caddyfile /etc/caddy/Caddyfile
    
    # Set proper permissions
    chown root:root /etc/caddy/Caddyfile
    chmod 644 /etc/caddy/Caddyfile
    
    # Update email in Caddyfile
    read -p "Enter your email for Let's Encrypt SSL notifications: " LETSENCRYPT_EMAIL
    if [ ! -z "$LETSENCRYPT_EMAIL" ]; then
        sed -i "s/admin@example.com/$LETSENCRYPT_EMAIL/g" /etc/caddy/Caddyfile
    fi
    
    # Validate Caddyfile
    echo -e "${BLUE}🔍 Validating Caddyfile...${NC}"
    caddy validate --config /etc/caddy/Caddyfile
    
    # Enable and start Caddy
    echo -e "${BLUE}🚀 Starting Caddy...${NC}"
    systemctl enable caddy
    systemctl restart caddy
    systemctl status caddy --no-pager
    
    echo -e "${GREEN}✅ Caddy configured successfully${NC}"
    echo -e "${GREEN}✅ Automatic SSL will be enabled when you add domains${NC}"
else
    echo -e "${YELLOW}⚠️  Skipping Caddy installation. You can install it later using:${NC}"
    echo -e "${YELLOW}   sudo apt-get install caddy${NC}"
fi

# Create start/stop scripts
echo -e "${BLUE}📝 Creating convenience scripts...${NC}"

cat > start.sh << 'EOF'
#!/bin/bash
cd "$(dirname "$0")"
pm2 start ecosystem.config.js
pm2 save
echo "✅ NodePilot started"
pm2 status
EOF
chmod +x start.sh

cat > stop.sh << 'EOF'
#!/bin/bash
pm2 stop all
echo "✅ NodePilot stopped"
EOF
chmod +x stop.sh

cat > restart.sh << 'EOF'
#!/bin/bash
pm2 restart all
echo "✅ NodePilot restarted"
pm2 status
EOF
chmod +x restart.sh

cat > status.sh << 'EOF'
#!/bin/bash
pm2 status
pm2 logs --lines 20
EOF
chmod +x status.sh

# Create PM2 ecosystem config
echo -e "${BLUE}📝 Creating PM2 ecosystem config...${NC}"
cat > ecosystem.config.js << EOF
module.exports = {
  apps: [
    {
      name: 'nodepilot-backend',
      cwd: '$CURRENT_DIR/backend',
      script: 'dist/index.js',
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      env: {
        NODE_ENV: 'production',
      },
      error_file: '$CURRENT_DIR/logs/backend-error.log',
      out_file: '$CURRENT_DIR/logs/backend-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
    },
    {
      name: 'nodepilot-frontend',
      cwd: '$CURRENT_DIR/frontend',
      script: 'node_modules/next/dist/bin/next',
      args: 'start -p 9000',
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      env: {
        NODE_ENV: 'production',
      },
      error_file: '$CURRENT_DIR/logs/frontend-error.log',
      out_file: '$CURRENT_DIR/logs/frontend-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
    },
  ],
};
EOF

chown $SUDO_USER:$SUDO_USER ecosystem.config.js start.sh stop.sh restart.sh status.sh

echo ""
echo -e "${GREEN}=========================================="
echo "  ✅ Setup Complete!"
echo "==========================================${NC}"
echo ""
echo -e "${BLUE}📝 Next Steps:${NC}"
echo "1. Edit backend/.env with your configuration"
echo "2. Start the application: ./start.sh"
echo "3. Check status: ./status.sh"
echo "4. Access frontend: http://localhost:9000"
echo "5. Access backend: http://localhost:9001"
echo ""
echo -e "${BLUE}🔧 Useful commands:${NC}"
echo "  ./start.sh    - Start NodePilot"
echo "  ./stop.sh     - Stop NodePilot"
echo "  ./restart.sh  - Restart NodePilot"
echo "  ./status.sh   - Check status and logs"
echo "  pm2 logs      - View live logs"
echo "  pm2 monit     - Monitor processes"
echo ""
echo -e "${YELLOW}⚠️  Remember to configure your environment variables!${NC}"
echo ""
