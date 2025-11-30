# 🪟 NodePilot - Windows Development Guide

Guide for developing NodePilot on Windows (for testing before Linux deployment).

## ⚠️ Important Notes

- **NodePilot is designed for Linux production deployment**
- Windows is for development/testing only
- Some PM2 features may not work perfectly on Windows
- For production, always deploy on Ubuntu/Debian Linux

---

## Windows Development Setup

### Prerequisites

1. **Node.js 18+ for Windows**
   - Download from: https://nodejs.org/
   - Install LTS version
   - Verify: `node --version`

2. **Git for Windows**
   - Download from: https://git-scm.com/download/win
   - Or use GitHub Desktop

3. **Code Editor**
   - VS Code (recommended): https://code.visualstudio.com/
   - Or any editor of your choice

4. **PM2 Global Installation**
   ```powershell
   npm install -g pm2
   npm install -g pm2-windows-startup
   pm2-startup install
   ```

### Initial Setup

```powershell
# Navigate to your project
cd C:\Users\DELL\Desktop\NodePilot

# Install root dependencies
npm install

# Install backend dependencies
cd backend
npm install

# Install frontend dependencies
cd ..\frontend
npm install

# Back to root
cd ..
```

### Configure Backend

```powershell
cd backend
Copy-Item .env.example .env
notepad .env
```

**Edit `.env` for Windows:**
```env
PORT=3001
NODE_ENV=development
HOST=0.0.0.0

JWT_SECRET=your-secret-key-for-development
ADMIN_USERNAME=admin
ADMIN_PASSWORD=admin123

# Windows path - use forward slashes or escaped backslashes
PROJECTS_DIR=C:/Users/DELL/Desktop/NodePilot/projects
# Or: PROJECTS_DIR=C:\\Users\\DELL\\Desktop\\NodePilot\\projects

MAX_UPLOAD_SIZE=209715200
DB_PATH=./deployer.db
```

### Initialize Database

```powershell
cd backend
npm run db:init
```

---

## Running in Development Mode

### Option 1: Two Separate PowerShell Windows

**PowerShell Window 1 - Backend:**
```powershell
cd C:\Users\DELL\Desktop\NodePilot\backend
npm run dev
```

**PowerShell Window 2 - Frontend:**
```powershell
cd C:\Users\DELL\Desktop\NodePilot\frontend
npm run dev
```

### Option 2: Using Concurrently (Recommended)

```powershell
# From root directory
cd C:\Users\DELL\Desktop\NodePilot
npm run dev
```

This starts both backend and frontend together!

---

## Accessing the Application

- **Frontend**: http://localhost:3000
- **Backend API**: http://localhost:3001
- **Health Check**: http://localhost:3001/health

**Default Login:**
- Username: `admin`
- Password: `admin123`

---

## Building for Production (Windows)

```powershell
# Build backend
cd backend
npm run build

# Build frontend
cd ..\frontend
npm run build

# Test production build locally
cd ..\backend
npm start

# In new window
cd ..\frontend
npm start
```

---

## PM2 on Windows

### Basic PM2 Commands

```powershell
# Start backend
cd C:\Users\DELL\Desktop\NodePilot\backend
pm2 start dist\index.js --name nodepilot-backend

# Start frontend
cd C:\Users\DELL\Desktop\NodePilot\frontend
pm2 start npm --name nodepilot-frontend -- start

# List processes
pm2 list

# View logs
pm2 logs
pm2 logs nodepilot-backend
pm2 logs nodepilot-frontend

# Restart
pm2 restart nodepilot-backend
pm2 restart nodepilot-frontend

# Stop
pm2 stop nodepilot-backend
pm2 stop nodepilot-frontend

# Delete
pm2 delete nodepilot-backend
pm2 delete nodepilot-frontend

# Save configuration
pm2 save
```

### PM2 Windows Limitations

