use crate::{
    domain::schedule_c::{ScheduleCMapping, ScheduleCSummary},
    error::{AppError, Result},
    state::AppState,
};
use rusqlite::params;
use tauri::AppHandle;
use uuid::Uuid;

// ============================================================================
// Internal implementation functions (testable)
// ============================================================================

/// List Schedule C mappings for active client (internal implementation).
pub fn list_schedule_c_mappings_impl(
    app_handle: Option<&AppHandle>,
    state: &AppState,
) -> Result<Vec<ScheduleCMapping>> {
    let active_lock = state.active_client.lock().unwrap();
    let client_id = active_lock
        .as_ref()
        .map(|ac| ac.client_id.clone())
        .ok_or(AppError::NoActiveClient)?;
    drop(active_lock);

    super::scoped::with_scoped_conn(state, app_handle, Some(&client_id), |conn| {

        let mut stmt = conn.prepare(
            r#"
            SELECT m.id, m.client_id, m.account_id, m.schedule_c_line, m.is_custom, m.created_at,
                   a.name as account_name, a.account_type
            FROM coa_schedule_c_mappings m
            JOIN accounts a ON m.account_id = a.id
            WHERE m.client_id = ?1
            ORDER BY a.name
            "#,
        )?;

        let mappings = stmt
            .query_map(params![client_id], |row| {
                Ok(ScheduleCMapping {
                    id: row.get(0)?,
                    client_id: row.get(1)?,
                    account_id: row.get(2)?,
                    schedule_c_line: row.get(3)?,
                    is_custom: row.get(4)?,
                    created_at: row.get(5)?,
                    account_name: row.get(6)?,
                    account_type: row.get(7)?,
                })
            })?
            .filter_map(|r| r.ok())
            .collect();

        Ok(mappings)
    })
}

/// Create or update a Schedule C mapping (internal implementation).
pub fn upsert_schedule_c_mapping_impl(
    account_id: String,
    schedule_c_line: String,
    app_handle: Option<&AppHandle>,
    state: &AppState,
) -> Result<ScheduleCMapping> {
    let active_lock = state.active_client.lock().unwrap();
    let client_id = active_lock
        .as_ref()
        .map(|ac| ac.client_id.clone())
        .ok_or(AppError::NoActiveClient)?;
    drop(active_lock);

    super::scoped::with_scoped_conn(state, app_handle, Some(&client_id), |conn| {

        let id = Uuid::new_v4().to_string();
        let created_at = chrono::Utc::now().to_rfc3339();

        // Check if mapping exists
        let existing: Option<String> = conn
            .query_row(
                "SELECT id FROM coa_schedule_c_mappings WHERE client_id = ?1 AND account_id = ?2",
                params![client_id, account_id],
                |row| row.get(0),
            )
            .ok();

        if let Some(existing_id) = existing {
            // Update existing
            conn.execute(
                "UPDATE coa_schedule_c_mappings SET schedule_c_line = ?1, is_custom = 1 WHERE id = ?2",
                params![schedule_c_line, existing_id],
            )?;

            // Fetch updated mapping
            let mapping = conn.query_row(
                r#"
                SELECT m.id, m.client_id, m.account_id, m.schedule_c_line, m.is_custom, m.created_at,
                       a.name as account_name, a.account_type
                FROM coa_schedule_c_mappings m
                JOIN accounts a ON m.account_id = a.id
                WHERE m.id = ?1
                "#,
                params![existing_id],
                |row| {
                    Ok(ScheduleCMapping {
                        id: row.get(0)?,
                        client_id: row.get(1)?,
                        account_id: row.get(2)?,
                        schedule_c_line: row.get(3)?,
                        is_custom: row.get(4)?,
                        created_at: row.get(5)?,
                        account_name: row.get(6)?,
                        account_type: row.get(7)?,
                    })
                },
            )?;

            Ok(mapping)
        } else {
            // Insert new
            conn.execute(
                r#"
                INSERT INTO coa_schedule_c_mappings (id, client_id, account_id, schedule_c_line, is_custom, created_at)
                VALUES (?1, ?2, ?3, ?4, 1, ?5)
                "#,
                params![id, client_id, account_id, schedule_c_line, created_at],
            )?;

            // Fetch new mapping
            let mapping = conn.query_row(
                r#"
                SELECT m.id, m.client_id, m.account_id, m.schedule_c_line, m.is_custom, m.created_at,
                       a.name as account_name, a.account_type
                FROM coa_schedule_c_mappings m
                JOIN accounts a ON m.account_id = a.id
                WHERE m.id = ?1
                "#,
                params![id],
                |row| {
                    Ok(ScheduleCMapping {
                        id: row.get(0)?,
                        client_id: row.get(1)?,
                        account_id: row.get(2)?,
                        schedule_c_line: row.get(3)?,
                        is_custom: row.get(4)?,
                        created_at: row.get(5)?,
                        account_name: row.get(6)?,
                        account_type: row.get(7)?,
                    })
                },
            )?;

            Ok(mapping)
        }
    })
}

