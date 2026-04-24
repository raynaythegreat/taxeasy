use rusqlite::Connection;
use tauri::Manager;

use crate::{
    db::{ClientDb, OwnerDb},
    domain::client::EntityType,
    error::{AppError, Result},
    state::AppState,
};

fn client_db_filename(state: &AppState, client_id: &str) -> Result<String> {
    log::debug!("client_db_filename: querying for client_id='{}'", client_id);
    let lock = state.app_db.lock().unwrap();
    let db = lock.as_ref().ok_or(AppError::NoActiveClient)?;
    log::debug!("client_db_filename: app_db is present");
    let result = db
        .conn()
        .query_row(
            "SELECT db_filename FROM clients WHERE id = ?1 AND archived_at IS NULL",
            rusqlite::params![client_id],
            |row| row.get(0),
        )
        .map_err(|_| AppError::NotFound(format!("client {client_id}")));
    log::debug!("client_db_filename: query result={:?}", result.is_ok());
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

fn open_owner_db(state: &AppState, app_handle: &tauri::AppHandle) -> Result<OwnerDb> {
    let passphrase = {
        let lock = state.passphrase.lock().unwrap();
        lock.clone().ok_or(AppError::NoActiveClient)?
    };
    let data_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e: tauri::Error| {
            AppError::Io(std::io::Error::new(
                std::io::ErrorKind::Other,
                e.to_string(),
            ))
        })?;
    let owner_db_path = data_dir.join("owner.db");
    let owner_db = OwnerDb::open(owner_db_path.to_str().unwrap(), &passphrase)?;

    let entity_type_str: String = {
        let app_lock = state.app_db.lock().unwrap();
        let db = app_lock.as_ref().ok_or(AppError::NoActiveClient)?;
        db.conn()
            .query_row(
                "SELECT entity_type FROM business_profile LIMIT 1",
                [],
                |row| row.get(0),
            )
            .unwrap_or_else(|_| "sole_prop".to_string())
    };
    let entity_type = entity_type_str
        .parse::<EntityType>()
        .unwrap_or(EntityType::SoleProp);
    crate::commands::clients::ensure_chart_of_accounts_public(owner_db.conn(), &entity_type)?;

    Ok(owner_db)
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
            {
                let lock = state.owner_db.lock().unwrap();
                if let Some(odb) = lock.as_ref() {
                    return f(odb.conn());
                }
            }

            let app_handle = app_handle.ok_or_else(|| {
                AppError::Io(std::io::Error::new(
                    std::io::ErrorKind::Other,
                    "AppHandle required to open owner database",
                ))
            })?;
            let odb = open_owner_db(state, app_handle)?;
            {
                let mut lock = state.owner_db.lock().unwrap();
                *lock = Some(odb);
            }

            let lock = state.owner_db.lock().unwrap();
            let odb = lock.as_ref().ok_or(AppError::NoActiveClient)?;
            f(odb.conn())
        }
        Some(client_id) => {
            let active_lock = state.active_client.lock().unwrap();
            log::debug!("scoped: looking for client_id='{}'", client_id);
            if let Some(ac) = active_lock.as_ref() {
                log::debug!("scoped: active_client.client_id='{}'", ac.client_id);
                if ac.client_id == client_id {
                    log::debug!("scoped: using active client connection");
                    return f(ac.db.conn());
                }
            }
            drop(active_lock);
            log::debug!("scoped: falling through to open_client_db");

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
