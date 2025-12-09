import { FastifyInstance, FastifyReply } from 'fastify';
import path from 'path';
import si from 'systeminformation';
import { pm2Service } from '../services/pm2Service';
import { cleanupMarkedDirectories } from '../utils/fileSystem';
import { authenticate } from '../middleware/auth';

/**
 * System Routes Module
 * Handles system monitoring, metrics, process management, and cleanup operations
 */

// ============================================================================
// Type Definitions
// ============================================================================

interface CpuInfo {
  manufacturer: string;
  brand: string;
  cores: number;
  speed: number;
  usage: string;
}

interface MemoryInfo {
  total: number;
  used: number;
  free: number;
  usagePercent: string;
}

interface DiskInfo {
  fs: string;
  type: string;
  size: number;
  used: number;
  available: number;
  usagePercent: string;
  mount: string;
}

interface OsInfo {
  platform: string;
  distro: string;
  release: string;
  arch: string;
  hostname: string;
}

interface Pm2Stats {
  totalProcesses: number;
  onlineProcesses: number;
  stoppedProcesses: number;
  errorProcesses: number;
}

interface ProcessInfo {
  name: string;
  pid: number;
  status: string;
  cpu: number;
  memory: number;
  uptime: number;
  restarts: number;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Formats CPU information from system data
 * @param cpu - Raw CPU information from systeminformation
 * @param currentLoad - Current CPU load data
 * @returns Formatted CPU information object
 */
function formatCpuInfo(cpu: any, currentLoad: any): CpuInfo {
  return {
    manufacturer: cpu.manufacturer,
    brand: cpu.brand,
    cores: cpu.cores,
    speed: cpu.speed,
    usage: currentLoad.currentLoad.toFixed(2),
  };
}

/**
 * Formats memory information from system data
 * @param mem - Raw memory information from systeminformation
 * @returns Formatted memory information object
 */
function formatMemoryInfo(mem: any): MemoryInfo {
  return {
    total: mem.total,
    used: mem.used,
    free: mem.free,
    usagePercent: ((mem.used / mem.total) * 100).toFixed(2),
  };
}

/**
 * Formats disk information from system data
 * @param disk - Array of disk information from systeminformation
 * @returns Array of formatted disk information objects
 */
function formatDiskInfo(disk: any[]): DiskInfo[] {
  return disk.map(d => ({
    fs: d.fs,
    type: d.type,
    size: d.size,
    used: d.used,
    available: d.available,
    usagePercent: d.use.toFixed(2),
    mount: d.mount,
  }));
}

/**
 * Formats operating system information
 * @param osInfo - Raw OS information from systeminformation
 * @returns Formatted OS information object
 */
function formatOsInfo(osInfo: any): OsInfo {
  return {
    platform: osInfo.platform,
    distro: osInfo.distro,
    release: osInfo.release,
    arch: osInfo.arch,
    hostname: osInfo.hostname,
  };
}

/**
 * Calculates PM2 process statistics
 * @param processes - Array of PM2 processes
 * @returns Statistics about PM2 processes
 */
function calculatePm2Stats(processes: any[]): Pm2Stats {
  return {
    totalProcesses: processes.length,
    onlineProcesses: processes.filter((p: any) => p.pm2_env?.status === 'online').length,
    stoppedProcesses: processes.filter((p: any) => p.pm2_env?.status === 'stopped').length,
    errorProcesses: processes.filter((p: any) => p.pm2_env?.status === 'errored').length,
  };
}

/**
 * Formats a single PM2 process information
 * @param process - Raw PM2 process data
 * @returns Formatted process information
 */
function formatProcessInfo(process: any): ProcessInfo {
  return {
    name: process.name,
    pid: process.pid,
    status: process.pm2_env?.status,
    cpu: process.monit?.cpu || 0,
    memory: process.monit?.memory || 0,
    uptime: process.pm2_env?.pm_uptime,
    restarts: process.pm2_env?.restart_time || 0,
  };
}

/**
 * Formats network statistics for metrics endpoint
 * @param networkStats - Array of network statistics
 * @returns Formatted network information or null
 */
function formatNetworkStats(networkStats: any[]) {
  if (!networkStats[0]) {
    return null;
  }

  return {
    interface: networkStats[0].iface,
    rx_sec: networkStats[0].rx_sec,
    tx_sec: networkStats[0].tx_sec,
  };
}

/**
 * Gets the projects directory path from environment or default
 * @returns Absolute path to projects directory
 */
function getProjectsDirectory(): string {
  return process.env.PROJECTS_DIR || path.join(process.cwd(), '../projects');
}

// ============================================================================
// Route Handlers
// ============================================================================

/**
 * Main system routes registration
 * All routes require authentication via preHandler hook
 */
export default async function systemRoutes(fastify: FastifyInstance) {
  // Apply authentication middleware to all routes in this module
  fastify.addHook('preHandler', authenticate);

  /**
   * GET /info
   * Retrieves comprehensive system information including CPU, memory, disk, OS, and PM2 stats
   * @returns Complete system information object
   */
  fastify.get('/info', async () => {
    // Fetch all system information in parallel for better performance
    const [cpu, mem, disk, osInfo, currentLoad] = await Promise.all([
      si.cpu(),
      si.mem(),
      si.fsSize(),
      si.osInfo(),
      si.currentLoad(),
    ]);

    // Fetch PM2 process list
    const processes = await pm2Service.getProcessList();

    // Construct response with formatted data
    return {
      cpu: formatCpuInfo(cpu, currentLoad),
      memory: formatMemoryInfo(mem),
      disk: formatDiskInfo(disk),
      os: formatOsInfo(osInfo),
      pm2: calculatePm2Stats(processes),
    };
  });

  /**
   * GET /metrics
   * Retrieves real-time system metrics (CPU, memory, network)
   * Optimized for frequent polling by dashboard
   * @returns Current system metrics with timestamp
   */
  fastify.get('/metrics', async () => {
    // Fetch real-time metrics in parallel
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
      network: formatNetworkStats(networkStats),
      timestamp: new Date().toISOString(),
    };
  });

  /**
   * GET /processes
   * Retrieves list of all PM2 managed processes with their status
   * @returns Array of formatted process information
   */
  fastify.get('/processes', async () => {
    const processes = await pm2Service.getProcessList();
    
    return {
      processes: processes.map(formatProcessInfo),
    };
  });

  /**
   * POST /cleanup
   * Manually triggers cleanup of marked directories in the projects folder
   * Useful for removing directories that were marked for deletion but couldn't be removed immediately
   * @returns Cleanup operation results including success count and failures
   */
  fastify.post('/cleanup', async (request, reply: FastifyReply) => {
    try {
      const projectsDir = getProjectsDirectory();
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
