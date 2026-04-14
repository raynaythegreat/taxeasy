use crate::error::Result;

const SCANNABLE_EXTENSIONS: &[&str] = &[
    "jpg", "jpeg", "png", "webp", "heic", "heif", "tiff", "tif", "bmp", "gif",
    "pdf", "csv", "txt",
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

fn has_scannable_ext(p: &std::path::Path) -> bool {
    p.extension()
        .and_then(|e| e.to_str())
        .map(|e| SCANNABLE_EXTENSIONS.contains(&e.to_lowercase().as_str()))
        .unwrap_or(false)
}