/// Delete a Schedule C mapping (internal implementation).
pub fn delete_schedule_c_mapping_impl(
    mapping_id: String,
    app_handle: Option<&AppHandle>,
    state: &AppState,
) -> Result<()> {
    let active_lock = state.active_client.lock().unwrap();
    let client_id = active_lock
        .as_ref()
        .map(|ac| ac.client_id.clone())
        .ok_or(AppError::NoActiveClient)?;
    drop(active_lock);

    super::scoped::with_scoped_conn(state, app_handle, Some(&client_id), |conn| {
        conn.execute("DELETE FROM coa_schedule_c_mappings WHERE id = ?1", params![mapping_id])?;
        Ok(())
    })
}

/// Calculate Schedule C summary for a tax year (internal implementation).
pub fn calculate_schedule_c_summary_impl(
    year: i32,
    app_handle: Option<&AppHandle>,
    state: &AppState,
) -> Result<ScheduleCSummary> {
    let active_lock = state.active_client.lock().unwrap();
    let client_id = active_lock
        .as_ref()
        .map(|ac| ac.client_id.clone())
        .ok_or(AppError::NoActiveClient)?;
    drop(active_lock);

    super::scoped::with_scoped_conn(state, app_handle, Some(&client_id), |conn| {

        let date_from = format!("{year}-01-01");
        let date_to = format!("{}-01-01", year + 1);

        // Calculate gross receipts (line_1)
        let gross_receipts: i64 = conn
            .query_row(
                r#"
                SELECT COALESCE(SUM(t.amount_cents), 0)
                FROM transactions t
                JOIN accounts a ON t.account_id = a.id
                JOIN coa_schedule_c_mappings m ON a.id = m.account_id
                WHERE m.client_id = ?1 AND m.schedule_c_line = 'line_1'
                  AND t.date >= ?2 AND t.date < ?3 AND t.amount_cents > 0
                "#,
                params![client_id, date_from, date_to],
                |row| row.get(0),
            )
            .unwrap_or(0);

        // Calculate returns and allowances (line_2)
        let returns: i64 = conn
            .query_row(
                r#"
                SELECT COALESCE(SUM(t.amount_cents), 0)
                FROM transactions t
                JOIN accounts a ON t.account_id = a.id
                JOIN coa_schedule_c_mappings m ON a.id = m.account_id
                WHERE m.client_id = ?1 AND m.schedule_c_line = 'line_2'
                  AND t.date >= ?2 AND t.date < ?3
                "#,
                params![client_id, date_from, date_to],
                |row| row.get(0),
            )
            .unwrap_or(0);

        // Calculate COGS (line_4)
        let cogs: i64 = conn
            .query_row(
                r#"
                SELECT COALESCE(SUM(t.amount_cents), 0)
                FROM transactions t
                JOIN accounts a ON t.account_id = a.id
                JOIN coa_schedule_c_mappings m ON a.id = m.account_id
                WHERE m.client_id = ?1 AND m.schedule_c_line = 'line_4'
                  AND t.date >= ?2 AND t.date < ?3
                "#,
                params![client_id, date_from, date_to],
                |row| row.get(0),
            )
            .unwrap_or(0);

        // Calculate gross profit (line_5 = line_1 - line_2 - line_4)
        let gross_profit = (gross_receipts - returns - cogs).max(0);

        // Calculate other income (line_6)
        let other_income: i64 = conn
            .query_row(
                r#"
                SELECT COALESCE(SUM(t.amount_cents), 0)
                FROM transactions t
                JOIN accounts a ON t.account_id = a.id
                JOIN coa_schedule_c_mappings m ON a.id = m.account_id
                WHERE m.client_id = ?1 AND m.schedule_c_line = 'line_6'
                  AND t.date >= ?2 AND t.date < ?3 AND t.amount_cents > 0
                "#,
                params![client_id, date_from, date_to],
                |row| row.get(0),
            )
            .unwrap_or(0);

        // Calculate gross income (line_7 = line_5 + line_6)
        let gross_income = gross_profit + other_income;

        // Calculate expenses by line
        let mut expenses_by_line: Vec<(String, i64)> = conn
            .prepare(
                r#"
                SELECT m.schedule_c_line, COALESCE(SUM(t.amount_cents), 0) as total
                FROM transactions t
                JOIN accounts a ON t.account_id = a.id
                JOIN coa_schedule_c_mappings m ON a.id = m.account_id
                WHERE m.client_id = ?1 AND m.schedule_c_line LIKE 'line_%'
                  AND m.schedule_c_line NOT IN ('line_1', 'line_2', 'line_4', 'line_6')
                  AND t.date >= ?2 AND t.date < ?3
                GROUP BY m.schedule_c_line
                "#,
            )?
            .query_map(params![client_id, date_from, date_to], |row| {
                Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)?))
            })?
            .filter_map(|r| r.ok())
            .collect();

        // Apply limits (e.g., 50% for meals on line_24b)
        for (line, amount) in &mut expenses_by_line {
            if line == "line_24b" {
                // Check if there's a limit in default mappings
                let line_ref = line.clone();
                let limit: Option<String> = conn
                    .query_row(
                        "SELECT apply_limit FROM schedule_c_default_mappings WHERE schedule_c_line = ?1",
                        params![line_ref],
                        |row| row.get(0),
                    )
                    .ok();
                if let Some(limit_str) = limit {
                    if let Ok(limit_val) = limit_str.parse::<f64>() {
                        *amount = (*amount as f64 * limit_val) as i64;
                    }
                }
            }
        }

        // Calculate total expenses
        let total_expenses: i64 = expenses_by_line.iter().map(|(_, amt)| amt).sum();

        // Calculate tentative profit (line_29 = line_7 - line_28)
        let tentative_profit = (gross_income - total_expenses).max(0);

        Ok(ScheduleCSummary {
            tax_year: year,
            gross_receipts,
            returns_and_allowances: returns,
            cost_of_goods_sold: cogs,
            gross_profit,
            other_income,
            gross_income,
            expenses_by_line: expenses_by_line.into_iter().collect(),
            total_expenses,
            tentative_profit,
        })
    })
}

