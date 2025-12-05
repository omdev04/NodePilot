import Fastify from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import multipart from '@fastify/multipart';
const websocket = require('@fastify/websocket') as any;
import fastifyStatic from '@fastify/static';
import path from 'path';
import dotenv from 'dotenv';
import { initDatabase } from './utils/database';
import authRoutes from './routes/auth';
import projectRoutes from './routes/projects';
import systemRoutes from './routes/system';
import gitRoutes from './routes/git';
import oauthRoutes from './routes/oauth';

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
    fastify.get('/health', async () => {
      return { status: 'ok', timestamp: new Date().toISOString() };
    });

    // Register routes
    await fastify.register(authRoutes, { prefix: '/api/auth' });
    await fastify.register(projectRoutes, { prefix: '/api/project' });
    await fastify.register(systemRoutes, { prefix: '/api/system' });
    await fastify.register(gitRoutes, { prefix: '/api/git' });
    await fastify.register(oauthRoutes, { prefix: '/api/oauth' });

    // Start server
    await fastify.listen({ port: PORT, host: HOST });
    
    console.log(`\n🚀 NodePilot Backend Server Running!`);
    console.log(`📍 URL: http://${HOST}:${PORT}`);
    console.log(`🔐 Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`💾 Projects Dir: ${process.env.PROJECTS_DIR || './projects'}\n`);

  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
}

start();
