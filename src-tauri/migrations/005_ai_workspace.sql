CREATE TABLE IF NOT EXISTS evidence (
    id TEXT PRIMARY KEY,
    client_id TEXT NOT NULL,
    source_type TEXT NOT NULL CHECK(source_type IN ('document', 'chat')),
    source_file_name TEXT,
    source_file_hash TEXT,
    source_file_path TEXT,
    ocr_raw_text TEXT,
    extracted_fields TEXT,
    model_used TEXT NOT NULL,
    confidence_score REAL,
    created_at TEXT NOT NULL DEFAULT(datetime('now')),
    updated_at TEXT NOT NULL DEFAULT(datetime('now'))
);

CREATE TABLE IF NOT EXISTS draft_transactions (
    id TEXT PRIMARY KEY,
    client_id TEXT NOT NULL,
    evidence_id TEXT NOT NULL REFERENCES evidence(id),
    date TEXT,
    description TEXT,
    reference TEXT,
    debit_account_id TEXT,
    credit_account_id TEXT,
    amount INTEGER,
    notes TEXT,
    status TEXT NOT NULL DEFAULT('pending') CHECK(status IN ('pending', 'approved', 'rejected')),
    created_at TEXT NOT NULL DEFAULT(datetime('now')),
    updated_at TEXT NOT NULL DEFAULT(datetime('now'))
);

CREATE TABLE IF NOT EXISTS chat_messages (
    id TEXT PRIMARY KEY,
    client_id TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('user', 'assistant', 'system')),
    content TEXT NOT NULL,
    evidence_id TEXT,
    created_at TEXT NOT NULL DEFAULT(datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_evidence_client ON evidence(client_id);
CREATE INDEX IF NOT EXISTS idx_draft_evidence ON draft_transactions(evidence_id);
CREATE INDEX IF NOT EXISTS idx_draft_status ON draft_transactions(status);
CREATE INDEX IF NOT EXISTS idx_chat_client ON chat_messages(client_id);
CREATE INDEX IF NOT EXISTS idx_chat_created ON chat_messages(created_at);

INSERT OR IGNORE INTO schema_migrations (version) VALUES (5);
