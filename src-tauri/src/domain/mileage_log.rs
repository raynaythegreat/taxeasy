use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MileageLog {
    pub id: String,
    pub client_id: String,
    pub date: String,  // ISO-8601 "YYYY-MM-DD"
    pub purpose: String,
    pub origin: String,
    pub destination: String,
    pub miles_real: f64,
    pub rate_cents: i64,
    pub deduction_cents: i64,
    pub notes: Option<String>,
    pub receipt_image_path: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Deserialize)]
pub struct CreateMileagePayload {
    pub date: String,
    pub purpose: String,
    pub origin: String,
    pub destination: String,
    pub miles_real: f64,
    pub notes: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct MileageRate {
    pub year: i32,
    pub rate_cents: i64,
    pub effective_date: String,
    pub notes: Option<String>,
}
