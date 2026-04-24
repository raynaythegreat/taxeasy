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
    pub bonsai_url: String,
    pub bonsai_model: String,
    pub bitnet_url: String,
    pub bitnet_model: String,
    pub glmocr_path: String,
    /// OCR engine to use: "glm-ocr" (default), "tesseract", or "surya"
    pub ocr_engine: String,
    pub theme: String,
    pub default_export_path: String,
    pub app_pin: String,
    /// Minimum OCR confidence score (0.0–1.0) required to auto-post a draft.
    /// Drafts with any field below this threshold require manual review.
    pub ocr_auto_post_threshold: f64,
}

#[derive(Debug, Deserialize)]
pub struct SaveSettingsPayload {
    pub ai_provider: Option<String>,
    pub ollama_url: Option<String>,
    pub ollama_model: Option<String>,
    pub lm_studio_url: Option<String>,
    pub lm_studio_model: Option<String>,
    pub bonsai_url: Option<String>,
    pub bonsai_model: Option<String>,
    pub bitnet_url: Option<String>,
    pub bitnet_model: Option<String>,
    pub glmocr_path: Option<String>,
    /// OCR engine to use: "glm-ocr" (default), "tesseract", or "surya"
    pub ocr_engine: Option<String>,
    pub theme: Option<String>,
    pub default_export_path: Option<String>,
    pub app_pin: Option<String>,
    pub ocr_auto_post_threshold: Option<f64>,
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

    let ocr_threshold: f64 = get_val("ocr_auto_post_threshold", "0.7")
        .parse()
        .unwrap_or(0.7);

    Ok(AppSettings {
        ai_provider: get_val("ai_provider", "ollama"),
        ollama_url: get_val("ollama_url", "http://localhost:11434"),
        ollama_model: get_val("ollama_model", ""),
        lm_studio_url: get_val("lm_studio_url", "http://localhost:1234"),
        lm_studio_model: get_val("lm_studio_model", ""),
        bonsai_url: get_val("bonsai_url", "http://localhost:8080"),
        bonsai_model: get_val("bonsai_model", ""),
        bitnet_url: get_val("bitnet_url", "http://localhost:8090"),
        bitnet_model: get_val("bitnet_model", ""),
        glmocr_path: get_val("glmocr_path", ""),
        ocr_engine: get_val("ocr_engine", "glm-ocr"),
        theme: get_val("theme", "system"),
        default_export_path: get_val("default_export_path", ""),
        app_pin: get_val("app_pin", "0000"),
        ocr_auto_post_threshold: ocr_threshold,
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
    if let Some(ref v) = payload.bonsai_url {
        set_val(conn, "bonsai_url", v)?;
    }
    if let Some(ref v) = payload.bonsai_model {
        set_val(conn, "bonsai_model", v)?;
    }
    if let Some(ref v) = payload.bitnet_url {
        set_val(conn, "bitnet_url", v)?;
    }
    if let Some(ref v) = payload.bitnet_model {
        set_val(conn, "bitnet_model", v)?;
    }
    if let Some(ref v) = payload.glmocr_path {
        set_val(conn, "glmocr_path", v)?;
    }
    if let Some(ref v) = payload.ocr_engine {
        set_val(conn, "ocr_engine", v)?;
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
    if let Some(v) = payload.ocr_auto_post_threshold {
        set_val(conn, "ocr_auto_post_threshold", &v.to_string())?;
    }

    Ok(())
}
