'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { DashboardSidebar } from '@/components/ui/dashboard-sidebar';
import api from '@/lib/api';
import { formatBytes } from '@/lib/utils';

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
        <main className="flex-1 p-8 overflow-y-auto">
          <div className="max-w-7xl mx-auto">
            <div className="animate-pulse space-y-8">
              <div className="space-y-2">
                <div className="h-4 w-32 bg-gray-200 dark:bg-gray-800 rounded"></div>
                <div className="h-10 w-48 bg-gray-200 dark:bg-gray-800 rounded"></div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="h-48 bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800"></div>
                ))}
              </div>
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
            <Link href="/dashboard" className="text-gray-500 dark:text-gray-400 text-base font-medium leading-normal hover:text-gray-900 dark:hover:text-gray-100 transition-colors">
              NodePilot
            </Link>
            <span className="text-gray-500 dark:text-gray-400 text-base font-medium leading-normal">/</span>
            <span className="text-gray-900 dark:text-gray-100 text-base font-medium leading-normal">Projects</span>
          </div>

          {/* Page Heading */}
          <div className="flex flex-wrap justify-between gap-3 mb-6">
            <div>
              <h1 className="text-gray-900 dark:text-gray-100 text-3xl font-black leading-tight tracking-[-0.033em]">All Projects</h1>
              <p className="text-gray-600 dark:text-gray-400 mt-0.5 text-sm">
                {projects.length} project{projects.length !== 1 ? 's' : ''}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <Link 
                href="/projects/create"
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-gray-900 dark:bg-white text-white dark:text-gray-900 hover:bg-gray-800 dark:hover:bg-gray-100 transition-colors h-fit"
              >
                <span className="material-symbols-outlined text-lg">add</span>
                <span className="text-sm font-medium">New Project</span>
              </Link>
            </div>
          </div>

          {projects.length === 0 ? (
            <div className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900/50 p-8 text-center">
              <span className="material-symbols-outlined text-5xl text-gray-400 dark:text-gray-600 mb-3">folder_open</span>
              <p className="text-gray-600 dark:text-gray-400 mb-3 text-sm">No projects deployed yet</p>
              <Link 
                href="/projects/create"
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-gray-900 dark:bg-white text-white dark:text-gray-900 hover:bg-gray-800 dark:hover:bg-gray-100 transition-colors"
              >
                <span className="material-symbols-outlined text-lg">add</span>
                Create Your First Project
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {projects.map((project) => (
                <div key={project.id} className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900/50 p-3 max-w-full">
                  <div className="flex justify-between items-start mb-6">
                    <div className="flex items-center space-x-3">
                      <span className="material-symbols-outlined text-3xl text-gray-600 dark:text-gray-400">folder</span>
                      <div>
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{project.display_name}</h3>
                        <p className="text-sm text-gray-500 dark:text-gray-400">{project.name}</p>
                      </div>
                    </div>
                    <span className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-sm font-medium ${
                      project.pm2Status?.status === 'online'
                        ? 'text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20'
                        : 'text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-gray-800'
                    }`}>
                      <span className={`h-2 w-2 rounded-full ${
                        project.pm2Status?.status === 'online'
                          ? 'bg-green-600 dark:bg-green-400'
                          : 'bg-gray-600 dark:bg-gray-400'
                      }`}></span>
                      {project.pm2Status?.status || 'stopped'}
                    </span>
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
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-800 text-sm font-medium text-gray-900 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                        >
                          <span className="material-symbols-outlined text-lg">stop</span>
                          Stop
                        </button>
                        <button
                          onClick={() => handleAction(project.id, 'restart')}
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-800 text-sm font-medium text-gray-900 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                        >
                          <span className="material-symbols-outlined text-lg">refresh</span>
                          Restart
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={() => handleAction(project.id, 'start')}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-800 text-sm font-medium text-gray-900 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                      >
                        <span className="material-symbols-outlined text-lg">play_arrow</span>
                        Start
                      </button>
                    )}
                    <Link href={`/projects/${project.id}`}>
                      <button className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-800 text-sm font-medium text-gray-900 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
                        <span className="material-symbols-outlined text-lg">visibility</span>
                        View Details
                      </button>
                    </Link>
                    <button
                      onClick={() => handleDelete(project.id, project.display_name)}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-sm font-medium text-red-700 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors"
                    >
                      <span className="material-symbols-outlined text-lg">delete</span>
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
