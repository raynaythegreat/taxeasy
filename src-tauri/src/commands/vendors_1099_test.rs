#[cfg(test)]
mod tests {
    use super::super::vendors_1099::*;
    use crate::db::{ClientDb, OwnerDb};
    use crate::state::{ActiveClient, AppState};
    use rusqlite::Connection;
    use std::path::PathBuf;
    use tempfile::tempdir;

    fn setup_test_db() -> (Connection, AppState, PathBuf) {
        let dir = tempdir().unwrap();
        let db_path = dir.path().join("test.db");

        // Create owner DB for 1099 forms (shared owner tables)
        let owner_db_path = dir.path().join("owner.db");
        let owner_db = OwnerDb::open(owner_db_path.to_str().unwrap(), "test-passphrase").unwrap();

        let state = AppState {
            app_db: std::sync::Mutex::new(None),
            active_client: std::sync::Mutex::new(None),
            owner_db: std::sync::Mutex::new(Some(owner_db)),
            passphrase: std::sync::Mutex::new(Some("test-passphrase".to_string())),
        };

        // Create ClientDb (runs migrations internally)
        let client_id = "test-client-uuid";
        let client_db =
            ClientDb::open(db_path.to_str().unwrap(), client_id, "test-passphrase").unwrap();

        // Force checkpoint to ensure WAL changes are visible to new connections
        client_db
            .conn()
            .execute_batch("PRAGMA wal_checkpoint(TRUNCATE);")
            .unwrap();

        *state.active_client.lock().unwrap() = Some(ActiveClient {
            client_id: client_id.to_string(),
            db: client_db,
        });

        // Open a raw connection for test assertions (after ClientDb is set up)
        // Must apply SQLCipher key to read encrypted tables
        let raw_key = crate::db::encryption::client_db_key("test-passphrase", client_id).unwrap();
        let hex_key = crate::db::encryption::sqlcipher_hex_key(&raw_key);
        let conn = Connection::open(&db_path).unwrap();
        conn.execute_batch(&format!("PRAGMA key = \"{hex_key}\";"))
            .unwrap();

        (conn, state, db_path)
    }

    #[test]
    fn test_create_vendor_without_tax_id() {
        let (_conn, state, _db_path) = setup_test_db();

        let result = create_vendor_impl(
            "ABC Contractors".to_string(),
            None,
            None,
            None,
            None,
            None,
            None,
            None,
            None,
            None,
            None,
            &state,
        );

        assert!(result.is_ok(), "Failed: {:?}", result.err());
        let vendor = result.unwrap();
        assert_eq!(vendor.name, "ABC Contractors");
        assert!(!vendor.is_1099_required);
    }

    #[test]
    fn test_create_vendor_with_ein() {
        let (_conn, state, _db_path) = setup_test_db();

        let result = create_vendor_impl(
            "XYZ Services LLC".to_string(),
            Some("12-3456789".to_string()),
            None,
            None,
            None,
            None,
            None,
            None,
            None,
            None,
            None,
            &state,
        );

        assert!(result.is_ok());
        let vendor = result.unwrap();
        assert_eq!(vendor.ein, Some("12-3456789".to_string()));
        assert!(vendor.is_1099_required);
    }

    #[test]
    fn test_create_vendor_with_ssn() {
        let (_conn, state, _db_path) = setup_test_db();

        let result = create_vendor_impl(
            "John Doe".to_string(),
            None,
            Some(vec![1, 2, 3, 4]), // Encrypted SSN bytes
            None,
            None,
            None,
            None,
            None,
            None,
            None,
            None,
            &state,
        );

        assert!(result.is_ok());
        let vendor = result.unwrap();
        assert!(vendor.is_1099_required);
    }

    #[test]
    fn test_update_vendor() {
        let (_conn, state, _db_path) = setup_test_db();

        let created = create_vendor_impl(
            "Old Name LLC".to_string(),
            None,
            None,
            None,
            None,
            None,
            None,
            None,
            None,
            None,
            None,
            &state,
        )
        .unwrap();

        let result = update_vendor_impl(
            created.id.clone(),
            Some("New Name LLC".to_string()),
            Some("98-7654321".to_string()),
            None,
            Some("456 Oak Ave".to_string()),
            None,
            None,
            None,
            None,
            None,
            None,
            None,
            &state,
        );

        assert!(result.is_ok());
        let updated = result.unwrap();
        assert_eq!(updated.name, "New Name LLC");
        assert_eq!(updated.ein, Some("98-7654321".to_string()));
        assert!(updated.is_1099_required);
    }

    #[test]
    fn test_delete_vendor() {
        let (_conn, state, _db_path) = setup_test_db();

        let created = create_vendor_impl(
            "To Delete LLC".to_string(),
            None,
            None,
            None,
            None,
            None,
            None,
            None,
            None,
            None,
            None,
            &state,
        )
        .unwrap();

        let result = delete_vendor_impl(created.id.clone(), None, &state);
        assert!(result.is_ok());

        // Verify deletion by checking via list_vendors_impl (uses the same connection)
        let vendors = list_vendors_impl(None, &state).unwrap();
        assert!(!vendors.iter().any(|v| v.id == created.id));
    }

    #[test]
    fn test_list_vendors() {
        let (_conn, state, _db_path) = setup_test_db();

        let _ = create_vendor_impl(
            "Vendor A".to_string(),
            None,
            None,
            None,
            None,
            None,
            None,
            None,
            None,
            None,
            None,
            &state,
        );
        let _ = create_vendor_impl(
            "Vendor B".to_string(),
            None,
            None,
            None,
            None,
            None,
            None,
            None,
            None,
            None,
            None,
            &state,
        );
        let _ = create_vendor_impl(
            "Vendor C".to_string(),
            None,
            None,
            None,
            None,
            None,
            None,
            None,
            None,
            None,
            None,
            &state,
        );

        let result = list_vendors_impl(None, &state);

        assert!(result.is_ok());
        let vendors = result.unwrap();
        assert_eq!(vendors.len(), 3);
        assert_eq!(vendors[0].name, "Vendor A");
    }

