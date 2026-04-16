-- Add status column to transactions for draft/posted/void lifecycle.
-- Default 'posted' preserves backward compatibility for all existing rows.
-- Applied via ClientDb::run_migrations() in client_db.rs.

ALTER TABLE transactions ADD COLUMN status TEXT NOT NULL DEFAULT 'posted'
    CHECK (status IN ('draft', 'posted', 'void'));

CREATE INDEX IF NOT EXISTS idx_txn_status ON transactions(status);

INSERT OR IGNORE INTO schema_migrations (version) VALUES (6);
