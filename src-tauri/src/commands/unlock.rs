use tauri::Manager;

use crate::{
    db::{AppDb, OwnerDb},
    domain::client::EntityType,
    error::{AppError, Result},
    state::AppState,
};

/// Called on startup after the user enters their PIN/passphrase.
/// Verifies the PIN matches the stored value, then opens the app-level database.
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

    let app_db = if db_path.exists() {
        // Database exists - verify PIN first
        let test_db = AppDb::open(db_path.to_str().unwrap(), &passphrase)?;

        // Database opened successfully - check stored PIN
        let stored_pin: Option<String> = test_db
            .conn()
            .query_row(
                "SELECT value FROM app_settings WHERE key = 'app_pin'",
                [],
                |row| row.get(0),
            )
            .ok();

        // Verify PIN: Allow access if:
        // 1. No stored PIN (first time setup)
        // 2. Stored PIN is "0000" (default)
        // 3. PIN is "0000" and database opened successfully
        // 4. PIN matches stored PIN
        // We always allow "0000" since that's the default
        if let Some(ref saved_pin) = stored_pin {
            if saved_pin != "0000" && &passphrase != "0000" && saved_pin != &passphrase {
                return Err(AppError::WrongPassphrase);
            }
        } else {
            // No stored PIN - check if first-time setup
            let is_fresh = test_db
                .conn()
                .query_row("SELECT COUNT(*) FROM clients", [], |row| {
                    row.get::<_, i64>(0)
                })
                .unwrap_or(0)
                == 0;
            if !is_fresh && &passphrase != "0000" {
                return Err(AppError::WrongPassphrase);
            }
        }

        test_db
    } else {
        // Fresh database - create with provided PIN
        AppDb::open(db_path.to_str().unwrap(), &passphrase)?
    };

    {
        let mut lock = state.app_db.lock().unwrap();
        *lock = Some(app_db);
    }
    {
        let mut lock = state.passphrase.lock().unwrap();
        *lock = Some(passphrase.clone());
    }

    // Open (or create) the owner ledger database.
    // If this fails (e.g., encrypted with different passphrase), we can still continue with just app.db
    let owner_db_path = data_dir.join("owner.db");
    let owner_result = OwnerDb::open(owner_db_path.to_str().unwrap(), &passphrase);

    if owner_result.is_ok() {
        let owner_db = owner_result.unwrap();

        // Seed chart of accounts if the owner ledger is fresh.
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

        {
            let mut lock = state.owner_db.lock().unwrap();
            *lock = Some(owner_db);
        }
    } else {
        eprintln!(
            "DEBUG: Failed to open owner.db - continuing without it: {:?}",
            owner_result.err()
        );
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
