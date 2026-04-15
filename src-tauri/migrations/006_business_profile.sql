-- App-level business profile (stores user's own business info)
-- Runs against ~/Library/Application Support/Taxeasy/app.db

CREATE TABLE IF NOT EXISTS business_profile (
    id                    TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),1,1) || '-' || substr('89ab', 1 + (abs(random()) % 4), 1) || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(6)))),
    name                  TEXT NOT NULL,
    entity_type           TEXT NOT NULL DEFAULT 'sole-prop' CHECK (entity_type IN (
                              'sole-prop', 'smllc', 'scorp', 'ccorp', 'partnership'
                          )),
    ein                   TEXT,
    contact_name          TEXT,
    email                 TEXT,
    phone                 TEXT,
    website               TEXT,
    address_line1         TEXT,
    address_line2         TEXT,
    city                  TEXT,
    state                 TEXT,
    postal_code           TEXT,
    country               TEXT DEFAULT 'USA',
    fiscal_year_start_month INTEGER NOT NULL DEFAULT 1 CHECK (fiscal_year_start_month BETWEEN 1 AND 12),
    accounting_method     TEXT NOT NULL DEFAULT 'cash' CHECK (accounting_method IN ('cash', 'accrual')),
    profile_image_path    TEXT,
    tax_preparer_notes    TEXT,
    filing_notes          TEXT,
    created_at            TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at            TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT OR IGNORE INTO schema_migrations (version) VALUES (6);