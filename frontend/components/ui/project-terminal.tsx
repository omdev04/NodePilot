'use client';

import { useState, useEffect, useRef } from 'react';
import { Terminal, X, Minimize2, Maximize2, Trash2 } from 'lucide-react';
import api from '@/lib/api';

interface TerminalProps {
  projectId: string;
  projectPath: string;
  onClose?: () => void;
}

export function ProjectTerminal({ projectId, projectPath, onClose }: TerminalProps) {
  const [isOpen, setIsOpen] = useState(true);
  const [isMinimized, setIsMinimized] = useState(false);
  const [command, setCommand] = useState('');
  const [history, setHistory] = useState<{ command: string; output: string; error?: boolean }[]>([]);
  const [commandHistory, setCommandHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [isExecuting, setIsExecuting] = useState(false);
  const terminalRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
    }
  }, [history]);

  useEffect(() => {
    if (isOpen && !isMinimized && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen, isMinimized]);

  const executeCommand = async () => {
    if (!command.trim() || isExecuting) return;

    const cmd = command.trim();
    setCommand('');
    setCommandHistory([cmd, ...commandHistory]);
    setHistoryIndex(-1);
    setIsExecuting(true);

    setHistory([...history, { command: cmd, output: 'Executing...', error: false }]);

    try {
      const response = await api.post(`/project/${projectId}/terminal`, {
        command: cmd,
      });

      const output = response.data.output || 'Command executed';
      setHistory((prev) => [
        ...prev.slice(0, -1),
        { 
          command: cmd, 
          output: output,
          error: false 
        },
      ]);
    } catch (error: any) {
      const errorMsg = error.response?.data?.error || error.message || 'Command failed';
      setHistory((prev) => [
        ...prev.slice(0, -1),
        { 
          command: cmd, 
          output: errorMsg, 
          error: true 
        },
      ]);
    } finally {
      setIsExecuting(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      executeCommand();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (historyIndex < commandHistory.length - 1) {
        const newIndex = historyIndex + 1;
        setHistoryIndex(newIndex);
        setCommand(commandHistory[newIndex]);
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (historyIndex > 0) {
        const newIndex = historyIndex - 1;
        setHistoryIndex(newIndex);
        setCommand(commandHistory[newIndex]);
      } else if (historyIndex === 0) {
        setHistoryIndex(-1);
        setCommand('');
      }
    }
  };

  const clearTerminal = () => {
    setHistory([]);
  };

  const handleClose = () => {
    setIsOpen(false);
    if (onClose) {
      onClose();
    }
  };

  return (
    <div
      className={`fixed ${
        isMinimized ? 'bottom-4 right-4 w-64' : 'bottom-0 right-0 w-full md:w-2/3 lg:w-1/2'
      } bg-gray-900 dark:bg-black border border-gray-700 dark:border-gray-800 rounded-t-lg shadow-2xl z-50 transition-all duration-200`}
      style={{
        maxHeight: isMinimized ? '48px' : '500px',
      }}
    >
      {/* Terminal Header */}
      <div className="h-12 bg-gray-800 dark:bg-gray-900 border-b border-gray-700 dark:border-gray-800 flex items-center justify-between px-4 rounded-t-lg">
        <div className="flex items-center gap-2">
          <Terminal className="h-4 w-4 text-green-400" />
          <span className="text-sm font-semibold text-gray-300">Terminal - {projectPath}</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={clearTerminal}
            className="p-1.5 hover:bg-gray-700 rounded transition-colors"
            title="Clear Terminal"
          >
            <Trash2 className="h-4 w-4 text-gray-400" />
          </button>
          <button
            onClick={() => setIsMinimized(!isMinimized)}
            className="p-1.5 hover:bg-gray-700 rounded transition-colors"
            title={isMinimized ? 'Maximize' : 'Minimize'}
          >
            {isMinimized ? (
              <Maximize2 className="h-4 w-4 text-gray-400" />
            ) : (
              <Minimize2 className="h-4 w-4 text-gray-400" />
            )}
          </button>
          <button
            onClick={handleClose}
            className="p-1.5 hover:bg-gray-700 rounded transition-colors"
            title="Close Terminal"
          >
            <X className="h-4 w-4 text-gray-400" />
          </button>
        </div>
      </div>

      {/* Terminal Content */}
      {!isMinimized && (
        <>
          <div
            ref={terminalRef}
            className="h-[400px] overflow-y-auto p-4 font-mono text-sm bg-gray-950 dark:bg-black"
          >
            {history.length === 0 && (
              <div className="text-green-400 mb-2">
                <span className="text-gray-500">Welcome to NodePilot Terminal</span>
                <br />
                <span className="text-gray-500">Type commands to run in your project directory</span>
              </div>
            )}
            {history.map((entry, index) => (
              <div key={index} className="mb-3">
                <div className="flex items-center gap-2 text-green-400 mb-1">
                  <span className="text-blue-400">$</span>
                  <span>{entry.command}</span>
                </div>
                <pre
                  className={`whitespace-pre-wrap break-words ${
                    entry.error ? 'text-red-400' : 'text-gray-300'
                  }`}
                >
                  {entry.output}
                </pre>
              </div>
            ))}
          </div>

          {/* Terminal Input */}
          <div className="h-12 bg-gray-800 dark:bg-gray-900 border-t border-gray-700 dark:border-gray-800 flex items-center px-4 gap-2">
            <span className="text-green-400 font-mono text-sm">$</span>
            <input
              ref={inputRef}
              type="text"
              value={command}
              onChange={(e) => setCommand(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={isExecuting}
              placeholder="Enter command... (e.g., npm install)"
              className="flex-1 bg-transparent text-gray-300 font-mono text-sm outline-none placeholder-gray-600 disabled:opacity-50"
            />
            {isExecuting && (
              <span className="text-yellow-400 text-xs animate-pulse">Executing...</span>
            )}
          </div>
        </>
      )}
    </div>
  );
}
