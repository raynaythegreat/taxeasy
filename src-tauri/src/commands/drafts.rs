use rusqlite::params;
use uuid::Uuid;

use crate::domain::draft_transaction::DraftTransaction;
use crate::domain::transaction::{cents_to_decimal, Entry, Transaction, TransactionWithEntries};
use crate::error::{AppError, Result};
use crate::state::AppState;

#[tauri::command(rename_all = "camelCase")]
pub fn create_draft(
    state: tauri::State<'_, AppState>,
    client_id: String,
    evidence_id: Option<String>,
    date: Option<String>,
    description: Option<String>,
    reference: Option<String>,
    debit_account_id: Option<String>,
    credit_account_id: Option<String>,
    amount: Option<i64>,
    notes: Option<String>,
) -> Result<DraftTransaction> {
    let lock = state.active_client.lock().unwrap();
    let ac = lock.as_ref().ok_or(AppError::NoActiveClient)?;

    if ac.client_id != client_id {
        return Err(AppError::NotFound(format!("client {client_id}")));
    }

    let conn = ac.db.conn();
    crate::db::draft_db::insert_draft(
        conn,
        &client_id,
        evidence_id.as_deref(),
        date.as_deref(),
        description.as_deref(),
        reference.as_deref(),
        debit_account_id.as_deref(),
        credit_account_id.as_deref(),
        amount,
        notes.as_deref(),
    )
}

#[tauri::command(rename_all = "camelCase")]
pub fn update_draft(
    state: tauri::State<'_, AppState>,
    client_id: String,
    draft_id: String,
    date: Option<String>,
    description: Option<String>,
    reference: Option<String>,
    debit_account_id: Option<String>,
    credit_account_id: Option<String>,
    amount: Option<i64>,
    notes: Option<String>,
) -> Result<DraftTransaction> {
    let lock = state.active_client.lock().unwrap();
    let ac = lock.as_ref().ok_or(AppError::NoActiveClient)?;

    if ac.client_id != client_id {
        return Err(AppError::NotFound(format!("client {client_id}")));
    }

    let conn = ac.db.conn();
    crate::db::draft_db::update_draft(
        conn,
        &draft_id,
        date.as_deref(),
        description.as_deref(),
        reference.as_deref(),
        debit_account_id.as_deref(),
        credit_account_id.as_deref(),
        amount,
        notes.as_deref(),
    )
}

#[tauri::command(rename_all = "camelCase")]
pub fn list_drafts(
    state: tauri::State<'_, AppState>,
    client_id: String,
    status: Option<String>,
) -> Result<Vec<DraftTransaction>> {
    let lock = state.active_client.lock().unwrap();
    let ac = lock.as_ref().ok_or(AppError::NoActiveClient)?;

    if ac.client_id != client_id {
        return Err(AppError::NotFound(format!("client {client_id}")));
    }

    let conn = ac.db.conn();
    crate::db::draft_db::list_drafts(conn, &client_id, status.as_deref())
}

