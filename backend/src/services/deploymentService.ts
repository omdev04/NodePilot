import fsPromises from 'fs/promises';
import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import unzipper from 'unzipper';
import { pm2Service } from './pm2Service';
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
      INSERT INTO projects (name, display_name, path, start_command, port, env_vars, pm2_name, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      sanitizedName,
      config.displayName,
      projectPath,
      config.startCommand,
      config.port || null,
      // store only user-provided variables (null if none provided), encrypted if present
      userEnvVars ? encrypt(JSON.stringify(userEnvVars)) : null,
      pm2Name,
      'running'
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

      // Restart PM2 process
      // Re-generate .env from stored variables, if any
      try {
        const decryptedVarsStr = decrypt(project.env_vars || '{}');
        const decryptedVars = JSON.parse(decryptedVarsStr || '{}');
        const envLines = Object.entries({ PORT: project.port?.toString() || '3000', NODE_ENV: 'production', ...decryptedVars }).map(([k, v]) => {
          const needsQuotes = typeof v === 'string' && /\s|\n|\r|\t/.test(v);
          const safeVal = (v || '').toString().replace(/"/g, '\\"');
          return `${k}=${needsQuotes ? '"' + safeVal + '"' : safeVal}`;
        }).join('\n');
        await fsPromises.writeFile(path.join(project.path, '.env'), envLines, { mode: 0o600 });
      } catch (error) {
        console.warn('Failed to regenerate .env during redeploy:', error);
      }

      await pm2Service.restartProcess(project.pm2_name);

      // Update database
      db.prepare('UPDATE projects SET updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(projectId);

      db.prepare(`
        INSERT INTO deployments (project_id, version, status, notes)
        VALUES (?, ?, ?, ?)
      `).run(projectId, snapshotVersion, 'success', `Redeployment successful (version: ${snapshotVersion})`);
      try { console.log(`Redeployment record created for projectId ${projectId} version ${snapshotVersion}`); } catch (e) {}

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
  }

  async deleteProject(projectId: number): Promise<void> {
    const project = db
      .prepare('SELECT * FROM projects WHERE id = ?')
      .get(projectId) as Project;

    if (!project) {
      throw new Error('Project not found');
    }

    // Stop and delete PM2 process
    try {
      await pm2Service.deleteProcess(project.pm2_name);
    } catch (error) {
      console.error('PM2 delete error:', error);
    }

    // Remove project directory
    await fsPromises.rm(project.path, { recursive: true, force: true });

    // Delete from database
    db.prepare('DELETE FROM projects WHERE id = ?').run(projectId);
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
              const stats = await fsPromises.stat(itemPath);
              
              if (stats.isDirectory()) {
                // Move all contents from nested folder to parent
                const nestedItems = await fsPromises.readdir(itemPath);
                
                for (const nestedItem of nestedItems) {
                  const srcPath = path.join(itemPath, nestedItem);
                  const destPath = path.join(destination, nestedItem);
                  await fsPromises.rename(srcPath, destPath);
                }
                
                // Remove the now-empty nested folder
                await fsPromises.rmdir(itemPath);
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
      return {
        script: parts[0],
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
