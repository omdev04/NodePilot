# ⚡ NodePilot - Quick Commands Cheatsheet

## 🚀 Development (Windows)

```powershell
# Install dependencies
npm install

# Start development servers
npm run dev

# Access
# Frontend: http://localhost:3000
# Backend: http://localhost:3001

# Login
# Username: admin
# Password: admin123
```

## 🐧 Production (Linux)

```bash
# Quick Install
cd /opt
git clone <repo> deployer
cd deployer
chmod +x install.sh
sudo ./install.sh

# Configure
cd backend
nano .env  # Change JWT_SECRET and ADMIN_PASSWORD

# Build
npm run build

# Start with PM2
cd backend
pm2 start dist/index.js --name nodepilot-backend
cd ../frontend
pm2 start npm --name nodepilot-frontend -- start
pm2 save
pm2 startup

# Setup Nginx
sudo cp nginx.conf /etc/nginx/sites-available/nodepilot
sudo ln -s /etc/nginx/sites-available/nodepilot /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx

# SSL (Optional)
sudo certbot --nginx -d deploy.yourdomain.com
```

## 📋 Common Commands

```bash
# PM2
pm2 list                    # List all processes
pm2 logs                    # View all logs
pm2 logs nodepilot-backend    # Backend logs
pm2 restart all             # Restart all
pm2 stop all                # Stop all
pm2 delete all              # Remove all

# Database
cd backend && npm run db:init  # Reset database

# Build
npm run build:backend       # Build backend
npm run build:frontend      # Build frontend
npm run build              # Build both

# Update
git pull                    # Pull latest code
npm install                 # Install dependencies
npm run build              # Rebuild
pm2 restart all            # Restart services
```

## 🔧 Troubleshooting

```bash
# Backend won't start
pm2 logs nodepilot-backend
sudo lsof -i :3001
pm2 restart nodepilot-backend

# Frontend won't start
pm2 logs nodepilot-frontend
sudo lsof -i :3000
pm2 restart nodepilot-frontend

# Reset everything
pm2 delete all
cd backend && rm deployer.db && npm run db:init
npm run build
pm2 start dist/index.js --name nodepilot-backend
cd ../frontend && pm2 start npm --name nodepilot-frontend -- start
pm2 save
```

## 🔐 Security

```bash
# Firewall
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable

# SSL
sudo certbot --nginx -d your-domain.com
sudo certbot renew --dry-run
```

## 📦 Test Project

Create a test Node.js project:

```bash
mkdir ~/test-project
cd ~/test-project

# package.json
cat > package.json << EOF
{
  "name": "test-app",
  "version": "1.0.0",
  "main": "index.js",
  "scripts": {
    "start": "node index.js"
  }
}
EOF

# index.js
cat > index.js << 'EOF'
const http = require('http');
const port = process.env.PORT || 3000;

http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/html' });
  res.end('<h1>Hello from NodePilot!</h1>');
}).listen(port, () => {
  console.log(`Server on port ${port}`);
});
EOF

# Create ZIP
zip -r test-project.zip .

# Upload via NodePilot UI
# Project Name: test-app
# Display Name: Test App
# Start Command: npm start
# Port: 5000
```

## 📊 Monitoring

```bash
# System resources
htop
free -h
df -h

# PM2 monitoring
pm2 monit

# Nginx logs
sudo tail -f /var/log/nginx/access.log
sudo tail -f /var/log/nginx/error.log

# Application logs
pm2 logs
pm2 logs --lines 100
```

## 🔄 Backup

```bash
# Backup database
cp /opt/deployer/backend/deployer.db ~/backup/deployer-$(date +%Y%m%d).db

# Backup projects
tar -czf ~/backup/projects-$(date +%Y%m%d).tar.gz /opt/deployer/projects/

# Backup PM2 config
pm2 save
cp ~/.pm2/dump.pm2 ~/backup/pm2-$(date +%Y%m%d).json
```

## 🆘 Emergency Recovery

```bash
# Complete reset
pm2 delete all
cd /opt/deployer
git reset --hard
git pull
npm install
cd backend && npm install && npm run build
cd ../frontend && npm install && npm run build
cd ../backend && npm run db:init
pm2 start dist/index.js --name nodepilot-backend
cd ../frontend && pm2 start npm --name nodepilot-frontend -- start
pm2 save
```

## 📚 Documentation

- **Full Guide**: `README.md`
- **Quick Start**: `QUICKSTART.md`
- **Deployment**: `DEPLOYMENT.md`
- **Development**: `DEVELOPMENT.md`
- **Windows**: `WINDOWS_DEV.md`
- **Architecture**: `ARCHITECTURE.md`
- **Features**: `FEATURES.md`

## 🌐 URLs

- **Frontend**: http://your-server:3000
- **Backend**: http://your-server:3001
- **Health**: http://your-server:3001/health

---

**That's it! You're ready to deploy! 🚀**
