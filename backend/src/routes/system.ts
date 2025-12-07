import { FastifyInstance } from 'fastify';
import path from 'path';
import si from 'systeminformation';
import { pm2Service } from '../services/pm2Service';
import { cleanupMarkedDirectories } from '../utils/fileSystem';
import { authenticate } from '../middleware/auth';

export default async function systemRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', authenticate);

  // Get system information
  fastify.get('/info', async () => {
    const [cpu, mem, disk, osInfo, currentLoad] = await Promise.all([
      si.cpu(),
      si.mem(),
      si.fsSize(),
      si.osInfo(),
      si.currentLoad(),
    ]);

    const processes = await pm2Service.getProcessList();

    return {
      cpu: {
        manufacturer: cpu.manufacturer,
        brand: cpu.brand,
        cores: cpu.cores,
        speed: cpu.speed,
        usage: currentLoad.currentLoad.toFixed(2),
      },
      memory: {
        total: mem.total,
        used: mem.used,
        free: mem.free,
        usagePercent: ((mem.used / mem.total) * 100).toFixed(2),
      },
      disk: disk.map(d => ({
        fs: d.fs,
        type: d.type,
        size: d.size,
        used: d.used,
        available: d.available,
        usagePercent: d.use.toFixed(2),
        mount: d.mount,
      })),
      os: {
        platform: osInfo.platform,
        distro: osInfo.distro,
        release: osInfo.release,
        arch: osInfo.arch,
        hostname: osInfo.hostname,
      },
      pm2: {
        totalProcesses: processes.length,
        onlineProcesses: processes.filter((p: any) => p.pm2_env?.status === 'online').length,
        stoppedProcesses: processes.filter((p: any) => p.pm2_env?.status === 'stopped').length,
        errorProcesses: processes.filter((p: any) => p.pm2_env?.status === 'errored').length,
      },
    };
  });

  // Get real-time metrics
  fastify.get('/metrics', async () => {
    const [currentLoad, mem, networkStats] = await Promise.all([
      si.currentLoad(),
      si.mem(),
      si.networkStats(),
    ]);

    return {
      cpu: currentLoad.currentLoad.toFixed(2),
      memory: {
        used: mem.used,
        total: mem.total,
        percent: ((mem.used / mem.total) * 100).toFixed(2),
      },
      network: networkStats[0] ? {
        interface: networkStats[0].iface,
        rx_sec: networkStats[0].rx_sec,
        tx_sec: networkStats[0].tx_sec,
      } : null,
      timestamp: new Date().toISOString(),
    };
  });

  // Get PM2 processes
  fastify.get('/processes', async () => {
    const processes = await pm2Service.getProcessList();
    
    return {
      processes: processes.map((p: any) => ({
        name: p.name,
        pid: p.pid,
        status: p.pm2_env?.status,
        cpu: p.monit?.cpu || 0,
        memory: p.monit?.memory || 0,
        uptime: p.pm2_env?.pm_uptime,
        restarts: p.pm2_env?.restart_time || 0,
      })),
    };
  });

  // Manual cleanup of marked directories
  fastify.post('/cleanup', async (request, reply) => {
    try {
      const projectsDir = process.env.PROJECTS_DIR || path.join(process.cwd(), '../projects');
      const result = await cleanupMarkedDirectories(projectsDir);
      
      return {
        success: true,
        cleaned: result.cleaned,
        failed: result.failed.length,
        failedPaths: result.failed,
        message: `Cleaned ${result.cleaned} directories, ${result.failed.length} still locked`,
      };
    } catch (error: any) {
      return reply.status(500).send({
        error: 'Cleanup failed',
        message: error.message,
      });
    }
  });
}
