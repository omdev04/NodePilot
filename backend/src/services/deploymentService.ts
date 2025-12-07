import fsPromises from 'fs/promises';
import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import unzipper from 'unzipper';
import { pm2Service } from './pm2Service';
import { gitService } from './gitService';
import { removeDirectory, markForDeletion, DirectoryRemovalError } from '../utils/fileSystem';
import tar from 'tar';
// Optional runtime dependency: archiver may not be installed in some environments
let archiver: any = null;
try {
  // @ts-ignore
  archiver = require('archiver');
} catch (e) {
  console.warn('Optional module "archiver" not found; falling back to tar or raw copy for backups. To enable zip creation, run `npm install archiver` in backend.');
}
import { dbWrapper as db, Project } from '../utils/database';
import { encrypt, decrypt } from '../utils/encryption';

const execAsync = promisify(exec);

export interface DeploymentConfig {
  projectName: string;
  displayName: string;
  startCommand: string;
  port?: number;
  envVars?: Record<string, string>;
  zipPath?: string;
}

export interface GitDeploymentConfig {
  projectName: string;
  displayName: string;
  gitUrl: string;
  branch: string;
  startCommand: string;
  installCommand?: string;
  buildCommand?: string;
  port?: number;
  envVars?: Record<string, string>;
  oauthToken?: string;
  oauthProvider?: 'github' | 'gitlab' | 'bitbucket';
}

export class DeploymentService {
  private projectsDir: string;
  private backupsDir: string;

  constructor() {
    this.projectsDir = process.env.PROJECTS_DIR || path.join(process.cwd(), '../projects');
    this.backupsDir = process.env.BACKUPS_DIR || path.join(process.cwd(), '../backups');
  }

  async ensureBackupsDir() {
    await fsPromises.mkdir(this.backupsDir, { recursive: true });
  }

