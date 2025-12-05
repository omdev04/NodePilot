'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { DashboardSidebar } from '@/components/ui/dashboard-sidebar';
import api from '@/lib/api';
import { Folder, RefreshCw } from 'lucide-react';

interface Project {
  id: number;
  name: string;
  display_name: string;
  path: string;
  port?: number;
  pm2Info?: {
    status: string;
    cpu: number;
    memory: number;
  };
}

export default function EditorListPage() {
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) {
      router.push('/login');
      return;
    }
    fetchProjects();
  }, []);

  const fetchProjects = async () => {
    try {
      const response = await api.get('/project/list');
      const projectList = response.data.projects || [];
      
      // Fetch PM2 info for each project
      const projectsWithPM2 = await Promise.all(
        projectList.map(async (project: any) => {
          try {
            const pm2Res = await api.get(`/project/${project.id}`);
            return {
              ...project,
              pm2Info: pm2Res.data.pm2Info || null,
            };
          } catch {
            return project;
          }
        })
      );
      
      setProjects(projectsWithPM2);
      setLoading(false);
    } catch (error) {
      console.error('Failed to fetch projects:', error);
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen w-full bg-white dark:bg-[#0D1117]">
        <DashboardSidebar open={sidebarOpen} setOpen={setSidebarOpen} />
        <div className="flex-1 flex items-center justify-center">
          <RefreshCw className="h-8 w-8 text-[#00FF88] animate-spin" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen w-full bg-white dark:bg-[#0D1117]">
      <DashboardSidebar open={sidebarOpen} setOpen={setSidebarOpen} />
      
      <div className="flex-1 overflow-auto">
        {/* Header */}
        <div className="sticky top-0 z-10 bg-gray-50 dark:bg-[#161B22] border-b border-gray-200 dark:border-gray-800 px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Code Editor</h1>
              <p className="text-gray-600 dark:text-gray-400 mt-0.5 text-sm">Select a project to start editing files</p>
            </div>
            <button
              onClick={fetchProjects}
              className="flex items-center gap-2 px-4 py-2 bg-gray-200 dark:bg-gray-800 hover:bg-gray-300 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg transition-colors"
            >
              <RefreshCw className="h-4 w-4" />
              Refresh
            </button>
          </div>
        </div>

        <main className="p-6 max-w-7xl mx-auto">
          {projects.length === 0 ? (
            <div className="text-center py-20">
              <Folder className="h-16 w-16 text-gray-300 dark:text-gray-700 mx-auto mb-4" />
              <h3 className="text-xl font-semibold text-gray-600 dark:text-gray-400 mb-2">No projects found</h3>
              <p className="text-sm text-gray-500 dark:text-gray-500">Deploy a project first to use the code editor</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {projects.map((project) => (
                <div
                  key={project.id}
                  onClick={() => router.push(`/editor/${project.id}`)}
                  className="group relative bg-gray-50 dark:bg-[#161B22] border border-gray-200 dark:border-gray-800 rounded-lg p-4 cursor-pointer hover:border-[#00FF88] transition-all hover:shadow-lg hover:shadow-[#00FF88]/10"
                >
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex-1">
                      <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 group-hover:text-[#00FF88] transition-colors mb-1">
                        {project.display_name}
                      </h3>
                      <p className="text-sm text-gray-500 dark:text-gray-500 font-mono">{project.name}</p>
                    </div>
                    {project.pm2Info?.status === 'online' && (
                      <div className="flex items-center gap-2 px-2 py-1 rounded-lg bg-[#00FF88]/10 text-[#00FF88] text-xs font-medium">
                        <div className="w-2 h-2 rounded-full bg-[#00FF88] animate-pulse" />
                        Online
                      </div>
                    )}
                  </div>

                  <div className="space-y-2">
                    {project.port && (
                      <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                        <span className="text-gray-400 dark:text-gray-600">Port:</span>
                        <span className="font-mono text-[#00FF88]">{project.port}</span>
                      </div>
                    )}
                    {project.pm2Info && (
                      <div className="flex items-center gap-4 text-xs text-gray-500 dark:text-gray-500">
                        <span>CPU: {project.pm2Info.cpu}%</span>
                        <span>Memory: {Math.round(project.pm2Info.memory / 1024 / 1024)}MB</span>
                      </div>
                    )}
                  </div>

                  <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-800">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-gray-500 dark:text-gray-600 font-mono truncate">{project.path}</span>
                      <svg className="w-5 h-5 text-gray-400 dark:text-gray-600 group-hover:text-[#00FF88] transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </div>
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
