import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { oauthService, OAuthProvider } from '../services/oauthService';
import { authenticate } from '../middleware/auth';

/**
 * OAuth Integration Routes Module
 * Handles OAuth authentication with Git providers (GitHub, GitLab, Bitbucket)
 * Manages authorization flow, repository access, and connection status
 */

// ============================================================================
// Type Definitions
// ============================================================================

interface AuthorizeParams {
  provider: OAuthProvider;
}

interface CallbackParams {
  provider: OAuthProvider;
}

interface CallbackQuery {
  code?: string;
  state?: string;
  error?: string;
  error_description?: string;
}

interface RepoQuery {
  page?: number;
  per_page?: number;
}

interface BranchesQuery {
  repo: string;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Validates if the OAuth provider is supported
 * @param provider - OAuth provider name
 * @returns True if provider is valid
 */
function isValidProvider(provider: string): boolean {
  return ['github', 'gitlab', 'bitbucket'].includes(provider);
}

/**
 * Gets the frontend URL from environment
 * @returns Frontend URL with default fallback
 */
function getFrontendUrl(): string {
  return process.env.FRONTEND_URL || 'http://localhost:3000';
}

/**
 * Builds redirect URL for OAuth errors
 * @param error - Error message
 * @returns Complete redirect URL
 */
function buildErrorRedirect(error: string): string {
  return `${getFrontendUrl()}/settings?oauth_error=${encodeURIComponent(error)}`;
}

/**
 * Builds redirect URL for OAuth success
 * @param provider - OAuth provider name
 * @returns Complete redirect URL
 */
function buildSuccessRedirect(provider: string): string {
  return `${getFrontendUrl()}/settings?oauth_success=${provider}`;
}

/**
 * Extracts user ID from request
 * @param request - Fastify request object
 * @returns User ID
 */
function getUserId(request: FastifyRequest): number {
  return (request as any).userId;
}

// ============================================================================
// Route Handlers
// ============================================================================

/**
 * OAuth routes registration
 */
export default async function oauthRoutes(fastify: FastifyInstance) {
  /**
   * GET /authorize/:provider
   * Initiates OAuth authorization flow with Git provider
   * Requires authentication
   * @returns Authorization URL for user to visit
   */
  fastify.get<{ Params: AuthorizeParams }>(
    '/authorize/:provider',
    {
      preHandler: authenticate,
    },
    async (request: FastifyRequest<{ Params: AuthorizeParams }>, reply: FastifyReply) => {
      try {
        const { provider } = request.params;
        const userId = getUserId(request);

        // Validate OAuth provider
        if (!isValidProvider(provider)) {
          return reply.status(400).send({
            error: 'Invalid provider. Must be github, gitlab, or bitbucket',
          });
        }

        // Generate authorization URL with state parameter
        const authUrl = oauthService.getAuthorizationUrl(provider, userId);

        return reply.send({
          authUrl,
          message: `Redirecting to ${provider} for authorization`,
        });
      } catch (error: any) {
        console.error('OAuth authorize error:', error);
        return reply.status(500).send({
          error: error.message || 'Failed to initiate OAuth authorization',
        });
      }
    }
  );

  /**
   * GET /callback/:provider
   * OAuth callback handler - receives authorization code and exchanges for access token
   * No authentication required - this is the OAuth return URL
   * @returns Redirect to frontend with success or error status
   */
  fastify.get<{ Params: CallbackParams; Querystring: CallbackQuery }>(
    '/callback/:provider',
    async (
      request: FastifyRequest<{ Params: CallbackParams; Querystring: CallbackQuery }>,
      reply: FastifyReply
    ) => {
      try {
        const { provider } = request.params;
        const { code, state, error, error_description } = request.query;

        // Handle OAuth provider errors
        if (error) {
          console.error('OAuth error:', error, error_description);
          return reply.redirect(buildErrorRedirect(error_description || error));
        }

        // Validate required OAuth parameters
        console.log('🔹 OAuth callback received:', { provider, hasCode: !!code, hasState: !!state });
        if (!code || !state) {
          console.log('❌ Missing code or state');
          return reply.redirect(buildErrorRedirect('missing_parameters'));
        }

        // Verify state parameter to prevent CSRF attacks
        console.log('🔹 Verifying state...');
        const stateData = oauthService.verifyState(state);
        if (!stateData) {
          console.log('❌ State verification failed');
          return reply.redirect(buildErrorRedirect('invalid_state'));
        }
        console.log('✅ State verified, user ID:', stateData.userId);

        // Exchange authorization code for access token
        console.log('🔹 Exchanging code for token...');
        await oauthService.exchangeCodeForToken(provider, code, stateData.userId);
        console.log('✅ Token exchange and save completed');

        // Redirect to frontend with success message
        return reply.redirect(buildSuccessRedirect(provider));
      } catch (error: any) {
        console.error('OAuth callback error:', error);
        return reply.redirect(buildErrorRedirect(error.message || 'authentication_failed'));
      }
    }
  );

  /**
   * GET /repositories
   * Lists user's accessible repositories from connected Git provider
   * Requires authentication and OAuth connection
   * @query page - Page number for pagination (default: 1)
   * @query per_page - Results per page (default: 30)
   * @returns Array of repositories with metadata
   */
  fastify.get<{ Querystring: RepoQuery }>(
    '/repositories',
    {
      preHandler: authenticate,
    },
    async (request: FastifyRequest<{ Querystring: RepoQuery }>, reply: FastifyReply) => {
      try {
        const userId = getUserId(request);
        const page = request.query.page || 1;
        const perPage = request.query.per_page || 30;

        // Fetch repositories from connected OAuth provider
        const repositories = await oauthService.listRepositories(userId, page, perPage);

        return reply.send({
          repositories,
          page,
          per_page: perPage,
        });
      } catch (error: any) {
        console.error('List repositories error:', error);
        
        // Check if user needs to connect OAuth provider first
        if (error.message.includes('not authenticated')) {
          return reply.status(401).send({
            error: error.message,
            requiresAuth: true,
          });
        }

        return reply.status(500).send({
          error: error.message || 'Failed to fetch repositories',
        });
      }
    }
  );

  /**
   * GET /branches
   * Retrieves all branches for a specific repository
   * Requires authentication and OAuth connection
   * @query repo - Repository name (e.g., 'owner/repo')
   * @returns Array of branch names
   */
  fastify.get<{ Querystring: BranchesQuery }>(
    '/branches',
    {
      preHandler: authenticate,
    },
    async (request: FastifyRequest<{ Querystring: BranchesQuery }>, reply: FastifyReply) => {
      try {
        const userId = getUserId(request);
        const { repo } = request.query;

        if (!repo) {
          return reply.status(400).send({
            error: 'Repository name is required',
          });
        }

        // Fetch branches from OAuth provider API
        const branches = await oauthService.getRepositoryBranches(userId, repo);

        return reply.send({
          branches,
          repository: repo,
        });
      } catch (error: any) {
        console.error('List branches error:', error);
        return reply.status(500).send({
          error: error.message || 'Failed to fetch branches',
        });
      }
    }
  );

  /**
   * GET /status
   * Checks if user has an active OAuth connection
   * Requires authentication
   * @returns Connection status and provider name
   */
  fastify.get(
    '/status',
    {
      preHandler: authenticate,
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const userId = getUserId(request);
        const tokenData = oauthService.getUserToken(userId);

        if (!tokenData) {
          return reply.send({
            connected: false,
            provider: null,
          });
        }

        return reply.send({
          connected: true,
          provider: tokenData.provider,
        });
      } catch (error: any) {
        console.error('OAuth status error:', error);
        return reply.status(500).send({
          error: 'Failed to check OAuth status',
        });
      }
    }
  );

  /**
   * POST /disconnect
   * Disconnects user's OAuth connection and removes stored tokens
   * Requires authentication
   * @returns Success message
   */
  fastify.post(
    '/disconnect',
    {
      preHandler: authenticate,
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const userId = getUserId(request);
        oauthService.disconnectOAuth(userId);

        return reply.send({
          message: 'OAuth connection removed successfully',
        });
      } catch (error: any) {
        console.error('OAuth disconnect error:', error);
        return reply.status(500).send({
          error: 'Failed to disconnect OAuth',
        });
      }
    }
  );
}
