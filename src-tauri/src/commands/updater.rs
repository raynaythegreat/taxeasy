use serde::{Deserialize, Serialize};
use std::env::consts;
use tauri::Emitter;
use tauri_plugin_updater::UpdaterExt;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct GithubRelease {
    tag_name: String,
    name: String,
    html_url: String,
    body: Option<String>,
    published_at: String,
    assets: Vec<GithubAsset>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct GithubAsset {
    name: String,
    browser_download_url: String,
    size: u64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct UpdateCheck {
    has_update: bool,
    current_version: String,
    latest_version: String,
    release_url: String,
    release_notes: Option<String>,
    published_at: String,
    download_url: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct UpdateProgress {
    status: String,
    downloaded: u64,
    content_length: u64,
}

fn current_version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}

fn platform_asset_pattern() -> &'static str {
    match (consts::OS, consts::ARCH) {
        ("macos", "x86_64") => "x64.dmg",
        ("macos", "aarch64") => "aarch64.dmg",
        ("macos", _) => ".dmg",
        ("windows", _) => ".msi",
        ("linux", _) => ".AppImage",
        _ => "",
    }
}

/// Check for updates using GitHub API
#[tauri::command(rename_all = "camelCase")]
pub async fn check_for_updates(_app: tauri::AppHandle) -> Result<UpdateCheck, String> {
    let client = reqwest::Client::builder()
        .user_agent("Taxeasy-Update-Checker")
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .map_err(|e| e.to_string())?;

    let resp = client
        .get("https://api.github.com/repos/raynaythegreat/taxeasy/releases/latest")
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !resp.status().is_success() {
        return Ok(UpdateCheck {
            has_update: false,
            current_version: current_version(),
            latest_version: current_version(),
            release_url: "https://github.com/raynaythegreat/taxeasy/releases".to_string(),
            release_notes: None,
            published_at: String::new(),
            download_url: None,
        });
    }

    let release: GithubRelease = resp.json().await.map_err(|e| e.to_string())?;

    let latest = release.tag_name.trim_start_matches('v').to_string();
    let current = current_version();

    let has_update = latest != current;

    let pattern = platform_asset_pattern();
    let download_url = release
        .assets
        .iter()
        .find(|a| a.name.contains(pattern))
        .map(|a| a.browser_download_url.clone());

    Ok(UpdateCheck {
        has_update,
        current_version: current,
        latest_version: latest,
        release_url: release.html_url,
        release_notes: release.body,
        published_at: release.published_at,
        download_url,
    })
}

/// Download update with progress events
#[tauri::command(rename_all = "camelCase")]
pub async fn download_update(app: tauri::AppHandle) -> Result<(), String> {
    let updater = app.updater().map_err(|e| e.to_string())?;

    let update = updater.check().await.map_err(|e| e.to_string())?;

    if let Some(update) = update {
        let app_clone = app.clone();

        update
            .download_and_install(
                move |chunk_length, content_length| {
                    // Emit progress event to frontend
                    let _ = app_clone.emit(
                        "updater://progress",
                        UpdateProgress {
                            status: "downloading".to_string(),
                            downloaded: chunk_length as u64,
                            content_length: content_length.unwrap_or(0),
                        },
                    );
                },
                || {
                    let _ = app.emit(
                        "updater://progress",
                        UpdateProgress {
                            status: "installing".to_string(),
                            downloaded: 0,
                            content_length: 0,
                        },
                    );
                },
            )
            .await
            .map_err(|e| e.to_string())?;

        Ok(())
    } else {
        Err("No update available".to_string())
    }
}

/// Trigger app restart to complete update installation
#[tauri::command(rename_all = "camelCase")]
pub fn install_update(app: tauri::AppHandle) -> Result<(), String> {
    // The update is already installed after download_and_install
    // Just need to restart the app
    app.restart();
    // restart() never returns normally, but we need to satisfy the type system
    #[allow(unreachable_code)]
    Ok(())
}

#[tauri::command(rename_all = "camelCase")]
pub fn get_app_version() -> String {
    current_version()
}
