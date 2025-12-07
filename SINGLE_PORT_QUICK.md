# 🚀 NodePilot - Single Port Quick Start

## Ek Port Pe Sab Kuch! (Hindi Guide)

Ab tumhe sirf **ek port yaad rakhna hai**: **9001**

---

## ⚡ Quick Setup

```bash
# 1. Dependencies install karo
cd backend
npm install

# 2. Build karo
cd ..
npm run build

# 3. Single port mode start karo
./start-single-port.sh         # Linux/Mac
# Ya
start-single-port.bat          # Windows
```

**Done!** Ab sab kuch **http://localhost:9001** pe hai!

---

## 🌐 Access

Sirf ek URL yaad rakho:

```
http://localhost:9001
```

- **Frontend**: http://localhost:9001
- **API**: http://localhost:9001/api
- **Health**: http://localhost:9001/api/health

---

## 📋 Commands

### Linux/Mac
```bash
./start-single-port.sh    # Start
./stop-single-port.sh     # Stop
```

### Windows
```bash
start-single-port.bat     # Start
stop-single-port.bat      # Stop
```

---

## 🔧 Kaise Kaam Karta Hai?

Backend ek **reverse proxy** ki tarah kaam karta hai:

```
User Request → Port 9001 (Backend)
                  ↓
           [Backend checks]
                  ↓
        /api/* ? → Backend handles
         other → Proxy to Frontend (port 9000)
```

**Internally:**
- Frontend: Port 9000 (hidden)
- Backend: Port 9001 (public)

**Externally:**
- Everything: Port 9001 ✨

---

## ⚙️ Configuration

### Backend (.env)
```bash
PORT=9001
FRONTEND_URL=http://localhost:9000
```

### Frontend (.env.local)
```bash
NEXT_PUBLIC_API_URL=http://localhost:9001
```

---

## 🎯 Benefits

✅ **Ek port yaad rakho** - 9001  
✅ **No confusion** - sab ek jagah  
✅ **Easy deployment** - ek port expose karo  
✅ **No nginx needed** - built-in proxy  
✅ **Development friendly** - simple setup  

---

## 🆚 Old vs New

### Pehle (Dual Port):
```
Frontend: http://localhost:9000
Backend:  http://localhost:9001

❌ Do ports yaad rakhne padte the
❌ CORS issues ho sakte the
❌ Do terminals chahiye the
```

### Ab (Single Port):
```
Everything: http://localhost:9001

✅ Sirf ek port
✅ No CORS issues
✅ Ek command se start
```

---

## 🐛 Common Issues

### Issue: Port already in use
```bash
# Stop karo
./stop-single-port.sh

# Ya manually
lsof -ti:9001 | xargs kill -9
lsof -ti:9000 | xargs kill -9
```

### Issue: Frontend nahi dikh raha
```bash
# Check karo dono services running hain
pm2 status

# Ya
ps aux | grep node
```

### Issue: API calls fail
```bash
# Frontend .env.local check karo
cat frontend/.env.local
# Should have: NEXT_PUBLIC_API_URL=http://localhost:9001
```

---

## 📊 Status Check

### PM2 use kar rahe ho?
```bash
pm2 status
pm2 logs
pm2 monit
```

### Manual start kiya?
```bash
# Backend logs
tail -f logs/backend-single.log

# Frontend logs
tail -f logs/frontend-single.log
```

---

## 🔄 Development Workflow

```bash
# 1. Code change karo
# 2. Build karo (agar backend change hai)
cd backend && npm run build && cd ..

# 3. Restart karo
./stop-single-port.sh
./start-single-port.sh

# 4. Test karo
curl http://localhost:9001/api/health
```

---

## 🚀 Production Deployment

```bash
# 1. Server pe code push karo
git pull

# 2. Dependencies install
cd backend && npm install && cd ..
cd frontend && npm install && cd ..

# 3. Build
npm run build

# 4. Start with PM2
./start-single-port.sh

# 5. PM2 save
pm2 save
pm2 startup
```

---

## 💡 Pro Tips

1. **PM2 use karo** production mein - auto-restart milti hai
2. **Logs regularly check karo** - `pm2 logs`
3. **Health endpoint monitor karo** - `/api/health`
4. **Firewall mein sirf 9001 open karo** - baki sab internal
5. **Load balancer** ke saath easy integration

---

## 📚 Aur Documentation

- Full Guide: [SINGLE_PORT_GUIDE.md](./SINGLE_PORT_GUIDE.md)
- Linux Setup: [LINUX_DEPLOYMENT.md](./LINUX_DEPLOYMENT.md)
- Main README: [README.md](./README.md)

---

## 🎉 Done!

Ab sirf **http://localhost:9001** yaad rakho aur enjoy karo! 🚀

Questions? Documentation padho ya logs check karo! 📝