  private formatTimestamp(ts: number) {
    const d = new Date(ts);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}_${pad(d.getMonth() + 1)}_${pad(d.getDate())}_${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`;
  }

  // Create a backup snapshot that includes a zipped project, env and pm2 ecosystem config
  async createBackupSnapshot(project: Project): Promise<{ version: string; backupFolder: string; archivePath?: string; archiveType: 'zip'|'tar'|'raw' }> {
    await this.ensureBackupsDir();
    const ts = Date.now();
    const version = this.formatTimestamp(ts);
    const sanitizedName = project.name;
    const backupFolder = path.join(this.backupsDir, sanitizedName, version);
    await fsPromises.mkdir(backupFolder, { recursive: true });

    let archivePath: string | undefined;
    let archiveType: 'zip'|'tar'|'raw' = 'zip';

    // Attempt system 'zip' first, fallback to 'tar -czf'
    const zipFile = path.join(backupFolder, `snapshot_${version}.zip`);
    const tarFile = path.join(backupFolder, `snapshot_${version}.tar.gz`);
    try {
      if (archiver) {
        // Create zip archive programmatically via archiver (cross-platform)
        await new Promise<void>((resolve, reject) => {
          const output = fs.createWriteStream(zipFile);
          const archive = archiver('zip', { zlib: { level: 9 } });
          output.on('close', () => resolve());
          output.on('error', (err) => reject(err));
          archive.on('error', (err) => reject(err));
          archive.pipe(output);
          // Add the project folder contents
          archive.directory(project.path, false);
          archive.finalize();
        });
        archivePath = zipFile;
        archiveType = 'zip';
      } else {
        throw new Error('archiver not available');
      }
    } catch (errZip) {
      try {
        // fallback to tar via node tar module
        await tar.c({ gzip: true, file: tarFile, cwd: project.path }, ['.']);
        archivePath = tarFile;
        archiveType = 'tar';
      } catch (errTar) {
        // If both fail, attempt to copy directory contents as a last resort
        const fallbackDir = path.join(backupFolder, `snapshot_${version}_raw`);
        await fsPromises.mkdir(fallbackDir, { recursive: true });
        const items = await fsPromises.readdir(project.path);
        for (const item of items) {
          const src = path.join(project.path, item);
          const dest = path.join(fallbackDir, item);
          await fsPromises.cp(src, dest, { recursive: true });
        }
        archivePath = fallbackDir;
        archiveType = 'raw';
      }
    }

    // Save .env if exists
    try {
      const envPath = path.join(project.path, '.env');
      const stat = await fsPromises.stat(envPath).catch(() => null);
      if (stat && stat.isFile()) {
        const envBackup = path.join(backupFolder, `env_${version}`);
        await fsPromises.copyFile(envPath, envBackup);
      }
    } catch (error) {
      console.warn('Failed to backup .env: ', error);
    }

    // Create pm2 ecosystem json from stored project config
    try {
      const decryptedVarsStr = decrypt(project.env_vars || '{}');
      const decryptedVars = JSON.parse(decryptedVarsStr || '{}');
      const { script, args, interpreter } = this.parseStartCommand(project.start_command);

      const ecosys: any = {
        apps: [
          {
            name: project.pm2_name,
            script: script || 'npm',
            args: args || undefined,
            cwd: project.path,
            interpreter: interpreter || undefined,
            env: {
              PORT: project.port?.toString() || '3000',
              NODE_ENV: 'production',
              ...decryptedVars,
            },
          },
        ],
      };
      const ecosystemFile = path.join(backupFolder, `ecosystem_${version}.json`);
      await fsPromises.writeFile(ecosystemFile, JSON.stringify(ecosys, null, 2));
    } catch (error) {
      console.warn('Failed to write ecosystem backup:', error);
    }

    console.log(`createBackupSnapshot -> version=${version} archiveType=${archiveType} archivePath=${archivePath}`);
    return { version, backupFolder, archivePath, archiveType };
  }

  async ensureProjectsDir() {
    await fsPromises.mkdir(this.projectsDir, { recursive: true });
  }

  sanitizeProjectName(name: string): string {
    return name.toLowerCase().replace(/[^a-z0-9-]/g, '-');
  }

  async createProject(config: DeploymentConfig): Promise<Project> {
    await this.ensureProjectsDir();

    const sanitizedName = this.sanitizeProjectName(config.projectName);
    const projectPath = path.join(this.projectsDir, sanitizedName);
    const pm2Name = `nodepilot-${sanitizedName}`;

    // Check if project already exists
    const existing = db
      .prepare('SELECT id FROM projects WHERE name = ?')
      .get(sanitizedName);

    if (existing) {
      throw new Error(`Project "${sanitizedName}" already exists`);
    }

    // Create project directory
    await fsPromises.mkdir(projectPath, { recursive: true });

    // Extract ZIP if provided
    if (config.zipPath) {
      await this.extractZip(config.zipPath, projectPath);
    }

    // Install dependencies if package.json exists
    const packageJsonPath = path.join(projectPath, 'package.json');
    try {
      await fsPromises.access(packageJsonPath);
      console.log(`📦 Installing dependencies for ${sanitizedName}...`);
      await execAsync('npm install --production', { cwd: projectPath });
      console.log(`✅ Dependencies installed for ${sanitizedName}`);
    } catch (error) {
      console.log(`ℹ️  No package.json found or install failed for ${sanitizedName}`);
    }

    // Parse start command
    const { script, args, interpreter } = this.parseStartCommand(config.startCommand);

    // Validate script file exists (if not npm/yarn/pnpm)
    if (interpreter !== 'none' && script) {
      const scriptPath = path.join(projectPath, script);
      try {
        await fsPromises.access(scriptPath);
      } catch (error) {
        throw new Error(`Start script not found: ${script}. Please check your ZIP file contains this file or use a different start command (e.g., "npm start")`);
      }
    }

    // Prepare environment variables for the runtime (always include defaults)
    const envVarsForProcess = {
      PORT: config.port?.toString() || '3000',
      NODE_ENV: 'production',
      ...(config.envVars || {}),
    };

    // Only store user-provided env vars in DB (not the default-only set)
    const userEnvVars = config.envVars && Object.keys(config.envVars).length > 0 ? config.envVars : null;

    // Auto-generate .env file (runtime envs)
    try {
      const envLines = Object.entries(envVarsForProcess).map(([k, v]) => {
        const needsQuotes = typeof v === 'string' && /\s|\n|\r|\t/.test(v);
        const safeVal = (v || '').toString().replace(/"/g, '\\"');
        return `${k}=${needsQuotes ? '"' + safeVal + '"' : safeVal}`;
      }).join('\n');
      await fsPromises.writeFile(path.join(projectPath, '.env'), envLines, { mode: 0o600 });
    } catch (error) {
      console.warn('Failed to write .env file:', error);
    }

    // Start PM2 process
    await pm2Service.startProcess({
      name: pm2Name,
      script,
      args,
      interpreter,
      cwd: projectPath,
      env: envVarsForProcess,
      error_file: path.join(projectPath, 'error.log'),
      out_file: path.join(projectPath, 'out.log'),
    });

    // Save to database (encrypt env vars before storing when provided)
    const result = db.prepare(`
      INSERT INTO projects (name, display_name, path, start_command, port, env_vars, pm2_name, status, deploy_method)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      sanitizedName,
      config.displayName,
      projectPath,
      config.startCommand,
      config.port || null,
      // store only user-provided variables (null if none provided), encrypted if present
      userEnvVars ? encrypt(JSON.stringify(userEnvVars)) : null,
      pm2Name,
      'running',
      'zip'
    );

