use crate::{
    domain::mileage_log::{
        CreateMileagePayload, IrsRate, MileageLog, MileageSummary, UpdateMileagePayload,
    },
    error::{AppError, Result},
    state::AppState,
};
use rusqlite::params;
use tauri::AppHandle;
use uuid::Uuid;

// ============================================================================
// Internal implementation functions (testable)
// ============================================================================

/// Create a new mileage log entry (internal implementation).
pub fn create_mileage_log_impl(
    payload: CreateMileagePayload,
    app_handle: Option<&AppHandle>,
    state: &AppState,
) -> Result<MileageLog> {
    let active_lock = state.active_client.lock().unwrap();
    let client_id = active_lock
        .as_ref()
        .map(|ac| ac.client_id.clone())
        .ok_or(AppError::NoActiveClient)?;
    drop(active_lock);

    super::scoped::with_scoped_conn(state, app_handle, Some(&client_id), |conn| {
        // Get IRS rate for the date
        let rate_cents = get_rate_for_date(conn, &payload.date)?;

        // Calculate deduction: miles * rate (rate_cents is already in cents)
        let deduction_cents = ((payload.miles_real * rate_cents as f64) as i64).max(0);

        let id = Uuid::new_v4().to_string();
        let created_at = chrono::Utc::now().to_rfc3339();

        conn.execute(
            r#"
            INSERT INTO mileage_logs (
                id, client_id, date, purpose, origin, destination,
                miles_real, rate_cents, deduction_cents, notes, created_at
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)
            "#,
            params![
                id,
                client_id,
                payload.date,
                payload.purpose,
                payload.origin,
                payload.destination,
                payload.miles_real,
                rate_cents,
                deduction_cents,
                payload.notes,
                created_at
            ],
        )?;

        let log = conn.query_row(
            "SELECT * FROM mileage_logs WHERE id = ?1",
            params![id],
            |row: &rusqlite::Row| {
                Ok(MileageLog {
                    id: row.get(0)?,
                    client_id: row.get(1)?,
                    date: row.get(2)?,
                    purpose: row.get(3)?,
                    origin: row.get(4)?,
                    destination: row.get(5)?,
                    miles_real: row.get(6)?,
                    rate_cents: row.get(7)?,
                    deduction_cents: row.get(8)?,
                    notes: row.get(9)?,
                    receipt_image_path: row.get(10)?,
                    created_at: row.get(11)?,
                })
            },
        )?;

        Ok(log)
    })
}

/// List mileage logs for the active client and year (internal implementation).
pub fn list_mileage_logs_impl(
    year: i32,
    app_handle: Option<&AppHandle>,
    state: &AppState,
) -> Result<Vec<MileageLog>> {
    let active_lock = state.active_client.lock().unwrap();
    let client_id = active_lock
        .as_ref()
        .map(|ac| ac.client_id.clone())
        .ok_or(AppError::NoActiveClient)?;
    drop(active_lock);

    super::scoped::with_scoped_conn(state, app_handle, Some(&client_id), |conn| {
        let date_from = format!("{year}-01-01");
        let date_to = format!("{}-01-01", year + 1);

        let mut stmt = conn.prepare(
            r#"
            SELECT * FROM mileage_logs
            WHERE client_id = ?1 AND date >= ?2 AND date < ?3
            ORDER BY date DESC
            "#,
        )?;

        let logs = stmt
            .query_map(
                params![client_id, date_from, date_to],
                |row: &rusqlite::Row| {
                    Ok(MileageLog {
                        id: row.get(0)?,
                        client_id: row.get(1)?,
                        date: row.get(2)?,
                        purpose: row.get(3)?,
                        origin: row.get(4)?,
                        destination: row.get(5)?,
                        miles_real: row.get(6)?,
                        rate_cents: row.get(7)?,
                        deduction_cents: row.get(8)?,
                        notes: row.get(9)?,
                        receipt_image_path: row.get(10)?,
                        created_at: row.get(11)?,
                    })
                },
            )?
            .filter_map(|r| r.ok())
            .collect();

        Ok(logs)
    })
}

/// Delete a mileage log entry (internal implementation).
pub fn delete_mileage_log_impl(
    log_id: String,
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
        conn.execute("DELETE FROM mileage_logs WHERE id = ?1", params![log_id])?;
        Ok(())
    })
}

/// Get IRS mileage rate for a specific year (internal implementation).
pub fn get_irs_mileage_rate_impl(
    year: i32,
    app_handle: Option<&AppHandle>,
    state: &AppState,
) -> Result<IrsRate> {
    // This uses the owner DB since it's a reference table
    super::scoped::with_scoped_conn(state, app_handle, Some("owner"), |conn| {
        let rate = conn.query_row(
            "SELECT year, rate_cents FROM irs_mileage_rates WHERE year = ?1",
            params![year],
            |row: &rusqlite::Row| {
                Ok(IrsRate {
                    year: row.get(0)?,
                    rate_cents: row.get(1)?,
                })
            },
        )?;

        Ok(rate)
    })
}

