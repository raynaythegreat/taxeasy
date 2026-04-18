use rusqlite::params;
use rust_decimal::Decimal;
use serde::Serialize;

use crate::domain::transaction::cents_to_decimal;
use crate::{
    error::{AppError, Result},
    state::AppState,
};

#[derive(Debug, Serialize)]
pub struct CashFlowLineItem {
    pub label: String,
    pub amount: Decimal,
}

#[derive(Debug, Serialize)]
pub struct CashFlowReport {
    pub date_from: String,
    pub date_to: String,
    pub net_income: Decimal,
    pub operating_adjustments: Vec<CashFlowLineItem>,
    pub net_cash_from_operations: Decimal,
    pub investing_activities: Vec<CashFlowLineItem>,
    pub net_cash_from_investing: Decimal,
    pub financing_activities: Vec<CashFlowLineItem>,
    pub net_cash_from_financing: Decimal,
    pub net_change_in_cash: Decimal,
    pub beginning_cash: Decimal,
    pub ending_cash: Decimal,
}

#[tauri::command(rename_all = "camelCase")]
pub fn get_cash_flow(
    date_from: String,
    date_to: String,
    client_id: Option<String>,
    app_handle: tauri::AppHandle,
    state: tauri::State<AppState>,
) -> Result<CashFlowReport> {
    crate::commands::scoped::with_scoped_conn(&state, Some(&app_handle), client_id.as_deref(), |conn| {
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
            params![date_from, date_to],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
        )?;
        let net_income = cents_to_decimal((rev_cr - rev_dr) - (exp_dr - exp_cr));

        let dep_amount: i64 = conn.query_row(
            "SELECT COALESCE(SUM(e.debit_cents),0)
             FROM entries e
             JOIN transactions t ON t.id = e.transaction_id
             JOIN accounts a ON a.id = e.account_id
             WHERE t.txn_date >= ?1 AND t.txn_date < ?2
               AND t.status = 'posted'
               AND (LOWER(a.name) LIKE '%depreciation%' OR LOWER(a.name) LIKE '%amortization%')",
            params![date_from, date_to],
            |row| row.get(0),
        )?;
        let depreciation = cents_to_decimal(dep_amount);

        let (ar_start, ar_end) =
            balance_range_by_role(conn, "accounts_receivable", &date_from, &date_to)?;
        let delta_ar = -(ar_end - ar_start);

        let (ap_start, ap_end) =
            balance_range_by_role(conn, "accounts_payable", &date_from, &date_to)?;
        let delta_ap = ap_end - ap_start;

        let mut operating_adjustments = Vec::new();
        if !depreciation.is_zero() {
            operating_adjustments.push(CashFlowLineItem {
                label: "Depreciation & Amortization".into(),
                amount: depreciation,
            });
        }
        if !delta_ar.is_zero() {
            operating_adjustments.push(CashFlowLineItem {
                label: "Change in Accounts Receivable".into(),
                amount: delta_ar,
            });
        }
        if !delta_ap.is_zero() {
            operating_adjustments.push(CashFlowLineItem {
                label: "Change in Accounts Payable".into(),
                amount: delta_ap,
            });
        }
        let adj_total: Decimal = operating_adjustments.iter().map(|l| l.amount).sum();
        let net_cash_from_operations = net_income + adj_total;

        let (ppe_start, ppe_end) = balance_range_by_role(conn, "equipment", &date_from, &date_to)?;
        let delta_ppe = ppe_end - ppe_start;
        let investing_activities = if !delta_ppe.is_zero() {
            vec![CashFlowLineItem {
                label: "Purchase / Sale of Property & Equipment".into(),
                amount: -delta_ppe,
            }]
        } else {
            Vec::new()
        };
        let net_cash_from_investing: Decimal = investing_activities.iter().map(|l| l.amount).sum();

        let (loans_start, loans_end) =
            balance_range_by_role(conn, "long_term_loans", &date_from, &date_to)?;
        let delta_loans = loans_end - loans_start;

        let (draws_start, draws_end) =
            balance_range_by_role(conn, "owners_draw", &date_from, &date_to)?;
        let delta_draws = -(draws_end - draws_start);

        let mut financing_activities = Vec::new();
        if !delta_loans.is_zero() {
            financing_activities.push(CashFlowLineItem {
                label: "Proceeds / Repayment of Long-Term Loans".into(),
                amount: delta_loans,
            });
        }
        if !delta_draws.is_zero() {
            financing_activities.push(CashFlowLineItem {
                label: "Owner's Draws / Distributions".into(),
                amount: delta_draws,
            });
        }
        let net_cash_from_financing: Decimal = financing_activities.iter().map(|l| l.amount).sum();

        let day_before = shift_date(&date_from, -1);
        let (_, beg_cash) = balance_range_by_role(conn, "cash", &day_before, &date_from)?;
        let beginning_cash = beg_cash;
        let net_change =
            net_cash_from_operations + net_cash_from_investing + net_cash_from_financing;
        let ending_cash = beginning_cash + net_change;

        Ok(CashFlowReport {
            date_from,
            date_to,
            net_income,
            operating_adjustments,
            net_cash_from_operations,
            investing_activities,
            net_cash_from_investing,
            financing_activities,
            net_cash_from_financing,
            net_change_in_cash: net_change,
            beginning_cash,
            ending_cash,
        })
    })
}

fn balance_range_by_role(
    conn: &rusqlite::Connection,
    role: &str,
    date_from: &str,
    date_to: &str,
) -> Result<(Decimal, Decimal)> {
    let role_count: i64 = conn.query_row(
        "SELECT COUNT(*) FROM accounts WHERE system_account_role = ?1 AND active = 1",
        params![role],
        |row| row.get(0),
    )?;
    if role_count == 0 {
        return Err(AppError::Validation(format!("MissingSystemAccount:{role}")));
    }

    let day_before = shift_date(date_from, -1);

    let start: i64 = conn.query_row(
        "SELECT COALESCE(SUM(e.debit_cents),0) - COALESCE(SUM(e.credit_cents),0)
         FROM entries e
         JOIN transactions t ON t.id = e.transaction_id
         JOIN accounts a ON a.id = e.account_id
         WHERE a.system_account_role = ?1
           AND t.txn_date <= ?2
           AND t.status = 'posted'",
        params![role, day_before],
        |row| row.get(0),
    )?;

    let end: i64 = conn.query_row(
        "SELECT COALESCE(SUM(e.debit_cents),0) - COALESCE(SUM(e.credit_cents),0)
         FROM entries e
         JOIN transactions t ON t.id = e.transaction_id
         JOIN accounts a ON a.id = e.account_id
         WHERE a.system_account_role = ?1
           AND t.txn_date <= ?2
           AND t.status = 'posted'",
        params![role, date_to],
        |row| row.get(0),
    )?;

    Ok((cents_to_decimal(start), cents_to_decimal(end)))
}

fn shift_date(date: &str, days: i32) -> String {
    use chrono::NaiveDate;
    if let Ok(d) = NaiveDate::parse_from_str(date, "%Y-%m-%d") {
        let shifted = d + chrono::Duration::days(days as i64);
        return shifted.format("%Y-%m-%d").to_string();
    }
    date.to_owned()
}
