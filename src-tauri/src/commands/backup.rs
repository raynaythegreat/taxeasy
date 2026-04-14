use rusqlite::params;
use tauri::Manager;

use crate::{
    error::{AppError, Result},
    state::AppState,
};

#[tauri::command(rename_all = "camelCase")]
pub async fn backup_database(
    app_handle: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
) -> Result<String> {
    use tauri_plugin_dialog::DialogExt;

    let (client_id, db_filename) = {
        let lock = state.active_client.lock().unwrap();
        let ac = lock.as_ref().ok_or(AppError::NoActiveClient)?;
        let cid = ac.client_id.clone();
        drop(lock);

        let app_lock = state.app_db.lock().unwrap();
        let db = app_lock.as_ref().ok_or(AppError::NoActiveClient)?;
        let conn = db.conn();
        let fname: String = conn
            .query_row(
                "SELECT db_filename FROM clients WHERE id = ?1",
                params![cid],
                |row: &rusqlite::Row| row.get(0),
            )
            .map_err(|_| AppError::NotFound(format!("client {cid}")))?;
        (cid, fname)
    };

    let data_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| AppError::Io(std::io::Error::new(std::io::ErrorKind::Other, e.to_string())))?;
    let src_path = data_dir.join("clients").join(&db_filename);

    {
        let lock = state.active_client.lock().unwrap();
        let ac = lock.as_ref().ok_or(AppError::NoActiveClient)?;
        ac.db.conn().execute_batch("PRAGMA wal_checkpoint(TRUNCATE)")?;
    }

    let dest = app_handle
        .dialog()
        .file()
        .set_file_name(&format!("{client_id}-backup.db"))
        .add_filter("SQLite Database", &["db"])
        .blocking_save_file();

    match dest {
        Some(fp) => {
            let path = fp
                .as_path()
                .ok_or_else(|| AppError::Validation("invalid file path".into()))?
                .to_path_buf();
            std::fs::copy(&src_path, &path)?;
            Ok(path.to_string_lossy().to_string())
        }
        None => Err(AppError::Validation("backup cancelled".into())),
    }
}

#[tauri::command(rename_all = "camelCase")]
pub async fn restore_database(
    app_handle: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
) -> Result<String> {
    use tauri_plugin_dialog::DialogExt;

    let client_id = {
        let lock = state.active_client.lock().unwrap();
        let ac = lock.as_ref().ok_or(AppError::NoActiveClient)?;
        ac.client_id.clone()
    };

    let db_filename: String = {
        let app_lock = state.app_db.lock().unwrap();
        let db = app_lock.as_ref().ok_or(AppError::NoActiveClient)?;
        let conn = db.conn();
        conn.query_row(
            "SELECT db_filename FROM clients WHERE id = ?1",
            params![client_id],
            |row: &rusqlite::Row| row.get::<_, String>(0),
        )
        .map_err(|_| AppError::NotFound(format!("client {client_id}")))?
    };

    let data_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| AppError::Io(std::io::Error::new(std::io::ErrorKind::Other, e.to_string())))?;
    let dest_path = data_dir.join("clients").join(&db_filename);

    let src = app_handle
        .dialog()
        .file()
        .add_filter("SQLite Database", &["db"])
        .blocking_pick_file();

    match src {
        Some(fp) => {
            let src_path = fp
                .as_path()
                .ok_or_else(|| AppError::Validation("invalid file path".into()))?
                .to_path_buf();

            {
                let mut lock = state.active_client.lock().unwrap();
                *lock = None;
            }

            std::fs::copy(&src_path, &dest_path)?;

            let passphrase = {
                let lock = state.passphrase.lock().unwrap();
                lock.clone().unwrap_or_default()
            };

            let client_db = crate::db::ClientDb::open(
                dest_path.to_str().unwrap(),
                &client_id,
                &passphrase,
            )?;

            {
                let mut lock = state.active_client.lock().unwrap();
                *lock = Some(crate::state::ActiveClient {
                    client_id: client_id.clone(),
                    db: client_db,
                });
            }

            Ok(src_path.to_string_lossy().to_string())
        }
        None => Err(AppError::Validation("restore cancelled".into())),
    }
}
