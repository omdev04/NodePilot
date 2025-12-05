import fs from 'fs/promises';
import path from 'path';

/**
 * Patterns to detect hardcoded port in code
 */
const PORT_PATTERNS = [
  // Express/Connect style
  /app\.listen\s*\(\s*(\d+)/g,
  /server\.listen\s*\(\s*(\d+)/g,
  
  // HTTP server style
  /\.listen\s*\(\s*(\d+)/g,
  
  // Port constant
  /const\s+PORT\s*=\s*(\d+)/g,
  /let\s+PORT\s*=\s*(\d+)/g,
  /var\s+PORT\s*=\s*(\d+)/g,
];

/**
 * Check if file contains hardcoded port
 */
export async function hasHardcodedPort(filePath: string): Promise<boolean> {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    
    // Check if already using process.env.PORT
    if (content.includes('process.env.PORT')) {
      return false;
    }
    
    // Check for hardcoded ports
    for (const pattern of PORT_PATTERNS) {
      if (pattern.test(content)) {
        return true;
      }
    }
    
    return false;
  } catch (error) {
    return false;
  }
}

/**
 * Patch entry file to use environment PORT variable
 */
export async function patchEntryFile(projectPath: string, entryFile: string): Promise<boolean> {
  const filePath = path.join(projectPath, entryFile);
  
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    
    // Skip if already using process.env.PORT
    if (content.includes('process.env.PORT')) {
      console.log(`✅ ${entryFile} already uses process.env.PORT`);
      return false;
    }
    
    let modified = false;
    let patchedContent = content;
    
    // Pattern 1: Replace app.listen(3000) with app.listen(process.env.PORT || 3000)
    const listenPattern = /(app|server)\.listen\s*\(\s*(\d+)/g;
    if (listenPattern.test(content)) {
      patchedContent = content.replace(
        listenPattern,
        (match, obj, port) => `${obj}.listen(process.env.PORT || ${port}`
      );
      modified = true;
    }
    
    // Pattern 2: Replace const PORT = 3000 with const PORT = process.env.PORT || 3000
    const constPattern = /(const|let|var)\s+(PORT|port)\s*=\s*(\d+)/g;
    if (constPattern.test(content)) {
      patchedContent = patchedContent.replace(
        constPattern,
        (match, keyword, varName, port) => `${keyword} ${varName} = process.env.PORT || ${port}`
      );
      modified = true;
    }
    
    if (modified) {
      // Create backup
      await fs.writeFile(filePath + '.backup', content, 'utf-8');
      
      // Write patched content
      await fs.writeFile(filePath, patchedContent, 'utf-8');
      
      console.log(`✅ Patched ${entryFile} to use process.env.PORT`);
      console.log(`📦 Backup saved as ${entryFile}.backup`);
      return true;
    }
    
    return false;
  } catch (error) {
    console.error(`❌ Failed to patch ${entryFile}:`, error);
    return false;
  }
}

/**
 * Auto-detect and patch entry file
 */
export async function autoPatchProject(projectPath: string, startCommand: string): Promise<void> {
  console.log(`🔍 Checking for hardcoded ports in: ${startCommand}`);
  
  // Extract entry file from start command
  // Examples: "node server.js", "node src/index.js", "npm start"
  const match = startCommand.match(/node\s+([^\s]+\.js)/);
  if (!match) {
    console.log(`ℹ️  Could not extract entry file from: ${startCommand}`);
    return;
  }
  
  const entryFile = match[1];
  console.log(`🔍 Analyzing entry file: ${entryFile}`);
  
  const filePath = path.join(projectPath, entryFile);
  const hasHardcoded = await hasHardcodedPort(filePath);
  
  if (hasHardcoded) {
    console.log(`⚠️  Detected hardcoded port in ${entryFile}, patching...`);
    await patchEntryFile(projectPath, entryFile);
  } else {
    console.log(`✅ No hardcoded port found in ${entryFile}`);
  }
}
