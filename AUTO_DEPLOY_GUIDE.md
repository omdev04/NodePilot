# 🚀 Auto-Deploy Setup Guide

## ✅ Current Status

**Auto-deploy is WORKING** through webhooks! You have two options:

---

## 🎯 Option 1: Manual Webhook (Working Now)

### For YOUR GitHub Repository

**Step 1: Deploy Your Project**
```
1. Go to: http://localhost:9000/projects/create
2. Select "Git Repository"
3. Enter YOUR GitHub repo URL:
   https://github.com/omdev04/YOUR_REPO_NAME.git
4. Enter branch: main
5. Deploy!
```

**Step 2: Get Webhook URL**

NodePilot will show you:
```
Webhook URL: http://localhost:9001/api/git/webhook/PROJECT_ID
Secret: [your-secret-here]
```

**Step 3: Add Webhook to YOUR GitHub Repo**

```
1. Go to: https://github.com/omdev04/YOUR_REPO_NAME/settings/hooks
2. Click "Add webhook"
3. Payload URL: http://localhost:9001/api/git/webhook/PROJECT_ID
4. Content type: application/json
5. Secret: [paste the secret from NodePilot]
6. Events: Select "Just the push event"
7. Active: ✅ Checked
8. Click "Add webhook"
```

**Step 4: Test Auto-Deploy**

```bash
# Make a change in your repo
cd /path/to/your/repo
echo "test" >> README.md
git add .
git commit -m "test auto-deploy"
git push origin main
```

**What Happens:**
```
1. ✅ GitHub sends webhook to NodePilot
2. ✅ NodePilot verifies signature
3. ✅ git pull latest code
4. ✅ npm install
5. ✅ PM2 restart
6. ✅ Your app is updated!
```

---

## 🚀 Option 2: GitHub App (Fully Automatic)

**No manual webhook setup needed!**

### Admin Setup (One-Time):

**1. Create GitHub App:**
```
Go to: https://github.com/settings/apps/new

Name: NodePilot
Homepage: http://localhost:9000
Webhook URL: http://localhost:9001/api/github-app/push
Webhook secret: [generate with: openssl rand -base64 32]

Permissions:
- Contents: Read-only
- Metadata: Read-only
- Webhooks: Read & Write

Events:
✅ Push
✅ Installation
✅ Repository

Install: Any account
```

**2. Get Credentials:**
```
App ID: [shown after creation]
Generate private key: [download .pem file]
```

**3. Update .env:**
```env
GITHUB_APP_ID=your-app-id
GITHUB_APP_WEBHOOK_SECRET=your-webhook-secret
GITHUB_APP_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----
...paste entire .pem file content...
-----END RSA PRIVATE KEY-----"
```

**4. Install GitHub App:**
```
1. Go to: https://github.com/apps/YOUR_APP_NAME
2. Click "Install"
3. Select repositories (or all)
4. Done! ✅
```

### User Experience:

```
1. Create project in NodePilot
2. Push code
3. ✅ Auto-deployed! (No webhook setup needed!)
```

---

## 📋 Current Demo Projects

You have 2 demo projects from other GitHub users:
- `demo-app` - https://github.com/bjnandi/nodejs-demo-app.git
- `nodejs-app` - https://github.com/rat9615/simple-nodejs-app.git

**These won't auto-deploy** because:
- ❌ Not your repos (can't add webhooks)
- ❌ Demo/test purposes only

**Solution:** Deploy YOUR own GitHub repos!

---

## 🎯 Quick Test with Your Repo

### Deploy Your NodePilot Repository:

```
1. Go to: http://localhost:9000/projects/create
2. Git Repository tab
3. Connect GitHub (Settings → Git Providers)
4. Select: omdev04/NodePilot
5. Branch: main
6. Deploy!
7. Add webhook as shown above
8. Push code → Auto-deploy! ✅
```

---

## 🐛 Troubleshooting

### Webhook not triggering?

**Check:**
1. ✅ Webhook URL is correct
2. ✅ NodePilot backend is running
3. ✅ Port 9001 is accessible
4. ✅ Webhook secret matches
5. ✅ Branch name matches

**View webhook deliveries:**
```
GitHub → Repo → Settings → Webhooks → Click on webhook → Recent Deliveries
```

### Using ngrok for testing:

If GitHub can't reach localhost:
```bash
ngrok http 9001

# Update webhook URL to ngrok URL:
https://abc123.ngrok.io/api/git/webhook/PROJECT_ID
```

---

## ✅ Verification Steps

**Test webhook is working:**

1. Check backend logs when you push:
   ```bash
   cd backend
   npm run dev
   
   # You should see:
   🔔 Webhook triggered for project XYZ
   📦 Commits: 1 | Pusher: omdev04
   ✅ Webhook deployment completed
   ```

2. Check GitHub webhook deliveries:
   - Green checkmark ✅ = Working
   - Red X ❌ = Failed (check error message)

---

## 🎉 Summary

**Auto-Deploy Options:**

| Feature | Manual Webhook | GitHub App |
|---------|---------------|------------|
| Setup | Manual (5 min) | One-time install |
| Works with | All platforms | GitHub only |
| User experience | Add webhook in GitHub UI | Fully automatic |
| Current status | ✅ Ready | Not configured |

**Recommendation:**
- Start with **Manual Webhook** (easiest to test)
- Upgrade to **GitHub App** later (best UX)

---

**Next Steps:**
1. Deploy YOUR GitHub repository
2. Add webhook manually
3. Push code and watch auto-deploy! 🚀

See also:
- `GITHUB_APP_SETUP.md` - For GitHub App setup
- `OAUTH_PRODUCTION_SETUP.md` - For OAuth integration
