/// App-level database — stores the client registry and app settings.
/// One instance lives for the entire session.
use std::collections::HashSet;

use rusqlite::Connection;

use super::encryption::{app_db_key, sqlcipher_hex_key};
use crate::error::{AppError, Result};

pub struct AppDb {
    conn: Connection,
}

impl AppDb {
    /// Open (or create) the app database with the derived key.
    pub fn open(path: &str, passphrase: &str) -> Result<Self> {
        let conn = Connection::open(path)?;

        // Set SQLCipher key immediately after open, before any other operation.
        let raw_key = app_db_key(passphrase)?;
        let hex_key = sqlcipher_hex_key(&raw_key);
        conn.execute_batch(&format!("PRAGMA key = \"{hex_key}\";"))?;

        // Enable WAL for better concurrency and crash safety.
        conn.execute_batch("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;")?;

        // Verify we can actually read — wrong passphrase surfaces here.
        conn.execute_batch("SELECT count(*) FROM sqlite_master;")
            .map_err(|_| AppError::WrongPassphrase)?;

        let db = Self { conn };
        db.run_migrations()?;
        Ok(db)
    }

    fn run_migrations(&self) -> Result<()> {
        let schema = include_str!("../../migrations/001_app.sql");
        self.conn.execute_batch(schema)?;
        self.ensure_client_profile_columns()?;
        self.ensure_business_profile_table()?;
        let tax_news = include_str!("../../migrations/007_tax_news_cache.sql");
        self.conn.execute_batch(tax_news)?;
        Ok(())
    }

    fn ensure_client_profile_columns(&self) -> Result<()> {
        let mut stmt = self.conn.prepare("PRAGMA table_info(clients)")?;
        let existing: HashSet<String> = stmt
            .query_map([], |row| row.get::<_, String>(1))?
            .filter_map(|r| r.ok())
            .collect();

        let wanted = [
            ("contact_name", "TEXT"),
            ("email", "TEXT"),
            ("phone", "TEXT"),
            ("address_line1", "TEXT"),
            ("address_line2", "TEXT"),
            ("city", "TEXT"),
            ("state", "TEXT"),
            ("postal_code", "TEXT"),
            ("country", "TEXT"),
            ("website", "TEXT"),
            ("tax_preparer_notes", "TEXT"),
            ("filing_notes", "TEXT"),
        ];

        for (name, ty) in wanted {
            if !existing.contains(name) {
                self.conn
                    .execute(&format!("ALTER TABLE clients ADD COLUMN {name} {ty}"), [])?;
            }
        }

        self.conn.execute(
            "INSERT OR IGNORE INTO schema_migrations (version) VALUES (5)",
            [],
        )?;

        Ok(())
    }

    fn ensure_business_profile_table(&self) -> Result<()> {
        // Check if business_profile table exists
        let table_exists: bool = self.conn.query_row(
            "SELECT COUNT(*) > 0 FROM sqlite_master WHERE type='table' AND name='business_profile'",
            [],
            |row| row.get(0),
        )?;

        if !table_exists {
            self.conn.execute_batch(
                "CREATE TABLE business_profile (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL DEFAULT '',
                    entity_type TEXT NOT NULL DEFAULT 'sole-prop' CHECK (entity_type IN (
                        'sole-prop', 'smllc', 'scorp', 'ccorp', 'partnership'
                    )),
                    ein TEXT,
                    contact_name TEXT,
                    email TEXT,
                    phone TEXT,
                    website TEXT,
                    address_line1 TEXT,
                    address_line2 TEXT,
                    city TEXT,
                    state TEXT,
                    postal_code TEXT,
                    country TEXT DEFAULT 'USA',
                    fiscal_year_start_month INTEGER NOT NULL DEFAULT 1 CHECK (fiscal_year_start_month BETWEEN 1 AND 12),
                    accounting_method TEXT NOT NULL DEFAULT 'cash' CHECK (accounting_method IN ('cash', 'accrual')),
                    profile_image_path TEXT,
                    tax_preparer_notes TEXT,
                    filing_notes TEXT,
                    created_at TEXT NOT NULL DEFAULT (datetime('now')),
                    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
                )",
            )?;
        }

        // Add app_pin column to app_settings if not exists
        let has_pin_column: bool = self.conn.query_row(
            "SELECT COUNT(*) > 0 FROM pragma_table_info('app_settings') WHERE name='app_pin'",
            [],
            |row| row.get(0),
        )?;

        if !has_pin_column {
            self.conn.execute(
                "ALTER TABLE app_settings ADD COLUMN app_pin TEXT DEFAULT '0000'",
                [],
            )?;
        }

        self.conn.execute(
            "INSERT OR IGNORE INTO schema_migrations (version) VALUES (6)",
            [],
        )?;

        Ok(())
    }

    pub fn conn(&self) -> &Connection {
        &self.conn
    }
}
