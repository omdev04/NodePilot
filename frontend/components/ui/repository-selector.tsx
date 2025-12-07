'use client';

import { useState, useEffect } from 'react';
import { Input } from './input';
import { Label } from './label';
import { Button } from './button';
import { Search, GitBranch, Lock, Unlock, AlertCircle, RefreshCw } from 'lucide-react';
import { api } from '@/lib/api';

interface Repository {
  id: string;
  name: string;
  fullName: string;
  cloneUrl: string;
  sshUrl: string;
  defaultBranch: string;
  isPrivate: boolean;
  description?: string;
  language?: string;
  updatedAt?: string;
}

interface RepositorySelectorProps {
  onSelect: (repo: Repository) => void;
  selectedRepo?: Repository | null;
}

export function RepositorySelector({ onSelect, selectedRepo }: RepositorySelectorProps) {
  const [repositories, setRepositories] = useState<Repository[]>([]);
  const [filteredRepos, setFilteredRepos] = useState<Repository[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [requiresAuth, setRequiresAuth] = useState(false);

  useEffect(() => {
    fetchRepositories();
  }, []);

  useEffect(() => {
    // Filter repositories based on search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      const filtered = repositories.filter(
        (repo) =>
          repo.name.toLowerCase().includes(query) ||
          repo.fullName.toLowerCase().includes(query) ||
          repo.description?.toLowerCase().includes(query)
      );
      setFilteredRepos(filtered);
    } else {
      setFilteredRepos(repositories);
    }
  }, [searchQuery, repositories]);

  const fetchRepositories = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await api.get('/oauth/repositories', {
        params: { page: 1, per_page: 100 },
      });
      setRepositories(response.data.repositories);
      setFilteredRepos(response.data.repositories);
      setRequiresAuth(false);
    } catch (err: any) {
      console.error('Failed to fetch repositories:', err);
      
      if (err.response?.data?.requiresAuth) {
        setRequiresAuth(true);
        setError('Please connect your Git provider account first.');
      } else {
        setError(err.response?.data?.error || 'Failed to fetch repositories');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSelect = (repo: Repository) => {
    onSelect(repo);
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <Label>Select Repository</Label>
        <div className="flex items-center justify-center py-12 border rounded-lg">
          <div className="text-center space-y-3">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent mx-auto" />
            <p className="text-sm text-muted-foreground">Loading repositories...</p>
          </div>
        </div>
      </div>
    );
  }

  if (requiresAuth) {
    return (
      <div className="space-y-4">
        <Label>Select Repository</Label>
        <div className="rounded-lg border border-orange-200 dark:border-orange-800 bg-orange-50 dark:bg-orange-900/20 p-6">
          <div className="flex gap-3">
            <AlertCircle className="h-5 w-5 text-orange-600 dark:text-orange-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-medium text-orange-800 dark:text-orange-200 mb-1">
                Git Provider Not Connected
              </p>
              <p className="text-sm text-orange-700 dark:text-orange-300 mb-4">
                Please connect your GitHub, GitLab, or Bitbucket account in settings to browse repositories.
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => window.location.href = '/settings'}
                className="border-orange-600 text-orange-600 hover:bg-orange-600 hover:text-white"
              >
                Go to Settings
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error && !requiresAuth) {
    return (
      <div className="space-y-4">
        <Label>Select Repository</Label>
        <div className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 p-6">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="font-medium text-red-800 dark:text-red-200 mb-1">Error</p>
              <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={fetchRepositories}
              className="flex-shrink-0"
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              Retry
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Search */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            type="text"
            placeholder="Search repositories..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
        <Button
          variant="outline"
          size="icon"
          onClick={fetchRepositories}
          title="Refresh"
        >
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      {/* Repository List */}
      <div className="border rounded-lg max-h-[300px] overflow-y-auto">
        {filteredRepos.length === 0 ? (
          <div className="text-center py-8 px-4">
            <GitBranch className="h-10 w-10 text-muted-foreground mx-auto mb-2 opacity-40" />
            <p className="text-sm text-muted-foreground">
              {searchQuery ? 'No repositories found' : 'No repositories available'}
            </p>
          </div>
        ) : (
          <div className="divide-y">
            {filteredRepos.map((repo) => (
              <button
                key={repo.id}
                onClick={() => handleSelect(repo)}
                className={`w-full text-left px-3 py-2.5 hover:bg-accent transition-colors ${
                  selectedRepo?.id === repo.id ? 'bg-accent/50' : ''
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    {repo.isPrivate ? (
                      <Lock className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                    ) : (
                      <Unlock className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                    )}
                    <span className="font-medium text-sm truncate">{repo.fullName}</span>
                  </div>
                  {selectedRepo?.id === repo.id && (
                    <div className="flex-shrink-0 h-4 w-4 rounded-full bg-primary flex items-center justify-center">
                      <svg
                        className="h-2.5 w-2.5 text-primary-foreground"
                        fill="none"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="3"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                  )}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Selected Repository Info */}
      {selectedRepo && (
        <div className="text-xs text-muted-foreground">
          <span className="font-medium text-foreground">{selectedRepo.fullName}</span>
          {' • '}
          <span>Branch: {selectedRepo.defaultBranch}</span>
          {selectedRepo.language && (
            <>
              {' • '}
              <span>{selectedRepo.language}</span>
            </>
          )}
        </div>
      )}
    </div>
  );
}
