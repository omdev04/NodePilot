import axios from 'axios';
import crypto from 'crypto';
import { dbWrapper as db } from '../utils/database';
import { encrypt, decrypt } from '../utils/encryption';

export type OAuthProvider = 'github' | 'gitlab' | 'bitbucket';

interface OAuthConfig {
  clientId: string;
  clientSecret: string;
  authorizeUrl: string;
  tokenUrl: string;
  scope: string;
  apiBaseUrl: string;
}

interface Repository {
  id: string;
  name: string;
  fullName: string;
  cloneUrl: string;
  sshUrl: string;
  defaultBranch: string;
  isPrivate: boolean;
  description?: string;
  language?: string;
  updatedAt?: string;
}

export class OAuthService {
  /**
   * Get OAuth configuration for a specific provider
   * Reads client credentials from environment variables at runtime
   * @param provider - OAuth provider (github, gitlab, or bitbucket)
   * @returns Provider-specific OAuth configuration
   */
  private getConfig(provider: OAuthProvider): OAuthConfig {
    const configs: Record<OAuthProvider, OAuthConfig> = {
      github: {
        clientId: process.env.GITHUB_CLIENT_ID || '',
        clientSecret: process.env.GITHUB_CLIENT_SECRET || '',
        authorizeUrl: 'https://github.com/login/oauth/authorize',
        tokenUrl: 'https://github.com/login/oauth/access_token',
        scope: 'repo',
        apiBaseUrl: 'https://api.github.com',
      },
      gitlab: {
        clientId: process.env.GITLAB_CLIENT_ID || '',
        clientSecret: process.env.GITLAB_CLIENT_SECRET || '',
        authorizeUrl: 'https://gitlab.com/oauth/authorize',
        tokenUrl: 'https://gitlab.com/oauth/token',
        scope: 'read_api read_repository write_repository',
        apiBaseUrl: 'https://gitlab.com/api/v4',
      },
      bitbucket: {
        clientId: process.env.BITBUCKET_CLIENT_ID || '',
        clientSecret: process.env.BITBUCKET_CLIENT_SECRET || '',
        authorizeUrl: 'https://bitbucket.org/site/oauth2/authorize',
        tokenUrl: 'https://bitbucket.org/site/oauth2/access_token',
        scope: 'repository',
        apiBaseUrl: 'https://api.bitbucket.org/2.0',
      },
    };
    
    return configs[provider];
  }

  /**
   * Generate OAuth authorization URL for user to initiate OAuth flow
   * @param provider - OAuth provider (github, gitlab, or bitbucket)
   * @param userId - User ID to encode in state parameter
   * @returns Authorization URL with all required parameters
   * @throws Error if provider OAuth is not configured
   */
  getAuthorizationUrl(provider: OAuthProvider, userId: number): string {
    const config = this.getConfig(provider);
    
    if (!config.clientId) {
      throw new Error(`${provider} OAuth not configured. Please set ${provider.toUpperCase()}_CLIENT_ID in environment variables.`);
    }

    const redirectUri = `${process.env.API_URL || 'http://localhost:9001'}/api/oauth/callback/${provider}`;
    const state = this.generateState(userId);

    const params = new URLSearchParams({
      client_id: config.clientId,
      redirect_uri: redirectUri,
      scope: config.scope,
      state,
      response_type: 'code',
    });

    return `${config.authorizeUrl}?${params.toString()}`;
  }

  /**
   * Exchange OAuth authorization code for access token
   * Stores encrypted tokens in database after successful exchange
   * @param provider - OAuth provider (github, gitlab, or bitbucket)
   * @param code - Authorization code from OAuth callback
   * @param userId - User ID to associate tokens with
   * @returns Access token, optional refresh token, and expiration time
   * @throws Error if token exchange fails
   */
  async exchangeCodeForToken(
    provider: OAuthProvider,
    code: string,
    userId: number
  ): Promise<{ accessToken: string; refreshToken?: string; expiresIn?: number }> {
    const config = this.getConfig(provider);
    const redirectUri = `${process.env.API_URL || 'http://localhost:9001'}/api/oauth/callback/${provider}`;

    console.log('🔹 exchangeCodeForToken called:', { provider, userId, redirectUri });

    try {
      console.log('🔹 Requesting token from:', config.tokenUrl);
      const response = await axios.post(
        config.tokenUrl,
        {
          client_id: config.clientId,
          client_secret: config.clientSecret,
          code,
          redirect_uri: redirectUri,
          grant_type: 'authorization_code',
        },
        {
          headers: {
            Accept: 'application/json',
          },
        }
      );

      console.log('✅ Token response received:', { 
        hasAccessToken: !!response.data.access_token,
        hasRefreshToken: !!response.data.refresh_token 
      });

      const accessToken = response.data.access_token;
      const refreshToken = response.data.refresh_token;
      const expiresIn = response.data.expires_in;

      // Store tokens in database (encrypted)
      console.log('🔹 Saving tokens to database...');
      await this.saveTokens(userId, provider, accessToken, refreshToken, expiresIn);
      console.log('✅ Tokens saved successfully');

      return { accessToken, refreshToken, expiresIn };
    } catch (error: any) {
      console.error('❌ OAuth token exchange error:', error.response?.data || error.message);
      throw new Error(`Failed to exchange code for token: ${error.message}`);
    }
  }

