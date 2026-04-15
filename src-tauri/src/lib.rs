mod ai;
mod commands;
mod db;
mod domain;
mod error;
mod reports;
mod state;

use state::AppState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .manage(AppState::new())
        .invoke_handler(tauri::generate_handler![
            commands::unlock::ping,
            commands::unlock::unlock_app,
            commands::unlock::lock_app,
            commands::unlock::is_unlocked,
            commands::clients::list_clients,
            commands::clients::create_client,
            commands::clients::switch_client,
            commands::clients::get_active_client_id,
            commands::clients::set_active_client_pref,
            commands::clients::get_active_client_pref,
            commands::clients::update_client,
            commands::clients::archive_client,
            commands::accounts::list_accounts,
            commands::accounts::get_account_balance,
            commands::accounts::create_account,
            commands::accounts::update_account,
            commands::accounts::toggle_account_active,
            commands::transactions::list_transactions,
            commands::transactions::create_transaction,
            commands::transactions::update_transaction,
            commands::transactions::delete_transaction,
            reports::pnl::get_pnl,
            reports::balance_sheet::get_balance_sheet,
            reports::cash_flow::get_cash_flow,
            commands::dashboard::get_dashboard_stats,
            commands::export::export_transactions_csv,
            commands::export::export_report_csv,
            commands::export::save_csv_file,
            commands::backup::backup_database,
            commands::backup::restore_database,
            commands::settings::get_settings,
            commands::settings::save_settings,
            commands::files::list_dir_files,
            ai::ollama::ollama_health,
            ai::ollama::suggest_category,
            ai::ollama::nl_query,
            ai::glmocr::glmocr_available,
            ai::glmocr::glmocr_status,
            ai::glmocr::scan_receipt,
            ai::lmstudio::lmstudio_health,
            ai::lmstudio::lmstudio_list_models,
            ai::lmstudio::ollama_list_models,
            ai::lmstudio::ollama_health_url,
            commands::invoices::list_invoices,
            commands::invoices::get_invoice,
            commands::invoices::create_invoice,
            commands::invoices::update_invoice,
            commands::invoices::delete_invoice,
            commands::invoices::update_invoice_status,
            commands::updater::check_for_updates,
            commands::updater::get_app_version,
            commands::documents::list_documents,
            commands::documents::add_document,
            commands::documents::delete_document,
            commands::documents::update_document,
            commands::client_export::export_client_documents,
            commands::client_export::export_all_clients_documents,
            commands::evidence::store_evidence,
            commands::evidence::get_evidence,
            commands::evidence::list_evidence,
            commands::evidence::delete_evidence,
            commands::drafts::create_draft,
            commands::drafts::update_draft,
            commands::drafts::list_drafts,
            commands::drafts::approve_draft,
            commands::drafts::reject_draft,
            commands::drafts::bulk_approve_drafts,
            commands::drafts::bulk_reject_drafts,
            commands::chat::send_chat_message,
            commands::chat::get_chat_history,
            commands::chat::clear_chat_history,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
