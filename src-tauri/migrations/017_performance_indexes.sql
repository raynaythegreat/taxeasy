CREATE INDEX IF NOT EXISTS idx_chat_messages_client_id ON chat_messages(client_id, created_at);
CREATE INDEX IF NOT EXISTS idx_draft_transactions_client_status ON draft_transactions(client_id, status);
CREATE INDEX IF NOT EXISTS idx_documents_category_tax_year ON documents(category, tax_year);
CREATE INDEX IF NOT EXISTS idx_mileage_logs_client_date ON mileage_logs(client_id, date);
CREATE INDEX IF NOT EXISTS idx_vendors_client_id ON vendors(client_id);
CREATE INDEX IF NOT EXISTS idx_recurring_active_next ON recurring_transactions(active, next_run_date);
