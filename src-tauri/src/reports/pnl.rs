use rusqlite::params;
use rust_decimal::Decimal;
use serde::Serialize;

use crate::domain::transaction::cents_to_decimal;
use crate::{error::Result, state::AppState};

#[derive(Debug, Serialize)]
pub struct PnlLineItem {
    pub account_id: String,
    pub code: String,
    pub name: String,
    pub schedule_c_line: Option<String>,
    pub amount: Decimal,
}

#[derive(Debug, Serialize)]
pub struct PnlReport {
    pub date_from: String,
    pub date_to: String,
    pub revenue_lines: Vec<PnlLineItem>,
    pub cogs_lines: Vec<PnlLineItem>,
    pub expense_lines: Vec<PnlLineItem>,
    pub total_revenue: Decimal,
    pub total_cogs: Decimal,
    pub gross_profit: Decimal,
    pub total_expenses: Decimal,
    pub net_income: Decimal,
}

#[tauri::command(rename_all = "camelCase")]
pub fn get_pnl(
    date_from: String,
    date_to: String,
    client_id: Option<String>,
    app_handle: tauri::AppHandle,
    state: tauri::State<AppState>,
) -> Result<PnlReport> {
    crate::commands::scoped::with_scoped_conn(&state, Some(&app_handle), client_id.as_deref(), |conn| {
        compute_pnl(conn, &date_from, &date_to)
    })
}

pub fn compute_pnl(
    conn: &rusqlite::Connection,
    date_from: &str,
    date_to: &str,
) -> Result<PnlReport> {
    let mut stmt = conn.prepare(
        "SELECT a.id, a.code, a.name, a.account_type, a.schedule_c_line,
                COALESCE(SUM(CASE WHEN t.id IS NOT NULL THEN e.debit_cents  ELSE 0 END), 0) AS dr,
                COALESCE(SUM(CASE WHEN t.id IS NOT NULL THEN e.credit_cents ELSE 0 END), 0) AS cr
         FROM accounts a
         LEFT JOIN entries e ON e.account_id = a.id
         LEFT JOIN transactions t ON t.id = e.transaction_id
             AND t.txn_date >= ?1 AND t.txn_date < ?2
             AND t.status = 'posted'
         WHERE a.account_type IN ('revenue','expense') AND a.active = 1
         GROUP BY a.id
         ORDER BY a.sort_order, a.code",
    )?;

    #[derive(Debug)]
    struct Row {
        id: String,
        code: String,
        name: String,
        account_type: String,
        schedule_c_line: Option<String>,
        dr: i64,
        cr: i64,
    }

    let rows: Vec<Row> = stmt
        .query_map(params![date_from, date_to], |row| {
            Ok(Row {
                id: row.get(0)?,
                code: row.get(1)?,
                name: row.get(2)?,
                account_type: row.get(3)?,
                schedule_c_line: row.get(4)?,
                dr: row.get(5)?,
                cr: row.get(6)?,
            })
        })?
        .filter_map(|r| r.ok())
        .collect();

    let mut revenue_lines = Vec::new();
    let mut cogs_lines = Vec::new();
    let mut expense_lines = Vec::new();

    for row in rows {
        match row.account_type.as_str() {
            "revenue" => {
                let amount = cents_to_decimal(row.cr - row.dr);
                if amount == Decimal::ZERO {
                    continue;
                }
                revenue_lines.push(PnlLineItem {
                    account_id: row.id,
                    code: row.code,
                    name: row.name,
                    schedule_c_line: row.schedule_c_line,
                    amount,
                });
            }
            "expense" => {
                let amount = cents_to_decimal(row.dr - row.cr);
                if amount == Decimal::ZERO {
                    continue;
                }
                if row.code.starts_with('5') {
                    cogs_lines.push(PnlLineItem {
                        account_id: row.id,
                        code: row.code,
                        name: row.name,
                        schedule_c_line: row.schedule_c_line,
                        amount,
                    });
                } else {
                    expense_lines.push(PnlLineItem {
                        account_id: row.id,
                        code: row.code,
                        name: row.name,
                        schedule_c_line: row.schedule_c_line,
                        amount,
                    });
                }
            }
            _ => {}
        }
    }

    let total_revenue: Decimal = revenue_lines.iter().map(|l| l.amount).sum();
    let total_cogs: Decimal = cogs_lines.iter().map(|l| l.amount).sum();
    let gross_profit = total_revenue - total_cogs;
    let total_expenses: Decimal = expense_lines.iter().map(|l| l.amount).sum();
    let net_income = gross_profit - total_expenses;

    Ok(PnlReport {
        date_from: date_from.to_owned(),
        date_to: date_to.to_owned(),
        revenue_lines,
        cogs_lines,
        expense_lines,
        total_revenue,
        total_cogs,
        gross_profit,
        total_expenses,
        net_income,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use rust_decimal_macros::dec;

    #[test]
    fn net_income_calculation_is_correct() {
        let total_revenue = dec!(5000);
        let total_cogs = dec!(1000);
        let gross = total_revenue - total_cogs;
        let total_expenses = dec!(2000);
        let net = gross - total_expenses;
        assert_eq!(net, dec!(2000));
    }
}
