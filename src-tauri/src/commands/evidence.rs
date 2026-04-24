use crate::commands::scoped::with_scoped_conn;
use crate::domain::evidence::Evidence;
use crate::error::Result;
use crate::state::AppState;

#[tauri::command(rename_all = "camelCase")]
pub fn store_evidence(
    client_id: String,
    source_type: String,
    file_name: Option<String>,
    file_data: Option<Vec<u8>>,
    ocr_text: Option<String>,
    extracted_fields: Option<String>,
    model_used: String,
    confidence: Option<f64>,
    app_handle: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
) -> Result<Evidence> {
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

    let fp = file_path.clone();
    with_scoped_conn(&state, Some(&app_handle), Some(&client_id), |conn| {
        crate::db::evidence_db::insert_evidence(
            conn,
            &client_id,
            &source_type,
            file_name.as_deref(),
            None,
            fp.as_deref(),
            ocr_text.as_deref(),
            extracted_fields.as_deref(),
            &model_used,
            confidence,
        )
    })
}

#[tauri::command(rename_all = "camelCase")]
pub fn get_evidence(
    client_id: String,
    evidence_id: String,
    app_handle: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
) -> Result<Evidence> {
    with_scoped_conn(&state, Some(&app_handle), Some(&client_id), |conn| {
        crate::db::evidence_db::get_evidence(conn, &client_id, &evidence_id)
    })
}

#[tauri::command(rename_all = "camelCase")]
pub fn list_evidence(
    client_id: String,
    app_handle: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
) -> Result<Vec<Evidence>> {
    with_scoped_conn(&state, Some(&app_handle), Some(&client_id), |conn| {
        crate::db::evidence_db::list_evidence(conn, &client_id)
    })
}

#[tauri::command(rename_all = "camelCase")]
pub fn delete_evidence(
    client_id: String,
    evidence_id: String,
    app_handle: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
) -> Result<()> {
    with_scoped_conn(&state, Some(&app_handle), Some(&client_id), |conn| {
        crate::db::evidence_db::delete_evidence(conn, &client_id, &evidence_id)
    })
}
