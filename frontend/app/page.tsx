'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (token) {
      router.push('/dashboard');
    } else {
      router.push('/login');
    }
  }, [router]);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex items-center justify-center">
      <div className="animate-pulse">
        <div className="h-16 w-16 bg-gray-200 dark:bg-gray-800 rounded-lg mb-4"></div>
        <div className="h-4 w-32 bg-gray-200 dark:bg-gray-800 rounded mx-auto"></div>
      </div>
    </div>
  );
}
