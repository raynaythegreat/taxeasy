use crate::{
    domain::vendors_1099::{ContractorPayment, Generated1099Nec, Vendor},
    error::{AppError, Result},
    state::AppState,
};
use rusqlite::params;
use tauri::AppHandle;
use uuid::Uuid;

// ============================================================================
// Internal implementation functions (testable)
// ============================================================================

/// List vendors for active client (internal implementation).
pub fn list_vendors_impl(app_handle: Option<&AppHandle>, state: &AppState) -> Result<Vec<Vendor>> {
    let active_lock = state.active_client.lock().unwrap();
    let client_id = active_lock
        .as_ref()
        .map(|ac| ac.client_id.clone())
        .ok_or(AppError::NoActiveClient)?;
    drop(active_lock);

    super::scoped::with_scoped_conn(state, app_handle, Some(&client_id), |conn| {
        let mut stmt = conn.prepare(
            r#"
            SELECT id, client_id, name, ein, ssn_encrypted, address_line1, address_line2,
                   city, state, postal_code, phone, email, total_payments_cents,
                   is_1099_required, created_at
            FROM vendors
            WHERE client_id = ?1
            ORDER BY name
            "#,
        )?;

        let vendors = stmt
            .query_map(params![client_id], |row| {
                Ok(Vendor {
                    id: row.get(0)?,
                    client_id: row.get(1)?,
                    name: row.get(2)?,
                    ein: row.get(3)?,
                    ssn_encrypted: row.get(4)?,
                    address_line1: row.get(5)?,
                    address_line2: row.get(6)?,
                    city: row.get(7)?,
                    state: row.get(8)?,
                    postal_code: row.get(9)?,
                    phone: row.get(10)?,
                    email: row.get(11)?,
                    total_payments_cents: row.get(12)?,
                    is_1099_required: row.get(13)?,
                    created_at: row.get(14)?,
                })
            })?
            .filter_map(|r| r.ok())
            .collect();

        Ok(vendors)
    })
}

/// Create a new vendor (internal implementation).
pub fn create_vendor_impl(
    name: String,
    ein: Option<String>,
    ssn_encrypted: Option<Vec<u8>>,
    address_line1: Option<String>,
    address_line2: Option<String>,
    city: Option<String>,
    state_prov: Option<String>,
    postal_code: Option<String>,
    phone: Option<String>,
    email: Option<String>,
    app_handle: Option<&AppHandle>,
    state: &AppState,
) -> Result<Vendor> {
    let active_lock = state.active_client.lock().unwrap();
    let client_id = active_lock
        .as_ref()
        .map(|ac| ac.client_id.clone())
        .ok_or(AppError::NoActiveClient)?;
    drop(active_lock);

    super::scoped::with_scoped_conn(state, app_handle, Some(&client_id), |conn| {
        let id = Uuid::new_v4().to_string();
        let created_at = chrono::Utc::now().to_rfc3339();
        let is_1099_required = if ein.is_some() || ssn_encrypted.is_some() {
            1
        } else {
            0
        };

        conn.execute(
            r#"
            INSERT INTO vendors (
                id, client_id, name, ein, ssn_encrypted, address_line1, address_line2,
                city, state, postal_code, phone, email, total_payments_cents,
                is_1099_required, created_at
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, 0, ?13, ?14)
            "#,
            params![
                id,
                client_id,
                name,
                ein,
                ssn_encrypted,
                address_line1,
                address_line2,
                city,
                state_prov,
                postal_code,
                phone,
                email,
                is_1099_required,
                created_at
            ],
        )?;

        let vendor = conn.query_row("SELECT * FROM vendors WHERE id = ?1", params![id], |row| {
            Ok(Vendor {
                id: row.get(0)?,
                client_id: row.get(1)?,
                name: row.get(2)?,
                ein: row.get(3)?,
                ssn_encrypted: row.get(4)?,
                address_line1: row.get(5)?,
                address_line2: row.get(6)?,
                city: row.get(7)?,
                state: row.get(8)?,
                postal_code: row.get(9)?,
                phone: row.get(10)?,
                email: row.get(11)?,
                total_payments_cents: row.get(12)?,
                is_1099_required: row.get(13)?,
                created_at: row.get(14)?,
            })
        })?;

        Ok(vendor)
    })
}

