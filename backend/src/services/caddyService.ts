import fs from 'fs/promises';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { dbWrapper } from '../utils/database';

const execAsync = promisify(exec);

/**
 * CaddyService manages Caddy web server configuration for automatic HTTPS and reverse proxying.
 * Handles domain configuration, SSL certificates, and service management.
 */
export class CaddyService {
  private readonly caddyConfigPath: string;
  private readonly caddyProjectsConfigPath: string;
  
  constructor() {
    this.caddyConfigPath = process.env.CADDY_CONFIG_PATH || '/etc/caddy/Caddyfile';
    this.caddyProjectsConfigPath = process.env.CADDY_PROJECTS_CONFIG_PATH || '/etc/caddy/projects';
    this.ensureProjectsConfigDir();
  }

  /**
   * Ensures the Caddy projects configuration directory exists.
   */
  private async ensureProjectsConfigDir(): Promise<void> {
    try {
      const projectsDir = path.dirname(this.caddyProjectsConfigPath);
      await fs.mkdir(projectsDir, { recursive: true });
    } catch (err) {
      console.warn('Could not create Caddy projects config directory:', err);
    }
  }

  /**
   * Generates the Caddy configuration content for a project.
   * @param projectName Project name
   * @param domain Domain name
   * @param port Port number
   * @param email Optional email for Let's Encrypt
   * @returns Caddy configuration string
   */
  private generateCaddyConfigContent(projectName: string, domain: string, port: number, email?: string): string {
    return `# ${projectName} - Auto-managed by NodePilot
${domain} {
    # Automatic HTTPS via Let's Encrypt
    ${email ? `tls ${email}` : '# Using default email from main Caddyfile'}
    
    # Reverse proxy to project
    reverse_proxy localhost:${port} {
        header_up X-Real-IP {remote_host}
        header_up X-Forwarded-For {remote_host}
        header_up X-Forwarded-Proto {scheme}
        header_up Host {host}
    }
    
    # Security headers
    header {
        X-Content-Type-Options "nosniff"
        X-Frame-Options "SAMEORIGIN"
        X-XSS-Protection "1; mode=block"
        Referrer-Policy "strict-origin-when-cross-origin"
        -Server
    }
    
    # Logging
    log {
        output file /var/log/caddy/${projectName}.log {
            roll_size 50mb
            roll_keep 5
        }
    }
}
`;
  }

  /**
   * Writes Caddy configuration to file with fallback handling.
   * @param filename Configuration filename
   * @param config Configuration content
   * @returns Path to the created configuration file
   */
  private async writeConfigFile(filename: string, config: string): Promise<string> {
    const configDir = this.caddyProjectsConfigPath;
    await fs.mkdir(configDir, { recursive: true });
    
    const filePath = path.join(configDir, filename);
    try {
      await fs.writeFile(filePath, config, { mode: 0o644 });
      console.log(`✅ Created Caddy config at ${filePath}`);
      return filePath;
    } catch (err) {
      // Fallback to local directory if no permissions
      return await this.writeFallbackConfig(filename, config);
    }
  }

  /**
   * Writes configuration to fallback location when primary location fails.
   * @param filename Configuration filename
   * @param config Configuration content
   * @returns Path to the fallback configuration file
   */
  private async writeFallbackConfig(filename: string, config: string): Promise<string> {
    const fallbackDir = path.join(process.cwd(), 'caddy-projects');
    await fs.mkdir(fallbackDir, { recursive: true });
    const fallbackPath = path.join(fallbackDir, filename);
    await fs.writeFile(fallbackPath, config, { mode: 0o644 });
    console.log(`⚠️  Created Caddy config at fallback location: ${fallbackPath}`);
    return fallbackPath;
  }

  /**
   * Creates a Caddy configuration block for a project with a custom domain.
   * Caddy automatically handles SSL via Let's Encrypt.
   * @param projectName Project name
   * @param domain Domain name
   * @param port Port number
   * @param email Optional email for SSL notifications
   * @returns Path to the created configuration file
   */
  async createCaddyConfig(projectName: string, domain: string, port: number, email?: string): Promise<string> {
    const filename = `${projectName}.caddy`;
    const config = this.generateCaddyConfigContent(projectName, domain, port, email);
    return await this.writeConfigFile(filename, config);
  }

