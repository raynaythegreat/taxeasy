/// Balance Sheet (Statement of Financial Position) as of a date.
///
/// Invariant: Total Assets = Total Liabilities + Total Equity (± $0.01 rounding)
use rusqlite::params;
use rust_decimal::Decimal;
use serde::Serialize;

use crate::domain::transaction::cents_to_decimal;
use crate::{error::Result, state::AppState};

#[derive(Debug, Serialize)]
pub struct BalanceSheetLine {
    pub account_id: String,
    pub code: String,
    pub name: String,
    pub balance: Decimal,
}

#[derive(Debug, Serialize)]
pub struct BalanceSheetReport {
    pub as_of_date: String,
    pub asset_lines: Vec<BalanceSheetLine>,
    pub liability_lines: Vec<BalanceSheetLine>,
    pub equity_lines: Vec<BalanceSheetLine>,
    pub total_assets: Decimal,
    pub total_liabilities: Decimal,
    pub total_equity: Decimal,
    pub total_liabilities_and_equity: Decimal,
    /// Net income for the period is rolled into retained earnings on the BS.
    pub net_income_ytd: Decimal,
    /// True when Assets ≈ Liabilities + Equity (within $0.01).
    pub is_balanced: bool,
}

#[tauri::command(rename_all = "camelCase")]
pub fn get_balance_sheet(
    as_of_date: String,
    state: tauri::State<AppState>,
) -> Result<BalanceSheetReport> {
    let client_id = {
        let lock = state.active_client.lock().unwrap();
        lock.as_ref()
            .ok_or(crate::error::AppError::NoActiveClient)?
            .client_id
            .clone()
    };

    let fiscal_year_start_month: u8 = {
        let app_lock = state.app_db.lock().unwrap();
        let app_db = app_lock
            .as_ref()
            .ok_or(crate::error::AppError::NoActiveClient)?;
        app_db
            .conn()
            .query_row(
                "SELECT fiscal_year_start_month FROM clients WHERE id = ?1",
                params![client_id],
                |row| row.get(0),
            )
            .unwrap_or(1)
    };

    let lock = state.active_client.lock().unwrap();
    let ac = lock
        .as_ref()
        .ok_or(crate::error::AppError::NoActiveClient)?;
    let conn = ac.db.conn();

    // Compatibility adapter: the Tauri command still accepts a single as_of_date
    // string from callers that predate the period-scoped change. Treat it as the
    // end of the tax year containing as_of_date (Jan-start fiscal) and compute
    // period_start as Jan 1 of that year. Period-aware callers should migrate
    // to pass an explicit start/end.
    let (period_start, period_end) = as_of_to_period(&as_of_date);
    compute_balance_sheet(conn, &period_start, &period_end, fiscal_year_start_month)
}

/// Tauri command: cumulative balance sheet as of a date.
///
/// Uses `<= as_of_date` semantics so every transaction ever posted up to
/// (and including) `as_of_date` contributes — the traditional accounting
/// meaning of "Balance Sheet as of Dec 31".
#[tauri::command(rename_all = "camelCase")]
pub fn get_balance_sheet_cumulative(
    as_of_date: String,
    state: tauri::State<AppState>,
) -> Result<BalanceSheetReport> {
    let client_id = {
        let lock = state.active_client.lock().unwrap();
        lock.as_ref()
            .ok_or(crate::error::AppError::NoActiveClient)?
            .client_id
            .clone()
    };

    let fiscal_year_start_month: u8 = {
        let app_lock = state.app_db.lock().unwrap();
        let app_db = app_lock
            .as_ref()
            .ok_or(crate::error::AppError::NoActiveClient)?;
        app_db
            .conn()
            .query_row(
                "SELECT fiscal_year_start_month FROM clients WHERE id = ?1",
                params![client_id],
                |row| row.get(0),
            )
            .unwrap_or(1)
    };

    let lock = state.active_client.lock().unwrap();
    let ac = lock
        .as_ref()
        .ok_or(crate::error::AppError::NoActiveClient)?;
    let conn = ac.db.conn();

    compute_balance_sheet_cumulative(conn, &as_of_date, fiscal_year_start_month)
}

