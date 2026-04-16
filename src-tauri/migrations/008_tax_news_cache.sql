-- Tax news cache — stores fetched IRS RSS items in the app-level database.
-- Keyed by a stable sha256 hash of source+url so upserts are idempotent.

CREATE TABLE IF NOT EXISTS tax_news_cache (
    id           TEXT PRIMARY KEY,          -- sha256(source||url), hex-encoded
    source       TEXT NOT NULL,             -- "IRS Newsroom" | "IRS Tax Tips"
    title        TEXT NOT NULL,
    summary      TEXT,
    published_at TEXT,                      -- ISO 8601
    url          TEXT NOT NULL,
    categories   TEXT,                      -- JSON array serialised as TEXT
    fetched_at   TEXT NOT NULL              -- ISO 8601, when this row was written
);

INSERT OR IGNORE INTO schema_migrations (version) VALUES (7);
