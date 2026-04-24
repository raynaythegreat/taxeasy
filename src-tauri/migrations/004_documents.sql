CREATE TABLE IF NOT EXISTS documents (
    id          TEXT PRIMARY KEY,
    file_name   TEXT NOT NULL,
    file_path   TEXT NOT NULL,
    file_size   INTEGER NOT NULL DEFAULT 0,
    mime_type   TEXT NOT NULL DEFAULT 'application/octet-stream',
    file_hash   TEXT,
    category    TEXT NOT NULL DEFAULT 'general',
    tax_year    INTEGER,
    description TEXT,
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT OR IGNORE INTO schema_migrations (version) VALUES (4);
