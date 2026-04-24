use base64::{engine::general_purpose::STANDARD as BASE64, Engine as _};
use rusqlite::params;
use serde::{Deserialize, Serialize};

use crate::{
    error::{AppError, Result},
    state::AppState,
};

#[derive(Debug, Serialize, Deserialize)]
pub struct GlmOcrStatus {
    pub available: bool,
    pub model_name: Option<String>,
    pub message: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ExtractedReceipt {
    pub vendor: Option<String>,
    pub date: Option<String>,
    pub total: Option<String>,
    pub line_items: Vec<ReceiptLineItem>,
    pub raw_text: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ReceiptLineItem {
    pub description: String,
    pub amount: Option<String>,
}

#[tauri::command(rename_all = "camelCase")]
pub async fn scan_receipt(
    file_path: String,
    state: tauri::State<'_, AppState>,
) -> Result<ExtractedReceipt> {
    let lower = file_path.to_lowercase();
    if lower.ends_with(".csv") || lower.ends_with(".txt") {
        return parse_text_statement(&file_path);
    }

    let ollama_url = read_ollama_url(&state);
    let model = resolve_glmocr_model(&ollama_url).await?;

    let image_data = std::fs::read(&file_path)
        .map_err(|e| AppError::AiService(format!("Cannot read file: {e}")))?;
    let b64 = BASE64.encode(&image_data);

    let prompt = r#"Extract all information from this receipt/invoice image. Return ONLY valid JSON with this exact shape, no markdown fences:
{"vendor":"store name","date":"YYYY-MM-DD","total":"123.45","items":[{"description":"item","amount":"12.34"}]}
If a field is not visible, use null. The date must be YYYY-MM-DD format."#;

    let body = serde_json::json!({
        "model": model,
        "messages": [
            {
                "role": "user",
                "content": prompt,
                "images": [b64]
            }
        ],
        "stream": false
    });

    let client = reqwest::Client::new();
    let resp = client
        .post(format!("{}/api/chat", ollama_url.trim_end_matches('/')))
        .json(&body)
        .timeout(std::time::Duration::from_secs(120))
        .send()
        .await
        .map_err(|e| {
            AppError::AiService(format!(
                "Ollama unreachable at {ollama_url} — is Ollama running? ({e})"
            ))
        })?;

    if !resp.status().is_success() {
        let status = resp.status();
        let body = resp.text().await.unwrap_or_default();
        return Err(AppError::AiService(format!(
            "Ollama returned {status}: {body}"
        )));
    }

    #[derive(Deserialize)]
    struct OllamaMessage {
        content: String,
    }
    #[derive(Deserialize)]
    struct OllamaResponse {
        message: OllamaMessage,
    }

    let gen: OllamaResponse = resp
        .json()
        .await
        .map_err(|e| AppError::AiService(format!("Failed to parse Ollama response: {e}")))?;
    let raw = gen.message.content.trim().to_owned();

    parse_ocr_output(&raw)
}

#[tauri::command(rename_all = "camelCase")]
pub async fn glmocr_available(
    url: Option<String>,
    state: tauri::State<'_, AppState>,
) -> Result<bool> {
    let url = url.unwrap_or_else(|| read_ollama_url(&state));
    Ok(resolve_glmocr_model(&url).await.is_ok())
}

#[tauri::command(rename_all = "camelCase")]
pub async fn glmocr_status(
    url: Option<String>,
    state: tauri::State<'_, AppState>,
) -> Result<GlmOcrStatus> {
    let url = url.unwrap_or_else(|| read_ollama_url(&state));
    match resolve_glmocr_model(&url).await {
        Ok(model_name) => Ok(GlmOcrStatus {
            available: true,
            model_name: Some(model_name),
            message: "GLM-OCR is ready in Ollama".into(),
        }),
        Err(err) => Ok(GlmOcrStatus {
            available: false,
            model_name: None,
            message: err.to_string(),
        }),
    }
}

fn read_ollama_url(state: &tauri::State<'_, AppState>) -> String {
    let lock = state.app_db.lock().unwrap();
    let db = lock.as_ref();
    let get = |conn: &rusqlite::Connection, key: &str, def: &str| -> String {
        conn.query_row(
            "SELECT value FROM app_settings WHERE key = ?1",
            params![key],
            |row| row.get(0),
        )
        .unwrap_or_else(|_| def.to_owned())
    };

    let url = match db {
        Some(d) => {
            let conn = d.conn();
            get(conn, "ollama_url", "http://localhost:11434")
        }
        None => "http://localhost:11434".into(),
    };

    crate::ai::lmstudio::normalize_ollama_url(&url)
}

async fn resolve_glmocr_model(url: &str) -> Result<String> {
    let models = crate::ai::lmstudio::ollama_list_models(url.to_owned()).await?;

    if let Some(exact) = models.iter().find(|name| is_exact_glmocr_name(name)) {
        return Ok(exact.clone());
    }

    if let Some(fallback) = models.iter().find(|name| is_glmocr_name(name)) {
        return Ok(fallback.clone());
    }

    let available = if models.is_empty() {
        "none".to_owned()
    } else {
        models.join(", ")
    };

    Err(AppError::AiService(format!(
        "Ollama is running, but no GLM-OCR model is installed. Install it with `ollama pull glm-ocr:latest`. Available models: {available}"
    )))
}

fn is_exact_glmocr_name(name: &str) -> bool {
    let lower = name.trim().to_lowercase();
    lower == "glm-ocr:latest"
        || lower.ends_with("/glm-ocr:latest")
        || lower.ends_with(":glm-ocr:latest")
}

fn is_glmocr_name(name: &str) -> bool {
    name.trim().to_lowercase().contains("glm-ocr")
}

fn parse_ocr_output(raw: &str) -> Result<ExtractedReceipt> {
    let cleaned = raw
        .trim()
        .trim_start_matches("```json")
        .trim_start_matches("```")
        .trim_end_matches("```")
        .trim();

    if let Ok(v) = serde_json::from_str::<serde_json::Value>(cleaned) {
        return Ok(ExtractedReceipt {
            vendor: v["vendor"].as_str().map(str::to_owned),
            date: normalize_date(v["date"].as_str()),
            total: v["total"].as_str().map(str::to_owned),
            line_items: parse_line_items(&v["items"]),
            raw_text: raw.to_owned(),
        });
    }

    Ok(ExtractedReceipt {
        vendor: None,
        date: None,
        total: None,
        line_items: Vec::new(),
        raw_text: raw.to_owned(),
    })
}

fn parse_line_items(v: &serde_json::Value) -> Vec<ReceiptLineItem> {
    v.as_array()
        .unwrap_or(&Vec::new())
        .iter()
        .map(|item| ReceiptLineItem {
            description: item["description"].as_str().unwrap_or("").to_owned(),
            amount: item["amount"].as_str().map(str::to_owned),
        })
        .collect()
}

fn normalize_date(s: Option<&str>) -> Option<String> {
    let s = s?;
    if s.len() == 10 && s.chars().nth(4) == Some('-') {
        return Some(s.to_owned());
    }
    let parts: Vec<&str> = s.splitn(3, '/').collect();
    if parts.len() == 3 {
        return Some(format!("{}-{:0>2}-{:0>2}", parts[2], parts[0], parts[1]));
    }
    Some(s.to_owned())
}

fn parse_text_statement(file_path: &str) -> Result<ExtractedReceipt> {
    let content = std::fs::read_to_string(file_path)?;

    let mut line_items: Vec<ReceiptLineItem> = Vec::new();
    let mut first_date: Option<String> = None;

    for line in content.lines() {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }

        let amount = extract_amount(line);
        let date = extract_date_token(line);

        if amount.is_some() {
            if first_date.is_none() {
                first_date = date.clone();
            }
            let description = line.to_owned();
            line_items.push(ReceiptLineItem {
                description,
                amount,
            });
        }
    }

    let total = line_items.last().and_then(|i| i.amount.clone());

    Ok(ExtractedReceipt {
        vendor: None,
        date: first_date,
        total,
        line_items,
        raw_text: content,
    })
}

fn extract_amount(s: &str) -> Option<String> {
    let s = s.replace(',', "");
    for token in s.split_whitespace() {
        let t = token
            .trim_start_matches('$')
            .trim_matches(|c: char| !c.is_ascii_digit());
        if t.is_empty() {
            continue;
        }
        if t.chars().all(|c| c.is_ascii_digit() || c == '.') {
            if let Ok(v) = t.parse::<f64>() {
                if v > 0.0 {
                    return Some(format!("{v:.2}"));
                }
            }
        }
    }
    None
}

fn extract_date_token(s: &str) -> Option<String> {
    for token in s.split_whitespace() {
        if token.len() == 10 && token.chars().nth(4) == Some('-') {
            return Some(token.to_owned());
        }
        let parts: Vec<&str> = token.splitn(3, '/').collect();
        if parts.len() == 3 && parts[2].len() == 4 {
            return Some(format!("{}-{:0>2}-{:0>2}", parts[2], parts[0], parts[1]));
        }
    }
    None
}
