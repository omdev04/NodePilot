# 🚀 NodePilot with Caddy - Complete Guide

## Why Caddy?

✅ **Automatic HTTPS** - Let's Encrypt built-in  
✅ **Simple Configuration** - No complex syntax  
✅ **Auto Renewal** - SSL certificates renewed automatically  
✅ **HTTP/2 & HTTP/3** - Modern protocols by default  
✅ **WebSocket Support** - Built-in, no extra config  

---

## 📦 Installation

### Windows
```powershell
# Download from https://caddyserver.com/download
# Or using Chocolatey
choco install caddy

# Or using Scoop
scoop install caddy
```

### Linux (Ubuntu/Debian)
```bash
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update
sudo apt install caddy
```

### macOS
```bash
brew install caddy
```

---

## 🚀 Quick Start

### Development (localhost)

```bash
# Start backend
cd backend
npm start

# Start frontend (in another terminal)
cd frontend
npm run dev

# Start Caddy (in another terminal)
caddy run --config Caddyfile
```

**Access:** http://localhost:9002

Everything on one port! 🎉

---

## 🌐 Production Setup

### 1. Update Domain in Caddyfile

Edit `Caddyfile.production`:
```caddy
your-domain.com {
    # ... rest of config
}
```

Replace `your-domain.com` with your actual domain.

### 2. Point DNS to Server

Add A record:
```
Type: A
Name: @
Value: YOUR_SERVER_IP
```

### 3. Start Services

```bash
# Backend (production mode)
cd backend
NODE_ENV=production PORT=9001 npm start

# Frontend (production mode)
cd frontend
NODE_ENV=production PORT=9000 npm start

# Caddy with production config
sudo caddy run --config Caddyfile.production
```

### 4. Enable Caddy as System Service

**Linux:**
```bash
# Copy Caddyfile to proper location
sudo cp Caddyfile.production /etc/caddy/Caddyfile

# Enable and start service
sudo systemctl enable caddy
sudo systemctl start caddy

# Check status
sudo systemctl status caddy

# View logs
sudo journalctl -u caddy -f
```

**Windows:**
```powershell
# Install as service using NSSM
nssm install caddy "C:\path\to\caddy.exe" "run --config C:\path\to\Caddyfile.production"
nssm start caddy
```

---

## 📋 Port Configuration

| Service | Port | Access |
|---------|------|--------|
| Frontend | 9000 | Internal only |
| Backend | 9001 | Internal only |
| Caddy | 80/443 | **Public** (or 9002 for dev) |

**Users only access Caddy port** - it proxies to backend/frontend.

---

## 🔧 Caddyfile Explained

### Development Config
```caddy
:9002 {
    # Listen on port 9002
    
    handle /* {
        reverse_proxy localhost:9000  # Frontend
    }
    
    handle /api/* {
        reverse_proxy localhost:9001  # Backend API
    }
}
```

### Production Config
```caddy
yourdomain.com {
    # Automatic HTTPS from Let's Encrypt
    
    handle /api/* {
        reverse_proxy localhost:9001  # Backend
    }
    
    handle /* {
        reverse_proxy localhost:9000  # Frontend
    }
    
    # Security headers, logging, compression
}
```

---

## 🛠️ Common Commands

### Start/Stop Caddy

```bash
# Development
caddy run --config Caddyfile

# Production (foreground)
caddy run --config Caddyfile.production

# Production (background)
caddy start --config Caddyfile.production

# Stop
caddy stop

# Reload config (zero downtime)
caddy reload --config Caddyfile.production

# Validate config
caddy validate --config Caddyfile.production
```

### Check Status

```bash
# Check if Caddy is running
ps aux | grep caddy

# Check port
netstat -tulpn | grep :80
netstat -tulpn | grep :443

# View logs (if running as service)
sudo journalctl -u caddy -f
```

---

## 🔐 SSL Certificates

### Automatic HTTPS

Caddy automatically:
1. Gets SSL certificate from Let's Encrypt
2. Renews before expiry
3. Redirects HTTP to HTTPS

**No configuration needed!** Just use a domain name.

### Manual Certificate

```caddy
yourdomain.com {
    tls /path/to/cert.pem /path/to/key.pem
    
    # ... rest of config
}
```

