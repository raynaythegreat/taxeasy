use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DraftTransaction {
    pub id: String,
    pub client_id: String,
    pub evidence_id: String,
    pub date: Option<String>,
    pub description: Option<String>,
    pub reference: Option<String>,
    pub debit_account_id: Option<String>,
    pub credit_account_id: Option<String>,
    pub amount: Option<i64>,
    pub notes: Option<String>,
    pub status: String,
    pub created_at: String,
    pub updated_at: String,
}
