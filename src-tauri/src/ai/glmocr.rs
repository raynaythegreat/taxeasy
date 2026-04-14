/// GLM-OCR receipt scanning — shells out to the local GLM-OCR binary.
use serde::{Deserialize, Serialize};
use std::process::Command;

use crate::error::{AppError, Result};

#[derive(Debug, Serialize, Deserialize)]
pub struct ExtractedReceipt {
    pub vendor: Option<String>,
    pub date: Option<String>,       // "YYYY-MM-DD" if parseable
    pub total: Option<String>,      // dollar string, e.g. "123.45"
    pub line_items: Vec<ReceiptLineItem>,
    pub raw_text: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ReceiptLineItem {
    pub description: String,
    pub amount: Option<String>,
}

/// Scan a receipt file and return structured extraction.
/// Falls back gracefully if GLM-OCR is unavailable.
#[tauri::command(rename_all = "camelCase")]
pub async fn scan_receipt(file_path: String) -> Result<ExtractedReceipt> {
    // CSV / TXT bank statement exports — parse directly without GLM-OCR
    let lower = file_path.to_lowercase();
    if lower.ends_with(".csv") || lower.ends_with(".txt") {
        return parse_text_statement(&file_path);
    }

    // Images and PDFs — run through GLM-OCR vision model
    let binary = find_glmocr_binary()?;

    let output = Command::new(&binary)
        .arg("--file")
        .arg(&file_path)
        .arg("--output")
        .arg("json")
        .output()
        .map_err(|e| AppError::AiService(format!("GLM-OCR launch failed: {e}")))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(AppError::AiService(format!("GLM-OCR error: {stderr}")));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    parse_glmocr_output(&stdout)
}

/// Check if GLM-OCR is available.
#[tauri::command(rename_all = "camelCase")]
pub fn glmocr_available() -> bool {
    find_glmocr_binary().is_ok()
}

// ── Internal helpers ──────────────────────────────────────────────────────────

fn find_glmocr_binary() -> Result<String> {
    // Check locations in priority order
    let candidates = [
        "/usr/local/bin/glmocr",
        "/opt/homebrew/bin/glmocr",
        "/Users/ray/.local/bin/glmocr",
        "glmocr", // PATH
    ];

    for path in &candidates {
        if std::path::Path::new(path).exists() || which_in_path(path) {
            return Ok(path.to_string());
        }
    }

    Err(AppError::AiService(
        "GLM-OCR binary not found. Install it or set the path in Settings.".into(),
    ))
}

fn which_in_path(name: &str) -> bool {
    Command::new("which")
        .arg(name)
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false)
}

/// Parse GLM-OCR JSON output into our structured type.
/// GLM-OCR outputs a Markdown string with structured JSON block — we handle both formats.
fn parse_glmocr_output(raw: &str) -> Result<ExtractedReceipt> {
    // Try direct JSON parse first
    if let Ok(v) = serde_json::from_str::<serde_json::Value>(raw) {
        return Ok(ExtractedReceipt {
            vendor: v["vendor"].as_str().map(str::to_owned),
            date: normalize_date(v["date"].as_str()),
            total: v["total"].as_str().map(str::to_owned),
            line_items: parse_line_items(&v["items"]),
            raw_text: raw.to_owned(),
        });
    }

    // Fall back: return raw text, let user fill in fields manually
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
    // If already YYYY-MM-DD, keep it
    if s.len() == 10 && s.chars().nth(4) == Some('-') {
        return Some(s.to_owned());
    }
    // Try common US format MM/DD/YYYY
    let parts: Vec<&str> = s.splitn(3, '/').collect();
    if parts.len() == 3 {
        return Some(format!("{}-{:0>2}-{:0>2}", parts[2], parts[0], parts[1]));
    }
    Some(s.to_owned())
}

/// Parse a plain-text or CSV bank statement export.
/// Looks for lines that contain a date and a dollar amount and treats each as a line item.
fn parse_text_statement(file_path: &str) -> Result<ExtractedReceipt> {
    let content = std::fs::read_to_string(file_path)?;

    // Regex-free approach: scan each line for date-like and amount-like tokens.
    let mut line_items: Vec<ReceiptLineItem> = Vec::new();
    let mut first_date: Option<String> = None;

    for line in content.lines() {
        let line = line.trim();
        if line.is_empty() { continue; }

        // Look for a dollar amount pattern: optional $ then digits with optional decimals
        let amount = extract_amount(line);
        let date = extract_date_token(line);

        if amount.is_some() {
            if first_date.is_none() {
                first_date = date.clone();
            }
            // Use the whole line as description; strip the amount portion
            let description = line.to_owned();
            line_items.push(ReceiptLineItem { description, amount });
        }
    }

    // Use total of last line or largest single item as the "total" hint
    let total = line_items.last().and_then(|i| i.amount.clone());

    Ok(ExtractedReceipt {
        vendor: None,
        date: first_date,
        total,
        line_items,
        raw_text: content,
    })
}

/// Extract the first dollar-amount-like token from a string (e.g. "123.45", "$1,234.56").
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

/// Extract a date token (MM/DD/YYYY or YYYY-MM-DD) from a line.
fn extract_date_token(s: &str) -> Option<String> {
    for token in s.split_whitespace() {
        // YYYY-MM-DD
        if token.len() == 10 && token.chars().nth(4) == Some('-') {
            return Some(token.to_owned());
        }
        // MM/DD/YYYY
        let parts: Vec<&str> = token.splitn(3, '/').collect();
        if parts.len() == 3 && parts[2].len() == 4 {
            return Some(format!("{}-{:0>2}-{:0>2}", parts[2], parts[0], parts[1]));
        }
    }
    None
}
