use rusqlite::params;
use serde::Serialize;
use std::path::Path;

use crate::error::{AppError, Result};
use crate::state::AppState;

#[derive(Serialize)]
pub struct ExportResult {
    pub folder: String,
    pub client_count: i32,
    pub document_count: i32,
}

#[tauri::command(rename_all = "camelCase")]
pub fn export_client_documents(
    client_id: String,
    output_folder: String,
    state: tauri::State<AppState>,
) -> Result<ExportResult> {
    let (client_name, docs) = {
        let lock = state.active_client.lock().unwrap();
        let ac = lock.as_ref().ok_or(AppError::NoActiveClient)?;
        let conn = ac.db.conn();

        let client_name: String = conn
            .query_row(
                "SELECT name FROM clients WHERE id = ?1",
                params![client_id],
                |r| r.get(0),
            )
            .map_err(|_| AppError::NotFound("client".into()))?;

        let mut stmt =
            conn.prepare("SELECT file_name, file_path FROM documents ORDER BY created_at")?;
        let docs: Vec<(String, String)> = stmt
            .query_map([], |row| Ok((row.get(0)?, row.get(1)?)))?
            .filter_map(|r| r.ok())
            .collect();
        (client_name, docs)
    };

    let safe_name = sanitize_filename(&client_name);
    let client_folder = Path::new(&output_folder).join(&safe_name);
    std::fs::create_dir_all(&client_folder)?;

    let info_path = client_folder.join("_client_info.txt");
    let info = format!(
        "Client: {}\nID: {}\nExported: {}\nDocuments: {}\n",
        client_name,
        client_id,
        chrono::Utc::now().format("%Y-%m-%d %H:%M UTC"),
        docs.len()
    );
    std::fs::write(&info_path, info)?;

    let mut doc_count = 0;
    for (file_name, file_path) in &docs {
        let src = Path::new(file_path);
        if src.exists() {
            let dst = client_folder.join(sanitize_filename(file_name));
            if let Err(e) = std::fs::copy(src, &dst) {
                log::warn!("Failed to copy {}: {e}", file_name);
            } else {
                doc_count += 1;
            }
        }
    }

    Ok(ExportResult {
        folder: client_folder.to_string_lossy().to_string(),
        client_count: 1,
        document_count: doc_count,
    })
}

#[tauri::command(rename_all = "camelCase")]
pub fn export_all_clients_documents(
    output_folder: String,
    state: tauri::State<AppState>,
) -> Result<ExportResult> {
    let clients = {
        let lock = state.app_db.lock().unwrap();
        let db = lock.as_ref().ok_or(AppError::NoActiveClient)?;
        let conn = db.conn();
        let mut stmt = conn.prepare(
            "SELECT c.id, c.name FROM clients c WHERE c.archived_at IS NULL ORDER BY c.name",
        )?;
        let rows: Vec<(String, String)> = stmt
            .query_map([], |row| Ok((row.get(0)?, row.get(1)?)))?
            .filter_map(|r| r.ok())
            .collect();
        rows
    };

    let mut total_docs = 0;
    let mut client_count = 0;

    for (client_id, _client_name) in &clients {
        match export_single_client(client_id, &output_folder, &state) {
            Ok(count) => {
                total_docs += count;
                client_count += 1;
            }
            Err(e) => {
                log::warn!("Failed to export client {client_id}: {e}");
            }
        }
    }

    Ok(ExportResult {
        folder: output_folder,
        client_count,
        document_count: total_docs,
    })
}

fn export_single_client(client_id: &str, output_folder: &str, state: &AppState) -> Result<i32> {
    let (client_name, docs) = {
        let lock = state.active_client.lock().unwrap();
        let ac = lock.as_ref().ok_or(AppError::NoActiveClient)?;
        let conn = ac.db.conn();

        let client_name: String = conn
            .query_row(
                "SELECT name FROM clients WHERE id = ?1",
                params![client_id],
                |r| r.get(0),
            )
            .map_err(|_| AppError::NotFound("client".into()))?;

        let mut stmt =
            conn.prepare("SELECT file_name, file_path FROM documents ORDER BY created_at")?;
        let docs: Vec<(String, String)> = stmt
            .query_map([], |row| Ok((row.get(0)?, row.get(1)?)))?
            .filter_map(|r| r.ok())
            .collect();
        (client_name, docs)
    };

    let safe_name = sanitize_filename(&client_name);
    let client_folder = Path::new(output_folder).join(&safe_name);
    std::fs::create_dir_all(&client_folder)?;

    let info_path = client_folder.join("_client_info.txt");
    let info = format!(
        "Client: {}\nID: {}\nExported: {}\nDocuments: {}\n",
        client_name,
        client_id,
        chrono::Utc::now().format("%Y-%m-%d %H:%M UTC"),
        docs.len()
    );
    std::fs::write(&info_path, info)?;

    let mut doc_count = 0;
    for (file_name, file_path) in &docs {
        let src = Path::new(file_path);
        if src.exists() {
            let dst = client_folder.join(sanitize_filename(file_name));
            if std::fs::copy(src, &dst).is_ok() {
                doc_count += 1;
            }
        }
    }

    Ok(doc_count)
}

fn sanitize_filename(name: &str) -> String {
    name.chars()
        .map(|c| {
            if c.is_alphanumeric() || c == ' ' || c == '-' || c == '_' || c == '.' {
                c
            } else {
                '_'
            }
        })
        .collect::<String>()
        .trim()
        .to_string()
}
