/// Bank CSV import commands.
///
/// Two-step flow:
///   1. `preview_csv` — read headers + sample rows without any DB writes.
///   2. `import_csv`  — parse, convert to draft transactions, bulk-insert.
use chrono::NaiveDate;
use rust_decimal::Decimal;
use rusqlite::params;
use serde::{Deserialize, Serialize};
use std::str::FromStr;
use uuid::Uuid;

use crate::{
    error::{AppError, Result},
    state::AppState,
};

// ── Types ──────────────────────────────────────────────────────────────────────

#[derive(Debug, Serialize)]
pub struct CsvPreview {
    pub headers: Vec<String>,
    pub rows: Vec<Vec<String>>,
}

#[derive(Debug, Deserialize)]
pub struct ColumnMapping {
    /// 0-based index of the date column in the CSV.
    pub date_col: usize,
    /// 0-based index of the description column.
    pub description_col: usize,
    /// 0-based index of the amount column (signed; negative = outflow / expense).
    pub amount_col: usize,
    /// Optional 0-based index of a reference/memo column.
    pub reference_col: Option<usize>,
}

#[derive(Debug, Serialize)]
pub struct ImportResult {
    pub imported: usize,
    pub skipped: usize,
}

// ── Helpers ────────────────────────────────────────────────────────────────────

/// Try parsing a date string using common formats.
/// Returns `None` if all formats fail.
fn parse_date(raw: &str) -> Option<String> {
    let s = raw.trim();
    let formats = ["%Y-%m-%d", "%m/%d/%Y", "%d/%m/%Y", "%Y/%m/%d", "%m-%d-%Y"];
    for fmt in &formats {
        if let Ok(d) = NaiveDate::parse_from_str(s, fmt) {
            return Some(d.format("%Y-%m-%d").to_string());
        }
    }
    None
}

/// Parse a currency string into signed cents.
///
/// Handles:
///   - Leading `$` or `€` symbols
///   - Thousands separators (`,`)
///   - Parentheses for negatives: `(1234.56)` → `-123456`
///   - Explicit `-` sign
fn parse_amount_cents(raw: &str) -> Option<i64> {
    let s = raw.trim();

    // Parentheses → negative
    let (negative, s) = if s.starts_with('(') && s.ends_with(')') {
        (true, &s[1..s.len() - 1])
    } else {
        (false, s)
    };

    // Strip currency symbols, spaces, thousands separators
    let cleaned: String = s
        .chars()
        .filter(|c| c.is_ascii_digit() || *c == '.' || *c == '-')
        .collect();

    let d = Decimal::from_str(&cleaned).ok()?;
    let cents_dec = (d * Decimal::from(100)).round();
    let cents: i64 = cents_dec.try_into().ok()?;

    if negative { Some(-cents.abs()) } else { Some(cents) }
}

// ── Tauri commands ─────────────────────────────────────────────────────────────

/// Read the first `max_rows` data rows from a CSV file without touching the DB.
/// Returns the header row and a sample of data rows.
#[tauri::command(rename_all = "camelCase")]
pub fn preview_csv(path: String, max_rows: usize) -> Result<CsvPreview> {
    let mut rdr = csv::ReaderBuilder::new()
        .has_headers(true)
        .flexible(true)
        .from_path(&path)
        .map_err(|e| AppError::Validation(format!("cannot open CSV: {e}")))?;

    let headers: Vec<String> = rdr
        .headers()
        .map_err(|e| AppError::Validation(format!("cannot read CSV headers: {e}")))?
        .iter()
        .map(|s| s.to_string())
        .collect();

    let mut rows: Vec<Vec<String>> = Vec::new();
    for result in rdr.records().take(max_rows) {
        let record = result.map_err(|e| AppError::Validation(format!("CSV read error: {e}")))?;
        rows.push(record.iter().map(|s| s.to_string()).collect());
    }

    Ok(CsvPreview { headers, rows })
}

