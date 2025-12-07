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
  const [envFile, setEnvFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const envFileInputRef = useRef<HTMLInputElement | null>(null);
  const [isDrag, setIsDrag] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [deploymentStep, setDeploymentStep] = useState(0);

  const parseEnvFile = async (file: File): Promise<Record<string, string>> => {
    const text = await file.text();
    const envObj: Record<string, string> = {};
    
    const lines = text.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      
      // Skip empty lines and comments
      if (!trimmed || trimmed.startsWith('#')) continue;
      
      // Parse KEY=VALUE format
      const match = trimmed.match(/^([^=]+)=(.*)$/);
      if (match) {
        const key = match[1].trim();
        let value = match[2].trim();
        
        // Remove surrounding quotes if present
        if ((value.startsWith('"') && value.endsWith('"')) || 
            (value.startsWith("'") && value.endsWith("'"))) {
          value = value.slice(1, -1);
        }
        
        envObj[key] = value;
      }
    }
    
    return envObj;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    setDeploymentStep(0);

    try {
      // Prepare env vars
      let envObj: Record<string, string> = {};
      
      // If .env file uploaded, parse it first
      if (envFile) {
        envObj = await parseEnvFile(envFile);
      }
      
      // Manual env vars override file values
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

        // Step 1: Uploading
        setDeploymentStep(1);
        
        // Simulate step transitions
        const timer1 = setTimeout(() => setDeploymentStep(2), 1000);
        const timer2 = setTimeout(() => setDeploymentStep(3), 2000);

        try {
          await api.post('/project/create', formDataToSend, {
            headers: {
              'Content-Type': 'multipart/form-data',
            },
          });
          
          // Clear timers on success
          clearTimeout(timer1);
          clearTimeout(timer2);
          
          // Redirect to projects page after successful submission
          router.push('/projects');
        } catch (err: any) {
          // Clear timers on error
          clearTimeout(timer1);
          clearTimeout(timer2);
          throw err;
        }
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

        // Step 1: Cloning
        setDeploymentStep(1);
        
        // Simulate step transitions
        const timer1 = setTimeout(() => setDeploymentStep(2), 1500);
        const timer2 = setTimeout(() => setDeploymentStep(3), 3000);

        try {
          await api.post('/git/project/create/git', gitPayload);
          
          // Clear timers on success
          clearTimeout(timer1);
          clearTimeout(timer2);
          
          // Redirect to projects page after successful submission
          router.push('/projects');
        } catch (err: any) {
          // Clear timers on error
          clearTimeout(timer1);
          clearTimeout(timer2);
          throw err;
        }
      }
    } catch (error: any) {
      // Parse error message from response
      let errorMessage = 'Failed to create project';
      
      if (error.response?.data?.error) {
        errorMessage = error.response.data.error;
      } else if (error.response?.data?.message) {
        errorMessage = error.response.data.message;
      } else if (error.message) {
        errorMessage = error.message;
      }
      
      // Show specific error details if available
      if (error.response?.data?.details) {
        errorMessage += `: ${error.response.data.details}`;
      }
      
      setError(errorMessage);
      setLoading(false);
      setDeploymentStep(0);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    router.push('/login');
  };

  return (
    <div className="flex min-h-screen w-full bg-gray-50 dark:bg-gray-950">
      <DashboardSidebar open={sidebarOpen} setOpen={setSidebarOpen} />
      
      {/* Deployment Loader Overlay */}
      {loading && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center">
          <div className="bg-[#030712] border border-white/10 rounded-2xl p-8 max-w-md w-full mx-4 shadow-2xl">
            <div className="flex flex-col items-center text-center">
              {/* Animated Spinner */}
              <div className="relative w-20 h-20 mb-6">
                <div className="absolute inset-0 border-4 border-white/10 rounded-full"></div>
                <div className="absolute inset-0 border-4 border-transparent border-t-[#30e38d] rounded-full animate-spin"></div>
                <div className="absolute inset-2 border-4 border-white/5 rounded-full"></div>
                <div className="absolute inset-2 border-4 border-transparent border-t-[#30e38d]/60 rounded-full animate-spin" style={{ animationDuration: '1.5s', animationDirection: 'reverse' }}></div>
              </div>
              
              {/* Title */}
              <h3 className="text-xl font-bold text-white mb-2">Deploying Your Project</h3>
              
              {/* Description */}
              <p className="text-white/60 text-sm mb-6">
                {deployMethod === 'zip' 
                  ? 'Uploading and extracting your files...'
                  : 'Cloning repository and installing dependencies...'}
              </p>
              
              {/* Steps */}
              <div className="w-full space-y-3 mb-6">
                {/* Step 1 */}
                <div className="flex items-center gap-3 text-sm">
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 transition-all duration-300 ${
                    deploymentStep >= 1 
                      ? 'bg-[#30e38d]/20' 
                      : 'bg-white/5'
                  }`}>
                    {deploymentStep > 1 ? (
                      <span className="material-symbols-outlined text-[#30e38d] text-sm">check</span>
                    ) : deploymentStep === 1 ? (
                      <div className="w-2 h-2 rounded-full bg-[#30e38d] animate-pulse"></div>
                    ) : (
                      <div className="w-2 h-2 rounded-full bg-white/30"></div>
                    )}
                  </div>
                  <span className={`transition-all duration-300 ${
                    deploymentStep >= 1 ? 'text-white/80' : 'text-white/40'
                  }`}>
                    {deployMethod === 'zip' ? 'Uploading and extracting files' : 'Cloning repository'}
                  </span>
                </div>

                {/* Step 2 */}
                <div className="flex items-center gap-3 text-sm">
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 transition-all duration-300 ${
                    deploymentStep >= 2 
                      ? 'bg-[#30e38d]/20' 
                      : 'bg-white/5'
                  }`}>
                    {deploymentStep > 2 ? (
                      <span className="material-symbols-outlined text-[#30e38d] text-sm">check</span>
                    ) : deploymentStep === 2 ? (
                      <div className="w-2 h-2 rounded-full bg-[#30e38d] animate-pulse"></div>
                    ) : (
                      <div className="w-2 h-2 rounded-full bg-white/30"></div>
                    )}
                  </div>
                  <span className={`transition-all duration-300 ${
                    deploymentStep >= 2 ? 'text-white/80' : 'text-white/40'
                  }`}>
                    Installing dependencies
                  </span>
                </div>

                {/* Step 3 */}
                <div className="flex items-center gap-3 text-sm">
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 transition-all duration-300 ${
                    deploymentStep >= 3 
                      ? 'bg-[#30e38d]/20' 
                      : 'bg-white/5'
                  }`}>
                    {deploymentStep > 3 ? (
                      <span className="material-symbols-outlined text-[#30e38d] text-sm">check</span>
                    ) : deploymentStep === 3 ? (
                      <div className="w-2 h-2 rounded-full bg-[#30e38d] animate-pulse"></div>
                    ) : (
                      <div className="w-2 h-2 rounded-full bg-white/30"></div>
                    )}
                  </div>
                  <span className={`transition-all duration-300 ${
                    deploymentStep >= 3 ? 'text-white/80' : 'text-white/40'
                  }`}>
                    Starting application
                  </span>
                </div>
              </div>
              
              {/* Info */}
              <div className="w-full bg-white/5 border border-white/10 rounded-lg p-3">
                <p className="text-xs text-white/50">
                  You'll be redirected to the projects page automatically. This may take a few moments.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
      
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
          <div className="mb-4">
            <h1 className="text-gray-900 dark:text-gray-100 text-2xl font-black leading-tight tracking-[-0.033em]">Create New Project</h1>
            <p className="text-gray-600 dark:text-gray-400 mt-0.5 text-xs">Upload and configure your deployment</p>
          </div>

          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg p-3 shadow-sm mb-3">
            <h2 className="text-sm font-bold text-gray-900 dark:text-gray-100 mb-0.5">Project Configuration</h2>
            <p className="text-gray-600 dark:text-gray-400 text-xs mb-3">Choose deployment method and configure your project</p>

            {/* Deployment Method Tabs */}
            <div className="flex items-center gap-3 border-b border-gray-200 dark:border-gray-800 mb-4">
              <button
                type="button"
                onClick={() => setDeployMethod('zip')}
                className={`flex items-center gap-1.5 py-2 text-sm border-b-2 font-semibold transition-colors ${
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
                className={`flex items-center gap-1.5 py-2 text-sm border-b-2 font-semibold transition-colors ${
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
                className={`flex items-center gap-1.5 py-2 text-sm border-b-2 font-semibold transition-colors ${
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
                <div className="mb-3">
                  <label className="text-gray-900 dark:text-gray-100 text-xs font-medium leading-normal mb-1 block">Project ZIP File *</label>
                  <div
                    className={`flex flex-col items-center justify-center p-4 border-2 border-dashed rounded-lg bg-gray-50 dark:bg-gray-900/50 text-center cursor-pointer transition-colors ${
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
                    <span className="material-symbols-outlined text-4xl text-gray-400 dark:text-gray-600">cloud_upload</span>
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
                        {/* <p className="text-gray-600 dark:text-gray-400 text-sm">Max upload size: 200MB</p> */}
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
                <div className="mb-4 p-3 bg-gray-50 dark:bg-gray-900/50 rounded-lg border border-gray-200 dark:border-gray-800">
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
                        <label className="text-gray-900 dark:text-gray-100 text-xs font-medium leading-normal mb-1 block">Install Command</label>
                        <input
                          id="installCommand"
                          placeholder="npm install"
                          value={gitData.installCommand}
                          onChange={(e) => setGitData({ ...gitData, installCommand: e.target.value })}
                          className="form-input w-full bg-white dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-md h-9 px-2.5 text-sm text-gray-900 dark:text-gray-100 placeholder:text-gray-500 dark:placeholder:text-gray-400 focus:ring-2 focus:ring-gray-900 dark:focus:ring-white focus:border-gray-900 dark:focus:border-white transition font-mono text-sm"
                        />
                        <p className="text-xs text-gray-600 dark:text-gray-400 mt-1.5">
                          Command to install dependencies (default: npm install)
                        </p>
                      </div>

                      <div className="mt-4">
                        <label className="text-gray-900 dark:text-gray-100 text-xs font-medium leading-normal mb-1 block">Build Command (Optional)</label>
                        <input
                          id="buildCommand-oauth"
                          placeholder="npm run build"
                          value={gitData.buildCommand}
                          onChange={(e) => setGitData({ ...gitData, buildCommand: e.target.value })}
                          className="form-input w-full bg-white dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-md h-9 px-2.5 text-sm text-gray-900 dark:text-gray-100 placeholder:text-gray-500 dark:placeholder:text-gray-400 focus:ring-2 focus:ring-gray-900 dark:focus:ring-white focus:border-gray-900 dark:focus:border-white transition font-mono text-sm"
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
                <div className="mb-4 p-3 bg-gray-50 dark:bg-gray-900/50 rounded-lg border border-gray-200 dark:border-gray-800">
                  <div className="mb-4">
                    <label className="text-gray-900 dark:text-gray-100 text-xs font-medium leading-normal mb-1 block">Git Repository URL *</label>
                    <input
                      id="gitUrl"
                      placeholder="https://github.com/username/repo.git"
                      value={gitData.gitUrl}
                      onChange={(e) => setGitData({ ...gitData, gitUrl: e.target.value })}
                      required
                      className="form-input w-full bg-white dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-md h-9 px-2.5 text-sm text-gray-900 dark:text-gray-100 placeholder:text-gray-500 dark:placeholder:text-gray-400 focus:ring-2 focus:ring-gray-900 dark:focus:ring-white focus:border-gray-900 dark:focus:border-white transition font-mono text-sm"
                    />
                    <p className="text-xs text-gray-600 dark:text-gray-400 mt-1.5">
                      HTTPS or SSH format supported. Example: https://github.com/user/repo.git
                    </p>
                  </div>

                  <div className="mb-4">
                    <label className="text-gray-900 dark:text-gray-100 text-xs font-medium leading-normal mb-1 block">Branch Name *</label>
                    <input
                      id="branch"
                      placeholder="main"
                      value={gitData.branch}
                      onChange={(e) => setGitData({ ...gitData, branch: e.target.value })}
                      required
                      className="form-input w-full bg-white dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-md h-9 px-2.5 text-sm text-gray-900 dark:text-gray-100 placeholder:text-gray-500 dark:placeholder:text-gray-400 focus:ring-2 focus:ring-gray-900 dark:focus:ring-white focus:border-gray-900 dark:focus:border-white transition"
                    />
                  </div>

                  <div className="mb-4">
                    <label className="text-gray-900 dark:text-gray-100 text-xs font-medium leading-normal mb-1 block">Install Command</label>
                    <input
                      id="installCommand"
                      placeholder="npm install"
                      value={gitData.installCommand}
                      onChange={(e) => setGitData({ ...gitData, installCommand: e.target.value })}
                      className="form-input w-full bg-white dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-md h-9 px-2.5 text-sm text-gray-900 dark:text-gray-100 placeholder:text-gray-500 dark:placeholder:text-gray-400 focus:ring-2 focus:ring-gray-900 dark:focus:ring-white focus:border-gray-900 dark:focus:border-white transition font-mono text-sm"
                    />
                    <p className="text-xs text-gray-600 dark:text-gray-400 mt-1.5">
                      Command to install dependencies (default: npm install)
                    </p>
                  </div>

                  <div>
                    <label className="text-gray-900 dark:text-gray-100 text-xs font-medium leading-normal mb-1 block">Build Command (Optional)</label>
                    <input
                      id="buildCommand"
                      placeholder="npm run build"
                      value={gitData.buildCommand}
                      onChange={(e) => setGitData({ ...gitData, buildCommand: e.target.value })}
                      className="form-input w-full bg-white dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-md h-9 px-2.5 text-sm text-gray-900 dark:text-gray-100 placeholder:text-gray-500 dark:placeholder:text-gray-400 focus:ring-2 focus:ring-gray-900 dark:focus:ring-white focus:border-gray-900 dark:focus:border-white transition font-mono text-sm"
                    />
                    <p className="text-xs text-gray-600 dark:text-gray-400 mt-1.5">
                      Optional build step before starting (e.g., npm run build, tsc)
                    </p>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="text-gray-900 dark:text-gray-100 text-xs font-medium leading-normal mb-1 block" htmlFor="project-name">Project Name *</label>
                  <input
                    id="project-name"
                    placeholder="my-app"
                    value={formData.projectName}
                    onChange={(e) => setFormData({ ...formData, projectName: e.target.value })}
                    pattern="[a-zA-Z0-9-_]+"
                    title="Only letters, numbers, hyphens, and underscores allowed"
                    required
                    className="form-input w-full bg-white dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-md h-9 px-2.5 text-sm text-gray-900 dark:text-gray-100 placeholder:text-gray-500 dark:placeholder:text-gray-400 focus:ring-2 focus:ring-gray-900 dark:focus:ring-white focus:border-gray-900 dark:focus:border-white transition"
                  />
                  <p className="text-xs text-gray-600 dark:text-gray-400 mt-1.5">
                    Used for directory and PM2 process name (alphanumeric only)
                  </p>
                </div>

                <div>
                  <label className="text-gray-900 dark:text-gray-100 text-xs font-medium leading-normal mb-1 block" htmlFor="display-name">Display Name *</label>
                  <input
                    id="display-name"
                    placeholder="My Awesome App"
                    value={formData.displayName}
                    onChange={(e) => setFormData({ ...formData, displayName: e.target.value })}
                    required
                    className="form-input w-full bg-white dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-md h-9 px-2.5 text-sm text-gray-900 dark:text-gray-100 placeholder:text-gray-500 dark:placeholder:text-gray-400 focus:ring-2 focus:ring-gray-900 dark:focus:ring-white focus:border-gray-900 dark:focus:border-white transition"
                  />
                </div>

                <div>
                  <label className="text-gray-900 dark:text-gray-100 text-xs font-medium leading-normal mb-1 block" htmlFor="start-command">Start Command *</label>
                  <input
                    id="start-command"
                    placeholder="node index.js"
                    value={formData.startCommand}
                    onChange={(e) => setFormData({ ...formData, startCommand: e.target.value })}
                    required
                    className="form-input w-full bg-white dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-md h-9 px-2.5 text-sm text-gray-900 dark:text-gray-100 placeholder:text-gray-500 dark:placeholder:text-gray-400 focus:ring-2 focus:ring-gray-900 dark:focus:ring-white focus:border-gray-900 dark:focus:border-white transition font-mono text-sm"
                  />
                  <p className="text-xs text-gray-600 dark:text-gray-400 mt-1.5">
                    Direct file path: <code className="bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded">node index.js</code>, <code className="bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded">node server.js</code>, <code className="bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded">node src/app.js</code>
                  </p>
                </div>

                <div>
                  <label className="text-gray-900 dark:text-gray-100 text-xs font-medium leading-normal mb-1 block" htmlFor="port">Port (Optional)</label>
                  <input
                    id="port"
                    type="number"
                    placeholder="3000"
                    value={formData.port}
                    onChange={(e) => setFormData({ ...formData, port: e.target.value })}
                    className="form-input w-full bg-white dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-md h-9 px-2.5 text-sm text-gray-900 dark:text-gray-100 placeholder:text-gray-500 dark:placeholder:text-gray-400 focus:ring-2 focus:ring-gray-900 dark:focus:ring-white focus:border-gray-900 dark:focus:border-white transition"
                  />
                  <p className="text-xs text-gray-600 dark:text-gray-400 mt-1.5">
                    Your code must use <code className="bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded">process.env.PORT</code> to avoid port conflicts
                  </p>
                </div>
              </div>

              <div className="mb-4">
                <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100 mb-2">Environment Variables</h3>
                <p className="text-xs text-gray-600 dark:text-gray-400 mb-3">Upload a .env file or add variables manually</p>
                
                {/* .env File Upload */}
                <div className="mb-4 p-3 bg-gray-50 dark:bg-gray-900/50 rounded-lg border border-gray-200 dark:border-gray-800">
                  <label className="text-gray-900 dark:text-gray-100 text-xs font-medium leading-normal mb-2 block">
                    Upload .env File (Optional)
                  </label>
                  <div className="flex items-center gap-3">
                    <input
                      ref={envFileInputRef}
                      type="file"
                      accept=".env,.env.local,.env.production,.env.development"
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          setEnvFile(file);
                          // Auto-parse and populate manual fields
                          try {
                            const parsed = await parseEnvFile(file);
                            const newVars = Object.entries(parsed).map(([key, value]) => ({
                              id: `${Date.now()}_${Math.random().toString(36).slice(2,8)}`,
                              key,
                              value,
                              reveal: false
                            }));
                            setEnvVars(newVars);
                          } catch (err) {
                            console.error('Failed to parse env file:', err);
                          }
                        }
                      }}
                      className="hidden"
                    />
                    {!envFile ? (
                      <button
                        type="button"
                        onClick={() => envFileInputRef.current?.click()}
                        className="flex items-center gap-2 px-3 py-2 bg-white dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-md text-sm text-gray-900 dark:text-gray-100 hover:bg-gray-50 dark:hover:bg-gray-900 transition-colors"
                      >
                        <span className="material-symbols-outlined text-lg">upload_file</span>
                        Choose .env file
                      </button>
                    ) : (
                      <div className="flex items-center gap-2 flex-1">
                        <div className="flex items-center gap-2 px-3 py-2 bg-white dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-md flex-1">
                          <span className="material-symbols-outlined text-lg text-green-600 dark:text-green-400">check_circle</span>
                          <span className="text-sm text-gray-900 dark:text-gray-100">{envFile.name}</span>
                          <span className="text-xs text-gray-500 dark:text-gray-400">({(envFile.size / 1024).toFixed(1)} KB)</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setEnvFile(null);
                            if (envFileInputRef.current) envFileInputRef.current.value = '';
                          }}
                          className="p-2 text-gray-600 dark:text-gray-400 hover:text-red-500 transition-colors rounded-md"
                          title="Remove file"
                        >
                          <span className="material-symbols-outlined">close</span>
                        </button>
                      </div>
                    )}
                  </div>
                  <p className="text-xs text-gray-600 dark:text-gray-400 mt-2">
                    Variables from uploaded file will be automatically parsed and shown below
                  </p>
                </div>

                {/* Manual Env Vars */}
                <div className="grid grid-cols-[1fr_1fr_auto_auto] gap-x-4 gap-y-2 items-center text-sm text-gray-600 dark:text-gray-400 mb-2 px-2">
                  <span>Key</span>
                  <span>Value</span>
                  <span className="w-8"></span>
                  <span className="w-8"></span>
                </div>
                <div className="space-y-2">
                  {envVars.map((v) => (
                    <div key={v.id} className="grid grid-cols-[1fr_1fr_auto_auto] gap-x-4 items-center">
                      <input
                        placeholder="DATABASE_URL"
                        value={v.key}
                        onChange={(e) => {
                          setEnvVars(prev => prev.map(p => p.id === v.id ? { ...p, key: e.target.value } : p));
                        }}
                        className="form-input w-full bg-white dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-md h-8 px-2.5 text-xs text-gray-900 dark:text-gray-100 placeholder:text-gray-500 dark:placeholder:text-gray-400 focus:ring-1 focus:ring-gray-900 dark:focus:ring-white focus:border-gray-900 dark:focus:border-white transition font-mono"
                        autoComplete="off"
                      />
                      <div className="relative">
                        <input
                          placeholder="Your secret value"
                          value={v.value}
                          onChange={(e) => {
                            setEnvVars(prev => prev.map(p => p.id === v.id ? { ...p, value: e.target.value } : p));
                          }}
                          type={v.reveal ? 'text' : 'password'}
                          className="form-input w-full bg-white dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-md h-8 px-2.5 pr-8 text-xs text-gray-900 dark:text-gray-100 placeholder:text-gray-500 dark:placeholder:text-gray-400 focus:ring-1 focus:ring-gray-900 dark:focus:ring-white focus:border-gray-900 dark:focus:border-white transition font-mono"
                          autoComplete="new-password"
                        />
                      </div>
                      <button
                        type="button"
                        className="p-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 transition-colors rounded-md"
                        onClick={() => setEnvVars(prev => prev.map(p => p.id === v.id ? { ...p, reveal: !p.reveal } : p))}
                        title={v.reveal ? "Hide value" : "Show value"}
                      >
                        <span className="material-symbols-outlined text-xl">
                          {v.reveal ? 'visibility_off' : 'visibility'}
                        </span>
                      </button>
                      <button
                        type="button"
                        className="p-2 text-gray-600 dark:text-gray-400 hover:text-red-500 transition-colors rounded-md"
                        onClick={() => setEnvVars(prev => prev.filter(p => p.id !== v.id))}
                        title="Remove variable"
                      >
                        <span className="material-symbols-outlined text-xl">delete</span>
                      </button>
                    </div>
                  ))}
                  {envVars.length === 0 && !envFile && (
                    <p className="text-xs text-gray-600 dark:text-gray-400 px-2 py-4 text-center">
                      Upload a .env file or add variables manually
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  className="flex items-center gap-1 text-sm font-medium text-gray-900 dark:text-gray-100 hover:text-gray-700 dark:hover:text-gray-300 mt-4 transition-colors"
                  onClick={() => setEnvVars(prev => [...prev, { id: `${Date.now()}_${Math.random().toString(36).slice(2,8)}`, key: '', value: '', reveal: false }])}
                >
                  <span className="material-symbols-outlined text-lg">add_circle</span>
                  Add Variable Manually
                </button>
              </div>

              {error && (
                <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg mb-4">
                  <div className="flex items-start gap-3">
                    <span className="material-symbols-outlined text-red-600 dark:text-red-400 text-xl flex-shrink-0 mt-0.5">error</span>
                    <div className="flex-1">
                      <h4 className="text-sm font-bold text-red-800 dark:text-red-300 mb-1">Deployment Failed</h4>
                      <p className="text-xs text-red-700 dark:text-red-400 whitespace-pre-wrap break-words">{error}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setError('')}
                      className="text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-300 transition-colors flex-shrink-0"
                      title="Dismiss error"
                    >
                      <span className="material-symbols-outlined text-lg">close</span>
                    </button>
                  </div>
                </div>
              )}

              <div className="flex justify-end items-center gap-3 border-t border-gray-200 dark:border-gray-800 pt-4">
                <Link 
                  href="/projects"
                  className="text-sm font-medium text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 transition-colors px-4 py-2 rounded-md"
                >
                  Cancel
                </Link>
                <button
                  type="submit"
                  disabled={loading}
                  className="bg-gray-900 dark:bg-white text-white dark:text-gray-900 text-sm font-bold py-2 px-4 rounded-md hover:bg-gray-800 dark:hover:bg-gray-100 transition-colors flex items-center gap-1.5 shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <span className="material-symbols-outlined">rocket_launch</span>
                  {loading ? 'Deploying...' : 'Deploy Project'}
                </button>
              </div>
            </form>
          </div>

          {/* <div className="bg-gray-100 dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4 shadow-sm">
            <div className="flex items-center gap-2 mb-2">
              <span className="material-symbols-outlined text-gray-600 dark:text-gray-400 text-xl">info</span>
              <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100">Important Notes</h3>
            </div>
            <ul className="space-y-2 text-gray-600 dark:text-gray-400 list-disc list-inside text-sm">
              <li>Upload a ZIP file containing your Node.js project.</li>
              <li>If 'package.json' exists, dependencies will be auto-installed.</li>
              <li>Make sure your start command is correct.</li>
              <li>Max upload size: 200MB.</li>
            </ul>
          </div> */}
        </div>
      </main>
    </div>
  );
}


