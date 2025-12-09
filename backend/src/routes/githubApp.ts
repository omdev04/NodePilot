import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import crypto from 'crypto';
import { dbWrapper as db } from '../utils/database';
import { deploymentService } from '../services/deploymentService';

/**
 * GitHub App Integration Routes Module
 * Handles GitHub App installation, webhooks, and automatic deployment triggers
 * Automatically installs webhooks when app is installed on repository
 */

// ============================================================================
// Type Definitions
// ============================================================================

interface GitHubAppInstallation {
  installation_id: number;
  account: {
    login: string;
    type: string;
  };
  repositories?: Array<{
    id: number;
    name: string;
    full_name: string;
  }>;
}

interface GitHubPushPayload {
  repository?: {
    full_name: string;
  };
  ref?: string;
  commits?: any[];
  pusher?: {
    name: string;
  };
  installation?: {
    id: number;
  };
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Verifies GitHub webhook signature using HMAC SHA256
 * @param payload - Raw webhook payload as string
 * @param signature - Signature from X-Hub-Signature-256 header
 * @param secret - Webhook secret
 * @returns True if signature is valid
 */
function verifyGitHubSignature(payload: string, signature: string, secret: string): boolean {
  const hmac = crypto.createHmac('sha256', secret);
  const digest = 'sha256=' + hmac.update(payload).digest('hex');
  return signature === digest;
}

/**
 * Gets the webhook secret from environment
 * @returns Webhook secret or undefined
 */
function getWebhookSecret(): string | undefined {
  return process.env.GITHUB_APP_WEBHOOK_SECRET;
}

/**
 * Stores GitHub App installation in database
 * @param installation - GitHub App installation data
 */
function storeInstallation(installation: GitHubAppInstallation): void {
  try {
    const existing = db.prepare('SELECT id FROM github_installations WHERE installation_id = ?')
      .get(installation.installation_id);
    
    if (!existing) {
      db.prepare(`
        INSERT INTO github_installations (installation_id, account_name, account_type, installed_at)
        VALUES (?, ?, ?, CURRENT_TIMESTAMP)
      `).run(
        installation.installation_id,
        installation.account.login,
        installation.account.type
      );
      
      console.log(`✅ Stored installation ${installation.installation_id}`);
    }
  } catch (error) {
    console.warn('⚠️  Failed to store installation:', error);
  }
}

/**
 * Removes GitHub App installation from database
 * @param installationId - Installation ID to remove
 */
function removeInstallation(installationId: number): void {
  try {
    db.prepare('DELETE FROM github_installations WHERE installation_id = ?')
      .run(installationId);
    
    console.log(`✅ Removed installation ${installationId}`);
  } catch (error) {
    console.warn('⚠️  Failed to remove installation:', error);
  }
}

/**
 * Finds projects matching a repository and branch
 * @param repoFullName - Full repository name (e.g., "owner/repo")
 * @param branch - Branch name
 * @returns Array of matching projects
 */
function findProjectsByRepo(repoFullName: string, branch: string): any[] {
  return db.prepare(`
    SELECT * FROM projects 
    WHERE git_url LIKE ? AND git_branch = ? AND deploy_method = 'git'
  `).all(`%${repoFullName}%`, branch);
}

/**
 * Updates project deployment status
 * @param projectId - Project ID
 * @param status - New status ('deploying', 'running', 'error')
 */
function updateProjectStatus(projectId: number, status: string): void {
  db.prepare('UPDATE projects SET status = ? WHERE id = ?').run(status, projectId);
}

/**
 * Triggers deployment for a project asynchronously
 * @param project - Project to deploy
 */
async function triggerProjectDeployment(project: any): Promise<void> {
  console.log(`🚀 Triggering deployment for project: ${project.name}`);
  updateProjectStatus(project.id, 'deploying');
  
  // Deploy asynchronously
  (async () => {
    try {
      await deploymentService.redeployGitProject(project.id);
      updateProjectStatus(project.id, 'running');
      console.log(`✅ Deployment completed for ${project.name}`);
    } catch (error: any) {
      console.error(`❌ Deployment failed for ${project.name}:`, error.message);
      updateProjectStatus(project.id, 'error');
    }
  })();
}

// ============================================================================
// Route Handlers
// ============================================================================

/**
 * GitHub App routes registration
 */
export default async function githubAppRoutes(fastify: FastifyInstance) {
  
  /**
   * POST /github-app/installation
   * GitHub App Installation Webhook
   * Triggered when user installs/uninstalls GitHub App or modifies repository access
   * @returns Success message with action type
   */
  fastify.post('/github-app/installation', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      // Get and verify webhook secret
      const signature = request.headers['x-hub-signature-256'] as string;
      const webhookSecret = getWebhookSecret();
      
      if (!webhookSecret) {
        console.warn('⚠️  GitHub App webhook secret not configured');
        return reply.status(500).send({ error: 'Webhook secret not configured' });
      }

      // Verify webhook signature
      const payload = JSON.stringify(request.body);
      if (!verifyGitHubSignature(payload, signature, webhookSecret)) {
        console.warn('❌ Invalid GitHub App webhook signature');
        return reply.status(401).send({ error: 'Invalid signature' });
      }

      const body = request.body as any;
      const action = body.action;
      const installation = body.installation as GitHubAppInstallation;

      console.log(`🔔 GitHub App ${action}:`, {
        installationId: installation.installation_id,
        account: installation.account.login,
        type: installation.account.type,
      });

      // Handle different installation actions
      switch (action) {
        case 'created':
          // App installed - setup webhooks for all repos
          await handleAppInstallation(installation);
          break;
          
        case 'deleted':
          // App uninstalled - cleanup
          await handleAppUninstallation(installation);
          break;
          
        case 'added':
          // Repositories added to existing installation
          if (body.repositories_added) {
            await handleRepositoriesAdded(installation, body.repositories_added);
          }
          break;
          
        case 'removed':
          // Repositories removed from installation
          if (body.repositories_removed) {
            await handleRepositoriesRemoved(installation, body.repositories_removed);
          }
          break;
      }

      return { success: true, message: `GitHub App ${action} processed` };
      
    } catch (error: any) {
      console.error('❌ GitHub App installation webhook error:', error);
      return reply.status(500).send({ error: error.message });
    }
  });

  /**
   * POST /github-app/push
   * GitHub App Push Event Webhook
   * Auto-triggered when code is pushed to connected repositories
   * Automatically deploys matching projects without manual webhook setup
   * @returns Deployment status and list of affected projects
   */
  fastify.post('/github-app/push', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      // Get and verify webhook secret
      const signature = request.headers['x-hub-signature-256'] as string;
      const webhookSecret = getWebhookSecret();
      
      if (!webhookSecret) {
        return reply.status(500).send({ error: 'Webhook secret not configured' });
      }

      // Verify webhook signature
      const payload = JSON.stringify(request.body);
      if (!verifyGitHubSignature(payload, signature, webhookSecret)) {
        return reply.status(401).send({ error: 'Invalid signature' });
      }

      // Parse push event payload
      const body = request.body as GitHubPushPayload;
      const repoFullName = body.repository?.full_name;
      const branch = body.ref?.replace('refs/heads/', '');
      const installationId = body.installation?.id;

      console.log(`🔔 GitHub App push event:`, {
        repo: repoFullName,
        branch,
        commits: body.commits?.length || 0,
        pusher: body.pusher?.name,
      });

      // Find projects using this repository and branch
      const projects = findProjectsByRepo(repoFullName!, branch!);

      if (projects.length === 0) {
        console.log(`ℹ️  No projects found for ${repoFullName} on branch ${branch}`);
        return { success: true, message: 'No matching projects' };
      }

      console.log(`✅ Found ${projects.length} project(s) to deploy`);

      // Trigger deployment for each matching project
      for (const project of projects as any[]) {
        await triggerProjectDeployment(project);
      }

      return { 
        success: true, 
        message: `Deployment triggered for ${projects.length} project(s)`,
        projects: projects.map((p: any) => p.name),
      };

    } catch (error: any) {
      console.error('❌ GitHub App push webhook error:', error);
      return reply.status(500).send({ error: error.message });
    }
  });

  /**
   * GET /github-app/status
   * Checks GitHub App configuration status
   * Returns whether all required environment variables are set
   * @returns Configuration status and webhook URL
   */
  fastify.get('/github-app/status', async (request: FastifyRequest, reply: FastifyReply) => {
    const appId = process.env.GITHUB_APP_ID;
    const webhookSecret = getWebhookSecret();
    const privateKey = process.env.GITHUB_APP_PRIVATE_KEY;

    return {
      configured: !!(appId && webhookSecret && privateKey),
      appId: appId || null,
      webhookUrl: `${process.env.API_URL || 'http://localhost:9001'}/api/github-app/push`,
    };
  });
}

