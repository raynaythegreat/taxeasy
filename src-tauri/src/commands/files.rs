use std::path::{Path, PathBuf};

use crate::error::Result;

const SCANNABLE_EXTENSIONS: &[&str] = &[
    "jpg", "jpeg", "png", "webp", "heic", "heif", "tiff", "tif", "bmp", "gif", "pdf", "csv", "txt",
    "xlsx", "xls", "doc", "docx", "zip",
];

/// Expand a path into a list of scannable file paths.
/// If `path` is a file with a supported extension, returns `[path]`.
/// If `path` is a directory, returns all scannable files inside (one level deep, sorted).
/// Returns an empty list for unsupported file types or missing paths.
#[tauri::command(rename_all = "camelCase")]
pub fn list_dir_files(path: String) -> Result<Vec<String>> {
    let p = std::path::Path::new(&path);

    if p.is_file() {
        if has_scannable_ext(p) {
            return Ok(vec![path]);
        }
        return Ok(vec![]);
    }

    if !p.is_dir() {
        return Ok(vec![]);
    }

    let mut files: Vec<String> = std::fs::read_dir(p)?
        .flatten()
        .filter_map(|entry| {
            let ep = entry.path();
            if ep.is_file() && has_scannable_ext(&ep) {
                ep.to_str().map(str::to_owned)
            } else {
                None
            }
        })
        .collect();

    files.sort();
    Ok(files)
}

pub(crate) fn list_scannable_files_recursive(path: &Path) -> Result<Vec<PathBuf>> {
    let mut files = Vec::new();

    if !path.exists() {
        return Ok(files);
    }

    collect_scannable_files(path, &mut files)?;
    files.sort();
    Ok(files)
}

pub(crate) fn guess_mime_type(path: &Path) -> &'static str {
    match path
        .extension()
        .and_then(|ext| ext.to_str())
        .map(|ext| ext.to_ascii_lowercase())
        .as_deref()
    {
        Some("pdf") => "application/pdf",
        Some("csv") => "text/csv",
        Some("txt") => "text/plain",
        Some("xlsx") => "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        Some("xls") => "application/vnd.ms-excel",
        Some("doc") => "application/msword",
        Some("docx") => "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        Some("zip") => "application/zip",
        Some("jpg") | Some("jpeg") => "image/jpeg",
        Some("png") => "image/png",
        Some("webp") => "image/webp",
        Some("heic") => "image/heic",
        Some("heif") => "image/heif",
        Some("tiff") | Some("tif") => "image/tiff",
        Some("bmp") => "image/bmp",
        Some("gif") => "image/gif",
        _ => "application/octet-stream",
    }
}

pub(crate) fn has_scannable_ext(p: &Path) -> bool {
    p.extension()
        .and_then(|e| e.to_str())
        .map(|e| SCANNABLE_EXTENSIONS.contains(&e.to_lowercase().as_str()))
        .unwrap_or(false)
}

fn collect_scannable_files(path: &Path, files: &mut Vec<PathBuf>) -> Result<()> {
    if path.is_file() {
        if has_scannable_ext(path) {
            files.push(path.to_path_buf());
        }
        return Ok(());
    }

    if !path.is_dir() {
        return Ok(());
    }

    for entry in std::fs::read_dir(path)? {
        let entry = entry?;
        let entry_path = entry.path();
        if entry_path.is_dir() {
            collect_scannable_files(&entry_path, files)?;
        } else if has_scannable_ext(&entry_path) {
            files.push(entry_path);
        }
    }

    Ok(())
}
