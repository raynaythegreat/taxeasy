ALTER TABLE clients ADD COLUMN source_folder_path TEXT;

INSERT OR IGNORE INTO schema_migrations (version) VALUES (16);
