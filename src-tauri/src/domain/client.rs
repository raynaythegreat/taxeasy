use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum EntityType {
    SoleProp,
    Smllc,
    Scorp,
    Ccorp,
    Partnership,
    I1040,
}

impl EntityType {
    pub fn seed_file(&self) -> &'static str {
        match self {
            EntityType::SoleProp => "coa_sole_prop.json",
            EntityType::Smllc => "coa_smllc.json",
            EntityType::Scorp => "coa_scorp.json",
            EntityType::Ccorp => "coa_ccorp.json",
            EntityType::Partnership => "coa_partnership.json",
            EntityType::I1040 => "coa_i1040.json",
        }
    }

    pub fn as_str(&self) -> &'static str {
        match self {
            EntityType::SoleProp => "sole_prop",
            EntityType::Smllc => "smllc",
            EntityType::Scorp => "scorp",
            EntityType::Ccorp => "ccorp",
            EntityType::Partnership => "partnership",
            EntityType::I1040 => "i1040",
        }
    }
}

impl std::str::FromStr for EntityType {
    type Err = String;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s {
            "sole_prop" => Ok(EntityType::SoleProp),
            "smllc" => Ok(EntityType::Smllc),
            "scorp" => Ok(EntityType::Scorp),
            "ccorp" => Ok(EntityType::Ccorp),
            "partnership" => Ok(EntityType::Partnership),
            "i1040" => Ok(EntityType::I1040),
            other => Err(format!("unknown entity type: {other}")),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AccountingMethod {
    Cash,
    Accrual,
}

impl AccountingMethod {
    pub fn as_str(&self) -> &'static str {
        match self {
            AccountingMethod::Cash => "cash",
            AccountingMethod::Accrual => "accrual",
        }
    }
}

impl std::str::FromStr for AccountingMethod {
    type Err = String;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s {
            "cash" => Ok(AccountingMethod::Cash),
            "accrual" => Ok(AccountingMethod::Accrual),
            other => Err(format!("unknown accounting method: {other}")),
        }
    }
}

/// A bookkeeping client.  Sensitive fields (EIN) are encrypted at rest;
/// `ein` is the decrypted plaintext only after loading from the DB.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Client {
    pub id: String,
    pub name: String,
    pub entity_type: EntityType,
    /// Decrypted EIN string ("XX-XXXXXXX"), or None if not set.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ein: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub contact_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub email: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub phone: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub address_line1: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub address_line2: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub city: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub state: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub postal_code: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub country: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub website: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tax_preparer_notes: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub filing_notes: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub source_folder_path: Option<String>,
    pub fiscal_year_start_month: u8,
    pub accounting_method: AccountingMethod,
    pub archived_at: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
}

/// Payload for creating a new client (received from the frontend).
#[derive(Debug, Deserialize)]
pub struct CreateClientPayload {
    pub name: String,
    pub entity_type: EntityType,
    pub ein: Option<String>,
    pub contact_name: Option<String>,
    pub email: Option<String>,
    pub phone: Option<String>,
    pub address_line1: Option<String>,
    pub address_line2: Option<String>,
    pub city: Option<String>,
    pub state: Option<String>,
    pub postal_code: Option<String>,
    pub country: Option<String>,
    pub website: Option<String>,
    pub tax_preparer_notes: Option<String>,
    pub filing_notes: Option<String>,
    pub source_folder_path: Option<String>,
    pub fiscal_year_start_month: Option<u8>,
    pub accounting_method: Option<AccountingMethod>,
}
