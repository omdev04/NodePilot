# 🔔 GitHub Webhook Auto-Deploy Setup Guide

**Automatic deployment ke liye complete guide - jab bhi GitHub pe code push karoge, automatically deploy hoga!**

---

## 🎯 Kya Hoga?

Jab aap GitHub pe code push karoge:
1. ✅ GitHub webhook NodePilot ko notify karega
2. ✅ NodePilot automatically `git pull` karega
3. ✅ Dependencies install hongi (agar zarurat ho)
4. ✅ Build command run hoga (agar set kiya hai)
5. ✅ PM2 automatically project restart karega
6. ✅ New code live ho jayega!

---

## 📋 Prerequisites

1. NodePilot server public internet se accessible hona chahiye
2. GitHub repository access (public ya private with OAuth)
3. Project Git se deployed hona chahiye (not ZIP)

---

## 🚀 Setup Steps

### Step 1: Enable Webhook in NodePilot

#### Via UI (Easy Method)

1. **NodePilot Dashboard** kholo
2. Apne **Git project** pe jao
3. **Settings** > **Webhook** section me jao
4. **Enable Webhook** toggle ON karo
5. **Provider** select karo: `GitHub`, `GitLab`, ya `Bitbucket`
6. **Save** karo

Aapko **Webhook URL** aur **Secret** milega:
```
Webhook URL: https://nodepilot.yourdomain.com/api/git/webhook/123
Secret: abc123def456...
```

#### Via API

```bash
curl -X POST https://nodepilot.yourdomain.com/api/git/project/123/webhook/config \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "enabled": true,
    "provider": "github"
  }'
```

Response:
```json
{
  "success": true,
  "webhook": {
    "enabled": true,
    "url": "https://nodepilot.yourdomain.com/api/git/webhook/123",
    "secret": "your-webhook-secret"
  }
}
```

---

### Step 2: Add Webhook in GitHub

1. **GitHub** pe jao aur apna **repository** kholo
2. **Settings** > **Webhooks** > **Add webhook** click karo
3. **Payload URL** me NodePilot ka webhook URL paste karo:
   ```
   https://nodepilot.yourdomain.com/api/git/webhook/123
   ```
4. **Content type** ko **`application/json`** select karo
5. **Secret** field me NodePilot ka secret paste karo
6. **Which events** me **`Just the push event`** select karo
7. **Active** checkbox ✅ check karo
8. **Add webhook** click karo

Screenshot:
```
┌─────────────────────────────────────────────┐
│ Payload URL:                                │
│ https://nodepilot.yourdomain.com/api/gi...  │
├─────────────────────────────────────────────┤
│ Content type: application/json ▼            │
├─────────────────────────────────────────────┤
│ Secret: *********************************** │
├─────────────────────────────────────────────┤
│ Which events would you like to trigger?    │
│ ⚫ Just the push event                      │
│ ⚪ Send me everything                       │
│ ⚪ Let me select individual events          │
├─────────────────────────────────────────────┤
│ ✅ Active                                   │
└─────────────────────────────────────────────┘
```

---

### Step 3: Test Webhook

#### Method 1: Test via GitHub

1. GitHub webhook page pe **Recent Deliveries** dekho
2. Latest delivery pe click karo
3. **Redeliver** button click karo
4. Response check karo - `200 OK` hona chahiye

#### Method 2: Test via Code Push

```bash
# Make a small change
echo "# Test webhook" >> README.md
git add README.md
git commit -m "Test webhook deployment"
git push origin main
```

**Expected Flow:**
```
1. Git push → GitHub
2. GitHub → Webhook trigger → NodePilot
3. NodePilot → Git pull → Install → Build → PM2 restart
4. Your app is live with new code! ✅
```

---

## 🔍 Verify Webhook is Working

### Check NodePilot Logs

```bash
# Backend logs
pm2 logs nodepilot-backend

# Or direct logs
tail -f backend/logs/backend-output.log
```

**Success Output:**
```
🔔 Webhook triggered for project myapp (ID: 123) on branch main
📦 Commits: 1 | Pusher: omdev04
🔄 Starting Git redeploy for myapp...
📥 Pulling latest changes from main...
✅ Pull completed: 1 file changed, 5 insertions(+)
📦 Installing dependencies...
✅ Dependencies installed
🔨 Building project...
✅ Build completed
🚀 Restarting PM2 process...
✅ Git redeploy completed successfully
```

### Check PM2 Status

```bash
pm2 list
```

Your project should show status as **online** with recent restart time.

### Check Project Status in UI

NodePilot dashboard me project status **Running** ✅ hona chahiye.

---

## 🛠️ Advanced Configuration

### Multiple Branches

Agar aap multiple branches ke liye separate webhooks chahte ho:

1. Development branch ke liye alag project banao
2. Production branch ke liye alag project banao
3. Dono me alag webhooks configure karo

Example:
```
Project: myapp-dev (branch: develop)
Project: myapp-prod (branch: main)
```

### Custom Deploy Commands

Project settings me customize kar sakte ho:

- **Install Command**: `npm ci` (faster than npm install)
- **Build Command**: `npm run build:production`
- **Start Command**: `npm start`

