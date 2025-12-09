import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import crypto from 'crypto';
import { dbWrapper as db } from '../utils/database';
import { deploymentService } from '../services/deploymentService';
import { gitService } from '../services/gitService';
import { authenticate } from '../middleware/auth';
import { encrypt, decrypt } from '../utils/encryption';

/**
 * Git Integration Routes Module
 * Handles Git-based project deployment, webhooks, branch management, and repository operations
 */

// ============================================================================
// Schema Definitions
// ============================================================================

const createGitProjectSchema = z.object({
  projectName: z.string().min(1).max(50).regex(/^[a-zA-Z0-9-_]+$/),
  displayName: z.string().min(1).max(100),
  gitUrl: z.string().url().min(1),
  branch: z.string().min(1).default('main'),
  startCommand: z.string().min(1),
  installCommand: z.string().optional().default('npm install'),
  buildCommand: z.string().optional(),
  port: z.number().optional(),
  envVars: z.record(z.string()).optional(),
});

const webhookConfigSchema = z.object({
  enabled: z.boolean(),
  provider: z.enum(['github', 'gitlab', 'bitbucket']).optional(),
});

// ============================================================================
// Type Definitions
// ============================================================================

type OAuthProvider = 'github' | 'gitlab' | 'bitbucket';

interface OAuthData {
  oauth_provider: OAuthProvider;
  oauth_token: string;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Retrieves and decrypts user's OAuth token
 * @param userId - User ID
 * @returns OAuth token and provider or undefined
 */
async function getUserOAuthToken(userId: number): Promise<{ token: string; provider: OAuthProvider } | undefined> {
  const oauthData = db.prepare('SELECT oauth_provider, oauth_token FROM users WHERE id = ?').get(userId) as OAuthData | undefined;
  
  if (oauthData && oauthData.oauth_token) {
    return {
      token: decrypt(oauthData.oauth_token),
      provider: oauthData.oauth_provider,
    };
  }
  
  return undefined;
}

/**
 * Retrieves a project by ID from database
 * @param projectId - Project ID
 * @returns Project record or undefined
 */
function getProjectById(projectId: string): any {
  return db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId);
}

/**
 * Validates if a project uses Git deployment method
 * @param project - Project record
 * @returns True if Git project
 */
function isGitProject(project: any): boolean {
  return project.deploy_method === 'git';
}

/**
 * Generates a random webhook secret
 * @returns Hex-encoded random secret
 */
