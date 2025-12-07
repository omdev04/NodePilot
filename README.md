# **🔥 NodePilot — Lightweight PM2-Based Deployment Panel**

### *Deploy Node.js apps in seconds. No Docker, no complexity — just pure speed.*

A modern, ultra-light deployment platform inspired by Dokploy but built **specifically for PM2 + ZIP deployment workflows**.
Perfect for freelancers, indie devs, and VPS users who want a super-simple, super-fast deployment experience.

---

<p align="center">
  <img src="https://github.com/omdev04/NodePilot/blob/main/frontend/public/Logo/Full_logo.png" width="200 height=200" />
</p>

<p align="center">
  <b>One-Click Deployment • PM2 Manager • Live Logs • System Monitoring • Zero-Docker</b>
</p>

---

# ⚡ Features

* 🚀 **One-Click Deployment** — Upload ZIP → Auto extract → Auto install → Run
* 🔔 **GitHub Webhooks** — Auto-deploy on git push with automatic PM2 refresh
* 🔥 **Pure PM2 Runtime** — No Docker, no containers, zero overhead
* 📦 **Auto Dependencies** — Automatically runs `npm install`
* 🧠 **Port Auto-Detection** — Detects real running port automatically
* 📊 **System Dashboard** — CPU, RAM, Disk, and PM2 metrics
* 📝 **Real-time Logs** — WebSocket powered log streaming
* 🔐 **JWT Authentication** — Secure admin access
* 🎛️ **Modern UI** — Clean, Dokploy-style interface
* 🔒 **Automatic SSL** — Caddy reverse proxy with auto HTTPS via Let's Encrypt
* ⚡ **Lightweight** — Uses less than **100MB RAM**

---

# 📁 Project Structure

```
NodePilot/
├── backend/
│   ├── src/
│   │   ├── routes/
│   │   ├── services/
│   │   ├── middleware/
│   │   ├── utils/
│   │   └── index.ts
│   ├── package.json
│   └── tsconfig.json
├── frontend/
│   ├── app/
│   ├── components/
│   ├── lib/
│   └── package.json
├── projects/               # Deployed apps stored here
└── package.json
```

---

# 🛠️ Installation

## 🐧 Linux (Ubuntu/Debian) - Recommended

### Quick Install (5 minutes)

```bash
git clone https://github.com/yourusername/NodePilot.git
cd NodePilot
chmod +x setup.sh
sudo ./setup.sh
./start.sh
```

**Full documentation**: [LINUX_DEPLOYMENT.md](./LINUX_DEPLOYMENT.md)

**Caddy setup (automatic SSL)**: [CADDY_DEPLOYMENT.md](./CADDY_DEPLOYMENT.md)

### Quick Commands
```bash
./start.sh          # Start NodePilot
./start-caddy.sh    # Start with Caddy (automatic SSL)
./stop.sh           # Stop NodePilot  
./restart.sh        # Restart NodePilot
./status.sh         # Check status
```

## 🪟 Windows Development

See [WINDOWS_DEV.md](./WINDOWS_DEV.md) for Windows setup.

## 📦 Manual Installation (Any OS)

### 1. Clone Repository

```bash
git clone https://github.com/yourusername/NodePilot.git
cd NodePilot
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Configure Environment

```bash
# Backend
cp backend/.env.example backend/.env
nano backend/.env

# Frontend
cp frontend/.env.example frontend/.env.local
nano frontend/.env.local
```

### 4. Build Project

```bash
npm run build
```

### 5. Start Application

#### 🎯 Single Port Mode (Recommended)
Access everything on **one port** (9001):

```bash
# Linux/Mac
./start-single-port.sh

# Windows
start-single-port.bat
```

**Access:** http://localhost:9001 (Frontend + Backend both on same port!)

#### 🔀 Dual Port Mode (Traditional)
Separate ports for frontend and backend:

```bash
# Development
npm run dev

# Production with PM2
pm2 start ecosystem.config.js
pm2 save
```

**See:** [SINGLE_PORT_GUIDE.md](./SINGLE_PORT_GUIDE.md) for details.

---

# 🚀 Running NodePilot

## Development Mode

```bash
# Backend
cd backend
npm run dev

# Frontend
cd frontend
npm run dev
```

* Frontend: `http://localhost:3000`
* Backend: `http://localhost:3001`

## Production Mode (PM2)

```bash
cd backend
pm2 start npm --name "nodepilot-backend" -- start

cd ../frontend
pm2 start npm --name "nodepilot-frontend" -- start

pm2 save
pm2 startup
```

---

# 🔧 Nginx Setup (Recommended)

Create file:
`/etc/nginx/sites-available/nodepilot`

```nginx
server {
    listen 80;
    server_name deploy.yourdomain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
    }

    location /api {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        client_max_body_size 200M;
    }
}
```

Enable:

