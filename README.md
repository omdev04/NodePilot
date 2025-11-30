# 🚀 NodePilot - PM2 Based Auto Deployment System

A lightweight, Dokploy-inspired deployment platform that enables one-click deployment of Node.js applications using PM2. No Docker required!

## ✨ Features

- 🎯 **One-Click Deployment** - Upload ZIP, configure, and deploy
- 🔄 **PM2 Process Management** - Start, stop, restart, and monitor processes
- 📊 **System Monitoring** - Real-time CPU, RAM, and disk usage
- 📝 **Live Logs** - View application logs in real-time
- 🔐 **JWT Authentication** - Secure admin access
- 📦 **Auto Dependencies** - Automatic `npm install` on deployment
- 🎨 **Clean UI** - Modern, Dokploy-style interface
- ⚡ **Lightweight** - Uses <100MB RAM

## 📋 Requirements

- **Node.js** >= 18.0.0
- **Ubuntu/Debian** Linux (recommended)
- **PM2** (installed globally)
- **Nginx** (for production reverse proxy)

## 🛠️ Installation

### 1. Clone Repository

```bash
cd /opt
git clone <your-repo-url> deployer
cd deployer
```

### 2. Install Dependencies

```bash
# Install root dependencies
npm install

# Install backend dependencies
cd backend
npm install

# Install frontend dependencies
cd ../frontend
npm install
```

### 3. Configure Environment

```bash
cd backend
cp .env.example .env
nano .env
```

**Important:** Change these values in `.env`:
```env
JWT_SECRET=your-super-secret-jwt-key-CHANGE-THIS
ADMIN_USERNAME=admin
ADMIN_PASSWORD=secure-password-CHANGE-THIS
PROJECTS_DIR=/opt/deployer/projects
```

### 4. Build Applications

```bash
# From root directory
npm run build
```

### 5. Initialize Database

```bash
cd backend
npm run db:init
```

## 🚀 Running the Application

### Development Mode

```bash
# Terminal 1 - Backend
cd backend
npm run dev

# Terminal 2 - Frontend
cd frontend
npm run dev
```

Access at:
- Frontend: `http://localhost:3000`
- Backend API: `http://localhost:3001`

### Production Mode with PM2

```bash
# Start backend
cd /opt/deployer/backend
pm2 start npm --name "nodepilot-backend" -- start

# Start frontend
cd /opt/deployer/frontend
pm2 start npm --name "nodepilot-frontend" -- start

# Save PM2 configuration
pm2 save

# Enable PM2 startup on boot
pm2 startup
```

## 🔧 Production Setup

### Nginx Configuration

Create `/etc/nginx/sites-available/nodepilot`:

```nginx
server {
    listen 80;
    server_name deploy.yourdomain.com;

    # Frontend
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }

    # Backend API
    location /api {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        
        client_max_body_size 200M;
    }

    # WebSocket support for logs
    location /api/project {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_read_timeout 86400;
    }
}
```

Enable and restart Nginx:

```bash
sudo ln -s /etc/nginx/sites-available/nodepilot /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

### SSL with Certbot

```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d deploy.yourdomain.com
```

### Systemd Service (Alternative to PM2)

Create `/etc/systemd/system/nodepilot-backend.service`:

```ini
[Unit]
Description=NodePilot Backend
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/opt/deployer/backend
ExecStart=/usr/bin/node /opt/deployer/backend/dist/index.js
Restart=always
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

Create `/etc/systemd/system/nodepilot-frontend.service`:

```ini
[Unit]
Description=NodePilot Frontend
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/opt/deployer/frontend
ExecStart=/usr/bin/npm start
Restart=always
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

Enable and start:

```bash
sudo systemctl enable nodepilot-backend nodepilot-frontend
sudo systemctl start nodepilot-backend nodepilot-frontend
```

## 📚 API Documentation

### Authentication

#### POST `/api/auth/login`
```json
{
  "username": "admin",
  "password": "password"
}
```

Response:
```json
{
  "token": "jwt-token",
  "user": {
    "id": 1,
    "username": "admin"
  }
}
```

### Project Management

#### POST `/api/project/create`
- **Content-Type**: `multipart/form-data`
- **Headers**: `Authorization: Bearer <token>`
- **Fields**:
  - `file`: ZIP file
  - `projectName`: Project identifier
  - `displayName`: Display name
  - `startCommand`: Command to start app
  - `port`: (optional) Port number

#### GET `/api/project/list`
Returns all projects with PM2 status

#### GET `/api/project/:id`
Get project details

#### POST `/api/project/:id/start`
Start project

#### POST `/api/project/:id/stop`
Stop project

#### POST `/api/project/:id/restart`
Restart project

#### POST `/api/project/:id/deploy`
Redeploy with new ZIP

#### DELETE `/api/project/:id`
Delete project

#### GET `/api/project/:id/logs`
Get project logs

### System Information

#### GET `/api/system/info`
Get system stats (CPU, RAM, Disk, PM2 processes)

#### GET `/api/system/metrics`
Get real-time metrics

## 📖 Usage Guide

### Creating a Project

1. **Login** with admin credentials
2. Click **"New Project"**
3. **Upload** your Node.js project as ZIP
4. **Configure**:
   - Project Name (alphanumeric)
   - Display Name
   - Start Command (`npm start`, `node index.js`, etc.)
   - Port (optional)
5. Click **"Deploy Project"**

### Managing Projects

- **View All**: Navigate to "Projects" page
- **Start/Stop**: Click action buttons
- **Restart**: Restart running process
- **View Logs**: Click "View Details" → "Logs" tab
- **Redeploy**: Upload new ZIP in project detail page
- **Delete**: Remove project completely

### Monitoring

The dashboard shows:
- CPU usage
- Memory usage
- Disk usage
- Active projects count
- Per-project metrics (CPU, RAM, uptime)

## 🔒 Security Best Practices

1. **Change default credentials** immediately
2. Use **strong JWT_SECRET** in production
3. Enable **firewall** (allow only 80/443)
4. Use **SSL/TLS** (HTTPS only)
5. **Limit upload size** (default: 200MB)
6. Run behind **Nginx reverse proxy**
7. Regular **system updates**

```bash
# UFW Firewall
sudo ufw allow 22
sudo ufw allow 80
sudo ufw allow 443
sudo ufw enable
```

## 🐛 Troubleshooting

### Port Already in Use

```bash
# Check what's using the port
sudo lsof -i :3001
sudo lsof -i :3000

# Kill process
sudo kill -9 <PID>
```

### PM2 Not Starting Projects

```bash
# Check PM2 logs
pm2 logs

# Check project logs
pm2 logs nodepilot-my-project

# Restart PM2
pm2 restart all
```

### Database Issues

```bash
cd /opt/deployer/backend
npm run db:init
```

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

## 🎯 Roadmap

- [ ] Docker support (optional)
- [ ] GitHub/GitLab integration
- [ ] Environment variables editor
- [ ] Domain management
- [ ] SSL certificate automation
- [ ] Multi-user support
- [ ] Webhooks for CI/CD
- [ ] Database backups
- [ ] Custom domains per project

## 📄 License

MIT License - feel free to use for personal or commercial projects.

## 🤝 Contributing

Contributions welcome! Please open an issue or PR.

## 💬 Support

For issues and questions, please open a GitHub issue.

---

**Built with ❤️ using Node.js, Fastify, Next.js, PM2, and SQLite**
#   N o d e P i l o t  
 #   N o d e P i l o t  
 