import { exec, spawn } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs/promises';
import crypto from 'crypto';

const execAsync = promisify(exec);

export interface GitCloneOptions {
  repoUrl: string;
  branch: string;
  targetPath: string;
  shallow?: boolean;
  depth?: number;
  oauthToken?: string;
  oauthProvider?: 'github' | 'gitlab' | 'bitbucket';
}

export interface GitPullOptions {
  repoPath: string;
  branch: string;
  oauthToken?: string;
  oauthProvider?: 'github' | 'gitlab' | 'bitbucket';
}

export interface GitValidationResult {
  isValid: boolean;
  hasPackageJson: boolean;
  hasGitFolder: boolean;
  errors: string[];
  warnings: string[];
}

export class GitService {
  private logDir: string;

  constructor() {
    this.logDir = process.env.LOG_DIR || path.join(process.cwd(), '../logs');
  }

  async ensureLogDir() {
    await fs.mkdir(this.logDir, { recursive: true });
  }

  /**
   * Inject OAuth token into Git URL for authenticated access
   */
  private injectOAuthToken(url: string, token: string, provider: 'github' | 'gitlab' | 'bitbucket'): string {
    try {
      const parsedUrl = new URL(url);
      
      // Inject token based on provider
      if (provider === 'github') {
        parsedUrl.username = token;
        parsedUrl.password = 'x-oauth-basic';
      } else if (provider === 'gitlab') {
        parsedUrl.username = 'oauth2';
        parsedUrl.password = token;
      } else if (provider === 'bitbucket') {
        parsedUrl.username = 'x-token-auth';
        parsedUrl.password = token;
      }

      return parsedUrl.toString();
    } catch (error) {
      // If URL parsing fails, return original URL
      return url;
    }
  }

  /**
   * Sanitize and validate Git repository URL
   * Prevents command injection and validates format
   */
  sanitizeRepoUrl(url: string): { isValid: boolean; sanitized: string; error?: string } {
    const trimmed = url.trim();

    // Check for command injection attempts
    if (trimmed.includes('|') || trimmed.includes(';') || trimmed.includes('&') || 
        trimmed.includes('$') || trimmed.includes('`') || trimmed.includes('\n')) {
      return { isValid: false, sanitized: '', error: 'Invalid characters in repository URL' };
    }

    // Validate URL format (HTTP/HTTPS/SSH)
    const httpPattern = /^https?:\/\/[^\s]+\.git$/i;
    const sshPattern = /^git@[^\s]+:[^\s]+\.git$/i;

    if (!httpPattern.test(trimmed) && !sshPattern.test(trimmed)) {
      // Try adding .git if missing
      const withGit = trimmed.endsWith('.git') ? trimmed : `${trimmed}.git`;
      if (httpPattern.test(withGit) || sshPattern.test(withGit)) {
        return { isValid: true, sanitized: withGit };
      }
      return { isValid: false, sanitized: '', error: 'Repository URL must be in format: https://github.com/user/repo.git or git@github.com:user/repo.git' };
    }

    return { isValid: true, sanitized: trimmed };
  }

  /**
   * Sanitize branch name to prevent command injection
   */
  sanitizeBranchName(branch: string): { isValid: boolean; sanitized: string; error?: string } {
    const trimmed = branch.trim();

    // Check for invalid characters
    if (!/^[a-zA-Z0-9._\/-]+$/.test(trimmed)) {
      return { isValid: false, sanitized: '', error: 'Branch name contains invalid characters' };
    }

    // Prevent path traversal
    if (trimmed.includes('..') || trimmed.startsWith('/')) {
      return { isValid: false, sanitized: '', error: 'Invalid branch name format' };
    }

    return { isValid: true, sanitized: trimmed };
  }

