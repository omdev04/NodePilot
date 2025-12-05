# 🚀 Quick Start: Git Deploy

## Deploy Your First Git Project in 3 Minutes

### **Step 1: Navigate to Create Project**

1. Login to NodePilot dashboard
2. Click **"Projects"** → **"Create New Project"**

### **Step 2: Choose Git Deploy**

1. Click the **"Git Deploy"** tab
2. Fill in the form:

```
Git Repository URL: https://github.com/yourusername/your-repo.git
Branch Name: main
Start Command: npm start
Install Command: npm install (default)
Build Command: (optional - e.g., npm run build)
Port: 3000 (optional)
```

### **Step 3: Deploy!**

Click **"Deploy Project"** and wait for:
- ✅ Repository clone
- ✅ Dependency installation
- ✅ Build (if configured)
- ✅ PM2 process start

**Done!** Your app is now live.

---

## Set Up Auto-Deploy (Webhooks)

### **1. Configure Webhook in NodePilot**

1. Open your project
2. Go to **"Git"** tab
3. Click **"Configure"** under "Auto-Deploy Webhook"
4. Copy the **Webhook URL** and **Secret**

### **2. Add Webhook to GitHub**

1. Go to your GitHub repository
2. **Settings** → **Webhooks** → **"Add webhook"**
3. Paste:
   - **Payload URL**: *(from NodePilot)*
   - **Content type**: `application/json`
   - **Secret**: *(from NodePilot)*
4. Select: **"Just the push event"**
5. Click **"Add webhook"**

### **3. Test It!**

1. Make a commit and push to your branch
2. Watch NodePilot auto-deploy your changes!

---

## Example: Deploy Express App

```bash
# 1. Create a simple Express app
mkdir my-app && cd my-app
npm init -y
npm install express

# 2. Create index.js
cat > index.js << EOF
const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
  res.send('Hello from NodePilot Git Deploy!');
});

app.listen(PORT, () => {
  console.log(\`Server running on port \${PORT}\`);
});
EOF

# 3. Update package.json
cat > package.json << EOF
{
  "name": "my-app",
  "version": "1.0.0",
  "main": "index.js",
  "scripts": {
    "start": "node index.js"
  },
  "dependencies": {
    "express": "^4.18.2"
  }
}
EOF

# 4. Push to GitHub
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/yourusername/my-app.git
git push -u origin main

# 5. Deploy in NodePilot
# - Git URL: https://github.com/yourusername/my-app.git
# - Branch: main
# - Start Command: npm start
# - Port: 3000
```

**Done!** Your Express app is live on NodePilot.

---

## Common Commands

### **Deploy Configuration**

```javascript
// For Next.js
{
  "startCommand": "npm start",
  "buildCommand": "npm run build",
  "installCommand": "npm install"
}

// For TypeScript
{
  "startCommand": "node dist/index.js",
  "buildCommand": "npm run build",
  "installCommand": "npm install"
}

// For NestJS
{
  "startCommand": "npm run start:prod",
  "buildCommand": "npm run build",
  "installCommand": "npm install"
}

// For Vite/React (API server)
{
  "startCommand": "node server.js",
  "buildCommand": "npm run build",
  "installCommand": "npm install"
}
```

---

## Troubleshooting Tips

### **Clone Failed**
- ✅ Check URL format: must end with `.git`
- ✅ For private repos: use `https://<token>@github.com/user/repo.git`

### **Build Failed**
- ✅ Test build locally first: `npm run build`
- ✅ Check all dependencies are in `package.json`

### **App Not Starting**
- ✅ Verify start command is correct
- ✅ Check logs in **"Logs"** tab
- ✅ Ensure port is not already in use

### **Webhook Not Working**
- ✅ Verify secret matches
- ✅ Check webhook delivery in GitHub Settings
- ✅ Ensure push is to correct branch

---

## Need Help?

- 📖 Full Guide: [GIT_DEPLOY_GUIDE.md](./GIT_DEPLOY_GUIDE.md)
- 🐛 Check Logs: Dashboard → Project → Logs tab
- 💬 Support: omshukla004@gmail.com

**Happy Deploying! 🚀**
