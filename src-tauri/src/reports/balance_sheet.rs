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

    // Running balance per account as-of-date.
    // Assets/Expenses: debit-normal → balance = SUM(dr) - SUM(cr)
    // Liabilities/Equity/Revenue: credit-normal → balance = SUM(cr) - SUM(dr)
    let mut stmt = conn.prepare(
        "SELECT a.id, a.code, a.name, a.account_type,
                COALESCE(SUM(e.debit_cents),0) AS dr,
                COALESCE(SUM(e.credit_cents),0) AS cr
         FROM accounts a
         LEFT JOIN entries e ON e.account_id = a.id
         LEFT JOIN transactions t ON t.id = e.transaction_id
             AND t.txn_date <= ?1
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

    let as_of_month: u8 = as_of_date[5..7].parse().unwrap_or(1);
    let year: i32 = as_of_date[..4].parse().unwrap_or(2025);
    let fy_year = if as_of_month >= fiscal_year_start_month {
        year
    } else {
        year - 1
    };
    let fiscal_start = format!("{fy_year}-{:02}-01", fiscal_year_start_month);

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
        params![fiscal_start, as_of_date],
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
        as_of_date,
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
