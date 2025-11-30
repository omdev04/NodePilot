import { FastifyInstance } from 'fastify';
import bcrypt from 'bcrypt';
import { dbWrapper as db } from '../utils/database';
import { z } from 'zod';

const loginSchema = z.object({
  username: z.string().min(3).max(50),
  password: z.string().min(6),
});

const changePasswordSchema = z.object({
  currentPassword: z.string(),
  newPassword: z.string().min(6),
});

const updateProfileSchema = z.object({
  username: z.string().min(3).max(50).optional(),
  email: z.string().email().optional(),
  avatar_url: z.string().optional(),
});

export default async function authRoutes(fastify: FastifyInstance) {
  // Login
  fastify.post('/login', async (request, reply) => {
    try {
      const { username, password } = loginSchema.parse(request.body);

      const user = db
        .prepare('SELECT * FROM users WHERE username = ?')
        .get(username) as any;

      if (!user) {
        return reply.status(401).send({ error: 'Invalid credentials' });
      }

      const validPassword = await bcrypt.compare(password, user.password);

      if (!validPassword) {
        return reply.status(401).send({ error: 'Invalid credentials' });
      }

      const token = fastify.jwt.sign({
        id: user.id,
        username: user.username,
      });

      return {
        token,
        user: {
          id: user.id,
          username: user.username,
        },
      };
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({ error: 'Invalid input', details: error.errors });
      }
      throw error;
    }
  });

  // Verify token
  fastify.get('/verify', {
    preHandler: [(fastify as any).authenticate],
  }, async (request) => {
    return { valid: true, user: request.user };
  });

  // Get user profile
  fastify.get('/profile', {
    preHandler: [(fastify as any).authenticate],
  }, async (request, reply) => {
    const user: any = request.user;
    if (!user || !user.id) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }

    const dbUser = db
      .prepare('SELECT id, username, email, avatar_url, created_at FROM users WHERE id = ?')
      .get(user.id) as any;

    return { user: dbUser };
  });

  // Update profile
  fastify.put('/profile', {
    preHandler: [(fastify as any).authenticate],
  }, async (request, reply) => {
    try {
      const data = updateProfileSchema.parse(request.body);
      const user: any = request.user;
      if (!user || !user.id) {
        return reply.status(401).send({ error: 'Unauthorized' });
      }

      fastify.log.info({ msg: 'Profile update request', userId: user.id, body: data });

      const updates: string[] = [];
      const values: any[] = [];

      if (typeof data.username !== 'undefined' && data.username !== null && data.username !== '') {
        // Check if username already exists
        const existing = db
          .prepare('SELECT id FROM users WHERE username = ? AND id != ?')
          .get(data.username, user.id);
        
        if (existing) {
          return reply.status(400).send({ error: 'Username already taken' });
        }
        
        updates.push('username = ?');
        values.push(data.username);
      }

      if (typeof data.email !== 'undefined' && data.email !== null && data.email !== '') {
        updates.push('email = ?');
        values.push(data.email);
      }

      if (typeof data.avatar_url !== 'undefined' && data.avatar_url !== null && data.avatar_url !== '') {
        updates.push('avatar_url = ?');
        values.push(data.avatar_url);
      }

      if (updates.length > 0) {
        values.push(user.id);
        db.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`).run(...values);
      }

      return { message: 'Profile updated successfully' };
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({ error: 'Invalid input', details: error.errors });
      }
      throw error;
    }
  });

  // Change password
  fastify.post('/change-password', {
    preHandler: [(fastify as any).authenticate],
  }, async (request, reply) => {
    try {
      const { currentPassword, newPassword } = changePasswordSchema.parse(request.body);
      const user: any = request.user;

      const dbUser = db
        .prepare('SELECT * FROM users WHERE id = ?')
        .get(user.id) as any;

      const validPassword = await bcrypt.compare(currentPassword, dbUser.password);

      if (!validPassword) {
        return reply.status(401).send({ error: 'Current password is incorrect' });
      }

      const hashedPassword = await bcrypt.hash(newPassword, 10);

      db.prepare('UPDATE users SET password = ? WHERE id = ?').run(
        hashedPassword,
        user.id
      );

      return { message: 'Password changed successfully' };
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({ error: 'Invalid input', details: error.errors });
      }
      throw error;
    }
  });
}
