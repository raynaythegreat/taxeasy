use rusqlite::params;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::error::{AppError, Result};
use crate::state::AppState;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Invoice {
    pub id: String,
    pub invoice_number: String,
    pub invoice_type: String,
    pub status: String,
    pub issue_date: String,
    pub due_date: Option<String>,
    pub client_name: String,
    pub subtotal_cents: i64,
    pub tax_cents: i64,
    pub total_cents: i64,
    pub transaction_id: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InvoiceLine {
    pub id: String,
    pub invoice_id: String,
    pub description: String,
    pub quantity: f64,
    pub unit_price_cents: i64,
    pub total_cents: i64,
    pub sort_order: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InvoiceDetail {
    #[serde(flatten)]
    pub invoice: Invoice,
    pub client_email: Option<String>,
    pub client_address: Option<String>,
    pub notes: Option<String>,
    pub tax_rate: f64,
    pub lines: Vec<InvoiceLine>,
}

#[derive(Debug, Deserialize)]
pub struct CreateInvoicePayload {
    pub invoice_number: String,
    pub invoice_type: String,
    pub issue_date: String,
    pub due_date: Option<String>,
    pub client_name: String,
    pub client_email: Option<String>,
    pub client_address: Option<String>,
    pub notes: Option<String>,
    pub tax_rate: Option<f64>,
    pub lines: Vec<CreateInvoiceLine>,
}

#[derive(Debug, Deserialize)]
pub struct CreateInvoiceLine {
    pub description: String,
    pub quantity: Option<f64>,
    pub unit_price_cents: Option<i64>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateInvoicePayload {
    pub invoice_number: Option<String>,
    pub issue_date: Option<String>,
    pub due_date: Option<Option<String>>,
    pub client_name: Option<String>,
    pub client_email: Option<Option<String>>,
    pub client_address: Option<Option<String>>,
    pub notes: Option<Option<String>>,
    pub tax_rate: Option<f64>,
    pub lines: Option<Vec<CreateInvoiceLine>>,
}

fn row_to_invoice(row: &rusqlite::Row) -> rusqlite::Result<Invoice> {
    Ok(Invoice {
        id: row.get(0)?,
        invoice_number: row.get(1)?,
        invoice_type: row.get(2)?,
        status: row.get(3)?,
        issue_date: row.get(4)?,
        due_date: row.get(5)?,
        client_name: row.get(6)?,
        subtotal_cents: row.get(7)?,
        tax_cents: row.get(8)?,
        total_cents: row.get(9)?,
        transaction_id: row.get(10)?,
        created_at: row.get(11)?,
    })
}

fn row_to_invoice_line(row: &rusqlite::Row) -> rusqlite::Result<InvoiceLine> {
    Ok(InvoiceLine {
        id: row.get(0)?,
        invoice_id: row.get(1)?,
        description: row.get(2)?,
        quantity: row.get(3)?,
        unit_price_cents: row.get(4)?,
        total_cents: row.get(5)?,
        sort_order: row.get::<_, i32>(6)?,
    })
}

fn load_lines(conn: &rusqlite::Connection, invoice_id: &str) -> Result<Vec<InvoiceLine>> {
    let mut stmt = conn.prepare(
        "SELECT id, invoice_id, description, quantity, unit_price_cents, total_cents, sort_order
         FROM invoice_lines WHERE invoice_id = ?1 ORDER BY sort_order",
    )?;
    let lines = stmt
        .query_map(params![invoice_id], row_to_invoice_line)?
        .filter_map(|r| r.ok())
        .collect();
    Ok(lines)
}

fn load_invoice_detail(conn: &rusqlite::Connection, id: &str) -> Result<InvoiceDetail> {
    let invoice: Invoice = conn
        .query_row(
            "SELECT id, invoice_number, invoice_type, status, issue_date, due_date, client_name,
                subtotal_cents, tax_cents, total_cents, transaction_id, created_at
         FROM invoices WHERE id = ?1",
            params![id],
            row_to_invoice,
        )
        .map_err(|_| AppError::NotFound(format!("invoice {id}")))?;

    let client_email: Option<String> = conn
        .query_row(
            "SELECT client_email FROM invoices WHERE id = ?1",
            params![id],
            |r| r.get(0),
        )
        .unwrap_or(None);
    let client_address: Option<String> = conn
        .query_row(
            "SELECT client_address FROM invoices WHERE id = ?1",
            params![id],
            |r| r.get(0),
        )
        .unwrap_or(None);
    let notes: Option<String> = conn
        .query_row(
            "SELECT notes FROM invoices WHERE id = ?1",
            params![id],
            |r| r.get(0),
        )
        .unwrap_or(None);
    let tax_rate: f64 = conn
        .query_row(
            "SELECT tax_rate FROM invoices WHERE id = ?1",
            params![id],
            |r| r.get(0),
        )
        .unwrap_or(0.0);

    let lines = load_lines(conn, id)?;

    Ok(InvoiceDetail {
        invoice,
        client_email,
        client_address,
        notes,
        tax_rate,
        lines,
    })
}

fn compute_totals(lines: &[CreateInvoiceLine], tax_rate: f64) -> (i64, i64, i64) {
    let subtotal_cents: i64 = lines
        .iter()
        .map(|l| {
            let qty = l.quantity.unwrap_or(1.0);
            let unit = l.unit_price_cents.unwrap_or(0);
            (qty * unit as f64).round() as i64
        })
        .sum();
    let tax_cents = (subtotal_cents as f64 * tax_rate / 100.0).round() as i64;
    let total_cents = subtotal_cents + tax_cents;
    (subtotal_cents, tax_cents, total_cents)
}

#[tauri::command(rename_all = "camelCase")]
pub fn list_invoices(
    invoice_type: Option<String>,
    status: Option<String>,
    state: tauri::State<AppState>,
) -> Result<Vec<Invoice>> {
    let lock = state.active_client.lock().unwrap();
    let ac = lock.as_ref().ok_or(AppError::NoActiveClient)?;
    let conn = ac.db.conn();

    let mut where_clauses: Vec<String> = Vec::new();
    if invoice_type.is_some() {
        where_clauses.push("invoice_type = ?".into());
    }
    if status.is_some() {
        where_clauses.push("status = ?".into());
    }
    let where_sql = if where_clauses.is_empty() {
        String::new()
    } else {
        format!("WHERE {}", where_clauses.join(" AND "))
    };

    let sql = format!(
        "SELECT id, invoice_number, invoice_type, status, issue_date, due_date, client_name,
                subtotal_cents, tax_cents, total_cents, transaction_id, created_at
         FROM invoices {where_sql} ORDER BY issue_date DESC"
    );

    let mut param_values: Vec<String> = Vec::new();
    if let Some(v) = invoice_type {
        param_values.push(v);
    }
    if let Some(v) = status {
        param_values.push(v);
    }

    let mut stmt = conn.prepare(&sql)?;
    let invoices: Vec<Invoice> = stmt
        .query_map(
            rusqlite::params_from_iter(param_values.iter().map(|s| s.as_str())),
            row_to_invoice,
        )?
        .filter_map(|r| r.ok())
        .collect();

    Ok(invoices)
}

#[tauri::command(rename_all = "camelCase")]
pub fn get_invoice(id: String, state: tauri::State<AppState>) -> Result<InvoiceDetail> {
    let lock = state.active_client.lock().unwrap();
    let ac = lock.as_ref().ok_or(AppError::NoActiveClient)?;
    let conn = ac.db.conn();

    load_invoice_detail(conn, &id)
}

#[tauri::command(rename_all = "camelCase")]
pub fn create_invoice(
    payload: CreateInvoicePayload,
    state: tauri::State<AppState>,
) -> Result<InvoiceDetail> {
    let lock = state.active_client.lock().unwrap();
    let ac = lock.as_ref().ok_or(AppError::NoActiveClient)?;
    let conn = ac.db.conn();

    let tax_rate = payload.tax_rate.unwrap_or(0.0);
    let (subtotal_cents, tax_cents, total_cents) = compute_totals(&payload.lines, tax_rate);

    let id = Uuid::new_v4().to_string();
    let now = chrono::Utc::now().to_rfc3339();

    conn.execute_batch("BEGIN")?;
    let result: Result<InvoiceDetail> = (|| {
        conn.execute(
            "INSERT INTO invoices (id, invoice_number, invoice_type, status, issue_date, due_date,
             client_name, client_email, client_address, notes, subtotal_cents, tax_rate, tax_cents,
             total_cents, transaction_id, created_at, updated_at)
             VALUES (?1, ?2, ?3, 'draft', ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, NULL, ?14, ?14)",
            params![
                id,
                payload.invoice_number,
                payload.invoice_type,
                payload.issue_date,
                payload.due_date,
                payload.client_name,
                payload.client_email,
                payload.client_address,
                payload.notes,
                subtotal_cents,
                tax_rate,
                tax_cents,
                total_cents,
                now,
            ],
        )?;

        for (i, line) in payload.lines.iter().enumerate() {
            let line_id = Uuid::new_v4().to_string();
            let qty = line.quantity.unwrap_or(1.0);
            let unit = line.unit_price_cents.unwrap_or(0);
            let line_total = (qty * unit as f64).round() as i64;
            conn.execute(
                "INSERT INTO invoice_lines (id, invoice_id, description, quantity, unit_price_cents, total_cents, sort_order)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
                params![
                    line_id,
                    id,
                    line.description,
                    qty,
                    unit,
                    line_total,
                    i as i32,
                ],
            )?;
        }

        load_invoice_detail(conn, &id)
    })();
    match result {
        Ok(v) => { conn.execute_batch("COMMIT")?; Ok(v) }
        Err(e) => { let _ = conn.execute_batch("ROLLBACK"); Err(e) }
    }
}

#[tauri::command(rename_all = "camelCase")]
pub fn update_invoice(
    id: String,
    payload: UpdateInvoicePayload,
    state: tauri::State<AppState>,
) -> Result<InvoiceDetail> {
    let lock = state.active_client.lock().unwrap();
    let ac = lock.as_ref().ok_or(AppError::NoActiveClient)?;
    let conn = ac.db.conn();

    let _existing: Invoice = conn
        .query_row(
            "SELECT id, invoice_number, invoice_type, status, issue_date, due_date, client_name,
                subtotal_cents, tax_cents, total_cents, transaction_id, created_at
         FROM invoices WHERE id = ?1",
            params![id],
            row_to_invoice,
        )
        .map_err(|_| AppError::NotFound(format!("invoice {id}")))?;

    let now = chrono::Utc::now().to_rfc3339();

    conn.execute_batch("BEGIN")?;
    let result: Result<InvoiceDetail> = (|| {
    if let Some(ref val) = payload.invoice_number {
        conn.execute(
            "UPDATE invoices SET invoice_number = ?1, updated_at = ?2 WHERE id = ?3",
            params![val, now, id],
        )?;
    }
    if let Some(ref val) = payload.issue_date {
        conn.execute(
            "UPDATE invoices SET issue_date = ?1, updated_at = ?2 WHERE id = ?3",
            params![val, now, id],
        )?;
    }
    if let Some(ref val) = payload.due_date {
        conn.execute(
            "UPDATE invoices SET due_date = ?1, updated_at = ?2 WHERE id = ?3",
            params![val, now, id],
        )?;
    }
    if let Some(ref val) = payload.client_name {
        conn.execute(
            "UPDATE invoices SET client_name = ?1, updated_at = ?2 WHERE id = ?3",
            params![val, now, id],
        )?;
    }
    if let Some(ref val) = payload.client_email {
        conn.execute(
            "UPDATE invoices SET client_email = ?1, updated_at = ?2 WHERE id = ?3",
            params![val, now, id],
        )?;
    }
    if let Some(ref val) = payload.client_address {
        conn.execute(
            "UPDATE invoices SET client_address = ?1, updated_at = ?2 WHERE id = ?3",
            params![val, now, id],
        )?;
    }
    if let Some(ref val) = payload.notes {
        conn.execute(
            "UPDATE invoices SET notes = ?1, updated_at = ?2 WHERE id = ?3",
            params![val, now, id],
        )?;
    }

    if let Some(lines) = payload.lines {
        let tax_rate = payload.tax_rate.unwrap_or_else(|| {
            conn.query_row(
                "SELECT tax_rate FROM invoices WHERE id = ?1",
                params![id],
                |r| r.get(0),
            )
            .unwrap_or(0.0)
        });
        let (subtotal_cents, tax_cents, total_cents) = compute_totals(&lines, tax_rate);

        conn.execute("UPDATE invoices SET tax_rate = ?1, subtotal_cents = ?2, tax_cents = ?3, total_cents = ?4, updated_at = ?5 WHERE id = ?6",
            params![tax_rate, subtotal_cents, tax_cents, total_cents, now, id])?;

        conn.execute(
            "DELETE FROM invoice_lines WHERE invoice_id = ?1",
            params![id],
        )?;

        for (i, line) in lines.iter().enumerate() {
            let line_id = Uuid::new_v4().to_string();
            let qty = line.quantity.unwrap_or(1.0);
            let unit = line.unit_price_cents.unwrap_or(0);
            let line_total = (qty * unit as f64).round() as i64;
            conn.execute(
                "INSERT INTO invoice_lines (id, invoice_id, description, quantity, unit_price_cents, total_cents, sort_order)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
                params![line_id, id, line.description, qty, unit, line_total, i as i32],
            )?;
        }
    } else if let Some(tax_rate) = payload.tax_rate {
        let lines = load_lines(conn, &id)?;
        let create_lines: Vec<CreateInvoiceLine> = lines
            .iter()
            .map(|l| CreateInvoiceLine {
                description: l.description.clone(),
                quantity: Some(l.quantity),
                unit_price_cents: Some(l.unit_price_cents),
            })
            .collect();
        let (subtotal_cents, tax_cents, total_cents) = compute_totals(&create_lines, tax_rate);
        conn.execute("UPDATE invoices SET tax_rate = ?1, subtotal_cents = ?2, tax_cents = ?3, total_cents = ?4, updated_at = ?5 WHERE id = ?6",
            params![tax_rate, subtotal_cents, tax_cents, total_cents, now, id])?;
    }

    load_invoice_detail(conn, &id)
    })();
    match result {
        Ok(v) => { conn.execute_batch("COMMIT")?; Ok(v) }
        Err(e) => { let _ = conn.execute_batch("ROLLBACK"); Err(e) }
    }
}

#[tauri::command(rename_all = "camelCase")]
pub fn delete_invoice(id: String, state: tauri::State<AppState>) -> Result<()> {
    let lock = state.active_client.lock().unwrap();
    let ac = lock.as_ref().ok_or(AppError::NoActiveClient)?;
    let conn = ac.db.conn();

    let count: i64 = conn.query_row(
        "SELECT COUNT(*) FROM invoices WHERE id = ?1",
        params![id],
        |r| r.get(0),
    )?;
    if count == 0 {
        return Err(AppError::NotFound(format!("invoice {id}")));
    }

    conn.execute("DELETE FROM invoices WHERE id = ?1", params![id])?;
    Ok(())
}

#[tauri::command(rename_all = "camelCase")]
pub fn update_invoice_status(
    id: String,
    status: String,
    state: tauri::State<AppState>,
) -> Result<()> {
    let valid_statuses = ["draft", "sent", "paid", "overdue", "cancelled"];
    if !valid_statuses.contains(&status.as_str()) {
        return Err(AppError::Validation(format!("invalid status: {status}")));
    }

    let lock = state.active_client.lock().unwrap();
    let ac = lock.as_ref().ok_or(AppError::NoActiveClient)?;
    let conn = ac.db.conn();

    let now = chrono::Utc::now().to_rfc3339();
    let affected = conn.execute(
        "UPDATE invoices SET status = ?1, updated_at = ?2 WHERE id = ?3",
        params![status, now, id],
    )?;
    if affected == 0 {
        return Err(AppError::NotFound(format!("invoice {id}")));
    }

    Ok(())
}
