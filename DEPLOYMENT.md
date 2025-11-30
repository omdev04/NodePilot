# NodePilot - Deployment Guide

Complete guide for deploying NodePilot on a production server.

## Server Requirements

- **OS**: Ubuntu 20.04+ or Debian 10+
- **RAM**: Minimum 2GB (4GB recommended)
- **CPU**: 1 vCPU minimum (2+ recommended)
- **Disk**: 20GB minimum (depends on your projects)
- **Network**: Public IP or domain

## Deployment Options

### Option 1: PM2 (Recommended)

**Pros**: Simple, built-in process monitoring, auto-restart
**Best for**: Most use cases

### Option 2: Systemd

**Pros**: Native Linux service, system-level management
**Best for**: Enterprise deployments

### Option 3: Docker

**Pros**: Isolated, reproducible
**Best for**: Containerized infrastructure

---

## Option 1: PM2 Deployment

### 1. Install Prerequisites

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Node.js 20 LTS
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs git

# Install PM2
sudo npm install -g pm2
```

### 2. Clone and Setup

```bash
# Clone repository
sudo mkdir -p /opt/deployer
cd /opt/deployer
git clone <your-repo> .

# Or upload files manually
# scp -r nodepilot/ user@server:/opt/deployer/

# Install dependencies
npm install
cd backend && npm install && cd ..
cd frontend && npm install && cd ..
```

### 3. Configure

```bash
cd /opt/deployer/backend
cp .env.example .env
nano .env
```

**Critical changes in `.env`:**
```env
JWT_SECRET=<generate-secure-random-string>
ADMIN_PASSWORD=<strong-password>
PROJECTS_DIR=/opt/deployer/projects
NODE_ENV=production
```

Generate secure JWT secret:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 4. Build

```bash
# Build backend
cd /opt/deployer/backend
npm run build

# Build frontend
cd /opt/deployer/frontend
npm run build
```

### 5. Initialize Database

```bash
cd /opt/deployer/backend
npm run db:init
```

### 6. Start with PM2

```bash
# Start backend
cd /opt/deployer/backend
pm2 start dist/index.js --name nodepilot-backend -i 1

# Start frontend
cd /opt/deployer/frontend
pm2 start npm --name nodepilot-frontend -- start

# View status
pm2 list

# Save configuration
pm2 save

# Setup auto-start on reboot
pm2 startup
# Run the command it outputs
```

### 7. Setup Nginx Reverse Proxy

```bash
# Install Nginx
sudo apt install -y nginx

# Copy config
sudo cp /opt/deployer/nginx.conf /etc/nginx/sites-available/nodepilot

# Edit domain
sudo nano /etc/nginx/sites-available/nodepilot
# Change: server_name deploy.example.com;

# Enable site
sudo ln -s /etc/nginx/sites-available/nodepilot /etc/nginx/sites-enabled/

# Test and restart
sudo nginx -t
sudo systemctl restart nginx
```

### 8. Setup Firewall

```bash
# Allow SSH, HTTP, HTTPS
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp

# Enable firewall
sudo ufw enable
sudo ufw status
```

### 9. Setup SSL (Let's Encrypt)

```bash
# Install Certbot
sudo apt install -y certbot python3-certbot-nginx

# Get certificate
sudo certbot --nginx -d deploy.example.com

# Auto-renewal test
sudo certbot renew --dry-run
```

### Adding a Domain with NodePilot (Auto-cert via Certbot)

You can add a domain for a project directly through the NodePilot UI (Project > Overview > Domains) or via the API.

API Example (add-and-get certificate via certbot, Nginx will be updated and reloaded):

```bash
# JSON POST to add domain (you must be authenticated) - sample using curl
curl -X POST -H "Content-Type: application/json" -H "Authorization: Bearer <token>" \
    -d '{"domain": "your-domain.com", "email": "admin@your-domain.com"}' \
    https://your-nodepilot-server:3001/api/project/PROJECT_ID/domain
