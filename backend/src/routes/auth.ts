import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import bcrypt from 'bcrypt';
import { dbWrapper as db, saveDb } from '../utils/database';
import { z } from 'zod';

/**
 * Authentication Routes Module
 * Handles user signup, login, profile management, and password operations
 */

// ============================================================================
// Schema Definitions
// ============================================================================

const loginSchema = z.object({
  username: z.string().min(3).max(50),
  password: z.string().min(6),
});

const signupSchema = z.object({
  username: z.string().min(3).max(50),
  password: z.string().min(6),
  email: z.string().email().optional(),
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

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Checks if a username already exists in the database
 * @param username - Username to check
 * @returns User record if exists, undefined otherwise
 */
function findUserByUsername(username: string): any {
  return db.prepare('SELECT id FROM users WHERE username = ?').get(username);
}

/**
 * Checks if an email already exists in the database
 * @param email - Email to check
 * @returns User record if exists, undefined otherwise
 */
function findUserByEmail(email: string): any {
  return db.prepare('SELECT id FROM users WHERE email = ?').get(email);
}

/**
 * Creates a new user in the database
 * @param username - Username for the new user
 * @param hashedPassword - Bcrypt hashed password
 * @param email - Optional email address
 * @param role - User role (default: 'user')
 * @returns Insert result with lastInsertRowid
 */
function createUser(username: string, hashedPassword: string, email: string | null, role: string = 'user') {
  return db.prepare(
    'INSERT INTO users (username, password, email, role) VALUES (?, ?, ?, ?)'
  ).run(username, hashedPassword, email, role);
}

/**
 * Retrieves complete user information by username
 * @param username - Username to lookup
 * @returns Complete user record or undefined
 */
function getUserByUsername(username: string): any {
  return db.prepare('SELECT * FROM users WHERE username = ?').get(username);
}

/**
 * Retrieves user profile information by ID
 * @param userId - User ID to lookup
 * @returns User profile without password
 */
function getUserProfile(userId: number): any {
  return db.prepare(
    'SELECT id, username, email, avatar_url, created_at FROM users WHERE id = ?'
  ).get(userId);
}

/**
 * Generates a JWT token for a user
 * @param fastify - Fastify instance with JWT plugin
 * @param userId - User ID
 * @param username - Username
 * @param role - User role (optional)
 * @returns Signed JWT token
 */
function generateToken(fastify: FastifyInstance, userId: any, username: string, role?: string): string {
  const payload: any = { id: userId, username };
  if (role) payload.role = role;
  return fastify.jwt.sign(payload);
}

/**
 * Hashes a password using bcrypt
 * @param password - Plain text password
 * @returns Hashed password
 */
async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

/**
 * Verifies a password against a hash
 * @param password - Plain text password
 * @param hash - Bcrypt hash
 * @returns True if password matches
 */
async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

/**
 * Updates user profile fields
 * @param userId - User ID
 * @param updates - Object with field names and values to update
 */
function updateUserProfile(userId: number, updates: Record<string, any>): void {
  const fields = Object.keys(updates);
  const values = Object.values(updates);
  
  if (fields.length === 0) return;
  
  const setClause = fields.map(field => `${field} = ?`).join(', ');
  db.prepare(`UPDATE users SET ${setClause} WHERE id = ?`).run(...values, userId);
}

/**
 * Updates user password
 * @param userId - User ID
 * @param hashedPassword - New hashed password
 */
function updateUserPassword(userId: number, hashedPassword: string): void {
  db.prepare('UPDATE users SET password = ? WHERE id = ?').run(hashedPassword, userId);
}

// ============================================================================
// Route Handlers
// ============================================================================

/**
 * Authentication routes registration
 */
export default async function authRoutes(fastify: FastifyInstance) {
  /**
   * POST /signup
   * Creates a new user account
   * @returns JWT token and user information
   */
  fastify.post('/signup', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { username, password, email } = signupSchema.parse(request.body);

      // Check if username already exists
      const existingUser = findUserByUsername(username);
      if (existingUser) {
        return reply.status(409).send({ error: 'Username already exists' });
      }

      // Check if email already exists (if provided)
      if (email) {
        const existingEmail = findUserByEmail(email);
        if (existingEmail) {
          return reply.status(409).send({ error: 'Email already registered' });
        }
      }

      // Hash password and create user
      const hashedPassword = await hashPassword(password);
      const result = createUser(username, hashedPassword, email || null, 'user');
      saveDb();

      const userId = result.lastInsertRowid;

      // Generate authentication token
      const token = generateToken(fastify, userId, username, 'user');

      return {
        token,
        user: {
          id: userId,
          username: username,
          email: email || null,
          role: 'user',
        },
      };
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({ error: 'Invalid input', details: error.errors });
      }
      console.error('Signup error:', error);
      return reply.status(500).send({ error: 'Failed to create account' });
    }
  });

  /**
   * POST /login
   * Authenticates a user and returns a JWT token
   * @returns JWT token and user information
   */
  fastify.post('/login', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { username, password } = loginSchema.parse(request.body);

      // Find user by username
      const user = getUserByUsername(username);
      if (!user) {
        return reply.status(401).send({ error: 'Invalid credentials' });
      }

      // Verify password
      const validPassword = await verifyPassword(password, user.password);
      if (!validPassword) {
        return reply.status(401).send({ error: 'Invalid credentials' });
      }

      // Generate authentication token
      const token = generateToken(fastify, user.id, user.username);

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

  /**
   * GET /verify
   * Verifies if the user's JWT token is valid
   * Requires authentication
   * @returns Validation status and user information
   */
  fastify.get('/verify', {
    preHandler: [(fastify as any).authenticate],
  }, async (request: FastifyRequest) => {
    return { valid: true, user: request.user };
  });

  /**
   * GET /profile
   * Retrieves the authenticated user's profile information
   * Requires authentication
   * @returns User profile data
   */
  fastify.get('/profile', {
    preHandler: [(fastify as any).authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const user: any = request.user;
    if (!user || !user.id) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }

    const dbUser = getUserProfile(user.id);
    return { user: dbUser };
  });

  /**
   * PUT /profile
   * Updates the authenticated user's profile information
   * Requires authentication
   * @returns Success message
   */
  fastify.put('/profile', {
    preHandler: [(fastify as any).authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const data = updateProfileSchema.parse(request.body);
      const user: any = request.user;
      
      if (!user || !user.id) {
        return reply.status(401).send({ error: 'Unauthorized' });
      }

      fastify.log.info({ msg: 'Profile update request', userId: user.id, body: data });

      // Build updates object for fields that have values
      const updates: Record<string, any> = {};

      // Check and add username if provided
      if (typeof data.username !== 'undefined' && data.username !== null && data.username !== '') {
        // Ensure username is not already taken by another user
        const existing = db
          .prepare('SELECT id FROM users WHERE username = ? AND id != ?')
          .get(data.username, user.id);
        
        if (existing) {
          return reply.status(400).send({ error: 'Username already taken' });
        }
        
        updates.username = data.username;
      }

      // Add email if provided
      if (typeof data.email !== 'undefined' && data.email !== null && data.email !== '') {
        updates.email = data.email;
      }

      // Add avatar URL if provided
      if (typeof data.avatar_url !== 'undefined' && data.avatar_url !== null && data.avatar_url !== '') {
        updates.avatar_url = data.avatar_url;
      }

      // Apply updates if any fields were changed
      if (Object.keys(updates).length > 0) {
        updateUserProfile(user.id, updates);
      }

      return { message: 'Profile updated successfully' };
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({ error: 'Invalid input', details: error.errors });
      }
      throw error;
    }
  });

  /**
   * POST /change-password
   * Changes the authenticated user's password
   * Requires authentication and current password verification
   * @returns Success message
   */
  fastify.post('/change-password', {
    preHandler: [(fastify as any).authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { currentPassword, newPassword } = changePasswordSchema.parse(request.body);
      const user: any = request.user;

      // Retrieve user with password hash
      const dbUser = getUserByUsername(user.username);

      // Verify current password
      const validPassword = await verifyPassword(currentPassword, dbUser.password);
      if (!validPassword) {
        return reply.status(401).send({ error: 'Current password is incorrect' });
      }

      // Hash and update new password
      const hashedPassword = await hashPassword(newPassword);
      updateUserPassword(user.id, hashedPassword);

      return { message: 'Password changed successfully' };
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({ error: 'Invalid input', details: error.errors });
      }
      throw error;
    }
  });
}
