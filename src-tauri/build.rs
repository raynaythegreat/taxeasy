fn main() {
    tauri_build::build();

    // Embed git commit SHA for update detection
    let sha = std::process::Command::new("git")
        .args(["rev-parse", "HEAD"])
        .output()
        .ok()
        .and_then(|out| String::from_utf8(out.stdout).ok())
        .map(|s| s.trim().to_string());

    if let Some(sha) = sha {
        println!("cargo:rustc-env=GIT_COMMIT_SHA={}", sha);
    }
}
