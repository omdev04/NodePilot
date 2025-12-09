import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import path from 'path';
import fs from 'fs/promises';
import { z } from 'zod';
import { dbWrapper as db, saveDb } from '../utils/database';
import { decrypt, encrypt } from '../utils/encryption';
import { deploymentService } from '../services/deploymentService';
import { pm2Service } from '../services/pm2Service';
import { authenticate } from '../middleware/auth';

/**
 * Projects Routes Module
 * Handles project lifecycle management including creation, deployment, monitoring,
 * environment variables, logs, domains, file editing, and terminal operations
 */

// ============================================================================
// Schema Definitions
// ============================================================================

const createProjectSchema = z.object({
  projectName: z.string().min(1).max(50).regex(/^[a-zA-Z0-9-_]+$/),
  displayName: z.string().min(1).max(100),
  startCommand: z.string().min(1),
  port: z.number().optional(),
  envVars: z.record(z.string()).optional(),
});

// ============================================================================
// Helper Functions - Database Operations
// ============================================================================

/**
 * Retrieves a project by ID from database
 * @param projectId - Project ID
 * @returns Project record or undefined
 */
function getProjectById(projectId: string): any {
  return db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId);
}

/**
 * Retrieves all projects ordered by creation date
 * @returns Array of all projects
 */
function getAllProjects(): any[] {
  return db.prepare('SELECT * FROM projects ORDER BY created_at DESC').all();
}

/**
 * Retrieves domains for a specific project
 * @param projectId - Project ID
 * @returns Array of domains
 */
function getProjectDomains(projectId: string): any[] {
  return db.prepare('SELECT * FROM domains WHERE project_id = ?').all(projectId);
}

/**
 * Retrieves a specific domain for a project
 * @param domainId - Domain ID
 * @param projectId - Project ID
 * @returns Domain record or undefined
 */
function getDomainById(domainId: string, projectId: string): any {
  return db.prepare('SELECT * FROM domains WHERE id = ? AND project_id = ?').get(domainId, projectId);
}

/**
 * Updates domain verification status
 * @param domainId - Domain ID
 */
function markDomainAsVerified(domainId: string): void {
  db.prepare('UPDATE domains SET verified = 1, verified_at = CURRENT_TIMESTAMP WHERE id = ?').run(domainId);
}

/**
 * Retrieves deployment history for a project
 * @param projectId - Project ID
 * @param limit - Maximum number of deployments to retrieve
 * @returns Array of deployments
 */
function getDeploymentHistory(projectId: number, limit: number = 20): any[] {
  return db.prepare('SELECT * FROM deployments WHERE project_id = ? ORDER BY deployed_at DESC LIMIT ?')
    .all(projectId, limit);
}

// ============================================================================
// Helper Functions - Environment Variables
// ============================================================================

/**
 * Decrypts and parses environment variables from database
 * @param encryptedEnvVars - Encrypted environment variables string
 * @returns Parsed environment variables object
 */
function decryptEnvVars(encryptedEnvVars: string): Record<string, string> {
  try {
    return JSON.parse(decrypt(encryptedEnvVars || '{}') || '{}');
  } catch (err) {
    return {};
  }
}

/**
 * Builds complete environment with defaults
 * @param port - Project port
 * @param envVars - User-defined environment variables
 * @returns Complete environment object
 */
function buildCompleteEnv(port: number | undefined, envVars: Record<string, string>): Record<string, string> {
  return {
    PORT: port?.toString() || '3000',
    NODE_ENV: 'production',
    ...envVars,
  };
}

/**
 * Formats environment variables as .env file content
 * @param envVars - Environment variables object
 * @returns Formatted .env file content
 */
function formatEnvFile(envVars: Record<string, string>): string {
  return Object.entries(envVars).map(([k, v]) => {
    const needsQuotes = typeof v === 'string' && /\s|\n|\r|\t/.test(v);
    const safeVal = (v || '').toString().replace(/"/g, '\\"');
    return `${k}=${needsQuotes ? '"' + safeVal + '"' : safeVal}`;
  }).join('\n');
}

/**
 * Parses .env file content into object
 * @param content - .env file content
 * @returns Parsed environment variables object
 */
function parseEnvFile(content: string): Record<string, string> {
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
    
    // Skip PORT and NODE_ENV (we manage these)
    if (key === 'PORT' || key === 'NODE_ENV') continue;
    
    envObj[key] = val;
  }
  
  return envObj;
}

