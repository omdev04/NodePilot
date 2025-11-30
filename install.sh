#!/bin/bash

# NodePilot Installation Script
# For Ubuntu/Debian systems

set -e

echo "=========================================="
echo "  NodePilot Installation Script"
echo "=========================================="
echo ""

# Check if running as root
if [ "$EUID" -ne 0 ]; then 
    echo "Please run as root or with sudo"
    exit 1
fi

# Check OS
if [ ! -f /etc/debian_version ]; then
    echo "This script is for Ubuntu/Debian only"
    exit 1
fi

# Install Node.js 20 LTS
echo "Installing Node.js 20 LTS..."
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs

# Verify Node.js installation
node_version=$(node --version)
echo "Node.js installed: $node_version"

# Install PM2
echo "Installing PM2..."
npm install -g pm2

# Create directory
echo "Creating /opt/deployer directory..."
mkdir -p /opt/deployer
cd /opt/deployer

# Install dependencies
echo "Installing dependencies..."
npm install

# Backend setup
echo "Setting up backend..."
cd backend
npm install

# Copy env file
if [ ! -f .env ]; then
    cp .env.example .env
    echo "Created .env file - PLEASE EDIT IT TO CHANGE SECRETS!"
fi

# Build backend
echo "Building backend..."
npm run build

# Initialize database
echo "Initializing database..."
npm run db:init

# Frontend setup
echo "Setting up frontend..."
cd ../frontend
npm install

# Build frontend
echo "Building frontend..."
npm run build

# Go back to root
cd /opt/deployer

echo ""
echo "=========================================="
echo "  Installation Complete!"
echo "=========================================="
echo ""
echo "Next steps:"
echo "1. Edit /opt/deployer/backend/.env and change:"
echo "   - JWT_SECRET"
echo "   - ADMIN_PASSWORD"
echo ""
echo "2. Start services:"
echo "   cd /opt/deployer/backend"
echo "   pm2 start dist/index.js --name nodepilot-backend"
echo "   cd /opt/deployer/frontend"
echo "   pm2 start npm --name nodepilot-frontend -- start"
echo "   pm2 save"
echo "   pm2 startup"
echo ""
echo "3. Access at http://your-server-ip:3000"
echo ""
echo "For Nginx setup, see README.md"
echo ""
