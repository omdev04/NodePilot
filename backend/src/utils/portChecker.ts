import { createServer } from 'net';

/**
 * Check if a port is available
 */
export function checkPort(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = createServer();
    
    server.once('error', (err: any) => {
      if (err.code === 'EADDRINUSE') {
        resolve(false); // Port is in use
      } else {
        resolve(false); // Other error, assume unavailable
      }
    });
    
    server.once('listening', () => {
      server.close();
      resolve(true); // Port is available
    });
    
    server.listen(port, '0.0.0.0');
  });
}

/**
 * Find next available port starting from a given port
 */
export async function findAvailablePort(startPort: number = 3000, maxAttempts: number = 100): Promise<number> {
  for (let port = startPort; port < startPort + maxAttempts; port++) {
    const isAvailable = await checkPort(port);
    if (isAvailable) {
      return port;
    }
  }
  throw new Error(`No available port found in range ${startPort}-${startPort + maxAttempts}`);
}

/**
 * Get next available port or use provided port if available
 */
export async function getAvailablePort(preferredPort?: number): Promise<number> {
  if (!preferredPort) {
    return findAvailablePort(3000);
  }
  
  const isAvailable = await checkPort(preferredPort);
  if (isAvailable) {
    return preferredPort;
  }
  
  // Port is in use, find next available
  console.log(`⚠️  Port ${preferredPort} is already in use, finding next available port...`);
  return findAvailablePort(preferredPort);
}