/// Update a vendor (internal implementation).
pub fn update_vendor_impl(
    vendor_id: String,
    name: Option<String>,
    ein: Option<String>,
    ssn_encrypted: Option<Vec<u8>>,
    address_line1: Option<String>,
    address_line2: Option<String>,
    city: Option<String>,
    state_val: Option<String>,
    postal_code: Option<String>,
    phone: Option<String>,
    email: Option<String>,
    app_handle: Option<&AppHandle>,
    state: &AppState,
) -> Result<Vendor> {
    let active_lock = state.active_client.lock().unwrap();
    let client_id = active_lock
        .as_ref()
        .map(|ac| ac.client_id.clone())
        .ok_or(AppError::NoActiveClient)?;
    drop(active_lock);

    super::scoped::with_scoped_conn(state, app_handle, Some(&client_id), |conn| {
        // Build dynamic update with only provided fields
        let mut sql_parts = Vec::new();
        let mut param_idx = 1;
        let mut bind_params: Vec<&dyn rusqlite::ToSql> = Vec::new();

        if let Some(ref v) = name {
            sql_parts.push(format!("name = ?{}", param_idx));
            bind_params.push(v);
            param_idx += 1;
        }
        if let Some(ref v) = ein {
            sql_parts.push(format!("ein = ?{}", param_idx));
            bind_params.push(v);
            param_idx += 1;
        }
        if let Some(ref v) = ssn_encrypted {
            sql_parts.push(format!("ssn_encrypted = ?{}", param_idx));
            bind_params.push(v);
            param_idx += 1;
        }
        if let Some(ref v) = address_line1 {
            sql_parts.push(format!("address_line1 = ?{}", param_idx));
            bind_params.push(v);
            param_idx += 1;
        }
        if let Some(ref v) = address_line2 {
            sql_parts.push(format!("address_line2 = ?{}", param_idx));
            bind_params.push(v);
            param_idx += 1;
        }
        if let Some(ref v) = city {
            sql_parts.push(format!("city = ?{}", param_idx));
            bind_params.push(v);
            param_idx += 1;
        }
        if let Some(ref v) = state_val {
            sql_parts.push(format!("state = ?{}", param_idx));
            bind_params.push(v);
            param_idx += 1;
        }
        if let Some(ref v) = postal_code {
            sql_parts.push(format!("postal_code = ?{}", param_idx));
            bind_params.push(v);
            param_idx += 1;
        }
        if let Some(ref v) = phone {
            sql_parts.push(format!("phone = ?{}", param_idx));
            bind_params.push(v);
            param_idx += 1;
        }
        if let Some(ref v) = email {
            sql_parts.push(format!("email = ?{}", param_idx));
            bind_params.push(v);
            param_idx += 1;
        }

        // Update is_1099_required based on whether EIN or SSN is provided
        if ein.is_some() || ssn_encrypted.is_some() {
            sql_parts.push(format!("is_1099_required = ?{}", param_idx));
            bind_params.push(&1i32);
            param_idx += 1;
        }

        if sql_parts.is_empty() {
            return Err(AppError::Validation("No fields to update".to_string()));
        }

        sql_parts.push(format!("client_id = ?{}", param_idx));
        bind_params.push(&client_id);
        param_idx += 1;

        let sql = format!(
            "UPDATE vendors SET {} WHERE id = ?{}",
            sql_parts.join(", "),
            param_idx
        );
        bind_params.push(&vendor_id);

        let mut stmt = conn.prepare(&sql)?;

        // Execute with dynamic params
        let params: Vec<&dyn rusqlite::ToSql> = bind_params;
        stmt.execute(rusqlite::params_from_iter(params))?;

        let vendor = conn.query_row(
            "SELECT * FROM vendors WHERE id = ?1",
            params![vendor_id],
            |row| {
                Ok(Vendor {
                    id: row.get(0)?,
                    client_id: row.get(1)?,
                    name: row.get(2)?,
                    ein: row.get(3)?,
                    ssn_encrypted: row.get(4)?,
                    address_line1: row.get(5)?,
                    address_line2: row.get(6)?,
                    city: row.get(7)?,
                    state: row.get(8)?,
                    postal_code: row.get(9)?,
                    phone: row.get(10)?,
                    email: row.get(11)?,
                    total_payments_cents: row.get(12)?,
                    is_1099_required: row.get(13)?,
                    created_at: row.get(14)?,
                })
            },
        )?;

        Ok(vendor)
    })
}

