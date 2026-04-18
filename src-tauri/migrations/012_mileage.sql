-- IRS mileage rates reference table (replicated per client DB for simplicity)
CREATE TABLE irs_mileage_rates (
    year           INTEGER PRIMARY KEY,
    rate_cents     INTEGER NOT NULL,
    effective_date TEXT NOT NULL,
    notes          TEXT
);

INSERT INTO irs_mileage_rates (year, rate_cents, effective_date, notes) VALUES
    (2023, 65, '2023-01-01', '65.5 cents/mile'),
    (2024, 67, '2024-01-01', '67 cents/mile'),
    (2025, 65, '2025-01-01', '65.5 cents/mile'),
    (2026, 70, '2026-01-01', '70 cents/mile');

-- Mileage logs table
-- Note: client_id is a text field tracking which client owns this log.
-- No FK constraint to clients table — client DBs are standalone (clients table only exists in app_db).
CREATE TABLE mileage_logs (
    id             TEXT PRIMARY KEY,
    client_id      TEXT NOT NULL,
    date           TEXT NOT NULL,
    purpose        TEXT NOT NULL,
    origin         TEXT NOT NULL,
    destination    TEXT NOT NULL,
    miles_real     REAL NOT NULL,
    rate_cents     INTEGER NOT NULL,
    deduction_cents INTEGER NOT NULL,  -- Computed: miles * rate / 100
    notes          TEXT,
    receipt_image_path TEXT,
    created_at     TEXT DEFAULT (datetime('now'))
);

CREATE INDEX idx_mileage_date ON mileage_logs(date);
CREATE INDEX idx_mileage_client ON mileage_logs(client_id);

INSERT OR IGNORE INTO schema_migrations (version) VALUES (12);
