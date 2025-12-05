'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { DashboardSidebar } from '@/components/ui/dashboard-sidebar';
import api from '@/lib/api';
import { formatBytes, formatUptime } from '@/lib/utils';

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
        <main className="flex-1 p-8 overflow-y-auto">
          <div className="max-w-7xl mx-auto">
            <div className="animate-pulse space-y-8">
              <div className="space-y-2">
                <div className="h-4 w-32 bg-gray-200 dark:bg-gray-800 rounded"></div>
                <div className="h-10 w-64 bg-gray-200 dark:bg-gray-800 rounded"></div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="h-32 bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800"></div>
                ))}
              </div>
              <div className="h-96 bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800"></div>
            </div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen w-full bg-gray-50 dark:bg-gray-950">
      <DashboardSidebar open={sidebarOpen} setOpen={setSidebarOpen} />
      
      <main className="flex-1 p-8 overflow-y-auto">
        <div className="max-w-7xl mx-auto">
          {/* Breadcrumbs */}
          <div className="flex flex-wrap gap-2 mb-2">
            <Link href="/" className="text-gray-500 dark:text-gray-400 text-base font-medium leading-normal hover:text-gray-900 dark:hover:text-gray-100 transition-colors">
              NodePilot
            </Link>
            <span className="text-gray-500 dark:text-gray-400 text-base font-medium leading-normal">/</span>
            <span className="text-gray-900 dark:text-gray-100 text-base font-medium leading-normal">Dashboard</span>
          </div>

          {/* Page Heading */}
          <div className="flex flex-wrap justify-between gap-3 mb-8">
            <h1 className="text-gray-900 dark:text-gray-100 text-4xl font-black leading-tight tracking-[-0.033em] min-w-72">Dashboard</h1>
            <div className="flex items-center gap-3">
              <button 
                onClick={handleRefresh}
                disabled={isRefreshing}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-gray-900 dark:bg-white text-white dark:text-gray-900 hover:bg-gray-800 dark:hover:bg-gray-100 transition-colors disabled:opacity-50 h-fit"
                title="Refresh data"
              >
                <span className={`material-symbols-outlined text-lg ${isRefreshing ? 'animate-spin' : ''}`}>refresh</span>
                <span className="text-sm font-medium">Refresh</span>
              </button>
            </div>
          </div>
          {/* System Stats */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <div className="flex flex-col gap-2 rounded-xl p-6 border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900/50">
              <p className="text-gray-900 dark:text-gray-100 text-base font-medium leading-normal">CPU Usage</p>
              <p className="text-gray-900 dark:text-gray-100 tracking-light text-2xl font-bold leading-tight">{systemInfo?.cpu.usage}%</p>
              <p className="text-sm text-gray-500 dark:text-gray-400 truncate">{systemInfo?.cpu.brand}</p>
            </div>

            <div className="flex flex-col gap-2 rounded-xl p-6 border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900/50">
              <p className="text-gray-900 dark:text-gray-100 text-base font-medium leading-normal">Memory</p>
              <p className="text-gray-900 dark:text-gray-100 tracking-light text-2xl font-bold leading-tight">{systemInfo?.memory.usagePercent}%</p>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {formatBytes(systemInfo?.memory.used)} / {formatBytes(systemInfo?.memory.total)}
              </p>
            </div>

            <div className="flex flex-col gap-2 rounded-xl p-6 border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900/50">
              <p className="text-gray-900 dark:text-gray-100 text-base font-medium leading-normal">Disk Usage</p>
              <p className="text-gray-900 dark:text-gray-100 tracking-light text-2xl font-bold leading-tight">{systemInfo?.disk[0]?.usagePercent}%</p>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {formatBytes(systemInfo?.disk[0]?.used)} / {formatBytes(systemInfo?.disk[0]?.size)}
              </p>
            </div>

            <div className="flex flex-col gap-2 rounded-xl p-6 border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900/50">
              <p className="text-gray-900 dark:text-gray-100 text-base font-medium leading-normal">Active Projects</p>
              <p className="text-gray-900 dark:text-gray-100 tracking-light text-2xl font-bold leading-tight">{systemInfo?.pm2.onlineProcesses}</p>
              <p className="text-sm text-gray-500 dark:text-gray-400">{systemInfo?.pm2.totalProcesses} total</p>
            </div>
          </div>

          {/* Recent Projects Table */}
          <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900/50 p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-gray-900 dark:text-gray-100 text-lg font-bold">All Projects</h3>
              <Link href="/projects">
                <button className="text-sm text-gray-900 dark:text-gray-100 hover:text-gray-600 dark:hover:text-gray-400 font-medium transition-colors">
                  View all
                </button>
              </Link>
            </div>

            {projects.length === 0 ? (
              <div className="text-center py-12">
                <span className="material-symbols-outlined text-6xl text-gray-400 dark:text-gray-600 mb-4">folder_open</span>
                <p className="text-gray-600 dark:text-gray-400 mb-4">No projects deployed yet</p>
                <Link 
                  href="/projects/create"
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-gray-900 dark:bg-white text-white dark:text-gray-900 hover:bg-gray-800 dark:hover:bg-gray-100 transition-colors"
                >
                  <span className="material-symbols-outlined">add</span>
                  Create Your First Project
                </Link>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b border-gray-200 dark:border-gray-800 text-gray-600 dark:text-gray-400">
                      <th className="p-3 text-sm font-semibold">Project Name</th>
                      <th className="p-3 text-sm font-semibold">ID</th>
                      <th className="p-3 text-sm font-semibold">Status</th>
                      <th className="p-3 text-sm font-semibold">CPU</th>
                      <th className="p-3 text-sm font-semibold">Memory</th>
                      <th className="p-3 text-sm font-semibold">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 dark:divide-gray-800">
                    {projects.slice(0, 5).map((project) => (
                      <tr key={project.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                        <td className="p-3">
                          <p className="text-gray-900 dark:text-gray-100 font-medium">{project.display_name}</p>
                          <p className="text-sm text-gray-500 dark:text-gray-400">{project.name}</p>
                        </td>
                        <td className="p-3 text-gray-900 dark:text-gray-100/80">{project.id}</td>
                        <td className="p-3">
                          <span className={`inline-flex items-center gap-2 ${
                            project.pm2Status?.status === 'online'
                              ? 'text-green-600 dark:text-green-400'
                              : project.pm2Status?.status === 'stopping' || project.pm2Status?.status === 'restarting'
                              ? 'text-yellow-600 dark:text-yellow-400'
                              : 'text-red-600 dark:text-red-400'
                          }`}>
                            <span className={`h-2 w-2 rounded-full ${
                              project.pm2Status?.status === 'online'
                                ? 'bg-green-600 dark:bg-green-400'
                                : project.pm2Status?.status === 'stopping' || project.pm2Status?.status === 'restarting'
                                ? 'bg-yellow-600 dark:bg-yellow-400'
                                : 'bg-red-600 dark:bg-red-400'
                            }`}></span>
                            {project.pm2Status?.status || 'stopped'}
                          </span>
                        </td>
                        <td className="p-3 text-gray-900 dark:text-gray-100/80">{project.pm2Status?.cpu || 0}%</td>
                        <td className="p-3 text-gray-900 dark:text-gray-100/80">{formatBytes(project.pm2Status?.memory || 0)}</td>
                        <td className="p-3">
                          <Link href={`/projects/${project.id}`}>
                            <button className="px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-800 text-sm font-medium text-gray-900 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
                              View
                            </button>
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
