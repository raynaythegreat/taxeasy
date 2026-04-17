use rusqlite::Connection;
use tauri::Manager;

use crate::{
    db::ClientDb,
    error::{AppError, Result},
    state::AppState,
};

fn client_db_filename(state: &AppState, client_id: &str) -> Result<String> {
    let lock = state.app_db.lock().unwrap();
    let db = lock.as_ref().ok_or(AppError::NoActiveClient)?;
    db.conn()
        .query_row(
            "SELECT db_filename FROM clients WHERE id = ?1 AND archived_at IS NULL",
            rusqlite::params![client_id],
            |row| row.get(0),
        )
        .map_err(|_| AppError::NotFound(format!("client {client_id}")))
}

fn open_client_db(
    state: &AppState,
    app_handle: &tauri::AppHandle,
    client_id: &str,
) -> Result<ClientDb> {
    let passphrase = {
        let lock = state.passphrase.lock().unwrap();
        lock.clone().unwrap_or_default()
    };
    let db_filename = client_db_filename(state, client_id)?;
    let data_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e: tauri::Error| {
            AppError::Io(std::io::Error::new(
                std::io::ErrorKind::Other,
                e.to_string(),
            ))
        })?;
    let client_db_path = data_dir.join("clients").join(db_filename);
    ClientDb::open(client_db_path.to_str().unwrap(), client_id, &passphrase)
}

/// Execute a function with a connection scoped to either `"owner"` or a client ID.
///
/// - `Some("owner")` or `None` → owner ledger DB
/// - `Some(client_id)` → active client DB (if matched) or opens the client DB by filename
pub fn with_scoped_conn<T>(
    state: &AppState,
    app_handle: &tauri::AppHandle,
    scope: Option<&str>,
    f: impl FnOnce(&Connection) -> Result<T>,
) -> Result<T> {
    match scope {
        Some("owner") | None => {
            let lock = state.owner_db.lock().unwrap();
            let odb = lock.as_ref().ok_or(AppError::NoActiveClient)?;
            f(odb.conn())
        }
        Some(client_id) => {
            let active_lock = state.active_client.lock().unwrap();
            if let Some(ac) = active_lock.as_ref() {
                if ac.client_id == client_id {
                    return f(ac.db.conn());
                }
            }
            drop(active_lock);

            let db = open_client_db(state, app_handle, client_id)?;
            f(db.conn())
        }
    }
}