function generateWebhookSecret(): string {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Saves webhook secret to database
 * @param projectId - Project ID
 * @param secret - Webhook secret
 */
function saveWebhookSecret(projectId: string, secret: string): void {
  db.prepare('UPDATE projects SET webhook_secret = ? WHERE id = ?').run(secret, projectId);
}

/**
 * Updates project Git branch in database
 * @param projectId - Project ID
 * @param branch - New branch name
 */
function updateProjectBranch(projectId: string, branch: string): void {
  db.prepare('UPDATE projects SET git_branch = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
    .run(branch, projectId);
}

/**
 * Updates project deployment status
 * @param projectId - Project ID
 * @param status - New status ('deploying', 'running', 'error')
 */
function updateProjectStatus(projectId: string, status: string): void {
  db.prepare('UPDATE projects SET status = ? WHERE id = ?').run(status, projectId);
}

/**
 * Verifies webhook signature based on provider
 * @param request - Fastify request object
 * @param webhookSecret - Project's webhook secret
 * @returns True if signature is valid
 */
function verifyWebhookSignature(request: FastifyRequest, webhookSecret: string): boolean {
  const signature = request.headers['x-hub-signature-256'] as string; // GitHub
  const gitlabToken = request.headers['x-gitlab-token'] as string; // GitLab
  const providedSecret = request.headers['x-webhook-secret'] as string; // Generic

  if (signature) {
    // GitHub webhook verification
    const payload = JSON.stringify(request.body);
    return gitService.verifyGitHubWebhook(payload, signature, webhookSecret);
  } else if (gitlabToken) {
    // GitLab webhook verification
    return gitService.verifyGitLabWebhook(gitlabToken, webhookSecret);
  } else if (providedSecret) {
    // Bitbucket or generic webhook
    return providedSecret === webhookSecret;
  }

  return false;
}

/**
 * Extracts branch name from webhook payload
 * @param body - Webhook payload
 * @returns Branch name or undefined
 */
function extractBranchFromWebhook(body: any): string | undefined {
  return body.ref?.replace('refs/heads/', '') || body.push?.changes?.[0]?.new?.name;
}

/**
 * Triggers asynchronous Git deployment for a project
 * @param projectId - Project ID
 * @param projectName - Project name
 */
async function triggerAsyncDeployment(projectId: number, projectName: string): Promise<void> {
  updateProjectStatus(projectId.toString(), 'deploying');
  
  (async () => {
    try {
      await deploymentService.redeployGitProject(projectId);
      updateProjectStatus(projectId.toString(), 'running');
      console.log(`✅ Webhook deployment completed for project ${projectName}`);
    } catch (error: any) {
      console.error(`❌ Webhook deployment failed for project ${projectId}:`, error.message);
      updateProjectStatus(projectId.toString(), 'error');
    }
  })();
}

/**
 * Reads Git deployment logs from file
 * @param logType - Type of log ('clone' or 'pull')
 * @returns Log content or 'No logs available'
 */
async function readGitLogs(logType: 'clone' | 'pull'): Promise<string> {
  const fs = await import('fs/promises');
  const path = await import('path');
  const logDir = process.env.LOG_DIR || path.join(process.cwd(), '../logs');
  const logFile = path.join(logDir, `git-${logType}.log`);

  try {
    const content = await fs.readFile(logFile, 'utf-8');
    const lines = content.split('\n');
    return lines.slice(-200).join('\n');
  } catch {
    return 'No logs available';
  }
}

// ============================================================================
// Route Handlers
// ============================================================================

/**
 * Git routes registration
 * All routes require authentication
 */
export default async function gitRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', authenticate);

  /**
   * POST /project/create/git
   * Creates a new project from a Git repository
   * Clones repository and sets up deployment
   * @returns Created project details
   */
  fastify.post('/project/create/git', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const data = createGitProjectSchema.parse(request.body);
      const userId = (request as any).userId;

      // Get user's OAuth token if connected for private repositories
      const oauthData = await getUserOAuthToken(userId);

      // Validate and sanitize Git URL
      const { isValid: urlValid, sanitized: sanitizedUrl, error: urlError } = 
        gitService.sanitizeRepoUrl(data.gitUrl);
      
      if (!urlValid) {
        return reply.status(400).send({ error: urlError });
      }

      // Validate and sanitize branch name
      const { isValid: branchValid, sanitized: sanitizedBranch, error: branchError } = 
        gitService.sanitizeBranchName(data.branch);
      
      if (!branchValid) {
        return reply.status(400).send({ error: branchError });
      }

      // Create project with Git deployment
      const project = await deploymentService.createProjectFromGit({
        projectName: data.projectName,
        displayName: data.displayName,
        gitUrl: sanitizedUrl,
        branch: sanitizedBranch,
        startCommand: data.startCommand,
        installCommand: data.installCommand,
        buildCommand: data.buildCommand,
        port: data.port,
        envVars: data.envVars,
        oauthToken: oauthData?.token,
        oauthProvider: oauthData?.provider,
      });

      return { success: true, project };
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({ error: 'Invalid input', details: error.errors });
      }
      console.error('Git project creation error:', error);
      return reply.status(500).send({ 
        error: 'Failed to create project from Git', 
        message: error instanceof Error ? error.message : String(error) 
      });
    }
  });

  /**
   * POST /project/:id/deploy/git
   * Redeploys a Git project by pulling latest changes
   * @returns Success message
   */
  fastify.post('/project/:id/deploy/git', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const userId = (request as any).userId;
    
    try {
      const project = getProjectById(id);
      
      if (!project) {
        return reply.status(404).send({ error: 'Project not found' });
      }

      if (!isGitProject(project)) {
        return reply.status(400).send({ 
          error: 'Project is not a Git deployment. Use ZIP deploy endpoint instead.' 
        });
      }

      // Get user's OAuth token for private repository access
      const oauthData = await getUserOAuthToken(userId);

      // Trigger Git redeployment
      await deploymentService.redeployGitProject(
        parseInt(id), 
        oauthData?.token, 
        oauthData?.provider
      );

      return { success: true, message: 'Git deployment initiated' };
    } catch (error) {
      console.error('Git redeploy error:', error);
      return reply.status(500).send({ 
        error: 'Failed to redeploy from Git', 
        message: error instanceof Error ? error.message : String(error) 
      });
    }
  });

  /**
   * GET /project/:id/git/info
   * Retrieves Git repository information (current branch, commit, etc.)
   * @returns Repository info with current status
   */
  fastify.get('/project/:id/git/info', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    
    try {
      const project = getProjectById(id);
      
      if (!project) {
        return reply.status(404).send({ error: 'Project not found' });
      }

      if (!isGitProject(project)) {
        return reply.status(400).send({ error: 'Not a Git project' });
      }

      // Get repository information from Git service
      const info = await gitService.getRepoInfo(project.path);

      return { 
        success: info.success, 
        info: {
          ...info,
          gitUrl: project.git_url,
          configuredBranch: project.git_branch,
        }
      };
    } catch (error) {
      console.error('Get repo info error:', error);
      return reply.status(500).send({ 
        error: 'Failed to get repository info',
        message: error instanceof Error ? error.message : String(error)
      });
    }
  });

  /**
   * GET /project/:id/git/branches
   * Lists all available branches in the Git repository
   * @returns Array of branch names
   */
  fastify.get('/project/:id/git/branches', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    
    try {
      const project = getProjectById(id);
      
      if (!project) {
        return reply.status(404).send({ error: 'Project not found' });
      }

      if (!isGitProject(project)) {
        return reply.status(400).send({ error: 'Not a Git project' });
      }

      // Get list of branches from Git service
      const result = await gitService.listBranches(project.path);

      return result;
    } catch (error) {
      console.error('List branches error:', error);
      return reply.status(500).send({ 
        error: 'Failed to list branches',
        message: error instanceof Error ? error.message : String(error)
      });
    }
  });

  /**
   * POST /project/:id/git/branch
   * Switches project to a different Git branch and redeploys
   * @returns Success message with new branch name
   */
  fastify.post('/project/:id/git/branch', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const body = request.body as any;
    const { branch } = body;

    if (!branch) {
      return reply.status(400).send({ error: 'Branch name is required' });
    }

    try {
      const project = getProjectById(id);
      
      if (!project) {
        return reply.status(404).send({ error: 'Project not found' });
      }

      if (!isGitProject(project)) {
        return reply.status(400).send({ error: 'Not a Git project' });
      }

      // Validate and sanitize branch name
      const { isValid, sanitized, error: branchError } = gitService.sanitizeBranchName(branch);
      if (!isValid) {
        return reply.status(400).send({ error: branchError });
      }

      // Update project branch in database
      updateProjectBranch(id, sanitized);

      // Trigger redeploy with new branch
      await deploymentService.redeployGitProject(parseInt(id));

      return { 
        success: true, 
        message: `Switched to branch "${sanitized}" and redeployed` 
      };
    } catch (error) {
      console.error('Switch branch error:', error);
      return reply.status(500).send({ 
        error: 'Failed to switch branch',
        message: error instanceof Error ? error.message : String(error)
      });
    }
  });

  /**
   * POST /project/:id/webhook/config
   * Configures webhook for automatic deployment on Git push
   * Generates webhook secret and provides setup instructions
   * @returns Webhook configuration with URL and secret
   */
  fastify.post('/project/:id/webhook/config', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    
    try {
      const data = webhookConfigSchema.parse(request.body);
      const project = getProjectById(id);
      
      if (!project) {
        return reply.status(404).send({ error: 'Project not found' });
      }

      if (!isGitProject(project)) {
        return reply.status(400).send({ error: 'Webhooks only available for Git projects' });
      }

      let webhookSecret = project.webhook_secret;
      
      // Generate new webhook secret if enabling and not already set
      if (data.enabled && !webhookSecret) {
        webhookSecret = generateWebhookSecret();
        saveWebhookSecret(id, webhookSecret);
      }

      const webhookUrl = `${process.env.API_URL || 'http://localhost:9001'}/api/git/webhook/${id}`;

      return {
        success: true,
        webhook: {
          enabled: data.enabled,
          url: webhookUrl,
          secret: data.enabled ? webhookSecret : null,
          provider: data.provider,
        },
        instructions: {
          github: 'Add this webhook URL in GitHub Settings > Webhooks. Use "application/json" content type.',
          gitlab: 'Add this webhook URL in GitLab Settings > Webhooks. Use "Push events" trigger.',
          bitbucket: 'Add this webhook URL in Bitbucket Settings > Webhooks. Select "Repository push" event.',
        },
      };
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({ error: 'Invalid input', details: error.errors });
      }
      console.error('Webhook config error:', error);
      return reply.status(500).send({ 
        error: 'Failed to configure webhook',
        message: error instanceof Error ? error.message : String(error)
      });
    }
  });

  /**
   * POST /webhook/:id
   * Webhook endpoint for Git push events
   * No authentication required - verified by signature
   * Triggers automatic deployment when push matches configured branch
   * @returns Deployment status or branch mismatch message
   */
  fastify.post('/webhook/:id', { 
    config: { 
      // Skip auth middleware for webhooks - use signature verification instead
      preHandler: [] 
    } 
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    
    try {
      const project = getProjectById(id);
      
      if (!project) {
        return reply.status(404).send({ error: 'Project not found' });
      }

      if (!project.webhook_secret) {
        return reply.status(400).send({ error: 'Webhook not configured' });
      }

      // Verify webhook signature based on provider (GitHub, GitLab, Bitbucket)
      const verified = verifyWebhookSignature(request, project.webhook_secret);

      if (!verified) {
        console.warn(`Webhook verification failed for project ${id}`);
        return reply.status(401).send({ error: 'Invalid webhook signature' });
      }

      // Extract branch name from webhook payload
      const body = request.body as any;
      const branch = extractBranchFromWebhook(body);

      // Only deploy if the push is to the configured branch
      if (branch && branch === project.git_branch) {
        console.log(`🔔 Webhook triggered for project ${project.name} (ID: ${id}) on branch ${branch}`);
        console.log(`📦 Commits: ${body.commits?.length || 0} | Pusher: ${body.pusher?.name || body.user_name || 'unknown'}`);
        
        // Trigger asynchronous deployment (don't wait for completion)
        await triggerAsyncDeployment(parseInt(id), project.name);

        return { 
          success: true, 
          message: 'Deployment triggered',
          branch 
        };
      }

      // Branch mismatch - webhook received but not for configured branch
      return { 
        success: true, 
        message: 'Webhook received but no action taken (branch mismatch)',
        receivedBranch: branch,
        configuredBranch: project.git_branch,
      };
    } catch (error) {
      console.error('Webhook processing error:', error);
      return reply.status(500).send({ 
        error: 'Webhook processing failed',
        message: error instanceof Error ? error.message : String(error)
      });
    }
  });

  /**
   * GET /project/:id/git/logs
   * Retrieves Git deployment logs (clone or pull operations)
   * @query type - Log type: 'clone' or 'pull' (default: 'clone')
   * @returns Recent log entries (last 200 lines)
   */
  fastify.get('/project/:id/git/logs', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const { type = 'clone' } = request.query as { type?: 'clone' | 'pull' };
    
    try {
      const project = getProjectById(id);
      
      if (!project) {
        return reply.status(404).send({ error: 'Project not found' });
      }

      if (!isGitProject(project)) {
        return reply.status(400).send({ error: 'Not a Git project' });
      }

      // Read and return Git deployment logs
      const logs = await readGitLogs(type);
      return { logs };
      
    } catch (error) {
      console.error('Get Git logs error:', error);
      return reply.status(500).send({ 
        error: 'Failed to retrieve logs',
        message: error instanceof Error ? error.message : String(error)
      });
    }
  });
}