#[tauri::command(rename_all = "camelCase")]
pub fn approve_draft(
    state: tauri::State<'_, AppState>,
    client_id: String,
    draft_id: String,
) -> Result<TransactionWithEntries> {
    let lock = state.active_client.lock().unwrap();
    let ac = lock.as_ref().ok_or(AppError::NoActiveClient)?;

    if ac.client_id != client_id {
        return Err(AppError::NotFound(format!("client {client_id}")));
    }

    let conn = ac.db.conn();

    let draft = crate::db::draft_db::get_draft(conn, &client_id, &draft_id)?;

    let date = draft
        .date
        .clone()
        .ok_or_else(|| AppError::Validation("Draft must have a date to approve".into()))?;
    if date.len() != 10 {
        return Err(AppError::Validation("txn_date must be YYYY-MM-DD".into()));
    }

    let description = draft
        .description
        .clone()
        .ok_or_else(|| AppError::Validation("Draft must have a description to approve".into()))?;
    if description.trim().is_empty() {
        return Err(AppError::Validation("description is required".into()));
    }

    let amount = draft
        .amount
        .ok_or_else(|| AppError::Validation("Draft must have an amount to approve".into()))?;
    if amount == 0 {
        return Err(AppError::Validation("Amount must be non-zero".into()));
    }

    let debit_account_id = draft
        .debit_account_id
        .clone()
        .ok_or_else(|| AppError::Validation("Draft must have a debit account to approve".into()))?;
    let credit_account_id = draft.credit_account_id.clone().ok_or_else(|| {
        AppError::Validation("Draft must have a credit account to approve".into())
    })?;

    let debit_exists: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM accounts WHERE id = ?1 AND active = 1",
            params![debit_account_id],
            |row| row.get(0),
        )
        .unwrap_or(0);
    if debit_exists == 0 {
        return Err(AppError::Validation(format!(
            "Debit account {debit_account_id} not found or inactive"
        )));
    }

    let credit_exists: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM accounts WHERE id = ?1 AND active = 1",
            params![credit_account_id],
            |row| row.get(0),
        )
        .unwrap_or(0);
    if credit_exists == 0 {
        return Err(AppError::Validation(format!(
            "Credit account {credit_account_id} not found or inactive"
        )));
    }

    let locked_count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM periods WHERE locked_at IS NOT NULL AND ?1 BETWEEN start_date AND end_date",
            params![date],
            |row| row.get(0),
        )
        .unwrap_or(0);
    if locked_count > 0 {
        return Err(AppError::PeriodLocked);
    }

    let txn_id = Uuid::new_v4().to_string();
    let now = chrono::Utc::now().to_rfc3339();

    conn.execute(
        "INSERT INTO transactions (id, txn_date, description, reference, locked, created_at)
         VALUES (?1, ?2, ?3, ?4, 0, ?5)",
        params![txn_id, date, description.trim(), draft.reference, now],
    )?;

    let debit_entry_id = Uuid::new_v4().to_string();
    conn.execute(
        "INSERT INTO entries (id, transaction_id, account_id, debit_cents, credit_cents, memo)
         VALUES (?1, ?2, ?3, ?4, 0, ?5)",
        params![
            debit_entry_id,
            txn_id,
            debit_account_id,
            amount,
            draft.notes
        ],
    )?;

    let credit_entry_id = Uuid::new_v4().to_string();
    conn.execute(
        "INSERT INTO entries (id, transaction_id, account_id, debit_cents, credit_cents, memo)
         VALUES (?1, ?2, ?3, 0, ?4, ?5)",
        params![
            credit_entry_id,
            txn_id,
            credit_account_id,
            amount,
            draft.notes
        ],
    )?;

    let debit_account_name: String = conn
        .query_row(
            "SELECT name FROM accounts WHERE id = ?1",
            params![debit_account_id],
            |r| r.get(0),
        )
        .unwrap_or_default();
    let debit_account_type: Option<String> = conn
        .query_row(
            "SELECT account_type FROM accounts WHERE id = ?1",
            params![debit_account_id],
            |r| r.get(0),
        )
        .ok();

    let credit_account_name: String = conn
        .query_row(
            "SELECT name FROM accounts WHERE id = ?1",
            params![credit_account_id],
            |r| r.get(0),
        )
        .unwrap_or_default();
    let credit_account_type: Option<String> = conn
        .query_row(
            "SELECT account_type FROM accounts WHERE id = ?1",
            params![credit_account_id],
            |r| r.get(0),
        )
        .ok();

    let audit_id = Uuid::new_v4().to_string();
    let after_json = serde_json::to_string(&description.trim()).unwrap_or_default();
    conn.execute(
        "INSERT INTO audit_log (id, action, entity_type, entity_id, after_json)
         VALUES (?1, 'create', 'transaction', ?2, ?3)",
        params![audit_id, txn_id, after_json],
    )?;

    crate::db::draft_db::update_draft_status(conn, &draft_id, "approved")?;

    Ok(TransactionWithEntries {
        transaction: Transaction {
            id: txn_id.clone(),
            txn_date: date,
            description: description.trim().to_string(),
            reference: draft.reference,
            locked: false,
            created_at: now,
        },
        entries: vec![
            Entry {
                id: debit_entry_id,
                transaction_id: txn_id.clone(),
                account_id: debit_account_id,
                account_name: Some(debit_account_name),
                debit: cents_to_decimal(amount),
                credit: cents_to_decimal(0),
                memo: draft.notes.clone(),
                account_type: debit_account_type,
            },
            Entry {
                id: credit_entry_id,
                transaction_id: txn_id.clone(),
                account_id: credit_account_id,
                account_name: Some(credit_account_name),
                debit: cents_to_decimal(0),
                credit: cents_to_decimal(amount),
                memo: draft.notes,
                account_type: credit_account_type,
            },
        ],
    })
}

