CREATE TABLE IF NOT EXISTS mileage_logs (
    id TEXT PRIMARY KEY,
    client_id TEXT NOT NULL,
    date TEXT NOT NULL,
    purpose TEXT NOT NULL,
    origin TEXT NOT NULL,
    destination TEXT NOT NULL,
    miles_real REAL NOT NULL,
    rate_cents INTEGER NOT NULL,
    deduction_cents INTEGER NOT NULL,
    notes TEXT,
    receipt_image_path TEXT,
    created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_mileage_date ON mileage_logs(date);
CREATE INDEX IF NOT EXISTS idx_mileage_client ON mileage_logs(client_id);

INSERT OR IGNORE INTO schema_migrations (version) VALUES (18);