### Development SSL

```caddy
localhost {
    tls internal  # Self-signed cert for localhost
    
    # ... rest of config
}
```

---

## 📊 Monitoring & Logs

### Enable Admin API

Add to Caddyfile:
```caddy
{
    admin :2019  # Admin API on port 2019
}
```

Access metrics: http://localhost:2019/metrics

### Log Configuration

```caddy
yourdomain.com {
    log {
        output file /var/log/caddy/access.log {
            roll_size 100mb
            roll_keep 10
        }
        format json
    }
}
```

### View Logs

```bash
# Real-time logs
tail -f /var/log/caddy/access.log

# JSON formatted logs
cat /var/log/caddy/access.log | jq
```

---

## 🔥 Advanced Features

### Load Balancing

```caddy
yourdomain.com {
    reverse_proxy localhost:9000 localhost:9001 {
        lb_policy round_robin
        health_check /health
    }
}
```

### Rate Limiting

```caddy
yourdomain.com {
    rate_limit {
        zone my_zone {
            key {remote_host}
            events 100
            window 1m
        }
    }
}
```

### Custom Error Pages

```caddy
yourdomain.com {
    handle_errors {
        @404 {
            expression {http.error.status_code} == 404
        }
        rewrite @404 /404.html
        file_server
    }
}
```

---

## 🐛 Troubleshooting

### Port 80/443 Already in Use

```bash
# Find process using port
sudo lsof -i :80
sudo lsof -i :443

# Stop conflicting service
sudo systemctl stop nginx  # if nginx running
sudo systemctl stop apache2  # if apache running
```

### Certificate Issues

```bash
# Check certificate status
caddy list-certificates

# Clear certificate cache
rm -rf ~/.local/share/caddy/certificates
```

### Permission Denied (port 80/443)

```bash
# Run with sudo (Linux)
sudo caddy run --config Caddyfile.production

# Or give capability (Linux)
sudo setcap CAP_NET_BIND_SERVICE=+eip $(which caddy)
```

---

## 📦 PM2 Integration

### Start All Services with PM2

Create `ecosystem.caddy.config.js`:
```javascript
module.exports = {
  apps: [
    {
      name: 'caddy',
      script: 'caddy',
      args: 'run --config Caddyfile.production',
      cwd: '/opt/nodepilot',
    },
    {
      name: 'backend',
      script: 'npm',
      args: 'start',
      cwd: '/opt/nodepilot/backend',
      env: {
        NODE_ENV: 'production',
        PORT: 9001,
      },
    },
    {
      name: 'frontend',
      script: 'npm',
      args: 'start',
      cwd: '/opt/nodepilot/frontend',
      env: {
        NODE_ENV: 'production',
        PORT: 9000,
      },
    },
  ],
};
```

Start all:
```bash
pm2 start ecosystem.caddy.config.js
pm2 save
```

---

## ✅ Production Checklist

- [ ] Domain DNS pointing to server
- [ ] Firewall allows port 80 & 443
- [ ] Updated Caddyfile.production with domain
- [ ] Backend running on port 9001
- [ ] Frontend running on port 9000
- [ ] Caddy running with production config
- [ ] HTTPS working (automatic)
- [ ] Logs configured
- [ ] Services set to auto-start

---

## 🎯 Benefits Over Nginx

| Feature | Caddy | Nginx |
|---------|-------|-------|
| **HTTPS Setup** | Automatic | Manual |
| **Config Syntax** | Simple | Complex |
| **HTTP/2** | Default | Requires config |
| **WebSocket** | Built-in | Extra config |
| **Reload** | Zero-downtime | Requires signal |

---

## 📞 Quick Reference

```bash
# Development
caddy run --config Caddyfile

# Production
sudo caddy run --config Caddyfile.production

# Reload
caddy reload

# Stop
caddy stop

# Validate
caddy validate --config Caddyfile.production
```

**Access:**
- Development: http://localhost:9002
- Production: https://yourdomain.com

---

## 🎉 Done!

Caddy setup complete! Enjoy automatic HTTPS and simple configuration! 🚀

For more info: https://caddyserver.com/docs/
