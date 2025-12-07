import { FastifyInstance } from 'fastify';
import crypto from 'crypto';
import { dbWrapper as db } from '../utils/database';
import { deploymentService } from '../services/deploymentService';

/**
 * GitHub App Integration
 * Automatically installs webhooks when app is installed on repository
 */

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

export default async function githubAppRoutes(fastify: FastifyInstance) {
  
  /**
   * GitHub App Installation Webhook
   * Triggered when user installs GitHub App
   */
  fastify.post('/github-app/installation', async (request, reply) => {
    try {
      // Verify GitHub webhook signature
      const signature = request.headers['x-hub-signature-256'] as string;
      const webhookSecret = process.env.GITHUB_APP_WEBHOOK_SECRET;
      
      if (!webhookSecret) {
        console.warn('⚠️  GitHub App webhook secret not configured');
        return reply.status(500).send({ error: 'Webhook secret not configured' });
      }

      // Verify signature
      const payload = JSON.stringify(request.body);
      const hmac = crypto.createHmac('sha256', webhookSecret);
      const digest = 'sha256=' + hmac.update(payload).digest('hex');
      
      if (signature !== digest) {
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

      switch (action) {
        case 'created':
          // App installed - automatically setup webhooks for all repos
          await handleAppInstallation(installation);
          break;
          
        case 'deleted':
          // App uninstalled - cleanup
          await handleAppUninstallation(installation);
          break;
          
        case 'added':
          // Repositories added
          if (body.repositories_added) {
            await handleRepositoriesAdded(installation, body.repositories_added);
          }
          break;
          
        case 'removed':
          // Repositories removed
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
   * GitHub App Push Event
   * Auto-triggered when code is pushed (no manual webhook setup needed!)
   */
  fastify.post('/github-app/push', async (request, reply) => {
    try {
      // Verify signature
      const signature = request.headers['x-hub-signature-256'] as string;
      const webhookSecret = process.env.GITHUB_APP_WEBHOOK_SECRET;
      
      if (!webhookSecret) {
        return reply.status(500).send({ error: 'Webhook secret not configured' });
      }

      const payload = JSON.stringify(request.body);
      const hmac = crypto.createHmac('sha256', webhookSecret);
      const digest = 'sha256=' + hmac.update(payload).digest('hex');
      
      if (signature !== digest) {
        return reply.status(401).send({ error: 'Invalid signature' });
      }

      const body = request.body as any;
      const repoFullName = body.repository?.full_name;
      const branch = body.ref?.replace('refs/heads/', '');
      const installationId = body.installation?.id;

      console.log(`🔔 GitHub App push event:`, {
        repo: repoFullName,
        branch,
        commits: body.commits?.length || 0,
        pusher: body.pusher?.name,
      });

      // Find projects using this repository
      const projects = db.prepare(`
        SELECT * FROM projects 
        WHERE git_url LIKE ? AND git_branch = ? AND deploy_method = 'git'
      `).all(`%${repoFullName}%`, branch);

      if (projects.length === 0) {
        console.log(`ℹ️  No projects found for ${repoFullName} on branch ${branch}`);
        return { success: true, message: 'No matching projects' };
      }

      console.log(`✅ Found ${projects.length} project(s) to deploy`);

      // Trigger deployment for each project
      for (const project of projects as any[]) {
        console.log(`🚀 Triggering deployment for project: ${project.name}`);
        
        // Update status
        db.prepare('UPDATE projects SET status = ? WHERE id = ?').run('deploying', project.id);
        
        // Deploy asynchronously
        (async () => {
          try {
            await deploymentService.redeployGitProject(project.id);
            db.prepare('UPDATE projects SET status = ? WHERE id = ?').run('running', project.id);
            console.log(`✅ Deployment completed for ${project.name}`);
          } catch (error: any) {
            console.error(`❌ Deployment failed for ${project.name}:`, error.message);
            db.prepare('UPDATE projects SET status = ? WHERE id = ?').run('error', project.id);
          }
        })();
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
   * GitHub App Status
   * Check if GitHub App is configured
   */
  fastify.get('/github-app/status', async (request, reply) => {
    const appId = process.env.GITHUB_APP_ID;
    const webhookSecret = process.env.GITHUB_APP_WEBHOOK_SECRET;
    const privateKey = process.env.GITHUB_APP_PRIVATE_KEY;

    return {
      configured: !!(appId && webhookSecret && privateKey),
      appId: appId || null,
      webhookUrl: `${process.env.API_URL || 'http://localhost:9001'}/api/github-app/push`,
    };
  });
}

/**
 * Handle GitHub App installation
 */
async function handleAppInstallation(installation: GitHubAppInstallation) {
  console.log(`✅ GitHub App installed for ${installation.account.login}`);
  
  // Store installation in database
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

  // Log available repositories
  if (installation.repositories) {
    console.log(`📦 Available repositories:`, installation.repositories.map(r => r.full_name));
  }
}

/**
 * Handle GitHub App uninstallation
 */
async function handleAppUninstallation(installation: GitHubAppInstallation) {
  console.log(`❌ GitHub App uninstalled for ${installation.account.login}`);
  
  try {
    db.prepare('DELETE FROM github_installations WHERE installation_id = ?')
      .run(installation.installation_id);
    
    console.log(`✅ Removed installation ${installation.installation_id}`);
  } catch (error) {
    console.warn('⚠️  Failed to remove installation:', error);
  }
}

/**
 * Handle repositories added to GitHub App
 */
async function handleRepositoriesAdded(installation: GitHubAppInstallation, repos: any[]) {
  console.log(`➕ Repositories added:`, repos.map(r => r.full_name));
}

/**
 * Handle repositories removed from GitHub App
 */
async function handleRepositoriesRemoved(installation: GitHubAppInstallation, repos: any[]) {
  console.log(`➖ Repositories removed:`, repos.map(r => r.full_name));
}
