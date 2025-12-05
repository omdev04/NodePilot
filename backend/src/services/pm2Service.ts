import pm2 from 'pm2';
import { promisify } from 'util';

const pm2Connect = promisify(pm2.connect.bind(pm2));
const pm2List = promisify(pm2.list.bind(pm2));
const pm2Start = promisify(pm2.start.bind(pm2));
const pm2Stop = promisify(pm2.stop.bind(pm2));
const pm2Restart = promisify(pm2.restart.bind(pm2));
const pm2Delete = promisify(pm2.delete.bind(pm2));
const pm2Describe = promisify(pm2.describe.bind(pm2));

export interface PM2ProcessConfig {
  name: string;
  script: string;
  cwd: string;
  args?: string;
  interpreter?: string;
  env?: Record<string, string>;
  watch?: boolean;
  autorestart?: boolean;
  max_memory_restart?: string;
  error_file?: string;
  out_file?: string;
}

export class PM2Service {
  private connected = false;

  async connect() {
    if (!this.connected) {
      await pm2Connect();
      this.connected = true;
    }
  }

  async disconnect() {
    if (this.connected) {
      pm2.disconnect();
      this.connected = false;
    }
  }

  async startProcess(config: PM2ProcessConfig): Promise<any> {
    await this.connect();
    
    const processConfig: any = {
      name: config.name,
      script: config.script,
      cwd: config.cwd,
      autorestart: config.autorestart ?? true,
      watch: config.watch ?? false,
      max_memory_restart: config.max_memory_restart || '500M',
      env: config.env || {},
      // Prevent restart loops - app must run for 10s to be considered stable
      min_uptime: 10000,
      // Max 15 restarts within 1 minute before stopping
      max_restarts: 15,
      // Always merge logs to both PM2 default location and project directory
      merge_logs: true,
      // Log date format
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    };

    if (config.args) {
      processConfig.args = config.args;
    }

    if (config.interpreter) {
      processConfig.interpreter = config.interpreter;
      // On Windows, when interpreter is 'none', also set interpreter_args
      // to ensure PM2 doesn't default to node interpreter
      if (config.interpreter === 'none') {
        processConfig.interpreter_args = 'none';
      }
    }

    // Set log file paths - PM2 will write to both its default location and these
    if (config.error_file) {
      processConfig.error_file = config.error_file;
    }

    if (config.out_file) {
      processConfig.out_file = config.out_file;
    }

    return await pm2Start(processConfig);
  }

  async stopProcess(name: string): Promise<any> {
    await this.connect();
    return await pm2Stop(name);
  }

  async restartProcess(name: string): Promise<any> {
    await this.connect();
    return await pm2Restart(name);
  }

  async deleteProcess(name: string): Promise<any> {
    await this.connect();
    return await pm2Delete(name);
  }

  async getProcessList(): Promise<any[]> {
    await this.connect();
    return await pm2List();
  }

  async getProcessInfo(name: string): Promise<any> {
    await this.connect();
    const processes = await pm2Describe(name);
    return processes && processes.length > 0 ? processes[0] : null;
  }

  async getProcessStatus(name: string): Promise<string> {
    try {
      const info = await this.getProcessInfo(name);
      if (!info) return 'stopped';
      
      return info.pm2_env?.status || 'unknown';
    } catch (error) {
      return 'error';
    }
  }

  formatProcessInfo(process: any) {
    if (!process) return null;

    return {
      name: process.name,
      pid: process.pid,
      status: process.pm2_env?.status,
      uptime: process.pm2_env?.pm_uptime,
      cpu: process.monit?.cpu || 0,
      memory: process.monit?.memory || 0,
      restarts: process.pm2_env?.restart_time || 0,
    };
  }
}

export const pm2Service = new PM2Service();
