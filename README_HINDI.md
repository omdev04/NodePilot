# 🐧 NodePilot - Linux Deployment Guide (Hindi)

## ✅ Project Ab Linux Ready Hai!

Tumhara NodePilot project ab **Linux pe smoothly run** karega with proper file naming aur configuration.

---

## 🚀 Quick Start (5 Minute Setup)

```bash
# 1. Repository clone karo
git clone https://github.com/yourusername/NodePilot.git
cd NodePilot

# 2. First time setup
chmod +x first-time-setup.sh
./first-time-setup.sh

# 3. Complete setup (root/sudo se)
sudo ./setup.sh

# 4. Environment configure karo
nano backend/.env

# 5. Start karo
./start.sh
```

---

## 📋 Kya-Kya Banaya Gaya

### 1. Shell Scripts (सभी Linux compatible)
- ✅ `setup.sh` - Complete automatic installation
- ✅ `start.sh` - NodePilot start karne ke liye
- ✅ `stop.sh` - NodePilot stop karne ke liye
- ✅ `restart.sh` - Restart karne ke liye
- ✅ `status.sh` - Status aur logs dekhne ke liye
- ✅ `check.sh` - System check karne ke liye
- ✅ `test-linux.sh` - Linux compatibility test

### 2. Configuration Files
- ✅ `.env.example` files updated
- ✅ Relative paths use ki gayi (../projects, ../logs)
- ✅ Linux-friendly directory structure

### 3. Service Files
- ✅ Systemd service files (production ke liye)
- ✅ PM2 ecosystem config (development ke liye)

### 4. Documentation
- ✅ `LINUX_DEPLOYMENT.md` - Complete guide English mein
- ✅ `LINUX_QUICKSTART.md` - Quick start guide
- ✅ `LINUX_READY.md` - Complete summary
- ✅ `README_HINDI.md` - Yeh file! (Hindi guide)

---

## 🎯 Basic Commands

```bash
./start.sh      # Start karo
./stop.sh       # Stop karo
./restart.sh    # Restart karo
./status.sh     # Status dekho
./check.sh      # System check karo
```

---

## 🌐 Access URLs

- **Frontend**: http://localhost:9000
- **Backend**: http://localhost:9001
- **Health Check**: http://localhost:9001/health

---

## 🔧 Setup Process Detail Mein

### Step 1: System Requirements
```bash
# Ubuntu 20.04+ ya Debian 11+ chahiye
# Node.js 18+ (setup.sh automatically install karega)
# 2GB RAM minimum
# Root/sudo access
```

### Step 2: Clone aur Setup
```bash
# Repository clone karo
git clone https://github.com/yourusername/NodePilot.git
cd NodePilot

# Scripts ko executable banao
chmod +x *.sh

# Setup run karo (root/sudo se)
sudo ./setup.sh
```

**Setup.sh kya karega:**
- ✅ Node.js 20 LTS install karega
- ✅ PM2 globally install karega
- ✅ System dependencies install karega (nginx, certbot)
- ✅ Project dependencies install karega
- ✅ Backend build karega
- ✅ Frontend build karega
- ✅ Required directories banayega
- ✅ Permissions set karega
- ✅ Environment files create karega
- ✅ PM2 ecosystem configure karega

### Step 3: Environment Configure Karo
```bash
# Backend configuration
nano backend/.env
```

**Important settings:**
```bash
PORT=9001
HOST=0.0.0.0
JWT_SECRET=apna-secret-key-yahan-dalo-32-characters
DB_PATH=./deployer.db
PROJECTS_DIR=../projects
BACKUPS_DIR=../backups
LOG_DIR=../logs
```

```bash
# Frontend configuration
nano frontend/.env.local
```

```bash
NEXT_PUBLIC_API_URL=http://localhost:9001
```

### Step 4: Start Karo
```bash
./start.sh
```

### Step 5: Verify Karo
```bash
# Status check karo
./status.sh

# Backend health check
curl http://localhost:9001/health

# Frontend check
curl http://localhost:9000
```

---

## 🎮 Daily Use Commands

```bash
# Start karne ke liye
./start.sh

# Stop karne ke liye
./stop.sh

# Restart karne ke liye
./restart.sh

# Status aur logs dekhne ke liye
./status.sh

# PM2 se directly manage karne ke liye
pm2 status
pm2 logs
pm2 monit
```

---

## 🔐 Production Deployment (Server pe)

### Option 1: PM2 ke saath (Simple)
```bash
./start.sh
pm2 save
pm2 startup
```

### Option 2: Systemd ke saath (Advanced)
```bash
# Systemd services install karo
sudo cp nodepilot-*.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable nodepilot-backend
sudo systemctl enable nodepilot-frontend
sudo systemctl start nodepilot-backend
sudo systemctl start nodepilot-frontend
```

