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
  private readonly logDir: string;

  /**
   * Initializes GitService with log directory path
   */
  constructor() {
    this.logDir = process.env.LOG_DIR || path.join(process.cwd(), '../logs');
  }

  /**
   * Ensures the log directory exists, creating it if necessary
   * @returns Promise that resolves when directory is ready
   */
  private async ensureLogDir(): Promise<void> {
    await fs.mkdir(this.logDir, { recursive: true });
  }

  /**
   * Inject OAuth token into Git URL for authenticated access
   * @param url - The Git repository URL to authenticate
   * @param token - OAuth access token
   * @param provider - Git provider (github, gitlab, or bitbucket)
   * @returns Authenticated URL with embedded credentials
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
   * @param url - The repository URL to validate and sanitize
   * @returns Validation result with sanitized URL or error message
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
   * @param branch - Branch name to validate and sanitize
   * @returns Validation result with sanitized branch name or error message
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
   * Clone a Git repository with security checks and OAuth support
   * @param options - Clone configuration including URL, branch, target path, and OAuth credentials
   * @returns Result object with success status, message, and operation logs
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
      const command = this.buildCloneCommand(finalUrl, sanitizedBranch, options.targetPath, options.shallow, options.depth);
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

      return {
        success: false,
        message: this.parseGitCloneError(error, sanitizedBranch),
        logs,
      };
    }
  }

  /**
   * Pull latest changes from Git repository with auto-reset on uncommitted changes
   * @param options - Pull configuration including repository path, branch, and OAuth credentials
   * @returns Result object with success status, message, changes summary, and operation logs
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

      // Check for uncommitted changes and auto-reset
      const statusCheck = await execAsync('git status --porcelain', {
        cwd: options.repoPath,
      });

      if (statusCheck.stdout.trim()) {
        console.log('⚠️  Uncommitted changes detected, auto-resetting...');
        logs += '⚠️  Uncommitted changes detected:\n' + statusCheck.stdout + '\n';
        
        // Reset to remote state (discard local changes)
        await execAsync('git reset --hard HEAD', {
          cwd: options.repoPath,
        });
        
        // Clean untracked files
        await execAsync('git clean -fd', {
          cwd: options.repoPath,
        });
        
        logs += '✅ Repository reset to clean state\n';
        console.log('✅ Repository reset to clean state');
      }

      // Update remote URL with OAuth token if provided
      if (options.oauthToken && options.oauthProvider) {
        await this.updateRemoteWithOAuth(options.repoPath, options.oauthToken, options.oauthProvider);
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
   * List available remote branches in a repository
   * @param repoPath - Absolute path to the Git repository
   * @returns Result object with success status and array of branch names
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
   * Get current branch and commit information from repository
   * @param repoPath - Absolute path to the Git repository
   * @returns Repository information including branch, commit hash, message, author, and date
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
   * Validate a cloned repository structure for Node.js project requirements
   * @param repoPath - Absolute path to the repository to validate
   * @returns Validation result with flags for required components, errors, and warnings
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
      await this.validateGitFolder(repoPath, result);

      // Check for package.json
      await this.validatePackageJson(repoPath, result);

      // Check for node_modules (should not be committed)
      await this.checkNodeModules(repoPath, result);

      // Check for .env files (security warning)
      await this.checkEnvFiles(repoPath, result);

    } catch (error: any) {
      result.errors.push(`Validation error: ${error.message}`);
      result.isValid = false;
    }

    return result;
  }

  /**
   * Verify webhook signature for GitHub using HMAC-SHA256
   * @param payload - Raw webhook payload string
   * @param signature - GitHub signature header (X-Hub-Signature-256)
   * @param secret - Webhook secret configured in GitHub
   * @returns True if signature is valid, false otherwise
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
   * Verify webhook token for GitLab
   * @param token - GitLab webhook token from X-Gitlab-Token header
   * @param secret - Webhook secret configured in GitLab
   * @returns True if token matches secret, false otherwise
   */
  verifyGitLabWebhook(token: string, secret: string): boolean {
    return crypto.timingSafeEqual(Buffer.from(token), Buffer.from(secret));
  }

  /**
   * Reset repository to clean state, discarding all uncommitted changes
   * WARNING: This operation is destructive and cannot be undone
   * @param repoPath - Absolute path to the repository to reset
   * @returns Result object with success status and message
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
   * Check if repository needs dependency installation by comparing file timestamps
   * Returns true if node_modules is missing or package-lock.json is newer
   * @param repoPath - Absolute path to the repository
   * @returns True if npm install should be run, false otherwise
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

  /**
   * Parse Git clone error and return user-friendly message
   * @param error - Error object from git clone operation
   * @param branchName - Branch name that was attempted
   * @returns User-friendly error message
   */
  private parseGitCloneError(error: any, branchName: string): string {
    const fullError = `${error.message} ${error.stderr || ''}`.toLowerCase();
    
    if (fullError.includes('repository not found') || fullError.includes('could not read')) {
      return 'Repository not found or access denied. Check the URL and permissions.';
    } else if (fullError.includes('branch') && fullError.includes('not found')) {
      return `Branch "${branchName}" not found in repository.`;
    } else if (fullError.includes('authentication') || fullError.includes('credentials')) {
      return 'Authentication failed. Repository may be private or token is invalid.';
    } else if (fullError.includes('timeout')) {
      return 'Clone operation timed out. Repository may be too large or network is slow.';
    } else if (fullError.includes('fatal')) {
      return `Git error: ${error.stderr || error.message}`;
    }
    
    return 'Failed to clone repository';
  }

  /**
   * Build git clone command with security and options
   * @param url - Repository URL to clone
   * @param branch - Branch name to clone
   * @param targetPath - Target directory path
   * @param shallow - Whether to perform shallow clone
   * @param depth - Clone depth for shallow clone
   * @returns Complete git clone command string
   */
  private buildCloneCommand(url: string, branch: string, targetPath: string, shallow?: boolean, depth?: number): string {
    const cloneArgs = [
      'clone',
      '--branch', branch,
      '--single-branch',
    ];

    if (shallow || depth) {
      cloneArgs.push('--depth', String(depth || 1));
    }

    cloneArgs.push(url, targetPath);

    return `git ${cloneArgs.join(' ')}`;
  }

  /**
   * Update remote URL with OAuth token for authenticated operations
   * @param repoPath - Path to the repository
   * @param token - OAuth access token
   * @param provider - Git provider (github, gitlab, or bitbucket)
   */
  private async updateRemoteWithOAuth(repoPath: string, token: string, provider: 'github' | 'gitlab' | 'bitbucket'): Promise<void> {
    const remoteUrlResult = await execAsync('git remote get-url origin', {
      cwd: repoPath,
    });
    const currentUrl = remoteUrlResult.stdout.trim();
    const authenticatedUrl = this.injectOAuthToken(currentUrl, token, provider);
    
    // Temporarily set remote URL with token for this operation
    await execAsync(`git remote set-url origin "${authenticatedUrl}"`, {
      cwd: repoPath,
    });
  }

  /**
   * Validate that repository has .git folder
   * @param repoPath - Path to the repository
   * @param result - Validation result object to update
   */
  private async validateGitFolder(repoPath: string, result: GitValidationResult): Promise<void> {
    const gitPath = path.join(repoPath, '.git');
    try {
      await fs.access(gitPath);
      result.hasGitFolder = true;
    } catch {
      result.errors.push('Missing .git folder - not a valid Git repository');
      result.isValid = false;
    }
  }

  /**
   * Validate package.json existence and content
   * @param repoPath - Path to the repository
   * @param result - Validation result object to update
   */
  private async validatePackageJson(repoPath: string, result: GitValidationResult): Promise<void> {
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
  }

  /**
   * Check for node_modules folder in repository (should not be committed)
   * @param repoPath - Path to the repository
   * @param result - Validation result object to update
   */
  private async checkNodeModules(repoPath: string, result: GitValidationResult): Promise<void> {
    const nodeModulesPath = path.join(repoPath, 'node_modules');
    try {
      const stat = await fs.stat(nodeModulesPath);
      if (stat.isDirectory()) {
        result.warnings.push('node_modules folder found in repository - this should typically be .gitignored');
      }
    } catch {
      // node_modules not found - this is good
    }
  }

  /**
   * Check for .env files in repository (security warning)
   * @param repoPath - Path to the repository
   * @param result - Validation result object to update
   */
  private async checkEnvFiles(repoPath: string, result: GitValidationResult): Promise<void> {
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
  }
}

export const gitService = new GitService();
