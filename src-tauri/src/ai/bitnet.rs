use reqwest::Client;
use serde::{Deserialize, Serialize};

use crate::error::{AppError, Result};

#[derive(Serialize, Deserialize)]
struct ProviderModel {
    id: String,
}

#[derive(Serialize, Deserialize)]
struct ProviderModelsResponse {
    data: Vec<ProviderModel>,
}

#[tauri::command(rename_all = "camelCase")]
pub async fn bitnet_health(url: String) -> bool {
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
pub async fn bitnet_list_models(url: String) -> Result<Vec<String>> {
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
            "BitNet returned {}",
            resp.status()
        )));
    }

    let body: ProviderModelsResponse = resp
        .json()
        .await
        .map_err(|e| AppError::AiService(e.to_string()))?;

    Ok(body.data.into_iter().map(|m| m.id).collect())
}