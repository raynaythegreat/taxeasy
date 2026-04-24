use rusqlite::Connection;
use tauri::Manager;

use crate::{
    db::ClientDb,
    error::{AppError, Result},
    state::AppState,
};

fn client_db_filename(state: &AppState, client_id: &str) -> Result<String> {
    eprintln!(
        "DEBUG client_db_filename: querying for client_id='{}'",
        client_id
    );
    let lock = state.app_db.lock().unwrap();
    let db = lock.as_ref().ok_or(AppError::NoActiveClient)?;
    eprintln!("DEBUG client_db_filename: app_db is present");
    let result = db
        .conn()
        .query_row(
            "SELECT db_filename FROM clients WHERE id = ?1 AND archived_at IS NULL",
            rusqlite::params![client_id],
            |row| row.get(0),
        )
        .map_err(|_| AppError::NotFound(format!("client {client_id}")));
    eprintln!(
        "DEBUG client_db_filename: query result={:?}",
        result.is_ok()
    );
    result
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
///
/// The `app_handle` is only used when opening a non-active client database.
/// Pass `None` if you're certain the active client will be used (e.g., in tests).
pub fn with_scoped_conn<T>(
    state: &AppState,
    app_handle: Option<&tauri::AppHandle>,
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
            eprintln!("DEBUG scoped: looking for client_id='{}'", client_id);
            if let Some(ac) = active_lock.as_ref() {
                eprintln!("DEBUG scoped: active_client.client_id='{}'", ac.client_id);
                if ac.client_id == client_id {
                    eprintln!("DEBUG scoped: using active client connection");
                    return f(ac.db.conn());
                }
            }
            drop(active_lock);
            eprintln!("DEBUG scoped: falling through to open_client_db");

            let app_handle = app_handle.ok_or_else(|| {
                AppError::Io(std::io::Error::new(
                    std::io::ErrorKind::Other,
                    "AppHandle required to open non-active client database",
                ))
            })?;
            let db = open_client_db(state, app_handle, client_id)?;
            f(db.conn())
        }
    }
}
