-- Add GitHub App installations table
CREATE TABLE IF NOT EXISTS github_installations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    installation_id INTEGER UNIQUE NOT NULL,
    account_name TEXT NOT NULL,
    account_type TEXT NOT NULL,
    installed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_installation_id ON github_installations(installation_id);
CREATE INDEX IF NOT EXISTS idx_account_name ON github_installations(account_name);
