# 🧪 Test GitHub Webhook

Quick test karne ke liye ye file use karo.

## Method 1: Manual Test

```bash
# Replace with your details
PROJECT_ID=1
WEBHOOK_SECRET="your-webhook-secret"
NODEPILOT_URL="https://nodepilot.yourdomain.com"

# Test webhook endpoint
curl -X POST "$NODEPILOT_URL/api/git/webhook/$PROJECT_ID" \
  -H "Content-Type: application/json" \
  -H "X-Hub-Signature-256: sha256=$(echo -n '{"ref":"refs/heads/main"}' | openssl dgst -sha256 -hmac "$WEBHOOK_SECRET" | cut -d' ' -f2)" \
  -d '{
    "ref": "refs/heads/main",
    "commits": [
      {
        "id": "test123",
        "message": "Test webhook",
        "author": {
          "name": "Test User",
          "email": "test@example.com"
        }
      }
    ],
    "pusher": {
      "name": "testuser",
      "email": "test@example.com"
    }
  }'
```

## Method 2: Simple Test (No Signature)

```bash
# For testing only - won't work in production
curl -X POST "http://localhost:9001/api/git/webhook/1" \
  -H "Content-Type: application/json" \
  -H "X-Webhook-Secret: your-webhook-secret" \
  -d '{
    "ref": "refs/heads/main"
  }'
```

## Expected Response

### Success (200)
```json
{
  "success": true,
  "message": "Deployment triggered for branch main",
  "projectId": 1
}
```

### Wrong Branch (200)
```json
{
  "success": false,
  "message": "Push to branch develop, but project tracks main"
}
```

### Invalid Signature (401)
```json
{
  "error": "Invalid webhook signature"
}
```

## Check Logs

```bash
# Backend logs
pm2 logs nodepilot-backend | grep webhook

# Your project logs
pm2 logs nodepilot-yourapp
```

## Test Complete Workflow

1. Make a small change:
   ```bash
   echo "# Test" >> README.md
   git add README.md
   git commit -m "Test webhook"
   git push origin main
   ```

2. Check GitHub webhook delivery:
   - GitHub > Repository > Settings > Webhooks
   - Click on webhook
   - Recent Deliveries tab
   - Should show 200 response

3. Check NodePilot logs:
   ```bash
   pm2 logs nodepilot-backend --lines 50
   ```

4. Verify deployment:
   ```bash
   pm2 list
   # Your app should show recent restart time
   ```

## Troubleshooting

### Webhook not triggering?

```bash
# Check if webhook URL is accessible
curl https://nodepilot.yourdomain.com/health

# Check project exists
curl http://localhost:9001/api/project/1/git/info \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Signature verification fails?

```bash
# Check secret matches
sqlite3 backend/deployer.db "SELECT webhook_secret FROM projects WHERE id = 1;"
```

### Deployment fails?

```bash
# Check if manual deployment works
curl -X POST http://localhost:9001/api/git/project/1/redeploy \
  -H "Authorization: Bearer YOUR_TOKEN"
```

## Success Indicators

✅ GitHub shows 200 OK response  
✅ NodePilot logs show "Webhook triggered"  
✅ PM2 shows app restarted  
✅ New code is live  

🎉 Webhook working perfectly!