/// Pure computation: cumulative balance sheet as of `as_of_date` (inclusive).
///
/// Sums all posted transactions with `txn_date <= as_of_date`, which is the
/// traditional accounting semantics for a Statement of Financial Position.
pub fn compute_balance_sheet_cumulative(
    conn: &rusqlite::Connection,
    as_of_date: &str,
    fiscal_year_start_month: u8,
) -> Result<BalanceSheetReport> {
    let mut stmt = conn.prepare(
        "SELECT a.id, a.code, a.name, a.account_type,
                COALESCE(SUM(CASE WHEN t.id IS NOT NULL THEN e.debit_cents  ELSE 0 END),0) AS dr,
                COALESCE(SUM(CASE WHEN t.id IS NOT NULL THEN e.credit_cents ELSE 0 END),0) AS cr
         FROM accounts a
         LEFT JOIN entries e ON e.account_id = a.id
         LEFT JOIN transactions t ON t.id = e.transaction_id
             AND t.txn_date <= ?1
             AND t.status = 'posted'
         WHERE a.account_type IN ('asset','liability','equity') AND a.active = 1
         GROUP BY a.id
         ORDER BY a.sort_order, a.code",
    )?;

    struct Row {
        id: String,
        code: String,
        name: String,
        account_type: String,
        dr: i64,
        cr: i64,
    }

    let rows: Vec<Row> = stmt
        .query_map(params![as_of_date], |row| {
            Ok(Row {
                id: row.get(0)?,
                code: row.get(1)?,
                name: row.get(2)?,
                account_type: row.get(3)?,
                dr: row.get(4)?,
                cr: row.get(5)?,
            })
        })?
        .filter_map(|r| r.ok())
        .collect();

    let mut asset_lines = Vec::new();
    let mut liability_lines = Vec::new();
    let mut equity_lines = Vec::new();

    for row in rows {
        match row.account_type.as_str() {
            "asset" => {
                let balance = cents_to_decimal(row.dr - row.cr);
                asset_lines.push(BalanceSheetLine {
                    account_id: row.id,
                    code: row.code,
                    name: row.name,
                    balance,
                });
            }
            "liability" => {
                let balance = cents_to_decimal(row.cr - row.dr);
                liability_lines.push(BalanceSheetLine {
                    account_id: row.id,
                    code: row.code,
                    name: row.name,
                    balance,
                });
            }
            "equity" => {
                let balance = cents_to_decimal(row.cr - row.dr);
                equity_lines.push(BalanceSheetLine {
                    account_id: row.id,
                    code: row.code,
                    name: row.name,
                    balance,
                });
            }
            _ => {}
        }
    }

    // Cumulative net income: all revenue/expense activity up to as_of_date.
    let _ = fiscal_year_start_month; // reserved for future fiscal-aware views
    let (rev_cr, rev_dr, exp_dr, exp_cr): (i64, i64, i64, i64) = conn.query_row(
        "SELECT
            COALESCE(SUM(CASE WHEN a.account_type='revenue' THEN e.credit_cents ELSE 0 END),0),
            COALESCE(SUM(CASE WHEN a.account_type='revenue' THEN e.debit_cents ELSE 0 END),0),
            COALESCE(SUM(CASE WHEN a.account_type='expense' THEN e.debit_cents ELSE 0 END),0),
            COALESCE(SUM(CASE WHEN a.account_type='expense' THEN e.credit_cents ELSE 0 END),0)
         FROM entries e
         JOIN transactions t ON t.id = e.transaction_id
         JOIN accounts a ON a.id = e.account_id
         WHERE t.txn_date <= ?1
           AND t.status = 'posted'
           AND a.account_type IN ('revenue','expense')",
        params![as_of_date],
        |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
    )?;

    let net_income_ytd = cents_to_decimal((rev_cr - rev_dr) - (exp_dr - exp_cr));

    let total_assets: Decimal = asset_lines.iter().map(|l| l.balance).sum();
    let total_liabilities: Decimal = liability_lines.iter().map(|l| l.balance).sum();
    let total_equity: Decimal =
        equity_lines.iter().map(|l| l.balance).sum::<Decimal>() + net_income_ytd;
    let total_l_e = total_liabilities + total_equity;

    let diff = (total_assets - total_l_e).abs();
    let tolerance = Decimal::new(1, 2); // $0.01
    let is_balanced = diff <= tolerance;

    Ok(BalanceSheetReport {
        as_of_date: as_of_date.to_owned(),
        asset_lines,
        liability_lines,
        equity_lines,
        total_assets,
        total_liabilities,
        total_equity,
        total_liabilities_and_equity: total_l_e,
        net_income_ytd,
        is_balanced,
    })
}

/// Map a legacy `as_of_date` string ("YYYY-MM-DD") to a half-open [Jan-1 that year, Jan-1 next year).
/// Used so existing frontend callers keep working while the new period-scoped
/// Balance Sheet is the real semantic.
fn as_of_to_period(as_of_date: &str) -> (String, String) {
    let year: i32 = as_of_date.get(..4).and_then(|s| s.parse().ok()).unwrap_or(2025);
    (format!("{year}-01-01"), format!("{}-01-01", year + 1))
}