    if (userEnvVars) {
      console.log(`🔐 Stored ${Object.keys(userEnvVars).length} custom env var(s) for ${sanitizedName}`);
    } else {
      console.log(`ℹ️  No custom env vars for project ${sanitizedName} — not storing env_vars in DB`);
    }

    // Add deployment record (include version timestamp)
    const initialVersion = this.formatTimestamp(Date.now());
    db.prepare(`
      INSERT INTO deployments (project_id, version, status, notes)
      VALUES (?, ?, ?, ?)
    `).run(result.lastInsertRowid, initialVersion, 'success', 'Initial deployment');
    try { console.log(`Initial deployment record created for projectId ${result.lastInsertRowid}`); } catch (e) {}

    const project = db
      .prepare('SELECT * FROM projects WHERE id = ?')
      .get(result.lastInsertRowid) as Project;

    return project;
  }

  async createProjectFromGit(config: GitDeploymentConfig): Promise<Project> {
    await this.ensureProjectsDir();

    const sanitizedName = this.sanitizeProjectName(config.projectName);
    const projectPath = path.join(this.projectsDir, sanitizedName);
    const pm2Name = `nodepilot-${sanitizedName}`;

    // Check if project already exists
    const existing = db
      .prepare('SELECT id FROM projects WHERE name = ?')
      .get(sanitizedName);

    if (existing) {
      throw new Error(`Project "${sanitizedName}" already exists`);
    }

    console.log(`🔄 Cloning repository for ${sanitizedName}...`);
    
    // Clone repository
    const cloneResult = await gitService.cloneRepository({
      repoUrl: config.gitUrl,
      branch: config.branch,
      targetPath: projectPath,
      shallow: true,
      depth: 1,
      oauthToken: config.oauthToken,
      oauthProvider: config.oauthProvider,
    });

    if (!cloneResult.success) {
      throw new Error(`Git clone failed: ${cloneResult.message}`);
    }

    console.log(`✅ Repository cloned successfully`);

    // Validate repository structure
    const validation = await gitService.validateRepository(projectPath);
    if (!validation.isValid) {
      // Cleanup on validation failure
      await fsPromises.rm(projectPath, { recursive: true, force: true });
      throw new Error(`Repository validation failed: ${validation.errors.join(', ')}`);
    }

    if (validation.warnings.length > 0) {
      console.warn(`⚠️  Warnings: ${validation.warnings.join(', ')}`);
    }

    // Install dependencies
    const installCmd = config.installCommand || 'npm install';
    console.log(`📦 Installing dependencies: ${installCmd}...`);
    try {
      await execAsync(installCmd, { 
        cwd: projectPath,
        timeout: 10 * 60 * 1000, // 10 minute timeout
      });
      console.log(`✅ Dependencies installed`);
    } catch (error: any) {
      console.error(`❌ Dependency installation failed:`, error.message);
      throw new Error(`Dependency installation failed: ${error.message}`);
    }

    // Prepare environment variables BEFORE build
    const envVarsForProcess = {
      PORT: config.port?.toString() || '3000',
      NODE_ENV: 'production',
      ...(config.envVars || {}),
    };

    // Generate .env file BEFORE build (so build process can use it)
    try {
      const envLines = Object.entries(envVarsForProcess).map(([k, v]) => {
        const needsQuotes = typeof v === 'string' && /\s|\n|\r|\t/.test(v);
        const safeVal = (v || '').toString().replace(/"/g, '\\"');
        return `${k}=${needsQuotes ? '"' + safeVal + '"' : safeVal}`;
      }).join('\n');
      await fsPromises.writeFile(path.join(projectPath, '.env'), envLines, { mode: 0o600 });
      console.log(`✅ Environment variables written to .env file`);
    } catch (error) {
      console.warn('⚠️  Failed to write .env file:', error);
    }

    // Run build command if provided (with env vars available)
    if (config.buildCommand) {
      // Check if build command looks like a start command (common mistake)
      const buildCmd = config.buildCommand.toLowerCase().trim();
      const startsApp = buildCmd.includes('npm start') || 
                        buildCmd.includes('npm run start') ||
                        buildCmd.includes('node index') || 
                        buildCmd.includes('node server') || 
                        buildCmd.includes('node app') ||
                        buildCmd.includes('node src') ||
                        (buildCmd.includes('node ') && !buildCmd.includes('build'));
      
      if (startsApp) {
        console.log(`⚠️  Build command looks like a start command, skipping: ${config.buildCommand}`);
        console.log(`💡 Tip: Build commands are for compilation (e.g., 'npm run build', 'tsc'), not for starting the app`);
        console.log(`💡 The start command should be in the "Start Command" field, not "Build Command"`);
      } else {
        console.log(`🔨 Building project: ${config.buildCommand}...`);
        try {
          await execAsync(config.buildCommand, { 
            cwd: projectPath,
            timeout: 15 * 60 * 1000, // 15 minute timeout
            env: {
              ...process.env,
              ...envVarsForProcess,
            }
          });
          console.log(`✅ Build completed`);
        } catch (error: any) {
          console.error(`❌ Build failed:`, error.message);
          // Don't throw error for build failures - let the app try to start anyway
          console.warn(`⚠️  Continuing despite build failure - app may still work`);
        }
      }
    }

    // Parse start command
    const { script, args, interpreter } = this.parseStartCommand(config.startCommand);

    const userEnvVars = config.envVars && Object.keys(config.envVars).length > 0 ? config.envVars : null;

    // Get current commit info
    const repoInfo = await gitService.getRepoInfo(projectPath);
    const currentCommit = repoInfo.commit || 'unknown';

    // Start PM2 process
    console.log(`🚀 Starting PM2 process...`);
    await pm2Service.startProcess({
      name: pm2Name,
      script,
      args,
      interpreter,
      cwd: projectPath,
      env: envVarsForProcess,
      error_file: path.join(projectPath, 'error.log'),
      out_file: path.join(projectPath, 'out.log'),
    });

    // Save to database
    const result = db.prepare(`
      INSERT INTO projects (
        name, display_name, path, start_command, port, env_vars, pm2_name, status,
        deploy_method, git_url, git_branch, install_command, build_command, last_commit, last_deployed_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `).run(
      sanitizedName,
      config.displayName,
      projectPath,
      config.startCommand,
      config.port || null,
      userEnvVars ? encrypt(JSON.stringify(userEnvVars)) : null,
      pm2Name,
      'running',
      'git',
      config.gitUrl,
      config.branch,
      config.installCommand || 'npm install',
      config.buildCommand || null,
      currentCommit
    );

    console.log(`✅ Git project ${sanitizedName} created successfully`);

    // Add deployment record
    const initialVersion = this.formatTimestamp(Date.now());
    db.prepare(`
      INSERT INTO deployments (project_id, version, status, notes)
      VALUES (?, ?, ?, ?)
    `).run(result.lastInsertRowid, initialVersion, 'success', `Initial Git deployment from ${config.branch} (${currentCommit})`);

    const project = db
      .prepare('SELECT * FROM projects WHERE id = ?')
      .get(result.lastInsertRowid) as Project;

    return project;
  }

  async redeployGitProject(
    projectId: number, 
    oauthToken?: string, 
    oauthProvider?: 'github' | 'gitlab' | 'bitbucket'
  ): Promise<void> {
    const project = db
      .prepare('SELECT * FROM projects WHERE id = ?')
      .get(projectId) as Project;

    if (!project) {
      throw new Error('Project not found');
    }

    if (project.deploy_method !== 'git') {
      throw new Error('Project is not a Git deployment');
    }

    console.log(`🔄 Starting Git redeploy for ${project.name}...`);

    // Stop PM2 process
    await pm2Service.stopProcess(project.pm2_name);
    await new Promise(res => setTimeout(res, 2000)); // Wait for process to stop

    // Create backup snapshot
    let snapshotVersion = 'pre-git-pull';
    try {
      const { version } = await this.createBackupSnapshot(project);
      snapshotVersion = version;
      console.log(`✅ Backup created: ${version}`);
    } catch (e) {
      console.warn('⚠️  Backup creation failed:', e);
    }

    try {
      // Pull latest changes
      console.log(`📥 Pulling latest changes from ${project.git_branch}...`);
      const pullResult = await gitService.pullRepository({
        repoPath: project.path,
        branch: project.git_branch || 'main',
        oauthToken,
        oauthProvider,
      });

      if (!pullResult.success) {
        throw new Error(`Git pull failed: ${pullResult.message}`);
      }

      console.log(`✅ Pull completed: ${pullResult.changes}`);

      // Check if dependencies need reinstalling
      const needsInstall = await gitService.needsDependencyInstall(project.path);
      if (needsInstall) {
        console.log(`📦 Installing dependencies...`);
        const installCmd = project.install_command || 'npm install';
        await execAsync(installCmd, { 
          cwd: project.path,
          timeout: 10 * 60 * 1000,
        });
        console.log(`✅ Dependencies installed`);
      } else {
        console.log(`ℹ️  Dependencies up to date, skipping install`);
      }

      // Run build if configured
      if (project.build_command) {
        console.log(`🔨 Building project...`);
        await execAsync(project.build_command, { 
          cwd: project.path,
          timeout: 15 * 60 * 1000,
        });
        console.log(`✅ Build completed`);
      }

      // Regenerate .env and build complete environment
      let fullEnv = { PORT: project.port?.toString() || '3000', NODE_ENV: 'production' };
      try {
        const decryptedVarsStr = decrypt(project.env_vars || '{}');
        const decryptedVars = JSON.parse(decryptedVarsStr || '{}');
        fullEnv = { 
          PORT: project.port?.toString() || '3000', 
          NODE_ENV: 'production', 
          ...decryptedVars 
        };
        const envLines = Object.entries(fullEnv).map(([k, v]) => {
          const needsQuotes = typeof v === 'string' && /\s|\n|\r|\t/.test(v);
          const safeVal = (v || '').toString().replace(/"/g, '\\"');
          return `${k}=${needsQuotes ? '"' + safeVal + '"' : safeVal}`;
        }).join('\n');
        await fsPromises.writeFile(path.join(project.path, '.env'), envLines, { mode: 0o600 });
      } catch (error) {
        console.warn('Failed to regenerate .env:', error);
      }

      // Get updated commit info
      const repoInfo = await gitService.getRepoInfo(project.path);
      const newCommit = repoInfo.commit || 'unknown';

      // Restart PM2 with fresh environment (delete and start to reload env vars)
      console.log(`🚀 Restarting PM2 process with updated environment...`);
      await pm2Service.deleteProcess(project.pm2_name);
      
      const { script, args, interpreter } = this.parseStartCommand(project.start_command);
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

      // Update database
      db.prepare(`
        UPDATE projects 
        SET last_commit = ?, last_deployed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP 
        WHERE id = ?
      `).run(newCommit, projectId);

      db.prepare(`
        INSERT INTO deployments (project_id, version, status, notes)
        VALUES (?, ?, ?, ?)
      `).run(projectId, snapshotVersion, 'success', `Git pull deployment: ${pullResult.changes} (${newCommit})`);
      
      saveDb(); // Ensure changes are persisted

      console.log(`✅ Git redeploy completed successfully`);

    } catch (error: any) {
      console.error(`❌ Git redeploy failed:`, error.message);

      // Rollback on failure
      console.log(`🔙 Rolling back to previous version...`);
      try {
        await this.rollbackToDeployment(projectId, undefined, snapshotVersion);
        console.log(`✅ Rollback completed`);
      } catch (rollbackError: any) {
        console.error(`❌ Rollback failed:`, rollbackError.message);
      }

      db.prepare(`
        INSERT INTO deployments (project_id, version, status, notes)
        VALUES (?, ?, ?, ?)
      `).run(projectId, snapshotVersion, 'failed', `Git pull failed: ${error.message}`);
      
      saveDb(); // Ensure changes are persisted

      throw error;
    }
  }

  async redeployProject(projectId: number, zipPath: string): Promise<void> {
    const project = db
      .prepare('SELECT * FROM projects WHERE id = ?')
      .get(projectId) as Project;

    if (!project) {
      throw new Error('Project not found');
    }

    // Stop PM2 process
    await pm2Service.stopProcess(project.pm2_name);
    // Wait for PM2 to stop the process to reduce file locking issues (Windows)
    const maxWaitMs = 5000;
    const pollingInterval = 200;
    const deadline = Date.now() + maxWaitMs;
    try {
      while (Date.now() < deadline) {
        const status = await pm2Service.getProcessStatus(project.pm2_name).catch(() => 'unknown');
        if (status === 'stopped' || status === 'error') break;
        await new Promise((res) => setTimeout(res, pollingInterval));
      }
    } catch (err) {
      console.warn('Error while waiting for PM2 stop:', err);
    }

    // Create full backup snapshot before any destructive operation
    let snapshotVersion = 'initial';
    let snapshotArchivePath: string | undefined;
    let snapshotArchiveType: 'zip'|'tar'|'raw' = 'zip';
    try {
      const { version, archivePath, archiveType } = await this.createBackupSnapshot(project);
      snapshotVersion = version;
      snapshotArchivePath = archivePath;
      snapshotArchiveType = archiveType;
    } catch (e) {
      console.warn('createBackupSnapshot failed:', e);
    }

    // Rename project folder to a temporary backup path (local atomic backup)
    const backupPath = `${project.path}_backup_${Date.now()}`;
    try {
      await fsPromises.rename(project.path, backupPath);
    } catch (err) {
      console.warn('Failed to rename project path, attempting fallback copy. Error:', err && (err as any).message);
      // Try a fallback: copy project folder to backupPath then remove original folder.
      try {
        await fsPromises.mkdir(backupPath, { recursive: true });
        await fsPromises.cp(project.path, backupPath, { recursive: true });
        console.log(`Backup copied to ${backupPath} (fallback)`);
        // Try to remove the original path if possible
        try { await fsPromises.rm(project.path, { recursive: true, force: true }); } catch (e) { console.warn('Failed to remove original project path after cp fallback:', e); }
      } catch (copyErr) {
        console.error('Failed to create fallback backup via copy:', copyErr);
        throw copyErr; // rethrow so caller knows redeploy could not create a backup
      }
    }

    try {
      // Create fresh directory
      await fsPromises.mkdir(project.path, { recursive: true });

      // Extract new ZIP
      await this.extractZip(zipPath, project.path);

      // Install dependencies
      const packageJsonPath = path.join(project.path, 'package.json');
      try {
        await fsPromises.access(packageJsonPath);
        await execAsync('npm install --production', { cwd: project.path });
      } catch (error) {
        console.log('No package.json or install failed');
      }

      // Restart PM2 process with fresh environment
      // Re-generate .env from stored variables, if any
      let fullEnv = { PORT: project.port?.toString() || '3000', NODE_ENV: 'production' };
      try {
        const decryptedVarsStr = decrypt(project.env_vars || '{}');
        const decryptedVars = JSON.parse(decryptedVarsStr || '{}');
        fullEnv = { 
          PORT: project.port?.toString() || '3000', 
          NODE_ENV: 'production', 
          ...decryptedVars 
        };
        const envLines = Object.entries(fullEnv).map(([k, v]) => {
          const needsQuotes = typeof v === 'string' && /\s|\n|\r|\t/.test(v);
          const safeVal = (v || '').toString().replace(/"/g, '\\"');
          return `${k}=${needsQuotes ? '"' + safeVal + '"' : safeVal}`;
        }).join('\n');
        await fsPromises.writeFile(path.join(project.path, '.env'), envLines, { mode: 0o600 });
      } catch (error) {
        console.warn('Failed to regenerate .env during redeploy:', error);
      }

      // Delete and restart to reload env vars
      await pm2Service.deleteProcess(project.pm2_name);
      
      const { script, args, interpreter } = this.parseStartCommand(project.start_command);
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

      // Update database
      db.prepare('UPDATE projects SET updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(projectId);

      db.prepare(`
        INSERT INTO deployments (project_id, version, status, notes)
        VALUES (?, ?, ?, ?)
      `).run(projectId, snapshotVersion, 'success', `Redeployment successful (version: ${snapshotVersion})`);
      try { console.log(`Redeployment record created for projectId ${projectId} version ${snapshotVersion}`); } catch (e) {}
      
      saveDb(); // Ensure changes are persisted

      // Remove backup after successful deployment
      setTimeout(async () => {
        try {
          await fsPromises.rm(backupPath, { recursive: true, force: true });
        } catch (error) {
          console.error('Failed to remove backup:', error);
        }
      }, 60000); // Keep backup for 1 minute

    } catch (error) {
      // Restore backup on failure
      try {
        await fsPromises.rm(project.path, { recursive: true, force: true });
      } catch (e) {
        console.warn('Failed to remove new project path during error recovery:', e);
      }
      try {
        await fsPromises.rename(backupPath, project.path);
      } catch (renameErr) {
        console.warn('Rename rollback failed, attempting to copy backup into place:', renameErr);
        // Try to copy content from backup into project.path
        try {
          await fsPromises.mkdir(project.path, { recursive: true });
          await fsPromises.cp(backupPath, project.path, { recursive: true });
          console.log(`Backup restored from ${backupPath} via copy fallback`);
          // remove backupPath after copying
          try { await fsPromises.rm(backupPath, { recursive: true, force: true }); } catch (e) { console.warn('Failed to remove backup folder after copy restore:', e); }
        } catch (copyErr) {
          console.error('Failed to restore backup via copy:', copyErr);
        }
      }
      
      try {
        const envObj = JSON.parse(decrypt(project.env_vars || '{}') || '{}');
        await pm2Service.startProcess({
          name: project.pm2_name,
          script: 'npm',
          args: 'start',
          cwd: project.path,
          env: envObj,
        });
      } catch (err) {
        await pm2Service.startProcess({
          name: project.pm2_name,
          script: 'npm',
          args: 'start',
          cwd: project.path,
        });
      }

      db.prepare(`
        INSERT INTO deployments (project_id, status, notes)
        VALUES (?, ?, ?)
      `).run(projectId, 'failed', `Redeployment failed: ${error}`);
      // Also record failed deployment with version if known
      db.prepare(`
        INSERT INTO deployments (project_id, version, status, notes)
        VALUES (?, ?, ?, ?)
      `).run(projectId, snapshotVersion, 'failed', `Redeployment failed: ${error}`);

      throw error;
    }
  }

  async rollbackToDeployment(projectId: number, deploymentId?: number, version?: string): Promise<void> {
    const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId) as Project;
    if (!project) throw new Error('Project not found');
    let targetVersion = version;
    if (!targetVersion && deploymentId) {
      const d = db.prepare('SELECT * FROM deployments WHERE id = ?').get(deploymentId);
      if (!d) throw new Error('Deployment not found');
      targetVersion = d.version;
    }
    if (!targetVersion) throw new Error('No target version specified for rollback');

    const backupFolder = path.join(this.backupsDir, project.name, targetVersion);
    const zipFile = path.join(backupFolder, `snapshot_${targetVersion}.zip`);
    // If zip doesn't exist, fallback to raw folder
    const zipExists = await fsPromises.stat(zipFile).then(s => !!s).catch(() => false);
    const ecosystemFile = path.join(backupFolder, `ecosystem_${targetVersion}.json`);
    const envFile = path.join(backupFolder, `env_${targetVersion}`);

    // Stop PM2 process
    await pm2Service.stopProcess(project.pm2_name);

    // Remove existing project path
    await fsPromises.rm(project.path, { recursive: true, force: true }).catch(() => {});
    await fsPromises.mkdir(project.path, { recursive: true });

    // Extract or copy backup: support zip/tar/raw
    const tarFile = path.join(backupFolder, `snapshot_${targetVersion}.tar.gz`);
    const tarExists = await fsPromises.stat(tarFile).then(s => !!s).catch(() => false);
    if (zipExists) {
      // Extract zip using unzipper
      try {
        await new Promise((resolve, reject) => {
          fs.createReadStream(zipFile)
            .pipe(unzipper.Extract({ path: project.path }))
            .on('close', resolve)
            .on('error', reject);
        });
      } catch (zipErr) {
        console.warn('Failed to extract zip, attempting tar fallback:', (zipErr as any)?.message || zipErr);
        // try tar fallback if possible
        if (tarExists) {
          try {
            await tar.x({ file: tarFile, cwd: project.path });
            console.log('Extracted tar.gz after zip failed');
          } catch (tarErr) {
            console.warn('Tar extraction also failed:', (tarErr as any)?.message || tarErr);
            // fallback to copying folder
            const fallbackDir = path.join(backupFolder, `snapshot_${targetVersion}_raw`);
            const items = await fsPromises.readdir(fallbackDir).catch(() => []);
            for (const item of items) {
              await fsPromises.cp(path.join(fallbackDir, item), path.join(project.path, item), { recursive: true });
            }
          }
        } else {
          // fallback to raw copy
          const fallbackDir = path.join(backupFolder, `snapshot_${targetVersion}_raw`);
          const items = await fsPromises.readdir(fallbackDir).catch(() => []);
          for (const item of items) {
            await fsPromises.cp(path.join(fallbackDir, item), path.join(project.path, item), { recursive: true });
          }
        }
      }
    } else if (tarExists) {
      // Extract tar.gz using tar module
      try {
        await tar.x({ file: tarFile, cwd: project.path });
      } catch (tarErr) {
        console.warn('Failed to extract tar.gz, attempting raw copy fallback:', (tarErr as any)?.message || tarErr);
        const fallbackDir = path.join(backupFolder, `snapshot_${targetVersion}_raw`);
        const items = await fsPromises.readdir(fallbackDir).catch(() => []);
        for (const item of items) {
          await fsPromises.cp(path.join(fallbackDir, item), path.join(project.path, item), { recursive: true });
        }
      }
    } else {
      // Copy raw folder contents
      const fallbackDir = path.join(backupFolder, `snapshot_${targetVersion}_raw`);
      const items = await fsPromises.readdir(fallbackDir).catch(() => []);
      for (const item of items) {
        await fsPromises.cp(path.join(fallbackDir, item), path.join(project.path, item), { recursive: true });
      }
    }

    // Restore .env
    try {
      const stat = await fsPromises.stat(envFile).catch(() => null);
      if (stat && stat.isFile()) {
        await fsPromises.copyFile(envFile, path.join(project.path, '.env'));
      }
    } catch (e) {
      console.warn('Failed to restore .env during rollback', e);
    }

    // Restore pm2 ecosystem if present
    let usedEcosys = false;
    try {
      const ecos = await fsPromises.readFile(ecosystemFile, 'utf-8').catch(() => null);
      if (ecos) {
        const ecosJson = JSON.parse(ecos);
        if (Array.isArray(ecosJson.apps) && ecosJson.apps.length > 0) {
          const app = ecosJson.apps[0];
          const env = app.env || {};
          await pm2Service.startProcess({
            name: app.name || project.pm2_name,
            script: app.script || 'npm',
            args: app.args || undefined,
            interpreter: app.interpreter || undefined,
            cwd: app.cwd || project.path,
            env,
          });
          usedEcosys = true;
        }
      }
    } catch (e) {
      console.warn('Failed to restore ecosystem during rollback', e);
    }

    if (!usedEcosys) {
      // fallback to using start command
      const { script, args, interpreter } = this.parseStartCommand(project.start_command);
      let envObj = {};
      try { envObj = JSON.parse(decrypt(project.env_vars || '{}') || '{}'); } catch (e) { envObj = {}; }
      await pm2Service.startProcess({
        name: project.pm2_name,
        script: script || 'npm',
        args: args || undefined,
        interpreter: interpreter || undefined,
        cwd: project.path,
        env: { PORT: project.port?.toString() || '3000', NODE_ENV: 'production', ...envObj },
      });
    }

    // Update DB deployments
    db.prepare(`
      INSERT INTO deployments (project_id, version, status, notes)
      VALUES (?, ?, ?, ?)
    `).run(projectId, targetVersion, 'rollback', `Rolled back to ${targetVersion}`);
    
    saveDb(); // Ensure changes are persisted
  }

  async deleteProject(projectId: number): Promise<{ success: boolean; markedForDeletion?: string }> {
    const project = db
      .prepare('SELECT * FROM projects WHERE id = ?')
      .get(projectId) as Project;

    if (!project) {
      throw new Error('Project not found');
    }

    // Step 1: Stop and delete PM2 process
    try {
      await pm2Service.deleteProcess(project.pm2_name);
      // Small delay to let PM2 cleanup
      await new Promise(resolve => setTimeout(resolve, 1000));
    } catch (error: any) {
      // Process not found is acceptable
      if (!error.message?.includes('not found')) {
        console.warn('PM2 deletion warning:', error.message);
      }
    }

    // Step 2: Attempt to remove directory
    let markedPath: string | undefined;
    
    try {
      await removeDirectory(project.path);
    } catch (error) {
      if (error instanceof DirectoryRemovalError && error.recoverable) {
        // Directory is locked - mark it for deferred deletion instead
        try {
          markedPath = await markForDeletion(project.path);
          console.log(`Directory locked, marked for cleanup: ${markedPath}`);
        } catch (markError) {
          console.error('Failed to mark directory for deletion:', markError);
          // Continue - we'll delete from DB but leave directory orphaned
        }
      } else {
        // Non-recoverable error - log but continue to database deletion
        console.error('Directory removal failed:', error);
      }
    }

    // Step 3: Remove from database
    db.prepare('DELETE FROM projects WHERE id = ?').run(projectId);

    return {
      success: true,
      markedForDeletion: markedPath
    };
  }

  private async extractZip(zipPath: string, destination: string): Promise<void> {
    return new Promise((resolve, reject) => {
      fs.createReadStream(zipPath)
        .pipe(unzipper.Extract({ path: destination }))
        .on('close', async () => {
          try {
            // Check if extraction created a single nested folder
            const items = await fsPromises.readdir(destination);
            
            // If there's only one item and it's a directory, flatten it
            if (items.length === 1) {
              const singleItem = items[0];
              const itemPath = path.join(destination, singleItem);
              
              try {
                const stats = await fsPromises.stat(itemPath);
                
                if (stats.isDirectory()) {
                  // Use a temporary directory to avoid naming conflicts
                  const tempPath = path.join(destination, '.temp-flatten-' + Date.now());
                  
                  // Rename nested folder to temp name first
                  await fsPromises.rename(itemPath, tempPath);
                  
                  // Move all contents from temp folder to destination
                  const nestedItems = await fsPromises.readdir(tempPath);
                  
                  for (const nestedItem of nestedItems) {
                    const srcPath = path.join(tempPath, nestedItem);
                    const destPath = path.join(destination, nestedItem);
                    await fsPromises.rename(srcPath, destPath);
                  }
                  
                  // Remove the now-empty temp folder
                  await fsPromises.rmdir(tempPath);
                }
              } catch (statError) {
                // If stat fails, skip flattening
                console.warn('Could not flatten directory structure:', statError);
              }
            }
            
            resolve();
          } catch (error) {
            reject(error);
          }
        })
        .on('error', reject);
    });
  }

  private parseStartCommand(command: string): { script: string; args?: string; interpreter?: string } {
    const parts = command.trim().split(/\s+/);
    
    if (parts[0] === 'npm' || parts[0] === 'yarn' || parts[0] === 'pnpm') {
      // On Windows, use npm.cmd directly with 'none' interpreter
      // PM2 will handle it properly when both interpreter and interpreter_args are set to 'none'
      return {
        script: `${parts[0]}.cmd`,
        args: parts.slice(1).join(' '),
        interpreter: 'none',
      };
    }

    if (parts[0] === 'node') {
      return {
        script: parts[1],
        args: parts.slice(2).join(' '),
        interpreter: 'node',
      };
    }

    return {
      script: parts[0],
      args: parts.slice(1).join(' '),
    };
  }
}

export const deploymentService = new DeploymentService();
