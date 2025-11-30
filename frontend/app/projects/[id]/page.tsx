'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { DashboardSidebar } from '@/components/ui/dashboard-sidebar';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import api from '@/lib/api';
import { formatBytes, formatUptime } from '@/lib/utils';
import { Play, Square, RotateCw, Trash2, FileText, Upload, RefreshCw, LogOut, Bell, Hash, Download, Eye, EyeOff, Clipboard, Globe } from 'lucide-react';

export default function ProjectDetailPage() {
  const router = useRouter();
  const params = useParams();
  const projectId = params.id as string;

  const [project, setProject] = useState<any>(null);
  const [logs, setLogs] = useState({ out: '', error: '' });
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'overview' | 'logs' | 'environment' | 'domains' | 'deployments'>('overview');
  const [isRefreshingLogs, setIsRefreshingLogs] = useState(false);
  const [domains, setDomains] = useState<any[]>([]);
  const [deployments, setDeployments] = useState<any[]>([]);
  const [loadingRollback, setLoadingRollback] = useState(false);
  const [newDomain, setNewDomain] = useState('');
  const [newDomainEmail, setNewDomainEmail] = useState('');
  const newDomainRef = useRef<HTMLInputElement | null>(null);
  const [sensitiveMap, setSensitiveMap] = useState<Record<string, boolean>>({});

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
    
    // Slower polling interval
    const interval = setInterval(() => {
      if (!loading) {
        fetchProject();
        if (activeTab === 'logs') {
          fetchLogs();
        }
        // also refresh domains periodically
        fetchDomains();
        // also refresh deployments periodically
        fetchDeployments();
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [projectId, router, activeTab]);

  // When user opens Domains tab, ensure list is refreshed
  useEffect(() => {
    if (activeTab === 'domains') {
      fetchDomains();
    }
    if (activeTab === 'deployments') {
      fetchDeployments();
    }
  }, [activeTab]);

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

  const fetchProject = async () => {
    try {
      const response = await api.get(`/project/${projectId}`);
      setProject(response.data);
      const ev = response.data.env_vars || {};
      const serverRows: EnvRow[] = Object.entries(ev).map(([k, v]) => ({ id: k, key: k, value: String(v ?? '') }));
      if (!envDirtyRef.current) {
        // Replace everything when no local unsaved changes
        setEnvList(serverRows);
        const initReveal: Record<string, boolean> = {};
        const initSensitive: Record<string, boolean> = {};
        serverRows.forEach((r) => {
          const isSensitive = /token|secret|password|pwd|key|apikey|api_key/i.test(r.key);
          // default reveal: show non-sensitive keys, hide sensitive keys
          initReveal[r.id] = !isSensitive;
          initSensitive[r.id] = isSensitive;
        });
        setRevealMap(initReveal);
        setSensitiveMap(initSensitive);
      } else {
        // When local unsaved changes exist, merge server rows with local envList instead of replacing.
        setEnvList((local) => {
          const localKeys = new Set(local.map(r => r.key).filter(Boolean));
          const toAdd = serverRows.filter(r => r.key && !localKeys.has(r.key));
          const merged = [...local, ...toAdd];
          // Ensure any server-only rows have defaults applied in reveal/sensitive maps
          // functional updates to avoid stale closure references
          setRevealMap((prev) => {
            const copy = { ...prev };
            toAdd.forEach((r) => {
              if (!(r.id in copy)) {
                const isSensitive = /token|secret|password|pwd|key|apikey|api_key/i.test(r.key);
                copy[r.id] = !isSensitive;
              }
            });
            return copy;
          });

          setSensitiveMap((prev) => {
            const copy = { ...prev };
            toAdd.forEach((r) => {
              if (!(r.id in copy)) {
                const isSensitive = /token|secret|password|pwd|key|apikey|api_key/i.test(r.key);
                copy[r.id] = isSensitive;
              }
            });
            return copy;
          });
          return merged;
        });
      }
      setLoading(false);
      // fetch domains after we load project
      fetchDomains();
      fetchDeployments();
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
      setLogs({ out: '', error: '' });
      await fetchLogs();
    } catch (error) {
      console.error('Failed to clear logs:', error);
    }
  };

  const handleAction = async (action: string) => {
    try {
      await api.post(`/project/${projectId}/${action}`);
      fetchProject();
    } catch (error) {
      console.error(`Failed to ${action}:`, error);
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
    try {
      const formData = new FormData();
      formData.append('file', file);

      await api.post(`/project/${projectId}/deploy`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      alert('Project redeployed successfully!');
      fetchProject();
    } catch (error) {
      console.error('Failed to redeploy:', error);
      const message = (error as any)?.response?.data?.message || (error as any)?.message || 'Redeploy failed!';
      const busy = /EBUSY|resource busy/i.test(message);
      if (busy) {
        alert(`${message}. Try stopping the app (Stop), or kill any process using the project folder, then try again.`);
      } else {
        alert(message);
      }
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

        <main className="p-4 sm:p-6 max-w-7xl mx-auto w-full">
        {/* Action Buttons */}
        <div className="flex flex-wrap gap-2 sm:gap-3 mb-6 sm:mb-8">
          {project.pm2Info?.status === 'online' ? (
            <>
              <button 
                onClick={() => handleAction('stop')} 
                className="inline-flex items-center px-3 sm:px-4 py-2 rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-sm"
              >
                <Square className="h-4 w-4 mr-2" />
                Stop
              </button>
              <button 
                onClick={() => handleAction('restart')} 
                className="inline-flex items-center px-3 sm:px-4 py-2 rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-sm"
              >
                <RotateCw className="h-4 w-4 mr-2" />
                Restart
              </button>
            </>
          ) : (
            <button 
              onClick={() => handleAction('start')} 
              className="inline-flex items-center px-3 sm:px-4 py-2 rounded-lg bg-gray-900 dark:bg-white text-white dark:text-gray-900 hover:bg-gray-800 dark:hover:bg-gray-100 transition-colors text-sm"
            >
              <Play className="h-4 w-4 mr-2" />
              Start
            </button>
          )}
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
            className="inline-flex items-center px-3 sm:px-4 py-2 rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-sm"
          >
            <Upload className="h-4 w-4 mr-2" />
            Redeploy
          </button>
          <button 
            onClick={handleDelete} 
            className="inline-flex items-center px-3 sm:px-4 py-2 rounded-lg bg-red-600 text-white hover:bg-red-700 transition-colors text-sm"
          >
            <Trash2 className="h-4 w-4 mr-2" />
            Delete
          </button>
        </div>

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
          </nav>
        </div>

        {activeTab === 'overview' && (
          <div className="grid gap-6">
            <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-6">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Project Information</h3>
              <div className="space-y-4">
                <div>
                  <p className="text-sm text-gray-600 dark:text-gray-400">Start Command</p>
                  <p className="font-mono text-gray-900 dark:text-gray-100">{project.start_command}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600 dark:text-gray-400">Path</p>
                  <p className="font-mono text-sm text-gray-900 dark:text-gray-100">{project.path}</p>
                </div>
                {project.port && (
                  <div>
                    <p className="text-sm text-gray-600 dark:text-gray-400">Port</p>
                    <p className="font-mono text-gray-900 dark:text-gray-100">{project.port}</p>
                  </div>
                )}
                {/* Domains section moved to its own tab */}
              </div>
            </div>

            {project.pm2Info && (
              <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-6">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Process Metrics</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <p className="text-sm text-gray-600 dark:text-gray-400">CPU</p>
                    <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{project.pm2Info.cpu}%</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600 dark:text-gray-400">Memory</p>
                    <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{formatBytes(project.pm2Info.memory)}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600 dark:text-gray-400">Uptime</p>
                    <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{formatUptime(Date.now() - project.pm2Info.uptime)}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600 dark:text-gray-400">Restarts</p>
                    <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{project.pm2Info.restarts}</p>
                  </div>
                </div>
              </div>
            )}
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
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Output Logs</h3>
              <div className="overflow-hidden rounded-lg border border-gray-800">
                <pre className="bg-gray-950 dark:bg-black text-green-400 p-4 overflow-x-auto max-h-96 text-xs sm:text-sm font-mono whitespace-pre-wrap break-all">
                  {logs.out || 'No output logs'}
                </pre>
              </div>
            </div>

            <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 sm:p-6">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Error Logs</h3>
              <div className="overflow-hidden rounded-lg border border-gray-800">
                <pre className="bg-gray-950 dark:bg-black text-red-400 p-4 overflow-x-auto max-h-96 text-xs sm:text-sm font-mono whitespace-pre-wrap break-all">
                  {logs.error || 'No error logs'}
                </pre>
              </div>
            </div>
          </div>
        )}
        {activeTab === 'environment' && (
          <div className="grid gap-4">
            <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Environment Variables</h3>
                  <div className="flex items-center gap-2">
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
                    className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-sm"
                  >
                    <Download className="h-4 w-4" />
                    Download .env
                  </button>
                  <label className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-sm cursor-pointer">
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
                          const res = await api.post(`/project/${projectId}/env/upload`, formData, {
                            headers: { 'Content-Type': 'multipart/form-data' },
                          });
                          alert('Env file uploaded successfully');
                          await fetchProject();
                        } catch (err) {
                          console.error('Failed to upload .env:', err);
                          alert('Failed to upload .env file');
                        }
                      }}
                    />
                    Upload .env
                  </label>
                  <button
                    onClick={() => {
                      setEnvList([]);
                      setRevealMap({});
                      setSensitiveMap({});
                      setEnvDirty(true);
                    }}
                    className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-red-600 text-white hover:bg-red-700 transition-colors text-sm"
                  >
                    Clear
                  </button>
                </div>
              </div>

              <div className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-12 items-center gap-3 px-2 py-1 text-xs text-gray-500 dark:text-gray-400 border-b border-gray-100 dark:border-gray-800">
                  <div className="sm:col-span-4">Key</div>
                  <div className="sm:col-span-6">Value</div>
                  <div className="sm:col-span-2 text-right">Actions</div>
                </div>
                {envList.map((row) => (
                  <div key={row.id} className="grid grid-cols-1 sm:grid-cols-12 items-center gap-3 hover:bg-gray-50 dark:hover:bg-gray-900 px-2 py-2 rounded">
                      <div className="sm:col-span-4 col-span-1">
                      <input
                        data-env-id={row.id}
                        placeholder="KEY"
                        autoComplete="off"
                        className="w-full h-10 rounded border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 px-3 text-sm"
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
                      <div className="sm:col-span-6 col-span-1">
                      <input
                        className="w-full h-10 rounded border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 px-3 text-sm font-mono"
                        value={row.value}
                        autoComplete="new-password"
                        type={revealMap[row.id] ? 'text' : 'password'}
                        onChange={(e) => {
                          setEnvList(prev => prev.map(r => r.id === row.id ? { ...r, value: e.target.value } : r));
                          setEnvDirty(true);
                        }}
                      />
                      {/* Helper removed: use icons to indicate sensitivity */}
                    </div>
                      <div className="sm:col-span-2 col-span-1 flex sm:justify-end justify-start items-center gap-2">
                      <button
                        onClick={() => navigator.clipboard?.writeText(row.value).catch(() => {})}
                        className="p-2 rounded bg-gray-100 dark:bg-gray-800 text-gray-600 hover:bg-gray-200 dark:hover:bg-gray-700"
                        title="Copy value"
                      >
                        <Clipboard className="h-4 w-4" />
                      </button>
                      {/* Lock removed - sensitivity detection remains but cannot be changed */}
                      <button
                        onClick={() => setRevealMap(prev => ({ ...prev, [row.id]: !prev[row.id] }))}
                        className={`p-2 rounded ${revealMap[row.id] ? 'bg-gray-900 text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300'}`}
                        title={revealMap[row.id] ? 'Hide value' : 'Show value'}
                      >
                        {revealMap[row.id] ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                      </button>
                      <button
                        onClick={() => {
                          setEnvList(prev => prev.filter(r => r.id !== row.id));
                          setRevealMap(prev => { const copy = { ...prev }; delete copy[row.id]; return copy; });
                          setSensitiveMap(prev => { const copy = { ...prev }; delete copy[row.id]; return copy; });
                          setEnvDirty(true);
                        }}
                        className="p-2 rounded bg-red-600 text-white"
                        title="Delete variable"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ))}

                <div>
                  <button
                    onClick={() => {
                      const newId = (typeof crypto !== 'undefined' && 'randomUUID' in crypto)
                        ? (crypto as any).randomUUID()
                        : `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
                      const newKey = '';
                      setEnvList(prev => [...prev, { id: newId, key: newKey, value: '' }]);
                      setRevealMap(prev => ({ ...prev, [newId]: false }));
                      setSensitiveMap(prev => ({ ...prev, [newId]: false }));
                      setLastAddedId(newId);
                      setEnvDirty(true);
                    }}
                    className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-sm"
                  >
                    Add Variable
                  </button>
                </div>

                <div className="flex items-center gap-2">
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
                    className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-900 dark:bg-white text-white dark:text-gray-900 hover:bg-gray-800 dark:hover:bg-gray-100 transition-colors text-sm disabled:opacity-50"
                  >
                    Save Changes
                  </button>
                  <button
                    onClick={() => {
                          setEnvList([]);
                        setRevealMap({});
                        setSensitiveMap({});
                        setLastAddedId(null);
                      setEnvDirty(true);
                    }}
                    className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-sm"
                  >
                    Clear
                  </button>
                  {envDirty && (
                    <div className="ml-2 text-xs text-yellow-500">Unsaved changes</div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
        {activeTab === 'domains' && (
          <div className="grid gap-6">
            <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-6">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Domains & SSL</h3>
              <div className="space-y-2">
                {domains.length === 0 ? (
                  <p className="text-sm text-gray-500 dark:text-gray-400">No domains configured</p>
                ) : (
                  <div className="space-y-1">
                    {domains.map((d: any) => (
                      <div key={d.id} className="flex items-center justify-between text-sm text-gray-700 dark:text-gray-300">
                        <div>
                          <div className="font-medium">{d.domain}</div>
                          <div className="text-xs text-gray-500 dark:text-gray-400">{d.cert_path ? `SSL configured • Expires: ${d.expires_at ? new Date(d.expires_at).toLocaleString() : 'unknown'}` : 'No certificate yet'}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <div className="mt-2 flex gap-2 items-center">
                  <input ref={newDomainRef} value={newDomain} onChange={(e) => setNewDomain(e.target.value)} placeholder="example.com" className="px-3 py-2 rounded border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 text-sm w-64" />
                  <input value={newDomainEmail} onChange={(e) => setNewDomainEmail(e.target.value)} placeholder="admin@domain.com (optional)" className="px-3 py-2 rounded border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 text-sm w-64" />
                  <button onClick={handleAddDomain} className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-900 dark:bg-white text-white dark:text-gray-900">Add</button>
                </div>
              </div>
            </div>
          </div>
        )}
        {activeTab === 'deployments' && (
          <div className="grid gap-6">
            <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Deployments</h3>
                <div className="flex items-center gap-2">
                  <button
                    onClick={fetchDeployments}
                    className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-sm"
                  >
                    <RefreshCw className="h-4 w-4" />
                    Refresh
                  </button>
                </div>
              </div>
              <div className="space-y-2">
                {deployments.length === 0 ? (
                  <div className="text-sm text-gray-500 dark:text-gray-400">
                    <div>No deployments yet</div>
                    <div className="mt-2 text-xs">Deployments are created during project creation (ZIP upload) or when using the Redeploy action. Upload a ZIP or click Redeploy to create a deployment record.</div>
                    <div className="mt-2">
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
                        className="inline-flex items-center px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-sm"
                      >
                        Redeploy
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {deployments.map((d: any) => (
                      <div key={d.id} className="flex items-center justify-between text-sm text-gray-700 dark:text-gray-300 border p-2 rounded">
                        <div>
                          <div className="font-medium">{d.version || d.deployed_at}</div>
                          <div className="text-xs text-gray-500 dark:text-gray-400">{new Date(d.deployed_at).toLocaleString()} • {d.status}</div>
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={async () => {
                              if (!confirm(`Rollback to ${d.version || d.deployed_at}?`)) return;
                              setLoadingRollback(true);
                              try {
                                await api.post(`/project/${projectId}/rollback`, { deploymentId: d.id });
                                alert('Rollback started — please wait a moment for the process to finish.');
                                await fetchDeployments();
                                await fetchProject();
                              } catch (err: any) {
                                console.error('Rollback failed:', err);
                                alert(err?.response?.data?.message || 'Rollback failed');
                              } finally {
                                setLoadingRollback(false);
                              }
                            }}
                            disabled={loadingRollback}
                            className="inline-flex items-center gap-2 px-3 py-1 rounded-lg bg-red-600 text-white hover:bg-red-700 transition-colors text-sm disabled:opacity-50"
                          >
                            Rollback
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
        </main>
      </div>
    </div>
  );
}
