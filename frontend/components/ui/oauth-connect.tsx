'use client';

import { useState, useEffect } from 'react';
import { Button } from './button';
import { Card } from './card';
import { Github, GitBranch, AlertCircle, CheckCircle, XCircle } from 'lucide-react';
import { api } from '@/lib/api';

interface OAuthStatus {
  connected: boolean;
  provider: 'github' | 'gitlab' | 'bitbucket' | null;
}

interface OAuthConnectProps {
  onStatusChange?: (status: OAuthStatus) => void;
}

export function OAuthConnect({ onStatusChange }: OAuthConnectProps) {
  const [status, setStatus] = useState<OAuthStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    checkStatus();
    checkCallbackStatus();
  }, []);

  const checkStatus = async () => {
    try {
      setLoading(true);
      const response = await api.get('/oauth/status');
      const newStatus = response.data;
      setStatus(newStatus);
      onStatusChange?.(newStatus);
    } catch (err: any) {
      console.error('Failed to check OAuth status:', err);
      setStatus({ connected: false, provider: null });
    } finally {
      setLoading(false);
    }
  };

  const checkCallbackStatus = () => {
    // Check URL parameters for OAuth callback
    const params = new URLSearchParams(window.location.search);
    const oauthSuccess = params.get('oauth_success');
    const oauthError = params.get('oauth_error');

    if (oauthSuccess) {
      setSuccess(`Successfully connected to ${oauthSuccess}!`);
      // Clean URL
      window.history.replaceState({}, '', window.location.pathname);
      // Refresh status
      setTimeout(() => {
        checkStatus();
        setSuccess(null);
      }, 2000);
    }

    if (oauthError) {
      setError(`Failed to connect: ${decodeURIComponent(oauthError)}`);
      // Clean URL
      window.history.replaceState({}, '', window.location.pathname);
      setTimeout(() => setError(null), 5000);
    }
  };

  const connect = async (provider: 'github' | 'gitlab' | 'bitbucket') => {
    try {
      setConnecting(provider);
      setError(null);
      const response = await api.get(`/oauth/authorize/${provider}`);
      // Redirect to OAuth authorization page
      window.location.href = response.data.authUrl;
    } catch (err: any) {
      console.error('Failed to initiate OAuth:', err);
      setError(err.response?.data?.error || 'Failed to initiate OAuth connection');
      setConnecting(null);
    }
  };

  const disconnect = async () => {
    try {
      await api.post('/oauth/disconnect');
      setSuccess('Disconnected successfully');
      await checkStatus();
      setTimeout(() => setSuccess(null), 3000);
    } catch (err: any) {
      console.error('Failed to disconnect OAuth:', err);
      setError(err.response?.data?.error || 'Failed to disconnect');
      setTimeout(() => setError(null), 5000);
    }
  };

  if (loading) {
    return (
      <Card className="p-6">
        <div className="flex items-center gap-2">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <span>Checking connection status...</span>
        </div>
      </Card>
    );
  }

  const providerConfig = {
    github: {
      name: 'GitHub',
      icon: Github,
      color: 'bg-gray-800 hover:bg-gray-900',
    },
    gitlab: {
      name: 'GitLab',
      icon: GitBranch,
      color: 'bg-orange-600 hover:bg-orange-700',
    },
    bitbucket: {
      name: 'Bitbucket',
      icon: GitBranch,
      color: 'bg-blue-600 hover:bg-blue-700',
    },
  };

  return (
    <div className="space-y-4">
      {/* Status Messages */}
      {error && (
        <div className="flex items-center gap-2 rounded-lg bg-red-50 dark:bg-red-900/20 p-4 text-red-800 dark:text-red-200">
          <AlertCircle className="h-5 w-5" />
          <span>{error}</span>
        </div>
      )}

      {success && (
        <div className="flex items-center gap-2 rounded-lg bg-green-50 dark:bg-green-900/20 p-4 text-green-800 dark:text-green-200">
          <CheckCircle className="h-5 w-5" />
          <span>{success}</span>
        </div>
      )}

      {/* Connection Status Card */}
      <Card className="p-6">
        <h3 className="text-lg font-semibold mb-4">Git Provider Connection</h3>

        {status?.connected && status.provider ? (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="rounded-full bg-green-100 dark:bg-green-900/20 p-2">
                  <CheckCircle className="h-5 w-5 text-green-600 dark:text-green-400" />
                </div>
                <div>
                  <p className="font-medium">
                    Connected to {providerConfig[status.provider].name}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    You can now select repositories from your account
                  </p>
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={disconnect}
              >
                <XCircle className="h-4 w-4 mr-2" />
                Disconnect
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground mb-4">
              Connect your Git provider to easily select repositories without manually entering URLs and tokens.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {(['github', 'gitlab', 'bitbucket'] as const).map((provider) => {
                const config = providerConfig[provider];
                const Icon = config.icon;
                const isConnecting = connecting === provider;

                return (
                  <Button
                    key={provider}
                    onClick={() => connect(provider)}
                    disabled={!!connecting}
                    className={`${config.color} text-white h-auto py-4`}
                  >
                    {isConnecting ? (
                      <>
                        <div className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent mr-2" />
                        Connecting...
                      </>
                    ) : (
                      <>
                        <Icon className="h-5 w-5 mr-2" />
                        Connect {config.name}
                      </>
                    )}
                  </Button>
                );
              })}
            </div>

            <div className="mt-4 rounded-lg bg-blue-50 dark:bg-blue-900/20 p-4">
              <div className="flex gap-2">
                <AlertCircle className="h-5 w-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
                <div className="text-sm text-blue-800 dark:text-blue-200">
                  <p className="font-medium mb-1">Setup Required</p>
                  <p>
                    OAuth must be configured by the administrator. Contact your admin if connection buttons are not working.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
