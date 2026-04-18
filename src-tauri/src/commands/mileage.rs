use crate::{
    domain::mileage_log::{CreateMileagePayload, MileageLog, MileageRate},
    error::{AppError, Result},
    state::AppState,
};
use rusqlite::params;
use uuid::Uuid;

/// Create a new mileage log entry.
#[tauri::command(rename_all = "camelCase")]
pub fn create_mileage_log(
    payload: CreateMileagePayload,
    app_handle: tauri::AppHandle,
    state: tauri::State<AppState>,
) -> Result<MileageLog> {
    super::scoped::with_scoped_conn(&state, &app_handle, None, |conn| {
        // Get IRS rate for the date
        let rate_cents = get_rate_for_date(conn, &payload.date)?;

        // Calculate deduction: miles * rate / 100
        let deduction_cents = ((payload.miles_real * rate_cents as f64 / 100.0) as i64).max(0);

        let id = Uuid::new_v4().to_string();
        let created_at = chrono::Utc::now().to_rfc3339();

        // Get client_id from active client
        let active_lock = state.active_client.lock().unwrap();
        let client_id = active_lock
            .as_ref()
            .map(|ac| ac.client_id.clone())
            .ok_or(AppError::NoActiveClient)?;
        drop(active_lock);

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

/// List mileage logs for the active client and year.
#[tauri::command(rename_all = "camelCase")]
pub fn list_mileage_logs(
    year: i32,
    app_handle: tauri::AppHandle,
    state: tauri::State<AppState>,
) -> Result<Vec<MileageLog>> {
    super::scoped::with_scoped_conn(&state, &app_handle, None, |conn| {
        let date_from = format!("{year}-01-01");
        let date_to = format!("{}-01-01", year + 1);

        let active_lock = state.active_client.lock().unwrap();
        let client_id = active_lock
            .as_ref()
            .map(|ac| ac.client_id.clone())
            .ok_or(AppError::NoActiveClient)?;
        drop(active_lock);

        let mut stmt = conn.prepare(
            r#"
            SELECT * FROM mileage_logs
            WHERE client_id = ?1 AND date >= ?2 AND date < ?3
            ORDER BY date DESC
            "#,
        )?;

        let logs = stmt
            .query_map(params![client_id, date_from, date_to], |row: &rusqlite::Row| {
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
            })?
            .filter_map(|r| r.ok())
            .collect();

        Ok(logs)
    })
}

/// Delete a mileage log entry.
#[tauri::command(rename_all = "camelCase")]
pub fn delete_mileage_log(
    log_id: String,
    app_handle: tauri::AppHandle,
    state: tauri::State<AppState>,
) -> Result<()> {
    super::scoped::with_scoped_conn(&state, &app_handle, None, |conn| {
        conn.execute("DELETE FROM mileage_logs WHERE id = ?1", params![log_id])?;
        Ok(())
    })
}

/// Get IRS mileage rate for a specific year.
#[tauri::command(rename_all = "camelCase")]
pub fn get_irs_mileage_rate(
    year: i32,
    app_handle: tauri::AppHandle,
    state: tauri::State<AppState>,
) -> Result<MileageRate> {
    // This uses the owner DB since it's a reference table
    super::scoped::with_scoped_conn(&state, &app_handle, Some("owner"), |conn| {
        let rate = conn.query_row(
            "SELECT year, rate_cents, effective_date, notes FROM irs_mileage_rates WHERE year = ?1",
            params![year],
            |row: &rusqlite::Row| {
                Ok(MileageRate {
                    year: row.get(0)?,
                    rate_cents: row.get(1)?,
                    effective_date: row.get(2)?,
                    notes: row.get(3)?,
                })
            },
        )?;

        Ok(rate)
    })
}

/// Get total mileage deduction for a year.
#[tauri::command(rename_all = "camelCase")]
pub fn get_mileage_deduction_total(
    year: i32,
    app_handle: tauri::AppHandle,
    state: tauri::State<AppState>,
) -> Result<i64> {
    super::scoped::with_scoped_conn(&state, &app_handle, None, |conn| {
        let date_from = format!("{year}-01-01");
        let date_to = format!("{}-01-01", year + 1);

        let active_lock = state.active_client.lock().unwrap();
        let client_id = active_lock
            .as_ref()
            .map(|ac| ac.client_id.clone())
            .ok_or(AppError::NoActiveClient)?;
        drop(active_lock);

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

// Helper: Get IRS rate for a given date
fn get_rate_for_date(conn: &rusqlite::Connection, date: &str) -> Result<i64> {
    // Parse year from date string (YYYY-MM-DD format)
    let year: i32 = date[..4]
        .parse()
        .map_err(|_| AppError::Validation("Invalid date format".to_string()))?;

    let rate = conn
        .query_row(
            "SELECT rate_cents FROM irs_mileage_rates WHERE year = ?1",
            params![year],
            |row| row.get::<_, i64>(0),
        )
        .map_err(|_| AppError::NotFound(format!("No IRS mileage rate found for year {year}")))?;

    Ok(rate)
}
