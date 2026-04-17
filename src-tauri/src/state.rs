use std::sync::Mutex;

use crate::db::{AppDb, ClientDb, OwnerDb};

pub struct ActiveClient {
    pub client_id: String,
    pub db: ClientDb,
}

pub struct AppState {
    pub app_db: Mutex<Option<AppDb>>,
    pub active_client: Mutex<Option<ActiveClient>>,
    pub owner_db: Mutex<Option<OwnerDb>>,
    pub passphrase: Mutex<Option<String>>,
}

impl AppState {
    pub fn new() -> Self {
        Self {
            app_db: Mutex::new(None),
            active_client: Mutex::new(None),
            owner_db: Mutex::new(None),
            passphrase: Mutex::new(None),
        }
    }
}
