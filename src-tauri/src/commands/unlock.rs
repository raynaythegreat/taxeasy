/// App unlock / passphrase management commands.
use tauri::Manager;

use crate::{
    db::AppDb,
    error::{AppError, Result},
    state::AppState,
};

/// Called on startup after the user enters their passphrase.
/// Opens the app-level database and stores the passphrase in memory.
#[tauri::command(rename_all = "camelCase")]
pub fn unlock_app(
    passphrase: String,
    app_handle: tauri::AppHandle,
    state: tauri::State<AppState>,
) -> Result<bool> {
    let data_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| AppError::Io(std::io::Error::new(std::io::ErrorKind::Other, e.to_string())))?;

    std::fs::create_dir_all(&data_dir)?;
    let db_path = data_dir.join("app.db");

    let app_db = AppDb::open(db_path.to_str().unwrap(), &passphrase)?;

    {
        let mut lock = state.app_db.lock().unwrap();
        *lock = Some(app_db);
    }
    {
        let mut lock = state.passphrase.lock().unwrap();
        *lock = Some(passphrase);
    }

    Ok(true)
}

/// Lock the app — clears in-memory passphrase and closes DBs.
#[tauri::command(rename_all = "camelCase")]
pub fn lock_app(state: tauri::State<AppState>) {
    {
        let mut lock = state.app_db.lock().unwrap();
        *lock = None;
    }
    {
        let mut lock = state.active_client.lock().unwrap();
        *lock = None;
    }
    {
        let mut lock = state.passphrase.lock().unwrap();
        *lock = None;
    }
}

/// Check whether the app is currently unlocked.
#[tauri::command(rename_all = "camelCase")]
pub fn is_unlocked(state: tauri::State<AppState>) -> bool {
    state.app_db.lock().unwrap().is_some()
}

/// Simple connectivity test.
#[tauri::command(rename_all = "camelCase")]
pub fn ping() -> &'static str {
    "pong"
}
