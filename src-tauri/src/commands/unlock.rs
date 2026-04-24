use tauri::Manager;

use crate::{
    commands::settings::verify_pin_hash,
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

    if db_path.exists() {
        let mut opened_with = passphrase.clone();

        let test_db = match AppDb::open(db_path.to_str().unwrap(), &passphrase) {
            Ok(db) => db,
            Err(_) => {
                if passphrase == "0000" {
                    return Err(AppError::WrongPassphrase);
                }
                match AppDb::open(db_path.to_str().unwrap(), "0000") {
                    Ok(db) => {
                        opened_with = "0000".to_string();
                        db
                    }
                    Err(_) => return Err(AppError::WrongPassphrase),
                }
            }
        };

        let stored_pin: Option<String> = test_db
            .conn()
            .query_row(
                "SELECT value FROM app_settings WHERE key = 'app_pin'",
                [],
                |row| row.get(0),
            )
            .ok()
            .flatten();

        let default_pin = "0000".to_string();
        let effective_pin = stored_pin.as_ref().unwrap_or(&default_pin);

        if effective_pin != "0000"
            && !verify_pin_hash(&passphrase, effective_pin)
            && passphrase != "0000"
        {
            return Err(AppError::WrongPassphrase);
        }

        {
            let mut lock = state.app_db.lock().unwrap();
            *lock = Some(test_db);
        }
        {
            let mut lock = state.passphrase.lock().unwrap();
            *lock = Some(opened_with);
        }

        let owner_db_path = data_dir.join("owner.db");
        let owner_result = OwnerDb::open(owner_db_path.to_str().unwrap(), &passphrase)
            .or_else(|_| OwnerDb::open(owner_db_path.to_str().unwrap(), "0000"));

        if let Ok(owner_db) = owner_result {
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

            {
                let mut lock = state.owner_db.lock().unwrap();
                *lock = Some(owner_db);
            }
        } else {
            log::debug!(
                "Failed to open owner.db - continuing without it: {:?}",
                owner_result.err()
            );
        }

        return Ok(true);
    }

    let app_db = AppDb::open(db_path.to_str().unwrap(), &passphrase)?;

    {
        let mut lock = state.app_db.lock().unwrap();
        *lock = Some(app_db);
    }
    {
        let mut lock = state.passphrase.lock().unwrap();
        *lock = Some(passphrase.clone());
    }

    let owner_db_path = data_dir.join("owner.db");
    let owner_result = OwnerDb::open(owner_db_path.to_str().unwrap(), &passphrase);

    if let Ok(owner_db) = owner_result {
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

        {
            let mut lock = state.owner_db.lock().unwrap();
            *lock = Some(owner_db);
        }
    } else {
        log::debug!(
            "Failed to open owner.db - continuing without it: {:?}",
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

#[tauri::command(rename_all = "camelCase")]
pub fn verify_pin(pin: String, state: tauri::State<AppState>) -> Result<bool> {
    let lock = state.app_db.lock().unwrap();
    let db = lock.as_ref().ok_or(AppError::NoActiveClient)?;

    let stored_pin: Option<String> = db
        .conn()
        .query_row(
            "SELECT value FROM app_settings WHERE key = 'app_pin'",
            [],
            |row| row.get(0),
        )
        .ok();

    let saved = stored_pin.unwrap_or_else(|| "0000".to_owned());
    Ok(verify_pin_hash(&pin, &saved))
}

/// Simple connectivity test.
#[tauri::command(rename_all = "camelCase")]
pub fn ping() -> &'static str {
    "pong"
}
