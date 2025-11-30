'use client';

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { DashboardSidebar } from '@/components/ui/dashboard-sidebar';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import api from '@/lib/api';
import { Upload, Bell, LogOut, FileArchive, Eye, EyeOff, Trash2 } from 'lucide-react';

export default function CreateProjectPage() {
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [formData, setFormData] = useState({
    projectName: '',
    displayName: '',
    startCommand: 'npm start',
    port: '',
  });
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

    if (!file) {
      setError('Please select a ZIP file');
      setLoading(false);
      return;
    }

    try {
      const formDataToSend = new FormData();
      formDataToSend.append('file', file);
      formDataToSend.append('projectName', formData.projectName);
      formDataToSend.append('displayName', formData.displayName);
      formDataToSend.append('startCommand', formData.startCommand);
      if (formData.port) {
        formDataToSend.append('port', formData.port);
      }
      // Attach envVars only if user added any key values
      const envObj: Record<string, string> = {};
      for (const v of envVars) {
        if (v.key && v.key.trim()) {
          envObj[v.key.trim()] = v.value ?? '';
        }
      }
      if (Object.keys(envObj).length > 0) {
        formDataToSend.append('envVars', JSON.stringify(envObj));
      }

      await api.post('/project/create', formDataToSend, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

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
      
      <div className="flex-1 overflow-auto">
        {/* Header */}
        <div className="sticky top-0 z-10 bg-white dark:bg-gray-950 border-b border-gray-200 dark:border-gray-800 px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">Create New Project</h1>
              <p className="text-gray-600 dark:text-gray-400 mt-1">Upload and configure your deployment</p>
            </div>
            <div className="flex items-center gap-4">
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

        <main className="max-w-3xl mx-auto p-6">
          <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-6 shadow-sm">
            <div className="mb-6">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Project Configuration</h2>
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                Upload your project ZIP and configure deployment settings
              </p>
            </div>
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="file" className="text-gray-900 dark:text-gray-100">Project ZIP File *</Label>
                <div
                  className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors ${isDrag ? 'border-gray-500 bg-gray-50 dark:bg-gray-900' : 'border-gray-300 dark:border-gray-700'} hover:border-gray-400 dark:hover:border-gray-600`}
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
                  <FileArchive className="h-10 w-10 mx-auto text-gray-400 dark:text-gray-600 mb-2" />
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
                    <div className="space-y-2">
                      <p className="text-sm text-gray-600 dark:text-gray-400">Click to select a ZIP file or drag it here</p>
                      <div className="text-xs text-gray-500 dark:text-gray-400">Max upload size: 200MB</div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-center gap-4">
                      <div className="text-sm text-gray-900 dark:text-gray-100 font-medium">{file.name}</div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">{(file.size / 1024 / 1024).toFixed(2)} MB</div>
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); setFile(null); if (fileInputRef.current) fileInputRef.current.value = ''; }}
                        className="inline-flex items-center gap-2 px-2 py-1 rounded bg-red-600 text-white text-xs hover:bg-red-700"
                        aria-label="Remove selected file"
                      >
                        Remove
                      </button>
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="projectName" className="text-gray-900 dark:text-gray-100">Project Name *</Label>
                <Input
                  id="projectName"
                  placeholder="my-app"
                  value={formData.projectName}
                  onChange={(e) => setFormData({ ...formData, projectName: e.target.value })}
                  pattern="[a-zA-Z0-9-_]+"
                  title="Only letters, numbers, hyphens, and underscores allowed"
                  required
                  className="bg-white dark:bg-gray-950 border-gray-200 dark:border-gray-800"
                />
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Used for directory and PM2 process name (alphanumeric only)
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="displayName" className="text-gray-900 dark:text-gray-100">Display Name *</Label>
                <Input
                  id="displayName"
                  placeholder="My Awesome App"
                  value={formData.displayName}
                  onChange={(e) => setFormData({ ...formData, displayName: e.target.value })}
                  required
                  className="bg-white dark:bg-gray-950 border-gray-200 dark:border-gray-800"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="startCommand" className="text-gray-900 dark:text-gray-100">Start Command *</Label>
                <Input
                  id="startCommand"
                  placeholder="npm start"
                  value={formData.startCommand}
                  onChange={(e) => setFormData({ ...formData, startCommand: e.target.value })}
                  required
                  className="bg-white dark:bg-gray-950 border-gray-200 dark:border-gray-800 font-mono"
                />
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Examples: npm start, node index.js, npm run prod
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="port" className="text-gray-900 dark:text-gray-100">Port (Optional)</Label>
                <Input
                  id="port"
                  type="number"
                  placeholder="3000"
                  value={formData.port}
                  onChange={(e) => setFormData({ ...formData, port: e.target.value })}
                  className="bg-white dark:bg-gray-950 border-gray-200 dark:border-gray-800"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-gray-900 dark:text-gray-100">Environment Variables (.Env)</Label>
                <div className="space-y-2">
                  <div className="grid grid-cols-1 sm:grid-cols-12 items-center gap-3 px-2 py-1 text-xs text-gray-500 dark:text-gray-400 border-b border-gray-100 dark:border-gray-800">
                    <div className="sm:col-span-4">Key</div>
                    <div className="sm:col-span-6">Value</div>
                    <div className="sm:col-span-2 text-right">Actions</div>
                  </div>
                  {envVars.map((v) => (
                    <div key={v.id} className="grid grid-cols-1 sm:grid-cols-12 items-center gap-3 hover:bg-gray-50 dark:hover:bg-gray-900 px-2 py-2 rounded">
                        <div className="sm:col-span-4 col-span-1">
                        <Input
                          placeholder="KEY"
                          value={v.key}
                          onChange={(e) => {
                            setEnvVars(prev => prev.map(p => p.id === v.id ? { ...p, key: e.target.value } : p));
                          }}
                            className="w-full min-w-0 truncate bg-white dark:bg-gray-950 border-gray-200 dark:border-gray-800"
                          autoComplete="off"
                        />
                      </div>
                        <div className="sm:col-span-6 col-span-1">
                        <Input
                          placeholder="value"
                          value={v.value}
                          onChange={(e) => {
                            setEnvVars(prev => prev.map(p => p.id === v.id ? { ...p, value: e.target.value } : p));
                          }}
                          type={v.reveal ? 'text' : 'password'}
                            className="w-full min-w-0 truncate bg-white dark:bg-gray-950 border-gray-200 dark:border-gray-800"
                          autoComplete="new-password"
                        />
                        {/* Helper removed: use icons to indicate sensitivity */}
                      </div>
                      <div className="col-span-2 flex justify-end items-center gap-2">
                        {/* Lock removed - only Eye toggle is available */}
                        <button
                          type="button"
                          className={`p-2 rounded ${v.reveal ? 'bg-gray-900 text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-600'}`}
                          aria-label={v.reveal ? 'Hide value' : 'Show value'}
                          onClick={() => setEnvVars(prev => prev.map(p => p.id === v.id ? { ...p, reveal: !p.reveal } : p))}
                        >
                          {v.reveal ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                        </button>
                        <button
                          type="button"
                          className="p-2 rounded bg-red-600 text-white"
                          title="Delete variable"
                          aria-label="Delete variable"
                          onClick={() => setEnvVars(prev => prev.filter(p => p.id !== v.id))}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                  <div className="flex items-start">
                    <button
                      type="button"
                      className="px-3 py-1 rounded bg-gray-100 dark:bg-gray-800 text-sm"
                      onClick={() => setEnvVars(prev => [...prev, { id: `${Date.now()}_${Math.random().toString(36).slice(2,8)}`, key: '', value: '', reveal: false }])}
                    >
                      Add variable
                    </button>
                  </div>
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400">Only variables you add will be saved to this project; otherwise no env vars will be stored.</p>
              </div>

              {error && (
                <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 rounded-lg text-sm">
                  {error}
                </div>
              )}

              <div className="flex gap-4">
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 inline-flex items-center justify-center px-4 py-2 rounded-lg bg-gray-900 dark:bg-white text-white dark:text-gray-900 hover:bg-gray-800 dark:hover:bg-gray-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Upload className="h-4 w-4 mr-2" />
                  {loading ? 'Deploying...' : 'Deploy Project'}
                </button>
                <Link 
                  href="/projects"
                  className="px-4 py-2 rounded-lg border border-gray-200 dark:border-gray-800 text-gray-900 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors inline-flex items-center justify-center"
                >
                  Cancel
                </Link>
              </div>
            </form>
          </div>

          <div className="mt-6 p-6 bg-gray-100 dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg">
            <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-3">📝 Important Notes:</h3>
            <ul className="list-disc list-inside space-y-2 text-sm text-gray-600 dark:text-gray-400">
              <li>Upload a ZIP file containing your Node.js project</li>
              <li>If package.json exists, dependencies will be auto-installed</li>
              <li>Make sure your start command is correct</li>
              <li>Max upload size: 200MB</li>
            </ul>
          </div>
        </main>
      </div>
    </div>
  );
}
