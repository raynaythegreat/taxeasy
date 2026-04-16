use base64::{engine::general_purpose::STANDARD as BASE64, Engine as _};
use rusqlite::params;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

use crate::domain::draft_transaction::DraftTransaction;
use crate::domain::evidence::Evidence;
use crate::error::{AppError, Result};
use crate::state::AppState;

/// Per-field confidence scores returned alongside OCR results.
/// Each score is in the range [0.0, 1.0]:
///   1.0 = field present and parsed successfully in expected format
///   0.5 = field present but only partially parseable
///   0.0 = field absent or completely unparseable
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct OcrFieldConfidence {
    pub vendor: f32,
    pub date: f32,
    pub total: f32,
    /// Minimum confidence across all fields — used by the UI to gate auto-post.
    pub overall: f32,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct OcrResult {
    pub evidence: Evidence,
    pub drafts: Vec<DraftTransaction>,
    pub confidence: OcrFieldConfidence,
}

pub async fn process_document(
    state: &AppState,
    client_id: &str,
    file_path: &str,
) -> Result<OcrResult> {
    let image_data = std::fs::read(file_path)
        .map_err(|e| AppError::AiService(format!("Cannot read file: {e}")))?;
    let b64 = BASE64.encode(&image_data);

    let mut hasher = Sha256::new();
    hasher.update(&image_data);
    let _hash = format!("{:x}", hasher.finalize());

    let ollama_url = {
        let lock = state.app_db.lock().unwrap();
        match lock.as_ref() {
            Some(d) => {
                let conn = d.conn();
                conn.query_row(
                    "SELECT value FROM app_settings WHERE key = ?1",
                    params!["ollama_url"],
                    |row| row.get(0),
                )
                .unwrap_or_else(|_| "http://localhost:11434".to_owned())
            }
            None => "http://localhost:11434".to_owned(),
        }
    };

    let model = {
        let models = crate::ai::lmstudio::ollama_list_models(ollama_url.clone()).await?;
        models.into_iter()
            .find(|name| name.to_lowercase().contains("glm-ocr"))
            .unwrap_or_else(|| "glm-ocr:latest".to_string())
    };

    let prompt = r#"Extract all information from this document image. Return ONLY valid JSON with this exact shape, no markdown fences:
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
    let raw_text = gen.response.trim().to_owned();

    let extracted_fields = parse_extracted_fields(&raw_text);
    let confidence = compute_field_confidence(&raw_text);

    let file_name = std::path::Path::new(file_path)
        .file_name()
        .map(|n| n.to_string_lossy().to_string());

    let (evidence, conn_ref) = {
        let lock = state.active_client.lock().unwrap();
        let ac = lock.as_ref().ok_or(AppError::NoActiveClient)?;

        if ac.client_id != client_id {
            return Err(AppError::NotFound(format!("client {client_id}")));
        }

        let conn = ac.db.conn();

        let evidence = crate::db::evidence_db::insert_evidence(
            conn,
            client_id,
            "ocr",
            file_name.as_deref(),
            Some(file_path),
            Some(file_path),
            Some(&raw_text),
            extracted_fields.as_deref(),
            "glm-ocr",
            Some(confidence.overall as f64),
        )?;

        (evidence, ac.db.conn() as *const rusqlite::Connection)
    };
    let _ = conn_ref;

    let mut drafts = Vec::new();
    if let Ok(items) = parse_line_items(&raw_text) {
        let lock = state.active_client.lock().unwrap();
        let ac = lock.as_ref().ok_or(AppError::NoActiveClient)?;
        let conn = ac.db.conn();

        for item in items {
            let amount_cents = parse_amount_to_cents(&item.amount);
            if let Ok(draft) = crate::db::draft_db::insert_draft(
                conn,
                client_id,
                None,
                None,
                Some(&item.description),
                None,
                None,
                None,
                amount_cents,
                None,
            ) {
                drafts.push(draft);
            }
        }
    }

    Ok(OcrResult { evidence, drafts, confidence })
}

pub async fn process_document_bulk(
    state: &AppState,
    client_id: &str,
    file_paths: Vec<String>,
) -> Result<Vec<OcrResult>> {
    let mut results = Vec::new();
    for fp in file_paths {
        match process_document(state, client_id, &fp).await {
            Ok(result) => results.push(result),
            Err(e) => {
                log::warn!("Failed to process document {}: {}", fp, e);
            }
        }
    }
    Ok(results)
}

fn parse_extracted_fields(raw: &str) -> Option<String> {
    let cleaned = raw
        .trim()
        .trim_start_matches("```json")
        .trim_start_matches("```")
        .trim_end_matches("```")
        .trim();

    serde_json::from_str::<serde_json::Value>(cleaned).ok().map(|v| v.to_string())
}

struct ParsedLineItem {
    description: String,
    amount: Option<String>,
}

fn parse_line_items(raw: &str) -> Result<Vec<ParsedLineItem>> {
    let cleaned = raw
        .trim()
        .trim_start_matches("```json")
        .trim_start_matches("```")
        .trim_end_matches("```")
        .trim();

    let v: serde_json::Value = serde_json::from_str(cleaned)?;

    let items = v["items"]
        .as_array()
        .map(|arr| {
            arr.iter()
                .filter_map(|item| {
                    let description = item["description"].as_str().unwrap_or("").to_owned();
                    if description.is_empty() {
                        return None;
                    }
                    Some(ParsedLineItem {
                        description,
                        amount: item["amount"].as_str().map(String::from),
                    })
                })
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();

    Ok(items)
}

fn parse_amount_to_cents(amount_str: &Option<String>) -> Option<i64> {
    amount_str.as_ref().and_then(|s| {
        let cleaned = s.trim().trim_start_matches('$').replace(',', "");
        cleaned.parse::<f64>().ok().map(|v| (v * 100.0).round() as i64)
    })
}

/// Derive per-field confidence scores from the raw OCR JSON response.
///
/// Since GLM-OCR does not return per-field confidence natively, we use a
/// heuristic: a field scores 1.0 if present and in the expected format,
/// 0.5 if present but not fully parseable, and 0.0 if absent or null.
fn compute_field_confidence(raw: &str) -> OcrFieldConfidence {
    let cleaned = raw
        .trim()
        .trim_start_matches("```json")
        .trim_start_matches("```")
        .trim_end_matches("```")
        .trim();

    let v: serde_json::Value = match serde_json::from_str(cleaned) {
        Ok(val) => val,
        Err(_) => {
            // Completely unparseable response → all fields zero
            return OcrFieldConfidence { vendor: 0.0, date: 0.0, total: 0.0, overall: 0.0 };
        }
    };

    let vendor_score: f32 = match v.get("vendor") {
        None | Some(serde_json::Value::Null) => 0.0,
        Some(serde_json::Value::String(s)) if s.trim().is_empty() => 0.0,
        Some(serde_json::Value::String(_)) => 1.0,
        _ => 0.5,
    };

    let date_score = match v.get("date") {
        None | Some(serde_json::Value::Null) => 0.0,
        Some(serde_json::Value::String(s)) => {
            // Validate YYYY-MM-DD format
            if s.len() == 10
                && s.chars().nth(4) == Some('-')
                && s.chars().nth(7) == Some('-')
                && s[..4].chars().all(|c| c.is_ascii_digit())
                && s[5..7].chars().all(|c| c.is_ascii_digit())
                && s[8..10].chars().all(|c| c.is_ascii_digit())
            {
                1.0
            } else {
                0.5
            }
        }
        _ => 0.5,
    };

    let total_score = match v.get("total") {
        None | Some(serde_json::Value::Null) => 0.0,
        Some(serde_json::Value::String(s)) => {
            let cleaned_amount = s.trim().trim_start_matches('$').replace(',', "");
            if cleaned_amount.parse::<f64>().is_ok() { 1.0 } else { 0.5 }
        }
        Some(serde_json::Value::Number(_)) => 1.0,
        _ => 0.5,
    };

    let overall = vendor_score.min(date_score).min(total_score);
    OcrFieldConfidence { vendor: vendor_score, date: date_score, total: total_score, overall }
}
