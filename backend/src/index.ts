import Fastify from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import multipart from '@fastify/multipart';
const websocket = require('@fastify/websocket') as any;
import fastifyStatic from '@fastify/static';
import path from 'path';
import dotenv from 'dotenv';
import fs from 'fs';
import { initDatabase } from './utils/database';
import { cleanupMarkedDirectories } from './utils/fileSystem';
import authRoutes from './routes/auth';
import projectRoutes from './routes/projects';
import systemRoutes from './routes/system';
import gitRoutes from './routes/git';
import oauthRoutes from './routes/oauth';
import githubAppRoutes from './routes/githubApp';

dotenv.config();

// Debug: Log if OAuth credentials are loaded
if (process.env.GITHUB_CLIENT_ID) {
  console.log('✅ GitHub OAuth credentials loaded');
} else {
  console.log('⚠️  GitHub OAuth credentials NOT loaded');
}

const PORT = parseInt(process.env.PORT || '9001', 10);
const HOST = process.env.HOST || '0.0.0.0';

const fastify = Fastify({
  logger: {
    level: process.env.NODE_ENV === 'production' ? 'error' : 'warn',
    // Only log errors and warnings, skip request/response logs
  },
  bodyLimit: parseInt(process.env.MAX_UPLOAD_SIZE || '209715200', 10),
});

async function start() {
  try {
    // Initialize database
    await initDatabase();

    // Register plugins
    await fastify.register(cors, {
      origin: true,
      credentials: true,
    });

    await fastify.register(jwt, {
      secret: process.env.JWT_SECRET || 'super-secret-key',
    });

    // Add authenticate decorator
    fastify.decorate('authenticate', async (request: any, reply: any) => {
      try {
        await request.jwtVerify();
      } catch (err) {
        fastify.log.warn({ msg: 'JWT verify failed', err });
        reply.status(401).send({ error: 'Unauthorized' });
        // Stop further handler execution
        throw err;
      }
    });

    await fastify.register(multipart, {
      limits: {
        fileSize: parseInt(process.env.MAX_UPLOAD_SIZE || '209715200', 10),
      },
    });

    await fastify.register(websocket);

    // Health check
    fastify.get('/api/health', async () => {
      return { status: 'ok', timestamp: new Date().toISOString() };
    });

    // Register API routes first
    await fastify.register(authRoutes, { prefix: '/api/auth' });
    await fastify.register(projectRoutes, { prefix: '/api/project' });
    await fastify.register(systemRoutes, { prefix: '/api/system' });
    await fastify.register(gitRoutes, { prefix: '/api/git' });
    await fastify.register(oauthRoutes, { prefix: '/api/oauth' });
    await fastify.register(githubAppRoutes, { prefix: '/api' });

    // Simple approach: Just show a message, don't try to embed Next.js
    // Frontend will run separately on port 9000
    console.log('ℹ️  For single port access, use nginx or run frontend separately');
    
    // Root route fallback
    fastify.get('/', async () => {
      return {
        message: 'NodePilot Backend API',
        version: '1.0.0',
        api: '/api/health',
        frontend: 'Run on separate port or use nginx proxy',
      };
    });

    // Start server
    await fastify.listen({ port: PORT, host: HOST });
    
    const apiUrl = process.env.API_URL || `http://localhost:${PORT}`;
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:9000';
    
    console.log(`\n🚀 NodePilot Backend Running!`);
    console.log(`📍 Backend API: ${apiUrl}`);
    console.log(`🔐 Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`💾 Projects Dir: ${process.env.PROJECTS_DIR || './projects'}`);
    console.log(`\n💡 Access Options:`);
    console.log(`   🌐 Frontend: ${frontendUrl}`);
    console.log(`   📦 Standalone: npm run dev (in frontend folder)`);
    console.log(`   🔀 Reverse Proxy: Use Caddy (see Caddyfile) or Nginx\n`);

    // Start background cleanup job for locked directories
    const projectsDir = process.env.PROJECTS_DIR || path.join(process.cwd(), '../projects');
    const cleanupInterval = setInterval(async () => {
      try {
        const result = await cleanupMarkedDirectories(projectsDir);
        if (result.cleaned > 0 || result.failed.length > 0) {
          console.log(`🧹 Cleanup: ${result.cleaned} directories removed, ${result.failed.length} still locked`);
        }
      } catch (error) {
        console.error('Cleanup job error:', error);
      }
    }, 5 * 60 * 1000); // Run every 5 minutes

    // Cleanup on shutdown
    const shutdown = async () => {
      clearInterval(cleanupInterval);
      await fastify.close();
      process.exit(0);
    };

    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);

  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
}

start();
