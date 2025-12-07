# NodePilot - Architecture & Technical Details

## System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                         Client Browser                       │
│                    (Next.js 14 Frontend)                     │
└────────────────────────┬────────────────────────────────────┘
                         │ HTTP/WebSocket
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                       Caddy (Reverse Proxy)                  │
│                    Port 80/443 → 3000/3001                   │
└───────┬──────────────────────────────────────────┬──────────┘
        │                                           │
        │ Port 3000                                 │ Port 3001
        ▼                                           ▼
┌──────────────────┐                    ┌──────────────────────┐
│  Next.js Server  │                    │   Fastify Backend    │
│   (Frontend)     │◄───────API─────────│      (Node.js)       │
└──────────────────┘                    └──────────┬───────────┘
                                                   │
                         ┌─────────────────────────┼──────────┐
                         │                         │          │
                         ▼                         ▼          ▼
                 ┌───────────────┐        ┌──────────┐  ┌─────────┐
                 │  SQLite DB    │        │   PM2    │  │  File   │
                 │ (deployer.db) │        │  Engine  │  │ System  │
                 └───────────────┘        └────┬─────┘  └─────────┘
                                               │
                                               │ manages
                                               ▼
                                    ┌──────────────────────┐
                                    │  Deployed Projects   │
                                    │ /opt/deployer/projects│
                                    │  ├─ project1/        │
                                    │  ├─ project2/        │
                                    │  └─ project3/        │
                                    └──────────────────────┘
```

## Technology Stack

### Backend
- **Runtime**: Node.js 18+
- **Framework**: Fastify (high performance HTTP server)
- **Process Manager**: PM2 (programmatic API)
- **Database**: SQLite (better-sqlite3)
- **File Upload**: @fastify/multipart
- **Authentication**: JWT (@fastify/jwt)
- **System Info**: systeminformation
- **File Extraction**: node-unzipper
- **Validation**: Zod

### Frontend
- **Framework**: Next.js 14 (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **UI Components**: ShadCN (Radix UI)
- **Icons**: Lucide React
- **HTTP Client**: Axios
- **State**: Zustand (for global state if needed)

### Infrastructure
- **Process Manager**: PM2
- **Reverse Proxy**: Caddy (with automatic HTTPS)
- **SSL**: Let's Encrypt (automatic via Caddy)
- **OS**: Ubuntu/Debian Linux

## Database Schema

```sql
-- Users Table
CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,  -- bcrypt hashed
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Projects Table
CREATE TABLE projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE NOT NULL,           -- sanitized name
  display_name TEXT NOT NULL,          -- user-friendly name
  path TEXT NOT NULL,                  -- /opt/deployer/projects/name
  start_command TEXT NOT NULL,         -- npm start, node index.js, etc.
  port INTEGER,                        -- optional port
  env_vars TEXT,                       -- JSON string
  pm2_name TEXT NOT NULL,              -- nodepilot-projectname
  status TEXT DEFAULT 'stopped',       -- running, stopped, error
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Deployments Table (History)
CREATE TABLE deployments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL,
  version TEXT,
  deployed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  status TEXT DEFAULT 'success',       -- success, failed
  notes TEXT,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);
```

## API Endpoints

### Authentication
- `POST /api/auth/login` - Login and get JWT token
- `GET /api/auth/verify` - Verify JWT token
- `POST /api/auth/change-password` - Change user password

### Projects
- `POST /api/project/create` - Create new project (multipart/form-data)
- `GET /api/project/list` - List all projects with status
- `GET /api/project/:id` - Get project details
- `POST /api/project/:id/start` - Start PM2 process
- `POST /api/project/:id/stop` - Stop PM2 process
- `POST /api/project/:id/restart` - Restart PM2 process
- `POST /api/project/:id/deploy` - Redeploy with new ZIP
- `DELETE /api/project/:id` - Delete project
- `GET /api/project/:id/logs` - Get logs (last N lines)
- `WS /api/project/:id/logs/stream` - WebSocket for real-time logs
- `GET /api/project/:id/deployments` - Get deployment history

### System
- `GET /api/system/info` - System information (CPU, RAM, Disk, OS)
- `GET /api/system/metrics` - Real-time metrics
- `GET /api/system/processes` - PM2 processes list

## Deployment Flow

```
┌─────────────────┐
│  User uploads   │
│   project ZIP   │
└────────┬────────┘
         │
         ▼
┌─────────────────────────────────────┐
│ 1. Save ZIP to /uploads             │
└────────┬────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────┐
│ 2. Create project directory         │
│    /opt/deployer/projects/name      │
└────────┬────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────┐
│ 3. Extract ZIP to project directory │
└────────┬────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────┐
│ 4. Check for package.json           │
│    If exists: npm install           │
└────────┬────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────┐
│ 5. Parse start command              │
│    (npm/node/yarn/etc.)             │
└────────┬────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────┐
│ 6. Create PM2 configuration         │
│    {name, script, cwd, env, etc.}   │
└────────┬────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────┐
│ 7. Start PM2 process                │
│    pm2.start(config)                │
└────────┬────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────┐
│ 8. Save PM2 configuration           │
│    pm2 save                         │
└────────┬────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────┐
│ 9. Insert record into database      │
│    projects + deployments tables    │
└────────┬────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────┐
│ 10. Clean up temporary ZIP file     │
└────────┬────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────┐
│ 11. Return success response         │
│     with project details            │
└─────────────────────────────────────┘
```

## Redeploy Flow

```
┌─────────────────┐
│  User uploads   │
│    new ZIP      │
└────────┬────────┘
         │
         ▼