/// Delete a vendor (internal implementation).
pub fn delete_vendor_impl(
    vendor_id: String,
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
        conn.execute("DELETE FROM vendors WHERE id = ?1", params![vendor_id])?;
        Ok(())
    })
}

/// Record a contractor payment (internal implementation).
pub fn record_contractor_payment_impl(
    vendor_id: String,
    transaction_id: String,
    amount_cents: i64,
    payment_date: String,
    app_handle: Option<&AppHandle>,
    state: &AppState,
) -> Result<ContractorPayment> {
    let active_lock = state.active_client.lock().unwrap();
    let client_id = active_lock
        .as_ref()
        .map(|ac| ac.client_id.clone())
        .ok_or(AppError::NoActiveClient)?;
    drop(active_lock);

    super::scoped::with_scoped_conn(state, app_handle, Some(&client_id), |conn| {
        let id = Uuid::new_v4().to_string();
        let created_at = chrono::Utc::now().to_rfc3339();

        conn.execute(
            r#"
            INSERT INTO contractor_payments (id, vendor_id, transaction_id, amount_cents, payment_date, created_at)
            VALUES (?1, ?2, ?3, ?4, ?5, ?6)
            "#,
            params![id, vendor_id, transaction_id, amount_cents, payment_date, created_at],
        )?;

        // Update vendor total
        conn.execute(
            "UPDATE vendors SET total_payments_cents = total_payments_cents + ?1 WHERE id = ?2",
            params![amount_cents, vendor_id],
        )?;

        let payment = conn.query_row(
            "SELECT * FROM contractor_payments WHERE id = ?1",
            params![id],
            |row| {
                Ok(ContractorPayment {
                    id: row.get(0)?,
                    vendor_id: row.get(1)?,
                    transaction_id: row.get(2)?,
                    amount_cents: row.get(3)?,
                    payment_date: row.get(4)?,
                    created_at: row.get(5)?,
                })
            },
        )?;

        Ok(payment)
    })
}

/// List contractor payments for a vendor and year (internal implementation).
pub fn list_contractor_payments_impl(
    vendor_id: String,
    year: i32,
    app_handle: Option<&AppHandle>,
    state: &AppState,
) -> Result<Vec<ContractorPayment>> {
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
            SELECT * FROM contractor_payments
            WHERE vendor_id = ?1 AND payment_date >= ?2 AND payment_date < ?3
            ORDER BY payment_date DESC
            "#,
        )?;

        let payments = stmt
            .query_map(params![vendor_id, date_from, date_to], |row| {
                Ok(ContractorPayment {
                    id: row.get(0)?,
                    vendor_id: row.get(1)?,
                    transaction_id: row.get(2)?,
                    amount_cents: row.get(3)?,
                    payment_date: row.get(4)?,
                    created_at: row.get(5)?,
                })
            })?
            .filter_map(|r| r.ok())
            .collect();

        Ok(payments)
    })
}

