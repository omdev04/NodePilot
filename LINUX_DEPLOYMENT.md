# 🐧 NodePilot Linux Deployment Guide

Complete guide for deploying NodePilot on Linux (Ubuntu/Debian).

## 📋 Table of Contents

1. [Prerequisites](#prerequisites)
2. [Quick Setup](#quick-setup)
3. [Manual Setup](#manual-setup)
4. [Configuration](#configuration)
5. [Running NodePilot](#running-nodepilot)
6. [Systemd Services](#systemd-services)
7. [Nginx Setup](#nginx-setup)
8. [SSL Certificates](#ssl-certificates)
9. [Troubleshooting](#troubleshooting)

---

## Prerequisites

- **OS**: Ubuntu 20.04+ or Debian 11+
- **Node.js**: v18+ (v20 LTS recommended)
- **RAM**: Minimum 2GB (4GB recommended)
- **Disk**: Minimum 10GB free space
- **Root/Sudo**: Required for installation

---

## 🚀 Quick Setup

### 1. Clone Repository
```bash
git clone https://github.com/omdev0704/NodePilot.git
cd NodePilot
```

### 2. Run Automated Setup
```bash
chmod +x setup.sh
sudo ./setup.sh
```

The setup script will:
- ✅ Install Node.js 20 LTS
- ✅ Install PM2 globally
- ✅ Install system dependencies (nginx, certbot, etc.)
- ✅ Build backend and frontend
- ✅ Create required directories
- ✅ Set up environment files
- ✅ Configure PM2 ecosystem
- ✅ Optionally configure Nginx

### 3. Configure Environment
Edit the environment files:
```bash
nano backend/.env
nano frontend/.env.local
```

### 4. Start NodePilot
```bash
./start.sh
```

### 5. Access
- **Frontend**: http://localhost:9000
- **Backend**: http://localhost:9001

---

## 🔧 Manual Setup

If you prefer manual installation:

### 1. Install Node.js 20 LTS
```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo bash -
sudo apt-get install -y nodejs
```

### 2. Install System Dependencies
```bash
sudo apt-get update
sudo apt-get install -y git build-essential nginx certbot python3-certbot-nginx
```

### 3. Install PM2
```bash
sudo npm install -g pm2
```

### 4. Clone and Install
```bash
git clone https://github.com/omdev04/NodePilot.git
cd NodePilot
npm install
```

### 5. Build Backend
```bash
cd backend
npm install
npm run build
cd ..
```

### 6. Build Frontend
```bash
cd frontend
npm install
npm run build
cd ..
```

### 7. Create Directories
```bash
mkdir -p projects backups logs backend/logs frontend/logs backend/uploads
chmod -R 755 projects backups logs
```

### 8. Configure Environment
```bash
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env.local

# Edit with your configuration
nano backend/.env
nano frontend/.env.local
```

---

## ⚙️ Configuration

### Backend Configuration (`backend/.env`)

```bash
# Server
PORT=9001
HOST=0.0.0.0
NODE_ENV=production

# Security (CHANGE THESE!)
JWT_SECRET=your-super-secret-jwt-key-32-chars-minimum

# Database
DB_PATH=./deployer.db

# Directories
PROJECTS_DIR=../projects
BACKUPS_DIR=../backups
LOG_DIR=../logs

# Upload Limits
MAX_UPLOAD_SIZE=209715200

# GitHub OAuth (Optional)
GITHUB_CLIENT_ID=your_client_id
GITHUB_CLIENT_SECRET=your_client_secret
GITHUB_CALLBACK_URL=http://your-domain.com/api/oauth/github/callback

# Nginx (Optional)
NGINX_SITES_AVAILABLE=/etc/nginx/sites-available
NGINX_SITES_ENABLED=/etc/nginx/sites-enabled
LETSENCRYPT_EMAIL=your-email@example.com
```

### Frontend Configuration (`frontend/.env.local`)

```bash
NEXT_PUBLIC_API_URL=http://localhost:9001

# For production with domain:
# NEXT_PUBLIC_API_URL=https://api.yourdomain.com
```

---

## 🎮 Running NodePilot

### Using Convenience Scripts

```bash
# Start services
./start.sh

# Stop services
./stop.sh

# Restart services
./restart.sh

# Check status
./status.sh
```

### Using PM2 Directly

```bash
# Start
pm2 start ecosystem.config.js

# Stop
pm2 stop all

# Restart
pm2 restart all

# Status
pm2 status

# Logs
pm2 logs

# Monitor
pm2 monit
```

### Manual Start

```bash
# Backend
cd backend
node dist/index.js &

# Frontend
cd frontend
node node_modules/next/dist/bin/next start -p 9000 &
```

---

## 🔐 Systemd Services

For production, use systemd services for auto-restart and boot startup.

### 1. Create User
```bash
sudo useradd -r -s /bin/bash nodepilot
sudo mkdir -p /opt/nodepilot
sudo chown nodepilot:nodepilot /opt/nodepilot
```

### 2. Move Application
```bash
sudo cp -r . /opt/nodepilot/
sudo chown -R nodepilot:nodepilot /opt/nodepilot
```

### 3. Install Service Files
```bash
sudo cp nodepilot-backend.service /etc/systemd/system/
sudo cp nodepilot-frontend.service /etc/systemd/system/
sudo systemctl daemon-reload
```

### 4. Enable and Start
```bash
# Enable auto-start on boot
sudo systemctl enable nodepilot-backend
sudo systemctl enable nodepilot-frontend

# Start services
sudo systemctl start nodepilot-backend
sudo systemctl start nodepilot-frontend

# Check status
sudo systemctl status nodepilot-backend
sudo systemctl status nodepilot-frontend
```

### 5. Manage Services
```bash
# Restart
sudo systemctl restart nodepilot-backend
sudo systemctl restart nodepilot-frontend

# Stop
sudo systemctl stop nodepilot-backend
sudo systemctl stop nodepilot-frontend

# View logs
sudo journalctl -u nodepilot-backend -f
sudo journalctl -u nodepilot-frontend -f
```

---

## 🌐 Nginx Setup

### Basic Configuration

```bash
sudo nano /etc/nginx/sites-available/nodepilot
```

```nginx
server {
    listen 80;
    server_name your-domain.com;

    # Frontend
    location / {
        proxy_pass http://localhost:9000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Backend API
    location /api {
        proxy_pass http://localhost:9001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        client_max_body_size 200M;
    }
}
```

### Enable Site
```bash
sudo ln -s /etc/nginx/sites-available/nodepilot /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

---

## 🔒 SSL Certificates

### Using Let's Encrypt (Free SSL)

```bash
# Make sure DNS is pointing to your server
sudo certbot --nginx -d your-domain.com

# Auto-renewal (already set up by certbot)
sudo systemctl status certbot.timer
```

### Test Auto-Renewal
```bash
sudo certbot renew --dry-run
```

---

## 🐛 Troubleshooting

### Port Already in Use
```bash
# Find process using port 9001
sudo lsof -ti:9001

# Kill process
sudo kill -9 $(sudo lsof -ti:9001)

# Or use status script
./stop.sh
```

### Permission Denied
```bash
# Fix permissions
sudo chown -R $USER:$USER projects backups logs
chmod -R 755 projects backups logs
```

### PM2 Not Found
```bash
# Install PM2 globally
sudo npm install -g pm2

# Or use npx
npx pm2 start ecosystem.config.js
```

### Database Locked
```bash
# Stop all NodePilot processes
./stop.sh

# Remove lock if exists
rm -f backend/deployer.db-wal
rm -f backend/deployer.db-shm

# Restart
./start.sh
```

### Check Logs
```bash
# PM2 logs
pm2 logs

# System logs (if using systemd)
sudo journalctl -u nodepilot-backend -f
sudo journalctl -u nodepilot-frontend -f

# Direct log files
tail -f logs/backend-out.log
tail -f logs/frontend-out.log
```

### Nginx Not Working
```bash
# Test configuration
sudo nginx -t

# Check status
sudo systemctl status nginx

# Reload
sudo systemctl reload nginx

# View error logs
sudo tail -f /var/log/nginx/error.log
```

### Frontend Build Errors
```bash
cd frontend
rm -rf .next node_modules
npm install
npm run build
```

### Backend Build Errors
```bash
cd backend
rm -rf dist node_modules
npm install
npm run build
```

---

## 📊 Health Checks

```bash
# Backend health
curl http://localhost:9001/health

# Frontend health
curl http://localhost:9000

# With domain
curl https://your-domain.com/api/health
```

---

## 🔄 Updates

```bash
# Stop services
./stop.sh

# Pull latest code
git pull

# Rebuild
cd backend && npm run build && cd ..
cd frontend && npm run build && cd ..

# Restart
./start.sh
```

---

## 📝 Best Practices

1. **Use systemd** for production deployments
2. **Enable firewall** and only open required ports
3. **Use SSL/HTTPS** for production domains
4. **Regular backups** of database and projects
5. **Monitor logs** regularly
6. **Keep Node.js updated** to LTS version
7. **Use strong JWT_SECRET** (min 32 characters)
8. **Set up monitoring** (PM2 Plus, Datadog, etc.)
9. **Configure log rotation** to prevent disk full

---

## 🆘 Support

For issues:
1. Check logs: `./status.sh`
2. Review environment variables
3. Check GitHub issues
4. Join our Discord community

---

## 📄 License

MIT License - See LICENSE file for details
