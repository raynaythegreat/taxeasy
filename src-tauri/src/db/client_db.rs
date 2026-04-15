/// Per-client encrypted database.
use rusqlite::Connection;

use super::encryption::{client_db_key, sqlcipher_hex_key};
use crate::error::{AppError, Result};

pub struct ClientDb {
    conn: Connection,
    pub client_id: String,
}

impl ClientDb {
    /// Open (or create) a client database.
    pub fn open(path: &str, client_id: &str, passphrase: &str) -> Result<Self> {
        let conn = Connection::open(path)?;

        let raw_key = client_db_key(passphrase, client_id)?;
        let hex_key = sqlcipher_hex_key(&raw_key);
        conn.execute_batch(&format!("PRAGMA key = \"{hex_key}\";"))?;
        conn.execute_batch("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;")?;

        conn.execute_batch("SELECT count(*) FROM sqlite_master;")
            .map_err(|_| AppError::WrongPassphrase)?;

        let db = Self {
            conn,
            client_id: client_id.to_owned(),
        };
        db.run_migrations()?;
        Ok(db)
    }

    fn run_migrations(&self) -> Result<()> {
        let schema = include_str!("../../migrations/002_client.sql");
        self.conn.execute_batch(schema)?;
        let invoices = include_str!("../../migrations/003_invoices.sql");
        self.conn.execute_batch(invoices)?;
        let documents = include_str!("../../migrations/004_documents.sql");
        self.conn.execute_batch(documents)?;
        let ai_workspace = include_str!("../../migrations/005_ai_workspace.sql");
        self.conn.execute_batch(ai_workspace)?;
        Ok(())
    }

    pub fn conn(&self) -> &Connection {
        &self.conn
    }
}
