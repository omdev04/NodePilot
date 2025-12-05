import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { oauthService, OAuthProvider } from '../services/oauthService';
import { authenticate } from '../middleware/auth';

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

export default async function oauthRoutes(fastify: FastifyInstance) {
  /**
   * Initiate OAuth authorization
   * GET /api/oauth/authorize/:provider
   */
  fastify.get<{ Params: AuthorizeParams }>(
    '/authorize/:provider',
    {
      preHandler: authenticate,
    },
    async (request: FastifyRequest<{ Params: AuthorizeParams }>, reply: FastifyReply) => {
      try {
        const { provider } = request.params;
        const userId = (request as any).userId;

        // Validate provider
        if (!['github', 'gitlab', 'bitbucket'].includes(provider)) {
          return reply.status(400).send({
            error: 'Invalid provider. Must be github, gitlab, or bitbucket',
          });
        }

        // Get authorization URL
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
   * OAuth callback handler
   * GET /api/oauth/callback/:provider
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

        // Handle OAuth errors
        if (error) {
          console.error('OAuth error:', error, error_description);
          return reply.redirect(
            `${process.env.FRONTEND_URL || 'http://localhost:3000'}/settings?oauth_error=${encodeURIComponent(
              error_description || error
            )}`
          );
        }

        // Validate required parameters
        console.log('🔹 OAuth callback received:', { provider, hasCode: !!code, hasState: !!state });
        if (!code || !state) {
          console.log('❌ Missing code or state');
          return reply.redirect(
            `${process.env.FRONTEND_URL || 'http://localhost:3000'}/settings?oauth_error=missing_parameters`
          );
        }

        // Verify state and extract user ID
        console.log('🔹 Verifying state...');
        const stateData = oauthService.verifyState(state);
        if (!stateData) {
          console.log('❌ State verification failed');
          return reply.redirect(
            `${process.env.FRONTEND_URL || 'http://localhost:3000'}/settings?oauth_error=invalid_state`
          );
        }
        console.log('✅ State verified, user ID:', stateData.userId);

        // Exchange code for token
        console.log('🔹 Exchanging code for token...');
        await oauthService.exchangeCodeForToken(provider, code, stateData.userId);
        console.log('✅ Token exchange and save completed');

        // Redirect to frontend success page
        return reply.redirect(
          `${process.env.FRONTEND_URL || 'http://localhost:3000'}/settings?oauth_success=${provider}`
        );
      } catch (error: any) {
        console.error('OAuth callback error:', error);
        return reply.redirect(
          `${process.env.FRONTEND_URL || 'http://localhost:3000'}/settings?oauth_error=${encodeURIComponent(
            error.message || 'authentication_failed'
          )}`
        );
      }
    }
  );

  /**
   * List user's repositories
   * GET /api/oauth/repositories
   */
  fastify.get<{ Querystring: RepoQuery }>(
    '/repositories',
    {
      preHandler: authenticate,
    },
    async (request: FastifyRequest<{ Querystring: RepoQuery }>, reply: FastifyReply) => {
      try {
        const userId = (request as any).userId;
        const page = request.query.page || 1;
        const perPage = request.query.per_page || 30;

        const repositories = await oauthService.listRepositories(userId, page, perPage);

        return reply.send({
          repositories,
          page,
          per_page: perPage,
        });
      } catch (error: any) {
        console.error('List repositories error:', error);
        
        // Check if user needs to authenticate
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
   * Get repository branches
   * GET /api/oauth/branches
   */
  fastify.get<{ Querystring: BranchesQuery }>(
    '/branches',
    {
      preHandler: authenticate,
    },
    async (request: FastifyRequest<{ Querystring: BranchesQuery }>, reply: FastifyReply) => {
      try {
        const userId = (request as any).userId;
        const { repo } = request.query;

        if (!repo) {
          return reply.status(400).send({
            error: 'Repository name is required',
          });
        }

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
   * Get OAuth connection status
   * GET /api/oauth/status
   */
  fastify.get(
    '/status',
    {
      preHandler: authenticate,
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const userId = (request as any).userId;
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
   * Disconnect OAuth
   * POST /api/oauth/disconnect
   */
  fastify.post(
    '/disconnect',
    {
      preHandler: authenticate,
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const userId = (request as any).userId;
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
