use base64::{Engine as _, engine::general_purpose::STANDARD as BASE64};
use rusqlite::params;
use serde::{Deserialize, Serialize};

use crate::{error::{AppError, Result}, state::AppState};

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
pub async fn scan_receipt(file_path: String, state: tauri::State<'_, AppState>) -> Result<ExtractedReceipt> {
    let lower = file_path.to_lowercase();
    if lower.ends_with(".csv") || lower.ends_with(".txt") {
        return parse_text_statement(&file_path);
    }

    let (ollama_url, ollama_model) = read_ollama_config(&state);
    let model = if ollama_model.is_empty() {
        "glm-ocr:latest"
    } else {
        &ollama_model
    };

    let image_data = std::fs::read(&file_path)
        .map_err(|e| AppError::AiService(format!("Cannot read file: {e}")))?;
    let b64 = BASE64.encode(&image_data);

    let prompt = r#"Extract all information from this receipt/invoice image. Return ONLY valid JSON with this exact shape, no markdown fences:
{"vendor":"store name","date":"YYYY-MM-DD","total":"123.45","items":[{"description":"item","amount":"12.34"}]}
If a field is not visible, use null. The date must be YYYY-MM-DD format."#;

    let body = serde_json::json!({
        "model": model,
        "prompt": prompt,
        "images": [b64],
        "stream": false
    });

    let client = reqwest::Client::new();
    let resp = client
        .post(format!("{}/api/generate", ollama_url.trim_end_matches('/')))
        .json(&body)
        .timeout(std::time::Duration::from_secs(60))
        .send()
        .await
        .map_err(|e| AppError::AiService(format!("Ollama request failed: {e}")))?;

    if !resp.status().is_success() {
        let status = resp.status();
        let body = resp.text().await.unwrap_or_default();
        return Err(AppError::AiService(format!("Ollama returned {status}: {body}")));
    }

    #[derive(Deserialize)]
    struct OllamaResponse {
        response: String,
    }

    let gen: OllamaResponse = resp.json().await.map_err(|e| AppError::AiService(e.to_string()))?;
    let raw = gen.response.trim().to_owned();

    parse_ocr_output(&raw)
}

#[tauri::command(rename_all = "camelCase")]
pub async fn glmocr_available(state: tauri::State<'_, AppState>) -> Result<bool> {
    let (url, _) = read_ollama_config(&state);
    let client = reqwest::Client::new();
    let ok = client
        .get(format!("{}/api/tags", url.trim_end_matches('/')))
        .timeout(std::time::Duration::from_secs(3))
        .send()
        .await
        .map(|r| r.status().is_success())
        .unwrap_or(false);
    Ok(ok)
}

fn read_ollama_config(state: &tauri::State<'_, AppState>) -> (String, String) {
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

    match db {
        Some(d) => {
            let conn = d.conn();
            let url = get(conn, "ollama_url", "http://localhost:11434");
            let model = get(conn, "ollama_model", "glm-ocr:latest");
            (url, model)
        }
        None => ("http://localhost:11434".into(), "glm-ocr:latest".into()),
    }
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
        if line.is_empty() { continue; }

        let amount = extract_amount(line);
        let date = extract_date_token(line);

        if amount.is_some() {
            if first_date.is_none() {
                first_date = date.clone();
            }
            let description = line.to_owned();
            line_items.push(ReceiptLineItem { description, amount });
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
        let t = token.trim_start_matches('$').trim_matches(|c: char| !c.is_ascii_digit());
        if t.is_empty() { continue; }
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