### Nginx Setup (Domain ke liye)
```bash
# Nginx configure karo
sudo nano /etc/nginx/sites-available/nodepilot

# Enable karo
sudo ln -s /etc/nginx/sites-available/nodepilot /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx

# SSL certificate (free)
sudo certbot --nginx -d yourdomain.com
```

---

## 🐛 Common Problems aur Solutions

### Problem 1: Scripts execute nahi ho rahe
```bash
# Solution: Executable banao
chmod +x *.sh

# Agar line ending issue hai
dos2unix *.sh  # (agar dos2unix installed hai)
```

### Problem 2: Port already in use
```bash
# Solution: Purane processes ko stop karo
./stop.sh

# Ya manually kill karo
sudo lsof -ti:9000 | xargs kill -9
sudo lsof -ti:9001 | xargs kill -9
```

### Problem 3: Permission denied
```bash
# Solution: Ownership fix karo
sudo chown -R $USER:$USER .
chmod -R 755 projects backups logs
```

### Problem 4: Build errors
```bash
# Solution: Clean build karo
cd backend
rm -rf dist node_modules
npm install
npm run build

cd ../frontend
rm -rf .next node_modules
npm install
npm run build
```

### Problem 5: Database locked
```bash
# Solution: Sab kuch stop karo aur restart karo
./stop.sh
rm -f backend/deployer.db-wal
rm -f backend/deployer.db-shm
./start.sh
```

---

## 📊 Monitoring aur Logs

```bash
# Real-time status
./status.sh

# PM2 logs (agar PM2 use kar rahe ho)
pm2 logs
pm2 logs nodepilot-backend
pm2 logs nodepilot-frontend

# Direct log files
tail -f logs/backend-out.log
tail -f logs/frontend-out.log

# Systemd logs (agar systemd use kar rahe ho)
sudo journalctl -u nodepilot-backend -f
sudo journalctl -u nodepilot-frontend -f
```

---

## 🔄 Update Kaise Kare

```bash
# Stop karo
./stop.sh

# Latest code pull karo
git pull

# Rebuild karo
cd backend && npm run build && cd ..
cd frontend && npm run build && cd ..

# Restart karo
./start.sh
```

---

## ✅ Verification Checklist

Setup ke baad yeh sab check karo:

- [ ] Scripts executable hain (`./start.sh` kaam kar raha hai)
- [ ] Backend running hai (port 9001)
- [ ] Frontend running hai (port 9000)
- [ ] Health endpoint respond kar raha hai
- [ ] Frontend browser mein open ho raha hai
- [ ] Logs mein koi error nahi hai
- [ ] PM2/systemd status green hai
- [ ] Database file create ho gaya hai

---

## 🎯 Production Checklist

Production server pe deploy karte waqt:

- [ ] System update kiya
- [ ] Strong JWT_SECRET set kiya
- [ ] Default passwords change kiye
- [ ] Firewall configure kiya
- [ ] Nginx setup kiya
- [ ] SSL certificate install kiya
- [ ] Auto-start enable kiya
- [ ] Monitoring setup kiya
- [ ] Backups configure kiye
- [ ] All functionality test ki

---

## 📚 Aur Documentation

- **English Full Guide**: [LINUX_DEPLOYMENT.md](./LINUX_DEPLOYMENT.md)
- **Quick Start**: [LINUX_QUICKSTART.md](./LINUX_QUICKSTART.md)
- **Complete Summary**: [LINUX_READY.md](./LINUX_READY.md)
- **Main README**: [README.md](./README.md)

---

## 🎉 Success!

Agar sab kuch theek se setup ho gaya hai, toh:

✅ Frontend: http://localhost:9000 pe accessible hoga
✅ Backend: http://localhost:9001 pe running hoga
✅ `./status.sh` se sab green dikhega
✅ Apps deploy kar sakte ho easily

---

## 🆘 Help Chahiye?

1. **First step**: `./check.sh` run karo
2. **Logs dekho**: `./status.sh`
3. **Documentation padho**: `LINUX_DEPLOYMENT.md`
4. **Test run karo**: `./test-linux.sh`

---

## 💡 Tips

1. **Development** ke liye PM2 use karo (easy restart aur logs)
2. **Production** ke liye systemd use karo (auto-restart on boot)
3. **Regular backups** lo database aur projects ka
4. **Strong secrets** use karo production mein
5. **HTTPS** use karo production domain pe
6. **Logs** regularly check karo
7. **Updates** regularly install karo

---

**Project Status**: ✅ Linux Ready  
**Setup Time**: ⏱️ ~5 minutes  
**Support**: Ubuntu 20.04+, Debian 11+  

Enjoy your Linux-ready NodePilot! 🚀🐧

Koi doubt hai? Documentation mein sab detail hai! 📚
