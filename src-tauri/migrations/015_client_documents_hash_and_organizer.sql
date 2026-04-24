-- Migration 15: Add file_hash dedup index only
-- Skips table creation/alter - handled elsewhere

-- Add unique index for file_hash deduplication (safe with IF NOT EXISTS)
CREATE UNIQUE INDEX IF NOT EXISTS idx_documents_file_hash ON documents(file_hash) WHERE file_hash IS NOT NULL;

INSERT OR IGNORE INTO schema_migrations (version) VALUES (15);