  /**
   * Removes Caddy configuration files for a project.
   * Attempts to remove from both primary and fallback locations.
   * @param projectName Project name
   */
  async removeCaddyConfig(projectName: string): Promise<void> {
    const filename = `${projectName}.caddy`;
    
    await this.removeConfigFromPrimaryLocation(projectName, filename);
    await this.removeConfigFromFallbackLocation(filename);
  }

  /**
   * Removes configuration from primary location.
   * @param projectName Project name
   * @param filename Configuration filename
   */
  private async removeConfigFromPrimaryLocation(projectName: string, filename: string): Promise<void> {
    const filePath = path.join(this.caddyProjectsConfigPath, filename);
    try {
      await fs.unlink(filePath);
      console.log(`✅ Removed Caddy config for ${projectName}`);
    } catch (err) {
      console.warn(`Could not remove Caddy config for ${projectName}:`, err);
    }
  }

  /**
   * Removes configuration from fallback location.
   * @param filename Configuration filename
   */
  private async removeConfigFromFallbackLocation(filename: string): Promise<void> {
    try {
      const fallbackPath = path.join(process.cwd(), 'caddy-projects', filename);
      await fs.unlink(fallbackPath);
    } catch (err) {
      // Ignore fallback cleanup errors
    }
  }

  /**
   * Validates the Caddy configuration.
   * @throws Error if validation fails
   */
  private async validateCaddyConfig(): Promise<void> {
    await execAsync('sudo caddy validate --config ' + this.caddyConfigPath);
  }

  /**
   * Performs a graceful reload of Caddy configuration.
   * @throws Error if reload fails
   */
  private async performCaddyReload(): Promise<void> {
    await execAsync('sudo caddy reload --config ' + this.caddyConfigPath);
    console.log('✅ Caddy reloaded successfully');
  }

  /**
   * Reloads Caddy configuration without downtime.
   * Validates configuration before reloading.
   * @throws Error if validation or reload fails
   */
  async reloadCaddy(): Promise<void> {
    try {
      await this.validateCaddyConfig();
      await this.performCaddyReload();
    } catch (err: any) {
      throw new Error(`Caddy reload failed: ${err.message}`);
    }
  }

  /**
   * Checks if Caddy service is active.
   * @throws Error if Caddy is not running
   */
  private async ensureCaddyRunning(): Promise<void> {
    await execAsync('sudo systemctl is-active caddy');
  }

  /**
   * Sets up SSL for a domain using Caddy's automatic HTTPS.
   * With Caddy, SSL is automatic - just ensures service is running and reloads config.
   * @param domain Domain name
   * @param email Optional email for SSL notifications
   * @returns Success status and message
   * @throws Error if setup fails
   */
  async setupSSL(domain: string, email: string | null): Promise<{ success: boolean; message: string }> {
    try {
      await this.ensureCaddyRunning();
      console.log(`✅ Caddy is running - SSL will be obtained automatically for ${domain}`);
      
      await this.reloadCaddy();
      
      return {
        success: true,
        message: `SSL will be automatically obtained for ${domain}. Caddy uses Let's Encrypt by default.`
      };
    } catch (err: any) {
      throw new Error(`Failed to setup SSL: ${err.message}`);
    }
  }

  /**
   * Gets the path to the certificate file for a domain.
   * @param domain Domain name
   * @returns Certificate file path
   */
  private getCertificatePath(domain: string): string {
    const certDir = `/var/lib/caddy/.local/share/caddy/certificates/acme-v02.api.letsencrypt.org-directory/${domain}`;
    return path.join(certDir, `${domain}.crt`);
  }

