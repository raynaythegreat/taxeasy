use rusqlite::params;
use rusqlite::OptionalExtension;
use serde_json::Value;
use tauri::Manager;
use uuid::Uuid;

use crate::{
    db::encryption::ein_key,
    domain::client::{AccountingMethod, Client, CreateClientPayload, EntityType},
    error::{AppError, Result},
    state::AppState,
};

#[derive(Debug, serde::Deserialize)]
pub struct UpdateClientPayload {
    pub name: Option<String>,
    pub entity_type: Option<EntityType>,
    pub ein: Option<String>,
    pub fiscal_year_start_month: Option<u8>,
    pub accounting_method: Option<AccountingMethod>,
}

/// List all active clients.
#[tauri::command(rename_all = "camelCase")]
pub fn list_clients(state: tauri::State<AppState>) -> Result<Vec<Client>> {
    let lock = state.app_db.lock().unwrap();
    let db = lock.as_ref().ok_or(AppError::NoActiveClient)?; // app_db None means not unlocked
    let conn = db.conn();

    let mut stmt = conn.prepare(
        "SELECT id, name, entity_type, ein_encrypted, fiscal_year_start_month,
                accounting_method, archived_at, created_at
         FROM clients WHERE archived_at IS NULL ORDER BY name",
    )?;

    let passphrase = state.passphrase.lock().unwrap();
    let pp = passphrase.as_deref().unwrap_or("");
    let key = ein_key(pp)?;

    let clients = stmt
        .query_map([], |row| {
            let id: String = row.get(0)?;
            let name: String = row.get(1)?;
            let entity_type_str: String = row.get(2)?;
            let ein_blob: Option<Vec<u8>> = row.get(3)?;
            let fiscal_year_start_month: u8 = row.get(4)?;
            let accounting_method_str: String = row.get(5)?;
            let archived_at: Option<String> = row.get(6)?;
            let created_at: String = row.get(7)?;
            Ok((
                id,
                name,
                entity_type_str,
                ein_blob,
                fiscal_year_start_month,
                accounting_method_str,
                archived_at,
                created_at,
            ))
        })?
        .filter_map(|r| r.ok())
        .map(
            |(id, name, et_str, ein_blob, fy_month, am_str, archived_at, created_at)| {
                let entity_type = et_str.parse::<EntityType>().unwrap_or(EntityType::SoleProp);
                let accounting_method = am_str
                    .parse::<AccountingMethod>()
                    .unwrap_or(AccountingMethod::Cash);
                let ein = ein_blob.and_then(|blob| {
                    crate::db::encryption::decrypt_field(&key, &blob)
                        .ok()
                        .and_then(|bytes| String::from_utf8(bytes).ok())
                });
                Client {
                    id,
                    name,
                    entity_type,
                    ein,
                    fiscal_year_start_month: fy_month,
                    accounting_method,
                    archived_at: archived_at.and_then(|s| s.parse().ok()),
                    created_at: created_at.parse().unwrap_or_else(|_| chrono::Utc::now()),
                }
            },
        )
        .collect();

    Ok(clients)
}

/// Create a new client and seed its chart of accounts.
#[tauri::command(rename_all = "camelCase")]
pub fn create_client(
    payload: CreateClientPayload,
    app_handle: tauri::AppHandle,
    state: tauri::State<AppState>,
) -> Result<Client> {
    // Validate name
    let name = payload.name.trim().to_owned();
    if name.is_empty() {
        return Err(AppError::Validation("client name cannot be empty".into()));
    }

    let client_id = Uuid::new_v4().to_string();
    let db_filename = format!("{client_id}.db");

    let passphrase = {
        let lock = state.passphrase.lock().unwrap();
        lock.clone().unwrap_or_default()
    };

    // Encrypt EIN if provided
    let ein_encrypted: Option<Vec<u8>> = if let Some(ein) = &payload.ein {
        let ein = ein.trim();
        if !ein.is_empty() {
            let key = ein_key(&passphrase)?;
            Some(crate::db::encryption::encrypt_field(&key, ein.as_bytes())?)
        } else {
            None
        }
    } else {
        None
    };

    let fiscal_year_start_month = payload.fiscal_year_start_month.unwrap_or(1);
    let accounting_method = payload.accounting_method.unwrap_or(AccountingMethod::Cash);
    let entity_type = payload.entity_type;

    // Insert into app db
    {
        let lock = state.app_db.lock().unwrap();
        let db = lock.as_ref().ok_or(AppError::NoActiveClient)?;
        let conn = db.conn();
        conn.execute(
            "INSERT INTO clients (id, name, entity_type, ein_encrypted, fiscal_year_start_month,
                accounting_method, db_filename)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![
                client_id,
                name,
                entity_type.as_str(),
                ein_encrypted,
                fiscal_year_start_month as i64,
                accounting_method.as_str(),
                db_filename,
            ],
        )?;
    }

    // Open (create) the client DB
    let data_dir = app_handle.path().app_data_dir().map_err(|e| {
        AppError::Io(std::io::Error::new(
            std::io::ErrorKind::Other,
            e.to_string(),
        ))
    })?;
    let clients_dir = data_dir.join("clients");
    std::fs::create_dir_all(&clients_dir)?;
    let client_db_path = clients_dir.join(&db_filename);

    let client_db =
        crate::db::ClientDb::open(client_db_path.to_str().unwrap(), &client_id, &passphrase)?;

    // Seed chart of accounts
    seed_chart_of_accounts(client_db.conn(), &entity_type)?;

    // Store the open client DB in state
    {
        let mut lock = state.active_client.lock().unwrap();
        *lock = Some(crate::state::ActiveClient {
            client_id: client_id.clone(),
            db: client_db,
        });
    }

    let created_at = chrono::Utc::now();
    let client = Client {
        id: client_id,
        name,
        entity_type,
        ein: payload.ein.filter(|s| !s.trim().is_empty()),
        fiscal_year_start_month,
        accounting_method,
        archived_at: None,
        created_at,
    };

    Ok(client)
}

