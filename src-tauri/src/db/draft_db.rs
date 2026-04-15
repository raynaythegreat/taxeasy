use rusqlite::{params, Connection};

use crate::domain::draft_transaction::DraftTransaction;
use crate::error::{AppError, Result};

fn row_to_draft(row: &rusqlite::Row) -> rusqlite::Result<DraftTransaction> {
    Ok(DraftTransaction {
        id: row.get(0)?,
        client_id: row.get(1)?,
        evidence_id: row.get(2)?,
        date: row.get(3)?,
        description: row.get(4)?,
        reference: row.get(5)?,
        debit_account_id: row.get(6)?,
        credit_account_id: row.get(7)?,
        amount: row.get(8)?,
        notes: row.get(9)?,
        status: row.get(10)?,
        created_at: row.get(11)?,
        updated_at: row.get(12)?,
    })
}

const SELECT_DRAFT: &str = "SELECT id, client_id, evidence_id, date, description, reference, debit_account_id, credit_account_id, amount, notes, status, created_at, updated_at FROM draft_transactions";

pub fn insert_draft(
    conn: &Connection,
    client_id: &str,
    evidence_id: Option<&str>,
    date: Option<&str>,
    description: Option<&str>,
    reference: Option<&str>,
    debit_account_id: Option<&str>,
    credit_account_id: Option<&str>,
    amount: Option<i64>,
    notes: Option<&str>,
) -> Result<DraftTransaction> {
    let id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().to_rfc3339();

    conn.execute(
        "INSERT INTO draft_transactions (id, client_id, evidence_id, date, description, reference, debit_account_id, credit_account_id, amount, notes, status, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, 'pending', ?11, ?12)",
        params![
            id,
            client_id,
            evidence_id,
            date,
            description,
            reference,
            debit_account_id,
            credit_account_id,
            amount,
            notes,
            now,
            now,
        ],
    )?;

    Ok(DraftTransaction {
        id,
        client_id: client_id.to_owned(),
        evidence_id: evidence_id.map(|s| s.to_owned()).unwrap_or_default(),
        date: date.map(|s| s.to_owned()),
        description: description.map(|s| s.to_owned()),
        reference: reference.map(|s| s.to_owned()),
        debit_account_id: debit_account_id.map(|s| s.to_owned()),
        credit_account_id: credit_account_id.map(|s| s.to_owned()),
        amount,
        notes: notes.map(|s| s.to_owned()),
        status: "pending".to_owned(),
        created_at: now.clone(),
        updated_at: now,
    })
}

pub fn update_draft(
    conn: &Connection,
    draft_id: &str,
    date: Option<&str>,
    description: Option<&str>,
    reference: Option<&str>,
    debit_account_id: Option<&str>,
    credit_account_id: Option<&str>,
    amount: Option<i64>,
    notes: Option<&str>,
) -> Result<DraftTransaction> {
    let now = chrono::Utc::now().to_rfc3339();

    conn.execute(
        "UPDATE draft_transactions SET date = ?1, description = ?2, reference = ?3, debit_account_id = ?4, credit_account_id = ?5, amount = ?6, notes = ?7, updated_at = ?8 WHERE id = ?9",
        params![date, description, reference, debit_account_id, credit_account_id, amount, notes, now, draft_id],
    )?;

    conn.query_row(
        &format!("{SELECT_DRAFT} WHERE id = ?1"),
        params![draft_id],
        row_to_draft,
    )
    .map_err(|_| AppError::NotFound(format!("draft {draft_id}")))
}

pub fn list_drafts(
    conn: &Connection,
    client_id: &str,
    status: Option<&str>,
) -> Result<Vec<DraftTransaction>> {
    let sql = match status {
        Some(_) => {
            format!("{SELECT_DRAFT} WHERE client_id = ?1 AND status = ?2 ORDER BY created_at DESC")
        }
        None => format!("{SELECT_DRAFT} WHERE client_id = ?1 ORDER BY created_at DESC"),
    };

    let mut stmt = conn.prepare(&sql)?;

    let rows: Vec<DraftTransaction> = if let Some(s) = status {
        stmt.query_map(params![client_id, s], row_to_draft)?
    } else {
        stmt.query_map(params![client_id], row_to_draft)?
    }
    .filter_map(|r| r.ok())
    .collect();

    Ok(rows)
}

pub fn get_draft(conn: &Connection, client_id: &str, draft_id: &str) -> Result<DraftTransaction> {
    conn.query_row(
        &format!("{SELECT_DRAFT} WHERE id = ?1 AND client_id = ?2"),
        params![draft_id, client_id],
        row_to_draft,
    )
    .map_err(|_| AppError::NotFound(format!("draft {draft_id}")))
}

pub fn update_draft_status(
    conn: &Connection,
    draft_id: &str,
    status: &str,
) -> Result<DraftTransaction> {
    let now = chrono::Utc::now().to_rfc3339();

    conn.execute(
        "UPDATE draft_transactions SET status = ?1, updated_at = ?2 WHERE id = ?3",
        params![status, now, draft_id],
    )?;

    conn.query_row(
        &format!("{SELECT_DRAFT} WHERE id = ?1"),
        params![draft_id],
        row_to_draft,
    )
    .map_err(|_| AppError::NotFound(format!("draft {draft_id}")))
}

pub fn bulk_update_status(conn: &Connection, draft_ids: &[String], status: &str) -> Result<()> {
    let now = chrono::Utc::now().to_rfc3339();

    for draft_id in draft_ids {
        conn.execute(
            "UPDATE draft_transactions SET status = ?1, updated_at = ?2 WHERE id = ?3",
            params![status, now, draft_id],
        )?;
    }

    Ok(())
}
