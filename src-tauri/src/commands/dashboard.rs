use chrono::Datelike;
use rusqlite::{params, Connection};
use rust_decimal::Decimal;
use serde::Serialize;

use crate::{
    domain::transaction::cents_to_decimal,
    error::{AppError, Result},
    state::AppState,
};

#[derive(Debug, Serialize)]
pub struct DashboardStats {
    pub total_clients: i64,
    pub active_clients: i64,
    pub ytd_revenue: Decimal,
    pub ytd_expenses: Decimal,
    pub ytd_net_income: Decimal,
    pub total_transactions: i64,
    pub recent_transactions: Vec<RecentTransaction>,
    pub account_balances: Vec<AccountBalance>,
}

#[derive(Debug, Serialize)]
pub struct RecentTransaction {
    pub id: String,
    pub txn_date: String,
    pub description: String,
    pub total_debit: Decimal,
}

#[derive(Debug, Serialize)]
pub struct AccountBalance {
    pub account_type: String,
    pub balance: Decimal,
}

#[derive(Debug, Serialize)]
pub struct NetCashPoint {
    pub bucket: String,
    pub net_cents: i64,
}

#[derive(Debug, Serialize)]
pub struct CategoryTotal {
    pub account_id: String,
    pub account_name: String,
    pub total_cents: i64,
    pub percentage: Decimal,
}

#[derive(Debug, Serialize)]
pub struct DeductibleSummary {
    pub total_cents: i64,
    pub total: Decimal,
}

/// Compute the fiscal-YTD half-open range [ytd_start, tomorrow) for a client.
fn fiscal_ytd_range(state: &AppState) -> Result<(String, String)> {
    let fiscal_year_start_month = {
        let lock = state.active_client.lock().unwrap();
        let ac = lock.as_ref().ok_or(AppError::NoActiveClient)?;
        let cid = ac.client_id.clone();
        drop(lock);

        let app_lock = state.app_db.lock().unwrap();
        let db = app_lock.as_ref().ok_or(AppError::NoActiveClient)?;
        let fym: u8 = db
            .conn()
            .query_row(
                "SELECT fiscal_year_start_month FROM clients WHERE id = ?1",
                params![cid],
                |row| row.get(0),
            )
            .unwrap_or(1);
        fym
    };

    let now = chrono::Local::now();
    let current_month = now.month() as u8;
    let current_year = now.year();
    let fy_year = if current_month >= fiscal_year_start_month {
        current_year
    } else {
        current_year - 1
    };
    let start = format!("{fy_year}-{:02}-01", fiscal_year_start_month);
    let end = {
        use chrono::Duration;
        (now + Duration::days(1)).format("%Y-%m-%d").to_string()
    };
    Ok((start, end))
}

