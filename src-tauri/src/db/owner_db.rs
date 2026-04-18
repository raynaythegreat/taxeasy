use rusqlite::Connection;

use super::encryption::{owner_db_key, sqlcipher_hex_key};
use crate::error::Result;

pub struct OwnerDb {
    conn: Connection,
}

impl OwnerDb {
    pub fn open(path: &str, passphrase: &str) -> Result<Self> {
        let conn = Connection::open(path)?;

        let raw_key = owner_db_key(passphrase)?;
        let hex_key = sqlcipher_hex_key(&raw_key);
        conn.execute_batch(&format!("PRAGMA key = \"{hex_key}\";"))?;
        conn.execute_batch("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;")?;

        conn.execute_batch("SELECT count(*) FROM sqlite_master;")
            .map_err(|_| crate::error::AppError::WrongPassphrase)?;

        let db = Self { conn };
        db.run_migrations()?;
        Ok(db)
    }

    fn run_migrations(&self) -> Result<()> {
        eprintln!("DEBUG owner_db: Running migrations, creating schema_migrations table");
        let schema = include_str!("../../migrations/002_client.sql");
        self.conn.execute_batch(schema)?;
        let invoices = include_str!("../../migrations/003_invoices.sql");
        self.conn.execute_batch(invoices)?;
        let documents = include_str!("../../migrations/004_documents.sql");
        self.conn.execute_batch(documents)?;
        let ai_workspace = include_str!("../../migrations/005_ai_workspace.sql");
        self.conn.execute_batch(ai_workspace)?;
        self.apply_alter_migration(
            include_str!("../../migrations/006_transactions_status.sql"),
            6,
        )?;
        self.apply_alter_migration(
            include_str!("../../migrations/007_accounts_system_role.sql"),
            7,
        )?;
        self.apply_alter_migration(
            include_str!("../../migrations/009_accounts_deductible.sql"),
            9,
        )?;
        self.apply_alter_migration(
            include_str!("../../migrations/010_recurring_transactions.sql"),
            10,
        )?;
        // IRS mileage rates reference table (shared across clients)
        eprintln!("DEBUG owner_db: Applying migration 12 (irs_rates)");
        self.apply_alter_migration(
            include_str!("../../migrations/012_mileage_irs_rates.sql"),
            12,
        )?;
        Ok(())
    }

    fn apply_alter_migration(&self, sql: &str, version: i64) -> Result<()> {
        let already_applied: bool = self
            .conn
            .query_row(
                "SELECT COUNT(*) > 0 FROM schema_migrations WHERE version = ?1",
                rusqlite::params![version],
                |row| row.get(0),
            )
            .unwrap_or(false);
        if !already_applied {
            self.conn.execute_batch(sql)?;
        }
        Ok(())
    }

    pub fn conn(&self) -> &Connection {
        &self.conn
    }
}
