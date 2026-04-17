use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatMessage {
    pub id: String,
    pub client_id: String,
    pub role: String,
    pub content: String,
    pub evidence_id: Option<String>,
    pub created_at: String,
    pub tool_name: Option<String>,
    pub tool_input: Option<String>,
    pub tool_output: Option<String>,
    pub tool_status: Option<String>,
    pub parent_message_id: Option<String>,
    pub metadata: Option<String>,
}
