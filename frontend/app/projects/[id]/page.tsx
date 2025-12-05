'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { DashboardSidebar } from '@/components/ui/dashboard-sidebar';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { GitInfo } from '@/components/ui/git-info';
import api from '@/lib/api';
import { formatBytes, formatUptime } from '@/lib/utils';
import { Play, Square, RotateCw, Trash2, FileText, Upload, RefreshCw, Bell, Hash, Download, Eye, EyeOff, Clipboard, Globe, GitBranch, ExternalLink } from 'lucide-react';

export default function ProjectDetailPage() {
  const router = useRouter();
  const params = useParams();
  const projectId = params.id as string;

  const [project, setProject] = useState<any>(null);
  const [logs, setLogs] = useState({ combined: '', out: '', error: '' });
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'overview' | 'logs' | 'environment' | 'domains' | 'deployments' | 'git'>('overview');
  const [isRefreshingLogs, setIsRefreshingLogs] = useState(false);
  const [domains, setDomains] = useState<any[]>([]);
  const [deployments, setDeployments] = useState<any[]>([]);
  const [loadingRollback, setLoadingRollback] = useState(false);
  const [newDomain, setNewDomain] = useState('');
  const [newDomainEmail, setNewDomainEmail] = useState('');
  const newDomainRef = useRef<HTMLInputElement | null>(null);
  const [sensitiveMap, setSensitiveMap] = useState<Record<string, boolean>>({});
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [deployLoading, setDeployLoading] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) {
      router.push('/login');
      return;
    }

    // Initial fast load
    fetchProject();
    
    // Load logs only when needed
    if (activeTab === 'logs') {
      fetchLogs();
    }
    
    // Only fetch domains/deployments when on those tabs
    if (activeTab === 'domains') {
      fetchDomains();
    }
    if (activeTab === 'deployments') {
      fetchDeployments();
    }
    
    // Optimized polling - only update current view
    const interval = setInterval(() => {
      if (!loading) {
        fetchProject();
        if (activeTab === 'logs') {
          fetchLogs();
        }
        if (activeTab === 'domains') {
          fetchDomains();
        }
        if (activeTab === 'deployments') {
          fetchDeployments();
        }
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [projectId, router, activeTab]);

  const fetchDomains = async () => {
    try {
      const res = await api.get(`/project/${projectId}/domains`);
      setDomains(res.data.domains || []);
    } catch (err) {
      console.error('Failed to fetch domains:', err);
    }
  };

  const fetchDeployments = async () => {
    try {
      const res = await api.get(`/project/${projectId}/deployments`);
      setDeployments(res.data.deployments || []);
    } catch (err) {
      console.error('Failed to fetch deployments:', err);
    }
  };

  // Ensure that a newly added row is focused for immediate typing
  // focus effect moved below state declarations

  const fetchProject = async (forceEnvUpdate = false) => {
    try {
      const response = await api.get(`/project/${projectId}`);
      setProject(response.data);
      
      // Process env vars if on environment tab AND (no unsaved changes OR force update)
      if (activeTab === 'environment' && (!envDirtyRef.current || forceEnvUpdate)) {
        const ev = response.data.env_vars || {};
        const serverRows: EnvRow[] = Object.entries(ev).map(([k, v]) => ({ id: k, key: k, value: String(v ?? '') }));
        setEnvList(serverRows);
        const initReveal: Record<string, boolean> = {};
        const initSensitive: Record<string, boolean> = {};
        serverRows.forEach((r) => {
          const isSensitive = /token|secret|password|pwd|key|apikey|api_key/i.test(r.key);
          initReveal[r.id] = !isSensitive;
          initSensitive[r.id] = isSensitive;
        });
        setRevealMap(initReveal);
        setSensitiveMap(initSensitive);
      }
      setLoading(false);
    } catch (error) {
      console.error('Failed to fetch project:', error);
      setLoading(false);
    }
  };

  const fetchLogs = async () => {
    try {
      const response = await api.get(`/project/${projectId}/logs?lines=50`);
      setLogs(response.data);
    } catch (error) {
      console.error('Failed to fetch logs:', error);
    }
  };

  const handleRefreshLogs = async () => {
    setIsRefreshingLogs(true);
    await fetchLogs();
    setTimeout(() => setIsRefreshingLogs(false), 500);
  };

  const handleClearLogs = async () => {
    try {
      await api.post(`/project/${projectId}/logs/clear`);
      setLogs({ combined: '', out: '', error: '' });
      await fetchLogs();
    } catch (error) {
      console.error('Failed to clear logs:', error);
    }
  };

  const handleAction = async (action: string) => {
    setActionLoading(action);
    try {
      await api.post(`/project/${projectId}/${action}`);
      await fetchProject();
    } catch (error) {
      console.error(`Failed to ${action}:`, error);
      alert(`Failed to ${action} project`);
    } finally {
      setActionLoading(null);
    }
  };

  const handleDelete = async () => {
    if (!confirm(`Are you sure you want to delete "${project?.display_name}"?`)) return;

    try {
      await api.delete(`/project/${projectId}`);
      router.push('/projects');
    } catch (error) {
      console.error('Failed to delete project:', error);
    }
  };

  const handleRedeploy = async (file: File) => {
    setDeployLoading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);

      await api.post(`/project/${projectId}/deploy`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      alert('✅ Project redeployed successfully!');
      await fetchProject();
      if (activeTab === 'deployments') {
        await fetchDeployments();
      }
    } catch (error) {
      console.error('Failed to redeploy:', error);
      const message = (error as any)?.response?.data?.message || (error as any)?.message || 'Redeploy failed!';
      const busy = /EBUSY|resource busy/i.test(message);
      if (busy) {
        alert(`❌ ${message}\n\nTry stopping the app first, or kill any process using the project folder, then try again.`);
      } else {
        alert(`❌ ${message}`);
      }
    } finally {
      setDeployLoading(false);
    }
  };

  const handleAddDomain = async () => {
    if (!newDomain) {
      return alert('Please enter a domain to add');
    }
    try {
      await api.post(`/project/${projectId}/domain`, { domain: newDomain.trim(), email: newDomainEmail?.trim() || null });
      alert('Domain added and certificate requested (may take a few seconds).');
      setNewDomain('');
      setNewDomainEmail('');
      // Focus input for quick successive adds
      try { newDomainRef.current?.focus(); } catch {}
      fetchDomains();
    } catch (err: any) {
      console.error('Failed to add domain:', err);
      alert(err?.response?.data?.message || 'Failed to add domain');
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    router.push('/login');
  };

  const [sidebarOpen, setSidebarOpen] = useState(true);
  type EnvRow = { id: string; key: string; value: string };
  const [envList, setEnvList] = useState<EnvRow[]>([]);
  const [lastAddedId, setLastAddedId] = useState<string | null>(null);
  // Ensure that a newly added row is focused for immediate typing
  useEffect(() => {
    if (!lastAddedId) return;
    const timer = setTimeout(() => {
      const el = document.querySelector(`input[data-env-id=\"${lastAddedId}\"]`) as HTMLInputElement | null;
      if (el) {
        try { el.focus(); el.select(); } catch {}
      }
    }, 50);
    return () => clearTimeout(timer);
  }, [lastAddedId]);
  const [revealMap, setRevealMap] = useState<Record<string, boolean>>({});
  const [envLoading, setEnvLoading] = useState(false);
  const [envError, setEnvError] = useState('');
  const [envDirty, setEnvDirty] = useState(false);
  const envDirtyRef = useRef(envDirty);
  useEffect(() => { envDirtyRef.current = envDirty; }, [envDirty]);

  if (loading || !project) {
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
            </div>
          </div>
          <main className="p-6">
            <div className="animate-pulse space-y-6">
              <div className="h-64 bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800"></div>
              <div className="grid grid-cols-2 gap-6">
                <div className="h-48 bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800"></div>
                <div className="h-48 bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800"></div>
              </div>
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
              <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">{project.display_name}</h1>
              <p className="text-gray-600 dark:text-gray-400 mt-1">{project.name}</p>
            </div>
            <div className="flex items-center gap-4">
              <div className={`inline-flex items-center px-4 py-2 rounded-full text-sm font-medium ${
                project.pm2Info?.status === 'online'
                  ? 'bg-gray-900 dark:bg-white text-white dark:text-gray-900'
                  : 'bg-gray-200 dark:bg-gray-800 text-gray-900 dark:text-gray-100'
              }`}>
                {project.pm2Info?.status || 'stopped'}
              </div>
            </div>
          </div>
        </div>

        <main className="p-4 sm:p-6 max-w-7xl mx-auto w-full">
        {/* Action Buttons */}
        <div className="flex flex-wrap gap-2 sm:gap-3 mb-6 sm:mb-8">
          {project.pm2Info?.status === 'online' ? (
            <>
              <button 
                onClick={() => handleAction('stop')} 
                disabled={actionLoading !== null || deployLoading}
                className="inline-flex items-center px-3 sm:px-4 py-2 rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-sm disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {actionLoading === 'stop' ? (
                  <>
                    <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                    Stopping...
                  </>
                ) : (
                  <>
                    <Square className="h-4 w-4 mr-2" />
                    Stop
                  </>
                )}
              </button>
              <button 
                onClick={() => handleAction('restart')} 
                disabled={actionLoading !== null || deployLoading}
                className="inline-flex items-center px-3 sm:px-4 py-2 rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-sm disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {actionLoading === 'restart' ? (
                  <>
                    <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                    Restarting...
                  </>
                ) : (
                  <>
                    <RotateCw className="h-4 w-4 mr-2" />
                    Restart
                  </>
                )}
              </button>
            </>
          ) : (
            <button 
              onClick={() => handleAction('start')} 
              disabled={actionLoading !== null || deployLoading}
              className="inline-flex items-center px-3 sm:px-4 py-2 rounded-lg bg-gray-900 dark:bg-white text-white dark:text-gray-900 hover:bg-gray-800 dark:hover:bg-gray-100 transition-colors text-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {actionLoading === 'start' ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  Starting...
                </>
              ) : (
                <>
                  <Play className="h-4 w-4 mr-2" />
                  Start
                </>
              )}
            </button>
          )}
          <button
            onClick={() => router.push(`/projects/${projectId}/editor`)}
            disabled={actionLoading !== null || deployLoading}
            className="inline-flex items-center px-3 sm:px-4 py-2 rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-sm disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <FileText className="h-4 w-4 mr-2" />
            Editor
          </button>
          <button
            onClick={() => {
              const input = document.createElement('input');
              input.type = 'file';
              input.accept = '.zip';
              input.onchange = (e) => {
                const file = (e.target as HTMLInputElement).files?.[0];
                if (file) handleRedeploy(file);
              };
              input.click();
            }}
            disabled={actionLoading !== null || deployLoading}
            className="inline-flex items-center px-3 sm:px-4 py-2 rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-sm disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {deployLoading ? (
              <>
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                Deploying...
              </>
            ) : (
              <>
                <Upload className="h-4 w-4 mr-2" />
                Redeploy
              </>
            )}
          </button>
          <button 
            onClick={handleDelete} 
            disabled={actionLoading !== null || deployLoading}
            className="inline-flex items-center px-3 sm:px-4 py-2 rounded-lg bg-red-600 text-white hover:bg-red-700 transition-colors text-sm disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Trash2 className="h-4 w-4 mr-2" />
            Delete
          </button>
        </div>

        {/* Loading Overlay */}
        {(actionLoading || deployLoading) && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center">
            <div className="bg-white dark:bg-gray-900 rounded-2xl p-8 shadow-2xl border-2 border-gray-200 dark:border-gray-700 max-w-sm mx-4">
              <div className="flex flex-col items-center gap-4">
                <div className="relative">
                  <div className="w-16 h-16 border-4 border-gray-200 dark:border-gray-700 rounded-full"></div>
                  <div className="w-16 h-16 border-4 border-gray-900 dark:border-white border-t-transparent rounded-full animate-spin absolute top-0"></div>
                </div>
                <div className="text-center">
                  <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-1">
                    {deployLoading ? 'Deploying Project...' : `${actionLoading?.charAt(0).toUpperCase()}${actionLoading?.slice(1)}ing...`}
                  </h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    {deployLoading ? 'This may take a few moments' : 'Please wait...'}
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Tabs */}
        <div className="border-b border-gray-200 dark:border-gray-800 mb-6">
          <nav className="-mb-px flex space-x-8">
            <button
              onClick={() => setActiveTab('overview')}
              className={`${
                activeTab === 'overview'
                  ? 'border-gray-900 dark:border-white text-gray-900 dark:text-gray-100'
                  : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100'
              } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm`}
            >
              Overview
            </button>
            <button
              onClick={() => setActiveTab('logs')}
              className={`${
                activeTab === 'logs'
                  ? 'border-gray-900 dark:border-white text-gray-900 dark:text-gray-100'
                  : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100'
              } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm flex items-center`}
            >
              <FileText className="h-4 w-4 mr-2" />
              Logs
            </button>
            <button
              onClick={() => setActiveTab('environment')}
              className={`${
                activeTab === 'environment'
                  ? 'border-gray-900 dark:border-white text-gray-900 dark:text-gray-100'
                  : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100'
              } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm flex items-center`}
            >
              <Hash className="h-4 w-4 mr-2" />
              Environment
            </button>
            <button
              onClick={() => setActiveTab('domains')}
              className={`${
                activeTab === 'domains'
                  ? 'border-gray-900 dark:border-white text-gray-900 dark:text-gray-100'
                  : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100'
              } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm flex items-center`}
            >
              <Globe className="h-4 w-4 mr-2" />
              Domains
            </button>
            <button
              onClick={() => setActiveTab('deployments')}
              className={`${
                activeTab === 'deployments'
                  ? 'border-gray-900 dark:border-white text-gray-900 dark:text-gray-100'
                  : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100'
              } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm flex items-center`}
            >
              <RotateCw className="h-4 w-4 mr-2" />
              Deployments
            </button>
            {project?.deploy_method === 'git' && (
              <button
                onClick={() => setActiveTab('git')}
                className={`${
                  activeTab === 'git'
                    ? 'border-gray-900 dark:border-white text-gray-900 dark:text-gray-100'
                    : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100'
                } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm flex items-center`}
              >
                <GitBranch className="h-4 w-4 mr-2" />
                Git
              </button>
            )}
          </nav>
        </div>

        {activeTab === 'overview' && (
          <div className="space-y-6">
            {/* Status Banner */}
            <div className={`rounded-xl border-2 p-6 ${
              project.pm2Info?.status === 'online'
                ? 'border-green-200 dark:border-green-800 bg-gradient-to-br from-green-50 to-white dark:from-green-950/20 dark:to-gray-950'
                : 'border-yellow-200 dark:border-yellow-800 bg-gradient-to-br from-yellow-50 to-white dark:from-yellow-950/20 dark:to-gray-950'
            }`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className={`w-16 h-16 rounded-2xl flex items-center justify-center ${
                    project.pm2Info?.status === 'online'
                      ? 'bg-green-100 dark:bg-green-900/30'
                      : 'bg-yellow-100 dark:bg-yellow-900/30'
                  }`}>
                    {project.pm2Info?.status === 'online' ? (
                      <svg className="w-8 h-8 text-green-600 dark:text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    ) : (
                      <svg className="w-8 h-8 text-yellow-600 dark:text-yellow-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                      </svg>
                    )}
                  </div>
                  <div>
                    <h3 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-1">
                      {project.pm2Info?.status === 'online' ? 'Running' : 'Stopped'}
                    </h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      {project.pm2Info?.status === 'online' 
                        ? `Application is running smoothly on port ${project.port || 'default'}`
                        : 'Application is currently stopped'}
                    </p>
                  </div>
                </div>
                {project.pm2Info?.status === 'online' && (
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-green-500 animate-pulse"></div>
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Live</span>
                  </div>
                )}
              </div>
            </div>

            {/* Metrics Grid */}
            {project.pm2Info && (
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-6 hover:shadow-lg transition-shadow">
                  <div className="flex items-center justify-between mb-4">
                    <div className="w-12 h-12 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                      <svg className="w-6 h-6 text-blue-600 dark:text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                      </svg>
                    </div>
                  </div>
                  <p className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-1">CPU Usage</p>
                  <p className="text-3xl font-bold text-gray-900 dark:text-gray-100">{project.pm2Info.cpu}%</p>
                </div>

                <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-6 hover:shadow-lg transition-shadow">
                  <div className="flex items-center justify-between mb-4">
                    <div className="w-12 h-12 rounded-lg bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
                      <svg className="w-6 h-6 text-purple-600 dark:text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4" />
                      </svg>
                    </div>
                  </div>
                  <p className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-1">Memory</p>
                  <p className="text-3xl font-bold text-gray-900 dark:text-gray-100">{formatBytes(project.pm2Info.memory)}</p>
                </div>

                <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-6 hover:shadow-lg transition-shadow">
                  <div className="flex items-center justify-between mb-4">
                    <div className="w-12 h-12 rounded-lg bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                      <svg className="w-6 h-6 text-green-600 dark:text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    </div>
                  </div>
                  <p className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-1">Uptime</p>
                  <p className="text-3xl font-bold text-gray-900 dark:text-gray-100">{formatUptime(Date.now() - project.pm2Info.uptime)}</p>
                </div>

                <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-6 hover:shadow-lg transition-shadow">
                  <div className="flex items-center justify-between mb-4">
                    <div className="w-12 h-12 rounded-lg bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center">
                      <svg className="w-6 h-6 text-orange-600 dark:text-orange-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                    </div>
                  </div>
                  <p className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-1">Restarts</p>
                  <p className="text-3xl font-bold text-gray-900 dark:text-gray-100">{project.pm2Info.restarts}</p>
                </div>
              </div>
            )}

            {/* Project Details Card */}
            <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 overflow-hidden">
              <div className="bg-gradient-to-r from-gray-50 to-gray-100 dark:from-gray-800 dark:to-gray-900 px-6 py-4 border-b border-gray-200 dark:border-gray-800">
                <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">Project Configuration</h3>
              </div>
              <div className="p-6 space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-sm font-medium text-gray-600 dark:text-gray-400">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                      Start Command
                    </div>
                    <div className="pl-6">
                      <code className="block px-4 py-3 rounded-lg bg-gray-100 dark:bg-gray-950 border border-gray-200 dark:border-gray-800 font-mono text-sm text-gray-900 dark:text-gray-100 break-all">
                        {project.start_command}
                      </code>
                    </div>
                  </div>

                  {project.port && (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-sm font-medium text-gray-600 dark:text-gray-400">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
                        </svg>
                        Port
                      </div>
                      <div className="pl-6">
                        <div className="inline-flex items-center px-4 py-3 rounded-lg bg-blue-100 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800">
                          <span className="text-2xl font-bold text-blue-700 dark:text-blue-400">{project.port}</span>
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="space-y-2 md:col-span-2">
                    <div className="flex items-center gap-2 text-sm font-medium text-gray-600 dark:text-gray-400">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                      </svg>
                      Project Path
                    </div>
                    <div className="pl-6">
                      <code className="block px-4 py-3 rounded-lg bg-gray-100 dark:bg-gray-950 border border-gray-200 dark:border-gray-800 font-mono text-xs text-gray-900 dark:text-gray-100 break-all">
                        {project.path}
                      </code>
                    </div>
                  </div>

                  {project.deploy_method && (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-sm font-medium text-gray-600 dark:text-gray-400">
                        <GitBranch className="w-4 h-4" />
                        Deploy Method
                      </div>
                      <div className="pl-6">
                        <span className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium ${
                          project.deploy_method === 'git'
                            ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400 border border-purple-200 dark:border-purple-800'
                            : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-700'
                        }`}>
                          {project.deploy_method === 'git' ? (
                            <>
                              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                                <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
                              </svg>
                              Git Repository
                            </>
                          ) : (
                            <>
                              <Upload className="w-4 h-4" />
                              ZIP Upload
                            </>
                          )}
                        </span>
                      </div>
                    </div>
                  )}

                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-sm font-medium text-gray-600 dark:text-gray-400">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      Created
                    </div>
                    <div className="pl-6">
                      <p className="text-sm text-gray-900 dark:text-gray-100">
                        {project.created_at ? new Date(project.created_at).toLocaleString() : 'N/A'}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

          </div>
        )}

        {activeTab === 'logs' && (
          <div className="grid gap-4 sm:gap-6">
            <div className="flex flex-wrap justify-end gap-2 sm:gap-3 mb-2 sm:mb-4">
              <button
                onClick={handleClearLogs}
                className="flex items-center gap-2 px-3 sm:px-4 py-2 rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              >
                <Trash2 className="h-4 w-4" />
                <span className="text-xs sm:text-sm font-medium">Clear</span>
              </button>
              <button
                onClick={handleRefreshLogs}
                disabled={isRefreshingLogs}
                className="flex items-center gap-2 px-3 sm:px-4 py-2 rounded-lg bg-gray-900 dark:bg-white text-white dark:text-gray-900 hover:bg-gray-800 dark:hover:bg-gray-100 transition-colors disabled:opacity-50"
              >
                <RefreshCw className={`h-4 w-4 ${isRefreshingLogs ? 'animate-spin' : ''}`} />
                <span className="text-xs sm:text-sm font-medium">Refresh</span>
              </button>
            </div>

            <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 sm:p-6">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Application Logs</h3>
              <div className="overflow-hidden rounded-lg border border-gray-800">
                <pre className="bg-gray-950 dark:bg-black text-gray-300 p-4 overflow-x-auto max-h-[600px] text-xs sm:text-sm font-mono whitespace-pre-wrap break-all">
                  {logs.combined ? logs.combined.split('\n').map((line, i) => (
                    <div key={i} className={line.startsWith('[ERROR]') ? 'text-red-400' : 'text-green-400'}>
                      {line}
                    </div>
                  )) : 'No logs available yet'}
                </pre>
              </div>
            </div>
          </div>
        )}
        {activeTab === 'environment' && (
          <div className="space-y-4">
            {/* Header Card */}
            <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-gradient-to-br from-gray-50 to-white dark:from-gray-900 dark:to-gray-950 p-6">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                  <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100">Environment Variables</h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                    Manage your application's environment configuration
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={async () => {
                      try {
                        const res = await api.get(`/project/${projectId}/env/download`, { responseType: 'text' });
                        const blob = new Blob([res.data], { type: 'text/plain' });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = `${project.name}.env`;
                        document.body.appendChild(a);
                        a.click();
                        a.remove();
                        URL.revokeObjectURL(url);
                      } catch (error) {
                        console.error('Failed to download .env:', error);
                        alert('Failed to download .env');
                      }
                    }}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border-2 border-gray-900 dark:border-white text-gray-900 dark:text-white hover:bg-gray-900 hover:text-white dark:hover:bg-white dark:hover:text-gray-900 transition-all text-sm font-medium"
                  >
                    <Download className="h-4 w-4" />
                    <span className="hidden sm:inline">Download</span>
                  </button>
                  <label className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border-2 border-gray-900 dark:border-white text-gray-900 dark:text-white hover:bg-gray-900 hover:text-white dark:hover:bg-white dark:hover:text-gray-900 transition-all text-sm font-medium cursor-pointer">
                    <Upload className="h-4 w-4" />
                    <span className="hidden sm:inline">Upload</span>
                    <input
                      type="file"
                      accept=".env,text/plain"
                      className="hidden"
                      onChange={async (e) => {
                        const file = (e.target as HTMLInputElement).files?.[0];
                        if (!file) return;
                        const formData = new FormData();
                        formData.append('file', file);
                        try {
                          await api.post(`/project/${projectId}/env/upload`, formData, {
                            headers: { 'Content-Type': 'multipart/form-data' },
                          });
                          alert('✅ Env file uploaded successfully');
                          // Reset dirty flag and force update
                          setEnvDirty(false);
                          await fetchProject(true);
                        } catch (err) {
                          console.error('Failed to upload .env:', err);
                          alert('❌ Failed to upload .env file');
                        }
                        // Reset the file input
                        (e.target as HTMLInputElement).value = '';
                      }}
                    />
                  </label>
                </div>
              </div>
              
              {envDirty && (
                <div className="mt-4 flex items-center gap-2 px-4 py-2 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
                  <Bell className="h-4 w-4 text-yellow-600 dark:text-yellow-400" />
                  <span className="text-sm font-medium text-yellow-800 dark:text-yellow-200">You have unsaved changes</span>
                </div>
              )}
            </div>

            {/* Variables List */}
            <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 overflow-hidden">
              {envList.length === 0 ? (
                <div className="p-12 text-center">
                  <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-gray-100 dark:bg-gray-800 mb-4">
                    <Hash className="h-8 w-8 text-gray-400" />
                  </div>
                  <h4 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">No variables yet</h4>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">Add environment variables to configure your application</p>
                  <button
                    onClick={() => {
                      const newId = (typeof crypto !== 'undefined' && 'randomUUID' in crypto)
                        ? (crypto as any).randomUUID()
                        : `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
                      setEnvList([{ id: newId, key: '', value: '' }]);
                      setRevealMap({ [newId]: false });
                      setSensitiveMap({ [newId]: false });
                      setLastAddedId(newId);
                      setEnvDirty(true);
                    }}
                    className="inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-gray-900 dark:bg-white text-white dark:text-gray-900 hover:bg-gray-800 dark:hover:bg-gray-100 transition-colors font-medium"
                  >
                    <Hash className="h-5 w-5" />
                    Add First Variable
                  </button>
                </div>
              ) : (
                <div className="divide-y divide-gray-200 dark:divide-gray-800">
                  {envList.map((row, idx) => (
                    <div key={row.id} className="p-4 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                      <div className="flex flex-col lg:flex-row lg:items-center gap-3">
                        {/* Key Input */}
                        <div className="flex-1 min-w-0">
                          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">
                            Variable Name
                          </label>
                          <input
                            data-env-id={row.id}
                            placeholder="DATABASE_URL"
                            autoComplete="off"
                            className="w-full h-11 rounded-lg border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-950 px-4 text-sm font-medium text-gray-900 dark:text-gray-100 focus:border-gray-900 dark:focus:border-white focus:ring-0 transition-colors"
                            value={row.key}
                            onFocus={(e) => {
                              try { (e.target as HTMLInputElement).select(); } catch {}
                              setEnvDirty(true);
                              setLastAddedId(null);
                            }}
                            autoFocus={row.id === lastAddedId}
                            onChange={(e) => {
                              const newKey = e.target.value;
                              setEnvList(prev => prev.map(r => r.id === row.id ? { ...r, key: newKey } : r));
                              const isSensitive = /token|secret|password|pwd|key|apikey|api_key/i.test(newKey);
                              setSensitiveMap(prev => ({ ...prev, [row.id]: isSensitive }));
                              setEnvDirty(true);
                            }}
                          />
                        </div>

                        {/* Value Input */}
                        <div className="flex-1 min-w-0">
                          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">
                            Value {sensitiveMap[row.id] && <span className="text-yellow-600 dark:text-yellow-400">(Sensitive)</span>}
                          </label>
                          <div className="relative">
                            <input
                              className="w-full h-11 rounded-lg border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-950 px-4 pr-12 text-sm font-mono text-gray-900 dark:text-gray-100 focus:border-gray-900 dark:focus:border-white focus:ring-0 transition-colors"
                              value={row.value}
                              placeholder="your-value-here"
                              autoComplete="new-password"
                              type={revealMap[row.id] ? 'text' : 'password'}
                              onChange={(e) => {
                                setEnvList(prev => prev.map(r => r.id === row.id ? { ...r, value: e.target.value } : r));
                                setEnvDirty(true);
                              }}
                            />
                            <button
                              onClick={() => setRevealMap(prev => ({ ...prev, [row.id]: !prev[row.id] }))}
                              className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 dark:text-gray-400 transition-colors"
                              title={revealMap[row.id] ? 'Hide value' : 'Show value'}
                            >
                              {revealMap[row.id] ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                            </button>
                          </div>
                        </div>

                        {/* Actions */}
                        <div className="flex items-end gap-2 lg:pb-0.5">
                          <button
                            onClick={() => {
                              navigator.clipboard?.writeText(row.value).then(() => {
                                const btn = document.activeElement as HTMLButtonElement;
                                const originalText = btn?.innerHTML;
                                if (btn) {
                                  btn.innerHTML = '<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg>';
                                  setTimeout(() => { btn.innerHTML = originalText; }, 1000);
                                }
                              }).catch(() => {});
                            }}
                            className="p-2.5 rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                            title="Copy value"
                          >
                            <Clipboard className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => {
                              setEnvList(prev => prev.filter(r => r.id !== row.id));
                              setRevealMap(prev => { const copy = { ...prev }; delete copy[row.id]; return copy; });
                              setSensitiveMap(prev => { const copy = { ...prev }; delete copy[row.id]; return copy; });
                              setEnvDirty(true);
                            }}
                            className="p-2.5 rounded-lg bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 hover:bg-red-200 dark:hover:bg-red-900/50 transition-colors"
                            title="Delete variable"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Actions Footer */}
            <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
              <div className="flex flex-wrap items-center gap-3">
                <button
                  onClick={() => {
                    const newId = (typeof crypto !== 'undefined' && 'randomUUID' in crypto)
                      ? (crypto as any).randomUUID()
                      : `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
                    setEnvList(prev => [...prev, { id: newId, key: '', value: '' }]);
                    setRevealMap(prev => ({ ...prev, [newId]: false }));
                    setSensitiveMap(prev => ({ ...prev, [newId]: false }));
                    setLastAddedId(newId);
                    setEnvDirty(true);
                  }}
                  className="inline-flex items-center gap-2 px-6 py-2.5 rounded-lg border-2 border-gray-900 dark:border-white text-gray-900 dark:text-white hover:bg-gray-900 hover:text-white dark:hover:bg-white dark:hover:text-gray-900 transition-all font-medium"
                >
                  <Hash className="h-4 w-4" />
                  Add Variable
                </button>
                
                <div className="flex-1"></div>
                
                {envList.length > 0 && (
                  <button
                    onClick={() => {
                      if (!confirm('Clear all environment variables?')) return;
                      setEnvList([]);
                      setRevealMap({});
                      setSensitiveMap({});
                      setLastAddedId(null);
                      setEnvDirty(true);
                    }}
                    className="inline-flex items-center gap-2 px-6 py-2.5 rounded-lg border-2 border-red-600 text-red-600 hover:bg-red-600 hover:text-white transition-all font-medium"
                  >
                    <Trash2 className="h-4 w-4" />
                    Clear All
                  </button>
                )}
                
                {envDirty && (
                  <button
                    disabled={envLoading}
                    onClick={async () => {
                      setEnvLoading(true);
                      setEnvError('');
                      try {
                        const payload: Record<string, string> = {};
                        envList.forEach((r) => {
                          if (r.key?.trim()) payload[r.key] = r.value;
                        });
                        await api.put(`/project/${projectId}/env`, { envVars: payload });
                        setEnvDirty(false);
                        setLastAddedId(null);
                        alert('Environment updated successfully');
                        await fetchProject();
                      } catch (error: any) {
                        console.error('Failed to save env:', error);
                        setEnvError(error.response?.data?.error || 'Failed to save environment');
                      } finally {
                        setEnvLoading(false);
                      }
                    }}
                    className="inline-flex items-center gap-2 px-8 py-2.5 rounded-lg bg-gray-900 dark:bg-white text-white dark:text-gray-900 hover:bg-gray-800 dark:hover:bg-gray-100 transition-colors font-bold disabled:opacity-50 disabled:cursor-not-allowed shadow-lg"
                  >
                    {envLoading ? (
                      <>
                        <RefreshCw className="h-4 w-4 animate-spin" />
                        Saving...
                      </>
                    ) : (
                      <>
                        <Download className="h-4 w-4" />
                        Save Changes
                      </>
                    )}
                  </button>
                )}
              </div>
              
              {envError && (
                <div className="mt-3 flex items-center gap-2 px-4 py-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                  <span className="text-sm font-medium text-red-800 dark:text-red-200">{envError}</span>
                </div>
              )}
            </div>
          </div>
        )}
        {activeTab === 'domains' && (
          <div className="space-y-4">
            {/* Header Card */}
            <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-gradient-to-br from-blue-50 to-white dark:from-blue-950/20 dark:to-gray-950 p-6">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                  <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100">Domains & SSL</h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                    Connect custom domains and manage SSL certificates
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={fetchDomains}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border-2 border-gray-900 dark:border-white text-gray-900 dark:text-white hover:bg-gray-900 hover:text-white dark:hover:bg-white dark:hover:text-gray-900 transition-all text-sm font-medium"
                  >
                    <RefreshCw className="h-4 w-4" />
                    Refresh
                  </button>
                </div>
              </div>
            </div>

            {/* Domains List */}
            <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 overflow-hidden">
              {domains.length === 0 ? (
                <div className="p-12 text-center">
                  <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-blue-100 dark:bg-blue-900/30 mb-4">
                    <Globe className="h-8 w-8 text-blue-600 dark:text-blue-400" />
                  </div>
                  <h4 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">No domains configured</h4>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">Add a custom domain to make your app accessible via your own URL</p>
                </div>
              ) : (
                <div className="divide-y divide-gray-200 dark:divide-gray-800">
                  {domains.map((d: any) => (
                    <div key={d.id} className="p-4 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-2">
                            <h4 className="text-lg font-bold text-gray-900 dark:text-gray-100">{d.domain}</h4>
                            {d.verified ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 text-xs font-medium">
                                <svg className="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 20 20">
                                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                                </svg>
                                DNS Verified
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400 text-xs font-medium">
                                <Bell className="h-3.5 w-3.5" />
                                Not Verified
                              </span>
                            )}
                            {d.cert_path && (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 text-xs font-medium">
                                <svg className="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 20 20">
                                  <path fillRule="evenodd" d="M2.166 4.999A11.954 11.954 0 0010 1.944 11.954 11.954 0 0017.834 5c.11.65.166 1.32.166 2.001 0 5.225-3.34 9.67-8 11.317C5.34 16.67 2 12.225 2 7c0-.682.057-1.35.166-2.001zm11.541 3.708a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                                </svg>
                                SSL Active
                              </span>
                            )}
                          </div>
                          <div className="space-y-1 text-sm text-gray-600 dark:text-gray-400">
                            {d.cert_path ? (
                              <p>🔒 SSL configured • Expires: {d.expires_at ? new Date(d.expires_at).toLocaleString() : 'unknown'}</p>
                            ) : (
                              <p>⚠️ No SSL certificate yet</p>
                            )}
                            {d.verified_at && (
                              <p className="text-xs">Verified: {new Date(d.verified_at).toLocaleString()}</p>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={async () => {
                              try {
                                const btn = document.activeElement as HTMLButtonElement;
                                if (btn) btn.disabled = true;
                                const res = await api.post(`/project/${projectId}/domain/${d.id}/verify`);
                                if (res.data.verified) {
                                  alert(`✅ DNS Verified!\n\nServer IP: ${res.data.serverIP}\nDomain resolves to: ${res.data.resolvedIPs.join(', ')}`);
                                  await fetchDomains();
                                } else {
                                  alert(`❌ DNS Not Verified\n\nExpected IP: ${res.data.expected}\nActual IP: ${res.data.actual || 'Not found'}\n\n${res.data.message}`);
                                }
                                if (btn) btn.disabled = false;
                              } catch (err: any) {
                                alert(`DNS Verification Failed:\n${err?.response?.data?.message || err.message}`);
                                const btn = document.activeElement as HTMLButtonElement;
                                if (btn) btn.disabled = false;
                              }
                            }}
                            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors text-sm font-medium"
                          >
                            <RefreshCw className="h-4 w-4" />
                            Verify DNS
                          </button>
                          <button
                            onClick={async () => {
                              if (!confirm(`Remove domain ${d.domain}?`)) return;
                              try {
                                await api.delete(`/project/${projectId}/domain/${d.id}`);
                                await fetchDomains();
                              } catch (err) {
                                alert('Failed to remove domain');
                              }
                            }}
                            className="p-2.5 rounded-lg bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 hover:bg-red-200 dark:hover:bg-red-900/50 transition-colors"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Add Domain Card */}
            <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-6">
              <h4 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Add New Domain</h4>
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Domain Name
                    </label>
                    <input
                      ref={newDomainRef}
                      value={newDomain}
                      onChange={(e) => setNewDomain(e.target.value)}
                      placeholder="example.com"
                      className="w-full h-11 rounded-lg border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-950 px-4 text-sm focus:border-gray-900 dark:focus:border-white focus:ring-0 transition-colors"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Email (for SSL)
                    </label>
                    <input
                      value={newDomainEmail}
                      onChange={(e) => setNewDomainEmail(e.target.value)}
                      placeholder="admin@domain.com (optional)"
                      className="w-full h-11 rounded-lg border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-950 px-4 text-sm focus:border-gray-900 dark:focus:border-white focus:ring-0 transition-colors"
                    />
                  </div>
                </div>
                <button
                  onClick={handleAddDomain}
                  className="inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-gray-900 dark:bg-white text-white dark:text-gray-900 hover:bg-gray-800 dark:hover:bg-gray-100 transition-colors font-bold shadow-lg"
                >
                  <Globe className="h-5 w-5" />
                  Add Domain
                </button>
              </div>
            </div>
          </div>
        )}
        {activeTab === 'deployments' && (
          <div className="space-y-4">
            {/* Header Card */}
            <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-gradient-to-br from-purple-50 to-white dark:from-purple-950/20 dark:to-gray-950 p-6">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                  <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100">Deployment History</h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                    Track and rollback to previous versions
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={fetchDeployments}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border-2 border-gray-900 dark:border-white text-gray-900 dark:text-white hover:bg-gray-900 hover:text-white dark:hover:bg-white dark:hover:text-gray-900 transition-all text-sm font-medium"
                  >
                    <RefreshCw className="h-4 w-4" />
                    Refresh
                  </button>
                </div>
              </div>
            </div>

            {/* Deployments List */}
            <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 overflow-hidden">
              {deployments.length === 0 ? (
                <div className="p-12 text-center">
                  <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-purple-100 dark:bg-purple-900/30 mb-4">
                    <RotateCw className="h-8 w-8 text-purple-600 dark:text-purple-400" />
                  </div>
                  <h4 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">No deployments yet</h4>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
                    Deployments are created when you upload a ZIP file or redeploy your project
                  </p>
                  <button
                    onClick={() => {
                      const input = document.createElement('input');
                      input.type = 'file';
                      input.accept = '.zip';
                      input.onchange = (e) => {
                        const file = (e.target as HTMLInputElement).files?.[0];
                        if (file) handleRedeploy(file);
                      };
                      input.click();
                    }}
                    className="inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-gray-900 dark:bg-white text-white dark:text-gray-900 hover:bg-gray-800 dark:hover:bg-gray-100 transition-colors font-medium"
                  >
                    <Upload className="h-5 w-5" />
                    Deploy Now
                  </button>
                </div>
              ) : (
                <div className="divide-y divide-gray-200 dark:divide-gray-800">
                  {deployments.map((d: any, index: number) => (
                    <div key={d.id} className="p-4 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                        <div className="flex items-start gap-4 flex-1">
                          {/* Timeline indicator */}
                          <div className="flex flex-col items-center">
                            <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                              index === 0
                                ? 'bg-green-100 dark:bg-green-900/30 border-2 border-green-500'
                                : 'bg-gray-100 dark:bg-gray-800 border-2 border-gray-300 dark:border-gray-700'
                            }`}>
                              {index === 0 ? (
                                <svg className="w-5 h-5 text-green-600 dark:text-green-400" fill="currentColor" viewBox="0 0 20 20">
                                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                                </svg>
                              ) : (
                                <span className="text-sm font-bold text-gray-500 dark:text-gray-400">{index + 1}</span>
                              )}
                            </div>
                            {index !== deployments.length - 1 && (
                              <div className="w-0.5 h-12 bg-gray-200 dark:bg-gray-800 mt-2"></div>
                            )}
                          </div>

                          {/* Deployment info */}
                          <div className="flex-1">
                            <div className="flex items-center gap-3 mb-2">
                              <h4 className="text-lg font-bold text-gray-900 dark:text-gray-100">
                                {d.version || `Deployment #${deployments.length - index}`}
                              </h4>
                              {index === 0 && (
                                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 text-xs font-medium">
                                  <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                                  </svg>
                                  Current
                                </span>
                              )}
                              <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${
                                d.status === 'success'
                                  ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400'
                                  : d.status === 'failed'
                                  ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'
                                  : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300'
                              }`}>
                                {d.status || 'unknown'}
                              </span>
                            </div>
                            <div className="space-y-1 text-sm text-gray-600 dark:text-gray-400">
                              <div className="flex items-center gap-2">
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                </svg>
                                <span>{new Date(d.deployed_at).toLocaleString()}</span>
                              </div>
                              {d.deploy_method && (
                                <div className="flex items-center gap-2">
                                  {d.deploy_method === 'git' ? (
                                    <GitBranch className="w-4 h-4" />
                                  ) : (
                                    <Upload className="w-4 h-4" />
                                  )}
                                  <span>via {d.deploy_method === 'git' ? 'Git' : 'ZIP Upload'}</span>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Actions */}
                        {index !== 0 && (
                          <div className="flex items-center gap-2">
                            <button
                              onClick={async () => {
                                if (!confirm(`Rollback to this deployment from ${new Date(d.deployed_at).toLocaleString()}?`)) return;
                                setLoadingRollback(true);
                                try {
                                  await api.post(`/project/${projectId}/rollback`, { deploymentId: d.id });
                                  alert('✅ Rollback started! The process will complete in a few moments.');
                                  await fetchDeployments();
                                  await fetchProject();
                                } catch (err: any) {
                                  console.error('Rollback failed:', err);
                                  alert(`❌ Rollback failed:\n${err?.response?.data?.message || err.message}`);
                                } finally {
                                  setLoadingRollback(false);
                                }
                              }}
                              disabled={loadingRollback}
                              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-orange-600 text-white hover:bg-orange-700 transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              <RotateCw className={`h-4 w-4 ${loadingRollback ? 'animate-spin' : ''}`} />
                              {loadingRollback ? 'Rolling back...' : 'Rollback'}
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Info Card */}
            {deployments.length > 0 && (
              <div className="rounded-xl border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/20 p-4">
                <div className="flex items-start gap-3">
                  <svg className="w-5 h-5 text-blue-600 dark:text-blue-400 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                  </svg>
                  <div>
                    <h4 className="text-sm font-semibold text-blue-900 dark:text-blue-100 mb-1">About Rollbacks</h4>
                    <p className="text-sm text-blue-800 dark:text-blue-200">
                      Rolling back restores your project to a previous deployment. The application will restart automatically with the selected version.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'git' && project?.deploy_method === 'git' && (
          <div>
            <GitInfo projectId={projectId} />
          </div>
        )}
        </main>
      </div>
    </div>
  );
}