// ============================================================================
// Tauri command wrappers (delegates to _impl functions)
// ============================================================================

/// List Schedule C mappings for active client.
#[tauri::command(rename_all = "camelCase")]
pub fn list_schedule_c_mappings(
    app_handle: tauri::AppHandle,
    state: tauri::State<AppState>,
) -> Result<Vec<ScheduleCMapping>> {
    list_schedule_c_mappings_impl(Some(&app_handle), state.inner())
}

/// Create or update a Schedule C mapping.
#[tauri::command(rename_all = "camelCase")]
pub fn upsert_schedule_c_mapping(
    account_id: String,
    schedule_c_line: String,
    app_handle: tauri::AppHandle,
    state: tauri::State<AppState>,
) -> Result<ScheduleCMapping> {
    upsert_schedule_c_mapping_impl(account_id, schedule_c_line, Some(&app_handle), state.inner())
}

/// Delete a Schedule C mapping.
#[tauri::command(rename_all = "camelCase")]
pub fn delete_schedule_c_mapping(
    mapping_id: String,
    app_handle: tauri::AppHandle,
    state: tauri::State<AppState>,
) -> Result<()> {
    delete_schedule_c_mapping_impl(mapping_id, Some(&app_handle), state.inner())
}

/// Calculate Schedule C summary for a tax year.
#[tauri::command(rename_all = "camelCase")]
pub fn calculate_schedule_c_summary(
    year: i32,
    app_handle: tauri::AppHandle,
    state: tauri::State<AppState>,
) -> Result<ScheduleCSummary> {
    calculate_schedule_c_summary_impl(year, Some(&app_handle), state.inner())
}
