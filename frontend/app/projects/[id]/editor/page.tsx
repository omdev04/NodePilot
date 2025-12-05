'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { DashboardSidebar } from '@/components/ui/dashboard-sidebar';
import api from '@/lib/api';
import {
  ChevronRight,
  ChevronDown,
  File,
  Folder,
  FolderOpen,
  Save,
  RefreshCw,
  Undo2,
  Redo2,
  Terminal,
  Plus,
  Trash2,
  FileText,
  Settings,
  Play,
  ArrowLeft,
  Search,
  X,
  Check,
  AlertCircle,
} from 'lucide-react';

interface FileNode {
  name: string;
  path: string;
  type: 'file' | 'directory';
  children?: FileNode[];
  expanded?: boolean;
}

export default function EditorPage() {
  const router = useRouter();
  const params = useParams();
  const projectId = params.id as string;
  
  const [project, setProject] = useState<any>(null);
  const [fileTree, setFileTree] = useState<FileNode[]>([]);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState('');
  const [originalContent, setOriginalContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [showNewFile, setShowNewFile] = useState(false);
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [newItemName, setNewItemName] = useState('');
  const [newItemParent, setNewItemParent] = useState('');
  const [saveMessage, setSaveMessage] = useState('');
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  
  const editorRef = useRef<HTMLTextAreaElement>(null);
  const lineNumbersRef = useRef<HTMLDivElement>(null);
  const undoStack = useRef<string[]>([]);
  const redoStack = useRef<string[]>([]);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) {
      router.push('/login');
      return;
    }
    fetchProject();
    fetchFileTree();
  }, [projectId]);

  const fetchProject = async () => {
    try {
      const res = await api.get(`/project/${projectId}`);
      setProject(res.data);
    } catch (error) {
      console.error('Failed to fetch project:', error);
    }
  };

  const fetchFileTree = async () => {
    try {
      const res = await api.get(`/project/${projectId}/files`);
      setFileTree(res.data.files || []);
      setLoading(false);
    } catch (error) {
      console.error('Failed to fetch file tree:', error);
      setLoading(false);
    }
  };

  const fetchFileContent = async (filePath: string) => {
    try {
      const res = await api.get(`/project/${projectId}/files/content`, {
        params: { path: filePath },
      });
      setFileContent(res.data.content);
      setOriginalContent(res.data.content);
      setSelectedFile(filePath);
      setIsDirty(false);
      undoStack.current = [];
      redoStack.current = [];
    } catch (error) {
      console.error('Failed to fetch file content:', error);
    }
  };

  const saveFile = async () => {
    if (!selectedFile || !isDirty) return;
    
    setSaving(true);
    try {
      await api.post(`/project/${projectId}/files/save`, {
        path: selectedFile,
        content: fileContent,
      });
      setOriginalContent(fileContent);
      setIsDirty(false);
      setLastSaved(new Date());
      setSaveMessage('Saved successfully');
      setTimeout(() => setSaveMessage(''), 2000);
    } catch (error) {
      console.error('Failed to save file:', error);
      setSaveMessage('Save failed');
      setTimeout(() => setSaveMessage(''), 2000);
    } finally {
      setSaving(false);
    }
  };

  const createFile = async () => {
    if (!newItemName.trim()) return;
    
    try {
      await api.post(`/project/${projectId}/files/create`, {
        path: newItemParent ? `${newItemParent}/${newItemName}` : newItemName,
        type: 'file',
      });
      setShowNewFile(false);
      setNewItemName('');
      setNewItemParent('');
      await fetchFileTree();
    } catch (error) {
      console.error('Failed to create file:', error);
    }
  };

  const createFolder = async () => {
    if (!newItemName.trim()) return;
    
    try {
      await api.post(`/project/${projectId}/files/create`, {
        path: newItemParent ? `${newItemParent}/${newItemName}` : newItemName,
        type: 'directory',
      });
      setShowNewFolder(false);
      setNewItemName('');
      setNewItemParent('');
      await fetchFileTree();
    } catch (error) {
      console.error('Failed to create folder:', error);
    }
  };

  const deleteFile = async (filePath: string) => {
    if (!confirm(`Delete ${filePath}?`)) return;
    
    try {
      await api.delete(`/project/${projectId}/files`, {
        params: { path: filePath },
      });
      if (selectedFile === filePath) {
        setSelectedFile(null);
        setFileContent('');
      }
      await fetchFileTree();
    } catch (error) {
      console.error('Failed to delete file:', error);
    }
  };

  const handleContentChange = (newContent: string) => {
    if (newContent !== fileContent) {
      undoStack.current.push(fileContent);
      if (undoStack.current.length > 50) undoStack.current.shift();
      redoStack.current = [];
    }
    setFileContent(newContent);
    setIsDirty(newContent !== originalContent);
  };

  const handleUndo = () => {
    if (undoStack.current.length > 0) {
      const prev = undoStack.current.pop()!;
      redoStack.current.push(fileContent);
      setFileContent(prev);
      setIsDirty(prev !== originalContent);
    }
  };

  const handleRedo = () => {
    if (redoStack.current.length > 0) {
      const next = redoStack.current.pop()!;
      undoStack.current.push(fileContent);
      setFileContent(next);
      setIsDirty(next !== originalContent);
    }
  };

  const toggleFolder = (node: FileNode) => {
    const updateTree = (nodes: FileNode[]): FileNode[] => {
      return nodes.map(n => {
        if (n.path === node.path) {
          return { ...n, expanded: !n.expanded };
        }
        if (n.children) {
          return { ...n, children: updateTree(n.children) };
        }
        return n;
      });
    };
    setFileTree(updateTree(fileTree));
  };

  const getFileIcon = (filename: string) => {
    const ext = filename.split('.').pop()?.toLowerCase();
    if (ext === 'js' || ext === 'ts' || ext === 'jsx' || ext === 'tsx') {
      return '📄';
    } else if (ext === 'json') {
      return '📋';
    } else if (ext === 'env') {
      return '🔐';
    } else if (ext === 'md') {
      return '📝';
    } else if (ext === 'css' || ext === 'scss') {
      return '🎨';
    } else if (ext === 'html') {
      return '🌐';
    }
    return '📄';
  };

  const renderFileTree = (nodes: FileNode[], depth = 0) => {
    return nodes.map((node) => {
      const matches = searchTerm ? node.name.toLowerCase().includes(searchTerm.toLowerCase()) : true;
      if (!matches && node.type === 'file') return null;

      return (
        <div key={node.path}>
          <div
            className={`flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-gray-200/50 dark:hover:bg-gray-800/50 transition-colors ${
              selectedFile === node.path ? 'bg-[#00FF88]/10 border-l-2 border-[#00FF88]' : ''
            }`}
            style={{ paddingLeft: `${depth * 16 + 12}px` }}
            onClick={() => {
              if (node.type === 'file') {
                fetchFileContent(node.path);
              } else {
                toggleFolder(node);
              }
            }}
          >
            {node.type === 'directory' && (
              <span className="text-gray-400">
                {node.expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              </span>
            )}
            {node.type === 'directory' ? (
              node.expanded ? (
                <FolderOpen className="h-4 w-4 text-[#00FF88]" />
              ) : (
                <Folder className="h-4 w-4 text-[#00FF88]" />
              )
            ) : (
              <span className="text-base">{getFileIcon(node.name)}</span>
            )}
            <span className={`text-sm font-mono ${selectedFile === node.path ? 'text-[#00FF88] font-semibold' : 'text-gray-300'}`}>
              {node.name}
            </span>
            {node.type === 'file' && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  deleteFile(node.path);
                }}
                className="ml-auto opacity-0 group-hover:opacity-100 hover:text-red-400 transition-opacity"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            )}
          </div>
          {node.expanded && node.children && renderFileTree(node.children, depth + 1)}
        </div>
      );
    });
  };

  const getFileSize = () => {
    const bytes = new Blob([fileContent]).size;
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
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
      
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top Bar */}
        <div className="h-14 bg-gray-50 dark:bg-[#161B22] border-b border-gray-200 dark:border-gray-800 flex items-center justify-between px-4">
          <div className="flex items-center gap-4">
            <button
              onClick={() => router.push(`/projects/${projectId}`)}
              className="flex items-center gap-2 text-gray-600 dark:text-gray-400 hover:text-[#00FF88] transition-colors"
            >
              <ArrowLeft className="h-4 w-4" />
              <span className="text-sm font-medium">Back to Project</span>
            </button>
            <div className="h-6 w-px bg-gray-300 dark:bg-gray-700" />
            <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
              <span>Projects</span>
              <ChevronRight className="h-3 w-3" />
              <span className="text-[#00FF88] font-semibold">{project?.display_name}</span>
              <ChevronRight className="h-3 w-3" />
              <span>Editor</span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {saveMessage && (
              <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm ${
                saveMessage.includes('success') ? 'bg-[#00FF88]/10 text-[#00FF88]' : 'bg-red-500/10 text-red-400'
              }`}>
                {saveMessage.includes('success') ? <Check className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
                {saveMessage}
              </div>
            )}
            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm ${
              project?.pm2Info?.status === 'online' ? 'bg-[#00FF88]/10 text-[#00FF88]' : 'bg-gray-200 dark:bg-gray-800 text-gray-600 dark:text-gray-400'
            }`}>
              <div className={`w-2 h-2 rounded-full ${project?.pm2Info?.status === 'online' ? 'bg-[#00FF88] animate-pulse' : 'bg-gray-500'}`} />
              {project?.pm2Info?.status === 'online' ? 'Running' : 'Stopped'}
            </div>
          </div>
        </div>

        <div className="flex-1 flex overflow-hidden">
          {/* Left Sidebar - File Explorer */}
          <div className="w-64 bg-gray-50 dark:bg-[#161B22] border-r border-gray-200 dark:border-gray-800 flex flex-col">
            {/* Explorer Header */}
            <div className="h-12 flex items-center justify-between px-3 border-b border-gray-200 dark:border-gray-800">
              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">Explorer</h3>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => fetchFileTree()}
                  className="p-1.5 hover:bg-gray-200 dark:hover:bg-gray-800 rounded transition-colors"
                  title="Refresh"
                >
                  <RefreshCw className="h-3.5 w-3.5 text-gray-600 dark:text-gray-400" />
                </button>
                <button
                  onClick={() => setShowNewFile(true)}
                  className="p-1.5 hover:bg-gray-200 dark:hover:bg-gray-800 rounded transition-colors"
                  title="New File"
                >
                  <FileText className="h-3.5 w-3.5 text-gray-600 dark:text-gray-400" />
                </button>
                <button
                  onClick={() => setShowNewFolder(true)}
                  className="p-1.5 hover:bg-gray-200 dark:hover:bg-gray-800 rounded transition-colors"
                  title="New Folder"
                >
                  <Plus className="h-3.5 w-3.5 text-gray-600 dark:text-gray-400" />
                </button>
              </div>
            </div>

            {/* Search */}
            <div className="p-3 border-b border-gray-200 dark:border-gray-800">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 dark:text-gray-500" />
                <input
                  type="text"
                  placeholder="Search files..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 bg-white dark:bg-[#0D1117] border border-gray-300 dark:border-gray-800 rounded-lg text-sm text-gray-900 dark:text-gray-300 placeholder-gray-400 dark:placeholder-gray-500 focus:border-[#00FF88] focus:outline-none transition-colors"
                />
              </div>
            </div>

            {/* File Tree */}
            <div className="flex-1 overflow-y-auto py-2">
              {renderFileTree(fileTree)}
            </div>
          </div>

          {/* Right Editor Panel */}
          <div className="flex-1 flex flex-col">
            {selectedFile ? (
              <>
                {/* Editor Toolbar */}
                <div className="h-12 bg-[#161B22] border-b border-gray-800 flex items-center justify-between px-4">
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-mono text-gray-400">{selectedFile}</span>
                    {isDirty && <div className="w-2 h-2 rounded-full bg-[#00FF88]" />}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleUndo}
                      disabled={undoStack.current.length === 0}
                      className="p-2 hover:bg-gray-800 rounded transition-colors disabled:opacity-30"
                      title="Undo"
                    >
                      <Undo2 className="h-4 w-4 text-gray-400" />
                    </button>
                    <button
                      onClick={handleRedo}
                      disabled={redoStack.current.length === 0}
                      className="p-2 hover:bg-gray-800 rounded transition-colors disabled:opacity-30"
                      title="Redo"
                    >
                      <Redo2 className="h-4 w-4 text-gray-400" />
                    </button>
                    <div className="h-6 w-px bg-gray-700" />
                    <button
                      onClick={saveFile}
                      disabled={!isDirty || saving}
                      className="flex items-center gap-2 px-4 py-2 bg-[#00FF88] text-black rounded-lg hover:bg-[#00FF88]/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-semibold text-sm"
                    >
                      {saving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                      Save
                    </button>
                  </div>
                </div>

                {/* Code Editor */}
                <div className="flex-1 overflow-hidden relative">
                  <div className="absolute inset-0 flex">
                    {/* Line Numbers */}
                    <div 
                      ref={lineNumbersRef}
                      className="flex-shrink-0 bg-gray-100 dark:bg-[#161B22] text-gray-500 dark:text-gray-600 text-right pr-4 pl-2 py-4 font-mono text-sm select-none border-r border-gray-300 dark:border-gray-800/50 overflow-hidden"
                      style={{
                        overflowY: 'hidden',
                      }}
                    >
                      {fileContent.split('\n').map((_, i) => (
                        <div key={i} style={{ lineHeight: '1.6', height: '22.4px' }}>
                          {i + 1}
                        </div>
                      ))}
                    </div>
                    {/* Code Editor */}
                    <textarea
                      ref={editorRef}
                      value={fileContent}
                      onChange={(e) => handleContentChange(e.target.value)}
                      onScroll={(e) => {
                        if (lineNumbersRef.current) {
                          lineNumbersRef.current.scrollTop = (e.target as HTMLTextAreaElement).scrollTop;
                        }
                      }}
                      className="flex-1 bg-white dark:bg-[#0D1117] text-gray-900 dark:text-gray-300 font-mono text-sm px-4 py-4 resize-none focus:outline-none border-none outline-none overflow-auto"
                      style={{
                        lineHeight: '1.6',
                        tabSize: 2,
                        minHeight: '100%',
                      }}
                      spellCheck={false}
                    />
                  </div>
                </div>

                {/* Status Bar */}
                <div className="h-8 bg-gray-50 dark:bg-[#161B22] border-t border-gray-200 dark:border-gray-800 flex items-center justify-between px-4 text-xs text-gray-600 dark:text-gray-400">
                  <div className="flex items-center gap-4">
                    <span>UTF-8</span>
                    <span>{getFileSize()}</span>
                    {lastSaved && <span>Last saved: {lastSaved.toLocaleTimeString()}</span>}
                  </div>
                  <div className="flex items-center gap-4">
                    <span>{fileContent.split('\n').length} lines</span>
                    <span>{fileContent.length} characters</span>
                  </div>
                </div>
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center">
                <div className="text-center">
                  <FileText className="h-16 w-16 text-gray-300 dark:text-gray-700 mx-auto mb-4" />
                  <h3 className="text-xl font-semibold text-gray-600 dark:text-gray-400 mb-2">No file selected</h3>
                  <p className="text-sm text-gray-500 dark:text-gray-500">Select a file from the explorer to start editing</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* New File Modal */}
      {showNewFile && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-white dark:bg-[#161B22] border border-gray-300 dark:border-gray-800 rounded-xl p-6 w-96">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-200 mb-4">Create New File</h3>
            <input
              type="text"
              placeholder="filename.js"
              value={newItemName}
              onChange={(e) => setNewItemName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && createFile()}
              className="w-full px-4 py-2 bg-gray-50 dark:bg-[#0D1117] border border-gray-300 dark:border-gray-800 rounded-lg text-gray-900 dark:text-gray-300 focus:border-[#00FF88] focus:outline-none mb-4"
              autoFocus
            />
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => {
                  setShowNewFile(false);
                  setNewItemName('');
                }}
                className="px-4 py-2 bg-gray-200 dark:bg-gray-800 hover:bg-gray-300 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={createFile}
                className="px-4 py-2 bg-[#00FF88] hover:bg-[#00FF88]/90 text-black font-semibold rounded-lg transition-colors"
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}

      {/* New Folder Modal */}
      {showNewFolder && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-white dark:bg-[#161B22] border border-gray-300 dark:border-gray-800 rounded-xl p-6 w-96">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-200 mb-4">Create New Folder</h3>
            <input
              type="text"
              placeholder="folder-name"
              value={newItemName}
              onChange={(e) => setNewItemName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && createFolder()}
              className="w-full px-4 py-2 bg-gray-50 dark:bg-[#0D1117] border border-gray-300 dark:border-gray-800 rounded-lg text-gray-900 dark:text-gray-300 focus:border-[#00FF88] focus:outline-none mb-4"
              autoFocus
            />
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => {
                  setShowNewFolder(false);
                  setNewItemName('');
                }}
                className="px-4 py-2 bg-gray-200 dark:bg-gray-800 hover:bg-gray-300 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={createFolder}
                className="px-4 py-2 bg-[#00FF88] hover:bg-[#00FF88]/90 text-black font-semibold rounded-lg transition-colors"
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
