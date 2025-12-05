import { FastifyInstance } from 'fastify';
import path from 'path';
import fs from 'fs/promises';
import { z } from 'zod';
import { dbWrapper as db } from '../utils/database';
import { decrypt, encrypt } from '../utils/encryption';
import { deploymentService } from '../services/deploymentService';
import { pm2Service } from '../services/pm2Service';
import { authenticate } from '../middleware/auth';

const createProjectSchema = z.object({
  projectName: z.string().min(1).max(50).regex(/^[a-zA-Z0-9-_]+$/),
  displayName: z.string().min(1).max(100),
  startCommand: z.string().min(1),
  port: z.number().optional(),
  envVars: z.record(z.string()).optional(),
});

export default async function projectRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', authenticate);

  // Create project
  fastify.post('/create', async (request, reply) => {
    try {
      const data = await request.file();
      
      if (!data) {
        return reply.status(400).send({ error: 'No file uploaded' });
      }

      // Save uploaded file
      const uploadDir = path.join(process.cwd(), 'uploads');
      await fs.mkdir(uploadDir, { recursive: true });
      
      const filename = `${Date.now()}-${data.filename}`;
      const filepath = path.join(uploadDir, filename);
      
      await fs.writeFile(filepath, await data.toBuffer());

      // Get form fields
      const fields = data.fields as any;
      const config = createProjectSchema.parse({
        projectName: fields.projectName?.value,
        displayName: fields.displayName?.value,
        startCommand: fields.startCommand?.value,
        port: fields.port ? parseInt(fields.port.value) : undefined,
        envVars: fields.envVars ? JSON.parse(fields.envVars.value) : undefined,
      });

      const project = await deploymentService.createProject({
        ...config,
        zipPath: filepath,
      });

      // Clean up uploaded file
      setTimeout(() => {
        fs.unlink(filepath).catch(console.error);
      }, 5000);

      return { success: true, project };
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({ error: 'Invalid input', details: error.errors });
      }
      console.error('Project creation error:', error);
      return reply.status(500).send({ 
        error: 'Failed to create project', 
        message: error instanceof Error ? error.message : String(error) 
      });
    }
  });

  // List all projects
  fastify.get('/list', async () => {
    const projects = db.prepare('SELECT * FROM projects ORDER BY created_at DESC').all();
    
    const processList = await pm2Service.getProcessList();
    
    const projectsWithStatus = await Promise.all(
      projects.map(async (project: any) => {
        const pm2Process = processList.find((p: any) => p.name === project.pm2_name);
        
        let envObj = {};
        try {
          envObj = JSON.parse(decrypt(project.env_vars || '{}') || '{}');
        } catch (err) {
          envObj = {};
        }
        return {
          ...project,
          env_vars: envObj,
          pm2Status: pm2Process ? {
            status: pm2Process.pm2_env?.status,
            cpu: pm2Process.monit?.cpu || 0,
            memory: pm2Process.monit?.memory || 0,
            uptime: pm2Process.pm2_env?.pm_uptime,
            restarts: pm2Process.pm2_env?.restart_time || 0,
          } : null,
        };
      })
    );

    return { projects: projectsWithStatus };
  });

  // Get project details
  fastify.get('/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    
    const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(id);
    
    if (!project) {
      return reply.status(404).send({ error: 'Project not found' });
    }

    const pm2Info = await pm2Service.getProcessInfo((project as any).pm2_name);

    let envObj = {};
    try {
      envObj = JSON.parse(decrypt((project as any).env_vars || '{}') || '{}');
    } catch (err) {
      envObj = {};
    }

    return {
      ...project,
      env_vars: envObj,
      pm2Info: pm2Service.formatProcessInfo(pm2Info),
    };
  });

  // Get project environment variables (decrypted)
  fastify.get('/:id/env', async (request, reply) => {
    const { id } = request.params as { id: string };
    const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(id) as any;
    if (!project) {
      return reply.status(404).send({ error: 'Project not found' });
    }

    let envObj = {};
    try {
      envObj = JSON.parse(decrypt(project.env_vars || '{}') || '{}');
    } catch (err) {
      envObj = {};
    }

    return { envVars: envObj };
  });

  // Update project environment variables (replace entire set)
  fastify.put('/:id/env', async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as any;
    const envVars = body.envVars || {};

    const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(id) as any;
    if (!project) {
      return reply.status(404).send({ error: 'Project not found' });
    }

    try {
      // Validate envVars is a plain object with string values
      if (typeof envVars !== 'object' || Array.isArray(envVars)) {
        return reply.status(400).send({ error: 'Invalid envVars' });
      }

      const encrypted = encrypt(JSON.stringify(envVars || {}));
      db.prepare('UPDATE projects SET env_vars = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(encrypted, id);

      // Update .env file on disk
      try {
        const envLines = Object.entries({ PORT: project.port?.toString() || '3000', NODE_ENV: 'production', ...(envVars || {}) }).map(([k, v]) => {
          const needsQuotes = typeof v === 'string' && /\s|\n|\r|\t/.test(v);
          const safeVal = (v || '').toString().replace(/"/g, '\\"');
          return `${k}=${needsQuotes ? '"' + safeVal + '"' : safeVal}`;
        }).join('\n');
        await fs.writeFile(path.join(project.path, '.env'), envLines, { mode: 0o600 });
      } catch (err) {
        // ignore disk write errors
      }

      return { success: true, envVars };
    } catch (error) {
      console.error('Failed to update env variables:', error);
      return reply.status(500).send({ error: 'Failed to update env variables' });
    }
  });

  // Download .env file generated from stored variables
  fastify.get('/:id/env/download', async (request, reply) => {
    const { id } = request.params as { id: string };
    const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(id) as any;
    if (!project) {
      return reply.status(404).send({ error: 'Project not found' });
    }

    let envObj = {};
    try {
      envObj = JSON.parse(decrypt(project.env_vars || '{}') || '{}');
    } catch (err) {
      envObj = {};
    }

    const envLines = Object.entries({ PORT: project.port?.toString() || '3000', NODE_ENV: 'production', ...(envObj || {}) }).map(([k, v]) => {
      const needsQuotes = typeof v === 'string' && /\s|\n|\r|\t/.test(v);
      const safeVal = (v || '').toString().replace(/"/g, '\\"');
      return `${k}=${needsQuotes ? '"' + safeVal + '"' : safeVal}`;
    }).join('\n');

    reply.header('Content-Type', 'text/plain');
    return envLines;
  });

  // Upload .env file to set environment variables
  fastify.post('/:id/env/upload', async (request, reply) => {
    const { id } = request.params as { id: string };
    const data = await request.file();

    if (!data) {
      return reply.status(400).send({ error: 'No file uploaded' });
    }

    const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(id) as any;
    if (!project) {
      return reply.status(404).send({ error: 'Project not found' });
    }

    try {
      const content = (await data.toBuffer()).toString('utf-8');
      const lines = content.split(/\r?\n/);
      const envObj: Record<string, string> = {};
      for (const raw of lines) {
        const line = raw.trim();
        if (!line || line.startsWith('#')) continue;
        const eq = line.indexOf('=');
        if (eq <= 0) continue;
        const key = line.slice(0, eq).trim();
        let val = line.slice(eq + 1).trim();
        // remove surrounding quotes
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.slice(1, -1);
        }
        envObj[key] = val;
      }

      const encrypted = encrypt(JSON.stringify(envObj || {}));
      db.prepare('UPDATE projects SET env_vars = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(encrypted, id);

      // Write .env file on disk
      try {
        const envLines = Object.entries({ PORT: project.port?.toString() || '3000', NODE_ENV: 'production', ...(envObj || {}) }).map(([k, v]) => {
          const needsQuotes = typeof v === 'string' && /\s|\n|\r|\t/.test(v);
          const safeVal = (v || '').toString().replace(/"/g, '\\"');
          return `${k}=${needsQuotes ? '"' + safeVal + '"' : safeVal}`;
        }).join('\n');
        await fs.writeFile(path.join(project.path, '.env'), envLines, { mode: 0o600 });
      } catch (err) {
        console.warn('Failed to write .env file on upload:', err);
      }

      return { success: true, envVars: envObj };
    } catch (error) {
      console.error('Failed to upload .env file:', error);
      return reply.status(500).send({ error: 'Failed to upload env file' });
    }
  });

  // Restart project
  fastify.post('/:id/restart', async (request, reply) => {
    const { id } = request.params as { id: string };
    
    const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(id);
    
    if (!project) {
      return reply.status(404).send({ error: 'Project not found' });
    }

    await pm2Service.restartProcess((project as any).pm2_name);

    return { success: true, message: 'Project restarted' };
  });

  // Stop project
  fastify.post('/:id/stop', async (request, reply) => {
    const { id } = request.params as { id: string };
    
    const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(id);
    
    if (!project) {
      return reply.status(404).send({ error: 'Project not found' });
    }

    await pm2Service.stopProcess((project as any).pm2_name);

    return { success: true, message: 'Project stopped' };
  });

  // Start project
  fastify.post('/:id/start', async (request, reply) => {
    const { id } = request.params as { id: string };
    
    const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(id) as any;
    
    if (!project) {
      return reply.status(404).send({ error: 'Project not found' });
    }

    const { script, args } = deploymentService['parseStartCommand'](project.start_command);

    let envObj = {};
    try {
      envObj = JSON.parse(decrypt(project.env_vars || '{}') || '{}');
    } catch (err) {
      envObj = {};
    }

    try {
      // Write .env file
      const envLines = Object.entries({ PORT: project.port?.toString() || '3000', NODE_ENV: 'production', ...(envObj || {}) }).map(([k, v]) => {
        const needsQuotes = typeof v === 'string' && /\s|\n|\r|\t/.test(v);
        const safeVal = (v || '').toString().replace(/"/g, '\\"');
        return `${k}=${needsQuotes ? '"' + safeVal + '"' : safeVal}`;
      }).join('\n');
      await fs.writeFile(path.join(project.path, '.env'), envLines, { mode: 0o600 });
    } catch (err) {
      console.warn('Failed to write .env file for project start:', err);
    }

    await pm2Service.startProcess({
      name: project.pm2_name,
      script,
      args,
      cwd: project.path,
      env: envObj,
    });

    return { success: true, message: 'Project started' };
  });

  // Redeploy project
  fastify.post('/:id/deploy', async (request, reply) => {
    const { id } = request.params as { id: string };
    const data = await request.file();
    
    if (!data) {
      return reply.status(400).send({ error: 'No file uploaded' });
    }

    const uploadDir = path.join(process.cwd(), 'uploads');
    await fs.mkdir(uploadDir, { recursive: true });
    
    const filename = `${Date.now()}-${data.filename}`;
    const filepath = path.join(uploadDir, filename);
    
    await fs.writeFile(filepath, await data.toBuffer());

    await deploymentService.redeployProject(parseInt(id), filepath);

    setTimeout(() => {
      fs.unlink(filepath).catch(console.error);
    }, 5000);

    return { success: true, message: 'Project redeployed' };
  });

  // Delete project
  fastify.delete('/:id', async (request, reply) => {
    const { id } = request.params as { id: string };

    await deploymentService.deleteProject(parseInt(id));

    return { success: true, message: 'Project deleted' };
  });

  // Get project logs
  fastify.get('/:id/logs', async (request, reply) => {
    const { id } = request.params as { id: string };
    const { lines = 100 } = request.query as { lines?: number };
    
    const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(id) as any;
    
    if (!project) {
      return reply.status(404).send({ error: 'Project not found' });
    }

    try {
      // Check both project directory and PM2 default location
      const projectOutLog = path.join(project.path, 'out.log');
      const projectErrorLog = path.join(project.path, 'error.log');
      
      // PM2 default log location on Windows
      const pm2LogDir = path.join(process.env.USERPROFILE || process.env.HOME || '', '.pm2', 'logs');
      const pm2OutLog = path.join(pm2LogDir, `${project.pm2_name}-out.log`);
      const pm2ErrorLog = path.join(pm2LogDir, `${project.pm2_name}-error.log`);

      const allLogs: Array<{ timestamp: Date; content: string; type: 'out' | 'error' }> = [];

      // Read output logs
      try {
        const outData = await fs.readFile(projectOutLog, 'utf-8');
        const outLines = outData.split('\n').filter(line => line.trim());
        outLines.forEach(line => {
          allLogs.push({ timestamp: new Date(), content: line, type: 'out' });
        });
      } catch (error) {
        try {
          const outData = await fs.readFile(pm2OutLog, 'utf-8');
          const outLines = outData.split('\n').filter(line => line.trim());
          outLines.forEach(line => {
            allLogs.push({ timestamp: new Date(), content: line, type: 'out' });
          });
        } catch (pm2Error) {
          // No output logs
        }
      }

      // Read error logs
      try {
        const errorData = await fs.readFile(projectErrorLog, 'utf-8');
        const errorLines = errorData.split('\n').filter(line => line.trim());
        errorLines.forEach(line => {
          allLogs.push({ timestamp: new Date(), content: line, type: 'error' });
        });
      } catch (error) {
        try {
          const errorData = await fs.readFile(pm2ErrorLog, 'utf-8');
          const errorLines = errorData.split('\n').filter(line => line.trim());
          errorLines.forEach(line => {
            allLogs.push({ timestamp: new Date(), content: line, type: 'error' });
          });
        } catch (pm2Error) {
          // No error logs
        }
      }

      // Sort all logs by content (PM2 logs already have timestamps in them)
      // Take last N lines
      const recentLogs = allLogs.slice(-lines);
      
      // Combine into single log output with type prefix
      const combinedLogs = recentLogs.map(log => {
        const prefix = log.type === 'error' ? '[ERROR] ' : '[OUT] ';
        return prefix + log.content;
      }).join('\n');

      return {
        combined: combinedLogs || 'No logs available yet',
        // Keep backward compatibility
        out: recentLogs.filter(l => l.type === 'out').map(l => l.content).join('\n') || 'No output logs yet',
        error: recentLogs.filter(l => l.type === 'error').map(l => l.content).join('\n') || 'No error logs',
      };
    } catch (error) {
      console.error('Error reading logs:', error);
      return reply.status(500).send({ error: 'Failed to read logs' });
    }
  });

  // Add domain & issue certificate (Certbot)
  fastify.post('/:id/domain', async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as any;
    const { domain, email } = body;

    if (!domain) {
      return reply.status(400).send({ error: 'Domain is required' });
    }

    const domainClean = domain.toString().trim().toLowerCase();
    if (!/^([a-z0-9-]+\.)+[a-z]{2,}$/.test(domainClean)) {
      return reply.status(400).send({ error: 'Invalid domain format' });
    }

    const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(id) as any;
    if (!project) {
      return reply.status(404).send({ error: 'Project not found' });
    }

    try {
      // Create nginx config
      const certServiceModule = await import('../services/certService');
      const certService = certServiceModule.certService;

      // Use project's port if defined, else default 3000
      const port = project.port || 3000;
      await certService.createNginxConfig(project.name, domainClean, port);
      await certService.reloadNginx();

      // Obtain certificate via certbot (may require root privileges)
      await certService.obtainCertificate(domainClean, email || null);

      // Parse the cert paths
      const { cert, key, expiresAt } = await certService.parseCertPaths(domainClean);

      // Save domain & cert info to DB
      await certService.saveCertToDb(project.id, domain, cert, key, expiresAt || undefined);

      // Setup auto-renew (systemd timer or cron)
      await certService.setupAutoRenew();

      return { success: true, message: 'Domain added and certificate requested', domain };
    } catch (error) {
      console.error('Failed to add domain:', error);
      return reply.status(500).send({ error: 'Failed to add domain', message: error instanceof Error ? error.message : String(error) });
    }
  });

  // List domains for project
  fastify.get('/:id/domains', async (request, reply) => {
    const { id } = request.params as { id: string };
    const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(id);
    if (!project) {
      return reply.status(404).send({ error: 'Project not found' });
    }
    const domains = db.prepare('SELECT * FROM domains WHERE project_id = ?').all(id);
    return { domains };
  });

  // Verify DNS for domain
  fastify.post('/:id/domain/:domainId/verify', async (request, reply) => {
    const { id, domainId } = request.params as { id: string; domainId: string };
    
    const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(id) as any;
    if (!project) {
      return reply.status(404).send({ error: 'Project not found' });
    }

    const domain = db.prepare('SELECT * FROM domains WHERE id = ? AND project_id = ?').get(domainId, id) as any;
    if (!domain) {
      return reply.status(404).send({ error: 'Domain not found' });
    }

    try {
      const dns = require('dns').promises;
      const os = require('os');
      
      // Get server IP
      const networkInterfaces = os.networkInterfaces();
      let serverIP = '127.0.0.1';
      
      // Try to find public IP
      for (const name of Object.keys(networkInterfaces)) {
        for (const net of networkInterfaces[name] || []) {
          if (net.family === 'IPv4' && !net.internal) {
            serverIP = net.address;
            break;
          }
        }
      }

      // Resolve domain
      const records = await dns.resolve4(domain.domain);
      
      if (!records || records.length === 0) {
        return reply.status(400).send({ 
          verified: false, 
          message: 'No DNS A records found',
          serverIP,
          resolvedIPs: []
        });
      }

      const verified = records.includes(serverIP);
      
      // Update domain verification status
      if (verified) {
        db.prepare('UPDATE domains SET verified = 1, verified_at = CURRENT_TIMESTAMP WHERE id = ?').run(domainId);
      }

      return { 
        verified, 
        message: verified ? 'DNS verified successfully' : 'DNS not pointing to this server',
        serverIP,
        resolvedIPs: records,
        expected: serverIP,
        actual: records[0]
      };
    } catch (error: any) {
      console.error('DNS verification error:', error);
      return reply.status(500).send({ 
        verified: false,
        error: 'DNS verification failed', 
        message: error.code === 'ENOTFOUND' ? 'Domain not found in DNS' : error.message 
      });
    }
  });

  // Delete domain
  fastify.delete('/:id/domain/:domainId', async (request, reply) => {
    const { id, domainId } = request.params as { id: string; domainId: string };
    
    const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(id) as any;
    if (!project) {
      return reply.status(404).send({ error: 'Project not found' });
    }

    const domain = db.prepare('SELECT * FROM domains WHERE id = ? AND project_id = ?').get(domainId, id) as any;
    if (!domain) {
      return reply.status(404).send({ error: 'Domain not found' });
    }

    try {
      // Remove from database
      db.prepare('DELETE FROM domains WHERE id = ?').run(domainId);
      
      // TODO: Remove nginx config and revoke SSL certificate if needed
      // const certServiceModule = await import('../services/certService');
      // await certServiceModule.certService.removeNginxConfig(domain.domain);

      return { success: true, message: 'Domain removed successfully' };
    } catch (error) {
      console.error('Failed to delete domain:', error);
      return reply.status(500).send({ error: 'Failed to delete domain', message: error instanceof Error ? error.message : String(error) });
    }
  });

  // Clear project logs
  fastify.post('/:id/logs/clear', async (request, reply) => {
    const { id } = request.params as { id: string };
    
    const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(id) as any;
    
    if (!project) {
      return reply.status(404).send({ error: 'Project not found' });
    }

    try {
      const outLog = path.join(project.path, 'out.log');
      const errorLog = path.join(project.path, 'error.log');

      // Clear log files
      await fs.writeFile(outLog, '').catch(() => {});
      await fs.writeFile(errorLog, '').catch(() => {});

      return { success: true, message: 'Logs cleared' };
    } catch (error) {
      return reply.status(500).send({ error: 'Failed to clear logs' });
    }
  });

  // WebSocket for real-time logs
  (fastify as any).get('/:id/logs/stream', { websocket: true }, (connection: any, request: any) => {
    const { id } = request.params as { id: string };
    
    const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(id) as any;
    
    if (!project) {
      connection.socket.send(JSON.stringify({ error: 'Project not found' }));
      connection.socket.close();
      return;
    }

    const outLog = path.join(project.path, 'out.log');
    
    // Send initial logs
    fs.readFile(outLog, 'utf-8')
      .then(data => {
        const lines = data.split('\n').slice(-50);
        connection.socket.send(JSON.stringify({ type: 'initial', data: lines.join('\n') }));
      })
      .catch(() => {
        connection.socket.send(JSON.stringify({ type: 'initial', data: 'No logs available' }));
      });

    // Watch for new logs (simplified)
    const interval = setInterval(async () => {
      try {
        const data = await fs.readFile(outLog, 'utf-8');
        const lines = data.split('\n').slice(-10);
        connection.socket.send(JSON.stringify({ type: 'update', data: lines.join('\n') }));
      } catch (error) {
        // Ignore errors
      }
    }, 2000);

    connection.socket.on('close', () => {
      clearInterval(interval);
    });
  });

  // Get deployment history
  fastify.get('/:id/deployments', async (request, reply) => {
    const { id } = request.params as { id: string };
    const projectId = parseInt(id);
    const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId);
    if (!project) {
      return reply.status(404).send({ error: 'Project not found' });
    }
    const deployments = db
      .prepare('SELECT * FROM deployments WHERE project_id = ? ORDER BY deployed_at DESC LIMIT 20')
      .all(projectId);
    try { console.log(`GET /project/${projectId}/deployments -> found ${deployments.length} deployments`); } catch (e) {}
    return { deployments };
  });

  // Rollback to a previous deployment version
  fastify.post('/:id/rollback', async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as any;
    const { deploymentId, version } = body;

    const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(id) as any;
    if (!project) {
      return reply.status(404).send({ error: 'Project not found' });
    }

    try {
      await deploymentService.rollbackToDeployment(parseInt(id), deploymentId ? parseInt(deploymentId) : undefined, version || undefined);
      return { success: true, message: 'Rollback initiated' };
    } catch (error) {
      console.error('Rollback failed:', error);
      return reply.status(500).send({ error: 'Rollback failed', message: error instanceof Error ? error.message : String(error) });
    }
  });

  // File Editor APIs
  
  // Get file tree
  fastify.get('/:id/files', async (request, reply) => {
    const { id } = request.params as { id: string };
    const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(id) as any;
    
    if (!project) {
      return reply.status(404).send({ error: 'Project not found' });
    }

    try {
      const buildFileTree = async (dirPath: string, relativePath = ''): Promise<any[]> => {
        const entries = await fs.readdir(dirPath, { withFileTypes: true });
        const files: any[] = [];

        for (const entry of entries) {
          // Skip node_modules, .git, and hidden files
          if (entry.name === 'node_modules' || entry.name === '.git' || entry.name.startsWith('.')) {
            continue;
          }

          const fullPath = path.join(dirPath, entry.name);
          const relPath = relativePath ? `${relativePath}/${entry.name}` : entry.name;

          if (entry.isDirectory()) {
            const children = await buildFileTree(fullPath, relPath);
            files.push({
              name: entry.name,
              path: relPath,
              type: 'directory',
              children,
              expanded: false,
            });
          } else {
            files.push({
              name: entry.name,
              path: relPath,
              type: 'file',
            });
          }
        }

        return files.sort((a, b) => {
          if (a.type === 'directory' && b.type !== 'directory') return -1;
          if (a.type !== 'directory' && b.type === 'directory') return 1;
          return a.name.localeCompare(b.name);
        });
      };

      const files = await buildFileTree(project.path);
      return { files };
    } catch (error) {
      console.error('Failed to read file tree:', error);
      return reply.status(500).send({ error: 'Failed to read file tree' });
    }
  });

  // Get file content
  fastify.get('/:id/files/content', async (request, reply) => {
    const { id } = request.params as { id: string };
    const { path: filePath } = request.query as { path: string };
    
    const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(id) as any;
    if (!project) {
      return reply.status(404).send({ error: 'Project not found' });
    }

    try {
      const fullPath = path.join(project.path, filePath);
      
      // Security check: ensure path is within project directory
      const resolvedPath = path.resolve(fullPath);
      const projectPath = path.resolve(project.path);
      if (!resolvedPath.startsWith(projectPath)) {
        return reply.status(403).send({ error: 'Access denied' });
      }

      const content = await fs.readFile(fullPath, 'utf-8');
      return { content, path: filePath };
    } catch (error) {
      console.error('Failed to read file:', error);
      return reply.status(500).send({ error: 'Failed to read file' });
    }
  });

  // Save file content
  fastify.post('/:id/files/save', async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as { path: string; content: string };
    
    const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(id) as any;
    if (!project) {
      return reply.status(404).send({ error: 'Project not found' });
    }

    try {
      const fullPath = path.join(project.path, body.path);
      
      // Security check
      const resolvedPath = path.resolve(fullPath);
      const projectPath = path.resolve(project.path);
      if (!resolvedPath.startsWith(projectPath)) {
        return reply.status(403).send({ error: 'Access denied' });
      }

      await fs.writeFile(fullPath, body.content, 'utf-8');
      return { success: true, message: 'File saved successfully' };
    } catch (error) {
      console.error('Failed to save file:', error);
      return reply.status(500).send({ error: 'Failed to save file' });
    }
  });

  // Create file or folder
  fastify.post('/:id/files/create', async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as { path: string; type: 'file' | 'directory' };
    
    const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(id) as any;
    if (!project) {
      return reply.status(404).send({ error: 'Project not found' });
    }

    try {
      const fullPath = path.join(project.path, body.path);
      
      // Security check
      const resolvedPath = path.resolve(fullPath);
      const projectPath = path.resolve(project.path);
      if (!resolvedPath.startsWith(projectPath)) {
        return reply.status(403).send({ error: 'Access denied' });
      }

      if (body.type === 'directory') {
        await fs.mkdir(fullPath, { recursive: true });
      } else {
        await fs.writeFile(fullPath, '', 'utf-8');
      }

      return { success: true, message: `${body.type === 'directory' ? 'Folder' : 'File'} created successfully` };
    } catch (error) {
      console.error('Failed to create:', error);
      return reply.status(500).send({ error: 'Failed to create item' });
    }
  });

  // Delete file or folder
  fastify.delete('/:id/files', async (request, reply) => {
    const { id } = request.params as { id: string };
    const { path: filePath } = request.query as { path: string };
    
    const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(id) as any;
    if (!project) {
      return reply.status(404).send({ error: 'Project not found' });
    }

    try {
      const fullPath = path.join(project.path, filePath);
      
      // Security check
      const resolvedPath = path.resolve(fullPath);
      const projectPath = path.resolve(project.path);
      if (!resolvedPath.startsWith(projectPath)) {
        return reply.status(403).send({ error: 'Access denied' });
      }

      const stat = await fs.stat(fullPath);
      if (stat.isDirectory()) {
        await fs.rm(fullPath, { recursive: true, force: true });
      } else {
        await fs.unlink(fullPath);
      }

      return { success: true, message: 'Deleted successfully' };
    } catch (error) {
      console.error('Failed to delete:', error);
      return reply.status(500).send({ error: 'Failed to delete item' });
    }
  });
}
