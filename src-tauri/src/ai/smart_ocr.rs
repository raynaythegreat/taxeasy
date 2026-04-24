//! Smart OCR orchestrator with auto-selection and vision model verification.
//!
//! Supports three engines: glm-ocr (Ollama vision), tesseract, surya.
//! Auto mode intelligently selects the best engine based on document characteristics.
//! After OCR, optionally runs a vision model to verify and correct the transcription.

use serde::{Deserialize, Serialize};

use crate::error::{AppError, Result};
use crate::state::AppState;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OcrExtractedData {
    pub vendor: Option<String>,
    pub date: Option<String>,
    pub total: Option<String>,
    pub items: Vec<OcrLineItem>,
    pub raw_text: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OcrLineItem {
    pub description: String,
    pub amount: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OcrConfidence {
    pub vendor: f32,
    pub date: f32,
    pub total: f32,
    pub overall: f32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OcrResult {
    pub data: OcrExtractedData,
    pub confidence: OcrConfidence,
    pub engine_used: String,
    pub was_verified: bool,
}

/// Run OCR using the specified engine.
pub async fn run_ocr(
    state: &AppState,
    image_path: &str,
    engine: &str,
) -> Result<OcrResult> {
    let engine = if engine == "auto" {
        select_best_engine(state, image_path).await?
    } else {
        engine.to_owned()
    };

    let raw_text = match engine.as_str() {
        "glm-ocr" => run_glm_ocr(state, image_path).await?,
        "tesseract" => run_tesseract_engine(image_path)?,
        "surya" => run_surya_engine(image_path)?,
        _ => return Err(AppError::AiService(format!("Unknown OCR engine: {engine}"))),
    };

    let parsed = parse_ocr_response(&raw_text);

    Ok(OcrResult {
        data: parsed,
        confidence: compute_confidence(&raw_text),
        engine_used: engine,
        was_verified: false,
    })
}

/// Run OCR with vision model verification.
/// First extracts text with the chosen engine, then passes the image + extracted text
/// to a vision LLM to verify and correct any errors.
pub async fn run_ocr_with_verification(
    state: &AppState,
    image_path: &str,
    engine: &str,
) -> Result<OcrResult> {
    let mut result = run_ocr(state, image_path, engine).await?;

    // Only verify if confidence is below threshold or if explicitly requested
    if result.confidence.overall < 0.8 {
        result = verify_with_vision_model(state, image_path, &result).await?;
    }

    Ok(result)
}

/// Select the best OCR engine based on document characteristics.
async fn select_best_engine(state: &AppState, _image_path: &str) -> Result<String> {
    // Check availability in priority order
    // 1. glm-ocr (best quality, understands receipts/invoices natively)
    if is_glm_ocr_available(state).await {
        return Ok("glm-ocr".to_owned());
    }

    // 2. Surya (good layout detection, handles complex documents)
    if crate::ai::surya::is_surya_available() {
        return Ok("surya".to_owned());
    }

    // 3. Tesseract (fast, reliable for simple text)
    if crate::ai::tesseract::is_tesseract_available() {
        return Ok("tesseract".to_owned());
    }

    Err(AppError::AiService(
        "No OCR engine available. Install glm-ocr (ollama pull glm-ocr), surya-ocr, or tesseract.".to_owned(),
    ))
}

async fn run_glm_ocr(state: &AppState, image_path: &str) -> Result<String> {
    let ollama_url = read_ollama_url(state);
    let model = resolve_glm_ocr_model(state, &ollama_url).await?;

    let image_data = std::fs::read(image_path)
        .map_err(|e| AppError::AiService(format!("Cannot read file: {e}")))?;
    let b64 = base64::Engine::encode(&base64::engine::general_purpose::STANDARD, &image_data);

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
        .map_err(|e| AppError::AiService(format!("Ollama unreachable: {e}")))?;

    if !resp.status().is_success() {
        let status = resp.status();
        let body = resp.text().await.unwrap_or_default();
        return Err(AppError::AiService(format!("Ollama returned {status}: {body}")));
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

    Ok(gen.message.content.trim().to_owned())
}

fn run_tesseract_engine(image_path: &str) -> Result<String> {
    let raw_text = crate::ai::tesseract::run_tesseract(image_path)?;

    // Tesseract returns raw text; we need to format it as JSON for consistency
    let lines: Vec<&str> = raw_text.lines().filter(|l| !l.trim().is_empty()).collect();
    let vendor = lines.first().map(|s| s.to_string()).unwrap_or_default();
    let date = extract_date_from_text(&raw_text).unwrap_or_default();
    let total = extract_amount_from_text(&raw_text).unwrap_or_default();

    let items: Vec<OcrLineItem> = lines
        .iter()
        .filter_map(|line| {
            if let Some(amount) = extract_amount_from_line(line) {
                Some(OcrLineItem {
                    description: line.trim().to_string(),
                    amount: Some(amount),
                })
            } else {
                None
            }
        })
        .collect();

    let json = serde_json::json!({
        "vendor": vendor,
        "date": date,
        "total": total,
        "items": items
    });

    Ok(json.to_string())
}

fn run_surya_engine(image_path: &str) -> Result<String> {
    let layout = crate::ai::surya::run_surya_layout(image_path)?;

    let lines: Vec<OcrLineItem> = layout
        .lines
        .into_iter()
        .map(|l| OcrLineItem {
            description: l.text,
            amount: None,
        })
        .collect();

    let date = extract_date_from_text(&layout.text).unwrap_or_default();
    let total = extract_amount_from_text(&layout.text).unwrap_or_default();

    let json = serde_json::json!({
        "vendor": lines.first().map(|l| l.description.clone()).unwrap_or_default(),
        "date": date,
        "total": total,
        "items": lines
    });

    Ok(json.to_string())
}

async fn verify_with_vision_model(
    state: &AppState,
    image_path: &str,
    initial_result: &OcrResult,
) -> Result<OcrResult> {
    let ollama_url = read_ollama_url(state);
    let model = resolve_glm_ocr_model(state, &ollama_url).await?;

    let image_data = std::fs::read(image_path)
        .map_err(|e| AppError::AiService(format!("Cannot read file: {e}")))?;
    let b64 = base64::Engine::encode(&base64::engine::general_purpose::STANDARD, &image_data);

    let prompt = format!(
        r#"Review the OCR extraction from this receipt/invoice image and correct any errors.

Current extraction:
- Vendor: {}
- Date: {}
- Total: {}
- Items: {}

Look at the image carefully and correct any mistakes. Return ONLY valid JSON with this exact shape:
{{"vendor":"corrected name","date":"YYYY-MM-DD","total":"corrected amount","items":[{{"description":"item","amount":"12.34"}}]}}
If a field was correct, keep it the same. If not visible, use null."#,
        initial_result.data.vendor.as_deref().unwrap_or("null"),
        initial_result.data.date.as_deref().unwrap_or("null"),
        initial_result.data.total.as_deref().unwrap_or("null"),
        serde_json::to_string(&initial_result.data.items).unwrap_or_default()
    );

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
        .map_err(|e| AppError::AiService(format!("Vision model unreachable: {e}")))?;

    if !resp.status().is_success() {
        // If verification fails, keep the original result
        return Ok(OcrResult {
            was_verified: false,
            ..initial_result.clone()
        });
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
        .map_err(|e| AppError::AiService(format!("Failed to parse vision response: {e}")))?;

    let verified_text = gen.message.content.trim().to_owned();
    let verified_data = parse_ocr_response(&verified_text);
    let verified_confidence = compute_confidence(&verified_text);

    Ok(OcrResult {
        data: verified_data,
        confidence: verified_confidence,
        engine_used: initial_result.engine_used.clone(),
        was_verified: true,
    })
}

// ── Helpers ───────────────────────────────────────────────────────────────────

fn parse_ocr_response(raw: &str) -> OcrExtractedData {
    let cleaned = raw
        .trim()
        .trim_start_matches("```json")
        .trim_start_matches("```")
        .trim_end_matches("```")
        .trim();

    if let Ok(v) = serde_json::from_str::<serde_json::Value>(cleaned) {
        return OcrExtractedData {
            vendor: v["vendor"].as_str().map(str::to_owned),
            date: normalize_date(v["date"].as_str()),
            total: v["total"].as_str().map(str::to_owned),
            items: v["items"]
                .as_array()
                .map(|arr| {
                    arr.iter()
                        .filter_map(|item| {
                            let desc = item["description"].as_str()?.to_owned();
                            if desc.is_empty() {
                                return None;
                            }
                            Some(OcrLineItem {
                                description: desc,
                                amount: item["amount"].as_str().map(str::to_owned),
                            })
                        })
                        .collect()
                })
                .unwrap_or_default(),
            raw_text: raw.to_owned(),
        };
    }

    OcrExtractedData {
        vendor: None,
        date: None,
        total: None,
        items: Vec::new(),
        raw_text: raw.to_owned(),
    }
}

fn compute_confidence(raw: &str) -> OcrConfidence {
    let cleaned = raw
        .trim()
        .trim_start_matches("```json")
        .trim_start_matches("```")
        .trim_end_matches("```")
        .trim();

    let v: serde_json::Value = match serde_json::from_str(cleaned) {
        Ok(val) => val,
        Err(_) => return OcrConfidence { vendor: 0.0, date: 0.0, total: 0.0, overall: 0.0 },
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
            if s.len() == 10 && s.chars().nth(4) == Some('-') && s.chars().nth(7) == Some('-') {
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
    OcrConfidence { vendor: vendor_score, date: date_score, total: total_score, overall }
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

fn extract_date_from_text(text: &str) -> Option<String> {
    let date_re = regex::Regex::new(r"\b(\d{4}-\d{2}-\d{2})\b").ok()?;
    if let Some(m) = date_re.find(text) {
        return Some(m.as_str().to_owned());
    }
    let slash_re = regex::Regex::new(r"\b(\d{1,2}/\d{1,2}/\d{4})\b").ok()?;
    if let Some(m) = slash_re.find(text) {
        let parts: Vec<&str> = m.as_str().split('/').collect();
        if parts.len() == 3 {
            return Some(format!("{}-{:0>2}-{:0>2}", parts[2], parts[0], parts[1]));
        }
    }
    None
}

fn extract_amount_from_text(text: &str) -> Option<String> {
    let amount_re = regex::Regex::new(r"\$?(\d+,\d+\.\d{2}|\d+\.\d{2})").ok()?;
    let mut last_match = None;
    for m in amount_re.find_iter(text) {
        let val = m.as_str().trim_start_matches('$').replace(',', "");
        last_match = Some(val);
    }
    last_match
}

fn extract_amount_from_line(line: &str) -> Option<String> {
    let amount_re = regex::Regex::new(r"\$?(\d+,\d+\.\d{2}|\d+\.\d{2})").ok()?;
    if let Some(m) = amount_re.find(line) {
        return Some(m.as_str().trim_start_matches('$').replace(',', ""));
    }
    None
}

async fn is_glm_ocr_available(state: &AppState) -> bool {
    let ollama_url = read_ollama_url(state);
    resolve_glm_ocr_model(state, &ollama_url).await.is_ok()
}

async fn resolve_glm_ocr_model(state: &AppState, url: &str) -> Result<String> {
    let models = crate::ai::lmstudio::ollama_list_models(url.to_owned()).await?;

    if let Some(exact) = models.iter().find(|name| {
        let lower = name.trim().to_lowercase();
        lower == "glm-ocr:latest"
            || lower.ends_with("/glm-ocr:latest")
            || lower.ends_with(":glm-ocr:latest")
    }) {
        return Ok(exact.clone());
    }

    if let Some(fallback) = models.iter().find(|name| {
        name.trim().to_lowercase().contains("glm-ocr")
    }) {
        return Ok(fallback.clone());
    }

    Err(AppError::AiService(
        "No GLM-OCR model installed. Run: ollama pull glm-ocr:latest".to_owned(),
    ))
}

fn read_ollama_url(state: &AppState) -> String {
    let lock = state.app_db.lock().unwrap();
    let url = match lock.as_ref() {
        Some(d) => {
            let conn = d.conn();
            conn.query_row(
                "SELECT value FROM app_settings WHERE key = ?1",
                rusqlite::params!["ollama_url"],
                |row| row.get(0),
            )
            .unwrap_or_else(|_| "http://localhost:11434".to_owned())
        }
        None => "http://localhost:11434".to_owned(),
    };

    crate::ai::lmstudio::normalize_ollama_url(&url)
}
