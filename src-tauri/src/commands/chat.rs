use serde::{Deserialize, Serialize};

use crate::domain::chat_message::ChatMessage;
use crate::domain::draft_transaction::DraftTransaction;
use crate::error::{AppError, Result};
use crate::state::AppState;

#[derive(Debug, Serialize, Deserialize)]
pub struct ChatResponse {
    pub message: ChatMessage,
    pub drafts: Vec<DraftTransaction>,
}

/// Helper: get a connection for either owner or a client.
fn with_chat_conn<T>(
    state: &AppState,
    app_handle: Option<&tauri::AppHandle>,
    client_id: &str,
    f: impl FnOnce(&rusqlite::Connection) -> Result<T>,
) -> Result<T> {
    if client_id == "owner" {
        crate::commands::scoped::with_scoped_conn(state, app_handle, Some("owner"), f)
    } else {
        crate::commands::scoped::with_scoped_conn(state, app_handle, Some(client_id), f)
    }
}

#[tauri::command(rename_all = "camelCase")]
pub async fn send_chat_message(
    app_handle: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    client_id: String,
    message: String,
) -> Result<ChatResponse> {
    let (user_message, context, history) = with_chat_conn(
        &state,
        Some(&app_handle),
        &client_id,
        |conn| {
            let user_msg =
                crate::db::chat_db::insert_message(conn, &client_id, "user", &message, None)?;
            let ctx = crate::ai::chat::build_chat_context(conn, &client_id);
            let hist = crate::db::chat_db::get_history(conn, &client_id)?;
            Ok((user_msg, ctx, hist))
        },
    )?;

    let config = crate::ai::ollama::read_ai_config(&state);

    let system_prompt = crate::ai::chat::chat_system_prompt();
    let mut full_prompt = format!(
        "{}\n\nClient Data:\n{}\n\nChat History:\n",
        system_prompt, context
    );
    for msg in &history {
        full_prompt.push_str(&format!("{}: {}\n", msg.role, msg.content));
    }
    full_prompt.push_str(&format!("\nUser: {}", message));

    let raw_response = crate::ai::ollama::ai_complete(&config, &full_prompt).await?;

    let mut drafts: Vec<DraftTransaction> = Vec::new();
    if let Some(json_start) = raw_response.find("```json") {
        let json_str = &raw_response[json_start + 7..];
        if let Some(json_end) = json_str.find("```") {
            let json_block = json_str[..json_end].trim();
            if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(json_block) {
                if let Some(txns) = parsed["transactions"].as_array() {
                    let _ = with_chat_conn(&state, Some(&app_handle), &client_id, |conn| {
                        for txn in txns {
                            let date = txn["date"].as_str();
                            let desc = txn["description"].as_str();
                            let amount = txn["amount"].as_i64();
                            let debit_acct = txn["debit_account"].as_str();
                            let credit_acct = txn["credit_account"].as_str();

                            if let Ok(draft) = crate::db::draft_db::insert_draft(
                                conn,
                                &client_id,
                                None,
                                date,
                                desc,
                                None,
                                debit_acct,
                                credit_acct,
                                amount,
                                None,
                            ) {
                                drafts.push(draft);
                            }
                        }
                        Ok::<_, AppError>(())
                    });
                }
            }
        }
    }

    let assistant_msg = with_chat_conn(
        &state,
        Some(&app_handle),
        &client_id,
        |conn| {
            crate::db::chat_db::insert_message(conn, &client_id, "assistant", &raw_response, None)
        },
    )?;

    // Remove the duplicate user message that was auto-inserted above so
    // we only keep the one wrapped with the assistant reply.
    let _ = with_chat_conn(&state, Some(&app_handle), &client_id, |conn| {
        conn.execute(
            "DELETE FROM chat_messages WHERE id = ?1 AND role = 'user' AND content = ?2",
            rusqlite::params![user_message.id, message],
        )?;
        Ok::<_, AppError>(())
    });

    Ok(ChatResponse {
        message: assistant_msg,
        drafts,
    })
}

#[tauri::command(rename_all = "camelCase")]
pub async fn send_chat_message_stream(
    app_handle: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    client_id: String,
    message: String,
) -> Result<String> {
    let (context, history) = with_chat_conn(
        &state,
        Some(&app_handle),
        &client_id,
        |conn| {
            crate::db::chat_db::insert_message(conn, &client_id, "user", &message, None)?;
            let ctx = crate::ai::chat::build_chat_context(conn, &client_id);
            let hist = crate::db::chat_db::get_history(conn, &client_id)?;
            Ok((ctx, hist))
        },
    )?;

    let config = crate::ai::ollama::read_ai_config(&state);
    let conversation_id = uuid::Uuid::new_v4().to_string();

    let app_state: &AppState = state.inner();
    let cid = client_id.clone();

    let agent_result = crate::ai::agent::run_agent_loop(
        &app_handle,
        &config,
        &client_id,
        &message,
        &context,
        &history,
        &conversation_id,
        &|tool_call: &crate::ai::tools::ToolCall| -> Result<crate::ai::tools::ToolResult> {
            with_chat_conn(app_state, Some(&app_handle), &cid, |conn| {
                crate::ai::tools::execute_tool(conn, &cid, tool_call)
            })
        },
    )
    .await?;

    let tool_metadata: Vec<serde_json::Value> = agent_result
        .tool_calls
        .iter()
        .map(|tc| {
            serde_json::json!({
                "tool_name": tc.tool_name,
                "tool_input": tc.tool_input,
                "tool_output": tc.tool_output,
                "status": tc.status,
            })
        })
        .collect();

    let metadata = if tool_metadata.is_empty() {
        None
    } else {
        Some(serde_json::to_string(&tool_metadata).unwrap_or_default())
    };

    with_chat_conn(&state, Some(&app_handle), &client_id, |conn| {
        crate::db::chat_db::insert_message_with_tools(
            conn,
            &client_id,
            "assistant",
            &agent_result.final_response,
            None,
            None,
            None,
            None,
            None,
            None,
            metadata.as_deref(),
        )
    })?;

    Ok(conversation_id)
}

#[tauri::command(rename_all = "camelCase")]
pub fn get_chat_history(
    app_handle: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    client_id: String,
) -> Result<Vec<ChatMessage>> {
    with_chat_conn(&state, Some(&app_handle), &client_id, |conn| {
        crate::db::chat_db::get_history(conn, &client_id)
    })
}

#[tauri::command(rename_all = "camelCase")]
pub fn clear_chat_history(
    app_handle: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    client_id: String,
) -> Result<()> {
    with_chat_conn(&state, Some(&app_handle), &client_id, |conn| {
        crate::db::chat_db::clear_history(conn, &client_id)
    })
}
