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
* 🔥 **Pure PM2 Runtime** — No Docker, no containers, zero overhead
* 📦 **Auto Dependencies** — Automatically runs `npm install`
* 🧠 **Port Auto-Detection** — Detects real running port automatically
* 📊 **System Dashboard** — CPU, RAM, Disk, and PM2 metrics
* 📝 **Real-time Logs** — WebSocket powered log streaming
* 🔐 **JWT Authentication** — Secure admin access
* 🎛️ **Modern UI** — Clean, Dokploy-style interface
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

## 1. Clone Repository

```bash
cd /opt
git clone <your-repo-url> nodepilot
cd nodepilot
```

## 2. Install Dependencies

```bash
npm install

cd backend && npm install
cd ../frontend && npm install
```

## 3. Configure Environment

```bash
cd backend
cp .env.example .env
nano .env
```

Example:

```env
JWT_SECRET=super-secret-key-change-me
ADMIN_USERNAME=admin
ADMIN_PASSWORD=change-this
PROJECTS_DIR=/opt/nodepilot/projects
```

## 4. Build Project

```bash
npm run build
```

## 5. Initialize Database

```bash
cd backend
npm run db:init
```

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





