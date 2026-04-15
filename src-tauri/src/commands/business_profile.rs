use crate::{error::Result, state::AppState};
use rusqlite::params;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BusinessProfile {
    pub id: String,
    pub name: String,
    pub entity_type: String,
    pub ein: Option<String>,
    pub contact_name: Option<String>,
    pub email: Option<String>,
    pub phone: Option<String>,
    pub website: Option<String>,
    pub address_line1: Option<String>,
    pub address_line2: Option<String>,
    pub city: Option<String>,
    pub state: Option<String>,
    pub postal_code: Option<String>,
    pub country: Option<String>,
    pub fiscal_year_start_month: i32,
    pub accounting_method: String,
    pub profile_image_path: Option<String>,
    pub tax_preparer_notes: Option<String>,
    pub filing_notes: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct SaveBusinessProfilePayload {
    pub name: Option<String>,
    pub entity_type: Option<String>,
    pub ein: Option<String>,
    pub contact_name: Option<String>,
    pub email: Option<String>,
    pub phone: Option<String>,
    pub website: Option<String>,
    pub address_line1: Option<String>,
    pub address_line2: Option<String>,
    pub city: Option<String>,
    pub state: Option<String>,
    pub postal_code: Option<String>,
    pub country: Option<String>,
    pub fiscal_year_start_month: Option<i32>,
    pub accounting_method: Option<String>,
    pub profile_image_path: Option<String>,
    pub tax_preparer_notes: Option<String>,
    pub filing_notes: Option<String>,
}

#[tauri::command(rename_all = "camelCase")]
pub fn get_business_profile(state: tauri::State<AppState>) -> Result<BusinessProfile> {
    let lock = state.app_db.lock().unwrap();
    let db = lock
        .as_ref()
        .ok_or(crate::error::AppError::NoActiveClient)?;
    let conn = db.conn();

    let profile = conn.query_row(
        "SELECT id, name, entity_type, ein, contact_name, email, phone, website,
                address_line1, address_line2, city, state, postal_code, country,
                fiscal_year_start_month, accounting_method, profile_image_path,
                tax_preparer_notes, filing_notes
         FROM business_profile LIMIT 1",
        [],
        |row| {
            Ok(BusinessProfile {
                id: row.get(0)?,
                name: row.get(1)?,
                entity_type: row.get(2)?,
                ein: row.get(3)?,
                contact_name: row.get(4)?,
                email: row.get(5)?,
                phone: row.get(6)?,
                website: row.get(7)?,
                address_line1: row.get(8)?,
                address_line2: row.get(9)?,
                city: row.get(10)?,
                state: row.get(11)?,
                postal_code: row.get(12)?,
                country: row.get(13)?,
                fiscal_year_start_month: row.get(14)?,
                accounting_method: row.get(15)?,
                profile_image_path: row.get(16)?,
                tax_preparer_notes: row.get(17)?,
                filing_notes: row.get(18)?,
            })
        },
    );

    match profile {
        Ok(p) => Ok(p),
        Err(_) => {
            // Create default profile if not exists
            let default_profile = BusinessProfile {
                id: "default".to_string(),
                name: "My Business".to_string(),
                entity_type: "sole-prop".to_string(),
                ein: None,
                contact_name: None,
                email: None,
                phone: None,
                website: None,
                address_line1: None,
                address_line2: None,
                city: None,
                state: None,
                postal_code: None,
                country: Some("USA".to_string()),
                fiscal_year_start_month: 1,
                accounting_method: "cash".to_string(),
                profile_image_path: None,
                tax_preparer_notes: None,
                filing_notes: None,
            };
            conn.execute(
                "INSERT INTO business_profile (id, name, entity_type, fiscal_year_start_month, accounting_method, country)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                params![
                    default_profile.id,
                    default_profile.name,
                    default_profile.entity_type,
                    default_profile.fiscal_year_start_month,
                    default_profile.accounting_method,
                    default_profile.country
                ],
            )?;
            Ok(default_profile)
        }
    }
}

#[tauri::command(rename_all = "camelCase")]
pub fn save_business_profile(
    payload: SaveBusinessProfilePayload,
    state: tauri::State<AppState>,
) -> Result<()> {
    let lock = state.app_db.lock().unwrap();
    let db = lock
        .as_ref()
        .ok_or(crate::error::AppError::NoActiveClient)?;
    let conn = db.conn();

    // Get existing profile to update
    let current: std::result::Result<String, rusqlite::Error> =
        conn.query_row("SELECT id FROM business_profile LIMIT 1", [], |row| {
            row.get(0)
        });

    let profile_id = match current {
        Ok(id) => id,
        Err(_) => {
            let new_id = "default".to_string();
            conn.execute(
                "INSERT INTO business_profile (id, name, entity_type, fiscal_year_start_month, accounting_method, country)
                 VALUES (?1, 'My Business', 'sole-prop', 1, 'cash', 'USA')",
                params![new_id],
            )?;
            new_id
        }
    };

    let mut updates = Vec::new();
    let mut values: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();

    macro_rules! add_update {
        ($field:expr, $value:expr) => {
            if let Some(v) = $value {
                updates.push(format!("{} = ?", $field));
                values.push(Box::new(v));
            }
        };
    }

    add_update!("name", payload.name);
    add_update!("entity_type", payload.entity_type);
    add_update!("ein", payload.ein);
    add_update!("contact_name", payload.contact_name);
    add_update!("email", payload.email);
    add_update!("phone", payload.phone);
    add_update!("website", payload.website);
    add_update!("address_line1", payload.address_line1);
    add_update!("address_line2", payload.address_line2);
    add_update!("city", payload.city);
    add_update!("state", payload.state);
    add_update!("postal_code", payload.postal_code);
    add_update!("country", payload.country);
    if let Some(v) = payload.fiscal_year_start_month {
        updates.push("fiscal_year_start_month = ?".to_string());
        values.push(Box::new(v));
    }
    add_update!("accounting_method", payload.accounting_method);
    add_update!("profile_image_path", payload.profile_image_path);
    add_update!("tax_preparer_notes", payload.tax_preparer_notes);
    add_update!("filing_notes", payload.filing_notes);

    if !updates.is_empty() {
        let sql = format!(
            "UPDATE business_profile SET {} WHERE id = ?",
            updates.join(", ")
        );
        values.push(Box::new(profile_id));
        let params: Vec<&dyn rusqlite::ToSql> = values.iter().map(|b| b.as_ref()).collect();
        conn.execute(&sql, params.as_slice())?;
    }

    Ok(())
}
