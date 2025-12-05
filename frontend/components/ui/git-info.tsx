'use client';

import { useState, useEffect } from 'react';
import api from '@/lib/api';
import { GitBranch, RefreshCw, Webhook, Copy, Check, AlertCircle } from 'lucide-react';
import { Button } from './button';
import { Input } from './input';
import { Label } from './label';

interface GitInfoProps {
  projectId: string;
}

interface RepoInfo {
  branch?: string;
  commit?: string;
  commitMessage?: string;
  author?: string;
  date?: string;
  gitUrl?: string;
  configuredBranch?: string;
}

export function GitInfo({ projectId }: GitInfoProps) {
  const [info, setInfo] = useState<RepoInfo | null>(null);
  const [branches, setBranches] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [redeploying, setRedeploying] = useState(false);
  const [webhookConfig, setWebhookConfig] = useState<any>(null);
  const [showWebhook, setShowWebhook] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchGitInfo();
    fetchBranches();
  }, [projectId]);

  const fetchGitInfo = async () => {
    try {
      const response = await api.get(`/git/project/${projectId}/git/info`);
      if (response.data.success) {
        setInfo(response.data.info);
      }
    } catch (error: any) {
      console.error('Failed to fetch git info:', error);
    }
  };

  const fetchBranches = async () => {
    try {
      const response = await api.get(`/git/project/${projectId}/git/branches`);
      if (response.data.success) {
        setBranches(response.data.branches);
      }
    } catch (error: any) {
      console.error('Failed to fetch branches:', error);
    }
  };

  const handleRedeploy = async () => {
    setRedeploying(true);
    setError('');
    try {
      await api.post(`/git/project/${projectId}/deploy/git`);
      setTimeout(() => {
        fetchGitInfo();
      }, 2000);
    } catch (error: any) {
      setError(error.response?.data?.error || 'Failed to redeploy');
    } finally {
      setRedeploying(false);
    }
  };

  const handleSwitchBranch = async (branch: string) => {
    setLoading(true);
    setError('');
    try {
      await api.post(`/git/project/${projectId}/git/branch`, { branch });
      setTimeout(() => {
        fetchGitInfo();
      }, 2000);
    } catch (error: any) {
      setError(error.response?.data?.error || 'Failed to switch branch');
    } finally {
      setLoading(false);
    }
  };

  const handleConfigureWebhook = async () => {
    setLoading(true);
    try {
      const response = await api.post(`/git/project/${projectId}/webhook/config`, {
        enabled: true,
        provider: 'github',
      });
      setWebhookConfig(response.data.webhook);
      setShowWebhook(true);
    } catch (error: any) {
      setError(error.response?.data?.error || 'Failed to configure webhook');
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!info) {
    return (
      <div className="rounded-lg border border-gray-200 dark:border-gray-800 p-6">
        <p className="text-gray-500 dark:text-gray-400">Loading Git information...</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Git Repository Info */}
      <div className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
            <GitBranch className="h-5 w-5" />
            Git Repository
          </h3>
          <button
            onClick={handleRedeploy}
            disabled={redeploying}
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-gray-900 dark:bg-white text-white dark:text-gray-900 hover:bg-gray-800 dark:hover:bg-gray-100 transition-colors disabled:opacity-50 text-sm"
          >
            <RefreshCw className={`h-4 w-4 ${redeploying ? 'animate-spin' : ''}`} />
            {redeploying ? 'Pulling...' : 'Pull & Deploy'}
          </button>
        </div>

        <div className="space-y-3 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-600 dark:text-gray-400">Repository:</span>
            <span className="font-mono text-gray-900 dark:text-gray-100 truncate max-w-md">{info.gitUrl}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600 dark:text-gray-400">Branch:</span>
            <span className="font-semibold text-gray-900 dark:text-gray-100">{info.branch || info.configuredBranch}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600 dark:text-gray-400">Commit:</span>
            <span className="font-mono text-gray-900 dark:text-gray-100">{info.commit}</span>
          </div>
          {info.commitMessage && (
            <div className="flex justify-between">
              <span className="text-gray-600 dark:text-gray-400">Message:</span>
              <span className="text-gray-900 dark:text-gray-100 truncate max-w-md">{info.commitMessage}</span>
            </div>
          )}
          {info.author && (
            <div className="flex justify-between">
              <span className="text-gray-600 dark:text-gray-400">Author:</span>
              <span className="text-gray-900 dark:text-gray-100">{info.author}</span>
            </div>
          )}
        </div>
      </div>

      {/* Branch Switcher */}
      {branches.length > 0 && (
        <div className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-6">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Switch Branch</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {branches.map((branch) => (
              <button
                key={branch}
                onClick={() => handleSwitchBranch(branch)}
                disabled={loading || branch === info.branch}
                className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  branch === info.branch
                    ? 'bg-gray-900 dark:bg-white text-white dark:text-gray-900'
                    : 'bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100 hover:bg-gray-200 dark:hover:bg-gray-700'
                } disabled:opacity-50`}
              >
                {branch}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Webhook Configuration */}
      <div className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
            <Webhook className="h-5 w-5" />
            Auto-Deploy Webhook
          </h3>
          {!showWebhook && (
            <button
              onClick={handleConfigureWebhook}
              disabled={loading}
              className="px-3 py-1.5 rounded-lg bg-gray-900 dark:bg-white text-white dark:text-gray-900 hover:bg-gray-800 dark:hover:bg-gray-100 transition-colors text-sm disabled:opacity-50"
            >
              Configure
            </button>
          )}
        </div>

        {showWebhook && webhookConfig ? (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="text-gray-900 dark:text-gray-100">Webhook URL</Label>
              <div className="flex gap-2">
                <Input
                  value={webhookConfig.url}
                  readOnly
                  className="font-mono text-sm bg-gray-50 dark:bg-gray-950"
                />
                <button
                  onClick={() => copyToClipboard(webhookConfig.url)}
                  className="px-3 py-2 rounded-lg bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                  title="Copy URL"
                >
                  {copied ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-gray-900 dark:text-gray-100">Webhook Secret</Label>
              <div className="flex gap-2">
                <Input
                  value={webhookConfig.secret}
                  readOnly
                  type="password"
                  className="font-mono text-sm bg-gray-50 dark:bg-gray-950"
                />
                <button
                  onClick={() => copyToClipboard(webhookConfig.secret)}
                  className="px-3 py-2 rounded-lg bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                  title="Copy Secret"
                >
                  {copied ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <div className="p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
              <h4 className="font-medium text-blue-900 dark:text-blue-100 mb-2">Setup Instructions (GitHub):</h4>
              <ol className="list-decimal list-inside space-y-1 text-sm text-blue-800 dark:text-blue-200">
                <li>Go to your repository Settings → Webhooks</li>
                <li>Click "Add webhook"</li>
                <li>Paste the Webhook URL above</li>
                <li>Set Content type to "application/json"</li>
                <li>Paste the Secret in the "Secret" field</li>
                <li>Select "Just the push event"</li>
                <li>Click "Add webhook"</li>
              </ol>
            </div>
          </div>
        ) : (
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Configure a webhook to automatically deploy when you push to your repository
          </p>
        )}
      </div>

      {error && (
        <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-red-800 dark:text-red-200">{error}</p>
        </div>
      )}
    </div>
  );
}
