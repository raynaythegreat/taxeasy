-- Add 'i1040' to the entity_type CHECK constraint on the clients table.
-- SQLite does not support ALTER CONSTRAINT, so we recreate the table.

CREATE TABLE IF NOT EXISTS clients_new (
    id                    TEXT PRIMARY KEY,
    name                  TEXT NOT NULL,
    entity_type           TEXT NOT NULL CHECK (entity_type IN (
                              'sole_prop', 'smllc', 'scorp', 'ccorp', 'partnership', 'i1040'
                          )),
    ein_encrypted         BLOB,
    fiscal_year_start_month INTEGER NOT NULL DEFAULT 1 CHECK (fiscal_year_start_month BETWEEN 1 AND 12),
    accounting_method     TEXT NOT NULL DEFAULT 'cash' CHECK (accounting_method IN ('cash', 'accrual')),
    db_filename           TEXT NOT NULL UNIQUE,
    archived_at           TEXT,
    created_at            TEXT NOT NULL DEFAULT (datetime('now')),
    contact_name          TEXT,
    email                 TEXT,
    phone                 TEXT,
    address_line1         TEXT,
    address_line2         TEXT,
    city                  TEXT,
    state                 TEXT,
    postal_code           TEXT,
    country               TEXT,
    website               TEXT,
    tax_preparer_notes    TEXT,
    filing_notes          TEXT
);

INSERT OR IGNORE INTO clients_new SELECT * FROM clients;

DROP TABLE clients;

ALTER TABLE clients_new RENAME TO clients;

INSERT OR IGNORE INTO schema_migrations (version) VALUES (15);