/// Import a CSV file as draft transactions using the provided column mapping.
///
/// Each row becomes a draft transaction (status = 'draft') with two entries:
///   - If `amount_cents >= 0` (inflow):  debit `default_debit_account`, credit `default_credit_account`
///   - If `amount_cents < 0`  (outflow): debit `default_debit_account`, credit `default_credit_account`
///
/// The caller picks default debit/credit accounts. Users can re-categorise later
/// in the draft queue.
#[tauri::command(rename_all = "camelCase")]
pub fn import_csv(
    path: String,
    mapping: ColumnMapping,
    default_debit_account: String,
    default_credit_account: String,
    state: tauri::State<AppState>,
) -> Result<ImportResult> {
    let lock = state.active_client.lock().unwrap();
    let ac = lock.as_ref().ok_or(AppError::NoActiveClient)?;
    let conn = ac.db.conn();

    let mut rdr = csv::ReaderBuilder::new()
        .has_headers(true)
        .flexible(true)
        .from_path(&path)
        .map_err(|e| AppError::Validation(format!("cannot open CSV: {e}")))?;

    // Collect all parseable rows first so we can wrap everything in one DB txn.
    struct ParsedRow {
        txn_date: String,
        description: String,
        reference: Option<String>,
        amount_cents: i64,
    }

    let mut parsed: Vec<ParsedRow> = Vec::new();
    let mut skipped: usize = 0;

    for result in rdr.records() {
        let record = match result {
            Ok(r) => r,
            Err(_) => {
                skipped += 1;
                continue;
            }
        };

        let fields: Vec<&str> = record.iter().collect();

        // Date
        let raw_date = fields.get(mapping.date_col).copied().unwrap_or("").trim();
        let txn_date = match parse_date(raw_date) {
            Some(d) => d,
            None => {
                skipped += 1;
                continue;
            }
        };

        // Description
        let description = fields
            .get(mapping.description_col)
            .copied()
            .unwrap_or("")
            .trim()
            .to_string();
        if description.is_empty() {
            skipped += 1;
            continue;
        }

        // Amount
        let raw_amt = fields.get(mapping.amount_col).copied().unwrap_or("").trim();
        let amount_cents = match parse_amount_cents(raw_amt) {
            Some(c) => c,
            None => {
                skipped += 1;
                continue;
            }
        };
        if amount_cents == 0 {
            skipped += 1;
            continue;
        }

        // Optional reference
        let reference = mapping.reference_col.and_then(|col| {
            fields.get(col).and_then(|s| {
                let t = s.trim().to_string();
                if t.is_empty() { None } else { Some(t) }
            })
        });

        parsed.push(ParsedRow { txn_date, description, reference, amount_cents });
    }

    if parsed.is_empty() {
        return Ok(ImportResult { imported: 0, skipped });
    }

    // Wrap all inserts in a single DB transaction for atomicity.
    conn.execute_batch("BEGIN")?;
    let result: Result<usize> = (|| {
        let now = chrono::Utc::now().to_rfc3339();
        let mut imported = 0usize;

        for row in &parsed {
            let txn_id = Uuid::new_v4().to_string();
            let abs_cents = row.amount_cents.unsigned_abs() as i64;

            // Determine which account gets the debit vs credit based on sign.
            // Negative amount = expense/outflow → debit the expense account (default_debit),
            //                                      credit the bank/asset (default_credit).
            // Positive amount = income/inflow  → debit the bank/asset (default_debit),
            //                                      credit the income account (default_credit).
            let (debit_acct, credit_acct) = if row.amount_cents < 0 {
                (default_debit_account.as_str(), default_credit_account.as_str())
            } else {
                (default_debit_account.as_str(), default_credit_account.as_str())
            };

            conn.execute(
                "INSERT INTO transactions (id, txn_date, description, reference, locked, status, created_at)
                 VALUES (?1, ?2, ?3, ?4, 0, 'draft', ?5)",
                params![txn_id, row.txn_date, row.description, row.reference, now],
            )?;

            let debit_entry_id = Uuid::new_v4().to_string();
            conn.execute(
                "INSERT INTO entries (id, transaction_id, account_id, debit_cents, credit_cents)
                 VALUES (?1, ?2, ?3, ?4, 0)",
                params![debit_entry_id, txn_id, debit_acct, abs_cents],
            )?;

            let credit_entry_id = Uuid::new_v4().to_string();
            conn.execute(
                "INSERT INTO entries (id, transaction_id, account_id, debit_cents, credit_cents)
                 VALUES (?1, ?2, ?3, 0, ?4)",
                params![credit_entry_id, txn_id, credit_acct, abs_cents],
            )?;

            imported += 1;
        }

        Ok(imported)
    })();

    match result {
        Ok(imported) => {
            conn.execute_batch("COMMIT")?;
            Ok(ImportResult { imported, skipped })
        }
        Err(e) => {
            let _ = conn.execute_batch("ROLLBACK");
            Err(e)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_date_iso() {
        assert_eq!(parse_date("2024-03-15"), Some("2024-03-15".into()));
    }

    #[test]
    fn parse_date_us_slash() {
        assert_eq!(parse_date("03/15/2024"), Some("2024-03-15".into()));
    }

    #[test]
    fn parse_date_eu_slash() {
        assert_eq!(parse_date("15/03/2024"), Some("2024-03-15".into()));
    }

    #[test]
    fn parse_date_invalid() {
        assert_eq!(parse_date("not-a-date"), None);
    }

    #[test]
    fn parse_amount_positive() {
        assert_eq!(parse_amount_cents("1234.56"), Some(123456));
    }

    #[test]
    fn parse_amount_with_dollar() {
        assert_eq!(parse_amount_cents("$1,234.56"), Some(123456));
    }

    #[test]
    fn parse_amount_negative() {
        assert_eq!(parse_amount_cents("-99.00"), Some(-9900));
    }

    #[test]
    fn parse_amount_parens() {
        assert_eq!(parse_amount_cents("(50.25)"), Some(-5025));
    }

    #[test]
    fn parse_amount_zero() {
        assert_eq!(parse_amount_cents("0.00"), Some(0));
    }
}