  /**
   * Save encrypted OAuth tokens to database
   * Calculates and stores token expiration time if provided
   * @param userId - User ID to associate tokens with
   * @param provider - OAuth provider (github, gitlab, or bitbucket)
   * @param accessToken - OAuth access token to encrypt and store
   * @param refreshToken - Optional refresh token to encrypt and store
   * @param expiresIn - Optional token lifetime in seconds
   */
  private async saveTokens(
    userId: number,
    provider: OAuthProvider,
    accessToken: string,
    refreshToken?: string,
    expiresIn?: number
  ): Promise<void> {
    console.log('🔹 saveTokens called:', { userId, provider, hasToken: !!accessToken });
    
    const encryptedToken = encrypt(accessToken);
    const encryptedRefreshToken = refreshToken ? encrypt(refreshToken) : null;
    
    console.log('✅ Tokens encrypted');
    
    let expiresAt: string | null = null;
    if (expiresIn) {
      const expiryDate = new Date();
      expiryDate.setSeconds(expiryDate.getSeconds() + expiresIn);
      expiresAt = expiryDate.toISOString();
    }

    console.log('🔹 Updating database...');
    const result = db.prepare(`
      UPDATE users 
      SET oauth_provider = ?, oauth_token = ?, oauth_refresh_token = ?, oauth_expires_at = ?
      WHERE id = ?
    `).run(provider, encryptedToken, encryptedRefreshToken, expiresAt, userId);
    
    console.log('✅ Database update result:', result);
    
    // Verify the save worked
    const user = db.prepare('SELECT id, username, oauth_provider FROM users WHERE id = ?').get(userId) as any;
    console.log('✅ Verification - User after save:', user);
  }

  /**
   * Retrieve and decrypt user's stored OAuth token
   * @param userId - User ID to fetch token for
   * @returns Provider and decrypted token, or null if not found
   */
  getUserToken(userId: number): { provider: OAuthProvider; token: string } | null {
    const user = db.prepare('SELECT oauth_provider, oauth_token FROM users WHERE id = ?').get(userId) as any;
    
    if (!user || !user.oauth_token) {
      return null;
    }

    const decryptedToken = decrypt(user.oauth_token);
    return {
      provider: user.oauth_provider as OAuthProvider,
      token: decryptedToken,
    };
  }

  /**
   * List user's accessible repositories from their connected Git provider
   * @param userId - User ID to fetch repositories for
   * @param page - Page number for pagination (default: 1)
   * @param perPage - Number of repositories per page (default: 30)
   * @returns Array of repository objects with metadata
   * @throws Error if user not authenticated or API request fails
   */
  async listRepositories(userId: number, page: number = 1, perPage: number = 30): Promise<Repository[]> {
    const tokenData = this.getUserToken(userId);
    
    if (!tokenData) {
      throw new Error('User not authenticated with any Git provider. Please connect your account first.');
    }

    const { provider, token } = tokenData;

    switch (provider) {
      case 'github':
        return this.listGitHubRepositories(token, page, perPage);
      case 'gitlab':
        return this.listGitLabRepositories(token, page, perPage);
      case 'bitbucket':
        return this.listBitbucketRepositories(token, page, perPage);
      default:
        throw new Error(`Unsupported provider: ${provider}`);
    }
  }