  /**
   * Clone a Git repository with security checks
   */
  async cloneRepository(options: GitCloneOptions): Promise<{ success: boolean; message: string; logs?: string }> {
    await this.ensureLogDir();

    const { isValid: urlValid, sanitized: sanitizedUrl, error: urlError } = this.sanitizeRepoUrl(options.repoUrl);
    if (!urlValid) {
      return { success: false, message: urlError || 'Invalid repository URL' };
    }

    const { isValid: branchValid, sanitized: sanitizedBranch, error: branchError } = this.sanitizeBranchName(options.branch);
    if (!branchValid) {
      return { success: false, message: branchError || 'Invalid branch name' };
    }

    const logFile = path.join(this.logDir, 'git-clone.log');
    let logs = '';

    try {
      // Ensure parent directory exists
      await fs.mkdir(path.dirname(options.targetPath), { recursive: true });

      // Inject OAuth token if provided for authenticated access
      let finalUrl = sanitizedUrl;
      if (options.oauthToken && options.oauthProvider) {
        console.log('🔹 Injecting OAuth token for provider:', options.oauthProvider);
        finalUrl = this.injectOAuthToken(sanitizedUrl, options.oauthToken, options.oauthProvider);
        console.log('🔹 Original URL:', sanitizedUrl);
        console.log('🔹 Authenticated URL:', finalUrl.replace(options.oauthToken, '***TOKEN***'));
      } else {
        console.log('⚠️  No OAuth token provided for clone operation');
      }

      // Build clone command with security
      const cloneArgs = [
        'clone',
        '--branch', sanitizedBranch,
        '--single-branch',
      ];

      if (options.shallow || options.depth) {
        cloneArgs.push('--depth', String(options.depth || 1));
      }

      cloneArgs.push(finalUrl, options.targetPath);

      const command = `git ${cloneArgs.join(' ')}`;
      const timestamp = new Date().toISOString();
      logs = `[${timestamp}] Executing: ${command}\n`;
      
      console.log('🔹 Executing git clone command...');

      const { stdout, stderr } = await execAsync(command, {
        maxBuffer: 10 * 1024 * 1024, // 10MB buffer
        timeout: 5 * 60 * 1000, // 5 minute timeout
        env: {
          ...process.env,
          GIT_TERMINAL_PROMPT: '0', // Disable prompts for credentials
        },
      });
      
      console.log('✅ Git clone completed');

      logs += `STDOUT:\n${stdout}\nSTDERR:\n${stderr}\n`;
      await fs.appendFile(logFile, logs);

      return {
        success: true,
        message: `Successfully cloned repository from ${sanitizedBranch} branch`,
        logs,
      };
    } catch (error: any) {
      const errorLog = `\nERROR: ${error.message}\n${error.stderr || ''}\n`;
      logs += errorLog;
      await fs.appendFile(logFile, logs);
      
      console.error('❌ Git clone failed:', error.message);
      console.error('❌ Git stderr:', error.stderr || 'No stderr output');

      // Parse common Git errors
      let userMessage = 'Failed to clone repository';
      const fullError = `${error.message} ${error.stderr || ''}`.toLowerCase();
      
      if (fullError.includes('repository not found') || fullError.includes('could not read')) {
        userMessage = 'Repository not found or access denied. Check the URL and permissions.';
      } else if (fullError.includes('branch') && fullError.includes('not found')) {
        userMessage = `Branch "${sanitizedBranch}" not found in repository.`;
      } else if (fullError.includes('authentication') || fullError.includes('credentials')) {
        userMessage = 'Authentication failed. Repository may be private or token is invalid.';
      } else if (fullError.includes('timeout')) {
        userMessage = 'Clone operation timed out. Repository may be too large or network is slow.';
      } else if (fullError.includes('fatal')) {
        userMessage = `Git error: ${error.stderr || error.message}`;
      }

      return {
        success: false,
        message: userMessage,
        logs,
      };
    }
  }

