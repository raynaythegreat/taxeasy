/// App-level database — stores the client registry and app settings.
/// One instance lives for the entire session.
use rusqlite::{Connection, params};

use crate::error::{AppError, Result};
use super::encryption::{app_db_key, sqlcipher_hex_key};

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
        Ok(())
    }

    pub fn conn(&self) -> &Connection {
        &self.conn
    }
}
