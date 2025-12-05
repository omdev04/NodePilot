import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import crypto from 'crypto';
import { dbWrapper as db } from '../utils/database';
import { deploymentService } from '../services/deploymentService';
import { gitService } from '../services/gitService';
import { authenticate } from '../middleware/auth';
import { encrypt } from '../utils/encryption';

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

export default async function gitRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', authenticate);

  // Create project from Git repository
  fastify.post('/project/create/git', async (request, reply) => {
    try {
      const data = createGitProjectSchema.parse(request.body);
      const userId = (request as any).userId;

      // Get user's OAuth token if connected
      const oauthData = db.prepare('SELECT oauth_provider, oauth_token FROM users WHERE id = ?').get(userId) as any;
      let oauthToken: string | undefined;
      let oauthProvider: 'github' | 'gitlab' | 'bitbucket' | undefined;

      if (oauthData && oauthData.oauth_token) {
        const { decrypt } = await import('../utils/encryption');
        oauthToken = decrypt(oauthData.oauth_token);
        oauthProvider = oauthData.oauth_provider;
      }

      // Validate Git URL
      const { isValid: urlValid, sanitized: sanitizedUrl, error: urlError } = 
        gitService.sanitizeRepoUrl(data.gitUrl);
      
      if (!urlValid) {
        return reply.status(400).send({ error: urlError });
      }

      // Validate branch name
      const { isValid: branchValid, sanitized: sanitizedBranch, error: branchError } = 
        gitService.sanitizeBranchName(data.branch);
      
      if (!branchValid) {
        return reply.status(400).send({ error: branchError });
      }

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
        oauthToken,
        oauthProvider,
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

  // Redeploy Git project (pull latest changes)
  fastify.post('/project/:id/deploy/git', async (request, reply) => {
    const { id } = request.params as { id: string };
    const userId = (request as any).userId;
    
    try {
      const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(id) as any;
      
      if (!project) {
        return reply.status(404).send({ error: 'Project not found' });
      }

      if (project.deploy_method !== 'git') {
        return reply.status(400).send({ 
          error: 'Project is not a Git deployment. Use ZIP deploy endpoint instead.' 
        });
      }

      // Get user's OAuth token if connected
      const oauthData = db.prepare('SELECT oauth_provider, oauth_token FROM users WHERE id = ?').get(userId) as any;
      let oauthToken: string | undefined;
      let oauthProvider: 'github' | 'gitlab' | 'bitbucket' | undefined;

      if (oauthData && oauthData.oauth_token) {
        const { decrypt } = await import('../utils/encryption');
        oauthToken = decrypt(oauthData.oauth_token);
        oauthProvider = oauthData.oauth_provider;
      }

      await deploymentService.redeployGitProject(parseInt(id), oauthToken, oauthProvider);

      return { success: true, message: 'Git deployment initiated' };
    } catch (error) {
      console.error('Git redeploy error:', error);
      return reply.status(500).send({ 
        error: 'Failed to redeploy from Git', 
        message: error instanceof Error ? error.message : String(error) 
      });
    }
  });

  // Get repository info (current branch, commit, etc.)
  fastify.get('/project/:id/git/info', async (request, reply) => {
    const { id } = request.params as { id: string };
    
    try {
      const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(id) as any;
      
      if (!project) {
        return reply.status(404).send({ error: 'Project not found' });
      }

      if (project.deploy_method !== 'git') {
        return reply.status(400).send({ error: 'Not a Git project' });
      }

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

  // List available branches
  fastify.get('/project/:id/git/branches', async (request, reply) => {
    const { id } = request.params as { id: string };
    
    try {
      const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(id) as any;
      
      if (!project) {
        return reply.status(404).send({ error: 'Project not found' });
      }

      if (project.deploy_method !== 'git') {
        return reply.status(400).send({ error: 'Not a Git project' });
      }

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

  // Switch branch
  fastify.post('/project/:id/git/branch', async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as any;
    const { branch } = body;

    if (!branch) {
      return reply.status(400).send({ error: 'Branch name is required' });
    }

    try {
      const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(id) as any;
      
      if (!project) {
        return reply.status(404).send({ error: 'Project not found' });
      }

      if (project.deploy_method !== 'git') {
        return reply.status(400).send({ error: 'Not a Git project' });
      }

      // Validate branch name
      const { isValid, sanitized, error: branchError } = gitService.sanitizeBranchName(branch);
      if (!isValid) {
        return reply.status(400).send({ error: branchError });
      }

      // Update database
      db.prepare('UPDATE projects SET git_branch = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
        .run(sanitized, id);

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

  // Configure webhook
  fastify.post('/project/:id/webhook/config', async (request, reply) => {
    const { id } = request.params as { id: string };
    
    try {
      const data = webhookConfigSchema.parse(request.body);
      const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(id) as any;
      
      if (!project) {
        return reply.status(404).send({ error: 'Project not found' });
      }

      if (project.deploy_method !== 'git') {
        return reply.status(400).send({ error: 'Webhooks only available for Git projects' });
      }

      let webhookSecret = project.webhook_secret;
      
      if (data.enabled && !webhookSecret) {
        // Generate webhook secret
        webhookSecret = crypto.randomBytes(32).toString('hex');
        db.prepare('UPDATE projects SET webhook_secret = ? WHERE id = ?')
          .run(webhookSecret, id);
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

  // Webhook endpoint (no auth required, verified by signature)
  fastify.post('/webhook/:id', { 
    config: { 
      // Skip auth middleware for webhooks
      preHandler: [] 
    } 
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    
    try {
      const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(id) as any;
      
      if (!project) {
        return reply.status(404).send({ error: 'Project not found' });
      }

      if (!project.webhook_secret) {
        return reply.status(400).send({ error: 'Webhook not configured' });
      }

      // Verify webhook signature based on provider
      const signature = request.headers['x-hub-signature-256'] as string; // GitHub
      const gitlabToken = request.headers['x-gitlab-token'] as string; // GitLab

      let verified = false;

      if (signature) {
        // GitHub webhook
        const payload = JSON.stringify(request.body);
        verified = gitService.verifyGitHubWebhook(payload, signature, project.webhook_secret);
      } else if (gitlabToken) {
        // GitLab webhook
        verified = gitService.verifyGitLabWebhook(gitlabToken, project.webhook_secret);
      } else {
        // Bitbucket or generic - just check if secret matches
        const providedSecret = request.headers['x-webhook-secret'] as string;
        verified = providedSecret === project.webhook_secret;
      }

      if (!verified) {
        console.warn(`Webhook verification failed for project ${id}`);
        return reply.status(401).send({ error: 'Invalid webhook signature' });
      }

      // Parse webhook payload
      const body = request.body as any;
      const branch = body.ref?.replace('refs/heads/', '') || body.push?.changes?.[0]?.new?.name;

      // Only deploy if the push is to the configured branch
      if (branch && branch === project.git_branch) {
        console.log(`Webhook triggered for project ${id} on branch ${branch}`);
        
        // Trigger async deployment (don't wait for completion)
        deploymentService.redeployGitProject(parseInt(id)).catch(error => {
          console.error(`Webhook deployment failed for project ${id}:`, error);
        });

        return { 
          success: true, 
          message: 'Deployment triggered',
          branch 
        };
      }

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

  // Get Git deployment logs
  fastify.get('/project/:id/git/logs', async (request, reply) => {
    const { id } = request.params as { id: string };
    const { type = 'clone' } = request.query as { type?: 'clone' | 'pull' };
    
    try {
      const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(id) as any;
      
      if (!project) {
        return reply.status(404).send({ error: 'Project not found' });
      }

      if (project.deploy_method !== 'git') {
        return reply.status(400).send({ error: 'Not a Git project' });
      }

      const fs = await import('fs/promises');
      const path = await import('path');
      const logDir = process.env.LOG_DIR || path.join(process.cwd(), '../logs');
      const logFile = path.join(logDir, `git-${type}.log`);

      try {
        const content = await fs.readFile(logFile, 'utf-8');
        const lines = content.split('\n');
        const recentLines = lines.slice(-200).join('\n');

        return { logs: recentLines };
      } catch {
        return { logs: 'No logs available' };
      }
    } catch (error) {
      console.error('Get Git logs error:', error);
      return reply.status(500).send({ 
        error: 'Failed to retrieve logs',
        message: error instanceof Error ? error.message : String(error)
      });
    }
  });
}
