use std::collections::HashMap;

use rusqlite::params;
use uuid::Uuid;

use crate::{
    domain::transaction::{
        cents_to_decimal, CreateTransactionPayload, Entry, EntryPayload, Transaction,
        TransactionWithEntries,
    },
    error::{AppError, Result},
    state::AppState,
};

/// List transactions for the active client or owner scope, newest first.
#[tauri::command(rename_all = "camelCase")]
pub fn list_transactions(
    date_from: Option<String>,
    date_to: Option<String>,
    account_id: Option<String>,
    search: Option<String>,
    client_id: Option<String>,
    app_handle: tauri::AppHandle,
    state: tauri::State<AppState>,
) -> Result<Vec<TransactionWithEntries>> {
    super::scoped::with_scoped_conn(&state, Some(&app_handle), client_id.as_deref(), |conn| {
        let mut where_clauses: Vec<String> = Vec::new();
        if date_from.is_some() {
            where_clauses.push("t.txn_date >= ?".into());
        }
        if date_to.is_some() {
            where_clauses.push("t.txn_date <= ?".into());
        }
        if account_id.is_some() {
            where_clauses.push("EXISTS (SELECT 1 FROM entries e2 WHERE e2.transaction_id = t.id AND e2.account_id = ?)".into());
        }
        if search.is_some() {
            where_clauses.push("(t.description LIKE ? OR t.reference LIKE ?)".into());
        }
        let where_sql = if where_clauses.is_empty() {
            String::new()
        } else {
            format!("WHERE {}", where_clauses.join(" AND "))
        };

        let sql = format!(
            "SELECT t.id, t.txn_date, t.description, t.reference, t.locked, t.created_at
         FROM transactions t {where_sql} ORDER BY t.txn_date DESC, t.created_at DESC"
        );

        let mut param_values: Vec<String> = Vec::new();
        if let Some(v) = date_from {
            param_values.push(v);
        }
        if let Some(v) = date_to {
            param_values.push(v);
        }
        if let Some(v) = account_id {
            param_values.push(v);
        }
        if let Some(ref q) = search {
            let pattern = format!("%{q}%");
            param_values.push(pattern.clone());
            param_values.push(pattern);
        }

        let mut stmt = conn.prepare(&sql)?;
        let txn_rows: Vec<Transaction> = stmt
            .query_map(
                rusqlite::params_from_iter(param_values.iter().map(|s| s.as_str())),
                |row| {
                    Ok(Transaction {
                        id: row.get(0)?,
                        txn_date: row.get(1)?,
                        description: row.get(2)?,
                        reference: row.get(3)?,
                        locked: row.get::<_, i32>(4)? != 0,
                        created_at: row.get(5)?,
                    })
                },
            )?
            .filter_map(|r| r.ok())
            .collect();

        let txn_ids: Vec<String> = txn_rows.iter().map(|t| t.id.clone()).collect();
        let placeholders: Vec<&str> = txn_ids.iter().map(|_| "?").collect();
        let entry_sql = format!(
            "SELECT e.id, e.transaction_id, e.account_id, a.name, e.debit_cents, e.credit_cents, e.memo, a.account_type
         FROM entries e JOIN accounts a ON a.id = e.account_id
         WHERE e.transaction_id IN ({})",
            placeholders.join(",")
        );
        let mut stmt_entries = conn.prepare(&entry_sql)?;
        let entry_params: Vec<&str> = txn_ids.iter().map(|s| s.as_str()).collect();
        let all_entries: Vec<Entry> = stmt_entries
            .query_map(rusqlite::params_from_iter(entry_params), |row| {
                Ok(Entry {
                    id: row.get(0)?,
                    transaction_id: row.get(1)?,
                    account_id: row.get(2)?,
                    account_name: row.get(3)?,
                    debit: cents_to_decimal(row.get::<_, i64>(4)?),
                    credit: cents_to_decimal(row.get::<_, i64>(5)?),
                    memo: row.get(6)?,
                    account_type: row.get(7)?,
                })
            })?
            .filter_map(|r| r.ok())
            .collect();

        let mut entry_map: HashMap<String, Vec<Entry>> = HashMap::new();
        for e in all_entries {
            entry_map
                .entry(e.transaction_id.clone())
                .or_default()
                .push(e);
        }

        let result = txn_rows
            .into_iter()
            .map(|txn| {
                let entries = entry_map.remove(&txn.id).unwrap_or_default();
                TransactionWithEntries {
                    transaction: txn,
                    entries,
                }
            })
            .collect();

        Ok(result)
    })
}