/// Switch the active client (opens its DB).
#[tauri::command(rename_all = "camelCase")]
pub fn switch_client(
    client_id: String,
    app_handle: tauri::AppHandle,
    state: tauri::State<AppState>,
) -> Result<()> {
    let passphrase = {
        let lock = state.passphrase.lock().unwrap();
        lock.clone().unwrap_or_default()
    };

    let db_filename: String = {
        let lock = state.app_db.lock().unwrap();
        let db = lock.as_ref().ok_or(AppError::NoActiveClient)?;
        let conn = db.conn();
        conn.query_row(
            "SELECT db_filename FROM clients WHERE id = ?1 AND archived_at IS NULL",
            params![client_id],
            |row| row.get(0),
        )
        .map_err(|_| AppError::NotFound(format!("client {client_id}")))?
    };

    let data_dir = app_handle.path().app_data_dir().map_err(|e| {
        AppError::Io(std::io::Error::new(
            std::io::ErrorKind::Other,
            e.to_string(),
        ))
    })?;
    let client_db_path = data_dir.join("clients").join(&db_filename);

    let client_db =
        crate::db::ClientDb::open(client_db_path.to_str().unwrap(), &client_id, &passphrase)?;

    let mut lock = state.active_client.lock().unwrap();
    *lock = Some(crate::state::ActiveClient {
        client_id,
        db: client_db,
    });

    Ok(())
}

#[tauri::command(rename_all = "camelCase")]
pub fn update_client(
    id: String,
    payload: UpdateClientPayload,
    state: tauri::State<AppState>,
) -> Result<Client> {
    let passphrase = {
        let lock = state.passphrase.lock().unwrap();
        lock.clone().unwrap_or_default()
    };

    let lock = state.app_db.lock().unwrap();
    let db = lock.as_ref().ok_or(AppError::NoActiveClient)?;
    let conn = db.conn();

    if let Some(ref name) = payload.name {
        let trimmed = name.trim().to_owned();
        if trimmed.is_empty() {
            return Err(AppError::Validation("client name cannot be empty".into()));
        }
        conn.execute(
            "UPDATE clients SET name = ?1 WHERE id = ?2",
            params![trimmed, id],
        )?;
    }
    if let Some(ref et) = payload.entity_type {
        conn.execute(
            "UPDATE clients SET entity_type = ?1 WHERE id = ?2",
            params![et.as_str(), id],
        )?;
    }
    if let Some(ref ein) = payload.ein {
        let trimmed = ein.trim();
        if trimmed.is_empty() {
            conn.execute(
                "UPDATE clients SET ein_encrypted = NULL WHERE id = ?1",
                params![id],
            )?;
        } else {
            let key = ein_key(&passphrase)?;
            let encrypted = crate::db::encryption::encrypt_field(&key, trimmed.as_bytes())?;
            conn.execute(
                "UPDATE clients SET ein_encrypted = ?1 WHERE id = ?2",
                params![encrypted, id],
            )?;
        }
    }
    if let Some(fym) = payload.fiscal_year_start_month {
        conn.execute(
            "UPDATE clients SET fiscal_year_start_month = ?1 WHERE id = ?2",
            params![fym as i64, id],
        )?;
    }
    if let Some(ref am) = payload.accounting_method {
        conn.execute(
            "UPDATE clients SET accounting_method = ?1 WHERE id = ?2",
            params![am.as_str(), id],
        )?;
    }

    let row: (
        String,
        String,
        String,
        Option<Vec<u8>>,
        u8,
        String,
        Option<String>,
        String,
    ) = conn
        .query_row(
            "SELECT id, name, entity_type, ein_encrypted, fiscal_year_start_month,
                    accounting_method, archived_at, created_at
             FROM clients WHERE id = ?1",
            params![id],
            |row| {
                Ok((
                    row.get(0)?,
                    row.get(1)?,
                    row.get(2)?,
                    row.get(3)?,
                    row.get(4)?,
                    row.get(5)?,
                    row.get(6)?,
                    row.get(7)?,
                ))
            },
        )
        .map_err(|_| AppError::NotFound(format!("client {id}")))?;

    let key = ein_key(&passphrase)?;
    let ein_decrypted = row.3.and_then(|blob| {
        crate::db::encryption::decrypt_field(&key, &blob)
            .ok()
            .and_then(|bytes| String::from_utf8(bytes).ok())
    });

    Ok(Client {
        id: row.0,
        name: row.1,
        entity_type: row.2.parse().unwrap_or(EntityType::SoleProp),
        ein: ein_decrypted,
        fiscal_year_start_month: row.4,
        accounting_method: row.5.parse().unwrap_or(AccountingMethod::Cash),
        archived_at: row.6.and_then(|s| s.parse().ok()),
        created_at: row.7.parse().unwrap_or_else(|_| chrono::Utc::now()),
    })
}

