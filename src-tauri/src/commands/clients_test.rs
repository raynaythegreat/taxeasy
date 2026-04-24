#[cfg(test)]
mod tests {
    use super::super::clients::{
        bulk_import_client_folders_impl, create_client_in_dir, resync_client_folder_impl,
        BulkImportClientsResult,
    };
    use crate::{
        db::{AppDb, ClientDb},
        domain::client::{CreateClientPayload, EntityType},
        state::AppState,
    };
    use tempfile::tempdir;

    fn setup_state() -> (tempfile::TempDir, AppState, std::path::PathBuf) {
        let dir = tempdir().unwrap();
        let app_db_path = dir.path().join("app.db");
        let clients_dir = dir.path().join("clients");
        let app_db = AppDb::open(app_db_path.to_str().unwrap(), "test-passphrase").unwrap();
        let state = AppState {
            app_db: std::sync::Mutex::new(Some(app_db)),
            active_client: std::sync::Mutex::new(None),
            owner_db: std::sync::Mutex::new(None),
            passphrase: std::sync::Mutex::new(Some("test-passphrase".to_string())),
        };

        (dir, state, clients_dir)
    }

    fn client_db(state: &AppState, clients_dir: &std::path::Path, client_id: &str) -> ClientDb {
        let db_filename: String = state
            .app_db
            .lock()
            .unwrap()
            .as_ref()
            .unwrap()
            .conn()
            .query_row(
                "SELECT db_filename FROM clients WHERE id = ?1",
                rusqlite::params![client_id],
                |row| row.get(0),
            )
            .unwrap();

        ClientDb::open(
            clients_dir.join(db_filename).to_str().unwrap(),
            client_id,
            "test-passphrase",
        )
        .unwrap()
    }

