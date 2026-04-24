//! Surya OCR engine integration.
//! Uses the `surya` Python package for modern OCR with layout detection.

use std::process::Command;

use crate::error::{AppError, Result};

/// Run Surya OCR on an image file and return the extracted text.
pub fn run_surya(image_path: &str) -> Result<String> {
    // Try surya CLI first
    let output = Command::new("surya")
        .arg("ocr")
        .arg(image_path)
        .arg("--output_format")
        .arg("text")
        .output();

    match output {
        Ok(o) if o.status.success() => {
            return Ok(String::from_utf8_lossy(&o.stdout).trim().to_owned());
        }
        Ok(o) => {
            let stderr = String::from_utf8_lossy(&o.stderr);
            log::warn!("Surya CLI failed: {}", stderr);
        }
        Err(e) => {
            log::warn!("Surya CLI not available: {}", e);
        }
    }

    // Fallback: try Python module directly
    let py_output = Command::new("python3")
        .arg("-c")
        .arg(format!(
            r#"
from surya.ocr import run_ocr
from surya.model.detection import load_model as load_det_model
from surya.model.recognition import load_model as load_rec_model
from surya.model.detection.config import load_model_config as load_det_config
from surya.model.recognition.config import load_model_config as load_rec_config
from PIL import Image

det_model, det_processor = load_det_model()
rec_model, rec_processor = load_rec_model()
det_config = load_det_config()
rec_config = load_rec_config()

img = Image.open("{}")
predictions = run_ocr(["{}"], [img], det_model, det_processor, rec_model, rec_processor, det_config, rec_config)
for p in predictions:
    print("\\n".join([l.text for l in p.text_lines]))
"#,
            image_path, image_path
        ))
        .output()
        .map_err(|e| AppError::AiService(format!("Failed to run surya: {e}. Is surya-ocr installed?")))?;

    if !py_output.status.success() {
        let stderr = String::from_utf8_lossy(&py_output.stderr);
        return Err(AppError::AiService(format!(
            "Surya Python failed: {stderr}"
        )));
    }

    Ok(String::from_utf8_lossy(&py_output.stdout).trim().to_owned())
}

/// Run Surya with layout detection to get structured text blocks.
pub fn run_surya_layout(image_path: &str) -> Result<SuryaLayoutResult> {
    let output = Command::new("python3")
        .arg("-c")
        .arg(format!(
            r#"
import json
from surya.ocr import run_ocr
from surya.model.detection import load_model as load_det_model
from surya.model.recognition import load_model as load_rec_model
from surya.model.detection.config import load_model_config as load_det_config
from surya.model.recognition.config import load_model_config as load_rec_config
from PIL import Image

det_model, det_processor = load_det_model()
rec_model, rec_processor = load_rec_model()
det_config = load_det_config()
rec_config = load_rec_config()

img = Image.open("{}")
predictions = run_ocr(["{}"], [img], det_model, det_processor, rec_model, rec_processor, det_config, rec_config)
result = {{
    "text": "\\n".join([l.text for l in predictions[0].text_lines]),
    "lines": [{{"text": l.text, "confidence": l.confidence, "bbox": l.bbox}} for l in predictions[0].text_lines]
}}
print(json.dumps(result))
"#,
            image_path, image_path
        ))
        .output()
        .map_err(|e| AppError::AiService(format!("Failed to run surya layout: {e}")))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(AppError::AiService(format!(
            "Surya layout failed: {stderr}"
        )));
    }

    let json_str = String::from_utf8_lossy(&output.stdout);
    serde_json::from_str(&json_str)
        .map_err(|e| AppError::AiService(format!("Failed to parse surya output: {e}")))
}

#[derive(Debug, serde::Deserialize)]
pub struct SuryaLayoutResult {
    pub text: String,
    pub lines: Vec<SuryaLine>,
}

#[derive(Debug, serde::Deserialize)]
pub struct SuryaLine {
    pub text: String,
    pub confidence: f32,
    pub bbox: Vec<f32>,
}

/// Check if Surya is available on the system.
pub fn is_surya_available() -> bool {
    Command::new("python3")
        .arg("-c")
        .arg("import surya")
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false)
}
