# 🚀 NodePilot - Quick Linux Deployment

Deploy NodePilot on Linux in 5 minutes!

## ⚡ One-Command Installation

```bash
sudo bash -c "$(curl -fsSL https://raw.githubusercontent.com/yourusername/NodePilot/main/setup.sh)"
```

Or manually:

```bash
# 1. Clone repository
git clone https://github.com/yourusername/NodePilot.git
cd NodePilot

# 2. Run setup script
chmod +x setup.sh
sudo ./setup.sh

# 3. Configure environment
nano backend/.env

# 4. Start NodePilot
./start.sh
```

## 📋 Requirements

- Ubuntu 20.04+ or Debian 11+
- Node.js 18+ (auto-installed)
- 2GB RAM minimum
- Root/sudo access

## 🎯 Quick Commands

```bash
./start.sh      # Start NodePilot
./stop.sh       # Stop NodePilot
./restart.sh    # Restart NodePilot
./status.sh     # Check status and logs
```

## 🌐 Access

- Frontend: http://localhost:9000
- Backend: http://localhost:9001
- Health: http://localhost:9001/health

## 📚 Documentation

- **Full Guide**: [LINUX_DEPLOYMENT.md](./LINUX_DEPLOYMENT.md)
- **Features**: [FEATURES.md](./FEATURES.md)
- **Development**: [DEVELOPMENT.md](./DEVELOPMENT.md)

## 🆘 Quick Troubleshooting

```bash
# Check status
./status.sh

# View logs
pm2 logs

# Restart if needed
./restart.sh

# Check ports
sudo lsof -i :9000
sudo lsof -i :9001
```

## 🔧 Manual Setup (Alternative)

If the script doesn't work:

```bash
# Install Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo bash -
sudo apt-get install -y nodejs

# Install PM2
sudo npm install -g pm2

# Install dependencies
npm install

# Build backend
cd backend && npm install && npm run build && cd ..

# Build frontend  
cd frontend && npm install && npm run build && cd ..

# Create directories
mkdir -p projects backups logs

# Configure
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env.local

# Edit configs
nano backend/.env
nano frontend/.env.local

# Start with PM2
pm2 start ecosystem.config.js
pm2 save
```

## 🔐 Production Deployment

For production with systemd and nginx, see [LINUX_DEPLOYMENT.md](./LINUX_DEPLOYMENT.md).

## 📝 License

MIT License
