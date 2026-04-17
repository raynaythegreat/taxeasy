use serde::{Deserialize, Serialize};
use tauri::Emitter;

use crate::ai::streaming::StreamEvent;
use crate::ai::tools::{parse_tool_calls, ToolCall, ToolCallRecord, ToolResult};
use crate::domain::draft_transaction::DraftTransaction;
use crate::error::{AppError, Result};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentResult {
    pub final_response: String,
    pub drafts: Vec<DraftTransaction>,
    pub tool_calls: Vec<ToolCallRecord>,
}

pub async fn run_agent_loop(
    app_handle: &tauri::AppHandle,
    config: &crate::ai::ollama::AiConfig,
    client_id: &str,
    user_message: &str,
    context: &str,
    history: &[crate::domain::chat_message::ChatMessage],
    conversation_id: &str,
    execute_tool_fn: &(dyn Fn(&ToolCall) -> Result<ToolResult> + Send + Sync),
) -> Result<AgentResult> {
    let message_id = uuid::Uuid::new_v4().to_string();

    let start_event = StreamEvent::Start {
        conversation_id: conversation_id.to_owned(),
        message_id: message_id.clone(),
    };
    let _ = app_handle.emit("chat-stream", &start_event);

    let system_prompt = crate::ai::chat::chat_system_prompt_with_tools();
    let mut prompt = format!(
        "{}\n\nClient Data:\n{}\n\nChat History:\n",
        system_prompt, context
    );
    for msg in history {
        prompt.push_str(&format!("{}: {}\n", msg.role, msg.content));
    }
    prompt.push_str(&format!("\nUser: {}", user_message));

    let mut accumulated_response = String::new();
    let mut all_tool_calls: Vec<ToolCallRecord> = Vec::new();
    let mut all_drafts: Vec<DraftTransaction> = Vec::new();
    let max_iterations = 5;

    for _ in 0..max_iterations {
        let response = stream_completion(app_handle, config, &prompt, conversation_id).await?;

        accumulated_response = response.clone();

        let tool_calls = parse_tool_calls(&response);

        if tool_calls.is_empty() {
            break;
        }

        for tool_call in &tool_calls {
            let tool_call_event = StreamEvent::ToolCall {
                conversation_id: conversation_id.to_owned(),
                message_id: message_id.clone(),
                tool_name: tool_call.name.clone(),
                tool_input: tool_call.input.clone(),
                status: "executing".into(),
            };
            let _ = app_handle.emit("chat-stream", &tool_call_event);

            let progress_event = StreamEvent::ToolProgress {
                conversation_id: conversation_id.to_owned(),
                tool_name: tool_call.name.clone(),
                progress: format!("Executing {}...", tool_call.name),
            };
            let _ = app_handle.emit("chat-stream", &progress_event);

            let result = execute_tool_fn(tool_call)?;

            if result.name == "create_transaction" && result.status == "success" {
                if let Some(draft_id) = result.output.get("draft_id").and_then(|v| v.as_str()) {
                    all_drafts.push(DraftTransaction {
                        id: draft_id.to_owned(),
                        client_id: client_id.to_owned(),
                        evidence_id: String::new(),
                        date: result.output.get("date").and_then(|v| v.as_str()).map(|s| s.to_owned()),
                        description: result.output.get("description").and_then(|v| v.as_str()).map(|s| s.to_owned()),
                        reference: None,
                        debit_account_id: None,
                        credit_account_id: None,
                        amount: result.output.get("amount").and_then(|v| v.as_i64()),
                        notes: None,
                        status: "pending".to_owned(),
                        created_at: chrono::Utc::now().to_rfc3339(),
                        updated_at: chrono::Utc::now().to_rfc3339(),
                    });
                }
            }

            let tool_result_event = StreamEvent::ToolResult {
                conversation_id: conversation_id.to_owned(),
                tool_name: result.name.clone(),
                result: result.output.clone(),
            };
            let _ = app_handle.emit("chat-stream", &tool_result_event);

            all_tool_calls.push(ToolCallRecord {
                tool_name: tool_call.name.clone(),
                tool_input: tool_call.input.clone(),
                tool_output: result.output.clone(),
                status: result.status.clone(),
            });

            let result_str = serde_json::to_string_pretty(&result.output).unwrap_or_default();
            prompt.push_str(&format!(
                "\n\n[Tool Result for {}]:\n{}\n\nContinue responding based on the tool result. If you need to call another tool, use the [TOOL_CALL] format. Otherwise, provide your final response to the user.",
                tool_call.name, result_str
            ));
        }
    }

    let end_event = StreamEvent::End {
        conversation_id: conversation_id.to_owned(),
    };
    let _ = app_handle.emit("chat-stream", &end_event);

    Ok(AgentResult {
        final_response: accumulated_response,
        drafts: all_drafts,
        tool_calls: all_tool_calls,
    })
}

async fn stream_completion(
    app_handle: &tauri::AppHandle,
    config: &crate::ai::ollama::AiConfig,
    prompt: &str,
    conversation_id: &str,
) -> Result<String> {
    match config.provider.as_str() {
        "lmstudio" => {
            let model = if config.lm_studio_model.is_empty() {
                return Err(AppError::AiService("No LM Studio model selected".into()));
            } else {
                &config.lm_studio_model
            };
            crate::ai::streaming::lmstudio_stream_complete(
                app_handle,
                &config.lm_studio_url,
                model,
                prompt,
                conversation_id,
            )
            .await
        }
        _ => {
            let model = crate::ai::ollama::resolve_ollama_chat_model(
                &config.ollama_url,
                &config.ollama_model,
            )
            .await?;
            crate::ai::streaming::ollama_stream_complete(
                app_handle,
                &config.ollama_url,
                &model,
                prompt,
                conversation_id,
            )
            .await
        }
    }
}
