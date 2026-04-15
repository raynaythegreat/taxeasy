use rusqlite::params;

use crate::{
    domain::transaction::cents_to_decimal,
    error::{AppError, Result},
    state::AppState,
};

fn csv_escape(s: &str) -> String {
    if s.contains(',') || s.contains('"') || s.contains('\n') {
        format!("\"{}\"", s.replace('"', "\"\""))
    } else {
        s.to_owned()
    }
}

#[tauri::command(rename_all = "camelCase")]
pub fn export_transactions_csv(
    date_from: String,
    date_to: String,
    state: tauri::State<AppState>,
) -> Result<String> {
    let lock = state.active_client.lock().unwrap();
    let ac = lock.as_ref().ok_or(AppError::NoActiveClient)?;
    let conn = ac.db.conn();

    let mut stmt = conn.prepare(
        "SELECT t.txn_date, t.description, t.reference, a.name, e.debit_cents, e.credit_cents
         FROM entries e
         JOIN transactions t ON t.id = e.transaction_id
         JOIN accounts a ON a.id = e.account_id
         WHERE t.txn_date BETWEEN ?1 AND ?2
         ORDER BY t.txn_date, t.created_at, e.id",
    )?;

    let rows: Vec<(String, String, Option<String>, String, i64, i64)> = stmt
        .query_map(params![date_from, date_to], |row| {
            Ok((
                row.get(0)?,
                row.get(1)?,
                row.get(2)?,
                row.get(3)?,
                row.get(4)?,
                row.get(5)?,
            ))
        })?
        .filter_map(|r| r.ok())
        .collect();

    let mut csv = String::from("Date,Description,Reference,Account,Debit,Credit\n");
    for row in &rows {
        let debit = cents_to_decimal(row.4);
        let credit = cents_to_decimal(row.5);
        let reference = row.2.as_deref().unwrap_or("");
        csv.push_str(&format!(
            "{},{},{},{},{},{}\n",
            csv_escape(&row.0),
            csv_escape(&row.1),
            csv_escape(reference),
            csv_escape(&row.3),
            debit,
            credit,
        ));
    }

    Ok(csv)
}

#[tauri::command(rename_all = "camelCase")]
pub fn export_report_csv(
    report_type: String,
    date_from: String,
    date_to: String,
    state: tauri::State<AppState>,
) -> Result<String> {
    match report_type.as_str() {
        "pnl" => export_pnl_csv(&date_from, &date_to, &state),
        "balance_sheet" => export_balance_sheet_csv(&date_to, &state),
        "cash_flow" => export_cash_flow_csv(&date_from, &date_to, &state),
        _ => Err(AppError::Validation(format!(
            "unknown report type: {report_type}"
        ))),
    }
}

fn export_pnl_csv(date_from: &str, date_to: &str, state: &AppState) -> Result<String> {
    let lock = state.active_client.lock().unwrap();
    let ac = lock.as_ref().ok_or(AppError::NoActiveClient)?;
    let conn = ac.db.conn();

    let mut stmt = conn.prepare(
        "SELECT a.code, a.name, a.account_type,
                COALESCE(SUM(e.debit_cents),0) AS dr,
                COALESCE(SUM(e.credit_cents),0) AS cr
         FROM accounts a
         LEFT JOIN entries e ON e.account_id = a.id
         LEFT JOIN transactions t ON t.id = e.transaction_id
             AND t.txn_date BETWEEN ?1 AND ?2
         WHERE a.account_type IN ('revenue','expense') AND a.active = 1
         GROUP BY a.id
         ORDER BY a.sort_order, a.code",
    )?;

    let rows: Vec<(String, String, String, i64, i64)> = stmt
        .query_map(params![date_from, date_to], |row| {
            Ok((
                row.get(0)?,
                row.get(1)?,
                row.get(2)?,
                row.get(3)?,
                row.get(4)?,
            ))
        })?
        .filter_map(|r| r.ok())
        .collect();

    let mut csv = String::from("Section,Code,Name,Amount\n");
    let mut total_revenue = rust_decimal::Decimal::ZERO;
    let mut total_expenses = rust_decimal::Decimal::ZERO;

    for row in &rows {
        if row.2 == "revenue" {
            let amount = cents_to_decimal(row.4 - row.3);
            if !amount.is_zero() {
                csv.push_str(&format!(
                    "Revenue,{},{},{}\n",
                    csv_escape(&row.0),
                    csv_escape(&row.1),
                    amount
                ));
                total_revenue += amount;
            }
        }
    }

    for row in &rows {
        if row.2 == "expense" {
            let amount = cents_to_decimal(row.3 - row.4);
            if !amount.is_zero() {
                csv.push_str(&format!(
                    "Expense,{},{},{}\n",
                    csv_escape(&row.0),
                    csv_escape(&row.1),
                    amount
                ));
                total_expenses += amount;
            }
        }
    }

    csv.push_str(&format!(
        ",,,\n,,,Total Revenue,{}\n,,,Total Expenses,{}\n,,,Net Income,{}\n",
        total_revenue,
        total_expenses,
        total_revenue - total_expenses
    ));

    Ok(csv)
}

