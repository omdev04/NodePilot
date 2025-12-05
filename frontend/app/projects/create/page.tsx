'use client';

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { DashboardSidebar } from '@/components/ui/dashboard-sidebar';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import api from '@/lib/api';
import { RepositorySelector } from '@/components/ui/repository-selector';

type DeployMethod = 'zip' | 'git' | 'oauth-repo';

export default function CreateProjectPage() {
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [deployMethod, setDeployMethod] = useState<DeployMethod>('zip');
  const [formData, setFormData] = useState({
    projectName: '',
    displayName: '',
    startCommand: 'node index.js',
    port: '',
  });
  const [gitData, setGitData] = useState({
    gitUrl: '',
    branch: 'main',
    installCommand: 'npm install',
    buildCommand: '',
  });
  const [selectedRepo, setSelectedRepo] = useState<any>(null);
  const [oauthConnected, setOAuthConnected] = useState(false);
  const [envVars, setEnvVars] = useState<{ id: string; key: string; value: string; reveal?: boolean }[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [isDrag, setIsDrag] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      // Prepare env vars
      const envObj: Record<string, string> = {};
      for (const v of envVars) {
        if (v.key && v.key.trim()) {
          envObj[v.key.trim()] = v.value ?? '';
        }
      }

      if (deployMethod === 'zip') {
        if (!file) {
          setError('Please select a ZIP file');
          setLoading(false);
          return;
        }

        const formDataToSend = new FormData();
        formDataToSend.append('file', file);
        formDataToSend.append('projectName', formData.projectName);
        formDataToSend.append('displayName', formData.displayName);
        formDataToSend.append('startCommand', formData.startCommand);
        if (formData.port) {
          formDataToSend.append('port', formData.port);
        }
        if (Object.keys(envObj).length > 0) {
          formDataToSend.append('envVars', JSON.stringify(envObj));
        }

        await api.post('/project/create', formDataToSend, {
          headers: {
            'Content-Type': 'multipart/form-data',
          },
        });
      } else if (deployMethod === 'oauth-repo' || deployMethod === 'git') {
        // Git deployment (both OAuth repo and manual URL)
        if (!gitData.gitUrl) {
          setError(deployMethod === 'oauth-repo' ? 'Please select a repository' : 'Please enter a Git repository URL');
          setLoading(false);
          return;
        }

        const gitPayload = {
          projectName: formData.projectName,
          displayName: formData.displayName,
          gitUrl: gitData.gitUrl,
          branch: gitData.branch || 'main',
          startCommand: formData.startCommand,
          installCommand: gitData.installCommand || 'npm install',
          buildCommand: gitData.buildCommand || undefined,
          port: formData.port ? parseInt(formData.port) : undefined,
          envVars: Object.keys(envObj).length > 0 ? envObj : undefined,
        };

        await api.post('/git/project/create/git', gitPayload);
      }

      router.push('/projects');
    } catch (error: any) {
      setError(error.response?.data?.error || 'Failed to create project');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    router.push('/login');
  };

  return (
    <div className="flex min-h-screen w-full bg-gray-50 dark:bg-gray-950">
      <DashboardSidebar open={sidebarOpen} setOpen={setSidebarOpen} />
      
      <main className="flex-1 p-8 overflow-y-auto">
        <div className="max-w-4xl mx-auto">
          {/* Breadcrumbs */}
          <div className="flex flex-wrap gap-2 mb-2">
            <Link href="/dashboard" className="text-gray-500 dark:text-gray-400 text-base font-medium leading-normal hover:text-gray-900 dark:hover:text-gray-100 transition-colors">
              NodePilot
            </Link>
            <span className="text-gray-500 dark:text-gray-400 text-base font-medium leading-normal">/</span>
            <Link href="/projects" className="text-gray-500 dark:text-gray-400 text-base font-medium leading-normal hover:text-gray-900 dark:hover:text-gray-100 transition-colors">
              Projects
            </Link>
            <span className="text-gray-500 dark:text-gray-400 text-base font-medium leading-normal">/</span>
            <span className="text-gray-900 dark:text-gray-100 text-base font-medium leading-normal">Create</span>
          </div>

          {/* Page Heading */}
          <div className="mb-6">
            <h1 className="text-gray-900 dark:text-gray-100 text-3xl font-black leading-tight tracking-[-0.033em]">Create New Project</h1>
            <p className="text-gray-600 dark:text-gray-400 mt-0.5 text-sm">Upload and configure your deployment</p>
          </div>

          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg p-4 shadow-sm mb-4">
            <h2 className="text-base font-bold text-gray-900 dark:text-gray-100 mb-0.5">Project Configuration</h2>
            <p className="text-gray-600 dark:text-gray-400 text-sm mb-4">Choose deployment method and configure your project</p>

            {/* Deployment Method Tabs */}
            <div className="flex items-center gap-4 border-b border-gray-200 dark:border-gray-800 mb-6">
              <button
                type="button"
                onClick={() => setDeployMethod('zip')}
                className={`flex items-center gap-2 py-3 border-b-2 font-semibold transition-colors ${
                  deployMethod === 'zip'
                    ? 'border-gray-900 dark:border-white text-gray-900 dark:text-white'
                    : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                }`}
              >
                <span className="material-symbols-outlined">upload_file</span>
                <span>ZIP Upload</span>
              </button>
              <button
                type="button"
                onClick={() => setDeployMethod('oauth-repo')}
                className={`flex items-center gap-2 py-3 border-b-2 font-semibold transition-colors ${
                  deployMethod === 'oauth-repo'
                    ? 'border-gray-900 dark:border-white text-gray-900 dark:text-white'
                    : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                }`}
              >
                <span className="material-symbols-outlined">link</span>
                <span>Connected Repo</span>
              </button>
              <button
                type="button"
                onClick={() => setDeployMethod('git')}
                className={`flex items-center gap-2 py-3 border-b-2 font-semibold transition-colors ${
                  deployMethod === 'git'
                    ? 'border-gray-900 dark:border-white text-gray-900 dark:text-white'
                    : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                }`}
              >
                <span className="material-symbols-outlined">code</span>
                <span>Manual Git URL</span>
              </button>
            </div>

            <form onSubmit={handleSubmit}>
              {/* ZIP Upload Section */}
              {deployMethod === 'zip' && (
                <div className="mb-4">
                  <label className="text-gray-900 dark:text-gray-100 text-sm font-medium leading-normal mb-1.5 block">Project ZIP File *</label>
                  <div
                    className={`flex flex-col items-center justify-center p-6 border-2 border-dashed rounded-lg bg-gray-50 dark:bg-gray-900/50 text-center cursor-pointer transition-colors ${
                      isDrag ? 'border-gray-400 dark:border-gray-600 bg-gray-100 dark:bg-gray-900' : 'border-gray-300 dark:border-gray-700 hover:border-gray-400 dark:hover:border-gray-600'
                    }`}
                    onClick={() => fileInputRef.current?.click()}
                    onDragOver={(e) => { e.preventDefault(); setIsDrag(true); }}
                    onDragLeave={() => setIsDrag(false)}
                    onDrop={(e) => {
                      e.preventDefault();
                      setIsDrag(false);
                      const f = e.dataTransfer?.files?.[0];
                      if (f) setFile(f as File);
                    }}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') fileInputRef.current?.click(); }}
                  >
                    <span className="material-symbols-outlined text-5xl text-gray-400 dark:text-gray-600">cloud_upload</span>
                    <input
                      id="file"
                      ref={fileInputRef}
                      type="file"
                      accept=".zip"
                      onChange={(e) => setFile(e.target.files?.[0] || null)}
                      required
                      className="hidden"
                      aria-label="Select project ZIP file"
                    />
                    {!file ? (
                      <>
                        <p className="text-gray-900 dark:text-gray-100 mt-2">Click to select a ZIP file or drag it here</p>
                        <p className="text-gray-600 dark:text-gray-400 text-sm">Max upload size: 200MB</p>
                      </>
                    ) : (
                      <div className="mt-2">
                        <p className="text-gray-900 dark:text-gray-100 font-medium">{file.name}</p>
                        <p className="text-gray-600 dark:text-gray-400 text-sm">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); setFile(null); if (fileInputRef.current) fileInputRef.current.value = ''; }}
                          className="mt-2 px-3 py-1 rounded bg-red-600 text-white text-sm hover:bg-red-700"
                          aria-label="Remove selected file"
                        >
                          Remove
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* OAuth Repo Selector Section */}
              {deployMethod === 'oauth-repo' && (
                <div className="mb-6 p-4 bg-gray-50 dark:bg-gray-900/50 rounded-lg border border-gray-200 dark:border-gray-800">
                  <RepositorySelector 
                    onSelect={(repo) => {
                      setSelectedRepo(repo);
                      setGitData({ ...gitData, gitUrl: repo.cloneUrl, branch: repo.defaultBranch });
                      // Auto-populate project name if empty
                      if (!formData.projectName) {
                        setFormData({ ...formData, projectName: repo.name.toLowerCase().replace(/[^a-z0-9-_]/g, '-') });
                      }
                    }}
                    selectedRepo={selectedRepo}
                  />

                  {selectedRepo && (
                    <>
                      <div className="mt-4">
                        <label className="text-gray-900 dark:text-gray-100 text-sm font-medium leading-normal mb-2 block">Install Command</label>
                        <input
                          id="installCommand"
                          placeholder="npm install"
                          value={gitData.installCommand}
                          onChange={(e) => setGitData({ ...gitData, installCommand: e.target.value })}
                          className="form-input w-full bg-white dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-md h-11 px-3 text-gray-900 dark:text-gray-100 placeholder:text-gray-500 dark:placeholder:text-gray-400 focus:ring-2 focus:ring-gray-900 dark:focus:ring-white focus:border-gray-900 dark:focus:border-white transition font-mono text-sm"
                        />
                        <p className="text-xs text-gray-600 dark:text-gray-400 mt-1.5">
                          Command to install dependencies (default: npm install)
                        </p>
                      </div>

                      <div className="mt-4">
                        <label className="text-gray-900 dark:text-gray-100 text-sm font-medium leading-normal mb-2 block">Build Command (Optional)</label>
                        <input
                          id="buildCommand-oauth"
                          placeholder="npm run build"
                          value={gitData.buildCommand}
                          onChange={(e) => setGitData({ ...gitData, buildCommand: e.target.value })}
                          className="form-input w-full bg-white dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-md h-11 px-3 text-gray-900 dark:text-gray-100 placeholder:text-gray-500 dark:placeholder:text-gray-400 focus:ring-2 focus:ring-gray-900 dark:focus:ring-white focus:border-gray-900 dark:focus:border-white transition font-mono text-sm"
                        />
                        <p className="text-xs text-gray-600 dark:text-gray-400 mt-1.5">
                          Optional build step before starting (e.g., npm run build, tsc)
                        </p>
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* Git Deploy Section (Manual URL) */}
              {deployMethod === 'git' && (
                <div className="mb-6 p-4 bg-gray-50 dark:bg-gray-900/50 rounded-lg border border-gray-200 dark:border-gray-800">
                  <div className="mb-4">
                    <label className="text-gray-900 dark:text-gray-100 text-sm font-medium leading-normal mb-2 block">Git Repository URL *</label>
                    <input
                      id="gitUrl"
                      placeholder="https://github.com/username/repo.git"
                      value={gitData.gitUrl}
                      onChange={(e) => setGitData({ ...gitData, gitUrl: e.target.value })}
                      required
                      className="form-input w-full bg-white dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-md h-11 px-3 text-gray-900 dark:text-gray-100 placeholder:text-gray-500 dark:placeholder:text-gray-400 focus:ring-2 focus:ring-gray-900 dark:focus:ring-white focus:border-gray-900 dark:focus:border-white transition font-mono text-sm"
                    />
                    <p className="text-xs text-gray-600 dark:text-gray-400 mt-1.5">
                      HTTPS or SSH format supported. Example: https://github.com/user/repo.git
                    </p>
                  </div>

                  <div className="mb-4">
                    <label className="text-gray-900 dark:text-gray-100 text-sm font-medium leading-normal mb-2 block">Branch Name *</label>
                    <input
                      id="branch"
                      placeholder="main"
                      value={gitData.branch}
                      onChange={(e) => setGitData({ ...gitData, branch: e.target.value })}
                      required
                      className="form-input w-full bg-white dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-md h-11 px-3 text-gray-900 dark:text-gray-100 placeholder:text-gray-500 dark:placeholder:text-gray-400 focus:ring-2 focus:ring-gray-900 dark:focus:ring-white focus:border-gray-900 dark:focus:border-white transition"
                    />
                  </div>

                  <div className="mb-4">
                    <label className="text-gray-900 dark:text-gray-100 text-sm font-medium leading-normal mb-2 block">Install Command</label>
                    <input
                      id="installCommand"
                      placeholder="npm install"
                      value={gitData.installCommand}
                      onChange={(e) => setGitData({ ...gitData, installCommand: e.target.value })}
                      className="form-input w-full bg-white dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-md h-11 px-3 text-gray-900 dark:text-gray-100 placeholder:text-gray-500 dark:placeholder:text-gray-400 focus:ring-2 focus:ring-gray-900 dark:focus:ring-white focus:border-gray-900 dark:focus:border-white transition font-mono text-sm"
                    />
                    <p className="text-xs text-gray-600 dark:text-gray-400 mt-1.5">
                      Command to install dependencies (default: npm install)
                    </p>
                  </div>

                  <div>
                    <label className="text-gray-900 dark:text-gray-100 text-sm font-medium leading-normal mb-2 block">Build Command (Optional)</label>
                    <input
                      id="buildCommand"
                      placeholder="npm run build"
                      value={gitData.buildCommand}
                      onChange={(e) => setGitData({ ...gitData, buildCommand: e.target.value })}
                      className="form-input w-full bg-white dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-md h-11 px-3 text-gray-900 dark:text-gray-100 placeholder:text-gray-500 dark:placeholder:text-gray-400 focus:ring-2 focus:ring-gray-900 dark:focus:ring-white focus:border-gray-900 dark:focus:border-white transition font-mono text-sm"
                    />
                    <p className="text-xs text-gray-600 dark:text-gray-400 mt-1.5">
                      Optional build step before starting (e.g., npm run build, tsc)
                    </p>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                <div>
                  <label className="text-gray-900 dark:text-gray-100 text-sm font-medium leading-normal mb-2 block" htmlFor="project-name">Project Name *</label>
                  <input
                    id="project-name"
                    placeholder="my-app"
                    value={formData.projectName}
                    onChange={(e) => setFormData({ ...formData, projectName: e.target.value })}
                    pattern="[a-zA-Z0-9-_]+"
                    title="Only letters, numbers, hyphens, and underscores allowed"
                    required
                    className="form-input w-full bg-white dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-md h-11 px-3 text-gray-900 dark:text-gray-100 placeholder:text-gray-500 dark:placeholder:text-gray-400 focus:ring-2 focus:ring-gray-900 dark:focus:ring-white focus:border-gray-900 dark:focus:border-white transition"
                  />
                  <p className="text-xs text-gray-600 dark:text-gray-400 mt-1.5">
                    Used for directory and PM2 process name (alphanumeric only)
                  </p>
                </div>

                <div>
                  <label className="text-gray-900 dark:text-gray-100 text-sm font-medium leading-normal mb-2 block" htmlFor="display-name">Display Name *</label>
                  <input
                    id="display-name"
                    placeholder="My Awesome App"
                    value={formData.displayName}
                    onChange={(e) => setFormData({ ...formData, displayName: e.target.value })}
                    required
                    className="form-input w-full bg-white dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-md h-11 px-3 text-gray-900 dark:text-gray-100 placeholder:text-gray-500 dark:placeholder:text-gray-400 focus:ring-2 focus:ring-gray-900 dark:focus:ring-white focus:border-gray-900 dark:focus:border-white transition"
                  />
                </div>

                <div>
                  <label className="text-gray-900 dark:text-gray-100 text-sm font-medium leading-normal mb-2 block" htmlFor="start-command">Start Command *</label>
                  <input
                    id="start-command"
                    placeholder="node index.js"
                    value={formData.startCommand}
                    onChange={(e) => setFormData({ ...formData, startCommand: e.target.value })}
                    required
                    className="form-input w-full bg-white dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-md h-11 px-3 text-gray-900 dark:text-gray-100 placeholder:text-gray-500 dark:placeholder:text-gray-400 focus:ring-2 focus:ring-gray-900 dark:focus:ring-white focus:border-gray-900 dark:focus:border-white transition font-mono text-sm"
                  />
                  <p className="text-xs text-gray-600 dark:text-gray-400 mt-1.5">
                    Direct file path: <code className="bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded">node index.js</code>, <code className="bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded">node server.js</code>, <code className="bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded">node src/app.js</code>
                  </p>
                </div>

                <div>
                  <label className="text-gray-900 dark:text-gray-100 text-sm font-medium leading-normal mb-2 block" htmlFor="port">Port (Optional)</label>
                  <input
                    id="port"
                    type="number"
                    placeholder="3000"
                    value={formData.port}
                    onChange={(e) => setFormData({ ...formData, port: e.target.value })}
                    className="form-input w-full bg-white dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-md h-11 px-3 text-gray-900 dark:text-gray-100 placeholder:text-gray-500 dark:placeholder:text-gray-400 focus:ring-2 focus:ring-gray-900 dark:focus:ring-white focus:border-gray-900 dark:focus:border-white transition"
                  />
                  <p className="text-xs text-gray-600 dark:text-gray-400 mt-1.5">
                    Your code must use <code className="bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded">process.env.PORT</code> to avoid port conflicts
                  </p>
                </div>
              </div>

              <div className="mb-6">
                <h3 className="text-base font-bold text-gray-900 dark:text-gray-100 mb-2">Environment Variables (.env)</h3>
                <div className="grid grid-cols-[1fr_1fr_auto] gap-x-4 gap-y-2 items-center text-sm text-gray-600 dark:text-gray-400 mb-2 px-2">
                  <span>Key</span>
                  <span>Value</span>
                  <span className="w-8"></span>
                </div>
                <div className="space-y-2">
                  {envVars.map((v) => (
                    <div key={v.id} className="grid grid-cols-[1fr_1fr_auto] gap-x-4 items-center">
                      <input
                        placeholder="DATABASE_URL"
                        value={v.key}
                        onChange={(e) => {
                          setEnvVars(prev => prev.map(p => p.id === v.id ? { ...p, key: e.target.value } : p));
                        }}
                        className="form-input w-full bg-white dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-md h-10 px-3 text-gray-900 dark:text-gray-100 placeholder:text-gray-500 dark:placeholder:text-gray-400 focus:ring-1 focus:ring-gray-900 dark:focus:ring-white focus:border-gray-900 dark:focus:border-white transition"
                        autoComplete="off"
                      />
                      <input
                        placeholder="Your secret value"
                        value={v.value}
                        onChange={(e) => {
                          setEnvVars(prev => prev.map(p => p.id === v.id ? { ...p, value: e.target.value } : p));
                        }}
                        type={v.reveal ? 'text' : 'password'}
                        className="form-input w-full bg-white dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-md h-10 px-3 text-gray-900 dark:text-gray-100 placeholder:text-gray-500 dark:placeholder:text-gray-400 focus:ring-1 focus:ring-gray-900 dark:focus:ring-white focus:border-gray-900 dark:focus:border-white transition"
                        autoComplete="new-password"
                      />
                      <button
                        type="button"
                        className="p-2 text-gray-600 dark:text-gray-400 hover:text-red-500 transition-colors rounded-md"
                        onClick={() => setEnvVars(prev => prev.filter(p => p.id !== v.id))}
                      >
                        <span className="material-symbols-outlined text-xl">delete</span>
                      </button>
                    </div>
                  ))}
                  {envVars.length === 0 && (
                    <p className="text-xs text-gray-600 dark:text-gray-400 px-2 py-4 text-center">Only variables you add will be saved to this project, otherwise no env vars will be stored.</p>
                  )}
                </div>
                <button
                  type="button"
                  className="flex items-center gap-1 text-sm font-medium text-gray-900 dark:text-gray-100 hover:text-gray-700 dark:hover:text-gray-300 mt-4 transition-colors"
                  onClick={() => setEnvVars(prev => [...prev, { id: `${Date.now()}_${Math.random().toString(36).slice(2,8)}`, key: '', value: '', reveal: false }])}
                >
                  <span className="material-symbols-outlined text-lg">add_circle</span>
                  Add Variable
                </button>
              </div>

              {error && (
                <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 rounded-lg text-sm mb-6">
                  {error}
                </div>
              )}

              <div className="flex justify-end items-center gap-4 border-t border-gray-200 dark:border-gray-800 pt-6">
                <Link 
                  href="/projects"
                  className="text-sm font-medium text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 transition-colors px-4 py-2 rounded-md"
                >
                  Cancel
                </Link>
                <button
                  type="submit"
                  disabled={loading}
                  className="bg-gray-900 dark:bg-white text-white dark:text-gray-900 font-bold py-2 px-5 rounded-md hover:bg-gray-800 dark:hover:bg-gray-100 transition-colors flex items-center gap-2 shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <span className="material-symbols-outlined">rocket_launch</span>
                  {loading ? 'Deploying...' : 'Deploy Project'}
                </button>
              </div>
            </form>
          </div>

          <div className="bg-gray-100 dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-6 shadow-sm">
            <div className="flex items-center gap-3 mb-3">
              <span className="material-symbols-outlined text-gray-600 dark:text-gray-400 text-2xl">info</span>
              <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">Important Notes</h3>
            </div>
            <ul className="space-y-2 text-gray-600 dark:text-gray-400 list-disc list-inside text-sm">
              <li>Upload a ZIP file containing your Node.js project.</li>
              <li>If 'package.json' exists, dependencies will be auto-installed.</li>
              <li>Make sure your start command is correct.</li>
              <li>Max upload size: 200MB.</li>
            </ul>
          </div>
        </div>
      </main>
    </div>
  );
}
