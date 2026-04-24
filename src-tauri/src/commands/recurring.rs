/// Recurring transaction schedule commands.
use chrono::{Datelike, Duration, NaiveDate};
use rusqlite::params;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::{
    commands::scoped::with_scoped_conn,
    domain::transaction::cents_to_decimal,
    error::{AppError, Result},
    state::AppState,
};

// ── Domain types ───────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RecurringTransaction {
    pub id: String,
    pub client_id: String,
    pub description: String,
    pub amount_cents: i64,
    pub debit_account_id: String,
    pub credit_account_id: String,
    pub frequency: String,
    pub start_date: String,
    pub next_run_date: String,
    pub end_date: Option<String>,
    pub active: bool,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Deserialize)]
pub struct CreateRecurringPayload {
    pub description: String,
    pub amount_cents: i64,
    pub debit_account_id: String,
    pub credit_account_id: String,
    pub frequency: String,
    pub start_date: String,
    pub end_date: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateRecurringPatch {
    pub description: Option<String>,
    pub amount_cents: Option<i64>,
    pub debit_account_id: Option<String>,
    pub credit_account_id: Option<String>,
    pub frequency: Option<String>,
    pub end_date: Option<String>,
    pub active: Option<bool>,
}

#[derive(Debug, Serialize)]
pub struct RunDueResult {
    pub created: usize,
}

// ── Date advancement ───────────────────────────────────────────────────────────

/// Advance `current` by one period of `frequency`, with month-end clamping.
///
/// Examples:
///   monthly from 2024-01-31 → 2024-02-29 (leap) or 2024-02-28
///   quarterly from 2024-01-31 → 2024-04-30
fn next_date(current: &str, frequency: &str) -> Option<String> {
    let d = NaiveDate::parse_from_str(current, "%Y-%m-%d").ok()?;
    let next = match frequency {
        "weekly" => d + Duration::weeks(1),
        "monthly" => add_months(d, 1),
        "quarterly" => add_months(d, 3),
        "yearly" => add_months(d, 12),
        _ => return None,
    };
    Some(next.format("%Y-%m-%d").to_string())
}

/// Add `months` to a date with month-end clamping.
fn add_months(d: NaiveDate, months: u32) -> NaiveDate {
    let total_months = d.month0() + months;
    let year_offset = total_months / 12;
    let new_month = (total_months % 12) + 1; // 1-based
    let new_year = d.year() + year_offset as i32;

    // Clamp day to the last valid day of the target month.
    let max_day = days_in_month(new_year, new_month);
    let new_day = d.day().min(max_day);

    NaiveDate::from_ymd_opt(new_year, new_month, new_day)
        .unwrap_or_else(|| NaiveDate::from_ymd_opt(new_year, new_month, max_day).unwrap())
}

fn days_in_month(year: i32, month: u32) -> u32 {
    // First day of the next month minus one day.
    let (y, m) = if month == 12 {
        (year + 1, 1)
    } else {
        (year, month + 1)
    };
    NaiveDate::from_ymd_opt(y, m, 1)
        .and_then(|d| d.pred_opt())
        .map(|d| d.day())
        .unwrap_or(28)
}

// ── Helpers ────────────────────────────────────────────────────────────────────

fn validate_frequency(f: &str) -> Result<()> {
    match f {
        "weekly" | "monthly" | "quarterly" | "yearly" => Ok(()),
        other => Err(AppError::Validation(format!("invalid frequency: {other}"))),
    }
}

fn row_to_recurring(row: &rusqlite::Row<'_>) -> rusqlite::Result<RecurringTransaction> {
    Ok(RecurringTransaction {
        id: row.get(0)?,
        client_id: row.get(1)?,
        description: row.get(2)?,
        amount_cents: row.get(3)?,
        debit_account_id: row.get(4)?,
        credit_account_id: row.get(5)?,
        frequency: row.get(6)?,
        start_date: row.get(7)?,
        next_run_date: row.get(8)?,
        end_date: row.get(9)?,
        active: row.get::<_, i32>(10)? != 0,
        created_at: row.get(11)?,
        updated_at: row.get(12)?,
    })
}

const SELECT_COLS: &str =
    "id, client_id, description, amount_cents, debit_account_id, credit_account_id,
     frequency, start_date, next_run_date, end_date, active, created_at, updated_at";

// ── Tauri commands ─────────────────────────────────────────────────────────────

/// List all recurring transactions for the active scope.
#[tauri::command(rename_all = "camelCase")]
pub fn list_recurring(
    client_id: Option<String>,
    app_handle: tauri::AppHandle,
    state: tauri::State<AppState>,
) -> Result<Vec<RecurringTransaction>> {
    with_scoped_conn(&state, Some(&app_handle), client_id.as_deref(), |conn| {
        let sql = format!(
            "SELECT {SELECT_COLS} FROM recurring_transactions ORDER BY next_run_date ASC, description ASC"
        );
        let mut stmt = conn.prepare(&sql)?;
        let rows = stmt
            .query_map([], row_to_recurring)?
            .filter_map(|r| r.ok())
            .collect();
        Ok(rows)
    })
}

/// Create a new recurring transaction schedule.
#[tauri::command(rename_all = "camelCase")]
pub fn create_recurring(
    client_id: Option<String>,
    app_handle: tauri::AppHandle,
    payload: CreateRecurringPayload,
    state: tauri::State<AppState>,
) -> Result<RecurringTransaction> {
    validate_frequency(&payload.frequency)?;
    if payload.description.trim().is_empty() {
        return Err(AppError::Validation("description is required".into()));
    }
    if payload.amount_cents == 0 {
        return Err(AppError::Validation("amount must be non-zero".into()));
    }

    let effective_client_id = client_id.as_deref().unwrap_or("owner").to_string();

    with_scoped_conn(&state, Some(&app_handle), client_id.as_deref(), |conn| {
        let id = Uuid::new_v4().to_string();
        let now = chrono::Utc::now().to_rfc3339();

        conn.execute(
            "INSERT INTO recurring_transactions
             (id, client_id, description, amount_cents, debit_account_id, credit_account_id,
              frequency, start_date, next_run_date, end_date, active, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, 1, ?11, ?11)",
            params![
                id,
                effective_client_id,
                payload.description.trim(),
                payload.amount_cents,
                payload.debit_account_id,
                payload.credit_account_id,
                payload.frequency,
                payload.start_date,
                payload.start_date,
                payload.end_date,
                now,
            ],
        )?;

        conn.query_row(
            &format!("SELECT {SELECT_COLS} FROM recurring_transactions WHERE id = ?1"),
            params![id],
            row_to_recurring,
        )
        .map_err(AppError::Database)
    })
}

/// Update fields on an existing recurring transaction.
#[tauri::command(rename_all = "camelCase")]
pub fn update_recurring(
    client_id: Option<String>,
    app_handle: tauri::AppHandle,
    id: String,
    patch: UpdateRecurringPatch,
    state: tauri::State<AppState>,
) -> Result<RecurringTransaction> {
    if let Some(ref f) = patch.frequency {
        validate_frequency(f)?;
    }

    with_scoped_conn(&state, Some(&app_handle), client_id.as_deref(), |conn| {
        let now = chrono::Utc::now().to_rfc3339();

        if let Some(d) = patch.description {
            conn.execute(
                "UPDATE recurring_transactions SET description = ?1, updated_at = ?2 WHERE id = ?3",
                params![d.trim(), now, id],
            )?;
        }
        if let Some(a) = patch.amount_cents {
            conn.execute(
                "UPDATE recurring_transactions SET amount_cents = ?1, updated_at = ?2 WHERE id = ?3",
                params![a, now, id],
            )?;
        }
        if let Some(acct) = patch.debit_account_id {
            conn.execute(
                "UPDATE recurring_transactions SET debit_account_id = ?1, updated_at = ?2 WHERE id = ?3",
                params![acct, now, id],
            )?;
        }
        if let Some(acct) = patch.credit_account_id {
            conn.execute(
                "UPDATE recurring_transactions SET credit_account_id = ?1, updated_at = ?2 WHERE id = ?3",
                params![acct, now, id],
            )?;
        }
        if let Some(f) = patch.frequency {
            conn.execute(
                "UPDATE recurring_transactions SET frequency = ?1, updated_at = ?2 WHERE id = ?3",
                params![f, now, id],
            )?;
        }
        if let Some(ed) = patch.end_date {
            conn.execute(
                "UPDATE recurring_transactions SET end_date = ?1, updated_at = ?2 WHERE id = ?3",
                params![ed, now, id],
            )?;
        }
        if let Some(active) = patch.active {
            conn.execute(
                "UPDATE recurring_transactions SET active = ?1, updated_at = ?2 WHERE id = ?3",
                params![active as i32, now, id],
            )?;
        }

        conn.query_row(
            &format!("SELECT {SELECT_COLS} FROM recurring_transactions WHERE id = ?1"),
            params![id],
            row_to_recurring,
        )
        .map_err(|_| AppError::NotFound(format!("recurring transaction {id}")))
    })
}

/// Delete a recurring transaction schedule (hard delete — no generated txns are removed).
#[tauri::command(rename_all = "camelCase")]
pub fn delete_recurring(
    client_id: Option<String>,
    app_handle: tauri::AppHandle,
    id: String,
    state: tauri::State<AppState>,
) -> Result<()> {
    with_scoped_conn(&state, Some(&app_handle), client_id.as_deref(), |conn| {
        let rows = conn.execute(
            "DELETE FROM recurring_transactions WHERE id = ?1",
            params![id],
        )?;
        if rows == 0 {
            return Err(AppError::NotFound(format!("recurring transaction {id}")));
        }
        Ok(())
    })
}

/// Internal helper — run due recurring transactions given a live connection.
/// Called from `switch_client` on every client open (non-fatal on error).
pub(crate) fn run_due_on_conn(conn: &rusqlite::Connection) -> usize {
    let today = chrono::Local::now().format("%Y-%m-%d").to_string();
    let sql = format!(
        "SELECT {SELECT_COLS} FROM recurring_transactions
         WHERE active = 1 AND next_run_date <= ?1
         ORDER BY next_run_date ASC"
    );
    let due: Vec<RecurringTransaction> = {
        let mut stmt = match conn.prepare(&sql) {
            Ok(s) => s,
            Err(e) => {
                log::warn!("recurring auto-run: prepare: {e}");
                return 0;
            }
        };
        stmt.query_map(rusqlite::params![today], row_to_recurring)
            .map(|rows| rows.filter_map(|r| r.ok()).collect())
            .unwrap_or_default()
    };
    if due.is_empty() {
        return 0;
    }

    if conn.execute_batch("BEGIN").is_err() {
        return 0;
    }
    let now = chrono::Utc::now().to_rfc3339();
    let mut created = 0usize;
    let ok = (|| -> crate::error::Result<()> {
        for rec in &due {
            if let Some(ref end) = rec.end_date {
                if rec.next_run_date.as_str() > end.as_str() {
                    conn.execute(
                        "UPDATE recurring_transactions SET active = 0, updated_at = ?1 WHERE id = ?2",
                        rusqlite::params![now, rec.id],
                    )?;
                    continue;
                }
            }
            let txn_id = Uuid::new_v4().to_string();
            let abs_cents = rec.amount_cents.unsigned_abs() as i64;
            conn.execute(
                "INSERT INTO transactions (id, txn_date, description, reference, locked, status, created_at)
                 VALUES (?1, ?2, ?3, NULL, 0, 'posted', ?4)",
                rusqlite::params![txn_id, rec.next_run_date, rec.description, now],
            )?;
            let d_id = Uuid::new_v4().to_string();
            conn.execute(
                "INSERT INTO entries (id, transaction_id, account_id, debit_cents, credit_cents) VALUES (?1,?2,?3,?4,0)",
                rusqlite::params![d_id, txn_id, rec.debit_account_id, abs_cents],
            )?;
            let c_id = Uuid::new_v4().to_string();
            conn.execute(
                "INSERT INTO entries (id, transaction_id, account_id, debit_cents, credit_cents) VALUES (?1,?2,?3,0,?4)",
                rusqlite::params![c_id, txn_id, rec.credit_account_id, abs_cents],
            )?;
            let audit_id = Uuid::new_v4().to_string();
            let after_json = serde_json::to_string(&rec.description).unwrap_or_default();
            conn.execute(
                "INSERT INTO audit_log (id, action, entity_type, entity_id, after_json) VALUES (?1,'create','transaction',?2,?3)",
                rusqlite::params![audit_id, txn_id, after_json],
            )?;
            if let Some(next) = next_date(&rec.next_run_date, &rec.frequency) {
                let deactivate = rec
                    .end_date
                    .as_ref()
                    .map(|ed| next.as_str() > ed.as_str())
                    .unwrap_or(false);
                conn.execute(
                    "UPDATE recurring_transactions SET next_run_date=?1, active=?2, updated_at=?3 WHERE id=?4",
                    rusqlite::params![next, if deactivate { 0i32 } else { 1i32 }, now, rec.id],
                )?;
            } else {
                conn.execute(
                    "UPDATE recurring_transactions SET active=0, updated_at=?1 WHERE id=?2",
                    rusqlite::params![now, rec.id],
                )?;
            }
            created += 1;
        }
        Ok(())
    })();
    match ok {
        Ok(()) => {
            let _ = conn.execute_batch("COMMIT");
            created
        }
        Err(e) => {
            log::warn!("recurring auto-run: rollback: {e}");
            let _ = conn.execute_batch("ROLLBACK");
            0
        }
    }
}

/// Scan for due recurring transactions and generate posted transactions for each.
/// Advances `next_run_date` by the frequency after each generation.
///
/// Called automatically on app unlock (non-fatal — errors are logged as warnings).
#[tauri::command(rename_all = "camelCase")]
pub fn run_due_recurring(
    client_id: Option<String>,
    app_handle: tauri::AppHandle,
    state: tauri::State<AppState>,
) -> Result<RunDueResult> {
    with_scoped_conn(&state, Some(&app_handle), client_id.as_deref(), |conn| {
        let today = chrono::Local::now().format("%Y-%m-%d").to_string();

        let sql = format!(
            "SELECT {SELECT_COLS} FROM recurring_transactions
             WHERE active = 1 AND next_run_date <= ?1
             ORDER BY next_run_date ASC"
        );
        let mut stmt = conn.prepare(&sql)?;
        let due: Vec<RecurringTransaction> = stmt
            .query_map(params![today], row_to_recurring)?
            .filter_map(|r| r.ok())
            .collect();

        if due.is_empty() {
            return Ok(RunDueResult { created: 0 });
        }

        conn.execute_batch("BEGIN")?;
        let result: Result<usize> = (|| {
            let now = chrono::Utc::now().to_rfc3339();
            let mut created = 0usize;

            for rec in &due {
                if let Some(ref end) = rec.end_date {
                    if rec.next_run_date.as_str() > end.as_str() {
                        conn.execute(
                            "UPDATE recurring_transactions SET active = 0, updated_at = ?1 WHERE id = ?2",
                            params![now, rec.id],
                        )?;
                        continue;
                    }
                }

                let txn_id = Uuid::new_v4().to_string();
                let abs_cents = rec.amount_cents.unsigned_abs() as i64;

                conn.execute(
                    "INSERT INTO transactions (id, txn_date, description, reference, locked, status, created_at)
                     VALUES (?1, ?2, ?3, NULL, 0, 'posted', ?4)",
                    params![txn_id, rec.next_run_date, rec.description, now],
                )?;

                let debit_id = Uuid::new_v4().to_string();
                conn.execute(
                    "INSERT INTO entries (id, transaction_id, account_id, debit_cents, credit_cents)
                     VALUES (?1, ?2, ?3, ?4, 0)",
                    params![debit_id, txn_id, rec.debit_account_id, abs_cents],
                )?;

                let credit_id = Uuid::new_v4().to_string();
                conn.execute(
                    "INSERT INTO entries (id, transaction_id, account_id, debit_cents, credit_cents)
                     VALUES (?1, ?2, ?3, 0, ?4)",
                    params![credit_id, txn_id, rec.credit_account_id, abs_cents],
                )?;

                let audit_id = Uuid::new_v4().to_string();
                let after_json = serde_json::to_string(&rec.description).unwrap_or_default();
                conn.execute(
                    "INSERT INTO audit_log (id, action, entity_type, entity_id, after_json)
                     VALUES (?1, 'create', 'transaction', ?2, ?3)",
                    params![audit_id, txn_id, after_json],
                )?;

                if let Some(next) = next_date(&rec.next_run_date, &rec.frequency) {
                    let should_deactivate = rec
                        .end_date
                        .as_ref()
                        .map(|ed| next.as_str() > ed.as_str())
                        .unwrap_or(false);

                    conn.execute(
                        "UPDATE recurring_transactions
                         SET next_run_date = ?1, active = ?2, updated_at = ?3
                         WHERE id = ?4",
                        params![
                            next,
                            if should_deactivate { 0i32 } else { 1i32 },
                            now,
                            rec.id
                        ],
                    )?;
                } else {
                    conn.execute(
                        "UPDATE recurring_transactions SET active = 0, updated_at = ?1 WHERE id = ?2",
                        params![now, rec.id],
                    )?;
                }

                let _ = cents_to_decimal(abs_cents);
                created += 1;
            }

            Ok(created)
        })();

        match result {
            Ok(created) => {
                conn.execute_batch("COMMIT")?;
                Ok(RunDueResult { created })
            }
            Err(e) => {
                let _ = conn.execute_batch("ROLLBACK");
                Err(e)
            }
        }
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn next_date_weekly() {
        assert_eq!(next_date("2024-01-01", "weekly"), Some("2024-01-08".into()));
    }

    #[test]
    fn next_date_monthly_normal() {
        assert_eq!(
            next_date("2024-03-15", "monthly"),
            Some("2024-04-15".into())
        );
    }

    #[test]
    fn next_date_monthly_month_end_clamp() {
        // Jan 31 + 1 month → Feb 29 (2024 is leap year)
        assert_eq!(
            next_date("2024-01-31", "monthly"),
            Some("2024-02-29".into())
        );
    }

    #[test]
    fn next_date_monthly_non_leap_clamp() {
        // Jan 31 + 1 month on 2023 (non-leap) → Feb 28
        assert_eq!(
            next_date("2023-01-31", "monthly"),
            Some("2023-02-28".into())
        );
    }

    #[test]
    fn next_date_quarterly() {
        assert_eq!(
            next_date("2024-01-15", "quarterly"),
            Some("2024-04-15".into())
        );
    }

    #[test]
    fn next_date_yearly() {
        assert_eq!(next_date("2024-03-01", "yearly"), Some("2025-03-01".into()));
    }

    #[test]
    fn next_date_invalid_frequency() {
        assert_eq!(next_date("2024-01-01", "daily"), None);
    }

    #[test]
    fn validate_frequency_ok() {
        assert!(validate_frequency("weekly").is_ok());
        assert!(validate_frequency("monthly").is_ok());
        assert!(validate_frequency("quarterly").is_ok());
        assert!(validate_frequency("yearly").is_ok());
    }

    #[test]
    fn validate_frequency_bad() {
        assert!(validate_frequency("daily").is_err());
    }
}