```bash
sudo ln -s /etc/nginx/sites-available/nodepilot /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

### SSL (Optional)

```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d deploy.yourdomain.com
```

---

# 🧪 API Reference

## 🔐 Login

**POST** `/api/auth/login`

```json
{ "username": "admin", "password": "password" }
```

Response:

```json
{
  "token": "jwt",
  "user": { "username": "admin" }
}
```

---

## 📦 Project APIs

### Create Project

**POST** `/api/project/create`
`multipart/form-data`

```
file: project.zip  
projectName: myapp  
startCommand: npm start  
```

### Get All Projects

**GET** `/api/project/list`

### Deploy ZIP (Redeploy)

**POST** `/api/project/:id/deploy`

### Logs

**GET** `/api/project/:id/logs`

### Actions

```
POST /api/project/:id/start  
POST /api/project/:id/stop  
POST /api/project/:id/restart  
DELETE /api/project/:id  
```

---

## 🖥️ System APIs

### System Info

**GET** `/api/system/info`

### Real-Time Metrics

**GET** `/api/system/metrics`

---

# 🧩 Usage Guide

### Create a Project

1. Login
2. Click **New Project**
3. Upload ZIP
4. Enter

   * Name
   * Start Command
   * Port (optional)
5. Hit **Deploy**

### Manage Projects

* Start / Stop / Restart
* View logs
* Redeploy
* Delete

### Monitor Server

Dashboard shows:

* CPU
* RAM
* Disk
* Uptime
* Active processes

---

# 🔒 Security Best Practices

* Change default admin password
* Use strong `JWT_SECRET`
* Reverse proxy behind Nginx
* Enable firewall

```bash
sudo ufw allow 22
sudo ufw allow 80
sudo ufw allow 443
sudo ufw enable
```

* Use HTTPS only

---

# 🐛 Troubleshooting

### Port Already in Use

```bash
sudo lsof -i :3000
sudo kill -9 <PID>
```

### PM2 Issues

```bash
pm2 logs
pm2 restart all
```

### Permissions Fix

```bash
sudo chown -R $USER:$USER /opt/nodepilot
```

<<<<<<< HEAD
### Permission Issues

```bash
sudo chown -R $USER:$USER /opt/deployer
sudo chmod -R 755 /opt/deployer
```

## 📁 Project Structure

```
NodePilot/
├── backend/
│   ├── src/
│   │   ├── routes/          # API routes
│   │   ├── services/        # Business logic
│   │   ├── middleware/      # Auth middleware
│   │   ├── utils/           # Utilities
│   │   └── index.ts         # Entry point
│   ├── package.json
│   └── tsconfig.json
├── frontend/
│   ├── app/                 # Next.js 14 App Router
│   │   ├── dashboard/
│   │   ├── projects/
│   │   └── login/
│   ├── components/          # UI components
│   ├── lib/                 # Utils & API client
│   └── package.json
├── projects/                # Deployed projects
└── package.json
```

## 🆕 Git Deploy Feature (NEW!)

NodePilot now supports **Git-based deployments** with auto-deploy webhooks!

### **Quick Start with Git**

1. Go to **Create Project** → **Git Deploy** tab
2. Enter your Git repository URL: `https://github.com/user/repo.git`
3. Choose branch, start command, and optional build command
4. Click **Deploy Project**
5. Set up webhooks for auto-deploy on push

### **Features**
- ✅ Deploy from GitHub, GitLab, Bitbucket
- ✅ Automatic dependency installation
- ✅ Build command support (TypeScript, Webpack, etc.)
- ✅ Branch switching with one click
- ✅ Auto-deploy via webhooks
- ✅ Rollback to previous versions
- ✅ Production-grade security

### **Documentation**
- 📖 [Complete Guide](./GIT_DEPLOY_GUIDE.md) - Full documentation
- 🚀 [Quick Start](./GIT_DEPLOY_QUICKSTART.md) - Deploy in 3 minutes
- 🧪 [Testing Checklist](./GIT_DEPLOY_TESTING.md) - 40-point test guide
- 📋 [Implementation](./GIT_DEPLOY_IMPLEMENTATION.md) - Technical details

---

## 🎯 Roadmap

- [x] **Git Deploy** - Deploy from GitHub/GitLab/Bitbucket ✅
- [x] **Webhooks** - Auto-deploy on push ✅
- [x] **Branch Management** - Switch branches dynamically ✅
- [x] **Build Pipeline** - TypeScript, Next.js, etc. ✅
- [x] **Environment Variables Editor** - Full CRUD UI ✅
- [x] **Domain Management** - SSL automation ✅
- [x] **Rollback Support** - Instant restore ✅
- [ ] Docker support (optional)
- [ ] Multi-user support with roles
- [ ] Database backups automation
- [ ] Git submodules support
- [ ] Monorepo support (Nx, Turborepo)
- [ ] Pull request preview deployments

## 📄 License

MIT License - feel free to use for personal or commercial projects.

## 🤝 Contributing

Contributions welcome! Please open an issue or PR.

## 💬 Support

For issues and questions, please open a GitHub issue.

---

**Built with ❤️ using Node.js, Fastify, Next.js, PM2, and SQLite**
#   N o d e P i l o t 
 
 #   N o d e P i l o t 
 
 
=======
---

# 🌍 Roadmap

* [ ] Environment Variables Editor
* [ ] GitHub/GitLab Deployments
* [ ] Custom Domain + Auto SSL
* [ ] Multi-User Access
* [ ] Webhook Deploy
* [ ] Backups UI
* [ ] File browser
* [ ] Template projects

---

# 🤝 Contributing

Pull requests and feature suggestions are welcome!

---

# 📜 License

MIT License — Free for personal & commercial use.

---

# 💙 Made with passion





>>>>>>> 5d1ddd3352d4152f46547bb8f360550177e94875
