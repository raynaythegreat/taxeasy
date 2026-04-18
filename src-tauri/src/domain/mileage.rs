use serde::{Deserialize, Serialize};

/// Domain type for a mileage log entry
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MileageLog {
    pub id: String,
    pub client_id: String,
    pub date: String,  // ISO 8601 format
    pub purpose: String,
    pub origin: String,
    pub destination: String,
    pub miles_real: f64,
    pub rate_cents: i32,
    pub deduction_cents: i64,
    pub notes: Option<String>,
    pub receipt_image_path: Option<String>,
    pub created_at: String,
}

/// IRS standard mileage rate for a specific year
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IrsRate {
    pub year: i32,
    pub rate_cents: i32,  // Rate in cents (e.g., 67 = $0.67 per mile)
}

/// Summary statistics for mileage in a year
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MileageSummary {
    pub year: i32,
    pub total_miles: f64,
    pub total_deduction_cents: i64,
    pub log_count: i32,
}

/// Payload for creating a new mileage log
#[derive(Debug, Deserialize)]
pub struct CreateMileagePayload {
    pub client_id: String,
    pub date: String,
    pub purpose: String,
    pub origin: String,
    pub destination: String,
    pub miles_real: f64,
    pub notes: Option<String>,
    pub receipt_image_path: Option<String>,
}

/// Payload for updating an existing mileage log
#[derive(Debug, Deserialize)]
pub struct UpdateMileagePayload {
    pub date: Option<String>,
    pub purpose: Option<String>,
    pub origin: Option<String>,
    pub destination: Option<String>,
    pub miles_real: Option<f64>,
    pub notes: Option<String>,
    pub receipt_image_path: Option<String>,
}
