-- Add OAuth columns to users table for GitHub/GitLab/Bitbucket integration

-- Check if columns already exist and add them if they don't
ALTER TABLE users ADD COLUMN oauth_provider TEXT;
ALTER TABLE users ADD COLUMN oauth_token TEXT;
ALTER TABLE users ADD COLUMN oauth_refresh_token TEXT;
ALTER TABLE users ADD COLUMN oauth_expires_at DATETIME;
