use std::io::Write;
use tauri::Manager;

#[tauri::command(rename_all = "camelCase")]
pub async fn log_error(
    app_handle: tauri::AppHandle,
    message: String,
    stack: Option<String>,
) -> Result<(), String> {
    let log_dir = app_handle
        .path()
        .app_log_dir()
        .map_err(|e| format!("could not resolve log dir: {e}"))?;

    std::fs::create_dir_all(&log_dir)
        .map_err(|e| format!("could not create log dir: {e}"))?;

    let log_path = log_dir.join("errors.log");

    let ts = chrono::Utc::now().to_rfc3339();
    let entry = serde_json::json!({
        "ts": ts,
        "level": "error",
        "msg": message,
        "stack": stack,
    });

    let mut line = entry.to_string();
    line.push('\n');

    let mut file = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&log_path)
        .map_err(|e| format!("could not open error log: {e}"))?;

    file.write_all(line.as_bytes())
        .map_err(|e| format!("could not write error log: {e}"))?;

    Ok(())
}

/// Returns the path to the errors.log file so the frontend can open/reveal it.
#[tauri::command(rename_all = "camelCase")]
pub async fn get_error_log_path(app_handle: tauri::AppHandle) -> Result<String, String> {
    let log_dir = app_handle
        .path()
        .app_log_dir()
        .map_err(|e| format!("could not resolve log dir: {e}"))?;

    let path = log_dir.join("errors.log");
    Ok(path.to_string_lossy().into_owned())
}
