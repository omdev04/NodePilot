# 📚 NodePilot - Documentation Index

Welcome to NodePilot! This index will help you find exactly what you need.

---

## 🚀 Quick Start

**New to NodePilot? Start here:**

1. **[README.md](README.md)** - Main documentation with overview and features
2. **[QUICKSTART.md](QUICKSTART.md)** - Get started in 5 minutes
3. **[CHEATSHEET.md](CHEATSHEET.md)** - Quick command reference

---

## 📖 Core Documentation

### For Users

- **[README.md](README.md)** - Complete user manual
  - Features overview
  - Installation instructions
  - Usage guide
  - API documentation
  - Troubleshooting

- **[QUICKSTART.md](QUICKSTART.md)** - Fast setup guide
  - Prerequisites
  - Installation steps
  - First deployment
  - Common commands

- **[FEATURES.md](FEATURES.md)** - Complete feature list
  - All implemented features
  - Technical specs
  - Performance metrics
  - Security features

### For Developers

- **[DEVELOPMENT.md](DEVELOPMENT.md)** - Developer guide
  - Local setup
  - Code structure
  - Adding features
  - Testing
  - Git workflow

- **[WINDOWS_DEV.md](WINDOWS_DEV.md)** - Windows development
  - Windows setup
  - PowerShell commands
  - Common issues
  - VS Code configuration

- **[ARCHITECTURE.md](ARCHITECTURE.md)** - Technical deep-dive
  - System architecture
  - Database schema
  - API design
  - Deployment flow
  - Performance optimizations

### For DevOps

- **[DEPLOYMENT.md](DEPLOYMENT.md)** - Production deployment
  - PM2 deployment
  - Systemd deployment
  - Nginx configuration
  - SSL setup
  - Monitoring
  - Backup strategies

---

## 🎯 By Use Case

### "I want to try NodePilot quickly"
→ Read: **[QUICKSTART.md](QUICKSTART.md)**

### "I want to understand all features"
→ Read: **[README.md](README.md)** + **[FEATURES.md](FEATURES.md)**

### "I want to deploy to production"
→ Read: **[DEPLOYMENT.md](DEPLOYMENT.md)**

### "I want to contribute code"
→ Read: **[DEVELOPMENT.md](DEVELOPMENT.md)** + **[ARCHITECTURE.md](ARCHITECTURE.md)**

### "I'm developing on Windows"
→ Read: **[WINDOWS_DEV.md](WINDOWS_DEV.md)**

### "I need quick commands"
→ Read: **[CHEATSHEET.md](CHEATSHEET.md)**

### "I want to see the big picture"
→ Read: **[VISUAL_OVERVIEW.md](VISUAL_OVERVIEW.md)** + **[PROJECT_SUMMARY.md](PROJECT_SUMMARY.md)**

---

## 📋 Configuration Files

### Backend Configuration
- **`backend/.env.example`** - Environment variables template
- **`backend/package.json`** - Backend dependencies
- **`backend/tsconfig.json`** - TypeScript configuration

### Frontend Configuration
- **`frontend/package.json`** - Frontend dependencies
- **`frontend/next.config.js`** - Next.js configuration
- **`frontend/tailwind.config.js`** - Tailwind CSS configuration
- **`frontend/.env.local.example`** - Frontend environment variables

### Infrastructure
- **`nginx.conf`** - Nginx reverse proxy configuration
- **`nodepilot-backend.service`** - Systemd service for backend
- **`nodepilot-frontend.service`** - Systemd service for frontend
- **`install.sh`** - Automated installation script

### Project Root
- **`package.json`** - Root workspace configuration
- **`.gitignore`** - Git ignore rules

---

## 🗂️ By Topic

