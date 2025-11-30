'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { DashboardSidebar } from '@/components/ui/dashboard-sidebar';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import api from '@/lib/api';
import { formatBytes } from '@/lib/utils';
import { Play, Square, RotateCw, Trash2, Eye, Plus, Bell, LogOut, Package } from 'lucide-react';

export default function ProjectsListPage() {
  const router = useRouter();
  const [projects, setProjects] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) {
      router.push('/login');
      return;
    }

    fetchProjects();
    const interval = setInterval(() => {
      if (!loading) {
        fetchProjects();
      }
    }, 5000);
    return () => clearInterval(interval);
  }, [router]);

  const fetchProjects = async () => {
    try {
      const response = await api.get('/project/list');
      setProjects(response.data.projects);
      setLoading(false);
    } catch (error) {
      console.error('Failed to fetch projects:', error);
      setLoading(false);
    }
  };

  const handleAction = async (projectId: number, action: string) => {
    try {
      await api.post(`/project/${projectId}/${action}`);
      fetchProjects();
    } catch (error) {
      console.error(`Failed to ${action} project:`, error);
    }
  };

  const handleDelete = async (projectId: number, projectName: string) => {
    if (!confirm(`Are you sure you want to delete "${projectName}"?`)) return;

    try {
      await api.delete(`/project/${projectId}`);
      fetchProjects();
    } catch (error) {
      console.error('Failed to delete project:', error);
    }
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
                <div className="h-4 w-32 bg-gray-200 dark:bg-gray-800 rounded"></div>
              </div>
              <div className="flex gap-4">
                <div className="h-10 w-32 bg-gray-200 dark:bg-gray-800 rounded"></div>
                <div className="h-10 w-10 bg-gray-200 dark:bg-gray-800 rounded"></div>
                <div className="h-10 w-10 bg-gray-200 dark:bg-gray-800 rounded"></div>
              </div>
            </div>
          </div>
          <main className="p-6">
            <div className="animate-pulse space-y-6">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-48 bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800"></div>
              ))}
            </div>
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
              <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">All Projects</h1>
              <p className="text-gray-600 dark:text-gray-400 mt-1">
                {projects.length} project{projects.length !== 1 ? 's' : ''}
              </p>
            </div>
            <div className="flex items-center gap-4">
              <Link 
                href="/projects/create"
                className="inline-flex items-center px-4 py-2 rounded-lg bg-gray-900 dark:bg-white text-white dark:text-gray-900 hover:bg-gray-800 dark:hover:bg-gray-100 transition-colors"
              >
                <Plus className="h-4 w-4 mr-2" />
                New Project
              </Link>
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

          {projects.length === 0 ? (
            <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-12 text-center shadow-sm">
              <img src="/Logo/trans.png" alt="NodePilot" className="h-12 w-12 mx-auto object-contain mb-4" />
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
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {projects.map((project) => (
                <div key={project.id} className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 shadow-sm max-w-full">
                  <div className="flex justify-between items-start mb-6">
                    <div className="flex items-center space-x-4">
                      <div className="p-2 bg-gray-100 dark:bg-gray-800 rounded-lg">
                        <Package className="h-5 w-5 text-gray-900 dark:text-gray-100" />
                      </div>
                      <div>
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{project.display_name}</h3>
                        <p className="text-sm text-gray-500 dark:text-gray-400">{project.name}</p>
                      </div>
                    </div>
                    <div className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${
                      project.pm2Status?.status === 'online'
                        ? 'bg-gray-900 dark:bg-white text-white dark:text-gray-900'
                        : 'bg-gray-200 dark:bg-gray-800 text-gray-900 dark:text-gray-100'
                    }`}>
                      {project.pm2Status?.status || 'stopped'}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                    <div>
                      <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">Command</p>
                      <p className="font-mono text-sm text-gray-900 dark:text-gray-100">{project.start_command}</p>
                    </div>
                    {project.pm2Status && (
                      <>
                        <div>
                          <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">CPU</p>
                          <p className="font-semibold text-gray-900 dark:text-gray-100">{project.pm2Status.cpu}%</p>
                        </div>
                        <div>
                          <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">Memory</p>
                          <p className="font-semibold text-gray-900 dark:text-gray-100">{formatBytes(project.pm2Status.memory)}</p>
                        </div>
                      </>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {project.pm2Status?.status === 'online' ? (
                      <>
                        <button
                          onClick={() => handleAction(project.id, 'stop')}
                          className="inline-flex items-center px-2 py-1.5 rounded-lg border border-gray-200 dark:border-gray-800 text-sm font-medium text-gray-900 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                        >
                          <Square className="h-4 w-4 mr-2" />
                          Stop
                        </button>
                        <button
                          onClick={() => handleAction(project.id, 'restart')}
                          className="inline-flex items-center px-2 py-1.5 rounded-lg border border-gray-200 dark:border-gray-800 text-sm font-medium text-gray-900 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                        >
                          <RotateCw className="h-4 w-4 mr-2" />
                          Restart
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={() => handleAction(project.id, 'start')}
                        className="inline-flex items-center px-2 py-1.5 rounded-lg border border-gray-200 dark:border-gray-800 text-sm font-medium text-gray-900 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                      >
                        <Play className="h-4 w-4 mr-2" />
                        Start
                      </button>
                    )}
                    <Link href={`/projects/${project.id}`}>
                      <button className="inline-flex items-center px-2 py-1.5 rounded-lg border border-gray-200 dark:border-gray-800 text-sm font-medium text-gray-900 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
                        <Eye className="h-4 w-4 mr-2" />
                        View Details
                      </button>
                    </Link>
                    <button
                      onClick={() => handleDelete(project.id, project.display_name)}
                      className="inline-flex items-center px-2 py-1.5 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-sm font-medium text-red-700 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors"
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