/// Create a new transaction with entries. Enforces debit = credit.
#[tauri::command(rename_all = "camelCase")]
pub fn create_transaction(
    payload: CreateTransactionPayload,
    client_id: Option<String>,
    app_handle: tauri::AppHandle,
    state: tauri::State<AppState>,
) -> Result<TransactionWithEntries> {
    if payload.txn_date.len() != 10 {
        return Err(AppError::Validation("txn_date must be YYYY-MM-DD".into()));
    }

    let mut total_debit_cents: i64 = 0;
    let mut total_credit_cents: i64 = 0;
    for e in &payload.entries {
        total_debit_cents += e.debit_cents()?;
        total_credit_cents += e.credit_cents()?;
    }
    if total_debit_cents != total_credit_cents {
        return Err(AppError::UnbalancedEntries {
            debits: cents_to_decimal(total_debit_cents).to_string(),
            credits: cents_to_decimal(total_credit_cents).to_string(),
        });
    }

    super::scoped::with_scoped_conn(&state, Some(&app_handle), client_id.as_deref(), |conn| {
        let locked_count: i64 = conn.query_row(
            "SELECT COUNT(*) FROM periods WHERE locked_at IS NOT NULL AND ?1 BETWEEN start_date AND end_date",
            params![payload.txn_date],
            |row| row.get(0),
        )?;
        if locked_count > 0 {
            return Err(AppError::PeriodLocked);
        }

        let txn_id = Uuid::new_v4().to_string();
        let now = chrono::Utc::now().to_rfc3339();

        conn.execute_batch("BEGIN")?;
        let result: Result<TransactionWithEntries> = (|| {
            conn.execute(
                "INSERT INTO transactions (id, txn_date, description, reference, locked, created_at)
                 VALUES (?1, ?2, ?3, ?4, 0, ?5)",
                params![txn_id, payload.txn_date, payload.description, payload.reference, now],
            )?;

            let mut entries_out = Vec::new();
            for e in &payload.entries {
                let entry_id = Uuid::new_v4().to_string();
                let debit_cents = e.debit_cents()?;
                let credit_cents = e.credit_cents()?;
                conn.execute(
                    "INSERT INTO entries (id, transaction_id, account_id, debit_cents, credit_cents, memo)
                     VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                    params![entry_id, txn_id, e.account_id, debit_cents, credit_cents, e.memo],
                )?;

                let account_name: String = conn
                    .query_row(
                        "SELECT name FROM accounts WHERE id = ?1",
                        params![e.account_id],
                        |r| r.get(0),
                    )
                    .unwrap_or_default();

                let account_type: Option<String> = conn
                    .query_row(
                        "SELECT account_type FROM accounts WHERE id = ?1",
                        params![e.account_id],
                        |r| r.get(0),
                    )
                    .ok();

                entries_out.push(Entry {
                    id: entry_id,
                    transaction_id: txn_id.clone(),
                    account_id: e.account_id.clone(),
                    account_name: Some(account_name),
                    debit: cents_to_decimal(debit_cents),
                    credit: cents_to_decimal(credit_cents),
                    memo: e.memo.clone(),
                    account_type,
                });
            }

            let audit_id = Uuid::new_v4().to_string();
            let after_json = serde_json::to_string(&payload.description).unwrap_or_default();
            conn.execute(
                "INSERT INTO audit_log (id, action, entity_type, entity_id, after_json)
                 VALUES (?1, 'create', 'transaction', ?2, ?3)",
                params![audit_id, txn_id, after_json],
            )?;

            Ok(TransactionWithEntries {
                transaction: Transaction {
                    id: txn_id.clone(),
                    txn_date: payload.txn_date.clone(),
                    description: payload.description.clone(),
                    reference: payload.reference.clone(),
                    locked: false,
                    created_at: now.clone(),
                },
                entries: entries_out,
            })
        })();
        match result {
            Ok(v) => {
                conn.execute_batch("COMMIT")?;
                Ok(v)
            }
            Err(e) => {
                let _ = conn.execute_batch("ROLLBACK");
                Err(e)
            }
        }
    })
}

