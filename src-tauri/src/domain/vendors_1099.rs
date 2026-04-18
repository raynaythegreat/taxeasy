use serde::{Deserialize, Serialize};

/// Vendor (contractor) record.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Vendor {
    pub id: String,
    pub client_id: String,
    pub name: String,
    pub ein: Option<String>,
    pub ssn_encrypted: Option<Vec<u8>>,
    pub address_line1: Option<String>,
    pub address_line2: Option<String>,
    pub city: Option<String>,
    pub state: Option<String>,
    pub postal_code: Option<String>,
    pub phone: Option<String>,
    pub email: Option<String>,
    pub total_payments_cents: i64,
    pub is_1099_required: bool,
    pub created_at: String,
}

/// Individual payment to a contractor.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ContractorPayment {
    pub id: String,
    pub vendor_id: String,
    pub transaction_id: String,
    pub amount_cents: i64,
    pub payment_date: String,
    pub created_at: String,
}

/// Generated 1099-NEC form record.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Generated1099Nec {
    pub id: String,
    pub vendor_id: String,
    pub tax_year: i32,
    pub box1_nonemployee_compensation: i64,
    pub box2_cash_received: i64,
    pub box4_federal_tax_withheld: i64,
    pub box5_state_tax_withheld: i64,
    pub box6_state_number: Option<String>,
    pub generated_at: String,
    pub pdf_path: Option<String>,
}
