use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};

/// A double-entry transaction header.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Transaction {
    pub id: String,
    pub txn_date: String, // "YYYY-MM-DD"
    pub description: String,
    pub reference: Option<String>,
    pub locked: bool,
    pub created_at: String,
}

/// One side of a double-entry line.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Entry {
    pub id: String,
    pub transaction_id: String,
    pub account_id: String,
    /// The account name/code for display (joined, not stored).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub account_name: Option<String>,
    /// Positive debit amount in dollars (stored as integer cents in DB).
    pub debit: Decimal,
    /// Positive credit amount in dollars (stored as integer cents in DB).
    pub credit: Decimal,
    pub memo: Option<String>,
}

/// Full transaction with all its entries (for display and editing).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TransactionWithEntries {
    #[serde(flatten)]
    pub transaction: Transaction,
    pub entries: Vec<Entry>,
}

/// Payload to create a transaction from the frontend.
#[derive(Debug, Deserialize)]
pub struct CreateTransactionPayload {
    pub txn_date: String,
    pub description: String,
    pub reference: Option<String>,
    pub entries: Vec<EntryPayload>,
}

#[derive(Debug, Deserialize)]
pub struct EntryPayload {
    pub account_id: String,
    /// Amount as a decimal string, e.g. "1234.56"
    pub debit: Option<String>,
    pub credit: Option<String>,
    pub memo: Option<String>,
}

impl EntryPayload {
    pub fn debit_cents(&self) -> crate::error::Result<i64> {
        amount_to_cents(&self.debit)
    }

    pub fn credit_cents(&self) -> crate::error::Result<i64> {
        amount_to_cents(&self.credit)
    }
}

fn amount_to_cents(s: &Option<String>) -> crate::error::Result<i64> {
    match s {
        None => Ok(0),
        Some(v) if v.is_empty() => Ok(0),
        Some(v) => {
            let d: Decimal = v
                .parse()
                .map_err(|_| crate::error::AppError::Validation(format!("invalid amount: {v}")))?;
            let cents = (d * Decimal::from(100))
                .round()
                .try_into()
                .map_err(|_| crate::error::AppError::Validation("amount too large".into()))?;
            Ok(cents)
        }
    }
}

/// Cents → Decimal dollars.
pub fn cents_to_decimal(cents: i64) -> Decimal {
    Decimal::new(cents, 2)
}