┌─────────────────────────────────────┐
│ 1. Stop PM2 process                 │
│    pm2.stop(pm2_name)               │
└────────┬────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────┐
│ 2. Backup old project directory     │
│    mv project project_backup_timestamp│
└────────┬────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────┐
│ 3. Create fresh project directory   │
└────────┬────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────┐
│ 4. Extract new ZIP                  │
└────────┬────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────┐
│ 5. Install dependencies             │
│    npm install                      │
└────────┬────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────┐
│ 6. Restart PM2 process              │
│    pm2.restart(pm2_name)            │
└────────┬────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────┐
│ 7. Update database record           │
│    updated_at = NOW()               │
└────────┬────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────┐
│ 8. Add deployment history record    │
└────────┬────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────┐
│ 9. Delete backup after 60 seconds   │
│    (if deployment successful)       │
└────────┬────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────┐
│ 10. Return success                  │
└─────────────────────────────────────┘
```

## Security Features

### Authentication
- JWT-based authentication
- Bcrypt password hashing (10 rounds)
- Token expiration (configurable)
- Protected routes with middleware

### Input Validation
- Zod schema validation
- Sanitized project names (alphanumeric only)
- File type validation (ZIP only)
- File size limits (200MB default)

### File Upload Security
- Temporary upload directory
- Automatic cleanup after processing
- Restricted file types
- Path traversal prevention

### API Security
- CORS enabled (configurable origins)
- Rate limiting (can be added)
- Input sanitization
- SQL injection prevention (prepared statements)

## Performance Optimizations

### Backend
- Fastify (faster than Express)
- SQLite WAL mode (concurrent reads)
- Prepared SQL statements
- Connection pooling (if needed)

### Frontend
- Next.js SSG/SSR
- Code splitting
- Image optimization
- Static asset caching

### Database
- Indexed columns (id, name)
- WAL mode enabled
- VACUUM on cleanup
- Foreign key constraints

### PM2
- Cluster mode support
- Memory limits per process
- Auto-restart on crash
- Log rotation

## Monitoring & Logging

### Application Logs
- PM2 logs: `~/.pm2/logs/`
- Project logs: `/opt/deployer/projects/<name>/{out,error}.log`
- System logs: journalctl (if using systemd)

### Metrics Collection
- CPU usage per project
- Memory usage per project
- Uptime tracking
- Restart count
- System-wide metrics

### Health Checks
- `/health` endpoint
- PM2 status monitoring
- Database connection check
- Disk space monitoring

## Scalability Considerations

### Current Limitations
- Single server deployment
- SQLite (not for distributed systems)
- No load balancing
- Manual scaling

### Future Enhancements
- PostgreSQL/MySQL support
- Multi-server support
- Load balancer integration
- Docker/Kubernetes deployment
- Object storage for projects (S3)
- Redis for caching/sessions

## Backup Strategy

### What to Backup
1. SQLite database: `/opt/deployer/backend/deployer.db`
2. Projects directory: `/opt/deployer/projects/`
3. PM2 config: `~/.pm2/dump.pm2`
4. Environment files: `/opt/deployer/backend/.env`

### Backup Script Example
```bash
#!/bin/bash
BACKUP_DIR="/backup/nodepilot"
DATE=$(date +%Y%m%d-%H%M%S)

mkdir -p $BACKUP_DIR

# Database
cp /opt/deployer/backend/deployer.db $BACKUP_DIR/db-$DATE.db

# Projects
tar -czf $BACKUP_DIR/projects-$DATE.tar.gz /opt/deployer/projects/

# PM2
pm2 save
cp ~/.pm2/dump.pm2 $BACKUP_DIR/pm2-$DATE.json

# Keep last 7 days
find $BACKUP_DIR -mtime +7 -delete
```

## Troubleshooting Guide

### Common Issues

**Issue**: Project won't start
- Check PM2 logs: `pm2 logs <project>`
- Verify start command
- Check port conflicts
- Verify dependencies installed

**Issue**: High memory usage
- Check per-project limits in PM2
- Review application memory leaks
- Consider cluster mode

**Issue**: Database locked
- SQLite WAL mode should prevent this
- Check concurrent access
- Verify permissions

**Issue**: Upload fails
- Check disk space
- Verify file size limits
- Check Caddy max upload size if needed (default is unlimited)

## Development Workflow

```bash
# Setup development environment
git clone <repo>
cd nodepilot
npm install

# Start backend dev server
cd backend
npm run dev

# Start frontend dev server (new terminal)
cd frontend
npm run dev

# Make changes, test, commit
git add .
git commit -m "feat: add feature"
git push

# Deploy to production
ssh user@server
cd /opt/deployer
git pull
npm run build
pm2 restart all
```

---

**This architecture is designed to be simple, performant, and production-ready while maintaining ease of use and deployment.**
