const fs = require('fs');
const path = require('path');
const initSqlJs = require('sql.js');

async function runMigration() {
  console.log('🔄 Running RBAC schema migration...');

  const dbPath = path.join(__dirname, '../deployer.db');
  
  if (!fs.existsSync(dbPath)) {
    console.error('❌ Database file not found:', dbPath);
    process.exit(1);
  }

  // Load database
  const SQL = await initSqlJs();
  const buffer = fs.readFileSync(dbPath);
  const db = new SQL.Database(buffer);

  try {
    // Check if owner_id column already exists
    const tables = db.exec("PRAGMA table_info(projects)");
    const columns = tables[0]?.values || [];
    const hasOwnerId = columns.some(col => col[1] === 'owner_id');

    if (hasOwnerId) {
      console.log('✅ RBAC schema already exists. Skipping migration.');
      return;
    }

    console.log('📝 Adding owner_id column to projects table...');
    
    // Step 1: Add owner_id column (nullable first)
    db.run('ALTER TABLE projects ADD COLUMN owner_id INTEGER');
    
    // Step 2: Get the first user as default owner (don't check role yet)
    const adminResult = db.exec("SELECT id FROM users ORDER BY id LIMIT 1");
    let defaultOwnerId = 1;
    
    if (adminResult.length > 0 && adminResult[0].values.length > 0) {
      defaultOwnerId = adminResult[0].values[0][0];
      console.log(`✅ Using user ID ${defaultOwnerId} as default owner`);
    } else {
      console.log('⚠️  No admin user found, using ID 1 as default owner');
    }
    
    // Step 3: Set owner_id for all existing projects
    db.run(`UPDATE projects SET owner_id = ${defaultOwnerId} WHERE owner_id IS NULL`);
    console.log('✅ Updated existing projects with owner_id');

    // Step 4: Add role column to users table if not exists
    const userTables = db.exec("PRAGMA table_info(users)");
    const userColumns = userTables[0]?.values || [];
    const hasRole = userColumns.some(col => col[1] === 'role');
    
    if (!hasRole) {
      console.log('📝 Adding role column to users table...');
      db.run("ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'user'");
      db.run("UPDATE users SET role = 'admin' WHERE id = 1");
      console.log('✅ Added role column to users');
    }

    // Step 5: Create project_members table
    console.log('📝 Creating project_members table...');
    db.run(`
      CREATE TABLE IF NOT EXISTS project_members (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        project_id INTEGER NOT NULL,
        user_id INTEGER NOT NULL,
        role TEXT NOT NULL CHECK(role IN ('owner', 'admin', 'developer', 'viewer')),
        invited_by INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (invited_by) REFERENCES users(id),
        UNIQUE(project_id, user_id)
      )
    `);
    console.log('✅ Created project_members table');

    // Step 6: Create invitations table
    console.log('📝 Creating invitations table...');
    db.run(`
      CREATE TABLE IF NOT EXISTS invitations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        project_id INTEGER NOT NULL,
        email TEXT NOT NULL,
        role TEXT NOT NULL CHECK(role IN ('admin', 'developer', 'viewer')),
        token TEXT NOT NULL UNIQUE,
        invited_by INTEGER NOT NULL,
        status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'accepted', 'expired')),
        expires_at DATETIME NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
        FOREIGN KEY (invited_by) REFERENCES users(id)
      )
    `);
    console.log('✅ Created invitations table');

    // Step 7: Add owners as members for all existing projects
    console.log('📝 Adding owners as members in project_members...');
    const projects = db.exec('SELECT id, owner_id FROM projects');
    if (projects.length > 0 && projects[0].values.length > 0) {
      for (const [projectId, ownerId] of projects[0].values) {
        try {
          db.run(
            `INSERT OR IGNORE INTO project_members (project_id, user_id, role, invited_by) 
             VALUES (?, ?, 'owner', ?)`,
            [projectId, ownerId, ownerId]
          );
        } catch (err) {
          console.warn(`⚠️  Could not add owner for project ${projectId}:`, err.message);
        }
      }
      console.log('✅ Added owners as members for existing projects');
    }

    // Save database
    const data = db.export();
    fs.writeFileSync(dbPath, data);
    db.close();

    console.log('✅ RBAC migration completed successfully!');
    console.log('');
    console.log('📊 Summary:');
    console.log('  - Added owner_id column to projects');
    console.log('  - Added role column to users');
    console.log('  - Created project_members table');
    console.log('  - Created invitations table');
    console.log('  - Migrated existing projects with default owner');
    console.log('');
    console.log('🎉 You can now use team collaboration features!');

  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

runMigration().catch(err => {
  console.error('❌ Fatal error:', err);
  process.exit(1);
});
