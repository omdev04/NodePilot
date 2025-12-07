import fsPromises from 'fs/promises';
import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export class DirectoryRemovalError extends Error {
  constructor(
    message: string,
    public readonly path: string,
    public readonly code: string,
    public readonly recoverable: boolean
  ) {
    super(message);
    this.name = 'DirectoryRemovalError';
  }
}

/**
 * Safely remove a directory with proper error handling
 * Production-ready approach: fail fast with clear errors instead of aggressive retries
 */
export async function removeDirectory(dirPath: string): Promise<void> {
  try {
    // Check if directory exists
    const exists = await fsPromises.access(dirPath).then(() => true).catch(() => false);
    if (!exists) {
      return; // Already deleted
    }

    // Attempt removal
    await fsPromises.rm(dirPath, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
  } catch (error: any) {
    // Handle specific error cases
    if (error.code === 'ENOENT') {
      return; // Already deleted during operation
    }

    if (error.code === 'EBUSY' || error.code === 'EPERM') {
      throw new DirectoryRemovalError(
        `Directory is locked by another process: ${error.message}`,
        dirPath,
        error.code,
        true // recoverable - can be retried later
      );
    }

    // Other errors are likely permission or system issues
    throw new DirectoryRemovalError(
      `Failed to remove directory: ${error.message}`,
      dirPath,
      error.code || 'UNKNOWN',
      false
    );
  }
}

/**
 * Mark a directory for deferred deletion
 * Renames directory to .deleted-{timestamp} for later cleanup
 */
export async function markForDeletion(dirPath: string): Promise<string> {
  const timestamp = Date.now();
  const dirname = path.dirname(dirPath);
  const basename = path.basename(dirPath);
  const deletedPath = path.join(dirname, `.deleted-${basename}-${timestamp}`);

  try {
    await fsPromises.rename(dirPath, deletedPath);
    return deletedPath;
  } catch (error: any) {
    throw new DirectoryRemovalError(
      `Failed to mark directory for deletion: ${error.message}`,
      dirPath,
      error.code || 'UNKNOWN',
      false
    );
  }
}

/**
 * Cleanup marked directories in the background
 * Should be called periodically by a cleanup job
 */
export async function cleanupMarkedDirectories(baseDir: string): Promise<{ cleaned: number; failed: string[] }> {
  const results = { cleaned: 0, failed: [] as string[] };

  try {
    const items = await fsPromises.readdir(baseDir);
    
    for (const item of items) {
      if (item.startsWith('.deleted-')) {
        const fullPath = path.join(baseDir, item);
        
        try {
          await fsPromises.rm(fullPath, { recursive: true, force: true });
          results.cleaned++;
        } catch (error) {
          results.failed.push(fullPath);
        }
      }
    }
  } catch (error) {
    // Directory doesn't exist or can't be read
  }

  return results;
}

/**
 * Check if a directory is safe to delete (no active processes using it)
 */
export async function canDeleteDirectory(dirPath: string): Promise<{ canDelete: boolean; reason?: string }> {
  try {
    // Try to access the directory
    await fsPromises.access(dirPath);

    // Check if directory exists
    const stats = await fsPromises.stat(dirPath);
    if (!stats.isDirectory()) {
      return { canDelete: false, reason: 'Path is not a directory' };
    }

    // On Windows, try to check if any handles are open
    if (process.platform === 'win32') {
      try {
        // Try to rename directory to itself (this fails if locked)
        const testPath = dirPath + '.test';
        await fsPromises.rename(dirPath, testPath);
        await fsPromises.rename(testPath, dirPath);
      } catch (error: any) {
        if (error.code === 'EBUSY' || error.code === 'EPERM') {
          return { 
            canDelete: false, 
            reason: 'Directory is currently in use by another process' 
          };
        }
      }
    }

    return { canDelete: true };
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      return { canDelete: true, reason: 'Directory does not exist' };
    }
    return { canDelete: false, reason: error.message };
  }
}
