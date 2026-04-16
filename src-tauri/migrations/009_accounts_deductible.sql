-- Migration 009: add deductible flag to accounts
-- Half of deductible expenses tracking (C4).

ALTER TABLE accounts ADD COLUMN deductible INTEGER NOT NULL DEFAULT 0;

INSERT OR IGNORE INTO schema_migrations (version) VALUES (9);