fn export_balance_sheet_csv(as_of_date: &str, state: &AppState) -> Result<String> {
    let lock = state.active_client.lock().unwrap();
    let ac = lock.as_ref().ok_or(AppError::NoActiveClient)?;
    let conn = ac.db.conn();

    let mut stmt = conn.prepare(
        "SELECT a.code, a.name, a.account_type,
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

    let rows: Vec<(String, String, String, i64, i64)> = stmt
        .query_map(params![as_of_date], |row| {
            Ok((
                row.get(0)?,
                row.get(1)?,
                row.get(2)?,
                row.get(3)?,
                row.get(4)?,
            ))
        })?
        .filter_map(|r| r.ok())
        .collect();

    let mut csv = String::from("Section,Code,Name,Balance\n");
    let mut total_assets = rust_decimal::Decimal::ZERO;
    let mut total_liabilities = rust_decimal::Decimal::ZERO;
    let mut total_equity = rust_decimal::Decimal::ZERO;

    for row in &rows {
        let balance = match row.2.as_str() {
            "asset" => {
                let b = cents_to_decimal(row.3 - row.4);
                total_assets += b;
                b
            }
            "liability" => {
                let b = cents_to_decimal(row.4 - row.3);
                total_liabilities += b;
                b
            }
            "equity" => {
                let b = cents_to_decimal(row.4 - row.3);
                total_equity += b;
                b
            }
            _ => rust_decimal::Decimal::ZERO,
        };
        if !balance.is_zero() {
            let section = match row.2.as_str() {
                "asset" => "Asset",
                "liability" => "Liability",
                "equity" => "Equity",
                _ => &row.2,
            };
            csv.push_str(&format!(
                "{},{},{},{}\n",
                csv_escape(section),
                csv_escape(&row.0),
                csv_escape(&row.1),
                balance
            ));
        }
    }

    csv.push_str(&format!(
        ",,,\n,,,Total Assets,{}\n,,,Total Liabilities,{}\n,,,Total Equity,{}\n,,,Total L&E,{}\n",
        total_assets,
        total_liabilities,
        total_equity,
        total_liabilities + total_equity
    ));

    Ok(csv)
}

fn export_cash_flow_csv(date_from: &str, date_to: &str, state: &AppState) -> Result<String> {
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
        params![date_from, date_to],
        |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
    )?;
    let net_income = cents_to_decimal((rev_cr - rev_dr) - (exp_dr - exp_cr));

    let dep_amount: i64 = conn.query_row(
        "SELECT COALESCE(SUM(e.debit_cents),0)
         FROM entries e
         JOIN transactions t ON t.id = e.transaction_id
         JOIN accounts a ON a.id = e.account_id
         WHERE t.txn_date BETWEEN ?1 AND ?2
           AND (LOWER(a.name) LIKE '%depreciation%' OR LOWER(a.name) LIKE '%amortization%')",
        params![date_from, date_to],
        |row| row.get(0),
    )?;
    let depreciation = cents_to_decimal(dep_amount);

    let mut csv = String::from("Section,Item,Amount\n");
    csv.push_str(&format!("Operating,Net Income,{}\n", net_income));
    if !depreciation.is_zero() {
        csv.push_str(&format!("Operating,Depreciation & Amortization,{}\n", depreciation));
    }
    let net_cash_ops = net_income + depreciation;
    csv.push_str(&format!("Operating,Net Cash from Operations,{}\n", net_cash_ops));
    csv.push_str(",,\n");
    csv.push_str("Investing,Net Cash from Investing,0\n");
    csv.push_str(",,\n");
    csv.push_str("Financing,Net Cash from Financing,0\n");
    csv.push_str(&format!(",,\n,,Net Change in Cash,{}\n", net_cash_ops));

    Ok(csv)
}

#[tauri::command(rename_all = "camelCase")]
pub async fn save_csv_file(
    app_handle: tauri::AppHandle,
    csv_content: String,
    default_filename: String,
) -> Result<String> {
    use tauri_plugin_dialog::DialogExt;

    let file_path = app_handle
        .dialog()
        .file()
        .set_file_name(&default_filename)
        .add_filter("CSV", &["csv"])
        .blocking_save_file();

    match file_path {
        Some(fp) => {
            let path = fp
                .as_path()
                .ok_or_else(|| AppError::Validation("invalid file path".into()))?
                .to_path_buf();
            std::fs::write(&path, &csv_content)?;
            Ok(path.to_string_lossy().to_string())
        }
        None => Err(AppError::Validation("save cancelled".into())),
    }
}
