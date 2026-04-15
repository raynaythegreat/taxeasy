use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Evidence {
    pub id: String,
    pub client_id: String,
    pub source_type: String,
    pub source_file_name: Option<String>,
    pub source_file_hash: Option<String>,
    pub source_file_path: Option<String>,
    pub ocr_raw_text: Option<String>,
    pub extracted_fields: Option<String>,
    pub model_used: String,
    pub confidence_score: Option<f64>,
    pub created_at: String,
    pub updated_at: String,
}
