# OAuth Integration Guide

## Overview

NodePilot now supports OAuth integration with GitHub, GitLab, and Bitbucket. This allows users to connect their Git provider accounts and deploy repositories directly without manually entering Git URLs and tokens.

## Features

- **One-Click Connect**: Connect GitHub, GitLab, or Bitbucket accounts
- **Repository Selector**: Browse and select repositories from a dropdown
- **Automatic Authentication**: OAuth tokens are automatically used for Git operations
- **Secure Storage**: Tokens are encrypted using AES-256-GCM
- **Branch Selection**: View and select branches from connected repositories

## Architecture

### Backend Components

#### 1. OAuth Service (`backend/src/services/oauthService.ts`)
Main service handling OAuth flows:
- `getAuthorizationUrl()` - Generate OAuth authorization URL
- `exchangeCodeForToken()` - Exchange authorization code for access token
- `listRepositories()` - Fetch user's repositories
- `getRepositoryBranches()` - Get branches for a specific repository
- `getAuthenticatedCloneUrl()` - Inject OAuth token into Git URL
- `disconnectOAuth()` - Remove OAuth connection

#### 2. OAuth Routes (`backend/src/routes/oauth.ts`)
API endpoints:
- `GET /api/oauth/authorize/:provider` - Initiate OAuth flow
- `GET /api/oauth/callback/:provider` - Handle OAuth callback
- `GET /api/oauth/repositories` - List user's repositories
- `GET /api/oauth/branches` - Get repository branches
- `GET /api/oauth/status` - Check connection status
- `POST /api/oauth/disconnect` - Disconnect OAuth

#### 3. Database Schema
New columns in `users` table:
```sql
oauth_provider TEXT,          -- 'github', 'gitlab', or 'bitbucket'
oauth_token TEXT,              -- Encrypted access token
oauth_refresh_token TEXT,      -- Encrypted refresh token (if available)
oauth_expires_at DATETIME      -- Token expiration time
```

#### 4. Git Service Updates
Enhanced `gitService` to support OAuth:
- `cloneRepository()` now accepts `oauthToken` and `oauthProvider`
- `pullRepository()` now accepts OAuth credentials
- `injectOAuthToken()` method adds tokens to Git URLs

## Setup Instructions

### 1. Create OAuth Applications

#### GitHub OAuth App
1. Go to GitHub Settings → Developer settings → OAuth Apps
2. Click "New OAuth App"
3. Fill in:
   - **Application name**: NodePilot
   - **Homepage URL**: `http://your-domain.com`
   - **Authorization callback URL**: `http://your-domain.com:9001/api/oauth/callback/github`
4. Copy Client ID and Client Secret

#### GitLab OAuth App
1. Go to GitLab User Settings → Applications
2. Fill in:
   - **Name**: NodePilot
   - **Redirect URI**: `http://your-domain.com:9001/api/oauth/callback/gitlab`
   - **Scopes**: `read_api`, `read_repository`, `write_repository`
3. Save and copy Application ID and Secret

#### Bitbucket OAuth Consumer
1. Go to Bitbucket Settings → OAuth → Add consumer
2. Fill in:
   - **Name**: NodePilot
   - **Callback URL**: `http://your-domain.com:9001/api/oauth/callback/bitbucket`
   - **Permissions**: Repositories (Read, Write)
3. Save and copy Key and Secret

### 2. Configure Environment Variables

Add to `backend/.env`:

```bash
# API URL (must match your backend URL)
API_URL=http://localhost:9001

# Frontend URL (must match your frontend URL)
FRONTEND_URL=http://localhost:3000

# GitHub OAuth
GITHUB_CLIENT_ID=your_github_client_id
GITHUB_CLIENT_SECRET=your_github_client_secret

# GitLab OAuth
GITLAB_CLIENT_ID=your_gitlab_client_id
GITLAB_CLIENT_SECRET=your_gitlab_client_secret

# Bitbucket OAuth
BITBUCKET_CLIENT_ID=your_bitbucket_client_id
BITBUCKET_CLIENT_SECRET=your_bitbucket_client_secret
```

