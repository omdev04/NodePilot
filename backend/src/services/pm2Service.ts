
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

/**
 * PM2Service provides a clean abstraction for managing Node.js processes using PM2.
 * All methods are asynchronous and handle connection management automatically.
 */
export class PM2Service {
  private connected = false;


  /**
   * Establishes a connection to the PM2 daemon if not already connected.
   */
  private async connect() {
    if (!this.connected) {
      await pm2Connect();
      this.connected = true;
    }
  }

  /**
   * Disconnects from the PM2 daemon if connected.
   */
  async disconnect() {
    if (this.connected) {
      pm2.disconnect();
      this.connected = false;
    }
  }

  /**
   * Starts a new process with the given configuration.
   * @param config PM2ProcessConfig
   */
  async startProcess(config: PM2ProcessConfig): Promise<any> {
    await this.connect();
    const processConfig = this.buildProcessConfig(config);
    return await pm2Start(processConfig);
  }

  /**
   * Stops a running process by name.
   * @param name Process name
   */
  async stopProcess(name: string): Promise<any> {
    await this.connect();
    return await pm2Stop(name);
  }

  /**
   * Restarts a process by name.
   * @param name Process name
   */
  async restartProcess(name: string): Promise<any> {
    await this.connect();
    return await pm2Restart(name);
  }

  /**
   * Deletes a process by name. Ignores error if process does not exist.
   * @param name Process name
   */
  async deleteProcess(name: string): Promise<any> {
    await this.connect();
    try {
      return await pm2Delete(name);
    } catch (error: any) {
      if (error.message?.includes('not found')) {
        return null;
      }
      throw error;
    }
  }

  /**
   * Returns the list of all PM2 processes.
   */
  async getProcessList(): Promise<any[]> {
    await this.connect();
    return await pm2List();
  }

  /**
   * Returns detailed info for a process by name.
   * @param name Process name
   */
  async getProcessInfo(name: string): Promise<any> {
    await this.connect();
    const processes = await pm2Describe(name);
    return processes && processes.length > 0 ? processes[0] : null;
  }

  /**
   * Returns the status string for a process by name.
   * @param name Process name
   */
  async getProcessStatus(name: string): Promise<string> {
    try {
      const info = await this.getProcessInfo(name);
      if (!info) return 'stopped';
      return info.pm2_env?.status || 'unknown';
    } catch (error) {
      return 'error';
    }
  }

  /**
   * Formats a PM2 process object into a summary with key metrics.
   * @param process PM2 process object
   */
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
      actualPort: this.extractActualPort(process),
    };
  }

  /**
   * Builds the PM2 process configuration object from user config.
   * @param config PM2ProcessConfig
   */
  private buildProcessConfig(config: PM2ProcessConfig): any {
    const processConfig: any = {
      name: config.name,
      script: config.script,
      cwd: config.cwd,
      autorestart: config.autorestart ?? true,
      watch: config.watch ?? false,
      max_memory_restart: config.max_memory_restart || '500M',
      env: config.env || {},
      min_uptime: 10000, // Prevent restart loops - app must run for 10s to be considered stable
      max_restarts: 15,  // Max 15 restarts within 1 minute before stopping
      merge_logs: true,  // Always merge logs to both PM2 default location and project directory
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    };
    if (config.args) {
      processConfig.args = config.args;
    }
    if (config.interpreter) {
      processConfig.interpreter = config.interpreter;
      if (config.interpreter === 'none') {
        processConfig.interpreter_args = 'none';
      }
    }
    if (config.error_file) {
      processConfig.error_file = config.error_file;
    }
    if (config.out_file) {
      processConfig.out_file = config.out_file;
    }
    return processConfig;
  }

  /**
   * Extracts the actual running port from a PM2 process object.
   * @param process PM2 process object
   */
  private extractActualPort(process: any): string | number | null {
    if (process.pm2_env?.env) {
      return process.pm2_env.env.PORT || process.pm2_env.env.port || null;
    }
    return null;
  }
}
export const pm2Service = new PM2Service();
