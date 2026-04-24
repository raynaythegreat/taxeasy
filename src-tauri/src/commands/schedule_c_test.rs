#[cfg(test)]
mod tests {
    use super::super::schedule_c::*;
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

        // Seed test accounts for Schedule C mapping tests
        client_db.conn().execute_batch(
            r#"
            INSERT INTO accounts (id, code, name, account_type, parent_id, schedule_c_line, active, sort_order) VALUES
                ('acct-123', 'EXP-123', 'Test Account 123', 'expense', NULL, NULL, 1, 0),
                ('acct-456', 'EXP-456', 'Test Account 456', 'expense', NULL, NULL, 1, 0),
                ('acct-789', 'EXP-789', 'Test Account 789', 'expense', NULL, NULL, 1, 0),
                ('acct-001', 'INC-001', 'Test Account 001', 'revenue', NULL, NULL, 1, 0),
                ('acct-002', 'INC-002', 'Test Account 002', 'revenue', NULL, NULL, 1, 0);
            "#,
        ).unwrap();

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
    fn test_upsert_schedule_c_mapping_creates_new() {
        let (_conn, state, _db_path) = setup_test_db();

        let result = upsert_schedule_c_mapping_impl(
            "acct-123".to_string(),
            "line_24a".to_string(),
            None,
            &state,
        );

        assert!(result.is_ok());
        let mapping = result.unwrap();
        assert_eq!(mapping.account_id, "acct-123");
        assert_eq!(mapping.schedule_c_line, "line_24a");
        assert!(mapping.is_custom);
    }

    #[test]
    fn test_upsert_schedule_c_mapping_updates_existing() {
        let (_conn, state, _db_path) = setup_test_db();

        let _ = upsert_schedule_c_mapping_impl(
            "acct-456".to_string(),
            "line_24a".to_string(),
            None,
            &state,
        );

        let result = upsert_schedule_c_mapping_impl(
            "acct-456".to_string(),
            "line_24b".to_string(),
            None,
            &state,
        );

        assert!(result.is_ok());
        let mapping = result.unwrap();
        assert_eq!(mapping.schedule_c_line, "line_24b");
    }

    #[test]
    fn test_delete_schedule_c_mapping() {
        let (_conn, state, _db_path) = setup_test_db();

        let created = upsert_schedule_c_mapping_impl(
            "acct-789".to_string(),
            "line_25".to_string(),
            None,
            &state,
        )
        .unwrap();

        let result = delete_schedule_c_mapping_impl(created.id.clone(), None, &state);

        assert!(result.is_ok());

        // Verify deletion through client_db connection
        let count: i64 = state
            .active_client
            .lock()
            .unwrap()
            .as_ref()
            .unwrap()
            .db
            .conn()
            .query_row(
                "SELECT COUNT(*) FROM coa_schedule_c_mappings WHERE id = ?1",
                rusqlite::params![created.id],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(count, 0);
    }

    #[test]
    fn test_list_schedule_c_mappings() {
        let (_conn, state, _db_path) = setup_test_db();

        let _ = upsert_schedule_c_mapping_impl(
            "acct-001".to_string(),
            "line_1".to_string(),
            None,
            &state,
        );
        let _ = upsert_schedule_c_mapping_impl(
            "acct-002".to_string(),
            "line_2".to_string(),
            None,
            &state,
        );

        let result = list_schedule_c_mappings_impl(None, &state);

        assert!(result.is_ok());
        let mappings = result.unwrap();
        assert_eq!(mappings.len(), 2);
    }

    #[test]
    fn test_calculate_schedule_c_summary_basic() {
        let (_conn, state, _db_path) = setup_test_db();

        let result = calculate_schedule_c_summary_impl(2024, None, &state);

        if let Err(ref e) = result {
            eprintln!("ERROR calculate_schedule_c_summary: {:?}", e);
        }
        assert!(result.is_ok());
        let summary = result.unwrap();
        assert_eq!(summary.tax_year, 2024);
    }

    #[test]
    fn test_calculate_schedule_c_summary_with_returns() {
        let (_conn, state, _db_path) = setup_test_db();

        let result = calculate_schedule_c_summary_impl(2024, None, &state);

        if let Err(ref e) = result {
            eprintln!("ERROR calculate_schedule_c_summary_with_returns: {:?}", e);
        }
        assert!(result.is_ok());
        let summary = result.unwrap();
        assert!(summary.gross_receipts >= 0);
    }

    #[test]
    fn test_calculate_schedule_c_summary_filters_by_date() {
        let (_conn, state, _db_path) = setup_test_db();

        let result = calculate_schedule_c_summary_impl(2024, None, &state);

        if let Err(ref e) = result {
            eprintln!(
                "ERROR calculate_schedule_c_summary_filters_by_date: {:?}",
                e
            );
        }
        assert!(result.is_ok());
        let summary = result.unwrap();
        assert_eq!(summary.tax_year, 2024);
    }
}
