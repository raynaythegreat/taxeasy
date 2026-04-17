use rusqlite::params;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::{
    error::{AppError, Result},
    state::AppState,
};

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Document {
    pub id: String,
    pub file_name: String,
    pub file_path: String,
    pub file_size: i64,
    pub mime_type: String,
    pub category: String,
    pub tax_year: Option<i32>,
    pub description: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AddDocumentPayload {
    pub file_name: String,
    pub file_path: String,
    pub file_size: i64,
    pub mime_type: String,
    pub category: Option<String>,
    pub tax_year: Option<i32>,
    pub description: Option<String>,
}

#[tauri::command(rename_all = "camelCase")]
pub fn list_documents(
    category: Option<String>,
    tax_year: Option<i32>,
    client_id: Option<String>,
    app_handle: tauri::AppHandle,
    state: tauri::State<AppState>,
) -> Result<Vec<Document>> {
    super::scoped::with_scoped_conn(&state, &app_handle, client_id.as_deref(), |conn| {
        let mut where_clauses: Vec<String> = Vec::new();
        if category.is_some() {
            where_clauses.push("category = ?".into());
        }
        if tax_year.is_some() {
            where_clauses.push("tax_year = ?".into());
        }
        let where_sql = if where_clauses.is_empty() {
            String::new()
        } else {
            format!("WHERE {}", where_clauses.join(" AND "))
        };

        let sql = format!(
            "SELECT id, file_name, file_path, file_size, mime_type, category, tax_year, description, created_at
             FROM documents {where_sql} ORDER BY created_at DESC"
        );

        let mut param_values: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();
        if let Some(ref c) = category {
            param_values.push(Box::new(c.clone()));
        }
        if let Some(ref y) = tax_year {
            param_values.push(Box::new(*y));
        }

        let mut stmt = conn.prepare(&sql)?;
        let rows: Vec<Document> = stmt
            .query_map(
                rusqlite::params_from_iter(param_values.iter().map(|p| p.as_ref())),
                |row| {
                    Ok(Document {
                        id: row.get(0)?,
                        file_name: row.get(1)?,
                        file_path: row.get(2)?,
                        file_size: row.get(3)?,
                        mime_type: row.get(4)?,
                        category: row.get(5)?,
                        tax_year: row.get(6)?,
                        description: row.get(7)?,
                        created_at: row.get(8)?,
                    })
                },
            )?
            .filter_map(|r| r.ok())
            .collect();

        Ok(rows)
    })
}

#[tauri::command(rename_all = "camelCase")]
pub fn add_document(
    payload: AddDocumentPayload,
    client_id: Option<String>,
    app_handle: tauri::AppHandle,
    state: tauri::State<AppState>,
) -> Result<Document> {
    super::scoped::with_scoped_conn(&state, &app_handle, client_id.as_deref(), |conn| {
        let id = Uuid::new_v4().to_string();
        let now = chrono::Utc::now().to_rfc3339();
        let category = payload
            .category
            .clone()
            .unwrap_or_else(|| "general".to_owned());

        conn.execute(
            "INSERT INTO documents (id, file_name, file_path, file_size, mime_type, category, tax_year, description, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
            params![id, payload.file_name, payload.file_path, payload.file_size, payload.mime_type, category, payload.tax_year, payload.description, now],
        )?;

        Ok(Document {
            id,
            file_name: payload.file_name,
            file_path: payload.file_path,
            file_size: payload.file_size,
            mime_type: payload.mime_type,
            category,
            tax_year: payload.tax_year,
            description: payload.description,
            created_at: now,
        })
    })
}

#[tauri::command(rename_all = "camelCase")]
pub fn delete_document(
    id: String,
    client_id: Option<String>,
    app_handle: tauri::AppHandle,
    state: tauri::State<AppState>,
) -> Result<()> {
    super::scoped::with_scoped_conn(&state, &app_handle, client_id.as_deref(), |conn| {
        conn.execute("DELETE FROM documents WHERE id = ?1", params![id])?;
        Ok(())
    })
}

#[tauri::command(rename_all = "camelCase")]
pub fn update_document(
    id: String,
    category: Option<String>,
    tax_year: Option<i32>,
    description: Option<String>,
    client_id: Option<String>,
    app_handle: tauri::AppHandle,
    state: tauri::State<AppState>,
) -> Result<()> {
    super::scoped::with_scoped_conn(&state, &app_handle, client_id.as_deref(), |conn| {
        if let Some(cat) = category {
            conn.execute(
                "UPDATE documents SET category = ?1 WHERE id = ?2",
                params![cat, id],
            )?;
        }
        if let Some(yr) = tax_year {
            conn.execute(
                "UPDATE documents SET tax_year = ?1 WHERE id = ?2",
                params![yr, id],
            )?;
        }
        if let Some(desc) = description {
            conn.execute(
                "UPDATE documents SET description = ?1 WHERE id = ?2",
                params![desc, id],
            )?;
        }
        Ok(())
    })
}
