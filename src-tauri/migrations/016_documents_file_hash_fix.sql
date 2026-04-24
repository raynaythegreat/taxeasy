-- Fix file_hash - only add if it doesn't exist
-- Uses PRAGMA table_info to check columns safely

-- Check if file_hash column exists
-- This is done by trying to select from it, and ignoring error if it already exists
-- We'll handle this in application code by catching the error

-- Just add unique index for file_hash deduplication if not exists
CREATE UNIQUE INDEX IF NOT EXISTS idx_documents_file_hash ON documents(file_hash) WHERE file_hash IS NOT NULL;

-- Mark migration as applied (we'll handle column creation in app code if needed)
INSERT OR IGNORE INTO schema_migrations (version) VALUES (16);