/// Generate 1099-NEC for a vendor and year (internal implementation).
pub fn generate_1099_nec_impl(
    vendor_id: String,
    tax_year: i32,
    app_handle: Option<&AppHandle>,
    state: &AppState,
) -> Result<Generated1099Nec> {
    let active_lock = state.active_client.lock().unwrap();
    let client_id = active_lock
        .as_ref()
        .map(|ac| ac.client_id.clone())
        .ok_or(AppError::NoActiveClient)?;
    drop(active_lock);

    super::scoped::with_scoped_conn(state, app_handle, Some(&client_id), |conn| {
        let date_from = format!("{tax_year}-01-01");
        let date_to = format!("{}-01-01", tax_year + 1);

        // Sum payments for the year
        let box1_nonemployee_compensation: i64 = conn
            .query_row(
                "SELECT COALESCE(SUM(amount_cents), 0) FROM contractor_payments WHERE vendor_id = ?1 AND payment_date >= ?2 AND payment_date < ?3",
                params![vendor_id, date_from, date_to],
                |row| row.get(0),
            )
            .unwrap_or(0);

        let id = Uuid::new_v4().to_string();
        let generated_at = chrono::Utc::now().to_rfc3339();

        // Check if already exists
        let existing: Option<String> = conn
            .query_row(
                "SELECT id FROM generated_1099_nec WHERE vendor_id = ?1 AND tax_year = ?2",
                params![vendor_id, tax_year],
                |row| row.get(0),
            )
            .ok();

        if let Some(existing_id) = existing {
            // Update existing
            conn.execute(
                r#"
                UPDATE generated_1099_nec
                SET box1_nonemployee_compensation = ?1, generated_at = ?2
                WHERE id = ?3
                "#,
                params![box1_nonemployee_compensation, generated_at, existing_id],
            )?;

            let form = conn.query_row(
                "SELECT * FROM generated_1099_nec WHERE id = ?1",
                params![existing_id],
                |row| {
                    Ok(Generated1099Nec {
                        id: row.get(0)?,
                        vendor_id: row.get(1)?,
                        tax_year: row.get(2)?,
                        box1_nonemployee_compensation: row.get(3)?,
                        box2_cash_received: row.get(4)?,
                        box4_federal_tax_withheld: row.get(5)?,
                        box5_state_tax_withheld: row.get(6)?,
                        box6_state_number: row.get(7)?,
                        generated_at: row.get(8)?,
                        pdf_path: row.get(9)?,
                    })
                },
            )?;

            Ok(form)
        } else {
            // Insert new
            conn.execute(
                r#"
                INSERT INTO generated_1099_nec (
                    id, vendor_id, tax_year, box1_nonemployee_compensation,
                    box2_cash_received, box4_federal_tax_withheld,
                    box5_state_tax_withheld, box6_state_number, generated_at
                ) VALUES (?1, ?2, ?3, ?4, 0, 0, 0, NULL, ?5)
                "#,
                params![
                    id,
                    vendor_id,
                    tax_year,
                    box1_nonemployee_compensation,
                    generated_at
                ],
            )?;

            let form = conn.query_row(
                "SELECT * FROM generated_1099_nec WHERE id = ?1",
                params![id],
                |row| {
                    Ok(Generated1099Nec {
                        id: row.get(0)?,
                        vendor_id: row.get(1)?,
                        tax_year: row.get(2)?,
                        box1_nonemployee_compensation: row.get(3)?,
                        box2_cash_received: row.get(4)?,
                        box4_federal_tax_withheld: row.get(5)?,
                        box5_state_tax_withheld: row.get(6)?,
                        box6_state_number: row.get(7)?,
                        generated_at: row.get(8)?,
                        pdf_path: row.get(9)?,
                    })
                },
            )?;

            Ok(form)
        }
    })
}

/// List generated 1099-NEC forms for active client and year (internal implementation).
pub fn list_generated_1099_nec_impl(
    year: i32,
    app_handle: Option<&AppHandle>,
    state: &AppState,
) -> Result<Vec<Generated1099Nec>> {
    let active_lock = state.active_client.lock().unwrap();
    let client_id = active_lock
        .as_ref()
        .map(|ac| ac.client_id.clone())
        .ok_or(AppError::NoActiveClient)?;
    drop(active_lock);

    super::scoped::with_scoped_conn(state, app_handle, Some(&client_id), |conn| {
        let mut stmt = conn.prepare(
            r#"
            SELECT g.* FROM generated_1099_nec g
            JOIN vendors v ON g.vendor_id = v.id
            WHERE v.client_id = ?1 AND g.tax_year = ?2
            ORDER BY g.generated_at DESC
            "#,
        )?;

        let forms = stmt
            .query_map(params![client_id, year], |row| {
                Ok(Generated1099Nec {
                    id: row.get(0)?,
                    vendor_id: row.get(1)?,
                    tax_year: row.get(2)?,
                    box1_nonemployee_compensation: row.get(3)?,
                    box2_cash_received: row.get(4)?,
                    box4_federal_tax_withheld: row.get(5)?,
                    box5_state_tax_withheld: row.get(6)?,
                    box6_state_number: row.get(7)?,
                    generated_at: row.get(8)?,
                    pdf_path: row.get(9)?,
                })
            })?
            .filter_map(|r| r.ok())
            .collect();

        Ok(forms)
    })
}

