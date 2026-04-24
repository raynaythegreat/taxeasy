use std::path::PathBuf;

pub fn resolve_executable(name: &str) -> Option<PathBuf> {
    let mut candidates = Vec::new();

    if let Some(path) = std::env::var_os("PATH") {
        candidates.extend(std::env::split_paths(&path));
    }

    candidates.extend([
        PathBuf::from("/opt/homebrew/bin"),
        PathBuf::from("/usr/local/bin"),
        PathBuf::from("/opt/homebrew/sbin"),
        PathBuf::from("/usr/local/sbin"),
    ]);

    if let Some(home) = dirs::home_dir() {
        let python_root = home.join("Library/Python");
        if let Ok(entries) = std::fs::read_dir(python_root) {
            for entry in entries.flatten() {
                candidates.push(entry.path().join("bin"));
            }
        }
    }

    candidates
        .into_iter()
        .map(|dir| dir.join(name))
        .find(|path| path.is_file())
}
