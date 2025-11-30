# 🚀 Quick Start Guide - NodePilot

This guide will get you up and running with NodePilot in under 5 minutes.

## Prerequisites

- Ubuntu 20.04+ or Debian 10+
- Root or sudo access
- Node.js 18+ installed

## Step 1: Install Node.js and PM2

```bash
# Install Node.js 20 LTS
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Verify installation
node --version
npm --version

# Install PM2 globally
sudo npm install -g pm2
```

## Step 2: Clone and Setup NodePilot

```bash
# Create directory
sudo mkdir -p /opt/deployer
cd /opt/deployer

# Clone (or copy) your project files here
# For this guide, assume files are already in /opt/deployer

# Install dependencies
npm install

# Setup backend
cd backend
npm install
cp .env.example .env

# IMPORTANT: Edit .env and change these values
nano .env
```

**Edit these in `.env`:**
```env
JWT_SECRET=CHANGE-THIS-TO-A-SECURE-RANDOM-STRING
ADMIN_PASSWORD=CHANGE-THIS-TO-A-STRONG-PASSWORD
```

```bash
# Initialize database
npm run db:init

# Build backend
npm run build
```

## Step 3: Setup Frontend

```bash
cd /opt/deployer/frontend
npm install

# Create production build
npm run build
```

## Step 4: Start with PM2

```bash
# Start backend
cd /opt/deployer/backend
pm2 start dist/index.js --name nodepilot-backend

# Start frontend
cd /opt/deployer/frontend
pm2 start npm --name nodepilot-frontend -- start

# Save PM2 config
pm2 save

# Auto-start on boot
pm2 startup
# Copy and run the command it outputs
```

## Step 5: Setup Nginx (Optional but Recommended)

```bash
# Install Nginx
sudo apt update
sudo apt install -y nginx

# Create config
sudo nano /etc/nginx/sites-available/nodepilot
```

Paste this:

```nginx
server {
    listen 80;
    server_name your-server-ip;

    client_max_body_size 200M;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }

    location /api {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

```bash
# Enable site
sudo ln -s /etc/nginx/sites-available/nodepilot /etc/nginx/sites-enabled/

# Test and restart
sudo nginx -t
sudo systemctl restart nginx
```

## Step 6: Access NodePilot

Open browser and go to:
```
http://your-server-ip
```

**Default credentials:**
- Username: `admin`
- Password: (what you set in `.env`)

## Step 7: Deploy Your First Project

1. **Prepare your Node.js project**:
   ```bash
   cd /path/to/your/project
   zip -r myproject.zip .
   ```

2. **In NodePilot UI**:
   - Click **"New Project"**
   - Upload `myproject.zip`
   - Enter project name: `myapp`
   - Enter display name: `My App`
   - Enter start command: `npm start` or `node index.js`
   - Click **"Deploy Project"**

3. **Done!** Your project is now running

## Common Commands

```bash
# View PM2 processes
pm2 list

# View logs
pm2 logs nodepilot-backend
pm2 logs nodepilot-frontend

# Restart services
pm2 restart nodepilot-backend
pm2 restart nodepilot-frontend

# Stop services
pm2 stop all

# Start services
pm2 start all

# View system status
pm2 monit
```

## Troubleshooting

### Can't access UI?

Check if services are running:
```bash
pm2 list
```

Check ports:
```bash
sudo netstat -tulpn | grep :3000
sudo netstat -tulpn | grep :3001
```

### PM2 not saving?

```bash
pm2 save --force
pm2 startup
```

### Need to reset admin password?

```bash
cd /opt/deployer/backend
# Edit .env and change ADMIN_PASSWORD
# Then:
rm deployer.db
npm run db:init
pm2 restart nodepilot-backend
```

## Security Checklist

- [ ] Changed JWT_SECRET in .env
- [ ] Changed ADMIN_PASSWORD in .env
- [ ] Setup firewall (UFW)
- [ ] Using Nginx reverse proxy
- [ ] (Optional) Setup SSL with Certbot

```bash
# Setup firewall
sudo ufw allow 22
sudo ufw allow 80
sudo ufw allow 443
sudo ufw enable
```

## Next Steps

- Setup SSL with Let's Encrypt
- Configure custom domain
- Setup automatic backups
- Monitor system resources

---

**Need help?** Check the full README.md or open an issue!
