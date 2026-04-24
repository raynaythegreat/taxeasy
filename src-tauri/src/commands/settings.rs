use argon2::password_hash::{PasswordHash, PasswordHasher, PasswordVerifier, SaltString};
use argon2::Argon2;
use rand::rngs::OsRng;
use rusqlite::params;
use serde::{Deserialize, Serialize};

use crate::{
    error::{AppError, Result},
    state::AppState,
};

pub(crate) fn hash_pin(pin: &str) -> Result<String> {
    let salt = SaltString::generate(&mut OsRng);
    let argon2 = Argon2::default();
    Ok(argon2
        .hash_password(pin.as_bytes(), &salt)
        .map_err(|e| AppError::Encryption(e.to_string()))?
        .to_string())
}

pub(crate) fn verify_pin_hash(pin: &str, stored: &str) -> bool {
    if stored.starts_with("$argon2") {
        let parsed = PasswordHash::new(stored).ok();
        parsed.map_or(false, |h| {
            Argon2::default()
                .verify_password(pin.as_bytes(), &h)
                .is_ok()
        })
    } else {
        pin == stored
    }
}

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
    pub govinfo_api_key: String,
    pub glmocr_path: String,
    /// OCR engine to use: "auto", "glm-ocr", "tesseract", or "surya"
    pub ocr_engine: String,
    pub theme: String,
    pub default_export_path: String,
    pub app_pin: String,
    /// Minimum OCR confidence score (0.0–1.0) required to auto-post a draft.
    /// Drafts with any field below this threshold require manual review.
    pub ocr_auto_post_threshold: f64,
    /// Whether to use AI vision model to verify and correct OCR results.
    pub ocr_vision_verification: bool,
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
    pub govinfo_api_key: Option<String>,
    pub glmocr_path: Option<String>,
    /// OCR engine to use: "auto", "glm-ocr", "tesseract", or "surya"
    pub ocr_engine: Option<String>,
    pub theme: Option<String>,
    pub default_export_path: Option<String>,
    pub app_pin: Option<String>,
    pub ocr_auto_post_threshold: Option<f64>,
    pub ocr_vision_verification: Option<bool>,
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

    let vision_verification: bool = get_val("ocr_vision_verification", "true")
        .parse()
        .unwrap_or(true);

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
        govinfo_api_key: get_val("govinfo_api_key", ""),
        glmocr_path: get_val("glmocr_path", ""),
        ocr_engine: get_val("ocr_engine", "auto"),
        theme: get_val("theme", "system"),
        default_export_path: get_val("default_export_path", ""),
        app_pin: get_val("app_pin", "0000"),
        ocr_auto_post_threshold: ocr_threshold,
        ocr_vision_verification: vision_verification,
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
    if let Some(ref v) = payload.govinfo_api_key {
        set_val(conn, "govinfo_api_key", v)?;
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
        let to_store = if v.starts_with("$argon2") {
            v.clone()
        } else {
            hash_pin(v)?
        };
        set_val(conn, "app_pin", &to_store)?;
    }
    if let Some(v) = payload.ocr_auto_post_threshold {
        set_val(conn, "ocr_auto_post_threshold", &v.to_string())?;
    }
    if let Some(v) = payload.ocr_vision_verification {
        set_val(conn, "ocr_vision_verification", &v.to_string())?;
    }

    Ok(())
}

#[derive(Debug, Serialize)]
pub struct OcrEngineStatus {
    pub engine: String,
    pub available: bool,
    pub version: Option<String>,
    pub message: String,
}

#[tauri::command(rename_all = "camelCase")]
pub async fn get_ocr_engines_status(state: tauri::State<'_, AppState>) -> Result<Vec<OcrEngineStatus>> {
    let mut statuses = Vec::new();

    // Get ollama URL first (without holding lock across await)
    let ollama_url = {
        let lock = state.app_db.lock().unwrap();
        match lock.as_ref() {
            Some(d) => {
                let conn = d.conn();
                conn.query_row(
                    "SELECT value FROM app_settings WHERE key = ?1",
                    params!["ollama_url"],
                    |row| row.get(0),
                ).unwrap_or_else(|_| "http://localhost:11434".to_owned())
            }
            None => "http://localhost:11434".to_owned(),
        }
    };

    // Check GLM-OCR availability
    let models = crate::ai::lmstudio::ollama_list_models(ollama_url.clone()).await.unwrap_or_default();
    let glm_available = models.iter().any(|name| name.to_lowercase().contains("glm-ocr"));
    let glm_version = models.iter().find(|name| name.to_lowercase().contains("glm-ocr")).cloned();

    let tesseract_available = crate::ai::tesseract::is_tesseract_available();
    let surya_available = crate::ai::surya::is_surya_available();
    let auto_available = glm_available || tesseract_available || surya_available;

    statuses.push(OcrEngineStatus {
        engine: "auto".to_owned(),
        available: auto_available,
        version: None,
        message: if auto_available {
            format!("Will use: {}", if glm_available {
                "GLM-OCR"
            } else if surya_available {
                "Surya"
            } else {
                "Tesseract"
            })
        } else {
            "No OCR engine available".to_owned()
        },
    });

    // GLM-OCR
    statuses.push(OcrEngineStatus {
        engine: "glm-ocr".to_owned(),
        available: glm_available,
        version: glm_version,
        message: if glm_available {
            "Vision LLM with native OCR".to_owned()
        } else {
            "Install: ollama pull glm-ocr:latest".to_owned()
        },
    });

    // Tesseract
    let tesseract_version = crate::ai::tesseract::tesseract_version();
    statuses.push(OcrEngineStatus {
        engine: "tesseract".to_owned(),
        available: tesseract_available,
        version: tesseract_version,
        message: if tesseract_available {
            "Open source OCR, fast and reliable".to_owned()
        } else {
            "Install: brew install tesseract".to_owned()
        },
    });

    // Surya
    let surya_version = crate::ai::surya::surya_version();
    statuses.push(OcrEngineStatus {
        engine: "surya".to_owned(),
        available: surya_available,
        version: surya_version,
        message: if surya_available {
            "Modern OCR with layout detection".to_owned()
        } else {
            "Install: pip install surya-ocr".to_owned()
        },
    });

    Ok(statuses)
}

#[derive(Debug, Serialize)]
pub struct TestOcrResult {
    pub data: serde_json::Value,
    pub confidence: serde_json::Value,
    pub engine_used: String,
    pub was_verified: bool,
}

#[tauri::command(rename_all = "camelCase")]
pub async fn test_ocr_with_vision(
    file_path: String,
    engine: String,
    state: tauri::State<'_, AppState>,
) -> Result<TestOcrResult> {
    let result = crate::ai::smart_ocr::run_ocr_with_verification(&state, &file_path, &engine).await?;

    Ok(TestOcrResult {
        data: serde_json::json!({
            "vendor": result.data.vendor,
            "date": result.data.date,
            "total": result.data.total,
            "items": result.data.items,
        }),
        confidence: serde_json::json!({
            "vendor": result.confidence.vendor,
            "date": result.confidence.date,
            "total": result.confidence.total,
            "overall": result.confidence.overall,
        }),
        engine_used: result.engine_used,
        was_verified: result.was_verified,
    })
}
