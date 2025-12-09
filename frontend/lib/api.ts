import axios, { AxiosError } from 'axios';

// Automatic API URL detection (Dokploy-style)
const getApiUrl = () => {
  // 1. Check environment variable (build-time or runtime)
  if (process.env.NEXT_PUBLIC_API_URL) {
    return process.env.NEXT_PUBLIC_API_URL;
  }
  
  // 2. Browser runtime detection (for deployed apps)
  if (typeof window !== 'undefined') {
    const { protocol, hostname } = window.location;
    
    // If on custom domain/IP, use same host with API port
    if (hostname !== 'localhost' && hostname !== '127.0.0.1') {
      return `${protocol}//${hostname}:9001/api`;
    }
  }
  
  // 3. Fallback to localhost (development)
  return 'http://localhost:9001/api';
};

const API_URL = getApiUrl();

export const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add auth token to requests
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Handle auth errors
api.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export default api;