```

The server will:
- Add a Nginx server block for the domain that forwards traffic to the project's port
- Run certbot to obtain an HTTPS certificate and configure Nginx to use it
- Save certificate path to NodePilot DB and set up auto-renew (prefer systemd timer, fallback to cron)

Notes & Privilege Requirements:
- Certbot requires OS-level privileges (root or sudo); the NodePilot backend may need permission to run `sudo certbot` and `nginx` commands. On production, run NodePilot as a privileged user or configure `sudo` rules for the web server user to run `certbot`, `nginx -t`, and `systemctl reload nginx` without password.
- If `certbot` is not installed, NodePilot will attempt to install it (apt-get). If this is not possible, please install certbot manually first.
- The NodePilot backend will attempt to enable `certbot.timer` or create a cron entry to renew certificates periodically.

---

## New: ZIP Snapshot Backups & Rollback (automated)

NodePilot now creates backups (snapshots) automatically before any ZIP redeploy. This enables safe and quick rollbacks without requiring Git.

Where backups are stored:

```
/var/www/backups/<projectName>/<YYYY_MM_DD_HH-MM-SS>/
```

Each backup directory contains:
- `snapshot_<timestamp>.zip` — a snapshot of the project folder before deployment
- `env_<timestamp>` — the `.env` file that was in use
- `ecosystem_<timestamp>.json` — generated PM2 ecosystem file with the start config

How the redeploy flow works:
1. NodePilot creates a backup snapshot for the project (ZIP + env + ecosystem) and records a deployment entry in the database with a `version` timestamp.
2. ZIP is extracted and deployment proceeds (npm install, pm2 restart etc.).
3. If the deployment is successful, the backup snapshot is retained for later rollback. If it fails, NodePilot restores the project directory from the snapshot automatically.

Rollback via the UI/API:
- UI: Project → Deployments tab → choose a version → Rollback.
- API: POST /api/project/:id/rollback with `{ deploymentId }` or `{ version }` in the body.

The rollback process:
1. Stops the running PM2 process
2. Removes the current project files
3. Extracts the selected snapshot into the project path
4. Restores the saved `.env` file
5. Restores PM2 ecosystem configuration (if available), otherwise uses the project start command
6. Starts the project via PM2

Permissions & Notes:
- NodePilot needs write access to the backups directory and permission to manage PM2 processes. Ensure NodePilot runs with a user that has proper filesystem and PM2 permissions.
- The backup/restore flow uses system utilities (`zip`, `tar`, `pm2`) and may require `sudo` as needed (especially for `nginx`, `certbot`, and `systemctl`). If you want NodePilot to run non-root and allow `certbot`/`nginx -t`/`systemctl` without a password, configure `/etc/sudoers` accordingly for the NodePilot OS user.
- By default backups are stored under `BACKUPS_DIR` environment variable if set, otherwise `./backups` relative to the backend working directory.

Best practices:
- Keep a retention policy for backups on your server to avoid disk bloat. We recommend keeping last 10 backups per project or a time-based retention.
- Monitor disk usage of `/var/www/backups` and configure a periodic cleanup job if needed.

Windows-specific notes:
- On Windows, renaming directories that are in-use (open file handles) may result in EBUSY (resource busy) errors. NodePilot will try to stop the PM2 process before making backups, and will fall back to copying the project folder if rename fails. If you experience EBUSY errors, ensure:
    - The PM2 process for the app is stopped (pm2 stop <name>), or
    - You run NodePilot backend as a user with permissions to manage PM2 and file operations, and
    - No other process holds file handles (editors, AV scans, or other watchers).



---

## New: ZIP Snapshot Backups & Rollback (automated)

NodePilot now creates backups (snapshots) automatically before any ZIP redeploy. This enables safe and quick rollbacks without requiring Git.

Where backups are stored:

```
/var/www/backups/<projectName>/<YYYY_MM_DD_HH-MM-SS>/
```

Each backup directory contains:
- `snapshot_<timestamp>.zip` — a snapshot of the project folder before deployment
- `env_<timestamp>` — the `.env` file that was in use
- `ecosystem_<timestamp>.json` — generated PM2 ecosystem file with the start config

How the redeploy flow works:
1. NodePilot creates a backup snapshot for the project (ZIP + env + ecosystem) and records a deployment entry in the database with a `version` timestamp.
2. ZIP is extracted and deployment proceeds (npm install, pm2 restart etc.).
3. If the deployment is successful, the backup snapshot is retained for later rollback. If it fails, NodePilot restores the project directory from the snapshot automatically.

Rollback via the UI/API:
- UI: Project → Deployments tab → choose a version → Rollback.
- API: POST /api/project/:id/rollback with `{ deploymentId }` or `{ version }` in the body.

The rollback process:
1. Stops the running PM2 process
2. Removes the current project files
3. Extracts the selected snapshot into the project path
4. Restores the saved `.env` file
5. Restores PM2 ecosystem configuration (if available), otherwise uses the project start command
6. Starts the project via PM2

Permissions & Notes:
- NodePilot needs write access to the backups directory and permission to manage PM2 processes. Ensure NodePilot runs with a user that has proper filesystem and PM2 permissions.
- The backup/restore flow uses system utilities (`zip`, `tar`, `pm2`) and may require `sudo` as needed (especially for `nginx`, `certbot`, and `systemctl`). If you want NodePilot to run non-root and allow `certbot`/`nginx -t`/`systemctl` without a password, configure `/etc/sudoers` accordingly for the NodePilot OS user.
- By default backups are stored under `BACKUPS_DIR` environment variable if set, otherwise `./backups` relative to the backend working directory.

Best practices:
- Keep a retention policy for backups on your server to avoid disk bloat. We recommend keeping last 10 backups per project or a time-based retention.
- Monitor disk usage of `/var/www/backups` and configure a periodic cleanup job if needed.


### 10. Verify Deployment

```bash
# Check PM2
pm2 list
pm2 logs

