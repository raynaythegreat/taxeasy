use rusqlite::{params, Connection};

use crate::domain::evidence::Evidence;
use crate::error::{AppError, Result};

pub fn insert_evidence(
    conn: &Connection,
    client_id: &str,
    source_type: &str,
    source_file_name: Option<&str>,
    source_file_hash: Option<&str>,
    source_file_path: Option<&str>,
    ocr_raw_text: Option<&str>,
    extracted_fields: Option<&str>,
    model_used: &str,
    confidence_score: Option<f64>,
) -> Result<Evidence> {
    let id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().to_rfc3339();

    conn.execute(
        "INSERT INTO evidence (id, client_id, source_type, source_file_name, source_file_hash, source_file_path, ocr_raw_text, extracted_fields, model_used, confidence_score, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)",
        params![
            id,
            client_id,
            source_type,
            source_file_name,
            source_file_hash,
            source_file_path,
            ocr_raw_text,
            extracted_fields,
            model_used,
            confidence_score,
            now,
            now,
        ],
    )?;

    Ok(Evidence {
        id,
        client_id: client_id.to_owned(),
        source_type: source_type.to_owned(),
        source_file_name: source_file_name.map(|s| s.to_owned()),
        source_file_hash: source_file_hash.map(|s| s.to_owned()),
        source_file_path: source_file_path.map(|s| s.to_owned()),
        ocr_raw_text: ocr_raw_text.map(|s| s.to_owned()),
        extracted_fields: extracted_fields.map(|s| s.to_owned()),
        model_used: model_used.to_owned(),
        confidence_score,
        created_at: now.clone(),
        updated_at: now,
    })
}

pub fn get_evidence(conn: &Connection, client_id: &str, evidence_id: &str) -> Result<Evidence> {
    conn.query_row(
        "SELECT id, client_id, source_type, source_file_name, source_file_hash, source_file_path, ocr_raw_text, extracted_fields, model_used, confidence_score, created_at, updated_at
         FROM evidence WHERE id = ?1 AND client_id = ?2",
        params![evidence_id, client_id],
        |row| {
            Ok(Evidence {
                id: row.get(0)?,
                client_id: row.get(1)?,
                source_type: row.get(2)?,
                source_file_name: row.get(3)?,
                source_file_hash: row.get(4)?,
                source_file_path: row.get(5)?,
                ocr_raw_text: row.get(6)?,
                extracted_fields: row.get(7)?,
                model_used: row.get(8)?,
                confidence_score: row.get(9)?,
                created_at: row.get(10)?,
                updated_at: row.get(11)?,
            })
        },
    )
    .map_err(|_| AppError::NotFound(format!("evidence {evidence_id}")))
}

pub fn list_evidence(conn: &Connection, client_id: &str) -> Result<Vec<Evidence>> {
    let mut stmt = conn.prepare(
        "SELECT id, client_id, source_type, source_file_name, source_file_hash, source_file_path, ocr_raw_text, extracted_fields, model_used, confidence_score, created_at, updated_at
         FROM evidence WHERE client_id = ?1 ORDER BY created_at DESC",
    )?;

    let rows = stmt
        .query_map(params![client_id], |row| {
            Ok(Evidence {
                id: row.get(0)?,
                client_id: row.get(1)?,
                source_type: row.get(2)?,
                source_file_name: row.get(3)?,
                source_file_hash: row.get(4)?,
                source_file_path: row.get(5)?,
                ocr_raw_text: row.get(6)?,
                extracted_fields: row.get(7)?,
                model_used: row.get(8)?,
                confidence_score: row.get(9)?,
                created_at: row.get(10)?,
                updated_at: row.get(11)?,
            })
        })?
        .filter_map(|r| r.ok())
        .collect();

    Ok(rows)
}

pub fn delete_evidence(conn: &Connection, client_id: &str, evidence_id: &str) -> Result<()> {
    let rows = conn.execute(
        "DELETE FROM evidence WHERE id = ?1 AND client_id = ?2",
        params![evidence_id, client_id],
    )?;
    if rows == 0 {
        return Err(AppError::NotFound(format!("evidence {evidence_id}")));
    }
    Ok(())
}