/**
 * Writes .env file to project directory
 * @param projectPath - Project directory path
 * @param envVars - Environment variables to write
 */
async function writeEnvFile(projectPath: string, envVars: Record<string, string>): Promise<void> {
  try {
    const envContent = formatEnvFile(envVars);
    await fs.writeFile(path.join(projectPath, '.env'), envContent, { mode: 0o600 });
  } catch (err) {
    console.warn('Failed to write .env file:', err);
  }
}

/**
 * Updates environment variables in database
 * @param projectId - Project ID
 * @param envVars - Environment variables to save
 */
function saveEnvVarsToDb(projectId: string, envVars: Record<string, string>): void {
  const encrypted = encrypt(JSON.stringify(envVars || {}));
  db.prepare('UPDATE projects SET env_vars = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(encrypted, projectId);
  saveDb();
}

// ============================================================================
// Helper Functions - PM2 Operations
// ============================================================================

/**
 * Restarts a PM2 process with new environment variables
 * @param project - Project record
 * @param envVars - Complete environment variables
 */
async function restartProjectWithEnv(project: any, envVars: Record<string, string>): Promise<void> {
  try {
    const processInfo = await pm2Service.getProcessInfo(project.pm2_name);
    if (processInfo && processInfo.pm2_env?.status === 'online') {
      console.log(`🔄 Restarting ${project.pm2_name} to apply new environment variables...`);
      
      await pm2Service.deleteProcess(project.pm2_name);
      
      const { script, args, interpreter } = deploymentService['parseStartCommand'](project.start_command);
      
      await pm2Service.startProcess({
        name: project.pm2_name,
        script,
        args,
        interpreter,
        cwd: project.path,
        env: envVars,
        error_file: path.join(project.path, 'error.log'),
        out_file: path.join(project.path, 'out.log'),
      });
      
      console.log(`✅ ${project.pm2_name} restarted with updated environment`);
    }
  } catch (err) {
    console.warn('Failed to restart process with new env:', err);
  }
}

/**
 * Starts a PM2 process with environment variables
 * @param project - Project record
 * @param envVars - Complete environment variables
 */
async function startProjectProcess(project: any, envVars: Record<string, string>): Promise<void> {
  const { script, args, interpreter } = deploymentService['parseStartCommand'](project.start_command);
  
  await pm2Service.startProcess({
    name: project.pm2_name,
    script,
    args,
    interpreter,
    cwd: project.path,
    env: envVars,
    error_file: path.join(project.path, 'error.log'),
    out_file: path.join(project.path, 'out.log'),
  });
}

/**
 * Gets actual running port from PM2 info or environment
 * @param pm2Info - Formatted PM2 info
 * @param envObj - Environment variables
 * @param configuredPort - Configured port from project
 * @returns Actual running port
 */
function getActualPort(pm2Info: any, envObj: any, configuredPort: number): string | number | null {
  if (pm2Info?.actualPort && pm2Info.actualPort !== '9001') {
    return pm2Info.actualPort;
  } else if (envObj.PORT || envObj.port) {
    return envObj.PORT || envObj.port;
  }
  return configuredPort;
}

// ============================================================================
// Helper Functions - File Operations
// ============================================================================

/**
 * Validates if a file path is within project directory (security check)
 * @param fullPath - Full file path
 * @param projectPath - Project directory path
 * @returns True if path is valid
 */
function isPathSecure(fullPath: string, projectPath: string): boolean {
  const resolvedPath = path.resolve(fullPath);
  const resolvedProjectPath = path.resolve(projectPath);
  return resolvedPath.startsWith(resolvedProjectPath);
}

/**
 * Builds a file tree structure for a directory
 * @param dirPath - Directory path
 * @param relativePath - Relative path for tree structure
 * @returns Array of file tree nodes
 */
async function buildFileTree(dirPath: string, relativePath: string = ''): Promise<any[]> {
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
}

// ============================================================================
// Helper Functions - Logs
// ============================================================================

/**
 * Reads project logs from multiple locations
 * @param project - Project record
 * @param lines - Number of lines to retrieve
 * @returns Combined log output
 */
async function readProjectLogs(project: any, lines: number): Promise<{ combined: string; out: string; error: string }> {
  const projectOutLog = path.join(project.path, 'out.log');
  const projectErrorLog = path.join(project.path, 'error.log');
  
  const pm2LogDir = path.join(process.env.USERPROFILE || process.env.HOME || '', '.pm2', 'logs');
  const pm2OutLog = path.join(pm2LogDir, `${project.pm2_name}-out.log`);
  const pm2ErrorLog = path.join(pm2LogDir, `${project.pm2_name}-error.log`);

  const allLogs: Array<{ timestamp: Date; content: string; type: 'out' | 'error' }> = [];

  // Read output logs
  try {
    const outData = await fs.readFile(projectOutLog, 'utf-8');
    outData.split('\n').filter(line => line.trim()).forEach(line => {
      allLogs.push({ timestamp: new Date(), content: line, type: 'out' });
    });
  } catch (error) {
    try {
      const outData = await fs.readFile(pm2OutLog, 'utf-8');
      outData.split('\n').filter(line => line.trim()).forEach(line => {
        allLogs.push({ timestamp: new Date(), content: line, type: 'out' });
      });
    } catch (pm2Error) {
      // No output logs
    }
  }

  // Read error logs
  try {
    const errorData = await fs.readFile(projectErrorLog, 'utf-8');
    errorData.split('\n').filter(line => line.trim()).forEach(line => {
      allLogs.push({ timestamp: new Date(), content: line, type: 'error' });
    });
  } catch (error) {
    try {
      const errorData = await fs.readFile(pm2ErrorLog, 'utf-8');
      errorData.split('\n').filter(line => line.trim()).forEach(line => {
        allLogs.push({ timestamp: new Date(), content: line, type: 'error' });
      });
    } catch (pm2Error) {
      // No error logs
    }
  }

  const recentLogs = allLogs.slice(-lines);
  const combinedLogs = recentLogs.map(log => {
    const prefix = log.type === 'error' ? '[ERROR] ' : '[OUT] ';
    return prefix + log.content;
  }).join('\n');

  return {
    combined: combinedLogs || 'No logs available yet',
    out: recentLogs.filter(l => l.type === 'out').map(l => l.content).join('\n') || 'No output logs yet',
    error: recentLogs.filter(l => l.type === 'error').map(l => l.content).join('\n') || 'No error logs',
  };
}

// ============================================================================
// Helper Functions - Domains & DNS
// ============================================================================

/**
 * Validates domain format
 * @param domain - Domain name
 * @returns True if valid
 */
function isValidDomain(domain: string): boolean {
  return /^([a-z0-9-]+\.)+[a-z]{2,}$/.test(domain);
}

/**
 * Gets server IP address from network interfaces
 * @returns Server IP address
 */
function getServerIP(): string {
  const os = require('os');
  const networkInterfaces = os.networkInterfaces();
  let serverIP = '127.0.0.1';
  
  for (const name of Object.keys(networkInterfaces)) {
    for (const net of networkInterfaces[name] || []) {
      if (net.family === 'IPv4' && !net.internal) {
        serverIP = net.address;
        break;
      }
    }
  }
  
  return serverIP;
}

// ============================================================================
// Route Handlers
// ============================================================================

/**
 * Project routes registration
 * All routes require authentication
 */
export default async function projectRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', authenticate);

  /**
   * POST /create
   * Creates a new project from uploaded ZIP file
   * @returns Created project details
   */
  fastify.post('/create', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user: any = request.user;
      const data = await request.file();
      
      if (!data) {
        return reply.status(400).send({ error: 'No file uploaded' });
      }

      // Save uploaded file temporarily
      const uploadDir = path.join(process.cwd(), 'uploads');
      await fs.mkdir(uploadDir, { recursive: true });
      
      const filename = `${Date.now()}-${data.filename}`;
      const filepath = path.join(uploadDir, filename);
      
      await fs.writeFile(filepath, await data.toBuffer());

      // Parse and validate form fields
      const fields = data.fields as any;
      const config = createProjectSchema.parse({
        projectName: fields.projectName?.value,
        displayName: fields.displayName?.value,
        startCommand: fields.startCommand?.value,
        port: fields.port ? parseInt(fields.port.value) : undefined,
        envVars: fields.envVars ? JSON.parse(fields.envVars.value) : undefined,
      });

      // Create project via deployment service
      const project = await deploymentService.createProject({
        ...config,
        zipPath: filepath,
      });

      // Clean up uploaded file after 5 seconds
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

  /**
   * GET /list
   * Lists all projects with their PM2 process status
   * @returns Array of projects with status information
   */
  fastify.get('/list', async (request: FastifyRequest) => {
    const projects = getAllProjects();
    const processList = await pm2Service.getProcessList();
    
    const projectsWithStatus = await Promise.all(
      projects.map(async (project: any) => {
        const pm2Process = processList.find((p: any) => p.name === project.pm2_name);
        const envObj = decryptEnvVars(project.env_vars);
        
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

  /**
   * GET /:id
   * Retrieves detailed information for a specific project
   * @returns Project details with PM2 status and actual port
   */
  fastify.get('/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    
    const project = getProjectById(id);
    
    if (!project) {
      return reply.status(404).send({ error: 'Project not found' });
    }

    const pm2Info = await pm2Service.getProcessInfo(project.pm2_name);
    const formattedPm2Info = pm2Service.formatProcessInfo(pm2Info);
    const envObj = decryptEnvVars(project.env_vars);

    // Determine actual running port (PM2 env > env vars > configured)
    const actualPort = getActualPort(formattedPm2Info, envObj, project.port);

    return {
      ...project,
      env_vars: envObj,
      pm2Info: formattedPm2Info,
      actualPort,
    };
  });

  /**
   * GET /:id/env
   * Retrieves decrypted environment variables for a project
   * @returns Environment variables object
   */
  fastify.get('/:id/env', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const project = getProjectById(id);
    
    if (!project) {
      return reply.status(404).send({ error: 'Project not found' });
    }

    const envObj = decryptEnvVars(project.env_vars);
    return { envVars: envObj };
  });

  /**
   * PUT /:id/env
   * Updates project environment variables and restarts if running
   * @returns Success status with updated variables
   */
  fastify.put('/:id/env', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const body = request.body as any;
    const envVars = body.envVars || {};

    const project = getProjectById(id);
    if (!project) {
      return reply.status(404).send({ error: 'Project not found' });
    }

    try {
      // Validate input
      if (typeof envVars !== 'object' || Array.isArray(envVars)) {
        return reply.status(400).send({ error: 'Invalid envVars' });
      }

      // Save to database
      saveEnvVarsToDb(id, envVars);

      // Build complete environment with defaults
      const fullEnv = buildCompleteEnv(project.port, envVars);

      // Update .env file on disk
      await writeEnvFile(project.path, fullEnv);
      console.log(`✅ Updated .env file for project ${project.name}`);

      // Restart if currently running
      await restartProjectWithEnv(project, fullEnv);

      return { success: true, envVars };
    } catch (error) {
      console.error('Failed to update env variables:', error);
      return reply.status(500).send({ error: 'Failed to update env variables' });
    }
  });

  /**
   * GET /:id/env/download
   * Downloads .env file with all environment variables
   * @returns Plain text .env file content
   */
  fastify.get('/:id/env/download', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const project = getProjectById(id);
    
    if (!project) {
      return reply.status(404).send({ error: 'Project not found' });
    }

    const envObj = decryptEnvVars(project.env_vars);
    const fullEnv = buildCompleteEnv(project.port, envObj);
    const envContent = formatEnvFile(fullEnv);

    reply.header('Content-Type', 'text/plain');
    return envContent;
  });

  /**
   * POST /:id/env/upload
   * Uploads and parses .env file to set environment variables
   * @returns Success status with parsed variables
   */
  fastify.post('/:id/env/upload', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const data = await request.file();

    if (!data) {
      return reply.status(400).send({ error: 'No file uploaded' });
    }

    const project = getProjectById(id);
    if (!project) {
      return reply.status(404).send({ error: 'Project not found' });
    }

    try {
      // Parse uploaded .env file
      const content = (await data.toBuffer()).toString('utf-8');
      const envObj = parseEnvFile(content);

      // Save to database
      saveEnvVarsToDb(id, envObj);

      // Build complete environment with defaults
      const fullEnv = buildCompleteEnv(project.port, envObj);

      // Write .env file on disk
      await writeEnvFile(project.path, fullEnv);
      console.log(`✅ Updated .env file from upload for project ${project.name}`);

      // Restart if currently running
      await restartProjectWithEnv(project, fullEnv);

      return { success: true, envVars: envObj };
    } catch (error) {
      console.error('Failed to upload .env file:', error);
      return reply.status(500).send({ error: 'Failed to upload env file' });
    }
  });

  /**
   * POST /:id/restart
   * Restarts a running project with fresh environment variables
   * @returns Success status message
   */
  fastify.post('/:id/restart', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    
    const project = getProjectById(id);
    
    if (!project) {
      return reply.status(404).send({ error: 'Project not found' });
    }

    try {
      // Load and build environment
      const envObj = decryptEnvVars(project.env_vars);
      const fullEnv = buildCompleteEnv(project.port, envObj);

      // Update .env file with current values
      await writeEnvFile(project.path, fullEnv);

      // Delete and restart to ensure env vars are reloaded
      await restartProjectWithEnv(project, fullEnv);

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

  /**
   * POST /:id/stop
   * Stops a running project process
   * @returns Success status message
   */
  fastify.post('/:id/stop', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    
    const project = getProjectById(id);
    
    if (!project) {
      return reply.status(404).send({ error: 'Project not found' });
    }

    await pm2Service.stopProcess(project.pm2_name);

    return { success: true, message: 'Project stopped' };
  });

  /**
   * POST /:id/start
   * Starts a stopped project process with environment variables
   * @returns Success status message
   */
  fastify.post('/:id/start', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    
    const project = getProjectById(id);
    
    if (!project) {
      return reply.status(404).send({ error: 'Project not found' });
    }

    try {
      // Load and build environment
      const envObj = decryptEnvVars(project.env_vars);
      const fullEnv = buildCompleteEnv(project.port, envObj);

      // Write .env file
      await writeEnvFile(project.path, fullEnv);

      // Start process
      await startProjectProcess(project, fullEnv);

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

  /**
   * POST /:id/deploy
   * Redeploys a project from an uploaded ZIP file
   * @returns Success status message
   */
  fastify.post('/:id/deploy', async (request: FastifyRequest, reply: FastifyReply) => {
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

    // Clean up uploaded file after 5 seconds
    setTimeout(() => {
      fs.unlink(filepath).catch(console.error);
    }, 5000);

    return { success: true, message: 'Project redeployed' };
  });

  /**
   * DELETE /:id
   * Deletes a project and all associated resources
   * @returns Success status with deletion information
   */
  fastify.delete('/:id', async (request: FastifyRequest, reply: FastifyReply) => {
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

  /**
   * GET /:id/logs
   * Retrieves project logs from output and error files
   * @returns Combined and separated logs with specified line limit
   */
  fastify.get('/:id/logs', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const query = request.query as any;
    const maxLines = query.lines ? parseInt(query.lines) : 100;
    
    const project = getProjectById(id);
    
    if (!project) {
      return reply.status(404).send({ error: 'Project not found' });
    }

    try {
      const logs = await readProjectLogs(project, maxLines);
      
      return {
        combined: logs.combined || 'No logs available yet',
        out: logs.out || 'No output logs yet',
        error: logs.error || 'No error logs',
      };
    } catch (error) {
      console.error('Error reading logs:', error);
      return reply.status(500).send({ error: 'Failed to read logs' });
    }
  });

  /**
   * POST /:id/domain
   * Adds a custom domain with automatic SSL via Caddy
   * @returns Success status with domain information
   */
  fastify.post('/:id/domain', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const body = request.body as any;
    const { domain, email } = body;

    if (!domain) {
      return reply.status(400).send({ error: 'Domain is required' });
    }

    const domainClean = domain.toString().trim().toLowerCase();
    if (!isValidDomain(domainClean)) {
      return reply.status(400).send({ error: 'Invalid domain format' });
    }

    const project = getProjectById(id);
    if (!project) {
      return reply.status(404).send({ error: 'Project not found' });
    }

    try {
      // Create Caddy config with automatic HTTPS
      const caddyServiceModule = await import('../services/caddyService');
      const caddyService = caddyServiceModule.caddyService;

      const port = project.port || 3000;
      await caddyService.createCaddyConfig(project.name, domainClean, port, email);
      await caddyService.setupSSL(domainClean, email || null);
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

  /**
   * GET /:id/domains
   * Lists all domains configured for a project
   * @returns Array of domains with configuration
   */
  fastify.get('/:id/domains', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const project = getProjectById(id);
    
    if (!project) {
      return reply.status(404).send({ error: 'Project not found' });
    }
    
    const domains = getProjectDomains(id);
    return { domains };
  });

  /**
   * POST /:id/domain/:domainId/verify
   * Verifies DNS records point to this server
   * @returns Verification status with DNS details
   */
  fastify.post('/:id/domain/:domainId/verify', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id, domainId } = request.params as { id: string; domainId: string };
    
    const project = getProjectById(id);
    if (!project) {
      return reply.status(404).send({ error: 'Project not found' });
    }

    const domain = getDomainById(domainId, id);
    if (!domain) {
      return reply.status(404).send({ error: 'Domain not found' });
    }

    try {
      const dns = require('dns').promises;
      const serverIP = getServerIP();

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
      
      // Update verification status
      if (verified) {
        markDomainAsVerified(domainId);
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

  /**
   * DELETE /:id/domain/:domainId
   * Removes a domain and its Caddy configuration
   * @returns Success status message
   */
  fastify.delete('/:id/domain/:domainId', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id, domainId } = request.params as { id: string; domainId: string };
    
    const project = getProjectById(id);
    if (!project) {
      return reply.status(404).send({ error: 'Project not found' });
    }

    const domain = getDomainById(domainId, id);
    if (!domain) {
      return reply.status(404).send({ error: 'Domain not found' });
    }

    try {
      // Remove Caddy config and database entry
      const caddyServiceModule = await import('../services/caddyService');
      const caddyService = caddyServiceModule.caddyService;
      await caddyService.removeCaddyConfig(project.name);
      await caddyService.removeDomainFromDb(domain.domain);
      await caddyService.reloadCaddy();

      return { success: true, message: 'Domain removed successfully' };
    } catch (error) {
      console.error('Failed to delete domain:', error);
      return reply.status(500).send({ error: 'Failed to delete domain', message: error instanceof Error ? error.message : String(error) });
    }
  });

  /**
   * POST /:id/logs/clear
   * Clears all project log files
   * @returns Success status message
   */
  fastify.post('/:id/logs/clear', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    
    const project = getProjectById(id);
    
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

  /**
   * WebSocket GET /:id/logs/stream
   * Streams real-time project logs via WebSocket connection
   * Sends initial 50 lines, then updates every 2 seconds with last 10 lines
   */
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

  /**
   * GET /:id/deployments
   * Retrieves deployment history for a project
   * @returns Array of recent deployments (max 20)
   */
  fastify.get('/:id/deployments', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const projectId = parseInt(id);
    
    const project = getProjectById(id);
    if (!project) {
      return reply.status(404).send({ error: 'Project not found' });
    }
    
    const deployments = getDeploymentHistory(projectId);
    console.log(`GET /project/${projectId}/deployments -> found ${deployments.length} deployments`);
    return { deployments };
  });

  /**
   * POST /:id/rollback
   * Rolls back project to a previous deployment version
   * @returns Success status message
   */
  fastify.post('/:id/rollback', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const body = request.body as any;
    const { deploymentId, version } = body;

    const project = getProjectById(id);
    if (!project) {
      return reply.status(404).send({ error: 'Project not found' });
    }

    try {
      await deploymentService.rollbackToDeployment(
        parseInt(id), 
        deploymentId ? parseInt(deploymentId) : undefined, 
        version || undefined
      );
      return { success: true, message: 'Rollback initiated' };
    } catch (error) {
      console.error('Rollback failed:', error);
      return reply.status(500).send({ error: 'Rollback failed', message: error instanceof Error ? error.message : String(error) });
    }
  });

  /**
   * GET /:id/files
   * Retrieves file tree structure for project directory
   * @returns Hierarchical file/folder structure (excludes node_modules, .git, hidden files)
   */
  fastify.get('/:id/files', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const project = getProjectById(id);
    
    if (!project) {
      return reply.status(404).send({ error: 'Project not found' });
    }

    try {
      const files = await buildFileTree(project.path);
      return { files };
    } catch (error) {
      console.error('Failed to read file tree:', error);
      return reply.status(500).send({ error: 'Failed to read file tree' });
    }
  });

  /**
   * GET /:id/files/content
   * Retrieves content of a specific file
   * @returns File content and path (with security validation)
   */
  fastify.get('/:id/files/content', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const { path: filePath } = request.query as { path: string };
    
    const project = getProjectById(id);
    if (!project) {
      return reply.status(404).send({ error: 'Project not found' });
    }

    try {
      const fullPath = path.join(project.path, filePath);
      
      // Security check: ensure path is within project directory
      if (!isPathSecure(fullPath, project.path)) {
        return reply.status(403).send({ error: 'Access denied' });
      }

      const content = await fs.readFile(fullPath, 'utf-8');
      return { content, path: filePath };
    } catch (error) {
      console.error('Failed to read file:', error);
      return reply.status(500).send({ error: 'Failed to read file' });
    }
  });

  /**
   * POST /:id/files/save
   * Saves content to a file in the project directory
   * @returns Success status message (with security validation)
   */
  fastify.post('/:id/files/save', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const body = request.body as { path: string; content: string };
    
    const project = getProjectById(id);
    if (!project) {
      return reply.status(404).send({ error: 'Project not found' });
    }

    try {
      const fullPath = path.join(project.path, body.path);
      
      // Security check
      if (!isPathSecure(fullPath, project.path)) {
        return reply.status(403).send({ error: 'Access denied' });
      }

      await fs.writeFile(fullPath, body.content, 'utf-8');
      return { success: true, message: 'File saved successfully' };
    } catch (error) {
      console.error('Failed to save file:', error);
      return reply.status(500).send({ error: 'Failed to save file' });
    }
  });

  /**
   * POST /:id/files/create
   * Creates a new file or directory in the project
   * @returns Success status message (with security validation)
   */
  fastify.post('/:id/files/create', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const body = request.body as { path: string; type: 'file' | 'directory' };
    
    const project = getProjectById(id);
    if (!project) {
      return reply.status(404).send({ error: 'Project not found' });
    }

    try {
      const fullPath = path.join(project.path, body.path);
      
      // Security check
      if (!isPathSecure(fullPath, project.path)) {
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

  /**
   * DELETE /:id/files
   * Deletes a file or folder from the project
   * @returns Success status message (with security validation)
   */
  fastify.delete('/:id/files', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const { path: filePath } = request.query as { path: string };
    
    const project = getProjectById(id);
    if (!project) {
      return reply.status(404).send({ error: 'Project not found' });
    }

    try {
      const fullPath = path.join(project.path, filePath);
      
      // Security check
      if (!isPathSecure(fullPath, project.path)) {
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

  /**
   * POST /:id/terminal
   * Executes a terminal command in the project directory
   * @returns Command output (stdout/stderr) or error message
   */
  fastify.post('/:id/terminal', async (request: FastifyRequest, reply: FastifyReply) => {
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