    fn create_supported_file(path: &std::path::Path) {
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent).unwrap();
        }
        std::fs::write(path, path.to_string_lossy().as_bytes()).unwrap();
    }

    fn import_single_folder(
        state: &AppState,
        clients_dir: &std::path::Path,
        folder: &std::path::Path,
    ) -> BulkImportClientsResult {
        bulk_import_client_folders_impl(
            vec![folder.to_string_lossy().into_owned()],
            clients_dir,
            None,
            state,
        )
        .unwrap()
    }

    #[test]
    fn stores_source_folder_path_on_client() {
        let (_dir, state, clients_dir) = setup_state();
        let source_dir = clients_dir
            .parent()
            .unwrap()
            .join("imports")
            .join("Client A");
        std::fs::create_dir_all(&source_dir).unwrap();

        let client = create_client_in_dir(
            CreateClientPayload {
                name: "Client A".to_string(),
                entity_type: EntityType::I1040,
                ein: None,
                contact_name: None,
                email: None,
                phone: None,
                address_line1: None,
                address_line2: None,
                city: None,
                state: None,
                postal_code: None,
                country: None,
                website: None,
                tax_preparer_notes: None,
                filing_notes: None,
                source_folder_path: Some(source_dir.to_string_lossy().into_owned()),
                fiscal_year_start_month: None,
                accounting_method: None,
            },
            &clients_dir,
            &state,
        )
        .unwrap();

        assert_eq!(
            client.source_folder_path,
            Some(source_dir.to_string_lossy().into_owned())
        );

        let stored_source_folder_path: Option<String> = state
            .app_db
            .lock()
            .unwrap()
            .as_ref()
            .unwrap()
            .conn()
            .query_row(
                "SELECT source_folder_path FROM clients WHERE id = ?1",
                rusqlite::params![client.id],
                |row| row.get(0),
            )
            .unwrap();

        assert_eq!(stored_source_folder_path, client.source_folder_path);
    }

    #[test]
    fn bulk_import_skips_duplicate_active_client_names_case_insensitively() {
        let (_dir, state, clients_dir) = setup_state();
        create_client_in_dir(
            CreateClientPayload {
                name: "Acme".to_string(),
                entity_type: EntityType::I1040,
                ein: None,
                contact_name: None,
                email: None,
                phone: None,
                address_line1: None,
                address_line2: None,
                city: None,
                state: None,
                postal_code: None,
                country: None,
                website: None,
                tax_preparer_notes: None,
                filing_notes: None,
                source_folder_path: None,
                fiscal_year_start_month: None,
                accounting_method: None,
            },
            &clients_dir,
            &state,
        )
        .unwrap();

        let import_dir = clients_dir.parent().unwrap().join("imports").join("acme");
        std::fs::create_dir_all(&import_dir).unwrap();
        create_supported_file(&import_dir.join("return.pdf"));

        let result = import_single_folder(&state, &clients_dir, &import_dir);

        assert!(result.created.is_empty());
        assert_eq!(result.skipped.len(), 1);
        assert_eq!(result.skipped[0].client_name, "acme");
        assert_eq!(result.skipped[0].reason, "duplicate active client name");
    }

    #[test]
    fn bulk_import_imports_multiple_folders_and_supported_documents_recursively() {
        let (_dir, state, clients_dir) = setup_state();
        let imports_root = clients_dir.parent().unwrap().join("imports");
        let alpha_dir = imports_root.join("Alpha");
        let beta_dir = imports_root.join("Beta");

        create_supported_file(&alpha_dir.join("tax-return.pdf"));
        create_supported_file(&alpha_dir.join("nested").join("w2.txt"));
        create_supported_file(&alpha_dir.join("ignore.exe"));
        create_supported_file(&beta_dir.join("receipt.jpg"));

        let result = bulk_import_client_folders_impl(
            vec![
                alpha_dir.to_string_lossy().into_owned(),
                beta_dir.to_string_lossy().into_owned(),
            ],
            &clients_dir,
            None,
            &state,
        )
        .unwrap();

        assert_eq!(result.created.len(), 2);
        assert!(result.skipped.is_empty());
        assert!(result.failed.is_empty());
        assert_eq!(result.created[0].client.entity_type.as_str(), "i1040");
        assert_eq!(result.created[0].scanned_document_count, 2);
        assert_eq!(result.created[0].imported_document_count, 2);
        assert_eq!(result.created[0].duplicate_document_count, 0);
        assert_eq!(result.created[1].imported_document_count, 1);

        let alpha_db = client_db(&state, &clients_dir, &result.created[0].client.id);
        let beta_db = client_db(&state, &clients_dir, &result.created[1].client.id);
        let alpha_count: i64 = alpha_db
            .conn()
            .query_row("SELECT COUNT(*) FROM documents", [], |row| row.get(0))
            .unwrap();
        let beta_count: i64 = beta_db
            .conn()
            .query_row("SELECT COUNT(*) FROM documents", [], |row| row.get(0))
            .unwrap();

        assert_eq!(alpha_count, 2);
        assert_eq!(beta_count, 1);
    }

    #[test]
    fn bulk_import_returns_partial_failures_without_aborting_successes() {
        let (_dir, state, clients_dir) = setup_state();
        let imports_root = clients_dir.parent().unwrap().join("imports");
        let valid_dir = imports_root.join("Gamma");
        let missing_dir = imports_root.join("Missing");
        create_supported_file(&valid_dir.join("1099.pdf"));

        let result = bulk_import_client_folders_impl(
            vec![
                valid_dir.to_string_lossy().into_owned(),
                missing_dir.to_string_lossy().into_owned(),
            ],
            &clients_dir,
            None,
            &state,
        )
        .unwrap();

        assert_eq!(result.created.len(), 1);
        assert_eq!(result.created[0].client.name, "Gamma");
        assert_eq!(result.created[0].imported_document_count, 1);
        assert!(result.skipped.is_empty());
        assert_eq!(result.failed.len(), 1);
        assert_eq!(result.failed[0].client_name, None);
        assert!(result.failed[0].reason.contains("IO error:"));
    }

    #[test]
    fn bulk_import_detects_duplicate_source_folder_path_before_name() {
        let (_dir, state, clients_dir) = setup_state();
        let import_dir = clients_dir
            .parent()
            .unwrap()
            .join("imports")
            .join("Client A");
        create_supported_file(&import_dir.join("w2.pdf"));

        create_client_in_dir(
            CreateClientPayload {
                name: "Different Name".to_string(),
                entity_type: EntityType::I1040,
                ein: None,
                contact_name: None,
                email: None,
                phone: None,
                address_line1: None,
                address_line2: None,
                city: None,
                state: None,
                postal_code: None,
                country: None,
                website: None,
                tax_preparer_notes: None,
                filing_notes: None,
                source_folder_path: Some(import_dir.to_string_lossy().into_owned()),
                fiscal_year_start_month: None,
                accounting_method: None,
            },
            &clients_dir,
            &state,
        )
        .unwrap();

        let result = import_single_folder(&state, &clients_dir, &import_dir);

        assert!(result.created.is_empty());
        assert_eq!(result.skipped.len(), 1);
        assert_eq!(
            result.skipped[0].reason,
            "duplicate active client source folder path"
        );
    }

    #[test]
    fn bulk_import_detects_duplicate_ein_or_ssn_when_available() {
        let (_dir, state, clients_dir) = setup_state();
        create_client_in_dir(
            CreateClientPayload {
                name: "Existing Client".to_string(),
                entity_type: EntityType::I1040,
                ein: Some("123-45-6789".to_string()),
                contact_name: None,
                email: None,
                phone: None,
                address_line1: None,
                address_line2: None,
                city: None,
                state: None,
                postal_code: None,
                country: None,
                website: None,
                tax_preparer_notes: None,
                filing_notes: None,
                source_folder_path: None,
                fiscal_year_start_month: None,
                accounting_method: None,
            },
            &clients_dir,
            &state,
        )
        .unwrap();

        let import_dir = clients_dir
            .parent()
            .unwrap()
            .join("imports")
            .join("New Folder 123-45-6789");
        create_supported_file(&import_dir.join("organizer.pdf"));

        let result = import_single_folder(&state, &clients_dir, &import_dir);

        assert!(result.created.is_empty());
        assert_eq!(result.skipped.len(), 1);
        assert_eq!(result.skipped[0].reason, "duplicate active client EIN/SSN");
    }

    #[test]
    fn resync_dedupes_documents_by_file_hash_and_categorizes_filenames() {
        let (_dir, state, clients_dir) = setup_state();
        let import_dir = clients_dir.parent().unwrap().join("imports").join("Delta");
        create_supported_file(&import_dir.join("2024 Organizer.pdf"));
        create_supported_file(&import_dir.join("2024 W-2.pdf"));
        create_supported_file(&import_dir.join("Bank Statement Jan.pdf"));
        create_supported_file(&import_dir.join("Receipt 001.jpg"));
        create_supported_file(&import_dir.join("1099-NEC.pdf"));

        let first_result = import_single_folder(&state, &clients_dir, &import_dir);
        let client = first_result.created[0].client.clone();

        let resync_result =
            resync_client_folder_impl(&client.id, &clients_dir, None, &state).unwrap();

        assert_eq!(resync_result.scanned_document_count, 5);
        assert_eq!(resync_result.imported_document_count, 0);
        assert_eq!(resync_result.duplicate_document_count, 5);

        let client_db = client_db(&state, &clients_dir, &client.id);
        let documents: Vec<(String, String, Option<String>)> = client_db
            .conn()
            .prepare("SELECT file_name, category, file_hash FROM documents ORDER BY file_name")
            .unwrap()
            .query_map([], |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)))
            .unwrap()
            .map(|row| row.unwrap())
            .collect();

        assert_eq!(documents.len(), 5);
        assert!(documents
            .iter()
            .all(|(_, _, file_hash)| file_hash.is_some()));
        assert_eq!(
            documents
                .iter()
                .map(|(file_name, category, _)| (file_name.clone(), category.clone()))
                .collect::<Vec<_>>(),
            vec![
                ("1099-NEC.pdf".to_string(), "1099".to_string()),
                ("2024 Organizer.pdf".to_string(), "organizer".to_string()),
                ("2024 W-2.pdf".to_string(), "w2".to_string()),
                (
                    "Bank Statement Jan.pdf".to_string(),
                    "bank_statement".to_string()
                ),
                ("Receipt 001.jpg".to_string(), "receipt".to_string()),
            ]
        );
    }
}