  /**
   * Pull latest changes from Git repository
   */
  async pullRepository(options: GitPullOptions): Promise<{ success: boolean; message: string; changes?: string; logs?: string }> {
    await this.ensureLogDir();

    const { isValid: branchValid, sanitized: sanitizedBranch, error: branchError } = this.sanitizeBranchName(options.branch);
    if (!branchValid) {
      return { success: false, message: branchError || 'Invalid branch name' };
    }

    const logFile = path.join(this.logDir, 'git-pull.log');
    let logs = '';

    try {
      // Check if directory is a git repository
      const gitCheck = await execAsync('git rev-parse --is-inside-work-tree', {
        cwd: options.repoPath,
      });

      if (gitCheck.stdout.trim() !== 'true') {
        return { success: false, message: 'Not a valid Git repository' };
      }

      // Check for uncommitted changes
      const statusCheck = await execAsync('git status --porcelain', {
        cwd: options.repoPath,
      });

      if (statusCheck.stdout.trim()) {
        return {
          success: false,
          message: 'Repository has uncommitted changes. Please commit or stash them first.',
          logs: statusCheck.stdout,
        };
      }

      // Update remote URL with OAuth token if provided
      if (options.oauthToken && options.oauthProvider) {
        const remoteUrlResult = await execAsync('git remote get-url origin', {
          cwd: options.repoPath,
        });
        const currentUrl = remoteUrlResult.stdout.trim();
        const authenticatedUrl = this.injectOAuthToken(currentUrl, options.oauthToken, options.oauthProvider);
        
        // Temporarily set remote URL with token for this operation
        await execAsync(`git remote set-url origin "${authenticatedUrl}"`, {
          cwd: options.repoPath,
        });
      }

      // Fetch and pull
      const timestamp = new Date().toISOString();
      logs = `[${timestamp}] Pulling from branch: ${sanitizedBranch}\n`;

      const fetchCmd = `git fetch origin ${sanitizedBranch}`;
      logs += `Executing: ${fetchCmd}\n`;
      const { stdout: fetchOut, stderr: fetchErr } = await execAsync(fetchCmd, {
        cwd: options.repoPath,
        timeout: 3 * 60 * 1000, // 3 minutes
        env: {
          ...process.env,
          GIT_TERMINAL_PROMPT: '0',
        },
      });
      logs += `${fetchOut}\n${fetchErr}\n`;

      const pullCmd = `git pull origin ${sanitizedBranch}`;
      logs += `Executing: ${pullCmd}\n`;
      const { stdout: pullOut, stderr: pullErr } = await execAsync(pullCmd, {
        cwd: options.repoPath,
        timeout: 3 * 60 * 1000,
        env: {
          ...process.env,
          GIT_TERMINAL_PROMPT: '0',
        },
      });
      logs += `${pullOut}\n${pullErr}\n`;

      await fs.appendFile(logFile, logs);

      const changes = pullOut.includes('Already up to date') ? 'No changes' : pullOut;

      return {
        success: true,
        message: 'Successfully pulled latest changes',
        changes,
        logs,
      };
    } catch (error: any) {
      const errorLog = `\nERROR: ${error.message}\n`;
      logs += errorLog;
      await fs.appendFile(logFile, logs);

      return {
        success: false,
        message: 'Failed to pull repository: ' + error.message,
        logs,
      };
    }
  }

  /**
   * List available branches in a repository
   */
  async listBranches(repoPath: string): Promise<{ success: boolean; branches: string[]; error?: string }> {
    try {
      const { stdout } = await execAsync('git branch -r', {
        cwd: repoPath,
      });

      const branches = stdout
        .split('\n')
        .map(line => line.trim())
        .filter(line => line && !line.includes('->'))
        .map(line => line.replace('origin/', ''));

      return { success: true, branches };
    } catch (error: any) {
      return { success: false, branches: [], error: error.message };
    }
  }

