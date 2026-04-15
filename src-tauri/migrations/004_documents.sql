CREATE TABLE IF NOT EXISTS documents (
    id            TEXT PRIMARY KEY,
    file_name     TEXT NOT NULL,
    file_path     TEXT NOT NULL,
    file_size     INTEGER NOT NULL DEFAULT 0,
    mime_type     TEXT NOT NULL DEFAULT '',
    category      TEXT NOT NULL DEFAULT 'general' CHECK (category IN ('general', 'w2', '1099', 'k1', 'receipt', 'bank_statement', 'tax_return', 'other')),
    tax_year      INTEGER,
    description   TEXT,
    created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_documents_category ON documents(category);
CREATE INDEX IF NOT EXISTS idx_documents_tax_year ON documents(tax_year);
CREATE INDEX IF NOT EXISTS idx_documents_created ON documents(created_at);

INSERT OR IGNORE INTO schema_migrations (version) VALUES (4);
