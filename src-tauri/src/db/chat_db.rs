use rusqlite::{params, Connection};

use crate::domain::chat_message::ChatMessage;
use crate::error::Result;

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
        tool_name: None,
        tool_input: None,
        tool_output: None,
        tool_status: None,
        parent_message_id: None,
        metadata: None,
    })
}

pub fn insert_message_with_tools(
    conn: &Connection,
    client_id: &str,
    role: &str,
    content: &str,
    evidence_id: Option<&str>,
    tool_name: Option<&str>,
    tool_input: Option<&str>,
    tool_output: Option<&str>,
    tool_status: Option<&str>,
    parent_message_id: Option<&str>,
    metadata: Option<&str>,
) -> Result<ChatMessage> {
    let id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().to_rfc3339();

    conn.execute(
        "INSERT INTO chat_messages (id, client_id, role, content, evidence_id, tool_name, tool_input, tool_output, tool_status, parent_message_id, metadata, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)",
        params![id, client_id, role, content, evidence_id, tool_name, tool_input, tool_output, tool_status, parent_message_id, metadata, now],
    )?;

    Ok(ChatMessage {
        id,
        client_id: client_id.to_owned(),
        role: role.to_owned(),
        content: content.to_owned(),
        evidence_id: evidence_id.map(|s| s.to_owned()),
        created_at: now,
        tool_name: tool_name.map(|s| s.to_owned()),
        tool_input: tool_input.map(|s| s.to_owned()),
        tool_output: tool_output.map(|s| s.to_owned()),
        tool_status: tool_status.map(|s| s.to_owned()),
        parent_message_id: parent_message_id.map(|s| s.to_owned()),
        metadata: metadata.map(|s| s.to_owned()),
    })
}

fn row_to_chat_message(row: &rusqlite::Row) -> rusqlite::Result<ChatMessage> {
    Ok(ChatMessage {
        id: row.get(0)?,
        client_id: row.get(1)?,
        role: row.get(2)?,
        content: row.get(3)?,
        evidence_id: row.get(4)?,
        created_at: row.get(5)?,
        tool_name: row.get(6)?,
        tool_input: row.get(7)?,
        tool_output: row.get(8)?,
        tool_status: row.get(9)?,
        parent_message_id: row.get(10)?,
        metadata: row.get(11)?,
    })
}

pub fn get_history(conn: &Connection, client_id: &str) -> Result<Vec<ChatMessage>> {
    let mut stmt = conn.prepare(
        "SELECT id, client_id, role, content, evidence_id, created_at, tool_name, tool_input, tool_output, tool_status, parent_message_id, metadata
         FROM chat_messages WHERE client_id = ?1 ORDER BY created_at ASC",
    )?;

    let rows = stmt
        .query_map(params![client_id], row_to_chat_message)?
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
