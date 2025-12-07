'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { DashboardSidebar } from '@/components/ui/dashboard-sidebar';
import { ProjectTerminal } from '@/components/ui/project-terminal';
import api from '@/lib/api';
import { Search, RefreshCw, Terminal, Code, MoreVertical, ChevronRight } from 'lucide-react';

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
  const [showTerminal, setShowTerminal] = useState(false);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'running' | 'stopped'>('all');

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

  const filteredProjects = projects.filter(project => {
    const matchesSearch = project.display_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         project.name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesFilter = filterStatus === 'all' || 
                         (filterStatus === 'running' && project.pm2Info?.status === 'online') ||
                         (filterStatus === 'stopped' && project.pm2Info?.status !== 'online');
    return matchesSearch && matchesFilter;
  });

  const runningCount = projects.filter(p => p.pm2Info?.status === 'online').length;
  const stoppedCount = projects.length - runningCount;

  if (loading) {
    return (
      <div className="flex min-h-screen w-full bg-white dark:bg-[#030712]">
        <DashboardSidebar open={sidebarOpen} setOpen={setSidebarOpen} />
        <div className="flex-1 flex items-center justify-center">
          <div className="relative">
            <div className="w-16 h-16 border-4 border-gray-200 dark:border-gray-800 rounded-full"></div>
            <div className="w-16 h-16 border-4 border-[#30e38d] border-t-transparent rounded-full animate-spin absolute top-0"></div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen w-full bg-white dark:bg-[#030712]">
      <DashboardSidebar open={sidebarOpen} setOpen={setSidebarOpen} />
      
      <div className="flex-1 overflow-auto">
        {/* Header */}
        <header className="sticky top-0 z-10 bg-white/80 dark:bg-[#030712]/80 backdrop-blur-xl border-b border-gray-200 dark:border-white/10 px-6 sm:px-8 py-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-2">
                <Code className="h-5 w-5 text-[#30e38d]" />
                <span className="text-sm font-medium text-gray-600 dark:text-gray-400">Projects:</span>
                <span className="text-sm font-bold text-gray-900 dark:text-[#ffffff]">{projects.length}</span>
              </div>
              <div className="h-5 w-px bg-gray-200 dark:bg-white/10"></div>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-[#30e38d] animate-pulse"></div>
                <span className="text-sm font-medium text-gray-600 dark:text-gray-400">Running:</span>
                <span className="text-sm font-bold text-gray-900 dark:text-[#ffffff]">{runningCount}</span>
              </div>
            </div>
            <button
              onClick={fetchProjects}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-gray-100 dark:bg-white/5 border border-gray-200 dark:border-white/10 hover:bg-gray-200 dark:hover:bg-white/10 transition-colors text-gray-700 dark:text-gray-300 text-sm font-medium"
            >
              <RefreshCw className="h-4 w-4" />
              Refresh
            </button>
          </div>

          <div className="flex flex-col sm:flex-row gap-3">
            {/* Search */}
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 dark:text-gray-500" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search projects..."
                className="w-full bg-gray-100 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-lg py-2.5 pl-10 pr-4 text-sm focus:ring-2 focus:ring-[#30e38d] focus:border-transparent placeholder-gray-400 dark:placeholder-gray-500 text-gray-900 dark:text-[#ffffff]"
              />
            </div>

            {/* Filter */}
            <div className="flex items-center gap-1 bg-gray-100 dark:bg-white/5 border border-gray-200 dark:border-white/10 p-1 rounded-lg">
              <button
                onClick={() => setFilterStatus('all')}
                className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  filterStatus === 'all'
                    ? 'bg-white dark:bg-white/10 text-gray-900 dark:text-[#ffffff] shadow-sm'
                    : 'text-gray-600 dark:text-gray-400 hover:bg-white/50 dark:hover:bg-white/5'
                }`}
              >
                All
              </button>
              <button
                onClick={() => setFilterStatus('running')}
                className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  filterStatus === 'running'
                    ? 'bg-white dark:bg-white/10 text-gray-900 dark:text-[#ffffff] shadow-sm'
                    : 'text-gray-600 dark:text-gray-400 hover:bg-white/50 dark:hover:bg-white/5'
                }`}
              >
                Running
              </button>
              <button
                onClick={() => setFilterStatus('stopped')}
                className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  filterStatus === 'stopped'
                    ? 'bg-white dark:bg-white/10 text-gray-900 dark:text-[#ffffff] shadow-sm'
                    : 'text-gray-600 dark:text-gray-400 hover:bg-white/50 dark:hover:bg-white/5'
                }`}
              >
                Stopped
              </button>
            </div>
          </div>
        </header>

        <main className="p-6 sm:p-8">
          {filteredProjects.length === 0 ? (
            <div className="text-center py-20">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gray-100 dark:bg-white/5 mb-4">
                <Code className="h-8 w-8 text-gray-400 dark:text-gray-600" />
              </div>
              <h3 className="text-xl font-bold text-gray-900 dark:text-[#ffffff] mb-2">
                {searchQuery ? 'No projects found' : 'No projects yet'}
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {searchQuery ? 'Try adjusting your search or filters' : 'Deploy a project first to use the code editor'}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-3 gap-4">
              {filteredProjects.map((project) => (
                <div
                  key={project.id}
                  className="group bg-white dark:bg-white/5 p-5 rounded-lg border border-gray-200 dark:border-white/10 hover:border-[#30e38d] dark:hover:border-[#30e38d] transition-all flex flex-col"
                >
                  {/* Header */}
                  <div className="flex justify-between items-start mb-4">
                    <div className="flex-1 min-w-0">
                      <h3 className="text-lg font-bold text-gray-900 dark:text-[#ffffff] truncate">
                        {project.display_name}
                      </h3>
                      <p className="text-sm text-gray-500 dark:text-gray-500 font-mono truncate mt-0.5">
                        {project.name}
                      </p>
                    </div>
                    <div className={`flex items-center gap-2 text-xs font-medium px-2 py-1 rounded-full ml-3 ${
                      project.pm2Info?.status === 'online'
                        ? 'text-[#30e38d] bg-[#30e38d]/10'
                        : 'text-red-400 bg-red-500/10'
                    }`}>
                      <span className={`w-2 h-2 rounded-full ${
                        project.pm2Info?.status === 'online' ? 'bg-[#30e38d]' : 'bg-red-400'
                      } ${project.pm2Info?.status === 'online' ? 'animate-pulse' : ''}`}></span>
                      {project.pm2Info?.status === 'online' ? 'Running' : 'Stopped'}
                    </div>
                  </div>

                  {/* Stats */}
                  <div className="flex items-center gap-4 text-sm text-gray-600 dark:text-gray-400 mb-6">
                    <div className="flex items-center gap-1.5">
                      <span className="text-gray-400 dark:text-gray-500">Port:</span>
                      <span className="font-mono text-gray-900 dark:text-gray-300">{project.port || 'N/A'}</span>
                    </div>
                    <div className="w-px h-4 bg-gray-200 dark:bg-white/10"></div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-gray-400 dark:text-gray-500">CPU:</span>
                      <span className="font-mono text-gray-900 dark:text-gray-300">{project.pm2Info?.cpu || 0}%</span>
                    </div>
                    <div className="w-px h-4 bg-gray-200 dark:bg-white/10"></div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-gray-400 dark:text-gray-500">Memory:</span>
                      <span className="font-mono text-gray-900 dark:text-gray-300">
                        {project.pm2Info ? Math.round(project.pm2Info.memory / 1024 / 1024) : 0}MB
                      </span>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="pt-2 mt-auto flex items-center justify-end gap-2">
                    <button
                      onClick={() => router.push(`/editor/${project.id}`)}
                      className="px-4 py-2 rounded-lg bg-gray-100 dark:bg-white/5 hover:bg-gray-200 dark:hover:bg-white/10 transition-colors text-gray-900 dark:text-[#ffffff] font-medium text-sm"
                    >
                      Editor
                    </button>
                    <button
                      onClick={() => {
                        setSelectedProject(project);
                        setShowTerminal(true);
                      }}
                      className="px-4 py-2 rounded-lg bg-gray-100 dark:bg-white/5 hover:bg-gray-200 dark:hover:bg-white/10 transition-colors text-gray-900 dark:text-[#ffffff] font-medium text-sm"
                    >
                      Terminal
                    </button>
                    <button
                      onClick={() => router.push(`/projects/${project.id}`)}
                      className="p-2 rounded-lg bg-gray-100 dark:bg-white/5 hover:bg-gray-200 dark:hover:bg-white/10 transition-colors text-gray-600 dark:text-gray-400"
                    >
                      <MoreVertical className="h-5 w-5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </main>

        {/* Terminal Component */}
        {selectedProject && showTerminal && (
          <ProjectTerminal
            projectId={selectedProject.id.toString()}
            projectPath={selectedProject.name}
            onClose={() => setShowTerminal(false)}
          />
        )}
      </div>
    </div>
  );
}
