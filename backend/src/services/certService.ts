import fs from 'fs/promises';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { dbWrapper } from '../utils/database';

const execAsync = promisify(exec);

export class CertService {
  nginxSitesAvailable = process.env.NGINX_SITES_AVAILABLE || '/etc/nginx/sites-available';
  nginxSitesEnabled = process.env.NGINX_SITES_ENABLED || '/etc/nginx/sites-enabled';

  async createNginxConfig(projectName: string, domain: string, port: number) {
    const filename = `nodepilot-${projectName}`;
    const config = `server {
  listen 80;
  server_name ${domain};

  location / {
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header Host $http_host;
    proxy_set_header X-NginX-Proxy true;
    proxy_pass http://127.0.0.1:${port};
    proxy_redirect off;
  }
}
`;

    const filePath = path.join(this.nginxSitesAvailable, filename);
    try {
      await fs.writeFile(filePath, config, { mode: 0o644 });
    } catch (err) {
      // fallback to local repo nginx folder if no access; for dev environments
      const fallbackDir = path.join(process.cwd(), 'nginx-sites-available');
      await fs.mkdir(fallbackDir, { recursive: true });
      const fallbackPath = path.join(fallbackDir, filename);
      await fs.writeFile(fallbackPath, config, { mode: 0o644 });
      return fallbackPath;
    }

    // Symlink to sites-enabled
    try {
      const enabledPath = path.join(this.nginxSitesEnabled, filename);
      try {
        await fs.unlink(enabledPath).catch(() => {});
      } catch (err) {}
      await fs.symlink(filePath, enabledPath);
    } catch (err) {
      // ignore if symlink cannot be created (Windows or no permissions)
    }

    return filePath;
  }

  async reloadNginx() {
    try {
      await execAsync('sudo nginx -t');
      await execAsync('sudo systemctl reload nginx');
    } catch (err) {
      throw new Error(`Nginx reload failed: ${err}`);
    }
  }

  async obtainCertificate(domain: string, email: string | null) {
    // Ensure certbot installed
    try {
      await execAsync('which certbot');
    } catch (err) {
      // Try apt-get install (Debian/Ubuntu)
      try {
        await execAsync('sudo apt-get update -y');
        await execAsync('sudo apt-get install -y certbot python3-certbot-nginx');
      } catch (innerErr) {
        throw new Error('certbot not installed and automatic install failed');
      }
    }

    const emailArg = email ? `--email ${email}` : '--register-unsafely-without-email';
    const cmd = `sudo certbot --nginx -d ${domain} --non-interactive --agree-tos ${emailArg} --redirect`;
    try {
      const { stdout, stderr } = await execAsync(cmd);
      return { stdout, stderr };
    } catch (err) {
      throw new Error(`Certbot failed: ${err}`);
    }
  }

  async setupAutoRenew() {
    // Prefer systemd timer (certbot installs one automatically), but fall back to cron entry
    try {
      await execAsync('sudo systemctl is-active --quiet certbot.timer');
      // Timer exists; enable and start
      await execAsync('sudo systemctl enable certbot.timer');
      await execAsync('sudo systemctl start certbot.timer');
    } catch (err) {
      // set a cron entry
      try {
        // run renew daily at 3AM
        const cronLine = `0 3 * * * /usr/bin/certbot renew --quiet > /dev/null 2>&1`;
        const tmpFile = '/tmp/nodepilot_cert_cron';
        await execAsync(`(crontab -l 2>/dev/null || true) | { cat; echo "${cronLine}"; } > ${tmpFile} && crontab ${tmpFile} && rm -f ${tmpFile}`);
      } catch (cronErr) {
        // last resort: do nothing
      }
    }
  }

  async parseCertPaths(domain: string) {
    // Certbot stores certs in /etc/letsencrypt/live/<domain>
    const liveDir = `/etc/letsencrypt/live/${domain}`;
    const cert = path.join(liveDir, 'fullchain.pem');
    const key = path.join(liveDir, 'privkey.pem');
    // Try to fetch expiry
    let expiresAt: string | undefined;
    try {
      const { stdout } = await execAsync(`sudo openssl x509 -enddate -noout -in ${cert}`);
      // stdout will be 'notAfter=Aug 29 12:00:00 2026 GMT'
      const match = stdout.match(/notAfter=(.*)/);
      if (match && match[1]) {
        expiresAt = new Date(match[1]).toISOString();
      }
    } catch (err) {
      // ignore, not critical
    }
    return { cert, key, expiresAt };
  }

  async saveCertToDb(projectId: number, domain: string, certPath?: string, keyPath?: string, expiresAt?: string) {
    dbWrapper.prepare(`INSERT INTO domains (project_id, domain, cert_path, key_path, expires_at) VALUES (?, ?, ?, ?, ?)`).run(projectId, domain, certPath || null, keyPath || null, expiresAt || null);
  }
}

export const certService = new CertService();
