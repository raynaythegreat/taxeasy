use chrono::Datelike;
use rusqlite::params;
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

#[tauri::command(rename_all = "camelCase")]
pub fn get_dashboard_stats(state: tauri::State<AppState>) -> Result<DashboardStats> {
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

    let (_client_id, fiscal_year_start_month) = {
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
        (cid, fym)
    };

    let now = chrono::Local::now();
    let current_month = now.month() as u8;
    let current_year = now.year();
    let fy_year = if current_month >= fiscal_year_start_month {
        current_year
    } else {
        current_year - 1
    };
    let ytd_start = format!("{fy_year}-{:02}-01", fiscal_year_start_month);
    let today = now.format("%Y-%m-%d").to_string();

    let lock = state.active_client.lock().unwrap();
    let ac = lock.as_ref().ok_or(AppError::NoActiveClient)?;
    let conn = ac.db.conn();

    let (rev_cr, rev_dr, exp_dr, exp_cr): (i64, i64, i64, i64) = conn.query_row(
        "SELECT
            COALESCE(SUM(CASE WHEN a.account_type='revenue' THEN e.credit_cents ELSE 0 END),0),
            COALESCE(SUM(CASE WHEN a.account_type='revenue' THEN e.debit_cents ELSE 0 END),0),
            COALESCE(SUM(CASE WHEN a.account_type='expense' THEN e.debit_cents ELSE 0 END),0),
            COALESCE(SUM(CASE WHEN a.account_type='expense' THEN e.credit_cents ELSE 0 END),0)
         FROM entries e
         JOIN transactions t ON t.id = e.transaction_id
         JOIN accounts a ON a.id = e.account_id
         WHERE t.txn_date BETWEEN ?1 AND ?2
           AND a.account_type IN ('revenue','expense')",
        params![ytd_start, today],
        |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
    )?;

    let ytd_revenue = cents_to_decimal(rev_cr - rev_dr);
    let ytd_expenses = cents_to_decimal(exp_dr - exp_cr);
    let ytd_net_income = ytd_revenue - ytd_expenses;

    let total_transactions: i64 =
        conn.query_row("SELECT COUNT(*) FROM transactions", [], |row| row.get(0))?;

    let mut stmt = conn.prepare(
        "SELECT t.id, t.txn_date, t.description,
                COALESCE(SUM(e.debit_cents),0) AS total_debit
         FROM transactions t
         LEFT JOIN entries e ON e.transaction_id = t.id
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

    let mut bal_stmt = conn.prepare(
        "SELECT a.account_type,
                COALESCE(SUM(e.debit_cents),0) AS dr,
                COALESCE(SUM(e.credit_cents),0) AS cr
         FROM accounts a
         LEFT JOIN entries e ON e.account_id = a.id
         LEFT JOIN transactions t ON t.id = e.transaction_id
         WHERE a.active = 1
         GROUP BY a.account_type",
    )?;

    let account_balances: Vec<AccountBalance> = bal_stmt
        .query_map([], |row| {
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