/// Pure-SQL inner function: computes dashboard stats for a half-open [start, end) range.
/// Extracted from the Tauri command so integration tests can call it directly.
pub(crate) fn compute_dashboard_stats(
    conn: &Connection,
    total_clients: i64,
    active_clients: i64,
    start: &str,
    end: &str,
) -> Result<DashboardStats> {
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
        params![start, end],
        |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
    )?;

    let ytd_revenue = cents_to_decimal(rev_cr - rev_dr);
    let ytd_expenses = cents_to_decimal(exp_dr - exp_cr);
    let ytd_net_income = ytd_revenue - ytd_expenses;

    let total_transactions: i64 = conn.query_row(
        "SELECT COUNT(*) FROM transactions WHERE status = 'posted'",
        [],
        |row| row.get(0),
    )?;

    let mut stmt = conn.prepare(
        "SELECT t.id, t.txn_date, t.description,
                COALESCE(SUM(e.debit_cents),0) AS total_debit
         FROM transactions t
         LEFT JOIN entries e ON e.transaction_id = t.id
         WHERE t.status = 'posted'
         GROUP BY t.id
         ORDER BY t.txn_date DESC, t.created_at DESC
         LIMIT 5",
    )?;

    let recent_transactions: Vec<RecentTransaction> = stmt
        .query_map([], |row| {
            Ok(RecentTransaction {
                id: row.get(0)?,
                txn_date: row.get(1)?,
                description: row.get(2)?,
                total_debit: cents_to_decimal(row.get::<_, i64>(3)?),
            })
        })?
        .filter_map(|r| r.ok())
        .collect();

    // Fix: the LEFT JOIN keeps accounts with zero activity (correct), but the ON clause
    // filter on status and date only NULLs out the transaction columns — entries whose
    // transactions fail the filter still have non-NULL debit_cents/credit_cents.
    // Use CASE WHEN t.id IS NOT NULL to sum only entries whose transaction passed both
    // the status='posted' and the date-range conditions.
    let mut bal_stmt = conn.prepare(
        "SELECT a.account_type,
                COALESCE(SUM(CASE WHEN t.id IS NOT NULL THEN e.debit_cents  ELSE 0 END), 0) AS dr,
                COALESCE(SUM(CASE WHEN t.id IS NOT NULL THEN e.credit_cents ELSE 0 END), 0) AS cr
         FROM accounts a
         LEFT JOIN entries e ON e.account_id = a.id
         LEFT JOIN transactions t ON t.id = e.transaction_id
             AND t.status = 'posted'
             AND t.txn_date >= ?1
             AND t.txn_date < ?2
         WHERE a.active = 1
         GROUP BY a.account_type",
    )?;

    let account_balances: Vec<AccountBalance> = bal_stmt
        .query_map(params![start, end], |row| {
            let atype: String = row.get(0)?;
            let dr: i64 = row.get(1)?;
            let cr: i64 = row.get(2)?;
            let balance = match atype.as_str() {
                "asset" | "expense" => cents_to_decimal(dr - cr),
                _ => cents_to_decimal(cr - dr),
            };
            Ok(AccountBalance {
                account_type: atype,
                balance,
            })
        })?
        .filter_map(|r| r.ok())
        .collect();

    Ok(DashboardStats {
        total_clients,
        active_clients,
        ytd_revenue,
        ytd_expenses,
        ytd_net_income,
        total_transactions,
        recent_transactions,
        account_balances,
    })
}

/// Dashboard stats for a given half-open [start, end) range.
/// If start/end are empty strings, falls back to fiscal YTD.
#[tauri::command(rename_all = "camelCase")]
pub fn get_dashboard_stats(
    state: tauri::State<AppState>,
    start: Option<String>,
    end: Option<String>,
) -> Result<DashboardStats> {
    let (total_clients, active_clients) = {
        let lock = state.app_db.lock().unwrap();
        let db = lock.as_ref().ok_or(AppError::NoActiveClient)?;
        let conn = db.conn();
        let total: i64 = conn.query_row("SELECT COUNT(*) FROM clients", [], |row| row.get(0))?;
        let active: i64 = conn.query_row(
            "SELECT COUNT(*) FROM clients WHERE archived_at IS NULL",
            [],
            |row| row.get(0),
        )?;
        (total, active)
    };

    let (range_start, range_end) = match (start, end) {
        (Some(s), Some(e)) if !s.is_empty() && !e.is_empty() => (s, e),
        _ => fiscal_ytd_range(&state)?,
    };

    let lock = state.active_client.lock().unwrap();
    let ac = lock.as_ref().ok_or(AppError::NoActiveClient)?;
    let conn = ac.db.conn();

    compute_dashboard_stats(conn, total_clients, active_clients, &range_start, &range_end)
}

/// Bucket options for net cash trend.
#[derive(Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum TrendBucket {
    Daily,
    Weekly,
    Monthly,
}

