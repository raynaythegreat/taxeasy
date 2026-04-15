use rusqlite::params;
use serde::{Deserialize, Serialize};

use crate::{
    error::{AppError, Result},
    state::AppState,
};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppSettings {
    pub ai_provider: String,
    pub ollama_url: String,
    pub ollama_model: String,
    pub lm_studio_url: String,
    pub lm_studio_model: String,
    pub glmocr_path: String,
    pub theme: String,
    pub default_export_path: String,
    pub app_pin: String,
}

#[derive(Debug, Deserialize)]
pub struct SaveSettingsPayload {
    pub ai_provider: Option<String>,
    pub ollama_url: Option<String>,
    pub ollama_model: Option<String>,
    pub lm_studio_url: Option<String>,
    pub lm_studio_model: Option<String>,
    pub glmocr_path: Option<String>,
    pub theme: Option<String>,
    pub default_export_path: Option<String>,
    pub app_pin: Option<String>,
}

#[tauri::command(rename_all = "camelCase")]
pub fn get_settings(state: tauri::State<AppState>) -> Result<AppSettings> {
    let lock = state.app_db.lock().unwrap();
    let db = lock.as_ref().ok_or(AppError::NoActiveClient)?;
    let conn = db.conn();

    let get_val = |key: &str, default: &str| -> String {
        conn.query_row(
            "SELECT value FROM app_settings WHERE key = ?1",
            params![key],
            |row| row.get(0),
        )
        .unwrap_or_else(|_| default.to_owned())
    };

    Ok(AppSettings {
        ai_provider: get_val("ai_provider", "ollama"),
        ollama_url: get_val("ollama_url", "http://localhost:11434"),
        ollama_model: get_val("ollama_model", ""),
        lm_studio_url: get_val("lm_studio_url", "http://localhost:1234"),
        lm_studio_model: get_val("lm_studio_model", ""),
        glmocr_path: get_val("glmocr_path", ""),
        theme: get_val("theme", "system"),
        default_export_path: get_val("default_export_path", ""),
        app_pin: get_val("app_pin", "0000"),
    })
}

#[tauri::command(rename_all = "camelCase")]
pub fn save_settings(payload: SaveSettingsPayload, state: tauri::State<AppState>) -> Result<()> {
    let lock = state.app_db.lock().unwrap();
    let db = lock.as_ref().ok_or(AppError::NoActiveClient)?;
    let conn = db.conn();

    let set_val = |conn: &rusqlite::Connection, key: &str, val: &str| -> rusqlite::Result<()> {
        conn.execute(
            "INSERT OR REPLACE INTO app_settings (key, value) VALUES (?1, ?2)",
            params![key, val],
        )?;
        Ok(())
    };

    if let Some(ref v) = payload.ai_provider {
        set_val(conn, "ai_provider", v)?;
    }
    if let Some(ref v) = payload.ollama_url {
        set_val(conn, "ollama_url", v)?;
    }
    if let Some(ref v) = payload.ollama_model {
        set_val(conn, "ollama_model", v)?;
    }
    if let Some(ref v) = payload.lm_studio_url {
        set_val(conn, "lm_studio_url", v)?;
    }
    if let Some(ref v) = payload.lm_studio_model {
        set_val(conn, "lm_studio_model", v)?;
    }
    if let Some(ref v) = payload.glmocr_path {
        set_val(conn, "glmocr_path", v)?;
    }
    if let Some(ref v) = payload.theme {
        set_val(conn, "theme", v)?;
    }
    if let Some(ref v) = payload.default_export_path {
        set_val(conn, "default_export_path", v)?;
    }
    if let Some(ref v) = payload.app_pin {
        set_val(conn, "app_pin", v)?;
    }

    Ok(())
}
