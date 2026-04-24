use futures_util::StreamExt;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use tauri::Emitter;

use crate::error::{AppError, Result};

#[derive(Debug, Clone, Serialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum StreamEvent {
    Start {
        conversation_id: String,
        message_id: String,
    },
    Delta {
        conversation_id: String,
        delta: String,
    },
    ToolCall {
        conversation_id: String,
        message_id: String,
        tool_name: String,
        tool_input: serde_json::Value,
        status: String,
    },
    ToolProgress {
        conversation_id: String,
        tool_name: String,
        progress: String,
    },
    ToolResult {
        conversation_id: String,
        tool_name: String,
        result: serde_json::Value,
    },
    End {
        conversation_id: String,
    },
    Error {
        conversation_id: String,
        error: String,
    },
}

pub async fn ollama_stream_complete(
    app_handle: &tauri::AppHandle,
    url: &str,
    model: &str,
    prompt: &str,
    conversation_id: &str,
) -> Result<String> {
    let client = Client::new();

    #[derive(Serialize)]
    struct GenerateRequest<'a> {
        model: &'a str,
        prompt: &'a str,
        stream: bool,
    }

    #[derive(Deserialize)]
    struct GenerateChunk {
        response: Option<String>,
        done: bool,
    }

    let body = GenerateRequest {
        model,
        prompt,
        stream: true,
    };

    let resp = client
        .post(format!("{}/api/generate", url.trim_end_matches('/')))
        .json(&body)
        .timeout(std::time::Duration::from_secs(120))
        .send()
        .await
        .map_err(|e| AppError::AiService(e.to_string()))?;

    if !resp.status().is_success() {
        return Err(AppError::AiService(format!(
            "Ollama returned {}",
            resp.status()
        )));
    }

    let mut accumulated = String::new();
    let mut stream = resp.bytes_stream();

    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| AppError::AiService(e.to_string()))?;
        let text = String::from_utf8_lossy(&chunk);

        for line in text.lines() {
            let line = line.trim();
            if line.is_empty() {
                continue;
            }

            if let Ok(parsed) = serde_json::from_str::<GenerateChunk>(line) {
                if let Some(delta) = parsed.response {
                    if !delta.is_empty() {
                        accumulated.push_str(&delta);
                        let event = StreamEvent::Delta {
                            conversation_id: conversation_id.to_owned(),
                            delta,
                        };
                        let _ = app_handle.emit("chat-stream", &event);
                    }
                }
            }
        }
    }

    Ok(accumulated)
}

pub async fn lmstudio_stream_complete(
    app_handle: &tauri::AppHandle,
    url: &str,
    model: &str,
    prompt: &str,
    conversation_id: &str,
) -> Result<String> {
    let client = Client::new();
    let endpoint = format!("{}/v1/chat/completions", url.trim_end_matches('/'));

    #[derive(Serialize)]
    struct Message {
        role: String,
        content: String,
    }

    #[derive(Serialize)]
    struct ChatRequest {
        model: String,
        messages: Vec<Message>,
        temperature: f32,
        stream: bool,
    }

    #[derive(Deserialize)]
    struct StreamDelta {
        content: Option<String>,
    }

    #[derive(Deserialize)]
    struct StreamChoice {
        delta: StreamDelta,
    }

    #[derive(Deserialize)]
    struct StreamChunk {
        choices: Vec<StreamChoice>,
    }

    let body = ChatRequest {
        model: model.to_owned(),
        messages: vec![Message {
            role: "user".into(),
            content: prompt.into(),
        }],
        temperature: 0.3,
        stream: true,
    };

    let resp = client
        .post(&endpoint)
        .json(&body)
        .timeout(std::time::Duration::from_secs(120))
        .send()
        .await
        .map_err(|e| AppError::AiService(e.to_string()))?;

    if !resp.status().is_success() {
        return Err(AppError::AiService(format!(
            "LM Studio returned {}",
            resp.status()
        )));
    }

    let mut accumulated = String::new();
    let mut stream = resp.bytes_stream();
    let mut buffer = String::new();

    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| AppError::AiService(e.to_string()))?;
        buffer.push_str(&String::from_utf8_lossy(&chunk));

        while let Some(pos) = buffer.find("\n\n") {
            let block = buffer[..pos].to_owned();
            buffer = buffer[pos + 2..].to_owned();

            for line in block.lines() {
                let line = line.trim();
                if !line.starts_with("data: ") {
                    continue;
                }
                let data = &line[6..];
                if data == "[DONE]" {
                    continue;
                }

                if let Ok(parsed) = serde_json::from_str::<StreamChunk>(data) {
                    if let Some(choice) = parsed.choices.first() {
                        if let Some(ref content) = choice.delta.content {
                            if !content.is_empty() {
                                accumulated.push_str(content);
                                let event = StreamEvent::Delta {
                                    conversation_id: conversation_id.to_owned(),
                                    delta: content.clone(),
                                };
                                let _ = app_handle.emit("chat-stream", &event);
                            }
                        }
                    }
                }
            }
        }
    }

    Ok(accumulated)
}

pub async fn bonsai_bitnet_stream_complete(
    app_handle: &tauri::AppHandle,
    url: &str,
    model: &str,
    prompt: &str,
    conversation_id: &str,
) -> Result<String> {
    let client = Client::new();
    let endpoint = format!("{}/v1/chat/completions", url.trim_end_matches('/'));

    #[derive(Serialize)]
    struct Message {
        role: String,
        content: String,
    }

    #[derive(Serialize)]
    struct ChatRequest {
        model: String,
        messages: Vec<Message>,
        temperature: f32,
        stream: bool,
    }

    #[derive(Deserialize)]
    struct StreamDelta {
        content: Option<String>,
    }

    #[derive(Deserialize)]
    struct StreamChoice {
        delta: StreamDelta,
    }

    #[derive(Deserialize)]
    struct StreamChunk {
        choices: Vec<StreamChoice>,
    }

    let body = ChatRequest {
        model: model.to_owned(),
        messages: vec![Message {
            role: "user".into(),
            content: prompt.into(),
        }],
        temperature: 0.3,
        stream: true,
    };

    let resp = client
        .post(&endpoint)
        .json(&body)
        .timeout(std::time::Duration::from_secs(120))
        .send()
        .await
        .map_err(|e| AppError::AiService(e.to_string()))?;

    if !resp.status().is_success() {
        return Err(AppError::AiService(format!(
            "Provider returned {}",
            resp.status()
        )));
    }

    let mut accumulated = String::new();
    let mut stream = resp.bytes_stream();
    let mut buffer = String::new();

    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| AppError::AiService(e.to_string()))?;
        buffer.push_str(&String::from_utf8_lossy(&chunk));

        while let Some(pos) = buffer.find("\n\n") {
            let block = buffer[..pos].to_owned();
            buffer = buffer[pos + 2..].to_owned();

            for line in block.lines() {
                let line = line.trim();
                if !line.starts_with("data: ") {
                    continue;
                }
                let data = &line[6..];
                if data == "[DONE]" {
                    continue;
                }

                if let Ok(parsed) = serde_json::from_str::<StreamChunk>(data) {
                    if let Some(choice) = parsed.choices.first() {
                        if let Some(ref content) = choice.delta.content {
                            if !content.is_empty() {
                                accumulated.push_str(content);
                                let event = StreamEvent::Delta {
                                    conversation_id: conversation_id.to_owned(),
                                    delta: content.clone(),
                                };
                                let _ = app_handle.emit("chat-stream", &event);
                            }
                        }
                    }
                }
            }
        }
    }

    Ok(accumulated)
}