#[tauri::command(rename_all = "camelCase")]
pub fn reject_draft(
    state: tauri::State<'_, AppState>,
    client_id: String,
    draft_id: String,
) -> Result<()> {
    let lock = state.active_client.lock().unwrap();
    let ac = lock.as_ref().ok_or(AppError::NoActiveClient)?;

    if ac.client_id != client_id {
        return Err(AppError::NotFound(format!("client {client_id}")));
    }

    let conn = ac.db.conn();
    crate::db::draft_db::update_draft_status(conn, &draft_id, "rejected")?;
    Ok(())
}

#[tauri::command(rename_all = "camelCase")]
pub fn bulk_approve_drafts(
    state: tauri::State<'_, AppState>,
    client_id: String,
    draft_ids: Vec<String>,
) -> Result<Vec<TransactionWithEntries>> {
    let mut results = Vec::new();
    for draft_id in &draft_ids {
        let txn = approve_draft_with_conn(&state, &client_id, draft_id)?;
        results.push(txn);
    }
    Ok(results)
}

#[tauri::command(rename_all = "camelCase")]
pub fn bulk_reject_drafts(
    state: tauri::State<'_, AppState>,
    client_id: String,
    draft_ids: Vec<String>,
) -> Result<()> {
    let lock = state.active_client.lock().unwrap();
    let ac = lock.as_ref().ok_or(AppError::NoActiveClient)?;

    if ac.client_id != client_id {
        return Err(AppError::NotFound(format!("client {client_id}")));
    }

    let conn = ac.db.conn();
    crate::db::draft_db::bulk_update_status(conn, &draft_ids, "rejected")
}

