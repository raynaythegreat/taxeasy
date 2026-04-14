use reqwest::Client;
use serde::{Deserialize, Serialize};

use crate::error::{AppError, Result};

#[derive(Serialize, Deserialize)]
struct LmStudioModel {
    id: String,
}

#[derive(Serialize, Deserialize)]
struct LmStudioModelsResponse {
    data: Vec<LmStudioModel>,
}

#[tauri::command(rename_all = "camelCase")]
pub async fn lmstudio_health(url: String) -> bool {
    let client = Client::new();
    let endpoint = format!("{}/v1/models", url.trim_end_matches('/'));
    match client
        .get(&endpoint)
        .timeout(std::time::Duration::from_secs(3))
        .send()
        .await
    {
        Ok(resp) => resp.status().is_success(),
        Err(_) => false,
    }
}

#[tauri::command(rename_all = "camelCase")]
pub async fn lmstudio_list_models(url: String) -> Result<Vec<String>> {
    let client = Client::new();
    let endpoint = format!("{}/v1/models", url.trim_end_matches('/'));
    let resp = client
        .get(&endpoint)
        .timeout(std::time::Duration::from_secs(5))
        .send()
        .await
        .map_err(|e| AppError::AiService(e.to_string()))?;

    if !resp.status().is_success() {
        return Err(AppError::AiService(format!(
            "LM Studio returned {}",
            resp.status()
        )));
    }

    let body: LmStudioModelsResponse = resp
        .json()
        .await
        .map_err(|e| AppError::AiService(e.to_string()))?;

    Ok(body.data.into_iter().map(|m| m.id).collect())
}

#[tauri::command(rename_all = "camelCase")]
pub async fn ollama_list_models(url: String) -> Result<Vec<String>> {
    let client = Client::new();
    let endpoint = format!("{}/api/tags", url.trim_end_matches('/'));
    let resp = client
        .get(&endpoint)
        .timeout(std::time::Duration::from_secs(5))
        .send()
        .await
        .map_err(|e| AppError::AiService(e.to_string()))?;

    if !resp.status().is_success() {
        return Err(AppError::AiService(format!(
            "Ollama returned {}",
            resp.status()
        )));
    }

    #[derive(Deserialize)]
    struct ModelEntry {
        name: String,
    }
    #[derive(Deserialize)]
    struct TagsResponse {
        models: Vec<ModelEntry>,
    }

    let body: TagsResponse = resp
        .json()
        .await
        .map_err(|e| AppError::AiService(e.to_string()))?;

    Ok(body.models.into_iter().map(|m| m.name).collect())
}

#[tauri::command(rename_all = "camelCase")]
pub async fn ollama_health_url(url: String) -> bool {
    let client = Client::new();
    let endpoint = format!("{}/api/tags", url.trim_end_matches('/'));
    match client
        .get(&endpoint)
        .timeout(std::time::Duration::from_secs(3))
        .send()
        .await
    {
        Ok(resp) => resp.status().is_success(),
        Err(_) => false,
    }
}

pub async fn lmstudio_complete(url: &str, model: &str, prompt: &str) -> Result<String> {
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
    struct ChatChoice {
        message: ChoiceMessage,
    }
    #[derive(Deserialize)]
    struct ChoiceMessage {
        content: String,
    }
    #[derive(Deserialize)]
    struct ChatResponse {
        choices: Vec<ChatChoice>,
    }

    let body = ChatRequest {
        model: model.to_owned(),
        messages: vec![Message {
            role: "user".into(),
            content: prompt.into(),
        }],
        temperature: 0.3,
        stream: false,
    };

    let resp = client
        .post(&endpoint)
        .json(&body)
        .timeout(std::time::Duration::from_secs(60))
        .send()
        .await
        .map_err(|e| AppError::AiService(e.to_string()))?;

    if !resp.status().is_success() {
        return Err(AppError::AiService(format!(
            "LM Studio returned {}",
            resp.status()
        )));
    }

    let chat: ChatResponse = resp
        .json()
        .await
        .map_err(|e| AppError::AiService(e.to_string()))?;

    Ok(chat
        .choices
        .first()
        .map(|c| c.message.content.trim().to_owned())
        .unwrap_or_default())
}
