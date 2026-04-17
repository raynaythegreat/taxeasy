ALTER TABLE chat_messages ADD COLUMN tool_name TEXT;
ALTER TABLE chat_messages ADD COLUMN tool_input TEXT;
ALTER TABLE chat_messages ADD COLUMN tool_output TEXT;
ALTER TABLE chat_messages ADD COLUMN tool_status TEXT;
ALTER TABLE chat_messages ADD COLUMN parent_message_id TEXT;
ALTER TABLE chat_messages ADD COLUMN metadata TEXT;

INSERT OR IGNORE INTO schema_migrations (version) VALUES (11);