### Installation & Setup
1. [QUICKSTART.md](QUICKSTART.md) - Quick installation
2. [README.md#installation](README.md#installation) - Detailed installation
3. [DEPLOYMENT.md](DEPLOYMENT.md) - Production deployment
4. [WINDOWS_DEV.md](WINDOWS_DEV.md) - Windows setup

### Usage & Features
1. [README.md#usage-guide](README.md#usage-guide) - How to use
2. [FEATURES.md](FEATURES.md) - All features
3. [CHEATSHEET.md](CHEATSHEET.md) - Quick reference

### Development
1. [DEVELOPMENT.md](DEVELOPMENT.md) - Development guide
2. [ARCHITECTURE.md](ARCHITECTURE.md) - Technical architecture
3. [WINDOWS_DEV.md](WINDOWS_DEV.md) - Windows development

### Operations
1. [DEPLOYMENT.md](DEPLOYMENT.md) - Deployment guide
2. [README.md#troubleshooting](README.md#troubleshooting) - Troubleshooting
3. [CHEATSHEET.md](CHEATSHEET.md) - Quick commands

---

## 📚 Documentation Files

| File | Purpose | Audience |
|------|---------|----------|
| [README.md](README.md) | Main documentation | Everyone |
| [QUICKSTART.md](QUICKSTART.md) | 5-minute setup | New users |
| [DEPLOYMENT.md](DEPLOYMENT.md) | Production deployment | DevOps |
| [DEVELOPMENT.md](DEVELOPMENT.md) | Developer guide | Developers |
| [WINDOWS_DEV.md](WINDOWS_DEV.md) | Windows development | Windows devs |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Technical details | Advanced devs |
| [FEATURES.md](FEATURES.md) | Feature list | Everyone |
| [CHEATSHEET.md](CHEATSHEET.md) | Quick commands | Everyone |
| [PROJECT_SUMMARY.md](PROJECT_SUMMARY.md) | Project overview | Everyone |
| [VISUAL_OVERVIEW.md](VISUAL_OVERVIEW.md) | Visual diagrams | Everyone |
| [INDEX.md](INDEX.md) | This file | Everyone |

---

## 🎓 Learning Path

### Beginner Path
1. Read [README.md](README.md) introduction
2. Follow [QUICKSTART.md](QUICKSTART.md)
3. Deploy your first project
4. Browse [FEATURES.md](FEATURES.md)
5. Keep [CHEATSHEET.md](CHEATSHEET.md) handy

### Advanced Path
1. Read [ARCHITECTURE.md](ARCHITECTURE.md)
2. Study [DEVELOPMENT.md](DEVELOPMENT.md)
3. Explore source code in `backend/` and `frontend/`
4. Make modifications
5. Deploy to production with [DEPLOYMENT.md](DEPLOYMENT.md)

### DevOps Path
1. Review [DEPLOYMENT.md](DEPLOYMENT.md)
2. Set up server environment
3. Configure Nginx with `nginx.conf`
4. Set up systemd services
5. Implement monitoring and backups

---

## 🔍 Find by Keyword

### "Install" / "Setup"
- [QUICKSTART.md](QUICKSTART.md)
- [README.md#installation](README.md)
- [install.sh](install.sh)

### "Deploy" / "Production"
- [DEPLOYMENT.md](DEPLOYMENT.md)
- [README.md#running-the-application](README.md)

### "Develop" / "Code"
- [DEVELOPMENT.md](DEVELOPMENT.md)
- [ARCHITECTURE.md](ARCHITECTURE.md)

### "Nginx" / "SSL"
- [nginx.conf](nginx.conf)
- [DEPLOYMENT.md#setup-ssl](DEPLOYMENT.md)

### "PM2"
- [README.md#running-the-application](README.md)
- [CHEATSHEET.md](CHEATSHEET.md)

### "Database" / "SQLite"
- [backend/src/utils/database.ts](backend/src/utils/database.ts)
- [ARCHITECTURE.md#database-schema](ARCHITECTURE.md)

### "API"
- [ARCHITECTURE.md#api-endpoints](ARCHITECTURE.md)
- [README.md#api-documentation](README.md)

### "Troubleshooting" / "Problems"
- [README.md#troubleshooting](README.md)
- [DEPLOYMENT.md#troubleshooting](DEPLOYMENT.md)
- [WINDOWS_DEV.md#common-windows-issues](WINDOWS_DEV.md)

---

## 🆘 Getting Help

### Documentation Not Clear?
1. Check [README.md](README.md) FAQ section
2. Look at [VISUAL_OVERVIEW.md](VISUAL_OVERVIEW.md) for diagrams
3. Review [CHEATSHEET.md](CHEATSHEET.md) for quick fixes

### Installation Issues?
1. Follow [QUICKSTART.md](QUICKSTART.md) step-by-step
2. Check [README.md#troubleshooting](README.md)
3. For Windows: see [WINDOWS_DEV.md](WINDOWS_DEV.md)

### Development Questions?
1. Read [DEVELOPMENT.md](DEVELOPMENT.md)
2. Study [ARCHITECTURE.md](ARCHITECTURE.md)
3. Examine source code

### Production Problems?
1. Check [DEPLOYMENT.md](DEPLOYMENT.md)
2. Review logs with commands in [CHEATSHEET.md](CHEATSHEET.md)
3. Check troubleshooting sections

---

## 📞 Quick Links

### Most Important
- **Start Here**: [QUICKSTART.md](QUICKSTART.md)
- **Full Manual**: [README.md](README.md)
- **Quick Reference**: [CHEATSHEET.md](CHEATSHEET.md)

### For Production
- **Deploy Guide**: [DEPLOYMENT.md](DEPLOYMENT.md)
- **Nginx Config**: [nginx.conf](nginx.conf)
- **Systemd Services**: [nodepilot-backend.service](nodepilot-backend.service), [nodepilot-frontend.service](nodepilot-frontend.service)

### For Development
- **Dev Guide**: [DEVELOPMENT.md](DEVELOPMENT.md)
- **Architecture**: [ARCHITECTURE.md](ARCHITECTURE.md)
- **Windows Dev**: [WINDOWS_DEV.md](WINDOWS_DEV.md)

---

## 🎯 Recommended Reading Order

### For First-Time Users
1. [README.md](README.md) - Overview (5 min)
2. [QUICKSTART.md](QUICKSTART.md) - Setup (10 min)
3. [CHEATSHEET.md](CHEATSHEET.md) - Commands (5 min)

### For Developers
1. [README.md](README.md) - Overview (5 min)
2. [ARCHITECTURE.md](ARCHITECTURE.md) - Architecture (15 min)
3. [DEVELOPMENT.md](DEVELOPMENT.md) - Development (20 min)
4. Source code exploration (ongoing)

### For DevOps Engineers
1. [README.md](README.md) - Overview (5 min)
2. [DEPLOYMENT.md](DEPLOYMENT.md) - Deployment (30 min)
3. [ARCHITECTURE.md](ARCHITECTURE.md) - Architecture (15 min)
4. Configuration files review (15 min)

---

## 📦 Project Files

```
NodePilot/
├── 📚 Documentation (You are here!)
│   ├── INDEX.md                ← This file
│   ├── README.md               ← Start here
│   ├── QUICKSTART.md           ← Fast setup
│   ├── DEPLOYMENT.md           ← Production guide
│   ├── DEVELOPMENT.md          ← Developer guide
│   ├── WINDOWS_DEV.md          ← Windows setup
│   ├── ARCHITECTURE.md         ← Technical details
│   ├── FEATURES.md             ← Feature list
│   ├── CHEATSHEET.md           ← Quick commands
│   ├── PROJECT_SUMMARY.md      ← Overview
│   └── VISUAL_OVERVIEW.md      ← Diagrams
│
├── ⚙️ Configuration
│   ├── package.json
│   ├── .gitignore
│   ├── nginx.conf
│   ├── install.sh
│   ├── nodepilot-backend.service
│   └── nodepilot-frontend.service
│
├── 🔧 Backend
│   └── backend/
│       ├── src/
│       ├── package.json
│       ├── tsconfig.json
│       └── .env.example
│
└── 🎨 Frontend
    └── frontend/
        ├── app/
        ├── components/
        ├── lib/
        └── package.json
```

---

## ✅ Documentation Checklist

Before starting, make sure you have:

- [ ] Read [README.md](README.md) overview
- [ ] Followed [QUICKSTART.md](QUICKSTART.md) OR [DEPLOYMENT.md](DEPLOYMENT.md)
- [ ] Reviewed [FEATURES.md](FEATURES.md)
- [ ] Bookmarked [CHEATSHEET.md](CHEATSHEET.md)
- [ ] Know where to find help (this file!)

---

## 🎊 You're All Set!

You now know how to navigate the NodePilot documentation. Choose your path and start building!

**Happy Deploying! 🚀**

---

*Last Updated: 2025*  
*NodePilot - PM2 Based Auto Deployment System*
