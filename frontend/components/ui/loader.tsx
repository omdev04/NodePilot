'use client';

import { useEffect, useState } from 'react';

interface LoaderProps {
  message?: string;
  size?: 'sm' | 'md' | 'lg';
}

export function Loader({ message = 'Loading...', size = 'md' }: LoaderProps) {
  const [dots, setDots] = useState('');

  useEffect(() => {
    const interval = setInterval(() => {
      setDots((prev) => (prev.length >= 3 ? '' : prev + '.'));
    }, 400);
    return () => clearInterval(interval);
  }, []);

  const sizeClasses = {
    sm: 'w-12 h-12',
    md: 'w-20 h-20',
    lg: 'w-32 h-32',
  };

  const textSizeClasses = {
    sm: 'text-sm',
    md: 'text-base',
    lg: 'text-lg',
  };

  return (
    <div className="flex flex-col items-center justify-center gap-4">
      {/* Animated Logo Container */}
      <div className="relative">
        {/* Outer rotating ring */}
        <div className="absolute inset-0 animate-spin-slow">
          <div className={`${sizeClasses[size]} rounded-full border-4 border-transparent border-t-gray-900 dark:border-t-white border-r-gray-900/50 dark:border-r-white/50`}></div>
        </div>
        
        {/* Middle pulsing ring */}
        <div className="absolute inset-0 animate-pulse">
          <div className={`${sizeClasses[size]} rounded-full border-2 border-gray-300 dark:border-gray-700`}></div>
        </div>

        {/* Logo */}
        <div className={`${sizeClasses[size]} flex items-center justify-center animate-float`}>
          <img 
            src="/Logo/trans.png" 
            alt="NodePilot" 
            className="w-3/4 h-3/4 object-contain"
          />
        </div>
      </div>

      {/* Loading Text */}
      {message && (
        <div className="flex items-center gap-1">
          <p className={`${textSizeClasses[size]} font-medium text-gray-900 dark:text-gray-100`}>
            {message}
          </p>
          <span className={`${textSizeClasses[size]} font-medium text-gray-900 dark:text-gray-100 w-4`}>
            {dots}
          </span>
        </div>
      )}
    </div>
  );
}

// Full screen loader overlay
export function LoaderOverlay({ message = 'Loading...' }: { message?: string }) {
  return (
    <div className="fixed inset-0 bg-white/80 dark:bg-gray-950/80 backdrop-blur-sm z-50 flex items-center justify-center">
      <Loader message={message} size="lg" />
    </div>
  );
}

// Inline loader for buttons and small spaces
export function InlineLoader({ className = '' }: { className?: string }) {
  return (
    <div className={`inline-flex items-center ${className}`}>
      <div className="relative w-4 h-4">
        <div className="absolute inset-0 animate-spin">
          <div className="w-4 h-4 rounded-full border-2 border-transparent border-t-current border-r-current/50"></div>
        </div>
      </div>
    </div>
  );
}
