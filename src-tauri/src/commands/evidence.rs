use crate::domain::evidence::Evidence;
use crate::error::{AppError, Result};
use crate::state::AppState;

#[tauri::command(rename_all = "camelCase")]
pub fn store_evidence(
    state: tauri::State<'_, AppState>,
    client_id: String,
    source_type: String,
    file_name: Option<String>,
    file_data: Option<Vec<u8>>,
    ocr_text: Option<String>,
    extracted_fields: Option<String>,
    model_used: String,
    confidence: Option<f64>,
) -> Result<Evidence> {
    let lock = state.active_client.lock().unwrap();
    let ac = lock.as_ref().ok_or(AppError::NoActiveClient)?;

    if ac.client_id != client_id {
        return Err(AppError::NotFound(format!("client {client_id}")));
    }

    let conn = ac.db.conn();

    let mut file_path: Option<String> = None;
    if let Some(data) = file_data {
        let name = file_name.as_deref().unwrap_or("unnamed");
        let id = uuid::Uuid::new_v4().to_string();
        let dir = dirs::data_dir()
            .unwrap_or_else(|| std::path::PathBuf::from("."))
            .join("taxeasy")
            .join("evidence");
        std::fs::create_dir_all(&dir)?;
        let path = dir.join(format!("{id}_{name}"));
        std::fs::write(&path, &data)?;
        file_path = Some(path.to_string_lossy().to_string());
    }

    crate::db::evidence_db::insert_evidence(
        conn,
        &client_id,
        &source_type,
        file_name.as_deref(),
        file_path.as_deref(),
        file_path.as_deref(),
        ocr_text.as_deref(),
        extracted_fields.as_deref(),
        &model_used,
        confidence,
    )
}

#[tauri::command(rename_all = "camelCase")]
pub fn get_evidence(
    state: tauri::State<'_, AppState>,
    client_id: String,
    evidence_id: String,
) -> Result<Evidence> {
    let lock = state.active_client.lock().unwrap();
    let ac = lock.as_ref().ok_or(AppError::NoActiveClient)?;

    if ac.client_id != client_id {
        return Err(AppError::NotFound(format!("client {client_id}")));
    }

    let conn = ac.db.conn();
    crate::db::evidence_db::get_evidence(conn, &client_id, &evidence_id)
}

#[tauri::command(rename_all = "camelCase")]
pub fn list_evidence(
    state: tauri::State<'_, AppState>,
    client_id: String,
) -> Result<Vec<Evidence>> {
    let lock = state.active_client.lock().unwrap();
    let ac = lock.as_ref().ok_or(AppError::NoActiveClient)?;

    if ac.client_id != client_id {
        return Err(AppError::NotFound(format!("client {client_id}")));
    }

    let conn = ac.db.conn();
    crate::db::evidence_db::list_evidence(conn, &client_id)
}

#[tauri::command(rename_all = "camelCase")]
pub fn delete_evidence(
    state: tauri::State<'_, AppState>,
    client_id: String,
    evidence_id: String,
) -> Result<()> {
    let lock = state.active_client.lock().unwrap();
    let ac = lock.as_ref().ok_or(AppError::NoActiveClient)?;

    if ac.client_id != client_id {
        return Err(AppError::NotFound(format!("client {client_id}")));
    }

    let conn = ac.db.conn();
    crate::db::evidence_db::delete_evidence(conn, &client_id, &evidence_id)
}
