import { FastifyInstance } from 'fastify';
import path from 'path';
import fs from 'fs/promises';
import { z } from 'zod';
import { dbWrapper as db, saveDb } from '../utils/database';
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
      const user: any = request.user;
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
    const formattedPm2Info = pm2Service.formatProcessInfo(pm2Info);

    let envObj = {};
    try {
      envObj = JSON.parse(decrypt((project as any).env_vars || '{}') || '{}');
    } catch (err) {
      envObj = {};
    }

    // Get actual running port - prioritize PM2 environment, then env vars, then configured port
    // Only use actualPort if it exists and is not the NodePilot backend port (9001)
    let actualPort = null;
    if (formattedPm2Info?.actualPort && formattedPm2Info.actualPort !== '9001') {
      actualPort = formattedPm2Info.actualPort;
    } else if ((envObj as any).PORT || (envObj as any).port) {
      actualPort = (envObj as any).PORT || (envObj as any).port;
    } else {
      actualPort = (project as any).port;
    }

    return {
      ...project,
      env_vars: envObj,
      pm2Info: formattedPm2Info,
      actualPort: actualPort, // Add actual running port to response
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

      // Encrypt and update database
      const encrypted = encrypt(JSON.stringify(envVars || {}));
      db.prepare('UPDATE projects SET env_vars = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(encrypted, id);
      saveDb(); // Ensure changes are persisted

      // Build complete environment with defaults
      const fullEnv = {
        PORT: project.port?.toString() || '3000',
        NODE_ENV: 'production',
        ...(envVars || {})
      };

      // Update .env file on disk
      try {
        const envLines = Object.entries(fullEnv).map(([k, v]) => {
          const needsQuotes = typeof v === 'string' && /\s|\n|\r|\t/.test(v);
          const safeVal = (v || '').toString().replace(/"/g, '\\"');
          return `${k}=${needsQuotes ? '"' + safeVal + '"' : safeVal}`;
        }).join('\n');
        await fs.writeFile(path.join(project.path, '.env'), envLines, { mode: 0o600 });
        console.log(`✅ Updated .env file for project ${project.name}`);
      } catch (err) {
        console.warn('Failed to write .env file:', err);
      }

      // If project is running, update PM2 environment and restart
      try {
        const processInfo = await pm2Service.getProcessInfo(project.pm2_name);
        if (processInfo && processInfo.pm2_env?.status === 'online') {
          console.log(`🔄 Restarting ${project.pm2_name} to apply new environment variables...`);
          
          // Delete and restart with new env vars (restart alone won't update env)
          await pm2Service.deleteProcess(project.pm2_name);
          
          const { script, args, interpreter } = deploymentService['parseStartCommand'](project.start_command);
          
          await pm2Service.startProcess({
            name: project.pm2_name,
            script,
            args,
            interpreter,
            cwd: project.path,
            env: fullEnv,
            error_file: path.join(project.path, 'error.log'),
            out_file: path.join(project.path, 'out.log'),
          });
          
          console.log(`✅ ${project.pm2_name} restarted with updated environment`);
        }
      } catch (err) {
        console.warn('Failed to restart process with new env:', err);
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
        
        // Remove surrounding quotes
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.slice(1, -1);
        }
        
        // Skip PORT and NODE_ENV from uploaded file (we manage these)
        if (key === 'PORT' || key === 'NODE_ENV') continue;
        
        envObj[key] = val;
      }

      // Encrypt and save to database
      const encrypted = encrypt(JSON.stringify(envObj || {}));
      db.prepare('UPDATE projects SET env_vars = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(encrypted, id);
      saveDb(); // Ensure changes are persisted

      // Build complete environment with defaults
      const fullEnv = {
        PORT: project.port?.toString() || '3000',
        NODE_ENV: 'production',
        ...(envObj || {})
      };

      // Write .env file on disk
      try {
        const envLines = Object.entries(fullEnv).map(([k, v]) => {
          const needsQuotes = typeof v === 'string' && /\s|\n|\r|\t/.test(v);
          const safeVal = (v || '').toString().replace(/"/g, '\\"');
          return `${k}=${needsQuotes ? '"' + safeVal + '"' : safeVal}`;
        }).join('\n');
        await fs.writeFile(path.join(project.path, '.env'), envLines, { mode: 0o600 });
        console.log(`✅ Updated .env file from upload for project ${project.name}`);
      } catch (err) {
        console.warn('Failed to write .env file on upload:', err);
      }

      // If project is running, restart with new env vars
      try {
        const processInfo = await pm2Service.getProcessInfo(project.pm2_name);
        if (processInfo && processInfo.pm2_env?.status === 'online') {
          console.log(`🔄 Restarting ${project.pm2_name} to apply uploaded environment variables...`);
          
          // Delete and restart with new env vars
          await pm2Service.deleteProcess(project.pm2_name);
          
          const { script, args, interpreter } = deploymentService['parseStartCommand'](project.start_command);
          
          await pm2Service.startProcess({
            name: project.pm2_name,
            script,
            args,
            interpreter,
            cwd: project.path,
            env: fullEnv,
            error_file: path.join(project.path, 'error.log'),
            out_file: path.join(project.path, 'out.log'),
          });
          
          console.log(`✅ ${project.pm2_name} restarted with uploaded environment`);
        }
      } catch (err) {
        console.warn('Failed to restart process with uploaded env:', err);
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
    
    const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(id) as any;
    
    if (!project) {
      return reply.status(404).send({ error: 'Project not found' });
    }

    try {
      // Load current env vars from database
      let envObj = {};
      try {
        envObj = JSON.parse(decrypt(project.env_vars || '{}') || '{}');
      } catch (err) {
        console.warn('Failed to decrypt env vars, using empty object:', err);
        envObj = {};
      }

      // Build complete environment with defaults
      const fullEnv = {
        PORT: project.port?.toString() || '3000',
        NODE_ENV: 'production',
        ...(envObj || {})
      };

      // Update .env file with current values
      try {
        const envLines = Object.entries(fullEnv).map(([k, v]) => {
          const needsQuotes = typeof v === 'string' && /\s|\n|\r|\t/.test(v);
          const safeVal = (v || '').toString().replace(/"/g, '\\"');
          return `${k}=${needsQuotes ? '"' + safeVal + '"' : safeVal}`;
        }).join('\n');
        await fs.writeFile(path.join(project.path, '.env'), envLines, { mode: 0o600 });
      } catch (err) {
        console.warn('Failed to write .env file on restart:', err);
      }

      // Delete and restart to ensure env vars are reloaded
      await pm2Service.deleteProcess(project.pm2_name);
      
      const { script, args, interpreter } = deploymentService['parseStartCommand'](project.start_command);
      
      await pm2Service.startProcess({
        name: project.pm2_name,
        script,
        args,
        interpreter,
        cwd: project.path,
        env: fullEnv,
        error_file: path.join(project.path, 'error.log'),
        out_file: path.join(project.path, 'out.log'),
      });

      console.log(`✅ Project ${project.name} restarted with fresh environment`);
      return { success: true, message: 'Project restarted' };
    } catch (error) {
      console.error('Failed to restart project:', error);
      return reply.status(500).send({ 
        error: 'Failed to restart project',
        message: error instanceof Error ? error.message : String(error)
      });
    }
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

    try {
      // Load env vars from database
      let envObj = {};
      try {
        envObj = JSON.parse(decrypt(project.env_vars || '{}') || '{}');
      } catch (err) {
        console.warn('Failed to decrypt env vars, using empty object:', err);
        envObj = {};
      }

      // Build complete environment with defaults
      const fullEnv = {
        PORT: project.port?.toString() || '3000',
        NODE_ENV: 'production',
        ...(envObj || {})
      };

      // Write .env file
      try {
        const envLines = Object.entries(fullEnv).map(([k, v]) => {
          const needsQuotes = typeof v === 'string' && /\s|\n|\r|\t/.test(v);
          const safeVal = (v || '').toString().replace(/"/g, '\\"');
          return `${k}=${needsQuotes ? '"' + safeVal + '"' : safeVal}`;
        }).join('\n');
        await fs.writeFile(path.join(project.path, '.env'), envLines, { mode: 0o600 });
      } catch (err) {
        console.warn('Failed to write .env file for project start:', err);
      }

      const { script, args, interpreter } = deploymentService['parseStartCommand'](project.start_command);

      await pm2Service.startProcess({
        name: project.pm2_name,
        script,
        args,
        interpreter,
        cwd: project.path,
        env: fullEnv,
        error_file: path.join(project.path, 'error.log'),
        out_file: path.join(project.path, 'out.log'),
      });

      console.log(`✅ Project ${project.name} started with environment variables`);
      return { success: true, message: 'Project started' };
    } catch (error) {
      console.error('Failed to start project:', error);
      return reply.status(500).send({ 
        error: 'Failed to start project',
        message: error instanceof Error ? error.message : String(error)
      });
    }
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

    try {
      const result = await deploymentService.deleteProject(parseInt(id));
      
      if (result.markedForDeletion) {
        // Directory was locked, marked for background cleanup
        return reply.status(200).send({ 
          success: true,
          warning: true,
          message: 'Project deleted. Directory cleanup scheduled in background.',
          markedPath: result.markedForDeletion,
        });
      }
      
      return { success: true, message: 'Project deleted successfully' };
    } catch (error: any) {
      console.error('Delete project error:', error);
      
      return reply.status(500).send({ 
        error: 'Failed to delete project',
        message: error.message || String(error),
      });
    }
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

  // Add domain & setup automatic SSL via Caddy
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
      // Create Caddy config with automatic HTTPS
      const caddyServiceModule = await import('../services/caddyService');
      const caddyService = caddyServiceModule.caddyService;

      // Use project's port if defined, else default 3000
      const port = project.port || 3000;
      await caddyService.createCaddyConfig(project.name, domainClean, port, email);

      // Setup SSL - Caddy handles this automatically
      await caddyService.setupSSL(domainClean, email || null);

      // Save domain to DB (no cert paths needed - Caddy manages everything)
      await caddyService.saveDomainToDb(project.id, domain);

      return { 
        success: true, 
        message: 'Domain added with automatic SSL. Certificate will be obtained on first HTTPS request.', 
        domain 
      };
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
      // Remove Caddy config
      const caddyServiceModule = await import('../services/caddyService');
      const caddyService = caddyServiceModule.caddyService;
      await caddyService.removeCaddyConfig(project.name);
      
      // Remove from database
      await caddyService.removeDomainFromDb(domain.domain);
      
      // Reload Caddy to apply changes
      await caddyService.reloadCaddy();

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

  // Execute terminal command in project directory
  fastify.post('/:id/terminal', async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const { command, cwd } = request.body as { command: string; cwd?: string };

      if (!command || typeof command !== 'string') {
        return reply.status(400).send({ error: 'Command is required' });
      }

      const project = db.getProject(parseInt(id));
      if (!project) {
        return reply.status(404).send({ error: 'Project not found' });
      }

      const projectsDir = path.join(process.cwd(), '..', 'projects');
      const projectPath = path.join(projectsDir, project.name);
      
      // Use project path as working directory
      const workingDir = projectPath;

      // Execute command
      const { exec } = await import('child_process');
      const { promisify } = await import('util');
      const execAsync = promisify(exec);

      try {
        const { stdout, stderr } = await execAsync(command, {
          cwd: workingDir,
          timeout: 60000, // 60 second timeout
          maxBuffer: 1024 * 1024 * 10, // 10MB buffer
        });

        const output = stdout + (stderr ? `\n${stderr}` : '');
        const displayOutput = output.trim() || `✓ Command executed successfully\nCurrent directory: ${workingDir}`;
        return { success: true, output: displayOutput };
      } catch (execError: any) {
        // Command executed but returned non-zero exit code
        const errorOutput = execError.stdout + (execError.stderr ? `\n${execError.stderr}` : '');
        return reply.status(200).send({ 
          success: false, 
          output: errorOutput.trim() || execError.message 
        });
      }
    } catch (error: any) {
      console.error('Terminal command error:', error);
      return reply.status(500).send({ 
        error: error.message || 'Failed to execute command' 
      });
    }
  });
}
