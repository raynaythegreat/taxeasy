import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

export interface UpdateCheck {
  hasUpdate: boolean;
  currentVersion: string;
  latestVersion: string;
  releaseUrl: string;
  releaseNotes: string | null;
  publishedAt: string;
  downloadUrl: string | null;
  // Commit-based update detection
  isBehindOnCommits: boolean;
  latestCommitSha: string | null;
  localCommitSha: string | null;
  commitsBehind: number;
}

export interface UpdateProgress {
  status: "checking" | "downloading" | "installing" | "pulling" | "ready" | "error";
  progress?: number;
  total?: number;
  error?: string;
}

export type UpdateStatusListener = (progress: UpdateProgress) => void;

// Set up global listener for update progress events
export async function onUpdateProgress(callback: UpdateStatusListener): Promise<() => void> {
  const unlisten = await listen("updater://progress", (event) => {
    const payload = event.payload as { status: string; progress?: number; total?: number };
    callback({
      status: payload.status as UpdateProgress["status"],
      progress: payload.progress,
      total: payload.total,
    });
  });

  return unlisten;
}

export async function checkForUpdates(): Promise<UpdateCheck> {
  return invoke<UpdateCheck>("check_for_updates");
}

export async function downloadUpdate(): Promise<void> {
  return invoke<void>("download_update");
}

export async function installUpdate(): Promise<void> {
  return invoke<void>("install_update");
}

export async function getAppVersion(): Promise<string> {
  return invoke<string>("get_app_version");
}

export async function pullLatestCommits(): Promise<string> {
  return invoke<string>("pull_latest_commits");
}