### 3. Restart Backend

```bash
cd backend
npm run build
npm start
# Or with PM2
pm2 restart nodepilot-backend
```

## Usage Flow

### 1. Connect Git Provider

**Frontend UI** (to be implemented):
```typescript
// In Settings page or Project Create page
const connectGitHub = async () => {
  try {
    const response = await api.get('/oauth/authorize/github');
    // Redirect user to OAuth authorization page
    window.location.href = response.data.authUrl;
  } catch (error) {
    console.error('Failed to initiate OAuth:', error);
  }
};
```

### 2. OAuth Callback Handling

User is redirected back to frontend:
- Success: `http://localhost:3000/settings?oauth_success=github`
- Error: `http://localhost:3000/settings?oauth_error=<message>`

**Frontend should**:
1. Check URL parameters for `oauth_success` or `oauth_error`
2. Display success message or error
3. Refresh OAuth connection status

### 3. Check Connection Status

```typescript
const checkOAuthStatus = async () => {
  const response = await api.get('/oauth/status');
  return response.data; // { connected: true, provider: 'github' }
};
```

### 4. List Repositories

```typescript
const listRepos = async () => {
  try {
    const response = await api.get('/oauth/repositories', {
      params: { page: 1, per_page: 30 }
    });
    return response.data.repositories;
  } catch (error) {
    if (error.response?.data?.requiresAuth) {
      // Show "Connect GitHub" button
    }
  }
};
```

### 5. Create Project from Repository

```typescript
const createProject = async (selectedRepo) => {
  await api.post('/git/project/create/git', {
    projectName: 'my-app',
    displayName: 'My App',
    gitUrl: selectedRepo.cloneUrl,  // OAuth token auto-injected by backend
    branch: selectedRepo.defaultBranch,
    startCommand: 'npm start',
    port: 3000
  });
};
```

## API Reference

### GET /api/oauth/authorize/:provider

Initiate OAuth flow.

**Parameters:**
- `provider` - `github`, `gitlab`, or `bitbucket`

**Response:**
```json
{
  "authUrl": "https://github.com/login/oauth/authorize?...",
  "message": "Redirecting to github for authorization"
}
```

### GET /api/oauth/callback/:provider

OAuth callback endpoint (automatic redirect).

**Query Parameters:**
- `code` - Authorization code from provider
- `state` - State parameter for CSRF protection

**Redirects to:**
- Success: `FRONTEND_URL/settings?oauth_success=github`
- Error: `FRONTEND_URL/settings?oauth_error=<message>`

### GET /api/oauth/repositories

List user's repositories.

**Headers:**
- `Authorization: Bearer <jwt_token>`

**Query Parameters:**
- `page` - Page number (default: 1)
- `per_page` - Results per page (default: 30)

**Response:**
```json
{
  "repositories": [
    {
      "id": "123",
      "name": "my-repo",
      "fullName": "username/my-repo",
      "cloneUrl": "https://github.com/username/my-repo.git",
      "sshUrl": "git@github.com:username/my-repo.git",
      "defaultBranch": "main",
      "isPrivate": false,
      "description": "My awesome project",
      "language": "TypeScript",
      "updatedAt": "2024-01-15T10:30:00Z"
    }
  ],
  "page": 1,
  "per_page": 30
}
```

### GET /api/oauth/branches

Get branches for a repository.

**Headers:**
- `Authorization: Bearer <jwt_token>`

**Query Parameters:**
- `repo` - Repository full name (e.g., `username/my-repo`)

**Response:**
```json
{
  "branches": ["main", "develop", "feature/oauth"],
  "repository": "username/my-repo"
}
```

### GET /api/oauth/status

Check OAuth connection status.