/// Net cash trend: one point per bucket within [start, end).
#[tauri::command(rename_all = "camelCase")]
pub fn get_net_cash_trend(
    state: tauri::State<AppState>,
    start: String,
    end: String,
    bucket: TrendBucket,
) -> Result<Vec<NetCashPoint>> {
    let lock = state.active_client.lock().unwrap();
    let ac = lock.as_ref().ok_or(AppError::NoActiveClient)?;
    let conn = ac.db.conn();

    // Use SQLite strftime to group dates into buckets.
    let fmt = match bucket {
        TrendBucket::Daily => "%Y-%m-%d",
        TrendBucket::Weekly => "%Y-W%W",
        TrendBucket::Monthly => "%Y-%m",
    };

    let sql = format!(
        "SELECT strftime('{fmt}', t.txn_date) AS bucket,
                COALESCE(SUM(
                    CASE WHEN a.account_type = 'revenue' THEN e.credit_cents - e.debit_cents
                         WHEN a.account_type = 'expense' THEN -(e.debit_cents - e.credit_cents)
                         ELSE 0 END
                ), 0) AS net_cents
         FROM transactions t
         JOIN entries e ON e.transaction_id = t.id
         JOIN accounts a ON a.id = e.account_id
         WHERE t.txn_date >= ?1 AND t.txn_date < ?2
           AND t.status = 'posted'
           AND a.account_type IN ('revenue', 'expense')
         GROUP BY bucket
         ORDER BY bucket"
    );

    let mut stmt = conn.prepare(&sql)?;
    let points: Vec<NetCashPoint> = stmt
        .query_map(params![start, end], |row| {
            Ok(NetCashPoint {
                bucket: row.get(0)?,
                net_cents: row.get(1)?,
            })
        })?
        .filter_map(|r| r.ok())
        .collect();

    Ok(points)
}

/// Top N expense categories by total spend within [start, end).
#[tauri::command(rename_all = "camelCase")]
pub fn get_top_categories(
    state: tauri::State<AppState>,
    start: String,
    end: String,
    n: Option<i64>,
) -> Result<Vec<CategoryTotal>> {
    let limit = n.unwrap_or(5).clamp(1, 20);
    let lock = state.active_client.lock().unwrap();
    let ac = lock.as_ref().ok_or(AppError::NoActiveClient)?;
    let conn = ac.db.conn();

    let mut stmt = conn.prepare(
        "SELECT a.id, a.name,
                COALESCE(SUM(e.debit_cents - e.credit_cents), 0) AS total_cents
         FROM accounts a
         JOIN entries e ON e.account_id = a.id
         JOIN transactions t ON t.id = e.transaction_id
         WHERE a.account_type = 'expense'
           AND t.txn_date >= ?1 AND t.txn_date < ?2
           AND t.status = 'posted'
         GROUP BY a.id
         ORDER BY total_cents DESC
         LIMIT ?3",
    )?;

    let rows: Vec<(String, String, i64)> = stmt
        .query_map(params![start, end, limit], |row| {
            Ok((row.get(0)?, row.get(1)?, row.get::<_, i64>(2)?))
        })?
        .filter_map(|r| r.ok())
        .collect();

    let grand_total: i64 = rows.iter().map(|(_, _, c)| c).sum();

    let categories = rows
        .into_iter()
        .map(|(id, name, cents)| {
            let pct = if grand_total > 0 {
                cents_to_decimal(cents * 10000 / grand_total) / Decimal::ONE_HUNDRED
            } else {
                Decimal::ZERO
            };
            CategoryTotal {
                account_id: id,
                account_name: name,
                total_cents: cents,
                percentage: pct,
            }
        })
        .collect();

    Ok(categories)
}

/// Sum of expenses on accounts where deductible = 1 within [start, end).
#[tauri::command(rename_all = "camelCase")]
pub fn get_deductible_expenses(
    state: tauri::State<AppState>,
    start: String,
    end: String,
) -> Result<DeductibleSummary> {
    let lock = state.active_client.lock().unwrap();
    let ac = lock.as_ref().ok_or(AppError::NoActiveClient)?;
    let conn = ac.db.conn();

    let total_cents: i64 = conn.query_row(
        "SELECT COALESCE(SUM(e.debit_cents - e.credit_cents), 0)
         FROM entries e
         JOIN accounts a ON a.id = e.account_id
         JOIN transactions t ON t.id = e.transaction_id
         WHERE a.account_type = 'expense'
           AND a.deductible = 1
           AND t.txn_date >= ?1 AND t.txn_date < ?2
           AND t.status = 'posted'",
        params![start, end],
        |row| row.get(0),
    )?;

    Ok(DeductibleSummary {
        total_cents,
        total: cents_to_decimal(total_cents),
    })
}
