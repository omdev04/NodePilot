# 🤖 GitHub App Setup Guide

## Why GitHub App instead of OAuth?

**OAuth App** (Current):
- ❌ User has to manually add webhook in GitHub UI
- ❌ Limited permissions
- ❌ Webhook URL must be copied manually

**GitHub App** (New):
- ✅ **Automatic webhook installation** - NO manual setup needed!
- ✅ Webhook automatically triggered on push
- ✅ Fine-grained permissions
- ✅ Better security with installation tokens
- ✅ Works like Dokploy, Vercel, Netlify

---

## 📦 Step 1: Create GitHub App

### 1.1 Go to GitHub App Settings
```
https://github.com/settings/apps/new
```

### 1.2 Fill Basic Information

**GitHub App name:**
```
NodePilot Deployer
```

**Homepage URL:**
```
https://your-nodepilot-domain.com
```

**Webhook URL:**
```
https://your-nodepilot-domain.com/api/github-app/push
```

**Webhook secret:**
Generate a random secret:
```bash
openssl rand -base64 32
```
Save this - you'll need it for `.env`

### 1.3 Repository Permissions

Set these permissions:

| Permission | Access | Why? |
|------------|--------|------|
| **Contents** | Read-only | Read repository code |
| **Metadata** | Read-only | Repository information |
| **Webhooks** | Read & Write | Auto-create webhooks |

### 1.4 Subscribe to Events

Check these events:
- ✅ **Push** - Trigger on code push
- ✅ **Repository** - Track repo changes
- ✅ **Installation** - Track app install/uninstall

### 1.5 Where can this app be installed?

Choose:
- ✅ **Any account** - Allow anyone to install

Click **Create GitHub App** ✅

---

## 🔑 Step 2: Get Credentials

### 2.1 Note App ID
After creation, you'll see:
```
App ID: 123456
```
Save this!

### 2.2 Generate Private Key

1. Scroll down to **Private keys**
2. Click **Generate a private key**
3. A `.pem` file will download
4. Open it and copy entire contents

---

## ⚙️ Step 3: Configure NodePilot

Add to `backend/.env`:

```env
# GitHub App Configuration
GITHUB_APP_ID=123456
GITHUB_APP_WEBHOOK_SECRET=your-webhook-secret-from-step-1.2
GITHUB_APP_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----
MIIEpAIBAAKCAQEA...
(paste entire private key here)
...
-----END RSA PRIVATE KEY-----"

# Make sure API_URL is set for webhook URL
API_URL=https://your-nodepilot-domain.com
```

---

## 🗄️ Step 4: Run Migration

```bash
# From backend/ directory
cd backend

# Run SQL migration
sqlite3 deployer.db < migrations/add_github_app.sql
```

---

## 🚀 Step 5: Update Backend Routes

Add GitHub App routes to `backend/src/index.ts`:

```typescript
import githubAppRoutes from './routes/githubApp';

// ... existing code ...

// Register GitHub App routes
await fastify.register(githubAppRoutes, { prefix: '/api' });
```

---

## 📱 Step 6: Install App on Repository

### 6.1 Get Installation URL

Your GitHub App page:
```
https://github.com/apps/nodepilot-deployer
```

### 6.2 Click "Install"

1. Choose account (personal or organization)
2. Select repositories:
   - **All repositories** (easier)
   - **Only select repositories** (more secure)
3. Click **Install**

✅ **GitHub will automatically:**
- Send installation webhook to NodePilot
- Configure push webhook for selected repos
- NO manual webhook setup needed!

---

## 🎯 How It Works (Automatic Flow)

### User Deploys Project:

```typescript
// 1. User creates project in NodePilot
POST /api/projects
{
  "name": "my-app",
  "git_url": "https://github.com/user/repo",
  "git_branch": "main",
  "deploy_method": "git"
}

// 2. NodePilot clones and deploys
// 3. That's it! No webhook setup needed!
```

### When User Pushes Code:

```bash
# User pushes to GitHub
git push origin main
```

**Automatic sequence:**
1. 🔔 GitHub automatically sends webhook to NodePilot
2. 🔍 NodePilot finds projects using that repo
3. 🚀 NodePilot pulls latest code
4. 📦 NodePilot runs npm install
5. 🔄 NodePilot restarts PM2 process
6. ✅ Done! Project updated

---

## 🧪 Testing

### Test 1: Check Configuration
```bash
curl http://localhost:9001/api/github-app/status
```

Expected response:
```json
{
  "configured": true,
  "appId": "123456",
  "webhookUrl": "https://your-domain.com/api/github-app/push"
}
```

### Test 2: Install App

1. Go to `https://github.com/apps/your-app-name`
2. Click **Install**
3. Select a test repository
4. Check NodePilot backend logs:

```
✅ GitHub App installed for username
📦 Available repositories: ['username/repo']
✅ Stored installation 12345678
```

### Test 3: Push Code

1. Make a change in your repo
2. Push to GitHub:
```bash
git commit -m "test deploy"
git push
```

3. Check NodePilot logs:
```
🔔 GitHub App push event: { repo: 'user/repo', branch: 'main', commits: 1 }
✅ Found 1 project(s) to deploy
🚀 Triggering deployment for project: my-app
✅ Deployment completed for my-app
```

---

## 🆚 Comparison: Before vs After

### Before (OAuth - Manual Webhook):
```
1. User deploys project in NodePilot
2. User opens GitHub repository
3. User clicks Settings → Webhooks → Add webhook
4. User copies webhook URL from NodePilot
5. User pastes in GitHub
6. User copies secret
7. User pastes in GitHub
8. User saves webhook
9. Finally auto-deploy works! 😓
```

### After (GitHub App - Automatic):
```
1. User installs GitHub App once (one-time setup)
2. User deploys project in NodePilot
3. Auto-deploy works! ✅
```

**9 steps → 2 steps!** 🎉

---

## 🔧 Troubleshooting

### Webhook not received?

Check:
1. ✅ GitHub App webhook URL is correct
2. ✅ NodePilot is accessible from internet (use ngrok for testing)
3. ✅ Webhook secret matches `.env`
4. ✅ Repository is included in app installation

### Check GitHub App settings:
```
https://github.com/settings/installations
```

### View webhook deliveries:
```
https://github.com/settings/apps/your-app/advanced
```
Click on **Recent Deliveries** to see webhook history

---

## 🎓 What You Get

✅ **No manual webhook configuration**
✅ **Automatic deployment on git push**
✅ **Works like professional platforms (Vercel, Netlify, Dokploy)**
✅ **Better security with installation tokens**
✅ **User-friendly setup**

---

## 🔗 Resources

- [GitHub Apps Documentation](https://docs.github.com/en/apps)
- [Creating a GitHub App](https://docs.github.com/en/apps/creating-github-apps)
- [Webhook Events](https://docs.github.com/en/webhooks/webhook-events-and-payloads)

---

**Enjoy automatic deployments! 🚀**