// ============================================================================
// Installation Event Handlers
// ============================================================================

/**
 * Handles GitHub App installation event
 * Stores installation data in database and logs available repositories
 * @param installation - GitHub App installation data
 */
async function handleAppInstallation(installation: GitHubAppInstallation): Promise<void> {
  console.log(`✅ GitHub App installed for ${installation.account.login}`);
  
  // Store installation in database
  storeInstallation(installation);

  // Log available repositories
  if (installation.repositories) {
    console.log(`📦 Available repositories:`, installation.repositories.map(r => r.full_name));
  }
}

/**
 * Handles GitHub App uninstallation event
 * Removes installation data from database
 * @param installation - GitHub App installation data
 */
async function handleAppUninstallation(installation: GitHubAppInstallation): Promise<void> {
  console.log(`❌ GitHub App uninstalled for ${installation.account.login}`);
  removeInstallation(installation.installation_id);
}

/**
 * Handles repositories being added to GitHub App installation
 * @param installation - GitHub App installation data
 * @param repos - Array of added repositories
 */
async function handleRepositoriesAdded(installation: GitHubAppInstallation, repos: any[]): Promise<void> {
  console.log(`➕ Repositories added:`, repos.map(r => r.full_name));
}

/**
 * Handles repositories being removed from GitHub App installation
 * @param installation - GitHub App installation data
 * @param repos - Array of removed repositories
 */
async function handleRepositoriesRemoved(installation: GitHubAppInstallation, repos: any[]): Promise<void> {
  console.log(`➖ Repositories removed:`, repos.map(r => r.full_name));
}
