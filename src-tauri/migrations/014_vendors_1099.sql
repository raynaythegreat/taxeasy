-- Vendors (contractors, not employees)
CREATE TABLE vendors (
    id              TEXT PRIMARY KEY,
    client_id       TEXT NOT NULL,
    name            TEXT NOT NULL,
    ein             TEXT,                    -- Business EIN (if has one)
    ssn_encrypted   BLOB,                    -- AES-256-GCM encrypted SSN
    address_line1   TEXT,
    address_line2   TEXT,
    city            TEXT,
    state           TEXT,
    postal_code     TEXT,
    phone           TEXT,
    email           TEXT,
    total_payments_cents INTEGER DEFAULT 0,  -- Cached total for quick lookup
    is_1099_required INTEGER DEFAULT 0,      -- True if EIN/SSN provided
    created_at      TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (client_id) REFERENCES clients(id)
);

-- Track individual payments to contractors
CREATE TABLE contractor_payments (
    id              TEXT PRIMARY KEY,
    vendor_id       TEXT NOT NULL,
    transaction_id  TEXT NOT NULL,
    amount_cents    INTEGER NOT NULL,
    payment_date    TEXT NOT NULL,
    created_at      TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (vendor_id) REFERENCES vendors(id),
    FOREIGN KEY (transaction_id) REFERENCES transactions(id)
);

-- Generated 1099-NEC forms (audit trail)
CREATE TABLE generated_1099_nec (
    id              TEXT PRIMARY KEY,
    vendor_id       TEXT NOT NULL,
    tax_year        INTEGER NOT NULL,
    box1_nonemployee_compensation INTEGER NOT NULL,
    box2_cash_received            INTEGER DEFAULT 0,
    box4_federal_tax_withheld     INTEGER DEFAULT 0,
    box5_state_tax_withheld       INTEGER DEFAULT 0,
    box6_state_number             TEXT,
    generated_at                  TEXT DEFAULT (datetime('now')),
    pdf_path                      TEXT,
    FOREIGN KEY (vendor_id) REFERENCES vendors(id),
    UNIQUE(vendor_id, tax_year)
);

CREATE INDEX idx_vendors_client ON vendors(client_id);
CREATE INDEX idx_contractor_payments_vendor ON contractor_payments(vendor_id);
CREATE INDEX idx_contractor_payments_date ON contractor_payments(payment_date);
CREATE INDEX idx_1099_nec_vendor ON generated_1099_nec(vendor_id);
CREATE INDEX idx_1099_nec_year ON generated_1099_nec(tax_year);