/// Get total mileage deduction for a year (internal implementation).
pub fn get_mileage_deduction_total_impl(
    year: i32,
    app_handle: Option<&AppHandle>,
    state: &AppState,
) -> Result<i64> {
    let active_lock = state.active_client.lock().unwrap();
    let client_id = active_lock
        .as_ref()
        .map(|ac| ac.client_id.clone())
        .ok_or(AppError::NoActiveClient)?;
    drop(active_lock);

    super::scoped::with_scoped_conn(state, app_handle, Some(&client_id), |conn| {
        let date_from = format!("{year}-01-01");
        let date_to = format!("{}-01-01", year + 1);

        let total: Option<i64> = conn
            .query_row(
                "SELECT SUM(deduction_cents) FROM mileage_logs WHERE client_id = ?1 AND date >= ?2 AND date < ?3",
                params![client_id, date_from, date_to],
                |row: &rusqlite::Row| row.get(0),
            )
            .unwrap_or(None);

        Ok(total.unwrap_or(0))
    })
}

/// Update an existing mileage log entry (internal implementation).
pub fn update_mileage_log_impl(
    log_id: String,
    payload: UpdateMileagePayload,
    app_handle: Option<&AppHandle>,
    state: &AppState,
) -> Result<MileageLog> {
    let active_lock = state.active_client.lock().unwrap();
    let client_id = active_lock
        .as_ref()
        .map(|ac| ac.client_id.clone())
        .ok_or(AppError::NoActiveClient)?;
    drop(active_lock);

    super::scoped::with_scoped_conn(state, app_handle, Some(&client_id), |conn| {
        // Get the log first to check current values
        let log = conn.query_row(
            "SELECT * FROM mileage_logs WHERE id = ?1",
            params![log_id],
            |row: &rusqlite::Row| {
                Ok(MileageLog {
                    id: row.get(0)?,
                    client_id: row.get(1)?,
                    date: row.get(2)?,
                    purpose: row.get(3)?,
                    origin: row.get(4)?,
                    destination: row.get(5)?,
                    miles_real: row.get(6)?,
                    rate_cents: row.get(7)?,
                    deduction_cents: row.get(8)?,
                    notes: row.get(9)?,
                    receipt_image_path: row.get(10)?,
                    created_at: row.get(11)?,
                })
            },
        )?;

        // Determine new values (use existing if not provided)
        let new_date = payload.date.as_ref().unwrap_or(&log.date);
        let new_miles = payload.miles_real.unwrap_or(log.miles_real);

        // Recalculate rate and deduction based on new date/miles
        let rate_cents = get_rate_for_date(conn, new_date)?;
        let deduction_cents = ((new_miles * rate_cents as f64) as i64).max(0);

        // Build dynamic update query based on provided fields
        let mut updates = Vec::new();
        let mut param_values: Vec<String> = Vec::new();

        if payload.date.is_some() {
            updates.push("date = ?");
            param_values.push(payload.date.unwrap());
        }
        if payload.purpose.is_some() {
            updates.push("purpose = ?");
            param_values.push(payload.purpose.unwrap());
        }
        if payload.origin.is_some() {
            updates.push("origin = ?");
            param_values.push(payload.origin.unwrap());
        }
        if payload.destination.is_some() {
            updates.push("destination = ?");
            param_values.push(payload.destination.unwrap());
        }
        if payload.miles_real.is_some() {
            updates.push("miles_real = ?");
            param_values.push(payload.miles_real.unwrap().to_string());
        }
        if payload.notes.is_some() {
            updates.push("notes = ?");
            param_values.push(payload.notes.unwrap());
        }
        if payload.receipt_image_path.is_some() {
            updates.push("receipt_image_path = ?");
            param_values.push(payload.receipt_image_path.unwrap());
        }

        // Always update rate and deduction if date or miles changed
        updates.push("rate_cents = ?");
        param_values.push(rate_cents.to_string());
        updates.push("deduction_cents = ?");
        param_values.push(deduction_cents.to_string());

        if updates.is_empty() {
            return Err(AppError::Validation("No fields to update".to_string()));
        }

        // Add log_id as last parameter
        param_values.push(log_id.clone());

        let sql = format!(
            "UPDATE mileage_logs SET {} WHERE id = ?",
            updates.join(", ")
        );

        let param_refs: Vec<&dyn rusqlite::ToSql> = param_values
            .iter()
            .map(|s| s as &dyn rusqlite::ToSql)
            .collect();

        conn.execute(&sql, param_refs.as_slice())?;

        // Fetch and return updated log
        let updated = conn.query_row(
            "SELECT * FROM mileage_logs WHERE id = ?1",
            params![log_id],
            |row| {
                Ok(MileageLog {
                    id: row.get(0)?,
                    client_id: row.get(1)?,
                    date: row.get(2)?,
                    purpose: row.get(3)?,
                    origin: row.get(4)?,
                    destination: row.get(5)?,
                    miles_real: row.get(6)?,
                    rate_cents: row.get(7)?,
                    deduction_cents: row.get(8)?,
                    notes: row.get(9)?,
                    receipt_image_path: row.get(10)?,
                    created_at: row.get(11)?,
                })
            },
        )?;

        Ok(updated)
    })
}

