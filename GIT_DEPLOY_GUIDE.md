# 🚀 Git Pull Deploy - Complete Implementation Guide

## ✅ **FEATURE IMPLEMENTED**

NodePilot now supports **Git Pull Deploy** alongside ZIP deployment — giving you professional CI/CD capabilities with automatic deployments via webhooks.

---

## 📋 **Table of Contents**

1. [Overview](#overview)
2. [Features](#features)
3. [Architecture](#architecture)
4. [Usage Guide](#usage-guide)
5. [API Endpoints](#api-endpoints)
6. [Webhook Configuration](#webhook-configuration)
7. [Security](#security)
8. [Rollback](#rollback)
9. [Troubleshooting](#troubleshooting)

---

## 📖 **Overview**

Git Pull Deploy allows you to deploy Node.js applications directly from Git repositories (GitHub, GitLab, Bitbucket) with:

- **Automatic cloning** from any branch
- **Dependency installation** with custom commands
- **Build step support** for TypeScript, bundlers, etc.
- **Auto-deploy via webhooks** on git push
- **Branch switching** with automatic redeploy
- **Rollback support** to previous versions
- **Full validation** and error handling

---

## ✨ **Features**

### **Deployment Methods**
- ✅ **ZIP Upload** - For simple drag-and-drop deployment
- ✅ **Git Clone** - Deploy directly from Git repository

### **Git-Specific Features**
- 🔄 **Pull & Redeploy** - Update to latest commit with one click
- 🌿 **Branch Management** - Switch branches dynamically
- 🪝 **Webhooks** - Auto-deploy on push (GitHub/GitLab/Bitbucket)
- 📦 **Smart Dependency Detection** - Only reinstalls when needed
- 🔨 **Custom Build Commands** - Support for TypeScript, Webpack, Vite, etc.
- 🔐 **Secure Validation** - Prevents command injection
- 📊 **Detailed Logging** - Track every git operation
- ⏮️ **Rollback** - Restore previous versions instantly

---

## 🏗️ **Architecture**

### **Backend Components**

```
backend/src/
├── services/
│   ├── gitService.ts         # Git operations (clone, pull, validation)
│   ├── deploymentService.ts  # ZIP + Git deployment logic
│   ├── pm2Service.ts         # Process management
│   └── certService.ts        # SSL certificate management
├── routes/
│   ├── git.ts               # Git-specific API routes
│   └── projects.ts          # Project CRUD operations
└── utils/
    ├── database.ts          # SQLite schema with Git fields
    └── encryption.ts        # Secure env var storage
```

### **Database Schema**

New fields added to `projects` table:

```sql
deploy_method TEXT DEFAULT 'zip'        -- 'zip' or 'git'
git_url TEXT                            -- Repository URL
git_branch TEXT                         -- Branch name
install_command TEXT DEFAULT 'npm install'
build_command TEXT                      -- Optional build step
webhook_secret TEXT                     -- For webhook verification
last_commit TEXT                        -- Latest commit hash
last_deployed_at DATETIME               -- Last deployment timestamp
```

### **Frontend Components**

```
frontend/
├── app/projects/create/page.tsx       # Deploy method tabs (ZIP/Git)
├── app/projects/[id]/page.tsx         # Git tab for Git projects
└── components/ui/
    └── git-info.tsx                   # Git management UI
```

---

## 📘 **Usage Guide**

### **1. Create Project from Git**

**Via UI:**
1. Go to **Create Project**
2. Select **"Git Deploy"** tab
3. Enter:
   - Git Repository URL (e.g., `https://github.com/user/repo.git`)
   - Branch name (e.g., `main`)
   - Start command (e.g., `npm start`)
   - Install command (optional, default: `npm install`)
   - Build command (optional, e.g., `npm run build`)
   - Port (optional)
   - Environment variables (optional)
4. Click **"Deploy Project"**

**Via API:**
```bash
POST /api/git/project/create/git
Content-Type: application/json

{
  "projectName": "myapp",
  "displayName": "My App",
  "gitUrl": "https://github.com/user/repo.git",
  "branch": "main",
  "startCommand": "npm start",
  "installCommand": "npm install",
  "buildCommand": "npm run build",
  "port": 3000,
  "envVars": {
    "DATABASE_URL": "...",
    "API_KEY": "..."
  }
}
```

### **2. Redeploy from Git**

**Via UI:**
1. Open your Git project
2. Click **"Git"** tab
3. Click **"Pull & Deploy"** button

**Via API:**
```bash
POST /api/git/project/:id/deploy/git
```

### **3. Switch Branch**

**Via UI:**
1. Go to **Git** tab
2. Find **"Switch Branch"** section
3. Click on the desired branch

**Via API:**
```bash
POST /api/git/project/:id/git/branch
Content-Type: application/json

{
  "branch": "develop"
}
```

### **4. Configure Webhook**

**Via UI:**
1. Go to **Git** tab
2. Find **"Auto-Deploy Webhook"** section
3. Click **"Configure"**
4. Copy the webhook URL and secret
5. Add to your Git provider (see below)

**Via API:**
```bash
POST /api/git/project/:id/webhook/config
Content-Type: application/json

{
  "enabled": true,
  "provider": "github"
}
```

---

## 🔌 **API Endpoints**

### **Create Git Project**
```
POST /api/git/project/create/git
```

### **Redeploy Git Project**
```
POST /api/git/project/:id/deploy/git
```

### **Get Repository Info**
```
GET /api/git/project/:id/git/info
```

### **List Branches**
```
GET /api/git/project/:id/git/branches
```

### **Switch Branch**
```
POST /api/git/project/:id/git/branch
Body: { "branch": "main" }
```

### **Configure Webhook**
```
POST /api/git/project/:id/webhook/config
Body: { "enabled": true, "provider": "github" }
```

### **Webhook Endpoint (Public)**
```
POST /api/git/webhook/:id
(No auth required - verified by signature)
```

### **Get Git Logs**
```
GET /api/git/project/:id/git/logs?type=clone|pull
```

---

## 🪝 **Webhook Configuration**

### **GitHub**

1. Go to your repository: `Settings` → `Webhooks` → `Add webhook`
2. **Payload URL**: `https://your-domain.com/api/git/webhook/:projectId`
3. **Content type**: `application/json`
4. **Secret**: *(paste the webhook secret from NodePilot)*
5. **Events**: Select "Just the push event"
6. Click **"Add webhook"**

### **GitLab**

1. Go to your repository: `Settings` → `Webhooks`
2. **URL**: `https://your-domain.com/api/git/webhook/:projectId`
3. **Secret Token**: *(paste the webhook secret)*
4. **Trigger**: Check "Push events"
5. Click **"Add webhook"**

### **Bitbucket**

1. Go to your repository: `Settings` → `Webhooks` → `Add webhook`
2. **URL**: `https://your-domain.com/api/git/webhook/:projectId`
3. **Triggers**: Select "Repository push"
4. Add custom header: `X-Webhook-Secret: <your-secret>`
5. Click **"Save"**

### **Webhook Behavior**

- ✅ Webhook triggers deployment **only for the configured branch**
- ✅ Other branches are ignored (no accidental deploys)
- ✅ Signature verification ensures security
- ✅ Async deployment (webhook returns immediately)
- ✅ Auto-rollback on deployment failure

---

## 🔒 **Security**

### **1. Input Validation**

All Git URLs and branch names are sanitized to prevent:
- Command injection
- Path traversal
- Shell exploits

```typescript
// Example validation
sanitizeRepoUrl(url: string): { isValid: boolean; sanitized: string; error?: string }
sanitizeBranchName(branch: string): { isValid: boolean; sanitized: string; error?: string }
```

### **2. Webhook Verification**

Webhooks use HMAC-SHA256 signature verification:

- **GitHub**: `X-Hub-Signature-256` header
- **GitLab**: `X-GitLab-Token` header
- **Bitbucket**: Custom `X-Webhook-Secret` header

Invalid signatures are rejected with 401 Unauthorized.

### **3. Repository Validation**

Before deployment, NodePilot validates:
- ✅ `.git` folder exists
- ✅ `package.json` is present
- ✅ No `node_modules` committed (warning)
- ✅ No `.env` files committed (warning)

### **4. Environment Variables**

All environment variables are:
- Encrypted at rest using AES-256-GCM
- Stored separately from the repository
- Never committed to Git
- Protected from logs

### **5. Command Execution**

All shell commands:
- Have strict timeouts
- Run with limited privileges
- Cannot use pipes or shell operators
- Disable credential prompts

---

## ⏮️ **Rollback**

Git deployments support **snapshot-based rollback**:

### **How It Works**

1. Before every deployment, a backup snapshot is created:
   - Project files (ZIP/TAR)
   - Environment variables
   - PM2 configuration

2. On failure, automatic rollback:
   - Restores previous snapshot
   - Restarts PM2 process
   - Logs rollback event

3. Manual rollback via UI:
   - Go to **"Deployments"** tab
   - Select previous version
   - Click **"Rollback"**

### **Rollback API**

```bash
POST /api/project/:id/rollback
Content-Type: application/json

{
  "deploymentId": 123
}
```

---

## 🐛 **Troubleshooting**

### **Problem: Clone Failed - Repository Not Found**

**Cause**: Invalid URL or private repository without access

**Solution**:
- For public repos: Verify URL format (must end with `.git`)
- For private repos: Add SSH key or use access token:
  ```
  https://<token>@github.com/user/repo.git
  ```

### **Problem: Branch Not Found**

**Cause**: Branch doesn't exist in repository

**Solution**:
- Check branch name for typos
- Use `git branch -r` to list available branches
- Default to `main` or `master`

### **Problem: Dependency Installation Failed**

**Cause**: Missing dependencies or network issues

**Solution**:
- Check `package.json` for errors
- Verify network connectivity
- Try custom install command: `npm ci` or `yarn install`
- Check logs: `GET /api/git/project/:id/git/logs?type=pull`

### **Problem: Build Failed**

**Cause**: Build errors or missing configuration

**Solution**:
- Test build locally first
- Check build command syntax
- Verify all dependencies are installed
- Review error logs in **Logs** tab

### **Problem: Webhook Not Triggering**

**Cause**: Invalid signature or wrong branch

**Solution**:
- Verify webhook secret matches
- Check webhook logs in Git provider
- Ensure push is to configured branch
- Test webhook manually using curl:
  ```bash
  curl -X POST https://your-domain.com/api/git/webhook/:id \
    -H "Content-Type: application/json" \
    -H "X-Webhook-Secret: your-secret" \
    -d '{"ref":"refs/heads/main"}'
  ```

### **Problem: Permission Denied During Pull**

**Cause**: Uncommitted changes in repository

**Solution**:
- NodePilot checks for uncommitted changes before pulling
- If found, deployment is blocked
- Use "Redeploy" to force-reset repository state

---

## 📊 **Comparison: ZIP vs Git**

| Feature | ZIP Upload | Git Deploy |
|---------|-----------|-----------|
| **Deployment Speed** | ⚡ Instant | 🐢 Clone takes time |
| **Auto-Deploy** | ❌ Manual | ✅ Webhooks |
| **Branch Switching** | ❌ N/A | ✅ Yes |
| **Version Control** | ❌ No history | ✅ Full history |
| **Rollback** | ✅ Yes | ✅ Yes |
| **Build Support** | ❌ Manual | ✅ Automatic |
| **CI/CD Ready** | ❌ No | ✅ Yes |
| **Best For** | Quick deploys | Professional workflows |

---

## 🎯 **Best Practices**

1. **Use Git Deploy for**:
   - Production applications
   - Team projects
   - Projects with CI/CD
   - TypeScript/build-required projects

2. **Use ZIP Deploy for**:
   - Quick prototypes
   - Single-file projects
   - Manual testing
   - No build step required

3. **Security**:
   - Always use HTTPS URLs for public repos
   - Use SSH keys for private repos
   - Never commit `.env` files
   - Rotate webhook secrets periodically

4. **Performance**:
   - Use shallow clone (depth=1) for faster cloning
   - Enable dependency caching where possible
   - Minimize build output size
   - Use `.gitignore` to exclude unnecessary files

---

## 📞 **Support**

For issues or questions:
- Check logs: **Git** tab → **Logs**
- Review deployments: **Deployments** tab
- Check PM2 status: **Overview** tab
- Contact: omshukla004@gmail.com

---

## 🚀 **What's Next?**

Planned enhancements:
- [ ] Git submodule support
- [ ] Monorepo support (Nx, Turborepo)
- [ ] Docker deployment
- [ ] Environment-specific branches
- [ ] Auto-scaling based on Git tags
- [ ] Integration with GitOps tools

---

**Made with ❤️ by NodePilot Team**