// ============================================================================
// Tauri command wrappers (delegates to _impl functions)
// ============================================================================

/// List vendors for active client.
#[tauri::command(rename_all = "camelCase")]
pub fn list_vendors(
    app_handle: tauri::AppHandle,
    state: tauri::State<AppState>,
) -> Result<Vec<Vendor>> {
    list_vendors_impl(Some(&app_handle), state.inner())
}

/// Create a new vendor.
#[tauri::command(rename_all = "camelCase")]
pub fn create_vendor(
    name: String,
    ein: Option<String>,
    ssn_encrypted: Option<Vec<u8>>,
    address_line1: Option<String>,
    address_line2: Option<String>,
    city: Option<String>,
    state_prov: Option<String>,
    postal_code: Option<String>,
    phone: Option<String>,
    email: Option<String>,
    app_handle: tauri::AppHandle,
    state: tauri::State<AppState>,
) -> Result<Vendor> {
    create_vendor_impl(
        name,
        ein,
        ssn_encrypted,
        address_line1,
        address_line2,
        city,
        state_prov,
        postal_code,
        phone,
        email,
        Some(&app_handle),
        state.inner(),
    )
}

/// Update a vendor.
#[tauri::command(rename_all = "camelCase")]
pub fn update_vendor(
    vendor_id: String,
    name: Option<String>,
    ein: Option<String>,
    ssn_encrypted: Option<Vec<u8>>,
    address_line1: Option<String>,
    address_line2: Option<String>,
    city: Option<String>,
    state_val: Option<String>,
    postal_code: Option<String>,
    phone: Option<String>,
    email: Option<String>,
    app_handle: tauri::AppHandle,
    state: tauri::State<AppState>,
) -> Result<Vendor> {
    update_vendor_impl(
        vendor_id,
        name,
        ein,
        ssn_encrypted,
        address_line1,
        address_line2,
        city,
        state_val,
        postal_code,
        phone,
        email,
        Some(&app_handle),
        state.inner(),
    )
}

/// Delete a vendor.
#[tauri::command(rename_all = "camelCase")]
pub fn delete_vendor(
    vendor_id: String,
    app_handle: tauri::AppHandle,
    state: tauri::State<AppState>,
) -> Result<()> {
    delete_vendor_impl(vendor_id, Some(&app_handle), state.inner())
}

/// Record a contractor payment.
#[tauri::command(rename_all = "camelCase")]
pub fn record_contractor_payment(
    vendor_id: String,
    transaction_id: String,
    amount_cents: i64,
    payment_date: String,
    app_handle: tauri::AppHandle,
    state: tauri::State<AppState>,
) -> Result<ContractorPayment> {
    record_contractor_payment_impl(
        vendor_id,
        transaction_id,
        amount_cents,
        payment_date,
        Some(&app_handle),
        state.inner(),
    )
}

/// List contractor payments for a vendor and year.
#[tauri::command(rename_all = "camelCase")]
pub fn list_contractor_payments(
    vendor_id: String,
    year: i32,
    app_handle: tauri::AppHandle,
    state: tauri::State<AppState>,
) -> Result<Vec<ContractorPayment>> {
    list_contractor_payments_impl(vendor_id, year, Some(&app_handle), state.inner())
}

/// Generate 1099-NEC for a vendor and year.
#[tauri::command(rename_all = "camelCase")]
pub fn generate_1099_nec(
    vendor_id: String,
    tax_year: i32,
    app_handle: tauri::AppHandle,
    state: tauri::State<AppState>,
) -> Result<Generated1099Nec> {
    generate_1099_nec_impl(vendor_id, tax_year, Some(&app_handle), state.inner())
}

/// List generated 1099-NEC forms for active client and year.
#[tauri::command(rename_all = "camelCase")]
pub fn list_generated_1099_nec(
    year: i32,
    app_handle: tauri::AppHandle,
    state: tauri::State<AppState>,
) -> Result<Vec<Generated1099Nec>> {
    list_generated_1099_nec_impl(year, Some(&app_handle), state.inner())
}
