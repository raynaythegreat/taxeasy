-- App-level database (stores client registry, app settings)
-- Runs against ~/Library/Application Support/Taxeasy/app.db

CREATE TABLE IF NOT EXISTS schema_migrations (
    version   INTEGER PRIMARY KEY,
    applied_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS clients (
    id                    TEXT PRIMARY KEY,          -- UUID v4
    name                  TEXT NOT NULL,
    entity_type           TEXT NOT NULL CHECK (entity_type IN (
                              'sole_prop', 'smllc', 'scorp', 'ccorp', 'partnership'
                          )),
    ein_encrypted         BLOB,                      -- AES-256-GCM ciphertext + nonce
    fiscal_year_start_month INTEGER NOT NULL DEFAULT 1 CHECK (fiscal_year_start_month BETWEEN 1 AND 12),
    accounting_method     TEXT NOT NULL DEFAULT 'cash' CHECK (accounting_method IN ('cash', 'accrual')),
    db_filename           TEXT NOT NULL UNIQUE,      -- basename only, e.g. "<uuid>.db"
    archived_at           TEXT,                      -- NULL = active
    created_at            TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS app_settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

INSERT OR IGNORE INTO schema_migrations (version) VALUES (1);
