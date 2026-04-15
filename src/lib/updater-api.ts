import { invoke } from "@tauri-apps/api/core";

export interface UpdateCheck {
  hasUpdate: boolean;
  currentVersion: string;
  latestVersion: string;
  releaseUrl: string;
  releaseNotes: string | null;
  publishedAt: string;
  downloadUrl: string | null;
}

export async function checkForUpdates(): Promise<UpdateCheck> {
  return invoke<UpdateCheck>("checkForUpdates");
}

export async function getAppVersion(): Promise<string> {
  return invoke<string>("getAppVersion");
}
