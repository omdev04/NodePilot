'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { DashboardSidebar } from '@/components/ui/dashboard-sidebar';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import api from '@/lib/api';
import { formatBytes, formatUptime } from '@/lib/utils';
import { Activity, Cpu, HardDrive, MemoryStick, LogOut, Plus, FolderOpen, Bell, User, TrendingUp, Package, RefreshCw } from 'lucide-react';

export default function DashboardPage() {
  const router = useRouter();
  const [systemInfo, setSystemInfo] = useState<any>(null);
  const [projects, setProjects] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) {
      router.push('/login');
      return;
    }

    fetchData();
    const interval = setInterval(() => {
      if (!loading) {
        fetchData();
      }
    }, 5000);
    return () => clearInterval(interval);
  }, [router]);

  const fetchData = async () => {
    try {
      const [sysRes, projRes] = await Promise.all([
        api.get('/system/info'),
        api.get('/project/list'),
      ]);
      setSystemInfo(sysRes.data);
      setProjects(projRes.data.projects);
      setLoading(false);
    } catch (error) {
      console.error('Failed to fetch data:', error);
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await fetchData();
    setTimeout(() => setIsRefreshing(false), 500);
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    router.push('/login');
  };

  if (loading) {
    return (
      <div className="flex min-h-screen w-full bg-gray-50 dark:bg-gray-950">
        <DashboardSidebar open={sidebarOpen} setOpen={setSidebarOpen} />
        <div className="flex-1 overflow-auto">
          <div className="sticky top-0 z-10 bg-white dark:bg-gray-950 border-b border-gray-200 dark:border-gray-800 px-6 py-4">
            <div className="animate-pulse flex justify-between">
              <div className="space-y-2">
                <div className="h-8 w-48 bg-gray-200 dark:bg-gray-800 rounded"></div>
                <div className="h-4 w-64 bg-gray-200 dark:bg-gray-800 rounded"></div>
              </div>
              <div className="flex gap-4">
                <div className="h-10 w-24 bg-gray-200 dark:bg-gray-800 rounded"></div>
                <div className="h-10 w-10 bg-gray-200 dark:bg-gray-800 rounded"></div>
                <div className="h-10 w-10 bg-gray-200 dark:bg-gray-800 rounded"></div>
              </div>
            </div>
          </div>
          <main className="p-6">
            <div className="animate-pulse grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-32 bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800"></div>
              ))}
            </div>
            <div className="animate-pulse h-96 bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800"></div>
          </main>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen w-full bg-gray-50 dark:bg-gray-950">
      <DashboardSidebar open={sidebarOpen} setOpen={setSidebarOpen} />
      
      <div className="flex-1 overflow-auto">
        {/* Header */}
        <div className="sticky top-0 z-10 bg-white dark:bg-gray-950 border-b border-gray-200 dark:border-gray-800 px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">Dashboard</h1>
              <p className="text-gray-600 dark:text-gray-400 mt-1">Monitor your deployment system</p>
            </div>
            <div className="flex items-center gap-4">
              <button 
                onClick={handleRefresh}
                disabled={isRefreshing}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-gray-900 dark:bg-white text-white dark:text-gray-900 hover:bg-gray-800 dark:hover:bg-gray-100 transition-colors disabled:opacity-50"
                title="Refresh data"
              >
                <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
                <span className="text-sm font-medium">Refresh</span>
              </button>
              <button className="relative p-2 rounded-lg bg-white dark:bg-gray-950 border border-gray-200 dark:border-gray-800 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 transition-colors">
                <Bell className="h-5 w-5" />
              </button>
              <ThemeToggle />
              <button 
                onClick={handleLogout}
                className="p-2 rounded-lg bg-white dark:bg-gray-950 border border-gray-200 dark:border-gray-800 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 transition-colors"
              >
                <LogOut className="h-5 w-5" />
              </button>
            </div>
          </div>
        </div>

        <main className="p-6">
          {/* System Stats */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            <div className="p-6 rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-sm hover:shadow-md transition-shadow">
              <div className="flex items-center justify-between mb-4">
                <div className="p-2 bg-gray-100 dark:bg-gray-800 rounded-lg">
                  <Cpu className="h-5 w-5 text-gray-900 dark:text-gray-100" />
                </div>
              </div>
              <h3 className="font-medium text-gray-600 dark:text-gray-400 mb-1">CPU Usage</h3>
              <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{systemInfo?.cpu.usage}%</p>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 truncate">{systemInfo?.cpu.brand}</p>
            </div>

            <div className="p-6 rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-sm hover:shadow-md transition-shadow">
              <div className="flex items-center justify-between mb-4">
                <div className="p-2 bg-gray-100 dark:bg-gray-800 rounded-lg">
                  <MemoryStick className="h-5 w-5 text-gray-900 dark:text-gray-100" />
                </div>
              </div>
              <h3 className="font-medium text-gray-600 dark:text-gray-400 mb-1">Memory</h3>
              <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{systemInfo?.memory.usagePercent}%</p>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                {formatBytes(systemInfo?.memory.used)} / {formatBytes(systemInfo?.memory.total)}
              </p>
            </div>

            <div className="p-6 rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-sm hover:shadow-md transition-shadow">
              <div className="flex items-center justify-between mb-4">
                <div className="p-2 bg-gray-100 dark:bg-gray-800 rounded-lg">
                  <HardDrive className="h-5 w-5 text-gray-900 dark:text-gray-100" />
                </div>
              </div>
              <h3 className="font-medium text-gray-600 dark:text-gray-400 mb-1">Disk Usage</h3>
              <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{systemInfo?.disk[0]?.usagePercent}%</p>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                {formatBytes(systemInfo?.disk[0]?.used)} / {formatBytes(systemInfo?.disk[0]?.size)}
              </p>
            </div>

            <div className="p-6 rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-sm hover:shadow-md transition-shadow">
              <div className="flex items-center justify-between mb-4">
                <div className="p-2 bg-gray-100 dark:bg-gray-800 rounded-lg">
                  <Activity className="h-5 w-5 text-gray-900 dark:text-gray-100" />
                </div>
              </div>
              <h3 className="font-medium text-gray-600 dark:text-gray-400 mb-1">Active Projects</h3>
              <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{systemInfo?.pm2.onlineProcesses}</p>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{systemInfo?.pm2.totalProcesses} total</p>
            </div>
          </div>

          {/* Recent Projects */}
          <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-6 shadow-sm">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Recent Projects</h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">Your deployed applications</p>
              </div>
              <Link href="/projects">
                <button className="text-sm text-gray-900 dark:text-gray-100 hover:text-gray-600 dark:hover:text-gray-400 font-medium">
                  View all
                </button>
              </Link>
            </div>

            {projects.length === 0 ? (
              <div className="text-center py-12">
                <img src="/Logo/trans.png" alt="NodePilot" className="h-12 w-17 mx-auto object-contain mb-4" />
                <p className="text-gray-600 dark:text-gray-400 mb-4">No projects deployed yet</p>
                <Link 
                  href="/projects/create"
                  className="inline-flex items-center px-4 py-2 rounded-lg bg-gray-900 dark:bg-white text-white dark:text-gray-900 hover:bg-gray-800 dark:hover:bg-gray-100 transition-colors"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Create Your First Project
                </Link>
              </div>
            ) : (
              <div className="space-y-3">
                {projects.slice(0, 5).map((project) => (
                  <div
                    key={project.id}
                    className="flex items-center justify-between p-4 rounded-lg border border-gray-200 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                  >
                    <div className="flex items-center space-x-4 flex-1">
                      <div className="p-2 bg-gray-100 dark:bg-gray-800 rounded-lg">
                        <Package className="h-5 w-5 text-gray-900 dark:text-gray-100" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h4 className="font-semibold text-gray-900 dark:text-gray-100 truncate">{project.display_name}</h4>
                        <p className="text-sm text-gray-500 dark:text-gray-400 truncate">{project.name}</p>
                      </div>
                    </div>
                    <div className="flex items-center space-x-4">
                      <div className="text-right">
                        <div className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          project.pm2Status?.status === 'online'
                            ? 'bg-gray-900 dark:bg-white text-white dark:text-gray-900'
                            : 'bg-gray-200 dark:bg-gray-800 text-gray-900 dark:text-gray-100'
                        }`}>
                          {project.pm2Status?.status || 'stopped'}
                        </div>
                        {project.pm2Status && (
                          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                            CPU: {project.pm2Status.cpu}% | RAM: {formatBytes(project.pm2Status.memory)}
                          </p>
                        )}
                      </div>
                      <Link href={`/projects/${project.id}`}>
                        <button className="px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-800 text-sm font-medium text-gray-900 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
                          View
                        </button>
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
