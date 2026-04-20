use tauri::{AppHandle, Emitter};

#[tauri::command]
pub fn open_dev_tools(handle: AppHandle) -> Result<(), String> {
    let _ = handle.emit("open_devtools", ());

    Ok(())
}