/// Pure computation: run the Balance Sheet queries against `conn`.
///
/// Period-scoped: includes only transactions whose date falls within the
/// half-open [period_start, period_end) range. The exposed `as_of_date` on
/// the returned report equals `period_end - 1` for compatibility with the
/// existing frontend date label.
///
/// Extracted from `get_balance_sheet` so integration tests can call this
/// directly without a Tauri `State` handle.
pub fn compute_balance_sheet(
    conn: &rusqlite::Connection,
    period_start: &str,
    period_end: &str,
    fiscal_year_start_month: u8,
) -> Result<BalanceSheetReport> {
    // Period-scoped Balance Sheet: includes only transactions that posted WITHIN
    // the selected [period_start, period_end) half-open range. This matches user
    // expectation that "if no transaction was entered in a year, nothing shows
    // for that year" — even though it diverges from the traditional cumulative
    // Balance Sheet semantic. See docs/ACCOUNTING-METHOD.md for rationale.
    //
    // LEFT JOIN + CASE WHEN guard: entries whose transactions fall outside the
    // date/status filter have NULL t.id; we sum zero for those so they don't
    // leak through the LEFT JOIN.
    //
    // Previous semantic (cumulative, t.txn_date <= as_of_date) is retained as a
    // fallback when caller passes period_end = "<as_of_date>+1" and period_start
    // = "0001-01-01" — any date earlier than all data.
    let mut stmt = conn.prepare(
        "SELECT a.id, a.code, a.name, a.account_type,
                COALESCE(SUM(CASE WHEN t.id IS NOT NULL THEN e.debit_cents  ELSE 0 END),0) AS dr,
                COALESCE(SUM(CASE WHEN t.id IS NOT NULL THEN e.credit_cents ELSE 0 END),0) AS cr
         FROM accounts a
         LEFT JOIN entries e ON e.account_id = a.id
         LEFT JOIN transactions t ON t.id = e.transaction_id
             AND t.txn_date >= ?1 AND t.txn_date < ?2
             AND t.status = 'posted'
         WHERE a.account_type IN ('asset','liability','equity') AND a.active = 1
         GROUP BY a.id
         ORDER BY a.sort_order, a.code",
    )?;

    struct Row {
        id: String,
        code: String,
        name: String,
        account_type: String,
        dr: i64,
        cr: i64,
    }

    let rows: Vec<Row> = stmt
        .query_map(params![period_start, period_end], |row| {
            Ok(Row {
                id: row.get(0)?,
                code: row.get(1)?,
                name: row.get(2)?,
                account_type: row.get(3)?,
                dr: row.get(4)?,
                cr: row.get(5)?,
            })
        })?
        .filter_map(|r| r.ok())
        .collect();

    let mut asset_lines = Vec::new();
    let mut liability_lines = Vec::new();
    let mut equity_lines = Vec::new();

    for row in rows {
        match row.account_type.as_str() {
            "asset" => {
                let balance = cents_to_decimal(row.dr - row.cr);
                asset_lines.push(BalanceSheetLine {
                    account_id: row.id,
                    code: row.code,
                    name: row.name,
                    balance,
                });
            }
            "liability" => {
                let balance = cents_to_decimal(row.cr - row.dr);
                liability_lines.push(BalanceSheetLine {
                    account_id: row.id,
                    code: row.code,
                    name: row.name,
                    balance,
                });
            }
            "equity" => {
                let balance = cents_to_decimal(row.cr - row.dr);
                equity_lines.push(BalanceSheetLine {
                    account_id: row.id,
                    code: row.code,
                    name: row.name,
                    balance,
                });
            }
            _ => {}
        }
    }

    // Period net income — revenue/expense activity within [period_start, period_end).
    let _ = fiscal_year_start_month; // reserved for future fiscal-aware views
    let (rev_cr, rev_dr, exp_dr, exp_cr): (i64, i64, i64, i64) = conn.query_row(
        "SELECT
            COALESCE(SUM(CASE WHEN a.account_type='revenue' THEN e.credit_cents ELSE 0 END),0),
            COALESCE(SUM(CASE WHEN a.account_type='revenue' THEN e.debit_cents ELSE 0 END),0),
            COALESCE(SUM(CASE WHEN a.account_type='expense' THEN e.debit_cents ELSE 0 END),0),
            COALESCE(SUM(CASE WHEN a.account_type='expense' THEN e.credit_cents ELSE 0 END),0)
         FROM entries e
         JOIN transactions t ON t.id = e.transaction_id
         JOIN accounts a ON a.id = e.account_id
         WHERE t.txn_date >= ?1 AND t.txn_date < ?2
           AND t.status = 'posted'
           AND a.account_type IN ('revenue','expense')",
        params![period_start, period_end],
        |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
    )?;

    let net_income_ytd = cents_to_decimal((rev_cr - rev_dr) - (exp_dr - exp_cr));

    let total_assets: Decimal = asset_lines.iter().map(|l| l.balance).sum();
    let total_liabilities: Decimal = liability_lines.iter().map(|l| l.balance).sum();
    let total_equity: Decimal =
        equity_lines.iter().map(|l| l.balance).sum::<Decimal>() + net_income_ytd;
    let total_l_e = total_liabilities + total_equity;

    let diff = (total_assets - total_l_e).abs();
    let tolerance = Decimal::new(1, 2); // $0.01
    let is_balanced = diff <= tolerance;

    // Display "as of" = last day of the period (period_end is half-open, so -1).
    let as_of_display = {
        use chrono::NaiveDate;
        NaiveDate::parse_from_str(period_end, "%Y-%m-%d")
            .map(|d| (d - chrono::Duration::days(1)).format("%Y-%m-%d").to_string())
            .unwrap_or_else(|_| period_end.to_owned())
    };

    Ok(BalanceSheetReport {
        as_of_date: as_of_display,
        asset_lines,
        liability_lines,
        equity_lines,
        total_assets,
        total_liabilities,
        total_equity,
        total_liabilities_and_equity: total_l_e,
        net_income_ytd,
        is_balanced,
    })
}