  /**
   * Get current branch and commit info
   */
  async getRepoInfo(repoPath: string): Promise<{
    success: boolean;
    branch?: string;
    commit?: string;
    commitMessage?: string;
    author?: string;
    date?: string;
    error?: string;
  }> {
    try {
      const branchResult = await execAsync('git rev-parse --abbrev-ref HEAD', { cwd: repoPath });
      const commitResult = await execAsync('git rev-parse HEAD', { cwd: repoPath });
      const logResult = await execAsync('git log -1 --pretty=format:"%s|%an|%ci"', { cwd: repoPath });

      const [commitMessage, author, date] = logResult.stdout.split('|');

      return {
        success: true,
        branch: branchResult.stdout.trim(),
        commit: commitResult.stdout.trim().substring(0, 8),
        commitMessage: commitMessage?.trim(),
        author: author?.trim(),
        date: date?.trim(),
      };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Validate a cloned repository structure
   */
  async validateRepository(repoPath: string): Promise<GitValidationResult> {
    const result: GitValidationResult = {
      isValid: true,
      hasPackageJson: false,
      hasGitFolder: false,
      errors: [],
      warnings: [],
    };

    try {
      // Check if .git exists
      const gitPath = path.join(repoPath, '.git');
      try {
        await fs.access(gitPath);
        result.hasGitFolder = true;
      } catch {
        result.errors.push('Missing .git folder - not a valid Git repository');
        result.isValid = false;
      }

      // Check for package.json
      const packageJsonPath = path.join(repoPath, 'package.json');
      try {
        await fs.access(packageJsonPath);
        result.hasPackageJson = true;

        // Validate package.json content
        const content = await fs.readFile(packageJsonPath, 'utf-8');
        const packageJson = JSON.parse(content);

        if (!packageJson.name) {
          result.warnings.push('package.json missing "name" field');
        }

        if (!packageJson.scripts?.start && !packageJson.main) {
          result.warnings.push('No "start" script or "main" entry point found in package.json');
        }
      } catch {
        result.errors.push('No package.json found - ensure this is a Node.js project');
        result.isValid = false;
      }

      // Check for node_modules (should not be committed)
      const nodeModulesPath = path.join(repoPath, 'node_modules');
      try {
        const stat = await fs.stat(nodeModulesPath);
        if (stat.isDirectory()) {
          result.warnings.push('node_modules folder found in repository - this should typically be .gitignored');
        }
      } catch {
        // node_modules not found - this is good
      }

      // Check for .env files (security warning)
      const envFiles = ['.env', '.env.local', '.env.production'];
      for (const envFile of envFiles) {
        const envPath = path.join(repoPath, envFile);
        try {
          await fs.access(envPath);
          result.warnings.push(`Found ${envFile} in repository - sensitive data should not be committed`);
        } catch {
          // File not found - this is good
        }
      }

    } catch (error: any) {
      result.errors.push(`Validation error: ${error.message}`);
      result.isValid = false;
    }

    return result;
  }

  /**
   * Verify webhook signature for GitHub
   */
  verifyGitHubWebhook(payload: string, signature: string, secret: string): boolean {
    if (!signature || !signature.startsWith('sha256=')) {
      return false;
    }

    const hmac = crypto.createHmac('sha256', secret);
    const digest = 'sha256=' + hmac.update(payload).digest('hex');

    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(digest));
  }

  /**
   * Verify webhook signature for GitLab
   */
  verifyGitLabWebhook(token: string, secret: string): boolean {
    return crypto.timingSafeEqual(Buffer.from(token), Buffer.from(secret));
  }

  /**
   * Reset repository to clean state (dangerous - use with caution)
   */
  async resetRepository(repoPath: string): Promise<{ success: boolean; message: string }> {
    try {
      // Reset to HEAD and clean untracked files
      await execAsync('git reset --hard HEAD', { cwd: repoPath });
      await execAsync('git clean -fd', { cwd: repoPath });

      return {
        success: true,
        message: 'Repository reset to clean state',
      };
    } catch (error: any) {
      return {
        success: false,
        message: `Failed to reset repository: ${error.message}`,
      };
    }
  }

  /**
   * Check if repository needs dependency installation
   * Compares package.json and package-lock.json timestamps
   */
  async needsDependencyInstall(repoPath: string): Promise<boolean> {
    try {
      const packageJsonPath = path.join(repoPath, 'package.json');
      const packageLockPath = path.join(repoPath, 'package-lock.json');
      const nodeModulesPath = path.join(repoPath, 'node_modules');

      // If node_modules doesn't exist, definitely need to install
      try {
        await fs.access(nodeModulesPath);
      } catch {
        return true;
      }

      // Check if package-lock.json is newer than node_modules
      const packageLockStat = await fs.stat(packageLockPath);
      const nodeModulesStat = await fs.stat(nodeModulesPath);

      return packageLockStat.mtimeMs > nodeModulesStat.mtimeMs;
    } catch {
      // If we can't determine, assume we need to install
      return true;
    }
  }
}

export const gitService = new GitService();
