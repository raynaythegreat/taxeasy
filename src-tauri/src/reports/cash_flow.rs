/// Cash Flow Statement (indirect method).
///
/// Period bounds: half-open [date_from, date_to) — date_to is exclusive.
/// Balance Sheet positions use inclusive <= semantics for point-in-time balances.
///
/// Structure:
///   Operating Activities  = Net Income ± non-cash adjustments ± Δ working capital
///   Investing Activities  = Δ long-term assets
///   Financing Activities  = Δ long-term debt + equity contributions/distributions
///
/// B2: Account matching uses `system_account_role` FK instead of fragile name-LIKE
/// queries.  If a required role is unmapped, `ReportError::MissingSystemAccount` is
/// returned so the frontend can surface an actionable banner.
use rusqlite::params;
use rust_decimal::Decimal;
use serde::Serialize;

use crate::{error::{AppError, Result}, state::AppState};
use crate::domain::transaction::cents_to_decimal;

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
    state: tauri::State<AppState>,
) -> Result<CashFlowReport> {
    let lock = state.active_client.lock().unwrap();
    let ac = lock.as_ref().ok_or(AppError::NoActiveClient)?;
    let conn = ac.db.conn();

    // ── 1. Net income for the period ─────────────────────────────────────────
    // B1: status = 'posted'; B3: half-open [date_from, date_to)
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

    // ── 2. Depreciation add-back (non-cash) ──────────────────────────────────
    // Still matched by name pattern — no system role for depreciation sub-accounts.
    // B1: status = 'posted'; B3: half-open
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

    // ── 3. Working capital changes: Δ Accounts Receivable ─────────────────────
    // B2: role-based lookup; error if unmapped.
    let (ar_start, ar_end) = balance_range_by_role(conn, "accounts_receivable", &date_from, &date_to)?;
    let delta_ar = -(ar_end - ar_start); // increase in AR = use of cash → negative

    // ── 4. Working capital changes: Δ Accounts Payable ───────────────────────
    let (ap_start, ap_end) = balance_range_by_role(conn, "accounts_payable", &date_from, &date_to)?;
    let delta_ap = ap_end - ap_start; // increase in AP = source of cash → positive

    // ── 5. Operating section ──────────────────────────────────────────────────
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

    // ── 6. Investing: Δ Property & Equipment (net of depreciation) ───────────
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

    // ── 7. Financing: long-term loans, distributions ──────────────────────────
    let (loans_start, loans_end) = balance_range_by_role(conn, "long_term_loans", &date_from, &date_to)?;
    let delta_loans = loans_end - loans_start;

    let (draws_start, draws_end) = balance_range_by_role(conn, "owners_draw", &date_from, &date_to)?;
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

    // ── 8. Cash balances ──────────────────────────────────────────────────────
    // Beginning cash = balance as of day before date_from (inclusive point-in-time).
    let day_before = shift_date(&date_from, -1);
    let (_, beg_cash) = balance_range_by_role(conn, "cash", &day_before, &date_from)?;
    let beginning_cash = beg_cash;
    let net_change = net_cash_from_operations + net_cash_from_investing + net_cash_from_financing;
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
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/// Get (balance_at_start_of_period, balance_at_end_of_period) for accounts
/// identified by `system_account_role`.
///
/// Returns `AppError::Validation` (serialised as "MissingSystemAccount:<role>")
/// when no account carries the requested role, so the frontend can surface an
/// actionable banner instead of silently returning $0.
///
/// Balance queries use INCLUSIVE `<= date` semantics — these are point-in-time
/// balance snapshots, not flow aggregations.
/// B1: only posted transactions contribute to balances.
fn balance_range_by_role(
    conn: &rusqlite::Connection,
    role: &str,
    date_from: &str,
    date_to: &str,
) -> Result<(Decimal, Decimal)> {
    // Verify at least one account carries this role.
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

/// Shift an ISO date string by `days` days using chrono.
fn shift_date(date: &str, days: i32) -> String {
    use chrono::NaiveDate;
    if let Ok(d) = NaiveDate::parse_from_str(date, "%Y-%m-%d") {
        let shifted = d + chrono::Duration::days(days as i64);
        return shifted.format("%Y-%m-%d").to_string();
    }
    date.to_owned()
}