### Environment Variables

Webhook deployments me bhi environment variables work karte hain:

1. Project settings me env vars set karo
2. Webhook deployment automatically unhe use karega
3. No need to change anything!

---

## 🔒 Security Best Practices

### 1. Always Use Secret

Never skip the secret field! Ye verify karta hai ki webhook really GitHub se aaya hai.

```javascript
// NodePilot automatically verifies:
const signature = request.headers['x-hub-signature-256'];
gitService.verifyGitHubWebhook(payload, signature, secret);
```

### 2. Use HTTPS

Always use HTTPS URLs for webhooks:
```
✅ https://nodepilot.yourdomain.com/api/git/webhook/123
❌ http://nodepilot.yourdomain.com/api/git/webhook/123
```

### 3. Restrict IP Access (Optional)

GitHub webhook IPs ko allow karo:
```bash
# GitHub webhook IPs
sudo ufw allow from 140.82.112.0/20
sudo ufw allow from 143.55.64.0/20
```

### 4. Monitor Webhook Logs

Regularly check karo ki unauthorized requests to nahi aa rahe:
```bash
grep "Webhook verification failed" backend/logs/backend-output.log
```

---

## 🐛 Troubleshooting

### Webhook Not Triggering

**Check 1: Webhook URL Correct?**
```bash
# Test manually
curl -X POST https://nodepilot.yourdomain.com/api/git/webhook/123 \
  -H "Content-Type: application/json" \
  -d '{"ref":"refs/heads/main"}'
```

**Check 2: Firewall/Port Open?**
```bash
# Check if NodePilot is accessible
curl https://nodepilot.yourdomain.com/health
```

**Check 3: GitHub Delivery Logs**
- GitHub > Settings > Webhooks > Recent Deliveries
- Check response code and body

### Deployment Fails

**Check PM2 Logs:**
```bash
pm2 logs nodepilot-myapp --lines 100
```

**Check Git Pull Errors:**
```bash
cd projects/myapp
git pull origin main
# See if there are conflicts
```

**Check Build Errors:**
```bash
cd projects/myapp
npm run build
# See if build command works
```

### Authentication Failed

Agar private repository hai:

1. OAuth token expire ho gaya hoga
2. Settings > OAuth > Reconnect GitHub
3. Webhook automatically new token use karega

---

## 📊 Webhook Payload Examples

### GitHub Push Event

```json
{
  "ref": "refs/heads/main",
  "commits": [
    {
      "id": "abc123...",
      "message": "Fix bug in authentication",
      "author": {
        "name": "Om Dev",
        "email": "om@example.com"
      }
    }
  ],
  "pusher": {
    "name": "omdev04",
    "email": "om@example.com"
  }
}
```

### GitLab Push Event

```json
{
  "ref": "refs/heads/main",
  "user_name": "Om Dev",
  "commits": [
    {
      "id": "abc123...",
      "message": "Update README"
    }
  ]
}
```

---

## 🎯 Complete Workflow Example

```
Developer (You) 👨‍💻
    ↓
    git push origin main
    ↓
GitHub Repository 🐙
    ↓
    Webhook Event (POST request)
    ↓
NodePilot Server 🚀
    ↓
    ├─ Verify signature ✅
    ├─ Check branch matches
    ├─ Stop PM2 process
    ├─ Create backup
    ├─ Git pull
    ├─ npm install (if needed)
    ├─ npm run build (if configured)
    ├─ Restart PM2
    └─ Update deployment record
    ↓
Your App Live! 🎉
```

---

## 📝 Webhook Status Codes

| Code | Meaning | Action |
|------|---------|--------|
| 200 | Success | Deployment started |
| 401 | Unauthorized | Check secret |
| 404 | Not Found | Check project ID |
| 400 | Bad Request | Check webhook config |
| 500 | Server Error | Check NodePilot logs |

---

## ✅ Checklist

Setup complete hone ke baad verify karo:

- [ ] Webhook enabled in NodePilot
- [ ] Webhook URL aur secret copied
- [ ] GitHub webhook added
- [ ] Content type = `application/json`
- [ ] Secret configured
- [ ] Test delivery successful
- [ ] PM2 logs me deployment dikha
- [ ] App refreshed with new code
- [ ] No errors in logs

---

## 🎉 Done!

Ab aap code push karo aur automatically deploy hoga! 🚀

**Pro Tip:** Har push pe deploy nahi chahiye? 
- Development branch use karo testing ke liye
- Main/production branch pe merge karo jab ready ho
- Sirf production webhook enable rakho

---

## 📚 Additional Resources

- [GitHub Webhooks Docs](https://docs.github.com/en/webhooks)
- [GitLab Webhooks Docs](https://docs.gitlab.com/ee/user/project/integrations/webhooks.html)
- [NodePilot Git Deploy Guide](./GIT_DEPLOY_GUIDE.md)

---

**Need Help?** 
- Check logs: `pm2 logs`
- Test webhook: GitHub > Settings > Webhooks > Recent Deliveries
- Ask on GitHub Issues

**Happy Auto-Deploying! 🎊**
