# 🚀 NodePilot - Quick Start Guide (Windows Development)

## ✅ Installation Complete!

Your NodePilot system is now set up and ready to run. Here's how to start:

---

## 📋 What We Fixed

1. ✅ Replaced `better-sqlite3` with `sql.js` (no Visual Studio Build Tools needed!)
2. ✅ Fixed `node-unzipper` → `unzipper` package name
3. ✅ All dependencies installed successfully
4. ✅ Environment files configured

---

## 🎯 How to Start NodePilot

**Note:** This is a monorepo using npm workspaces. All dependencies are in the root `node_modules/`.

### Option 1: Start Everything (Easiest!)
```powershell
cd C:\Users\DELL\Desktop\NodePilot
npm run dev
```
This starts both backend and frontend in parallel using `concurrently`.

### Option 2: Using Two Terminals (Better for debugging)

**Terminal 1 - Backend:**
```powershell
cd C:\Users\DELL\Desktop\NodePilot
npm run dev:backend
```

**Terminal 2 - Frontend:**
```powershell
cd C:\Users\DELL\Desktop\NodePilot
npm run dev:frontend
```

### Option 3: From subdirectories
```powershell
cd C:\Users\DELL\Desktop\NodePilot\backend
npm run dev
```
(In another terminal)
```powershell
cd C:\Users\DELL\Desktop\NodePilot\frontend
npm run dev
```

---

## 🌐 Access Points

- **Frontend UI:** http://localhost:3000
- **Backend API:** http://localhost:3001/api
- **Default Login:**
  - Username: `admin`
  - Password: `admin123`

---

## ⚠️ Important Notes

### SQL.js vs better-sqlite3

We're using **sql.js** (pure JavaScript SQLite) for Windows development compatibility:

**Advantages:**
- ✅ No compilation required
- ✅ Works on Windows without Visual Studio Build Tools
- ✅ Cross-platform compatible

**Limitations:**
- ⚠️ In-memory by default (we save to disk after each operation)
- ⚠️ Slightly slower than better-sqlite3 for large datasets
- ⚠️ Database file is loaded entirely into memory

**For Production (Linux):**
You can switch back to `better-sqlite3` on your Linux server for better performance:

```bash
# On Ubuntu/Debian
npm uninstall sql.js
npm install better-sqlite3
```

Then update `backend/src/utils/database.ts` to use the original better-sqlite3 code.

---

## 🧪 Testing the System

1. **Start both backend and frontend**
2. **Open browser:** http://localhost:3000
3. **Login** with admin/admin123
4. **Create a test project:**
   - Click "Create Project"
   - Upload a ZIP file with a Node.js app
   - Enter start command (e.g., `npm start`)
   - Click Deploy

5. **Manage projects:**
   - View all projects on dashboard
   - Start/Stop/Restart apps
   - View real-time logs
   - Check system metrics

---

## 📁 Project Structure

```
NodePilot/
├── backend/          # Fastify API server
│   ├── src/
│   │   ├── routes/   # API endpoints
│   │   ├── services/ # PM2, deployment logic
│   │   └── utils/    # Database (sql.js)
│   └── .env          # Backend config
├── frontend/         # Next.js 14 UI
│   └── .env.local    # Frontend config
└── projects/         # Deployed apps (created on first deploy)
```

---

## 🔧 Common Commands

### Backend
```powershell
cd backend
npm run dev          # Start dev server with hot reload
npm run build        # Compile TypeScript
npm start            # Run production build
```

### Frontend
```powershell
cd frontend
npm run dev          # Start Next.js dev server
npm run build        # Build for production
npm start            # Run production server
```

---

## 🐛 Troubleshooting

### Backend won't start?
- Check if port 3001 is available: `Get-NetTCPConnection -LocalPort 3001`
- Check `.env` file exists in backend folder

### Frontend won't connect to API?
- Verify backend is running on http://localhost:3001
- Check `frontend/.env.local` has correct API URL

### PM2 issues?
- PM2 requires Node.js installed globally
- Check: `pm2 -v`
- Install if needed: `npm install -g pm2`

### Database errors?
- Delete `backend/deployer.db` and restart backend
- Database will be recreated automatically

---

## 📚 Next Steps

1. ✅ **Change default password** after first login
2. ✅ **Test project deployment** with a sample Node.js app
3. ✅ **Read full documentation** in `/docs` folder
4. ✅ **Plan production deployment** (see DEPLOYMENT.md)

---

## 🎉 You're All Set!

Your NodePilot system is ready to use. Start both servers and begin deploying projects!

**Need help?** Check the documentation files:
- `README.md` - Full overview
- `QUICKSTART.md` - Detailed quick start
- `WINDOWS_DEV.md` - Windows-specific tips
- `DEVELOPMENT.md` - Development guide
- `ARCHITECTURE.md` - System architecture

---

**Made with ❤️ for easy Node.js deployments**