- Some PM2 features are limited on Windows
- Cluster mode may not work properly
- System monitoring may be less accurate
- Auto-restart on boot requires special setup

---

## Testing Project Deployment (Windows)

### Create a Test Project

```powershell
# Create a simple test project
mkdir C:\temp\test-project
cd C:\temp\test-project

# Create package.json
@"
{
  "name": "test-app",
  "version": "1.0.0",
  "main": "index.js",
  "scripts": {
    "start": "node index.js"
  }
}
"@ | Out-File -FilePath package.json -Encoding UTF8

# Create index.js
@"
const http = require('http');
const port = process.env.PORT || 3000;

const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/html' });
  res.end('<h1>Hello from NodePilot Test App!</h1>');
});

server.listen(port, () => {
  console.log('Server running on port ' + port);
});
"@ | Out-File -FilePath index.js -Encoding UTF8

# Create ZIP (requires 7-Zip or use Windows built-in)
# Right-click → Send to → Compressed (zipped) folder
# Or use PowerShell:
Compress-Archive -Path * -DestinationPath ..\test-project.zip
```

### Deploy Test Project

1. Open http://localhost:3000
2. Login with admin credentials
3. Click "New Project"
4. Upload `test-project.zip`
5. Configure:
   - Project Name: `test-app`
   - Display Name: `Test App`
   - Start Command: `npm start`
   - Port: `5000`
6. Click "Deploy Project"

---

## Common Windows Issues & Solutions

### Issue 1: PowerShell Execution Policy

**Error:** "cannot be loaded because running scripts is disabled"

**Solution:**
```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

### Issue 2: Port Already in Use

**Error:** "Port 3000/3001 already in use"

**Check what's using the port:**
```powershell
netstat -ano | findstr :3000
netstat -ano | findstr :3001
```

**Kill process:**
```powershell
# Replace <PID> with actual process ID
taskkill /PID <PID> /F
```

### Issue 3: PM2 Not Starting

**Solution:**
```powershell
# Reinstall PM2
npm uninstall -g pm2
npm install -g pm2
npm install -g pm2-windows-startup
pm2-startup install
```

### Issue 4: SQLite Database Locked

**Solution:**
```powershell
# Stop all PM2 processes
pm2 stop all

# Delete database and recreate
cd backend
Remove-Item deployer.db
npm run db:init
```

### Issue 5: File Path Issues

**Solution:** Use forward slashes in `.env`:
```env
PROJECTS_DIR=C:/Users/DELL/Desktop/NodePilot/projects
```

Or escaped backslashes:
```env
PROJECTS_DIR=C:\\Users\\DELL\\Desktop\\NodePilot\\projects
```

---

## VS Code Configuration

### Recommended Extensions

1. **ESLint** - Code linting
2. **Prettier** - Code formatting
3. **TypeScript** - TS support
4. **Tailwind CSS IntelliSense** - Tailwind autocomplete
5. **Better Comments** - Comment highlighting
6. **GitLens** - Git integration

### VS Code Settings

Create `.vscode/settings.json`:
```json
{
  "typescript.tsdk": "node_modules/typescript/lib",
  "editor.formatOnSave": true,
  "editor.defaultFormatter": "esbenp.prettier-vscode",
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": true
  },
  "files.exclude": {
    "**/node_modules": true,
    "**/.next": true,
    "**/dist": true
  }
}
```

### VS Code Tasks

Create `.vscode/tasks.json`:
```json
{
  "version": "2.0.0",
  "tasks": [
    {
      "label": "Start Backend Dev",
      "type": "npm",
      "script": "dev",
      "path": "backend/",
      "problemMatcher": [],
      "presentation": {
        "reveal": "always",
        "panel": "dedicated"
      }
    },
    {
      "label": "Start Frontend Dev",
      "type": "npm",
      "script": "dev",
      "path": "frontend/",
      "problemMatcher": [],
      "presentation": {
        "reveal": "always",
        "panel": "dedicated"
      }
    }
  ]
}
```

---

## Testing Before Linux Deployment

### Pre-Deployment Checklist

- [ ] All features working on Windows
- [ ] No console errors in browser
- [ ] API responses correct
- [ ] Database operations successful
- [ ] File uploads working
- [ ] PM2 processes manageable
- [ ] Logs displaying correctly

### Prepare for Linux Deployment

1. **Test in WSL (Windows Subsystem for Linux):**
   ```powershell
   # Install WSL
   wsl --install
   
   # Install Ubuntu
   wsl --install -d Ubuntu
   
   # Enter WSL
   wsl
   
   # Now follow Linux deployment guide
   ```

2. **Use Docker for Linux Testing:**
   ```powershell
   # Install Docker Desktop for Windows
   # Pull Ubuntu image
   docker pull ubuntu:22.04
   
   # Run container
   docker run -it ubuntu:22.04 bash
   
   # Install Node.js and test deployment
   ```

3. **Use Cloud VM:**
   - DigitalOcean Droplet (Ubuntu)
   - AWS EC2 (Ubuntu)
   - Google Cloud VM (Ubuntu)
   - Linode (Ubuntu)

---

## Development Workflow (Windows)

```powershell
# 1. Start development servers
npm run dev