  /**
   * Fetch repositories from GitHub API
   * @param token - GitHub OAuth access token
   * @param page - Page number for pagination
   * @param perPage - Number of repositories per page
   * @returns Array of normalized repository objects
   * @throws Error if API request fails
   */
  private async listGitHubRepositories(token: string, page: number, perPage: number): Promise<Repository[]> {
    try {
      const response = await axios.get('https://api.github.com/user/repos', {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github.v3+json',
        },
        params: {
          page,
          per_page: perPage,
          sort: 'updated',
          affiliation: 'owner,collaborator,organization_member',
        },
      });

      return response.data.map((repo: any) => ({
        id: repo.id.toString(),
        name: repo.name,
        fullName: repo.full_name,
        cloneUrl: repo.clone_url,
        sshUrl: repo.ssh_url,
        defaultBranch: repo.default_branch || 'main',
        isPrivate: repo.private,
        description: repo.description,
        language: repo.language,
        updatedAt: repo.updated_at,
      }));
    } catch (error: any) {
      console.error('GitHub API error:', error.response?.data || error.message);
      throw new Error('Failed to fetch GitHub repositories. Please reconnect your account.');
    }
  }

  /**
   * Fetch repositories from GitLab API
   * @param token - GitLab OAuth access token
   * @param page - Page number for pagination
   * @param perPage - Number of repositories per page
   * @returns Array of normalized repository objects
   * @throws Error if API request fails
   */
  private async listGitLabRepositories(token: string, page: number, perPage: number): Promise<Repository[]> {
    try {
      const response = await axios.get('https://gitlab.com/api/v4/projects', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
        params: {
          page,
          per_page: perPage,
          membership: true,
          order_by: 'updated_at',
          sort: 'desc',
        },
      });

      return response.data.map((repo: any) => ({
        id: repo.id.toString(),
        name: repo.name,
        fullName: repo.path_with_namespace,
        cloneUrl: repo.http_url_to_repo,
        sshUrl: repo.ssh_url_to_repo,
        defaultBranch: repo.default_branch || 'main',
        isPrivate: repo.visibility === 'private',
        description: repo.description,
        language: repo.languages?.[0],
        updatedAt: repo.last_activity_at,
      }));
    } catch (error: any) {
      console.error('GitLab API error:', error.response?.data || error.message);
      throw new Error('Failed to fetch GitLab repositories. Please reconnect your account.');
    }
  }

  /**
   * Fetch repositories from Bitbucket API
   * @param token - Bitbucket OAuth access token
   * @param page - Page number for pagination
   * @param perPage - Number of repositories per page
   * @returns Array of normalized repository objects
   * @throws Error if API request fails
   */
  private async listBitbucketRepositories(token: string, page: number, perPage: number): Promise<Repository[]> {
    try {
      const response = await axios.get('https://api.bitbucket.org/2.0/repositories', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
        params: {
          page,
          pagelen: perPage,
          role: 'member',
          sort: '-updated_on',
        },
      });

      return response.data.values.map((repo: any) => ({
        id: repo.uuid,
        name: repo.name,
        fullName: repo.full_name,
        cloneUrl: repo.links.clone.find((l: any) => l.name === 'https')?.href || '',
        sshUrl: repo.links.clone.find((l: any) => l.name === 'ssh')?.href || '',
        defaultBranch: repo.mainbranch?.name || 'main',
        isPrivate: repo.is_private,
        description: repo.description,
        language: repo.language,
        updatedAt: repo.updated_on,
      }));
    } catch (error: any) {
      console.error('Bitbucket API error:', error.response?.data || error.message);
      throw new Error('Failed to fetch Bitbucket repositories. Please reconnect your account.');
    }
  }

  /**
   * Get list of branches for a specific repository
   * @param userId - User ID to use for authentication
   * @param repoFullName - Full repository name (e.g., 'owner/repo')
   * @returns Array of branch names
   * @throws Error if user not authenticated or API request fails
   */
  async getRepositoryBranches(userId: number, repoFullName: string): Promise<string[]> {
    const tokenData = this.getUserToken(userId);
    
    if (!tokenData) {
      throw new Error('User not authenticated');
    }

    const { provider, token } = tokenData;

    switch (provider) {
      case 'github':
        return this.getGitHubBranches(token, repoFullName);
      case 'gitlab':
        return this.getGitLabBranches(token, repoFullName);
      case 'bitbucket':
        return this.getBitbucketBranches(token, repoFullName);
      default:
        throw new Error(`Unsupported provider: ${provider}`);
    }
  }

  /**
   * Fetch branches from GitHub API
   * @param token - GitHub OAuth access token
   * @param repoFullName - Repository full name (owner/repo)
   * @returns Array of branch names
   * @throws Error if API request fails
   */
  private async getGitHubBranches(token: string, repoFullName: string): Promise<string[]> {
    try {
      const response = await axios.get(`https://api.github.com/repos/${repoFullName}/branches`, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github.v3+json',
        },
      });
      return response.data.map((branch: any) => branch.name);
    } catch (error) {
      throw new Error('Failed to fetch branches');
    }
  }

  /**
   * Fetch branches from GitLab API
   * @param token - GitLab OAuth access token
   * @param projectId - GitLab project ID or path
   * @returns Array of branch names
   * @throws Error if API request fails
   */
  private async getGitLabBranches(token: string, projectId: string): Promise<string[]> {
    try {
      const response = await axios.get(`https://gitlab.com/api/v4/projects/${encodeURIComponent(projectId)}/repository/branches`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      return response.data.map((branch: any) => branch.name);
    } catch (error) {
      throw new Error('Failed to fetch branches');
    }
  }

  /**
   * Fetch branches from Bitbucket API
   * @param token - Bitbucket OAuth access token
   * @param repoFullName - Repository full name (owner/repo)
   * @returns Array of branch names
   * @throws Error if API request fails
   */
  private async getBitbucketBranches(token: string, repoFullName: string): Promise<string[]> {
    try {
      const response = await axios.get(`https://api.bitbucket.org/2.0/repositories/${repoFullName}/refs/branches`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      return response.data.values.map((branch: any) => branch.name);
    } catch (error) {
      throw new Error('Failed to fetch branches');
    }
  }

  /**
   * Inject OAuth token into repository clone URL for authenticated access
   * @param userId - User ID to retrieve token for
   * @param repoUrl - Original repository clone URL
   * @returns URL with embedded OAuth credentials, or original URL if token unavailable
   */
  getAuthenticatedCloneUrl(userId: number, repoUrl: string): string {
    const tokenData = this.getUserToken(userId);
    
    if (!tokenData) {
      return repoUrl; // Fallback to original URL
    }

    const { provider, token } = tokenData;

    try {
      const url = new URL(repoUrl);
      
      // Inject token into URL
      if (provider === 'github') {
        url.username = token;
        url.password = 'x-oauth-basic';
      } else if (provider === 'gitlab') {
        url.username = 'oauth2';
        url.password = token;
      } else if (provider === 'bitbucket') {
        url.username = 'x-token-auth';
        url.password = token;
      }

      return url.toString();
    } catch (error) {
      return repoUrl; // Fallback if URL parsing fails
    }
  }

  /**
   * Remove OAuth connection for user by clearing all OAuth-related fields
   * @param userId - User ID to disconnect OAuth for
   */
  disconnectOAuth(userId: number): void {
    db.prepare(`
      UPDATE users 
      SET oauth_provider = NULL, oauth_token = NULL, oauth_refresh_token = NULL, oauth_expires_at = NULL
      WHERE id = ?
    `).run(userId);
  }

  /**
   * Generate cryptographically secure state parameter for OAuth flow
   * Encodes user ID, timestamp, and random bytes for verification
   * @param userId - User ID to encode in state
   * @returns Base64url-encoded state string
   */
  private generateState(userId: number): string {
    const timestamp = Date.now();
    const random = crypto.randomBytes(16).toString('hex');
    const data = `${userId}:${timestamp}:${random}`;
    return Buffer.from(data).toString('base64url');
  }

  /**
   * Verify and decode OAuth state parameter
   * Validates state format, checks expiration (10 minute timeout)
   * @param state - Base64url-encoded state string from OAuth callback
   * @returns Decoded user ID and timestamp, or null if invalid/expired
   */
  verifyState(state: string): { userId: number; timestamp: number } | null {
    try {
      const decoded = Buffer.from(state, 'base64url').toString('utf-8');
      console.log('🔹 Decoded state:', decoded);
      const parts = decoded.split(':');
      const userIdStr = parts[0];
      const timestampStr = parts[1];
      const userId = parseInt(userIdStr, 10);
      const timestamp = parseInt(timestampStr, 10);

      console.log('🔹 Parsed state:', { userIdStr, timestampStr, userId, timestamp });

      // Check if userId is valid
      if (isNaN(userId) || isNaN(timestamp)) {
        console.log('❌ Invalid state: NaN values');
        return null;
      }

      // Check if state is not older than 10 minutes
      if (Date.now() - timestamp > 10 * 60 * 1000) {
        console.log('❌ State expired');
        return null;
      }

      return { userId, timestamp };
    } catch (error) {
      console.error('❌ State verification error:', error);
      return null;
    }
  }
}

export const oauthService = new OAuthService();
