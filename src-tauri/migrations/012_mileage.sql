-- IRS mileage rates reference table
CREATE TABLE irs_mileage_rates (
    year           INTEGER PRIMARY KEY,
    rate_cents     INTEGER NOT NULL,  -- e.g., 6550 = 65.5 cents/mile
    effective_date TEXT NOT NULL,     -- YYYY-MM-DD
    notes          TEXT
);

-- Pre-populate with known IRS rates
INSERT INTO irs_mileage_rates (year, rate_cents, effective_date, notes) VALUES
    (2023, 6550, '2023-01-01', '65.5 cents/mile'),
    (2024, 6700, '2024-01-01', '67 cents/mile'),
    (2025, 6550, '2025-01-01', '65.5 cents/mile'),
    (2026, 7000, '2026-01-01', '70 cents/mile');

-- Mileage logs table
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
    created_at     TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (client_id) REFERENCES clients(id)
);

CREATE INDEX idx_mileage_date ON mileage_logs(date);
CREATE INDEX idx_mileage_client ON mileage_logs(client_id);
