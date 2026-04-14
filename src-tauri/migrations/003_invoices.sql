CREATE TABLE IF NOT EXISTS invoices (
    id            TEXT PRIMARY KEY,
    invoice_number TEXT NOT NULL,
    invoice_type  TEXT NOT NULL CHECK (invoice_type IN ('invoice', 'receipt', 'estimate')),
    status        TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'paid', 'overdue', 'cancelled')),
    issue_date    TEXT NOT NULL,
    due_date      TEXT,
    client_name   TEXT NOT NULL,
    client_email  TEXT,
    client_address TEXT,
    notes         TEXT,
    subtotal_cents INTEGER NOT NULL DEFAULT 0,
    tax_rate      REAL NOT NULL DEFAULT 0.0,
    tax_cents     INTEGER NOT NULL DEFAULT 0,
    total_cents   INTEGER NOT NULL DEFAULT 0,
    transaction_id TEXT REFERENCES transactions(id) ON DELETE SET NULL,
    created_at    TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at    TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE (invoice_number)
);

CREATE TABLE IF NOT EXISTS invoice_lines (
    id           TEXT PRIMARY KEY,
    invoice_id   TEXT NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
    description  TEXT NOT NULL,
    quantity     REAL NOT NULL DEFAULT 1,
    unit_price_cents INTEGER NOT NULL DEFAULT 0,
    total_cents  INTEGER NOT NULL DEFAULT 0,
    sort_order   INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_invoices_type ON invoices(invoice_type);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status);
CREATE INDEX IF NOT EXISTS idx_invoices_date ON invoices(issue_date);
CREATE INDEX IF NOT EXISTS idx_invoice_lines_invoice ON invoice_lines(invoice_id);

INSERT OR IGNORE INTO schema_migrations (version) VALUES (3);
