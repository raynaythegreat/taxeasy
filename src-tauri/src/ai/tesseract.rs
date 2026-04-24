//! Tesseract OCR engine integration.
//! Uses the `tesseract` CLI binary to extract text from images.

use std::process::Command;
use tempfile::TempDir;

use crate::error::{AppError, Result};

/// Run Tesseract OCR on an image file and return the extracted text.
pub fn run_tesseract(image_path: &str) -> Result<String> {
    let tmp_dir = TempDir::new()?;
    let output_path = tmp_dir.path().join("output");

    let output = Command::new("tesseract")
        .arg(image_path)
        .arg(&output_path)
        .arg("--psm")
        .arg("6") // Assume a single uniform block of text
        .output()
        .map_err(|e| {
            AppError::AiService(format!("Failed to run tesseract: {e}. Is it installed?"))
        })?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(AppError::AiService(format!("Tesseract failed: {stderr}")));
    }

    let text_path = format!("{}.txt", output_path.to_string_lossy());
    std::fs::read_to_string(&text_path)
        .map_err(|e| AppError::AiService(format!("Cannot read tesseract output: {e}")))
        .map(|s| s.trim().to_owned())
}

/// Run Tesseract with JSON output for structured data.
pub fn run_tesseract_json(image_path: &str) -> Result<TesseractJson> {
    let output = Command::new("tesseract")
        .arg(image_path)
        .arg("stdout")
        .arg("--psm")
        .arg("6")
        .arg("-c")
        .arg("outputbase=json")
        .output()
        .map_err(|e| AppError::AiService(format!("Failed to run tesseract: {e}")))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(AppError::AiService(format!("Tesseract failed: {stderr}")));
    }

    let json_str = String::from_utf8_lossy(&output.stdout);
    serde_json::from_str(&json_str)
        .map_err(|e| AppError::AiService(format!("Failed to parse tesseract JSON: {e}")))
}

#[derive(Debug, serde::Deserialize)]
pub struct TesseractJson {
    #[serde(rename = "parseBlocks")]
    pub parse_blocks: Option<ParseBlocks>,
    pub text: Option<String>,
}

#[derive(Debug, serde::Deserialize)]
pub struct ParseBlocks {
    pub blocks: Option<Vec<Block>>,
}

#[derive(Debug, serde::Deserialize)]
pub struct Block {
    #[serde(rename = "blockType")]
    pub block_type: Option<String>,
    pub paragraphs: Option<Vec<Paragraph>>,
}

#[derive(Debug, serde::Deserialize)]
pub struct Paragraph {
    pub lines: Option<Vec<Line>>,
}

#[derive(Debug, serde::Deserialize)]
pub struct Line {
    pub words: Option<Vec<Word>>,
}

#[derive(Debug, serde::Deserialize)]
pub struct Word {
    pub text: Option<String>,
    pub confidence: Option<f32>,
}

/// Check if Tesseract is available on the system.
pub fn is_tesseract_available() -> bool {
    Command::new("tesseract")
        .arg("--version")
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false)
}
