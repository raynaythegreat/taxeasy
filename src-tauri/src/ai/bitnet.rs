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

#[derive(Debug, Serialize, Deserialize)]
pub struct BitNetStatus {
    pub available: bool,
    pub model_name: Option<String>,
    pub url: String,
    pub message: String,
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
pub async fn bitnet_status(url: Option<String>) -> Result<BitNetStatus> {
    let url = url.unwrap_or_else(|| "http://localhost:8090".to_string());

    let client = Client::new();
    let endpoint = format!("{}/v1/models", url.trim_end_matches('/'));

    match client
        .get(&endpoint)
        .timeout(std::time::Duration::from_secs(3))
        .send()
        .await
    {
        Ok(resp) if resp.status().is_success() => {
            let body: ProviderModelsResponse = resp.json().await.unwrap_or(ProviderModelsResponse { data: vec![] });
            let model_name = body.data.first().map(|m| m.id.clone());
            Ok(BitNetStatus {
                available: true,
                model_name,
                url,
                message: "BitNet b1.58 2B-4T is running and ready".to_string(),
            })
        }
        Ok(resp) => Ok(BitNetStatus {
            available: false,
            model_name: None,
            url,
            message: format!("BitNet returned HTTP {}", resp.status()),
        }),
        Err(_) => Ok(BitNetStatus {
            available: false,
            model_name: None,
            url,
            message: "BitNet server is not running. Run: cd ~/bitnet.cpp && source .venv/bin/activate && python3 run_inference_server.py".to_string(),
        }),
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