/// Get mileage summary statistics for a year (internal implementation).
pub fn get_mileage_summary_impl(
    year: i32,
    app_handle: Option<&AppHandle>,
    state: &AppState,
) -> Result<MileageSummary> {
    let active_lock = state.active_client.lock().unwrap();
    let client_id = active_lock
        .as_ref()
        .map(|ac| ac.client_id.clone())
        .ok_or(AppError::NoActiveClient)?;
    drop(active_lock);

    super::scoped::with_scoped_conn(state, app_handle, Some(&client_id), |conn| {
        let date_from = format!("{year}-01-01");
        let date_to = format!("{}-01-01", year + 1);

        let summary = conn.query_row(
            r#"
            SELECT
                COUNT(*) as log_count,
                SUM(miles_real) as total_miles,
                SUM(deduction_cents) as total_deduction_cents
            FROM mileage_logs
            WHERE client_id = ?1 AND date >= ?2 AND date < ?3
            "#,
            params![client_id, date_from, date_to],
            |row| {
                Ok(MileageSummary {
                    year,
                    total_miles: row.get::<_, f64>(1).unwrap_or(0.0),
                    total_deduction_cents: row.get::<_, i64>(2).unwrap_or(0),
                    log_count: row.get::<_, i32>(0).unwrap_or(0),
                })
            },
        )?;

        Ok(summary)
    })
}

// Helper: Get IRS rate for a given date
fn get_rate_for_date(conn: &rusqlite::Connection, date: &str) -> Result<i32> {
    // Parse year from date string (YYYY-MM-DD format)
    let year: i32 = date[..4]
        .parse()
        .map_err(|_| AppError::Validation("Invalid date format".to_string()))?;

    let rate = conn
        .query_row(
            "SELECT rate_cents FROM irs_mileage_rates WHERE year = ?1",
            params![year],
            |row| row.get::<_, i32>(0),
        )
        .map_err(|_| AppError::NotFound(format!("No IRS mileage rate found for year {year}")))?;

    Ok(rate)
}

// ============================================================================
// Tauri command wrappers (delegates to _impl functions)
// ============================================================================

/// Create a new mileage log entry.
#[tauri::command(rename_all = "camelCase")]
pub fn create_mileage_log(
    payload: CreateMileagePayload,
    app_handle: tauri::AppHandle,
    state: tauri::State<AppState>,
) -> Result<MileageLog> {
    create_mileage_log_impl(payload, Some(&app_handle), state.inner())
}

/// List mileage logs for the active client and year.
#[tauri::command(rename_all = "camelCase")]
pub fn list_mileage_logs(
    year: i32,
    app_handle: tauri::AppHandle,
    state: tauri::State<AppState>,
) -> Result<Vec<MileageLog>> {
    list_mileage_logs_impl(year, Some(&app_handle), state.inner())
}

/// Delete a mileage log entry.
#[tauri::command(rename_all = "camelCase")]
pub fn delete_mileage_log(
    log_id: String,
    app_handle: tauri::AppHandle,
    state: tauri::State<AppState>,
) -> Result<()> {
    delete_mileage_log_impl(log_id, Some(&app_handle), state.inner())
}

/// Get IRS mileage rate for a specific year.
#[tauri::command(rename_all = "camelCase")]
pub fn get_irs_mileage_rate(
    year: i32,
    app_handle: tauri::AppHandle,
    state: tauri::State<AppState>,
) -> Result<IrsRate> {
    get_irs_mileage_rate_impl(year, Some(&app_handle), state.inner())
}

/// Get total mileage deduction for a year.
#[tauri::command(rename_all = "camelCase")]
pub fn get_mileage_deduction_total(
    year: i32,
    app_handle: tauri::AppHandle,
    state: tauri::State<AppState>,
) -> Result<i64> {
    get_mileage_deduction_total_impl(year, Some(&app_handle), state.inner())
}

/// Update an existing mileage log entry.
#[tauri::command(rename_all = "camelCase")]
pub fn update_mileage_log(
    log_id: String,
    payload: UpdateMileagePayload,
    app_handle: tauri::AppHandle,
    state: tauri::State<AppState>,
) -> Result<MileageLog> {
    update_mileage_log_impl(log_id, payload, Some(&app_handle), state.inner())
}

/// Get mileage summary statistics for a year.
#[tauri::command(rename_all = "camelCase")]
pub fn get_mileage_summary(
    year: i32,
    app_handle: tauri::AppHandle,
    state: tauri::State<AppState>,
) -> Result<MileageSummary> {
    get_mileage_summary_impl(year, Some(&app_handle), state.inner())
}
