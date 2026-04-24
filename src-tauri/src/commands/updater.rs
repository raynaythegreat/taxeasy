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
pub struct GithubCommit {
    sha: String,
    html_url: String,
    commit: GithubCommitInfo,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct GithubCommitInfo {
    message: String,
    author: GithubCommitAuthor,
    committer: GithubCommitAuthor,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct GithubCommitAuthor {
    name: String,
    email: String,
    date: String,
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
    // Commit-based update detection
    is_behind_on_commits: bool,
    latest_commit_sha: Option<String>,
    local_commit_sha: Option<String>,
    commits_behind: u32,
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

fn current_commit_sha() -> Option<String> {
    // This is set at build time via build.rs
    option_env!("GIT_COMMIT_SHA").map(String::from)
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

/// Check for updates using GitHub API (releases + commits)
#[tauri::command(rename_all = "camelCase")]
pub async fn check_for_updates(_app: tauri::AppHandle) -> Result<UpdateCheck, String> {
    let client = reqwest::Client::builder()
        .user_agent("Taxeasy-Update-Checker")
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .map_err(|e| e.to_string())?;

    let local_commit = current_commit_sha();

    // Check latest release
    let release_resp = client
        .get("https://api.github.com/repos/raynaythegreat/taxeasy/releases/latest")
        .send()
        .await
        .map_err(|e| e.to_string())?;

    let (
        has_release_update,
        latest_version,
        release_url,
        release_notes,
        published_at,
        download_url,
    ) = if release_resp.status().is_success() {
        let release: GithubRelease = release_resp.json().await.map_err(|e| e.to_string())?;
        let latest = release.tag_name.trim_start_matches('v').to_string();
        let pattern = platform_asset_pattern();
        let dl_url = release
            .assets
            .iter()
            .find(|a| a.name.contains(pattern))
            .map(|a| a.browser_download_url.clone());
        (
            latest != current_version(),
            latest,
            release.html_url,
            release.body,
            release.published_at,
            dl_url,
        )
    } else {
        (
            false,
            current_version(),
            String::new(),
            None,
            String::new(),
            None,
        )
    };

    // Check commits behind on main branch
    let commits_resp = client
        .get("https://api.github.com/repos/raynaythegreat/taxeasy/commits")
        .query(&[("sha", "main"), ("per_page", "1")])
        .send()
        .await
        .map_err(|e| e.to_string())?;

    let (is_behind_on_commits, latest_commit_sha, commits_behind) =
        if commits_resp.status().is_success() {
            let commits: Vec<GithubCommit> =
                commits_resp.json().await.map_err(|e| e.to_string())?;
            if let Some(latest) = commits.first() {
                let is_behind = Some(&latest.sha) != local_commit.as_ref();
                (
                    is_behind,
                    Some(latest.sha.clone()),
                    if is_behind { 1 } else { 0 },
                )
            } else {
                (false, None, 0)
            }
        } else {
            (false, None, 0)
        };

    let has_update = has_release_update || is_behind_on_commits;

    Ok(UpdateCheck {
        has_update,
        current_version: current_version(),
        latest_version,
        release_url,
        release_notes,
        published_at,
        download_url,
        is_behind_on_commits,
        latest_commit_sha,
        local_commit_sha: local_commit,
        commits_behind,
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

fn find_git_repo() -> Result<std::path::PathBuf, String> {
    let exe = std::env::current_exe().map_err(|e| format!("Cannot find executable path: {}", e))?;
    let mut dir = exe.parent().ok_or("Executable has no parent directory")?;
    loop {
        if dir.join(".git").exists() {
            return Ok(dir.to_path_buf());
        }
        dir = match dir.parent() {
            Some(p) => p,
            None => {
                return Err(
                    "No git repository found. Pull is only available in dev builds. Use release updates instead.".to_string()
                );
            }
        };
    }
}

#[tauri::command(rename_all = "camelCase")]
pub async fn pull_latest_commits(app: tauri::AppHandle) -> Result<String, String> {
    use std::process::Command;

    let repo_dir = find_git_repo()?;

    let _ = app.emit(
        "updater://progress",
        UpdateProgress {
            status: "pulling".to_string(),
            downloaded: 0,
            content_length: 0,
        },
    );

    let output = Command::new("git")
        .args(["fetch", "origin", "main"])
        .current_dir(&repo_dir)
        .output()
        .map_err(|e| format!("Failed to execute git fetch: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Git fetch failed: {}", stderr));
    }

    let reset_output = Command::new("git")
        .args(["reset", "--hard", "origin/main"])
        .current_dir(&repo_dir)
        .output()
        .map_err(|e| format!("Failed to execute git reset: {}", e))?;

    if !reset_output.status.success() {
        let stderr = String::from_utf8_lossy(&reset_output.stderr);
        return Err(format!("Git reset failed: {}", stderr));
    }

    let stdout = String::from_utf8_lossy(&reset_output.stdout);

    let _ = app.emit(
        "updater://progress",
        UpdateProgress {
            status: "ready".to_string(),
            downloaded: 0,
            content_length: 0,
        },
    );

    Ok(format!(
        "Successfully pulled latest changes:\n{}\nRepo: {}",
        stdout,
        repo_dir.display()
    ))
}

#[tauri::command(rename_all = "camelCase")]
pub async fn rebuild_and_restart(app: tauri::AppHandle) -> Result<String, String> {
    use std::process::Command;

    let repo_dir = find_git_repo()?;

    let _ = app.emit(
        "updater://progress",
        UpdateProgress {
            status: "installing".to_string(),
            downloaded: 0,
            content_length: 0,
        },
    );

    let npm_output = Command::new("npm")
        .args(["run", "build"])
        .current_dir(&repo_dir)
        .output()
        .map_err(|e| format!("Failed to run npm build: {}", e))?;

    if !npm_output.status.success() {
        let stderr = String::from_utf8_lossy(&npm_output.stderr);
        return Err(format!("Frontend build failed: {}", stderr));
    }

    let frontend_out = String::from_utf8_lossy(&npm_output.stdout);

    let _ = app.emit(
        "updater://progress",
        UpdateProgress {
            status: "ready".to_string(),
            downloaded: 0,
            content_length: 0,
        },
    );

    Ok(format!(
        "Rebuild complete:\n{}\nApp needs restart to apply changes.",
        frontend_out
    ))
}