fn approve_draft_with_conn(
    state: &tauri::State<'_, AppState>,
    client_id: &str,
    draft_id: &str,
) -> Result<TransactionWithEntries> {
    let lock = state.active_client.lock().unwrap();
    let ac = lock.as_ref().ok_or(AppError::NoActiveClient)?;

    if ac.client_id != client_id {
        return Err(AppError::NotFound(format!("client {client_id}")));
    }

    let conn = ac.db.conn();

    let draft = crate::db::draft_db::get_draft(conn, client_id, draft_id)?;

    let date = draft
        .date
        .clone()
        .ok_or_else(|| AppError::Validation("Draft must have a date to approve".into()))?;
    if date.len() != 10 {
        return Err(AppError::Validation("txn_date must be YYYY-MM-DD".into()));
    }

    let description = draft
        .description
        .clone()
        .ok_or_else(|| AppError::Validation("Draft must have a description to approve".into()))?;
    if description.trim().is_empty() {
        return Err(AppError::Validation("description is required".into()));
    }

    let amount = draft
        .amount
        .ok_or_else(|| AppError::Validation("Draft must have an amount to approve".into()))?;
    if amount == 0 {
        return Err(AppError::Validation("Amount must be non-zero".into()));
    }

    let debit_account_id = draft
        .debit_account_id
        .clone()
        .ok_or_else(|| AppError::Validation("Draft must have a debit account to approve".into()))?;
    let credit_account_id = draft.credit_account_id.clone().ok_or_else(|| {
        AppError::Validation("Draft must have a credit account to approve".into())
    })?;

    let debit_exists: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM accounts WHERE id = ?1 AND active = 1",
            params![debit_account_id],
            |row| row.get(0),
        )
        .unwrap_or(0);
    if debit_exists == 0 {
        return Err(AppError::Validation(format!(
            "Debit account {debit_account_id} not found or inactive"
        )));
    }

    let credit_exists: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM accounts WHERE id = ?1 AND active = 1",
            params![credit_account_id],
            |row| row.get(0),
        )
        .unwrap_or(0);
    if credit_exists == 0 {
        return Err(AppError::Validation(format!(
            "Credit account {credit_account_id} not found or inactive"
        )));
    }

    let locked_count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM periods WHERE locked_at IS NOT NULL AND ?1 BETWEEN start_date AND end_date",
            params![date],
            |row| row.get(0),
        )
        .unwrap_or(0);
    if locked_count > 0 {
        return Err(AppError::PeriodLocked);
    }

    let txn_id = Uuid::new_v4().to_string();
    let now = chrono::Utc::now().to_rfc3339();

    conn.execute(
        "INSERT INTO transactions (id, txn_date, description, reference, locked, created_at)
         VALUES (?1, ?2, ?3, ?4, 0, ?5)",
        params![txn_id, date, description.trim(), draft.reference, now],
    )?;

    let debit_entry_id = Uuid::new_v4().to_string();
    conn.execute(
        "INSERT INTO entries (id, transaction_id, account_id, debit_cents, credit_cents, memo)
         VALUES (?1, ?2, ?3, ?4, 0, ?5)",
        params![
            debit_entry_id,
            txn_id,
            debit_account_id,
            amount,
            draft.notes
        ],
    )?;

    let credit_entry_id = Uuid::new_v4().to_string();
    conn.execute(
        "INSERT INTO entries (id, transaction_id, account_id, debit_cents, credit_cents, memo)
         VALUES (?1, ?2, ?3, 0, ?4, ?5)",
        params![
            credit_entry_id,
            txn_id,
            credit_account_id,
            amount,
            draft.notes
        ],
    )?;

    let debit_account_name: String = conn
        .query_row(
            "SELECT name FROM accounts WHERE id = ?1",
            params![debit_account_id],
            |r| r.get(0),
        )
        .unwrap_or_default();
    let debit_account_type: Option<String> = conn
        .query_row(
            "SELECT account_type FROM accounts WHERE id = ?1",
            params![debit_account_id],
            |r| r.get(0),
        )
        .ok();

    let credit_account_name: String = conn
        .query_row(
            "SELECT name FROM accounts WHERE id = ?1",
            params![credit_account_id],
            |r| r.get(0),
        )
        .unwrap_or_default();
    let credit_account_type: Option<String> = conn
        .query_row(
            "SELECT account_type FROM accounts WHERE id = ?1",
            params![credit_account_id],
            |r| r.get(0),
        )
        .ok();

    let audit_id = Uuid::new_v4().to_string();
    let after_json = serde_json::to_string(&description.trim()).unwrap_or_default();
    conn.execute(
        "INSERT INTO audit_log (id, action, entity_type, entity_id, after_json)
         VALUES (?1, 'create', 'transaction', ?2, ?3)",
        params![audit_id, txn_id, after_json],
    )?;

    crate::db::draft_db::update_draft_status(conn, draft_id, "approved")?;

    Ok(TransactionWithEntries {
        transaction: Transaction {
            id: txn_id.clone(),
            txn_date: date,
            description: description.trim().to_string(),
            reference: draft.reference,
            locked: false,
            created_at: now,
        },
        entries: vec![
            Entry {
                id: debit_entry_id,
                transaction_id: txn_id.clone(),
                account_id: debit_account_id,
                account_name: Some(debit_account_name),
                debit: cents_to_decimal(amount),
                credit: cents_to_decimal(0),
                memo: draft.notes.clone(),
                account_type: debit_account_type,
            },
            Entry {
                id: credit_entry_id,
                transaction_id: txn_id.clone(),
                account_id: credit_account_id,
                account_name: Some(credit_account_name),
                debit: cents_to_decimal(0),
                credit: cents_to_decimal(amount),
                memo: draft.notes,
                account_type: credit_account_type,
            },
        ],
    })
}
