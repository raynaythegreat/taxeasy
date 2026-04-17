use tauri::Manager;

use crate::{
    db::{AppDb, OwnerDb},
    domain::client::EntityType,
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
    let data_dir = app_handle.path().app_data_dir().map_err(|e| {
        AppError::Io(std::io::Error::new(
            std::io::ErrorKind::Other,
            e.to_string(),
        ))
    })?;

    std::fs::create_dir_all(&data_dir)?;
    let db_path = data_dir.join("app.db");

    let app_db = AppDb::open(db_path.to_str().unwrap(), &passphrase)?;

    {
        let mut lock = state.app_db.lock().unwrap();
        *lock = Some(app_db);
    }
    {
        let mut lock = state.passphrase.lock().unwrap();
        *lock = Some(passphrase.clone());
    }

    // Open (or create) the owner ledger database.
    let owner_db_path = data_dir.join("owner.db");
    let owner_db = OwnerDb::open(owner_db_path.to_str().unwrap(), &passphrase)?;

    // Seed chart of accounts if the owner ledger is fresh.
    {
        let account_count: i64 = owner_db
            .conn()
            .query_row("SELECT COUNT(*) FROM accounts", [], |row| row.get(0))
            .unwrap_or(0);
        if account_count == 0 {
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
            crate::commands::clients::ensure_chart_of_accounts_public(
                owner_db.conn(),
                &entity_type,
            )?;
        }
    }

    {
        let mut lock = state.owner_db.lock().unwrap();
        *lock = Some(owner_db);
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
        let mut lock = state.owner_db.lock().unwrap();
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
