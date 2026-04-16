//! Print fallback for macOS.
//!
//! Tauri v2 on macOS uses WKWebView, which does NOT implement `window.print()`.
//! On Windows (WebView2) print works natively; on macOS it silently does nothing.
//!
//! Workaround: write the print-ready HTML to a temp file and open it in the
//! user's default browser (Safari on macOS). The user then presses ⌘-P in
//! the browser — where `window.print()` and the full system print panel work
//! normally. This avoids adding a heavyweight PDF-generation dependency.

use crate::error::{AppError, Result};
use std::io::Write;

#[tauri::command]
pub fn print_html(html: String) -> Result<String> {
    if html.is_empty() {
        return Err(AppError::Validation("empty html".into()));
    }

    let ts = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0);
    let mut path = std::env::temp_dir();
    path.push(format!("taxeasy_print_{ts}.html"));

    let mut f = std::fs::File::create(&path)
        .map_err(|e| AppError::Validation(format!("tempfile create: {e}")))?;
    f.write_all(html.as_bytes())
        .map_err(|e| AppError::Validation(format!("tempfile write: {e}")))?;

    let path_str = path.to_string_lossy().to_string();

    // Open with the system default browser. `open` on macOS, `start` on Windows,
    // `xdg-open` on Linux. Tauri's opener plugin would also work, but a direct
    // Command::spawn avoids an extra IPC round-trip and keeps the body of this
    // helper self-contained.
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(&path)
            .spawn()
            .map_err(|e| AppError::Validation(format!("open: {e}")))?;
    }
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("cmd")
            .args(["/C", "start", "", &path_str])
            .spawn()
            .map_err(|e| AppError::Validation(format!("start: {e}")))?;
    }
    #[cfg(target_os = "linux")]
    {
        std::process::Command::new("xdg-open")
            .arg(&path)
            .spawn()
            .map_err(|e| AppError::Validation(format!("xdg-open: {e}")))?;
    }

    Ok(path_str)
}
