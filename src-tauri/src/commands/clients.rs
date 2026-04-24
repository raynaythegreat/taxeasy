use chrono::Datelike;
use rusqlite::params;
use rusqlite::OptionalExtension;
use serde::Serialize;
use serde_json::Value;
use std::path::{Path, PathBuf};
use tauri::{Emitter, Manager};
use uuid::Uuid;

use crate::{
    commands::{documents::AddDocumentPayload, files},
    db::encryption::ein_key,
    db::ClientDb,
    domain::client::{AccountingMethod, Client, CreateClientPayload, EntityType},
    error::{AppError, Result},
    state::AppState,
};

#[derive(Debug, serde::Deserialize)]
pub struct UpdateClientPayload {
    pub name: Option<String>,
    pub entity_type: Option<EntityType>,
    pub ein: Option<String>,
    pub contact_name: Option<String>,
    pub email: Option<String>,
    pub phone: Option<String>,
    pub address_line1: Option<String>,
    pub address_line2: Option<String>,
    pub city: Option<String>,
    pub state: Option<String>,
    pub postal_code: Option<String>,
    pub country: Option<String>,
    pub website: Option<String>,
    pub tax_preparer_notes: Option<String>,
    pub filing_notes: Option<String>,
    pub source_folder_path: Option<String>,
    pub fiscal_year_start_month: Option<u8>,
    pub accounting_method: Option<AccountingMethod>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BulkImportClientsResult {
    pub created: Vec<BulkImportedClient>,
    pub skipped: Vec<BulkImportSkippedClient>,
    pub failed: Vec<BulkImportFailedClient>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BulkImportedClient {
    pub folder_path: String,
    pub client: Client,
    pub scanned_document_count: usize,
    pub imported_document_count: usize,
    pub duplicate_document_count: usize,
    pub deduped_document_count: usize,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BulkImportSkippedClient {
    pub folder_path: String,
    pub client_name: String,
    pub reason: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BulkImportFailedClient {
    pub folder_path: String,
    pub client_name: Option<String>,
    pub reason: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BulkImportProgressEvent {
    pub operation: String,
    pub stage: String,
    pub status: String,
    pub folder_path: String,
    pub client_id: Option<String>,
    pub client_name: Option<String>,
    pub current: usize,
    pub total: usize,
    pub scanned_document_count: Option<usize>,
    pub imported_document_count: Option<usize>,
    pub duplicate_document_count: Option<usize>,
    pub deduped_count: Option<usize>,
    pub reason: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ResyncClientFolderResult {
    pub client: Client,
    pub client_id: String,
    pub client_name: String,
    pub source_folder_path: String,
    pub scanned_document_count: usize,
    pub imported_document_count: usize,
    pub duplicate_document_count: usize,
    pub deduped_document_count: usize,
}

struct CreatedClientContext {
    client: Client,
    client_db: ClientDb,
    db_filename: String,
}

struct PreparedImportedDocument {
    file_name: String,
    file_path: String,
    file_size: i64,
    mime_type: String,
    file_hash: String,
    category: String,
    tax_year: Option<i32>,
}

struct PreparedFolderImport {
    folder_path: String,
    client_name: String,
    tax_id: Option<String>,
    documents: Vec<PreparedImportedDocument>,
}

struct ExistingActiveClientMatch {
    name: String,
    source_folder_path: Option<String>,
    tax_id: Option<String>,
}

struct DocumentImportStats {
    imported_count: usize,
    duplicate_count: usize,
}

/// List all active clients.
#[tauri::command(rename_all = "camelCase")]
pub fn list_clients(state: tauri::State<AppState>) -> Result<Vec<Client>> {
    let lock = state.app_db.lock().unwrap();
    let db = lock.as_ref().ok_or(AppError::NoActiveClient)?; // app_db None means not unlocked
    let conn = db.conn();

    let mut stmt = conn.prepare(
        "SELECT id, name, entity_type, ein_encrypted, contact_name, email, phone,
                address_line1, address_line2, city, state, postal_code, country,
                website, tax_preparer_notes, filing_notes, source_folder_path, fiscal_year_start_month,
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
            let contact_name: Option<String> = row.get(4)?;
            let email: Option<String> = row.get(5)?;
            let phone: Option<String> = row.get(6)?;
            let address_line1: Option<String> = row.get(7)?;
            let address_line2: Option<String> = row.get(8)?;
            let city: Option<String> = row.get(9)?;
            let state_name: Option<String> = row.get(10)?;
            let postal_code: Option<String> = row.get(11)?;
            let country: Option<String> = row.get(12)?;
            let website: Option<String> = row.get(13)?;
            let tax_preparer_notes: Option<String> = row.get(14)?;
            let filing_notes: Option<String> = row.get(15)?;
            let source_folder_path: Option<String> = row.get(16)?;
            let fiscal_year_start_month: u8 = row.get(17)?;
            let accounting_method_str: String = row.get(18)?;
            let archived_at: Option<String> = row.get(19)?;
            let created_at: String = row.get(20)?;
            Ok((
                id,
                name,
                entity_type_str,
                ein_blob,
                contact_name,
                email,
                phone,
                address_line1,
                address_line2,
                city,
                state_name,
                postal_code,
                country,
                website,
                tax_preparer_notes,
                filing_notes,
                source_folder_path,
                fiscal_year_start_month,
                accounting_method_str,
                archived_at,
                created_at,
            ))
        })?
        .filter_map(|r| r.ok())
        .map(
            |(
                id,
                name,
                et_str,
                ein_blob,
                contact_name,
                email,
                phone,
                address_line1,
                address_line2,
                city,
                state_name,
                postal_code,
                country,
                website,
                tax_preparer_notes,
                filing_notes,
                source_folder_path,
                fy_month,
                am_str,
                archived_at,
                created_at,
            )| {
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
                    contact_name,
                    email,
                    phone,
                    address_line1,
                    address_line2,
                    city,
                    state: state_name,
                    postal_code,
                    country,
                    website,
                    tax_preparer_notes,
                    filing_notes,
                    source_folder_path,
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
    let clients_dir = app_clients_dir(&app_handle)?;
    let CreatedClientContext {
        client, client_db, ..
    } = create_client_context(payload, &clients_dir, &state)?;

    let mut lock = state.active_client.lock().unwrap();
    *lock = Some(crate::state::ActiveClient {
        client_id: client.id.clone(),
        db: client_db,
    });

    Ok(client)
}

#[tauri::command(rename_all = "camelCase")]
pub fn bulk_import_client_folders(
    folder_paths: Vec<String>,
    app_handle: tauri::AppHandle,
    state: tauri::State<AppState>,
) -> Result<BulkImportClientsResult> {
    let clients_dir = app_clients_dir(&app_handle)?;
    bulk_import_client_folders_impl(folder_paths, &clients_dir, Some(&app_handle), &state)
}

#[tauri::command(rename_all = "camelCase")]
pub fn resync_client_folder(
    client_id: String,
    app_handle: tauri::AppHandle,
    state: tauri::State<AppState>,
) -> Result<ResyncClientFolderResult> {
    let clients_dir = app_clients_dir(&app_handle)?;
    resync_client_folder_impl(&client_id, &clients_dir, Some(&app_handle), &state)
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

    let (db_filename, entity_type): (String, EntityType) =
        {
            let lock = state.app_db.lock().unwrap();
            let db = lock.as_ref().ok_or(AppError::NoActiveClient)?;
            let conn = db.conn();
            conn.query_row(
            "SELECT db_filename, entity_type FROM clients WHERE id = ?1 AND archived_at IS NULL",
            params![client_id],
            |row| {
                let entity_type_str: String = row.get(1)?;
                Ok((
                    row.get(0)?,
                    entity_type_str.parse::<EntityType>().unwrap_or(EntityType::SoleProp),
                ))
            },
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
    // Defensive: ensure documents table exists even if db was created by older migration
    client_db.conn().execute_batch(
        "CREATE TABLE IF NOT EXISTS documents (
            id          TEXT PRIMARY KEY,
            file_name   TEXT NOT NULL,
            file_path   TEXT NOT NULL,
            file_size   INTEGER NOT NULL DEFAULT 0,
            mime_type   TEXT NOT NULL DEFAULT 'application/octet-stream',
            file_hash   TEXT,
            category    TEXT NOT NULL DEFAULT 'general',
            tax_year    INTEGER,
            description TEXT,
            created_at  TEXT NOT NULL DEFAULT (datetime('now'))
        );",
    )?;
    ensure_chart_of_accounts(client_db.conn(), &entity_type)?;

    // Auto-run any due recurring transactions on client open. Non-fatal.
    let due_created = crate::commands::recurring::run_due_on_conn(client_db.conn());
    if due_created > 0 {
        log::info!("recurring: auto-created {due_created} transaction(s) on client switch");
    }

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

    update_optional_text(conn, &id, "contact_name", payload.contact_name.as_deref())?;
    update_optional_text(conn, &id, "email", payload.email.as_deref())?;
    update_optional_text(conn, &id, "phone", payload.phone.as_deref())?;
    update_optional_text(conn, &id, "address_line1", payload.address_line1.as_deref())?;
    update_optional_text(conn, &id, "address_line2", payload.address_line2.as_deref())?;
    update_optional_text(conn, &id, "city", payload.city.as_deref())?;
    update_optional_text(conn, &id, "state", payload.state.as_deref())?;
    update_optional_text(conn, &id, "postal_code", payload.postal_code.as_deref())?;
    update_optional_text(conn, &id, "country", payload.country.as_deref())?;
    update_optional_text(conn, &id, "website", payload.website.as_deref())?;
    update_optional_text(
        conn,
        &id,
        "tax_preparer_notes",
        payload.tax_preparer_notes.as_deref(),
    )?;
    update_optional_text(conn, &id, "filing_notes", payload.filing_notes.as_deref())?;
    update_optional_text(
        conn,
        &id,
        "source_folder_path",
        payload.source_folder_path.as_deref(),
    )?;

    let row: (
        String,
        String,
        String,
        Option<Vec<u8>>,
        Option<String>,
        Option<String>,
        Option<String>,
        Option<String>,
        Option<String>,
        Option<String>,
        Option<String>,
        Option<String>,
        Option<String>,
        Option<String>,
        Option<String>,
        Option<String>,
        Option<String>,
        u8,
        String,
        Option<String>,
        String,
    ) = conn
        .query_row(
            "SELECT id, name, entity_type, ein_encrypted, contact_name, email, phone,
                    address_line1, address_line2, city, state, postal_code, country,
                    website, tax_preparer_notes, filing_notes, source_folder_path, fiscal_year_start_month,
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
                    row.get(8)?,
                    row.get(9)?,
                    row.get(10)?,
                    row.get(11)?,
                    row.get(12)?,
                    row.get(13)?,
                    row.get(14)?,
                    row.get(15)?,
                    row.get(16)?,
                    row.get(17)?,
                    row.get(18)?,
                    row.get(19)?,
                    row.get(20)?,
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
        contact_name: row.4,
        email: row.5,
        phone: row.6,
        address_line1: row.7,
        address_line2: row.8,
        city: row.9,
        state: row.10,
        postal_code: row.11,
        country: row.12,
        website: row.13,
        tax_preparer_notes: row.14,
        filing_notes: row.15,
        source_folder_path: row.16,
        fiscal_year_start_month: row.17,
        accounting_method: row.18.parse().unwrap_or(AccountingMethod::Cash),
        archived_at: row.19.and_then(|s| s.parse().ok()),
        created_at: row.20.parse().unwrap_or_else(|_| chrono::Utc::now()),
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

fn app_clients_dir(app_handle: &tauri::AppHandle) -> Result<PathBuf> {
    let data_dir = app_handle.path().app_data_dir().map_err(|e| {
        AppError::Io(std::io::Error::new(
            std::io::ErrorKind::Other,
            e.to_string(),
        ))
    })?;

    Ok(data_dir.join("clients"))
}

fn normalize_optional_owned(value: Option<String>) -> Option<String> {
    value.and_then(|value| {
        let trimmed = value.trim();
        if trimmed.is_empty() {
            None
        } else {
            Some(trimmed.to_owned())
        }
    })
}

fn create_client_context(
    payload: CreateClientPayload,
    clients_dir: &Path,
    state: &AppState,
) -> Result<CreatedClientContext> {
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

    let entity_type = payload.entity_type;
    let ein = normalize_optional_owned(payload.ein);
    let contact_name = normalize_optional_owned(payload.contact_name);
    let email = normalize_optional_owned(payload.email);
    let phone = normalize_optional_owned(payload.phone);
    let address_line1 = normalize_optional_owned(payload.address_line1);
    let address_line2 = normalize_optional_owned(payload.address_line2);
    let city = normalize_optional_owned(payload.city);
    let state_name = normalize_optional_owned(payload.state);
    let postal_code = normalize_optional_owned(payload.postal_code);
    let country = normalize_optional_owned(payload.country);
    let website = normalize_optional_owned(payload.website);
    let tax_preparer_notes = normalize_optional_owned(payload.tax_preparer_notes);
    let filing_notes = normalize_optional_owned(payload.filing_notes);
    let source_folder_path = normalize_optional_owned(payload.source_folder_path);

    let ein_encrypted = if let Some(ein) = ein.as_deref() {
        let key = ein_key(&passphrase)?;
        Some(crate::db::encryption::encrypt_field(&key, ein.as_bytes())?)
    } else {
        None
    };

    let fiscal_year_start_month = payload.fiscal_year_start_month.unwrap_or(1);
    let accounting_method = payload.accounting_method.unwrap_or(AccountingMethod::Cash);

    {
        let lock = state.app_db.lock().unwrap();
        let db = lock.as_ref().ok_or(AppError::NoActiveClient)?;
        db.conn().execute(
            "INSERT INTO clients (id, name, entity_type, ein_encrypted, fiscal_year_start_month,
                accounting_method, db_filename, source_folder_path)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            params![
                client_id.clone(),
                name.clone(),
                entity_type.as_str(),
                ein_encrypted,
                fiscal_year_start_month as i64,
                accounting_method.as_str(),
                db_filename.clone(),
                source_folder_path.clone(),
            ],
        )?;
    }

    std::fs::create_dir_all(clients_dir)?;
    let client_db_path = clients_dir.join(&db_filename);
    let client_db = ClientDb::open(client_db_path.to_str().unwrap(), &client_id, &passphrase)?;
    seed_chart_of_accounts(client_db.conn(), &entity_type)?;

    Ok(CreatedClientContext {
        client: Client {
            id: client_id,
            name,
            entity_type,
            ein,
            contact_name,
            email,
            phone,
            address_line1,
            address_line2,
            city,
            state: state_name,
            postal_code,
            country,
            website,
            tax_preparer_notes,
            filing_notes,
            source_folder_path,
            fiscal_year_start_month,
            accounting_method,
            archived_at: None,
            created_at: chrono::Utc::now(),
        },
        client_db,
        db_filename,
    })
}

#[cfg(test)]
pub(crate) fn create_client_in_dir(
    payload: CreateClientPayload,
    clients_dir: &Path,
    state: &AppState,
) -> Result<Client> {
    Ok(create_client_context(payload, clients_dir, state)?.client)
}

pub(crate) fn bulk_import_client_folders_impl(
    folder_paths: Vec<String>,
    clients_dir: &Path,
    app_handle: Option<&tauri::AppHandle>,
    state: &AppState,
) -> Result<BulkImportClientsResult> {
    log::info!(
        "[bulk_import] Starting import of {} folder(s)",
        folder_paths.len()
    );
    let mut existing_active_clients = active_client_match_set(state)?;
    let mut result = BulkImportClientsResult {
        created: Vec::new(),
        skipped: Vec::new(),
        failed: Vec::new(),
    };

    let total = folder_paths.len();

    for (index, folder_path) in folder_paths.into_iter().enumerate() {
        log::info!(
            "[bulk_import] Processing folder {} of {}: {}",
            index + 1,
            total,
            folder_path
        );
        let prepared = match prepare_folder_import(&folder_path) {
            Ok(prepared) => prepared,
            Err(err) => {
                emit_import_progress(
                    app_handle,
                    BulkImportProgressEvent {
                        operation: "bulk_import".to_owned(),
                        stage: "failed".to_owned(),
                        status: "failed".to_owned(),
                        folder_path: folder_path.clone(),
                        client_id: None,
                        client_name: None,
                        current: index + 1,
                        total,
                        scanned_document_count: None,
                        imported_document_count: None,
                        duplicate_document_count: None,
                        deduped_count: None,
                        reason: Some(err.to_string()),
                    },
                );
                log::warn!(
                    "[bulk_import] Failed to prepare folder '{}': {}",
                    folder_path,
                    err
                );
                result.failed.push(BulkImportFailedClient {
                    folder_path,
                    client_name: None,
                    reason: err.to_string(),
                });
                continue;
            }
        };
        let scanned_document_count = prepared.documents.len();

        emit_import_progress(
            app_handle,
            BulkImportProgressEvent {
                operation: "bulk_import".to_owned(),
                stage: "processing".to_owned(),
                status: "processing".to_owned(),
                folder_path: prepared.folder_path.clone(),
                client_id: None,
                client_name: Some(prepared.client_name.clone()),
                current: index + 1,
                total,
                scanned_document_count: Some(scanned_document_count),
                imported_document_count: None,
                duplicate_document_count: None,
                deduped_count: None,
                reason: None,
            },
        );

        if let Some(reason) = duplicate_client_reason(&prepared, &existing_active_clients) {
            emit_import_progress(
                app_handle,
                BulkImportProgressEvent {
                    operation: "bulk_import".to_owned(),
                    stage: "skipped".to_owned(),
                    status: "skipped".to_owned(),
                    folder_path: prepared.folder_path.clone(),
                    client_id: None,
                    client_name: Some(prepared.client_name.clone()),
                    current: index + 1,
                    total,
                    scanned_document_count: Some(scanned_document_count),
                    imported_document_count: Some(0),
                    duplicate_document_count: Some(0),
                    deduped_count: Some(0),
                    reason: Some(reason.to_owned()),
                },
            );
            log::info!(
                "[bulk_import] Skipped folder '{}': {}",
                prepared.folder_path,
                reason
            );
            result.skipped.push(BulkImportSkippedClient {
                folder_path: prepared.folder_path,
                client_name: prepared.client_name,
                reason: reason.to_owned(),
            });
            continue;
        }

        let client_name = prepared.client_name.clone();
        let create_payload = CreateClientPayload {
            name: prepared.client_name.clone(),
            entity_type: EntityType::I1040,
            ein: prepared.tax_id.clone(),
            contact_name: None,
            email: None,
            phone: None,
            address_line1: None,
            address_line2: None,
            city: None,
            state: None,
            postal_code: None,
            country: None,
            website: None,
            tax_preparer_notes: None,
            filing_notes: None,
            source_folder_path: Some(prepared.folder_path.clone()),
            fiscal_year_start_month: None,
            accounting_method: None,
        };

        let context = match create_client_context(create_payload, clients_dir, state) {
            Ok(context) => context,
            Err(err) => {
                emit_import_progress(
                    app_handle,
                    BulkImportProgressEvent {
                        operation: "bulk_import".to_owned(),
                        stage: "failed".to_owned(),
                        status: "failed".to_owned(),
                        folder_path: prepared.folder_path.clone(),
                        client_id: None,
                        client_name: Some(client_name.clone()),
                        current: index + 1,
                        total,
                        scanned_document_count: Some(scanned_document_count),
                        imported_document_count: None,
                        duplicate_document_count: None,
                        deduped_count: None,
                        reason: Some(err.to_string()),
                    },
                );
                result.failed.push(BulkImportFailedClient {
                    folder_path: prepared.folder_path,
                    client_name: Some(client_name),
                    reason: err.to_string(),
                });
                continue;
            }
        };

        let import_result =
            import_prepared_documents(context.client_db.conn(), &prepared.documents);
        match import_result {
            Ok(import_stats) => {
                existing_active_clients.push(ExistingActiveClientMatch {
                    name: context.client.name.to_lowercase(),
                    source_folder_path: normalize_path_for_match(
                        context.client.source_folder_path.as_deref(),
                    ),
                    tax_id: normalize_tax_id(context.client.ein.as_deref()),
                });
                emit_import_progress(
                    app_handle,
                    BulkImportProgressEvent {
                        operation: "bulk_import".to_owned(),
                        stage: "completed".to_owned(),
                        status: "completed".to_owned(),
                        folder_path: prepared.folder_path.clone(),
                        client_id: Some(context.client.id.clone()),
                        client_name: Some(context.client.name.clone()),
                        current: index + 1,
                        total,
                        scanned_document_count: Some(scanned_document_count),
                        imported_document_count: Some(import_stats.imported_count),
                        duplicate_document_count: Some(import_stats.duplicate_count),
                        deduped_count: Some(import_stats.duplicate_count),
                        reason: None,
                    },
                );
                log::info!(
                    "[bulk_import] Created client '{}' with {} docs ({} imported, {} duplicates)",
                    context.client.name,
                    scanned_document_count,
                    import_stats.imported_count,
                    import_stats.duplicate_count
                );
                result.created.push(BulkImportedClient {
                    folder_path: prepared.folder_path,
                    client: context.client,
                    scanned_document_count,
                    imported_document_count: import_stats.imported_count,
                    duplicate_document_count: import_stats.duplicate_count,
                    deduped_document_count: import_stats.duplicate_count,
                });
            }
            Err(err) => {
                let failed_folder_path = prepared.folder_path;
                let failed_client_name = Some(context.client.name.clone());
                let client_id = context.client.id.clone();
                let db_filename = context.db_filename.clone();
                drop(context);
                cleanup_created_client(state, clients_dir, &client_id, &db_filename);
                emit_import_progress(
                    app_handle,
                    BulkImportProgressEvent {
                        operation: "bulk_import".to_owned(),
                        stage: "failed".to_owned(),
                        status: "failed".to_owned(),
                        folder_path: failed_folder_path.clone(),
                        client_id: Some(client_id),
                        client_name: failed_client_name.clone(),
                        current: index + 1,
                        total,
                        scanned_document_count: Some(scanned_document_count),
                        imported_document_count: None,
                        duplicate_document_count: None,
                        deduped_count: None,
                        reason: Some(err.to_string()),
                    },
                );
                log::error!(
                    "[bulk_import] Failed folder '{}': {}",
                    failed_folder_path,
                    err
                );
                result.failed.push(BulkImportFailedClient {
                    folder_path: failed_folder_path,
                    client_name: failed_client_name,
                    reason: err.to_string(),
                });
            }
        }
    }

    log::info!(
        "[bulk_import] Complete: {} created, {} skipped, {} failed",
        result.created.len(),
        result.skipped.len(),
        result.failed.len()
    );
    Ok(result)
}

pub(crate) fn resync_client_folder_impl(
    client_id: &str,
    clients_dir: &Path,
    app_handle: Option<&tauri::AppHandle>,
    state: &AppState,
) -> Result<ResyncClientFolderResult> {
    let client = get_client_by_id(state, client_id)?;
    let source_folder_path = client.source_folder_path.clone().ok_or_else(|| {
        AppError::Validation(format!("client {} has no source folder path", client.name))
    })?;

    emit_import_progress(
        app_handle,
        BulkImportProgressEvent {
            operation: "resync".to_owned(),
            stage: "processing".to_owned(),
            status: "processing".to_owned(),
            folder_path: source_folder_path.clone(),
            client_id: Some(client.id.clone()),
            client_name: Some(client.name.clone()),
            current: 1,
            total: 1,
            scanned_document_count: None,
            imported_document_count: None,
            duplicate_document_count: None,
            deduped_count: None,
            reason: None,
        },
    );

    let prepared = prepare_folder_import(&source_folder_path)?;
    let scanned_document_count = prepared.documents.len();
    let client_db = open_client_db_in_dir(state, clients_dir, client_id)?;
    let import_stats = import_prepared_documents(client_db.conn(), &prepared.documents)?;

    emit_import_progress(
        app_handle,
        BulkImportProgressEvent {
            operation: "resync".to_owned(),
            stage: "completed".to_owned(),
            status: "completed".to_owned(),
            folder_path: prepared.folder_path.clone(),
            client_id: Some(client.id.clone()),
            client_name: Some(client.name.clone()),
            current: 1,
            total: 1,
            scanned_document_count: Some(scanned_document_count),
            imported_document_count: Some(import_stats.imported_count),
            duplicate_document_count: Some(import_stats.duplicate_count),
            deduped_count: Some(import_stats.duplicate_count),
            reason: None,
        },
    );

    Ok(ResyncClientFolderResult {
        client_id: client.id.clone(),
        client_name: client.name.clone(),
        client,
        source_folder_path: prepared.folder_path,
        scanned_document_count,
        imported_document_count: import_stats.imported_count,
        duplicate_document_count: import_stats.duplicate_count,
        deduped_document_count: import_stats.duplicate_count,
    })
}

fn active_client_match_set(state: &AppState) -> Result<Vec<ExistingActiveClientMatch>> {
    let lock = state.app_db.lock().unwrap();
    let db = lock.as_ref().ok_or(AppError::NoActiveClient)?;
    let passphrase = state.passphrase.lock().unwrap().clone().unwrap_or_default();
    let key = ein_key(&passphrase)?;

    let mut stmt = db.conn().prepare(
        "SELECT name, source_folder_path, ein_encrypted FROM clients WHERE archived_at IS NULL",
    )?;
    let clients = stmt
        .query_map([], |row| {
            let ein = row
                .get::<_, Option<Vec<u8>>>(2)?
                .and_then(|blob| crate::db::encryption::decrypt_field(&key, &blob).ok())
                .and_then(|bytes| String::from_utf8(bytes).ok());
            Ok(ExistingActiveClientMatch {
                name: row.get::<_, String>(0)?.to_lowercase(),
                source_folder_path: normalize_path_for_match(
                    row.get::<_, Option<String>>(1)?.as_deref(),
                ),
                tax_id: normalize_tax_id(ein.as_deref()),
            })
        })?
        .filter_map(|row| row.ok())
        .collect();
    Ok(clients)
}

fn prepare_folder_import(folder_path: &str) -> Result<PreparedFolderImport> {
    let canonical_path = std::fs::canonicalize(folder_path)?;
    if !canonical_path.is_dir() {
        return Err(AppError::Validation(format!(
            "folder path is not a directory: {}",
            canonical_path.display()
        )));
    }

    let client_name = canonical_path
        .file_name()
        .and_then(|name| name.to_str())
        .map(str::trim)
        .filter(|name| !name.is_empty())
        .map(str::to_owned)
        .ok_or_else(|| {
            AppError::Validation(format!(
                "could not derive client name from folder: {}",
                canonical_path.display()
            ))
        })?;

    let documents = files::list_scannable_files_recursive(&canonical_path)?
        .into_iter()
        .map(|path| prepared_document_from_path(&path))
        .collect::<Result<Vec<_>>>()?;

    let tax_id = extract_tax_id_from_folder(&client_name, &documents);

    Ok(PreparedFolderImport {
        folder_path: canonical_path.to_string_lossy().into_owned(),
        client_name,
        tax_id,
        documents,
    })
}

fn prepared_document_from_path(path: &Path) -> Result<PreparedImportedDocument> {
    let metadata = std::fs::metadata(path)?;
    let file_size = i64::try_from(metadata.len()).map_err(|_| {
        AppError::Validation(format!("file is too large to import: {}", path.display()))
    })?;

    let tax_year = detect_tax_year_from_path(path);

    Ok(PreparedImportedDocument {
        file_name: path
            .file_name()
            .and_then(|name| name.to_str())
            .unwrap_or_default()
            .to_owned(),
        file_path: path.to_string_lossy().into_owned(),
        file_size,
        mime_type: files::guess_mime_type(path).to_owned(),
        file_hash: crate::commands::documents::compute_file_hash(path)?,
        category: categorize_imported_document(path),
        tax_year,
    })
}

/// Detect tax year from file path by examining parent folder names and file name.
/// Looks for 4-digit years (2000-2099) in folder names like "2024", "Tax_2024", "2024_Returns".
fn detect_tax_year_from_path(path: &Path) -> Option<i32> {
    let current_year = chrono::Utc::now().year();

    // Check each component of the path for a year
    for component in path.ancestors() {
        if let Some(name) = component.file_name().and_then(|n| n.to_str()) {
            if let Some(year) = extract_year_from_string(name, current_year) {
                return Some(year);
            }
        }
    }

    // Also check the file name itself
    if let Some(file_name) = path.file_name().and_then(|n| n.to_str()) {
        if let Some(year) = extract_year_from_string(file_name, current_year) {
            return Some(year);
        }
    }

    None
}

/// Extract a valid tax year (2000 to current_year+1) from a string.
fn extract_year_from_string(s: &str, current_year: i32) -> Option<i32> {
    let re = regex::Regex::new(r"\b(20[0-9]{2})\b").ok()?;
    for cap in re.captures_iter(s) {
        if let Some(m) = cap.get(1) {
            if let Ok(year) = m.as_str().parse::<i32>() {
                if year >= 2000 && year <= current_year + 1 {
                    return Some(year);
                }
            }
        }
    }
    None
}

fn import_prepared_documents(
    conn: &rusqlite::Connection,
    documents: &[PreparedImportedDocument],
) -> Result<DocumentImportStats> {
    let starting_count: i64 =
        conn.query_row("SELECT COUNT(*) FROM documents", [], |row| row.get(0))?;
    for document in documents {
        crate::commands::documents::insert_document_record(
            conn,
            AddDocumentPayload {
                file_name: document.file_name.clone(),
                file_path: document.file_path.clone(),
                file_size: document.file_size,
                mime_type: document.mime_type.clone(),
                file_hash: Some(document.file_hash.clone()),
                category: Some(document.category.clone()),
                tax_year: document.tax_year,
                description: None,
            },
        )?;
    }

    let ending_count: i64 =
        conn.query_row("SELECT COUNT(*) FROM documents", [], |row| row.get(0))?;
    let imported_count = usize::try_from(ending_count.saturating_sub(starting_count)).unwrap_or(0);
    let duplicate_count = documents.len().saturating_sub(imported_count);

    Ok(DocumentImportStats {
        imported_count,
        duplicate_count,
    })
}

fn get_client_by_id(state: &AppState, id: &str) -> Result<Client> {
    let passphrase = state.passphrase.lock().unwrap().clone().unwrap_or_default();
    let lock = state.app_db.lock().unwrap();
    let db = lock.as_ref().ok_or(AppError::NoActiveClient)?;
    let conn = db.conn();

    let row: (
        String,
        String,
        String,
        Option<Vec<u8>>,
        Option<String>,
        Option<String>,
        Option<String>,
        Option<String>,
        Option<String>,
        Option<String>,
        Option<String>,
        Option<String>,
        Option<String>,
        Option<String>,
        Option<String>,
        Option<String>,
        Option<String>,
        u8,
        String,
        Option<String>,
        String,
    ) = conn
        .query_row(
            "SELECT id, name, entity_type, ein_encrypted, contact_name, email, phone,
                    address_line1, address_line2, city, state, postal_code, country,
                    website, tax_preparer_notes, filing_notes, source_folder_path, fiscal_year_start_month,
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
                    row.get(8)?,
                    row.get(9)?,
                    row.get(10)?,
                    row.get(11)?,
                    row.get(12)?,
                    row.get(13)?,
                    row.get(14)?,
                    row.get(15)?,
                    row.get(16)?,
                    row.get(17)?,
                    row.get(18)?,
                    row.get(19)?,
                    row.get(20)?,
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
        contact_name: row.4,
        email: row.5,
        phone: row.6,
        address_line1: row.7,
        address_line2: row.8,
        city: row.9,
        state: row.10,
        postal_code: row.11,
        country: row.12,
        website: row.13,
        tax_preparer_notes: row.14,
        filing_notes: row.15,
        source_folder_path: row.16,
        fiscal_year_start_month: row.17,
        accounting_method: row.18.parse().unwrap_or(AccountingMethod::Cash),
        archived_at: row.19.and_then(|s| s.parse().ok()),
        created_at: row.20.parse().unwrap_or_else(|_| chrono::Utc::now()),
    })
}

fn open_client_db_in_dir(
    state: &AppState,
    clients_dir: &Path,
    client_id: &str,
) -> Result<ClientDb> {
    let active_lock = state.active_client.lock().unwrap();
    if let Some(active_client) = active_lock.as_ref() {
        if active_client.client_id == client_id {
            drop(active_lock);
            let passphrase = state.passphrase.lock().unwrap().clone().unwrap_or_default();
            let db_filename = client_db_filename(state, client_id)?;
            return ClientDb::open(
                clients_dir.join(db_filename).to_str().unwrap(),
                client_id,
                &passphrase,
            );
        }
    }
    drop(active_lock);

    let passphrase = state.passphrase.lock().unwrap().clone().unwrap_or_default();
    let db_filename = client_db_filename(state, client_id)?;
    ClientDb::open(
        clients_dir.join(db_filename).to_str().unwrap(),
        client_id,
        &passphrase,
    )
}

fn client_db_filename(state: &AppState, client_id: &str) -> Result<String> {
    let lock = state.app_db.lock().unwrap();
    let db = lock.as_ref().ok_or(AppError::NoActiveClient)?;
    db.conn()
        .query_row(
            "SELECT db_filename FROM clients WHERE id = ?1 AND archived_at IS NULL",
            params![client_id],
            |row| row.get(0),
        )
        .map_err(|_| AppError::NotFound(format!("client {client_id}")))
}

fn duplicate_client_reason(
    prepared: &PreparedFolderImport,
    existing_clients: &[ExistingActiveClientMatch],
) -> Option<&'static str> {
    let prepared_source_folder = normalize_path_for_match(Some(prepared.folder_path.as_str()));
    let prepared_name = prepared.client_name.to_lowercase();
    let prepared_tax_id = normalize_tax_id(prepared.tax_id.as_deref());

    for existing_client in existing_clients {
        if prepared_source_folder.is_some()
            && prepared_source_folder == existing_client.source_folder_path
        {
            return Some("duplicate active client source folder path");
        }

        if prepared_tax_id.is_some() && prepared_tax_id == existing_client.tax_id {
            return Some("duplicate active client EIN/SSN");
        }

        if prepared_name == existing_client.name {
            return Some("duplicate active client name");
        }
    }

    None
}

fn extract_tax_id_from_folder(
    client_name: &str,
    documents: &[PreparedImportedDocument],
) -> Option<String> {
    extract_tax_id(client_name).or_else(|| {
        documents
            .iter()
            .find_map(|document| extract_tax_id(document.file_name.as_str()))
    })
}

fn extract_tax_id(value: &str) -> Option<String> {
    let chars: Vec<char> = value.chars().collect();
    for window in chars.windows(11) {
        let candidate: String = window.iter().collect();
        if is_formatted_ein(&candidate) || is_formatted_ssn(&candidate) {
            return Some(candidate);
        }
    }

    let digits: String = value.chars().filter(|ch| ch.is_ascii_digit()).collect();
    if digits.len() == 9 {
        return Some(digits);
    }

    None
}

fn is_formatted_ein(value: &str) -> bool {
    value.len() == 10
        && value.chars().nth(2) == Some('-')
        && value
            .chars()
            .enumerate()
            .all(|(index, ch)| index == 2 || ch.is_ascii_digit())
}

fn is_formatted_ssn(value: &str) -> bool {
    value.len() == 11
        && value.chars().nth(3) == Some('-')
        && value.chars().nth(6) == Some('-')
        && value
            .chars()
            .enumerate()
            .all(|(index, ch)| matches!(index, 3 | 6) || ch.is_ascii_digit())
}

fn normalize_path_for_match(value: Option<&str>) -> Option<String> {
    value.and_then(|value| {
        let trimmed = value.trim();
        if trimmed.is_empty() {
            return None;
        }

        std::fs::canonicalize(trimmed)
            .ok()
            .map(|path| path.to_string_lossy().into_owned())
            .or_else(|| Some(trimmed.to_owned()))
    })
}

fn normalize_tax_id(value: Option<&str>) -> Option<String> {
    value.and_then(|value| {
        let digits: String = value.chars().filter(|ch| ch.is_ascii_digit()).collect();
        if digits.len() == 9 {
            Some(digits)
        } else {
            None
        }
    })
}

fn categorize_imported_document(path: &Path) -> String {
    let file_name = path
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or_default()
        .to_ascii_lowercase();

    if file_name.contains("organizer") {
        return "organizer".to_owned();
    }
    if file_name.contains("w-2") || file_name.contains("w2") {
        return "w2".to_owned();
    }
    if file_name.contains("1099") {
        return "1099".to_owned();
    }
    if file_name.contains("receipt") {
        return "receipt".to_owned();
    }
    if file_name.contains("bank statement")
        || (file_name.contains("bank") && file_name.contains("statement"))
    {
        return "bank_statement".to_owned();
    }
    if file_name.contains("tax return")
        || file_name.contains("1040")
        || file_name.contains("return")
    {
        return "tax_return".to_owned();
    }

    "general".to_owned()
}

fn emit_import_progress(app_handle: Option<&tauri::AppHandle>, payload: BulkImportProgressEvent) {
    if let Some(app_handle) = app_handle {
        let _ = app_handle.emit("clients://import-progress", payload);
    }
}

fn cleanup_created_client(
    state: &AppState,
    clients_dir: &Path,
    client_id: &str,
    db_filename: &str,
) {
    if let Ok(lock) = state.app_db.lock() {
        if let Some(db) = lock.as_ref() {
            let _ = db
                .conn()
                .execute("DELETE FROM clients WHERE id = ?1", params![client_id]);
        }
    }

    let client_db_path = clients_dir.join(db_filename);
    let _ = std::fs::remove_file(client_db_path);
}

fn update_optional_text(
    conn: &rusqlite::Connection,
    id: &str,
    column: &str,
    value: Option<&str>,
) -> Result<()> {
    if let Some(value) = value {
        let trimmed = value.trim();
        let normalized = if trimmed.is_empty() {
            None
        } else {
            Some(trimmed)
        };
        conn.execute(
            &format!("UPDATE clients SET {column} = ?1 WHERE id = ?2"),
            params![normalized, id],
        )?;
    }
    Ok(())
}

fn seed_values(entity_type: &EntityType) -> Result<Vec<Value>> {
    let seed_json: &str = match entity_type {
        EntityType::SoleProp => include_str!("../../seeds/coa_sole_prop.json"),
        EntityType::Smllc => include_str!("../../seeds/coa_smllc.json"),
        EntityType::Scorp => include_str!("../../seeds/coa_scorp.json"),
        EntityType::Ccorp => include_str!("../../seeds/coa_ccorp.json"),
        EntityType::Partnership => include_str!("../../seeds/coa_partnership.json"),
        EntityType::I1040 => include_str!("../../seeds/coa_i1040.json"),
    };

    Ok(serde_json::from_str(seed_json)?)
}

pub fn ensure_chart_of_accounts_public(
    conn: &rusqlite::Connection,
    entity_type: &EntityType,
) -> Result<()> {
    ensure_chart_of_accounts(conn, entity_type)
}

fn ensure_chart_of_accounts(conn: &rusqlite::Connection, entity_type: &EntityType) -> Result<()> {
    let seeds = seed_values(entity_type)?;

    let mut existing: std::collections::HashMap<String, String> = std::collections::HashMap::new();
    let mut stmt = conn.prepare("SELECT id, code FROM accounts")?;
    let rows = stmt.query_map([], |row| {
        Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
    })?;
    for row in rows.flatten() {
        existing.insert(row.1, row.0);
    }

    for seed in &seeds {
        let code = seed["code"].as_str().unwrap_or("").to_owned();
        if code.is_empty() || existing.contains_key(&code) {
            continue;
        }

        let id = Uuid::new_v4().to_string();
        let name = seed["name"].as_str().unwrap_or("");
        let account_type = seed["account_type"].as_str().unwrap_or("expense");
        let schedule_c_line = seed["schedule_c_line"].as_str();
        let sort_order = seed["sort_order"].as_i64().unwrap_or(0);
        // B2: populate system_account_role from seed so cash-flow queries use FK.
        let system_account_role = seed["system_account_role"].as_str();

        conn.execute(
            "INSERT INTO accounts (id, code, name, account_type, parent_id, schedule_c_line, active, sort_order, system_account_role)
             VALUES (?1, ?2, ?3, ?4, NULL, ?5, 1, ?6, ?7)",
            params![id, code, name, account_type, schedule_c_line, sort_order, system_account_role],
        )?;

        existing.insert(code, id);
    }

    for seed in &seeds {
        let code = seed["code"].as_str().unwrap_or("");
        if let Some(parent_code) = seed["parent_id"].as_str() {
            if let (Some(id), Some(parent_id)) = (existing.get(code), existing.get(parent_code)) {
                conn.execute(
                    "UPDATE accounts SET parent_id = ?1 WHERE id = ?2",
                    params![parent_id, id],
                )?;
            }
        }
    }

    // B2: back-fill system_account_role for accounts that already exist but have no role.
    for seed in &seeds {
        let code = seed["code"].as_str().unwrap_or("");
        if let Some(role) = seed["system_account_role"].as_str() {
            if let Some(id) = existing.get(code) {
                conn.execute(
                    "UPDATE accounts SET system_account_role = ?1
                     WHERE id = ?2 AND system_account_role IS NULL",
                    params![role, id],
                )?;
            }
        }
    }

    Ok(())
}

fn seed_chart_of_accounts(conn: &rusqlite::Connection, entity_type: &EntityType) -> Result<()> {
    let seeds = seed_values(entity_type)?;

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
        // B2: populate system_account_role from seed so cash-flow queries use FK.
        let system_account_role = seed["system_account_role"].as_str();

        conn.execute(
            "INSERT INTO accounts (id, code, name, account_type, parent_id, schedule_c_line, sort_order, system_account_role)
             VALUES (?1, ?2, ?3, ?4, NULL, ?5, ?6, ?7)",
            params![id, code, name, account_type, schedule_c_line, sort_order, system_account_role],
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