# Check Nginx
sudo systemctl status nginx
sudo nginx -t

# Check firewall
sudo ufw status

# Test URL
curl http://localhost:3000
curl http://localhost:3001/health
```

---

## Option 2: Systemd Deployment

### 1-5: Same as PM2 (Prerequisites through Database Init)

### 6. Copy Systemd Services

```bash
sudo cp /opt/deployer/nodepilot-backend.service /etc/systemd/system/
sudo cp /opt/deployer/nodepilot-frontend.service /etc/systemd/system/

# Reload systemd
sudo systemctl daemon-reload

# Enable services
sudo systemctl enable nodepilot-backend
sudo systemctl enable nodepilot-frontend

# Start services
sudo systemctl start nodepilot-backend
sudo systemctl start nodepilot-frontend

# Check status
sudo systemctl status nodepilot-backend
sudo systemctl status nodepilot-frontend

# View logs
sudo journalctl -u nodepilot-backend -f
sudo journalctl -u nodepilot-frontend -f
```

### 7-10: Same as PM2 (Nginx, Firewall, SSL, Verify)

---

## Post-Deployment

### Monitoring

```bash
# PM2 monitoring
pm2 monit
pm2 logs

# System resources
htop
df -h
free -h

# Systemd logs (if using systemd)
sudo journalctl -u nodepilot-backend -f
```

### Maintenance

```bash
# Update code
cd /opt/deployer
git pull
npm install
cd backend && npm run build
cd ../frontend && npm run build

# Restart (PM2)
pm2 restart all

# Restart (Systemd)
sudo systemctl restart nodepilot-backend nodepilot-frontend
```

### Backup

```bash
# Backup database
cp /opt/deployer/backend/deployer.db /backup/deployer-$(date +%Y%m%d).db

# Backup projects
tar -czf /backup/projects-$(date +%Y%m%d).tar.gz /opt/deployer/projects/

# Automated backup (cron)
sudo crontab -e
# Add:
0 2 * * * cp /opt/deployer/backend/deployer.db /backup/deployer-$(date +\%Y\%m\%d).db
```

---

## Troubleshooting

### Backend Won't Start

```bash
# Check logs
pm2 logs nodepilot-backend
# or
sudo journalctl -u nodepilot-backend -n 50

# Check if port is in use
sudo lsof -i :3001
sudo netstat -tulpn | grep 3001

# Verify Node.js version
node --version  # Should be 18+
```

### Frontend Won't Start

```bash
# Check logs
pm2 logs nodepilot-frontend

# Verify build
cd /opt/deployer/frontend
npm run build

# Check API connection
nano .next/standalone/server.js
# Verify API_URL
```

### Database Errors

```bash
# Reinitialize database
cd /opt/deployer/backend
rm deployer.db
npm run db:init

# Check permissions
ls -la deployer.db
sudo chown -R $USER:$USER /opt/deployer
```

### Nginx Issues

```bash
# Check config
sudo nginx -t

# Check logs
sudo tail -f /var/log/nginx/error.log
sudo tail -f /var/log/nginx/access.log

# Restart
sudo systemctl restart nginx
```

---

## Performance Tuning

### PM2 Cluster Mode

```bash
# Use all CPU cores
pm2 start dist/index.js --name nodepilot-backend -i max
```

### Nginx Caching

Add to nginx.conf:
```nginx
proxy_cache_path /var/cache/nginx levels=1:2 keys_zone=my_cache:10m max_size=1g inactive=60m;

location / {
    proxy_cache my_cache;
    proxy_cache_valid 200 5m;
    # ... rest of config
}
```

### Database Optimization

```bash
# Enable WAL mode (already default in code)
sqlite3 deployer.db "PRAGMA journal_mode=WAL;"
```

---

## Security Hardening

```bash
# Disable root SSH (optional)
sudo nano /etc/ssh/sshd_config
# Set: PermitRootLogin no
sudo systemctl restart sshd

# Install fail2ban
sudo apt install fail2ban
sudo systemctl enable fail2ban

# Regular updates
sudo apt update && sudo apt upgrade -y

# Monitor logs
sudo tail -f /var/log/auth.log
```

---

## Useful Commands

```bash
# PM2
pm2 list                    # List processes
pm2 logs                    # All logs
pm2 logs nodepilot-backend    # Specific logs
pm2 monit                   # Real-time monitoring
pm2 restart all             # Restart all
pm2 stop all                # Stop all
pm2 delete all              # Remove all
pm2 save                    # Save config
pm2 resurrect               # Restore saved config

# Systemd
sudo systemctl status nodepilot-backend
sudo systemctl start nodepilot-backend
sudo systemctl stop nodepilot-backend
sudo systemctl restart nodepilot-backend
sudo journalctl -u nodepilot-backend -f

# Nginx
sudo systemctl status nginx
sudo systemctl restart nginx
sudo nginx -t
sudo tail -f /var/log/nginx/error.log
```

---

**For more help, see README.md or open an issue on GitHub**