**Headers:**
- `Authorization: Bearer <jwt_token>`

**Response:**
```json
{
  "connected": true,
  "provider": "github"
}
```

### POST /api/oauth/disconnect

Disconnect OAuth integration.

**Headers:**
- `Authorization: Bearer <jwt_token>`

**Response:**
```json
{
  "message": "OAuth connection removed successfully"
}
```

## Security Considerations

### Token Storage
- Access tokens are encrypted using AES-256-GCM
- Tokens are only decrypted when needed for Git operations
- Tokens are never exposed in logs or API responses

### State Parameter
- CSRF protection using cryptographically secure state parameter
- State includes user ID and timestamp
- State expires after 10 minutes

### OAuth Scopes
- **GitHub**: `repo` - Full repository access
- **GitLab**: `read_api`, `read_repository`, `write_repository` - API and repository access
- **Bitbucket**: `repository` - Repository read/write access

### Git URL Security
- OAuth tokens are injected into Git URLs at runtime
- Tokens are never stored in project configuration
- Commands are logged without sensitive data

## Troubleshooting

### "OAuth not configured" Error
**Cause**: OAuth client credentials not set in environment variables.

**Solution**:
```bash
# Set in .env
GITHUB_CLIENT_ID=your_client_id
GITHUB_CLIENT_SECRET=your_client_secret
```

### "Authentication failed" Error
**Cause**: Token expired or revoked.

**Solution**: Reconnect OAuth account from settings page.

### "Repository not found" Error
**Cause**: User doesn't have access to repository.

**Solution**: Ensure repository is owned or shared with user, or check repository visibility settings.

### Callback URL Mismatch
**Cause**: OAuth callback URL doesn't match configured URL.

**Solution**: Update OAuth app settings in Git provider to match:
```
http://your-domain.com:9001/api/oauth/callback/github
```

## Next Steps

### Frontend Implementation
1. **Settings Page**: Add OAuth connection buttons
2. **Repository Selector**: Create dropdown component
3. **Project Creation**: Replace manual URL input with repository selector
4. **Status Indicator**: Show connected provider in header/sidebar

### Example Frontend Component
```typescript
// components/ui/oauth-connect.tsx
export function OAuthConnect() {
  const [status, setStatus] = useState(null);
  
  useEffect(() => {
    checkStatus();
  }, []);
  
  const checkStatus = async () => {
    const res = await api.get('/oauth/status');
    setStatus(res.data);
  };
  
  const connect = async (provider: string) => {
    const res = await api.get(`/oauth/authorize/${provider}`);
    window.location.href = res.data.authUrl;
  };
  
  if (status?.connected) {
    return <div>Connected to {status.provider}</div>;
  }
  
  return (
    <div>
      <Button onClick={() => connect('github')}>Connect GitHub</Button>
      <Button onClick={() => connect('gitlab')}>Connect GitLab</Button>
      <Button onClick={() => connect('bitbucket')}>Connect Bitbucket</Button>
    </div>
  );
}
```

## Benefits

1. **Improved UX**: No manual token management
2. **Security**: Centralized token storage with encryption
3. **Convenience**: Browse repositories in UI
4. **Seamless**: Automatic authentication for Git operations
5. **Multi-Provider**: Support for GitHub, GitLab, and Bitbucket

## Limitations

1. **Single Provider**: Users can connect one provider at a time
2. **Token Refresh**: Refresh tokens not yet implemented (coming soon)
3. **Organization Repos**: May require additional scopes for org repos
4. **Self-Hosted**: GitLab self-hosted requires custom configuration

## Future Enhancements

- [ ] Support multiple OAuth connections per user
- [ ] Automatic token refresh before expiration
- [ ] Repository search and filtering
- [ ] Organization/team repository access
- [ ] Self-hosted GitLab support
- [ ] Repository webhooks auto-configuration
- [ ] Deploy keys management
