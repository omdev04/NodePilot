-- Git Deploy Feature Migration
-- Adds new columns to support Git-based deployments
-- Safe to run on existing NodePilot installations

-- Add deploy_method column (default to 'zip' for existing projects)
ALTER TABLE projects ADD COLUMN deploy_method TEXT DEFAULT 'zip';

-- Add Git-specific columns
ALTER TABLE projects ADD COLUMN git_url TEXT;
ALTER TABLE projects ADD COLUMN git_branch TEXT;
ALTER TABLE projects ADD COLUMN install_command TEXT DEFAULT 'npm install';
ALTER TABLE projects ADD COLUMN build_command TEXT;
ALTER TABLE projects ADD COLUMN webhook_secret TEXT;
ALTER TABLE projects ADD COLUMN last_commit TEXT;
ALTER TABLE projects ADD COLUMN last_deployed_at DATETIME;

-- Update existing projects to have deploy_method = 'zip'
UPDATE projects SET deploy_method = 'zip' WHERE deploy_method IS NULL;

-- Create index for faster Git queries
CREATE INDEX IF NOT EXISTS idx_projects_deploy_method ON projects(deploy_method);
CREATE INDEX IF NOT EXISTS idx_projects_git_url ON projects(git_url);

-- Display migration status
SELECT 
    'Migration complete!' as status,
    COUNT(*) as total_projects,
    SUM(CASE WHEN deploy_method = 'zip' THEN 1 ELSE 0 END) as zip_projects,
    SUM(CASE WHEN deploy_method = 'git' THEN 1 ELSE 0 END) as git_projects
FROM projects;