/// Update a transaction header (date, description, reference) and optionally
/// replace all entries.
#[tauri::command(rename_all = "camelCase")]
pub fn update_transaction(
    txn_id: String,
    txn_date: String,
    description: String,
    reference: Option<String>,
    entries: Option<Vec<EntryPayload>>,
    client_id: Option<String>,
    app_handle: tauri::AppHandle,
    state: tauri::State<AppState>,
) -> Result<()> {
    if txn_date.len() != 10 {
        return Err(AppError::Validation("txn_date must be YYYY-MM-DD".into()));
    }
    if description.trim().is_empty() {
        return Err(AppError::Validation("description is required".into()));
    }

    if let Some(ref new_entries) = entries {
        let mut total_debit_cents: i64 = 0;
        let mut total_credit_cents: i64 = 0;
        for e in new_entries {
            total_debit_cents += e.debit_cents()?;
            total_credit_cents += e.credit_cents()?;
        }
        if total_debit_cents != total_credit_cents {
            return Err(AppError::UnbalancedEntries {
                debits: cents_to_decimal(total_debit_cents).to_string(),
                credits: cents_to_decimal(total_credit_cents).to_string(),
            });
        }
    }

    super::scoped::with_scoped_conn(&state, Some(&app_handle), client_id.as_deref(), |conn| {
        let locked: i32 = conn
            .query_row(
                "SELECT locked FROM transactions WHERE id = ?1",
                params![txn_id],
                |row| row.get(0),
            )
            .map_err(|_| AppError::NotFound(format!("transaction {txn_id}")))?;
        if locked != 0 {
            return Err(AppError::PeriodLocked);
        }

        let locked_count: i64 = conn.query_row(
            "SELECT COUNT(*) FROM periods WHERE locked_at IS NOT NULL AND ?1 BETWEEN start_date AND end_date",
            params![txn_date],
            |row| row.get(0),
        )?;
        if locked_count > 0 {
            return Err(AppError::PeriodLocked);
        }

        let before_desc: String = conn
            .query_row(
                "SELECT description FROM transactions WHERE id = ?1",
                params![txn_id],
                |r| r.get(0),
            )
            .unwrap_or_default();

        conn.execute_batch("BEGIN")?;
        let result: Result<()> = (|| {
            conn.execute(
                "UPDATE transactions SET txn_date = ?1, description = ?2, reference = ?3 WHERE id = ?4",
                params![txn_date, description.trim(), reference, txn_id],
            )?;

            if let Some(new_entries) = entries {
                conn.execute(
                    "DELETE FROM entries WHERE transaction_id = ?1",
                    params![txn_id],
                )?;
                for e in &new_entries {
                    let entry_id = Uuid::new_v4().to_string();
                    let debit_cents = e.debit_cents()?;
                    let credit_cents = e.credit_cents()?;
                    conn.execute(
                        "INSERT INTO entries (id, transaction_id, account_id, debit_cents, credit_cents, memo)
                         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                        params![entry_id, txn_id, e.account_id, debit_cents, credit_cents, e.memo],
                    )?;
                }
            }

            let audit_id = Uuid::new_v4().to_string();
            conn.execute(
                "INSERT INTO audit_log (id, action, entity_type, entity_id, before_json, after_json)
                 VALUES (?1, 'update', 'transaction', ?2, ?3, ?4)",
                params![audit_id, txn_id, before_desc, description.trim()],
            )?;
            Ok(())
        })();
        match result {
            Ok(v) => {
                conn.execute_batch("COMMIT")?;
                Ok(v)
            }
            Err(e) => {
                let _ = conn.execute_batch("ROLLBACK");
                Err(e)
            }
        }
    })
}

/// Delete a transaction (append reversing audit entry, then hard-delete if not locked).
#[tauri::command(rename_all = "camelCase")]
pub fn delete_transaction(
    txn_id: String,
    client_id: Option<String>,
    app_handle: tauri::AppHandle,
    state: tauri::State<AppState>,
) -> Result<()> {
    super::scoped::with_scoped_conn(&state, Some(&app_handle), client_id.as_deref(), |conn| {
        let locked: i32 = conn
            .query_row(
                "SELECT locked FROM transactions WHERE id = ?1",
                params![txn_id],
                |row| row.get(0),
            )
            .map_err(|_| AppError::NotFound(format!("transaction {txn_id}")))?;
        if locked != 0 {
            return Err(AppError::PeriodLocked);
        }

        let desc: String = conn
            .query_row(
                "SELECT description FROM transactions WHERE id = ?1",
                params![txn_id],
                |r| r.get(0),
            )
            .unwrap_or_default();

        conn.execute_batch("BEGIN")?;
        let result: Result<()> = (|| {
            let audit_id = Uuid::new_v4().to_string();
            conn.execute(
                "INSERT INTO audit_log (id, action, entity_type, entity_id, before_json)
                 VALUES (?1, 'delete', 'transaction', ?2, ?3)",
                params![audit_id, txn_id, desc],
            )?;
            conn.execute("DELETE FROM transactions WHERE id = ?1", params![txn_id])?;
            Ok(())
        })();
        match result {
            Ok(v) => {
                conn.execute_batch("COMMIT")?;
                Ok(v)
            }
            Err(e) => {
                let _ = conn.execute_batch("ROLLBACK");
                Err(e)
            }
        }
    })
}
