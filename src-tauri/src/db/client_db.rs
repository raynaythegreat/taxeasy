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
        // B1: transactions.status column (draft/posted/void lifecycle).
        self.apply_alter_migration(include_str!("../../migrations/006_transactions_status.sql"), 6)?;
        // B2: accounts.system_account_role column (stable FK for cash-flow matching).
        self.apply_alter_migration(include_str!("../../migrations/007_accounts_system_role.sql"), 7)?;
        // C4: accounts.deductible flag for deductible-expense tracking.
        self.apply_alter_migration(include_str!("../../migrations/009_accounts_deductible.sql"), 9)?;
        // Data entry: recurring transaction schedules.
        self.apply_alter_migration(include_str!("../../migrations/010_recurring_transactions.sql"), 10)?;
        // Chat tools: AI assistant integration.
        self.apply_alter_migration(include_str!("../../migrations/011_chat_tools.sql"), 11)?;
        // Phase 1: Mileage tracking with IRS rates.
        eprintln!("DEBUG: Applying migration 12");
        self.apply_alter_migration(include_str!("../../migrations/012_mileage.sql"), 12)?;
        // Phase 1: Schedule C tax form mappings.
        eprintln!("DEBUG: Applying migration 13");
        self.apply_alter_migration(include_str!("../../migrations/013_schedule_c.sql"), 13)?;
        // Phase 1: Vendors and 1099-NEC tracking.
        eprintln!("DEBUG: Applying migration 14");
        self.apply_alter_migration(include_str!("../../migrations/014_vendors_1099.sql"), 14)?;
        eprintln!("DEBUG: All migrations applied");
        Ok(())
    }

    /// Run a migration SQL that may include ALTER TABLE statements, which are
    /// not idempotent.  Guard the entire block behind a schema_migrations check.
    fn apply_alter_migration(&self, sql: &str, version: i64) -> Result<()> {
        let already_applied: bool = self
            .conn
            .query_row(
                "SELECT COUNT(*) > 0 FROM schema_migrations WHERE version = ?1",
                rusqlite::params![version],
                |row| row.get(0),
            )
            .unwrap_or(false);
        eprintln!("DEBUG apply_alter_migration v{}: already_applied={}", version, already_applied);
        if !already_applied {
            eprintln!("DEBUG: Executing migration SQL for version {}", version);
            self.conn.execute_batch(sql)?;
            eprintln!("DEBUG: SQL executed, inserting version {}", version);
            self.conn.execute(
                "INSERT OR IGNORE INTO schema_migrations (version) VALUES (?1)",
                rusqlite::params![version],
            )?;
            eprintln!("DEBUG: Version {} inserted", version);
        }
        Ok(())
    }

    pub fn conn(&self) -> &Connection {
        &self.conn
    }
}
