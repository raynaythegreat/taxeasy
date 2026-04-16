-- Recurring transaction schedules.
-- Applied via ClientDb::run_migrations() in client_db.rs.

CREATE TABLE IF NOT EXISTS recurring_transactions (
    id TEXT PRIMARY KEY,
    client_id TEXT NOT NULL,
    description TEXT NOT NULL,
    amount_cents INTEGER NOT NULL,
    debit_account_id TEXT NOT NULL,
    credit_account_id TEXT NOT NULL,
    frequency TEXT NOT NULL CHECK (frequency IN ('weekly', 'monthly', 'quarterly', 'yearly')),
    start_date TEXT NOT NULL,
    next_run_date TEXT NOT NULL,
    end_date TEXT,
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_recurring_next_run ON recurring_transactions(next_run_date);
CREATE INDEX IF NOT EXISTS idx_recurring_active ON recurring_transactions(active);

INSERT OR IGNORE INTO schema_migrations (version) VALUES (10);
