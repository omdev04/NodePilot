import fs from 'fs/promises';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { dbWrapper } from '../utils/database';

const execAsync = promisify(exec);

export class CaddyService {
  caddyConfigPath = process.env.CADDY_CONFIG_PATH || '/etc/caddy/Caddyfile';
  caddyProjectsConfigPath = process.env.CADDY_PROJECTS_CONFIG_PATH || '/etc/caddy/projects';
  
  constructor() {
    // Ensure projects config directory exists
    this.ensureProjectsConfigDir();
  }

  async ensureProjectsConfigDir() {
    try {
      const projectsDir = path.dirname(this.caddyProjectsConfigPath);
      await fs.mkdir(projectsDir, { recursive: true });
    } catch (err) {
      console.warn('Could not create Caddy projects config directory:', err);
    }
  }

  /**
   * Create a Caddy configuration block for a project with a custom domain
   * Caddy automatically handles SSL via Let's Encrypt
   */
  async createCaddyConfig(projectName: string, domain: string, port: number, email?: string) {
    const filename = `${projectName}.caddy`;
    
    // Caddy configuration with automatic HTTPS
    const config = `# ${projectName} - Auto-managed by NodePilot
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

    // Write to projects config directory
    const configDir = this.caddyProjectsConfigPath;
    await fs.mkdir(configDir, { recursive: true });
    
    const filePath = path.join(configDir, filename);
    try {
      await fs.writeFile(filePath, config, { mode: 0o644 });
      console.log(`✅ Created Caddy config for ${projectName} at ${filePath}`);
    } catch (err) {
      // Fallback to local directory if no permissions
      const fallbackDir = path.join(process.cwd(), 'caddy-projects');
      await fs.mkdir(fallbackDir, { recursive: true });
      const fallbackPath = path.join(fallbackDir, filename);
      await fs.writeFile(fallbackPath, config, { mode: 0o644 });
      console.log(`⚠️  Created Caddy config at fallback location: ${fallbackPath}`);
      return fallbackPath;
    }

    return filePath;
  }

  /**
   * Remove Caddy configuration for a project
   */
  async removeCaddyConfig(projectName: string) {
    const filename = `${projectName}.caddy`;
    const filePath = path.join(this.caddyProjectsConfigPath, filename);
    
    try {
      await fs.unlink(filePath);
      console.log(`✅ Removed Caddy config for ${projectName}`);
    } catch (err) {
      console.warn(`Could not remove Caddy config for ${projectName}:`, err);
    }
    
    // Also try fallback location
    try {
      const fallbackPath = path.join(process.cwd(), 'caddy-projects', filename);
      await fs.unlink(fallbackPath);
    } catch (err) {
      // Ignore fallback cleanup errors
    }
  }

  /**
   * Reload Caddy configuration without downtime
   * Caddy supports graceful reloads
   */
  async reloadCaddy() {
    try {
      // Validate config first
      await execAsync('sudo caddy validate --config ' + this.caddyConfigPath);
      
      // Graceful reload
      await execAsync('sudo caddy reload --config ' + this.caddyConfigPath);
      console.log('✅ Caddy reloaded successfully');
    } catch (err: any) {
      throw new Error(`Caddy reload failed: ${err.message}`);
    }
  }

  /**
   * Setup SSL for a domain
   * With Caddy, SSL is automatic - just need to reload config
   */
  async setupSSL(domain: string, email: string | null) {
    // Caddy handles SSL automatically when domain is configured
    // Just ensure Caddy is running and config is loaded
    try {
      // Check if Caddy is running
      await execAsync('sudo systemctl is-active caddy');
      console.log(`✅ Caddy is running - SSL will be obtained automatically for ${domain}`);
      
      // Reload to apply changes
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
   * Check SSL certificate status for a domain
   */
  async checkSSLStatus(domain: string) {
    try {
      // Query Caddy's certificate storage
      const certPath = `/var/lib/caddy/.local/share/caddy/certificates/acme-v02.api.letsencrypt.org-directory/${domain}`;
      
      // Check if certificate exists
      try {
        const certFile = path.join(certPath, `${domain}.crt`);
        const stat = await fs.stat(certFile);
        
        // Read certificate to get expiry
        const { stdout } = await execAsync(`sudo openssl x509 -enddate -noout -in "${certFile}"`);
        const match = stdout.match(/notAfter=(.*)/);
        
        if (match && match[1]) {
          const expiresAt = new Date(match[1]).toISOString();
          return {
            hasCertificate: true,
            expiresAt,
            autoRenew: true,
            provider: 'Let\'s Encrypt (via Caddy)'
          };
        }
      } catch (err) {
        // Certificate not found or not readable
        return {
          hasCertificate: false,
          message: 'Certificate not yet obtained. Caddy will obtain it automatically on first HTTPS request.'
        };
      }
    } catch (err) {
      console.warn('Error checking SSL status:', err);
      return {
        hasCertificate: false,
        message: 'Unable to check certificate status'
      };
    }
  }

  /**
   * Save domain configuration to database
   * Note: We don't store cert paths anymore as Caddy manages everything
   */
  async saveDomainToDb(projectId: number, domain: string) {
    try {
      // Check if domains table has old cert_path columns
      const tableInfo = dbWrapper.prepare(`PRAGMA table_info(domains)`).all() as any[];
      const hasCertPathColumns = tableInfo.some((col: any) => col.name === 'cert_path');
      
      if (hasCertPathColumns) {
        // Old schema with cert_path columns
        dbWrapper.prepare(`
          INSERT INTO domains (project_id, domain, cert_path, key_path, expires_at) 
          VALUES (?, ?, ?, ?, ?)
        `).run(projectId, domain, null, null, null);
      } else {
        // New schema without cert_path columns
        dbWrapper.prepare(`
          INSERT INTO domains (project_id, domain) 
          VALUES (?, ?)
        `).run(projectId, domain);
      }
      
      console.log(`✅ Saved domain ${domain} for project ${projectId}`);
    } catch (err) {
      console.error('Error saving domain to database:', err);
      throw err;
    }
  }

  /**
   * Remove domain from database
   */
  async removeDomainFromDb(domain: string) {
    try {
      dbWrapper.prepare('DELETE FROM domains WHERE domain = ?').run(domain);
      console.log(`✅ Removed domain ${domain} from database`);
    } catch (err) {
      console.error('Error removing domain from database:', err);
      throw err;
    }
  }

  /**
   * Get main Caddyfile content with imports
   */
  async getMainCaddyfile() {
    const mainConfig = `# NodePilot Main Caddyfile
# This file is auto-managed - be careful with manual edits

# Global options
{
    # Email for Let's Encrypt notifications
    email ${process.env.LETSENCRYPT_EMAIL || 'admin@example.com'}
    
    # Automatic HTTPS
    auto_https on
    
    # Admin API (localhost only for security)
    admin localhost:2019
}

# Import all project configurations
import ${this.caddyProjectsConfigPath}/*.caddy

# NodePilot Management Interface
${process.env.NODEPILOT_DOMAIN || ':9002'} {
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
    return mainConfig;
  }

  /**
   * Initialize or update main Caddyfile
   */
  async initializeCaddyfile() {
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
   * Check if Caddy is installed
   */
  async checkCaddyInstalled() {
    try {
      await execAsync('which caddy');
      return true;
    } catch (err) {
      return false;
    }
  }

  /**
   * Install Caddy (Debian/Ubuntu)
   */
  async installCaddy() {
    try {
      console.log('📦 Installing Caddy...');
      
      // Official Caddy installation for Debian/Ubuntu
      await execAsync('sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https curl');
      await execAsync('curl -1sLf "https://dl.cloudsmith.io/public/caddy/stable/gpg.key" | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg');
      await execAsync('curl -1sLf "https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt" | sudo tee /etc/apt/sources.list.d/caddy-stable.list');
      await execAsync('sudo apt update');
      await execAsync('sudo apt install -y caddy');
      
      console.log('✅ Caddy installed successfully');
      return true;
    } catch (err: any) {
      throw new Error(`Failed to install Caddy: ${err.message}`);
    }
  }

  /**
   * Start Caddy service
   */
  async startCaddy() {
    try {
      await execAsync('sudo systemctl enable caddy');
      await execAsync('sudo systemctl start caddy');
      console.log('✅ Caddy service started');
    } catch (err: any) {
      throw new Error(`Failed to start Caddy: ${err.message}`);
    }
  }

  /**
   * Stop Caddy service
   */
  async stopCaddy() {
    try {
      await execAsync('sudo systemctl stop caddy');
      console.log('✅ Caddy service stopped');
    } catch (err: any) {
      throw new Error(`Failed to stop Caddy: ${err.message}`);
    }
  }

  /**
   * Get Caddy service status
   */
  async getCaddyStatus() {
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