  /**
   * Extracts certificate expiration date from OpenSSL output.
   * @param domain Domain name
   * @returns Certificate expiration date or null
   */
  private async getCertificateExpiry(domain: string): Promise<string | null> {
    try {
      const certFile = this.getCertificatePath(domain);
      await fs.stat(certFile);
      
      const { stdout } = await execAsync(`sudo openssl x509 -enddate -noout -in "${certFile}"`);
      const match = stdout.match(/notAfter=(.*)/);
      
      return match && match[1] ? new Date(match[1]).toISOString() : null;
    } catch (err) {
      return null;
    }
  }

  /**
   * Checks SSL certificate status for a domain.
   * @param domain Domain name
   * @returns Certificate status information
   */
  async checkSSLStatus(domain: string): Promise<{
    hasCertificate: boolean;
    expiresAt?: string;
    autoRenew?: boolean;
    provider?: string;
    message?: string;
  }> {
    try {
      const expiresAt = await this.getCertificateExpiry(domain);
      
      if (expiresAt) {
        return {
          hasCertificate: true,
          expiresAt,
          autoRenew: true,
          provider: 'Let\'s Encrypt (via Caddy)'
        };
      }
      
      return {
        hasCertificate: false,
        message: 'Certificate not yet obtained. Caddy will obtain it automatically on first HTTPS request.'
      };
    } catch (err) {
      console.warn('Error checking SSL status:', err);
      return {
        hasCertificate: false,
        message: 'Unable to check certificate status'
      };
    }
  }

  /**
   * Checks if the domains table has legacy cert_path columns.
   * @returns True if cert_path column exists
   */
  private hasLegacyCertPathColumns(): boolean {
    const tableInfo = dbWrapper.prepare(`PRAGMA table_info(domains)`).all() as any[];
    return tableInfo.some((col: any) => col.name === 'cert_path');
  }

  /**
   * Inserts domain using legacy schema (with cert_path columns).
   * @param projectId Project ID
   * @param domain Domain name
   */
  private insertDomainLegacy(projectId: number, domain: string): void {
    dbWrapper.prepare(`
      INSERT INTO domains (project_id, domain, cert_path, key_path, expires_at) 
      VALUES (?, ?, ?, ?, ?)
    `).run(projectId, domain, null, null, null);
  }

  /**
   * Inserts domain using new schema (without cert_path columns).
   * @param projectId Project ID
   * @param domain Domain name
   */
  private insertDomainNew(projectId: number, domain: string): void {
    dbWrapper.prepare(`
      INSERT INTO domains (project_id, domain) 
      VALUES (?, ?)
    `).run(projectId, domain);
  }

  /**
   * Saves domain configuration to database.
   * Supports both legacy and new database schemas.
   * Note: Certificate paths are not stored as Caddy manages them automatically.
   * @param projectId Project ID
   * @param domain Domain name
   * @throws Error if database operation fails
   */
  async saveDomainToDb(projectId: number, domain: string): Promise<void> {
    try {
      if (this.hasLegacyCertPathColumns()) {
        this.insertDomainLegacy(projectId, domain);
      } else {
        this.insertDomainNew(projectId, domain);
      }
      
      console.log(`✅ Saved domain ${domain} for project ${projectId}`);
    } catch (err) {
      console.error('Error saving domain to database:', err);
      throw err;
    }
  }

  /**
   * Removes domain from database.
   * @param domain Domain name
   * @throws Error if database operation fails
   */
  async removeDomainFromDb(domain: string): Promise<void> {
    try {
      dbWrapper.prepare('DELETE FROM domains WHERE domain = ?').run(domain);
      console.log(`✅ Removed domain ${domain} from database`);
    } catch (err) {
      console.error('Error removing domain from database:', err);
      throw err;
    }
  }