    #[test]
    fn test_record_contractor_payment() {
        let (_conn, state, _db_path) = setup_test_db();

        let vendor = create_vendor_impl(
            "Contractor LLC".to_string(),
            Some("11-2233445".to_string()),
            None,
            None,
            None,
            None,
            None,
            None,
            None,
            None,
            None,
            &state,
        )
        .unwrap();

        let result = record_contractor_payment_impl(
            vendor.id.clone(),
            "Office Cleaning".to_string(),
            50000,
            "2024-08-15".to_string(),
            None,
            &state,
        );

        if let Err(ref e) = result {
            eprintln!("ERROR record_contractor_payment: {:?}", e);
        }
        assert!(result.is_ok(), "Failed: {:?}", result.err());
        let payment = result.unwrap();
        assert_eq!(payment.vendor_id, vendor.id);
        assert_eq!(payment.amount_cents, 50000);

        let updated_vendor = list_vendors_impl(None, &state)
            .unwrap()
            .into_iter()
            .find(|v| v.id == vendor.id)
            .unwrap();
        assert_eq!(updated_vendor.total_payments_cents, 50000);
    }

    #[test]
    fn test_record_multiple_payments_accumulates() {
        let (_conn, state, _db_path) = setup_test_db();

        let vendor = create_vendor_impl(
            "Multi Payment Contractor".to_string(),
            Some("22-3344556".to_string()),
            None,
            None,
            None,
            None,
            None,
            None,
            None,
            None,
            None,
            &state,
        )
        .unwrap();

        let _ = record_contractor_payment_impl(
            vendor.id.clone(),
            "Payment 1".to_string(),
            30000,
            "2024-06-01".to_string(),
            None,
            &state,
        );
        let _ = record_contractor_payment_impl(
            vendor.id.clone(),
            "Payment 2".to_string(),
            40000,
            "2024-07-01".to_string(),
            None,
            &state,
        );

        let updated_vendor = list_vendors_impl(None, &state)
            .unwrap()
            .into_iter()
            .find(|v| v.id == vendor.id)
            .unwrap();
        assert_eq!(updated_vendor.total_payments_cents, 70000);
    }

    #[test]
    fn test_generate_1099_nec() {
        let (_conn, state, _db_path) = setup_test_db();

        let vendor = create_vendor_impl(
            "1099 Contractor".to_string(),
            Some("33-4455667".to_string()),
            None,
            Some("789 Pine St".to_string()),
            None,
            None,
            None,
            None,
            None,
            None,
            None,
            &state,
        )
        .unwrap();

        let _ = record_contractor_payment_impl(
            vendor.id.clone(),
            "Consulting".to_string(),
            80000,
            "2024-09-01".to_string(),
            None,
            &state,
        );

        let result = generate_1099_nec_impl(vendor.id.clone(), 2024, None, &state);

        assert!(result.is_ok());
        let form = result.unwrap();
        assert_eq!(form.tax_year, 2024);
        assert_eq!(form.box1_nonemployee_compensation, 80000);
    }

    #[test]
    fn test_list_generated_1099_nec() {
        let (_conn, state, _db_path) = setup_test_db();

        let vendor1 = create_vendor_impl(
            "Vendor 1".to_string(),
            Some("55-6677889".to_string()),
            None,
            None,
            None,
            None,
            None,
            None,
            None,
            None,
            None,
            &state,
        )
        .unwrap();
        let vendor2 = create_vendor_impl(
            "Vendor 2".to_string(),
            Some("66-7788990".to_string()),
            None,
            None,
            None,
            None,
            None,
            None,
            None,
            None,
            None,
            &state,
        )
        .unwrap();

        let _ = record_contractor_payment_impl(
            vendor1.id.clone(),
            "Work".to_string(),
            100000,
            "2024-05-01".to_string(),
            None,
            &state,
        );
        let _ = record_contractor_payment_impl(
            vendor2.id.clone(),
            "Work".to_string(),
            150000,
            "2024-06-01".to_string(),
            None,
            &state,
        );

        let _ = generate_1099_nec_impl(vendor1.id.clone(), 2024, None, &state);
        let _ = generate_1099_nec_impl(vendor2.id.clone(), 2024, None, &state);

        let result = list_generated_1099_nec_impl(2024, None, &state);

        assert!(result.is_ok());
        let forms = result.unwrap();
        assert_eq!(forms.len(), 2);
    }

    #[test]
    fn test_generate_1099_nec_below_threshold() {
        let (_conn, state, _db_path) = setup_test_db();

        let vendor = create_vendor_impl(
            "Small Contractor".to_string(),
            Some("44-5566778".to_string()),
            None,
            None,
            None,
            None,
            None,
            None,
            None,
            None,
            None,
            &state,
        )
        .unwrap();

        // Payment below $600 threshold
        let _ = record_contractor_payment_impl(
            vendor.id.clone(),
            "Small Job".to_string(),
            59900,
            "2024-03-01".to_string(),
            None,
            &state,
        );

        let result = generate_1099_nec_impl(vendor.id.clone(), 2024, None, &state);

        assert!(result.is_ok());
        let form = result.unwrap();
        assert_eq!(form.box1_nonemployee_compensation, 59900);
        // Form still generated, but IRS threshold is $600
    }
}
