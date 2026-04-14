-- Per-client database schema
-- Applied to each ~/Library/Application Support/Taxeasy/clients/<uuid>.db

CREATE TABLE IF NOT EXISTS schema_migrations (
    version    INTEGER PRIMARY KEY,
    applied_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Chart of Accounts
CREATE TABLE IF NOT EXISTS accounts (
    id               TEXT PRIMARY KEY,
    code             TEXT NOT NULL,               -- e.g. "1010"
    name             TEXT NOT NULL,
    account_type     TEXT NOT NULL CHECK (account_type IN (
                         'asset', 'liability', 'equity', 'revenue', 'expense'
                     )),
    parent_id        TEXT REFERENCES accounts(id),
    schedule_c_line  TEXT,                        -- e.g. "line_8" (sole prop / SMLLC only)
    active           INTEGER NOT NULL DEFAULT 1,
    sort_order       INTEGER NOT NULL DEFAULT 0,
    UNIQUE (code)
);

-- Transaction headers (each must have balanced entries)
CREATE TABLE IF NOT EXISTS transactions (
    id           TEXT PRIMARY KEY,
    txn_date     TEXT NOT NULL,                   -- ISO-8601 date "YYYY-MM-DD"
    description  TEXT NOT NULL,
    reference    TEXT,                            -- check #, invoice #, etc.
    locked       INTEGER NOT NULL DEFAULT 0,      -- 1 = period-locked, cannot edit
    created_at   TEXT NOT NULL DEFAULT (datetime('now')),
    created_by   TEXT NOT NULL DEFAULT 'user'
);

-- Double-entry lines (debits = credits per transaction_id)
CREATE TABLE IF NOT EXISTS entries (
    id             TEXT PRIMARY KEY,
    transaction_id TEXT NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
    account_id     TEXT NOT NULL REFERENCES accounts(id),
    -- Stored in integer cents to avoid floating-point drift.
    -- Positive debit_cents means a debit on this account.
    -- Positive credit_cents means a credit.
    -- Exactly one of debit_cents / credit_cents is > 0; the other is 0.
    debit_cents    INTEGER NOT NULL DEFAULT 0 CHECK (debit_cents >= 0),
    credit_cents   INTEGER NOT NULL DEFAULT 0 CHECK (credit_cents >= 0),
    memo           TEXT
);

-- Balance is enforced at the application layer (create_transaction validates
-- debit sum == credit sum before any DB writes). SQLite triggers fire after
-- each individual entry INSERT, so a multi-entry transaction would always
-- fail on the first insert (debits != 0, credits == 0). Drop them if present.
DROP TRIGGER IF EXISTS trg_balanced_insert;
DROP TRIGGER IF EXISTS trg_balanced_update;

CREATE TRIGGER IF NOT EXISTS trg_locked_insert
BEFORE INSERT ON entries
BEGIN
    SELECT CASE
        WHEN (SELECT locked FROM transactions WHERE id = NEW.transaction_id) = 1
        THEN RAISE(ABORT, 'Cannot add entries to a locked transaction')
    END;
END;

CREATE TRIGGER IF NOT EXISTS trg_locked_update
BEFORE UPDATE ON entries
BEGIN
    SELECT CASE
        WHEN (SELECT locked FROM transactions WHERE id = NEW.transaction_id) = 1
        THEN RAISE(ABORT, 'Cannot edit entries in a locked transaction')
    END;
END;

-- Receipt attachments (linked to a transaction)
CREATE TABLE IF NOT EXISTS receipts (
    id            TEXT PRIMARY KEY,
    transaction_id TEXT REFERENCES transactions(id) ON DELETE SET NULL,
    file_path     TEXT NOT NULL,                  -- absolute path inside app data dir
    ocr_json      TEXT,                           -- raw JSON from GLM-OCR
    extracted_at  TEXT
);

-- Period locks (closing month/quarter/year)
CREATE TABLE IF NOT EXISTS periods (
    id         TEXT PRIMARY KEY,
    period_type TEXT NOT NULL CHECK (period_type IN ('month', 'quarter', 'year')),
    start_date TEXT NOT NULL,
    end_date   TEXT NOT NULL,
    locked_at  TEXT                               -- NULL = not yet locked
);

-- Immutable audit trail
CREATE TABLE IF NOT EXISTS audit_log (
    id          TEXT PRIMARY KEY,
    actor       TEXT NOT NULL DEFAULT 'user',
    action      TEXT NOT NULL CHECK (action IN ('create', 'update', 'delete', 'lock', 'unlock')),
    entity_type TEXT NOT NULL,
    entity_id   TEXT NOT NULL,
    before_json TEXT,
    after_json  TEXT,
    occurred_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_entries_txn ON entries(transaction_id);
CREATE INDEX IF NOT EXISTS idx_entries_acct ON entries(account_id);
CREATE INDEX IF NOT EXISTS idx_txn_date ON transactions(txn_date);
CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_log(entity_type, entity_id);

INSERT OR IGNORE INTO schema_migrations (version) VALUES (2);
