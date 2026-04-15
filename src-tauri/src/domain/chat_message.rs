use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatMessage {
    pub id: String,
    pub client_id: String,
    pub role: String,
    pub content: String,
    pub evidence_id: Option<String>,
    pub created_at: String,
}
