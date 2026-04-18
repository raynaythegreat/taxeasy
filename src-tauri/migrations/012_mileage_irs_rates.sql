-- IRS mileage rates reference table (shared across all clients)
CREATE TABLE irs_mileage_rates (
    year           INTEGER PRIMARY KEY,
    rate_cents     INTEGER NOT NULL,  -- e.g., 6700 = 67.0 cents/mile
    effective_date TEXT NOT NULL,     -- YYYY-MM-DD
    notes          TEXT
);

-- Pre-populate with known IRS rates (rate_cents = actual cents, e.g., 67 = 67 cents/mile)
INSERT INTO irs_mileage_rates (year, rate_cents, effective_date, notes) VALUES
    (2023, 65, '2023-01-01', '65.5 cents/mile'),
    (2024, 67, '2024-01-01', '67 cents/mile'),
    (2025, 65, '2025-01-01', '65.5 cents/mile'),
    (2026, 70, '2026-01-01', '70 cents/mile');

INSERT OR IGNORE INTO schema_migrations (version) VALUES (12);