# 2. Make changes to code
# Backend: backend/src/**
# Frontend: frontend/app/**

# 3. Test changes (auto-reload enabled)

# 4. Build for production
npm run build

# 5. Test production build
cd backend; npm start
cd frontend; npm start  # In new window

# 6. Commit changes
git add .
git commit -m "feat: add feature"
git push

# 7. Deploy to Linux server
# Use deployment guide for production server
```

---

## Useful PowerShell Commands

```powershell
# Navigation
cd C:\Users\DELL\Desktop\NodePilot
Set-Location backend

# List files
Get-ChildItem
ls

# View file content
Get-Content package.json
cat package.json

# Search in files
Select-String -Path "*.ts" -Pattern "TODO"

# Kill process by port
Get-Process -Id (Get-NetTCPConnection -LocalPort 3000).OwningProcess | Stop-Process -Force

# Check Node.js version
node --version
npm --version

# Clear console
Clear-Host
cls

# Environment variables
$env:NODE_ENV = "development"
Get-ChildItem Env:

# Network
Test-NetConnection localhost -Port 3000
netstat -ano | findstr :3001
```

---

## Windows-Specific Notes

### File Paths
- Use forward slashes (`/`) or escaped backslashes (`\\`)
- Case-insensitive file system
- Avoid spaces in project paths

### Line Endings
- Git may convert LF to CRLF
- Configure: `git config --global core.autocrlf true`

### Performance
- Windows may be slower than Linux for Node.js
- Use SSD for better performance
- Close unnecessary background apps

### Firewall
- Windows Defender may block ports
- Allow Node.js through firewall when prompted

---

## Moving to Production (Linux)

When ready for production:

1. **Push code to Git:**
   ```powershell
   git add .
   git commit -m "ready for production"
   git push
   ```

2. **SSH to Linux server:**
   ```powershell
   ssh user@your-server-ip
   ```

3. **Follow Linux deployment guide:**
   - See `DEPLOYMENT.md`
   - See `QUICKSTART.md`

---

## Quick Reference

```powershell
# Start development
npm run dev

# Build
npm run build

# Production
cd backend; npm start
cd frontend; npm start

# PM2
pm2 list
pm2 logs
pm2 restart all

# Database
cd backend; npm run db:init

# Clean
Remove-Item -Recurse node_modules, .next, dist
npm install
```

---

## Need Help?

- Check `README.md` for general documentation
- Check `DEVELOPMENT.md` for development guide
- Check `ARCHITECTURE.md` for technical details
- Open issue on GitHub

---

**Happy Windows Development! 🪟**

**Remember:** Always deploy to Linux for production! 🐧