#[tauri::command(rename_all = "camelCase")]
pub fn archive_client(id: String, state: tauri::State<AppState>) -> Result<()> {
    let lock = state.app_db.lock().unwrap();
    let db = lock.as_ref().ok_or(AppError::NoActiveClient)?;
    let conn = db.conn();

    let now = chrono::Utc::now().to_rfc3339();
    let rows = conn.execute(
        "UPDATE clients SET archived_at = ?1 WHERE id = ?2 AND archived_at IS NULL",
        params![now, id],
    )?;
    if rows == 0 {
        return Err(AppError::NotFound(format!(
            "client {id} (not found or already archived)"
        )));
    }
    Ok(())
}

/// Persist the last-selected client ID so we can restore it on next launch.
#[tauri::command(rename_all = "camelCase")]
pub fn set_active_client_pref(client_id: String, state: tauri::State<AppState>) -> Result<()> {
    let lock = state.app_db.lock().unwrap();
    let db = lock.as_ref().ok_or(AppError::NoActiveClient)?;
    let conn = db.conn();
    conn.execute(
        "INSERT OR REPLACE INTO app_settings (key, value) VALUES ('active_client_id', ?1)",
        params![client_id],
    )?;
    Ok(())
}

/// Read back the last-persisted active client ID (None if never set).
#[tauri::command(rename_all = "camelCase")]
pub fn get_active_client_id(state: tauri::State<AppState>) -> Option<String> {
    let lock = state.active_client.lock().unwrap();
    lock.as_ref().map(|ac| ac.client_id.clone())
}

#[tauri::command(rename_all = "camelCase")]
pub fn get_active_client_pref(state: tauri::State<AppState>) -> Result<Option<String>> {
    let lock = state.app_db.lock().unwrap();
    let db = lock.as_ref().ok_or(AppError::NoActiveClient)?;
    let conn = db.conn();
    let result = conn
        .query_row(
            "SELECT value FROM app_settings WHERE key = 'active_client_id'",
            [],
            |row| row.get::<_, String>(0),
        )
        .optional()?;
    Ok(result)
}

// ── Internal helpers ──────────────────────────────────────────────────────────

fn seed_chart_of_accounts(conn: &rusqlite::Connection, entity_type: &EntityType) -> Result<()> {
    // Load the appropriate seed file bundled into the binary at compile time.
    let seed_json: &str = match entity_type {
        EntityType::SoleProp => include_str!("../../seeds/coa_sole_prop.json"),
        EntityType::Smllc => include_str!("../../seeds/coa_smllc.json"),
        EntityType::Scorp => include_str!("../../seeds/coa_scorp.json"),
        EntityType::Ccorp => include_str!("../../seeds/coa_ccorp.json"),
        EntityType::Partnership => include_str!("../../seeds/coa_partnership.json"),
    };

    let seeds: Vec<Value> = serde_json::from_str(seed_json)?;

    // Two passes: insert parents first (code as temp id), then set parent_id foreign keys.
    // Since we use code as the parent_id reference in seeds, we map code → uuid.
    let mut code_to_uuid: std::collections::HashMap<String, String> =
        std::collections::HashMap::new();

    // First pass: insert all accounts with a generated UUID, parent_id = NULL for now.
    for seed in &seeds {
        let code = seed["code"].as_str().unwrap_or("").to_owned();
        let id = Uuid::new_v4().to_string();
        code_to_uuid.insert(code.clone(), id.clone());

        let name = seed["name"].as_str().unwrap_or("");
        let account_type = seed["account_type"].as_str().unwrap_or("expense");
        let schedule_c_line = seed["schedule_c_line"].as_str();
        let sort_order = seed["sort_order"].as_i64().unwrap_or(0);

        conn.execute(
            "INSERT INTO accounts (id, code, name, account_type, parent_id, schedule_c_line, sort_order)
             VALUES (?1, ?2, ?3, ?4, NULL, ?5, ?6)",
            params![id, code, name, account_type, schedule_c_line, sort_order],
        )?;
    }

    // Second pass: update parent_id where seed specifies one.
    for seed in &seeds {
        let code = seed["code"].as_str().unwrap_or("");
        if let Some(parent_code) = seed["parent_id"].as_str() {
            if let (Some(id), Some(parent_id)) =
                (code_to_uuid.get(code), code_to_uuid.get(parent_code))
            {
                conn.execute(
                    "UPDATE accounts SET parent_id = ?1 WHERE id = ?2",
                    params![parent_id, id],
                )?;
            }
        }
    }

    Ok(())
}
