-- Add system_account_role to accounts for stable FK-based cash-flow matching.
-- Nullable: only the default-template accounts get a role; user-defined accounts remain NULL.
-- Allowed values mirror the roles used in cash_flow.rs.
-- Applied via ClientDb::run_migrations() in client_db.rs.

ALTER TABLE accounts ADD COLUMN system_account_role TEXT
    CHECK (system_account_role IS NULL OR system_account_role IN (
        'cash',
        'accounts_receivable',
        'accounts_payable',
        'equipment',
        'long_term_loans',
        'owners_draw'
    ));

CREATE INDEX IF NOT EXISTS idx_accounts_role ON accounts(system_account_role)
    WHERE system_account_role IS NOT NULL;

INSERT OR IGNORE INTO schema_migrations (version) VALUES (7);
