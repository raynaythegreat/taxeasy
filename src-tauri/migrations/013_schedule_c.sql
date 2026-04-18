-- COA to Schedule C line mappings (per-client overrides allowed)
-- Note: client_id is a text field tracking which client owns this mapping.
-- No FK constraint to accounts table — client DBs are standalone.
CREATE TABLE coa_schedule_c_mappings (
    id              TEXT PRIMARY KEY,
    client_id       TEXT NOT NULL,
    account_id      TEXT NOT NULL,
    schedule_c_line TEXT NOT NULL,  -- e.g., "line_1", "line_8", "line_24b"
    is_custom       INTEGER DEFAULT 0,  -- 1 = client override, 0 = default
    created_at      TEXT DEFAULT (datetime('now')),
    UNIQUE(client_id, account_id)
);

CREATE INDEX idx_schedule_c_account ON coa_schedule_c_mappings(account_id);
CREATE INDEX idx_schedule_c_client ON coa_schedule_c_mappings(client_id);

-- Default mappings for sole proprietorships (to be seeded programmatically)
-- These are reference data - actual mappings are per-client
CREATE TABLE schedule_c_default_mappings (
    id              TEXT PRIMARY KEY,
    coa_pattern     TEXT NOT NULL,      -- e.g., "Income:Sales", "Expense:Meals"
    schedule_c_line TEXT NOT NULL,      -- e.g., "line_1", "line_24b"
    description     TEXT,               -- Human-readable description
    apply_limit     TEXT,               -- e.g., "0.5" for 50% meals limit
    UNIQUE(coa_pattern, schedule_c_line)
);

-- Seed default mappings
INSERT INTO schedule_c_default_mappings (coa_pattern, schedule_c_line, description, apply_limit) VALUES
    ('Income:Sales', 'line_1', 'Gross Receipts', NULL),
    ('Income:Returns', 'line_2', 'Returns and Allowances', NULL),
    ('COGS', 'line_4', 'Cost of Goods Sold', NULL),
    ('Income:Other', 'line_6', 'Other Income', NULL),
    ('Expense:Advertising', 'line_8', 'Advertising', NULL),
    ('Expense:Auto', 'line_9', 'Car and Truck', NULL),
    ('Expense:Commissions', 'line_10', 'Commissions and Fees', NULL),
    ('Expense:Depreciation', 'line_12', 'Depreciation', NULL),
    ('Expense:Interest', 'line_16a', 'Interest and Mortgages', NULL),
    ('Expense:Legal', 'line_17', 'Legal and Professional Services', NULL),
    ('Expense:Accounting', 'line_17', 'Legal and Professional Services', NULL),
    ('Expense:Office', 'line_18', 'Office Expense', NULL),
    ('Expense:Supplies', 'line_18', 'Office Expense', NULL),
    ('Expense:Rent:Equipment', 'line_20a', 'Rent or Lease - Equipment', NULL),
    ('Expense:Rent:Office', 'line_20b', 'Rent or Lease - Other Business Property', NULL),
    ('Expense:Repairs', 'line_21', 'Repairs and Maintenance', NULL),
    ('Expense:Materials', 'line_22', 'Supplies and Materials', NULL),
    ('Expense:Taxes', 'line_23', 'Taxes and Licenses', NULL),
    ('Expense:Licenses', 'line_23', 'Taxes and Licenses', NULL),
    ('Expense:Travel', 'line_24a', 'Travel', NULL),
    ('Expense:Meals', 'line_24b', 'Meals and Entertainment', '0.5'),
    ('Expense:Utilities', 'line_25', 'Utilities', NULL),
    ('Expense:Wages', 'line_26', 'Wages and Salaries', NULL),
    ('Expense:Salaries', 'line_26', 'Wages and Salaries', NULL),
    ('Expense:Benefits', 'line_27', 'Employee Benefit Programs', NULL),
    ('Expense:Other', 'line_30', 'Other Expenses', NULL);

INSERT OR IGNORE INTO schema_migrations (version) VALUES (13);