  /**
   * Generates the main Caddyfile content with global options and imports.
   * @returns Main Caddyfile configuration string
   */
  async getMainCaddyfile(): Promise<string> {
    const letsEncryptEmail = process.env.LETSENCRYPT_EMAIL || 'admin@example.com';
    const nodePilotDomain = process.env.NODEPILOT_DOMAIN || ':9002';
    
    return `# NodePilot Main Caddyfile
# This file is auto-managed - be careful with manual edits

# Global options
{
    # Email for Let's Encrypt notifications
    email ${letsEncryptEmail}
    
    # Automatic HTTPS
    auto_https on
    
    # Admin API (localhost only for security)
    admin localhost:2019
}

# Import all project configurations
import ${this.caddyProjectsConfigPath}/*.caddy

# NodePilot Management Interface
${nodePilotDomain} {
    # Frontend
    handle /* {
        reverse_proxy localhost:9000
    }
    
    # Backend API
    handle /api/* {
        reverse_proxy localhost:9001
    }
}
`;
  }

  /**
   * Initializes or updates the main Caddyfile.
   * @returns True on success
   * @throws Error if initialization fails
   */
  async initializeCaddyfile(): Promise<boolean> {
    try {
      const mainConfig = await this.getMainCaddyfile();
      await fs.writeFile(this.caddyConfigPath, mainConfig, { mode: 0o644 });
      console.log('✅ Initialized main Caddyfile');
      return true;
    } catch (err) {
      console.error('Error initializing Caddyfile:', err);
      throw err;
    }
  }

  /**
   * Checks if Caddy is installed on the system.
   * @returns True if Caddy is installed
   */
  async checkCaddyInstalled(): Promise<boolean> {
    try {
      await execAsync('which caddy');
      return true;
    } catch (err) {
      return false;
    }
  }

  /**
   * Installs required dependencies for Caddy installation.
   */
  private async installCaddyDependencies(): Promise<void> {
    await execAsync('sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https curl');
  }

  /**
   * Adds Caddy repository GPG key.
   */
  private async addCaddyGpgKey(): Promise<void> {
    await execAsync('curl -1sLf "https://dl.cloudsmith.io/public/caddy/stable/gpg.key" | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg');
  }

  /**
   * Adds Caddy repository to apt sources.
   */
  private async addCaddyRepository(): Promise<void> {
    await execAsync('curl -1sLf "https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt" | sudo tee /etc/apt/sources.list.d/caddy-stable.list');
  }

  /**
   * Installs Caddy package from repository.
   */
  private async installCaddyPackage(): Promise<void> {
    await execAsync('sudo apt update');
    await execAsync('sudo apt install -y caddy');
  }

  /**
   * Installs Caddy web server on Debian/Ubuntu systems.
   * @returns True on success
   * @throws Error if installation fails
   */
  async installCaddy(): Promise<boolean> {
    try {
      console.log('📦 Installing Caddy...');
      
      await this.installCaddyDependencies();
      await this.addCaddyGpgKey();
      await this.addCaddyRepository();
      await this.installCaddyPackage();
      
      console.log('✅ Caddy installed successfully');
      return true;
    } catch (err: any) {
      throw new Error(`Failed to install Caddy: ${err.message}`);
    }
  }

  /**
   * Starts and enables Caddy service.
   * @throws Error if start fails
   */
  async startCaddy(): Promise<void> {
    try {
      await execAsync('sudo systemctl enable caddy');
      await execAsync('sudo systemctl start caddy');
      console.log('✅ Caddy service started');
    } catch (err: any) {
      throw new Error(`Failed to start Caddy: ${err.message}`);
    }
  }

  /**
   * Stops Caddy service.
   * @throws Error if stop fails
   */
  async stopCaddy(): Promise<void> {
    try {
      await execAsync('sudo systemctl stop caddy');
      console.log('✅ Caddy service stopped');
    } catch (err: any) {
      throw new Error(`Failed to stop Caddy: ${err.message}`);
    }
  }

  /**
   * Gets Caddy service status.
   * @returns Service status information
   */
  async getCaddyStatus(): Promise<{ running: boolean; status: string }> {
    try {
      const { stdout } = await execAsync('sudo systemctl status caddy');
      return {
        running: true,
        status: stdout
      };
    } catch (err) {
      return {
        running: false,
        status: 'Caddy is not running'
      };
    }
  }
}

export const caddyService = new CaddyService();
