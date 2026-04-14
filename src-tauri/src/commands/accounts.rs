use rusqlite::params;
use serde::Deserialize;
use uuid::Uuid;

use crate::{
    domain::account::{Account, AccountType},
    domain::transaction::cents_to_decimal,
    error::{AppError, Result},
    state::AppState,
};

/// List accounts for the active client, ordered by sort_order.
#[tauri::command(rename_all = "camelCase")]
pub fn list_accounts(state: tauri::State<AppState>) -> Result<Vec<Account>> {
    let lock = state.active_client.lock().unwrap();
    let ac = lock.as_ref().ok_or(AppError::NoActiveClient)?;
    let conn = ac.db.conn();

    let mut stmt = conn.prepare(
        "SELECT id, code, name, account_type, parent_id, schedule_c_line, active, sort_order
         FROM accounts WHERE active = 1 ORDER BY sort_order, code",
    )?;

    let accounts = stmt
        .query_map([], |row| {
            Ok(Account {
                id: row.get(0)?,
                code: row.get(1)?,
                name: row.get(2)?,
                account_type: {
                    let s: String = row.get(3)?;
                    s.parse::<AccountType>().unwrap_or(AccountType::Expense)
                },
                parent_id: row.get(4)?,
                schedule_c_line: row.get(5)?,
                active: row.get::<_, i32>(6)? != 0,
                sort_order: row.get(7)?,
            })
        })?
        .filter_map(|r| r.ok())
        .collect();

    Ok(accounts)
}

/// Get account balance as of a date (net of debits and credits).
#[tauri::command(rename_all = "camelCase")]
pub fn get_account_balance(
    account_id: String,
    as_of_date: String,
    state: tauri::State<AppState>,
) -> Result<String> {
    let lock = state.active_client.lock().unwrap();
    let ac = lock.as_ref().ok_or(AppError::NoActiveClient)?;
    let conn = ac.db.conn();

    let (debit_sum, credit_sum): (i64, i64) = conn.query_row(
        "SELECT COALESCE(SUM(e.debit_cents),0), COALESCE(SUM(e.credit_cents),0)
         FROM entries e
         JOIN transactions t ON t.id = e.transaction_id
         WHERE e.account_id = ?1 AND t.txn_date <= ?2",
        params![account_id, as_of_date],
        |row| Ok((row.get(0)?, row.get(1)?)),
    )?;

    let net = crate::domain::transaction::cents_to_decimal(debit_sum - credit_sum);
    Ok(net.to_string())
}

#[derive(Debug, Deserialize)]
pub struct CreateAccountPayload {
    pub code: String,
    pub name: String,
    pub account_type: String,
    pub parent_id: Option<String>,
    pub schedule_c_line: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateAccountPayload {
    pub name: Option<String>,
    pub code: Option<String>,
    pub schedule_c_line: Option<String>,
}

#[tauri::command(rename_all = "camelCase")]
pub fn create_account(
    payload: CreateAccountPayload,
    state: tauri::State<AppState>,
) -> Result<Account> {
    let code = payload.code.trim().to_owned();
    let name = payload.name.trim().to_owned();
    if code.is_empty() || name.is_empty() {
        return Err(AppError::Validation("code and name are required".into()));
    }

    let account_type: AccountType = payload
        .account_type
        .parse()
        .map_err(|e: String| AppError::Validation(e))?;

    let lock = state.active_client.lock().unwrap();
    let ac = lock.as_ref().ok_or(AppError::NoActiveClient)?;
    let conn = ac.db.conn();

    let id = Uuid::new_v4().to_string();
    let max_sort: i32 = conn
        .query_row(
            "SELECT COALESCE(MAX(sort_order), 0) FROM accounts",
            [],
            |row| row.get(0),
        )
        .unwrap_or(0);

    let sort_order = max_sort + 1;
    conn.execute(
        "INSERT INTO accounts (id, code, name, account_type, parent_id, schedule_c_line, active, sort_order)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, 1, ?7)",
        params![
            id,
            code,
            name,
            account_type.as_str(),
            payload.parent_id,
            payload.schedule_c_line,
            sort_order,
        ],
    )?;

    Ok(Account {
        id,
        code,
        name,
        account_type,
        parent_id: payload.parent_id,
        schedule_c_line: payload.schedule_c_line,
        active: true,
        sort_order,
    })
}

#[tauri::command(rename_all = "camelCase")]
pub fn update_account(
    id: String,
    payload: UpdateAccountPayload,
    state: tauri::State<AppState>,
) -> Result<Account> {
    let lock = state.active_client.lock().unwrap();
    let ac = lock.as_ref().ok_or(AppError::NoActiveClient)?;
    let conn = ac.db.conn();

    if let Some(ref name) = payload.name {
        let trimmed = name.trim().to_owned();
        if trimmed.is_empty() {
            return Err(AppError::Validation("name cannot be empty".into()));
        }
        conn.execute(
            "UPDATE accounts SET name = ?1 WHERE id = ?2",
            params![trimmed, id],
        )?;
    }
    if let Some(ref code) = payload.code {
        let trimmed = code.trim().to_owned();
        if trimmed.is_empty() {
            return Err(AppError::Validation("code cannot be empty".into()));
        }
        conn.execute(
            "UPDATE accounts SET code = ?1 WHERE id = ?2",
            params![trimmed, id],
        )?;
    }
    if let Some(ref scl) = payload.schedule_c_line {
        conn.execute(
            "UPDATE accounts SET schedule_c_line = ?1 WHERE id = ?2",
            params![scl, id],
        )?;
    }

    let account = conn
        .query_row(
            "SELECT id, code, name, account_type, parent_id, schedule_c_line, active, sort_order
             FROM accounts WHERE id = ?1",
            params![id],
            |row| {
                let at_str: String = row.get(3)?;
                Ok(Account {
                    id: row.get(0)?,
                    code: row.get(1)?,
                    name: row.get(2)?,
                    account_type: at_str
                        .parse::<AccountType>()
                        .unwrap_or(AccountType::Expense),
                    parent_id: row.get(4)?,
                    schedule_c_line: row.get(5)?,
                    active: row.get::<_, i32>(6)? != 0,
                    sort_order: row.get(7)?,
                })
            },
        )
        .map_err(|_| AppError::NotFound(format!("account {id}")))?;

    Ok(account)
}

#[tauri::command(rename_all = "camelCase")]
pub fn toggle_account_active(
    id: String,
    active: bool,
    state: tauri::State<AppState>,
) -> Result<()> {
    let lock = state.active_client.lock().unwrap();
    let ac = lock.as_ref().ok_or(AppError::NoActiveClient)?;
    let conn = ac.db.conn();

    let rows = conn.execute(
        "UPDATE accounts SET active = ?1 WHERE id = ?2",
        params![active as i32, id],
    )?;
    if rows == 0 {
        return Err(AppError::NotFound(format!("account {id}")));
    }
    Ok(())
}
