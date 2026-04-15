use rusqlite::{params, Connection};

use crate::domain::chat_message::ChatMessage;
use crate::error::{AppError, Result};

pub fn insert_message(
    conn: &Connection,
    client_id: &str,
    role: &str,
    content: &str,
    evidence_id: Option<&str>,
) -> Result<ChatMessage> {
    let id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().to_rfc3339();

    conn.execute(
        "INSERT INTO chat_messages (id, client_id, role, content, evidence_id, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![id, client_id, role, content, evidence_id, now],
    )?;

    Ok(ChatMessage {
        id,
        client_id: client_id.to_owned(),
        role: role.to_owned(),
        content: content.to_owned(),
        evidence_id: evidence_id.map(|s| s.to_owned()),
        created_at: now,
    })
}

pub fn get_history(conn: &Connection, client_id: &str) -> Result<Vec<ChatMessage>> {
    let mut stmt = conn.prepare(
        "SELECT id, client_id, role, content, evidence_id, created_at
         FROM chat_messages WHERE client_id = ?1 ORDER BY created_at ASC",
    )?;

    let rows = stmt
        .query_map(params![client_id], |row| {
            Ok(ChatMessage {
                id: row.get(0)?,
                client_id: row.get(1)?,
                role: row.get(2)?,
                content: row.get(3)?,
                evidence_id: row.get(4)?,
                created_at: row.get(5)?,
            })
        })?
        .filter_map(|r| r.ok())
        .collect();

    Ok(rows)
}

pub fn clear_history(conn: &Connection, client_id: &str) -> Result<()> {
    conn.execute(
        "DELETE FROM chat_messages WHERE client_id = ?1",
        params![client_id],
    )?;
    Ok(())
}
