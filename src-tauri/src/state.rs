/// Shared application state held in Tauri's managed state.
use std::sync::Mutex;

use crate::db::{AppDb, ClientDb};

pub struct ActiveClient {
    pub client_id: String,
    pub db: ClientDb,
}

pub struct AppState {
    /// App-level database (client registry).  None until the user enters their passphrase.
    pub app_db: Mutex<Option<AppDb>>,
    /// Currently active client DB.  None until the user selects a client.
    pub active_client: Mutex<Option<ActiveClient>>,
    /// The master passphrase held in memory for the session.  Cleared on lock/logout.
    pub passphrase: Mutex<Option<String>>,
}

impl AppState {
    pub fn new() -> Self {
        Self {
            app_db: Mutex::new(None),
            active_client: Mutex::new(None),
            passphrase: Mutex::new(None),
        }
    }
}
