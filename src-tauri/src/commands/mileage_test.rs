#[cfg(test)]
mod tests {
    use super::super::mileage::*;
    use crate::domain::mileage_log::CreateMileagePayload;
    use crate::state::{AppState, ActiveClient};
    use crate::db::{ClientDb, OwnerDb};
    use rusqlite::Connection;
    use tempfile::tempdir;
    use std::path::PathBuf;

    fn setup_test_db() -> (Connection, AppState, PathBuf) {
        let dir = tempdir().unwrap();
        let db_path = dir.path().join("test.db");

        // Create owner DB for IRS rates (shared owner tables)
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
        let client_db = ClientDb::open(db_path.to_str().unwrap(), client_id, "test-passphrase").unwrap();

        // Force checkpoint to ensure WAL changes are visible to new connections
        client_db.conn().execute_batch("PRAGMA wal_checkpoint(TRUNCATE);").unwrap();

        *state.active_client.lock().unwrap() = Some(ActiveClient {
            client_id: client_id.to_string(),
            db: client_db,
        });

        // Open a raw connection for test assertions (after ClientDb is set up)
        // Must apply SQLCipher key to read encrypted tables
        let raw_key = crate::db::encryption::client_db_key("test-passphrase", client_id).unwrap();
        let hex_key = crate::db::encryption::sqlcipher_hex_key(&raw_key);
        let conn = Connection::open(&db_path).unwrap();
        conn.execute_batch(&format!("PRAGMA key = \"{hex_key}\";")).unwrap();

        (conn, state, db_path)
    }

    #[test]
    fn test_create_mileage_log() {
        let (_conn, state, _db_path) = setup_test_db();

        let payload = CreateMileagePayload {
            date: "2024-06-15".to_string(),
            purpose: "Business Meeting".to_string(),
            origin: "Office".to_string(),
            destination: "Client Site".to_string(),
            miles_real: 25.5,
            notes: Some("Quarterly review meeting".to_string()),
            receipt_image_path: None,
        };

        let result = create_mileage_log_impl(payload, None, &state);

        if let Err(ref e) = result {
            eprintln!("ERROR create_mileage_log: {:?}", e);
        }
        assert!(result.is_ok());
        let log = result.unwrap();
        assert_eq!(log.date, "2024-06-15");
        assert_eq!(log.miles_real, 25.5);
        assert_eq!(log.rate_cents, 67);
        assert_eq!(log.deduction_cents, 1708);
    }

    #[test]
    fn test_create_mileage_log_uses_correct_year_rate() {
        let (_conn, state, _db_path) = setup_test_db();

        let payload_2023 = CreateMileagePayload {
            date: "2023-08-20".to_string(),
            purpose: "Site Visit".to_string(),
            origin: "Office".to_string(),
            destination: "Construction Site".to_string(),
            miles_real: 50.0,
            notes: None,
            receipt_image_path: None,
        };

        let result = create_mileage_log_impl(payload_2023, None, &state);

        assert!(result.is_ok());
        let log = result.unwrap();
        assert_eq!(log.date, "2023-08-20");
        assert_eq!(log.rate_cents, 65);
        assert_eq!(log.deduction_cents, 3250);
    }

    #[test]
    fn test_list_mileage_logs_filters_by_year() {
        let (_conn, state, _db_path) = setup_test_db();

        let _ = create_mileage_log_impl(
            CreateMileagePayload { date: "2024-03-15".to_string(), purpose: "Trip 1".to_string(), origin: "A".to_string(), destination: "B".to_string(), miles_real: 10.0, notes: None },
            None,
            &state,
        );
        let _ = create_mileage_log_impl(
            CreateMileagePayload { date: "2024-07-22".to_string(), purpose: "Trip 2".to_string(), origin: "A".to_string(), destination: "C".to_string(), miles_real: 20.0, notes: None },
            None,
            &state,
        );
        let _ = create_mileage_log_impl(
            CreateMileagePayload { date: "2023-11-10".to_string(), purpose: "Old Trip".to_string(), origin: "A".to_string(), destination: "D".to_string(), miles_real: 15.0, notes: None },
            None,
            &state,
        );

        let result = list_mileage_logs_impl(2024, None, &state);

        assert!(result.is_ok());
        let logs = result.unwrap();
        assert_eq!(logs.len(), 2);
        assert!(logs.iter().all(|l| l.date.starts_with("2024")));
    }

    #[test]
    fn test_delete_mileage_log() {
        let (_conn, state, _db_path) = setup_test_db();

        let created = create_mileage_log_impl(
            CreateMileagePayload { date: "2024-05-01".to_string(), purpose: "Test Trip".to_string(), origin: "Here".to_string(), destination: "There".to_string(), miles_real: 30.0, notes: None },
            None,
            &state,
        ).unwrap();

        let result = delete_mileage_log_impl(created.id.clone(), None, &state);
        assert!(result.is_ok());

        // Verify deletion through client_db connection
        let count: i64 = state.active_client.lock().unwrap()
            .as_ref()
            .unwrap()
            .db
            .conn()
            .query_row(
                "SELECT COUNT(*) FROM mileage_logs WHERE id = ?1",
                rusqlite::params![created.id],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(count, 0);
    }

    #[test]
    fn test_get_irs_mileage_rate() {
        let (_conn, state, _db_path) = setup_test_db();

        let result = get_irs_mileage_rate_impl(2024, None, &state);

        assert!(result.is_ok());
        let rate = result.unwrap();
        assert_eq!(rate.year, 2024);
        assert_eq!(rate.rate_cents, 67);
    }

    #[test]
    fn test_get_mileage_deduction_total() {
        let (_conn, state, _db_path) = setup_test_db();

        let _ = create_mileage_log_impl(
            CreateMileagePayload { date: "2024-02-10".to_string(), purpose: "Trip 1".to_string(), origin: "A".to_string(), destination: "B".to_string(), miles_real: 100.0, notes: None },
            None,
            &state,
        );
        let _ = create_mileage_log_impl(
            CreateMileagePayload { date: "2024-08-15".to_string(), purpose: "Trip 2".to_string(), origin: "A".to_string(), destination: "C".to_string(), miles_real: 50.0, notes: None },
            None,
            &state,
        );

        let result = get_mileage_deduction_total_impl(2024, None, &state);

        assert!(result.is_ok());
        let total = result.unwrap();
        assert_eq!(total, 10050);
    }

    #[test]
    fn test_get_mileage_deduction_total_empty() {
        let (_conn, state, _db_path) = setup_test_db();

        let result = get_mileage_deduction_total_impl(2024, None, &state);

        assert!(result.is_ok());
        assert_eq!(result.unwrap(), 0);
    }
}
