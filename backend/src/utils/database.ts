import initSqlJs, { Database as SqlJsDatabase } from 'sql.js';
import path from 'path';
import fs from 'fs';
import bcrypt from 'bcrypt';

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '../../deployer.db');

let db: SqlJsDatabase;
let sqlJsInstance: any;

async function initSqlJsDb() {
  const SQL = await initSqlJs();
  sqlJsInstance = SQL;
  
  if (fs.existsSync(DB_PATH)) {
    const buffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(buffer);
  } else {
    db = new SQL.Database();
  }
  
  return db;
}

// Save database to file
export function saveDb() {
  if (db) {
    try {
      const data = db.export();
      const buffer = Buffer.from(data);
      fs.writeFileSync(DB_PATH, buffer);
      console.log('✅ Database saved to disk:', DB_PATH);
    } catch (error) {
      console.error('❌ Failed to save database:', error);
    }
  } else {
    console.error('❌ Database not initialized, cannot save');
  }
}

// Wrapper functions for better-sqlite3 compatibility
export const dbWrapper = {
  exec: (sql: string) => {
    db.run(sql);
    saveDb();
  },
  prepare: (sql: string) => ({
    get: (...params: any[]) => {
      const stmt = db.prepare(sql);
      const cleaned = params.map(p => typeof p === 'undefined' ? null : p);
      stmt.bind(cleaned);
      const result = stmt.step() ? stmt.getAsObject() : null;
      stmt.free();
      return result;
    },
    all: (...params: any[]) => {
      const stmt = db.prepare(sql);
      const cleaned = params.map(p => typeof p === 'undefined' ? null : p);
      stmt.bind(cleaned);
      const results: any[] = [];
      while (stmt.step()) {
        results.push(stmt.getAsObject());
      }
      stmt.free();
      return results;
    },
    run: (...params: any[]) => {
      console.log('🔹 Database run:', sql.substring(0, 100));
      const stmt = db.prepare(sql);
      const cleaned = params.map(p => typeof p === 'undefined' ? null : p);
      stmt.bind(cleaned);
      stmt.step();
      stmt.free();
      
      console.log('🔹 Calling saveDb after query execution...');
      saveDb();
      
      // Get last insert rowid for INSERT statements
      let lastInsertRowid = null;
      if (sql.trim().toUpperCase().startsWith('INSERT')) {
        const idStmt = db.prepare('SELECT last_insert_rowid() as id');
        if (idStmt.step()) {
          const result = idStmt.getAsObject();
          lastInsertRowid = result.id;
        }
        idStmt.free();
      }
      
      return { 
        changes: 1,
        lastInsertRowid 
      };
    }
  }),
  pragma: (sql: string) => {
    // sql.js doesn't support all pragmas, skip some
    if (!sql.includes('journal_mode')) {
      db.run(`PRAGMA ${sql}`);
    }
  }
};

export { db };

export async function initDatabase() {
  await initSqlJsDb();
  
  // Enable WAL mode for better performance (skipped in sql.js)
  dbWrapper.pragma('journal_mode = WAL');

  // Create users table
  dbWrapper.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      email TEXT,
      avatar_url TEXT,
      oauth_provider TEXT,
      oauth_token TEXT,
      oauth_refresh_token TEXT,
      oauth_expires_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Create projects table
  dbWrapper.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      display_name TEXT NOT NULL,
      path TEXT NOT NULL,
      start_command TEXT NOT NULL,
      port INTEGER,
      env_vars TEXT,
      pm2_name TEXT NOT NULL,
      status TEXT DEFAULT 'stopped',
      deploy_method TEXT DEFAULT 'zip',
      git_url TEXT,
      git_branch TEXT,
      install_command TEXT DEFAULT 'npm install',
      build_command TEXT,
      webhook_secret TEXT,
      last_commit TEXT,
      last_deployed_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Create deployment history table
  dbWrapper.exec(`
    CREATE TABLE IF NOT EXISTS deployments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL,
      version TEXT,
      deployed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      status TEXT DEFAULT 'success',
      notes TEXT,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    )
  `);

  // Create domains table for SSL bindings
  dbWrapper.exec(`
    CREATE TABLE IF NOT EXISTS domains (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL,
      domain TEXT NOT NULL,
      cert_path TEXT,
      key_path TEXT,
      expires_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    )
  `);

  // Create default admin user if not exists
  const adminExists = dbWrapper.prepare('SELECT id FROM users WHERE username = ?').get('admin');
  
  if (!adminExists) {
    const hashedPassword = bcrypt.hashSync(
      process.env.ADMIN_PASSWORD || 'admin123',
      10
    );
    
    dbWrapper.prepare('INSERT INTO users (username, password) VALUES (?, ?)').run(
      process.env.ADMIN_USERNAME || 'admin',
      hashedPassword
    );
    
    console.log('✅ Default admin user created');
    console.log(`   Username: ${process.env.ADMIN_USERNAME || 'admin'}`);
    console.log(`   Password: ${process.env.ADMIN_PASSWORD || 'admin123'}`);
    console.log('   ⚠️  CHANGE PASSWORD IMMEDIATELY IN PRODUCTION!\n');
  }
}

export interface User {
  id: number;
  username: string;
  password: string;
  email?: string;
  avatar_url?: string;
  oauth_provider?: string;
  oauth_token?: string;
  oauth_refresh_token?: string;
  oauth_expires_at?: string;
  created_at: string;
}

export interface Project {
  id: number;
  name: string;
  display_name: string;
  path: string;
  start_command: string;
  port?: number;
  env_vars?: string;
  pm2_name: string;
  status: string;
  deploy_method?: string;
  git_url?: string;
  git_branch?: string;
  install_command?: string;
  build_command?: string;
  webhook_secret?: string;
  last_commit?: string;
  last_deployed_at?: string;
  created_at: string;
  updated_at: string;
}

export interface Deployment {
  id: number;
  project_id: number;
  version?: string;
  deployed_at: string;
  status: string;
  notes?: string;
}

export default db;
