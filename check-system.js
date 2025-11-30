#!/usr/bin/env node

/**
 * NodePilot System Check Script
 * Verifies all components are properly configured
 */

const fs = require('fs');
const path = require('path');

console.log('🔍 NodePilot System Check\n');
console.log('=' .repeat(50));

let allOk = true;

// Check Node.js version
console.log('\n📦 Node.js Version:');
console.log(`   ${process.version}`);
if (parseInt(process.version.slice(1).split('.')[0]) < 18) {
  console.log('   ⚠️  Warning: Node.js 18+ recommended');
  allOk = false;
} else {
  console.log('   ✅ OK');
}

// Check backend structure
console.log('\n📁 Backend Structure:');
const backendChecks = [
  'backend/package.json',
  'backend/.env',
  'backend/src/index.ts',
  'backend/src/utils/database.ts',
  'backend/src/routes/auth.ts',
  'backend/src/routes/projects.ts',
  'backend/src/services/pm2Service.ts',
  'backend/src/services/deploymentService.ts'
];

backendChecks.forEach(file => {
  const fullPath = path.join(__dirname, file);
  if (fs.existsSync(fullPath)) {
    console.log(`   ✅ ${file}`);
  } else {
    console.log(`   ❌ ${file} - MISSING`);
    allOk = false;
  }
});

// Check frontend structure
console.log('\n📁 Frontend Structure:');
const frontendChecks = [
  'frontend/package.json',
  'frontend/.env.local',
  'frontend/app/layout.tsx',
  'frontend/app/login/page.tsx',
  'frontend/app/dashboard/page.tsx',
  'frontend/lib/api.ts'
];

frontendChecks.forEach(file => {
  const fullPath = path.join(__dirname, file);
  if (fs.existsSync(fullPath)) {
    console.log(`   ✅ ${file}`);
  } else {
    console.log(`   ❌ ${file} - MISSING`);
    allOk = false;
  }
});

// Check node_modules (monorepo structure)
console.log('\n📦 Dependencies:');
const rootNodeModules = path.join(__dirname, 'node_modules');
if (fs.existsSync(rootNodeModules)) {
  console.log('   ✅ Dependencies installed (monorepo)');
  
  // Check for specific backend dependencies
  if (fs.existsSync(path.join(rootNodeModules, 'fastify'))) {
    console.log('   ✅ Backend dependencies available');
  } else {
    console.log('   ❌ Backend dependencies missing');
    allOk = false;
  }
  
  // Check for specific frontend dependencies
  if (fs.existsSync(path.join(rootNodeModules, 'next'))) {
    console.log('   ✅ Frontend dependencies available');
  } else {
    console.log('   ❌ Frontend dependencies missing');
    allOk = false;
  }
} else {
  console.log('   ❌ Dependencies NOT installed');
  console.log('      Run: npm install (from root directory)');
  allOk = false;
}

// Check backend package.json for correct dependencies
console.log('\n🔧 Backend Dependencies:');
const backendPkg = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'backend/package.json'), 'utf8')
);

if (backendPkg.dependencies['sql.js']) {
  console.log('   ✅ sql.js (Windows-compatible)');
} else if (backendPkg.dependencies['better-sqlite3']) {
  console.log('   ⚠️  better-sqlite3 (requires Visual Studio Build Tools on Windows)');
} else {
  console.log('   ❌ No SQLite library found');
  allOk = false;
}

if (backendPkg.dependencies['unzipper']) {
  console.log('   ✅ unzipper');
} else {
  console.log('   ❌ unzipper missing');
  allOk = false;
}

if (backendPkg.dependencies['pm2']) {
  console.log('   ✅ pm2');
} else {
  console.log('   ❌ pm2 missing');
  allOk = false;
}

// Check environment files
console.log('\n⚙️  Environment Configuration:');
const backendEnv = path.join(__dirname, 'backend/.env');
if (fs.existsSync(backendEnv)) {
  console.log('   ✅ backend/.env');
  const envContent = fs.readFileSync(backendEnv, 'utf8');
  if (envContent.includes('JWT_SECRET')) {
    console.log('   ✅ JWT_SECRET configured');
  } else {
    console.log('   ⚠️  JWT_SECRET not found in .env');
  }
} else {
  console.log('   ⚠️  backend/.env not found (will use defaults)');
}

const frontendEnv = path.join(__dirname, 'frontend/.env.local');
if (fs.existsSync(frontendEnv)) {
  console.log('   ✅ frontend/.env.local');
} else {
  console.log('   ⚠️  frontend/.env.local not found');
}

// Final status
console.log('\n' + '='.repeat(50));
if (allOk) {
  console.log('\n✅ All checks passed! System is ready to start.\n');
  console.log('🚀 Next steps:');
  console.log('   1. Terminal 1: cd backend && npm run dev');
  console.log('   2. Terminal 2: cd frontend && npm run dev');
  console.log('   3. Open: http://localhost:3000');
  console.log('   4. Login: admin / admin123\n');
} else {
  console.log('\n⚠️  Some issues found. Please fix them before starting.\n');
  process.exit(1);
}
